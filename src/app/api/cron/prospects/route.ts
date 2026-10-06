// Daily prospect harvest — pulls one state's B2B prospects (attorneys,
// insurance agents, beverage sellers, bars) from OpenStreetMap. Free and
// unlimited. Manual run: ?state=TX (any 2-letter code).
import { cronAuthorized } from "@/lib/auth";
import { harvestProspects, PROSPECT_CATEGORIES, todaysState } from "@/lib/prospects";
import { ensureSchema } from "@/db/bootstrap";
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
  const url = new URL(req.url);
  const wanted = (url.searchParams.get("state") ?? "").trim().toUpperCase();
  const state = /^[A-Z]{2}$/.test(wanted) ? wanted : todaysState();
  // optional: harvest a single category (big states stay inside the
  // Hobby 60s window when pulled one category at a time)
  const category = (url.searchParams.get("category") ?? "").trim().toLowerCase();
  let catIds = PROSPECT_CATEGORIES.some((c) => c.id === category)
    ? [category]
    : null;

  // No category picked? Harvest exactly ONE category — the least-filled for
  // this state. Big states (TX/FL/CA...) blow past the 60s function limit
  // when pulled all at once (504), so every RUN click fetches one fast
  // category; 4 clicks fill a state completely.
  let autoPicked: string | null = null;
  if (!catIds) {
    const counts = await db
      .select({ category: prospects.category, n: sql<number>`count(*)::int` })
      .from(prospects)
      .where(eq(prospects.state, state))
      .groupBy(prospects.category);
    const have = new Map(counts.map((c) => [c.category, c.n]));
    autoPicked = [...PROSPECT_CATEGORIES].sort(
      (a, b) => (have.get(a.id) ?? 0) - (have.get(b.id) ?? 0)
    )[0].id;
    catIds = [autoPicked];
  }

  try {
    const out = await harvestProspects(state, catIds);
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      category: autoPicked ?? catIds[0],
      hint: autoPicked
        ? "1 click = 1 category. Click RUN again for the next one (4 clicks = full state)."
        : undefined,
      ...out,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
