// Prospect list export — the outreach ammo. Your own database already holds
// Texas wholesalers, distributors and brewers (licenses we watch). This
// endpoint converts that into a clean CSV you can upload to any email tool.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { licenses } from "@/db/schema";
import { isAdminKey } from "@/lib/auth";
import { LIVE_STATE_CODES } from "@/lib/states";

export const dynamic = "force-dynamic";

// TX prospect types: W wholesaler, LP local distributor, B brewer, BP brewpub.
// Plus high-ticket commercial data packs: `tx-goldmine` & `master-9state`.
const PROSPECT_TYPES: Record<string, string> = {
  wholesalers: "W",
  distributors: "LP",
  breweries: "B",
  brewpubs: "BP",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!isAdminKey(key)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const kind = (url.searchParams.get("type") ?? "wholesalers").toLowerCase();
  const state = (url.searchParams.get("state") ?? "TX").toUpperCase();
  const escape = (v: string | number | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""').trim()}"`;

  await ensureSchema();

  // High-Ticket Dataset #1 ($399 Pack): Top 2,500 Highest-Revenue Texas Bars & Nightclubs
  if (kind === "tx-goldmine") {
    const res = await pool.query<{
      permit: string;
      trade_name: string | null;
      owner_name: string | null;
      city: string | null;
      county: string | null;
      period_end: string | null;
      total: number;
      liquor: number | null;
      wine: number | null;
      beer: number | null;
    }>(
      `SELECT permit, trade_name, owner_name, city, county, period_end, total, liquor, wine, beer
       FROM (
         SELECT DISTINCT ON (permit)
           permit, trade_name, owner_name, city, county, period_end, total, liquor, wine, beer
         FROM venue_receipts
         WHERE total > 0
         ORDER BY permit, period_end DESC, total DESC
       ) latest
       ORDER BY total DESC
       LIMIT 2500`
    );
    const header =
      "rank,trade_name,owner_entity,city,county,state,tabc_permit,monthly_alcohol_sales_usd,monthly_liquor_usd,monthly_wine_usd,monthly_beer_usd,reporting_period";
    const csv = [
      header,
      ...res.rows.map((r, idx) =>
        [
          idx + 1,
          r.trade_name,
          r.owner_name,
          r.city,
          r.county,
          "TX",
          r.permit,
          Math.round(Number(r.total ?? 0)),
          Math.round(Number(r.liquor ?? 0)),
          Math.round(Number(r.wine ?? 0)),
          Math.round(Number(r.beer ?? 0)),
          r.period_end,
        ]
          .map(escape)
          .join(",")
      ),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="texas-top-2500-highest-revenue-bars.csv"`,
      },
    });
  }

  // High-Ticket Dataset #2 ($599 Pack): 9-State Pre-Opening + Recent Hospitality Register
  if (kind === "master-9state") {
    const rows = await db
      .select({
        state: licenses.state,
        kind: licenses.kind,
        tradeName: licenses.tradeName,
        ownerName: licenses.ownerName,
        typeName: licenses.typeName,
        address: licenses.address,
        city: licenses.city,
        zip: licenses.zip,
        county: licenses.county,
        phone: licenses.phone,
        filedAt: licenses.filedAt,
        licenseKey: licenses.licenseKey,
      })
      .from(licenses)
      .where(inArray(licenses.state, [...LIVE_STATE_CODES]))
      .orderBy(
        sql`CASE WHEN ${licenses.kind} = 'pending' THEN 0 ELSE 1 END`,
        desc(licenses.filedAt),
        desc(licenses.id)
      )
      .limit(15000);

    const header =
      "state,status_kind,trade_name,legal_owner_llc,license_type,street_address,city,zip,county,phone,filed_date,license_key";
    const csv = [
      header,
      ...rows.map((r) =>
        [
          r.state,
          r.kind,
          r.tradeName,
          r.ownerName,
          r.typeName,
          r.address,
          r.city,
          r.zip,
          r.county,
          r.phone,
          r.filedAt ? new Date(r.filedAt).toISOString().slice(0, 10) : "",
          r.licenseKey,
        ]
          .map(escape)
          .join(",")
      ),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="us-9state-hospitality-master-pack.csv"`,
      },
    });
  }

  const typeCode = PROSPECT_TYPES[kind] ?? "W";

  const rows = await db
    .select({
      owner: licenses.ownerName,
      trade: licenses.tradeName,
      type: licenses.licenseType,
      typeName: licenses.typeName,
      city: licenses.city,
      county: licenses.county,
      address: licenses.address,
      phone: licenses.phone,
    })
    .from(licenses)
    .where(
      and(
        eq(licenses.state, state),
        eq(licenses.licenseType, typeCode),
        sql`${licenses.kind} = 'active'`
      )
    )
    .limit(5000);

  const header = "owner,trade_name,license_type,type_name,address,city,county,phone";
  const csv = [
    header,
    ...rows.map((r) =>
      [r.owner, r.trade, r.type, r.typeName, r.address, r.city, r.county, r.phone]
        .map(escape)
        .join(",")
    ),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${state.toLowerCase()}-${kind}-prospects.csv"`,
    },
  });
}
