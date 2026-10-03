import { desc, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { contactMessages, emailLog, events, ingestRuns, licenses, subscribers } from "@/db/schema";
import { buildLeadSheet } from "@/lib/leadsheet";
import { adminKeySet, isAdminKey } from "@/lib/auth";
import { dodoConfigured } from "@/lib/dodo";
import RunButtons from "@/components/run-buttons";
import SubscriberActions from "@/components/subscriber-actions";
import AddClientForm from "@/components/add-client-form";
import FirstCustomerPlaybook from "@/components/first-customer-playbook";
import { EventBadge } from "@/components/ui";
import { fmtDate } from "@/lib/fmt";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Control room", robots: { index: false } };

const SOURCE_LABELS: Record<string, string> = {
  "tx-pending": "Texas · applications",
  "tx-active": "Texas · licenses issued",
  "ny-pending": "New York · applications",
  "ny-active": "New York · licenses issued",
  ca: "California · full export",
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  if (!adminKeySet()) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-medium">One tiny step first.</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-smoke">
          Your control room is locked until you set an <Code>ADMIN_KEY</Code> password in
          your hosting provider&apos;s Environment Variables.
          Pick a strong unique value, save, redeploy, then come back here as:
        </p>
        <p className="mt-4 rounded-lg border border-line bg-panel px-4 py-3 font-mono text-xs text-amber">
          yourdomain.com/dashboard?key=YOUR_PASSWORD
        </p>
      </Shell>
    );
  }

  if (!isAdminKey(key ?? null)) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-medium">Control room</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-smoke">
          Enter your admin password. Bookmark the next page — that link is your
          permanent control room.
        </p>
        <form method="get" className="mt-6 flex max-w-sm gap-2">
          <input
            name="key"
            type="password"
            autoFocus
            placeholder="Your ADMIN_KEY"
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3.5 py-2.5 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none"
          />
          <button className="rounded-md bg-amber px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink">
            OPEN
          </button>
        </form>
      </Shell>
    );
  }

  // Goldmine: latest reporting period per venue, biggest first.
  let goldmine: {
    permit: string;
    name: string | null;
    city: string | null;
    total: number;
    liquor: number | null;
    wine: number | null;
    beer: number | null;
  }[] = [];
  try {
    const r = await pool.query(
      `SELECT DISTINCT ON (permit) permit, trade_name AS name, city, total, liquor, wine, beer
       FROM venue_receipts ORDER BY permit, period_end DESC, total DESC`
    );
    goldmine = r.rows
      .map((x: Record<string, unknown>) => ({
        permit: String(x.permit),
        name: (x.name as string) ?? null,
        city: (x.city as string) ?? null,
        total: Number(x.total ?? 0),
        liquor: x.liquor === null ? null : Number(x.liquor),
        wine: x.wine === null ? null : Number(x.wine),
        beer: x.beer === null ? null : Number(x.beer),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  } catch {
    goldmine = [];
  }

  // ===== authorized =====
  let ready = true;
  let byState: { state: string; n: number }[] = [];
  let runRows: (typeof ingestRuns.$inferSelect)[] = [];
  let mailRows: (typeof emailLog.$inferSelect)[] = [];
  let subRows: (typeof subscribers.$inferSelect)[] = [];
  let messageRows: (typeof contactMessages.$inferSelect)[] = [];
  let leadSheet: Awaited<ReturnType<typeof buildLeadSheet>> | null = null;
  let eventCount = 0;
  let subCount = 0;
  let dbError = "";
  try {
    await ensureSchema();
    [byState, runRows, mailRows, subRows, messageRows] = await Promise.all([
      db
        .select({ state: licenses.state, n: sql<number>`count(*)::int` })
        .from(licenses)
        .groupBy(licenses.state),
      db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(40),
      db.select().from(emailLog).orderBy(desc(emailLog.id)).limit(10),
      db.select().from(subscribers).orderBy(desc(subscribers.id)).limit(50),
      db.select().from(contactMessages).orderBy(desc(contactMessages.id)).limit(20),
    ]);
    const [ev, su] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(events),
      db.select({ n: sql<number>`count(*)::int` }).from(subscribers),
    ]);
    eventCount = ev[0]?.n ?? 0;
    subCount = su[0]?.n ?? 0;
    leadSheet = await buildLeadSheet("TX", 7);
  } catch (err) {
    ready = false;
    dbError = err instanceof Error ? err.message : String(err);
  }

  // last run per source
  const lastBySource = new Map<string, (typeof runRows)[number]>();
  for (const r of runRows) {
    if (!lastBySource.has(r.source)) lastBySource.set(r.source, r);
  }

  const resendSet = Boolean(process.env.RESEND_API_KEY);
  const key2 = key!;

  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-line bg-panel/50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          <div>
            <p className="eyebrow">[ Private · bookmark this URL ]</p>
            <h1 className="font-display mt-1 text-2xl font-medium">
              Control <span className="text-amber">room</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.15em]">
            <StatusDot ok={ready} label={ready ? "DATABASE OK" : "DATABASE PROBLEM"} />
            <StatusDot ok={resendSet} label={resendSet ? "EMAIL LIVE" : "EMAIL DRY-RUN"} />
            <StatusDot ok={dodoConfigured()} label={dodoConfigured() ? "BILLING LIVE" : "BILLING OFF"} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5">
        {!ready && (
          <div className="mt-6 rounded-lg border border-blood/40 bg-blood/10 p-4 font-mono text-xs leading-relaxed text-blood">
            Database said: {dbError} — check DATABASE_URL in your hosting settings.
          </div>
        )}

        {/* stat cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          <Stat label="Records watched" value={byState.reduce((a, b) => a + b.n, 0).toLocaleString()} sub={byState.map((b) => `${b.state} ${b.n.toLocaleString()}`).join(" · ") || "—"} />
          <Stat label="Filings captured" value={eventCount.toLocaleString()} sub="all time" />
          <Stat label="Subscribers" value={subCount.toLocaleString()} sub="waitlist + active" />
          <Stat
            label="Automation"
            value={lastBySource.size ? "Running" : "Armed"}
            sub={
              lastBySource.size
                ? `last sweep ${fmtDate(lastBySource.entries().next().value?.[1]?.startedAt ?? null)}`
                : "fires 12:00 UTC daily"
            }
          />
        </div>

        {/* prospect finder link */}
        <div className="mt-4 rounded-xl border border-amber/30 bg-amber/5 p-4">
          <a href={`/dashboard/prospects?key=${key2}`} className="font-mono text-[11px] font-semibold tracking-[0.15em] text-amber hover:underline">
            → PROSPECT FINDER — tumhare customers ka unlimited daily list (attorneys / insurance / beverage) — CSV
          </a>
          <span className="mx-2 text-faint">·</span>
          <a href={`/dashboard/map?key=${key2}`} className="font-mono text-[11px] font-semibold tracking-[0.15em] text-amber hover:underline">
            MAP VIEW — saare leads pin-map pe
          </a>
        </div>

        {/* first customer playbook */}
        <section className="mt-8">
          {/* ================= GOLDMINE — top venues by alcohol revenue ================= */}
        <section className="mt-10 border-t border-line pt-8">
          <SectionTitle>Goldmine — biggest fish first</SectionTitle>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-smoke">
            Texas Comptroller publishes every venue&apos;s monthly alcohol receipts.
            These are the accounts worth a phone call before anyone else — sorted
            by revenue, refreshed daily.
          </p>
          {goldmine.length === 0 ? (
            <p className="rounded-xl border border-line px-6 py-8 font-mono text-xs text-smoke">
              No receipts data yet — it loads on the next daily sweep (or press RUN above).
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-panel font-mono text-[9px] tracking-[0.18em] text-faint">
                    <th className="px-4 py-3">VENUE</th>
                    <th className="px-4 py-3">CITY</th>
                    <th className="px-4 py-3 text-right">ALCOHOL / MO</th>
                    <th className="hidden px-4 py-3 text-right sm:table-cell">L/W/B SPLIT</th>
                  </tr>
                </thead>
                <tbody>
                  {goldmine.map((v) => (
                    <tr key={v.permit} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2.5 text-cream">{v.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-smoke">{v.city ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber">
                        ${Math.round(v.total).toLocaleString()}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right font-mono text-[11px] text-faint sm:table-cell">
                        {[v.liquor, v.wine, v.beer]
                          .map((x) => (x ? `$${Math.round(x / 1000)}k` : "—"))
                          .join(" / ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ================= SYSTEM STATUS (owner manual, moved from /setup) ================= */}
        <section className="mt-10 border-t border-line pt-8">
          <SectionTitle>System status — the owner manual</SectionTitle>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-smoke">
            Everything the machine needs is below. Green = done. Amber = add it in your
            hosting provider&apos;s Environment Variables, then redeploy. No code, ever.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { ok: Boolean(process.env.DATABASE_URL), title: "Database", hint: "Where filings live" },
              { ok: isAdminKey(key ?? null), title: "Admin password", hint: "ADMIN_KEY set + you used it" },
              { ok: Boolean(process.env.RESEND_API_KEY), title: "Email (Resend)", hint: "Daily digests go out with this" },
              { ok: Boolean(process.env.OPS_EMAIL), title: "Ops email", hint: "Where watchdog alerts land" },
              {
                ok: Boolean(
                  process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME &&
                    process.env.NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS &&
                    process.env.NEXT_PUBLIC_CONTACT_EMAIL
                ),
                title: "Legal identity",
                hint: "Legal name + postal address + contact (CAN-SPAM)",
              },
              { ok: Boolean(process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_KEY), title: "Unsubscribe secret", hint: "Signs subscriber links" },
              { ok: dodoConfigured(), title: "Payments (Dodo)", hint: "Checkout + webhooks" },
              { ok: Boolean(process.env.CRON_SECRET), title: "Cron secret", hint: "Protects scheduled jobs" },
            ].map((c) => (
              <div
                key={c.title}
                className={`rounded-xl border p-4 ${c.ok ? "border-leaf/30 bg-leaf/5" : "border-amber/40 bg-amber/5"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-cream">{c.title}</p>
                  <span className={`font-mono text-[9px] tracking-[0.15em] ${c.ok ? "text-leaf" : "text-amber"}`}>
                    {c.ok ? "DONE" : "NEEDED"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] leading-relaxed text-smoke">{c.hint}</p>
              </div>
            ))}
          </div>
        </section>

        <FirstCustomerPlaybook />
        </section>

        {/* source health */}
        <section className="mt-10">
          <SectionTitle>Source health</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(SOURCE_LABELS).map(([id, label]) => {
              const last = lastBySource.get(id);
              const ageH = last ? (Date.now() - new Date(last.startedAt).getTime()) / 3_600_000 : null;
              const healthy = Boolean(last?.ok) && ageH !== null && ageH < 48;
              return (
                <div key={id} className="rounded-xl border border-line bg-panel p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-cream">{label}</p>
                    <StatusDot ok={healthy} small label={last ? (last.ok ? "OK" : "FAIL") : "NEW"} />
                  </div>
                  <p className="mt-3 font-mono text-[11px] leading-relaxed text-smoke">
                    {last
                      ? `Last: ${fmtDate(last.startedAt)} · ${last.rowsSeen.toLocaleString()} rows · +${last.newEvents} filings`
                      : "Never pulled — runs tomorrow at 12:00 UTC, or use the buttons below."}
                  </p>
                  {last?.error && (
                    <p className="mt-2 line-clamp-3 font-mono text-[10px] leading-relaxed text-blood">{last.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* manual controls */}
        <section className="mt-10 rounded-xl border border-line bg-panel p-6">
          <SectionTitle>Manual override (for testing / showing off)</SectionTitle>
          <RunButtons adminKey={key2} />
        </section>

        {/* lead lab — the machine's auto-generated outreach list */}
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>Lead lab · auto-generated · last 7 days (TX)</SectionTitle>
            <a
              href={`/api/admin/leadsheet?key=${key2}&state=TX&days=7&format=csv`}
              className="-mt-4 mb-4 rounded-md border border-amber/50 bg-amber/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] text-amber transition-transform hover:scale-[1.03]"
            >
              DOWNLOAD CSV ↓
            </a>
          </div>
          <p className="-mt-2 mb-4 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-faint">
            THE MACHINE&apos;S JOB: whenever new filings land in a county, the licensed
            wholesalers/distributors there show up here automatically. YOUR JOB: email/call them.
          </p>
          {!leadSheet ? (
            <p className="rounded-xl border border-line px-6 py-8 font-mono text-xs text-smoke">
              No lead sheet yet — pull the sources first, then this fills in.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              {leadSheet.counties.length === 0 && (
                <p className="px-6 py-8 font-mono text-xs leading-relaxed text-smoke">
                  No new pending filings in the last 7 days. Once data is pulled this
                  list refills itself. (Runs every sweep — zero manual work.)
                </p>
              )}
              {leadSheet.counties.map((c) => (
                <details key={c.county} className="group border-b border-line/70 last:border-0" open={c.filings >= 3}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-panel">
                    <span className="flex items-baseline gap-3">
                      <span className="text-base font-medium text-cream">{c.county} County</span>
                      <span className="font-mono text-[11px] text-amber">
                        {c.filings} NEW FILINGS
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-faint group-open:rotate-45">+</span>
                  </summary>
                  <div className="grid gap-2 bg-panel2/60 px-4 py-4 sm:grid-cols-2">
                    {c.distributors.length === 0 && (
                      <p className="font-mono text-xs text-smoke">
                        Is county mein trackable distributor nahi mila — asli leads ke liye
                        county badlo ya CSV check karo.
                      </p>
                    )}
                    {c.distributors.map((name, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-line bg-ink px-3 py-2">
                        <span className="truncate text-sm text-cream">{name}</span>
                        <span className="shrink-0 font-mono text-[10px] text-smoke">
                          {c.phones[i] ?? "no phone"}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

        {/* subscribers — the money table */}
        <section className="mt-10">
          <SectionTitle>Subscribers (money table)</SectionTitle>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-panel p-5">
              <p className="font-mono text-[10px] tracking-[0.22em] text-faint">TOTAL REFERRED IN</p>
              <p className="font-display mt-2 text-3xl font-semibold text-cream">
                {subRows.filter((s) => s.refBy).length}
              </p>
              <p className="mt-1 font-mono text-[10px] text-smoke">
                Referral chain working
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <p className="font-mono text-[10px] tracking-[0.22em] text-faint">EST. MONTHLY COMMISSION OWED</p>
              <p className="font-display mt-2 text-3xl font-semibold text-amber">
                ${subRows.filter((s) => s.refBy).length * 52}
              </p>
              <p className="mt-1 font-mono text-[10px] text-smoke">
                40% of $129 per referred customer
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <p className="font-mono text-[10px] tracking-[0.22em] text-faint">PARTNER LINK</p>
              <p className="mt-2 break-all font-mono text-[11px] text-amber">
                /snapshot?ref=YOU@EMAIL.COM
              </p>
              <a href="/partner" className="mt-2 inline-block font-mono text-[10px] tracking-[0.15em] text-amber hover:underline">
                PARTNER PAGE →
              </a>
            </div>
          </div>
          <AddClientForm adminKey={key2} />
          <p className="-mt-2 mb-4 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-faint">
            EARLY DAYS PLAYBOOK: customer pays you via Razorpay link / UPI / invoice →
            ADD CLIENT (above) or press ACTIVATE → their daily alerts start tomorrow
            morning. Once your payment keys are added, this panel runs itself.
          </p>
          <div className="overflow-hidden rounded-xl border border-line">
            {subRows.length === 0 && (
              <p className="px-6 py-8 font-mono text-xs text-smoke">
                No signups yet — share the site, the waitlist fills here automatically.
              </p>
            )}
            <div className="hidden grid-cols-[1fr_100px_80px_110px_70px_auto] gap-3 border-b border-line bg-panel px-4 py-2.5 sm:grid">
              {["EMAIL", "STATES", "PLAN", "SINCE", "REFS", "ACTION"].map((h) => (
                <span key={h} className="font-mono text-[9px] tracking-[0.25em] text-faint">{h}</span>
              ))}
            </div>
            {subRows.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-1 gap-2 border-b border-line/70 px-4 py-3 last:border-0 sm:grid-cols-[1fr_100px_80px_110px_70px_auto] sm:items-center sm:gap-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-cream">{s.email}</span>
                  <span
                    className={`mt-0.5 inline-block font-mono text-[10px] tracking-[0.15em] ${
                      s.status === "active" ? "text-leaf" : s.status === "waitlist" ? "text-amber" : "text-blood"
                    }`}
                  >
                    {s.status.toUpperCase()}
                  </span>
                  {s.refBy && (
                    <span className="ml-2 font-mono text-[9px] text-amber">REF: {s.refBy}</span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-smoke">{s.states}</span>
                <span className="font-mono text-[11px] text-smoke">{s.plan}</span>
                <span className="font-mono text-[11px] text-faint">{fmtDate(s.createdAt)}</span>
                <span className="font-mono text-[11px] text-smoke">
                  {subRows.filter((x) => x.refBy === s.email).length} REF
                </span>
                <SubscriberActions adminKey={key2} email={s.email} status={s.status} />
              </div>
            ))}
          </div>
        </section>

        {/* contact inbox */}
        <section className="mt-10">
          <SectionTitle>Website contact inbox</SectionTitle>
          <div className="space-y-3">
            {messageRows.length === 0 && (
              <p className="rounded-xl border border-line px-6 py-8 font-mono text-xs text-smoke">
                No contact messages yet.
              </p>
            )}
            {messageRows.map((m) => (
              <article key={m.id} className="rounded-xl border border-line bg-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-cream">{m.subject ?? "General question"}</p>
                    <p className="mt-1 font-mono text-[10px] text-smoke">
                      {m.name} · {m.email}{m.company ? ` · ${m.company}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-faint">{fmtDate(m.createdAt)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-smoke">{m.message}</p>
                <a href={`mailto:${m.email}`} className="mt-4 inline-block font-mono text-[10px] tracking-[0.15em] text-amber hover:underline">
                  REPLY BY EMAIL →
                </a>
              </article>
            ))}
          </div>
        </section>

        {/* emails */}
        <section className="mt-10">
          <SectionTitle>Last emails</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-line">
            {mailRows.length === 0 && (
              <p className="px-6 py-8 font-mono text-xs text-smoke">
                Nothing sent yet — emails flow the morning after the first active subscriber.
              </p>
            )}
            {mailRows.map((m) => (
              <div key={m.id} className="grid grid-cols-[110px_1fr_130px] items-center gap-3 border-b border-line/70 px-4 py-3 last:border-0">
                <span className="font-mono text-[11px] text-faint">{fmtDate(m.createdAt)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-cream">{m.subject}</span>
                  <span className="block truncate font-mono text-[10px] text-faint">{m.toEmail}</span>
                </span>
                <span
                  className={`text-right font-mono text-[10px] tracking-[0.15em] ${
                    m.status === "sent" ? "text-leaf" : m.status === "dry_run" ? "text-amber" : "text-blood"
                  }`}
                >
                  {m.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* recent runs */}
        <section className="mt-10">
          <SectionTitle>Recent sweeps</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-line">
            {runRows.slice(0, 15).map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-line/70 px-4 py-3 last:border-0 sm:grid-cols-[180px_1fr_auto_auto]">
                <span className="text-sm text-cream">{SOURCE_LABELS[r.source] ?? r.source}</span>
                <span className="hidden truncate font-mono text-[11px] text-smoke sm:block">
                  {r.ok
                    ? `${r.rowsSeen.toLocaleString()} rows seen · ${r.newLicenses} new · ${r.newEvents} filings`
                    : (r.error ?? "failed").slice(0, 90)}
                </span>
                <span className="font-mono text-[11px] text-faint">{fmtDate(r.startedAt)}</span>
                <span className={`font-mono text-[10px] tracking-[0.15em] ${r.ok ? "text-leaf" : "text-blood"}`}>
                  {r.ok ? "OK" : "FAIL"}
                </span>
              </div>
            ))}
            {runRows.length === 0 && (
              <p className="px-6 py-8 font-mono text-xs text-smoke">No sweeps yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-xl">{children}</div>
    </main>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[11px] text-amber">{children}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 font-mono text-[11px] tracking-[0.28em] text-faint">{String(children).toUpperCase()}</h2>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="font-mono text-[10px] tracking-[0.22em] text-faint">{label.toUpperCase()}</p>
      <p className="font-display mt-2 text-3xl font-semibold text-cream">{value}</p>
      <p className="mt-1 truncate font-mono text-[10px] text-smoke">{sub}</p>
    </div>
  );
}

function StatusDot({ ok, label, small }: { ok: boolean; label: string; small?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-3 ${small ? "py-1" : "py-1.5"} font-mono text-[9px] tracking-[0.15em] ${
        ok ? "border-leaf/40 bg-leaf/10 text-leaf" : "border-amber/40 bg-amber/10 text-amber"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-leaf" : "bg-amber"} ${!small && "blink"}`} />
      {label}
    </span>
  );
}
