import { desc, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import {
  contactMessages,
  emailLog,
  events,
  ingestRuns,
  licenses,
  subscribers,
} from "@/db/schema";
import { buildLeadSheet } from "@/lib/leadsheet";
import { adminKeySet, isAdminKey } from "@/lib/auth";
import { dodoConfigured } from "@/lib/dodo";
import { ALL_STATE_SOURCES, HEAVY_SOURCE_LABELS } from "@/lib/ingest-aggregator";
import { getHealthMap } from "@/lib/pourwatch";
import { hoursAgoMs } from "@/lib/queries";
import RunButtons from "@/components/run-buttons";
import SubscriberActions from "@/components/subscriber-actions";
import AddClientForm from "@/components/add-client-form";
import FirstCustomerPlaybook from "@/components/first-customer-playbook";
import { fmtDate } from "@/lib/fmt";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Control room", robots: { index: false } };

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
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-cream/70">
          Your control room is locked until you set an <Code>ADMIN_KEY</Code> password in your
          hosting provider&apos;s Environment Variables. Pick a strong unique value, save, redeploy,
          then come back here as:
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
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-cream/70">
          Enter your admin password. Bookmark the next page — that link is your permanent control
          room.
        </p>
        <form method="get" className="mt-6 flex max-w-sm gap-2">
          <input
            name="key"
            type="password"
            autoFocus
            placeholder="Your ADMIN_KEY"
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3.5 py-2.5 text-sm text-cream placeholder:text-smoke focus:border-amber/60 focus:outline-none"
          />
          <button className="rounded-md bg-amber px-4 py-2.5 font-mono text-sm font-semibold tracking-[0.12em] text-[#140b0e]">
            OPEN
          </button>
        </form>
      </Shell>
    );
  }

  // ===== authorized =====
  let ready = true;
  let dbError = "";
  let byState: { state: string; n: number }[] = [];
  let runRows: (typeof ingestRuns.$inferSelect)[] = [];
  let mailRows: (typeof emailLog.$inferSelect)[] = [];
  let subRows: (typeof subscribers.$inferSelect)[] = [];
  let messageRows: (typeof contactMessages.$inferSelect)[] = [];
  let leadSheet: Awaited<ReturnType<typeof buildLeadSheet>> | null = null;
  let healthMap: Awaited<ReturnType<typeof getHealthMap>> = new Map();
  let eventCount = 0;
  let subCount = 0;
  let activeCount = 0;
  let trialCount = 0;
  let totalMrr = 0;
  let refCountByEmail = new Map<string, number>();
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
    // Always bootstrap schema FIRST before querying any table.
    await ensureSchema();

    const [
      stateCounts,
      runs,
      mails,
      subs,
      messages,
      evCount,
      subAgg,
      refAgg,
      health,
      sheet,
      receiptsRes,
    ] = await Promise.all([
      db
        .select({ state: licenses.state, n: sql<number>`count(*)::int` })
        .from(licenses)
        .groupBy(licenses.state)
        .orderBy(desc(sql`count(*)`)),
      db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(60),
      db.select().from(emailLog).orderBy(desc(emailLog.id)).limit(15),
      db.select().from(subscribers).orderBy(desc(subscribers.id)).limit(50),
      db.select().from(contactMessages).orderBy(desc(contactMessages.id)).limit(20),
      db.select({ n: sql<number>`count(*)::int` }).from(events),
      // Full-table SQL aggregation for accurate MRR & counts (not capped at limit(50)!)
      db.execute(sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'active')::int AS active,
          count(*) FILTER (WHERE status = 'trial' AND (trial_ends_at IS NULL OR trial_ends_at > now()))::int AS live_trials,
          coalesce(sum(
            CASE
              WHEN status <> 'active' THEN 0
              WHEN plan = 'enterprise' THEN 499
              WHEN plan = 'pro' THEN 249
              ELSE 129
            END
          ), 0)::int AS mrr
        FROM subscribers
      `),
      db.execute(sql`
        SELECT ref_by AS email, count(*)::int AS n
        FROM subscribers
        WHERE ref_by IS NOT NULL AND ref_by <> ''
        GROUP BY ref_by
      `),
      getHealthMap(),
      buildLeadSheet("TX", 7).catch(() => null),
      pool
        .query(
          `SELECT DISTINCT ON (permit) permit, trade_name AS name, city, total, liquor, wine, beer
           FROM venue_receipts ORDER BY permit, period_end DESC, total DESC`
        )
        .catch(() => ({ rows: [] })),
    ]);

    byState = stateCounts;
    runRows = runs;
    mailRows = mails;
    subRows = subs;
    messageRows = messages;
    eventCount = evCount[0]?.n ?? 0;
    const agg = (subAgg.rows[0] ?? {}) as {
      total?: number;
      active?: number;
      live_trials?: number;
      mrr?: number;
    };
    subCount = Number(agg.total ?? 0);
    activeCount = Number(agg.active ?? 0);
    trialCount = Number(agg.live_trials ?? 0);
    totalMrr = Number(agg.mrr ?? 0);
    refCountByEmail = new Map(
      (refAgg.rows as { email: string; n: number }[]).map((r) => [r.email, Number(r.n)])
    );
    healthMap = health;
    leadSheet = sheet;
    goldmine = (receiptsRes.rows as Record<string, unknown>[])
      .map((x) => ({
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
  } catch (err) {
    ready = false;
    dbError = err instanceof Error ? err.message : String(err);
  }

  const lastBySource = new Map<string, (typeof runRows)[number]>();
  for (const r of runRows) {
    if (!lastBySource.has(r.source)) lastBySource.set(r.source, r);
  }

  const fastCutoffMs = hoursAgoMs(48);
  const heavyCutoffMs = hoursAgoMs(96);

  const sourceCards = ALL_STATE_SOURCES.map((spec) => {
    const h = healthMap.get(spec.label);
    const last = lastBySource.get(spec.label);
    const isHeavy = HEAVY_SOURCE_LABELS.has(spec.label);
    const cutoffMs = isHeavy ? heavyCutoffMs : fastCutoffMs;
    const okAtMs = h?.lastOkAt ? new Date(h.lastOkAt).getTime() : null;
    const isLive = h?.status === "live" && okAtMs !== null && okAtMs > cutoffMs;
    const isPaused = h?.status === "paused";
    const statusLabel = isPaused
      ? "PAUSED"
      : isLive
        ? "LIVE"
        : (last && !last.ok) || (h?.consecutiveFailures ?? 0) > 0
          ? "FAIL"
          : "NEW";
    return {
      spec,
      h,
      last,
      isHeavy,
      isLive,
      isPaused,
      statusLabel,
    };
  });

  const liveSourcesCount = sourceCards.filter((c) => c.isLive).length;
  const pausedSourcesCount = sourceCards.filter((c) => c.isPaused).length;

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
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-[0.15em]">
            <StatusDot ok={ready} label={ready ? "DATABASE OK" : "DATABASE PROBLEM"} />
            <StatusDot ok={resendSet} label={resendSet ? "EMAIL LIVE" : "EMAIL DRY-RUN"} />
            <StatusDot
              ok={dodoConfigured()}
              label={dodoConfigured() ? "BILLING LIVE" : "BILLING OFF"}
            />
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
          <Stat
            label="Records watched"
            value={byState.reduce((a, b) => a + b.n, 0).toLocaleString()}
            sub={
              byState
                .slice(0, 6)
                .map((b) => `${b.state} ${b.n.toLocaleString()}`)
                .join(" · ") || "—"
            }
          />
          <Stat label="Filings captured" value={eventCount.toLocaleString()} sub="all time" />
          <Stat
            label="Subscribers"
            value={subCount.toLocaleString()}
            sub={`${activeCount} paid · ${trialCount} live trial`}
          />
          <Stat
            label="Automation"
            value={
              liveSourcesCount > 0
                ? `${liveSourcesCount}/${ALL_STATE_SOURCES.length} Live`
                : "Armed"
            }
            sub={
              runRows[0]
                ? `last sweep ${fmtDate(runRows[0].startedAt)}`
                : "daily sweep 11:30 UTC"
            }
          />
        </div>

        {/* sub-tools links */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber/30 bg-amber/5 p-4">
          <a
            href={`/dashboard/prospects?key=${encodeURIComponent(key2)}`}
            className="font-mono text-sm font-semibold tracking-[0.12em] text-amber hover:underline"
          >
            → PROSPECT FINDER (CSV)
          </a>
          <span className="text-smoke">·</span>
          <a
            href={`/dashboard/map?key=${encodeURIComponent(key2)}`}
            className="font-mono text-sm font-semibold tracking-[0.12em] text-amber hover:underline"
          >
            MAP VIEW
          </a>
          <span className="text-smoke">·</span>
          <a
            href={`/dashboard/customers?key=${encodeURIComponent(key2)}`}
            className="font-mono text-sm font-semibold tracking-[0.12em] text-amber hover:underline"
          >
            CUSTOMER MANAGER + $499 API KEYS
          </a>
        </div>

        {/* page map */}
        <div className="mt-6 rounded-2xl border border-amber/30 bg-amber/5 p-5">
          <p className="font-mono text-sm font-bold tracking-[0.12em] text-amber">
            CONTROL ROOM MAP — 9 SECTIONS
          </p>
          <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-cream/80">
            <li>
              <b className="text-cream">1 · GOLDMINE</b> — Top Texas venues by monthly alcohol
              receipts (highest-value accounts first)
            </li>
            <li>
              <b className="text-cream">2 · SYSTEM STATUS</b> — Environment variable checklist
              (green = configured, amber = set in Vercel / GitHub Secrets)
            </li>
            <li>
              <b className="text-cream">3 · SOURCE HEALTH</b> — Live PourWatch status for all{" "}
              {ALL_STATE_SOURCES.length} feeds (auto-pauses broken feeds &amp; self-heals Socrata
              datasets)
            </li>
            <li>
              <b className="text-cream">4 · MANUAL OVERRIDE</b> — Trigger fast/heavy sweeps,
              PourWatch self-heal, receipts, or email digests immediately
            </li>
            <li>
              <b className="text-cream">5 · LEAD LAB</b> — Auto-paired counties with new filings +
              local licensed wholesalers/distributors (CSV ready)
            </li>
            <li>
              <b className="text-cream">6 · SUBSCRIBERS</b> — Real-time MRR, active/trial accounts,
              and manual onboarding across all 50 states
            </li>
            <li>
              <b className="text-cream">7 · CONTACT INBOX</b> — Inbound website messages
            </li>
            <li>
              <b className="text-cream">8 · LAST EMAILS</b> — Delivery log with Resend status
            </li>
            <li>
              <b className="text-cream">9 · RECENT SWEEPS</b> — Per-source ingestion audit trail
            </li>
          </ol>
        </div>

        {/* ================= 1. GOLDMINE ================= */}
        <section className="mt-10 border-t border-line pt-8">
          <SectionTitle>1 · Goldmine — biggest fish first</SectionTitle>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-cream/70">
            Texas Comptroller publishes every venue&apos;s monthly alcohol receipts. These are the
            accounts worth calling before anyone else — sorted by revenue, refreshed daily.
          </p>
          {goldmine.length === 0 ? (
            <p className="rounded-xl border border-line px-6 py-8 font-mono text-xs text-cream/70">
              No receipts data yet — it loads automatically on the daily sweep (or click TX RECEIPTS
              in Section 4).
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-panel font-mono text-[9px] tracking-[0.18em] text-smoke">
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
                      <td className="px-4 py-2.5 text-cream/70">{v.city ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber">
                        ${Math.round(v.total).toLocaleString()}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right font-mono text-sm text-smoke sm:table-cell">
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

        {/* ================= 2. SYSTEM STATUS ================= */}
        <section id="system" className="mt-10 border-t border-line pt-8">
          <SectionTitle>2 · System status — environment checklist</SectionTitle>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-cream/70">
            Green = ready. Amber = add it in Vercel Environment Variables, then redeploy. Zero
            GitHub Actions needed.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { ok: Boolean(process.env.DATABASE_URL), title: "Database", hint: "Neon / Postgres" },
              { ok: isAdminKey(key ?? null), title: "Admin key", hint: "ADMIN_KEY verified" },
              {
                ok: Boolean(process.env.RESEND_API_KEY),
                title: "Email (Resend)",
                hint: "Daily digests + alerts",
              },
              { ok: Boolean(process.env.OPS_EMAIL), title: "Ops email", hint: "PourWatch alerts" },
              {
                ok: Boolean(
                  process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME &&
                  process.env.NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS &&
                  process.env.NEXT_PUBLIC_CONTACT_EMAIL
                ),
                title: "Legal identity",
                hint: "CAN-SPAM footer fields",
              },
              {
                ok: Boolean(process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_KEY),
                title: "Token secret",
                hint: "Signs scoped magic links",
              },
              {
                ok: dodoConfigured() && Boolean(process.env.DODO_WEBHOOK_SECRET),
                title: "Payments (Dodo)",
                hint: "Checkout + Standard Webhooks",
              },
              { ok: Boolean(process.env.CRON_SECRET), title: "Cron secret", hint: "Protects jobs" },
            ].map((c) => (
              <div
                key={c.title}
                className={`rounded-xl border p-4 ${c.ok ? "border-leaf/30 bg-leaf/5" : "border-amber/40 bg-amber/5"
                  }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-cream">{c.title}</p>
                  <span
                    className={`font-mono text-[9px] tracking-[0.15em] ${c.ok ? "text-leaf" : "text-amber"
                      }`}
                  >
                    {c.ok ? "DONE" : "NEEDED"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs leading-relaxed text-cream/70">{c.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <FirstCustomerPlaybook />
          </div>
        </section>

        {/* ================= 3. SOURCE HEALTH (ALL LIVE SOURCES) ================= */}
        <section className="mt-10 border-t border-line pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionTitle>
              3 · Source health ({liveSourcesCount}/{ALL_STATE_SOURCES.length} live
              {pausedSourcesCount > 0 ? ` · ${pausedSourcesCount} paused` : ""})
            </SectionTitle>
          </div>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-cream/70">
            PourWatch tracks all {ALL_STATE_SOURCES.length} live retail feeds across our 9 verified
            markets (TX · NY · CA · Chicago IL · WA · OR · CO · CT · MO). Broken Socrata feeds
            auto-pause and self-heal automatically.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sourceCards.map(({ spec, h, last, isHeavy, isLive, isPaused, statusLabel }) => (
              <div key={spec.label} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-cream">{spec.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] tracking-[0.15em] text-faint">
                      {spec.state} · {isHeavy ? "HEAVY" : "FAST"}
                      {h?.overrideDataset ? ` · HEALED→${h.overrideDataset}` : ""}
                    </p>
                  </div>
                  <StatusDot
                    ok={isLive}
                    small
                    warn={isPaused || statusLabel === "NEW"}
                    label={statusLabel}
                  />
                </div>
                <p className="mt-2.5 font-mono text-xs leading-relaxed text-cream/70">
                  {h?.lastOkAt
                    ? `OK ${fmtDate(h.lastOkAt)} · ${(h.lastRows ?? 0).toLocaleString()} rows${last ? ` · +${last.newEvents} filings` : ""
                    }`
                    : last
                      ? `Last ${fmtDate(last.startedAt)} · ${last.rowsSeen.toLocaleString()} rows`
                      : "Pending first sweep"}
                </p>
                {(h?.pausedReason || last?.error) && !isLive && (
                  <p className="mt-2 line-clamp-2 font-mono text-[11px] leading-relaxed text-blood">
                    {h?.pausedReason ?? last?.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ================= 4. MANUAL OVERRIDE ================= */}
        <section className="mt-10 rounded-xl border border-line bg-panel p-6">
          <SectionTitle>4 · Manual override (test / force sweep)</SectionTitle>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-cream/70">
            Vercel Cron runs automatically every morning at 11:00 UTC (zero GitHub Actions needed).
            Use these controls anytime to trigger an immediate sweep, self-heal paused sources, or
            send digests.
          </p>
          <RunButtons adminKey={key2} />
        </section>

        {/* ================= 5. LEAD LAB ================= */}
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>5 · Lead lab · auto-generated · last 7 days (TX)</SectionTitle>
            <a
              href={`/api/admin/leadsheet?key=${encodeURIComponent(key2)}&state=TX&days=7&format=csv`}
              className="-mt-4 mb-4 rounded-md border border-amber/50 bg-amber/10 px-3 py-1.5 font-mono text-xs tracking-[0.15em] text-amber transition-transform hover:scale-[1.03]"
            >
              DOWNLOAD CSV ↓
            </a>
          </div>
          <p className="-mt-2 mb-4 font-mono text-xs leading-relaxed tracking-[0.08em] text-smoke">
            Counties with fresh pending applications automatically matched to active licensed
            wholesalers/distributors in that county.
          </p>
          {!leadSheet ? (
            <p className="rounded-xl border border-line px-6 py-8 font-mono text-xs text-cream/70">
              No lead sheet yet — pull Texas sources first, then this fills automatically.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              {leadSheet.counties.length === 0 && (
                <p className="px-6 py-8 font-mono text-xs leading-relaxed text-cream/70">
                  No new pending filings in the last 7 days. Once Texas data is pulled this list
                  populates automatically.
                </p>
              )}
              {leadSheet.counties.map((c) => (
                <details
                  key={c.county}
                  className="group border-b border-line/70 last:border-0"
                  open={c.filings >= 3}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-panel">
                    <span className="flex items-baseline gap-3">
                      <span className="text-base font-medium text-cream">{c.county} County</span>
                      <span className="font-mono text-sm text-amber">{c.filings} NEW FILINGS</span>
                    </span>
                    <span className="font-mono text-xs text-smoke group-open:rotate-45">+</span>
                  </summary>
                  <div className="grid gap-2 bg-panel2/60 px-4 py-4 sm:grid-cols-2">
                    {c.distributors.length === 0 && (
                      <p className="font-mono text-xs text-cream/70">
                        No active wholesalers matched in this county — download CSV or check
                        Prospect Finder for nearby distributors.
                      </p>
                    )}
                    {c.distributors.map((d, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-md border border-line bg-ink px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm text-cream">
                          {d.name}
                          {d.city ? (
                            <span className="ml-1.5 font-mono text-xs text-faint">({d.city})</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-cream/70">
                          {d.phone ?? "no phone"}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

        {/* ================= 6. SUBSCRIBERS ================= */}
        <section className="mt-10">
          <SectionTitle>6 · Subscribers (money table)</SectionTitle>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-cream/70">
            Exact SQL totals across every subscriber — active billing, live 7-day trials, and
            one-click manual activation.
          </p>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-panel p-5">
              <p className="font-mono text-xs tracking-[0.22em] text-smoke">ACTIVE CUSTOMERS</p>
              <p className="font-display mt-2 text-3xl font-semibold text-cream">
                {activeCount.toLocaleString()}
              </p>
              <p className="mt-1 font-mono text-xs text-cream/70">
                + {trialCount.toLocaleString()} active 7-day trial{trialCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <p className="font-mono text-xs tracking-[0.22em] text-smoke">
                MONTHLY RECURRING (MRR)
              </p>
              <p className="font-display mt-2 text-3xl font-semibold text-amber">
                ${totalMrr.toLocaleString()}
              </p>
              <p className="mt-1 font-mono text-xs text-cream/70">
                Auto-billed monthly via Dodo Payments
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <p className="font-mono text-xs tracking-[0.22em] text-smoke">
                REFERRAL — FREE MONTH
              </p>
              <p className="mt-2 font-mono text-sm text-cream/70">1 paying referral = 1 month FREE</p>
              <a
                href="/refer"
                className="mt-2 inline-block font-mono text-xs tracking-[0.15em] text-amber hover:underline"
              >
                OPEN REFERRAL GENERATOR →
              </a>
            </div>
          </div>

          <AddClientForm adminKey={key2} />

          <div className="overflow-hidden rounded-xl border border-line">
            {subRows.length === 0 && (
              <p className="px-6 py-8 font-mono text-xs text-cream/70">
                No signups yet — new free trials and paid checkouts appear here automatically.
              </p>
            )}
            <div className="hidden grid-cols-[1fr_110px_90px_110px_70px_auto] gap-3 border-b border-line bg-panel px-4 py-2.5 sm:grid">
              {["EMAIL", "STATES", "PLAN", "SINCE", "REFS", "ACTION"].map((h) => (
                <span key={h} className="font-mono text-[9px] tracking-[0.25em] text-smoke">
                  {h}
                </span>
              ))}
            </div>
            {subRows.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-1 gap-2 border-b border-line/70 px-4 py-3 last:border-0 sm:grid-cols-[1fr_110px_90px_110px_70px_auto] sm:items-center sm:gap-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-cream">{s.email}</span>
                  <span
                    className={`mt-0.5 inline-block font-mono text-xs tracking-[0.15em] ${s.status === "active"
                      ? "text-leaf"
                      : s.status === "trial" || s.status === "waitlist"
                        ? "text-amber"
                        : "text-blood"
                      }`}
                  >
                    {s.status.toUpperCase()}
                  </span>
                  {s.refBy && (
                    <span className="ml-2 font-mono text-[9px] text-amber">REF: {s.refBy}</span>
                  )}
                </span>
                <span className="truncate font-mono text-sm text-cream/70">{s.states}</span>
                <span className="font-mono text-sm text-cream/70">{s.plan}</span>
                <span className="font-mono text-sm text-smoke">{fmtDate(s.createdAt)}</span>
                <span className="font-mono text-sm text-cream/70">
                  {refCountByEmail.get(s.email) ?? 0} REF
                </span>
                <SubscriberActions adminKey={key2} email={s.email} status={s.status} />
              </div>
            ))}
          </div>
        </section>

        {/* ================= 7. CONTACT INBOX ================= */}
        <section className="mt-10">
          <SectionTitle>7 · Website contact inbox</SectionTitle>
          <div className="space-y-3">
            {messageRows.length === 0 && (
              <p className="rounded-xl border border-line px-6 py-8 font-mono text-xs text-cream/70">
                No contact messages yet.
              </p>
            )}
            {messageRows.map((m) => (
              <article key={m.id} className="rounded-xl border border-line bg-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-cream">
                      {m.subject ?? "General question"}
                    </p>
                    <p className="mt-1 font-mono text-xs text-cream/70">
                      {m.name} · {m.email}
                      {m.company ? ` · ${m.company}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-smoke">{fmtDate(m.createdAt)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-cream/70">
                  {m.message}
                </p>
                <a
                  href={`mailto:${m.email}`}
                  className="mt-4 inline-block font-mono text-xs tracking-[0.15em] text-amber hover:underline"
                >
                  REPLY BY EMAIL →
                </a>
              </article>
            ))}
          </div>
        </section>

        {/* ================= 8. LAST EMAILS ================= */}
        <section className="mt-10">
          <SectionTitle>8 · Last emails</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-line">
            {mailRows.length === 0 && (
              <p className="px-6 py-8 font-mono text-xs text-cream/70">
                Nothing sent yet — emails flow automatically on trial start, activation, and daily
                digests.
              </p>
            )}
            {mailRows.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[110px_1fr_130px] items-center gap-3 border-b border-line/70 px-4 py-3 last:border-0"
              >
                <span className="font-mono text-sm text-smoke">{fmtDate(m.createdAt)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-cream">{m.subject}</span>
                  <span className="block truncate font-mono text-xs text-smoke">{m.toEmail}</span>
                </span>
                <span
                  className={`text-right font-mono text-xs tracking-[0.15em] ${m.status === "sent"
                    ? "text-leaf"
                    : m.status === "dry_run"
                      ? "text-amber"
                      : "text-blood"
                    }`}
                >
                  {m.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ================= 9. RECENT SWEEPS ================= */}
        <section className="mt-10">
          <SectionTitle>9 · Recent sweeps</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-line">
            {runRows.slice(0, 20).map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_auto] gap-2 border-b border-line/70 px-4 py-3 last:border-0 sm:grid-cols-[210px_1fr_auto_auto]"
              >
                <span className="truncate text-sm text-cream">{r.source}</span>
                <span className="hidden truncate font-mono text-sm text-cream/70 sm:block">
                  {r.ok
                    ? `${r.rowsSeen.toLocaleString()} rows seen · ${r.newLicenses} new · ${r.newEvents} filings`
                    : (r.error ?? "failed").slice(0, 90)}
                </span>
                <span className="font-mono text-sm text-smoke">{fmtDate(r.startedAt)}</span>
                <span
                  className={`font-mono text-xs tracking-[0.15em] ${r.ok ? "text-leaf" : "text-blood"
                    }`}
                >
                  {r.ok ? "OK" : "FAIL"}
                </span>
              </div>
            ))}
            {runRows.length === 0 && (
              <p className="px-6 py-8 font-mono text-xs text-cream/70">No sweeps yet.</p>
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
  return (
    <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-sm text-amber">
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-mono text-sm uppercase tracking-[0.24em] text-smoke">
      {children}
    </h2>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="font-mono text-xs tracking-[0.22em] text-smoke">{label.toUpperCase()}</p>
      <p className="font-display mt-2 text-3xl font-semibold text-cream">{value}</p>
      <p className="mt-1 truncate font-mono text-xs text-cream/70">{sub}</p>
    </div>
  );
}

function StatusDot({
  ok,
  label,
  small,
  warn,
}: {
  ok: boolean;
  label: string;
  small?: boolean;
  warn?: boolean;
}) {
  const tone = ok
    ? "border-leaf/40 bg-leaf/10 text-leaf"
    : warn
      ? "border-amber/40 bg-amber/10 text-amber"
      : "border-blood/50 bg-blood/10 text-blood";
  const dot = ok ? "bg-leaf" : warn ? "bg-amber" : "bg-blood";
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 ${small ? "py-1" : "py-1.5"
        } font-mono text-[9px] tracking-[0.15em] ${tone}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${!small && "blink"}`} />
      {label}
    </span>
  );
}
