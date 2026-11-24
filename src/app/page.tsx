import Link from "next/link";
import { ArrowRight, ChevronDown, Flame, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { licenses } from "@/db/schema";
import Reveal from "@/components/reveal";
import RoiCalculator from "@/components/roi-calculator";
import SubscribeForm from "@/components/subscribe-form";
import CountUp from "@/components/count-up";
import BottleStage from "@/components/bottle-stage";
import { LogoMark } from "@/components/logo";
import { Footer, LeadRow, Nav } from "@/components/ui";
import { embargoCutoff, getRecentEvents, getSiteStats, maskName } from "@/lib/queries";
import {
  LIVE_MARKETS,
  LIVE_STATE_NAMES_DOT,
  LIVE_STATE_NAMES_LIST,
} from "@/lib/states";
import { BUYER_VERTICALS } from "@/lib/verticals";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import { BRAND } from "@/lib/brand";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const FAQ_ITEMS = [
  {
    q: "What exact details do beverage reps get on every lead?",
    a: "Every morning dossier includes the venue DBA name, legal LLC entity, exact premises street address & ZIP, license class decoded into beverage program fit (full spirits, cocktail bar, package store, beer/wine), named permittee & direct phone where published (Washington, Missouri, Connecticut), Texas Comptroller multi-unit revenue matches, 1-click Google Maps driving routes, LinkedIn owner search, official state LLC officer lookup, copy-paste pitch scripts, Slack/Discord webhook push, and a 19-column CRM CSV.",
  },
  {
    q: "Which US markets are covered right now?",
    a: `We only sell markets where we pull real, live retail bar, restaurant, brewpub & liquor-store filings directly from official portals every morning: ${LIVE_STATE_NAMES_LIST}. Zero padded wholesaler filler, zero dead feeds.`,
  },
  {
    q: "Why pending applications instead of already-open bars?",
    a: "By the time a bar opens its doors, the wine list, well spirits, draft lines, POS, and distributor reps are already locked in. A liquor license application is the earliest public proof money is moving — 60 to 90 days before first pour.",
  },
  {
    q: "How does the 7-day free trial work?",
    a: "Pick your market and drop your email — no credit card required. You get the exact same morning beverage dossier, 19-column CRM CSV export, and filing unlock links paying customers receive. Cancel or ignore after 7 days with zero charges.",
  },
];

type PlaceholderEvent = {
  id: number;
  state: string;
  eventType: string;
  tradeName: string | null;
  ownerName: string | null;
  city: string | null;
  typeName: string | null;
  occurredAt: Date | null;
  summary: string;
};

const PLACEHOLDER_EVENTS: PlaceholderEvent[] = [
  {
    id: 0,
    state: "TX",
    eventType: "NEW_PENDING",
    tradeName: "La Llorona Cantina",
    ownerName: "La Llorona LLC",
    city: "Katy",
    typeName: "Mixed Beverage Permit (Full Bar)",
    occurredAt: null,
    summary: "Application filed — La Llorona Cantina (Katy, TX) · Mixed Beverage Permit",
  },
  {
    id: 1,
    state: "NY",
    eventType: "NEW_PENDING",
    tradeName: "Baku Palace Lounge",
    ownerName: "MSR Baku International Inc",
    city: "Brooklyn",
    typeName: "On-Premises Restaurant Liquor",
    occurredAt: null,
    summary: "Application filed — Baku Palace Lounge (Brooklyn, NY) · On-Premises Liquor",
  },
  {
    id: 2,
    state: "WA",
    eventType: "NEW_LICENSE",
    tradeName: "Ballard Craft Bottle Shop",
    ownerName: "Ballard Beverage Ventures LLC",
    city: "Seattle",
    typeName: "Spirits / Beer / Wine Retail",
    occurredAt: null,
    summary: "License issued — Ballard Craft Bottle Shop (Seattle, WA) · Direct Phone Included",
  },
  {
    id: 3,
    state: "IL",
    eventType: "NEW_LICENSE",
    tradeName: "West Loop Wine & Spirits",
    ownerName: "733 W Lake St Inc",
    city: "Chicago",
    typeName: "Package Goods · West Loop",
    occurredAt: null,
    summary: "New opening — West Loop Wine & Spirits (Chicago, IL) · Package Goods",
  },
];

export default async function Home() {
  const [stats, recent, stateCounts] = await Promise.all([
    getSiteStats(),
    getRecentEvents(10),
    ensureSchema()
      .then(() =>
        db
          .select({ state: licenses.state, n: sql<number>`count(*)::int` })
          .from(licenses)
          .groupBy(licenses.state)
      )
      .catch(() => [] as { state: string; n: number }[]),
  ]);
  const countByState = new Map(stateCounts.map((r) => [r.state, r.n]));
  const cut = embargoCutoff();

  const isRowLocked = (occurredAt: Date | null) =>
    occurredAt ? occurredAt.getTime() > cut.getTime() : false;

  const ticker = recent.length
    ? recent.map((e) => {
      const locked = isRowLocked(e.occurredAt);
      const rawName = e.tradeName ?? e.ownerName ?? "New applicant";
      const displayName = locked ? maskName(rawName) : rawName;
      const tag =
        e.eventType === "NEW_PENDING"
          ? "FILED"
          : e.eventType === "STATUS_CHANGE"
            ? "STATUS"
            : "ISSUED";
      return {
        tag,
        text: `${displayName} — ${[e.city, e.state].filter(Boolean).join(", ")}${e.typeName ? ` · ${e.typeName}` : ""}`,
      };
    })
    : [
      { tag: "FILED", text: "La Llorona Cantina — Katy, TX · Mixed Beverage Permit (Full Bar)" },
      { tag: "FILED", text: "Baku Palace Lounge — Brooklyn, NY · On-Premises Liquor" },
      { tag: "ISSUED", text: "West Loop Wine & Spirits — Chicago, IL · New Opening" },
      { tag: "FILED", text: "Spider City Brewing Co — Bend, OR · Brewery Public House" },
      { tag: "FILED", text: "Harbor House Tavern — Stamford, CT · Named Permittee Included" },
      { tag: "ISSUED", text: "Cork & Vine — Edgewater, CO · Tavern Liquor" },
    ];

  const terminalRows = (recent.length ? recent.slice(0, 4) : PLACEHOLDER_EVENTS).map((e) => {
    const locked = isRowLocked(e.occurredAt);
    const rawName = e.tradeName ?? e.ownerName ?? "New applicant";
    const loc = [e.city, e.state].filter(Boolean).join(", ");
    const safeSummary = locked
      ? `${e.eventType === "NEW_PENDING" ? "Application filed" : "License issued"} — ${maskName(rawName)}${loc ? ` (${loc})` : ""}${e.typeName ? ` · ${e.typeName}` : ""}`
      : e.summary;
    return {
      state: e.state,
      eventType: e.eventType,
      summary: safeSummary,
    };
  });

  const baseUrl = siteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: BRAND.name,
        url: `${baseUrl}/`,
        description:
          "Daily beverage-sales dossiers for new bars, restaurants & liquor stores across 9 verified US markets — 60 to 90 days before doors open.",
      },
      {
        "@type": "Product",
        name: `${BRAND.name} — Beverage Territory Dossiers`,
        description:
          "Same-morning dossiers for new bar & liquor-store filings: street addresses, legal LLCs, phones where filed, beverage program fit, 1-click owner search & 19-column CRM CSV.",
        offers: [
          {
            "@type": "Offer",
            name: "Territory",
            price: "129.00",
            priceCurrency: "USD",
            category: "1 live market, per month",
          },
          {
            "@type": "Offer",
            name: "Multi-State",
            price: "249.00",
            priceCurrency: "USD",
            category: "Up to 3 live markets, per month",
          },
          {
            "@type": "Offer",
            name: "All-9 Enterprise",
            price: "499.00",
            priceCurrency: "USD",
            category: "All 9 live markets + REST API, per month",
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <main className="theme-flip relative min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />

      <BottleStage />

      {/* ================= ACT 1 — HERO (light gradient) ================= */}
      <section
        id="act-hero"
        className="act-light relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 pb-28 pt-24"
      >
        <div className="aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="relative z-30 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-1 pt-2 font-mono text-[9px] tracking-[0.22em] text-inkread/60">
          <span className="truncate">9 LIVE US MARKETS — TEXAS · NEW YORK · CALIFORNIA · ILLINOIS &amp; 5 MORE</span>
          <span className="hidden shrink-0 sm:block">FOR DISTRIBUTORS · BREWERIES · SPIRITS REPS</span>
        </div>

        <div
          className="parallax parallax-soft pointer-events-none relative z-20 mt-4 select-none text-center lg:mt-0"
          aria-hidden="true"
        >
          <p className="hero-giant text-[15vw] sm:text-[11.5vw] lg:text-[8.6rem]">NEW BARS</p>
          <p className="hero-giant stroke text-[15vw] sm:text-[11.5vw] lg:text-[8.6rem]">BEFORE THEY</p>
          <p className="hero-giant text-[15vw] sm:text-[11.5vw] lg:text-[8.6rem]">
            OPEN<span className="text-wine2">.</span>
          </p>
        </div>

        <div className="relative z-30 mx-auto mt-10 max-w-2xl text-center lg:mt-20">
          <div
            className="hero-fade mx-auto mb-4 inline-flex items-center gap-2.5 rounded-full border border-wine2/25 bg-white/75 px-4 py-1.5 shadow-sm backdrop-blur-md"
            style={{ animationDelay: "120ms" }}
          >
            <LogoMark className="h-5 w-5 rounded-full border border-amber/60" />
            <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-inkread/85">
              INSTITUTIONAL BEVERAGE INTEL · {LIVE_MARKETS.length} VERIFIED US MARKETS
            </span>
          </div>
          <p
            className="hero-fade mx-auto max-w-xl text-base leading-relaxed text-inkread/85 sm:text-lg"
            style={{ animationDelay: "300ms" }}
          >
            Every bar files its alcohol permit{" "}
            <span className="font-semibold text-inkread">60–90 days before first pour</span>. At
            7:00 AM daily, we deliver the exact{" "}
            <span className="font-semibold text-inkread">
              street address, LLC entity, estimated alcohol spend &amp; 1-click Google Maps route
            </span>{" "}
            before competitors know they exist.
          </p>
          <div
            className="hero-fade mt-7 flex flex-wrap items-center justify-center gap-3.5"
            style={{ animationDelay: "480ms" }}
          >
            <Link href="#act-allocation" className="btn-mint magnetic px-8 py-4 text-sm">
              Claim Your Territory — 7-Day Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/map" className="btn-ghost-ink px-6 py-4 text-sm">
              <MapPin className="h-4 w-4 text-wine2" />
              Live Territory Map
            </Link>
          </div>
          <p
            className="hero-fade mt-4 font-mono text-[10px] tracking-[0.16em] text-inkread/60"
            style={{ animationDelay: "620ms" }}
          >
            $0 TODAY · NO CREDIT CARD · CAPPED AT 5 TERRITORY SEATS PER STATE
          </p>
        </div>

        <span
          className="hero-rail absolute bottom-16 right-6 hidden md:block"
          aria-hidden="true"
        >
          9 VERIFIED MARKETS · SWEPT DAILY
        </span>

        <a
          href="#act-window"
          className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 text-inkread/45"
          aria-label="Scroll to the window"
        >
          <ChevronDown className="scroll-hint h-5 w-5" />
        </a>
      </section>

      {/* ================= OXBLOOD TICKER ================= */}
      <section className="band-ox relative z-30 py-3.5" aria-label="Latest filings">
        <div className="band-marquee">
          <div className="marquee-track">
            {[...ticker, ...ticker].map((t, i) => (
              <span
                key={i}
                className="flex shrink-0 items-center gap-3 px-6 font-mono text-[11px] tracking-[0.08em]"
              >
                <span className={t.tag === "FILED" ? "text-amber" : "text-mint-bright"}>
                  ● {t.tag}
                </span>
                <span className="text-cream/80">{t.text}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ================= INSTITUTIONAL AUTHORITY STRIP ================= */}
      <section className="relative z-30 border-b border-cream/10 bg-ox-ink px-5 py-5 text-cream">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 text-center sm:grid-cols-4">
          {[
            ["18 OFFICIAL GOV FEEDS", "Swept live every morning"],
            ["MAX 5 SEATS / STATE", "Strict territory cap to protect edge"],
            ["19-COLUMN CRM + SLACK", "HubSpot CSV, .vcf contact & webhook"],
            ["0% SHARED AUCTIONS", "Direct public-record intelligence"],
          ].map(([head, sub]) => (
            <div key={head} className="px-2">
              <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-amber">
                {head}
              </p>
              <p className="mt-0.5 text-xs text-smoke">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= ACT 2 — THE WINDOW ================= */}
      <section id="act-window" className="act-dark relative flex min-h-screen items-center px-5 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal className="ml-auto w-full max-w-xl lg:mr-[7%]">
            <div className="act-panel parallax p-8 sm:p-10">
              <p className="eyebrow">[ Act 2 — The window ]</p>
              <h2 className="mt-5 font-display text-4xl font-medium leading-[1.05] tracking-tight text-cream sm:text-5xl">
                Well pours, wine lists &amp; tap handles get decided before opening night.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-smoke">
                Once a new bar finishes build-out, the distributor is already signed and the menu is
                at the printer. Show up the week their permit hits the state registry — while they
                are actively tasting bottles and picking suppliers.
              </p>
              <div className="mt-9 grid grid-cols-3 gap-6">
                <div>
                  <p className="font-display text-4xl font-light text-amber">
                    <CountUp to={90} suffix="–d" />
                  </p>
                  <p className="mt-1 font-mono text-[9px] tracking-[0.2em] text-faint">OF RUNWAY</p>
                </div>
                <div>
                  <p className="font-display text-4xl font-light text-amber">
                    <CountUp to={19} />
                  </p>
                  <p className="mt-1 font-mono text-[9px] tracking-[0.2em] text-faint">
                    CRM CSV FIELDS
                  </p>
                </div>
                <div>
                  <p className="font-display text-4xl font-light text-amber">
                    <CountUp to={9} />
                  </p>
                  <p className="mt-1 font-mono text-[9px] tracking-[0.2em] text-faint">
                    LIVE MARKETS
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= ACT 3 — THE MACHINE ================= */}
      <section id="act-machine" className="act-dark relative flex min-h-screen items-center px-5 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal className="w-full max-w-xl lg:ml-[7%]">
            <div className="act-panel parallax p-8 sm:p-10">
              <p className="eyebrow">[ Act 3 — The beverage dossier ]</p>
              <h2 className="mt-5 font-display text-4xl font-medium leading-[1.05] tracking-tight text-cream sm:text-5xl">
                Every lead arrives <span className="accent-serif text-amber">ready to work.</span>
              </h2>
              <div className="mt-6 space-y-3">
                {[
                  "Premises street address, ZIP, legal LLC & named permittee/phone (where filed)",
                  "Texas multi-unit hospitality groups matched to monthly Comptroller alcohol receipts",
                  "1-click Street View, LinkedIn owner search & direct state LLC officer lookup",
                  "Copy-paste beverage pitch scripts + 19-column HubSpot/Salesforce CSV export",
                ].map((line) => (
                  <p key={line} className="flex items-start gap-3 text-[15px] text-cream/90">
                    <span className="neon-text mt-0.5 font-mono text-xs">→</span>
                    {line}
                  </p>
                ))}
              </div>
              <div className="bar-top scanlines liquid-glass mt-8 rounded-xl">
                <div className="relative z-10 flex items-center justify-between border-b border-cream/10 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-blood/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-mint/70" />
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.2em] text-faint">
                    LIVE REGISTRY WATCH
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-neon">
                    <span className="h-1.5 w-1.5 rounded-full bg-neon blink" /> ON
                  </span>
                </div>
                <div className="relative z-10 divide-y divide-cream/5">
                  {terminalRows.map((e, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em]">
                        <span className={e.eventType === "NEW_PENDING" ? "text-amber" : "neon-text"}>
                          {e.eventType === "NEW_PENDING"
                            ? "● APPLICATION FILED"
                            : e.eventType === "STATUS_CHANGE"
                              ? "● STATUS FLIP"
                              : "● LICENSE ISSUED"}
                        </span>
                        <span className="text-faint">{e.state}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-1 font-mono text-xs text-cream/85">
                        {e.summary}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="relative z-10 border-t border-cream/10 px-4 py-2.5 font-mono text-[10px] tracking-[0.15em] text-faint">
                  SYSTEM:{" "}
                  {stats.lastRunAt
                    ? `last pull ${stats.lastRunAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                    : "armed for next morning sweep"}
                  {" · "}swept daily · 11:00 UTC
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= ACT 4 — SIGNALS ================= */}
      <section
        id="act-signals"
        className="act-dark-last relative flex min-h-screen items-end px-5 pb-32 pt-24"
      >
        <div className="mx-auto w-full max-w-6xl">
          <Reveal>
            <div className="act-panel-cream parallax mx-auto max-w-3xl p-8 sm:p-10">
              <p className="eyebrow-ink">[ Act 4 — Beverage program fit ]</p>
              <h2 className="mt-5 font-display text-3xl font-medium tracking-tight sm:text-4xl">
                Know what they will buy before you dial the first number.
              </h2>
              <div className="mt-8 space-y-4">
                {[
                  {
                    combo: "MB + LH / Type 48",
                    reads: "High-velocity cocktail bar pouring past midnight ($220K–$500K/yr est. wholesale spend).",
                  },
                  {
                    combo: "P / Type 21 / LIP",
                    reads: "Liquor & package retail store needing full spirits wall, cold-box RTDs & floor stacks.",
                  },
                  {
                    combo: "Type 41 / BE / LRW",
                    reads: "Food-led beer & wine restaurant — prime for BTG wine lists, craft cans & draft lines.",
                  },
                ].map((s) => (
                  <div
                    key={s.combo}
                    className="grid items-center gap-2 border-b border-inkread/15 pb-4 sm:grid-cols-[190px_1fr]"
                  >
                    <div className="font-mono text-sm font-semibold tracking-[0.08em] text-wine2">
                      {s.combo}
                    </div>
                    <p className="text-[15px] text-inkread/80">{s.reads}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[10px] tracking-[0.16em] text-inkread/60">
                <span>· STREET ADDRESS</span>
                <span>· LEGAL LLC</span>
                <span>· DIRECT PHONE (WASHINGTON &amp; MISSOURI)</span>
                <span>· NAMED PERMITTEE (CONNECTICUT)</span>
                <span>· TEXAS MULTI-UNIT REVENUE</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= ACT 5 — ALLOCATION (PRICING) ================= */}
      <span id="pricing" className="block scroll-mt-24" aria-hidden="true" />
      <section id="act-allocation" className="act-light relative scroll-mt-20 px-5 py-28 sm:py-32">
        <div className="aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <Reveal className="relative">
          <p className="eyebrow-ink text-center">[ Act 5 — Allocation ]</p>
          <h2 className="mx-auto mt-5 max-w-2xl text-center font-display text-4xl font-medium leading-tight tracking-tight text-inkread sm:text-6xl">
            One closed bar account pays for{" "}
            <span className="accent-serif text-wine2">a whole decade.</span>
          </h2>
        </Reveal>

        <Reveal delay={120} className="relative">
          <div className="alloc-row mx-auto mt-16 grid max-w-5xl grid-cols-1 text-inkread md:grid-cols-3">
            {/* SCOUT */}
            <div className="alloc-cell flex flex-col">
              <p className="font-mono text-[11px] tracking-[0.2em] text-inkread/65">SCOUT</p>
              <p className="mt-4 font-display text-5xl font-light">$0</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-inkread/55">
                FOREVER FREE
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-inkread/75">
                <li>· Browse all 9 live markets</li>
                <li>· Names &amp; dossiers unlock after 7 days</li>
                <li>· Inspect sample morning dossier</li>
              </ul>
              <Link
                href="/sample"
                className="btn-ghost-ink mt-auto justify-center py-2.5 font-mono text-[11px] tracking-[0.12em]"
              >
                VIEW SAMPLE DOSSIER
              </Link>
            </div>

            {/* TERRITORY */}
            <div className="alloc-cell alloc-featured relative flex flex-col">
              <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mint px-3 py-1 font-mono text-[9px] font-bold tracking-[0.2em] text-[#06231a]">
                MOST PICKED
              </span>
              <div id="dock-slot" className="dock-slot flex h-40 items-center justify-center md:h-44">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  id="slot-bottle"
                  src="/bottle.webp"
                  alt="Last Call Leads bottle"
                  width={306}
                  height={1200}
                  className="slot-bottle h-36 w-auto md:h-40"
                />
              </div>
              <p className="mt-5 font-mono text-[11px] tracking-[0.2em] text-wine2">TERRITORY</p>
              <p className="mt-3 font-display text-5xl font-light">$129</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-inkread/55">
                PER MONTH · 1 LIVE MARKET
              </p>
              <p className="mt-3 inline-block rounded-md bg-amber/25 px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.1em] text-wine2">
                ✓ 7-day free trial · no card · capped at 5 seats/state
              </p>
              <ul className="mt-5 flex-1 space-y-3 text-sm text-inkread/80">
                <li>
                  · <strong>1 live market</strong> of your choice
                </li>
                <li>· Same-morning beverage dossier email</li>
                <li>· Interactive territory map + 1-click Google Maps route</li>
                <li>· Real-time Slack, Discord &amp; Zapier webhook push</li>
                <li>· Street address, LLC &amp; phone (where filed)</li>
                <li>· 1-click LinkedIn, Street View &amp; LLC lookup</li>
                <li>· 19-column CRM CSV + pitch scripts</li>
                <li>· ZIP &amp; venue-type filtering · cancel anytime</li>
              </ul>
              <div className="mt-7">
                <SubscribeForm plan="solo" />
              </div>
            </div>

            {/* MULTI-STATE PRO */}
            <div className="alloc-cell relative flex flex-col border-amber/50 bg-amber/[0.06]">
              <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber px-3 py-1 font-mono text-[9px] font-bold tracking-[0.2em] text-[#140b0e]">
                BEST VALUE · SAVE 36%
              </span>
              <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-wine2">
                PRO · MULTI-STATE
              </p>
              <p className="mt-4 font-display text-5xl font-light">$249</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-inkread/65">
                PER MONTH · UP TO 3 MARKETS ($83/STATE)
              </p>
              <p className="mt-3 inline-block rounded-md bg-amber/25 px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.1em] text-wine2">
                ✓ 7-day free trial · no card · priority seat lock
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-inkread/85">
                <li>· Everything in Territory</li>
                <li>
                  · <strong>Any 3 live markets</strong> — switch states anytime
                </li>
                <li>
                  · <strong>Team seats</strong> for your field reps (up to 3)
                </li>
                <li>
                  · <strong>Real-time Slack, Discord &amp; CRM webhooks</strong>
                </li>
                <li>
                  · <strong>Unlimited 19-column HubSpot/Salesforce CSVs</strong>
                </li>
                <li>· Weekly market intelligence briefing + priority support</li>
              </ul>
              <div className="mt-8">
                <SubscribeForm plan="pro" />
              </div>
            </div>
          </div>
        </Reveal>

        {/* ANNUAL PREPAY UPFRONT CASH STRIP (2 Months Free) */}
        <div className="stat-card relative mx-auto mt-8 max-w-5xl rounded-xl border-amber/60 bg-amber/[0.08] p-6 text-inkread">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="max-w-2xl text-left">
              <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-wine2">
                ANNUAL PREPAY · PAY 10 MONTHS, GET 12 (2 MONTHS FREE)
              </p>
              <p className="mt-1.5 font-display text-2xl font-medium text-inkread">
                Territory <span className="text-wine2">$1,290/yr</span>{" "}
                <span className="font-mono text-xs text-inkread/60">(save $258)</span>
                {" · "}
                Pro 3-State <span className="text-wine2">$2,490/yr</span>{" "}
                <span className="font-mono text-xs text-inkread/60">(save $498)</span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-inkread/75">
                Lock your territory seat for a full 12 months with one corporate invoice or card
                payment — immune to price increases and guaranteed seat renewal.
              </p>
            </div>
            <Link
              href="/contact?subject=Annual%20Prepay%20(2%20Months%20Free)"
              className="shrink-0 rounded-full bg-wine2 px-6 py-3 font-mono text-[11px] font-bold tracking-[0.14em] text-[#f6eee1] transition-transform hover:scale-[1.03]"
            >
              CLAIM 2 MONTHS FREE →
            </Link>
          </div>
        </div>

        <div className="stat-card relative mx-auto mt-6 max-w-5xl rounded-xl border-amber/50 p-6 text-center text-inkread">
          <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-wine2">
            ALL-9 ENTERPRISE + API
          </p>
          <p className="mt-2 font-display text-3xl font-light">
            $499<span className="text-base text-inkread/55">/mo</span>
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-inkread/75">
            Everything in Multi-State, plus: <strong>all 9 verified US markets</strong>, a{" "}
            <strong>REST API key</strong> that pipes every new venue straight into your CRM,
            unlimited team seats, and priority onboarding when we add your next target state.
          </p>
          <p className="mt-3 font-mono text-[10px] tracking-[0.14em] text-inkread/55">
            API KEY DELIVERED SAME DAY · CUSTOM STATE REQUESTS PRIORITIZED
          </p>
          <a
            href={`mailto:${PUBLIC_CONFIG.contactEmail}?subject=Enterprise%20All-9%20Plan`}
            className="mt-4 inline-block rounded-full border border-wine2/60 px-6 py-2.5 font-mono text-[11px] font-semibold tracking-[0.14em] text-wine2 transition-colors hover:bg-wine2 hover:text-[#f6eee1]"
          >
            {`EMAIL US — ${PUBLIC_CONFIG.contactEmail.toUpperCase()} →`}
          </a>
        </div>

        <div className="stat-card relative mx-auto mt-6 max-w-5xl rounded-xl p-5 text-center text-inkread">
          <p className="font-mono text-[10px] leading-relaxed tracking-[0.1em] text-inkread/80">
            9 HONEST, LIVE US RETAIL MARKETS: {LIVE_STATE_NAMES_DOT.toUpperCase()}
            <br />
            100% OFFICIAL BAR, RESTAURANT, BREWPUB &amp; LIQUOR-STORE FILINGS — ZERO FAKE STATE
            CLAIMS · LIMITED TO 5 SEATS PER STATE TO PROTECT YOUR TERRITORY EDGE
          </p>
          <p className="mt-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-wine2">
            <Link href="/coverage" className="underline underline-offset-4">
              INSPECT LIVE HEALTH &amp; DATA FIELDS FOR ALL 9 MARKETS →
            </Link>
          </p>
        </div>

        <p className="relative mt-10 text-center font-mono text-[11px] leading-relaxed tracking-[0.1em] text-inkread/50">
          NO CONTRACT · CANCEL ANYTIME · IF THE MORNING DOSSIER DOESN&apos;T PAY FOR ITSELF, DON&apos;T RENEW
        </p>
      </section>

      {/* ================= POST-DOCK — AGENCY DOSSIER PREVIEW + TERRITORY SCARCITY MATRIX ================= */}
      <section className="mx-auto max-w-6xl px-5 pt-16">
        <Reveal>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Left: Institutional 7:00 AM Dossier Preview */}
            <div className="rounded-2xl border border-amber/30 bg-ox-ink p-7 text-cream shadow-[0_30px_80px_-35px_rgba(30,6,14,0.85)] sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream/10 pb-4">
                <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.2em] text-amber">
                  <Sparkles className="h-3.5 w-3.5" /> 7:00 AM MORNING DOSSIER PREVIEW
                </span>
                <span className="rounded-full border border-mint/40 bg-mint/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-mint-bright">
                  SCORE 94 · PRIORITY A
                </span>
              </div>

              <div className="mt-5">
                <p className="font-mono text-[10px] tracking-[0.18em] text-smoke">
                  FILED THIS MORNING · TEXAS TABC · MIXED BEVERAGE + LATE HOURS
                </p>
                <h3 className="mt-2 font-display text-2xl font-medium text-cream sm:text-3xl">
                  La Llorona Cantina
                </h3>
                <p className="mt-1 font-mono text-xs text-amber">
                  Entity: La Llorona Hospitality LLC · 19128 W Little York Rd, Katy, TX 77449
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-cream/10 bg-panel p-3.5">
                  <p className="font-mono text-[9px] tracking-[0.18em] text-faint">
                    EST. WHOLESALE SPEND
                  </p>
                  <p className="mt-1 font-display text-lg font-medium text-cream">
                    $220K–$500K / year
                  </p>
                </div>
                <div className="rounded-lg border border-cream/10 bg-panel p-3.5">
                  <p className="font-mono text-[9px] tracking-[0.18em] text-faint">
                    EST. OPENING WINDOW
                  </p>
                  <p className="mt-1 font-display text-lg font-medium text-mint-bright">
                    ~60 Days · Pitch Now
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.1em]">
                {[
                  "Google Maps Multi-Stop Route",
                  "Street View Check",
                  "LinkedIn + Instagram Finder",
                  "1-Tap Phone Contact (.vcf)",
                  "7-Day Calendar Alarm",
                  "Slack / CRM Webhook",
                ].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-md border border-cream/15 bg-panel2/80 px-2.5 py-1 text-cream/85"
                  >
                    ✓ {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: 9-Market Territory Seat Cap Matrix (Real Scarcity FOMO) */}
            <div className="rounded-2xl border border-inkread/15 bg-creamcard/90 p-7 text-inkread shadow-[0_24px_70px_-35px_rgba(36,16,22,0.45)] sm:p-8">
              <div className="flex items-center justify-between gap-2 border-b border-inkread/15 pb-4">
                <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.2em] text-wine2">
                  <Flame className="h-3.5 w-3.5" /> TERRITORY SEAT ALLOCATION
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-inkread/70">
                  <ShieldCheck className="h-3.5 w-3.5 text-wine2" /> MAX 5 / STATE
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-inkread/75">
                We cap every state at <strong>5 active distributor seats</strong> so your territory
                never gets crowded with competing reps calling the same new bar.
              </p>
              <div className="mt-4 divide-y divide-inkread/10">
                {LIVE_MARKETS.map((m) => {
                  const n = countByState.get(m.code) ?? 0;
                  return (
                    <div
                      key={m.code}
                      className="flex items-center justify-between gap-2 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-inkread">{m.name}</span>
                        <span className="ml-2 font-mono text-[10px] text-inkread/55">
                          {n > 0 ? `${n.toLocaleString()} records` : m.agency}
                        </span>
                      </div>
                      <a
                        href="#act-allocation"
                        className="shrink-0 rounded-full border border-wine2/35 bg-wine2/10 px-2.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.12em] text-wine2 transition-colors hover:bg-wine2 hover:text-cream"
                      >
                        CLAIM SEAT →
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= POST-DOCK — PROOF ================= */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="eyebrow-ink">[ PROOF — not promises, live database numbers ]</p>
          <h2 className="mt-5 font-display text-4xl font-medium tracking-tight text-inkread sm:text-5xl">
            Every number here is <span className="italic text-wine2">live from official registries.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-inkread/75">
            No screenshots, no fake state counts. Computed live from the exact database feeding our
            morning beverage dossiers.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            [
              stats.watching.toLocaleString(),
              "retail venues under watch",
              "refreshed from official state alcohol portals every morning",
            ],
            [
              stats.totalEvents.toLocaleString(),
              "filings captured",
              "new applications, relocations, issuances & status flips",
            ],
            [
              `${LIVE_MARKETS.length} markets`,
              "100% live retail coverage",
              LIVE_STATE_NAMES_DOT,
            ],
          ].map(([n, label, sub], i) => (
            <Reveal key={label} delay={i * 80}>
              <div className="stat-card h-full rounded-xl p-7">
                <p className="font-display text-4xl font-light text-inkread">{n}</p>
                <p className="mt-2 font-mono text-[10px] tracking-[0.18em] text-wine2">
                  {String(label).toUpperCase()}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-inkread/65">{sub}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= POST-DOCK — LIVE FEED PROOF ================= */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="eyebrow-ink">[ 06 — Straight from the state registries ]</p>
          <h2 className="mt-5 font-display text-4xl font-medium tracking-tight text-inkread sm:text-5xl">
            This week&apos;s filings.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10 overflow-hidden rounded-2xl border border-inkread/10 bg-ox-ink shadow-[0_30px_80px_-40px_rgba(60,26,34,0.6)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream/10 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke">
                <span className="dot-live" /> LIVE · 7-day embargo on public names
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href="/map"
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-mint-bright hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" /> TERRITORY MAP &amp; ROUTES
                </Link>
                <Link
                  href="/feed"
                  className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
                >
                  OPEN FULL FEED →
                </Link>
              </div>
            </div>
            {recent.length ? (
              recent.slice(0, 8).map((e) => {
                const locked = isRowLocked(e.occurredAt);
                const row = locked
                  ? {
                    ...e,
                    tradeName: maskName(e.tradeName ?? e.ownerName ?? "Applicant"),
                    ownerName: null,
                  }
                  : e;
                return <LeadRow key={e.id} e={row} locked={locked} />;
              })
            ) : (
              <div className="px-6 py-16 text-center">
                <p className="text-sm text-cream">
                  Live filings appear here automatically after the first daily sweep.
                </p>
                <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-faint">
                  SWEPT DAILY · 11:00 UTC
                </p>
              </div>
            )}
          </div>
        </Reveal>
      </section>

      {/* ================= POST-DOCK — MAP + BUILT FOR TEAMS ================= */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal>
          <div className="overflow-hidden rounded-2xl border border-inkread/15 bg-ox-ink p-7 text-cream shadow-[0_30px_80px_-40px_rgba(60,26,34,0.65)] sm:p-10">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] tracking-[0.22em] text-amber">
                  [ LIVE TERRITORY MAP + GOOGLE MAPS ROUTE PLANNER ]
                </p>
                <h2 className="mt-3 font-display text-3xl font-medium leading-tight sm:text-4xl">
                  Turn morning filings into a{" "}
                  <span className="italic text-amber">1-click field visit route.</span>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-smoke">
                  Plot newly filed bars, restaurants &amp; liquor stores on our interactive map,
                  auto-select the highest-priority stops in your territory, and launch multi-stop
                  turn-by-turn Google Maps directions straight from your phone.
                </p>
              </div>
              <Link
                href="/map"
                className="btn-mint shrink-0 justify-center px-7 py-4 text-sm"
              >
                <MapPin className="h-4 w-4" />
                Open Territory Map
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-16">
            <p className="eyebrow-ink">[ BUILT FOR HOSPITALITY SALES TEAMS ]</p>
            <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-inkread sm:text-4xl">
              See how your industry uses{" "}
              <span className="italic text-wine2">60-day pre-opening filings.</span>
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BUYER_VERTICALS.map((v) => (
                <Link
                  key={v.slug}
                  href={`/for/${v.slug}`}
                  className="stat-card group flex flex-col justify-between rounded-xl p-6 text-inkread transition-all hover:-translate-y-0.5 hover:border-wine2/45"
                >
                  <div>
                    <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-wine2">
                      {v.badge}
                    </p>
                    <h3 className="mt-2.5 font-display text-xl font-medium leading-snug text-inkread group-hover:text-wine2">
                      {v.headline} {v.headlineAccent}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-inkread/70">
                      {v.avgAccountValue}
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.16em] text-wine2">
                    VIEW PLAYBOOK <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= POST-DOCK — ROI ================= */}
      <section className="mx-auto max-w-6xl px-5 pb-8">
        <RoiCalculator />
      </section>

      {/* ================= POST-DOCK — FAQ ================= */}
      <section className="section-sage">
        <div className="mx-auto max-w-3xl px-5 py-24 sm:py-28">
          <Reveal>
            <p className="eyebrow-ink">[ 07 — FAQ ]</p>
            <h2 className="mt-5 font-display text-4xl font-medium tracking-tight text-inkread sm:text-5xl">
              Common questions
            </h2>
          </Reveal>
          <div className="mt-10 space-y-4">
            {FAQ_ITEMS.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="faq-card group rounded-2xl px-6 py-5 backdrop-blur-sm [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-inkread">
                    {f.q}
                    <span className="font-mono text-wine2 transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 pr-8 text-base leading-relaxed text-inkread/75">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="section-maroon relative overflow-hidden px-5 py-32 text-center sm:py-40">
        <div className="aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <Reveal className="relative">
          <h2 className="mx-auto max-w-3xl font-display text-5xl font-light leading-[1.02] tracking-tight sm:text-7xl">
            The next new bar in your territory{" "}
            <span className="accent-serif text-amber">files tomorrow morning.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-base text-cream/75">
            Be first at the door with street address, LLC entity, beverage fit &amp; pitch script.
          </p>
          <Link href="#act-allocation" className="btn-mint magnetic mt-10 px-9 py-4 text-base">
            Start 7-day free trial <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>

      <Footer />
    </main>
  );
}
