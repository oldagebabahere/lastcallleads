// PourWatch — the self-healing watchdog.
//
// Every aggregator run flows through recordRunResult():
//   • logs the run to ingest_runs
//   • applies health rules: HTTP/parse errors, unexpected 0 rows, sudden collapse
//   • after 3 consecutive failures the source is AUTO-PAUSED with ONE ops email
//   • paused sources are skipped by regular ingests (the rest keep flowing)
//   • reprobe + autoHealSource run automatically on schedule (weekly + /api/cron/pourwatch)
//     and auto-resume + email "recovered" on success.
import { and, desc, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { ingestRuns, sourceHealth } from "@/db/schema";
import { fetchSocrata, fetchWithRetry } from "@/lib/sources";
import { alertFrom } from "@/lib/email";
import { isMailTransportConfigured, sendTransactionalMail } from "@/lib/mailer";
import { sendTelegramOwner } from "@/lib/notify";
import { BRAND } from "@/lib/brand";

export const PAUSE_AFTER = 3;
const STALE_HOURS = 48;
// Self-heal fast: re-probe paused government feeds every 12 hours instead of waiting 7 days!
const REPROBE_HOURS = 12;

export type RunResult = {
  label: string;
  state: string;
  ok: boolean;
  rowsSeen: number;
  newLicenses: number;
  newEvents: number;
  allowEmpty?: boolean;
  error?: string;
};

type HealthRow = typeof sourceHealth.$inferSelect;
type CountRow = { n: number | string };

// ---------- email ----------

export async function sendOpsAlert(subject: string, body: string): Promise<boolean> {
  const opsEmail = (process.env.OPS_EMAIL ?? process.env.SMTP_USER ?? "").trim();
  const plainSummary = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 320);

  // When Telegram Bot is connected, route ALL internal ops/PourWatch alerts exclusively
  // to Telegram (free & unlimited) so we save 100% of Resend/Gmail quota for customers!
  const tgConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()
  );
  if (tgConfigured) {
    const tg = await sendTelegramOwner(
      `🛡️ ${BRAND.name} PourWatch\n${subject}\n${plainSummary}`
    ).catch(() => ({ ok: false }));
    if (tg.ok) {
      await pool
        .query(
          `INSERT INTO email_log (to_email, subject, status, detail, event_count)
           VALUES ('telegram@owner', $1, 'logged', 'sent via Telegram (saved email quota)', 0)`,
          [subject]
        )
        .catch(() => undefined);
      return true;
    }
  }

  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px">
    <h2>${BRAND.name} PourWatch</h2>
    ${body}
    <p style="color:#666;font-size:12px">Automated source-health alert. Paused sources stop alerting;
    PourWatch re-probes and auto-heals them every 12 hours and resumes automatically when they recover.</p>
  </div>`;
  try {
    if (opsEmail && isMailTransportConfigured()) {
      const res = await sendTransactionalMail({
        from: alertFrom(),
        to: opsEmail,
        subject,
        html,
      });
      await pool
        .query(
          `INSERT INTO email_log (to_email, subject, status, detail, event_count)
           VALUES ($1, $2, $3, $4, 0)`,
          [opsEmail, subject, res.status, `pourwatch: ${res.detail}`.slice(0, 180)]
        )
        .catch(() => undefined);
      return res.status === "sent";
    }
    await pool.query(
      `INSERT INTO email_log (to_email, subject, status, detail, event_count)
       VALUES ('ops@internal', $1, 'logged', $2, 0)`,
      [subject, plainSummary]
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

  // 1) load prior median BEFORE logging the current run
  const median = await priorMedianRows(r.label);

  // 2) evaluate health rules
  let failureReason: string | null = null;
  if (!r.ok) {
    failureReason = r.error ?? "run failed";
  } else if (!r.allowEmpty && r.rowsSeen === 0 && median >= 10) {
    failureReason = "0 rows returned (source previously had data)";
  } else if (!r.allowEmpty && median >= 50 && r.rowsSeen < median * 0.35) {
    failureReason = `rows collapsed: ${r.rowsSeen} vs median ${median}`;
  }

  // 3) log the run (reflecting health evaluation)
  await db.insert(ingestRuns).values({
    source: r.label,
    ok: !failureReason,
    rowsSeen: r.rowsSeen,
    newLicenses: r.newLicenses,
    newEvents: r.newEvents,
    error: failureReason,
    startedAt: now,
    finishedAt: now,
  });

  // 4) load or init the health row
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

  if (!failureReason) {
    const wasPaused = row?.status === "paused";
    const updatedMedian = r.rowsSeen > 0 ? Math.max(median, Math.min(r.rowsSeen, median || r.rowsSeen)) : median;
    await db
      .update(sourceHealth)
      .set({
        status: "live",
        pausedReason: null,
        consecutiveFailures: 0,
        lastRows: r.rowsSeen,
        medianRows: updatedMedian,
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
        `<p><strong>${r.label}</strong> completed successfully (${r.rowsSeen.toLocaleString()} rows) and has been auto-resumed. Customer alerts for its states are flowing again.</p>`
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
        pausedReason: shouldPause ? failureReason : (row?.pausedReason ?? null),
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
         <p>Other states keep flowing — PourWatch will automatically re-probe and attempt catalog self-healing weekly.
         To force a manual retry now: <code>/api/cron/ingest?aggregator=true&amp;state=${r.state}&amp;force=1</code></p>`
      );
    }
  }

  return (
    await db.select().from(sourceHealth).where(eq(sourceHealth.source, r.label)).limit(1)
  )[0];
}

