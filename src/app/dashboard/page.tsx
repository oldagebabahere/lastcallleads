// Owner Executive Command Center — designed for instant 1-glance clarity:
// 4 KPI cards, 5 quick actions, side-by-side Customers + Live Activity,
// and tidy collapsible drawers for deep diagnostics. Zero clutter.
import Link from "next/link";
import { desc, inArray, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import {
  contactMessages,
  emailLog,
  events,
  ingestRuns,
  licenses,
  prospects,
  subscribers,
} from "@/db/schema";
import { buildLeadSheet } from "@/lib/leadsheet";
import { adminKeySet, isAdminKey } from "@/lib/auth";
import { dodoConfigured } from "@/lib/dodo";
import { ALL_STATE_SOURCES, HEAVY_SOURCE_LABELS } from "@/lib/ingest-aggregator";
import {
  getOutreachSmtpAccounts,
  isAutoOutreachActive,
  isMailTransportConfigured,
} from "@/lib/mailer";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import { getHealthMap } from "@/lib/pourwatch";
import { hoursAgoMs } from "@/lib/queries";
import { LIVE_STATE_CODES, stateFullName } from "@/lib/states";
import RunButtons from "@/components/run-buttons";
import SubscriberActions from "@/components/subscriber-actions";
import AddClientForm from "@/components/add-client-form";
import { fmtDate } from "@/lib/fmt";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Control Room", robots: { index: false } };

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  if (!adminKeySet()) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-medium">Set ADMIN_KEY first.</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-cream/70">
          Add <code className="text-amber">ADMIN_KEY</code> in Vercel Environment Variables and
          redeploy, then open <code className="text-amber">/dashboard?key=YOUR_PASSWORD</code>.
        </p>
      </Shell>
    );
  }

  if (!isAdminKey(key ?? null)) {
    return (
      <Shell>
        <div className="mb-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-logo.webp"
            alt="Last Call Leads"
            className="h-10 w-10 rounded-lg border border-amber/40 object-cover"
          />
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">OWNER ACCESS</p>
            <h1 className="font-display text-2xl font-medium">Control Room</h1>
          </div>
        </div>
        <form method="get" className="mt-5 flex max-w-sm gap-2">
          <input
            name="key"
            type="password"
            autoFocus
            placeholder="Enter ADMIN_KEY"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm text-cream placeholder:text-smoke focus:border-amber/60 focus:outline-none"
          />
          <button className="rounded-lg bg-amber px-5 py-2.5 font-mono text-xs font-bold tracking-[0.14em] text-[#140b0e]">
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
  let outreachToday = 0;
  let outreachTotal = 0;
  let prospectCount = 0;
  let goldmine: {
    permit: string;
    name: string | null;
    city: string | null;
    total: number;
  }[] = [];

  try {
    await ensureSchema();

    const [
      stateCounts,
      runs,
      mails,
      subs,
      messages,
      evCount,
      subAgg,
      outreachAgg,
      prosCount,
      health,
      sheet,
      receiptsRes,
    ] = await Promise.all([
      db
        .select({ state: licenses.state, n: sql<number>`count(*)::int` })
        .from(licenses)
        .where(inArray(licenses.state, [...LIVE_STATE_CODES]))
        .groupBy(licenses.state)
        .orderBy(desc(sql`count(*)`)),
      db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(40),
      db.select().from(emailLog).orderBy(desc(emailLog.id)).limit(10),
      db.select().from(subscribers).orderBy(desc(subscribers.id)).limit(30),
      db.select().from(contactMessages).orderBy(desc(contactMessages.id)).limit(10),
      db.select({ n: sql<number>`count(*)::int` }).from(events),
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
      db
        .execute(sql`
          SELECT
            count(*) FILTER (WHERE status = 'sent')::int AS total_sent,
            count(*) FILTER (WHERE status = 'sent' AND sent_at >= date_trunc('day', now()))::int AS today_sent
          FROM outreach_sent
        `)
        .catch(() => ({ rows: [{ total_sent: 0, today_sent: 0 }] })),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(prospects)
        .where(inArray(prospects.state, [...LIVE_STATE_CODES]))
        .catch(() => [{ n: 0 }]),
      getHealthMap(),
      buildLeadSheet("TX", 7).catch(() => null),
      pool
        .query(
          `SELECT DISTINCT ON (permit) permit, trade_name AS name, city, total
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

    const oAgg = (outreachAgg.rows[0] ?? {}) as { total_sent?: number; today_sent?: number };
    outreachTotal = Number(oAgg.total_sent ?? 0);
    outreachToday = Number(oAgg.today_sent ?? 0);
    prospectCount = Number(prosCount[0]?.n ?? 0);

    healthMap = health;
    leadSheet = sheet;
    goldmine = (receiptsRes.rows as Record<string, unknown>[])
      .map((x) => ({
        permit: String(x.permit),
        name: (x.name as string) ?? null,
        city: (x.city as string) ?? null,
        total: Number(x.total ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
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
    return { spec, h, last, isLive, isPaused, statusLabel };
  });

  const liveSourcesCount = sourceCards.filter((c) => c.isLive).length;
  const totalRecords = byState.reduce((a, b) => a + b.n, 0);

  const mailReady = isMailTransportConfigured();
  const outreachActive = isAutoOutreachActive();
  const outreachAccounts =
    getOutreachSmtpAccounts().length + (process.env.RESEND_API_KEY?.trim() ? 1 : 0);
  const telegramReady = Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()
  );
  const groqReady = Boolean(process.env.GROQ_API_KEY?.trim());
  const dodoReady = dodoConfigured() && Boolean(process.env.DODO_WEBHOOK_SECRET);
  const key2 = key!;

  const coreChecks = [
    { label: "DB", ok: ready },
    { label: "Mail", ok: mailReady },
    { label: `Outreach (${outreachAccounts})`, ok: outreachActive },
    { label: "Telegram", ok: telegramReady },
    { label: "Groq AI", ok: groqReady },
    { label: "Dodo Pay", ok: dodoReady },
  ];
  const allCoreGreen = coreChecks.every((c) => c.ok);

  const envDetails = [
    { ok: Boolean(process.env.DATABASE_URL), title: "Supabase Postgres", hint: "DATABASE_URL" },
    { ok: mailReady, title: "Transactional Mail", hint: "Resend + Gmail failover" },
    { ok: outreachActive, title: `Outreach Pool (${outreachAccounts})`, hint: "14-day Gmail warm-up" },
    { ok: groqReady, title: "Groq AI Openers", hint: "Personalized B2B intros" },
    { ok: telegramReady, title: "Telegram Alerts", hint: "Daily reports + sales pings" },
    { ok: dodoReady, title: "Dodo Payments", hint: "Live Checkout + Webhook" },
    {
      ok: Boolean(PUBLIC_CONFIG.legalName && PUBLIC_CONFIG.postalAddress && PUBLIC_CONFIG.contactEmail),
      title: "CAN-SPAM Footer",
      hint: "Legal name + postal address",
    },
    { ok: Boolean(process.env.CRON_SECRET), title: "Cron Protection", hint: "CRON_SECRET / ADMIN_KEY" },
    { ok: Boolean(process.env.LINKEDIN_ACCESS_TOKEN?.trim()), title: "LinkedIn (Optional)", hint: "Add later when ready" },
  ];

  return (
    <main className="min-h-screen pb-20">
      {/* ===== 1. CLEAN BRAND HEADER ===== */}
      <header className="border-b border-line bg-panel/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand-logo.webp"
              alt="Last Call Leads"
              className="h-10 w-10 rounded-lg border border-amber/40 object-cover"
            />
            <div>
              <h1 className="font-display text-xl font-medium leading-tight text-cream">
                Last Call <span className="text-amber">Command Center</span>
              </h1>
              <p className="font-mono text-[11px] tracking-[0.14em] text-smoke">
                BOOKMARK THIS PRIVATE URL · 9 LIVE US MARKETS
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <Link
              href={`/dashboard/customers?key=${encodeURIComponent(key2)}`}
              className="rounded-lg border border-line bg-ink px-3 py-1.5 text-cream/85 hover:border-amber/50 hover:text-amber"
            >
              Customers &amp; API
            </Link>
            <Link
              href={`/dashboard/prospects?key=${encodeURIComponent(key2)}`}
              className="rounded-lg border border-line bg-ink px-3 py-1.5 text-cream/85 hover:border-amber/50 hover:text-amber"
            >
              Prospects CSV
            </Link>
            <Link
              href={`/dashboard/map?key=${encodeURIComponent(key2)}`}
              className="rounded-lg border border-line bg-ink px-3 py-1.5 text-cream/85 hover:border-amber/50 hover:text-amber"
            >
              Prospect Map
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-1.5 font-semibold text-amber hover:bg-amber/20"
            >
              Live Site ↗
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-5 pt-6">
        {!ready && (
          <div className="rounded-xl border border-blood/40 bg-blood/10 p-4 font-mono text-xs text-blood">
            Database Error: {dbError}
          </div>
        )}

        {/* ===== 2. FOUR AT-A-GLANCE EXECUTIVE KPI CARDS ===== */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-amber/35 bg-gradient-to-b from-amber/10 to-panel p-5">
            <p className="font-mono text-[11px] tracking-[0.18em] text-amber">MONTHLY REVENUE</p>
            <p className="font-display mt-2 text-3xl font-semibold text-cream">
              ${totalMrr.toLocaleString()}
              <span className="text-base font-normal text-smoke">/mo</span>
            </p>
            <p className="mt-1.5 font-mono text-xs text-cream/75">
              {activeCount} paid · {trialCount} free trial{trialCount === 1 ? "" : "s"} · {subCount}{" "}
              total
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="font-mono text-[11px] tracking-[0.18em] text-smoke">LIVE DATA ENGINE</p>
            <p className="font-display mt-2 text-3xl font-semibold text-cream">
              <span className={liveSourcesCount >= 16 ? "text-leaf" : "text-amber"}>
                {liveSourcesCount}/{ALL_STATE_SOURCES.length}
              </span>{" "}
              <span className="text-lg font-normal text-cream/75">Live</span>
            </p>
            <p className="mt-1.5 font-mono text-xs text-cream/70">
              {totalRecords.toLocaleString()} records · {eventCount.toLocaleString()} filings
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="font-mono text-[11px] tracking-[0.18em] text-smoke">AUTO-OUTREACH</p>
            <p className="font-display mt-2 text-3xl font-semibold text-cream">
              {outreachToday.toLocaleString()}{" "}
              <span className="text-base font-normal text-smoke">today</span>
            </p>
            <p className="mt-1.5 font-mono text-xs text-cream/70">
              {outreachTotal.toLocaleString()} total sent · {prospectCount.toLocaleString()} B2B
              leads
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] tracking-[0.18em] text-smoke">SYSTEM HEALTH</p>
              <span
                className={`font-mono text-[10px] font-bold tracking-[0.15em] ${allCoreGreen ? "text-leaf" : "text-amber"
                  }`}
              >
                {allCoreGreen ? "ALL GREEN" : "CHECK"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {coreChecks.map((c) => (
                <span
                  key={c.label}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] ${c.ok
                    ? "border-leaf/40 bg-leaf/10 text-leaf"
                    : "border-amber/40 bg-amber/10 text-amber"
                    }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${c.ok ? "bg-leaf" : "bg-amber"}`} />
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ===== 3. ONE-CLICK QUICK ACTIONS ===== */}
        <section className="rounded-2xl border border-line bg-panel p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs font-bold tracking-[0.16em] text-amber">
              QUICK ACTIONS (AUTOPILOT RUNS DAILY AT 11:00 UTC)
            </p>
            {runRows[0] && (
              <span className="font-mono text-[11px] text-smoke">
                Last sweep: {fmtDate(runRows[0].startedAt)}
              </span>
            )}
          </div>
          <RunButtons adminKey={key2} />
        </section>

        {/* ===== 4. MAIN 2-COLUMN WORKSPACE: CUSTOMERS + LIVE ACTIVITY ===== */}
        <section className="grid gap-6 lg:grid-cols-12">
          {/* LEFT: SUBSCRIBERS + QUICK ADD */}
          <div className="min-w-0 space-y-4 lg:col-span-7">
            <div className="rounded-2xl border border-line bg-panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl font-medium text-cream">
                  Subscribers <span className="text-sm text-smoke">({subCount})</span>
                </h2>
                <Link
                  href={`/dashboard/customers?key=${encodeURIComponent(key2)}`}
                  className="font-mono text-xs text-amber hover:underline"
                >
                  Manage All + API Keys →
                </Link>
              </div>

              <AddClientForm adminKey={key2} />

              <div className="overflow-hidden rounded-xl border border-line bg-ink/60">
                {subRows.length === 0 ? (
                  <p className="px-4 py-6 font-mono text-xs text-cream/65">
                    No subscribers yet — trials and paid signups appear here automatically.
                  </p>
                ) : (
                  subRows.slice(0, 12).map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-4 py-3 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-cream">{s.email}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                          <span
                            className={
                              s.status === "active"
                                ? "font-bold text-leaf"
                                : s.status === "trial"
                                  ? "font-bold text-amber"
                                  : "text-blood"
                            }
                          >
                            {s.status.toUpperCase()}
                          </span>
                          <span className="text-smoke">·</span>
                          <span className="text-cream/75">{s.plan}</span>
                          <span className="text-smoke">·</span>
                          <span className="text-cream/65">{s.states}</span>
                        </p>
                      </div>
                      <SubscriberActions adminKey={key2} email={s.email} status={s.status} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: RECENT EMAILS + CONTACT INBOX */}
          <div className="min-w-0 space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-line bg-panel p-5">
              <h2 className="font-display mb-3 text-xl font-medium text-cream">
                Live Email Log <span className="text-sm text-smoke">(Last 10)</span>
              </h2>
              <div className="space-y-2">
                {mailRows.length === 0 ? (
                  <p className="rounded-lg border border-line px-4 py-5 font-mono text-xs text-cream/65">
                    No emails sent yet.
                  </p>
                ) : (
                  mailRows.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-line/70 bg-ink/60 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-cream">{m.subject}</p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-smoke">
                          {m.toEmail} · {fmtDate(m.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${m.status === "sent"
                          ? "border-leaf/40 bg-leaf/10 text-leaf"
                          : m.status === "dry_run"
                            ? "border-amber/40 bg-amber/10 text-amber"
                            : "border-blood/40 bg-blood/10 text-blood"
                          }`}
                      >
                        {m.status.toUpperCase()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-panel p-5">
              <h2 className="font-display mb-3 text-xl font-medium text-cream">
                Contact Inbox <span className="text-sm text-smoke">({messageRows.length})</span>
              </h2>
              {messageRows.length === 0 ? (
                <p className="rounded-lg border border-line px-4 py-4 font-mono text-xs text-cream/65">
                  No inbound website messages yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {messageRows.slice(0, 5).map((m) => (
                    <div key={m.id} className="rounded-lg border border-line bg-ink/60 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-cream">
                          {m.subject ?? "Inquiry"}
                        </p>
                        <span className="font-mono text-[10px] text-smoke">
                          {fmtDate(m.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-amber">
                        {m.name} · {m.email}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs text-cream/75">{m.message}</p>
                      <a
                        href={`mailto:${m.email}`}
                        className="mt-2 inline-block font-mono text-[11px] font-semibold text-amber hover:underline"
                      >
                        REPLY →
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ===== 5. COLLAPSIBLE DEEP DETAILS (CLOSED BY DEFAULT — ZERO CLUTTER!) ===== */}
        <section className="space-y-3">
          {/* Drawer 1: 9 Markets + 18 Feeds */}
          <details className="rounded-2xl border border-line bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
              <span className="font-mono text-xs font-bold tracking-[0.14em] text-cream">
                📡 ALL 18 GOVERNMENT FEEDS &amp; 9 MARKET COUNTS ({liveSourcesCount}/
                {ALL_STATE_SOURCES.length} LIVE)
              </span>
              <span className="font-mono text-xs text-amber">EXPAND ▾</span>
            </summary>
            <div className="border-t border-line p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {byState.map((b) => (
                  <span
                    key={b.state}
                    className="rounded-lg border border-line bg-ink px-3 py-1.5 font-mono text-xs text-cream/85"
                  >
                    <b className="text-amber">{stateFullName(b.state)}</b>: {b.n.toLocaleString()}
                  </span>
                ))}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {sourceCards.map(({ spec, h, last, isLive, isPaused, statusLabel }) => (
                  <div
                    key={spec.label}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line/70 bg-ink/70 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-cream">{spec.label}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-smoke">
                        {h?.lastOkAt
                          ? `${fmtDate(h.lastOkAt)} · ${(h.lastRows ?? 0).toLocaleString()} rows`
                          : last
                            ? `${fmtDate(last.startedAt)}`
                            : "Pending"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${isLive
                        ? "border-leaf/40 bg-leaf/10 text-leaf"
                        : isPaused
                          ? "border-amber/40 bg-amber/10 text-amber"
                          : "border-blood/40 bg-blood/10 text-blood"
                        }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </details>

          {/* Drawer 2: Goldmine Texas Top Alcohol Revenue */}
          <details className="rounded-2xl border border-line bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
              <span className="font-mono text-xs font-bold tracking-[0.14em] text-cream">
                🏆 TEXAS GOLDMINE — TOP 15 HIGHEST-REVENUE VENUES ({goldmine.length})
              </span>
              <span className="font-mono text-xs text-amber">EXPAND ▾</span>
            </summary>
            <div className="border-t border-line p-5">
              {goldmine.length === 0 ? (
                <p className="font-mono text-xs text-smoke">No Texas receipts loaded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ink font-mono text-[10px] text-smoke">
                      <tr>
                        <th className="px-3.5 py-2.5">VENUE</th>
                        <th className="px-3.5 py-2.5">CITY</th>
                        <th className="px-3.5 py-2.5 text-right">ALCOHOL / MO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {goldmine.map((v) => (
                        <tr key={v.permit} className="border-t border-line/60">
                          <td className="px-3.5 py-2 text-cream">{v.name ?? "—"}</td>
                          <td className="px-3.5 py-2 text-cream/70">{v.city ?? "—"}</td>
                          <td className="px-3.5 py-2 text-right font-mono font-semibold text-amber">
                            ${Math.round(v.total).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>

          {/* Drawer 3: Lead Lab CSV */}
          <details className="rounded-2xl border border-line bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
              <span className="font-mono text-xs font-bold tracking-[0.14em] text-cream">
                🎯 TEXAS LEAD LAB — 7-DAY COUNTY MATCHED WHOLESALERS (
                {leadSheet?.counties.length ?? 0} COUNTIES)
              </span>
              <span className="font-mono text-xs text-amber">EXPAND ▾</span>
            </summary>
            <div className="border-t border-line p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs text-cream/70">
                  Counties with fresh filings paired with licensed wholesalers.
                </p>
                <a
                  href={`/api/admin/leadsheet?key=${encodeURIComponent(key2)}&state=TX&days=7&format=csv`}
                  className="rounded-lg bg-amber px-3.5 py-1.5 font-mono text-xs font-bold text-[#140b0e]"
                >
                  DOWNLOAD CSV ↓
                </a>
              </div>
              {leadSheet && leadSheet.counties.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {leadSheet.counties.slice(0, 12).map((c) => (
                    <div
                      key={c.county}
                      className="flex items-center justify-between rounded-lg border border-line bg-ink px-3.5 py-2.5 text-xs"
                    >
                      <span className="font-medium text-cream">{c.county} County</span>
                      <span className="font-mono text-amber">
                        {c.filings} filings · {c.distributors.length} dist.
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-xs text-smoke">No recent Texas filings matched yet.</p>
              )}
            </div>
          </details>

          {/* Drawer 4: Environment & Diagnostics */}
          <details className="rounded-2xl border border-line bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
              <span className="font-mono text-xs font-bold tracking-[0.14em] text-cream">
                ⚙️ ENVIRONMENT CHECKLIST ({envDetails.filter((e) => e.ok).length}/
                {envDetails.length} CONFIGURED)
              </span>
              <span className="font-mono text-xs text-amber">EXPAND ▾</span>
            </summary>
            <div className="grid gap-2.5 border-t border-line p-5 sm:grid-cols-3">
              {envDetails.map((c) => (
                <div
                  key={c.title}
                  className={`rounded-xl border p-3.5 ${c.ok ? "border-leaf/30 bg-leaf/5" : "border-amber/35 bg-amber/5"
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-cream">{c.title}</p>
                    <span
                      className={`font-mono text-[10px] font-bold ${c.ok ? "text-leaf" : "text-amber"
                        }`}
                    >
                      {c.ok ? "READY" : "OPTIONAL"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-smoke">{c.hint}</p>
                </div>
              ))}
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8">{children}</div>
    </main>
  );
}
