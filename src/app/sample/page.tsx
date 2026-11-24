import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin, Search } from "lucide-react";
import { and, desc, eq, inArray, lte, notLike } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import Reveal from "@/components/reveal";
import SubscribeForm from "@/components/subscribe-form";
import OutreachKit from "@/components/outreach-kit";
import { Footer, Nav } from "@/components/ui";
import { buildBeverageDossier, parseEventMeta } from "@/lib/beverage-intel";
import { dedupeKey, isJunkEntity, scoreFiling } from "@/lib/lead-score";
import { embargoCutoff } from "@/lib/queries";
import { LIVE_MARKETS, LIVE_STATE_CODES, stateFullName } from "@/lib/states";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sample morning beverage dossier — what lands in your inbox",
  description:
    "Inspect an exact Last Call Leads morning email: venue name, street address, legal LLC, direct phone (where filed), beverage program fit, 1-click owner search & pitch script.",
  alternates: { canonical: "/sample" },
};

type SampleRow = {
  id: number;
  state: string;
  eventType: string;
  tradeName: string | null;
  ownerName: string | null;
  city: string | null;
  county: string | null;
  typeName: string | null;
  occurredAt: Date | null;
  payload: string | null;
};

// Realistic showcase examples used only before the first sweep populates unlocked rows.
const SHOWCASE_EXAMPLES: SampleRow[] = [
  {
    id: 1001,
    state: "TX",
    eventType: "NEW_PENDING",
    tradeName: "La Llorona Cantina",
    ownerName: "La Llorona Hospitality LLC",
    city: "Katy",
    county: "Harris",
    typeName: "Mixed Beverage Permit (Full Bar) + Late Hours",
    occurredAt: null,
    payload: JSON.stringify({
      address: "19128 W Little York Rd",
      zip: "77449",
      licenseType: "MB",
      sourceUrl: "https://data.texas.gov/d/mxm5-tdpj",
    }),
  },
  {
    id: 1002,
    state: "NY",
    eventType: "NEW_PENDING",
    tradeName: "Baku Palace Lounge",
    ownerName: "MSR Baku International Inc",
    city: "Brooklyn",
    county: "Kings",
    typeName: "On-Premises Restaurant Liquor",
    occurredAt: null,
    payload: JSON.stringify({
      address: "2001 Emmons Avenue",
      zip: "11235",
      licenseType: "OP",
      sourceUrl: "https://data.ny.gov/d/f8i8-k2gm",
    }),
  },
  {
    id: 1003,
    state: "CT",
    eventType: "NEW_PENDING",
    tradeName: "Harbor House Tavern",
    ownerName: "Harbor Hospitality Group LLC",
    city: "Stamford",
    county: "Fairfield",
    typeName: "Restaurant Liquor",
    occurredAt: null,
    payload: JSON.stringify({
      address: "142 Main St",
      zip: "06901",
      contactName: "Danielle Filardi",
      licenseType: "LIR",
      sourceUrl: "https://data.ct.gov/d/gwv2-eswx",
    }),
  },
  {
    id: 1004,
    state: "WA",
    eventType: "NEW_LICENSE",
    tradeName: "Ballard Craft Bottle Shop",
    ownerName: "Ballard Beverage Ventures LLC",
    city: "Seattle",
    county: "King",
    typeName: "Spirits / Beer / Wine Retail Package",
    occurredAt: null,
    payload: JSON.stringify({
      address: "2003 Western Ave Ste 110C",
      zip: "98121",
      phone: "(206) 555-0194",
      contactName: "Jason Mercer",
      sourceUrl: "https://data.wa.gov/d/9dee-kzm5",
    }),
  },
];

