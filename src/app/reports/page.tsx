import Link from "next/link";
import { ArrowRight, BarChart3, Newspaper, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { sql } from "drizzle-orm";
import { events } from "@/db/schema";
import Reveal from "@/components/reveal";
import { Footer, Nav } from "@/components/ui";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Weekly liquor market intelligence reports — Texas & New York",
  description:
    "Weekly executive summaries of newly filed bar, restaurant and retail liquor licenses. Computed from official state records every 7 days.",
};

export default async function ReportsIndex() {
  await ensureSchema();

  const [txWeek, nyWeek] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(sql`${events.state} = 'TX' AND ${events.occurredAt} > now() - interval '7 days'`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(sql`${events.state} = 'NY' AND ${events.occurredAt} > now() - interval '7 days'`),
  ]);

  const reports = [
    {
      slug: "texas-weekly-liquor-filings",
      state: "TX",
      name: "Texas Weekly Liquor Filings & Venue Pipeline Report",
      filingsThisWeek: txWeek[0]?.n ?? 0,
      description:
        "Every new TABC Mixed Beverage, Late Hours and package store application filed across Austin, DFW, Houston and San Antonio over the last 7 days.",
    },
    {
      slug: "new-york-weekly-liquor-filings",
      state: "NY",
      name: "New York Weekly SLA Filings & Venue Pipeline Report",
      filingsThisWeek: nyWeek[0]?.n ?? 0,
      description:
        "Executive weekly digest of new on-premises liquor, restaurant wine and grocery beer filings across New York City and Upstate.",
    },
  ];

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-5xl px-5 pt-28 pb-20">
        <p className="eyebrow">[ Trade Intelligence · Published Weekly ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
          Weekly state <span className="italic text-amber">market reports.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          Weekly rollups of new bar and restaurant filings, county heatmaps, and license
          velocity across Texas and New York. Used by distributors, POS vendors, and
          trade journalists.
        </p>

        <div className="mt-12 space-y-6">
          {reports.map((r, i) => (
            <Reveal key={r.slug} delay={i * 90}>
              <Link
                href={`/reports/${r.slug}`}
                className="group block rounded-2xl border border-line bg-panel p-7 sm:p-8 transition-colors hover:border-amber/40 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 font-mono text-xs text-amber font-semibold tracking-wider">
                    <Newspaper className="h-4 w-4" /> {r.state} · WEEKLY ROUNDUP
                  </span>
                  <span className="rounded-full bg-leaf/15 border border-leaf/40 px-3 py-1 font-mono text-[10px] text-leaf font-bold tracking-wider">
                    {r.filingsThisWeek} NEW FILINGS THIS WEEK
                  </span>
                </div>

                <h2 className="font-display mt-4 text-2xl font-medium text-cream group-hover:text-amber transition-colors sm:text-3xl">
                  {r.name}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-smoke">
                  {r.description}
                </p>

                <div className="mt-6 flex items-center justify-between border-t border-line pt-4 font-mono text-xs">
                  <span className="text-faint">UPDATED WITH OFFICIAL REGISTRY SWEEP</span>
                  <span className="flex items-center gap-1.5 text-amber font-semibold">
                    READ REPORT <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
}
