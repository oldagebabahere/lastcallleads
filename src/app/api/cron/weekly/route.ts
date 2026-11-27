// WEEKLY SWEEP (Mondays at 14:00 UTC).
//   1) PourWatch reprobe + catalog auto-heal for paused sources
//   2) DB housekeeping (pruning & bad-date cleanup)
//   3) Weekly territory briefings (sent ONCE — maintenance no longer calls this)
//   4) First-Monday monthly value recaps (12/12 months guaranteed, deduped!)
//   5) Owner weekly recap + CSV backup
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { reprobeAndHealPaused } from "@/lib/ingest-aggregator";
import { runMaintenance } from "@/lib/maintenance";
import { runBriefings, runMonthlyRecaps } from "@/lib/digest";
import { runDbBackup } from "@/lib/owner-tasks";
import { getGenuineNewFilingsByState } from "@/lib/real-stats";
import { sendOpsAlert } from "@/lib/pourwatch";
import { db } from "@/db";
import { emailLog, prospects, venueReceipts } from "@/db/schema";
import { and, gt, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  await ensureSchema();

  // 1) Self-healing: re-probe & auto-heal paused sources weekly!
  const reprobed = await reprobeAndHealPaused(false).catch(() => []);

  // 2) Database maintenance & staleness check.
  const maintenance = await runMaintenance().catch((e) => ({
    ok: false,
    error: String(e),
  }));

  // 3) Weekly briefings — sent ONCE per Monday.
  const briefings = await runBriefings().catch((e) => ({
    ok: false,
    sent: 0,
    error: String(e),
  }));

  // 4) Monthly recaps — runs on the FIRST Monday of every month (day 1..7),
  //    deduped against email_log so re-runs never double-send.
  const now = new Date();
  let recaps: unknown = null;
  if (now.getUTCDate() <= 7) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const already = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailLog)
      .where(
        and(
          gt(emailLog.createdAt, monthStart),
          sql`${emailLog.subject} LIKE 'Monthly value recap%'`
        )
      );
    if ((already[0]?.n ?? 0) === 0) {
      recaps = await runMonthlyRecaps().catch((e) => ({
        ok: false,
        error: String(e),
      }));
    } else {
      recaps = { skipped: "already_sent_this_month" };
    }
  }

  // 5) Owner recap email.
  let opsRecap = "skipped";
  try {
    const [weekMap, pool, topVenue] = await Promise.all([
      getGenuineNewFilingsByState(7),
      db
        .select({ state: prospects.state, n: sql<number>`count(*)::int` })
        .from(prospects)
        .groupBy(prospects.state),
      db
        .select({
          name: venueReceipts.tradeName,
          city: venueReceipts.city,
          total: venueReceipts.total,
        })
        .from(venueReceipts)
        .orderBy(sql`period_end desc, total desc`)
        .limit(1),
    ]);
    const realWeekTotal = [...weekMap.values()].reduce((a, b) => a + b, 0);
    const poolStates = pool
      .filter((r) => r.n >= 20)
      .map((r) => r.state)
      .sort();
    const weekIndex = Math.floor(Date.now() / (7 * 86_400_000));
    const rotation = poolStates.length
      ? poolStates[weekIndex % poolStates.length]
      : "TX";

    opsRecap = (await sendOpsAlert(
      "Weekly recap — your machine ran itself",
      `<p><strong>This week:</strong> ${realWeekTotal.toLocaleString()} genuine new venue filings across ${weekMap.size} states.</p>
       <p><strong>PourWatch self-healing:</strong> ${reprobed.length} paused source(s) re-probed.</p>
       <p><strong>Outreach rotation:</strong> this week&apos;s state is <strong>${rotation}</strong>${poolStates.length ? ` (pool: ${poolStates.join(", ")})` : " — prospect pool growing automatically"}.</p>
       ${topVenue[0]?.name ? `<p><strong>Top TX venue by revenue:</strong> ${topVenue[0].name} (${topVenue[0].city ?? "TX"}) — $${Math.round(topVenue[0].total ?? 0).toLocaleString()}/mo.</p>` : ""}`
    ))
      ? "sent"
      : "logged";
  } catch {
    opsRecap = "error";
  }

  // 6) Weekly CSV backup of subscribers + contact messages.
  const backup = await runDbBackup().catch((e) => ({
    sent: false,
    detail: String(e).slice(0, 120),
  }));

  return Response.json({
    ok: true,
    elapsedMs: Date.now() - started,
    ranAt: new Date().toISOString(),
    reprobed,
    maintenance: { ok: maintenance.ok },
    briefings: { ok: briefings.ok, sent: "sent" in briefings ? briefings.sent : 0 },
    ...(recaps ? { recaps } : {}),
    opsRecap,
    backup,
  });
}
