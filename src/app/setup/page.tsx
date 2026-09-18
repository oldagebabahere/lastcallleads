import { ArrowUpRight, Check } from "lucide-react";
import { Footer, Nav } from "@/components/ui";
import { adminKeySet } from "@/lib/auth";
import { dodoConfigured } from "@/lib/dodo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Setup & system status",
  robots: { index: false },
};

// Plain-English owner manual. Green = done, amber = needs attention.
export default function SetupPage() {
  const checks = {
    database: Boolean(process.env.DATABASE_URL),
    adminKey: adminKeySet(),
    resend: Boolean(process.env.RESEND_API_KEY),
    opsEmail: Boolean(process.env.OPS_EMAIL),
    supportInbox: Boolean(process.env.SUPPORT_INBOX_EMAIL),
    legalIdentity: Boolean(
      process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME &&
        process.env.NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS &&
        process.env.NEXT_PUBLIC_CONTACT_EMAIL
    ),
    unsubscribeSecret: Boolean(
      process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_KEY
    ),
    payments: dodoConfigured(),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-3xl px-5 pt-28 pb-20">
        <p className="eyebrow">[ Owner manual · plain English ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
          Setup &amp; <span className="italic text-amber">system status.</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-smoke">
          This machine is built to run itself. The one-time steps below are everything
          it ever asks of you. Each one is a copy-paste job — no code.
        </p>

        {/* live status board */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <CheckCard ok={checks.database} title="Database" hint="Where filings live" needed="REQUIRED" />
          <CheckCard ok={checks.adminKey} title="Admin password (ADMIN_KEY)" hint="Protects your control room" needed="REQUIRED" />
          <CheckCard ok={checks.resend} title="Email sending (Resend)" hint="Without it, digests are logged but not delivered" needed="OPTIONAL" />
          <CheckCard ok={checks.opsEmail} title="Owner alerts (OPS_EMAIL)" hint="Where the watchdog warns you if a state feed is stale for 48 hours" needed="RECOMMENDED" />
          <CheckCard ok={checks.supportInbox} title="Support inbox" hint="SUPPORT_INBOX_EMAIL receives website contact-form notifications" needed="REQUIRED" />
          <CheckCard ok={checks.legalIdentity} title="Legal/contact identity" hint="Legal name, public support email and valid postal address for policies and email" needed="BEFORE EMAIL" />
          <CheckCard ok={checks.unsubscribeSecret} title="One-click unsubscribe" hint="UNSUBSCRIBE_SECRET; ADMIN_KEY is a fallback" needed="REQUIRED" />
          <CheckCard ok={checks.payments} title="Payments (Dodo Payments)" hint="India-first Merchant of Record — they handle US sales tax, settle to your bank account" needed="OPTIONAL" />
        </div>

        {/* steps */}
        <div className="mt-12 space-y-4">
          <Step
            n={1}
            ok={checks.database}
            title="Put the code online safely"
            body="Upload the project to a private GitHub repository. For a zero-budget validation launch use Netlify Free. Vercel Hobby officially allows non-commercial use only, so use Vercel Pro once this is a paid business."
            links={[{ label: "github.com", href: "https://github.com" }, { label: "netlify.com", href: "https://netlify.com" }, { label: "vercel.com", href: "https://vercel.com" }]}
          />
          <Step
            n={2}
            ok={checks.database}
            title="Give it a database (free to begin)"
            body="Create a Neon project and copy its connection string. In your web host's Environment Variables add DATABASE_URL with that string. The free storage cap is 0.5 GB, so monitor usage and upgrade before 70%."
            links={[{ label: "neon.tech", href: "https://neon.tech" }]}
          />
          <Step
            n={3}
            ok={checks.adminKey}
            title="Set secrets and your admin password"
            body="In the host add ADMIN_KEY, NEXT_PUBLIC_SITE_URL, and OPS_EMAIL. ADMIN_KEY opens /dashboard?key=YOUR_PASSWORD. Keep it private. Tables create themselves on the first run."
          />
          <Step
            n={4}
            ok
            title="Switch on the automatic schedule"
            body="On Netlify, add the same secrets in GitHub Actions and enable the included workflow. On Vercel Pro, vercel.json handles it. Daily: pull Texas + New York and send digests. Monday: trim old logs and check for silent failures. Use only one main scheduler."
          />
          <Step
            n={5}
            ok={checks.resend}
            title="Switch on real email delivery"
            body="Create a Resend account, verify the domain, and add RESEND_API_KEY plus ALERT_FROM_EMAIL to the host and scheduler. Add OPS_EMAIL so the watchdog can warn you. Until then, digests are logged as dry runs."
            links={[{ label: "resend.com", href: "https://resend.com" }]}
          />
          <Step
            n={6}
            ok={checks.payments}
            title="Switch on payments (Dodo Payments — pre-wired)"
            body="Dodo Payments acts as Merchant of Record for US sales tax/VAT and settles straight to an Indian bank account. Add three values — DODO_API_KEY, DODO_PRODUCT_ID and DODO_WEBHOOK_SECRET — plus a webhook pointing at /api/webhooks/dodopayments. Until then you can still onboard closed clients manually from the control room."
            links={[{ label: "dodopayments.com", href: "https://dodopayments.com" }]}
          />
          <Step
            n={7}
            ok
            title="Attach and protect your domain (~$10/year)"
            body="Buy the domain, attach it in Netlify or Vercel Pro, and set NEXT_PUBLIC_SITE_URL. Turn on auto-renew, two-factor authentication, and save recovery codes offline."
          />
          <Step
            n={8}
            ok={checks.legalIdentity && checks.supportInbox && checks.unsubscribeSecret}
            title="Complete trust and email compliance"
            body="Set NEXT_PUBLIC_CONTACT_EMAIL=support@lastcallleads.com, SUPPORT_INBOX_EMAIL to the private inbox you read, NEXT_PUBLIC_BUSINESS_LEGAL_NAME to the actual operator name, NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS to a valid mailing address, and a long random UNSUBSCRIBE_SECRET. Live digest sending is blocked until the postal address exists."
          />
        </div>

        <div className="mt-12 rounded-xl border border-amber/40 bg-amber/10 p-6">
          <p className="font-display text-xl font-medium">Weekly routine (5 minutes)</p>
          <p className="mt-2 text-sm leading-relaxed text-smoke">
            Open <span className="font-mono text-xs text-amber">/dashboard?key=YOUR_PASSWORD</span> →
            if every source is green and the last emails say SENT, close the tab. Temporary
            outages retry on the next sweep; a government field/URL change still needs a code repair.
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}

function CheckCard({ ok, title, hint, needed }: { ok: boolean; title: string; hint: string; needed: string }) {
  return (
    <div className={`rounded-xl border p-5 ${ok ? "border-leaf/40 bg-leaf/5" : "border-amber/40 bg-amber/5"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-cream">{title}</p>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] tracking-[0.15em] ${ok ? "bg-leaf/15 text-leaf" : "bg-amber/15 text-amber"}`}>
          {ok && <Check className="h-3 w-3" />}
          {ok ? "READY" : needed}
        </span>
      </div>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-smoke">{hint}</p>
    </div>
  );
}

function Step({
  n,
  ok,
  title,
  body,
  links,
}: {
  n: number;
  ok?: boolean;
  title: string;
  body: string;
  links?: { label: string; href: string }[];
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-line bg-panel p-5 sm:gap-6 sm:p-6">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-xs ${
            ok ? "bg-leaf/15 text-leaf" : "border border-line text-faint"
          }`}
        >
          {String(n).padStart(2, "0")}
        </span>
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg font-medium text-cream">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-smoke">{body}</p>
        {links && (
          <div className="mt-3 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-smoke transition-colors hover:border-amber/50 hover:text-amber"
              >
                {l.label} <ArrowUpRight className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
