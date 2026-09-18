import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { Footer, Nav } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { GUIDES } from "../content";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) return { title: "Guide not found" };
  return { title: guide.title, description: guide.description };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    author: { "@type": "Organization", name: BRAND.name },
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="min-h-screen">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <article className="mx-auto max-w-3xl px-5 pt-28 pb-20">
        <Link href="/guides" className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke hover:text-cream">
          <ArrowLeft className="h-3.5 w-3.5" /> ALL GUIDES
        </Link>

        <p className="eyebrow mt-8">[ Guide · {guide.readMins} min read ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium leading-tight sm:text-5xl">
          {guide.title}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-smoke">{guide.description}</p>

        <div className="mt-12 space-y-12">
          {guide.sections.map((s, i) => (
            <section key={i}>
              <h2 className="font-display text-2xl font-medium text-cream sm:text-3xl">{s.h2}</h2>
              <div className="mt-4 space-y-4">
                {s.body.map((p, j) => (
                  <p key={j} className="text-base leading-[1.85] text-smoke">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-14 border-t border-line pt-10">
          <h2 className="font-display text-2xl font-medium text-cream">Questions people ask</h2>
          <div className="mt-6 divide-y divide-line">
            {guide.faq.map((f) => (
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

        <div className="mt-14 rounded-xl border border-amber/40 bg-gradient-to-b from-amber/15 to-panel p-8 text-center">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">
            Reading about filings is step one.
            <span className="italic text-amber"> Getting them daily is step two.</span>
          </h2>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link href="/#pricing" className="rounded-full bg-amber px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03]">
              GET MORNING ALERTS
            </Link>
            <Link href="/feed" className="rounded-full border border-line px-6 py-3 font-mono text-[11px] tracking-[0.12em] text-smoke hover:text-cream">
              BROWSE FREE FEED <ArrowRight className="ml-1 inline h-3 w-3" />
            </Link>
          </div>
        </div>
      </article>
      <Footer />
    </main>
  );
}
