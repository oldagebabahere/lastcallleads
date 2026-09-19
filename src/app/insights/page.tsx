import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import Reveal from "@/components/reveal";
import { Footer, Nav } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Liquor-market data desk — live stats from public registries",
  description:
    "Live liquor-license statistics for Texas and New York: what's being filed, where, and how fast — computed daily from official state records.",
};

const DESKS = [
  { slug: "texas", code: "TX", name: "Texas", note: "TABC filings · 78K+ active licenses under watch" },
  { slug: "new-york", code: "NY", name: "New York", note: "SLA filings · 60K+ active licenses under watch" },
];

export default async function InsightsIndex() {
  await ensureSchema();

  const stats = new Map<string, { pending: number; filings30: number }>();
  for (const d of DESKS) {
    try {
      const [pend, filings] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(licenses)
          .where(sql`${licenses.state} = ${d.code} AND ${licenses.kind} = 'pending'`),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(events)
          .where(
            sql`${events.state} = ${d.code} AND ${events.occurredAt} > now() - interval '30 days'`
          ),
      ]);
      stats.set(d.code, { pending: pend[0]?.n ?? 0, filings30: filings[0]?.n ?? 0 });
    } catch {
      stats.set(d.code, { pending: 0, filings30: 0 });
    }
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-4xl px-5 pt-28 pb-20">
        <p className="eyebrow">[ Data desk · refreshed daily ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
          The liquor market, <span className="italic text-amber">in live numbers.</span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-smoke">
          These desks are computed directly from official state registries — not surveys,
          not estimates. Every morning the data underneath updates, and so do these pages.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {DESKS.map((d, i) => {
            const s = stats.get(d.code) ?? { pending: 0, filings30: 0 };
            return (
              <Reveal key={d.slug} delay={i * 90}>
                <Link
                  href={`/insights/${d.slug}`}
                  className="group block h-full rounded-xl border border-line bg-panel p-7 transition-colors hover:border-amber/40"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber/30 bg-amber/10">
                    <FlaskConical className="h-4.5 w-4.5 text-amber" />
                  </span>
                  <h2 className="font-display mt-5 text-2xl font-medium text-cream transition-colors group-hover:text-amber">
                    {d.name} liquor filings desk
                  </h2>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed tracking-[0.1em] text-faint">
                    {d.note.toUpperCase()}
                  </p>
                  <div className="mt-6 flex gap-8 border-t border-line pt-5">
                    <div>
                      <p className="font-display text-2xl font-semibold text-cream">{s.pending.toLocaleString()}</p>
                      <p className="mt-0.5 font-mono text-[9px] tracking-[0.18em] text-faint">IN REVIEW NOW</p>
                    </div>
                    <div>
                      <p className="font-display text-2xl font-semibold text-cream">{s.filings30.toLocaleString()}</p>
                      <p className="mt-0.5 font-mono text-[9px] tracking-[0.18em] text-faint">FILED · 30 DAYS</p>
                    </div>
                  </div>
                  <p className="mt-5 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-amber">
                    OPEN THE DESK <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </p>
                </Link>
              </Reveal>
            );
          })}
        </div>

        <p className="mt-10 border-t border-line pt-6 font-mono text-[11px] leading-relaxed tracking-[0.08em] text-faint">
          METHODOLOGY: daily diffs of official state licensing records. New applications
          are detected the day they post. Counts on this page are computed at render
          time from the live database — no editorial smoothing applied.
        </p>
      </div>
      <Footer />
    </main>
  );
}
