// Manual control room endpoint — triggers ingest (by state or tier), PourWatch
// self-healing, receipts, digests, briefings, monthly recaps, and subscriber ops.
import { ensureSchema } from "@/db/bootstrap";
import { extractAdminKey, isAdminKey } from "@/lib/auth";
import { runBriefings, runDigest, runMonthlyRecaps } from "@/lib/digest";
import { sendWelcome } from "@/lib/email";
import { runIngest, type SourceId, ALL_SOURCES } from "@/lib/ingest-run";
import {
  reprobeAndHealPaused,
  runAllSources,
  runByState,
} from "@/lib/ingest-aggregator";
import { runReceiptsIngest } from "@/lib/ingest-receipts";
import { runAutoOutreach } from "@/lib/auto-outreach";
import { runMaintenance } from "@/lib/maintenance";
import { sendTelegramOwner } from "@/lib/notify";
import { BRAND } from "@/lib/brand";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_STATES = new Set(
  "AL AK AZ AR CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(
    " "
  )
);

export async function POST(req: Request) {
  let body: {
    key?: string;
    action?: string;
    source?: string;
    state?: string;
    tier?: "fast" | "heavy" | "all";
    email?: string;
    status?: string;
    name?: string;
    states?: string;
    plan?: string;
    force?: boolean;
    dryRun?: boolean;
    limit?: number;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const key = body.key ?? extractAdminKey(req);
  if (!isAdminKey(key)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!rateLimit({ key: `run:${clientIp(req)}`, max: 30, windowMs: 60_000 })) {
    return tooManyRequests();
  }

  const action = body.action ?? "";

  if (action === "setup") {
    await ensureSchema();
    return Response.json({ ok: true, message: "Tables ready" });
  }

  if (action === "ingest") {
    await ensureSchema();
    const force = body.force === true;
    const stateFilter = (body.state ?? "").trim().toUpperCase();
    const sourceFilter = body.source as SourceId | undefined;

    if (sourceFilter && ALL_SOURCES.includes(sourceFilter)) {
      const r = await runIngest(sourceFilter);
      return Response.json({ ok: r.ok, results: [r], skipped: [] });
    }
    if (stateFilter && /^[A-Z]{2}$/.test(stateFilter)) {
      const agg = await runByState(stateFilter, force);
      return Response.json({ ok: true, state: stateFilter, ...agg });
    }
    const tier =
      body.tier === "heavy" || body.tier === "fast" ? body.tier : "all";
    const agg = await runAllSources(force, {
      tier,
      budgetMs: 48_000,
      concurrency: 5,
    });
    return Response.json({ ok: true, tier, ...agg });
  }

  if (action === "pourwatch") {
    await ensureSchema();
    const reprobed = await reprobeAndHealPaused(true);
    return Response.json({ ok: true, reprobed });
  }

  if (action === "receipts") {
    await ensureSchema();
    const r = await runReceiptsIngest(8000);
    return Response.json({ ok: r.ok, receipts: r });
  }

  if (action === "digest") {
    await ensureSchema();
    const report = await runDigest();
    return Response.json({ ok: true, report });
  }

  if (action === "briefings") {
    await ensureSchema();
    const report = await runBriefings();
    return Response.json({ ok: true, report });
  }

  if (action === "monthly_recaps") {
    await ensureSchema();
    const report = await runMonthlyRecaps();
    return Response.json({ ok: true, report });
  }

  if (action === "outreach") {
    await ensureSchema();
    const report = await runAutoOutreach({
      dryRun: body.dryRun === true,
      state: body.state,
      limit: body.limit,
    });
    return Response.json({ ok: report.ok, report });
  }

  if (action === "maintenance") {
    await ensureSchema();
    const report = await runMaintenance();
    const dbMb =
      report.databaseBytes !== null
        ? Number((report.databaseBytes / (1024 * 1024)).toFixed(1))
        : null;
    return Response.json({ ...report, dbMb });
  }

  if (action === "test_telegram") {
    const res = await sendTelegramOwner(
      `✅ ${BRAND.name} Control Room Test\nYour Telegram bot is live and connected!\nTime: ${new Date().toISOString()}`
    );
    return Response.json({ ok: res.ok, detail: res.detail });
  }

  if (action === "add_subscriber") {
    const email = (body.email ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim().slice(0, 80) || null;
    const states = (body.states ?? "TX")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => VALID_STATES.has(s));
    const plan =
      body.plan === "pro" || body.plan === "enterprise" ? body.plan : "solo";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ ok: false, error: "bad_email" }, { status: 422 });
    }
    await ensureSchema();
    const existing = await db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.email, email))
      .limit(1);
    const stateList = Array.from(new Set(states)).join(",") || "TX";
    if (existing.length) {
      const updated = await db
        .update(subscribers)
        .set({
          status: "active",
          emailOptOut: false,
          states: stateList,
          plan,
          name,
          welcomeSentAt: new Date(),
        })
        .where(eq(subscribers.email, email))
        .returning({ id: subscribers.id });
      const welcome = await sendWelcome({ email, states: stateList, plan });
      return Response.json({
        ok: true,
        id: updated[0].id,
        mode: "updated_active",
        welcome: welcome.status,
      });
    }
    const inserted = await db
      .insert(subscribers)
      .values({
        email,
        name,
        plan,
        states: stateList,
        status: "active",
        emailOptOut: false,
        welcomeSentAt: new Date(),
      })
      .returning({ id: subscribers.id });
    const welcome = await sendWelcome({ email, states: stateList, plan });
    return Response.json({
      ok: true,
      id: inserted[0].id,
      mode: "created_active",
      welcome: welcome.status,
    });
  }

  if (action === "set_status") {
    const email = (body.email ?? "").trim().toLowerCase();
    const status = body.status ?? "";
    if (!email || !["active", "waitlist", "canceled", "trial"].includes(status)) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 422 });
    }
    await ensureSchema();
    const updated = await db
      .update(subscribers)
      .set(status === "active" ? { status, emailOptOut: false } : { status })
      .where(eq(subscribers.email, email))
      .returning({
        id: subscribers.id,
        states: subscribers.states,
        plan: subscribers.plan,
        welcomeSentAt: subscribers.welcomeSentAt,
      });
    if (!updated.length) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    let welcome = null;
    if (status === "active" && !updated[0].welcomeSentAt) {
      await db
        .update(subscribers)
        .set({ welcomeSentAt: new Date() })
        .where(eq(subscribers.id, updated[0].id));
      welcome = await sendWelcome({
        email,
        states: updated[0].states,
        plan: updated[0].plan,
      });
    }
    return Response.json({ ok: true, email, status, welcome: welcome?.status });
  }

  return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
