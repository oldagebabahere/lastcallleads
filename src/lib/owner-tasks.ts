// Automated retention & owner ops tasks:
//   1) runTrialTips()    — day 1 / 3 / 5 onboarding tips to opted-in active trial users
//   2) runDbBackup()     — weekly CSV backup of subscribers & contact messages to OPS_EMAIL
//   3) buildSocialPost() — Mon/Wed/Fri social post auto-published via Zapier/Make/n8n webhooks
import { db } from "@/db";
import { contactMessages, emailLog, events, subscribers } from "@/db/schema";
import { and, desc, eq, gt, isNull, notLike, or, sql } from "drizzle-orm";
import { BRAND } from "@/lib/brand";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import { siteUrl } from "@/lib/site";
import { alertFrom, isOwnerAddress } from "@/lib/email";
import { isMailTransportConfigured, sendTransactionalMail } from "@/lib/mailer";
import { publishLinkedInOfficial, sendTelegramOwner } from "@/lib/notify";
import { stateFullName } from "@/lib/states";
import { checkoutUpgradeUrl, prefsUrl, unsubscribeUrls } from "@/lib/unsubscribe";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function footerHtml(): string {
  return `<p style="color:#8d8375;font-size:11px;line-height:1.7;font-family:monospace">
    ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""}<br/>
    <a href="${siteUrl()}" style="color:#e9a13b">${esc(siteUrl().replace(/^https?:\/\//, ""))}</a>
  </p>`;
}

async function sendToOwner(opts: {
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}): Promise<{ sent: boolean; detail: string }> {
  const ops = (process.env.OPS_EMAIL ?? process.env.SMTP_USER ?? "").trim().toLowerCase();
  if (!ops) return { sent: false, detail: "OPS_EMAIL not set" };
  if (!isMailTransportConfigured()) {
    await db.insert(emailLog).values({
      toEmail: ops,
      subject: opts.subject,
      status: "dry_run",
      detail: "No RESEND_API_KEY or SMTP_USER/SMTP_PASS set",
    });
    return { sent: false, detail: "dry_run" };
  }
  const res = await sendTransactionalMail({
    from: alertFrom(),
    to: ops,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
  });
  await db.insert(emailLog).values({
    toEmail: ops,
    subject: opts.subject,
    status: res.status,
    detail: res.detail.slice(0, 200),
  });
  return { sent: res.status === "sent", detail: res.detail };
}

/* ------------------------------------------------------------------ */
/* 1) TRIAL TIPS — day 1 / 3 / 5 of the 7-day trial                    */
/* ------------------------------------------------------------------ */
const TIPS: { minDay: number; subject: string; body: string }[] = [
  {
    minDay: 1,
    subject: "Tip 1 of 3 — call the NEW applications first",
    body: `The freshest filings are the highest-converting leads: a venue that applied this week is 60–90 days from opening and hasn't chosen suppliers yet. Open today's digest, look for the FILED rows with a 70+ score, and call two before lunch.`,
  },
  {
    minDay: 3,
    subject: "Tip 2 of 3 — narrow to your exact ZIP codes",
    body: `Don't sift through the whole state. Filter your morning digest down to your exact cities, ZIP codes, or venue types (e.g. Full Bars only) so every row in your inbox is a territory call.`,
  },
  {
    minDay: 5,
    subject: "Tip 3 of 3 — your trial ends in 2 days",
    body: `Your 7-day trial closes soon. One landed hospitality account typically pays for an entire year of daily alerts. Lock in your territory now so your morning feed doesn't pause.`,
  },
];

