import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import Reveal from "@/components/reveal";
import SubscribeForm from "@/components/subscribe-form";
import { Footer, Nav } from "@/components/ui";
import { scoreFiling } from "@/lib/lead-score";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "See a real digest — what lands in your inbox every morning",
  description:
    "A real example of the daily Last Call Leads email: every newly filed bar, restaurant and package store in your territory, with the lead-quality flag and why it matters.",
};

type Evt = {
  id: number;
  state: string;
  eventType: string;
  tradeName: string | null;
  ownerName: string | null;
  city: string | null;
  typeName: string | null;
  occurredAt: Date | null;
};

const HOT_PATTERN = /mixed beverage|package|liquor|full service|bar|restaurant|brewpub|tavern/i;

function isHot(e: Evt): boolean {
  return HOT_PATTERN.test(`${e.typeName ?? ""}`);
}

export default async function SamplePage() {
  await ensureSchema();

  let rows: Evt[] = [];
  try {
    const raw = await db
      .select({
        id: events.id,
        state: events.state,
        eventType: events.eventType,
        tradeName: events.tradeName,
        ownerName: events.ownerName,
        city: events.city,
        typeName: events.typeName,
        occurredAt: events.occurredAt,
      })
      .from(events)
      .where(sql`${events.eventType} = 'NEW_PENDING'`)
      .orderBy(desc(events.occurredAt))
      .limit(6);
    rows = raw as unknown as Evt[];
  } catch {
    rows = [];
  }

  const hotCount = rows.filter(isHot).length;
  // Subject line reflects the states actually present in this sample.
  const stateList = Array.from(new Set(rows.map((r) => r.state)));
  const stateLabel = stateList.length ? stateList.join(" + ") : "TX + NY";
  const count = rows.length || 4;
  const subject = `${count} new filing${count === 1 ? "" : "s"} — ${stateLabel}`;

  // Apply the same scoring the real digest uses, then rank best-first.
  const scored = rows.map((e) => ({
    e,
    score: scoreFiling({
      eventType: e.eventType,
      typeName: e.typeName,
      city: e.city,
      occurredAt: e.occurredAt,
    }),
  }));
  const ranked = [...scored].sort((a, b) => b.score.value - a.score.value);
  const top = ranked[0];

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Sample digest ]</p>
        <h1 className="font-display mt-5 text-3xl font-medium leading-tight sm:text-4xl">
          This is the exact email you get each morning.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-smoke">
          Real formatting, real fields. One short read — then you make calls.
        </p>

        {/* the email mock */}
        <Reveal>
          <div className="mt-10 overflow-hidden rounded-xl border border-line bg-wine-grad">
            {/* email client header */}
            <div className="border-b border-line/70 px-5 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber/40 bg-amber/10">
                  <Mail className="h-4 w-4 text-amber" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-cream">
                    Last Call Leads Alerts
                  </p>
                  <p className="font-mono text-[11px] text-faint">
                    alerts@lastcallleads.com → you@yourcompany.com
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-faint">
                  6:30 AM
                </span>
              </div>
              <p className="mt-3 font-display text-lg font-medium text-cream">
                {subject}
              </p>
            </div>

            {/* subject line shown on mobile-ish */}
            <div className="border-b border-line/70 bg-ink/40 px-5 py-3">
              <p className="font-mono text-[10px] tracking-[0.12em] text-faint">
                SUBJECT LINE
              </p>
              <p className="mt-1 font-mono text-sm text-cream">{subject}</p>
            </div>

            {/* body */}
            <div className="px-5 py-6">
              <p className="font-display text-xl font-medium text-cream">
                {count} new filing{count === 1 ? "" : "s"} in your territories
              </p>
              <p className="mt-2 text-sm leading-relaxed text-smoke">
                {hotCount > 0 ? (
                  <>
                    <span className="font-semibold text-amber">
                      {hotCount} are priority leads
                    </span>{" "}
                    — scored and ranked so you know exactly who to call.
                  </>
                ) : (
                  "Applications filed = buyers deciding in the next 60–90 days. Call first."
                )}
              </p>

              {/* Call-this-one-first block — same as the real digest */}
              {top && (
                <div className="mt-5 rounded-xl border border-amber/50 bg-panel p-5">
                  <p className="font-mono text-[10px] tracking-[0.2em] text-amber">
                    ★ CALL THIS ONE FIRST — SCORE {top.score.value}/100
                  </p>
                  <p className="font-display mt-2 text-lg font-medium text-cream">
                    {top.e.tradeName ?? top.e.ownerName ?? "New venue"}
                    {top.e.city ? ` (${top.e.city})` : ""}
                  </p>
                  <p className="mt-1 font-mono text-[11px] leading-relaxed text-smoke">
                    {top.score.reason}
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-amber">
                    → {top.score.action}
                  </p>
                </div>
              )}

              {/* table header */}
              <div className="mt-6 hidden grid-cols-[64px_90px_1fr_44px] gap-2 border-b border-line pb-2 font-mono text-[9px] tracking-[0.15em] text-faint sm:grid">
                <span>DATE</span>
                <span>SIGNAL</span>
                <span>FILING</span>
                <span>ST</span>
              </div>

              {/* rows */}
              <div className="divide-y divide-line/60">
                {rows.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-sm text-cream">
                      Live examples appear here after the daily sweep.
                    </p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-faint">
                      9 STATES · 32,000+ RECORDS MONITORED
                    </p>
                  </div>
                )}

                {ranked.map(({ e, score }) => {
                  const hot = score.value >= 70;
                  const name = e.tradeName ?? e.ownerName ?? "New venue";
                  const date = e.occurredAt
                    ? new Date(e.occurredAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "";
                  return (
                    <div
                      key={e.id}
                      className="grid gap-2 py-4 sm:grid-cols-[64px_90px_1fr_44px]"
                    >
                      <span className="font-mono text-[11px] text-faint">
                        {date}
                      </span>
                      <span className="font-mono text-[10px] tracking-[0.12em]">
                        <span
                          className={
                            e.eventType === "NEW_PENDING"
                              ? "text-amber"
                              : "text-leaf"
                          }
                        >
                          {e.eventType === "NEW_PENDING" ? "FILED" : "ISSUED"}
                        </span>
                        <span
                          className={`ml-2 rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                            hot
                              ? "border-amber/50 bg-amber/15 text-amber"
                              : "border-line bg-panel2/60 text-smoke"
                          }`}
                        >
                          {score.value}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm text-cream">
                          {name}
                          {e.city ? ` (${e.city})` : ""}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] text-smoke">
                          {e.typeName ?? "Liquor license"}
                        </span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-faint">
                          → {score.reason}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-faint">
                        {e.state}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* footer of email */}
              <div className="mt-6 border-t border-line pt-5">
                <p className="font-mono text-[10px] leading-relaxed text-faint">
                  You are receiving this service email because you@yourcompany.com
                  is subscribed to: TX.
                  <br />
                  Annual option: pay 10 months, get 12. Referral: one paying intro
                  = next month free.
                </p>
                <p className="mt-3 font-mono text-[10px] text-amber">
                  Stop alert emails · Contact support
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* what each line means */}
        <Reveal delay={80}>
          <div className="mt-12">
            <h2 className="font-display text-2xl font-medium text-cream">
              How to read it
            </h2>
            <div className="mt-6 divide-y divide-line border-y border-line">
              {[
                ["FILED", "An application was submitted. The venue is planning right now."],
                ["ISSUED", "A licence was granted. They are closer to opening."],
                ["SCORE 0-100", "How urgently this lead should be called. 70+ means call today."],
                ["★ TOP LEAD", "The single best filing of the day, extracted for you."],
                ["→ why it matters", "One line decoding what kind of buying decision is happening."],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-2 py-4 sm:grid-cols-[160px_1fr]">
                  <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-amber">
                    {k}
                  </span>
                  <span className="text-sm leading-relaxed text-smoke">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* CTA */}
        <Reveal delay={120}>
          <div className="mt-12 rounded-2xl border border-amber/40 bg-wine-card p-7 sm:p-9">
            <h2 className="font-display text-2xl font-medium text-cream">
              Start your 7-day free trial.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-smoke">
              Pick your states, drop your email. Your first digest lands at the next
              morning sweep.
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
            SEE COVERAGE →
          </Link>
          <Link
            href="/snapshot"
            className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            FREE SNAPSHOT →
          </Link>
          <Link
            href="/#pricing"
            className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            PLANS →
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
