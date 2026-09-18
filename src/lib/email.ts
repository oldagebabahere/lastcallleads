// Email delivery. Uses Resend when RESEND_API_KEY is set; otherwise it
// records a dry-run entry in the email log, so the whole pipeline can be
// proven end-to-end before spending a single rupee/dollar.
import { db } from "@/db";
import { emailLog, type FilingEvent, type Subscriber } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import { exportUrl, prefsUrl, unsubscribeUrls } from "@/lib/unsubscribe";
import { scoreFiling, tierLabel } from "@/lib/lead-score";
import { Resend } from "resend";

export function alertFrom(): string {
  return process.env.ALERT_FROM_EMAIL ?? `${BRAND.name} Alerts <alerts@example.com>`;
}

export function digestSubject(evts: FilingEvent[]): string {
  const states = Array.from(new Set(evts.map((e) => e.state))).join(" + ");
  return `${evts.length} new filing${evts.length === 1 ? "" : "s"} — ${states}`;
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// License types that signal a high-value venue buildout.
const HOT_TYPES = [
  "mixed beverage",
  "late hours",
  "package store",
  "restaurant",
  "full service",
  "bar",
  "brewpub",
  "liquor",
];

function isHot(e: FilingEvent): boolean {
  const blob = `${e.typeName ?? ""} ${e.summary ?? ""}`.toLowerCase();
  return HOT_TYPES.some((k) => blob.includes(k));
}

// One-line "why does this matter" per license type — the value-add that
// turns a raw record into something a rep can act on.
function whyItMatters(e: FilingEvent): string {
  const t = (e.typeName ?? "").toLowerCase();
  if (t.includes("mixed beverage") && t.includes("late"))
    return "Full bar planning late nights — highest-volume account type.";
  if (t.includes("mixed beverage") || t.includes("full service"))
    return "Full spirits program on day one — prime placement window.";
  if (t.includes("package store") || t.includes("liquor"))
    return "Retail shelves to fill — cold-box and wine wall decisions now.";
  if (t.includes("brewpub") || t.includes("brewer"))
    return "Production + taproom — equipment and distribution decisions.";
  if (t.includes("restaurant") || t.includes("food"))
    return "Food-first concept — wine list and premium spirits likely.";
  if (t.includes("wine") || t.includes("malt"))
    return "Beer/wine retail — fast, low-friction first contact.";
  return "Buying window opens now — call before competitors see the sign.";
}

export function digestHtml(sub: Subscriber, evts: FilingEvent[]): string {
  const unsubscribe = unsubscribeUrls(sub.email);
  const visible = evts.slice(0, 60);

  // Score every filing, then headline the single best one.
  const scored = visible.map((e) => ({
    e,
    score: scoreFiling({
      eventType: e.eventType,
      typeName: e.typeName,
      city: e.city,
      county: e.county,
      occurredAt: e.occurredAt,
      summary: e.summary,
    }),
  }));
  const ranked = [...scored].sort((a, b) => b.score.value - a.score.value);
  const top = ranked[0];
  const hotCount = scored.filter((s) => s.score.tier === "A" || isHot(s.e)).length;

  const rows = ranked
    .map(({ e, score }) => {
      const hot = score.tier === "A";
      const badge =
        e.eventType === "NEW_PENDING"
          ? `<span style="color:#e9a13b;font-weight:600">FILED</span>`
          : e.eventType === "NEW_LICENSE"
            ? `<span style="color:#7dc98f;font-weight:600">ISSUED</span>`
            : `<span style="color:#8d8375">UPDATE</span>`;
      const when = e.occurredAt
        ? new Date(e.occurredAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "";
      const scoreChip = `<span style="display:inline-block;margin-left:6px;background:${hot ? "#e9a13b22" : "#3a222a55"};border:1px solid ${hot ? "#e9a13b55" : "#3a222a"};color:${hot ? "#e9a13b" : "#a79391"};font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;letter-spacing:0.06em">${score.value}</span>`;
      return `<tr>
        <td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375;font-size:12px;white-space:nowrap;vertical-align:top">${esc(when)}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #2a2318;font-size:12px;vertical-align:top">${badge}${scoreChip}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #2a2318;vertical-align:top">
          <span style="color:#f2ead9;font-size:14px;font-family:Georgia,serif">${esc(e.summary)}</span><br/>
          <span style="color:#8d8375;font-size:11px;font-family:monospace">${esc(score.reason)}</span>
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375;font-size:12px;vertical-align:top">${esc(e.state)}</td>
      </tr>`;
    })
    .join("");

  // "Call this one first" — the single highest-value filing of the day.
  const topBlock = top
    ? `<div style="margin:0 0 24px;padding:18px;border:1px solid #e9a13b66;background:#2a141b;border-radius:12px">
        <div style="font-family:monospace;font-size:10px;letter-spacing:0.2em;color:#e9a13b">★ CALL THIS ONE FIRST — SCORE ${top.score.value}/100</div>
        <div style="margin-top:8px;font-family:Georgia,serif;font-size:18px;color:#f6eee1">${esc(top.e.summary)}</div>
        <div style="margin-top:6px;font-family:monospace;font-size:12px;color:#a79391">${esc(top.score.reason)}</div>
        <div style="margin-top:8px;font-family:monospace;font-size:12px;color:#e9a13b">→ ${esc(top.score.action)}</div>
      </div>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px">
    <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${BRAND.name} · New-Filing Digest</div>
    <h1 style="font-size:28px;margin:12px 0 4px;font-weight:600">${evts.length} new filing${evts.length === 1 ? "" : "s"} in your territories</h1>
    <p style="color:#8d8375;font-size:13px;margin:0 0 20px">${hotCount > 0 ? `<strong style="color:#e9a13b">${hotCount} are priority leads</strong> — scored and ranked so you know exactly who to call.` : "Applications filed = buyers deciding in the next 60–90 days. Call first."}</p>
    ${topBlock}
    <table style="width:100%;border-collapse:collapse">
      <tr style="text-align:left;color:#8d8375;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;font-family:monospace">
        <th style="padding:0 8px 8px">Date</th><th style="padding:0 8px 8px">Score</th><th style="padding:0 8px 8px">Filing</th><th style="padding:0 8px 8px">State</th>
      </tr>
      ${rows}
    </table>
    <p style="color:#8d8375;font-size:11px;margin-top:24px;line-height:1.7;font-family:monospace">
      You are receiving this service email because ${esc(sub.email)} is subscribed to: ${esc(sub.states)}.<br />
      <a href="${prefsUrl(sub.email)}" style="color:#e9a13b">Change ZIP codes &amp; lead types</a> ·
      <a href="${exportUrl(sub.email)}" style="color:#e9a13b">Download CSV</a> ·
      <a href="${unsubscribe.page}" style="color:#e9a13b">Stop alert emails</a><br />
      Annual option: pay 10 months, get 12. Referral: one paying intro = next month free.<br />
      <a href="mailto:${esc(PUBLIC_CONFIG.contactEmail)}" style="color:#e9a13b">Contact support</a><br />
      ${esc(PUBLIC_CONFIG.legalName)} · ${esc(PUBLIC_CONFIG.postalAddress)} ·
      <a href="${PUBLIC_CONFIG.billingPortalUrl}" style="color:#5f5648">Manage subscription</a>
    </p>
  </div></body></html>`;
}

export type SendStatus = "sent" | "dry_run" | "error";

// CAN-SPAM requires a valid physical postal address on every commercial email.
// We refuse to send to real customers without one — but the owner can always
// email themselves, so the pipeline can be tested before an address is bought.
export function isOwnerAddress(to: string): boolean {
  const ops = (process.env.OPS_EMAIL ?? "").trim().toLowerCase();
  const support = (process.env.SUPPORT_INBOX_EMAIL ?? "").trim().toLowerCase();
  const target = to.trim().toLowerCase();
  return Boolean(target && (target === ops || target === support));
}

function missingAddress(to: string): boolean {
  return !PUBLIC_CONFIG.postalAddress && !isOwnerAddress(to);
}

// Weekly territory briefing — the "you're getting more than raw leads"
// email. Every Monday: 7-day recap, hottest counties, what to expect.
export async function sendBriefing(input: {
  email: string;
  states: string;
  weekFilings: number;
  hotCounties: string[];
  topTypes: string[];
  hotLeads: string[];
}): Promise<{ status: SendStatus; detail: string }> {
  const subject = `Your territory briefing — ${input.weekFilings} filings this week`;
  let status: SendStatus = "dry_run";
  let detail = "RESEND_API_KEY not set — briefing logged, not sent";
  const key = process.env.RESEND_API_KEY;

  if (key && missingAddress(input.email)) {
    status = "error";
    detail =
      "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM). Add a postal address, or send a test to OPS_EMAIL.";
  } else if (key) {
    try {
      const unsubscribe = unsubscribeUrls(input.email);
      const resend = new Resend(key);
      const result = await resend.emails.send({
        from: alertFrom(),
        to: input.email,
        replyTo: PUBLIC_CONFIG.contactEmail,
        subject,
        headers: {
          "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
          <div style="max-width:620px;margin:auto;padding:36px 20px">
            <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${esc(BRAND.name)} · Weekly territory briefing</div>
            <h1 style="font-size:26px;margin:12px 0 4px">Your week in ${esc(input.states)}</h1>
            <p style="color:#8d8375;font-size:13px;margin:0 0 24px">Every Monday we recap what moved, so nothing slips past you.</p>
            <table style="width:100%;border-collapse:collapse;font-family:monospace">
              <tr><td style="padding:10px 8px;color:#8d8375;border-bottom:1px solid #2a2318">New filings detected</td><td style="padding:10px 8px;text-align:right;color:#f2ead9;font-size:16px;border-bottom:1px solid #2a2318"><strong>${input.weekFilings}</strong></td></tr>
              <tr><td style="padding:10px 8px;color:#8d8375;border-bottom:1px solid #2a2318">Hottest counties</td><td style="padding:10px 8px;text-align:right;color:#f2ead9;border-bottom:1px solid #2a2318">${esc(input.hotCounties.join(", ") || "—")}</td></tr>
              <tr><td style="padding:10px 8px;color:#8d8375;border-bottom:1px solid #2a2318">Dominant concepts</td><td style="padding:10px 8px;text-align:right;color:#f2ead9;border-bottom:1px solid #2a2318">${esc(input.topTypes.join(", ") || "—")}</td></tr>
            </table>
            ${input.hotLeads.length ? `<h2 style="font-size:17px;margin:26px 0 8px;color:#e9a13b">Priority calls this week</h2>
            <p style="color:#f2ead9;font-size:13px;line-height:1.8;font-family:monospace">${input.hotLeads.map((l) => `◆ ${esc(l)}`).join("<br/>")}</p>` : ""}
            <p style="color:#8d8375;font-size:12px;margin-top:26px;line-height:1.7">Every morning digest keeps you current; this weekly view keeps you ahead of the territory.</p>
            <p style="color:#8d8375;font-size:11px;margin-top:20px;line-height:1.7;font-family:monospace">
              <a href="${unsubscribe.page}" style="color:#e9a13b">Stop alert emails</a> ·
              <a href="mailto:${esc(PUBLIC_CONFIG.contactEmail)}" style="color:#e9a13b">Contact support</a><br/>
              ${esc(PUBLIC_CONFIG.legalName)} · ${esc(PUBLIC_CONFIG.postalAddress)} ·
              <a href="${PUBLIC_CONFIG.billingPortalUrl}" style="color:#5f5648">Manage subscription</a>
            </p>
          </div></body></html>`,
      });
      if (result.error) {
        status = "error";
        detail = result.error.message ?? "Resend rejected the briefing";
      } else {
        status = "sent";
        detail = result.data?.id ? `resend:${result.data.id}` : "sent";
      }
    } catch (err) {
      status = "error";
      detail = err instanceof Error ? err.message : String(err);
    }
  }

  await db.insert(emailLog).values({
    toEmail: input.email,
    subject,
    status,
    detail,
    eventCount: input.weekFilings,
  });
  return { status, detail };
}

export async function sendMonthlyRecap(input: {
  email: string;
  states: string;
  monthFilings: number;
  hotFilings: number;
  topCities: string[];
  topTypes: string[];
  sampleLeads: string[];
}): Promise<{ status: SendStatus; detail: string }> {
  const subject = `Monthly value recap — ${input.monthFilings} filings watched for you`;
  let status: SendStatus = "dry_run";
  let detail = "RESEND_API_KEY not set — monthly recap logged, not sent";
  const key = process.env.RESEND_API_KEY;

  if (key && missingAddress(input.email)) {
    status = "error";
    detail =
      "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM). Add a postal address, or send a test to OPS_EMAIL.";
  } else if (key) {
    try {
      const unsubscribe = unsubscribeUrls(input.email);
      const resend = new Resend(key);
      const bookingUrl = process.env.NEXT_PUBLIC_BOOKING_URL;
      const result = await resend.emails.send({
        from: alertFrom(),
        to: input.email,
        replyTo: PUBLIC_CONFIG.contactEmail,
        subject,
        headers: {
          "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
          <div style="max-width:640px;margin:auto;padding:36px 20px">
            <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${esc(BRAND.name)} · Monthly value recap</div>
            <h1 style="font-size:28px;margin:12px 0 4px">What we watched for you this month</h1>
            <p style="color:#8d8375;font-size:13px;margin:0 0 24px">Use this to prove ROI to yourself or your manager.</p>
            <table style="width:100%;border-collapse:collapse;font-family:monospace">
              <tr><td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375">Filings monitored</td><td style="padding:12px 8px;border-bottom:1px solid #2a2318;text-align:right;color:#f2ead9;font-size:20px"><strong>${input.monthFilings}</strong></td></tr>
              <tr><td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375">Hot leads flagged</td><td style="padding:12px 8px;border-bottom:1px solid #2a2318;text-align:right;color:#e9a13b;font-size:20px"><strong>${input.hotFilings}</strong></td></tr>
              <tr><td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375">Hottest cities</td><td style="padding:12px 8px;border-bottom:1px solid #2a2318;text-align:right;color:#f2ead9">${esc(input.topCities.join(", ") || "—")}</td></tr>
              <tr><td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375">Most common concepts</td><td style="padding:12px 8px;border-bottom:1px solid #2a2318;text-align:right;color:#f2ead9">${esc(input.topTypes.join(", ") || "—")}</td></tr>
            </table>
            ${input.sampleLeads.length ? `<h2 style="margin:26px 0 8px;font-size:18px;color:#e9a13b">A few priority leads you saw</h2><p style="font-family:monospace;color:#f2ead9;font-size:12px;line-height:1.8">${input.sampleLeads.map((l) => `◆ ${esc(l)}`).join("<br/>")}</p>` : ""}
            <div style="margin-top:26px;padding:18px;border:1px solid #2a2318;background:#14100a;border-radius:12px">
              <p style="margin:0;color:#f2ead9;font-weight:700">Want to lower your monthly cost?</p>
              <p style="margin:8px 0 0;color:#8d8375;font-size:13px;line-height:1.7">Annual prepay is simple: pay 10 months, get 12 months. Reply “annual” and we will switch you manually.</p>
              <p style="margin:8px 0 0;color:#8d8375;font-size:13px;line-height:1.7">Refer one paying rep and get your next month free. Reply “referral” and we will send your intro text.</p>
              ${bookingUrl ? `<p style="margin:8px 0 0;color:#8d8375;font-size:13px;line-height:1.7">Want a 15-minute territory review? <a href="${bookingUrl}" style="color:#e9a13b">Book it here</a>.</p>` : `<p style="margin:8px 0 0;color:#8d8375;font-size:13px;line-height:1.7">Want a 15-minute territory review? Reply with two times that work.</p>`}
            </div>
            <p style="color:#8d8375;font-size:11px;margin-top:22px;line-height:1.7;font-family:monospace">
              <a href="${unsubscribe.page}" style="color:#e9a13b">Stop alert emails</a> ·
              <a href="mailto:${esc(PUBLIC_CONFIG.contactEmail)}" style="color:#e9a13b">Contact support</a><br />
              ${esc(PUBLIC_CONFIG.legalName)} · ${esc(PUBLIC_CONFIG.postalAddress)} ·
              <a href="${PUBLIC_CONFIG.billingPortalUrl}" style="color:#5f5648">Manage subscription</a>
            </p>
          </div></body></html>`,
      });
      if (result.error) {
        status = "error";
        detail = result.error.message ?? "Resend rejected the monthly recap";
      } else {
        status = "sent";
        detail = result.data?.id ? `resend:${result.data.id}` : "sent";
      }
    } catch (err) {
      status = "error";
      detail = err instanceof Error ? err.message : String(err);
    }
  }

  await db.insert(emailLog).values({
    toEmail: input.email,
    subject,
    status,
    detail,
    eventCount: input.monthFilings,
  });
  return { status, detail };
}

export async function sendWelcome(input: {
  email: string;
  states: string;
  plan: string;
}): Promise<{ status: SendStatus; detail: string }> {
  const subject = `Your ${BRAND.name} alerts are active`;
  let status: SendStatus = "dry_run";
  let detail = "RESEND_API_KEY not set — welcome email logged, not sent";
  const key = process.env.RESEND_API_KEY;

  if (key && missingAddress(input.email)) {
    status = "error";
    detail =
      "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM). Add a postal address, or send a test to OPS_EMAIL.";
  } else if (key) {
    try {
      const unsubscribe = unsubscribeUrls(input.email);
      const resend = new Resend(key);
      const result = await resend.emails.send({
        from: alertFrom(),
        to: input.email,
        replyTo: PUBLIC_CONFIG.contactEmail,
        subject,
        headers: {
          "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Arial,sans-serif">
          <div style="max-width:620px;margin:auto;padding:36px 20px">
            <p style="color:#e9a13b;font-size:11px;letter-spacing:3px;text-transform:uppercase">${esc(BRAND.name)} · Alerts active</p>
            <h1 style="font-family:Georgia,serif;font-size:30px">You are on the watch.</h1>
            <p style="color:#aaa;line-height:1.7">Your ${esc(input.plan)} plan is active for <strong style="color:#fff">${esc(input.states)}</strong>. When new matching filings appear, the next digest will arrive after the scheduled registry sweep.</p>
            <p style="color:#aaa;line-height:1.7">Want only certain ZIP codes, or only full bars? Set that up here:</p>
            <p style="line-height:1.7"><a style="color:#e9a13b" href="${prefsUrl(input.email)}">Change ZIP codes &amp; lead types →</a></p>
            <p style="color:#aaa;line-height:1.7">Questions? Reply to this email or contact <a style="color:#e9a13b" href="mailto:${esc(PUBLIC_CONFIG.contactEmail)}">${esc(PUBLIC_CONFIG.contactEmail)}</a>.</p>
            <p style="margin-top:28px;color:#777;font-size:11px;line-height:1.7">
              <a style="color:#e9a13b" href="${unsubscribe.page}">Stop alert emails</a><br />
              ${esc(PUBLIC_CONFIG.legalName)} · ${esc(PUBLIC_CONFIG.postalAddress)} ·
              <a style="color:#5f5648" href="${PUBLIC_CONFIG.billingPortalUrl}">Manage subscription</a>
            </p>
          </div></body></html>`,
      });
      if (result.error) {
        status = "error";
        detail = result.error.message ?? "Resend rejected the welcome email";
      } else {
        status = "sent";
        detail = result.data?.id ? `resend:${result.data.id}` : "sent";
      }
    } catch (err) {
      status = "error";
      detail = err instanceof Error ? err.message : String(err);
    }
  }

  await db.insert(emailLog).values({
    toEmail: input.email,
    subject,
    status,
    detail,
    eventCount: 0,
  });
  return { status, detail };
}

export async function sendDigest(
  sub: Subscriber,
  evts: FilingEvent[]
): Promise<{ status: SendStatus; detail: string }> {
  const subject = digestSubject(evts);
  let status: SendStatus = "dry_run";
  let detail = "RESEND_API_KEY not set — email logged, not sent";

  const key = process.env.RESEND_API_KEY;
  if (key && missingAddress(sub.email)) {
    status = "error";
    detail =
      "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM). Add a postal address, or send a test to OPS_EMAIL.";
  } else if (key) {
    try {
      const unsubscribe = unsubscribeUrls(sub.email);
      const resend = new Resend(key);
      const result = await resend.emails.send({
        from: alertFrom(),
        to: sub.email,
        replyTo: PUBLIC_CONFIG.contactEmail,
        subject,
        html: digestHtml(sub, evts),
        headers: {
          "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      if (result.error) {
        status = "error";
        detail = result.error.message ?? "Resend rejected the send";
      } else {
        status = "sent";
        detail = result.data?.id ? `resend:${result.data.id}` : "sent";
      }
    } catch (err) {
      status = "error";
      detail = err instanceof Error ? err.message : String(err);
    }
  }

  await db.insert(emailLog).values({
    toEmail: sub.email,
    subject,
    status,
    detail,
    eventCount: evts.length,
  });
  return { status, detail };
}
