// PourWatch daily sweep — runs BEFORE the 12:00 ingest.
//   1. Stale sweep: any LIVE source with no successful run in 48h gets a
//      failure strike (3 strikes = auto-pause + one email).
//   2. Weekly re-probe: paused sources are retried once a week; if one
//      succeeds it is auto-resumed and a "recovered" email goes out.
// This is what makes the site self-healing: broken sources pause themselves,
// the rest keep flowing, and fixes happen without touching code.
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { ALL_STATE_SOURCES, runOneSource } from "@/lib/ingest-aggregator";
import { autoHealSource, recordRunResult, reprobeDue, sweepStale } from "@/lib/pourwatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const url = new URL(req.url);
  const reprobeAll = url.searchParams.get("reprobe") === "all";

  // 1) staleness sweep — live sources silent for 48h+ get a failure strike
  const labels = ALL_STATE_SOURCES.map((s) => s.label);
  const staleBumped = await sweepStale(labels);

  // 2) re-probe paused sources — weekly, or all right now with ?reprobe=all
  const paused = await reprobeDue(reprobeAll);
  const pausedLabels = new Set(paused.map((p) => p.source));
  const targets = ALL_STATE_SOURCES.filter((s) => pausedLabels.has(s.label));
  const reprobed: {
    label: string;
    ok: boolean;
    rows: number;
    error?: string;
    selfHealed?: string;
  }[] = [];
  for (const spec of targets) {
    let r = await runOneSource(spec, true); // force: ignore floors for one probe
    let selfHealed: string | undefined;
    // Still broken -> search the portal catalog for a replacement dataset.
    if (!r.ok) {
      const heal = await autoHealSource(spec);
      if (heal.healed) {
        selfHealed = heal.detail;
        r = await runOneSource(spec, true); // confirm with the adopted dataset
      }
    }
    await recordRunResult(r);
    reprobed.push({
      label: r.label,
      ok: r.ok,
      rows: r.rowsSeen,
      ...(r.error ? { error: r.error } : {}),
      ...(selfHealed ? { selfHealed } : {}),
    });
  }

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    staleBumped,
    reprobed,
  });
}
