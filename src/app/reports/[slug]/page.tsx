import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Flame, MapPin, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { and, desc, eq, notLike, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { EventBadge, Footer, Nav, StatePill } from "@/components/ui";
import { fmtDate } from "@/lib/fmt";
import { embargoCutoff, maskName } from "@/lib/queries";
import { isJunkEntity } from "@/lib/lead-score";
import { LIVE_MARKETS, MARKET_BY_SLUG } from "@/lib/states";
import { BRAND } from "@/lib/brand";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

function resolveMarket(slug: string) {
  const m = slug.match(/^([a-z-]+)-weekly-liquor-filings$/);
  if (!m) return null;
  return MARKET_BY_SLUG[m[1]] ?? null;
}

export function generateStaticParams() {
  return LIVE_MARKETS.map((m) => ({ slug: `${m.slug}-weekly-liquor-filings` }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cfg = resolveMarket(slug);
  if (!cfg) return { title: "Report not found" };
  return {
    title: `${cfg.name} weekly liquor filings report — new bar & restaurant pipeline`,
    description: `Weekly analysis of new liquor license filings in ${cfg.name} (${cfg.agency}). Top new venues, county activity, and license breakdowns from official records.`,
    alternates: { canonical: `/reports/${slug}` },
  };
}

export default async function WeeklyReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cfg = resolveMarket(slug);
  if (!cfg) notFound();

  let recentFilings: (typeof events.$inferSelect)[] = [];
  let counties: { label: string; n: number }[] = [];
  let types: { label: string; n: number }[] = [];
  let totalActive = 0;

  try {
    await ensureSchema();
    const [rawFilings, topCounties, typeMix, activeCount] = await Promise.all([
      db
        .select()
        .from(events)
        .where(and(eq(events.state, cfg.code), notLike(events.licenseKey, "TTB-%")))
        .orderBy(desc(events.occurredAt))
        .limit(30),
      db.execute(sql`
        SELECT county AS label, count(*)::int AS n
        FROM events
        WHERE state = ${cfg.code} AND county IS NOT NULL AND county <> ''
          AND occurred_at > now() - interval '30 days'
        GROUP BY county ORDER BY n DESC LIMIT 6
      `),
      db.execute(sql`
        SELECT type_name AS label, count(*)::int AS n
        FROM licenses
        WHERE state = ${cfg.code} AND type_name IS NOT NULL
        GROUP BY type_name ORDER BY n DESC LIMIT 6
      `),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(licenses)
        .where(eq(licenses.state, cfg.code)),
    ]);

    recentFilings = rawFilings
      .filter((e) => !isJunkEntity(e.tradeName, e.ownerName, e.typeName))
      .slice(0, 15);
    counties = topCounties.rows as unknown as { label: string; n: number }[];
    types = typeMix.rows as unknown as { label: string; n: number }[];
    totalActive = activeCount[0]?.n ?? 0;
  } catch {
    // render cleanly when DB initializing
  }

  const cut = embargoCutoff();
  const reportDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const base = siteUrl();

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: BRAND.name, item: `${base}/` },
      { "@type": "ListItem", position: 2, name: "Weekly Reports", item: `${base}/reports` },
      { "@type": "ListItem", position: 3, name: `${cfg.name} Pipeline Report`, item: `${base}/reports/${slug}` },
    ],
  };

  return (
    <main className="min-h-screen">
      <Nav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-28">
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke hover:text-cream"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> ALL 9 WEEKLY REPORTS
        </Link>

        <p className="eyebrow mt-8">
          [ Official Weekly Market Intelligence · {cfg.agency} · {reportDate} ]
        </p>
        <h1 className="font-display mt-4 text-4xl font-medium sm:text-5xl">
          {cfg.name} weekly liquor license
          <span className="italic text-amber"> pipeline report.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-smoke">
          Weekly analysis of newly filed alcohol permits across {cfg.name} ({cfg.scope}). Every
          entry represents a bar, restaurant, brewpub or liquor retailer navigating official state
          licensing — typically 60 to 90 days from pouring their first drink.
        </p>

        {/* Executive summary banner */}
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          <div className="bg-panel p-6">
            <span className="font-mono text-[10px] tracking-[0.2em] text-faint">
              FEATURED FILINGS
            </span>
            <p className="font-display mt-3 text-4xl font-bold text-cream">
              {recentFilings.length}
            </p>
            <p className="mt-1 font-mono text-[11px] text-smoke">in this weekly snapshot</p>
          </div>
          <div className="bg-panel p-6">
            <span className="font-mono text-[10px] tracking-[0.2em] text-faint">
              TOP HOTSPOT AREA
            </span>
            <p className="font-display mt-3 truncate text-3xl font-bold text-amber">
              {counties[0]?.label ?? cfg.scope}
            </p>
            <p className="mt-1 font-mono text-[11px] text-smoke">
              {counties[0]?.n ?? 0} recent filings
            </p>
          </div>
          <div className="bg-panel p-6">
            <span className="font-mono text-[10px] tracking-[0.2em] text-faint">
              RETAIL VENUES WATCHED
            </span>
            <p className="font-display mt-3 text-4xl font-bold text-leaf">
              {totalActive.toLocaleString()}
            </p>
            <p className="mt-1 font-mono text-[11px] text-smoke">monitored daily</p>
          </div>
        </div>

        {/* Top Filings */}
        <div className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-medium text-cream">
                Latest {cfg.name} filings
              </h2>
              <p className="mt-1 font-mono text-xs text-smoke">
                Full names, street addresses &amp; Google Maps routes unlock day-one for subscribers.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href={`/map?state=${cfg.code}`}
                className="font-mono text-xs text-amber hover:underline"
              >
                VIEW ON MAP →
              </Link>
              <Link
                href={`/feed?state=${cfg.code}`}
                className="hidden items-center gap-1 font-mono text-xs text-amber hover:underline sm:flex"
              >
                FULL FEED <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-line">
            {recentFilings.length === 0 && (
              <p className="px-6 py-10 font-mono text-xs text-smoke">
                Weekly rows populate automatically on the next daily registry sweep.
              </p>
            )}
            {recentFilings.map((e) => {
              const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
              const name = locked
                ? maskName(e.tradeName ?? e.ownerName ?? "Applicant")
                : (e.tradeName ?? e.ownerName ?? "Unnamed venue");

              return (
                <Link
                  key={e.id}
                  href={locked ? "/#pricing" : `/feed/${e.id}`}
                  className="group grid grid-cols-[80px_1fr_auto] items-center gap-3 border-b border-line/70 px-4 py-3.5 transition-colors last:border-0 hover:bg-panel sm:grid-cols-[100px_90px_1fr_auto]"
                >
                  <span className="font-mono text-xs text-faint">{fmtDate(e.occurredAt)}</span>
                  <span className="hidden sm:block">
                    <EventBadge type={e.eventType} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-sm font-medium ${
                        locked ? "locked-name text-smoke" : "text-cream group-hover:text-amber"
                      }`}
                    >
                      {name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-smoke">
                      {[e.city, e.typeName].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <StatePill state={e.state} />
                </Link>
              );
            })}
          </div>
        </div>

        {/* County Heat + License Mix */}
        <div className="mt-14 grid gap-8 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-6">
            <h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-faint">
              <Flame className="h-4 w-4 text-amber" /> Hottest Counties / Areas
            </h3>
            <ul className="mt-4 space-y-3 font-mono text-xs">
              {counties.length === 0 && (
                <li className="text-smoke">Area rankings populate after first sweep.</li>
              )}
              {counties.map((c, i) => (
                <li key={c.label} className="flex justify-between border-b border-line/60 pb-2">
                  <span className="text-cream">
                    {i + 1}. {c.label}
                  </span>
                  <span className="font-semibold text-amber">{c.n} filings</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-panel p-6">
            <h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-faint">
              <MapPin className="h-4 w-4 text-amber" /> Dominant License Categories
            </h3>
            <ul className="mt-4 space-y-3 font-mono text-xs">
              {types.length === 0 && (
                <li className="text-smoke">License mix populates after first sweep.</li>
              )}
              {types.map((t) => (
                <li key={t.label} className="flex justify-between border-b border-line/60 pb-2">
                  <span className="truncate pr-2 text-cream">{t.label}</span>
                  <span className="text-smoke">{t.n.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTA banner */}
        <div className="mt-14 rounded-2xl border border-amber/40 bg-gradient-to-b from-amber/15 via-panel to-panel p-8 text-center shadow-xl">
          <Sparkles className="mx-auto h-6 w-6 text-amber" />
          <h3 className="font-display mt-4 text-3xl font-medium text-cream">
            Never wait for a weekly summary.
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-smoke">
            Get every new {cfg.name} bar, restaurant &amp; liquor-store filing every morning — with
            street address, LLC entity, 1-click Google Maps route &amp; 19-column CRM CSV.
          </p>
          <Link
            href="/#pricing"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber px-7 py-3.5 font-mono text-xs font-semibold tracking-wider text-[#140b0e] transition-transform hover:scale-[1.03]"
          >
            START 7-DAY FREE TRIAL <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