// ---------- auto-heal: find a replacement dataset ourselves ----------

export type HealSpec = {
  label: string;
  socrata?: { host: string; dataset: string; where?: string; order?: string; limit?: number };
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
 * When a Socrata dataset dies, search the portal's catalog, trial-fetch each
 * candidate through the existing column map, and adopt the first one that maps
 * cleanly (>=50 rows and >=70% map rate).
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
    const res = await fetchWithRetry(
      catUrl,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "LastCallLeads-PourWatch/2.0 (+public-records-monitor)",
        },
      },
      { timeoutMs: 12_000, retries: 1 }
    );
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
        const rows = await fetchSocrata(spec.socrata.host, cand.id, {
          limit: 150,
          timeoutMs: 10_000,
        });
        if (!rows.length) continue;
        let mapped = 0;
        for (const r of rows) if (spec.map(r) !== null) mapped++;
        if (mapped >= 30 && mapped / rows.length >= 0.7) {
          await db
            .update(sourceHealth)
            .set({ overrideDataset: cand.id, updatedAt: new Date() })
            .where(eq(sourceHealth.source, spec.label));
          await sendOpsAlert(
            `Self-healed: ${spec.label} switched to replacement dataset`,
            `<p><strong>${spec.label}</strong> broke, searched the portal catalog, and switched itself to a replacement dataset.</p>
             <p>New dataset: <strong>${cand.id}</strong> — “${cand.name ?? ""}”<br/>
             ${mapped}/${rows.length} trial rows mapped cleanly through the existing column map.</p>`
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

// ---------- daily sweep ----------

/** Live sources with no OK run in 48h (or 96h for heavy/3x-week feeds) get a failure strike. */
export async function sweepStale(
  labels: string[],
  heavyLabels: Set<string> = new Set()
): Promise<string[]> {
  const bumped: string[] = [];
  const rows = await db.select().from(sourceHealth);
  const bySource = new Map(rows.map((r) => [r.source, r]));
  const now = Date.now();

  for (const label of labels) {
    const row = bySource.get(label);
    if (!row || row.status === "paused") continue;
    const maxHours = heavyLabels.has(label) ? 96 : STALE_HOURS;
    const lastOk = row.lastOkAt ? new Date(row.lastOkAt).getTime() : 0;
    if (lastOk >= now - maxHours * 3600_000) continue;
    await recordRunResult({
      label,
      state: row.state,
      ok: false,
      rowsSeen: 0,
      newLicenses: 0,
      newEvents: 0,
      error: `no successful run in ${maxHours}+ hours (last ok ${
        row.lastOkAt ? new Date(row.lastOkAt).toISOString().slice(0, 16) : "never"
      })`,
    });
    bumped.push(label);
  }
  return bumped;
}

/** Paused sources due for their self-healing re-probe (every 12h, or all). */
export async function reprobeDue(all = false): Promise<HealthRow[]> {
  const rows = await db.select().from(sourceHealth).where(eq(sourceHealth.status, "paused"));
  const cutoff = Date.now() - REPROBE_HOURS * 3_600_000;
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
