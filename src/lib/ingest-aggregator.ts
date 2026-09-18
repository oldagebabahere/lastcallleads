// Universal aggregator: a single module that batches MANY state sources
// into the same database + email pipeline. Each state contributes its own
// "source" entry; the existing digest/email code already filters by state
// automatically. To add a new state:
//
//   1. Add an entry to STATES below (state code, label, source URL or a
//      Socrata dataset id).
//   2. The cron job runs daily; the relevant fetcher runs automatically and
//      flows the same path as TX + NY.
//
// No further code changes — period. New rows in the database trigger new
// city pages, new entries in the digest, fresh sitemap updates.

import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses } from "@/db/schema";
import type { NormalizedRecord } from "./sources";
import { clean, cleanNumberId, cleanZip, safeDate } from "./sources";
import { txTypeName } from "./ingest-tx";
import { and, eq, inArray } from "drizzle-orm";

export type StateSpec = {
  state: string;
  label: string;
  socrata?: { host: string; dataset: string; where?: string; limit?: number };
  fetchUrl?: string;
  // mapping between raw source columns and our normalized fields
  map: (rec: Record<string, unknown>) => NormalizedRecord | null;
};

// ---------- TX ----------
const TX_PENDING_SPEC: StateSpec = {
  state: "TX",
  label: "Texas · pending",
  socrata: { host: "data.texas.gov", dataset: "mxm5-tdpj", limit: 5000 },
  map: (rec) => {
    const appId = cleanNumberId(rec.applicationid);
    if (!appId) return null;
    const code = clean(rec.license_type);
    return {
      state: "TX",
      key: `TX-P-${appId}`,
      kind: "pending",
      status: clean(rec.applicationstatus) ?? "Pending",
      licenseType: code,
      typeName: txTypeName(code),
      tradeName: null,
      ownerName: clean(rec.owner),
      phone: null,
      address: clean(rec.address),
      city: clean(rec.city),
      zip: cleanZip(rec.zip),
      county: clean(rec.county),
      filedAt: safeDate(rec.submission_date),
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.texas.gov/d/mxm5-tdpj",
    };
  },
};

const TX_ACTIVE_SPEC: StateSpec = {
  state: "TX",
  label: "Texas · active",
  socrata: {
    host: "data.texas.gov",
    dataset: "7hf9-qc9f",
    where: "primary_status='Active'",
    limit: 6000,
  },
  map: (rec) => {
    const licenseId = cleanNumberId(rec.license_id);
    if (!licenseId) return null;
    const code = clean(rec.license_type);
    return {
      state: "TX",
      key: `TX-L-${licenseId}`,
      kind: "active",
      status: clean(rec.primary_status) ?? "Active",
      licenseType: code,
      typeName: txTypeName(code),
      tradeName: clean(rec.trade_name),
      ownerName: clean(rec.owner),
      phone: clean(rec.phone),
      address: clean(rec.address),
      city: clean(rec.city),
      zip: cleanZip(rec.zip),
      county: clean(rec.county),
      filedAt: safeDate(rec.original_issue_date),
      issuedAt: safeDate(rec.current_issued_date) ?? safeDate(rec.status_change_date),
      expiresAt: safeDate(rec.expiration_date),
      lat: null,
      lng: null,
      sourceUrl: "https://data.texas.gov/d/7hf9-qc9f",
    };
  },
};

// ---------- NY ----------
const NY_PENDING_SPEC: StateSpec = {
  state: "NY",
  label: "New York · pending",
  socrata: { host: "data.ny.gov", dataset: "f8i8-k2gm", limit: 5000 },
  map: (rec) => {
    const appId = clean(rec.application_id);
    if (!appId) return null;
    return {
      state: "NY",
      key: `NY-P-${appId}`,
      kind: "pending",
      status: clean(rec.status) ?? "Pending",
      licenseType: clean(rec.class) ?? clean(rec.type),
      typeName: clean(rec.description),
      tradeName: clean(rec.legalname),
      ownerName: clean(rec.legalname),
      phone: null,
      address: clean(rec.actual_address_of_premises),
      city: clean(rec.city),
      zip: cleanZip(rec.zip_code),
      county: clean(rec.premises_county),
      filedAt: safeDate(rec.received_date),
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.ny.gov/d/f8i8-k2gm",
    };
  },
};

