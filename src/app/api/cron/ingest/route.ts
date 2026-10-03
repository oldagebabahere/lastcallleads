// Runs automatically every morning (see vercel.json). Can also be triggered
// by hand from the control room. Pulls every source, records what is new.
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { ALL_SOURCES, runIngest, type SourceId } from "@/lib/ingest-run";
import {
  ALL_STATE_SOURCES,
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
  const aggregator = url.searchParams.get("aggregator");
  const only = url.searchParams.get("source") as SourceId | null;
  const state = url.searchParams.get("state");

  if (aggregator === "true") {
    const wanted = (state ?? "").trim().toUpperCase();
    const force = url.searchParams.get("force") === "1";
    if (wanted) {
      const ran = await runByState(wanted, force);
      return Response.json({
        ok: true,
        ranAt: new Date().toISOString(),
        state: wanted,
        ...ran,
      });
    }
    const ran = await runAllSources(force);
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...ran,
    });
  }

  const ids: SourceId[] =
    only && ALL_SOURCES.includes(only) ? [only] : ALL_SOURCES;

  const results = [];
  for (const id of ids) {
    results.push(await runIngest(id));
  }
  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    results,
    source: "all-available",
    configuredStates: ALL_STATE_SOURCES.map((s) => s.state),
  });
}
