import crypto from "crypto";
import { siteUrl } from "@/lib/site";

function secret(): string {
  const value =
    process.env.UNSUBSCRIBE_SECRET ??
    process.env.CRON_SECRET ??
    process.env.ADMIN_KEY;
  if (!value) throw new Error("UNSUBSCRIBE_SECRET or ADMIN_KEY is required");
  return value;
}

export function unsubscribeToken(email: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  try {
    const expected = unsubscribeToken(email);
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function unsubscribeUrls(email: string) {
  const normalized = email.trim().toLowerCase();
  const token = unsubscribeToken(normalized);
  const query = new URLSearchParams({ email: normalized, token }).toString();
  return {
    page: `${siteUrl()}/unsubscribe?${query}`,
    oneClick: `${siteUrl()}/api/unsubscribe?${query}`,
  };
}

// Preferences magic link — no password, no login screen. The same HMAC that
// powers unsubscribe also opens the preferences page, so a subscriber can
// change ZIP codes and lead types from the footer of any digest.
export function prefsUrl(email: string) {
  const normalized = email.trim().toLowerCase();
  const token = unsubscribeToken(normalized);
  const query = new URLSearchParams({ email: normalized, token }).toString();
  return `${siteUrl()}/prefs?${query}`;
}

// CSV of the subscriber's own recent alerts, also token-protected.
export function exportUrl(email: string) {
  const normalized = email.trim().toLowerCase();
  const token = unsubscribeToken(normalized);
  const query = new URLSearchParams({ email: normalized, token }).toString();
  return `${siteUrl()}/api/export?${query}`;
}
