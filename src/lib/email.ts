// Email delivery via Resend (with automatic dry-run logging when RESEND_API_KEY is unset).
import { db } from "@/db";
import { emailLog, type FilingEvent, type Subscriber } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import {
  checkoutUpgradeUrl,
  exportUrl,
  filingUnlockUrl,
  prefsUrl,
  scopedToken,
  unsubscribeUrls,
} from "@/lib/unsubscribe";
import { scoreFiling } from "@/lib/lead-score";
import { buildBeverageDossier, parseEventMeta } from "@/lib/beverage-intel";
import { isMailTransportConfigured, sendTransactionalMail } from "@/lib/mailer";
import { formatStateNames, stateFullName } from "@/lib/states";
import { siteUrl } from "@/lib/site";

export function alertFrom(): string {
  return (
    process.env.ALERT_FROM_EMAIL?.trim() ||
    `${BRAND.name} Alerts <${process.env.SMTP_USER?.trim() || PUBLIC_CONFIG.contactEmail}>`
  );
}

export type DigestExtra = Map<
  string,
  {
    phone: string | null;
    address: string | null;
    zip: string | null;
    typeName: string | null;
    sourceUrl?: string | null;
    monthlyRevenue?: number | null;
  }
>;
export type DigestOpts = { total?: number; extra?: DigestExtra };
export type SendStatus = "sent" | "dry_run" | "error";

