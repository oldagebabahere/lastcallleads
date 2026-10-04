// Owner-facing automated tasks — the "everything else" the machine does:
//   1) runTrialTips()  — day 1/3/5 tip emails to active trial users (retention)
//   2) runDbBackup()   — weekly CSV of the real business assets (customers,
//                        contact messages) emailed to OPS_EMAIL as attachments
//   3) buildSocialPost() — Mon/Wed/Fri social post, AUTO-posted to any
//                        platform with a webhook URL in env (Zapier / Make /
//                        n8n); the email is confirmation + paste fallback
import { db } from "@/db";
import { contactMessages, emailLog, events, subscribers } from "@/db/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { Resend } from "resend";
import { BRAND } from "@/lib/brand";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import { siteUrl } from "@/lib/site";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function footerHtml(): string {
  return `<p style="color:#8d8375;font-size:11px;line-height:1.7;font-family:monospace">
    ${esc(PUBLIC_CONFIG.legalName)} · ${esc(PUBLIC_CONFIG.postalAddress)}<br/>
    <a href="${siteUrl()}" style="color:#e9a13b">${esc(siteUrl().replace(/^https?:\/\//, ""))}</a>
  </p>`;
}

async function sendToOwner(opts: {
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}): Promise<{ sent: boolean; detail: string }> {
  const ops = (process.env.OPS_EMAIL ?? "").trim().toLowerCase();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;
  if (!ops) return { sent: false, detail: "OPS_EMAIL not set" };
  if (!key || !from) {
    await db.insert(emailLog).values({
      toEmail: ops,
      subject: opts.subject,
      status: "dry_run",
      detail: "RESEND_API_KEY / ALERT_FROM_EMAIL not set",
    });
    return { sent: false, detail: "dry_run" };
  }
  try {
    const resend = new Resend(key);
    const res = await resend.emails.send({
      from,
      to: ops,
      subject: opts.subject,
      html: opts.html,
      ...(opts.attachments?.length
        ? { attachments: opts.attachments.map((a) => ({ ...a })) }
        : {}),
    });
    const ok = !res.error;
    await db.insert(emailLog).values({
      toEmail: ops,
      subject: opts.subject,
      status: ok ? "sent" : "error",
      detail: ok ? "owner task" : String(res.error).slice(0, 200),
    });
    return ok ? { sent: true, detail: "sent" } : { sent: false, detail: "resend error" };
  } catch (e) {
    return { sent: false, detail: String(e).slice(0, 120) };
  }
}

/* ------------------------------------------------------------------ */
/* 1) TRIAL TIPS — day 1 / 3 / 5 of the 7-day trial                    */
/* ------------------------------------------------------------------ */
const TIPS: Record<number, { subject: string; body: string }> = {
  1: {
    subject: "Tip 1 of 3 — call the NEW applications first",
    body: `The freshest filings are the hottest: a venue that applied this week is 60–90 days from opening and hasn't chosen suppliers yet. Open today's digest, find the NEW APPLICATION rows, and call two of them before lunch. Two calls a day is the whole system.`,
  },
  3: {
    subject: "Tip 2 of 3 — one county, not the whole state",
    body: `Don't chase the whole state. Pick the county you actually sell in and work every filing from the last 14 days. Reps who focus on one territory close 3–4x more than reps who skim everything. Use the county filter on the feed page.`,
  },
  5: {
    subject: "Tip 3 of 3 — your trial ends in 2 days",
    body: `Your trial closes soon. If the morning email earned you even one good conversation, keep it going — a single landed account pays for a full year of alerts. Your territory keeps filing whether you're watching or not.`,
  },
};

