import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { and, desc, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { Footer, Nav } from "@/components/ui";
import { citySlug } from "@/lib/queries";
import { LIVE_MARKETS, LIVE_STATE_CODES, LIVE_STATE_NAMES_LIST, stateFullName } from "@/lib/states";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Liquor license filings by city — 9 verified US beverage markets",
  description: `Top commercial hospitality cities Last Call Leads monitors across ${LIVE_STATE_NAMES_LIST}. Click any city for live filings.`,
  alternates: { canonical: "/cities" },
};

export default async function CitiesIndexPage() {
  let cities: { city: string; state: string; n: number }[] = [];
  try {
    await ensureSchema();
    const rows = await db
      .select({
        city: licenses.city,
        state: licenses.state,
        n: sql<number>`count(*)::int`,
      })
      .from(licenses)
      .where(
        and(
          inArray(licenses.state, LIVE_STATE_CODES),
          sql`${licenses.city} IS NOT NULL AND ${licenses.city} <> ''`
        )
      )
      .groupBy(licenses.city, licenses.state)
      .orderBy(desc(sql`count(*)`))
      .limit(1200);

    let merged = (rows as unknown as { city: string; state: string; n: number }[]).filter(
      (r) => r.city
    );

    if (merged.length === 0) {
      const eventRows = await db
        .select({
          city: events.city,
          state: events.state,
          n: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(
            inArray(events.state, LIVE_STATE_CODES),
            sql`${events.city} IS NOT NULL AND ${events.city} <> ''`
          )
        )
        .groupBy(events.city, events.state)
        .orderBy(desc(sql`count(*)`))
        .limit(1200);
      merged = (eventRows as unknown as { city: string; state: string; n: number }[]).filter(
        (r) => r.city
      );
    }

    cities = merged;
  } catch {
    cities = [];
  }

  // Group by state, ranked by highest-volume metros FIRST (Houston, Austin, NYC, LA, Chicago...)
  // and cap display to Top 60 metros per state so the directory loads ultra-fast (~140KB vs 3.1MB).
  const byState = new Map<string, { allCount: number; totalRecords: number; top: { city: string; n: number }[] }>();
  for (const r of cities) {
    const entry = byState.get(r.state) ?? { allCount: 0, totalRecords: 0, top: [] };
    entry.allCount += 1;
    entry.totalRecords += r.n;
    if (entry.top.length < 60) entry.top.push({ city: r.city, n: r.n });
    byState.set(r.state, entry);
  }

  const orderedStates = LIVE_MARKETS.map((m) => m.code).filter((code) => byState.has(code));

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ 9 verified markets · updated daily ]</p>
        <h1 className="font-display mt-5 max-w-2xl text-4xl font-medium sm:text-5xl">
          Cities we&apos;re watching.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-smoke">
          Ranked by active hospitality volume — click any metro below to inspect live liquor
          license filings and openings.
        </p>
        {cities.length > 0 && (
          <p className="mt-3 font-mono text-[11px] tracking-[0.15em] text-amber">
            {cities.length.toLocaleString()} CITIES ·{" "}
            {cities.reduce((a, b) => a + b.n, 0).toLocaleString()} TRACKED RECORDS · 9 LIVE MARKETS
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] text-faint">JUMP TO STATE:</span>
          {orderedStates.map((state) => (
            <a
              key={state}
              href={`#state-${state}`}
              className="rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] text-cream transition-colors hover:border-amber/50 hover:text-amber"
            >
              {stateFullName(state)}
            </a>
          ))}
        </div>

        {cities.length === 0 && (
          <div className="mt-10 rounded-xl border border-line bg-panel px-6 py-12 text-center text-sm text-smoke">
            Cities list populates automatically after the first data sweep.
          </div>
        )}

        {orderedStates.map((state) => {
          const info = byState.get(state)!;
          return (
            <section key={state} id={`state-${state}`} className="mt-12 scroll-mt-24">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-medium text-cream">
                    {stateFullName(state)}
                  </h2>
                  <p className="font-mono text-[11px] tracking-[0.18em] text-faint">
                    TOP {info.top.length} OF {info.allCount.toLocaleString()} CITIES ·{" "}
                    {info.totalRecords.toLocaleString()} RECORDS
                  </p>
                </div>
                <Link
                  href={`/map?state=${state}`}
                  className="font-mono text-[11px] tracking-[0.12em] text-amber hover:underline"
                >
                  OPEN {stateFullName(state).toUpperCase()} MAP →
                </Link>
              </div>
              <div className="mt-5 grid gap-x-6 gap-y-2.5 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-3">
                {info.top.map((c) => (
                  <Link
                    key={`${c.city}-${state}`}
                    href={`/cities/${citySlug(c.city, state)}`}
                    className="flex items-center justify-between gap-3 border-b border-line/50 py-2 transition-colors hover:bg-panel2/40 hover:text-amber"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-amber/70" />
                      <span className="truncate text-sm">{c.city}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] text-smoke">
                      {c.n.toLocaleString()} RECORDS
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <div className="mt-16 border-t border-line pt-8 text-sm text-smoke">
          <p>
            Don&apos;t see a city? Submit a request — high-volume markets unlock next. Contact{" "}
            <Link className="text-amber hover:underline" href="/contact">
              support
            </Link>
            .
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
