// WEEKLY SWEEP (Hobby-plan friendly). Mondays: housekeeping + briefings.
// 1st of month: value recaps. Every run: ONE small-state prospect harvest
// (big states need Pro's longer timeouts — they still run from the
// dashboard button at any plan).
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { runMaintenance } from "@/lib/maintenance";
import { runBriefings, runMonthlyRecaps } from "@/lib/digest";
import { harvestProspects } from "@/lib/prospects";
import { sendOpsAlert } from "@/lib/pourwatch";
import { db } from "@/db";
import { prospects, venueReceipts } from "@/db/schema";
import { events } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Small states finish inside Hobby's short function timeout.
const SMALL_STATES = ["DE", "RI", "VT", "NH", "WY", "ND", "SD", "MT", "ME", "AK"];

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const maintenance = await runMaintenance().catch((e) => ({
    ok: false,
    error: String(e),
  }));
  const briefings = await runBriefings().catch((e) => ({ ok: false, error: String(e) }));

  // Monthly recaps only on the 1st (and the 2nd as a safety retry).
  const day = new Date().getUTCDate();
  let recaps: unknown = null;
  if (day === 1 || day === 2) {
    recaps = await runMonthlyRecaps().catch((e) => ({ ok: false, error: String(e) }));
  }

  // One small state per week, round-robin by week number.
  const week = Math.floor(Date.now() / (7 * 86_400_000));
  const state = SMALL_STATES[week % SMALL_STATES.length];
  let harvestReport: { state: string; added?: number; error?: string } = {
    state,
  };
  try {
    const run = await harvestProspects(state);
    const added = (run.results ?? []).reduce(
      (n, r) => n + ((r as { added?: number }).added ?? 0),
      0
    );
    harvestReport = { state, added };
  } catch (e) {
    harvestReport = { state, error: String(e).slice(0, 120) };
  }

  // Owner recap — one email a week: what the machine did, what to expect.
  let opsRecap = "skipped";
  try {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const filings = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(gt(events.detectedAt, weekAgo));
    const pool = await db
      .select({ state: prospects.state, n: sql<number>`count(*)::int` })
      .from(prospects)
      .groupBy(prospects.state);
    const poolStates = pool.filter((r) => r.n >= 20).map((r) => r.state).sort();
    const weekIndex = Math.floor(Date.now() / (7 * 86_400_000));
    const rotation = poolStates.length
      ? poolStates[weekIndex % poolStates.length]
      : "TX";
    const topVenue = await db
      .select({
        name: venueReceipts.tradeName,
        city: venueReceipts.city,
        total: venueReceipts.total,
      })
      .from(venueReceipts)
      .orderBy(sql`period_end desc, total desc`)
      .limit(1);
    opsRecap = await sendOpsAlert(
      "Weekly recap — your machine ran itself",
      `<p><strong>This week:</strong> ${Number(filings[0]?.n ?? 0).toLocaleString()} new filings ingested across all sources.</p>
       <p><strong>Outreach rotation:</strong> this week's state is <strong>${rotation}</strong>${poolStates.length ? ` (pool: ${poolStates.join(", ")})` : " — prospect pool still growing, the daily job adds states automatically"}.</p>
       ${topVenue[0]?.name ? `<p><strong>Biggest fish on the board:</strong> ${topVenue[0].name} (${topVenue[0].city ?? "TX"}) — $${Math.round(topVenue[0].total ?? 0).toLocaleString()} in monthly alcohol receipts.</p>` : ""}
       <p style="color:#666;font-size:12px">Gmail automation sends daily. Just answer replies.</p>`
    )
      ? "sent"
      : "logged";
  } catch {
    opsRecap = "error";
  }

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    maintenance: { ok: maintenance.ok },
    briefings: { ok: briefings.ok },
    ...(recaps ? { recaps } : {}),
    prospects: harvestReport,
    opsRecap,
  });
}
