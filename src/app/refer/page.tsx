import type { Metadata } from "next";
import Link from "next/link";
import { Gift, Users } from "lucide-react";
import { Footer, Nav } from "@/components/ui";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Refer a rep, get a month free",
  description:
    "Refer another sales rep to Last Call Leads and your next month is on us. One paying introduction = one free month.",
};

export default function ReferPage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Referral · simple and fair ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
          One paying rep. <span className="italic text-amber">One free month.</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-smoke">
          You already know the reps in your territory. If one of them subscribes because
          you mentioned Last Call Leads, your next month is free. Simple, no cap.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-6">
            <Users className="h-5 w-5 text-amber" />
            <h2 className="font-display mt-4 text-xl font-medium text-cream">Step 1</h2>
            <p className="mt-2 text-sm leading-relaxed text-smoke">
              Share this link with a rep you know:
            </p>
            <p className="mt-3 break-all rounded-md border border-line bg-ink px-3 py-2 font-mono text-[11px] text-amber">
              {`https://lastcallleads.com/snapshot`}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel p-6">
            <Gift className="h-5 w-5 text-amber" />
            <h2 className="font-display mt-4 text-xl font-medium text-cream">Step 2</h2>
            <p className="mt-2 text-sm leading-relaxed text-smoke">
              They get a 7-day free trial. If they become a paying customer, email us with
              both email addresses and we mark your next month free.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-leaf/40 bg-leaf/10 p-6">
          <p className="text-sm leading-relaxed text-cream">
            Best part: your referred rep also gets their own referral link once they join.
            The chain compounds.
          </p>
          <Link
            href="/#pricing"
            className="mt-4 inline-block rounded-full bg-amber px-5 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink"
          >
            START FREE TRIAL
          </Link>
          <p className="mt-4 font-mono text-[10px] text-faint">
            QUESTIONS? {PUBLIC_CONFIG.contactEmail.toUpperCase()}
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
