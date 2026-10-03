import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import Reveal from "@/components/reveal";
import RoiCalculator from "@/components/roi-calculator";
import SubscribeForm from "@/components/subscribe-form";
import CountUp from "@/components/count-up";
import BottleStage from "@/components/bottle-stage";
import { Footer, LeadRow, Nav } from "@/components/ui";
import { getRecentEvents, getSiteStats } from "@/lib/queries";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const FAQ_ITEMS = [
  {
    q: "Where does the data come from?",
    a: "Official state licensing records — the same public filings every venue must submit before opening. Refreshed daily, tracked continuously.",
  },
  {
    q: "How fresh is it?",
    a: "Pending applications appear in the state records within days of filing, and your alert lands the same morning they appear.",
  },
  {
    q: "Why applications, not issued licenses?",
    a: "By the time a license is issued, the buying decisions are made. An application is the earliest public proof money is about to move — that's the window.",
  },
  {
    q: "Which states are covered?",
    a: "Ten states today — Texas, New York, California, Colorado, Connecticut, Illinois, Maryland, Missouri, Oregon and Washington — with more unlocking as we add them.",
  },
];

export default async function Home() {
  const [stats, recent] = await Promise.all([getSiteStats(), getRecentEvents(10)]);
  const liveStates = stats.byState.filter((b) => b.n > 0).map((b) => b.state);
  const ticker = recent.length
    ? recent.map((e) => ({
        tag: e.eventType === "NEW_PENDING" ? "FILED" : "ISSUED",
        text: `${e.tradeName ?? e.ownerName ?? "New applicant"} — ${[e.city, e.state].filter(Boolean).join(", ")}`,
      }))
    : [
        { tag: "FILED", text: "Meridian Hospitality LLC — Austin, TX · Mixed Beverage Permit" },
        { tag: "FILED", text: "Hudson wine bar concept — Brooklyn, NY · On-Premises Liquor" },
        { tag: "ISSUED", text: "Coastal package store — Houston, TX · Package Store" },
        { tag: "FILED", text: "Neighborhood taqueria — Queens, NY · Restaurant Wine" },
        { tag: "FILED", text: "Late-night cocktail lounge — Dallas, TX · Late Hours" },
        { tag: "ISSUED", text: "Brewpub kitchen — Denver, CO · Fermented Malt Beverage" },
      ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Last Call Leads",
        url: "https://lastcallleads.com/",
        description:
          "New bar & restaurant liquor filings, before they open. Daily email alerts for beverage-industry sales reps.",
      },
      {
        "@type": "Product",
        name: "Last Call Leads — territory alerts",
        description:
          "Same-morning email alerts for new liquor-license filings: names, addresses, license types, status flips.",
        offers: [
          { "@type": "Offer", name: "Territory", price: "129.00", priceCurrency: "USD", category: "One state, per month" },
          { "@type": "Offer", name: "All-Access", price: "249.00", priceCurrency: "USD", category: "Every state, per month" },
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

      {/* the one bottle — GSAP ScrollTrigger scrubs its pose across the acts */}
      <BottleStage />

      {/* ================= ACT 1 — HERO (light gradient) ================= */}
      <section
        id="act-hero"
        className="act-light relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 pb-28 pt-24"
      >
        <div className="aurora" aria-hidden="true"><span /><span /><span /></div>

        {/* top metadata row — editorial frame details */}
        <div className="relative z-30 mx-auto flex w-full max-w-6xl items-center justify-between px-1 pt-2 font-mono text-[9px] tracking-[0.26em] text-inkread/45">
          <span>TERRITORY INTELLIGENCE — TX·NY·CA·CO·CT·IL·MD·MO·OR·WA</span>
          <span className="hidden sm:block">40.7128° N · 74.0060° W</span>
        </div>

        {/* giant bold type behind the bottle */}
        <div className="parallax parallax-soft pointer-events-none relative z-20 select-none text-center" aria-hidden="true">
          <p className="hero-giant text-[16vw] sm:text-[12.5vw] lg:text-[10rem]">NEW BARS</p>
          <p className="hero-giant stroke text-[16vw] sm:text-[12.5vw] lg:text-[10rem]">BEFORE THEY</p>
          <p className="hero-giant text-[16vw] sm:text-[12.5vw] lg:text-[10rem]">
            OPEN<span className="text-wine2">.</span>
          </p>
        </div>

        {/* readable hero furniture, below the bottle zone */}
        <div className="relative z-30 mx-auto mt-auto max-w-2xl text-center">
          <p className="hero-fade font-mono text-[10px] tracking-[0.34em] text-inkread/60 sm:text-[11px]" style={{ animationDelay: "150ms" }}>
            <span className="text-wine2">●</span>&nbsp;&nbsp;NEW-FILING INTELLIGENCE&nbsp;&nbsp;·&nbsp;&nbsp;
            {liveStates.length ? `${liveStates.length} STATES LIVE` : "10 STATES WATCHED"}
          </p>
          <p className="hero-fade mx-auto mt-5 max-w-xl text-lg leading-relaxed text-inkread/70" style={{ animationDelay: "350ms" }}>
            A bar files its license <span className="font-semibold text-inkread">60–90 days before it opens</span>.
            We watch the records every morning and email you the new ones — one short
            email a day.
          </p>
          <div className="hero-fade mt-8 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: "550ms" }}>
            <Link href="#act-allocation" className="btn-mint magnetic px-8 py-4 text-sm">
              Get the filings
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/feed" className="btn-ghost-ink px-8 py-4 text-sm">
              Browse the live feed
            </Link>
          </div>
        </div>

        <span className="hero-rail absolute bottom-40 left-6 hidden md:block" aria-hidden="true">
          CONFIDENTIAL LEADS · REFRESHED DAILY
        </span>
        <span className="hero-rail absolute bottom-40 right-6 hidden md:block" aria-hidden="true">
          EST. MMXXV · ONE EMAIL A DAY
        </span>

        <a href="#act-window" className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 text-inkread/40" aria-label="Scroll to the window">
          <ChevronDown className="scroll-hint h-5 w-5" />
        </a>
      </section>

      {/* ================= OXBLOOD TICKER (bridge into the dark world) ================= */}
      <section className="band-ox relative z-30 py-3.5" aria-label="Latest filings">
        <div className="band-marquee">
          <div className="marquee-track">
            {[...ticker, ...ticker].map((t, i) => (
              <span key={i} className="flex shrink-0 items-center gap-3 px-6 font-mono text-[11px] tracking-[0.08em]">
                <span className={t.tag === "FILED" ? "text-amber" : "text-mint-bright"}>● {t.tag}</span>
                <span className="text-cream/75">{t.text}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ================= ACT 2 — THE WINDOW (glassmorphism card) ================= */}
      <section id="act-window" className="act-dark relative flex min-h-screen items-center px-5 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal className="ml-auto w-full max-w-xl lg:mr-[7%]">
            <div className="act-panel parallax p-8 sm:p-10">
              <p className="eyebrow">[ Act 2 — The window ]</p>
              <h2 data-split className="mt-5 font-display text-4xl font-medium leading-[1.05] tracking-tight text-cream sm:text-5xl">
                The buying decisions happen in one short window.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-smoke">
                From filing to opening, a new venue picks its distributor, POS,
                insurance and staff — all at once. The rep who shows up during the
                paperwork rarely competes.
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
                    <CountUp to={1} />
                  </p>
                  <p className="mt-1 font-mono text-[9px] tracking-[0.2em] text-faint">CALL TO OWN IT</p>
                </div>
                <div>
                  <p className="font-display text-4xl font-light text-amber">
                    <CountUp to={100} suffix="%" />
                  </p>
                  <p className="mt-1 font-mono text-[9px] tracking-[0.2em] text-faint">CONFIDENTIAL LEADS</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= ACT 3 — THE MACHINE (terminal panel) ================= */}
      <section id="act-machine" className="act-dark relative flex min-h-screen items-center px-5 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal className="w-full max-w-xl lg:ml-[7%]">
            <div className="act-panel parallax p-8 sm:p-10">
              <p className="eyebrow">[ Act 3 — The machine ]</p>
              <h2 data-split className="mt-5 font-display text-4xl font-medium leading-[1.05] tracking-tight text-cream sm:text-5xl">
                While you were asleep, <span className="accent-serif text-amber">it read every filing.</span>
              </h2>
              <div className="mt-6 space-y-3">
                {[
                  "Every official licensing list, read every morning",
                  "Only what's genuinely new — nothing you've already seen",
                  "Names, cities and license codes in plain English",
                  "One tight email at daybreak. No noise.",
                ].map((line) => (
                  <p key={line} className="flex items-start gap-3 text-[15px] text-cream/85">
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
                  <span className="font-mono text-[10px] tracking-[0.2em] text-faint">LIVE REGISTRY WATCH</span>
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-neon">
                    <span className="h-1.5 w-1.5 rounded-full bg-neon blink" /> ON
                  </span>
                </div>
                <div className="relative z-10 divide-y divide-cream/5">
                  {(recent.length ? recent.slice(0, 4) : PLACEHOLDER_EVENTS).map((e, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em]">
                        <span className={e.eventType === "NEW_PENDING" ? "text-amber" : "neon-text"}>
                          {e.eventType === "NEW_PENDING" ? "● APPLICATION FILED" : "● LICENSE ISSUED"}
                        </span>
                        <span className="text-faint">{e.state}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-1 font-mono text-xs text-cream/85">{e.summary}</p>
                    </div>
                  ))}
                </div>
                <div className="relative z-10 border-t border-cream/10 px-4 py-2.5 font-mono text-[10px] tracking-[0.15em] text-faint">
                  SYSTEM:{" "}
                  {stats.lastRunAt
                    ? `last pull ${stats.lastRunAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    : "arming on first deploy"}
                  {" · "}digest 12:20 UTC
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= ACT 4 — SIGNALS (data points) ================= */}
      <section id="act-signals" className="act-dark-last relative flex min-h-screen items-end px-5 pb-32 pt-24">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal>
            <div className="act-panel-cream parallax mx-auto max-w-3xl p-8 sm:p-10">
              <p className="eyebrow-ink">[ Act 4 — Signals ]</p>
              <h2 data-split className="mt-5 font-display text-3xl font-medium tracking-tight sm:text-4xl">
                Two letters on a filing tell you what kind of venue is coming.
              </h2>
              <div className="mt-8 space-y-4">
                {[
                  { combo: "MB + LH + FB", reads: "Full-service restaurant & bar, pouring past midnight." },
                  { combo: "P", reads: "Package store — a liquor retailer with shelf space to fill." },
                  { combo: "BE / Q", reads: "Beer & wine only — café, fast-casual, or grocery." },
                ].map((s) => (
                  <div key={s.combo} className="grid items-center gap-2 border-b border-inkread/15 pb-4 sm:grid-cols-[190px_1fr]">
                    <div className="font-mono text-sm font-semibold tracking-[0.1em] text-wine2">{s.combo}</div>
                    <p className="text-[15px] text-inkread/80">{s.reads}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[10px] tracking-[0.18em] text-inkread/50">
                <span>· NAMES</span>
                <span>· CITIES</span>
                <span>· LICENSE TYPES</span>
                <span>· STATUS FLIPS</span>
                <span>· WHY IT MATTERS, EVERY ROW</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= ACT 5 — ALLOCATION (pricing, back in the light) ================= */}
      <span id="pricing" className="block scroll-mt-24" aria-hidden="true" />
      <section id="act-allocation" className="act-light relative scroll-mt-20 px-5 py-28 sm:py-32">
        <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
        <Reveal className="relative">
          <p className="eyebrow-ink text-center">[ Act 5 — Allocation ]</p>
          <h2 data-split className="mx-auto mt-5 max-w-2xl text-center font-display text-4xl font-medium leading-tight tracking-tight text-inkread sm:text-6xl">
            One landed account pays for{" "}
            <span className="accent-serif text-wine2">a whole year.</span>
          </h2>
        </Reveal>

        <Reveal delay={120} className="relative">
          <div className="alloc-row mx-auto mt-16 grid max-w-5xl grid-cols-1 text-inkread md:grid-cols-3">
            {/* SCOUT */}
            <div className="alloc-cell flex flex-col">
              <p className="font-mono text-[11px] tracking-[0.2em] text-inkread/60">SCOUT</p>
              <p className="mt-4 font-display text-5xl font-light">$0</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-inkread/50">FOREVER FREE</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-inkread/70">
                <li>· Browse the public feed</li>
                <li>· Names unlock after 7 days</li>
                <li>· All covered states</li>
              </ul>
              <Link href="/feed" className="btn-ghost-ink mt-8 justify-center py-2.5 font-mono text-[11px] tracking-[0.12em]">
                OPEN FEED
              </Link>
            </div>

            {/* TERRITORY — the bottle docks here */}
            <div className="alloc-cell alloc-featured relative flex flex-col">
              <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mint px-3 py-1 font-mono text-[9px] font-bold tracking-[0.2em] text-[#06231a]">
                MOST PICKED
              </span>
              <div id="dock-slot" className="dock-slot flex h-60 items-center justify-center md:h-64">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  id="slot-bottle"
                  src="/bottle.webp"
                  alt="Last Call Leads bottle"
                  width={306}
                  height={1200}
                  className="slot-bottle h-52 w-auto md:h-56"
                />
              </div>
              <p className="mt-5 font-mono text-[11px] tracking-[0.2em] text-wine2">TERRITORY</p>
              <p className="mt-3 font-display text-5xl font-light">$129</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-inkread/50">PER MONTH · 1 STATE</p>
              <p className="mt-3 inline-block rounded-md bg-amber/25 px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.1em] text-wine2">
                ✓ 7-day free trial · no card
              </p>
              <ul className="mt-5 flex-1 space-y-3 text-sm text-inkread/80">
                <li>· <strong>1 state</strong> of your choice</li>
                <li>· Same-morning email alerts</li>
                <li>· Names + addresses, day one</li>
                <li>· Filed + issued + status flips</li>
                <li>· Monthly recap + weekly briefing</li>
                <li>· Cancel anytime</li>
              </ul>
              <div className="mt-7">
                <SubscribeForm plan="solo" />
              </div>
            </div>

            {/* ALL-ACCESS */}
            <div className="alloc-cell flex flex-col">
              <p className="font-mono text-[11px] tracking-[0.2em] text-inkread/60">MULTI-STATE</p>
              <p className="mt-4 font-display text-5xl font-light">$249</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-inkread/50">PER MONTH · UP TO 3 STATES</p>
              <p className="mt-3 inline-block rounded-md bg-amber/25 px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.1em] text-wine2">
                ✓ 7-day free trial · no card
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-inkread/70">
                <li>· Everything in Territory</li>
                <li>· <strong>Any 3 states</strong> — switch anytime</li>
                <li>· Team seats for your reps</li>
                <li>· Priority phone &amp; email support</li>
                <li>· CSV exports for the CRM</li>
                <li>· Monthly team value recap</li>
              </ul>
              <div className="mt-8">
                <SubscribeForm plan="pro" />
              </div>
            </div>
          </div>
        </Reveal>

        <div className="relative mt-8 rounded-xl border border-amber/40 bg-amber/10 p-6 text-center">
          <p className="font-mono text-[10px] tracking-[0.2em] text-amber">ENTERPRISE</p>
          <p className="mt-2 font-display text-3xl font-light">
            $499<span className="text-base text-inkread/50">/mo</span>
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-inkread/70">
            Everything in Multi-State, plus: <strong>all 50 states</strong>, a{" "}
            <strong>REST API key</strong> that pushes every new filing straight
            into your CRM (your developer plugs in one URL), team seats, and
            priority support.
          </p>
          <p className="mt-3 font-mono text-[10px] tracking-[0.14em] text-inkread/50">
            SETUP ON A 15-MIN CALL · API KEY DELIVERED SAME DAY
          </p>
          <a
            href={`mailto:${PUBLIC_CONFIG.contactEmail}?subject=Enterprise%20plan`}
            className="mt-4 inline-block rounded-full border border-amber/60 px-6 py-2.5 font-mono text-[11px] tracking-[0.14em] text-amber transition-colors hover:bg-amber hover:text-ink"
          >
            {`EMAIL US — ${PUBLIC_CONFIG.contactEmail.toUpperCase()} →`}
          </a>
        </div>

        <div className="relative mt-8 rounded-xl border border-line bg-panel p-5 text-center">
          <p className="font-mono text-[10px] leading-relaxed tracking-[0.12em] text-inkread/60">
            DEDICATED DAILY FEEDS: TX · NY · CA · FL · WA · CO · MO · CT · IL · MD · OR —
            pending applications, new licenses &amp; status flips<br/>
            ALL 50 STATES: covered by the federal TTB alcohol registry — every wholesaler,
            importer, winery, distillery &amp; brewery, plus each week&apos;s new permits
          </p>
          <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-amber">
            NEW DEDICATED STATES COME ONLINE AUTOMATICALLY — YOUR PLAN COVERS THEM DAY ONE
          </p>
        </div>

        <p className="relative mt-10 text-center font-mono text-[11px] leading-relaxed tracking-[0.1em] text-inkread/45">
          NO CONTRACT · CANCEL ANYTIME · IF THE MORNING EMAIL ISN&apos;T USEFUL, DON&apos;T RENEW
        </p>
      </section>

      {/* ================= POST-DOCK — PROOF (live numbers, founder promise) ================= */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="eyebrow-ink">[ PROOF — not promises, numbers ]</p>
          <h2 className="mt-5 font-display text-4xl font-medium tracking-tight text-inkread sm:text-5xl">
            Every number here is <span className="italic text-wine2">live from the registries.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-inkread/70">
            No screenshots, no staged demos. This page is computed from the same
            database the morning emails come from — right now, as you read it.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            [stats.watching.toLocaleString(), "licenses under watch", "refreshed from official state registries every day"],
            [stats.totalEvents.toLocaleString(), "filings captured", "every new application, issuance and status change logged"],
            [`${liveStates.length} + federal`, "sources feeding the machine", "state registries plus TTB permits for all 50 states"],
          ].map(([n, label, sub], i) => (
            <Reveal key={label} delay={i * 80}>
              <div className="stat-card h-full rounded-xl p-7">
                <p className="font-display text-4xl font-light text-inkread">{n}</p>
                <p className="mt-2 font-mono text-[10px] tracking-[0.18em] text-wine2">{String(label).toUpperCase()}</p>
                <p className="mt-3 text-sm leading-relaxed text-inkread/60">{sub}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="card-soft2 mt-8 rounded-xl border border-wine2/25 p-8 sm:p-10">
            <p className="font-display text-2xl leading-snug text-ink sm:text-3xl">
              &ldquo;I got tired of hearing about new bars after everyone else did —
              so I built the morning email I always wished I had.&rdquo;
            </p>
            <p className="mt-5 font-mono text-[11px] tracking-[0.15em] text-inkread/60">
              — {PUBLIC_CONFIG.founderName || "THE FOUNDER"}, {BRAND.name}
            </p>
            <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-inkread/70">
              And one promise: if a filing matters to your territory and we missed
              it, reply to any email — it comes straight to me, and I fix it.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ================= POST-DOCK — live feed proof ================= */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="eyebrow-ink">[ 06 — Straight from the registry ]</p>
          <h2 className="mt-5 font-display text-4xl font-medium tracking-tight text-inkread sm:text-5xl">
            This week&apos;s filings.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10 overflow-hidden rounded-2xl border border-inkread/10 bg-ox-ink shadow-[0_30px_80px_-40px_rgba(60,26,34,0.6)]">
            <div className="flex items-center justify-between border-b border-cream/10 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke">
                <span className="dot-live" /> LIVE · last 7 days
              </div>
              <Link href="/feed" className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline">
                OPEN FULL FEED →
              </Link>
            </div>
            {recent.length ? (
              recent.slice(0, 8).map((e) => <LeadRow key={e.id} e={e} locked={false} />)
            ) : (
              <div className="px-6 py-16 text-center">
                <p className="text-sm text-cream">Live filings appear here the morning after deploy.</p>
                <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-faint">
                  NO DATA YET · MACHINE STARTS AT 12:00 UTC
                </p>
              </div>
            )}
          </div>
        </Reveal>
      </section>

      {/* ================= POST-DOCK — ROI ================= */}
      <section className="mx-auto max-w-6xl px-5 pb-8">
        <RoiCalculator />
      </section>

      {/* ================= POST-DOCK — story (warm cream) ================= */}
      <section className="section-cream">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <Reveal>
            <p className="eyebrow-ink">[ 07 — Why I built this ]</p>
            <div className="mt-8 grid items-center gap-10 md:grid-cols-[300px_1fr]">
              <div className="img-wash overflow-hidden rounded-xl shadow-[0_30px_70px_-30px_rgba(74,16,32,0.55)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/founder-bar.webp"
                  alt="A bartender behind a bar"
                  className="h-64 w-full object-cover transition-transform duration-[2.5s] ease-out hover:scale-105 md:h-72"
                  loading="lazy"
                />
              </div>
              <div>
                <h2 className="font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
                  I got tired of hearing about new bars{" "}
                  <span className="accent-serif text-wine2">after everyone else did.</span>
                </h2>
                <div className="mt-5 space-y-4 text-[15px] leading-[1.85] text-ink/70">
                  <p>
                    Every venue files paperwork months before it opens. That paperwork is
                    public — but it&apos;s buried in spreadsheets full of codes nobody explains.
                  </p>
                  <p>
                    So I built a small system that reads those records every morning, finds
                    only what&apos;s new, and puts it in a plain email: name, city, what kind
                    of venue it will be. That&apos;s it. One email a day.
                  </p>
                  <p className="pt-2 font-mono text-[11px] tracking-[0.15em] text-inkread/60">
                    — {PUBLIC_CONFIG.founderName || "THE FOUNDER"}, {BRAND.name}
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= POST-DOCK — being first ================= */}
      <section className="mx-auto max-w-4xl px-5 py-24">
        <Reveal>
          <div className="border-t border-inkread/10 pt-14">
            <h2 className="font-display text-3xl font-medium tracking-tight text-inkread sm:text-5xl">
              You&apos;re not buying data.{" "}
              <span className="accent-serif text-wine2">You&apos;re buying being first.</span>
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              <div>
                <p className="font-display text-5xl font-light text-wine2">
                  <CountUp to={30} suffix=" min" />
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-inkread/50">SAVED PER DAY</p>
                <p className="mt-4 text-base leading-relaxed text-inkread/70">
                  That&apos;s what a rep spends digging through raw records. We do it instead.
                </p>
              </div>
              <div>
                <p className="font-display text-5xl font-light text-wine2">
                  <CountUp to={90} suffix="–day" />
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-inkread/50">HEAD START</p>
                <p className="mt-4 text-base leading-relaxed text-inkread/70">
                  Filing to opening. The window where vendors get chosen.
                </p>
              </div>
              <div>
                <p className="font-display text-5xl font-light text-wine2">1</p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-inkread/50">LANDED ACCOUNT</p>
                <p className="mt-4 text-base leading-relaxed text-inkread/70">
                  Often pays for a year of alerts. Most reps see more than one.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= POST-DOCK — FAQ (pale sage) ================= */}
      <section className="section-sage">
        <div className="mx-auto max-w-3xl px-5 py-24 sm:py-28">
          <Reveal>
            <p className="eyebrow-ink">[ 08 — FAQ ]</p>
            <h2 className="mt-5 font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">Common questions</h2>
          </Reveal>
          <div className="mt-10 space-y-4">
            {FAQ_ITEMS.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="group rounded-2xl border border-ink/10 bg-white/50 px-6 py-5 backdrop-blur-sm [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink">
                    {f.q}
                    <span className="font-mono text-wine2 transition-transform duration-300 group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 pr-8 text-base leading-relaxed text-ink/70">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FINAL CTA (deep maroon outro) ================= */}
      <section className="section-maroon relative overflow-hidden px-5 py-32 text-center sm:py-40">
        <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
        <Reveal className="relative">
          <h2 className="mx-auto max-w-3xl font-display text-5xl font-light leading-[1.02] tracking-tight sm:text-7xl">
            The next filing in your territory{" "}
            <span className="accent-serif text-amber">lands tomorrow morning.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-base text-cream/70">
            Be reading it over coffee. Not hearing about it at the bar.
          </p>
          <Link href="#act-allocation" className="btn-mint magnetic mt-10 px-9 py-4 text-base">
            Start getting alerts <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>

      <Footer />
    </main>
  );
}

const PLACEHOLDER_EVENTS = [
  {
    id: 0,
    state: "TX",
    eventType: "NEW_PENDING",
    summary: "Application filed — Meridian Hospitality LLC (Austin, TX) · Mixed Beverage Permit",
  },
  {
    id: 1,
    state: "NY",
    eventType: "NEW_PENDING",
    summary: "Application filed — Hudson wine bar concept (Brooklyn, NY) · On-Premises Liquor",
  },
  {
    id: 2,
    state: "TX",
    eventType: "NEW_LICENSE",
    summary: "License issued — Coastal package store (Houston, TX) · Package Store",
  },
  {
    id: 3,
    state: "NY",
    eventType: "NEW_PENDING",
    summary: "Application filed — Neighborhood taqueria (Queens, NY) · Restaurant Wine",
  },
  {
    id: 4,
    state: "TX",
    eventType: "NEW_PENDING",
    summary: "Application filed — Late-night cocktail lounge (Dallas, TX) · Mixed Beverage + Late Hours",
  },
] as any[];
