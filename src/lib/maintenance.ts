// Weekly database housekeeping and staleness watchdog.
// Keeps Supabase / Neon 500MB free tier permanently lean (<100MB) by pruning
// legacy TTB/removed-state rows, old logs, and old payloads automatically!
import { pool } from "@/db";
import { alertFrom } from "@/lib/email";
import { isMailTransportConfigured, sendTransactionalMail } from "@/lib/mailer";
import { sendTelegramOwner } from "@/lib/notify";
import { BRAND } from "@/lib/brand";
import { ALL_STATE_SOURCES, HEAVY_SOURCE_LABELS } from "@/lib/ingest-aggregator";
import { LIVE_STATE_CODES } from "@/lib/states";

export type MaintenanceReport = {
  ok: boolean;
  prunedRuns: number;
  prunedEmails: number;
  prunedWebhooks: number;
  prunedLegacyRows: number;
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
  // 1) Compact older JSON payloads to save massive disk space on 500MB free tiers.
  const compact = await pool.query<CountRow>(`
    WITH changed AS (
      UPDATE events
      SET payload = NULL
      WHERE payload IS NOT NULL
        AND detected_at < now() - interval '45 days'
      RETURNING 1
    ) SELECT count(*)::int AS n FROM changed
  `);

  // 2) Purge old TTB federal filler + non-live states from previous builds (frees 70%+ DB space!)
  // Keep FL alongside the 9 auto-daily states so manually imported official FL DBPR filings are preserved.
  const keepStates = [...LIVE_STATE_CODES, "FL"];
  const liveListSql = keepStates.map((s) => `'${s}'`).join(", ");
  const [legacyLic, legacyEvt, legacyPros] = await Promise.all([
    pool
      .query<CountRow>(`
        WITH deleted AS (
          DELETE FROM licenses
          WHERE license_key LIKE 'TTB-%'
             OR state NOT IN (${liveListSql})
          RETURNING 1
        ) SELECT count(*)::int AS n FROM deleted
      `)
      .catch(() => ({ rows: [{ n: 0 }] })),
    pool
      .query<CountRow>(`
        WITH deleted AS (
          DELETE FROM events
          WHERE license_key LIKE 'TTB-%'
             OR state NOT IN (${liveListSql})
          RETURNING 1
        ) SELECT count(*)::int AS n FROM deleted
      `)
      .catch(() => ({ rows: [{ n: 0 }] })),
    pool
      .query<CountRow>(`
        WITH deleted AS (
          DELETE FROM prospects
          WHERE state NOT IN (${liveListSql})
             OR category = 'bar'
             OR (category = 'insurance' AND name ~* '(state\\s*farm|allstate|geico|progressive|farmers\\s+ins|liberty\\s+mutual|fred\\s*loya|a-?max|pronto\\s+ins|freeway\\s+ins|acceptance\\s+ins|direct\\s+auto|nationwide|usaa|stewart\\s+title|first\\s+american|title\\s+(co|company|agency|ins|group)|auto\\s+ins|car\\s+ins|bail\\s+bond|edward\\s+jones|aflac|medicare|dental|life\\s+ins|health\\s+ins)')
             OR (category = 'attorney' AND name ~* '(personal\\s+injury|accident|divorce|family\\s+law|criminal|immigration|bankruptcy|probate|workers\\s*comp|public\\s+defender|legal\\s+aid)')
             OR (category = 'beverage' AND name ~* '(walmart|target|costco|kroger|publix|safeway|walgreens|cvs|7-?eleven|circle\\s+k|total\\s+wine|bevmo)')
          RETURNING 1
        ) SELECT count(*)::int AS n FROM deleted
      `)
      .catch(() => ({ rows: [{ n: 0 }] })),
  ]);
  const prunedLegacyRows =
    Number(legacyLic.rows[0]?.n ?? 0) +
    Number(legacyEvt.rows[0]?.n ?? 0) +
    Number(legacyPros.rows[0]?.n ?? 0);

  const oldRuns = await pool.query<CountRow>(`
    WITH deleted AS (
      DELETE FROM ingest_runs
      WHERE started_at < now() - interval '60 days'
      RETURNING 1
    ) SELECT count(*)::int AS n FROM deleted
  `);

  const oldEmails = await pool.query<CountRow>(`
    WITH deleted AS (
      DELETE FROM email_log
      WHERE created_at < now() - interval '60 days'
      RETURNING 1
    ) SELECT count(*)::int AS n FROM deleted
  `);

  const oldWebhooks = await pool
    .query<CountRow>(`
      WITH deleted AS (
        DELETE FROM webhook_events
        WHERE processed_at < now() - interval '60 days'
        RETURNING 1
      ) SELECT count(*)::int AS n FROM deleted
    `)
    .catch(() => ({ rows: [{ n: 0 }] }));

  // Purge corrupt events with future (>7d) or pre-1990 dates.
  const badDates = await pool.query<CountRow>(`
    WITH deleted AS (
      DELETE FROM events
      WHERE occurred_at > now() + interval '7 days'
         OR occurred_at < timestamp '1990-01-01'
      RETURNING 1
    ) SELECT count(*)::int AS n FROM deleted
  `);

  const sourceRows = await pool.query<SourceRow>(`
    SELECT source, max(finished_at) FILTER (WHERE ok = true) AS last_ok
    FROM ingest_runs
    GROUP BY source
  `);
  const now = Date.now();
  const expected = ALL_STATE_SOURCES.map((s) => s.label);
  const bySource = new Map(sourceRows.rows.map((r) => [r.source, r.last_ok]));
  const staleSources = expected.filter((source) => {
    const maxHours = HEAVY_SOURCE_LABELS.has(source) ? 96 : 48;
    const date = bySource.get(source);
    return !date || new Date(date).getTime() < now - maxHours * 3600_000;
  });

  let databaseBytes: number | null = null;
  try {
    const size = await pool.query<SizeRow>(
      `SELECT pg_database_size(current_database())::bigint AS bytes`
    );
    databaseBytes = Number(size.rows[0]?.bytes ?? 0);
  } catch {
    // Some hosted Postgres roles restrict database-size functions.
  }

  let warningSent = false;
  const opsEmail = (process.env.OPS_EMAIL ?? process.env.SMTP_USER ?? "").trim();
  if (staleSources.length) {
    await sendTelegramOwner(
      `⚠️ ${BRAND.name} Watchdog: ${staleSources.length} feed(s) stale:\n${staleSources.join(", ")}`
    ).catch(() => undefined);

    if (opsEmail && isMailTransportConfigured()) {
      const res = await sendTransactionalMail({
        from: alertFrom(),
        to: opsEmail,
        subject: `Action needed: ${BRAND.name} source sweep is stale`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px">
          <h2>${BRAND.name} watchdog report</h2>
          <p>The following public-data sources have not completed within their expected window:</p>
          <p><strong>${staleSources.join(", ")}</strong></p>
          <p>PourWatch auto-healer will retry them automatically on the next daily sweep.</p>
        </div>`,
      });
      warningSent = res.status === "sent";
    }
  }

  return {
    ok: staleSources.length === 0,
    prunedRuns: Number(oldRuns.rows[0]?.n ?? 0),
    prunedEmails: Number(oldEmails.rows[0]?.n ?? 0),
    prunedWebhooks: Number(oldWebhooks.rows[0]?.n ?? 0),
    prunedLegacyRows,
    compactedEvents: Number(compact.rows[0]?.n ?? 0),
    purgedBadDates: Number(badDates.rows[0]?.n ?? 0),
    staleSources,
    warningSent,
    databaseBytes,
  };
}