const NY_ACTIVE_SPEC: StateSpec = {
  state: "NY",
  label: "New York · active",
  socrata: { host: "data.ny.gov", dataset: "9s3h-dpkz", limit: 6000 },
  map: (rec) => {
    const permitId = clean(rec.licensepermitid);
    if (!permitId) return null;
    return {
      state: "NY",
      key: `NY-L-${permitId}`,
      kind: "active",
      status: "Active",
      licenseType: clean(rec.class) ?? clean(rec.type),
      typeName: clean(rec.description),
      tradeName: clean(rec.dba) ?? clean(rec.legalname),
      ownerName: clean(rec.legalname),
      phone: null,
      address: clean(rec.actualaddressofpremises),
      city: clean(rec.city),
      zip: cleanZip(rec.zipcode),
      county: clean(rec.premisescounty),
      filedAt: safeDate(rec.originalissuedate),
      issuedAt: safeDate(rec.lastissuedate) ?? safeDate(rec.effectivedate),
      expiresAt: safeDate(rec.expirationdate),
      lat: null,
      lng: null,
      sourceUrl: "https://data.ny.gov/d/9s3h-dpkz",
    };
  },
};

// ---------- CA ----------
// CA source URL is configurable via env so we don't depend on the
// abc.ca.gov origin that blocks datacenter traffic.
const CA_SPEC: StateSpec = {
  state: "CA",
  label: "California · full export",
  fetchUrl: process.env.CA_EXPORT_URL || "",
  map: (rec) => {
    const licenseNo = clean(rec.license_number) ?? clean(rec.file_number) ?? clean(rec.license) ?? clean(rec.number);
    if (!licenseNo) return null;
    const status = clean(rec.status) ?? clean(rec.license_status);
    const kindKind = (clean(rec.class) ?? "").toUpperCase();
    return {
      state: "CA",
      key: `CA-${licenseNo}`,
      kind: kindKind.startsWith("APP") || (status ?? "").toUpperCase().includes("PEND") ? "pending" : "active",
      status,
      licenseType: clean(rec.license_type) ?? clean(rec.type),
      typeName: caTypeName(clean(rec.license_type) ?? clean(rec.type)),
      tradeName: clean(rec.trade_name) ?? clean(rec.dba),
      ownerName: clean(rec.licensee) ?? clean(rec.owner) ?? clean(rec.legal_name),
      phone: null,
      address: clean(rec.premise_addr) ?? clean(rec.premises_address) ?? clean(rec.address),
      city: clean(rec.premise_city) ?? clean(rec.city),
      zip: cleanZip(rec.premise_zip) ?? cleanZip(rec.zip),
      county: clean(rec.premise_county) ?? clean(rec.county),
      filedAt: safeDate(rec.issue_date) ?? safeDate(rec.original_issue_date),
      issuedAt: safeDate(rec.issue_date) ?? safeDate(rec.original_issue_date),
      expiresAt: safeDate(rec.expiration_date) ?? safeDate(rec.expiry_date),
      lat: null,
      lng: null,
      sourceUrl: process.env.CA_EXPORT_URL ?? "",
    };
  },
};

// ---------- MISSOURI ----------
const MO_SPEC: StateSpec = {
  state: "MO",
  label: "Missouri · liquor licenses",
  socrata: { host: "data.mo.gov", dataset: "dymb-xy5c", limit: 3000 },
  map: (rec) => {
    const lic = clean(rec.license_number);
    if (!lic) return null;
    const status = clean(rec.current_status);
    return {
      state: "MO",
      key: `MO-${lic}`,
      kind: "active",
      status,
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: clean(rec.dbaname),
      ownerName: clean(rec.licensee),
      phone: null,
      address: [clean(rec.street_number), clean(rec.street)].filter(Boolean).join(" ") || null,
      city: clean(rec.city),
      zip: cleanZip(rec.zip_code),
      county: clean(rec.county),
      filedAt: safeDate(rec.original_date),
      issuedAt: safeDate(rec.original_date),
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.mo.gov/d/dymb-xy5c",
    };
  },
};

