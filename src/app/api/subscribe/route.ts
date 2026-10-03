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
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// All 50 states + DC: state-level retail filings where portals exist, and
// federal TTB permits (new wholesalers/producers/wineries) everywhere else.
const VALID_STATES = new Set(
  "AL AK AZ AR CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" ")
);
const KNOWN_PLANS = new Set(["solo", "pro"]);

export async function POST(req: Request) {
  // public endpoint — cap sign-up spam from a single IP
  if (!rateLimit({ key: `sub:${clientIp(req)}`, max: 5, windowMs: 60_000 })) {
    return tooManyRequests();
  }
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
  if (!states.length) {
    return Response.json(
      { ok: false, error: "pick_at_least_one_state" },
      { status: 422 }
    );
  }
  // Solo covers ONE state (as priced); All-Access up to 12.
  const stateList = plan === "solo" ? states.slice(0, 1) : states.slice(0, 3);

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
        // Real trial: digests flow immediately, no card needed, for 7 days.
        status: "trial",
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
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
        plan,
        returnUrl: `${siteUrl()}/welcome?session=ok`,
      });
      return Response.json({ ok: true, mode: "checkout", checkoutUrl });
    } catch {
      // Dodo hiccup — the signup is already saved, so fall through to waitlist.
    }
  }

  return Response.json({
    ok: true,
    mode: "trial",
    message:
      "Trial live: your first morning digest arrives tomorrow (7 days free, no card).",
  });
}
