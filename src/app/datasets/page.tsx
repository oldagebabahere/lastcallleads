import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Crown, Database, ShieldCheck, Sparkles } from "lucide-react";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import { Footer, Nav } from "@/components/ui";
import Reveal from "@/components/reveal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instant US Bar & Liquor Revenue CSV Data Packs ($399–$999)",
  description:
    "Download verified bulk CSV datasets: Top 2,500 Highest-Revenue Texas Bars ranked by official monthly alcohol sales, 9-State Pre-Opening + Active Hospitality Register, and Exclusive Metro Territory Locks.",
  alternates: { canonical: "/datasets" },
};

export default async function DatasetsPage() {
  let totalLicenses = 249_683;
  let totalPending = 30_815;
  let txRevenueVenues = 2_500;
  let topTxSample: {
    city: string;
    total: number;
    liquor: number;
  }[] = [];

  try {
    await ensureSchema();
    const [licRow, evRow, txCountRow, txTopRes] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(licenses),
      db.select({ n: sql<number>`count(*)::int` }).from(events),
      pool
        .query<{ n: number }>(`SELECT count(DISTINCT permit)::int AS n FROM venue_receipts WHERE total > 0`)
        .catch(() => ({ rows: [{ n: 2500 }] })),
      pool
        .query<{ city: string | null; total: number; liquor: number | null }>(
          `SELECT city, total, liquor FROM (
             SELECT DISTINCT ON (permit) permit, city, total, liquor
             FROM venue_receipts
             WHERE total >= 120000 AND city IS NOT NULL
             ORDER BY permit, period_end DESC, total DESC
           ) t
           ORDER BY total DESC
           LIMIT 5`
        )
        .catch(() => ({ rows: [] })),
    ]);
    if (licRow[0]?.n) totalLicenses = licRow[0].n;
    if (evRow[0]?.n) totalPending = evRow[0].n;
    if (txCountRow.rows[0]?.n) txRevenueVenues = txCountRow.rows[0].n;
    topTxSample = txTopRes.rows.map((r) => ({
      city: r.city ?? "Texas",
      total: Math.round(Number(r.total ?? 0)),
      liquor: Math.round(Number(r.liquor ?? 0)),
    }));
  } catch {
    // graceful fallback to verified snapshot stats
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-28">
        <p className="eyebrow">[ INSTITUTIONAL DATA DESK · ONE-TIME BULK CSV &amp; VIP EXCLUSIVITY ]</p>
        <Reveal>
          <h1 className="font-display mt-5 max-w-4xl text-4xl font-medium leading-tight sm:text-6xl">
            Skip months of prospecting.{" "}
            <span className="italic text-amber">Own the full state register today.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-smoke">
            Need an immediate HubSpot, Salesforce, or field-territory upload without a recurring
            seat? Pull structured, deduplicated CSVs directly from our{" "}
            <span className="text-cream">{totalLicenses.toLocaleString()}-record</span> official
            government warehouse — or lock exclusive category rights in your metro.
          </p>
        </Reveal>

        {/* Live Warehouse Counters */}
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          <div className="bg-panel p-6">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">ACTIVE &amp; PENDING VENUES</p>
            <p className="font-display mt-2 text-3xl font-semibold text-cream">
              {totalLicenses.toLocaleString()}
            </p>
            <p className="mt-1 font-mono text-[10px] text-faint">
              TX · NY · CA · IL · WA · OR · CO · CT · MO
            </p>
          </div>
          <div className="bg-panel p-6">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">TRACKED FILING SIGNALS</p>
            <p className="font-display mt-2 text-3xl font-semibold text-cream">
              {totalPending.toLocaleString()}
            </p>
            <p className="mt-1 font-mono text-[10px] text-faint">
              60–90 days ahead of public opening
            </p>
          </div>
          <div className="bg-panel p-6">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">TX REVENUE-VERIFIED BARS</p>
            <p className="font-display mt-2 text-3xl font-semibold text-cream">
              {txRevenueVenues.toLocaleString()}+
            </p>
            <p className="mt-1 font-mono text-[10px] text-faint">
              Official TX Comptroller monthly $ receipts
            </p>
          </div>
        </div>

        {/* 3 High-Ticket Offers */}
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {/* Offer 1: $399 TX Revenue Goldmine */}
          <Reveal delay={40}>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-amber/50 bg-gradient-to-b from-amber/10 to-panel p-7">
              <div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/15 px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-amber">
                    <Sparkles className="h-3 w-3" /> BESTSELLER · ONE-TIME CSV
                  </span>
                </div>
                <h2 className="font-display mt-5 text-2xl font-medium text-cream">
                  Texas Top 2,500 Highest-Revenue Bars &amp; Nightclubs
                </h2>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-semibold text-amber">$399</span>
                  <span className="font-mono text-xs text-smoke">ONE-TIME DOWNLOAD</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-smoke">
                  Stop pitching slow dive bars. Target the exact 2,500 Texas bars, restaurants,
                  hotels, and clubs pouring the highest verified monthly dollar volume of liquor,
                  wine, and beer.
                </p>
                <ul className="mt-5 space-y-2.5 text-xs text-cream/90">
                  {[
                    "Ranked #1 to #2,500 by official TX Comptroller monthly alcohol receipts",
                    "Exact monthly $ split: Total Alcohol, Distilled Spirits, Wine & Beer",
                    "Trade DBA name, parent LLC/corporation, city, county & TABC permit",
                    "Built for Tequila/Spirits brands, THC/RTD beverages, POS & Sysco reps",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                href="/contact?subject=tx-goldmine"
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-5 py-3.5 font-mono text-xs font-bold tracking-[0.14em] text-[#140b0e] transition-transform hover:scale-[1.02]"
              >
                ORDER TX GOLDMINE CSV ($399) <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Reveal>

          {/* Offer 2: $599 9-State Master Pack */}
          <Reveal delay={100}>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-line bg-panel p-7">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink px-3 py-1 font-mono text-[10px] tracking-[0.14em] text-smoke">
                  <Database className="h-3 w-3 text-amber" /> MULTI-STATE BULK EXPORT
                </span>
                <h2 className="font-display mt-5 text-2xl font-medium text-cream">
                  9-State Pre-Opening &amp; Active Hospitality Master Pack
                </h2>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-semibold text-cream">$599</span>
                  <span className="font-mono text-xs text-smoke">ONE-TIME DOWNLOAD</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-smoke">
                  Instant CRM territory seed across Texas, California, New York, Illinois (Chicago),
                  Colorado, Washington, Oregon, Connecticut, and Missouri.
                </p>
                <ul className="mt-5 space-y-2.5 text-xs text-cream/90">
                  {[
                    "15,000+ prioritized pre-opening pending applications + newest active venues",
                    "Street address, city, ZIP, county, legal LLC entity & license classification",
                    "Direct applicant phone numbers included where published (WA, MO, CT, TX)",
                    "Clean UTF-8 CSV formatted for HubSpot, Salesforce, Apollo & Clay",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                href="/contact?subject=master-pack"
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-amber/60 bg-ink px-5 py-3.5 font-mono text-xs font-bold tracking-[0.14em] text-amber transition-colors hover:bg-amber hover:text-[#140b0e]"
              >
                ORDER 9-STATE PACK ($599) <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Reveal>

          {/* Offer 3: $999/mo Exclusive Metro Lock */}
          <Reveal delay={160}>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-line bg-panel p-7">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-ink px-3 py-1 font-mono text-[10px] tracking-[0.14em] text-amber">
                  <Crown className="h-3 w-3" /> 1 SEAT PER CATEGORY / METRO
                </span>
                <h2 className="font-display mt-5 text-2xl font-medium text-cream">
                  VIP Exclusive Metro Category Lock + Live API
                </h2>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-semibold text-cream">$999</span>
                  <span className="font-mono text-xs text-smoke">/ MONTH · VIP</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-smoke">
                  Built for regional POS ISOs, commercial insurance brokerages, kitchen equipment
                  dealers, and national distributors who want priority territory protection.
                </p>
                <ul className="mt-5 space-y-2.5 text-xs text-cream/90">
                  {[
                    "Exclusive category seat in your chosen metro (we cap new direct competitors)",
                    "🐋 Whale Multi-Unit Operator alerts when proven groups file a new location",
                    "Unlimited team rep seats + real-time Slack, HubSpot, or REST API push",
                    "Custom county/ZIP routing + quarterly bulk CSV refreshes included",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                href="/contact?subject=exclusive-999"
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-ink px-5 py-3.5 font-mono text-xs font-bold tracking-[0.14em] text-cream transition-colors hover:border-amber hover:text-amber"
              >
                CHECK METRO AVAILABILITY <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Live Anonymized Preview of TX Goldmine */}
        {topTxSample.length > 0 && (
          <section className="mt-14 rounded-2xl border border-line bg-panel p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] text-amber">
                  LIVE WAREHOUSE SAMPLE · TEXAS COMPTROLLER RECEIPTS
                </p>
                <h3 className="font-display mt-1 text-xl font-medium text-cream">
                  Preview: Verified High-Volume Texas Venues in Pack #1
                </h3>
              </div>
              <span className="font-mono text-[11px] text-smoke">
                Names &amp; LLCs unlocked in CSV download
              </span>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-line text-[10px] tracking-[0.14em] text-faint">
                    <th className="pb-2.5 pr-4">RANK</th>
                    <th className="pb-2.5 pr-4">VENUE / ENTITY</th>
                    <th className="pb-2.5 pr-4">CITY</th>
                    <th className="pb-2.5 pr-4">MONTHLY LIQUOR</th>
                    <th className="pb-2.5 text-right">TOTAL MONTHLY ALCOHOL</th>
                  </tr>
                </thead>
                <tbody>
                  {topTxSample.map((row, idx) => (
                    <tr key={idx} className="border-b border-line/50 last:border-0">
                      <td className="py-3 pr-4 text-amber">#{idx + 1}</td>
                      <td className="py-3 pr-4 text-smoke">[Unlocked in $399 CSV]</td>
                      <td className="py-3 pr-4 text-cream">{row.city}, TX</td>
                      <td className="py-3 pr-4 text-cream/80">${row.liquor.toLocaleString()}/mo</td>
                      <td className="py-3 text-right font-bold text-leaf">
                        ${row.total.toLocaleString()}/mo
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
      <Footer />
    </main>
  );
}
