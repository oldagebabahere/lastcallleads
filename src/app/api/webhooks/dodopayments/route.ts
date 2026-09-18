// Dodo Payments webhook — flips the subscriber to ACTIVE when payment lands.
// Also handles cancellation and expiry so access ends cleanly.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { subscribers } from "@/db/schema";
import { verifyDodoSignature } from "@/lib/dodo";
import { sendWelcome } from "@/lib/email";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature =
    req.headers.get("x-dodo-signature") ??
    req.headers.get("webhook-signature") ??
    req.headers.get("x-signature");

  if (!verifyDodoSignature(raw, signature)) {
    return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let event: {
    type?: string;
    event_type?: string;
    data?: {
      customer?: { email?: string };
      metadata?: Record<string, unknown>;
      status?: string;
      subscription_id?: string;
      customer_id?: string;
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const type = (event.type ?? event.event_type ?? "").toLowerCase();
  const data = event.data ?? {};
  const email = String(
    data.metadata?.subscriber_email ?? data.customer?.email ?? ""
  )
    .trim()
    .toLowerCase();

  if (!email) {
    return Response.json({ received: true, skipped: "no_email_in_payload" });
  }

  await ensureSchema();

  const isPaid =
    type.includes("payment.succeeded") ||
    type.includes("subscription.created") ||
    type.includes("subscription.active") ||
    type.includes("subscription.renewed");

  const isEnded =
    type.includes("subscription.cancelled") ||
    type.includes("subscription.expired") ||
    type.includes("subscription.failed");

  if (isPaid) {
    const updated = await db
      .update(subscribers)
      .set({
        status: "active",
        emailOptOut: false,
        stripeCustomerId: data.customer_id ? String(data.customer_id) : null,
        stripeSubscriptionId: data.subscription_id
          ? String(data.subscription_id)
          : null,
      })
      .where(eq(subscribers.email, email))
      .returning({ states: subscribers.states, plan: subscribers.plan });

    if (updated[0]) {
      await sendWelcome({
        email,
        states: updated[0].states,
        plan: updated[0].plan,
      });
    }
  }

  if (isEnded) {
    await db
      .update(subscribers)
      .set({ status: "canceled" })
      .where(eq(subscribers.email, email));
  }

  return Response.json({ received: true });
}
