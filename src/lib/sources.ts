// Shared plumbing for talking to state open-data portals (Socrata APIs).

export type NormalizedRecord = {
  state: string;
  key: string;
  kind: "pending" | "active";
  status: string | null;
  licenseType: string | null;
  typeName: string | null;
  tradeName: string | null;
  ownerName: string | null;
  phone: string | null;
  address: string | null;
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

type SocrataParams = {
  where?: string;
  order?: string;
  limit: number;
  select?: string;
};

export async function fetchSocrata(
  host: string,
  resource: string,
  params: SocrataParams
): Promise<Record<string, unknown>[]> {
  const url = new URL(`https://${host}/resource/${resource}.json`);
  if (params.where) url.searchParams.set("$where", params.where);
  if (params.order) url.searchParams.set("$order", params.order);
  if (params.select) url.searchParams.set("$select", params.select);
  url.searchParams.set("$limit", String(params.limit));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "pourwatch/1.0 (+public-records-monitor)",
  };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token) headers["X-App-Token"] = token;

  const res = await fetch(url.toString(), { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Socrata ${host}/${resource} responded ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>[];
}

export function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

// Fixes duplicate cities caused by inconsistent casing across source feeds
// ("HOUSTON" vs "Houston" vs "houston" all become "Houston").
export function normalizeCity(value: unknown): string | null {
  const s = clean(value);
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function safeDate(value: unknown): Date | null {
  const s = clean(value);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  // Guard against registry typos — Colorado's feed, for example, ships
  // issue dates like "2262-04-01". Anything before 1990 or more than a
  // year out is treated as corrupt, not as a real filing date.
  const y = d.getFullYear();
  const maxYear = new Date().getFullYear() + 1;
  if (y < 1990 || y > maxYear) return null;
  return d;
}

export function cleanZip(value: unknown): string | null {
  const s = clean(value);
  if (!s) return null;
  return s.slice(0, 5) || s;
}

export function cleanNumberId(value: unknown): string | null {
  const s = clean(value);
  if (!s) return null;
  // Socrata sometimes ships ids as "2100002125.0"
  return s.replace(/\.0$/, "");
}
