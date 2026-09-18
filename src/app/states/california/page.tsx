import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import Reveal from "@/components/reveal";
import SubscribeForm from "@/components/subscribe-form";
import { Footer, Nav } from "@/components/ui";
import { citySlug } from "@/lib/queries";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "California liquor-license filings — bars & restaurants opening soon",
  description:
    "California alcohol-license filings tracked daily: new bars, restaurants and package stores before they open. Live city pages, updated every morning.",
};

// California ABC licence types in plain English — used to decode filings
// so a subscriber knows what kind of venue is coming.
const CA_TYPES: { code: string; label: string }[] = [
  { code: "Type 47", label: "On-sale general — full bar, bona-fide restaurant" },
  { code: "Type 48", label: "On-sale general — full bar, bar or nightclub" },
  { code: "Type 75", label: "On-sale general — bona-fide eating place" },
  { code: "Type 41", label: "On-sale beer & wine, eating place" },
  { code: "Type 20", label: "Off-sale beer & wine, package only" },
  { code: "Type 21", label: "Off-sale general, package store" },
];

export default async function CaliforniaPage() {
  await ensureSchema();

  let total = 0;
  let pending = 0;
  let cities: { city: string; n: number }[] = [];
  let recent: {
    id: number;
    tradeName: string | null;
    ownerName: string | null;
    city: string | null;
    typeName: string | null;
    occurredAt: Date | null;
  }[] = [];

  try {
    const [totals, pend, cityRows, recentRows] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(licenses)
        .where(sql`${licenses.state} = 'CA'`),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(licenses)
        .where(sql`${licenses.state} = 'CA' AND ${licenses.kind} = 'pending'`),
      db
        .select({ city: licenses.city, n: sql<number>`count(*)::int` })
        .from(licenses)
        .where(
          sql`${licenses.state} = 'CA' AND ${licenses.city} IS NOT NULL AND ${licenses.city} <> ''`
        )
        .groupBy(licenses.city)
        .orderBy(desc(sql`count(*)`))
        .limit(24),
      db
        .select({
          id: events.id,
          tradeName: events.tradeName,
          ownerName: events.ownerName,
          city: events.city,
          typeName: events.typeName,
          occurredAt: events.occurredAt,
        })
        .from(events)
        .where(sql`${events.state} = 'CA'`)
        .orderBy(desc(events.occurredAt))
        .limit(8),
    ]);
    total = totals[0]?.n ?? 0;
    pending = pend[0]?.n ?? 0;
    cities = cityRows as unknown as { city: string; n: number }[];
    recent = recentRows as unknown as typeof recent;
  } catch {
    // page renders with whatever is available
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Coverage · CA ]</p>
        <h1 className="font-display mt-5 max-w-3xl text-4xl font-medium leading-tight sm:text-6xl">
          California filings,{" "}
          <span className="italic text-amber">watched daily.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-smoke">
          The country&apos;s largest bar and restaurant market. We track alcohol-licence
          records for new venues — bars, restaurants and package stores — and deliver
          them to subscribers each morning.
        </p>

        {/* live counts */}
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          {[
            { v: total.toLocaleString(), l: "CALIFORNIA RECORDS TRACKED" },
            { v: pending.toLocaleString(), l: "APPLICATIONS IN REVIEW" },
            { v: String(cities.length), l: "CITIES WITH ACTIVITY" },
          ].map((x) => (
            <div key={x.l} className="bg-panel p-6">
              <p className="font-display text-3xl font-semibold text-cream">{x.v}</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-faint">
                {x.l}
              </p>
            </div>
          ))}
        </div>

        {/* cities */}
        {cities.length > 0 && (
          <Reveal>
            <section className="mt-14">
              <h2 className="font-display text-2xl font-medium text-cream">
                Cities with activity
              </h2>
              <p className="mt-2 text-base text-smoke">
                Tap any city for its live filing list.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {cities.map((c) => (
                  <Link
                    key={c.city}
                    href={`/cities/${citySlug(c.city, "CA")}`}
                    className="rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[11px] text-smoke transition-colors hover:border-amber/40 hover:text-amber"
                  >
                    <MapPin className="mr-1 inline h-3 w-3" />
                    {c.city} <span className="text-faint">{c.n}</span>
                  </Link>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {/* recent filings */}
        {recent.length > 0 && (
          <Reveal delay={80}>
            <section className="mt-14">
              <h2 className="font-display text-2xl font-medium text-cream">
                Recent California filings
              </h2>
              <div className="mt-6 divide-y divide-line border-y border-line">
                {recent.map((e) => (
                  <div key={e.id} className="grid gap-2 py-4 sm:grid-cols-[90px_1fr_auto]">
                    <span className="font-mono text-[11px] text-faint">
                      {e.occurredAt
                        ? new Date(e.occurredAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-cream">
                        {e.tradeName ?? e.ownerName ?? "New venue"}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-smoke">
                        {[e.city, e.typeName].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-amber">CA</span>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {/* licence types */}
        <Reveal delay={120}>
          <section className="mt-14">
            <h2 className="font-display text-2xl font-medium text-cream">
              What the California codes mean
            </h2>
            <p className="mt-2 max-w-2xl text-base text-smoke">
              California uses its own licence-type codes. Here is how we decode them
              in subscriber alerts.
            </p>
            <div className="mt-6 divide-y divide-line border-y border-line">
              {CA_TYPES.map((t) => (
                <div key={t.code} className="grid gap-2 py-4 sm:grid-cols-[120px_1fr]">
                  <span className="font-mono text-sm font-semibold tracking-[0.05em] text-amber">
                    {t.code}
                  </span>
                  <span className="text-base text-cream">{t.label}</span>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* CTA */}
        <Reveal delay={140}>
          <div className="mt-14 rounded-2xl border border-amber/40 bg-wine-card p-8 sm:p-9">
            <h2 className="font-display text-2xl font-medium text-cream">
              Get California filings each morning.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-smoke">
              Pick California plus any other state. Your first digest lands at the next
              morning sweep.
            </p>
            <div className="mt-6 max-w-md">
              <SubscribeForm plan="solo" />
            </div>
          </div>
        </Reveal>

        <div className="mt-10 flex flex-wrap justify-center gap-6">
          <Link
            href="/coverage"
            className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            FULL COVERAGE →
          </Link>
          <Link
            href="/cities#state-CA"
            className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            ALL CA CITIES →
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