// ---------- COLORADO ----------
const CO_SPEC: StateSpec = {
  state: "CO",
  label: "Colorado · recently approved",
  socrata: { host: "data.colorado.gov", dataset: "htyp-tqzh", limit: 3000 },
  map: (rec) => {
    const lic = clean(rec.license_number);
    if (!lic) return null;
    return {
      state: "CO",
      key: `CO-${lic}`,
      kind: "active",
      status: "Approved",
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: clean(rec.doing_business_as),
      ownerName: clean(rec.licensee_name),
      phone: null,
      address: clean(rec.street_address),
      city: clean(rec.city),
      zip: cleanZip(rec.zip),
      county: null,
      filedAt: safeDate(rec.issue_date),
      issuedAt: safeDate(rec.issue_date),
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.colorado.gov/d/htyp-tqzh",
    };
  },
};

// ---------- CONNECTICUT ----------
const CT_SPEC: StateSpec = {
  state: "CT",
  label: "Connecticut · restaurant liquor",
  socrata: { host: "data.ct.gov", dataset: "gm8q-ur5f", limit: 4000 },
  map: (rec) => {
    const id = clean(rec.credentialid);
    if (!id) return null;
    return {
      state: "CT",
      key: `CT-${id}`,
      kind: "active",
      status: clean(rec.status) ?? "Active",
      licenseType: clean(rec.credentialtype),
      typeName: clean(rec.credentialtype) === "LIR" ? "Restaurant Liquor" : clean(rec.credentialtype),
      tradeName: clean(rec.dba),
      ownerName: clean(rec.name),
      phone: null,
      address: clean(rec.address),
      city: clean(rec.city),
      zip: cleanZip(rec.zip),
      county: clean(rec.county) ?? clean(rec.town),
      filedAt: safeDate(rec.issuedate),
      issuedAt: safeDate(rec.issuedate),
      expiresAt: safeDate(rec.expirationdate),
      lat: null,
      lng: null,
      sourceUrl: "https://data.ct.gov/d/gm8q-ur5f",
    };
  },
};

// ---------- WASHINGTON ----------
const WA_SPEC: StateSpec = {
  state: "WA",
  label: "Washington · LCB renewals + licenses",
  socrata: { host: "data.wa.gov", dataset: "9dee-kzm5", limit: 5000 },
  map: (rec) => {
    const lic = clean(rec.license);
    if (!lic) return null;
    return {
      state: "WA",
      key: `WA-${lic}`,
      kind: "active",
      status: "Licensed",
      licenseType: clean(rec.l_a_type),
      typeName: clean(rec.l_a_type),
      tradeName: clean(rec.tradename),
      ownerName: clean(rec.tradename),
      phone: clean(rec.dayphone),
      address: clean(rec.streetaddress),
      city: clean(rec.city),
      zip: cleanZip(rec.zipcode),
      county: clean(rec.countycode),
      filedAt: null,
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.wa.gov/d/9dee-kzm5",
    };
  },
};

