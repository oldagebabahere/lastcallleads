import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Database, FileText, Radio } from "lucide-react";
import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { Footer, LeadRow, Nav } from "@/components/ui";
import { embargoCutoff, maskName } from "@/lib/queries";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const STATE_META: Record<
  string,
  { code: string; name: string; teaser: string }
> = {
  texas: {
    code: "TX",
    name: "Texas",
    teaser:
      "Texas publishes every pending application and license change in official state records, refreshed daily. We sweep them every morning and decode the filings into plain English.",
  },
  "new-york": {
    code: "NY",
    name: "New York",
    teaser:
      "New York publishes pending applications and the full active registry in official state records. Our engine classifies every change — new filings, issuances and status flips — within a day.",
  },
  missouri: {
    code: "MO",
    name: "Missouri",
    teaser:
      "Missouri publishes the full liquor-license register in official state records. We track every newly issued license — bars, restaurants and package stores — and deliver new venues by morning.",
  },
  colorado: {
    code: "CO",
    name: "Colorado",
    teaser:
      "Colorado publishes recently approved liquor licenses in official state records. Our engine surfaces every new approval — the moment a venue is cleared to open.",
  },
  connecticut: {
    code: "CT",
    name: "Connecticut",
    teaser:
      "Connecticut publishes restaurant, café and tavern liquor licenses in official state records. We track new credentials and deliver them to subscribers each morning.",
  },
  washington: {
    code: "WA",
    name: "Washington",
    teaser:
      "Washington's Liquor and Cannabis Board publishes its licensed register in official state records — including business phone numbers. New venues land in your inbox the next morning.",
  },
  illinois: {
    code: "IL",
    name: "Illinois",
    teaser:
      "Chicago publishes its full liquor-license register — taverns, restaurants and package stores — with neighbourhood and ward detail. New and renewed licences arrive in your inbox daily.",
  },
  maryland: {
    code: "MD",
    name: "Maryland",
    teaser:
      "Montgomery County publishes its alcohol-beverage licensee register in official records. Every licensed venue, by type and address, tracked for subscribers.",
  },
  california: {
    code: "CA",
    name: "California",
    teaser:
      "California is the country's largest bar and restaurant market. We track alcohol-licence records — including full-bar, restaurant and package-store permits — and decode the ABC type codes into plain English.",
  },
  oregon: {
    code: "OR",
    name: "Oregon",
    teaser:
      "Oregon's OLCC publishes both its licensed register and, uniquely, licence applications as they are received — including 'In Review' and 'Payment Pending' statuses. That is the earliest public signal a venue is being built.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = STATE_META[slug];
  if (!s) return { title: "State not covered yet" };
  return {
    title: `New liquor license applications in ${s.name} — filings monitored daily`,
    description: `${s.name} liquor-license filings, tracked daily from official records. New bars, restaurants and liquor stores before they open — names, cities, license types.`,
  };
}

export default async function StatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = STATE_META[slug];
  if (!s) notFound();

  await ensureSchema();

  const [kindCounts, eventCount30, recent, topTypes] = await Promise.all([
    db
      .select({ kind: licenses.kind, n: sql<number>`count(*)::int` })
      .from(licenses)
      .where(eq(licenses.state, s.code))
      .groupBy(licenses.kind),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(
        sql`${events.state} = ${s.code} AND ${events.occurredAt} > now() - interval '30 days'`
      ),
    db
      .select()
      .from(events)
      .where(eq(events.state, s.code))
      .orderBy(desc(events.occurredAt))
      .limit(25),
    db
      .select({ typeName: licenses.typeName, n: sql<number>`count(*)::int` })
      .from(licenses)
      .where(
        sql`${licenses.state} = ${s.code} AND ${licenses.kind} = 'pending' AND ${licenses.typeName} IS NOT NULL`
      )
      .groupBy(licenses.typeName)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
  ]);

  const pending = kindCounts.find((k) => k.kind === "pending")?.n ?? 0;
  const active = kindCounts.find((k) => k.kind === "active")?.n ?? 0;
  const cut = embargoCutoff();

  const faq = [
    {
      q: `Where do new ${s.name} liquor license applications get published?`,
      a: "They come from the official state registry, updated regularly. Our system watches them around the clock and translates changes into alerts.",
    },
    {
      q: `How fast will I hear about a new ${s.name} filing?`,
      a: "Subscribers get a same-morning digest. The free public feed on this site reveals names after 7 days.",
    },
    {
      q: `Is this ${s.name} data official?`,
      a: "Yes — every record derives from official state filings. No scraped guesses, no estimates.",
    },
  ];

  return (
    <main className="min-h-screen">
      <Nav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />

      <div className="mx-auto max-w-6xl px-5 pt-28 pb-20">
        <p className="eyebrow">[ Coverage · {s.code} ]</p>
        <h1 className="font-display mt-5 max-w-3xl text-4xl font-medium leading-tight sm:text-6xl">
          New liquor-license applications in{" "}
          <span className="italic text-amber">{s.name}.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-smoke">{s.teaser}</p>

        {/* live stat strip */}
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          {[
            { icon: Radio, n: pending.toLocaleString(), l: "APPLICATIONS IN REVIEW RIGHT NOW" },
            { icon: Database, n: active.toLocaleString(), l: "ACTIVE LICENSES BEING WATCHED" },
            { icon: FileText, n: (eventCount30[0]?.n ?? 0).toLocaleString(), l: "FILINGS CAPTURED · LAST 30 DAYS" },
          ].map((x) => (
            <div key={x.l} className="bg-panel p-6">
              <x.icon className="h-4 w-4 text-amber" />
              <p className="font-display mt-4 text-3xl font-semibold text-cream">{x.n}</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-faint">{x.l}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_320px]">
          {/* filings */}
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] tracking-[0.28em] text-faint">
                LATEST {s.name.toUpperCase()} FILINGS
              </h2>
              <Link href={`/feed?state=${s.code}`} className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline">
                FULL FEED →
              </Link>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              {recent.map((e) => {
                const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
                const row = locked
                  ? { ...e, tradeName: maskName(e.tradeName ?? e.ownerName ?? "Applicant"), ownerName: null }
                  : e;
                return <LeadRow key={e.id} e={row} locked={locked} />;
              })}
              {recent.length === 0 && (
                <p className="px-6 py-10 font-mono text-xs text-smoke">
                  Sweep pending — check back after the next pull.
                </p>
              )}
            </div>
          </div>

          {/* side rail */}
          <aside className="space-y-6">
            <div className="rounded-xl border border-line bg-panel p-6">
              <h3 className="font-mono text-[10px] tracking-[0.25em] text-faint">
                WHAT IS BEING FILED RIGHT NOW
              </h3>
              <ul className="mt-4 space-y-3">
                {topTypes.map((t) => (
                  <li key={t.typeName} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-cream">{t.typeName}</span>
                    <span className="font-mono text-[11px] text-smoke">{t.n}</span>
                  </li>
                ))}
                {topTypes.length === 0 && (
                  <li className="text-sm text-smoke">Types populate after the first sweep.</li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-amber/40 bg-gradient-to-b from-amber/15 to-panel p-6">
              <h3 className="font-display text-xl font-medium">Sell into {s.name}?</h3>
              <p className="mt-2 text-sm leading-relaxed text-smoke">
                Get every new {s.name} filing in your inbox the morning it posts.
              </p>
              <Link href="/#pricing" className="mt-4 flex items-center justify-center gap-1.5 rounded-md bg-amber px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.02]">
                START $129/MO <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="rounded-xl border border-line bg-panel p-6">
              <h3 className="font-mono text-[10px] tracking-[0.25em] text-faint">TRACKED RECORDS</h3>
              <p className="mt-3 text-sm leading-relaxed text-smoke">
                Official state licensing records, refreshed daily. Every filing is preserved
                with its record identifier and detection time for auditability.
              </p>
            </div>
          </aside>
        </div>

        {/* faq */}
        <div className="mt-16 border-t border-line pt-10">
          <h2 className="font-display text-2xl font-medium">Questions about {s.name} data</h2>
          <div className="mt-4 divide-y divide-line">
            {faq.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-cream">
                  {f.q}
                  <span className="font-mono text-amber transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 pr-8 text-sm leading-relaxed text-smoke">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
