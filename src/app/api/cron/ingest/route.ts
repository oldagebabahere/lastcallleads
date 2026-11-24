// Triggerable ingest endpoint (unified through ingest-aggregator).
//   /api/cron/ingest?state=TX&force=1
//   /api/cron/ingest?tier=fast|heavy|all
//   /api/cron/ingest?source=tx-pending
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { ALL_SOURCES, runIngest, type SourceId } from "@/lib/ingest-run";
import {
  ALL_STATE_SOURCES,
  COVERED_STATES,
  runAllSources,
  runByState,
} from "@/lib/ingest-aggregator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const url = new URL(req.url);
  const only = url.searchParams.get("source") as SourceId | null;
  const state = (url.searchParams.get("state") ?? "").trim().toUpperCase();
  const force = url.searchParams.get("force") === "1";
  const tierParam = url.searchParams.get("tier");
  const tier: "fast" | "heavy" | "all" =
    tierParam === "heavy" || tierParam === "all" ? tierParam : "fast";

  if (only && ALL_SOURCES.includes(only)) {
    const result = await runIngest(only);
    return Response.json({
      ok: result.ok,
      ranAt: new Date().toISOString(),
      results: [result],
    });
  }

  if (state) {
    const ran = await runByState(state, force);
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      state,
      ...ran,
    });
  }

  const ran = await runAllSources(force, {
    tier,
    budgetMs: 48_000,
    concurrency: 4,
  });
  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    tier,
    configuredSources: ALL_STATE_SOURCES.length,
    configuredStates: COVERED_STATES,
    ...ran,
  });
}
