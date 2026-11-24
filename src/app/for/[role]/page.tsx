import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, MapPin, Sparkles } from "lucide-react";
import { BUYER_VERTICALS, VERTICAL_BY_SLUG } from "@/lib/verticals";
import { LIVE_MARKETS } from "@/lib/states";
import { BRAND } from "@/lib/brand";
import { siteUrl } from "@/lib/site";
import { getSiteStats } from "@/lib/queries";
import { Footer, Nav } from "@/components/ui";
import SubscribeForm from "@/components/subscribe-form";
import Reveal from "@/components/reveal";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return BUYER_VERTICALS.map((v) => ({ role: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>;
}): Promise<Metadata> {
  const { role } = await params;
  const v = VERTICAL_BY_SLUG[role];
  if (!v) return { title: "Industry Solutions" };
  return {
    title: v.title,
    description: v.metaDescription,
    alternates: { canonical: `/for/${v.slug}` },
  };
}

export default async function VerticalPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const v = VERTICAL_BY_SLUG[role];
  if (!v) notFound();

  const stats = await getSiteStats();
  const base = siteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND.name, item: `${base}/` },
          { "@type": "ListItem", position: 2, name: v.title, item: `${base}/for/${v.slug}` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: v.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <main className="min-h-screen">
      <Nav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-5xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ {v.badge} · {LIVE_MARKETS.length} LIVE MARKETS ]</p>
        <Reveal>
          <h1 className="font-display mt-5 max-w-3xl text-4xl font-medium leading-tight sm:text-6xl">
            {v.headline}{" "}
            <span className="italic text-amber">{v.headlineAccent}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-smoke">{v.intro}</p>
        </Reveal>

        {/* ROI Highlight Strip */}
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          <div className="bg-panel p-6">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">TYPICAL ACCOUNT VALUE</p>
            <p className="font-display mt-2 text-xl font-medium text-cream">{v.avgAccountValue}</p>
          </div>
          <div className="bg-panel p-6">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">LIVE COVERAGE</p>
            <p className="font-display mt-2 text-xl font-medium text-cream">
              {LIVE_MARKETS.length} Verified US Markets
            </p>
            <p className="mt-1 font-mono text-[10px] text-faint">
              {stats.watching > 0 ? `${stats.watching.toLocaleString()} retail venues watched` : "Refreshed daily"}
            </p>
          </div>
          <div className="bg-panel p-6">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">PAYBACK MATH</p>
            <p className="mt-2 text-sm leading-relaxed text-cream/90">{v.paybackNote}</p>
          </div>
        </div>

        {/* High-Intent Signals */}
        <section className="mt-12">
          <h2 className="font-mono text-[11px] tracking-[0.26em] text-faint">
            FILING SIGNALS BUILT FOR YOUR TEAM
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {v.targetSignals.map((s) => (
              <div key={s.code} className="rounded-xl border border-line bg-panel p-6">
                <p className="font-mono text-xs font-semibold tracking-[0.12em] text-amber">
                  {s.code}
                </p>
                <p className="mt-2.5 text-sm leading-relaxed text-smoke">{s.why}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Everything Included */}
        <section className="mt-12 rounded-xl border border-line bg-panel p-7 sm:p-8">
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-amber">
            <Sparkles className="h-3.5 w-3.5" /> EVERY MORNING DOSSIER INCLUDES
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {v.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm leading-relaxed text-cream/90">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sample"
              className="inline-flex items-center gap-1.5 rounded-md border border-amber/50 bg-amber/10 px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-amber hover:bg-amber hover:text-[#140b0e]"
            >
              INSPECT SAMPLE DOSSIER <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/map"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ink px-4 py-2 font-mono text-[11px] tracking-[0.12em] text-smoke hover:text-cream"
            >
              <MapPin className="h-3.5 w-3.5 text-amber" /> OPEN INTERACTIVE TERRITORY MAP
            </Link>
          </div>
        </section>

        {/* Direct 7-Day Free Trial Box */}
        <section className="mt-12 rounded-2xl border border-amber/40 bg-wine-card p-7 sm:p-9">
          <h2 className="font-display text-2xl font-medium text-cream sm:text-3xl">
            Start your 7-day free trial — no card required.
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-smoke">
            Pick your market below. Your first morning dossier + 19-column CRM CSV + Google Maps
            route links land at the next daily sweep.
          </p>
          <div className="mt-6 max-w-md">
            <SubscribeForm plan="solo" />
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-12 border-t border-line pt-10">
          <h2 className="font-display text-2xl font-medium text-cream">Common questions</h2>
          <div className="mt-4 divide-y divide-line">
            {v.faq.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-cream">
                  {f.q}
                  <span className="font-mono text-amber transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 pr-8 text-sm leading-relaxed text-smoke">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Cross-links to other verticals & live markets (SEO internal link graph) */}
        <section className="mt-12 border-t border-line pt-8">
          <p className="font-mono text-[10px] tracking-[0.22em] text-faint">EXPLORE LIVE MARKETS</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {LIVE_MARKETS.map((m) => (
              <Link
                key={m.code}
                href={`/states/${m.slug}`}
                className="rounded-full border border-line bg-panel px-3.5 py-1.5 font-mono text-[11px] text-smoke hover:border-amber/50 hover:text-amber"
              >
                {m.name} ({m.code})
              </Link>
            ))}
          </div>
          <p className="mt-6 font-mono text-[10px] tracking-[0.22em] text-faint">OTHER SOLUTIONS</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BUYER_VERTICALS.filter((x) => x.slug !== v.slug).map((x) => (
              <Link
                key={x.slug}
                href={`/for/${x.slug}`}
                className="rounded-full border border-line bg-panel px-3.5 py-1.5 font-mono text-[11px] text-smoke hover:border-amber/50 hover:text-amber"
              >
                {x.badge.replace(/^FOR /, "")}
              </Link>
            ))}
          </div>
        </section>
      </div>
      <Footer />
    </main>
  );
}