export function digestSubject(evts: FilingEvent[], total?: number): string {
  const shown = Math.min(15, evts.length);
  const fullTotal = Math.max(total ?? 0, evts.length);
  const states = Array.from(new Set(evts.map((e) => stateFullName(e.state)))).join(" + ");
  if (fullTotal > shown) {
    return `Top ${shown} of ${fullTotal} new filings — ${states}`;
  }
  return `${shown} new filing${shown === 1 ? "" : "s"} — ${states}`;
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatCleanAddress(
  address: string | null | undefined,
  neighborhood: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined
): string {
  const parts: string[] = [];
  const rawAddr = (address ?? "").trim();
  const lower = rawAddr.toLowerCase();
  if (rawAddr) parts.push(rawAddr);
  if (neighborhood && !lower.includes(neighborhood.toLowerCase())) parts.push(neighborhood.trim());
  if (city && !lower.includes(city.toLowerCase())) parts.push(city.trim());
  if (state && !new RegExp(`\\b${state.trim().toLowerCase()}\\b`).test(lower)) {
    parts.push(state.trim());
  }
  if (zip && !lower.includes(zip.trim().toLowerCase())) parts.push(zip.trim());
  return parts.join(", ");
}

function emailBrandHeader(subtitle: string): string {
  const logoSrc = `${siteUrl()}/brand-logo.png`;
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <tr>
      <td style="width:46px;vertical-align:middle;padding-right:12px">
        <img src="${logoSrc}" alt="${esc(BRAND.name)}" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:10px;border:1px solid #e9a13b66;object-fit:cover" />
      </td>
      <td style="vertical-align:middle">
        <div style="font-size:12px;letter-spacing:0.22em;color:#e9a13b;text-transform:uppercase;font-family:monospace;font-weight:700">${esc(BRAND.name)}</div>
        <div style="font-size:10px;letter-spacing:0.18em;color:#988689;text-transform:uppercase;font-family:monospace;margin-top:2px">${esc(subtitle)}</div>
      </td>
    </tr>
  </table>`;
}

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

export function isOwnerAddress(to: string): boolean {
  const ops = (process.env.OPS_EMAIL ?? "").trim().toLowerCase();
  const support = (process.env.SUPPORT_INBOX_EMAIL ?? "").trim().toLowerCase();
  const target = to.trim().toLowerCase();
  return Boolean(target && (target === ops || target === support));
}

function missingAddress(to: string): boolean {
  return !PUBLIC_CONFIG.postalAddress && !isOwnerAddress(to);
}

export function digestHtml(
  sub: Subscriber,
  evts: FilingEvent[],
  opts: DigestOpts = {}
): string {
  const unsubscribe = unsubscribeUrls(sub.email);
  const scored = evts.map((e) => ({
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
  const rankedAll = [...scored].sort((a, b) => b.score.value - a.score.value);
  // Cap email body to Top 15 priority cards so Gmail never clips >102KB and reps scan fast.
  const ranked = rankedAll.slice(0, 15);
  const top = ranked[0];
  const totalCount = Math.max(opts.total ?? 0, evts.length);
  const remainingCount = Math.max(0, totalCount - ranked.length);
  const hotCount = scored.filter((s) => s.score.tier === "A" || isHot(s.e)).length;

  const rows = ranked
    .map(({ e, score }) => {
      const hot = score.tier === "A";
      const badge =
        e.eventType === "NEW_PENDING"
          ? `<span style="color:#e9a13b;font-weight:700">FILED</span>`
          : e.eventType === "NEW_LICENSE"
            ? `<span style="color:#7dc98f;font-weight:700">ISSUED</span>`
            : `<span style="color:#a79391;font-weight:700">UPDATE</span>`;
      const when = e.occurredAt
        ? new Date(e.occurredAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "";
      const scoreChip = `&nbsp;<span style="display:inline-block;background:${hot ? "#e9a13b22" : "#3a222a55"};border:1px solid ${hot ? "#e9a13b55" : "#3a222a"};color:${hot ? "#e9a13b" : "#bdb0ad"};font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;letter-spacing:0.06em">${score.value}</span>`;
      const info = e.licenseKey ? opts.extra?.get(`${e.state}|${e.licenseKey}`) : undefined;
      const meta = parseEventMeta(e.payload);
      const address = info?.address ?? meta.address ?? null;
      const zip = info?.zip ?? meta.zip ?? null;
      const phone = info?.phone ?? meta.phone ?? null;
      const contactName = meta.contactName ?? null;
      const neighborhood = meta.neighborhood ?? null;
      const sourceUrl = info?.sourceUrl ?? meta.sourceUrl ?? null;

      const dossier = buildBeverageDossier({
        state: e.state,
        eventType: e.eventType,
        tradeName: e.tradeName,
        ownerName: e.ownerName,
        contactName,
        address,
        city: e.city,
        zip,
        county: e.county,
        neighborhood,
        typeName: info?.typeName ?? e.typeName,
        licenseType: meta.licenseType,
        sourceUrl,
        occurredAt: e.occurredAt,
      });

      const venueTitle = e.tradeName ?? e.ownerName ?? "New Venue";
      const ownerDiff = e.ownerName && e.ownerName !== venueTitle ? `LLC: ${e.ownerName}` : null;
      const contactLine = [
        contactName ? `Contact: ${contactName}` : null,
        ownerDiff,
        phone ? `Tel: ${phone}` : null,
      ]
        .filter(Boolean)
        .map((x) => esc(x))
        .join(" · ");

      const fullAddr = formatCleanAddress(address, neighborhood, e.city, e.state, zip);
      const mapHref = fullAddr
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}`
        : null;

      const revBadge =
        info?.monthlyRevenue && info.monthlyRevenue > 0
          ? `<div style="margin-top:5px;display:inline-block;background:#e9a13b24;border:1px solid #e9a13b66;color:#e9a13b;font-family:monospace;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">★ EXISTING TX OPERATOR · $${Math.round(info.monthlyRevenue).toLocaleString()}/MO ALCOHOL VOLUME</div>`
          : "";

      const unlockHref = filingUnlockUrl(e.id, sub.email);
      return `<tr>
        <td style="padding:14px 8px;border-bottom:1px solid #2a2318;color:#988689;font-size:11px;white-space:nowrap;vertical-align:top;font-family:monospace">${esc(when)}<br/>${badge}${scoreChip}</td>
        <td style="padding:14px 8px;border-bottom:1px solid #2a2318;vertical-align:top">
          <div>
            <a href="${unlockHref}" style="color:#f6eee1;font-size:15px;font-family:Georgia,serif;font-weight:600;text-decoration:none">${esc(venueTitle)}</a>
            &nbsp;<span style="display:inline-block;border:1px solid #3a222a;background:#1b1115;color:#c9b8b4;font-size:10px;font-family:monospace;padding:1px 5px;border-radius:4px">${esc(e.state)}</span>
          </div>
          ${fullAddr && mapHref ? `<div style="margin-top:4px;font-size:12px;font-family:Arial,sans-serif"><a href="${mapHref}" style="color:#d6c7ba;text-decoration:none">📍 ${esc(fullAddr)}</a></div>` : ""}
          ${contactLine ? `<div style="margin-top:3px;color:#e9a13b;font-size:11px;font-family:Arial,sans-serif">${contactLine}</div>` : ""}
          <div style="margin-top:4px;color:#bdb0ad;font-size:11px;font-family:Arial,sans-serif"><strong>${esc(dossier.archetype)}</strong> · ${esc(info?.typeName ?? e.typeName ?? "Alcohol License")}</div>
          ${revBadge}
          <div style="margin-top:7px;font-family:monospace;font-size:10px">
            <a href="${unlockHref}" style="color:#e9a13b;text-decoration:none;font-weight:700">OPEN DOSSIER &amp; SCRIPT →</a>
            &nbsp;·&nbsp;
            <a href="${dossier.links.streetView}" style="color:#bdb0ad;text-decoration:none">Street View</a>
            &nbsp;·&nbsp;
            <a href="${dossier.links.linkedinOwner}" style="color:#bdb0ad;text-decoration:none">Find Owner</a>
            &nbsp;·&nbsp;
            <a href="${dossier.links.entityLookup}" style="color:#bdb0ad;text-decoration:none">LLC Lookup</a>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const topBlock = top
    ? (() => {
        const info = top.e.licenseKey
          ? opts.extra?.get(`${top.e.state}|${top.e.licenseKey}`)
          : undefined;
        const meta = parseEventMeta(top.e.payload);
        const topDossier = buildBeverageDossier({
          state: top.e.state,
          eventType: top.e.eventType,
          tradeName: top.e.tradeName,
          ownerName: top.e.ownerName,
          contactName: meta.contactName,
          address: info?.address ?? meta.address,
          city: top.e.city,
          zip: info?.zip ?? meta.zip,
          county: top.e.county,
          typeName: info?.typeName ?? top.e.typeName,
          occurredAt: top.e.occurredAt,
        });
        const topAddr = formatCleanAddress(
          info?.address ?? meta.address,
          null,
          top.e.city,
          top.e.state,
          info?.zip ?? meta.zip
        );
        return `<div style="margin:0 0 24px;padding:18px;border:1px solid #e9a13b66;background:#2a141b;border-radius:12px">
        <div style="font-family:monospace;font-size:10px;letter-spacing:0.2em;color:#e9a13b">★ CALL THIS ONE FIRST — SCORE ${top.score.value}/100 · ${esc(topDossier.estAnnualSpend.toUpperCase())}</div>
        <div style="margin-top:8px;font-family:Georgia,serif;font-size:19px;color:#f6eee1"><a href="${filingUnlockUrl(top.e.id, sub.email)}" style="color:#f6eee1;text-decoration:none">${esc(top.e.tradeName ?? top.e.ownerName ?? "New Venue")}</a></div>
        ${topAddr ? `<div style="margin-top:4px;font-family:Arial,sans-serif;font-size:12px;color:#d6c7ba">📍 ${esc(topAddr)}${top.e.ownerName ? ` · Entity: ${esc(top.e.ownerName)}` : ""}</div>` : ""}
        <div style="margin-top:6px;font-family:Arial,sans-serif;font-size:12px;color:#bdb0ad">${esc(topDossier.pitchAngle)}</div>
        <div style="margin-top:10px;font-family:monospace;font-size:11px">
          <a href="${filingUnlockUrl(top.e.id, sub.email)}" style="background:#e9a13b;color:#140b0e;padding:6px 12px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">OPEN DOSSIER + PITCH SCRIPT →</a>
          <a href="${exportUrl(sub.email)}" style="color:#e9a13b;margin-left:12px;text-decoration:none">Download CRM CSV ↓</a>
        </div>
      </div>`;
      })()
    : "";

  const isTrial = sub.status === "trial";
  const upgradeBanner = isTrial
    ? `<div style="margin:0 0 20px;padding:14px 16px;border:1px solid #e9a13b55;border-radius:10px;background:#1d120f;font-family:Arial,sans-serif;font-size:12px;line-height:1.7;color:#c9bfae">
        <strong style="color:#e9a13b">7-Day Free Trial Active</strong> — getting full same-day alerts.
        <a href="${checkoutUpgradeUrl(sub.email, sub.plan === "pro" ? "pro" : "solo")}" style="color:#e9a13b;font-weight:700;margin-left:6px">Lock in paid access →</a>
      </div>`
    : "";

  const firstState = (sub.states.split(",")[0] ?? "TX").trim().toUpperCase();
  const mapRouteHref = `${siteUrl()}/map?state=${encodeURIComponent(firstState)}&email=${encodeURIComponent(sub.email)}&token=${encodeURIComponent(scopedToken(sub.email, "unlock"))}`;
  const moreBanner =
    remainingCount > 0
      ? `<div style="margin:22px 0 0;padding:16px;border:1px solid #3a222a;background:#180f12;border-radius:10px;text-align:center;font-family:monospace;font-size:11px;color:#c9bfae">
          Showing top <strong style="color:#f6eee1">${ranked.length}</strong> priority accounts of <strong style="color:#e9a13b">${totalCount.toLocaleString()}</strong> new filings in your territories.
          <div style="margin-top:10px">
            <a href="${mapRouteHref}" style="background:#e9a13b;color:#140b0e;padding:7px 14px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">OPEN ALL ${totalCount.toLocaleString()} ON TERRITORY MAP →</a>
            &nbsp;&nbsp;
            <a href="${exportUrl(sub.email)}" style="color:#e9a13b;text-decoration:none;font-weight:700">DOWNLOAD FULL CSV ↓</a>
          </div>
        </div>`
      : "";

  return `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px">
    ${emailBrandHeader("Morning Intelligence Dossier")}
    <h1 style="font-size:26px;margin:4px 0 6px;font-weight:600">${remainingCount > 0 ? `Top ${ranked.length} of ${totalCount.toLocaleString()} new filings` : `${totalCount} new filing${totalCount === 1 ? "" : "s"}`} in your territories</h1>
    <p style="color:#8d8375;font-size:13px;margin:0 0 14px">${hotCount > 0 ? `<strong style="color:#e9a13b">${hotCount} priority leads</strong> — scored and ranked so you call highest-value accounts first.` : "Applications filed = buyers deciding in the next 60–90 days. Call first."}</p>
    <div style="margin:0 0 20px;font-family:monospace;font-size:11px">
      <a href="${mapRouteHref}" style="background:#2a141b;border:1px solid #e9a13b66;color:#e9a13b;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">📍 OPEN TERRITORY MAP + GOOGLE MAPS ROUTE PLANNER →</a>
    </div>
    ${upgradeBanner}
    ${topBlock}
    <table style="width:100%;border-collapse:collapse">
      <tr style="text-align:left;color:#8d8375;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;font-family:monospace">
        <th style="padding:0 8px 8px">Signal</th><th style="padding:0 8px 8px">Venue Dossier &amp; Beverage Fit</th>
      </tr>
      ${rows}
    </table>
    ${moreBanner}
    <p style="color:#8d8375;font-size:11px;margin-top:24px;line-height:1.7;font-family:monospace">
      You are receiving this service email because ${esc(sub.email)} is subscribed to: ${esc(formatStateNames(sub.states))}.<br />
      <a href="${prefsUrl(sub.email)}" style="color:#e9a13b">Change ZIP codes &amp; lead types</a> ·
      <a href="${exportUrl(sub.email)}" style="color:#e9a13b">Download CSV</a> ·
      <a href="${unsubscribe.page}" style="color:#e9a13b">Stop alert emails</a><br />
      Annual option: pay 10 months, get 12. Referral: one paying intro = next month free.<br />
      <a href="mailto:${esc(PUBLIC_CONFIG.contactEmail)}" style="color:#e9a13b">Contact support</a><br />
      ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""} ·
      <a href="${PUBLIC_CONFIG.billingPortalUrl}" style="color:#5f5648">Manage subscription</a>
    </p>
  </div></body></html>`;
}

