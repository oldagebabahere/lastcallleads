import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { Footer, Nav } from "@/components/ui";
import { citySlug } from "@/lib/queries";
import { ALL_US_STATE_NAMES, LIVE_STATE_NAMES_LIST } from "@/lib/states";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Liquor license filings by city — 9 verified US beverage markets",
  description: `Every city Last Call Leads monitors across ${LIVE_STATE_NAMES_LIST}. Click any city for live filings.`,
  alternates: { canonical: "/cities" },
};

const STATE_NAMES: Record<string, string> = ALL_US_STATE_NAMES;

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
      .where(sql`${licenses.city} IS NOT NULL AND ${licenses.city} <> ''`)
      .groupBy(licenses.city, licenses.state)
      .orderBy(desc(sql`count(*)`))
      .limit(2000);

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
        .where(sql`${events.city} IS NOT NULL AND ${events.city} <> ''`)
        .groupBy(events.city, events.state)
        .orderBy(desc(sql`count(*)`))
        .limit(2000);
      merged = (eventRows as unknown as { city: string; state: string; n: number }[]).filter(
        (r) => r.city
      );
    }

    cities = merged;
  } catch {
    cities = [];
  }

  const byState = new Map<string, { city: string; n: number }[]>();
  for (const r of cities) {
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state)!.push({ city: r.city, n: r.n });
  }
  for (const list of byState.values()) {
    list.sort((a, b) => a.city.localeCompare(b.city));
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ All covered cities · updated daily ]</p>
        <h1 className="font-display mt-5 max-w-2xl text-4xl font-medium sm:text-5xl">
          Cities we&apos;re watching.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-smoke">
          Every city below has active alcohol-license records under watch. Tap any city for the live
          list.
        </p>
        {cities.length > 0 && (
          <p className="mt-3 font-mono text-[11px] tracking-[0.15em] text-amber">
            {cities.length.toLocaleString()} CITIES ·{" "}
            {cities.reduce((a, b) => a + b.n, 0).toLocaleString()} TRACKED RECORDS · UPDATED DAILY
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] text-faint">FILTER:</span>
          {Array.from(byState.keys())
            .sort()
            .map((state) => (
              <a
                key={state}
                href={`#state-${state}`}
                className="rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[11px] tracking-[0.15em] text-cream hover:border-amber/40 hover:text-amber"
              >
                {state} · {STATE_NAMES[state] ?? state}
              </a>
            ))}
        </div>

        {cities.length === 0 && (
          <div className="mt-10 rounded-xl border border-line bg-panel px-6 py-12 text-center text-sm text-smoke">
            Cities list populates automatically after the first data sweep.
          </div>
        )}

        {Array.from(byState.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([state, items]) => (
            <section key={state} id={`state-${state}`} className="mt-12">
              <h2 className="font-display text-2xl font-medium text-cream">
                {STATE_NAMES[state] ?? state}
              </h2>
              <p className="font-mono text-[11px] tracking-[0.2em] text-faint">
                {items.length} CITIES · {items.reduce((a, b) => a + b.n, 0).toLocaleString()}{" "}
                RECORDS
              </p>
              <div className="mt-6 grid gap-x-6 gap-y-3 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => (
                  <Link
                    key={`${c.city}-${state}`}
                    href={`/cities/${citySlug(c.city, state)}`}
                    className="flex items-center justify-between gap-3 border-b border-line/50 py-2 transition-colors hover:bg-panel2/40 hover:text-amber"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-faint" />
                      <span className="truncate">{c.city}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] text-smoke">
                      {c.n} RECORDS
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}

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
