// DAILY SWEEP — 100% Native Vercel Hobby (60s-safe, zero GitHub Actions).
// Runs all 18 live retail feeds across our 9 verified markets in ~12-18s,
// refreshes Texas Comptroller revenue receipts, then delivers enriched morning
// beverage dossiers + trial tips + Mon/Wed/Fri social post.
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import {
  ALL_STATE_SOURCES,
  HEAVY_SOURCE_LABELS,
  reprobeAndHealPaused,
  runAllSources,
} from "@/lib/ingest-aggregator";
import { sweepStale } from "@/lib/pourwatch";
import { runDigest } from "@/lib/digest";
import { runReceiptsIngest } from "@/lib/ingest-receipts";
import { buildSocialPost, runAnnualUpsells, runTrialTips } from "@/lib/owner-tasks";
import { runAutoOutreach } from "@/lib/auto-outreach";
import { harvestProspects, todaysState } from "@/lib/prospects";
import { isAutoOutreachActive } from "@/lib/mailer";
import { sendTelegramOwner } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  await ensureSchema();

  // 1) PourWatch staleness check across all 18 retail feeds.
  const staleBumped = await sweepStale(
    ALL_STATE_SOURCES.map((s) => s.label),
    HEAVY_SOURCE_LABELS
  ).catch(() => []);

  // 2) Pull ALL 18 retail feeds across our 9 live markets (CA included — fast 180d window!)
  //    with 5x concurrency and a strict 34s time budget so digests always complete cleanly.
  const ingest = await runAllSources(false, {
    tier: "all",
    concurrency: 5,
    budgetMs: 34_000,
  });

  // 2.5) TX Comptroller monthly alcohol receipts (Tue/Thu/Sat when budget allows).
  const dow = new Date().getUTCDay();
  const receipts =
    (dow === 2 || dow === 4 || dow === 6) && Date.now() - started < 38_000
      ? await runReceiptsIngest(4000).catch((e) => ({
          ok: false,
          rowsSeen: 0,
          stored: 0,
          error: String(e),
        }))
      : { ok: true, rowsSeen: 0, stored: 0, skipped: "scheduled/budget" };

  // 3) Enriched beverage-buyer morning digests (always runs — active + live trials).
  const digest = await runDigest().catch((e) => ({
    ok: false,
    sent: 0,
    error: String(e),
  }));

  // 4) Trial retention tips + Day-21 annual prepay upsell + Mon/Wed/Fri social post.
  const trialTips =
    Date.now() - started < 50_000
      ? await runTrialTips().catch((e) => ({
          sent: 0,
          skipped: 0,
          error: String(e),
        }))
      : { sent: 0, skipped: 0, deferred: true };

  const annualUpsells =
    Date.now() - started < 50_000
      ? await runAnnualUpsells().catch(() => ({ sent: 0, skipped: 0 }))
      : { sent: 0, skipped: 0 };

  let socialPost: { sent: boolean; detail: string } | null = null;
  if ((dow === 1 || dow === 3 || dow === 5) && Date.now() - started < 50_000) {
    socialPost = await buildSocialPost().catch((e) => ({
      sent: false,
      detail: String(e).slice(0, 120),
    }));
  }

  // 5) Automatic PourWatch self-healing (re-probes paused feeds every 12h + Socrata catalog replacement!)
  const healed =
    Date.now() - started < 44_000
      ? await reprobeAndHealPaused(false).catch(() => [])
      : [];

  // 5.5) Zero-touch prospect pipeline growth: rotate across ALL 9 live states daily
  //      pulling high-value breweries & beverage distributors automatically when budget allows.
  if (Date.now() - started < 40_000) {
    const harvestSt = todaysState();
    const harvestCat = dow % 2 === 0 ? "brewery" : "distributor";
    await Promise.race([
      harvestProspects(harvestSt, [harvestCat]).catch(() => undefined),
      new Promise((r) => setTimeout(r, 10_000)),
    ]);
  }

  // 6) Autonomous zero-mazdoori B2B outreach (auto-on once OUTREACH_SMTP_ACCOUNTS or AUTO_OUTREACH_ENABLED=true is set).
  let autoOutreach: Awaited<ReturnType<typeof runAutoOutreach>> | null = null;
  if (isAutoOutreachActive() && Date.now() - started < 48_000) {
    autoOutreach = await runAutoOutreach({ limit: 8 }).catch((e) => ({
      ok: false,
      state: "ERR",
      stateName: "Error",
      attempted: 0,
      sent: 0,
      followupsSent: 0,
      dryRun: 0,
      skipped: 0,
      accountsAvailable: 0,
      reason: String(e).slice(0, 120),
    }));
  }

  const okFeeds = ingest.results.filter((r) => r.ok).length;
  const failedFeeds = ingest.results.filter((r) => !r.ok).length;

  // 7) Optional free phone report via Telegram Bot (no-op if not configured).
  await sendTelegramOwner(
    [
      `🍸 Last Call Leads — Daily Autopilot Report`,
      `Feeds: ${okFeeds}/${ALL_STATE_SOURCES.length} OK (${failedFeeds} failed, ${healed.length} self-healed)`,
      `Digests sent: ${digest.sent ?? 0}`,
      autoOutreach
        ? `Outreach (${autoOutreach.stateName}): ${autoOutreach.sent} fresh + ${autoOutreach.followupsSent} follow-ups`
        : `Outreach: add OUTREACH_SMTP_ACCOUNTS in Vercel to auto-start`,
      `Elapsed: ${Math.round((Date.now() - started) / 1000)}s`,
    ].join("\n")
  ).catch(() => undefined);

  return Response.json({
    ok: true,
    elapsedMs: Date.now() - started,
    ranAt: new Date().toISOString(),
    staleBumped,
    healedCount: healed.length,
    ingest: {
      total: ALL_STATE_SOURCES.length,
      ok: okFeeds,
      failed: failedFeeds,
      skipped: ingest.skipped,
      deferred: ingest.deferred,
    },
    receipts: {
      ok: receipts.ok,
      rowsSeen: receipts.rowsSeen,
      stored: receipts.stored ?? 0,
    },
    digest: { ok: digest.ok, sent: digest.sent ?? 0 },
    trialTips,
    annualUpsells,
    ...(socialPost ? { socialPost } : {}),
    ...(autoOutreach ? { autoOutreach } : {}),
  });
}
