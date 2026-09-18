// Tiny guard helpers. Two secrets, both optional:
//  CRON_SECRET — protects the scheduled endpoints (Vercel sends it automatically)
//  ADMIN_KEY   — opens your private control room (/dashboard)
// If CRON_SECRET is not set, scheduled endpoints stay open (fine for a fresh
// project). The control room REFUSES to open until ADMIN_KEY is set.

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // open until configured
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");
  return q === secret || q === process.env.ADMIN_KEY;
}

export function adminKeySet(): boolean {
  return Boolean(process.env.ADMIN_KEY);
}

export function isAdminKey(key: string | null | undefined): boolean {
  return Boolean(process.env.ADMIN_KEY && key && key === process.env.ADMIN_KEY);
}
