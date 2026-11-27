import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import type { Metadata } from "next";
import { ensureSchema } from "@/db/bootstrap";
import { getGenuineNewFilingsByState } from "@/lib/real-stats";
import { LIVE_MARKETS } from "@/lib/states";
import Reveal from "@/components/reveal";
import { Footer, Nav } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weekly liquor market pipeline reports — 9 live US markets",
  description:
    "Weekly executive rollups of newly filed bar, restaurant and package-store liquor licenses across TX, NY, CA, Chicago (IL), WA, OR, CO, CT, and MO.",
  alternates: { canonical: "/reports" },
};

export default async function ReportsIndex() {
  let counts = new Map<string, number>();
  try {
    await ensureSchema();
    counts = await getGenuineNewFilingsByState(7);
  } catch {
    // render zeros cleanly when DB initializing
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Trade Intelligence · Published Weekly · 9 Live Markets ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
          Weekly state <span className="italic text-amber">pipeline reports.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          Weekly rollups of new bar, restaurant &amp; liquor-store filings, county heatmaps, and
          license velocity across all 9 verified markets. Built for beverage distributors, craft
          breweries, POS reps, and commercial brokers.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {LIVE_MARKETS.map((m, i) => {
            const slug = `${m.slug}-weekly-liquor-filings`;
            const n = counts.get(m.code) ?? 0;
            return (
              <Reveal key={slug} delay={i * 60}>
                <Link
                  href={`/reports/${slug}`}
                  className="group flex h-full flex-col justify-between rounded-2xl border border-line bg-panel p-7 shadow-xl transition-colors hover:border-amber/40"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-amber">
                        <Newspaper className="h-4 w-4" /> {m.code} · WEEKLY ROUNDUP
                      </span>
                      <span className="rounded-full border border-leaf/40 bg-leaf/15 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-leaf">
                        {n} THIS WEEK
                      </span>
                    </div>

                    <h2 className="font-display mt-4 text-2xl font-medium text-cream transition-colors group-hover:text-amber">
                      {m.name} Weekly Liquor Pipeline Report
                    </h2>
                    <p className="mt-2.5 text-sm leading-relaxed text-smoke">
                      {m.agency} ({m.scope}) — {m.highlight}.
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-line pt-4 font-mono text-xs">
                    <span className="text-faint">OFFICIAL STATE RECORDS</span>
                    <span className="flex items-center gap-1.5 font-semibold text-amber">
                      READ REPORT{" "}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
      <Footer />
    </main>
  );
}
