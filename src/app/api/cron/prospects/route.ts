// Daily prospect harvest — pulls one state's B2B prospects (attorneys,
// insurance agents, beverage sellers, bars) from OpenStreetMap. Free and
// unlimited. Manual run: ?state=TX (any 2-letter code).
import { cronAuthorized } from "@/lib/auth";
import { harvestProspects, PROSPECT_CATEGORIES, todaysState } from "@/lib/prospects";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const wanted = (url.searchParams.get("state") ?? "").trim().toUpperCase();
  const state = /^[A-Z]{2}$/.test(wanted) ? wanted : todaysState();
  // optional: harvest a single category (big states stay inside the
  // Hobby 60s window when pulled one category at a time)
  const category = (url.searchParams.get("category") ?? "").trim().toLowerCase();
  const catIds = PROSPECT_CATEGORIES.some((c) => c.id === category)
    ? [category]
    : undefined;

  try {
    const out = await harvestProspects(state, catIds);
    return Response.json({ ok: true, ranAt: new Date().toISOString(), ...out });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
