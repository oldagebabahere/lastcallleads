// Shared plumbing for talking to state open-data portals (Socrata + CSV APIs).

export type NormalizedRecord = {
  state: string;
  key: string;
  kind: "pending" | "active";
  status: string | null;
  licenseType: string | null;
  typeName: string | null;
  tradeName: string | null;
  ownerName: string | null;
  contactName?: string | null; // permittee / designated signee / human contact when published
  phone: string | null;
  address: string | null;
  mailAddress?: string | null;
  neighborhood?: string | null;
  city: string | null;
  zip: string | null;
  county: string | null;
  filedAt: Date | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  lat: number | null;
  lng: number | null;
  sourceUrl: string;
};

export type SocrataParams = {
  where?: string;
  order?: string;
  limit: number;
  offset?: number;
  select?: string;
  timeoutMs?: number;
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {}
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 1;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === retries) {
        return res;
      }
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchSocrata(
  host: string,
  resource: string,
  params: SocrataParams
): Promise<Record<string, unknown>[]> {
  const url = new URL(`https://${host}/resource/${resource}.json`);
  if (params.where) url.searchParams.set("$where", params.where);
  if (params.order) url.searchParams.set("$order", params.order);
  if (params.select) url.searchParams.set("$select", params.select);
  if (params.offset) url.searchParams.set("$offset", String(params.offset));
  url.searchParams.set("$limit", String(params.limit));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "LastCallLeads-PourWatch/2.0 (+public-records-monitor)",
  };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token) headers["X-App-Token"] = token;

  const res = await fetchWithRetry(
    url.toString(),
    { headers },
    { timeoutMs: params.timeoutMs ?? 22_000, retries: 1 }
  );
  if (!res.ok) {
    throw new Error(`Socrata ${host}/${resource} responded ${res.status}`);
  }
  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error(`Socrata ${host}/${resource} returned non-array payload`);
  }
  return json as Record<string, unknown>[];
}

export function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

// Normalizes inconsistent casing across source feeds
// ("HOUSTON" vs "Houston" vs "houston" all become "Houston").
export function normalizeCity(value: unknown): string | null {
  const s = clean(value);
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Normalizes counties ("TRAVIS COUNTY", "TRAVIS", "travis" -> "Travis").
export function cleanCounty(value: unknown): string | null {
  const s = clean(value);
  if (!s) return null;
  const stripped = s.replace(/\s+county$/i, "").trim();
  return stripped ? normalizeCity(stripped) : null;
}

export function safeDate(
  value: unknown,
  opts: { allowFutureYears?: number } = {}
): Date | null {
  const s = clean(value);
  if (!s) return null;
  // Support compact YYYYMMDD (e.g. WA LCB applicationdate "20261120")
  const normalized = /^\d{8}$/.test(s)
    ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`
    : s;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 1990) return null;
  if (opts.allowFutureYears && opts.allowFutureYears > 0) {
    const maxYear = new Date().getFullYear() + opts.allowFutureYears;
    if (y > maxYear) return null;
  } else {
    // Filing / issue dates shouldn't be more than 1 day in the future
    // (guards against next-month effective-date renewals like Dec 1 crowding live feeds).
    const maxMs = Date.now() + 86_400_000;
    if (d.getTime() > maxMs) return null;
  }
  return d;
}

export function cleanZip(value: unknown): string | null {
  const s = clean(value);
  if (!s) return null;
  const m = s.match(/\d{5}/);
  return m ? m[0] : s.slice(0, 5) || null;
}

export function cleanNumberId(value: unknown): string | null {
  const s = clean(value);
  if (!s) return null;
  // Socrata sometimes ships ids as "2100002125.0"
  return s.replace(/\.0$/, "");
}

export function safeCoord(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) > 0.001 && Math.abs(n) <= 180 ? n : null;
}
