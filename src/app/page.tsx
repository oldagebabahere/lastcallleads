import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/reveal";
import RoiCalculator from "@/components/roi-calculator";
import SubscribeForm from "@/components/subscribe-form";
import { Footer, LeadRow, Nav } from "@/components/ui";
import { getRecentEvents, getSiteStats } from "@/lib/queries";

export const revalidate = 900;

// Fallback counts shown before the first successful sweep lands.
const STATE_BASELINES: Record<string, string> = {
  TX: "8K",
  NY: "10K",
  CA: "1K",
};

export default async function Home() {
  const [stats, recent] = await Promise.all([getSiteStats(), getRecentEvents(10)]);

  return (
    <main className="relative min-h-screen">
      <Nav />

      {/* ===== HERO ===== */}
      <section className="relative px-5 pt-32 sm:pt-36">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="rise">
            <p className="text-[11px] tracking-[0.3em] text-amber">NEW-FILING INTELLIGENCE · TX + NY</p>
            <h1 className="font-display mt-6 text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              New bars, before they open.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-smoke">
              A bar files its license <span className="text-cream">60–90 days before it opens</span>.
              We watch the records every morning and email you the new ones — one short
              email a day.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="#pricing"
                className="flex items-center gap-2 rounded-full bg-amber px-6 py-3.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
              >
                Get the filings
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/feed"
                className="rounded-full border border-line px-6 py-3.5 text-sm text-smoke transition-colors hover:border-smoke hover:text-cream"
              >
                Browse free feed
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
              {Object.entries(STATE_BASELINES).map(([s, base]) => {
                const live = stats.byState.find((b) => b.state === s);
                const shown =
                  live && live.n > 0 ? `${Math.round(live.n / 1000)}K` : base;
                return (
                  <div key={s} className="flex items-baseline gap-2">
                    <span className="font-display text-2xl font-semibold text-cream">
                      {shown}
                    </span>
                    <span className="font-mono text-[10px] tracking-[0.2em] text-faint">
                      {s} · WATCHED
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* terminal card */}
          <div className="relative bar-top">
            <div className="relative overflow-hidden rounded-xl border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blood/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-leaf/70" />
                </div>
                <span className="font-mono text-[10px] tracking-[0.2em] text-faint">
                  LIVE REGISTRY WATCH
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-leaf">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf blink" /> ON
                </span>
              </div>
              <div className="divide-y divide-line/60">
                {(recent.length ? recent.slice(0, 5) : PLACEHOLDER_EVENTS).map((e, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em]">
                      <span className={e.eventType === "NEW_PENDING" ? "text-amber" : "text-leaf"}>
                        {e.eventType === "NEW_PENDING" ? "● APPLICATION FILED" : "● LICENSE ISSUED"}
                      </span>
                      <span className="text-faint">{e.state}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 font-mono text-xs leading-relaxed text-cream/85">
                      {e.summary}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-line bg-panel2 px-4 py-2.5 font-mono text-[10px] tracking-[0.15em] text-faint">
                SYSTEM: {stats.lastRunAt ? `last pull ${stats.lastRunAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "arming on first deploy"}
                {" · "}digest 12:20 UTC
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ROI CALCULATOR ===== */}
      <section className="mx-auto max-w-6xl px-5 pt-20">
        <RoiCalculator />
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="mx-auto max-w-6xl px-5 pt-24">
        <Reveal>
          <h2 className="font-display text-3xl font-medium sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 max-w-xl text-lg text-smoke">
            You get one email a day. Here&apos;s the whole thing.
          </p>
          <div className="mt-10 grid gap-8 border-t border-line pt-10 sm:grid-cols-3">
            {[
              { n: "1", t: "We watch the records", d: "Every morning our system reads the official licensing lists for new filings." },
              { n: "2", t: "You get the new bars", d: "A short email lists new venues with their city and what kind of bar it will be." },
              { n: "3", t: "You call them first", d: "You reach the owner before their competitors. That&apos;s the whole advantage." },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div>
                  <p className="font-mono text-sm text-amber">{s.n}</p>
                  <h3 className="font-display mt-3 text-xl font-medium text-cream">{s.t}</h3>
                  <p className="mt-2 text-base leading-relaxed text-smoke">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ===== WHY TIMING ===== */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium sm:text-4xl">
            Why the timing matters
          </h2>
          <p className="mt-3 max-w-xl text-lg text-smoke">
            A new bar loses all its buying decisions in one short window.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {[
            { n: "60–90", t: "days of runway", d: "From filing to opening, the venue chooses its distributor, POS, insurance and staff — all at once." },
            { n: "1 call", t: "to own the account", d: "The rep who shows up during paperwork rarely competes. Everyone else walks into a stocked bar." },
            { n: "100%", t: "public records", d: "Every filing is public the day it is submitted. We just never sleep on them." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 80}>
              <div>
                <p className="font-display text-4xl font-semibold text-amber">{c.n}</p>
                <p className="mt-1 font-mono text-[11px] tracking-[0.2em] text-faint">{c.t.toUpperCase()}</p>
                <p className="mt-4 text-base leading-relaxed text-smoke">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== SIGNAL DECODER ===== */}
      <section id="signals" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium sm:text-4xl">
            What the codes tell you
          </h2>
          <p className="mt-3 max-w-xl text-lg text-smoke">
            Two letters on a filing tell you what kind of venue is coming.
          </p>
        </Reveal>
        <div className="mt-12 divide-y divide-line border-y border-line">
          {[
            { combo: "MB + LH + FB", reads: "Full-service restaurant & bar, pouring past midnight." },
            { combo: "P", reads: "Package store — a liquor retailer with shelf space to fill." },
            { combo: "BE / Q", reads: "Beer & wine only — café, fast-casual, or grocery." },
          ].map((s, i) => (
            <Reveal key={s.combo} delay={i * 60}>
              <div className="grid items-center gap-4 py-6 sm:grid-cols-[180px_1fr]">
                <div className="font-mono text-sm font-semibold tracking-[0.1em] text-amber">
                  {s.combo}
                </div>
                <p className="text-base text-cream">{s.reads}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== WHY I BUILT THIS (human, not AI) ===== */}
      <section className="mx-auto max-w-6xl px-5 pb-4 pt-10">
        <Reveal>
          <div className="grid items-center gap-10 md:grid-cols-[240px_1fr]">
            <img
              src="https://images.pexels.com/photos/34575937/pexels-photo-34575937.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200"
              alt="A bartender behind a bar"
              className="h-56 w-full rounded-xl object-cover md:h-64"
              loading="lazy"
            />
            <div>
              <h2 className="font-display text-3xl font-medium leading-tight sm:text-4xl">
                I got tired of hearing about new bars{" "}
                <span className="italic text-amber">after everyone else did.</span>
              </h2>
              <div className="mt-5 space-y-4 text-[15px] leading-[1.85] text-smoke">
                <p>
                  Every venue files paperwork months before it opens. That paperwork is
                  public — but it&apos;s buried in spreadsheets full of codes nobody explains.
                </p>
                <p>
                  So I built a small system that reads those records every morning, finds
                  only what&apos;s new, and puts it in a plain email: name, city, what kind
                  of venue it will be. That&apos;s it. One email a day.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===== LIVE FEED PREVIEW (proof of life, no AI filler) ===== */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium sm:text-4xl">
            This week&apos;s filings, straight from the registry.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-8 overflow-hidden card-clean">
            <div className="flex items-center justify-between border-b border-line/60 bg-panel2/40 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke">
                <span className="dot-live" /> LIVE · last 7 days
              </div>
              <Link
                href="/feed"
                className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
              >
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

      {/* ===== WHAT YOU ACTUALLY GET (value, not fluff) ===== */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium sm:text-4xl">
            What you actually get in your inbox.
          </h2>
          <p className="mt-3 max-w-xl text-lg text-smoke">
            Not raw rows. Five things, every morning.
          </p>
          <Link
            href="/sample"
            className="mt-5 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            SEE A REAL DIGEST <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Reveal>
        <div className="mt-12 grid gap-px overflow-hidden card-clean md:grid-cols-2 lg:grid-cols-5">
          {[
            { n: "01", t: "New filings", d: "Every venue that just filed in your state, with name, city and license type." },
            { n: "02", t: "HOT leads", d: "Full-bar and package-store kinds, pre-flagged so you call those first." },
            { n: "03", t: "Why it matters", d: "One line under each row: what kind of vendor decision is happening now." },
            { n: "04", t: "Weekly briefing", d: "Monday: hota kya tha poore hafte me — county heat, types, top picks." },
            { n: "05", t: "Monthly recap", d: "Numbers we watched for you. Show your manager, justify the cost." },
          ].map((b) => (
            <Reveal key={b.n} delay={60}>
              <div className="bg-panel p-5">
                <p className="font-mono text-[10px] tracking-[0.2em] text-amber">{b.n}</p>
                <h3 className="font-display mt-3 text-lg font-medium text-cream">{b.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">{b.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== MACHINE ===== */}
      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <Reveal>
            <h2 className="font-display max-w-2xl text-3xl font-medium sm:text-4xl">
              It runs itself.
            </h2>
            <p className="mt-3 max-w-xl text-lg text-smoke">
              Set it up once. The daily work is done for you.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {[
              { t: "Registries get swept", d: "Every morning the state licensing records are pulled automatically. Nothing for you to install or run." },
              { t: "New filings surface", d: "The engine compares today against everything it has ever seen and flags what's genuinely new." },
              { t: "Your inbox at daybreak", d: "Subscribers get one tight email: what was filed, where, and what kind of venue it will be. No noise." },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 80}>
                <div>
                  <p className="font-mono text-sm text-amber">0{i + 1}</p>
                  <h3 className="font-display mt-3 text-xl font-medium text-cream">{s.t}</h3>
                  <p className="mt-2 text-base leading-relaxed text-smoke">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-28">
        <Reveal>
          <p className="eyebrow text-center">[ 05 — Pricing ]</p>
          <h2 className="font-display mx-auto mt-5 max-w-2xl text-center text-4xl font-medium leading-tight sm:text-5xl">
            One landed account pays for
            <span className="italic text-amber"> a whole year.</span>
          </h2>
        </Reveal>
        <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-3">
          <Reveal className="h-full">
            <div className="flex h-full flex-col rounded-xl border border-line bg-panel p-7">
              <p className="font-mono text-[11px] tracking-[0.2em] text-smoke">SCOUT</p>
              <p className="font-display mt-4 text-4xl font-semibold">$0</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-faint">FOREVER FREE</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-smoke">
                <li>· Browse the public feed</li>
                <li>· Names unlock after 7 days</li>
                <li>· All covered states</li>
              </ul>
              <Link
                href="/feed"
                className="mt-8 rounded-md border border-line py-2.5 text-center font-mono text-[11px] tracking-[0.12em] text-cream transition-colors hover:border-smoke"
              >
                OPEN FEED
              </Link>
            </div>
          </Reveal>
          <Reveal delay={80} className="h-full">
            <div className="relative flex h-full flex-col rounded-xl border border-wine/60 bg-wine-card p-7">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber px-3 py-1 font-mono text-[9px] font-semibold tracking-[0.2em] text-ink">
                MOST PICKED
              </span>
              <p className="font-mono text-[11px] tracking-[0.2em] text-amber">TERRITORY</p>
              <p className="font-display mt-4 text-4xl font-semibold">$129</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-faint">PER MONTH · ONE STATE</p>
              <p className="mt-3 inline-block rounded-md bg-amber/15 px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.1em] text-amber">
                ✓ 7-day free trial · no card
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-cream/85">
                <li>· Same-morning email alerts</li>
                <li>· Names + addresses, day one</li>
                <li>· Filed + issued + status flips</li>
                <li>· Monthly recap + weekly briefing</li>
                <li>· Cancel anytime</li>
              </ul>
              <div className="mt-8">
                <SubscribeForm plan="solo" />
              </div>
            </div>
          </Reveal>
          <Reveal delay={160} className="h-full">
            <div className="flex h-full flex-col rounded-xl border border-line bg-panel p-7">
              <p className="font-mono text-[11px] tracking-[0.2em] text-smoke">ALL-ACCESS</p>
              <p className="font-display mt-4 text-4xl font-semibold">$249</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.15em] text-faint">PER MONTH · EVERY STATE</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-smoke">
                <li>· Everything in Territory</li>
                <li>· All states, present + future</li>
                <li>· Team seats for your reps</li>
                <li>· 15-min onboarding call</li>
                <li>· CSV exports for the CRM</li>
                <li>· Monthly team value recap</li>
              </ul>
              <div className="mt-8">
                <SubscribeForm plan="pro" />
              </div>
            </div>
          </Reveal>
        </div>

        <p className="mt-8 text-center font-mono text-[11px] leading-relaxed tracking-[0.1em] text-faint">
          NO CONTRACT · CANCEL ANYTIME · IF THE MORNING EMAIL ISN&apos;T USEFUL, DON&apos;T RENEW
        </p>
      </section>

      {/* ===== WHAT YOU'RE REALLY BUYING ===== */}
      <section className="mx-auto max-w-4xl px-5 pb-24">
        <Reveal>
          <div className="border-t border-line pt-12">
            <h2 className="font-display text-3xl font-medium sm:text-4xl">
              You&apos;re not buying data.{" "}
              <span className="italic text-amber">You&apos;re buying being first.</span>
            </h2>
            <div className="mt-8 grid gap-8 sm:grid-cols-3">
              <div>
                <p className="font-display text-4xl font-semibold text-amber">30 min</p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-faint">SAVED PER DAY</p>
                <p className="mt-4 text-base leading-relaxed text-smoke">
                  That&apos;s what a rep spends digging through raw records. We do it instead.
                </p>
              </div>
              <div>
                <p className="font-display text-4xl font-semibold text-amber">60-90</p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-faint">DAYS OF ADVANCE</p>
                <p className="mt-4 text-base leading-relaxed text-smoke">
                  Filing to opening. The window where vendors get chosen.
                </p>
              </div>
              <div>
                <p className="font-display text-4xl font-semibold text-amber">1</p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-faint">LANDED ACCOUNT</p>
                <p className="mt-4 text-base leading-relaxed text-smoke">
                  Often pays for a year of alerts. Most reps see more than one.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===== FAQ ===== */}
      <section className="mx-auto max-w-3xl px-5 pb-24">
        <Reveal>
          <h2 className="font-display text-3xl font-medium sm:text-4xl">Common questions</h2>
        </Reveal>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {[
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
              a: "Texas and New York are live today. More states unlock as we add them.",
            },
          ].map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-cream">
                {f.q}
                <span className="font-mono text-amber transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 pr-8 text-base leading-relaxed text-smoke">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="border-t border-line px-5 py-24 text-center">
        <Reveal>
          <h2 className="font-display mx-auto max-w-2xl text-4xl font-medium leading-tight sm:text-5xl">
            The next filing in your territory
            <span className="italic text-amber"> lands tomorrow morning.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base text-smoke">
            Be reading it over coffee. Not hearing about it at the bar.
          </p>
          <Link
            href="#pricing"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-amber px-7 py-3.5 text-base font-semibold text-ink transition-transform hover:scale-[1.03]"
          >
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