// ---------- ILLINOIS (Chicago) ----------
// Chicago publishes the full liquor-license register (including taverns,
// restaurants, package stores) with neighborhood and ward data.
const IL_SPEC: StateSpec = {
  state: "IL",
  label: "Illinois · Chicago liquor licenses",
  socrata: { host: "data.cityofchicago.org", dataset: "nrmj-3kcf", limit: 6000 },
  map: (rec) => {
    const id = clean(rec.license_number) ?? clean(rec.id);
    if (!id) return null;
    const zip = cleanZip(rec.zip_code);
    const description = clean(rec.license_description) ?? clean(rec.business_activity);
    return {
      state: "IL",
      key: `IL-${id}`,
      kind: "active",
      status: "Licensed",
      licenseType: clean(rec.license_code),
      typeName: description,
      tradeName: clean(rec.doing_business_as_name),
      ownerName: clean(rec.legal_name),
      phone: null,
      address: clean(rec.address),
      city: clean(rec.city) ?? "Chicago",
      zip,
      county: clean(rec.neighborhood) ?? clean(rec.community_area_name) ?? "Cook",
      filedAt: safeDate(rec.license_start_date) ?? safeDate(rec.date_issued),
      issuedAt: safeDate(rec.date_issued) ?? safeDate(rec.license_start_date),
      expiresAt: safeDate(rec.expiration_date) ?? safeDate(rec.license_term_expiration_date),
      lat: null,
      lng: null,
      sourceUrl: "https://data.cityofchicago.org/d/nrmj-3kcf",
    };
  },
};

// ---------- CALIFORNIA (Napa County — real CA data) ----------
// Napa County publishes its alcohol retail licenses on its own Socrata
// portal. Real California license numbers, types, and premises addresses.
// Additional CA counties can be layered in the same way.
const NAPA_SPEC: StateSpec = {
  state: "CA",
  label: "California · Napa County alcohol retail licenses",
  socrata: { host: "data.napacounty.gov", dataset: "8rw6-hhca", limit: 2000 },
  map: (rec) => {
    const lic = clean(rec.license_number);
    if (!lic) return null;
    const addr = clean(rec.premises_addr) ?? clean(rec.address);
    // Format: "494 SOSCOL AVE,NAPA, CA  94559-4004"
    // City = the part immediately before the state+zip part.
    let city: string | null = null;
    let zip: string | null = null;
    if (addr) {
      const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^[A-Z]{2}\s+\d{5}/.test(parts[i])) {
          const candidate = parts[i - 1];
          if (candidate && !/^#/.test(candidate) && /[A-Za-z]{3}/.test(candidate)) {
            city = candidate.replace(/\s+/g, " ");
          }
          break;
        }
      }
      // Fallback: a two-letter state + zip tail without comma split.
      if (!city) {
        const m = addr.match(/,\s*([A-Za-z .'\-]{3,}),?\s*[A-Z]{2}\s+\d{5}/);
        if (m) city = m[1].trim();
      }
      const zipMatch = addr.match(/(\d{5})(?:-\d{4})?\s*$/);
      if (zipMatch) zip = zipMatch[1];
    }
    const geo = rec.geo_point as { coordinates?: [number, number] } | undefined;
    return {
      state: "CA",
      key: `CA-${lic}`,
      kind: (clean(rec.status) ?? "").toUpperCase() === "ACTIVE" ? "active" : "pending",
      status: clean(rec.status),
      licenseType: clean(rec.license_type),
      typeName: caTypeName(clean(rec.license_type)),
      tradeName: clean(rec.business_name),
      ownerName: clean(rec.primary_owner),
      phone: null,
      address: addr,
      city,
      zip,
      county: "Napa",
      filedAt: safeDate(rec.orig_iss_date),
      issuedAt: safeDate(rec.orig_iss_date),
      expiresAt: safeDate(rec.expir_date),
      lat: geo?.coordinates?.[1] ?? null,
      lng: geo?.coordinates?.[0] ?? null,
      sourceUrl: "https://data.napacounty.gov/d/8rw6-hhca",
    };
  },
};

// California ABC license type codes in plain English.
function caTypeName(code: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    "20": "Off-Sale Beer & Wine (Package)",
    "21": "Off-Sale General (Liquor Store)",
    "41": "On-Sale Beer & Wine (Eating Place)",
    "42": "On-Sale Beer & Wine (Public Premises)",
    "47": "On-Sale General (Full Bar, Restaurant)",
    "48": "On-Sale General (Full Bar, Bar/Nightclub)",
    "49": "On-Sale General (Seasonal)",
    "51": "Club License",
    "52": "Veterans Club",
    "53": "Club (Airline)",
    "61": "On-Sale Beer (Public Premises)",
    "62": "On-Sale Beer (Eating Place)",
    "63": "On-Sale Beer (Bowling)",
    "64": "On-Sale Beer (Seasonal)",
    "65": "On-Sale Beer (Bona-Fide)",
    "66": "On-Sale Beer (Caterer)",
    "68": "Portable Bar",
    "70": "On-Sale Beer & Wine (Caterer)",
    "71": "Special Events",
    "72": "Special Events",
    "74": "Caterer's Permit",
    "75": "On-Sale General (Bona-Fide Eating Place)",
    "78": "On-Sale General (Club)",
    "86": "On-Sale General (Caterer)",
    "87": "On-Sale General (Public Premises)",
    "88": "On-Sale General (Theater/Live)",
  };
  return map[code] ?? `ABC Type ${code}`;
}

