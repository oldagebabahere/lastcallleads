// Subscriber CSV export — "CSV export in digest".
// The digest footer links here; the token in the link authenticates the
// subscriber, so no login screen is needed. Returns their recent alerts.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, subscribers } from "@/db/schema";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { and, desc, gt, inArray, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function esc(v: string | null | undefined): string {
  return `"${(v ?? "").replace(/"/g, '""').trim()}"`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const token = url.searchParams.get("token") ?? "";
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const rows = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);
  const sub = rows[0];
  if (!sub) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const stateList = sub.states
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const since = new Date(Date.now() - 30 * 86_400_000);

  const data = await db
    .select()
    .from(events)
    .where(
      and(
        stateList.length ? inArray(events.state, stateList) : undefined,
        gt(events.detectedAt, since)
      )
    )
    .orderBy(desc(events.occurredAt))
    .limit(2000);

  // Apply the subscriber's own digest filters so the CSV matches the email.
  const cityNeedle = (sub.cityFilter ?? "").trim().toLowerCase();
  const keywords = (sub.keywordFilter ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const filtered = data.filter((e) => {
    const city = (e.city ?? "").toLowerCase();
    if (cityNeedle && !city.includes(cityNeedle)) return false;
    if (keywords.length) {
      const hay = `${e.summary ?? ""} ${e.typeName ?? ""} ${e.tradeName ?? ""} ${city}`.toLowerCase();
      return keywords.every((k) => hay.includes(k));
    }
    return true;
  });

  const header = [
    "signal",
    "venue",
    "owner",
    "city",
    "county",
    "license_type",
    "state",
    "event_date",
    "detected_date",
  ].join(",");

  const lines = filtered.map((e) =>
    [
      esc(e.eventType === "NEW_PENDING" ? "APPLICATION FILED" : "LICENSE ISSUED"),
      esc(e.tradeName ?? ""),
      esc(e.ownerName ?? ""),
      esc(e.city ?? ""),
      esc(e.county ?? ""),
      esc(e.typeName ?? ""),
      esc(e.state),
      esc(e.occurredAt ? new Date(e.occurredAt).toISOString().slice(0, 10) : ""),
      esc(new Date(e.detectedAt).toISOString().slice(0, 10)),
    ].join(",")
  );

  const csv = [header, ...lines].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lastcallleads-${stateList.join("-").toLowerCase()}-30d.csv"`,
    },
  });
}
