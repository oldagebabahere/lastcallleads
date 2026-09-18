// Prospect list export — the outreach ammo. Your own database already holds
// Texas wholesalers, distributors and brewers (licenses we watch). This
// endpoint converts that into a clean CSV you can upload to any email tool.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { licenses } from "@/db/schema";
import { isAdminKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

// TX prospect types: W wholesaler, LP local distributor, B brewer, BP brewpub.
// These are the people who BUY contact with new venues.
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
  const typeCode = PROSPECT_TYPES[kind] ?? "W";

  await ensureSchema();

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
  const escape = (v: string | null) =>
    `"${(v ?? "").replace(/"/g, '""').trim()}"`;
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
