// Lightweight in-process rate limiter — no external service needed.
// Good enough for a single Hobby instance: one IP hammering an endpoint
// gets 429s before it can burn function time or AI credits.
// (For belt-and-braces, also put Cloudflare in front of a custom domain
// later and allowlist your own IP for /api/admin/*.)

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export function clientIp(req: Request): string {
  // Prefer x-real-ip (set by the platform to the actual connecting client).
  // For x-forwarded-for take the LAST entry — platforms append the real IP,
  // so the first entries can be attacker-supplied. Trusting the first entry
  // would let anyone rotate a fake XFF header to dodge rate limits.
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

/** Returns true when the request is allowed; false = over the limit (429). */
export function rateLimit(opts: {
  key: string;
  max: number;
  windowMs: number;
}): boolean {
  const now = Date.now();
  const bucket = buckets.get(opts.key);
  const hits = (bucket?.hits ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.max) {
    buckets.set(opts.key, { hits });
    return false;
  }
  hits.push(now);
  buckets.set(opts.key, { hits });
  // crude memory guard — this process is short-lived anyway
  if (buckets.size > 5000) buckets.clear();
  return true;
}

export function tooManyRequests(retryAfterSec = 60): Response {
  return Response.json(
    { ok: false, error: "Too many requests — slow down." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
