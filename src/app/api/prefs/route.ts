// Subscriber preferences — authenticated by scoped `prefs` HMAC token.
// Enforces plan-based state caps (solo: 1, pro: 3, enterprise: 51).
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { subscribers } from "@/db/schema";
import {
  checkoutUpgradeUrl,
  exportUrl,
  verifyScopedToken,
} from "@/lib/unsubscribe";
import { INTENT_TAGS } from "@/lib/lead-score";
import { LIVE_MARKETS, LIVE_STATE_SET } from "@/lib/states";
import { validatePublicWebhookUrl } from "@/lib/notify";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_STATES = LIVE_STATE_SET;
const VALID_TAGS = new Set(INTENT_TAGS.map((t) => t.id));

function maxStatesForPlan(plan: string): number {
  if (plan === "enterprise") return LIVE_MARKETS.length;
  if (plan === "pro") return 3;
  return 1;
}

function readAuth(req: Request) {
  const url = new URL(req.url);
  return {
    email: (url.searchParams.get("email") ?? "").trim().toLowerCase(),
    token: url.searchParams.get("token") ?? "",
  };
}

export async function GET(req: Request) {
  const { email, token } = readAuth(req);
  if (!email || !verifyScopedToken(email, token, "prefs")) {
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
      plan: sub.plan,
      maxStates: maxStatesForPlan(sub.plan),
      states: sub.states.split(",").filter(Boolean),
      zipFilter: sub.zipFilter ?? "",
      typeFilter: sub.typeFilter ?? "",
      cityFilter: sub.cityFilter ?? "",
      keywordFilter: sub.keywordFilter ?? "",
      webhookUrl: sub.webhookUrl ?? "",
      digestLimit: sub.digestLimit,
      status: sub.status,
      exportHref: exportUrl(sub.email),
      upgradeHref:
        sub.status !== "active"
          ? checkoutUpgradeUrl(sub.email, sub.plan === "pro" ? "pro" : "solo")
          : null,
    },
  });
}

export async function POST(req: Request) {
  const { email, token } = readAuth(req);
  if (!email || !verifyScopedToken(email, token, "prefs")) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    states?: string[];
    zipFilter?: string;
    typeFilter?: string;
    cityFilter?: string;
    keywordFilter?: string;
    webhookUrl?: string;
    digestLimit?: number;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
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

  const maxStates = maxStatesForPlan(sub.plan);
  const states = Array.from(
    new Set(
      (body.states ?? [])
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => VALID_STATES.has(s))
    )
  ).slice(0, maxStates);

  const zips = Array.from(
    new Set(
      String(body.zipFilter ?? "")
        .split(/[,\s]+/)
        .map((z) => z.replace(/\D/g, "").slice(0, 5))
        .filter((z) => z.length === 5)
    )
  ).slice(0, 25);

  const tags = Array.from(
    new Set(
      String(body.typeFilter ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter((t) => VALID_TAGS.has(t))
    )
  ).slice(0, 8);

  const city = String(body.cityFilter ?? "").trim().slice(0, 120);
  const keywords = String(body.keywordFilter ?? "").trim().slice(0, 240);
  const rawWebhook = String(body.webhookUrl ?? "").trim();
  const safeWebhook = rawWebhook ? await validatePublicWebhookUrl(rawWebhook) : null;
  if (rawWebhook && !safeWebhook) {
    return Response.json(
      { ok: false, error: "Webhook URL must be a valid public https:// Slack, Discord, or Zapier URL." },
      { status: 422 }
    );
  }
  const limit = Math.min(200, Math.max(5, Number(body.digestLimit) || 40));

  const finalStates = states.length ? states : [sub.states.split(",")[0] || "TX"];

  await db
    .update(subscribers)
    .set({
      states: finalStates.join(","),
      zipFilter: zips.length ? zips.join(",") : null,
      typeFilter: tags.length ? tags.join(",") : null,
      cityFilter: city.length ? city.toLowerCase() : null,
      keywordFilter: keywords.length ? keywords.toLowerCase() : null,
      webhookUrl: safeWebhook,
      digestLimit: limit,
    })
    .where(eq(subscribers.id, sub.id));

  return Response.json({
    ok: true,
    saved: {
      states: finalStates,
      zips,
      tags,
      limit,
    },
  });
}
