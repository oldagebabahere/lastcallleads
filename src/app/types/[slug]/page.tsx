import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Radio } from "lucide-react";
import type { Metadata } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { Footer, LeadRow, Nav, StatePill } from "@/components/ui";
import { fmtDate } from "@/lib/fmt";
import { TYPE_LIBRARY } from "@/lib/license-types";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return TYPE_LIBRARY.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = TYPE_LIBRARY.find((x) => x.slug === slug);
  if (!t) return { title: "License type" };
  return {
    title: `${t.name} (${t.code}) in Texas — what it means, who needs it`,
    description: `${t.oneLiner} Live count of pending ${t.code} applications in Texas right now, plus the latest filings.`,
  };
}

export default async function TypePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = TYPE_LIBRARY.find((x) => x.slug === slug);
  if (!t) notFound();

  await ensureSchema();
  let pending = 0;
  let active = 0;
  let recent: (typeof events.$inferSelect)[] = [];
  try {
    const [counts, rows] = await Promise.all([
      db
        .select({ kind: licenses.kind, n: sql<number>`count(*)::int` })
        .from(licenses)
        .where(
          and(eq(licenses.state, "TX"), eq(licenses.licenseType, t.code))
        )
        .groupBy(licenses.kind),
      db
        .select()
        .from(events)
        .where(and(eq(events.state, "TX"), eq(events.typeName, t.name)))
        .orderBy(desc(events.occurredAt))
        .limit(8),
    ]);
    pending = counts.find((c) => c.kind === "pending")?.n ?? 0;
    active = counts.find((c) => c.kind === "active")?.n ?? 0;
    recent = rows;
  } catch {
    // live numbers are a garnish; the explainer always renders
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="min-h-screen">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-4xl px-5 pt-28 pb-20">
        <Link href="/types" className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke hover:text-cream">
          <ArrowLeft className="h-3.5 w-3.5" /> ALL LICENSE TYPES
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-amber/40 bg-amber/10 px-3 py-1.5 font-mono text-sm font-semibold tracking-[0.15em] text-amber">
            {t.code}
          </span>
          <StatePill state={t.state} />
          <span className="font-mono text-[11px] tracking-[0.15em] text-faint">TEXAS LICENSE CODES</span>
        </div>

        <h1 className="font-display mt-5 text-4xl font-medium leading-tight sm:text-5xl">
          {t.name}: <span className="italic text-amber">what it means</span> and who needs it
        </h1>

        {/* live strip */}
        <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          {[
            [pending.toLocaleString(), "PENDING APPLICATIONS RIGHT NOW"],
            [active.toLocaleString(), "ACTIVE LICENSES IN TEXAS"],
            [`${t.code}`, "REGISTRY CODE"],
          ].map(([v, l]) => (
            <div key={l} className="flex items-center gap-3 bg-panel p-5">
              <Radio className="h-4 w-4 shrink-0 text-amber" />
              <div>
                <p className="font-display text-2xl font-semibold text-cream">{v}</p>
                <p className="font-mono text-[9px] tracking-[0.15em] text-faint">{l}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 space-y-5">
          {t.body.map((p, i) => (
            <p key={i} className="text-base leading-[1.85] text-smoke">{p}</p>
          ))}
        </div>

        {/* live filings of this type */}
        <div className="mt-12">
          <h2 className="font-mono text-[11px] tracking-[0.28em] text-faint">
            LATEST {t.code} FILINGS · TEXAS
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            {recent.length === 0 && (
              <p className="px-6 py-8 font-mono text-xs leading-relaxed text-smoke">
                No recent {t.code} filings in the feed yet — the machine sweeps every
                morning, and counts fill in as filings land.
              </p>
            )}
            {recent.map((e) => (
              <LeadRow key={e.id} e={e} locked={false} />
            ))}
          </div>
          <Link
            href={`/feed?state=TX`}
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            OPEN THE FULL TEXAS FEED <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-12 rounded-xl border border-amber/40 bg-gradient-to-b from-amber/15 to-panel p-7">
          <p className="font-display text-xl font-medium">
            When a new {t.code} lands in your territory,
            <span className="italic text-amber"> you will know the same morning.</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-smoke">
            Subscribers get every new filing — this type and all the others — in their
            inbox before the venue has picked a single supplier.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link href="/#pricing" className="rounded-full bg-amber px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03]">
              GET THE ALERTS
            </Link>
            <Link href="/states/texas" className="rounded-full border border-line px-6 py-3 font-mono text-[11px] tracking-[0.12em] text-smoke hover:text-cream">
              TEXAS COVERAGE →
            </Link>
          </div>
        </div>

        <div className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-2xl font-medium">Questions</h2>
          <div className="mt-4 divide-y divide-line">
            {t.faq.map((f) => (
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
