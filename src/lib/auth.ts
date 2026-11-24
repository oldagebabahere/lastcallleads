// Constant-time auth helpers for cron jobs and the admin control room.
//  CRON_SECRET — protects scheduled endpoints (Vercel sends Authorization: Bearer <CRON_SECRET>)
//  ADMIN_KEY   — protects /dashboard and /api/admin/*
import crypto from "crypto";

export function safeEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function cronAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const adminKey = process.env.ADMIN_KEY?.trim();

  // Fail closed in production if neither secret is configured.
  if (!cronSecret && !adminKey) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret")?.trim() ?? "";

  const candidates = [bearer, headerSecret, querySecret].filter(Boolean);
  for (const c of candidates) {
    if (cronSecret && safeEqual(c, cronSecret)) return true;
    if (adminKey && safeEqual(c, adminKey)) return true;
  }
  return false;
}

export function adminKeySet(): boolean {
  return Boolean(process.env.ADMIN_KEY?.trim());
}

export function isAdminKey(key: string | null | undefined): boolean {
  const expected = process.env.ADMIN_KEY?.trim();
  if (!expected || !key) return false;
  return safeEqual(key.trim(), expected);
}

export function extractAdminKey(req: Request): string | null {
  const header = req.headers.get("x-admin-key")?.trim();
  if (header) return header;
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const url = new URL(req.url);
  return url.searchParams.get("key")?.trim() ?? null;
}
