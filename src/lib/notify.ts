// Zero-cost real-time push channels:
//   1) Subscriber Slack / Discord / Zapier / CRM webhooks (SSRF-guarded)
//   2) Free Owner Telegram Bot notifications (daily summary + ready-to-share social post)
//   3) Official LinkedIn UGC REST API auto-poster (100% official, zero scraping/ban risk)
import type { FilingEvent, Subscriber } from "@/db/schema";
import { BRAND } from "./brand";
import { isSafePublicHost } from "./email-finder";
import { stateFullName } from "./states";
import { filingUnlockUrl } from "./unsubscribe";
import { siteUrl } from "./site";

export async function validatePublicWebhookUrl(raw: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (!(await isSafePublicHost(u.hostname))) return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

// Pushes top morning leads straight into a subscriber's Slack, Discord, Zapier, Make, or HubSpot webhook.
export async function pushSubscriberWebhook(
  sub: Subscriber,
  evts: FilingEvent[]
): Promise<{ ok: boolean; detail: string }> {
  const rawUrl = sub.webhookUrl?.trim();
  if (!rawUrl || !evts.length) return { ok: false, detail: "no_webhook" };

  const safeUrl = await validatePublicWebhookUrl(rawUrl);
  if (!safeUrl) return { ok: false, detail: "blocked_unsafe_url" };

  const top = evts.slice(0, 10);
  const lines = top.map((e, i) => {
    const name = e.tradeName ?? e.ownerName ?? "New Venue";
    const place = [e.city, stateFullName(e.state)].filter(Boolean).join(", ");
    const tag = e.eventType === "NEW_PENDING" ? "FILED" : "ISSUED";
    const url = filingUnlockUrl(e.id, sub.email);
    return `${i + 1}. [${tag}] ${name} (${place}) — ${e.typeName ?? "Liquor Filing"} · ${url}`;
  });

  const text = `🍸 ${BRAND.name}: ${evts.length} new hospitality filing${evts.length === 1 ? "" : "s"} in your territory\n\n${lines.join("\n")}`;

  // Payload compatible with Slack (`text`), Discord (`content`), AND Zapier/Make/n8n (`leads[]`).
  const payload = {
    text,
    content: text.slice(0, 1950),
    source: BRAND.name,
    count: evts.length,
    territory: sub.states,
    leads: top.map((e) => ({
      id: e.id,
      state: e.state,
      stateName: stateFullName(e.state),
      eventType: e.eventType,
      tradeName: e.tradeName,
      ownerName: e.ownerName,
      city: e.city,
      county: e.county,
      typeName: e.typeName,
      occurredAt: e.occurredAt?.toISOString() ?? null,
      dossierUrl: filingUnlockUrl(e.id, sub.email),
    })),
  };

  try {
    const res = await fetch(safeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6_000),
      redirect: "error",
    });
    return res.ok
      ? { ok: true, detail: `webhook:${res.status}` }
      : { ok: false, detail: `webhook_http_${res.status}` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 100) : "webhook_failed",
    };
  }
}

// 100% Free Owner Phone Notifications via Telegram Bot (@BotFather)
export async function sendTelegramOwner(text: string): Promise<{ ok: boolean; detail: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { ok: false, detail: "telegram_not_configured" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, detail: `telegram_http_${res.status}` };
    return { ok: true, detail: "telegram_sent" };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 100) : "telegram_error",
    };
  }
}

// Auto-resolves the LinkedIn personal URN (`urn:li:person:...`) via OpenID `/v2/userinfo`
// so the user ONLY needs to paste LINKEDIN_ACCESS_TOKEN in Vercel (zero manual URN lookup!).
async function resolveLinkedInAuthorUrn(token: string): Promise<string | null> {
  const configured = process.env.LINKEDIN_AUTHOR_URN?.trim();
  if (configured) return configured;
  try {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sub?: string };
    return data.sub ? `urn:li:person:${data.sub}` : null;
  } catch {
    return null;
  }
}

// 100% Official LinkedIn REST Posts API Auto-Poster (modern `/rest/posts`, zero scraping, zero ban risk).
// Self-serve instant approval via "Share on LinkedIn" (`w_member_social`) in LinkedIn Developer Portal.
// Note: Standard LinkedIn user access tokens expire every 60 days — if a 401 occurs, we automatically
// ping Telegram so you can refresh it in 30 seconds without ever losing a post.
export async function publishLinkedInOfficial(
  text: string
): Promise<{ ok: boolean; detail: string }> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, detail: "linkedin_not_configured" };

  const author = await resolveLinkedInAuthorUrn(token);
  if (!author) return { ok: false, detail: "linkedin_author_urn_unavailable" };

  const version = process.env.LINKEDIN_API_VERSION?.trim() || "202604";

  try {
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": version,
      },
      body: JSON.stringify({
        author,
        commentary: text.slice(0, 2900),
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          article: {
            source: siteUrl(),
            title: `${BRAND.name} — Daily US Liquor License Intelligence`,
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) {
      await sendTelegramOwner(
        `⚠️ ${BRAND.name}: Your LinkedIn 60-day access token expired (HTTP 401). Generate a fresh token in LinkedIn Developer Portal and update LINKEDIN_ACCESS_TOKEN in Vercel.`
      ).catch(() => undefined);
      return { ok: false, detail: "linkedin_token_expired_401" };
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { ok: false, detail: `linkedin_http_${res.status}:${errBody.slice(0, 80)}` };
    }
    return { ok: true, detail: "linkedin_rest_posts_ok" };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 100) : "linkedin_error",
    };
  }
}
