// Subscriber preferences — no login, no password. A single HMAC token
// (the same one used for unsubscribe) opens and saves preferences.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { subscribers } from "@/db/schema";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { INTENT_TAGS } from "@/lib/lead-score";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_STATES = new Set([
  "TX", "NY", "CA", "IL", "WA", "OR", "MO", "CO", "CT", "MD",
]);
const VALID_TAGS = new Set(INTENT_TAGS.map((t) => t.id));

function readAuth(req: Request) {
  const url = new URL(req.url);
  return {
    email: (url.searchParams.get("email") ?? "").trim().toLowerCase(),
    token: url.searchParams.get("token") ?? "",
  };
}

export async function GET(req: Request) {
  const { email, token } = readAuth(req);
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

  return Response.json({
    ok: true,
    prefs: {
      email: sub.email,
      states: sub.states.split(",").filter(Boolean),
      zipFilter: sub.zipFilter ?? "",
      typeFilter: sub.typeFilter ?? "",
      digestLimit: sub.digestLimit,
      status: sub.status,
    },
  });
}

export async function POST(req: Request) {
  const { email, token } = readAuth(req);
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    states?: string[];
    zipFilter?: string;
    typeFilter?: string;
    digestLimit?: number;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const states = (body.states ?? [])
    .map((s) => String(s).trim().toUpperCase())
    .filter((s) => VALID_STATES.has(s));

  // ZIP codes: keep only 5-digit, dedupe, cap at 25 (protects the query).
  const zips = String(body.zipFilter ?? "")
    .split(/[,\s]+/)
    .map((z) => z.replace(/\D/g, "").slice(0, 5))
    .filter((z) => z.length === 5)
    .slice(0, 25);

  const tags = String(body.typeFilter ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => VALID_TAGS.has(t))
    .slice(0, 8);

  const limit = Math.min(200, Math.max(5, Number(body.digestLimit) || 40));

  await ensureSchema();
  const updated = await db
    .update(subscribers)
    .set({
      states: states.length ? states.join(",") : "TX",
      zipFilter: zips.length ? zips.join(",") : null,
      typeFilter: tags.length ? tags.join(",") : null,
      digestLimit: limit,
    })
    .where(eq(subscribers.email, email))
    .returning({ id: subscribers.id });

  if (!updated.length) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    saved: {
      states,
      zips,
      tags,
      limit,
    },
  });
}
