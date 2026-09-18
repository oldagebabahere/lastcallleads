// The brain of the machine: pulls a source, finds what is new, and records
// saleable events. Fully idempotent — running it twice changes nothing the
// second time.
import { db } from "@/db";
import { events, ingestRuns, licenses } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { fetchTxActive, fetchTxPending } from "./ingest-tx";
import { fetchNyActive, fetchNyPending } from "./ingest-ny";
import { fetchCaLicenses } from "./ingest-ca";
import type { NormalizedRecord } from "./sources";

export type SourceId = "tx-pending" | "tx-active" | "ny-pending" | "ny-active" | "ca";

export const SOURCES: Record<
  SourceId,
  { label: string; state: string; fetch: () => Promise<NormalizedRecord[]> }
> = {
  "tx-pending": { label: "Texas · applications filed", state: "TX", fetch: fetchTxPending },
  "tx-active": { label: "Texas · licenses issued", state: "TX", fetch: fetchTxActive },
  "ny-pending": { label: "New York · applications filed", state: "NY", fetch: fetchNyPending },
  "ny-active": { label: "New York · licenses issued", state: "NY", fetch: fetchNyActive },
  ca: { label: "California · full export", state: "CA", fetch: fetchCaLicenses },
};

export const ALL_SOURCES: SourceId[] = [
  "tx-pending",
  "ny-pending",
  "tx-active",
  "ny-active",
  "ca",
];

export type IngestResult = {
  source: SourceId;
  ok: boolean;
  rowsSeen?: number;
  newLicenses?: number;
  newEvents?: number;
  error?: string;
};

const DAY = 86_400_000;
const CHUNK = 400;

function displayName(r: NormalizedRecord): string {
  return r.tradeName ?? r.ownerName ?? "Unnamed applicant";
}

function summarize(
  eventType: string,
  r: NormalizedRecord,
  extra?: string
): string {
  const name = displayName(r);
  const where = r.city ? `${r.city}, ${r.state}` : r.state;
  const type = r.typeName ? ` · ${r.typeName}` : "";
  if (eventType === "NEW_PENDING") {
    return `Application filed — ${name} (${where})${type}`;
  }
  if (eventType === "NEW_LICENSE") {
    return `License issued — ${name} (${where})${type}`;
  }
  return `Status changed${extra ? ` to ${extra}` : ""} — ${name} (${where})`;
}

