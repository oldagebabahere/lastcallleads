// Prospect CSV export — your daily outreach list, one click.
// /api/admin/prospects?key=...&state=TX&category=insurance&format=csv
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { prospects } from "@/db/schema";
import { isAdminKey } from "@/lib/auth";
import { and, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function esc(v: string | null | undefined): string {
  return `"${(v ?? "").replace(/"/g, '""').trim()}"`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!isAdminKey(key)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const state = (url.searchParams.get("state") ?? "").trim().toUpperCase();
  const category = (url.searchParams.get("category") ?? "").trim();

  const conds = [];
  if (/^[A-Z]{2}$/.test(state)) conds.push(eq(prospects.state, state));
  if (category) conds.push(eq(prospects.category, category));
  const where = conds.length ? and(...conds) : undefined;

  if (url.searchParams.get("format") === "csv") {
    const rows = await db
      .select()
      .from(prospects)
      .where(where)
      .orderBy(desc(prospects.firstSeenAt))
      .limit(20000);
    const lines = ["category,name,phone,website,address,city,state"];
    for (const r of rows) {
      lines.push(
        [r.category, r.name, r.phone, r.website, r.address, r.city, r.state]
          .map(esc)
          .join(",")
      );
    }
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="prospects.csv"',
      },
    });
  }

  const byCat = await db
    .select({
      category: prospects.category,
      n: sql<number>`count(*)::int`,
      withPhone: sql<number>`count(${prospects.phone})::int`,
    })
    .from(prospects)
    .where(where)
    .groupBy(prospects.category);

  const byState = await db
    .select({ state: prospects.state, n: sql<number>`count(*)::int` })
    .from(prospects)
    .groupBy(prospects.state)
    .orderBy(desc(sql`count(*)`))
    .limit(60);

  return Response.json({ ok: true, byCat, byState });
}
