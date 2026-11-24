// Autonomous B2B Customer Acquisition Engine (Zero Manual Mazdoori, $0 Budget Ready).
// Features:
//   1) Multi-account free Gmail / Outlook SMTP rotation (`OUTREACH_SMTP_ACCOUNTS`) OR Resend API
//   2) Automatic per-mailbox daily safety cap (`OUTREACH_PER_ACCOUNT_CAP`, default 15/day per Gmail)
//   3) Warm Day-3 Follow-Up Engine — automatically follows up ONCE 3 days later from the EXACT
//      same sender mailbox (only if prospect has NOT subscribed yet), doubling reply/trial rates
//   4) Real local proof — every cold email shows 3 freshly filed bars in the prospect's own state
//   5) Permanent dedupe in `outreach_sent` (dry runs NEVER block real prospects later)
import { and, desc, eq, gt, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { emailLog, events, outreachSent, prospects, subscribers } from "@/db/schema";
import { BRAND } from "./brand";
import { PUBLIC_CONFIG } from "./public-config";
import { findRealEmail, mapLimit } from "./email-finder";
import { harvestDistributors } from "./distributors";
import { harvestProspects } from "./prospects";
import { runByState } from "./ingest-aggregator";
import {
  getOutreachSmtpAccounts,
  isOutreachTransportConfigured,
  sendTransactionalMail,
  sendViaSmtpAccount,
  type SmtpAccount,
} from "./mailer";
import { LIVE_STATE_CODES, stateFullName } from "./states";
import { siteUrl } from "./site";

export type AutoOutreachReport = {
  ok: boolean;
  state: string;
  stateName: string;
  attempted: number;
  sent: number;
  followupsSent: number;
  dryRun: number;
  skipped: number;
  accountsAvailable: number;
  reason?: string;
};

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Uses the owner's free GROQ_API_KEY (already configured on Vercel!) to generate
// a unique, natural, non-template opening line per prospect so Gmail/Outlook spam
// filters never see identical copy-paste blasts. Always falls back cleanly in <3.5s.
async function craftGroqOpener(opts: {
  company: string;
  city: string | null;
  category: string;
  stateName: string;
  barNames: string[];
}): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const angle =
    opts.category === "insurance"
      ? "commercial liquor liability insurance before their landlord asks for a COI"
      : opts.category === "attorney"
        ? "monitoring new pending liquor filings and transfers in their county"
        : opts.category === "brewery"
          ? "getting craft draft handles and cold-box cans locked in before opening night"
          : "getting opening spirits, wine list, and beverage accounts locked in 60-90 days before doors open";

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        max_tokens: 90,
        messages: [
          {
            role: "system",
            content:
              "Write ONE short, casual, plain-English opening sentence (max 28 words, no emojis, no hype, no exclamation spam) for a B2B founder emailing a US hospitality supplier about newly filed state liquor applications.",
          },
          {
            role: "user",
            content: `Prospect: ${opts.company} (${opts.category}, ${opts.city ?? opts.stateName}). New local bars that just filed in ${opts.stateName}: ${opts.barNames.join(", ")}. Angle: ${angle}.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(3_500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "");
    if (!text || text.length < 20 || text.length > 260) return null;
    return text;
  } catch {
    return null;
  }
}

function defaultFromLabel(): string {
  return (
    process.env.OUTREACH_FROM_EMAIL?.trim() ||
    process.env.ALERT_FROM_EMAIL?.trim() ||
    `${PUBLIC_CONFIG.founderName || BRAND.name} <${PUBLIC_CONFIG.contactEmail}>`
  );
}

async function getAccountWarmupStats(): Promise<{
  todayCount: Map<string, number>;
  ageDays: Map<string, number>;
}> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [todayRows, firstRows] = await Promise.all([
    db
      .select({
        sender: outreachSent.senderAccount,
        n: sql<number>`count(*)::int`,
      })
      .from(outreachSent)
      .where(
        and(
          eq(outreachSent.status, "sent"),
          sql`(${outreachSent.sentAt} >= ${todayStart} OR ${outreachSent.followupSentAt} >= ${todayStart})`
        )
      )
      .groupBy(outreachSent.senderAccount),
    db
      .select({
        sender: outreachSent.senderAccount,
        firstAt: sql<Date | string>`min(${outreachSent.sentAt})`,
      })
      .from(outreachSent)
      .where(eq(outreachSent.status, "sent"))
      .groupBy(outreachSent.senderAccount),
  ]);

  const todayCount = new Map<string, number>();
  for (const r of todayRows) {
    if (r.sender) todayCount.set(r.sender.toLowerCase(), r.n);
  }
  const ageDays = new Map<string, number>();
  const now = Date.now();
  for (const r of firstRows) {
    if (r.sender && r.firstAt) {
      const days = Math.max(0, Math.floor((now - new Date(r.firstAt).getTime()) / 86_400_000));
      ageDays.set(r.sender.toLowerCase(), days);
    }
  }
  return { todayCount, ageDays };
}

// Gentle automatic warm-up ramp per Gmail/Outlook mailbox so brand-new accounts
// build rock-solid sender reputation without ever tripping spam blocks:
//   Days 0-2  -> 3/day  |  Days 3-6  -> 6/day  |  Days 7-13 -> 10/day  |  Day 14+ -> maxCap (15-20/day)
export function warmupCapForAccount(ageDays: number | undefined, maxCap: number): number {
  const d = ageDays ?? 0;
  if (d < 3) return Math.min(3, maxCap);
  if (d < 7) return Math.min(6, maxCap);
  if (d < 14) return Math.min(10, maxCap);
  return maxCap;
}

async function deliverOutreach(opts: {
  smtpPool: SmtpAccount[];
  preferredAccountId?: string | null;
  accountUsage: Map<string, number>;
  accountAgeDays: Map<string, number>;
  failedAccounts: Set<string>;
  perAccountCap: number;
  rrIndex: { current: number };
  forceDry: boolean;
  to: string;
  subject: string;
  html: string;
}): Promise<{
  status: "sent" | "dry_run" | "error";
  detail: string;
  senderId: string;
  capped?: boolean;
}> {
  const from = defaultFromLabel();

  if (opts.forceDry) {
    return {
      status: "dry_run",
      detail: isOutreachTransportConfigured()
        ? "dry-run preview (live sending disabled for this test)"
        : "dry-run (set OUTREACH_SMTP_ACCOUNTS or SMTP_USER/SMTP_PASS or RESEND_API_KEY)",
      senderId: opts.smtpPool[0]?.id ?? "dry_run",
    };
  }

  // Prefer rotating free Gmail/Outlook SMTP pool with automatic warm-up ramp + failover!
  if (opts.smtpPool.length > 0) {
    const capOf = (id: string) =>
      warmupCapForAccount(opts.accountAgeDays.get(id), opts.perAccountCap);

    const ordered: SmtpAccount[] = [];
    if (opts.preferredAccountId) {
      const pref = opts.smtpPool.find(
        (a) =>
          a.id === opts.preferredAccountId?.toLowerCase() &&
          !opts.failedAccounts.has(a.id) &&
          (opts.accountUsage.get(a.id) ?? 0) < capOf(a.id)
      );
      if (pref) ordered.push(pref);
    }
    for (let step = 0; step < opts.smtpPool.length; step++) {
      const idx = (opts.rrIndex.current + step) % opts.smtpPool.length;
      const cand = opts.smtpPool[idx];
      if (
        !opts.failedAccounts.has(cand.id) &&
        (opts.accountUsage.get(cand.id) ?? 0) < capOf(cand.id) &&
        !ordered.some((o) => o.id === cand.id)
      ) {
        ordered.push(cand);
      }
    }

    if (ordered.length === 0) {
      // If all SMTP accounts hit cap/error and Resend is configured, fail over cleanly to Resend!
      if (process.env.RESEND_API_KEY?.trim() && process.env.OUTREACH_FROM_EMAIL?.trim()) {
        const fallback = await sendTransactionalMail({
          from,
          to: opts.to,
          replyTo: PUBLIC_CONFIG.contactEmail,
          subject: opts.subject,
          html: opts.html,
        });
        return { ...fallback, senderId: "resend_failover" };
      }
      return {
        status: "dry_run",
        detail: `all ${opts.smtpPool.length} SMTP accounts reached daily safety cap (${opts.perAccountCap}/day)`,
        senderId: "capped",
        capped: true,
      };
    }

    let lastErr = "";
    for (const chosen of ordered) {
      const res = await sendViaSmtpAccount(chosen, {
        from,
        to: opts.to,
        replyTo: chosen.user,
        subject: opts.subject,
        html: opts.html,
      });
      if (res.status === "sent") {
        opts.accountUsage.set(chosen.id, (opts.accountUsage.get(chosen.id) ?? 0) + 1);
        const idx = opts.smtpPool.findIndex((a) => a.id === chosen.id);
        opts.rrIndex.current = (idx + 1) % opts.smtpPool.length;
        return { ...res, senderId: chosen.id };
      }
      // Mark this mailbox unhealthy for the rest of this batch and fail over to the next healthy account!
      opts.failedAccounts.add(chosen.id);
      lastErr = res.detail;
    }

    return { status: "error", detail: lastErr || "all SMTP accounts failed", senderId: "smtp_failed" };
  }

  // Otherwise use Resend transactional transport
  const res = await sendTransactionalMail({
    from,
    to: opts.to,
    replyTo: PUBLIC_CONFIG.contactEmail,
    subject: opts.subject,
    html: opts.html,
  });
  return { ...res, senderId: "resend" };
}

export async function runAutoOutreach(
  opts: {
    state?: string;
    limit?: number;
    dryRun?: boolean;
  } = {}
): Promise<AutoOutreachReport> {
  await ensureSchema();

  const dailyCap = Math.min(
    Math.max(opts.limit ?? (Number(process.env.OUTREACH_DAILY_LIMIT ?? 12) || 12), 1),
    30
  );
  const perAccountCap = Math.min(
    Math.max(Number(process.env.OUTREACH_PER_ACCOUNT_CAP ?? 15) || 15, 3),
    35
  );

  // Pick a live market (rotates across all 9 verified states daily)
  let state = (opts.state ?? "").trim().toUpperCase();
  if (!state || !LIVE_STATE_CODES.includes(state)) {
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    state = LIVE_STATE_CODES[dayIndex % LIVE_STATE_CODES.length];
  }
  const fullState = stateFullName(state);

  const smtpPool = getOutreachSmtpAccounts();
  const hasTransport = isOutreachTransportConfigured();
  const forceDry = opts.dryRun === true || !hasTransport;
  const warmupStats = await getAccountWarmupStats().catch(() => ({
    todayCount: new Map<string, number>(),
    ageDays: new Map<string, number>(),
  }));
  const accountUsage = warmupStats.todayCount;
  const accountAgeDays = warmupStats.ageDays;
  const failedAccounts = new Set<string>();
  const rrIndex = { current: 0 };
  const base = siteUrl();

  let sent = 0;
  let followupsSent = 0;
  let dryRun = 0;

  // =========================================================================
  // PHASE 1 — WARM DAY-3 FOLLOW-UPS (doubles B2B reply & free-trial signups!)
  // =========================================================================
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
  const followupBudget = Math.max(2, Math.floor(dailyCap / 2));
  const dueFollowups = await db
    .select()
    .from(outreachSent)
    .where(
      and(
        eq(outreachSent.status, "sent"),
        eq(outreachSent.followupCount, 0),
        lt(outreachSent.sentAt, threeDaysAgo)
      )
    )
    .orderBy(outreachSent.sentAt)
    .limit(followupBudget);

  if (dueFollowups.length > 0) {
    const fEmails = dueFollowups.map((r) => r.email.toLowerCase());
    const alreadySub = await db
      .select({ email: subscribers.email })
      .from(subscribers)
      .where(inArray(subscribers.email, fEmails));
    const subSet = new Set(alreadySub.map((r) => r.email.toLowerCase()));

    for (const row of dueFollowups) {
      if (subSet.has(row.email.toLowerCase())) {
        // Already converted to trial/paid — mark done so we never follow up again!
        await db
          .update(outreachSent)
          .set({ followupCount: 1, followupSentAt: new Date() })
          .where(eq(outreachSent.id, row.id));
        continue;
      }

      const rowStateName = stateFullName(row.state);
      let barLine = `several new bars & restaurants in ${rowStateName}`;
      try {
        const parsed = row.barsJson ? (JSON.parse(row.barsJson) as string[]) : [];
        if (parsed.length >= 2) {
          barLine = `${parsed[0]} and ${parsed[1]} in ${rowStateName}`;
        } else if (parsed.length === 1) {
          barLine = `${parsed[0]} in ${rowStateName}`;
        }
      } catch {
        // fallback text
      }

      const origSubj =
        row.lastSubject || `New bars just filed for liquor permits in ${rowStateName}`;
      const subject = origSubj.toLowerCase().startsWith("re:") ? origSubj : `Re: ${origSubj}`;
      const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1b1b1b;line-height:1.65;max-width:580px;margin:0 auto;padding:20px">
        <p>Hi ${esc(row.company)} team,</p>
        <p>Quick bump in case this got buried — <strong>${esc(barLine)}</strong> are moving through state licensing right now (typically 60–90 days before doors open).</p>
        <p>Want me to activate a free 7-day ${esc(rowStateName)} territory feed for you (no card needed)? Every morning you get street address, legal LLC, beverage program fit, and a 1-click Google Maps driving route for field drop-bys.</p>
        <p><a href="${base}/#pricing" style="color:#8b2c43;font-weight:700">Activate 7-day free trial →</a> &nbsp;|&nbsp; <a href="${base}/map?state=${encodeURIComponent(row.state)}" style="color:#8b2c43;font-weight:700">Preview ${esc(rowStateName)} territory map →</a></p>
        <p>Best,<br/>${esc(PUBLIC_CONFIG.founderName || BRAND.name)}</p>
        <p style="margin-top:20px;font-size:11px;color:#777">
          Reply &ldquo;stop&rdquo; and I won&rsquo;t follow up again. ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""}
        </p>
      </body></html>`;

      const res = await deliverOutreach({
        smtpPool,
        preferredAccountId: row.senderAccount,
        accountUsage,
        accountAgeDays,
        failedAccounts,
        perAccountCap,
        rrIndex,
        forceDry,
        to: row.email,
        subject,
        html,
      });

      if (res.capped) break;

      if (res.status === "sent") {
        followupsSent++;
        await db
          .update(outreachSent)
          .set({ followupCount: 1, followupSentAt: new Date() })
          .where(eq(outreachSent.id, row.id));
      } else if (res.status === "dry_run") {
        dryRun++;
      }

      await db
        .insert(emailLog)
        .values({
          toEmail: row.email,
          subject: `[FOLLOWUP] ${subject}`,
          status: res.status,
          detail: res.detail,
          eventCount: 1,
        })
        .catch(() => undefined);
    }
  }

  // =========================================================================
  // PHASE 2 — FRESH PERSONALIZED OUTREACH WITH REAL LOCAL BAR PROOF
  // (Auto-bootstraps state filings if DB is fresh — zero manual clicks ever!)
  // =========================================================================
  const freshBudget = Math.max(1, dailyCap - followupsSent);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const fetchRecentBars = () =>
    db
      .select({
        tradeName: events.tradeName,
        city: events.city,
        typeName: events.typeName,
      })
      .from(events)
      .where(
        and(
          eq(events.state, state),
          inArray(events.eventType, ["NEW_PENDING", "NEW_LICENSE"]),
          isNotNull(events.tradeName),
          gt(events.occurredAt, monthAgo)
        )
      )
      .orderBy(desc(events.occurredAt))
      .limit(6);

  let recentBars = await fetchRecentBars();
  if (recentBars.length === 0) {
    // Brand-new deploy? Pull this state's official filings automatically right now!
    await runByState(state, false).catch(() => undefined);
    recentBars = await fetchRecentBars();
  }

  if (recentBars.length === 0) {
    return {
      ok: true,
      state,
      stateName: fullState,
      attempted: followupsSent,
      sent,
      followupsSent,
      dryRun,
      skipped: 0,
      accountsAvailable: smtpPool.length || (process.env.RESEND_API_KEY ? 1 : 0),
      reason: `no recent pending filings in ${fullState} yet to use as real proof`,
    };
  }

  const TARGET_CATEGORIES = ["distributor", "brewery", "beverage", "insurance", "attorney"];
  const candidateLimit = Math.min(24, Math.max(8, freshBudget * 3));
  const loadCandidates = () =>
    db
      .select()
      .from(prospects)
      .where(
        and(
          eq(prospects.state, state),
          inArray(prospects.category, TARGET_CATEGORIES),
          isNotNull(prospects.website),
          ne(prospects.website, "")
        )
      )
      .orderBy(desc(prospects.id))
      .limit(candidateLimit);

  let candidates = await loadCandidates();

  // Zero-touch auto-harvest: if this state has fewer than 8 prospects with websites,
  // pull ONE fast category from OpenStreetMap per pulse (keeps well inside Vercel 60s limit!).
  if (candidates.length < 8) {
    const harvestOrder = ["brewery", "beverage", "insurance", "attorney"];
    const pickedCat = harvestOrder[new Date().getUTCHours() % harvestOrder.length];
    await Promise.race([
      harvestProspects(state, [pickedCat]).catch(() => undefined),
      new Promise((r) => setTimeout(r, 18_000)),
    ]);
    if (process.env.BRAVE_API_KEY?.trim()) {
      await harvestDistributors(state, 2).catch(() => undefined);
    }
    candidates = await loadCandidates();
  }

  if (candidates.length === 0) {
    return {
      ok: true,
      state,
      stateName: fullState,
      attempted: followupsSent,
      sent,
      followupsSent,
      dryRun,
      skipped: 0,
      accountsAvailable: smtpPool.length || (process.env.RESEND_API_KEY ? 1 : 0),
      reason: `no website prospects in ${fullState} yet`,
    };
  }

  const foundEmails = await mapLimit(candidates, 5, (c) => findRealEmail(c.website));

  const resolvedPairs: { company: string; city: string | null; category: string; email: string }[] =
    [];
  const seenLocal = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    const email = foundEmails[i]?.trim().toLowerCase();
    if (!email || seenLocal.has(email)) continue;
    seenLocal.add(email);
    resolvedPairs.push({
      company: candidates[i].name,
      city: candidates[i].city,
      category: candidates[i].category,
      email,
    });
  }

  if (!resolvedPairs.length) {
    return {
      ok: true,
      state,
      stateName: fullState,
      attempted: followupsSent,
      sent,
      followupsSent,
      dryRun,
      skipped: candidates.length,
      accountsAvailable: smtpPool.length || (process.env.RESEND_API_KEY ? 1 : 0),
      reason: "no public contact emails found on candidate websites",
    };
  }

  const emails = resolvedPairs.map((r) => r.email);
  const [alreadySent, existingSubs] = await Promise.all([
    db
      .select({ email: outreachSent.email })
      .from(outreachSent)
      .where(and(inArray(outreachSent.email, emails), eq(outreachSent.status, "sent"))),
    db
      .select({ email: subscribers.email })
      .from(subscribers)
      .where(inArray(subscribers.email, emails)),
  ]);
  const blocked = new Set([
    ...alreadySent.map((r) => r.email.toLowerCase()),
    ...existingSubs.map((r) => r.email.toLowerCase()),
  ]);

  const queue = resolvedPairs.filter((r) => !blocked.has(r.email)).slice(0, freshBudget);
  const sampleBars = recentBars.slice(0, 3);
  const sampleBarNames = sampleBars.map((b) => b.tradeName ?? "New Bar").filter(Boolean);
  const barsListHtml = sampleBars
    .map(
      (b) =>
        `<li><strong>${esc(b.tradeName)}</strong> (${esc(b.city ?? fullState)}) — ${esc(b.typeName ?? "Liquor Application")}</li>`
    )
    .join("");

  for (const target of queue) {
    const aiOpener = await craftGroqOpener({
      company: target.company,
      city: target.city,
      category: target.category,
      stateName: fullState,
      barNames: sampleBarNames,
    });
    const openerParagraph =
      aiOpener ||
      `Quick heads-up — here are ${sampleBars.length} new venues that just filed official liquor license applications in ${fullState} (typically 60–90 days before doors open):`;

    const subject = `${sampleBars.length} new bars just filed in ${fullState} (${target.city ?? fullState} territory)`;
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1b1b1b;line-height:1.65;max-width:580px;margin:0 auto;padding:20px">
      <p>Hi ${esc(target.company)} team,</p>
      <p>${esc(openerParagraph)}</p>
      <ul style="padding-left:18px">${barsListHtml}</ul>
      <p>We sweep the official ${esc(fullState)} registry every morning and email reps the full dossier — premises street address, legal LLC, beverage program fit, a 1-click Google Maps driving route, and a 19-column CRM CSV.</p>
      <p><a href="${base}/sample" style="color:#8b2c43;font-weight:700">See a live sample dossier →</a> &nbsp;|&nbsp; <a href="${base}/#pricing" style="color:#8b2c43;font-weight:700">Start a free 7-day trial (no card) →</a></p>
      <p>Best,<br/>${esc(PUBLIC_CONFIG.founderName || BRAND.name)}<br/>${esc(BRAND.name)}</p>
      <p style="margin-top:24px;font-size:11px;color:#777">
        Reply &ldquo;stop&rdquo; anytime and I will never email again. ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""}
      </p>
    </body></html>`;

    const res = await deliverOutreach({
      smtpPool,
      accountUsage,
      accountAgeDays,
      failedAccounts,
      perAccountCap,
      rrIndex,
      forceDry,
      to: target.email,
      subject,
      html,
    });

    if (res.capped) break;

    if (res.status === "sent") {
      sent++;
      await db
        .insert(outreachSent)
        .values({
          email: target.email,
          company: target.company,
          state,
          category: target.category,
          status: "sent",
          senderAccount: res.senderId,
          lastSubject: subject,
          barsJson: JSON.stringify(sampleBarNames),
          followupCount: 0,
        })
        .onConflictDoNothing();
    } else if (res.status === "dry_run") {
      dryRun++;
    }

    await db
      .insert(emailLog)
      .values({
        toEmail: target.email,
        subject: `[OUTREACH] ${subject}`,
        status: res.status,
        detail: res.detail,
        eventCount: sampleBars.length,
      })
      .catch(() => undefined);
  }

  return {
    ok: true,
    state,
    stateName: fullState,
    attempted: queue.length + dueFollowups.length,
    sent,
    followupsSent,
    dryRun,
    skipped: candidates.length - queue.length,
    accountsAvailable: smtpPool.length || (process.env.RESEND_API_KEY ? 1 : 0),
  };
}
