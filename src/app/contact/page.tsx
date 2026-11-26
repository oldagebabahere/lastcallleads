import type { Metadata } from "next";
import { Building2, Mail, ShieldCheck, Sparkles } from "lucide-react";
import ContactForm from "@/components/contact-form";
import { Footer, Nav } from "@/components/ui";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Contact sales, annual billing, Enterprise API & support",
  description:
    "Contact the Last Call Leads team for Annual Prepay (2 months free), All-9 Enterprise + REST API, team seats, billing help, or data corrections.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Sales &amp; Support Desk · Direct Team Replies ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
          Talk to the <span className="italic text-amber">Last Call Leads</span> team.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          Need an Annual Prepay invoice (2 months free), All-9 Enterprise API key, custom state
          rollout, or billing support? Drop a note below — sales inquiries trigger an instant team
          alert so we respond fast.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          <ContactForm />
          <aside className="space-y-4">
            <Info
              icon={Sparkles}
              title="Annual Prepay (2 Months Free)"
              body="Territory $1,290/yr (save $258) or Pro 3-State $2,490/yr (save $498). Corporate card or invoice link sent same day."
            />
            <Info
              icon={Building2}
              title="All-9 Enterprise + REST API"
              body="$499/mo — all 9 live states, unlimited team seats, and a same-day REST API key for HubSpot / Salesforce."
            />
            <Info
              icon={Mail}
              title="Direct Email"
              body={PUBLIC_CONFIG.contactEmail}
              href={`mailto:${PUBLIC_CONFIG.contactEmail}`}
            />
            <Info
              icon={ShieldCheck}
              title="Data Correction & Press"
              body="Share the filing URL + official portal reference and our team updates it promptly."
            />
            <div className="rounded-xl border border-line bg-panel p-5 text-xs leading-relaxed text-faint">
              Sales &amp; annual upgrades: typically answered within a few hours. We do not provide
              legal advice or file liquor applications.
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </main>
  );
}

function Info({ icon: Icon, title, body, href }: { icon: typeof Mail; title: string; body: string; href?: string }) {
  const content = (
    <div className="rounded-xl border border-line bg-panel p-5">
      <Icon className="h-4 w-4 text-amber" />
      <p className="mt-3 font-mono text-[10px] tracking-[0.2em] text-faint">{title.toUpperCase()}</p>
      <p className="mt-1 break-words text-sm leading-relaxed text-cream">{body}</p>
    </div>
  );
  return href ? <a href={href} className="block transition-transform hover:-translate-y-0.5">{content}</a> : content;
}