// Sent immediately when a user starts their 7-day free trial (no card required).
export async function sendTrialStarted(input: {
  email: string;
  states: string;
  plan: string;
}): Promise<{ status: SendStatus; detail: string }> {
  const prettyStates = formatStateNames(input.states);
  const subject = `Your 7-day ${BRAND.name} trial is live (${prettyStates})`;
  let status: SendStatus = "dry_run";
  let detail = "No mail transport configured — trial welcome logged, not sent";
  const ready = isMailTransportConfigured();

  if (ready && missingAddress(input.email)) {
    status = "error";
    detail = "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM).";
  } else if (ready) {
    const unsubscribe = unsubscribeUrls(input.email);
    const upgradeLink = checkoutUpgradeUrl(
      input.email,
      input.plan === "pro" ? "pro" : "solo"
    );
    const res = await sendTransactionalMail({
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
          ${emailBrandHeader("7-Day Free Trial")}
          <h1 style="font-family:Georgia,serif;font-size:30px;margin:12px 0">You are on the watch.</h1>
          <p style="color:#c9bfae;line-height:1.7">Your 7-day free trial (no card required) is active for <strong style="color:#fff">${esc(prettyStates)}</strong>. Your first morning digest arrives after the next daily registry sweep.</p>
          <p style="color:#c9bfae;line-height:1.7">Shape your feed now — filter by ZIP code, city, venue type, or connect Slack/Discord alerts:</p>
          <p style="margin:20px 0">
            <a style="background:#e9a13b;color:#1a0e12;padding:12px 22px;border-radius:999px;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:0.08em;text-decoration:none;display:inline-block" href="${prefsUrl(input.email)}">CONFIGURE ZIP CODES &amp; FILTERS →</a>
          </p>
          <p style="color:#8d8375;font-size:13px;line-height:1.7">Ready to keep alerts running past day 7? <a style="color:#e9a13b" href="${upgradeLink}">Upgrade anytime →</a></p>
          <p style="margin-top:24px;color:#777;font-size:11px;line-height:1.7;font-family:monospace">
            <a style="color:#e9a13b" href="${exportUrl(input.email)}">Download 30-day CSV</a> ·
            <a style="color:#e9a13b" href="${unsubscribe.page}">Stop alert emails</a><br />
            ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""}
          </p>
        </div></body></html>`,
    });
    status = res.status;
    detail = res.detail;
  }

  await db
    .insert(emailLog)
    .values({ toEmail: input.email, subject, status, detail, eventCount: 0 })
    .catch(() => undefined);
  return { status, detail };
}

// Trial over — one email with direct 1-click upgrade checkout link.
export async function sendTrialEnded(sub: {
  email: string;
  states: string;
  plan?: string;
}): Promise<{ status: SendStatus; detail: string }> {
  const prettyStates = formatStateNames(sub.states);
  const subject = "Your 7-day trial just ended";
  let status: SendStatus = "dry_run";
  let detail = "No mail transport configured — trial-ended email logged, not sent";
  const ready = isMailTransportConfigured();
  if (ready && missingAddress(sub.email)) {
    status = "error";
    detail = "postal address missing (CAN-SPAM)";
  } else if (ready) {
    const unsubscribe = unsubscribeUrls(sub.email);
    const upgradeHref = checkoutUpgradeUrl(
      sub.email,
      sub.plan === "pro" ? "pro" : "solo"
    );
    const res = await sendTransactionalMail({
      from: alertFrom(),
      to: sub.email,
      replyTo: PUBLIC_CONFIG.contactEmail,
      subject,
      headers: {
        "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
        <div style="max-width:620px;margin:auto;padding:36px 20px">
          <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${esc(BRAND.name)}</div>
          <h1 style="font-size:26px;margin:12px 0 4px">Your trial week is up.</h1>
          <p style="color:#c9bfae;font-size:14px;line-height:1.7">For seven days you saw every new filing in <strong style="color:#f2ead9">${esc(prettyStates)}</strong> the morning it posted. That was the full paid service — no watered-down preview.</p>
          <p style="color:#c9bfae;font-size:14px;line-height:1.7">Venues in your territory keep filing every morning. Keep your daily email running and stay first in line.</p>
          <p style="margin:28px 0"><a href="${upgradeHref}" style="background:#e9a13b;color:#1a0e12;padding:12px 24px;border-radius:999px;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:0.08em;text-decoration:none;display:inline-block">KEEP THE ALERTS COMING →</a></p>
          <p style="color:#8d8375;font-size:11px;line-height:1.7;font-family:monospace">
            <a href="${siteUrl()}/#pricing" style="color:#e9a13b">Compare plans</a> ·
            <a href="${unsubscribe.page}" style="color:#e9a13b">Stop alert emails</a><br/>
            ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""}
          </p>
        </div>
      </body></html>`,
    });
    status = res.status;
    detail = res.detail;
  }
  await db
    .insert(emailLog)
    .values({ toEmail: sub.email, subject, status, detail, eventCount: 0 })
    .catch(() => undefined);
  return { status, detail };
}

