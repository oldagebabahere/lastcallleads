// California — CA ABC publishes a daily full-export file, but abc.ca.gov
// blocks datacenter traffic behind Cloudflare. Plug ANY reachable CSV mirror
// URL into the CA_EXPORT_URL environment variable and this module lights up.
// Row mapping is tolerant: it looks for familiar header names.
import { clean, cleanZip, NormalizedRecord, safeDate } from "./sources";

const HEADER_MAP: Record<string, string[]> = {
  key: ["license_number", "file_number", "license", "number"],
  status: ["status", "license_status"],
  kind: ["class"],
  type: ["license_type", "type"],
  trade: ["trade_name", "dba"],
  owner: ["licensee", "owner", "legal_name"],
  address: ["premise_addr", "premises_address", "address"],
  city: ["premise_city", "city"],
  zip: ["premise_zip", "zip"],
  county: ["premise_county", "county"],
  issued: ["issue_date", "original_issue_date"],
  expires: ["expiration_date", "expiry_date"],
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (field.length || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function pick(header: string[], candidates: string[]): number {
  const norm = header.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "_"));
  for (const cand of candidates) {
    const idx = norm.findIndex((h) => h.includes(cand));
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function fetchCaLicenses(): Promise<NormalizedRecord[]> {
  const url = process.env.CA_EXPORT_URL;
  if (!url) return []; // disabled until a reachable URL is configured

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "pourwatch/1.0" },
  });
  if (!res.ok) throw new Error(`CA export URL responded ${res.status}`);
  const text = await res.text();
  const grid = parseCsv(text);
  if (grid.length < 2) throw new Error("CA export: no rows found");

  const header = grid[0];
  const idx: Record<string, number> = {};
  let matched = 0;
  for (const [k, candidates] of Object.entries(HEADER_MAP)) {
    idx[k] = pick(header, candidates);
    if (idx[k] >= 0) matched++;
  }
  if (idx.key < 0 || matched < 5) {
    throw new Error(`CA export: unrecognized format (matched ${matched} columns)`);
  }

  const out: NormalizedRecord[] = [];
  const cap = Math.min(grid.length - 1, 120000);
  for (let i = 1; i <= cap; i++) {
    const row = grid[i];
    const get = (k: string) => (idx[k] >= 0 ? clean(row[idx[k]]) : null);
    const licenseNo = get("key");
    if (!licenseNo) continue;
    const status = get("status");
    const kindSort = (get("kind") ?? "").toUpperCase();
    out.push({
      state: "CA",
      key: `CA-${licenseNo}`,
      kind: kindSort.startsWith("APP") || (status ?? "").toUpperCase().includes("PEND")
        ? "pending"
        : "active",
      status,
      licenseType: get("type"),
      typeName: get("type"),
      tradeName: get("trade"),
      ownerName: get("owner"),
      phone: null,
      address: get("address"),
      city: get("city"),
      zip: cleanZip(get("zip")),
      county: get("county"),
      filedAt: safeDate(get("issued")),
      issuedAt: safeDate(get("issued")),
      expiresAt: safeDate(get("expires")),
      lat: null,
      lng: null,
      sourceUrl: url,
    });
  }
  return out;
}
