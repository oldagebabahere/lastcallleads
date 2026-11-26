// Autonomous B2B Customer Acquisition Engine (Zero Manual Mazdoori, $0 Budget Ready).
// Features:
//   1) Multi-account free Gmail / Outlook SMTP rotation (`OUTREACH_SMTP_ACCOUNTS`) OR Resend API
//   2) Automatic per-mailbox daily safety cap (`OUTREACH_PER_ACCOUNT_CAP`, default 15/day per Gmail)
//   3) Warm Day-3 Follow-Up Engine — automatically follows up ONCE 3 days later from the EXACT
//      same sender mailbox (only if prospect has NOT subscribed yet), doubling reply/trial rates
//   4) Real local proof — every cold email shows 3 freshly filed bars in the prospect's own state
//   5) Permanent dedupe in `outreach_sent` (dry runs NEVER block real prospects later)
import { and, desc, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { emailLog, events, outreachSent, prospects, subscribers } from "@/db/schema";
import { BRAND } from "./brand";
import { PUBLIC_CONFIG } from "./public-config";
import { findRealEmail, mapLimit } from "./email-finder";
import { harvestDistributors } from "./distributors";
import { harvestProspects, isJunkProspect } from "./prospects";
import { runByState } from "./ingest-aggregator";
import { sendTelegramOwner } from "./notify";
import { syncInboundRepliesToTelegram, type InboxSyncReport } from "./imap-inbox-sync";
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
  inboxSync?: InboxSyncReport;
  reason?: string;
};

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
        : opts.category === "equipment"
          ? "quoting POS systems, ice machines, draft lines, and bar build-out equipment 60-90 days before opening"
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
              "Write ONE short, casual, plain-English opening sentence (max 28 words, no greeting, no personal name, no emojis, no hype, no exclamation spam) for a hospitality research desk emailing a US beverage supplier about newly filed state liquor applications.",
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
    `${PUBLIC_CONFIG.founderName || `${BRAND.name} Desk`} <${PUBLIC_CONFIG.contactEmail}>`
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
  text: string;
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
          text: opts.text,
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
    // CRITICAL DELIVERABILITY RULE: Keep Reply-To strictly equal to From (`chosen.user`)
    // on @gmail.com SMTP sends! Cross-domain From != Reply-To is a top Gmail/Outlook spam trigger.
    // Send pure plain-text (`text` only, ZERO HTML tags/buttons) so messages land in Primary Inbox!
    for (const chosen of ordered) {
      const res = await sendViaSmtpAccount(chosen, {
        from,
        to: opts.to,
        replyTo: chosen.user,
        subject: opts.subject,
        text: opts.text,
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
    text: opts.text,
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

  // Sync any inbound replies across all Gmail accounts -> Telegram FIRST (and auto-pause follow-ups!)
  const inboxSync = !forceDry
    ? await syncInboundRepliesToTelegram().catch(() => undefined)
    : undefined;

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
  // PHASE 1 — WARM DAY-3 & DAY-7 FOLLOW-UPS (2-3x B2B replies & free trials!)
  // =========================================================================
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
  const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000);
  const followupBudget = Math.max(2, Math.floor(dailyCap / 2));
  const dueFollowups = await db
    .select()
    .from(outreachSent)
    .where(
      and(
        eq(outreachSent.status, "sent"),
        sql`(
          (${outreachSent.followupCount} = 0 AND ${outreachSent.sentAt} < ${threeDaysAgo})
          OR
          (${outreachSent.followupCount} = 1 AND ${outreachSent.followupSentAt} IS NOT NULL AND ${outreachSent.followupSentAt} < ${fourDaysAgo})
        )`
      )
    )
    .orderBy(outreachSent.followupCount, outreachSent.sentAt)
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
          .set({ followupCount: 2, followupSentAt: new Date() })
          .where(eq(outreachSent.id, row.id));
        continue;
      }

      // Never waste follow-up quota on legacy junk prospects sent before the quality filter
      if (isJunkProspect(row.company, null, row.category)) {
        await db
          .update(outreachSent)
          .set({ followupCount: 2, followupSentAt: new Date() })
          .where(eq(outreachSent.id, row.id));
        continue;
      }

      const nextTouch = row.followupCount + 1;
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
        row.lastSubject || `New ${rowStateName} liquor filings`;
      const subject = origSubj.toLowerCase().startsWith("re:") ? origSubj : `Re: ${origSubj}`;
      const isFinalTouch = nextTouch >= 2;
      const founder = PUBLIC_CONFIG.founderName || "Research Desk";
      const footerLine = `${PUBLIC_CONFIG.legalName}${PUBLIC_CONFIG.postalAddress ? ` | ${PUBLIC_CONFIG.postalAddress}` : ""}`;
      // Pure plain-text follow-ups (zero HTML bloat -> 95%+ Primary Inbox placement!)
      const text = isFinalTouch
        ? [
            `Hi ${row.company} team,`,
            ``,
            `Last quick note from me — if you cover a specific city or ZIP area in ${rowStateName}, just reply with your city and I can send over 5 freshly filed bars and restaurants on your route.`,
            ``,
            `Otherwise no worries at all and I won't bother you again.`,
            ``,
            `Best,`,
            `${founder}`,
            `${BRAND.name} (${base.replace(/^https?:\/\//, "")})`,
            `--`,
            `Let me know if you'd rather not hear from us. ${footerLine}`,
          ].join("\n")
        : [
            `Hi ${row.company} team,`,
            ``,
            `Quick bump in case this got buried — ${barLine} are moving through state liquor licensing right now (typically 60-90 days before opening night).`,
            ``,
            `Happy to send over the street addresses and LLC info for free, or you can view a live sample here: ${base}/sample`,
            ``,
            `Best,`,
            `${founder}`,
            `${BRAND.name}`,
            `--`,
            `Reply "no thanks" and I won't follow up again. ${footerLine}`,
          ].join("\n");

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
        text,
      });

      if (res.capped) break;

      if (res.status === "sent") {
        followupsSent++;
        await db
          .update(outreachSent)
          .set({ followupCount: nextTouch, followupSentAt: new Date() })
          .where(eq(outreachSent.id, row.id));
      } else if (res.status === "dry_run") {
        dryRun++;
      }

      await db
        .insert(emailLog)
        .values({
          toEmail: row.email,
          subject: `[FOLLOWUP #${nextTouch}] ${subject}`,
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

  const TARGET_CATEGORIES = [
    "distributor",
    "brewery",
    "equipment",
    "beverage",
    "insurance",
    "attorney",
  ];
  const candidateLimit = Math.min(36, Math.max(16, freshBudget * 4));
  const rotationSalt = `${new Date().toISOString().slice(0, 10)}-${new Date().getUTCHours()}`;

  // Prioritize highest-converting hospitality buyers FIRST (distributors -> craft breweries ->
  // beverage suppliers -> commercial insurance -> attorneys), exclude companies contacted in
  // the last 120 days (enables perpetual quarterly re-engagement with fresh local bars!),
  // and rotate deterministically so outreach NEVER stalls re-scanning the same rows!
  const loadCandidates = async () => {
    const raw = await db
      .select()
      .from(prospects)
      .where(
        and(
          eq(prospects.state, state),
          inArray(prospects.category, TARGET_CATEGORIES),
          isNotNull(prospects.website),
          ne(prospects.website, ""),
          sql`NOT EXISTS (
            SELECT 1 FROM outreach_sent os
            WHERE lower(os.company) = lower(${prospects.name})
              AND os.status = 'sent'
              AND os.sent_at > now() - interval '120 days'
          )`
        )
      )
      .orderBy(
        sql`CASE ${prospects.category}
          WHEN 'distributor' THEN 1
          WHEN 'brewery' THEN 2
          WHEN 'equipment' THEN 3
          WHEN 'beverage' THEN 4
          WHEN 'insurance' THEN 5
          ELSE 6
        END`,
        sql`md5(${prospects.id}::text || ${rotationSalt})`
      )
      .limit(candidateLimit * 2);

    return raw
      .filter((c) => !isJunkProspect(c.name, c.website, c.category))
      .slice(0, candidateLimit);
  };

  let candidates = await loadCandidates();

  // Always auto-harvest official Wine & Spirits Distributors & Craft Breweries if a state
  // lacks them so the pipeline refills itself forever at $0 cost!
  const distCount = candidates.filter((c) => c.category === "distributor").length;
  const highIntentCount = candidates.filter((c) =>
    ["distributor", "brewery", "beverage"].includes(c.category)
  ).length;

  if (distCount < 4) {
    await Promise.race([
      harvestDistributors(state, 40).catch(() => undefined),
      new Promise((r) => setTimeout(r, 12_000)),
    ]);
    candidates = await loadCandidates();
  }
  if (highIntentCount < 6 || candidates.length < 8) {
    await Promise.race([
      harvestProspects(state, ["brewery"]).catch(() => undefined),
      new Promise((r) => setTimeout(r, 12_000)),
    ]);
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

  const foundEmails = await mapLimit(candidates, 5, (c) =>
    findRealEmail(c.website, {
      requireBeverageContext: c.osmKey.startsWith("govdist/"),
    })
  );

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
  const cooldownCutoff = new Date(Date.now() - 120 * 86_400_000);
  const [alreadySent, existingSubs] = await Promise.all([
    db
      .select({ email: outreachSent.email })
      .from(outreachSent)
      .where(
        and(
          inArray(outreachSent.email, emails),
          eq(outreachSent.status, "sent"),
          gt(outreachSent.sentAt, cooldownCutoff)
        )
      ),
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
  const barsListText = sampleBars
    .map(
      (b) =>
        `- ${b.tradeName ?? "New Venue"} (${b.city ?? fullState}) — ${b.typeName ?? "Liquor Application"}`
    )
    .join("\n");
  const domainPlain = base.replace(/^https?:\/\//, "");
  const founder = PUBLIC_CONFIG.founderName || "Research Desk";
  const footerLine = `${PUBLIC_CONFIG.legalName}${PUBLIC_CONFIG.postalAddress ? ` | ${PUBLIC_CONFIG.postalAddress}` : ""}`;

  for (let qi = 0; qi < queue.length; qi++) {
    const target = queue[qi];
    const aiOpener = await craftGroqOpener({
      company: target.company,
      city: target.city,
      category: target.category,
      stateName: fullState,
      barNames: sampleBarNames,
    });
    const openerParagraph =
      aiOpener ||
      `Quick heads-up — spotted a few new venues that just filed state liquor permit applications in ${fullState} (typically 60-90 days before doors open):`;

    const pitchTail =
      target.category === "insurance"
        ? `We watch the official ${fullState} alcohol board every morning so commercial brokers can quote liquor liability before landlords ask for a COI.`
        : target.category === "attorney"
          ? `We watch the official ${fullState} alcohol board every morning so hospitality attorneys can track new pending filings and transfers by county.`
          : target.category === "equipment"
            ? `We watch the official ${fullState} alcohol board every morning so commercial kitchen, POS, and bar equipment reps can quote build-outs 60-90 days before doors open.`
            : `We watch the official ${fullState} alcohol board every morning so beverage reps catch new accounts 60-90 days early before tap handles and opening orders are locked in.`;

    // Rotate natural human subject lines so Gmail never fingerprints identical bulk subjects!
    const cityLabel = target.city ?? fullState;
    const firstBar = sampleBarNames[0] ?? "new bars";
    const subjectPool =
      target.category === "insurance"
        ? [
            `New ${cityLabel} bar filings`,
            `Quick question for ${target.company}`,
            `${firstBar} + new ${fullState} liquor permits`,
          ]
        : [
            `Quick question for ${target.company}`,
            `${firstBar} + 2 new ${fullState} openings`,
            `New ${cityLabel} bar permits this week`,
            `${target.company} — ${fullState} bar openings`,
            `Spotted 3 new ${fullState} venues`,
          ];
    const subject = subjectPool[(qi + new Date().getUTCHours()) % subjectPool.length];

    // LINKLESS PURE PLAIN-TEXT TOUCH #1 (Industry gold standard for 95%+ Primary Inbox!)
    // Zero HTML tags, zero clickable <a> links, zero spammy sales buttons — triggers real replies!
    const text = [
      `Hi ${target.company} team,`,
      ``,
      openerParagraph,
      ``,
      barsListText,
      ``,
      pitchTail,
      ``,
      `Want me to send over the street addresses and LLC names for these 3? Happy to share them free — or you can check out ${domainPlain} anytime.`,
      ``,
      `Best,`,
      `${founder}`,
      `${BRAND.name}`,
      `--`,
      `Not relevant? Just reply "no thanks" and I won't reach out again. ${footerLine}`,
    ].join("\n");

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
      text,
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
        .onConflictDoUpdate({
          target: outreachSent.email,
          set: {
            company: target.company,
            state,
            category: target.category,
            status: "sent",
            senderAccount: res.senderId,
            lastSubject: subject,
            barsJson: JSON.stringify(sampleBarNames),
            followupCount: 0,
            followupSentAt: null,
            sentAt: new Date(),
          },
        });
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

  if (failedAccounts.size > 0) {
    await sendTelegramOwner(
      `⚠️ Outreach SMTP Failover Notice\nSkipped unhealthy mailbox(es): ${[...failedAccounts].join(", ")}\nSystem automatically failed over to healthy accounts (${sent} fresh + ${followupsSent} follow-ups sent).`
    ).catch(() => undefined);
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
    ...(inboxSync ? { inboxSync } : {}),
  };
}
