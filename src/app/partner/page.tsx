import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeDollarSign, Link2, Users } from "lucide-react";
import Reveal from "@/components/reveal";
import { Footer, Nav } from "@/components/ui";

export const metadata: Metadata = {
  title: "Partner program — earn 40% recurring for every customer you refer",
  description:
    "Refer distributors, reps and vendors to Last Call Leads and earn 40% of every payment, every month, for as long as they stay. Free to join.",
};

export default function PartnerPage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Partner program · earn while you sleep ]</p>
        <h1 className="font-display mt-5 max-w-2xl text-4xl font-medium leading-tight sm:text-5xl">
          Refer one customer.
          <span className="italic text-amber"> Earn $52 every month, forever.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-smoke">
          You already sell to distributors, bar owners and hospitality businesses.
          Now every time one of them subscribes through your link, you earn{" "}
          <span className="text-cream">40% of the payment — every single month</span>{" "}
          they stay subscribed. No caps, no expiry.
        </p>

        {/* how it works */}
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            [Link2, "Get your link", "Your partner link is unique to you. Share it anywhere — email, group, LinkedIn, your own clients."],
            [Users, "They subscribe", "Anyone who signs up through your link is credited to you — we confirm every referral by email. No paperwork."],
            [BadgeDollarSign, "You earn monthly", "$52 per active customer, every month they pay. Payouts as you grow."],
          ].map(([Icon, title, body], i) => {
            const I = Icon as typeof Link2;
            return (
              <Reveal key={String(title)} delay={i * 80}>
                <div className="h-full rounded-xl border border-line bg-panel p-6">
                  <I className="h-5 w-5 text-amber" />
                  <p className="font-mono mt-4 text-[10px] tracking-[0.2em] text-amber">STEP {i + 1}</p>
                  <h2 className="font-display mt-2 text-xl font-medium text-cream">{String(title)}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-smoke">{String(body)}</p>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* math */}
        <Reveal delay={120}>
          <div className="mt-10 rounded-2xl border border-amber/50 bg-gradient-to-b from-amber/15 to-panel p-8 text-center">
            <p className="font-display text-3xl font-semibold text-cream">
              5 customers = <span className="text-amber">$260/month</span>
            </p>
            <p className="mt-2 text-sm text-smoke">
              10 customers = $520/month · 20 customers = $1,040/month. Passive income from
              a link you share once.
            </p>
            <p className="mt-6 font-mono text-[11px] leading-relaxed tracking-[0.1em] text-faint">
              COMMISSION: 40% RECURRING · FREE TO JOIN · NO CAPS · PAYS AS LONG AS CUSTOMER STAYS
            </p>
          </div>
        </Reveal>

        {/* who should join */}
        <div className="mt-12">
          <h2 className="font-display text-2xl font-medium text-cream">Who earns best</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "Beverage sales reps",
              "POS / Toast / Clover vendors",
              "Commercial insurance agents",
              "Bar & restaurant consultants",
              "Industry group admins",
              "Trade association contacts",
              "Ex-distributor networkers",
            ].map((t) => (
              <span key={t} className="rounded-full border border-line bg-panel px-4 py-2 font-mono text-[11px] tracking-[0.1em] text-smoke">
                {t.toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        {/* join CTA */}
        <Reveal delay={80}>
          <div className="mt-12 rounded-2xl border border-line bg-panel p-8">
            <h2 className="font-display text-2xl font-medium text-cream">Join in one minute</h2>
            <p className="mt-2 text-sm leading-relaxed text-smoke">
              Email us your name and best contact, and we send your partner link. Or sign
              up through the site and mention “partner” in the contact form.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                href="/contact"
                className="flex items-center gap-2 rounded-full bg-amber px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03]"
              >
                BECOME A PARTNER <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/snapshot"
                className="rounded-full border border-line px-6 py-3 font-mono text-[11px] tracking-[0.12em] text-smoke hover:text-cream"
              >
                SEE THE PRODUCT FIRST
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
      <Footer />
    </main>
  );
}