export async function runTrialTips(): Promise<{ sent: number; skipped: number }> {
  const now = Date.now();
  const trialRows = await db
    .select()
    .from(subscribers)
    .where(
      and(
        eq(subscribers.status, "trial"),
        eq(subscribers.emailOptOut, false),
        gt(subscribers.trialEndsAt, new Date(now))
      )
    );

  let sent = 0;
  let skipped = 0;
  const mailReady = isMailTransportConfigured();

  for (const s of trialRows) {
    if (!s.trialEndsAt) continue;
    const started = s.trialEndsAt.getTime() - 7 * 86_400_000;
    const day = Math.floor((now - started) / 86_400_000) + 1;

    // Pick the latest eligible tip that has not been sent yet (resilient to skipped days).
    const eligible = TIPS.filter((t) => day >= t.minDay);
    if (!eligible.length) {
      skipped++;
      continue;
    }

    const prior = await db
      .select({ subject: emailLog.subject })
      .from(emailLog)
      .where(eq(emailLog.toEmail, s.email));
    const alreadySent = new Set(prior.map((p) => p.subject));
    const nextTip = eligible.find((t) => !alreadySent.has(t.subject));
    if (!nextTip) {
      skipped++;
      continue;
    }

    if (mailReady && !PUBLIC_CONFIG.postalAddress && !isOwnerAddress(s.email)) {
      skipped++;
      continue;
    }

    if (mailReady) {
      try {
        const unsubscribe = unsubscribeUrls(s.email);
        const ctaHref =
          nextTip.minDay === 5
            ? checkoutUpgradeUrl(s.email, s.plan === "pro" ? "pro" : "solo")
            : nextTip.minDay === 3
              ? prefsUrl(s.email)
              : `${siteUrl()}/feed`;
        const ctaLabel =
          nextTip.minDay === 5
            ? "LOCK IN PAID ACCESS →"
            : nextTip.minDay === 3
              ? "SET MY ZIP CODES & FILTERS →"
              : "OPEN TODAY'S FILINGS →";

        const res = await sendTransactionalMail({
          from: alertFrom(),
          to: s.email,
          replyTo: PUBLIC_CONFIG.contactEmail,
          subject: nextTip.subject,
          headers: {
            "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
            <div style="max-width:620px;margin:auto;padding:36px 20px">
              <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${esc(BRAND.name)} · TRIAL WEEK</div>
              <p style="color:#c9bfae;font-size:15px;line-height:1.8">${esc(nextTip.body)}</p>
              <p style="margin:24px 0"><a href="${ctaHref}" style="background:#e9a13b;color:#1a0e12;padding:12px 24px;border-radius:999px;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:0.08em;text-decoration:none;display:inline-block">${ctaLabel}</a></p>
              <p style="color:#8d8375;font-size:11px;line-height:1.7;font-family:monospace">
                <a href="${unsubscribe.page}" style="color:#e9a13b">Stop alert emails</a>
              </p>
              ${footerHtml()}
            </div>
          </body></html>`,
        });
        if (res.status !== "sent") throw new Error(res.detail);
        await db.insert(emailLog).values({
          toEmail: s.email,
          subject: nextTip.subject,
          status: "sent",
          detail: `trial tip day ${nextTip.minDay}`,
        });
        sent++;
      } catch {
        skipped++;
      }
    } else {
      await db.insert(emailLog).values({
        toEmail: s.email,
        subject: nextTip.subject,
        status: "dry_run",
        detail: "No mail transport configured",
      });
      skipped++;
    }
  }
  return { sent, skipped };
}

/* ------------------------------------------------------------------ */
/* 2) WEEKLY DB BACKUP                                                */
/* ------------------------------------------------------------------ */
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n");
}

export async function runDbBackup(): Promise<{ sent: boolean; detail: string }> {
  const subs = await db.select().from(subscribers).orderBy(desc(subscribers.id));
  const msgs = await db
    .select()
    .from(contactMessages)
    .orderBy(desc(contactMessages.id))
    .limit(2000);
  const subCsv = toCsv(
    subs.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      status: s.status,
      plan: s.plan,
      states: s.states,
      trial_ends_at: s.trialEndsAt?.toISOString() ?? "",
      created_at: s.createdAt?.toISOString() ?? "",
    }))
  );
  const msgCsv = toCsv(
    msgs.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      company: m.company,
      subject: m.subject,
      message: m.message,
      created_at: m.createdAt?.toISOString() ?? "",
    }))
  );
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  return sendToOwner({
    subject: `Weekly backup — ${subs.length} subscribers, ${msgs.length} messages`,
    html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
      <div style="max-width:620px;margin:auto;padding:36px 20px">
        <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${esc(BRAND.name)} · WEEKLY BACKUP</div>
        <h1 style="font-size:24px;margin:12px 0">Your customer list, backed up.</h1>
        <p style="color:#8d8375;font-size:14px;line-height:1.7">Attached: subscribers.csv and messages.csv.</p>
        <p style="color:#8d8375;font-size:14px">Stats: <strong style="color:#f2ead9">${subs.length}</strong> subscribers (<strong style="color:#f2ead9">${subs.filter((s) => s.status === "active").length}</strong> active), <strong style="color:#f2ead9">${msgs.length}</strong> contact messages.</p>
        ${footerHtml()}
      </div>
    </body></html>`,
    attachments: [
      { filename: "subscribers.csv", content: b64(subCsv) },
      { filename: "messages.csv", content: b64(msgCsv) },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* 3) SOCIAL POST — auto-post via webhook (Zapier / Make / n8n)       */
/* ------------------------------------------------------------------ */
async function postViaWebhook(
  url: string,
  payload: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 80) };
  }
}

export async function buildSocialPost(): Promise<{
  sent: boolean;
  detail: string;
  posted: string[];
}> {
  const week = await db
    .select({ state: events.state, n: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        gt(events.detectedAt, new Date(Date.now() - 7 * 86_400_000)),
        or(isNull(events.licenseKey), notLike(events.licenseKey, "TTB-%"))
      )
    )
    .groupBy(events.state)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const total = week.reduce((a, b) => a + b.n, 0);
  if (!week.length) {
    return { sent: false, detail: "no filings this week", posted: [] };
  }

  // One showcase venue — strictly from UNLOCKED (>9 days old) filings.
  const showcase = await db
    .select({ name: events.tradeName, city: events.city, state: events.state })
    .from(events)
    .where(
      and(
        eq(events.eventType, "NEW_LICENSE"),
        sql`${events.occurredAt} < now() - interval '9 days'`,
        sql`${events.tradeName} IS NOT NULL`,
        or(isNull(events.licenseKey), notLike(events.licenseKey, "TTB-%"))
      )
    )
    .orderBy(desc(events.occurredAt))
    .limit(1);
  const venue = showcase[0];
  const venueLine = venue
    ? `Recent example: "${venue.name}" in ${venue.city ?? ""} ${venue.state ?? ""} — our members saw that filing the morning it posted.`
    : "";

  const link = siteUrl();
  const statesLine = week.map((w) => `${stateFullName(w.state)}: ${w.n}`).join(" · ");

  const linkedin = `NEW BARS AND RESTAURANTS FILE PAPERWORK MONTHS BEFORE THEY OPEN.

This week our monitors caught ${total.toLocaleString()} new liquor-license filings across ${week.length} states (${statesLine}).

Every one of those filings is a venue 60–90 days from pouring its first drink — still choosing its distributors, insurance, and POS.

${venueLine}

We email them to your inbox every morning, the day they post.
${link}

#hospitality #bars #restaurants #beverageindustry #salestips`;

  const xRaw = `${total.toLocaleString()} new bar & restaurant liquor filings landed this week across ${week.length} states — every one is a buyer 60–90 days from opening.

We deliver them the morning they post.

${link}`;
  const x = xRaw.length > 279 ? xRaw.slice(0, 276).replace(/\s+\S*$/, "") + "…" : xRaw;
  const pinterest = `New bar opening near you? Liquor filings happen 60–90 days before doors open — we list every new filing daily so reps and distributors get there first. ${total.toLocaleString()} filings this week. ${link} #baropening #restaurantbusiness #hospitalitysales`;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const doneToday = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailLog)
    .where(
      and(
        gt(emailLog.createdAt, todayStart),
        sql`(${emailLog.subject} LIKE '✓ Posted to%' OR ${emailLog.subject} LIKE 'Social post ready%')`
      )
    );
  if ((doneToday[0]?.n ?? 0) > 0) {
    return { sent: false, detail: "already handled today (dedupe)", posted: [] };
  }

  const platforms = [
    { id: "x", label: "X", envName: "ZAPIER_X_WEBHOOK_URL", text: x },
    { id: "linkedin", label: "LinkedIn", envName: "ZAPIER_LINKEDIN_WEBHOOK_URL", text: linkedin },
    { id: "pinterest", label: "Pinterest", envName: "ZAPIER_PINTEREST_WEBHOOK_URL", text: pinterest },
  ];
  const ops = (process.env.OPS_EMAIL ?? "").trim().toLowerCase();
  const outcomes = await Promise.all(
    platforms.map(async (p) => {
      // Official LinkedIn REST API takes priority when configured (100% safe, zero Zapier cost)
      if (p.id === "linkedin" && process.env.LINKEDIN_ACCESS_TOKEN?.trim()) {
        const liRes = await publishLinkedInOfficial(p.text);
        if (liRes.ok) {
          await db
            .insert(emailLog)
            .values({
              toEmail: ops || "owner",
              subject: `✓ Posted to LinkedIn — ${total} filings this week`,
              status: "sent",
              detail: liRes.detail,
            })
            .catch(() => undefined);
          return { p, status: "posted" as const };
        }
        return { p, status: "failed" as const, error: liRes.detail };
      }

      const hook = (process.env[p.envName] ?? "").trim();
      if (!hook) return { p, status: "manual" as const };
      const r = await postViaWebhook(hook, {
        text: p.text,
        link,
        image_url: `${link}/og.png`,
      });
      if (r.ok) {
        await db
          .insert(emailLog)
          .values({
            toEmail: ops || "owner",
            subject: `✓ Posted to ${p.label} — ${total} filings this week`,
            status: "sent",
            detail: "webhook auto-post",
          })
          .catch(() => undefined);
        return { p, status: "posted" as const };
      }
      return { p, status: "failed" as const, error: r.error };
    })
  );
  const posted = outcomes.filter((o) => o.status === "posted").map((o) => o.p.id);

  // Also ping owner's free Telegram bot with the ready-to-share LinkedIn post!
  await sendTelegramOwner(
    `📣 ${BRAND.name} Social Post (${posted.includes("linkedin") ? "AUTO-POSTED TO LINKEDIN" : "COPY & SHARE"})\n\n${linkedin}`
  ).catch(() => undefined);
  const autoLabels = outcomes
    .filter((o) => o.status === "posted")
    .map((o) => o.p.label)
    .join(" + ");

  const parts: string[] = [];
  for (const o of outcomes) {
    const tag =
      o.status === "posted"
        ? `<span style="color:#7fbf7f">✓ AUTO-POSTED</span>`
        : o.status === "failed"
          ? `<span style="color:#d98c6f">⚠ AUTO FAILED (${esc(o.error ?? "")}) — paste manually:</span>`
          : `<span style="color:#8d8375">• webhook not set — paste manually:</span>`;
    parts.push(`
      <p style="font-size:11px;letter-spacing:0.2em;color:#e9a13b;font-family:monospace;margin-top:24px">${esc(o.p.label.toUpperCase())} — ${tag}</p>
      <div style="background:#17100f;border:1px solid #2c1d20;border-radius:10px;padding:16px;font-size:13px;line-height:1.8;white-space:pre-wrap;color:#c9bfae">${esc(o.p.text)}</div>`);
  }

  const res = await sendToOwner({
    subject: posted.length
      ? `✓ Posted to ${autoLabels} — ${total} filings this week`
      : `Social post ready — ${total} filings this week`,
    html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
      <div style="max-width:680px;margin:auto;padding:36px 20px">
        <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${esc(BRAND.name)} · SOCIAL POST</div>
        <h1 style="font-size:24px;margin:12px 0">${posted.length ? `Auto-posted to ${esc(autoLabels)}.` : `Today's social post is ready.`}</h1>
        <p style="color:#8d8375;font-size:13px;line-height:1.7">Generated from live database totals (${total.toLocaleString()} filings across ${week.length} states).</p>
        ${parts.join("")}
        ${footerHtml()}
      </div>
    </body></html>`,
  });

  const detail = posted.length
    ? `auto: ${posted.join(",")}; email: ${res.detail}`
    : `draft (no webhooks); email: ${res.detail}`;
  return { sent: res.sent, detail, posted };
}