export async function runTrialTips(): Promise<{ sent: number; skipped: number }> {
  const trialRows = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.status, "trial"));
  let sent = 0;
  let skipped = 0;
  for (const s of trialRows) {
    if (!s.trialEndsAt) continue;
    const started = s.trialEndsAt.getTime() - 7 * 86_400_000;
    const day = Math.floor((Date.now() - started) / 86_400_000) + 1;
    const tip = TIPS[day];
    if (!tip) {
      skipped++;
      continue;
    }
    // dedupe — never send the same tip twice
    const seen = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailLog)
      .where(and(eq(emailLog.toEmail, s.email), eq(emailLog.subject, tip.subject)));
    if ((seen[0]?.n ?? 0) > 0) {
      skipped++;
      continue;
    }
    const key = process.env.RESEND_API_KEY;
    if (key && process.env.ALERT_FROM_EMAIL) {
      try {
        const resend = new Resend(key);
        await resend.emails.send({
          from: process.env.ALERT_FROM_EMAIL,
          to: s.email,
          subject: tip.subject,
          html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
            <div style="max-width:620px;margin:auto;padding:36px 20px">
              <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${esc(BRAND.name)} · TRIAL WEEK</div>
              <p style="color:#c9bfae;font-size:15px;line-height:1.8">${tip.body}</p>
              <p style="margin:24px 0"><a href="${siteUrl()}/feed" style="background:#e9a13b;color:#1a0e12;padding:12px 24px;border-radius:999px;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:0.08em;text-decoration:none">OPEN TODAY'S FILINGS →</a></p>
              ${footerHtml()}
            </div>
          </body></html>`,
        });
        await db.insert(emailLog).values({
          toEmail: s.email,
          subject: tip.subject,
          status: "sent",
          detail: `trial tip day ${day}`,
        });
        sent++;
      } catch {
        skipped++;
      }
    } else {
      await db.insert(emailLog).values({
        toEmail: s.email,
        subject: tip.subject,
        status: "dry_run",
        detail: "RESEND_API_KEY / ALERT_FROM_EMAIL not set",
      });
      skipped++;
    }
  }
  return { sent, skipped };
}

/* ------------------------------------------------------------------ */
/* 2) WEEKLY DB BACKUP — the customer list IS the business             */
/* ------------------------------------------------------------------ */
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
        <h1 style="font-size:24px;margin:12px 0">Your customer list, safe.</h1>
        <p style="color:#8d8375;font-size:14px;line-height:1.7">Attached: subscribers.csv (the real business asset) and messages.csv. Filing data itself is re-pulled from official registries daily, so it is not backed up — your customers and conversations are what matter.</p>
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
/* 3) SOCIAL POST — auto-post via webhook (Zapier / Make / n8n),       */
/*    Mon/Wed/Fri. A webhook URL in env = that platform posts itself;  */
/*    the email is the confirmation + copy-paste fallback.             */
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
  // numbers from the last 7 days (aggregates only — no member data leaks)
  const week = await db
    .select({ state: events.state, n: sql<number>`count(*)::int` })
    .from(events)
    .where(gt(events.detectedAt, new Date(Date.now() - 7 * 86_400_000)))
    .groupBy(events.state)
    .orderBy(desc(sql`count(*)`))
    .limit(5);
  const total = week.reduce((a, b) => a + b.n, 0);
  if (!week.length) {
    return { sent: false, detail: "no filings this week", posted: [] };
  }

  // one showcase venue — only from UNLOCKED (older than embargo) filings
  const showcase = await db
    .select({ name: events.tradeName, city: events.city, state: events.state })
    .from(events)
    .where(
      and(
        eq(events.eventType, "NEW_LICENSE"),
        sql`${events.occurredAt} < now() - interval '9 days'`,
        sql`${events.tradeName} IS NOT NULL`
      )
    )
    .orderBy(desc(events.occurredAt))
    .limit(1);
  const venue = showcase[0];
  const venueLine = venue
    ? `Fresh example: "${venue.name}" just got its license issued in ${venue.city ?? ""} ${venue.state ?? ""} — our members read that filing the morning it posted.`
    : "";

  const link = siteUrl();
  const statesLine = week.map((w) => `${w.state}: ${w.n}`).join(" · ");

  const linkedin = `NEW BARS AND RESTAURANTS FILE PAPERWORK MONTHS BEFORE THEY OPEN.

This week our monitors caught ${total} new liquor-license filings across ${week.length} states (${statesLine}).

Every one of those filings is a venue 60–90 days from pouring its first drink — still choosing its distributors, its insurance, its POS.

${venueLine}

We send them to your inbox every morning, the day they post. That's it. That's the product.
👉 ${link}

#hospitality #bars #restaurants #salestips #bebidas #TX #NY #CA`;
  const xRaw = `${total} new bar & restaurant liquor filings landed this week across ${week.length} states — every one is a buyer 60–90 days from opening.

We report them the morning they post. 🍸

${link}`;
  // X hard limit is 280 (any URL counts as 23) — trim defensively
  const x = xRaw.length > 279 ? xRaw.slice(0, 276).replace(/\s+\S*$/, "") + "…" : xRaw;
  const pinterest = `New bar opening near you? Liquor filings happen 60–90 days before doors open — we list every new filing daily so reps and distributors get there first. ${total} filings this week. ${link} #baropening #restaurantbusiness #hospitalitysales #liquorindustry`;

  // dedupe — one social batch per UTC day, even if the cron is re-run
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

  // auto-post — every platform with a webhook URL in env posts itself.
  // Parallel with a 10s cap each, so the daily sweep stays well inside
  // Hobby's 60s budget.
  const platforms = [
    { id: "x", label: "X", envName: "ZAPIER_X_WEBHOOK_URL", text: x },
    { id: "linkedin", label: "LinkedIn", envName: "ZAPIER_LINKEDIN_WEBHOOK_URL", text: linkedin },
    { id: "pinterest", label: "Pinterest", envName: "ZAPIER_PINTEREST_WEBHOOK_URL", text: pinterest },
  ];
  const ops = (process.env.OPS_EMAIL ?? "").trim().toLowerCase();
  const outcomes = await Promise.all(
    platforms.map(async (p) => {
      const hook = (process.env[p.envName] ?? "").trim();
      if (!hook) return { p, status: "manual" as const };
      const r = await postViaWebhook(hook, {
        text: p.text,
        link,
        image_url: `${link}/og.png`,
      });
      if (r.ok) {
        // permanent record of what went out — also the dedupe trail
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
  const autoLabels = outcomes
    .filter((o) => o.status === "posted")
    .map((o) => o.p.label)
    .join(" + ");

  // email — confirmation when anything auto-posted, plain draft otherwise
  const parts: string[] = [];
  for (const o of outcomes) {
    const tag =
      o.status === "posted"
        ? `<span style="color:#7fbf7f">✓ AUTO-POSTED</span>`
        : o.status === "failed"
          ? `<span style="color:#d98c6f">⚠ AUTO FAILED (${esc(o.error ?? "")}) — paste manually:</span>`
          : `<span style="color:#8d8375">• webhook not set — paste manually (optional):</span>`;
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
        <h1 style="font-size:24px;margin:12px 0">${posted.length ? `Machine ne khud post kar diya (${autoLabels}).` : `Aaj ka post ready hai.`}</h1>
        <p style="color:#8d8375;font-size:13px;line-height:1.7">Numbers live DB se hain (${total} filings, ${week.length} states). Jo ✓ nahi hai usko 30 second me paste kar sakte ho.</p>
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
