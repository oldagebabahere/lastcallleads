import type { Metadata } from "next";
import { Footer, Nav } from "@/components/ui";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import ReferLinkGenerator from "@/components/refer-link-generator";

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

        {/* Step 1 — generate YOUR personal referral link */}
        <ReferLinkGenerator />

        <div className="mt-8 rounded-xl border border-leaf/40 bg-leaf/10 p-6">
          <p className="text-sm leading-relaxed text-cream">
            Best part: your referred rep also gets their own referral link once they join.
            The chain compounds. When they pay, your credit is applied automatically —
            no need to email us.
          </p>
          <p className="mt-4 font-mono text-[10px] text-faint">
            QUESTIONS? {PUBLIC_CONFIG.contactEmail.toUpperCase()}
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
