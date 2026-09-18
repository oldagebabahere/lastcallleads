// Dodo Payments wiring — the India-first route (recommended for 2026).
//
// Dodo acts as Merchant of Record: they collect from the US customer,
// handle US sales tax / EU VAT, and settle to an Indian bank account.
// Settles directly to an Indian bank account — no PayPal relay needed.
//
// Required env vars:
//   DODO_API_KEY         — from Dashboard → Developers → API Keys
//   DODO_PRODUCT_ID      — the subscription product id
//   DODO_WEBHOOK_SECRET  — signing secret from the webhook config
//   PAYMENT_PROVIDER=dodo (optional; auto-detected when the keys exist)
import crypto from "crypto";

const DODO_API = process.env.DODO_API_BASE ?? "https://live.dodopayments.com";

export function dodoConfigured(): boolean {
  return Boolean(process.env.DODO_API_KEY && process.env.DODO_PRODUCT_ID);
}

// Verify Dodo's webhook signature (HMAC-SHA256 of the raw body).
export function verifyDodoSignature(
  raw: string,
  signature: string | null
): boolean {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(raw)
      .digest("hex");
    const given = signature.replace(/^sha256=/, "");
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Creates a hosted checkout session for one subscriber.
export async function createDodoCheckout(opts: {
  email: string;
  subscriberId: number;
  returnUrl: string;
}): Promise<string> {
  const key = process.env.DODO_API_KEY!;
  const productId = process.env.DODO_PRODUCT_ID!;

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
      },
    }),
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
