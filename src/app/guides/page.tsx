import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Reveal from "@/components/reveal";
import { Footer, Nav } from "@/components/ui";
import { GUIDES } from "./content";

export const metadata: Metadata = {
  title: "Guides — liquor-license intelligence, in plain English",
  description:
    "How to find new bars before competitors, Texas TABC timelines, New York SLA applications — practical guides for anyone selling to hospitality.",
};

export default function GuidesIndex() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-4xl px-5 pt-28 pb-20">
        <p className="eyebrow">[ Library · learn the game ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
          Guides that turn filing intel
          <span className="italic text-amber"> into accounts.</span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-smoke">
          No fluff, no jargon. The exact mechanics of license filings, and how
          salespeople use them to arrive first.
        </p>

        <div className="mt-12 space-y-4">
          {GUIDES.map((g, i) => (
            <Reveal key={g.slug} delay={i * 80}>
              <Link
                href={`/guides/${g.slug}`}
                className="group flex items-start gap-5 rounded-xl border border-line bg-panel p-6 transition-colors hover:border-amber/40 sm:p-7"
              >
                <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber/30 bg-amber/10">
                  <BookOpen className="h-4.5 w-4.5 text-amber" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-medium leading-snug text-cream transition-colors group-hover:text-amber sm:text-2xl">
                    {g.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-smoke">
                    {g.description}
                  </p>
                  <p className="mt-3 font-mono text-[10px] tracking-[0.2em] text-faint">
                    {g.readMins} MIN READ
                  </p>
                </div>
                <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-1 group-hover:text-amber" />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
}
