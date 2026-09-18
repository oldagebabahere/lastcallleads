import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import Reveal from "@/components/reveal";
import { Footer, Nav } from "@/components/ui";
import { citySlug } from "@/lib/queries";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Coverage — which states and cities we monitor",
  description:
    "Live coverage map: every state, county and city included in the Last Call Leads liquor-license monitor, with real record counts refreshed daily.",
};

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  NY: "New York",
  CA: "California",
  IL: "Illinois",
  WA: "Washington",
  OR: "Oregon",
  MO: "Missouri",
  MD: "Maryland",
  CT: "Connecticut",
  CO: "Colorado",
};

const STATE_SLUG: Record<string, string> = {
  TX: "texas",
  NY: "new-york",
  CA: "california",
  IL: "illinois",
  WA: "washington",
  OR: "oregon",
  MO: "missouri",
  MD: "maryland",
  CT: "connecticut",
  CO: "colorado",
};

type Row = { state: string; n: number };

export default async function CoveragePage() {
  await ensureSchema();

  let byState: Row[] = [];
  let cityRows: { city: string; state: string; n: number }[] = [];
  let pending: Row[] = [];
  let totalEvents = 0;

  try {
    const [a, b, c, d] = await Promise.all([
      db
        .select({ state: licenses.state, n: sql<number>`count(*)::int` })
        .from(licenses)
        .groupBy(licenses.state)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({
          city: licenses.city,
          state: licenses.state,
          n: sql<number>`count(*)::int`,
        })
        .from(licenses)
        .where(sql`${licenses.city} IS NOT NULL AND ${licenses.city} <> ''`)
        .groupBy(licenses.city, licenses.state)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({ state: licenses.state, n: sql<number>`count(*)::int` })
        .from(licenses)
        .where(sql`${licenses.kind} = 'pending'`)
        .groupBy(licenses.state)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({ state: events.state, n: sql<number>`count(*)::int` })
        .from(events)
        .groupBy(events.state),
    ]);
    byState = a as unknown as Row[];
    cityRows = b as unknown as { city: string; state: string; n: number }[];
    pending = c as unknown as Row[];
    totalEvents = d.reduce((acc, r) => acc + r.n, 0);
  } catch {
    // page still renders with empty data
  }

  const totalLicenses = byState.reduce((a, b) => a + b.n, 0);
  const totalCities = cityRows.length;
  const totalStates = byState.length;
  const pendingByState = new Map(pending.map((p) => [p.state, p.n]));

  // Top 12 cities per state for the visible grid
  const citiesByState = new Map<string, { city: string; n: number }[]>();
  for (const r of cityRows) {
    if (!citiesByState.has(r.state)) citiesByState.set(r.state, []);
    citiesByState.get(r.state)!.push({ city: r.city, n: r.n });
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Coverage · refreshed daily ]</p>
        <h1 className="font-display mt-5 max-w-3xl text-4xl font-medium leading-tight sm:text-6xl">
          Every state and city we watch.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-smoke">
          These numbers come straight from the live database. No estimates.
        </p>

        {/* headline stats */}
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            { v: String(totalStates), l: "STATES LIVE" },
            { v: totalLicenses.toLocaleString(), l: "LICENSE RECORDS" },
            { v: String(totalCities), l: "CITIES TRACKED" },
            { v: totalEvents.toLocaleString(), l: "FILINGS CAPTURED" },
          ].map((x) => (
            <div key={x.l} className="bg-panel p-6">
              <p className="font-display text-3xl font-semibold text-cream">{x.v}</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-faint">
                {x.l}
              </p>
            </div>
          ))}
        </div>

        {/* per-state breakdown */}
        <Reveal>
          <section className="mt-16">
            <h2 className="font-display text-2xl font-medium text-cream">
              State by state
            </h2>
            <p className="mt-2 text-base text-smoke">
              Tap a state for its live filing feed.
            </p>

            <div className="mt-8 divide-y divide-line border-y border-line">
              {byState.map((s) => {
                const cities = citiesByState.get(s.state) ?? [];
                const slug = STATE_SLUG[s.state];
                return (
                  <div key={s.state} className="py-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                      <div>
                        {slug ? (
                          <Link
                            href={`/states/${slug}`}
                            className="font-display text-xl font-medium text-cream hover:text-amber"
                          >
                            {STATE_NAMES[s.state] ?? s.state}
                            <ArrowRight className="ml-2 inline h-4 w-4 text-faint" />
                          </Link>
                        ) : (
                          <p className="font-display text-xl font-medium text-cream">
                            {STATE_NAMES[s.state] ?? s.state}
                          </p>
                        )}
                        <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-faint">
                          {cities.length} CITIES · {s.n.toLocaleString()} RECORDS
                          {pendingByState.get(s.state)
                            ? ` · ${pendingByState.get(s.state)} PENDING`
                            : ""}
                        </p>
                      </div>
                      <Link
                        href={`/feed?state=${s.state}`}
                        className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
                      >
                        VIEW FEED →
                      </Link>
                    </div>

                    {cities.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {cities.slice(0, 12).map((c) => (
                          <Link
                            key={`${c.city}-${s.state}`}
                            href={`/cities/${citySlug(c.city, s.state)}`}
                            className="rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[11px] text-smoke transition-colors hover:border-amber/40 hover:text-amber"
                          >
                            {c.city}{" "}
                            <span className="text-faint">{c.n}</span>
                          </Link>
                        ))}
                        {cities.length > 12 && (
                          <Link
                            href={`/cities#state-${s.state}`}
                            className="rounded-md border border-amber/40 bg-amber/10 px-3 py-1.5 font-mono text-[11px] text-amber"
                          >
                            +{cities.length - 12} MORE →
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {byState.length === 0 && (
                <p className="py-10 text-center text-sm text-smoke">
                  Coverage populates after the first daily sweep.
                </p>
              )}
            </div>
          </section>
        </Reveal>

        {/* all cities link */}
        <Reveal delay={80}>
          <div className="mt-14 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-panel p-6">
            <p className="flex-1 text-base text-smoke">
              Want the full alphabetical list? Every city has its own live page.
            </p>
            <Link
              href="/cities"
              className="rounded-full bg-amber px-5 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink"
            >
              ALL {totalCities} CITIES →
            </Link>
          </div>
        </Reveal>

        {/* CTA */}
        <Reveal delay={100}>
          <div className="mt-10 rounded-2xl border border-amber/40 bg-wine-card p-8 text-center">
            <h2 className="font-display text-2xl font-medium sm:text-3xl">
              Get every new filing in your state by morning.
            </h2>
            <Link
              href="/#pricing"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber px-6 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
            >
              Start getting alerts <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
      <Footer />
    </main>
  );
}
