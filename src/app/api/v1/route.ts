// Public read API for Enterprise customers ($499/mo tier).
//
// Auth: `x-api-key` header, or `?key=` query param.
// Keys live in ENTERPRISE_API_KEYS as a comma-separated list:
//   ENTERPRISE_API_KEYS=key_live_abc,key_live_def
//
// Endpoints (all on this one route, selected by ?endpoint=):
//   GET /api/v1?endpoint=filings&state=TX&since=2026-09-01&limit=100
//   GET /api/v1?endpoint=filings&state=TX&city=Austin&type=full-bar&minScore=70
//   GET /api/v1?endpoint=states
//   GET /api/v1?endpoint=stats
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { INTENT_TAGS, scoreFiling } from "@/lib/lead-score";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const raw = process.env.ENTERPRISE_API_KEYS;
  if (!raw) return false; // closed until the operator adds keys
  const allowed = raw.split(",").map((k) => k.trim()).filter(Boolean);
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-api-key") ?? url.searchParams.get("key") ?? "";
  return allowed.includes(provided.trim());
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json(
      {
        ok: false,
        error: "invalid_api_key",
        hint: "Send your key as the x-api-key header. Enterprise plan required.",
      },
      { status: 401 }
    );
  }
  await ensureSchema();

  const url = new URL(req.url);
  const endpoint = (url.searchParams.get("endpoint") ?? "filings").toLowerCase();

  // ---- coverage map ------------------------------------------------------
  if (endpoint === "states") {
    const rows = await db
      .select({
        state: licenses.state,
        records: sql<number>`count(*)::int`,
        cities: sql<number>`count(DISTINCT ${licenses.city})::int`,
        pending: sql<number>`count(*) FILTER (WHERE ${licenses.kind} = 'pending')::int`,
      })
      .from(licenses)
      .groupBy(licenses.state)
      .orderBy(desc(sql`count(*)`));
    return Response.json({ ok: true, states: rows });
  }

  // ---- headline numbers --------------------------------------------------
  if (endpoint === "stats") {
    const [totals, evts] = await Promise.all([
      db
        .select({
          records: sql<number>`count(*)::int`,
          states: sql<number>`count(DISTINCT ${licenses.state})::int`,
        })
        .from(licenses),
      db.select({ filings: sql<number>`count(*)::int` }).from(events),
    ]);
    return Response.json({
      ok: true,
      stats: {
        ...(totals[0] ?? {}),
        filings: evts[0]?.filings ?? 0,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  // ---- the money endpoint ------------------------------------------------
  const state = url.searchParams.get("state")?.toUpperCase() ?? null;
  const city = url.searchParams.get("city");
  const county = url.searchParams.get("county");
  const tag = url.searchParams.get("type");
  const sinceRaw = url.searchParams.get("since");
  const kind = url.searchParams.get("kind");
  const minScore = Number(url.searchParams.get("minScore") ?? 0);
  const limit = Math.min(
    1000,
    Math.max(1, Number(url.searchParams.get("limit") ?? 100))
  );

  const conds = [];
  if (state) conds.push(eq(events.state, state));
  if (city) conds.push(sql`lower(${events.city}) = ${city.toLowerCase()}`);
  if (county) conds.push(sql`lower(${events.county}) = ${county.toLowerCase()}`);
  if (kind === "pending") conds.push(eq(events.eventType, "NEW_PENDING"));
  if (kind === "active") conds.push(eq(events.eventType, "NEW_LICENSE"));
  if (sinceRaw) {
    const since = new Date(sinceRaw);
    if (!Number.isNaN(since.getTime())) conds.push(gte(events.detectedAt, since));
  }

  const tagDef = tag ? INTENT_TAGS.find((t) => t.id === tag) : null;

  const rows = await db
    .select()
    .from(events)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(events.occurredAt))
    .limit(limit * 3); // over-fetch, then score-filter

  const results = rows
    .map((e) => ({
      id: e.id,
      state: e.state,
      signal:
        e.eventType === "NEW_PENDING"
          ? "APPLICATION_FILED"
          : e.eventType === "NEW_LICENSE"
            ? "LICENSE_ISSUED"
            : "STATUS_CHANGED",
      venue: e.tradeName ?? e.ownerName ?? null,
      city: e.city,
      county: e.county,
      licenseType: e.typeName,
      occurredAt: e.occurredAt?.toISOString() ?? null,
      detectedAt: e.detectedAt.toISOString(),
      score: scoreFiling({
        eventType: e.eventType,
        typeName: e.typeName,
        city: e.city,
        county: e.county,
        occurredAt: e.occurredAt,
        summary: e.summary,
      }),
    }))
    .filter((r) => {
      if (tagDef && tagDef.id !== "new-application") {
        if (!tagDef.match.test(`${r.licenseType ?? ""}`)) return false;
      }
      if (minScore && r.score.value < minScore) return false;
      return true;
    })
    .slice(0, limit);

  return Response.json({
    ok: true,
    count: results.length,
    filters: { state, city, county, type: tag, kind, since: sinceRaw, minScore },
    results,
  });
}
