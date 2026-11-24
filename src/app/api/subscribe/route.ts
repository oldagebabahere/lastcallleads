// Signup endpoint — honors the "7-day free trial · no card" promise honestly.
//   • Default mode: starts a 7-day free trial (1 trial per email), sends instant
//     trial welcome email with /prefs + 1-click upgrade checkout link.
//   • Explicit `immediateCheckout: true`: creates a Dodo hosted checkout session
//     when Dodo is configured (for users choosing "Skip trial & subscribe now").
//   • Active paying subscribers can NEVER be overwritten by unauthenticated POSTs.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { siteUrl } from "@/lib/site";
import { createDodoCheckout, dodoConfigured } from "@/lib/dodo";
import { sendTrialStarted } from "@/lib/email";
import { sendTelegramOwner } from "@/lib/notify";
import { scopedToken } from "@/lib/unsubscribe";
import { eq } from "drizzle-orm";
import { subscribers } from "@/db/schema";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import { LIVE_STATE_SET } from "@/lib/states";

const VALID_STATES = LIVE_STATE_SET;
const KNOWN_PLANS = new Set(["solo", "pro"]);

export async function POST(req: Request) {
  if (!rateLimit({ key: `sub:${clientIp(req)}`, max: 6, windowMs: 60_000 })) {
    return tooManyRequests();
  }

  let body: {
    email?: string;
    name?: string;
    states?: string[];
    plan?: string;
    ref?: string;
    immediateCheckout?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 422 });
  }

  const plan = KNOWN_PLANS.has(body.plan ?? "") ? (body.plan as "solo" | "pro") : "solo";
  const states = (body.states ?? [])
    .map((s) => String(s).trim().toUpperCase())
    .filter((s) => VALID_STATES.has(s));
  if (!states.length) {
    return Response.json(
      { ok: false, error: "pick_at_least_one_state" },
      { status: 422 }
    );
  }
  const uniqueStates = Array.from(new Set(states));
  const stateList = plan === "solo" ? uniqueStates.slice(0, 1) : uniqueStates.slice(0, 3);

  const rawRef = (body.ref ?? "").trim().toLowerCase();
  const refBy = EMAIL_RE.test(rawRef) && rawRef !== email ? rawRef : null;
  const wantCheckout = Boolean(body.immediateCheckout);

  await ensureSchema();

  const existing = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);

  const cur = existing[0];

  // SECURITY: Never let an unauthenticated POST overwrite an active subscriber!
  if (cur && cur.status === "active") {
    return Response.json({
      ok: true,
      mode: "already_active",
      message:
        "This email already has an active subscription. Use the preferences link at the bottom of your morning digest to change territories.",
    });
  }

  // If they already used their 7-day trial in the past, route them to checkout (or explain cleanly).
  const alreadyTrialed = Boolean(cur && cur.trialEndsAt);

  const buildWelcomeUrl = (stCsv: string, activePlan: string) =>
    `/welcome?email=${encodeURIComponent(email)}&token=${encodeURIComponent(scopedToken(email, "unlock"))}&states=${encodeURIComponent(stCsv)}&plan=${encodeURIComponent(activePlan)}`;

  if (cur && cur.status === "trial" && cur.trialEndsAt && cur.trialEndsAt.getTime() > Date.now() && !wantCheckout) {
    return Response.json({
      ok: true,
      mode: "trial",
      welcomeUrl: buildWelcomeUrl(cur.states, cur.plan),
      message:
        "Your 7-day free trial is already active — opening your live territory dashboard now.",
    });
  }

  let subscriberId: number;
  if (!cur) {
    const inserted = await db
      .insert(subscribers)
      .values({
        email,
        name: body.name?.trim().slice(0, 80) || null,
        plan,
        states: stateList.join(","),
        status: wantCheckout && dodoConfigured() ? "waitlist" : "trial",
        trialEndsAt:
          wantCheckout && dodoConfigured()
            ? null
            : new Date(Date.now() + 7 * 86_400_000),
        ...(refBy ? { refBy } : {}),
      })
      .returning({ id: subscribers.id });
    subscriberId = inserted[0].id;
  } else {
    subscriberId = cur.id;
    // Only update pending/waitlist/expired records when initiating checkout
    await db
      .update(subscribers)
      .set({
        states: stateList.join(","),
        plan,
        emailOptOut: false,
        ...(refBy && !cur.refBy ? { refBy } : {}),
      })
      .where(eq(subscribers.id, cur.id));
  }

  // Direct checkout when explicitly requested OR when a previous trial already ended.
  if ((wantCheckout || alreadyTrialed) && dodoConfigured()) {
    try {
      const statesCsv = stateList.join(",");
      const checkoutUrl = await createDodoCheckout({
        email,
        subscriberId,
        plan,
        states: statesCsv,
        returnUrl: `${siteUrl()}/welcome?session=ok&email=${encodeURIComponent(email)}&token=${encodeURIComponent(scopedToken(email, "unlock"))}&states=${encodeURIComponent(statesCsv)}&plan=${encodeURIComponent(plan)}`,
      });
      return Response.json({ ok: true, mode: "checkout", checkoutUrl });
    } catch {
      if (alreadyTrialed) {
        return Response.json({
          ok: false,
          error: "checkout_unavailable",
          message:
            "Your 7-day trial has already been used and checkout is temporarily unavailable. Contact support to activate.",
        }, { status: 503 });
      }
    }
  }

  if (alreadyTrialed) {
    return Response.json({
      ok: true,
      mode: "waitlist",
      message:
        "Your 7-day trial for this email has already ended. Contact support or use the upgrade link in your digest to activate a paid plan.",
    });
  }

  // Send immediate trial confirmation WITH top 5 real live filings in their chosen state(s)!
  await sendTrialStarted({
    email,
    states: stateList.join(", "),
    plan,
  }).catch(() => undefined);

  // Instant Telegram ping to owner when a real prospect starts a trial!
  await sendTelegramOwner(
    `🆕 NEW 7-DAY TRIAL SIGNUP!\nEmail: ${email}\nPlan: ${plan.toUpperCase()}\nStates: ${stateList.join(", ")}${refBy ? `\nReferred by: ${refBy}` : ""}`
  ).catch(() => undefined);

  return Response.json({
    ok: true,
    mode: "trial",
    welcomeUrl: buildWelcomeUrl(stateList.join(","), plan),
    message:
      `7-day free trial live for ${stateList.join(", ")} (no card required). Loading your instant live leads now…`,
  });
}
