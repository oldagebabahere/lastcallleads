// CUSTOMER MANAGER — the operator's control room for paying customers:
//   • email machine status + TEST button + last-25 email log (debugger)
//   • add/activate/pause customers (manual payments, fixes)
//   • $499 enterprise API key generator
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
        <p className="mx-auto max-w-md font-mono text-xs text-smoke">
          Set ADMIN_KEY in your environment variables to open the customer manager.
        </p>
      </main>
    );
  }
  if (!isAdminKey(key ?? null)) {
    return (
      <main className="min-h-screen px-5 py-28">
        <form className="mx-auto max-w-xs space-y-3">
          <input name="key" placeholder="admin key" className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream" />
          <button className="w-full rounded-md bg-amber px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink">OPEN</button>
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

  const pill = (s: string) =>
    s === "active"
      ? "text-green-400"
      : s === "trial"
        ? "text-amber"
        : s === "waitlist"
          ? "text-faint"
          : "text-smoke";

  return (
    <main className="min-h-screen px-5 pb-20 pt-24">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">[ Customer Manager · control room ]</p>
        <h1 className="font-display mt-4 text-3xl font-medium text-cream">
          Customers + email machine
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smoke">
          Customer activate/pause karo, email machine test karo, $499 API key
          banao.{" "}
          <Link href={`/dashboard?key=${k}`} className="text-amber hover:underline">
            ← control room
          </Link>
        </p>

        {/* ---- email machine panel ---- */}
        <section className="mt-8 rounded-xl border border-line bg-panel p-5">
          <p className="font-mono text-[10px] tracking-[0.15em] text-faint">
            EMAIL MACHINE — kyun email nahi aa raha, yahin pata chalega
          </p>
          <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px]">
            <span className={resendOk ? "text-green-400" : "text-red-400"}>
              RESEND_API_KEY {resendOk ? "✓" : "✗ (Vercel me set karo)"}
            </span>
            <span className="text-smoke">
              ALERT_FROM_EMAIL: <span className="text-cream">{from ?? "— set nahi —"}</span>
            </span>
            <span className="text-smoke">
              OPS_EMAIL: <span className="text-cream">{ops ?? "— set nahi —"}</span>
            </span>
          </div>
          {sharedFrom && (
            <p className="mt-3 rounded-md border border-amber/40 bg-amber/10 p-3 font-mono text-[11px] leading-relaxed text-amber">
              ⚠ from-email abhi bhi resend.dev pe hai — ye SIRF tumhe hi mail kar
              sakta hai, customers ko nahi. Resend → Domains me lastcallleads.com
              verify karo, phir Vercel me ALERT_FROM_EMAIL ={" "}
              {"Last Call Leads <alerts@lastcallleads.com>"} + Redeploy.
            </p>
          )}
          <div className="mt-4">
            <TestEmail k={k} />
          </div>
          {/* last 25 emails */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px]">
              <thead>
                <tr className="text-faint">
                  <th className="py-2 pr-3">WHEN (UTC)</th>
                  <th className="py-2 pr-3">TO</th>
                  <th className="py-2 pr-3">SUBJECT</th>
                  <th className="py-2 pr-3">STATUS</th>
                  <th className="py-2">DETAIL</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-2 pr-3 text-smoke">{fmt(l.createdAt)}</td>
                    <td className="py-2 pr-3 text-cream/80">{l.toEmail}</td>
                    <td className="py-2 pr-3 text-cream/60">{l.subject.slice(0, 48)}</td>
                    <td
                      className={`py-2 pr-3 ${
                        l.status === "sent"
                          ? "text-green-400"
                          : l.status === "dry_run"
                            ? "text-amber"
                            : "text-red-400"
                      }`}
                    >
                      {l.status}
                    </td>
                    <td className="py-2 text-smoke">{(l.detail ?? "").slice(0, 60)}</td>
                  </tr>
                ))}
                {log.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-smoke">
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
        <section className="mt-6 overflow-x-auto rounded-xl border border-line bg-panel p-5">
          <p className="font-mono text-[10px] tracking-[0.15em] text-faint">
            SUBSCRIBERS ({subs.length}) — pause karne pe digest band, active karne pe wapas
          </p>
          <table className="mt-3 w-full text-left font-mono text-[11px]">
            <thead>
              <tr className="text-faint">
                <th className="py-2 pr-3">EMAIL</th>
                <th className="py-2 pr-3">PLAN</th>
                <th className="py-2 pr-3">STATUS</th>
                <th className="py-2 pr-3">STATES</th>
                <th className="py-2 pr-3">TRIAL END</th>
                <th className="py-2 pr-3">JOINED</th>
                <th className="py-2 pr-3">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-2 pr-3 text-cream/80">{s.email}</td>
                  <td className="py-2 pr-3 text-cream/60">{s.plan}</td>
                  <td className={`py-2 pr-3 ${pill(s.status)}`}>{s.status}</td>
                  <td className="py-2 pr-3 text-cream/60">{s.states}</td>
                  <td className="py-2 pr-3 text-smoke">{fmt(s.trialEndsAt)}</td>
                  <td className="py-2 pr-3 text-smoke">{fmt(s.createdAt)}</td>
                  <td className="py-2 pr-3">
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
