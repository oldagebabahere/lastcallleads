// Dodo Payments integration (Merchant of Record — US card billing, India settlement).
//
// Webhook verification implements the Standard Webhooks specification used by
// Dodo Payments:
//   Headers: webhook-id, webhook-timestamp, webhook-signature ("v1,<base64>")
//   Signed payload: `${webhook-id}.${webhook-timestamp}.${rawBody}`
//   Key: Base64-decoded secret after stripping optional `whsec_` prefix.
//
// Required env vars:
//   DODO_API_KEY          — from Dashboard -> Developers -> API Keys
//   DODO_PRODUCT_ID_SOLO  — $129/mo product id (Territory · 1 state)
//   DODO_PRODUCT_ID_PRO   — $249/mo product id (Multi-State · up to 3 states)
//   DODO_PRODUCT_ID       — fallback if per-plan ids are not set
//   DODO_WEBHOOK_SECRET   — signing secret (whsec_...) from webhook config
import crypto from "crypto";

const DODO_API = (
  process.env.DODO_API_BASE ?? "https://live.dodopayments.com"
).replace(/\/$/, "");

const MAX_WEBHOOK_AGE_SEC = 300; // 5-minute replay-attack window

export function dodoConfigured(): boolean {
  return Boolean(
    process.env.DODO_API_KEY?.trim() &&
      (process.env.DODO_PRODUCT_ID?.trim() ||
        process.env.DODO_PRODUCT_ID_SOLO?.trim() ||
        process.env.DODO_PRODUCT_ID_PRO?.trim() ||
        process.env.DODO_PRODUCT_SOLO?.trim() ||
        process.env.DODO_PRODUCT_PRO?.trim())
  );
}

function decodeWebhookKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (trimmed.startsWith("whsec_")) {
    return Buffer.from(trimmed.slice(6), "base64");
  }
  return Buffer.from(trimmed, "utf8");
}

export type WebhookVerifyResult = {
  ok: boolean;
  webhookId?: string;
  reason?: string;
};

/**
 * Verifies Dodo Payments Standard Webhooks headers (`webhook-id`,
 * `webhook-timestamp`, `webhook-signature`).
 */
export function verifyDodoWebhook(
  rawBody: string,
  headers: Headers
): WebhookVerifyResult {
  const secret = process.env.DODO_WEBHOOK_SECRET?.trim();
  if (!secret) return { ok: false, reason: "webhook_secret_not_configured" };

  const webhookId = headers.get("webhook-id")?.trim() ?? "";
  const webhookTs = headers.get("webhook-timestamp")?.trim() ?? "";
  const sigHeader = headers.get("webhook-signature")?.trim() ?? "";

  if (!webhookId || !webhookTs || !sigHeader) {
    return { ok: false, reason: "missing_standard_webhook_headers" };
  }

  // Validate replay window (Standard Webhooks timestamp is Unix seconds).
  const tsSec = Number(webhookTs);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > MAX_WEBHOOK_AGE_SEC) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  const keyBytes = decodeWebhookKey(secret);
  const signedPayload = `${webhookId}.${webhookTs}.${rawBody}`;
  const expectedB64 = crypto
    .createHmac("sha256", keyBytes)
    .update(signedPayload, "utf8")
    .digest("base64");
  const expectedBuf = Buffer.from(expectedB64, "utf8");

  // Header may contain multiple space-separated versioned signatures: "v1,<b64> v1,<b64>"
  const parts = sigHeader.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const comma = part.indexOf(",");
    if (comma === -1) continue;
    const version = part.slice(0, comma);
    const sig = part.slice(comma + 1);
    if (version !== "v1" || !sig) continue;
    const givenBuf = Buffer.from(sig, "utf8");
    if (
      givenBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, givenBuf)
    ) {
      return { ok: true, webhookId };
    }
  }

  return { ok: false, reason: "signature_mismatch" };
}

export async function createDodoCheckout(opts: {
  email: string;
  subscriberId: number;
  returnUrl: string;
  plan?: string;
  states?: string;
}): Promise<string> {
  const key = process.env.DODO_API_KEY?.trim();
  if (!key) throw new Error("DODO_API_KEY not configured");

  const productId =
    opts.plan === "pro"
      ? (
          process.env.DODO_PRODUCT_ID_PRO ??
          process.env.DODO_PRODUCT_PRO ??
          process.env.DODO_PRODUCT_ID
        )?.trim()
      : (
          process.env.DODO_PRODUCT_ID_SOLO ??
          process.env.DODO_PRODUCT_SOLO ??
          process.env.DODO_PRODUCT_ID
        )?.trim();

  if (!productId) throw new Error("DODO_PRODUCT_ID not configured");

  const res = await fetch(`${DODO_API}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: opts.email },
      return_url: opts.returnUrl,
      metadata: {
        subscriber_id: String(opts.subscriberId),
        subscriber_email: opts.email,
        plan: opts.plan === "pro" ? "pro" : "solo",
        ...(opts.states ? { states: opts.states } : {}),
      },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dodo checkout responded ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    checkout_url?: string;
    url?: string;
    payment_link?: string;
  };
  const url = json.checkout_url ?? json.url ?? json.payment_link;
  if (!url) throw new Error("Dodo checkout: no url returned");
  return url;
}
