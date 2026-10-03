// PourWatch — the self-healing watchdog.
//
// Every aggregator run flows through recordRunResult():
//   • logs the run to ingest_runs (aggregator sources never wrote there before)
//   • applies health rules: HTTP/parse errors, 0 rows, sudden half-drop
//   • after 3 consecutive failures the source is AUTO-PAUSED with ONE email
//   • paused sources are skipped by future ingests (the rest keep flowing)
//   • the daily /api/cron/pourwatch sweep bumps stale sources, re-probes
//     paused ones weekly, and auto-resumes + emails "recovered" on success
//
// The fake-leads (ID-format change) guard lives in ingest-aggregator and
// BLOCKS the insert before bad data ever reaches customers; the blocked run
// arrives here as a normal failure.
import { and, desc, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { ingestRuns, sourceHealth } from "@/db/schema";
import { Resend } from "resend";
import { fetchSocrata } from "@/lib/sources";
import { alertFrom } from "@/lib/email";
import { BRAND } from "@/lib/brand";

export const PAUSE_AFTER = 3;
const STALE_HOURS = 48;
const REPROBE_DAYS = 7;

export type RunResult = {
  label: string;
  state: string;
  ok: boolean;
  rowsSeen: number;
  newLicenses: number;
  newEvents: number;
  error?: string;
};

type HealthRow = typeof sourceHealth.$inferSelect;

type CountRow = { n: number | string };

// ---------- email ----------

export async function sendOpsAlert(subject: string, body: string): Promise<boolean> {
  const opsEmail = process.env.OPS_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px">
    <h2>${BRAND.name} PourWatch</h2>
    ${body}
    <p style="color:#666;font-size:12px">Automated source-health alert. Paused sources stop alerting;
    PourWatch re-probes them weekly and resumes automatically when they recover.</p>
  </div>`;
  try {
    if (opsEmail && resendKey) {
      const resend = new Resend(resendKey);
      const res = await resend.emails.send({
        from: alertFrom(),
        to: opsEmail,
        subject,
        html,
      });
      if (res.error) throw new Error(String(res.error));
      return true;
    }
    // No mail configured (e.g. sandbox): still leave an ops trail.
    await pool.query(
      `INSERT INTO email_log (to_email, subject, status, detail, event_count)
       VALUES ('ops@internal', $1, 'logged', $2, 0)`,
      [subject, body.replace(/<[^>]+>/g, " ").slice(0, 400)]
    );
    return true;
  } catch {
    return false;
  }
}

// ---------- reads ----------

export async function getHealthMap(): Promise<Map<string, HealthRow>> {
  const rows = await db.select().from(sourceHealth);
  return new Map(rows.map((r) => [r.source, r]));
}

/** Median rows_seen over the last 5 OK runs for a source label (0 if none). */
export async function priorMedianRows(label: string): Promise<number> {
  const rows = await db
    .select({ rows: ingestRuns.rowsSeen })
    .from(ingestRuns)
    .where(and(eq(ingestRuns.source, label), eq(ingestRuns.ok, true)))
    .orderBy(desc(ingestRuns.startedAt))
    .limit(5);
  const nums = rows.map((r) => Number(r.rows ?? 0)).filter((n) => n > 0);
  if (!nums.length) return 0;
  nums.sort((a, b) => a - b);
  return nums[Math.floor(nums.length / 2)];
}

// ---------- the core recorder ----------

export async function recordRunResult(r: RunResult): Promise<HealthRow | null> {
  const now = new Date();

  // 1) log the run
  await db.insert(ingestRuns).values({
    source: r.label,
    ok: r.ok,
    rowsSeen: r.rowsSeen,
    newLicenses: r.newLicenses,
    newEvents: r.newEvents,
    error: r.error ?? null,
    startedAt: now,
    finishedAt: now,
  });

  // 2) load or init the health row
  let row = (
    await db.select().from(sourceHealth).where(eq(sourceHealth.source, r.label)).limit(1)
  )[0];
  if (!row) {
    row = (
      await db
        .insert(sourceHealth)
        .values({ source: r.label, state: r.state, lastRunAt: now })
        .onConflictDoNothing()
        .returning()
    )[0];
    if (!row) {
      row = (
        await db.select().from(sourceHealth).where(eq(sourceHealth.source, r.label)).limit(1)
      )[0];
    }
  }

  const median = await priorMedianRows(r.label);

  // 3) health rules — a "failure" is any of:
  //    transport error, 0 rows on a source that historically had data,
  //    or rows collapsing to <40% of the recent median
  let failureReason: string | null = null;
  if (!r.ok) {
    failureReason = r.error ?? "run failed";
  } else if (r.rowsSeen === 0 && median >= 10) {
    failureReason = "0 rows returned (source previously had data)";
  } else if (median >= 20 && r.rowsSeen < median * 0.4) {
    failureReason = `rows collapsed: ${r.rowsSeen} vs median ${median}`;
  }

  if (!failureReason) {
    const wasPaused = row?.status === "paused";
    await db
      .update(sourceHealth)
      .set({
        status: "live",
        pausedReason: null,
        consecutiveFailures: 0,
        lastRows: r.rowsSeen,
        medianRows: median,
        lastOkAt: now,
        lastRunAt: now,
        lastProbeAt: now,
        alertState: "none",
        updatedAt: now,
      })
      .where(eq(sourceHealth.source, r.label));
    if (wasPaused) {
      await sendOpsAlert(
        `Recovered: ${r.label} is live again`,
        `<p><strong>${r.label}</strong> completed successfully (${r.rowsSeen} rows) and has been auto-resumed. Customer alerts for its states are flowing again.</p>`
      );
    }
  } else {
    const failures = (row?.consecutiveFailures ?? 0) + 1;
    const shouldPause = failures >= PAUSE_AFTER;
    const wasLive = row?.status !== "paused";
    await db
      .update(sourceHealth)
      .set({
        status: shouldPause ? "paused" : (row?.status ?? "live"),
        pausedReason: shouldPause ? failureReason : null,
        consecutiveFailures: failures,
        lastRows: r.rowsSeen,
        medianRows: median,
        lastRunAt: now,
        lastProbeAt: now,
        updatedAt: now,
      })
      .where(eq(sourceHealth.source, r.label));
    if (shouldPause && wasLive) {
      await db
        .update(sourceHealth)
        .set({ alertState: "paused" })
        .where(eq(sourceHealth.source, r.label));
      await sendOpsAlert(
        `Paused: ${r.label} failed ${PAUSE_AFTER}× in a row`,
        `<p><strong>${r.label}</strong> has been auto-paused.</p>
         <p><strong>Reason:</strong> ${failureReason}</p>
         <p>Other states keep flowing — no customer email is affected except this source's states.
         PourWatch will re-probe it weekly and resume it automatically when it recovers.
         To force a manual retry now: <code>/api/cron/ingest?aggregator=true&amp;state=${r.state}&amp;force=1</code></p>`
      );
    }
  }

  return (
    await db.select().from(sourceHealth).where(eq(sourceHealth.source, r.label)).limit(1)
  )[0];
}

// ---------- auto-heal: find a replacement dataset ourselves ----------

// Structural subset of StateSpec (avoids a circular import with the aggregator).
export type HealSpec = {
  label: string;
  socrata?: { host: string; dataset: string; where?: string; limit?: number };
  map: (rec: Record<string, unknown>) => unknown | null;
  healKeywords?: string;
};

/** The dataset PourWatch adopted for this source (wins over the code default). */
export async function getOverrideDataset(label: string): Promise<string | null> {
  const row = (
    await db
      .select({ d: sourceHealth.overrideDataset })
      .from(sourceHealth)
      .where(eq(sourceHealth.source, label))
      .limit(1)
  )[0];
  return row?.d ?? null;
}

/**
 * A Socrata dataset died? Search the portal's own catalog, trial-fetch each
 * candidate through the EXISTING column map, and adopt the first one that
 * maps cleanly (>=100 rows and >=70% map rate). Wrong-schema datasets are
 * rejected automatically, so we never adopt garbage.
 */
export async function autoHealSource(
  spec: HealSpec
): Promise<{ healed: boolean; detail: string }> {
  if (!spec.socrata) return { healed: false, detail: "not a socrata source" };
  const row = (
    await db.select().from(sourceHealth).where(eq(sourceHealth.source, spec.label)).limit(1)
  )[0];
  const current = row?.overrideDataset ?? spec.socrata.dataset;
  const q = spec.healKeywords ?? "liquor license";
  try {
    const catUrl = `https://api.us.socrata.com/api/catalog/v1?domains=${
      spec.socrata.host
    }&q=${encodeURIComponent(q)}&limit=10&only=dataset`;
    const res = await fetch(catUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "pourwatch/1.0 (+public-records-monitor)",
      },
      cache: "no-store",
    });
    if (!res.ok) return { healed: false, detail: `catalog responded ${res.status}` };
    const cat = (await res.json()) as {
      results?: { resource?: { id?: string; name?: string } }[];
    };
    const candidates = (cat.results ?? [])
      .map((r) => r.resource)
      .filter(
        (r): r is { id: string; name?: string } =>
          Boolean(r?.id) && r!.id !== current
      )
      .slice(0, 5);
    for (const cand of candidates) {
      try {
        const rows = await fetchSocrata(spec.socrata.host, cand.id!, { limit: 200 });
        if (!rows.length) continue;
        let mapped = 0;
        for (const r of rows) if (spec.map(r) !== null) mapped++;
        if (mapped >= 100 && mapped / rows.length >= 0.7) {
          await db
            .update(sourceHealth)
            .set({ overrideDataset: cand.id, updatedAt: new Date() })
            .where(eq(sourceHealth.source, spec.label));
          await sendOpsAlert(
            `Self-healed: ${spec.label} found a new dataset on its own`,
            `<p><strong>${spec.label}</strong> broke, searched the portal catalog, and switched itself to a replacement dataset.</p>
             <p>New dataset: <strong>${cand.id}</strong> — “${cand.name ?? ""}”<br/>
             ${mapped}/${rows.length} trial rows mapped cleanly through the existing column map.</p>
             <p>No action needed — this is just a receipt.</p>`
          );
          return { healed: true, detail: `adopted ${cand.id} (${cand.name ?? "unnamed"})` };
        }
      } catch {
        // candidate unusable — try the next
      }
    }
    return {
      healed: false,
      detail: `no candidate mapped cleanly (${candidates.length} tried)`,
    };
  } catch (err) {
    return { healed: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- daily sweep (cron /api/cron/pourwatch) ----------

/** Live sources with no OK run in 48h count as a failure. Returns bumped labels. */
export async function sweepStale(labels: string[]): Promise<string[]> {
  const bumped: string[] = [];
  const rows = await db.select().from(sourceHealth);
  const bySource = new Map(rows.map((r) => [r.source, r]));
  const cutoff = Date.now() - STALE_HOURS * 3600_000;

  for (const label of labels) {
    const row = bySource.get(label);
    if (!row || row.status === "paused") continue;
    const lastOk = row.lastOkAt ? new Date(row.lastOkAt).getTime() : 0;
    if (lastOk >= cutoff) continue;
    // synthetic failure for staleness
    await recordRunResult({
      label,
      state: row.state,
      ok: false,
      rowsSeen: 0,
      newLicenses: 0,
      newEvents: 0,
      error: `no successful run in 48+ hours (last ok ${
        row.lastOkAt ? new Date(row.lastOkAt).toISOString().slice(0, 16) : "never"
      })`,
    });
    bumped.push(label);
  }
  return bumped;
}

/** Paused sources due for their weekly re-probe (or all of them). */
export async function reprobeDue(all = false): Promise<HealthRow[]> {
  const rows = await db.select().from(sourceHealth).where(eq(sourceHealth.status, "paused"));
  const cutoff = Date.now() - REPROBE_DAYS * 86_400_000;
  return rows.filter((r) => {
    if (all) return true;
    const probed = r.lastProbeAt ? new Date(r.lastProbeAt).getTime() : 0;
    return probed < cutoff;
  });
}

/** Public numbers for the /coverage page. */
export async function coverageStats() {
  const perState = await pool.query<{ state: string; n: string }>(
    `SELECT state, count(*)::text AS n FROM licenses GROUP BY state`
  );
  const health = await db.select().from(sourceHealth);
  const totals = await pool.query<CountRow>(`SELECT count(*)::text AS n FROM licenses`);
  return {
    licensesByState: perState.rows.map((r) => ({ state: r.state, count: Number(r.n) })),
    totalLicenses: Number(totals.rows[0]?.n ?? 0),
    health,
  };
}
