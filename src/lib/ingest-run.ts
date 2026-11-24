// Legacy single-source runner kept for backward compatibility with older
// query params (?source=tx-pending). Delegates to the unified aggregator so
// source labels, PourWatch health, and dedupe logic stay 100% consistent.
import { db } from "@/db";
import { events, licenses } from "@/db/schema";
import { sql } from "drizzle-orm";
import { ALL_STATE_SOURCES, runSpecs } from "./ingest-aggregator";

export type SourceId = "tx-pending" | "tx-active" | "ny-pending" | "ny-active" | "ca";

const LEGACY_TO_LABEL: Record<SourceId, string> = {
  "tx-pending": "Texas · pending",
  "tx-active": "Texas · active",
  "ny-pending": "New York · pending",
  "ny-active": "New York · active",
  ca: "California · full export",
};

export const SOURCES: Record<SourceId, { label: string; state: string }> = {
  "tx-pending": { label: "Texas · pending", state: "TX" },
  "tx-active": { label: "Texas · active", state: "TX" },
  "ny-pending": { label: "New York · pending", state: "NY" },
  "ny-active": { label: "New York · active", state: "NY" },
  ca: { label: "California · full export", state: "CA" },
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

export async function runIngest(sourceId: SourceId): Promise<IngestResult> {
  const label = LEGACY_TO_LABEL[sourceId];
  const spec = ALL_STATE_SOURCES.find((s) => s.label === label);
  if (!spec) {
    return { source: sourceId, ok: false, error: `Unknown source: ${sourceId}` };
  }
  const { results } = await runSpecs([spec], { force: true });
  const r = results[0];
  return {
    source: sourceId,
    ok: r?.ok ?? false,
    rowsSeen: r?.rowsSeen ?? 0,
    newLicenses: r?.newLicenses ?? 0,
    newEvents: r?.newEvents ?? 0,
    error: r?.error,
  };
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
