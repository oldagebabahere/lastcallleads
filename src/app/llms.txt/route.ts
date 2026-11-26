import { NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";
import { LIVE_MARKETS } from "@/lib/states";
import { BUYER_VERTICALS } from "@/lib/verticals";
import { siteUrl } from "@/lib/site";

export const revalidate = 3600;

export async function GET() {
  const base = siteUrl();

  const marketsList = LIVE_MARKETS.map(
    (m) =>
      `- [${m.name} (${m.code}) — ${m.agency}](${base}/states/${m.slug}): ${m.scope} coverage. ${m.highlight}.`
  ).join("\n");

  const verticalsList = BUYER_VERTICALS.map(
    (v) => `- [${v.title}](${base}/for/${v.slug}): ${v.metaDescription}`
  ).join("\n");

  const body = `# ${BRAND.name}

> ${BRAND.tagline}. Daily pre-opening hospitality & liquor-license intelligence across 9 verified US beverage markets — built for beverage distributors, craft breweries, wineries, spirits reps, POS & hospitality SaaS teams, commercial insurance brokers, and restaurant buildout vendors.

## Core Pages
- [Home & Pricing](${base}/): Overview, live territory coverage, 7-day free trial (no card required), Solo ($99/mo), Pro ($249/mo), and Enterprise API ($499/mo).
- [Live Liquor-License Feed](${base}/feed): Real-time feed of newly filed pending applications, issued liquor permits, and status changes across all 9 live states.
- [Interactive Territory Map & Route Planner](${base}/map): Pinpoint newly filed bars, restaurants, and package stores and generate 1-click multi-stop Google Maps driving routes.
- [Sample Morning Dossier](${base}/sample): Inspect a full morning subscriber alert with venue DBA, legal LLC entity, premises address, direct phone (where filed), and cold outreach scripts.
- [Bulk CSV Data Packs](${base}/datasets): Instant-download hospitality datasets including the Top 2,500 Highest-Revenue Texas Bars (by Texas Comptroller mixed-beverage tax receipts) and the 9-State Pre-Opening & Active Hospitality Register.
- [Market Coverage](${base}/coverage): Full source transparency across official state alcohol control portals.
- [Weekly Pipeline Reports](${base}/reports): State-by-state weekly rollups of new bar and restaurant filings.
- [Live Data Desk & Statistics](${base}/insights): Daily-computed counts of pending applications, county hotspots, and license class breakdowns.
- [City Territory Directory](${base}/cities): City-level new bar and restaurant filing feeds across major US metros.
- [Texas TABC License Codes Explained](${base}/types): Plain-English guides to Mixed Beverage (MB), Food & Beverage (FB), Package Store (P), Brewpub (BP), and Late Hours (LH) permits.
- [Hospitality Sales Guides](${base}/guides): Playbooks on winning new bar, restaurant, and liquor-store accounts 60–90 days before grand opening.

## 9 Verified Live US Markets
${marketsList}

## Industry Solutions
${verticalsList}

## Data Integrity & Sources
Every record published by ${BRAND.name} originates directly from official state alcohol beverage control agencies (Texas TABC & Comptroller, New York SLA, California ABC, Chicago BACP, Washington LCB, Oregon OLCC, Colorado LED, Connecticut DCP, and Missouri ATC), normalized daily with zero scraped guesses.
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