export async function sendBriefing(input: {
  email: string;
  states: string;
  weekFilings: number;
  hotCounties: string[];
  topTypes: string[];
  hotLeads: string[];
}): Promise<{ status: SendStatus; detail: string }> {
  const prettyStates = formatStateNames(input.states);
  const subject = `Your territory briefing — ${input.weekFilings} filings this week`;
  let status: SendStatus = "dry_run";
  let detail = "No mail transport configured — briefing logged, not sent";
  const ready = isMailTransportConfigured();

  if (ready && missingAddress(input.email)) {
    status = "error";
    detail =
      "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM).";
  } else if (ready) {
    const unsubscribe = unsubscribeUrls(input.email);
    const res = await sendTransactionalMail({
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
          <h1 style="font-size:26px;margin:12px 0 4px">Your week in ${esc(prettyStates)}</h1>
          <p style="color:#8d8375;font-size:13px;margin:0 0 24px">Every Monday we recap what moved, so nothing slips past you.</p>
          <table style="width:100%;border-collapse:collapse;font-family:monospace">
            <tr><td style="padding:10px 8px;color:#8d8375;border-bottom:1px solid #2a2318">New filings detected</td><td style="padding:10px 8px;text-align:right;color:#f2ead9;font-size:16px;border-bottom:1px solid #2a2318"><strong>${input.weekFilings}</strong></td></tr>
            <tr><td style="padding:10px 8px;color:#8d8375;border-bottom:1px solid #2a2318">Hottest counties</td><td style="padding:10px 8px;text-align:right;color:#f2ead9;border-bottom:1px solid #2a2318">${esc(input.hotCounties.join(", ") || "—")}</td></tr>
            <tr><td style="padding:10px 8px;color:#8d8375;border-bottom:1px solid #2a2318">Dominant concepts</td><td style="padding:10px 8px;text-align:right;color:#f2ead9;border-bottom:1px solid #2a2318">${esc(input.topTypes.join(", ") || "—")}</td></tr>
          </table>
          ${input.hotLeads.length ? `<h2 style="font-size:17px;margin:26px 0 8px;color:#e9a13b">Priority calls this week</h2>
          <p style="color:#f2ead9;font-size:13px;line-height:1.8;font-family:monospace">${input.hotLeads.map((l) => `◆ ${esc(l)}`).join("<br/>")}</p>` : ""}
          <p style="color:#8d8375;font-size:11px;margin-top:24px;line-height:1.7;font-family:monospace">
            <a href="${prefsUrl(input.email)}" style="color:#e9a13b">Preferences</a> ·
            <a href="${unsubscribe.page}" style="color:#e9a13b">Stop alert emails</a> ·
            <a href="mailto:${esc(PUBLIC_CONFIG.contactEmail)}" style="color:#e9a13b">Contact support</a><br/>
            ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""} ·
            <a href="${PUBLIC_CONFIG.billingPortalUrl}" style="color:#5f5648">Manage subscription</a>
          </p>
        </div></body></html>`,
    });
    status = res.status;
    detail = res.detail;
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
  let detail = "No mail transport configured — monthly recap logged, not sent";
  const ready = isMailTransportConfigured();

  if (ready && missingAddress(input.email)) {
    status = "error";
    detail =
      "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM).";
  } else if (ready) {
    const unsubscribe = unsubscribeUrls(input.email);
    const res = await sendTransactionalMail({
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
          <p style="color:#8d8375;font-size:13px;margin:0 0 24px">Use this to benchmark territory activity and ROI.</p>
          <table style="width:100%;border-collapse:collapse;font-family:monospace">
            <tr><td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375">Filings monitored</td><td style="padding:12px 8px;border-bottom:1px solid #2a2318;text-align:right;color:#f2ead9;font-size:20px"><strong>${input.monthFilings}</strong></td></tr>
            <tr><td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375">Hot leads flagged</td><td style="padding:12px 8px;border-bottom:1px solid #2a2318;text-align:right;color:#e9a13b;font-size:20px"><strong>${input.hotFilings}</strong></td></tr>
            <tr><td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375">Hottest cities</td><td style="padding:12px 8px;border-bottom:1px solid #2a2318;text-align:right;color:#f2ead9">${esc(input.topCities.join(", ") || "—")}</td></tr>
            <tr><td style="padding:12px 8px;border-bottom:1px solid #2a2318;color:#8d8375">Most common concepts</td><td style="padding:12px 8px;border-bottom:1px solid #2a2318;text-align:right;color:#f2ead9">${esc(input.topTypes.join(", ") || "—")}</td></tr>
          </table>
          ${input.sampleLeads.length ? `<h2 style="margin:26px 0 8px;font-size:18px;color:#e9a13b">A few priority leads you saw</h2><p style="font-family:monospace;color:#f2ead9;font-size:12px;line-height:1.8">${input.sampleLeads.map((l) => `◆ ${esc(l)}`).join("<br/>")}</p>` : ""}
          <div style="margin-top:26px;padding:18px;border:1px solid #2a2318;background:#14100a;border-radius:12px">
            <p style="margin:0;color:#f2ead9;font-weight:700">Save with annual billing or referrals</p>
            <p style="margin:8px 0 0;color:#8d8375;font-size:13px;line-height:1.7">Annual prepay: pay 10 months, get 12. Reply “annual” and we will switch your account.</p>
            <p style="margin:8px 0 0;color:#8d8375;font-size:13px;line-height:1.7">Refer one paying rep and get your next month free: <a href="${siteUrl()}/refer" style="color:#e9a13b">${esc(siteUrl())}/refer</a></p>
          </div>
          <p style="color:#8d8375;font-size:11px;margin-top:22px;line-height:1.7;font-family:monospace">
            <a href="${prefsUrl(input.email)}" style="color:#e9a13b">Preferences</a> ·
            <a href="${unsubscribe.page}" style="color:#e9a13b">Stop alert emails</a> ·
            <a href="mailto:${esc(PUBLIC_CONFIG.contactEmail)}" style="color:#e9a13b">Contact support</a><br />
            ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""} ·
            <a href="${PUBLIC_CONFIG.billingPortalUrl}" style="color:#5f5648">Manage subscription</a>
          </p>
        </div></body></html>`,
    });
    status = res.status;
    detail = res.detail;
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
  const prettyStates = formatStateNames(input.states);
  const subject = `Your ${BRAND.name} alerts are active`;
  let status: SendStatus = "dry_run";
  let detail = "No mail transport configured — welcome email logged, not sent";
  const ready = isMailTransportConfigured();

  if (ready && missingAddress(input.email)) {
    status = "error";
    detail =
      "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM).";
  } else if (ready) {
    const unsubscribe = unsubscribeUrls(input.email);
    const res = await sendTransactionalMail({
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
          <p style="color:#aaa;line-height:1.7">Your ${esc(input.plan)} plan is active for <strong style="color:#fff">${esc(prettyStates)}</strong>. When new matching filings appear, the next digest will arrive after the scheduled registry sweep.</p>
          <p style="color:#aaa;line-height:1.7">Want only certain ZIP codes, cities, venue types, or Slack/Discord alerts? Set that up here:</p>
          <p style="line-height:1.7"><a style="color:#e9a13b" href="${prefsUrl(input.email)}">Change ZIP codes, webhooks &amp; lead types →</a></p>
          <p style="margin-top:20px;padding:12px 14px;border:1px solid #3a2c1f;border-radius:8px;color:#c9bfae;font-size:12px;line-height:1.7"><strong style="color:#e9a13b">Gmail tip:</strong> if this email lands in Updates, drag it to Primary and choose &quot;Always do this&quot; so your morning digest is first thing you see.</p>
          <p style="color:#aaa;line-height:1.7">Questions? Reply to this email or contact <a style="color:#e9a13b" href="mailto:${esc(PUBLIC_CONFIG.contactEmail)}">${esc(PUBLIC_CONFIG.contactEmail)}</a>.</p>
          <p style="margin-top:28px;color:#777;font-size:11px;line-height:1.7">
            <a style="color:#e9a13b" href="${exportUrl(input.email)}">Download 30-day CSV</a> ·
            <a style="color:#e9a13b" href="${unsubscribe.page}">Stop alert emails</a><br />
            ${esc(PUBLIC_CONFIG.legalName)}${PUBLIC_CONFIG.postalAddress ? ` · ${esc(PUBLIC_CONFIG.postalAddress)}` : ""} ·
            <a style="color:#5f5648" href="${PUBLIC_CONFIG.billingPortalUrl}">Manage subscription</a>
          </p>
        </div></body></html>`,
    });
    status = res.status;
    detail = res.detail;
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
  evts: FilingEvent[],
  opts: DigestOpts = {}
): Promise<{ status: SendStatus; detail: string }> {
  const subject = digestSubject(evts, opts.total);
  let status: SendStatus = "dry_run";
  let detail = "No mail transport configured — email logged, not sent";

  const ready = isMailTransportConfigured();
  if (ready && missingAddress(sub.email)) {
    status = "error";
    detail =
      "NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS is required before emailing customers (CAN-SPAM).";
  } else if (ready) {
    const unsubscribe = unsubscribeUrls(sub.email);
    const res = await sendTransactionalMail({
      from: alertFrom(),
      to: sub.email,
      replyTo: PUBLIC_CONFIG.contactEmail,
      subject,
      html: digestHtml(sub, evts, opts),
      headers: {
        "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    status = res.status;
    detail = res.detail;
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