export default async function SamplePage() {
  let rows: SampleRow[] = [];
  let isLiveSample = false;

  try {
    await ensureSchema();
    const raw = await db
      .select({
        id: events.id,
        state: events.state,
        eventType: events.eventType,
        tradeName: events.tradeName,
        ownerName: events.ownerName,
        city: events.city,
        county: events.county,
        typeName: events.typeName,
        occurredAt: events.occurredAt,
        payload: events.payload,
      })
      .from(events)
      .where(
        and(
          eq(events.eventType, "NEW_PENDING"),
          inArray(events.state, LIVE_STATE_CODES),
          notLike(events.licenseKey, "TTB-%"),
          lte(events.occurredAt, embargoCutoff())
        )
      )
      .orderBy(desc(events.occurredAt))
      .limit(80);
    const seenSample = new Set<string>();
    const filteredLive = (raw as unknown as SampleRow[])
      .filter((e) => {
        if (isJunkEntity(e.tradeName, e.ownerName, e.typeName)) return false;
        const m = parseEventMeta(e.payload);
        if (!m.address) return false;
        const dk = dedupeKey(e.tradeName ?? e.ownerName, e.city);
        if (seenSample.has(dk)) return false;
        seenSample.add(dk);
        return true;
      })
      .sort(
        (a, b) =>
          scoreFiling({ eventType: b.eventType, typeName: b.typeName, city: b.city, county: b.county, occurredAt: b.occurredAt }).value -
          scoreFiling({ eventType: a.eventType, typeName: a.typeName, city: a.city, county: a.county, occurredAt: a.occurredAt }).value
      )
      .slice(0, 5);
    rows = filteredLive;
    if (rows.length >= 3) isLiveSample = true;
  } catch {
    rows = [];
  }

  const displayRows = rows.length >= 3 ? rows : SHOWCASE_EXAMPLES;

  const enriched = displayRows
    .map((e) => {
      const meta = parseEventMeta(e.payload);
      const score = scoreFiling({
        eventType: e.eventType,
        typeName: e.typeName,
        city: e.city,
        county: e.county,
        occurredAt: e.occurredAt,
      });
      const dossier = buildBeverageDossier({
        state: e.state,
        eventType: e.eventType,
        tradeName: e.tradeName,
        ownerName: e.ownerName,
        contactName: meta.contactName,
        address: meta.address,
        city: e.city,
        zip: meta.zip,
        county: e.county,
        neighborhood: meta.neighborhood,
        typeName: e.typeName,
        licenseType: meta.licenseType,
        sourceUrl: meta.sourceUrl,
        occurredAt: e.occurredAt,
      });
      return { e, meta, score, dossier };
    })
    .sort((a, b) => b.score.value - a.score.value);

  const top = enriched[0];
  const stateLabel = Array.from(new Set(displayRows.map((r) => stateFullName(r.state)))).join(" + ");
  const subject = `${displayRows.length} new beverage leads — ${stateLabel}`;

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-28">
        <p className="eyebrow">
          [ Sample morning dossier · {isLiveSample ? "real unlocked filings" : "exact email format"} ]
        </p>
        <h1 className="font-display mt-5 text-3xl font-medium leading-tight sm:text-4xl">
          Not a raw spreadsheet — a ready-to-call beverage dossier every morning.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-smoke">
          Every morning email includes street address, legal LLC entity, named permittee/phone
          (where published), beverage program fit, 1-click owner lookup, and CRM CSV export across
          our {LIVE_MARKETS.length} verified markets.
        </p>

        {/* Email preview */}
        <Reveal>
          <div className="mt-10 overflow-hidden rounded-xl border border-line bg-wine-grad">
            <div className="border-b border-line/70 px-5 py-3.5">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand-logo.webp"
                  alt="Last Call Leads"
                  className="mt-0.5 h-9 w-9 shrink-0 rounded-lg border border-amber/45 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-cream">Last Call Leads Alerts</p>
                  <p className="font-mono text-[11px] text-faint">
                    alerts@lastcallleads.com → you@distributor.com
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-faint">7:00 AM</span>
              </div>
              <p className="mt-3 font-display text-lg font-medium text-cream">{subject}</p>
            </div>

            <div className="px-5 py-6">
              {top && (
                <div className="mb-6 rounded-xl border border-amber/50 bg-panel p-5">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-amber">
                    ★ CALL THIS ONE FIRST — SCORE {top.score.value}/100 ·{" "}
                    {top.dossier.estAnnualSpend.toUpperCase()}
                  </p>
                  <p className="font-display mt-2 text-xl font-medium text-cream">
                    {top.e.tradeName ?? top.e.ownerName}
                    {top.e.city ? ` (${top.e.city}, ${top.e.state})` : ""}
                  </p>
                  {top.meta.address && (
                    <p className="mt-1 font-mono text-xs text-cream/85">
                      📍 {[top.meta.address, top.e.city, top.e.state, top.meta.zip].filter(Boolean).join(", ")}
                      {top.e.ownerName ? ` · Entity: ${top.e.ownerName}` : ""}
                    </p>
                  )}
                  <p className="mt-2 text-xs leading-relaxed text-smoke">
                    {top.dossier.pitchAngle}
                  </p>
                </div>
              )}

              <div className="divide-y divide-line/60">
                {enriched.map(({ e, meta, score, dossier }) => {
                  const fullAddr = [meta.address, e.city, e.state, meta.zip]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <div key={e.id} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-base font-medium text-cream">
                          {e.tradeName ?? e.ownerName}
                        </span>
                        <span className="font-mono text-[10px] tracking-[0.14em]">
                          <span className={e.eventType === "NEW_PENDING" ? "text-amber" : "text-leaf"}>
                            {e.eventType === "NEW_PENDING" ? "FILED" : "ISSUED"}
                          </span>
                          <span className="ml-2 rounded-full border border-amber/50 bg-amber/15 px-2 py-0.5 text-[9px] font-bold text-amber">
                            SCORE {score.value}
                          </span>
                        </span>
                      </div>
                      {fullAddr && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-cream/85">
                          <MapPin className="h-3 w-3 shrink-0 text-amber" />
                          {fullAddr}
                        </p>
                      )}
                      {(e.ownerName || meta.contactName || meta.phone) && (
                        <p className="mt-1 font-mono text-[11px] text-amber">
                          {[
                            meta.contactName ? `Contact: ${meta.contactName}` : null,
                            e.ownerName ? `LLC: ${e.ownerName}` : null,
                            meta.phone ? `Tel: ${meta.phone}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-smoke">
                        <strong className="text-cream">{dossier.archetype}</strong> ·{" "}
                        {e.typeName ?? "Liquor license"}
                      </p>
                      <p className="mt-1 text-xs text-faint">
                        Beverage fit: {dossier.beverageProgram}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-3 font-mono text-[10px] text-amber">
                        <a
                          href={dossier.links.streetView}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <MapPin className="h-3 w-3" /> STREET VIEW ↗
                        </a>
                        <a
                          href={dossier.links.linkedinOwner}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Search className="h-3 w-3" /> FIND OWNER (LINKEDIN) ↗
                        </a>
                        <a
                          href={dossier.links.entityLookup}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Building2 className="h-3 w-3" /> LLC LOOKUP ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-line pt-4 font-mono text-[10px] text-amber">
                Download 19-Column CRM CSV ↓ · Filter by ZIP &amp; Venue Type · 1-Click Unsubscribe
              </div>
            </div>
          </div>
        </Reveal>

        {/* Interactive Beverage Pitch Script Preview */}
        {top && (
          <Reveal delay={80}>
            <div className="mt-8">
              <OutreachKit
                coldEmailSubject={top.dossier.outreach.coldEmailSubject}
                coldEmailBody={top.dossier.outreach.coldEmailBody}
                callOpener={top.dossier.outreach.callOpener}
                dropByNote={top.dossier.outreach.dropByNote}
              />
            </div>
          </Reveal>
        )}

        {/* CTA */}
        <Reveal delay={120}>
          <div className="mt-10 rounded-2xl border border-amber/40 bg-wine-card p-7 sm:p-9">
            <h2 className="font-display text-2xl font-medium text-cream">
              Start your 7-day free trial — no credit card.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-smoke">
              Pick your market below. Your first morning dossier + 19-column CRM CSV lands on the
              next daily sweep.
            </p>
            <div className="mt-6 max-w-md">
              <SubscribeForm plan="solo" />
            </div>
          </div>
        </Reveal>

        <div className="mt-8 flex flex-wrap gap-6 text-center sm:justify-center">
          <Link
            href="/coverage"
            className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            SEE ALL 9 LIVE MARKETS →
          </Link>
          <Link
            href="/feed"
            className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            BROWSE LIVE FEED →
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
