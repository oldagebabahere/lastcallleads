import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, Flame, MapPin, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { EventBadge, Footer, Nav, StatePill, fmtDate } from "@/components/ui";
import { embargoCutoff, maskName } from "@/lib/queries";
import { BRAND } from "@/lib/brand";

export const revalidate = 1800;

const REPORT_CONFIG: Record<
  string,
  { state: "TX" | "NY"; stateName: string }
> = {
  "texas-weekly-liquor-filings": { state: "TX", stateName: "Texas" },
  "new-york-weekly-liquor-filings": { state: "NY", stateName: "New York" },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cfg = REPORT_CONFIG[slug];
  if (!cfg) return { title: "Report not found" };
  return {
    title: `${cfg.stateName} weekly liquor filings report — new bar & restaurant pipeline`,
    description: `Weekly analysis of new liquor license filings in ${cfg.stateName}. Top new venues, county activity, and license breakdowns from official records.`,
  };
}

export default async function WeeklyReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cfg = REPORT_CONFIG[slug];
  if (!cfg) notFound();

  await ensureSchema();

  const [recentFilings, topCounties, typeMix, totalActive] = await Promise.all([
    db
      .select()
      .from(events)
      .where(and(eq(events.state, cfg.state), eq(events.eventType, "NEW_PENDING")))
      .orderBy(desc(events.occurredAt))
      .limit(15),
    db.execute(sql`
      SELECT county AS label, count(*)::int AS n
      FROM events
      WHERE state = ${cfg.state} AND county IS NOT NULL AND county <> ''
        AND occurred_at > now() - interval '30 days'
      GROUP BY county ORDER BY n DESC LIMIT 6
    `),
    db.execute(sql`
      SELECT type_name AS label, count(*)::int AS n
      FROM licenses
      WHERE state = ${cfg.state} AND kind = 'pending' AND type_name IS NOT NULL
      GROUP BY type_name ORDER BY n DESC LIMIT 6
    `),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(licenses)
      .where(eq(licenses.state, cfg.state)),
  ]);

  const cut = embargoCutoff();
  const counties = topCounties.rows as unknown as { label: string; n: number }[];
  const types = typeMix.rows as unknown as { label: string; n: number }[];

  const reportDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-5xl px-5 pt-28 pb-20">
        <Link href="/reports" className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke hover:text-cream">
          <ArrowLeft className="h-3.5 w-3.5" /> ALL WEEKLY REPORTS
        </Link>

        <p className="eyebrow mt-8">[ Official Weekly Market Intelligence · Week of {reportDate} ]</p>
        <h1 className="font-display mt-4 text-4xl font-medium sm:text-5xl">
          {cfg.stateName} weekly liquor license
          <span className="italic text-amber"> pipeline report.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-smoke">
          Weekly analysis of newly filed alcohol permits across {cfg.stateName}. Every entry
          represents a new bar, restaurant or retailer currently navigating state review
          — typically 60 to 90 days away from pouring their first drink.
        </p>

        {/* Executive summary banner */}
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          <div className="bg-panel p-6">
            <span className="font-mono text-[10px] tracking-[0.2em] text-faint">NEW APPLICATIONS (SAMPLE)</span>
            <p className="font-display mt-3 text-4xl font-bold text-cream">{recentFilings.length}</p>
            <p className="mt-1 font-mono text-[11px] text-smoke">in this weekly snapshot</p>
          </div>
          <div className="bg-panel p-6">
            <span className="font-mono text-[10px] tracking-[0.2em] text-faint">TOP HOTSPOT COUNTY</span>
            <p className="font-display mt-3 text-3xl font-bold text-amber truncate">
              {counties[0]?.label ?? "Statewide"}
            </p>
            <p className="mt-1 font-mono text-[11px] text-smoke">{counties[0]?.n ?? 0} recent filings</p>
          </div>
          <div className="bg-panel p-6">
            <span className="font-mono text-[10px] tracking-[0.2em] text-faint">ACTIVE REGISTRY UNDER WATCH</span>
            <p className="font-display mt-3 text-4xl font-bold text-leaf">
              {(totalActive[0]?.n ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 font-mono text-[11px] text-smoke">monitored continuously</p>
          </div>
        </div>

        {/* Top Filings of the Week */}
        <div className="mt-14">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-medium text-cream">
                Featured filings this week
              </h2>
              <p className="mt-1 font-mono text-xs text-smoke">
                New venues entering planning review — same-day names unlocked for members.
              </p>
            </div>
            <Link
              href={`/feed?state=${cfg.state}`}
              className="hidden font-mono text-xs text-amber sm:flex items-center gap-1 hover:underline"
            >
              FULL FEED <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-line">
            {recentFilings.map((e) => {
              const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
              const name = locked
                ? maskName(e.tradeName ?? e.ownerName ?? "Applicant")
                : e.tradeName ?? e.ownerName ?? "Unnamed venue";

              return (
                <Link
                  key={e.id}
                  href={locked ? "/#pricing" : `/feed/${e.id}`}
                  className="group grid grid-cols-[80px_1fr_auto] items-center gap-3 border-b border-line/70 px-4 py-3.5 transition-colors last:border-0 hover:bg-panel sm:grid-cols-[100px_90px_1fr_auto]"
                >
                  <span className="font-mono text-xs text-faint">{fmtDate(e.occurredAt)}</span>
                  <span className="hidden sm:block"><EventBadge type={e.eventType} /></span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-medium ${locked ? "locked-name text-smoke" : "text-cream group-hover:text-amber"}`}>
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
            <h3 className="font-mono text-xs tracking-[0.2em] text-faint uppercase flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber" /> Hottest Counties by Activity
            </h3>
            <ul className="mt-4 space-y-3 font-mono text-xs">
              {counties.map((c, i) => (
                <li key={c.label} className="flex justify-between border-b border-line/60 pb-2">
                  <span className="text-cream">{i + 1}. {c.label} County</span>
                  <span className="text-amber font-semibold">{c.n} filings</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-panel p-6">
            <h3 className="font-mono text-xs tracking-[0.2em] text-faint uppercase flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber" /> Dominant License Categories
            </h3>
            <ul className="mt-4 space-y-3 font-mono text-xs">
              {types.map((t) => (
                <li key={t.label} className="flex justify-between border-b border-line/60 pb-2">
                  <span className="text-cream truncate pr-2">{t.label}</span>
                  <span className="text-smoke">{t.n} pending</span>
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
            Get every new {cfg.stateName} bar and restaurant application in your inbox the morning it files with the state.
          </p>
          <Link
            href="/#pricing"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber px-7 py-3.5 font-mono text-xs font-semibold tracking-wider text-ink transition-transform hover:scale-[1.03]"
          >
            START DAILY ALERTS <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
