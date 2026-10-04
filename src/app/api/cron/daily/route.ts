// DAILY SWEEP (Hobby-plan friendly: this + /api/cron/weekly = 2 cron jobs).
// Order matters: watchdog first, then data, then customer emails.
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { ALL_STATE_SOURCES, runSpecs } from "@/lib/ingest-aggregator";
import { sweepStale } from "@/lib/pourwatch";
import { runDigest } from "@/lib/digest";
import { runReceiptsIngest } from "@/lib/ingest-receipts";
import { harvestProspects, PROSPECT_CATEGORIES } from "@/lib/prospects";
import { buildSocialPost, runTrialTips } from "@/lib/owner-tasks";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  // 1) staleness sweep — silent sources get failure strikes
  const staleBumped = await sweepStale(ALL_STATE_SOURCES.map((s) => s.label)).catch(
    () => []
  );

  // 2) pull sources (paused ones skip themselves). The big federal registers
  //    (wholesalers/importers/wine, 80k+ rows) barely change day to day, so
  //    they refresh 3x a week - keeps this sweep well inside Hobby's 60s cap.
  const REGISTERS = new Set([
    "US · TTB alcohol wholesalers",
    "US · TTB alcohol importers",
    "US · TTB wine producers",
  ]);
  const dow = new Date().getUTCDay(); // 0=Sun 1=Mon 4=Thu
  const runRegisters = dow === 0 || dow === 1 || dow === 4;
  const specs = ALL_STATE_SOURCES.filter(
    (s) => !REGISTERS.has(s.label) || runRegisters
  );
  const ingest = await runSpecs(specs);

  // 2.5) Texas revenue goldmine — monthly data, so Tue + Sat refresh is
  //      plenty, and those are light days (no federal registers) which
  //      keeps the whole sweep inside Hobby's 60s cap.
  const receipts =
    dow === 2 || dow === 6
      ? await runReceiptsIngest().catch((e) => ({
          ok: false,
          rowsSeen: 0,
          stored: 0,
          error: String(e),
        }))
      : { ok: true, rowsSeen: 0, stored: 0, skipped: "light schedule" };

  // 2.6) self-bootstrapping prospect pool — ZERO-TOUCH, Hobby-safe:
  //      a) TX first: the flagship market (most filings + revenue goldmine).
  //         Overpass is slow on big states, so TX is harvested ONE category
  //         per run (Wed/Fri) until all 4 categories have prospects.
  //      b) then small states, one per run, until 5 states are healthy.
  let bootstrapped: { state: string; added?: number; error?: string } | null =
    null;
  const poolCounts = await db
    .select({ state: prospects.state, n: sql<number>`count(*)::int` })
    .from(prospects)
    .groupBy(prospects.state);
  const healthy = new Set(
    poolCounts.filter((c) => c.n >= 20).map((c) => c.state)
  );
  if (dow === 3 || dow === 5) {
    // Wed + Fri only — keeps the heavy harvest off the register days.
    // TX categories first (one per run), then small states.
    const txCats = await db
      .select({
        category: prospects.category,
        n: sql<number>`count(*)::int`,
      })
      .from(prospects)
      .where(eq(prospects.state, "TX"))
      .groupBy(prospects.category);
    const have = new Set(
      txCats.filter((c) => c.n >= 20).map((c) => c.category)
    );
    const nextCat = PROSPECT_CATEGORIES.find((c) => !have.has(c.id));
    if (nextCat) {
      bootstrapped = { state: `TX (${nextCat.id})` };
      try {
        const run = await harvestProspects("TX", [nextCat.id]);
        const added = (run.results ?? []).reduce(
          (n, r) => n + ((r as { added?: number }).added ?? 0),
          0
        );
        bootstrapped = { state: `TX (${nextCat.id})`, added };
      } catch (e) {
        bootstrapped = {
          state: `TX (${nextCat.id})`,
          error: String(e).slice(0, 120),
        };
      }
    } else if (healthy.size < 5) {
      const SMALL = ["RI", "DE", "VT", "NH", "WY", "ND", "SD", "MT", "ME", "AK"];
      const next = SMALL.find((s) => !healthy.has(s));
      if (next) {
        bootstrapped = { state: next };
        try {
          const run = await harvestProspects(next);
          const added = (run.results ?? []).reduce(
            (n, r) => n + ((r as { added?: number }).added ?? 0),
            0
          );
          bootstrapped = { state: next, added };
        } catch (e) {
          bootstrapped = { state: next, error: String(e).slice(0, 120) };
        }
      }
    }
  }

  // 3) customer digests — trials included, expired trials swept first
  const digest = await runDigest().catch((e) => ({
    ok: false,
    sent: 0,
    error: String(e),
  }));

  // 4) trial tips (day 1/3/5 retention emails) + social post draft (Mon/Wed/Fri)
  const trialTips = await runTrialTips().catch((e) => ({
    sent: 0,
    skipped: 0,
    error: String(e),
  }));
  let socialPost: { sent: boolean; detail: string } | null = null;
  if (dow === 1 || dow === 3 || dow === 5) {
    socialPost = await buildSocialPost().catch((e) => ({
      sent: false,
      detail: String(e).slice(0, 120),
    }));
  }

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    staleBumped,
    ingest: {
      ok: ingest.results.filter((r) => r.ok).length,
      failed: ingest.results.filter((r) => !r.ok).length,
      skipped: ingest.skipped,
    },
    receipts: {
      ok: receipts.ok,
      rowsSeen: receipts.rowsSeen,
      stored: receipts.stored ?? 0,
    },
    ...(bootstrapped ? { bootstrapped } : {}),
    digest: { ok: digest.ok, sent: digest.sent ?? 0 },
    trialTips,
    ...(socialPost ? { socialPost } : {}),
  });
}
