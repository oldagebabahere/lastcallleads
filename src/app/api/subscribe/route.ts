// Signup endpoint. Two modes:
//   1. Dodo Payments configured → create a hosted checkout and redirect there
//   2. Not configured yet       → park the email on the waitlist (still captured)
//
// Every signup is stored in the database first, so a customer is never lost
// even if a payment provider throws an error mid-flight.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { siteUrl } from "@/lib/site";
import { createDodoCheckout, dodoConfigured } from "@/lib/dodo";
import { eq } from "drizzle-orm";
import { subscribers } from "@/db/schema";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATES = new Set([
  "TX",
  "NY",
  "CA",
  "MO",
  "CO",
  "CT",
  "WA",
  "IL",
  "MD",
  "OR",
]);
const KNOWN_PLANS = new Set(["solo", "pro"]);

export async function POST(req: Request) {
  let body: {
    email?: string;
    name?: string;
    states?: string[];
    plan?: string;
    ref?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 422 });
  }

  const plan = KNOWN_PLANS.has(body.plan ?? "") ? body.plan! : "pro";
  const states = (body.states ?? [])
    .map((s) => String(s).trim().toUpperCase())
    .filter((s) => VALID_STATES.has(s));
  const stateList = states.length ? states : ["TX"];

  // Referral attribution — "refer one paying rep, get a month free".
  const rawRef = (body.ref ?? "").trim().toLowerCase();
  const refBy = EMAIL_RE.test(rawRef) && rawRef !== email ? rawRef : null;

  await ensureSchema();

  const existing = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);

  let subscriberId: number;
  if (existing.length) {
    await db
      .update(subscribers)
      .set({
        states: stateList.join(","),
        plan,
        name: body.name ?? existing[0].name,
        ...(refBy && !existing[0].refBy ? { refBy } : {}),
      })
      .where(eq(subscribers.email, email));
    subscriberId = existing[0].id;
  } else {
    const inserted = await db
      .insert(subscribers)
      .values({
        email,
        name: body.name ?? null,
        plan,
        states: stateList.join(","),
        status: "waitlist",
        ...(refBy ? { refBy } : {}),
      })
      .returning({ id: subscribers.id });
    subscriberId = inserted[0].id;
  }

  // Send them to Dodo's hosted checkout when it is configured.
  if (dodoConfigured()) {
    try {
      const checkoutUrl = await createDodoCheckout({
        email,
        subscriberId,
        returnUrl: `${siteUrl()}/welcome?session=ok`,
      });
      return Response.json({ ok: true, mode: "checkout", checkoutUrl });
    } catch {
      // Dodo hiccup — the signup is already saved, so fall through to waitlist.
    }
  }

  return Response.json({
    ok: true,
    mode: "waitlist",
    message:
      "You are on the early-access list. We will email you the moment your territory opens.",
  });
}
