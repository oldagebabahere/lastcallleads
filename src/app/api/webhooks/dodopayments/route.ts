// Dodo Payments Standard Webhooks handler.
//   • Verifies Standard Webhooks HMAC-SHA256 (`webhook-id`, `webhook-timestamp`, `webhook-signature`)
//   • Enforces strict at-most-once idempotency via `webhook_events`
//   • Upserts subscriber (handles direct checkouts where no pre-existing row exists)
//   • Sends Welcome email ONCE (`welcomeSentAt IS NULL`)
//   • Grants referral credit ONCE (`referralRewarded = false` -> `true`)
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { subscribers, webhookEvents } from "@/db/schema";
import { verifyDodoWebhook } from "@/lib/dodo";
import { alertFrom, sendWelcome } from "@/lib/email";
import { isMailTransportConfigured, sendTransactionalMail } from "@/lib/mailer";
import { sendTelegramOwner } from "@/lib/notify";
import { LIVE_STATE_SET } from "@/lib/states";
import crypto from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type DodoEvent = {
  type?: string;
  event_type?: string;
  data?: {
    customer?: { email?: string; name?: string; customer_id?: string };
    metadata?: Record<string, unknown>;
    status?: string;
    subscription_id?: string;
    customer_id?: string;
    payment_id?: string;
    product_id?: string;
    product_cart?: { product_id?: string; quantity?: number }[];
    total_amount?: number;
    currency?: string;
  };
};

function getLastCallProductIds(): Set<string> {
  const ids = [
    process.env.DODO_PRODUCT_ID,
    process.env.DODO_PRODUCT_ID_SOLO,
    process.env.DODO_PRODUCT_ID_PRO,
    process.env.DODO_PRODUCT_SOLO,
    process.env.DODO_PRODUCT_PRO,
    process.env.DODO_PRODUCT_ID_ENTERPRISE,
  ]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
  return new Set(ids);
}

const EXTENSION_SUITE_PRODUCT_ID = "pdt_0NrebLD1tWfogHGqobMpi";

// Generates a unique, valid Master Key matching the Pro Extension Suite's
// offline modular verification (starts with DODO-, length >= 14, |hash| % 7 === 0).
function generateExtensionMasterKey(seed: string): string {
  const prefix = crypto
    .createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  for (let n = 1000; n < 2000; n++) {
    const candidate = `DODO-${prefix}-${n}`;
    let hash = 0;
    for (let i = 0; i < candidate.length; i++) {
      hash = (hash << 5) - hash + candidate.charCodeAt(i);
      hash |= 0;
    }
    if (Math.abs(hash) % 7 === 0) return candidate;
  }
  return "DODO-PROSUITE-1006";
}

function extractEventProductIds(data: NonNullable<DodoEvent["data"]>): string[] {
  const out: string[] = [];
  if (data.product_id?.trim()) out.push(data.product_id.trim());
  for (const item of data.product_cart ?? []) {
    if (item?.product_id?.trim()) out.push(item.product_id.trim());
  }
  return Array.from(new Set(out));
}

