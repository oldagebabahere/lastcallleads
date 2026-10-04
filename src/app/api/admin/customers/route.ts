// CUSTOMER MANAGER API — everything the operator needs for paying customers,
// behind ADMIN_KEY:
//   GET  /api/admin/customers?key=...   -> subscribers + email log + email config
//   POST /api/admin/customers?key=...   -> { action: "activate" | "set_status" | "test_email", ... }
//
// "test_email" is the email-machine debugger: it shows exactly WHY an email
// would fail (missing keys, rejected from-address) instead of silence.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { emailLog, subscribers } from "@/db/schema";
import { isAdminKey } from "@/lib/auth";
import { sendWelcome } from "@/lib/email";
import { BRAND } from "@/lib/brand";
import { desc, eq } from "drizzle-orm";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const url = new URL(req.url);
  const key = req.headers.get("x-admin-key") ?? url.searchParams.get("key");
  return isAdminKey(key);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const subs = await db
    .select()
    .from(subscribers)
    .orderBy(desc(subscribers.id))
    .limit(200);
  const log = await db
    .select()
    .from(emailLog)
    .orderBy(desc(emailLog.id))
    .limit(25);
  const from = process.env.ALERT_FROM_EMAIL ?? null;
  return Response.json({
    ok: true,
    emailConfig: {
      resendKey: Boolean(process.env.RESEND_API_KEY),
      fromEmail: from,
      opsEmail: process.env.OPS_EMAIL ?? null,
      fromIsSharedDomain: Boolean(from && from.includes("resend.dev")),
    },
    counts: {
      total: subs.length,
      active: subs.filter((s) => s.status === "active").length,
      trial: subs.filter((s) => s.status === "trial").length,
      waitlist: subs.filter((s) => s.status === "waitlist").length,
      canceled: subs.filter((s) => s.status === "canceled").length,
    },
    subscribers: subs.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      plan: s.plan,
      status: s.status,
      states: s.states,
      trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
      lastDigestAt: s.lastDigestAt?.toISOString() ?? null,
      createdAt: s.createdAt?.toISOString() ?? null,
      referralCredits: s.referralCredits,
    })),
    emailLog: log.map((l) => ({
      id: l.id,
      to: l.toEmail,
      subject: l.subject,
      status: l.status,
      detail: l.detail,
      at: l.createdAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  await ensureSchema();

  /* ---- test email — the debugger ------------------------------- */
  if (action === "test_email") {
    const to = String(body.to ?? process.env.OPS_EMAIL ?? "")
      .trim()
      .toLowerCase();
    if (!to) {
      return Response.json(
        { ok: false, error: "OPS_EMAIL set nahi hai — 'to' field me email do" },
        { status: 422 }
      );
    }
    const key = process.env.RESEND_API_KEY;
    const from = process.env.ALERT_FROM_EMAIL;
    if (!key || !from) {
      await db.insert(emailLog).values({
        toEmail: to,
        subject: "TEST — email machine",
        status: "dry_run",
        detail: "RESEND_API_KEY / ALERT_FROM_EMAIL set nahi hai",
      });
      return Response.json({
        ok: true,
        status: "dry_run",
        detail:
          "RESEND_API_KEY ya ALERT_FROM_EMAIL Vercel me set nahi — isliye email nahi ja raha. Env check karo, Redeploy karo.",
        from,
      });
    }
    try {
      const resend = new Resend(key);
      const res = await resend.emails.send({
        from,
        to,
        subject: "TEST — email machine chal rahi hai",
        html: `<!doctype html><html><body style="margin:0;background:#0b0906;color:#f2ead9;font-family:Georgia,serif">
          <div style="max-width:620px;margin:auto;padding:36px 20px">
            <div style="font-size:11px;letter-spacing:0.25em;color:#e9a13b;text-transform:uppercase;font-family:monospace">${BRAND.name.toUpperCase()} · TEST</div>
            <h1 style="font-size:24px;margin:12px 0">Email machine chal rahi hai ✅</h1>
            <p style="color:#8d8375;font-size:14px;line-height:1.7">Ye ek test email hai. Ye inbox me aaya = from-email + delivery sab sahi hai. Ab delete kar do.</p>
          </div>
        </body></html>`,
      });
      const ok = !res.error;
      await db.insert(emailLog).values({
        toEmail: to,
        subject: "TEST — email machine",
        status: ok ? "sent" : "error",
        detail: ok ? "manual test (customer manager)" : String(res.error).slice(0, 200),
      });
      return Response.json({
        ok,
        status: ok ? "sent" : "error",
        detail: ok
          ? "Bhej diya — inbox (aur spam folder) check karo. Nahi mila to Resend → Emails tab me reason dekho."
          : String(res.error).slice(0, 200),
        from,
      });
    } catch (e) {
      return Response.json({
        ok: false,
        status: "error",
        detail: String(e).slice(0, 200),
      });
    }
  }

  /* ---- activate a paying customer (or fix one) ------------------ */
  if (action === "activate") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return Response.json({ ok: false, error: "bad_email" }, { status: 422 });
    }
    const plan = ["solo", "pro", "enterprise"].includes(String(body.plan))
      ? String(body.plan)
      : "pro";
    const states =
      String(body.states ?? "")
        .toUpperCase()
        .replace(/[^A-Z,]/g, "")
        .replace(/,+/g, ",")
        .replace(/^,+|,+$/g, "") || "TX";
    const name = body.name ? String(body.name).slice(0, 80) : null;
    const existing = await db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.email, email))
      .limit(1);
    if (existing.length) {
      const updated = await db
        .update(subscribers)
        .set({ status: "active", emailOptOut: false, states, plan, name })
        .where(eq(subscribers.email, email))
        .returning({ id: subscribers.id });
      const welcome = await sendWelcome({ email, states, plan });
      return Response.json({
        ok: true,
        id: updated[0].id,
        mode: "updated_active",
        welcome: welcome.status,
      });
    }
    const inserted = await db
      .insert(subscribers)
      .values({ email, name, plan, states, status: "active", emailOptOut: false })
      .returning({ id: subscribers.id });
    const welcome = await sendWelcome({ email, states, plan });
    return Response.json({
      ok: true,
      id: inserted[0].id,
      mode: "created_active",
      welcome: welcome.status,
    });
  }

  /* ---- pause / resume ------------------------------------------- */
  if (action === "set_status") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const status = String(body.status ?? "");
    if (!email || !["active", "waitlist", "canceled"].includes(status)) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 422 });
    }
    const updated = await db
      .update(subscribers)
      .set(status === "active" ? { status, emailOptOut: false } : { status })
      .where(eq(subscribers.email, email))
      .returning({ id: subscribers.id });
    if (!updated.length) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, email, status });
  }

  return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
