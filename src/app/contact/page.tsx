import type { Metadata } from "next";
import { Mail, Newspaper, ShieldCheck } from "lucide-react";
import ContactForm from "@/components/contact-form";
import { Footer, Nav } from "@/components/ui";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Contact sales, support, data corrections & press",
  description:
    "Contact Last Call Leads about sales, billing, technical support, public-record corrections, or press requests.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Contact · real replies ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
          Talk to <span className="italic text-amber">Last Call Leads.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          Sales questions, billing help, data corrections and press are all welcome.
          Messages are stored securely so they are not lost if email delivery has a temporary issue.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
          <ContactForm />
          <aside className="space-y-4">
            <Info icon={Mail} title="Email" body={PUBLIC_CONFIG.contactEmail} href={`mailto:${PUBLIC_CONFIG.contactEmail}`} />
            <Info icon={ShieldCheck} title="Data correction" body="Send the record URL and the official source showing the correction." />
            <Info icon={Newspaper} title="Press & research" body="You may cite our public reports with a link to the source report." />
            <div className="rounded-xl border border-line bg-panel p-5 text-xs leading-relaxed text-faint">
              Typical response target: two US business days. We do not provide legal advice or process liquor-license applications.
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
