// Autonomous daily B2B outreach trigger (can be called manually from Dashboard
// or automatically when AUTO_OUTREACH_ENABLED=true in /api/cron/daily).
import { cronAuthorized } from "@/lib/auth";
import { runAutoOutreach, runMailboxWarmup } from "@/lib/auto-outreach";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  if (url.searchParams.get("onlyWarmup") === "1") {
    const warmup = await runMailboxWarmup({ force: true });
    return Response.json({ ok: true, ranAt: new Date().toISOString(), warmup });
  }
  const state = url.searchParams.get("state") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 10) || 10;
  const dryRun = url.searchParams.get("dry") === "1";
  const forceWarmup = url.searchParams.get("warmup") === "1";

  const report = await runAutoOutreach({ state, limit, dryRun, forceWarmup });
  return Response.json({ ranAt: new Date().toISOString(), ...report });
}
