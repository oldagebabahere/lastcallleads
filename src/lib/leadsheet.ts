// Auto-generated lead sheet — the machine's answer to "where do I get leads?"
// Every week it finds counties with NEW filings, then lists the wholesalers &
// distributors ALREADY LICENSED in those same counties. Those are the people
// who most want to know about new venues in their territory — today.
import { db } from "@/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { events, licenses } from "@/db/schema";

export type LeadSheetRow = {
  county: string;
  filings: number;
  distributors: string[];
  phones: (string | null)[];
};

export type LeadSheet = {
  state: string;
  days: number;
  newFilings: number;
  counties: LeadSheetRow[];
};

// TX prospect license codes: W (wholesaler), LP (local distributor),
// B (brewer), BP (brewpub) — the people who buy placements into venues.
const PROSPECT_TYPES = ["W", "LP", "B", "BP"];

export async function buildLeadSheet(
  state: "TX" | "NY" = "TX",
  days = 7
): Promise<LeadSheet> {
  const since = new Date(Date.now() - days * 86_400_000);

  const countyCounts = await db
    .select({ county: events.county, n: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        eq(events.state, state),
        eq(events.eventType, "NEW_PENDING"),
        gte(events.occurredAt, since)
      )
    )
    .groupBy(events.county)
    .orderBy(desc(sql`count(*)`))
    .limit(12);

  const hotCounties = countyCounts
    .filter((r) => r.county)
    .map((r) => r.county as string);

  let distributorRows: (typeof licenses.$inferSelect)[] = [];
  if (hotCounties.length && state === "TX") {
    distributorRows = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.state, state),
          eq(licenses.kind, "active"),
          inArray(licenses.licenseType, PROSPECT_TYPES),
          inArray(licenses.county, hotCounties)
        )
      );
  }

  const counties: LeadSheetRow[] = countyCounts
    .filter((r) => r.county)
    .map((r) => {
      const inCounty = distributorRows.filter(
        (d) => (d.county ?? "").toLowerCase() === (r.county as string).toLowerCase()
      );
      return {
        county: r.county as string,
        filings: r.n,
        distributors: [...new Set(
          inCounty.map((d) => d.tradeName ?? d.ownerName ?? "Unnamed company")
        )],
        phones: inCounty.map((d) => d.phone),
      };
    });

  return {
    state,
    days,
    newFilings: countyCounts.reduce((a, b) => a + b.n, 0),
    counties,
  };
}
