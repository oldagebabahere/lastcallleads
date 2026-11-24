// Auto-generated lead sheet — finds counties with new pending filings in any
// covered state and pairs them with licensed wholesalers/distributors in those counties.
import { db } from "@/db";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { events, licenses } from "@/db/schema";

export type LeadSheetRow = {
  county: string;
  filings: number;
  distributors: { name: string; city: string | null; phone: string | null }[];
  // Legacy flat fields preserved for backwards compatibility
  phones: (string | null)[];
};

export type LeadSheet = {
  state: string;
  days: number;
  newFilings: number;
  counties: LeadSheetRow[];
};

const TX_PROSPECT_TYPES = ["W", "LP", "B", "BP"];

export async function buildLeadSheet(
  state = "TX",
  days = 7
): Promise<LeadSheet> {
  const st = state.trim().toUpperCase() || "TX";
  const since = new Date(Date.now() - days * 86_400_000);

  const countyCounts = await db
    .select({ county: events.county, n: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        eq(events.state, st),
        eq(events.eventType, "NEW_PENDING"),
        gte(events.occurredAt, since),
        sql`coalesce(${events.licenseKey}, '') NOT LIKE 'TTB-%'`
      )
    )
    .groupBy(events.county)
    .orderBy(desc(sql`count(*)`))
    .limit(12);

  const hotCounties = countyCounts
    .filter((r) => r.county)
    .map((r) => r.county as string);

  let distributorRows: (typeof licenses.$inferSelect)[] = [];
  if (hotCounties.length) {
    const lowerCounties = hotCounties.map((c) => c.toLowerCase());
    distributorRows = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.state, st),
          eq(licenses.kind, "active"),
          or(
            st === "TX" ? inArray(licenses.licenseType, TX_PROSPECT_TYPES) : undefined,
            sql`lower(coalesce(${licenses.typeName}, '')) LIKE '%wholesal%'`,
            sql`lower(coalesce(${licenses.typeName}, '')) LIKE '%distribut%'`
          ),
          sql`lower(coalesce(${licenses.county}, '')) = ANY(${lowerCounties})`
        )
      )
      .limit(500);
  }

  const counties: LeadSheetRow[] = countyCounts
    .filter((r) => r.county)
    .map((r) => {
      const target = (r.county as string).toLowerCase();
      const seen = new Set<string>();
      const distributors: { name: string; city: string | null; phone: string | null }[] = [];
      for (const d of distributorRows) {
        if ((d.county ?? "").toLowerCase() !== target) continue;
        const name = d.tradeName ?? d.ownerName ?? "Unnamed company";
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        distributors.push({ name, city: d.city, phone: d.phone });
      }
      return {
        county: r.county as string,
        filings: r.n,
        distributors,
        phones: distributors.map((d) => d.phone),
      };
    });

  return {
    state: st,
    days,
    newFilings: countyCounts.reduce((a, b) => a + b.n, 0),
    counties,
  };
}
