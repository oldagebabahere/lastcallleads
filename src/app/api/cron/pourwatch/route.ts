// PourWatch watchdog & self-healing endpoint.
// Can be triggered on demand (`?reprobe=all`) or via scheduled automation.
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import {
  ALL_STATE_SOURCES,
  HEAVY_SOURCE_LABELS,
  reprobeAndHealPaused,
} from "@/lib/ingest-aggregator";
import { sweepStale } from "@/lib/pourwatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const url = new URL(req.url);
  const reprobeAll = url.searchParams.get("reprobe") === "all";

  const staleBumped = await sweepStale(
    ALL_STATE_SOURCES.map((s) => s.label),
    HEAVY_SOURCE_LABELS
  );
  const reprobed = await reprobeAndHealPaused(reprobeAll);

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    staleBumped,
    reprobed,
  });
}
