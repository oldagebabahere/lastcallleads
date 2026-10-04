// CUSTOMER MANAGER — readable by design (v14.5): 14-16px fonts, bright text,
// colored status pills. The operator's daily tool must be readable on a phone.
import Link from "next/link";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { emailLog, subscribers } from "@/db/schema";
import { adminKeySet, isAdminKey } from "@/lib/auth";
import { desc } from "drizzle-orm";
import { AddCustomer, GenKey, RowButtons, TestEmail } from "./client";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  if (!adminKeySet()) {
    return (
      <main className="min-h-screen px-5 py-28">
        <p className="mx-auto max-w-md text-sm text-smoke">
          Set ADMIN_KEY in your environment variables to open the customer manager.
        </p>
      </main>
    );
  }
  if (!isAdminKey(key ?? null)) {
    return (
      <main className="min-h-screen px-5 py-28">
        <form className="mx-auto max-w-xs space-y-3">
          <input name="key" placeholder="admin key" className="w-full rounded-lg border border-line bg-panel px-4 py-3 text-base text-cream" />
          <button className="w-full rounded-lg bg-amber px-4 py-3 font-mono text-sm font-semibold tracking-[0.1em] text-ink">OPEN</button>
        </form>
      </main>
    );
  }

  await ensureSchema();
  const k = key!;
  const subs = await db
    .select()
    .from(subscribers)
    .orderBy(desc(subscribers.id))
    .limit(200);
  const log = await db
    .select()
    .from(emailLog)
    .orderBy(desc(emailLog.id))
    .limit(25);

  const from = process.env.ALERT_FROM_EMAIL ?? null;
  const ops = process.env.OPS_EMAIL ?? null;
  const resendOk = Boolean(process.env.RESEND_API_KEY);
  const sharedFrom = Boolean(from && from.includes("resend.dev"));
  const fmt = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—";

  const badge = (s: string) =>
    s === "active"
      ? "bg-green-500/15 text-green-300 border border-green-500/30"
      : s === "trial"
        ? "bg-amber/15 text-amber border border-amber/30"
        : s === "waitlist"
          ? "bg-cream/10 text-cream/60 border border-line"
          : "bg-cream/5 text-smoke border border-line";

  return (
    <main className="min-h-screen px-5 pb-20 pt-24">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-sm font-semibold tracking-[0.15em] text-amber">
          [ Customer Manager · control room ]
        </p>
        <h1 className="font-display mt-4 text-4xl font-medium text-cream">
          Customers + email machine
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-cream/70">
          Customer activate/pause karo, email machine test karo, $499 API key
          banao.{" "}
          <Link href={`/dashboard?key=${k}`} className="font-semibold text-amber hover:underline">
            ← control room
          </Link>
        </p>

        {/* ---- email machine panel ---- */}
        <section className="mt-8 rounded-2xl border border-cream/15 bg-panel p-6">
          <p className="font-mono text-sm font-semibold tracking-[0.12em] text-amber">
            EMAIL MACHINE — kyun email nahi aa raha, yahin pata chalega
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className={resendOk ? "font-semibold text-green-300" : "font-semibold text-red-300"}>
              RESEND_API_KEY {resendOk ? "✓ set hai" : "✗ set NAHI (Vercel me daalo)"}
            </span>
            <span className="text-cream/80">
              From email: <span className="font-semibold text-cream">{from ?? "— set nahi —"}</span>
            </span>
            <span className="text-cream/80">
              OPS email: <span className="font-semibold text-cream">{ops ?? "— set nahi —"}</span>
            </span>
          </div>
          {sharedFrom && (
            <p className="mt-4 rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm leading-relaxed text-amber">
              ⚠ From-email abhi <b>resend.dev</b> pe hai — ye SIRF tumhare Resend
              account wale email pe mail kar sakta hai, customers ko NAHI. Fix:
              Resend → Domains → <b>lastcallleads.com</b> verify karo → phir Vercel
              me ALERT_FROM_EMAIL = <b>Last Call Leads &lt;alerts@lastcallleads.com&gt;</b> → Redeploy.
            </p>
          )}
          <div className="mt-5">
            <TestEmail k={k} />
          </div>
          {/* last 25 emails */}
          <div className="mt-6 overflow-x-auto">
            <p className="mb-2 font-mono text-sm font-semibold tracking-[0.12em] text-cream/70">
              LAST 25 EMAILS (naya email har subah 12:00 UTC / shaam 5:30 baje)
            </p>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-cream/50">
                  <th className="py-2 pr-4">Kab (UTC)</th>
                  <th className="py-2 pr-4">Kisko</th>
                  <th className="py-2 pr-4">Subject</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-2.5 pr-4 text-cream/60">{fmt(l.createdAt)}</td>
                    <td className="py-2.5 pr-4 text-cream/90">{l.toEmail}</td>
                    <td className="py-2.5 pr-4 text-cream/70">{l.subject.slice(0, 48)}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`rounded-full px-2.5 py-1 font-mono text-xs ${badge(l.status)}`}>{l.status}</span>
                    </td>
                    <td className="py-2.5 text-cream/60">{(l.detail ?? "").slice(0, 60)}</td>
                  </tr>
                ))}
                {log.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-sm text-cream/60">
                      Abhi koi email log nahi — machine ne kuch bheja hi nahi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- add customer ---- */}
        <section className="mt-6">
          <AddCustomer k={k} />
        </section>

        {/* ---- subscribers table ---- */}
        <section className="mt-6 overflow-x-auto rounded-2xl border border-cream/15 bg-panel p-6">
          <p className="font-mono text-sm font-semibold tracking-[0.12em] text-cream/70">
            SUBSCRIBERS ({subs.length}) — pause = digest band, active = wapas on
          </p>
          <table className="mt-4 w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-cream/50">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">States</th>
                <th className="py-2 pr-4">Trial end</th>
                <th className="py-2 pr-4">Joined</th>
                <th className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-3 pr-4 font-medium text-cream">{s.email}</td>
                  <td className="py-3 pr-4 text-cream/70">{s.plan}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 font-mono text-xs ${badge(s.status)}`}>{s.status}</span>
                  </td>
                  <td className="py-3 pr-4 text-cream/70">{s.states}</td>
                  <td className="py-3 pr-4 text-cream/60">{fmt(s.trialEndsAt)}</td>
                  <td className="py-3 pr-4 text-cream/60">{fmt(s.createdAt)}</td>
                  <td className="py-3 pr-4">
                    <RowButtons k={k} email={s.email} status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ---- enterprise key ---- */}
        <section className="mt-6">
          <GenKey />
        </section>
      </div>
    </main>
  );
}
