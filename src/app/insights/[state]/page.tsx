// The "research desk" — table-heavy, number-dense pages that read like an
// analyst wrote them, because the machine actually did the analysis.
// These are the pages Google surfaces for long-tail stat queries.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { Footer, Nav } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const DESKS: Record<string, { code: string; name: string }> = {
  texas: { code: "TX", name: "Texas" },
  "new-york": { code: "NY", name: "New York" },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const d = DESKS[state];
  if (!d) return { title: "Data desk" };
  return {
    title: `${d.name} liquor-license statistics — live filings data desk`,
    description: `How many liquor licenses are pending in ${d.name}, what's being filed, which counties are heating up — computed daily from official state records.`,
  };
}

type Row = { label: string; n: number };

export default async function StateDeskPage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const d = DESKS[state];
  if (!d) notFound();

  await ensureSchema();

  const [kpi, byType, byCounty, byWeek, topCities] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT count(*) FROM licenses WHERE state = ${d.code} AND kind = 'pending')::int AS pending,
        (SELECT count(*) FROM licenses WHERE state = ${d.code} AND kind = 'active')::int AS active,
        (SELECT count(*) FROM events WHERE state = ${d.code} AND occurred_at > now() - interval '7 days')::int AS filings7,
        (SELECT count(*) FROM events WHERE state = ${d.code} AND occurred_at > now() - interval '30 days')::int AS filings30
    `),
    db.execute(sql`
      SELECT type_name AS label, count(*)::int AS n
      FROM licenses
      WHERE state = ${d.code} AND kind = 'pending' AND type_name IS NOT NULL
      GROUP BY type_name ORDER BY n DESC LIMIT 12
    `),
    db.execute(sql`
      SELECT county AS label, count(*)::int AS n
      FROM events
      WHERE state = ${d.code} AND county IS NOT NULL AND county <> ''
        AND occurred_at > now() - interval '90 days'
      GROUP BY county ORDER BY n DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT date_trunc('week', occurred_at) AS wk, count(*)::int AS n
      FROM events
      WHERE state = ${d.code} AND occurred_at > now() - interval '8 weeks'
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT city AS label, count(*)::int AS n
      FROM events
      WHERE state = ${d.code} AND city IS NOT NULL AND city <> ''
      GROUP BY city ORDER BY n DESC LIMIT 8
    `),
  ]);

  const k = (kpi.rows[0] ?? {}) as { pending?: number; active?: number; filings7?: number; filings30?: number };
  const typeRows = byType.rows as unknown as Row[];
  const countyRows = byCounty.rows as unknown as Row[];
  const weekRows = (byWeek.rows as unknown as { wk: string | Date; n: number }[]).map((r) => ({
    label: new Date(r.wk).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    n: r.n,
  }));
  const cityRows = topCities.rows as unknown as Row[];

  const deskLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${d.name} liquor-license filings — live statistics`,
    description: `Daily-refreshed statistics derived from official state licensing records: pending applications, license types, counties and weekly filing pace.`,
    creator: { "@type": "Organization", name: BRAND.name },
    license: "https://creativecommons.org/licenses/by/4.0/",
    temporalCoverage: `${new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)}/..`,
  };

  return (
    <main className="min-h-screen">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(deskLd) }} />

      <div className="mx-auto max-w-5xl px-5 pt-28 pb-20">
        <p className="eyebrow">[ Data desk · {d.code} · auto-refreshed daily ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium leading-tight sm:text-5xl">
          {d.name} liquor-license
          <span className="italic text-amber"> statistics, live.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          Computed straight from official state licensing records. These numbers change
          every morning as new filings post — the tables below are rendered from the
          live database at the moment you loaded this page.
        </p>

        {/* KPI strip */}
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            [`${(k.pending ?? 0).toLocaleString()}`, "APPLICATIONS IN REVIEW NOW"],
            [`${(k.active ?? 0).toLocaleString()}`, "ACTIVE LICENSES TRACKED"],
            [`${(k.filings7 ?? 0).toLocaleString()}`, "NEW FILINGS · LAST 7 DAYS"],
            [`${(k.filings30 ?? 0).toLocaleString()}`, "NEW FILINGS · LAST 30 DAYS"],
          ].map(([v, l]) => (
            <div key={l} className="bg-panel p-5">
              <p className="font-display text-3xl font-semibold text-cream">{v}</p>
              <p className="mt-1 font-mono text-[9px] leading-snug tracking-[0.15em] text-faint">{l}</p>
            </div>
          ))}
        </div>

        <DataTable
          title={`WHAT'S BEING FILED IN ${d.name.toUpperCase()}`}
          note="Pending applications by license type — the mix tells you what kinds of venues are in the pipeline."
          rows={typeRows}
          shareOf={typeRows.reduce((a, r) => a + r.n, 0)}
          emptyNote="Type breakdown populates after the first sweep."
        />

        <div className="grid gap-8 lg:grid-cols-2">
          <DataTable
            title="HOTTEST COUNTIES · LAST 90 DAYS"
            note="Where new filings are concentrating — follow the paperwork, find the next hot district."
            rows={countyRows}
            emptyNote="County heat builds up as sweeps accumulate."
          />
          <DataTable
            title="FILING PACE · WEEK BY WEEK"
            note="Weekly filing volume. A rising line means a market expanding; a falling one opens a gap for buyers."
            rows={weekRows}
            emptyNote="Weekly pace appears after a few sweeps."
          />
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_280px]">
          <DataTable
            title="TOP CITIES BY ACTIVITY"
            note="Click through to the full live filing list for each city."
            rows={cityRows}
            linkPrefix={`/cities/`}
            linkState={d.code}
            emptyNote="City tables fill with the first sweeps."
          />
          <aside className="space-y-5">
            <div className="rounded-xl border border-amber/40 bg-gradient-to-b from-amber/15 to-panel p-6">
              <h3 className="font-display text-xl font-medium">Want these numbers by name?</h3>
              <p className="mt-2 text-sm leading-relaxed text-smoke">
                The desk shows counts. Subscribers get the actual filings — names,
                addresses, dates — every morning for their territories.
              </p>
              <Link href="/#pricing" className="mt-4 flex items-center justify-center gap-1.5 rounded-md bg-amber px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink">
                GET THE NAMES <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="rounded-xl border border-line bg-panel p-6">
              <h3 className="font-mono text-[10px] tracking-[0.25em] text-faint">METHODOLOGY</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-smoke">
                Derived from official state licensing records via daily diffs;
                deduplicated by record identifier; pending and active tracked separately.
                See the{" "}
                <Link href={`/states/${state}`} className="text-amber hover:underline">
                  {d.name} coverage page
                </Link>{" "}
                for the filing-by-filing feed.
              </p>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </main>
  );
}

