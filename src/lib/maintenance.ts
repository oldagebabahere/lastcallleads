// Weekly long-term housekeeping and watchdog.
// Keeps cheap tables small, removes bulky debug snapshots after 90 days,
// and alerts the owner if a government source silently stopped updating.
import { pool } from "@/db";
import { Resend } from "resend";
import { alertFrom } from "@/lib/email";
import { runBriefings } from "@/lib/digest";
import { BRAND } from "@/lib/brand";
import { ALL_STATE_SOURCES } from "@/lib/ingest-aggregator";

export type MaintenanceReport = {
  ok: boolean;
  prunedRuns: number;
  prunedEmails: number;
  compactedEvents: number;
  purgedBadDates: number;
  staleSources: string[];
  warningSent: boolean;
  databaseBytes: number | null;
};

type CountRow = { n: number | string };
type SourceRow = { source: string; last_ok: Date | string | null };
type SizeRow = { bytes: number | string };

export async function runMaintenance(): Promise<MaintenanceReport> {
  // Every Monday also deliver the weekly territory briefing to active subs.
  try {
    const briefing = await runBriefings();
    if (!briefing.ok) {
      await pool.query(
        `INSERT INTO email_log (to_email, subject, status, detail, event_count)
         VALUES ($1, $2, 'error', $3, 0)`,
        ["ops@internal", "Weekly briefing failed", String(briefing)]
      );
    }
  } catch {
    // Briefing must never block maintenance.
  }

  const compact = await pool.query<CountRow>(`
    WITH changed AS (
      UPDATE events
      SET payload = NULL
      WHERE payload IS NOT NULL
        AND detected_at < now() - interval '90 days'
      RETURNING 1
    ) SELECT count(*)::int AS n FROM changed
  `);

  const oldRuns = await pool.query<CountRow>(`
    WITH deleted AS (
      DELETE FROM ingest_runs
      WHERE started_at < now() - interval '180 days'
      RETURNING 1
    ) SELECT count(*)::int AS n FROM deleted
  `);

  const oldEmails = await pool.query<CountRow>(`
    WITH deleted AS (
      DELETE FROM email_log
      WHERE created_at < now() - interval '180 days'
      RETURNING 1
    ) SELECT count(*)::int AS n FROM deleted
  `);

  // Purge corrupt events imported before the date-sanity guard existed —
  // anything dated in the future (e.g. Colorado's "2262" issue dates) or
  // implausibly old. These poison the top of the feed because it sorts by
  // occurred_at descending.
  const badDates = await pool.query<CountRow>(`
    WITH deleted AS (
      DELETE FROM events
      WHERE occurred_at > now() + interval '1 day'
         OR occurred_at < timestamp '1990-01-01'
      RETURNING 1
    ) SELECT count(*)::int AS n FROM deleted
  `);

  const sourceRows = await pool.query<SourceRow>(`
    SELECT source, max(finished_at) FILTER (WHERE ok = true) AS last_ok
    FROM ingest_runs
    GROUP BY source
  `);
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  // The daily cron runs the aggregator, so the labels it logs are what we
  // expect to see fresh. (Legacy runner ids are gone from the schedule.)
  const expected = ALL_STATE_SOURCES.map((s) => s.label);
  const bySource = new Map(sourceRows.rows.map((r) => [r.source, r.last_ok]));
  const staleSources = expected.filter((source) => {
    const date = bySource.get(source);
    return !date || new Date(date).getTime() < cutoff;
  });

  let databaseBytes: number | null = null;
  try {
    const size = await pool.query<SizeRow>(
      `SELECT pg_database_size(current_database())::bigint AS bytes`
    );
    databaseBytes = Number(size.rows[0]?.bytes ?? 0);
  } catch {
    // Some hosted Postgres roles do not expose database-size functions.
  }

  let warningSent = false;
  const opsEmail = process.env.OPS_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (staleSources.length && opsEmail && resendKey) {
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: alertFrom(),
      to: opsEmail,
      subject: `Action needed: ${BRAND.name} source sweep is stale`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px">
        <h2>${BRAND.name} watchdog found a problem</h2>
        <p>The following public-data sources have not completed successfully in 48 hours:</p>
        <p><strong>${staleSources.join(", ")}</strong></p>
        <p>Open your private control room, review Source Health, then run the affected source manually. Government portals occasionally change a field or pause publishing.</p>
        <p style="color:#666;font-size:12px">This is an automated operations alert.</p>
      </div>`,
    });
    warningSent = !result.error;
  }

  return {
    ok: staleSources.length === 0,
    prunedRuns: Number(oldRuns.rows[0]?.n ?? 0),
    prunedEmails: Number(oldEmails.rows[0]?.n ?? 0),
    compactedEvents: Number(compact.rows[0]?.n ?? 0),
    purgedBadDates: Number(badDates.rows[0]?.n ?? 0),
    staleSources,
    warningSent,
    databaseBytes,
  };
}
