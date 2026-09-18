// Manual control — the buttons in your control room talk to this.
// Actions: setup (create tables), ingest (pull data now), digest (send now).
import { ensureSchema } from "@/db/bootstrap";
import { isAdminKey } from "@/lib/auth";
import { runBriefings, runDigest, runMonthlyRecaps } from "@/lib/digest";
import { sendWelcome } from "@/lib/email";
import { runIngest, type SourceId, SOURCES } from "@/lib/ingest-run";
import { runAllSources, runByState } from "@/lib/ingest-aggregator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: { key?: string; action?: string; source?: string; state?: string; email?: string; status?: string; name?: string; states?: string; plan?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!isAdminKey(body.key)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const action = body.action ?? "";
  if (action === "setup") {
    await ensureSchema();
    return Response.json({ ok: true, message: "Tables ready" });
  }
  if (action === "ingest") {
    await ensureSchema();
    const source = body.source as SourceId | undefined;
    const stateFilter = body.state as "TX" | "NY" | "CA" | undefined;
    let results = [];
    if (stateFilter && ["TX", "NY", "CA"].includes(stateFilter)) {
      results = await runByState(stateFilter);
    } else {
      // Aggregator path: pulls every configured state source at once.
      results = await runAllSources();
      const ids = (Object.keys(SOURCES) as SourceId[]).filter(
        (s) => !source || s === source
      );
      for (const id of ids) {
        const r = await runIngest(id);
        results.push({ label: r.source, state: "TX", ok: r.ok, rowsSeen: r.rowsSeen ?? 0, newLicenses: r.newLicenses ?? 0, newEvents: r.newEvents ?? 0, ...(r.error ? { error: r.error } : {}) });
      }
    }
    return Response.json({ ok: true, results });
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
  if (action === "add_subscriber") {
    // Manual client onboard: email se deal close kiya → yahan se client ko
    // turant access de do (status = active). Payment live hone ke baad
    // yeh automatic ho jayega, par route kabhi bhi kaam karega.
    const email = (body.email ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim() || null;
    const states = (body.states ?? "TX")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) =>
        ["TX", "NY", "CA", "MO", "CO", "CT", "WA", "IL", "MD", "OR"].includes(s)
      );
    const plan = body.plan === "solo" ? "solo" : "pro";
    if (!email || !email.includes("@")) {
      return Response.json({ ok: false, error: "bad_email" }, { status: 422 });
    }
    await ensureSchema();
    const { db } = await import("@/db");
    const { subscribers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const existing = await db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.email, email))
      .limit(1);
    const stateList = states.join(",") || "TX";
    if (existing.length) {
      const updated = await db
        .update(subscribers)
        .set({ status: "active", emailOptOut: false, states: stateList, plan, name })
        .where(eq(subscribers.email, email))
        .returning({ id: subscribers.id });
      const welcome = await sendWelcome({ email, states: stateList, plan });
      return Response.json({ ok: true, id: updated[0].id, mode: "updated_active", welcome: welcome.status });
    }
    const inserted = await db
      .insert(subscribers)
      .values({ email, name, plan, states: stateList, status: "active", emailOptOut: false })
      .returning({ id: subscribers.id });
    const welcome = await sendWelcome({ email, states: stateList, plan });
    return Response.json({ ok: true, id: inserted[0].id, mode: "created_active", welcome: welcome.status });
  }
  if (action === "set_status") {
    // Manual money-bridge: flip a subscriber on/off without a payment provider.
    const email = (body.email ?? "").trim().toLowerCase();
    const status = body.status ?? "";
    if (!email || !["active", "waitlist", "canceled"].includes(status)) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 422 });
    }
    await ensureSchema();
    const { db } = await import("@/db");
    const { subscribers } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const updated = await db
      .update(subscribers)
      .set(status === "active" ? { status, emailOptOut: false } : { status })
      .where(eq(subscribers.email, email))
      .returning({ id: subscribers.id, states: subscribers.states, plan: subscribers.plan });
    if (!updated.length) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const welcome =
      status === "active"
        ? await sendWelcome({ email, states: updated[0].states, plan: updated[0].plan })
        : null;
    return Response.json({ ok: true, email, status, welcome: welcome?.status });
  }
  return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