export async function POST(req: Request) {
  const raw = await req.text();
  const verified = verifyDodoWebhook(raw, req.headers);
  if (!verified.ok || !verified.webhookId) {
    return Response.json(
      { ok: false, error: verified.reason ?? "bad_signature" },
      { status: 401 }
    );
  }

  let event: DodoEvent;
  try {
    event = JSON.parse(raw) as DodoEvent;
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const type = (event.type ?? event.event_type ?? "").toLowerCase();
  const data = event.data ?? {};

  await ensureSchema();

  // Strict idempotency guard: if we already processed this webhook-id, ack 200.
  const claimed = await db
    .insert(webhookEvents)
    .values({
      provider: "dodopayments",
      eventId: verified.webhookId,
      eventType: type || "unknown",
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (!claimed.length) {
    return Response.json({ received: true, duplicate: true });
  }

  const email = String(
    data.metadata?.subscriber_email ?? data.customer?.email ?? ""
  )
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    return Response.json({ received: true, skipped: "no_email_in_payload" });
  }

  // PRODUCT ISOLATION GUARD: If the same Dodo account also sells other products
  // (e.g. Browser Extensions or PassMark EU), NEVER add their buyers to Last Call Leads
  // or send them Texas liquor-license emails!
  const allowedProducts = getLastCallProductIds();
  const eventProducts = extractEventProductIds(data);
  const hasLclMeta = Boolean(data.metadata?.subscriber_id || data.metadata?.subscriber_email);
  if (
    allowedProducts.size > 0 &&
    !hasLclMeta &&
    (eventProducts.length === 0 || !eventProducts.some((p) => allowedProducts.has(p)))
  ) {
    const isOneTimePaid = type.includes("payment.succeeded");
    const amt =
      typeof data.total_amount === "number"
        ? `$${(data.total_amount / 100).toFixed(2)} ${data.currency ?? "USD"}`
        : "";

    // Auto-deliver working Master Key for Pro Suite Lifetime Unlock Key (All Extensions)!
    if (isOneTimePaid && eventProducts.includes(EXTENSION_SUITE_PRODUCT_ID)) {
      const masterKey = generateExtensionMasterKey(
        `${email}:${data.payment_id ?? verified.webhookId}`
      );
      const custName = (data.customer?.name ?? "there").replace(/[<>&"]/g, "");
      if (isMailTransportConfigured()) {
        await sendTransactionalMail({
          from: alertFrom(),
          to: email,
          subject: "Your Pro Suite Lifetime Master Key (All 210+ Extensions)",
          html: `<!doctype html><html><body style="margin:0;background:#0b1020;color:#f1f5f9;font-family:Arial,sans-serif">
            <div style="max-width:580px;margin:0 auto;padding:32px 20px">
              <p style="font-family:monospace;font-size:11px;letter-spacing:0.18em;color:#fbbf24;text-transform:uppercase">PRO SUITE ECOSYSTEM · LIFETIME PASS</p>
              <h1 style="font-size:24px;margin:8px 0 12px">Thank you for your purchase, ${custName}!</h1>
              <p style="color:#cbd5e1;font-size:14px;line-height:1.6">Your Lifetime Master Key unlocks this extension plus all 210+ Pro Tools permanently with unlimited daily actions and zero cooldowns.</p>
              <div style="margin:22px 0;padding:18px;border:1px solid #a855f7;border-radius:12px;background:#161030;text-align:center">
                <div style="font-family:monospace;font-size:10px;letter-spacing:0.2em;color:#c084fc;margin-bottom:8px">YOUR LIFETIME MASTER KEY</div>
                <div style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:#ffffff">${masterKey}</div>
              </div>
              <p style="color:#cbd5e1;font-size:13px;line-height:1.7"><strong>How to activate (10 seconds):</strong><br/>1. Open your browser extension and click the Upgrade / Pro badge.<br/>2. Paste <code>${masterKey}</code> into the <em>Enter License Key</em> box.<br/>3. Click <strong>Activate Master Key</strong> — Pro unlocks instantly forever.</p>
              <p style="color:#94a3b8;font-size:12px;margin-top:24px">Need help? Just reply to this email and we&apos;ll sort it out right away.</p>
            </div>
          </body></html>`,
        }).catch(() => undefined);
      }
      await sendTelegramOwner(
        `🎉 EXTENSION PRO SALE! ${amt}\nCustomer: ${email}\nMaster Key AUTO-EMAILED: ${masterKey}`
      ).catch(() => undefined);
      return Response.json({
        received: true,
        delivered: "extension_master_key",
        productIds: eventProducts,
      });
    }

    if (isOneTimePaid) {
      await sendTelegramOwner(
        `🛒 Sale on another Dodo product ${amt}\nCustomer: ${email}\nProduct: ${eventProducts.join(", ") || "unknown"}\n(Safely ignored by Last Call Leads — no wrong email sent!)`
      ).catch(() => undefined);
    }
    return Response.json({
      received: true,
      ignored: "non_lastcallleads_product",
      productIds: eventProducts,
    });
  }

  const customerId = data.customer_id ?? data.customer?.customer_id ?? null;
  const subscriptionId = data.subscription_id ?? null;
  const metaPlan = String(data.metadata?.plan ?? "").toLowerCase();
  const resolvedPlan =
    metaPlan === "pro" || metaPlan === "enterprise" ? metaPlan : "solo";
  const metaStatesRaw = String(data.metadata?.states ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => LIVE_STATE_SET.has(s));
  const resolvedStates = metaStatesRaw.length ? metaStatesRaw.join(",") : "TX";

  const isPaid =
    type.includes("payment.succeeded") ||
    type.includes("subscription.created") ||
    type.includes("subscription.active") ||
    type.includes("subscription.renewed");

  const isEnded =
    type.includes("subscription.cancelled") ||
    type.includes("subscription.canceled") ||
    type.includes("subscription.expired") ||
    type.includes("subscription.failed") ||
    type.includes("subscription.on_hold");

  if (isPaid) {
    const existing = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, email))
      .limit(1);

    let sub = existing[0];
    if (!sub) {
      // Direct checkout without prior trial row — never drop a paying customer!
      const inserted = await db
        .insert(subscribers)
        .values({
          email,
          name: data.customer?.name ?? null,
          plan: resolvedPlan,
          states: resolvedStates,
          status: "active",
          emailOptOut: false,
          ...(customerId ? { stripeCustomerId: String(customerId) } : {}),
          ...(subscriptionId ? { stripeSubscriptionId: String(subscriptionId) } : {}),
        })
        .onConflictDoNothing()
        .returning();
      sub = inserted[0];
    } else {
      const updated = await db
        .update(subscribers)
        .set({
          status: "active",
          emailOptOut: false,
          ...(metaPlan === "solo" || metaPlan === "pro" || metaPlan === "enterprise"
            ? { plan: metaPlan }
            : {}),
          ...(customerId ? { stripeCustomerId: String(customerId) } : {}),
          ...(subscriptionId ? { stripeSubscriptionId: String(subscriptionId) } : {}),
        })
        .where(eq(subscribers.email, email))
        .returning();
      sub = updated[0];
    }

    if (sub) {
      // Send welcome email at most ONCE (atomic check on welcomeSentAt IS NULL).
      const claimedWelcome = await db
        .update(subscribers)
        .set({ welcomeSentAt: new Date() })
        .where(and(eq(subscribers.id, sub.id), isNull(subscribers.welcomeSentAt)))
        .returning({ id: subscribers.id });

      if (claimedWelcome.length) {
        await sendWelcome({
          email: sub.email,
          states: sub.states,
          plan: sub.plan,
        }).catch(() => undefined);

        const price =
          sub.plan === "enterprise" ? "$499/mo" : sub.plan === "pro" ? "$249/mo" : "$129/mo";
        await sendTelegramOwner(
          `💰 NEW PAID CUSTOMER! (${price})\nEmail: ${sub.email}\nPlan: ${sub.plan.toUpperCase()}\nStates: ${sub.states}`
        ).catch(() => undefined);
      }

      // Grant referral credit ONCE on first paid activation (never on renewals).
      if (sub.refBy && sub.refBy !== sub.email && !sub.referralRewarded) {
        const claimedRef = await db
          .update(subscribers)
          .set({ referralRewarded: true })
          .where(
            and(eq(subscribers.id, sub.id), eq(subscribers.referralRewarded, false))
          )
          .returning({ id: subscribers.id });

        if (claimedRef.length) {
          await db
            .update(subscribers)
            .set({ referralCredits: sql`${subscribers.referralCredits} + 1` })
            .where(eq(subscribers.email, sub.refBy));
        }
      }
    }
  }

  if (isEnded) {
    await db
      .update(subscribers)
      .set({ status: "canceled" })
      .where(eq(subscribers.email, email));
    await sendTelegramOwner(
      `⚠️ Subscription ended (${type})\nEmail: ${email}`
    ).catch(() => undefined);
  }

  return Response.json({ received: true });
}
