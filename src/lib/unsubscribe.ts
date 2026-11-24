// Purpose-scoped HMAC magic-link tokens for subscriber self-service links
// (unsubscribe, preferences, CSV export, checkout upgrade, and filing unlock).
import crypto from "crypto";
import { siteUrl } from "@/lib/site";

export type TokenScope = "unsub" | "prefs" | "export" | "checkout" | "unlock";

function secret(): string {
  const value =
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.ADMIN_KEY?.trim();
  if (!value) throw new Error("UNSUBSCRIBE_SECRET, CRON_SECRET, or ADMIN_KEY is required");
  return value;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function timingEq(expected: string, actual: string): boolean {
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(actual, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function scopedToken(email: string, scope: TokenScope): string {
  return hmac(`${scope}:${email.trim().toLowerCase()}`);
}

// Legacy unscoped token helper kept only for verifying older emails already in inboxes.
export function unsubscribeToken(email: string): string {
  return scopedToken(email, "unsub");
}

export function verifyScopedToken(
  email: string,
  token: string,
  scope: TokenScope
): boolean {
  if (!email || !token) return false;
  const norm = email.trim().toLowerCase();
  if (timingEq(scopedToken(norm, scope), token)) return true;
  // Backward compatibility: allow legacy unscoped token ONLY for unsubscribe links
  // so old emails stay CAN-SPAM compliant without letting unsub links access prefs/export.
  if (scope === "unsub" && timingEq(hmac(norm), token)) return true;
  return false;
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  return verifyScopedToken(email, token, "unsub");
}

export function unsubscribeUrls(email: string) {
  const normalized = email.trim().toLowerCase();
  const token = scopedToken(normalized, "unsub");
  const query = new URLSearchParams({ email: normalized, token }).toString();
  return {
    page: `${siteUrl()}/unsubscribe?${query}`,
    oneClick: `${siteUrl()}/api/unsubscribe?${query}`,
  };
}

export function prefsUrl(email: string) {
  const normalized = email.trim().toLowerCase();
  const token = scopedToken(normalized, "prefs");
  const query = new URLSearchParams({ email: normalized, token }).toString();
  return `${siteUrl()}/prefs?${query}`;
}

export function exportUrl(email: string) {
  const normalized = email.trim().toLowerCase();
  const token = scopedToken(normalized, "export");
  const query = new URLSearchParams({ email: normalized, token }).toString();
  return `${siteUrl()}/api/export?${query}`;
}

export function checkoutUpgradeUrl(email: string, plan: "solo" | "pro" = "solo") {
  const normalized = email.trim().toLowerCase();
  const token = scopedToken(normalized, "checkout");
  const query = new URLSearchParams({ email: normalized, token, plan }).toString();
  return `${siteUrl()}/api/checkout?${query}`;
}

export function filingUnlockUrl(eventId: number, email: string) {
  const normalized = email.trim().toLowerCase();
  const token = scopedToken(normalized, "unlock");
  const query = new URLSearchParams({ email: normalized, token }).toString();
  return `${siteUrl()}/feed/${eventId}?${query}`;
}
