import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, Radar, ShieldCheck } from "lucide-react";
import { Footer, Nav } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "About — public-record intelligence for hospitality sales",
  description:
    "Last Call Leads turns official liquor-license filings into timely, practical sales intelligence for distributors and hospitality vendors.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ About · why this exists ]</p>
        <h1 className="font-display mt-5 max-w-3xl text-4xl font-medium leading-tight sm:text-6xl">
          Public records are free.
          <span className="italic text-amber"> Being first is valuable.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-smoke">
          {BRAND.name} monitors official state liquor-license records and turns new applications,
          issuances and status changes into practical alerts for people selling into hospitality.
        </p>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          {[
            [Radar, "Watch", "Official registries are checked on a fixed schedule."],
            [Database, "Normalize", "Messy state codes become one clear, searchable record."],
            [ShieldCheck, "Verify", "Every record preserves its official source for verification."],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Radar;
            return (
              <div key={String(title)} className="bg-panel p-7">
                <I className="h-5 w-5 text-amber" />
                <h2 className="font-display mt-5 text-xl font-medium text-cream">{String(title)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-smoke">{String(body)}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8 text-sm leading-7 text-smoke">
            <section>
              <h2 className="font-display text-2xl font-medium text-cream">What we are—and are not</h2>
              <p className="mt-3">
                We are a monitoring and sales-intelligence service. We are not a government agency,
                law firm, license broker, or application processor. Public records can contain delays
                or errors, so customers should verify important details at the linked official source.
              </p>
            </section>
            <section>
              <h2 className="font-display text-2xl font-medium text-cream">Who it is for</h2>
              <p className="mt-3">
                Beverage distributors, breweries, POS teams, commercial insurance agents, equipment
                vendors and other businesses that need to know which hospitality venues are entering
                the buying window before their doors open.
              </p>
            </section>
            <section>
              <h2 className="font-display text-2xl font-medium text-cream">Corrections and transparency</h2>
              <p className="mt-3">
                If an official record is corrected, send us the filing URL. We will review and
                update our copy. Methodology is available on request.
              </p>
            </section>
          </div>
          <aside className="rounded-xl border border-amber/40 bg-amber/10 p-6">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">CONTACT THE OPERATOR</p>
            <p className="mt-3 text-sm leading-relaxed text-smoke">
              {PUBLIC_CONFIG.legalName}<br />
              <a href={`mailto:${PUBLIC_CONFIG.contactEmail}`} className="text-cream hover:text-amber">
                {PUBLIC_CONFIG.contactEmail}
              </a>
            </p>
            <Link href="/contact" className="mt-5 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-amber hover:underline">
              CONTACT PAGE <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </aside>
        </div>
      </div>
      <Footer />
    </main>
  );
}