function DataTable({
  title,
  note,
  rows,
  shareOf,
  linkPrefix,
  linkState,
  emptyNote,
}: {
  title: string;
  note: string;
  rows: Row[];
  shareOf?: number;
  linkPrefix?: string;
  linkState?: string;
  emptyNote: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="mt-12">
      <h2 className="font-mono text-[11px] tracking-[0.28em] text-faint">{title}</h2>
      <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-smoke">{note}</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        {rows.length === 0 && <p className="px-5 py-8 font-mono text-xs text-smoke">{emptyNote}</p>}
        {rows.map((r, i) => {
          const inner = (
            <>
              <span className="flex items-center gap-3 truncate">
                <span className="w-5 text-right font-mono text-[10px] text-faint">{i + 1}</span>
                <span className="truncate text-sm text-cream">{r.label ?? "Unknown"}</span>
              </span>
              <span className="mx-4 hidden h-1.5 overflow-hidden rounded-full bg-panel2 sm:block">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-ember to-amber"
                  style={{ width: `${Math.max(4, Math.round((r.n / max) * 100))}%` }}
                />
              </span>
              <span className="text-right font-mono text-xs text-cream">{r.n.toLocaleString()}</span>
              <span className="w-14 text-right font-mono text-[10px] text-faint">
                {shareOf ? `${((r.n / shareOf) * 100).toFixed(1)}%` : ""}
              </span>
            </>
          );
          const slug = linkPrefix
            ? `${linkPrefix}${(r.label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}${linkState ? `-${linkState.toLowerCase()}` : ""}`
            : null;
          return slug ? (
            <Link key={i} href={slug} className="grid grid-cols-[1fr_auto_56px] items-center gap-2 border-b border-line/60 px-5 py-3 transition-colors last:border-0 hover:bg-panel sm:grid-cols-[1fr_180px_auto_56px]">
              {inner}
            </Link>
          ) : (
            <div key={i} className="grid grid-cols-[1fr_auto_56px] items-center gap-2 border-b border-line/60 px-5 py-3 last:border-0 sm:grid-cols-[1fr_180px_auto_56px]">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
