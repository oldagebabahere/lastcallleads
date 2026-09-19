// Programmatic SEO engine: one template → a page for every city in the
// database. /cities/austin-tx, /cities/brooklyn-ny … created automatically,
// refreshed by the daily sweep, indexed by Google.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import Reveal from "@/components/reveal";
import { EventBadge, Footer, Nav, StatePill } from "@/components/ui";
import { citySlug, embargoCutoff, maskName, timeAgo } from "@/lib/queries";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  NY: "New York",
  CA: "California",
  IL: "Illinois",
  WA: "Washington",
  OR: "Oregon",
  MO: "Missouri",
  CO: "Colorado",
  CT: "Connecticut",
  MD: "Maryland",
};

function parseSlug(slug: string): { city: string; state: string } | null {
  const m = slug.match(/^(.+)-([a-z]{2})$/i);
  if (!m) return null;
  const state = m[2].toUpperCase();
  if (!STATE_NAMES[state]) return null;
  return { city: m[1].replace(/-/g, " "), state };
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

async function loadCity(city: string, state: string) {
  await ensureSchema();
  const fromEvents = await db
    .select()
    .from(events)
    .where(
      sql`lower(${events.city}) = ${city.toLowerCase()} AND ${events.state} = ${state}`
    )
    .orderBy(desc(events.occurredAt))
    .limit(60);

  if (fromEvents.length > 0) return { rows: fromEvents, fromRegister: false };

  // Register-only states (e.g. a licensing register with no pending feed yet)
  // still deserve a useful city page — fall back to the license register.
  const register = await db
    .select()
    .from(licenses)
    .where(
      sql`lower(${licenses.city}) = ${city.toLowerCase()} AND ${licenses.state} = ${state}`
    )
    .orderBy(desc(licenses.issuedAt))
    .limit(60);

  return {
    rows: register.map((l) => ({
      id: l.id,
      state: l.state,
      licenseKey: l.licenseKey,
      eventType: "NEW_LICENSE" as const,
      tradeName: l.tradeName,
      ownerName: l.ownerName,
      city: l.city,
      county: l.county,
      typeName: l.typeName,
      occurredAt: l.issuedAt ?? l.filedAt,
      detectedAt: l.lastSeenAt,
      summary: `${l.tradeName ?? l.ownerName ?? "Licensed venue"} · ${l.city ?? state}`,
      payload: null,
    })),
    fromRegister: true,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return { title: "City" };
  const city = titleCase(parsed.city);
  return {
    title: `New liquor filings in ${city}, ${parsed.state} — bars opening soon`,
    description: `Every new liquor-license application filed in ${city}, ${STATE_NAMES[parsed.state]} — tracked daily from official state records. See which bars and restaurants are opening before they open.`,
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) notFound();
  const city = titleCase(parsed.city);
  const { state } = parsed;

  const loaded = await loadCity(parsed.city, state);
  const rows = loaded.rows;
  const fromRegister = loaded.fromRegister;
  if (rows.length === 0) notFound(); // thin pages stay out of Google

  const cut = embargoCutoff();
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const filed30 = rows.filter(
    (r) => r.eventType === "NEW_PENDING" && (r.occurredAt?.getTime() ?? 0) > thirtyDaysAgo
  ).length;
  const issued30 = rows.filter(
    (r) => r.eventType === "NEW_LICENSE" && (r.occurredAt?.getTime() ?? 0) > thirtyDaysAgo
  ).length;

  // nearby cities for cross-linking (internal links = SEO glue).
  // Prefer the register table so register-only states still get peers.
  let peers = await db
    .select({ city: events.city, n: sql<number>`count(*)::int` })
    .from(events)
    .where(
      sql`${events.state} = ${state} AND lower(${events.city}) <> ${parsed.city.toLowerCase()} AND ${events.city} IS NOT NULL AND ${events.city} <> ''`
    )
    .groupBy(events.city)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  if (peers.length === 0) {
    peers = await db
      .select({ city: licenses.city, n: sql<number>`count(*)::int` })
      .from(licenses)
      .where(
        sql`${licenses.state} = ${state} AND lower(${licenses.city}) <> ${parsed.city.toLowerCase()} AND ${licenses.city} IS NOT NULL AND ${licenses.city} <> ''`
      )
      .groupBy(licenses.city)
      .orderBy(desc(sql`count(*)`))
      .limit(8);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `New liquor filings in ${city}, ${state}`,
    itemListElement: rows.slice(0, 10).map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.summary,
      url: `${BRAND.url}/feed/${e.id}`,
    })),
  };

  return (
    <main className="min-h-screen">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-5xl px-5 pt-28 pb-20">
        <p className="eyebrow flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" /> [ Territory · {state} ]
        </p>
        <Reveal>
          <h1 className="font-display mt-5 text-4xl font-medium leading-tight sm:text-6xl">
            New bars &amp; liquor filings in{" "}
            <span className="italic text-amber">{city}, {state}.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-smoke">
            Every venue below filed public paperwork with the {STATE_NAMES[state]} liquor
            authority. Applications mean a bar, restaurant or store is being built right
            now — usually 60–90 days from opening.
          </p>
        </Reveal>

        <div className="mt-8 flex flex-wrap gap-3">
          <span className="rounded-full border border-amber/40 bg-amber/10 px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-amber">
            {filed30} FILED · LAST 30 DAYS
          </span>
          <span className="rounded-full border border-line bg-panel px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-smoke">
            {issued30} LICENSED · LAST 30 DAYS
          </span>
          <span className="rounded-full border border-line bg-panel px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-smoke">
            {rows.length} TOTAL TRACKED
          </span>
        </div>

        <div className="mt-10 overflow-hidden rounded-xl border border-line">
          {rows.map((e) => {
            const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
            const name = locked
              ? maskName(e.tradeName ?? e.ownerName ?? "Applicant")
              : e.tradeName ?? e.ownerName ?? "Unnamed applicant";
            return (
              <Link
                key={e.id}
                href={locked ? "/#pricing" : `/feed/${e.id}`}
                className="group grid grid-cols-[70px_1fr_auto] items-center gap-3 border-b border-line/70 px-4 py-3.5 transition-colors last:border-0 hover:bg-panel"
              >
                <span className="font-mono text-[11px] text-faint">{timeAgo(e.occurredAt)}</span>
                <span className="min-w-0">
                  <span className={`block truncate text-sm text-cream group-hover:text-amber ${locked ? "locked-name" : ""}`}>
                    {name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-smoke">
                    <EventBadge type={e.eventType} />
                    {e.typeName && <span className="truncate">· {e.typeName}</span>}
                  </span>
                </span>
                <StatePill state={e.state} />
              </Link>
            );
          })}
        </div>
        <p className="mt-4 text-center font-mono text-[10px] tracking-[0.18em] text-faint">
          NAMES FROM THE LAST 7 DAYS ARE MEMBER-ONLY · {STATE_NAMES[state].toUpperCase()} OFFICIAL RECORDS
        </p>

        {peers.length > 0 && (
          <div className="mt-12">
            <h2 className="font-mono text-[11px] tracking-[0.28em] text-faint">
              MORE {STATE_NAMES[state].toUpperCase()} TERRITORIES
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {peers.map((p) =>
                p.city ? (
                  <Link
                    key={p.city}
                    href={`/cities/${citySlug(p.city, state)}`}
                    className="rounded-full border border-line px-4 py-2 font-mono text-[11px] text-smoke transition-colors hover:border-amber/50 hover:text-amber"
                  >
                    {p.city} ({p.n})
                  </Link>
                ) : null
              )}
              <Link
                href={`/states/${STATE_NAMES[state].toLowerCase().replace(/ /g, "-")}`}
                className="rounded-full border border-amber/40 bg-amber/10 px-4 py-2 font-mono text-[11px] text-amber"
              >
                ALL {state} →
              </Link>
            </div>
          </div>
        )}

        <div className="mt-12 rounded-xl border border-amber/40 bg-gradient-to-b from-amber/15 to-panel p-8 text-center">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">
            {city} filings, in your inbox,
            <span className="italic text-amber"> before anyone else&apos;s.</span>
          </h2>
          <Link
            href="/#pricing"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03]"
          >
            GET MORNING ALERTS <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