// ---------- MARYLAND (Montgomery County) ----------
const MD_SPEC: StateSpec = {
  state: "MD",
  label: "Maryland · Montgomery County ABS licensees",
  socrata: { host: "data.montgomerycountymd.gov", dataset: "c6rw-fazn", limit: 3000 },
  map: (rec) => {
    const id = clean(rec.licensee_number) ?? clean(rec.license_number);
    if (!id) return null;
    const licType = clean(rec.licensetype);
    const licClass = clean(rec.licenseclass);
    return {
      state: "MD",
      key: `MD-${id}`,
      kind: "active",
      status: "Licensed",
      licenseType: licClass,
      typeName: licType ?? licClass,
      tradeName: clean(rec.account_name),
      ownerName: clean(rec.licensee_name),
      phone: null,
      address: clean(rec.street),
      city: clean(rec.city),
      zip: cleanZip(rec.zip),
      county: "Montgomery",
      filedAt: null,
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.montgomerycountymd.gov/d/c6rw-fazn",
    };
  },
};

// ---------- OREGON ----------
// OLCC publishes both the full licensed register AND, more importantly,
// licence applications received — including "In Review" and
// "Payment Pending" statuses, which are the earliest possible signal
// that a venue is being built.
const OR_APPS_SPEC: StateSpec = {
  state: "OR",
  label: "Oregon · licence applications received",
  socrata: { host: "data.oregon.gov", dataset: "qad4-bnxp", limit: 5000 },
  map: (rec) => {
    const trade = clean(rec.trade_name);
    const addr = clean(rec.address);
    const licType = clean(rec.license_type);
    const status = clean(rec.application_status);
    const received = safeDate(rec.date_received);
    // Build a stable key: no licence number exists in the applications feed,
    // so use the trade name + address + received date.
    const key = `OR-A-${(trade ?? "unknown").slice(0, 24)}-${(addr ?? "").slice(0, 24)}-${received?.toISOString().slice(0, 10) ?? "na"}`;
    if (!trade && !addr) return null;
    let city: string | null = null;
    let zip: string | null = null;
    if (addr) {
      const m = addr.match(/,\s*([A-Za-z .'\-]{3,})\s+OR\s+(\d{5})/);
      if (m) {
        city = m[1].trim();
        zip = m[2];
      }
    }
    return {
      state: "OR",
      key,
      kind: "pending",
      status: status ?? "In Review",
      licenseType: licType,
      typeName: licType,
      tradeName: trade,
      ownerName: null,
      phone: null,
      address: addr,
      city,
      zip,
      county: null,
      filedAt: received,
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.oregon.gov/d/qad4-bnxp",
    };
  },
};

const OR_LICENSES_SPEC: StateSpec = {
  state: "OR",
  label: "Oregon · licensed venues",
  socrata: { host: "data.oregon.gov", dataset: "srxe-qkm2", limit: 6000 },
  map: (rec) => {
    const licNo = clean(rec.license_number);
    if (!licNo) return null;
    let city: string | null = clean(rec.city);
    let zip: string | null = null;
    const addr = clean(rec.physical_address);
    if (addr) {
      const m = addr.match(/(\d{5})(?:-\d{4})?\s*$/);
      if (m) zip = m[1];
    }
    return {
      state: "OR",
      key: `OR-L-${licNo}`,
      kind: "active",
      status: clean(rec.license_expired) === "Yes" ? "Expired" : "Licensed",
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: clean(rec.trade_name),
      ownerName: clean(rec.licensee_name),
      phone: null,
      address: addr,
      city,
      zip,
      county: clean(rec.county),
      filedAt: safeDate(rec.effective_date),
      issuedAt: safeDate(rec.effective_date),
      expiresAt: safeDate(rec.license_expires),
      lat: null,
      lng: null,
      sourceUrl: "https://data.oregon.gov/d/srxe-qkm2",
    };
  },
};

// Master list — add new states here. To set up a new state you only need
// to (a) find a public data URL, (b) write a `map()` function, (c) add
// the entry below. The aggregator + email + webpage loop requires
// no other code changes.
export const ALL_STATE_SOURCES: StateSpec[] = [
  TX_PENDING_SPEC,
  TX_ACTIVE_SPEC,
  NY_PENDING_SPEC,
  NY_ACTIVE_SPEC,
  CA_SPEC,
  NAPA_SPEC,
  MO_SPEC,
  CO_SPEC,
  CT_SPEC,
  WA_SPEC,
  IL_SPEC,
  MD_SPEC,
  OR_APPS_SPEC,
  OR_LICENSES_SPEC,
];

export type StateSourceId = `${string}-${"pending" | "active" | "full"}`;

type SocrataParams = { where?: string; limit?: number };

async function fetchSocrataRows(host: string, dataset: string, params: SocrataParams = {}): Promise<Record<string, unknown>[]> {
  const url = new URL(`https://${host}/resource/${dataset}.json`);
  if (params.where) url.searchParams.set("$where", params.where);
  url.searchParams.set("$limit", String(params.limit ?? 5000));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "pourwatch/1.0 (+public-records-monitor)",
  };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token) headers["X-App-Token"] = token;

  const res = await fetch(url.toString(), { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Socrata ${host}/${dataset} responded ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>[];
}

async function fetchGenericCsv(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV ${url} responded ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

function parseCsv(csv: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (field.length || cur.length) {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      }
      if (c === "\r" && csv[i + 1] === "\n") i++;
    } else field += c;
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = row[j] ?? "";
    out.push(obj);
  }
  return out;
}

const DAY_MS = 86_400_000;
const CHUNK = 400;

export type SourceResult = {
  label: string;
  state: string;
  ok: boolean;
  rowsSeen: number;
  newLicenses: number;
  newEvents: number;
  error?: string;
};

export async function runOneSource(spec: StateSpec): Promise<SourceResult> {
  let records: NormalizedRecord[] = [];
  try {
    if (spec.socrata) {
      const params = spec.socrata.where
        ? { where: spec.socrata.where, limit: spec.socrata.limit ?? 5000 }
        : { limit: spec.socrata.limit ?? 5000 };
      const rows = await fetchSocrataRows(spec.socrata.host, spec.socrata.dataset, params);
      for (const r of rows) {
        const mapped = spec.map(r);
        if (mapped) records.push(mapped);
      }
    } else if (spec.fetchUrl) {
      const rows = await fetchGenericCsv(spec.fetchUrl);
      for (const r of rows) {
        const mapped = spec.map(r);
        if (mapped) records.push(mapped);
      }
    } else {
      return {
        label: spec.label,
        state: spec.state,
        ok: true,
        rowsSeen: 0,
        newLicenses: 0,
        newEvents: 0,
        error: "no source url configured",
      };
    }
  } catch (err) {
    return {
      label: spec.label,
      state: spec.state,
      ok: false,
      rowsSeen: 0,
      newLicenses: 0,
      newEvents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!records.length) {
    return {
      label: spec.label,
      state: spec.state,
      ok: true,
      rowsSeen: 0,
      newLicenses: 0,
      newEvents: 0,
    };
  }

  // Persist to database — fully batched so thousands of rows stay fast.
  let newLicenses = 0;
  let newEvents = 0;

  // Which of these keys do we already know about? (batched lookup)
  const existingSet = new Set<string>();
  for (let i = 0; i < records.length; i += CHUNK) {
    const keys = records.slice(i, i + CHUNK).map((r) => r.key);
    const found = await db
      .select({ key: licenses.licenseKey })
      .from(licenses)
      .where(and(eq(licenses.state, spec.state), inArray(licenses.licenseKey, keys)));
    for (const f of found) existingSet.add(f.key);
  }

  const cutoff = Date.now() - 30 * DAY_MS;
  // Licenses: keep the full register (city pages + stats need the history).
  // Events: only recent ones, because those become subscriber alerts.
  const toInsert: NormalizedRecord[] = [];
  const recentOnly: NormalizedRecord[] = [];
  for (const rec of records) {
    if (existingSet.has(rec.key)) continue;
    toInsert.push(rec);
    const when = (rec.filedAt ?? rec.issuedAt)?.getTime();
    if (when === undefined) {
      // No date at all (e.g. a static register) → treat as current.
      recentOnly.push(rec);
    } else if (when >= cutoff) {
      recentOnly.push(rec);
    }
  }

  const values = toInsert.map((rec) => ({
    state: rec.state,
    licenseKey: rec.key,
    kind: rec.kind,
    status: rec.status,
    licenseType: rec.licenseType,
    typeName: rec.typeName,
    tradeName: rec.tradeName,
    ownerName: rec.ownerName,
    phone: rec.phone,
    address: rec.address,
    city: rec.city,
    zip: rec.zip,
    county: rec.county,
    filedAt: rec.filedAt,
    issuedAt: rec.issuedAt,
    expiresAt: rec.expiresAt,
    lat: rec.lat,
    lng: rec.lng,
    sourceUrl: rec.sourceUrl,
  }));

  for (let i = 0; i < values.length; i += CHUNK) {
    await db
      .insert(licenses)
      .values(values.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }
  newLicenses = values.length;

  // Events: one batched insert per chunk — this is what the digest reads.
  const eventRows = recentOnly.map((rec) => {
    const when = rec.filedAt ?? rec.issuedAt ?? new Date();
    return {
      state: rec.state,
      licenseKey: rec.key,
      eventType: rec.kind === "pending" ? "NEW_PENDING" : "NEW_LICENSE",
      tradeName: rec.tradeName,
      ownerName: rec.ownerName,
      city: rec.city,
      county: rec.county,
      typeName: rec.typeName,
      occurredAt: when,
      summary: `${rec.tradeName ?? rec.ownerName ?? "New venue"} · ${rec.city ?? rec.county ?? rec.state}`,
    };
  });
  for (let i = 0; i < eventRows.length; i += CHUNK) {
    await db.insert(events).values(eventRows.slice(i, i + CHUNK));
  }
  newEvents = eventRows.length;

  return {
    label: spec.label,
    state: spec.state,
    ok: true,
    rowsSeen: records.length,
    newLicenses,
    newEvents,
  };
}

export async function runAllSources(): Promise<SourceResult[]> {
  await ensureSchema();
  const results: SourceResult[] = [];
  for (const spec of ALL_STATE_SOURCES) {
    results.push(await runOneSource(spec));
  }
  return results;
}

export async function runByState(state: string): Promise<SourceResult[]> {
  await ensureSchema();
  const results: SourceResult[] = [];
  const wanted = state.trim().toUpperCase();
  for (const spec of ALL_STATE_SOURCES) {
    if (spec.state === wanted) results.push(await runOneSource(spec));
  }
  return results;
}

// All states we currently cover — used by the API + dashboard.
export const COVERED_STATES = Array.from(
  new Set(ALL_STATE_SOURCES.map((s) => s.state))
);