export async function runIngest(sourceId: SourceId): Promise<IngestResult> {
  const src = SOURCES[sourceId];
  const started = new Date();
  let rowsSeen = 0;
  let newLicenses = 0;
  let newEvents = 0;

  try {
    const records = await src.fetch();
    rowsSeen = records.length;

    const priorRuns = await db
      .select({ id: ingestRuns.id })
      .from(ingestRuns)
      .where(and(eq(ingestRuns.source, sourceId), eq(ingestRuns.ok, true)))
      .limit(1);
    const isFirstRun = priorRuns.length === 0;

    const now = Date.now();
    const cutoff30d = now - 30 * DAY;
    const cutoff14d = now - 14 * DAY;

    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const keys = chunk.map((r) => r.key);

      const existing = await db
        .select({ licenseKey: licenses.licenseKey, status: licenses.status })
        .from(licenses)
        .where(and(eq(licenses.state, src.state), inArray(licenses.licenseKey, keys)));
      const byKey = new Map(existing.map((e) => [e.licenseKey, e.status]));

      const fresh: NormalizedRecord[] = [];
      const statusChanges: { rec: NormalizedRecord; prev: string | null }[] = [];

      for (const rec of chunk) {
        const prevStatus = byKey.get(rec.key);
        if (prevStatus === undefined) {
          fresh.push(rec);
        } else if ((prevStatus ?? null) !== (rec.status ?? null)) {
          statusChanges.push({ rec, prev: prevStatus });
        }
      }

      // Upsert brand-new licenses (batched — thousands of rows per chunk).
      const toValues = (rec: NormalizedRecord) => ({
        state: rec.state,
        licenseKey: rec.key,
        kind: rec.kind,
        status: rec.status,
        licenseType: rec.licenseType,
        typeName: rec.typeName,
        tradeName: rec.tradeName,
        ownerName: rec.ownerName,
        phone: rec.phone,
        address: rec.address,
        city: rec.city,
        zip: rec.zip,
        county: rec.county,
        filedAt: rec.filedAt,
        issuedAt: rec.issuedAt,
        expiresAt: rec.expiresAt,
        lat: rec.lat,
        lng: rec.lng,
        sourceUrl: rec.sourceUrl,
        lastSeenAt: new Date(),
      });
      for (let j = 0; j < fresh.length; j += CHUNK) {
        await db
          .insert(licenses)
          .values(fresh.slice(j, j + CHUNK).map(toValues))
          .onConflictDoUpdate({
            target: [licenses.state, licenses.licenseKey],
            set: { lastSeenAt: new Date() },
          });
      }
      newLicenses += fresh.length;

      // Status updates for known licenses.
      for (const { rec } of statusChanges) {
        await db
          .update(licenses)
          .set({ status: rec.status, lastSeenAt: new Date() })
          .where(and(eq(licenses.state, rec.state), eq(licenses.licenseKey, rec.key)));
      }

      // Events — throttled on the very first pull so we seed, not flood.
      const eventRows: (typeof events.$inferInsert)[] = [];
      for (const rec of fresh) {
        const when = rec.filedAt ?? rec.issuedAt ?? new Date();
        const t = when.getTime();
        const allow =
          rec.kind === "pending"
            ? !isFirstRun || t >= cutoff14d
            : t >= cutoff30d;
        if (!allow) continue;
        eventRows.push({
          state: rec.state,
          licenseKey: rec.key,
          eventType: rec.kind === "pending" ? "NEW_PENDING" : "NEW_LICENSE",
          tradeName: rec.tradeName,
          ownerName: rec.ownerName,
          city: rec.city,
          county: rec.county,
          typeName: rec.typeName,
          occurredAt: when,
          summary: summarize(
            rec.kind === "pending" ? "NEW_PENDING" : "NEW_LICENSE",
            rec
          ),
          payload: JSON.stringify(rec),
        });
      }
      if (!isFirstRun) {
        for (const { rec, prev } of statusChanges) {
          eventRows.push({
            state: rec.state,
            licenseKey: rec.key,
            eventType: "STATUS_CHANGE",
            tradeName: rec.tradeName,
            ownerName: rec.ownerName,
            city: rec.city,
            county: rec.county,
            typeName: rec.typeName,
            occurredAt: new Date(),
            summary: summarize("STATUS_CHANGE", rec, rec.status ?? undefined),
            payload: JSON.stringify({ prev, next: rec.status }),
          });
        }
      }
      for (let j = 0; j < eventRows.length; j += CHUNK) {
        await db.insert(events).values(eventRows.slice(j, j + CHUNK));
      }
      newEvents += eventRows.length;
    }

    // Touch every seen license's lastSeen marker cheaply (skip — lastSeenAt
    // handled above for inserts; updates beyond status changes are noise).

    await db.insert(ingestRuns).values({
      source: sourceId,
      ok: true,
      rowsSeen,
      newLicenses,
      newEvents,
      startedAt: started,
      finishedAt: new Date(),
    });
    return { source: sourceId, ok: true, rowsSeen, newLicenses, newEvents };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(ingestRuns).values({
      source: sourceId,
      ok: false,
      rowsSeen,
      newLicenses,
      newEvents,
      error: message.slice(0, 1000),
      startedAt: started,
      finishedAt: new Date(),
    });
    return { source: sourceId, ok: false, error: message };
  }
}

export async function tableCounts() {
  const licenseRows = await db
    .select({ state: licenses.state, n: sql<number>`count(*)::int` })
    .from(licenses)
    .groupBy(licenses.state);
  const eventRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events);
  return { byState: licenseRows, totalEvents: eventRows[0]?.n ?? 0 };
}
