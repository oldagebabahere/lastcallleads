// Universal aggregator: pulls every configured state & federal liquor-license
// source into the normalized `licenses` + `events` tables, tracks status flips,
// guards against first-run event floods and ID-format mutations, and reports
// health to PourWatch.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, ingestRuns, licenses } from "@/db/schema";
import type { NormalizedRecord } from "./sources";
import {
  clean,
  cleanCounty,
  cleanNumberId,
  cleanZip,
  fetchSocrata,
  fetchWithRetry,
  normalizeCity,
  safeCoord,
  safeDate,
} from "./sources";
import { txTypeName } from "./ingest-tx";
import { extractGeoPoint } from "./ingest-ny";
import { and, eq, inArray } from "drizzle-orm";
import {
  autoHealSource,
  getHealthMap,
  getOverrideDataset,
  priorMedianRows,
  recordRunResult,
  reprobeDue,
} from "@/lib/pourwatch";
import zlib from "zlib";

export type StateSpec = {
  state: string;
  label: string;
  /** fast = runs cleanly inside Vercel Hobby 60s; heavy = bulk CSV/zip/register (runs in GitHub Actions or scheduled heavy window) */
  priority?: "fast" | "heavy";
  /** Rolling weekday-only feeds (e.g. WA Local Authority Letters) can legitimately return 0 rows on quiet days */
  allowEmpty?: boolean;
  /** Bulk dateless registers seed `licenses` on first pull without flooding `events` */
  isStaticRegister?: boolean;
  socrata?: {
    host: string;
    dataset: string;
    where?: string;
    order?: string;
    limit?: number;
  };
  fetchUrl?: string;
  fetchUrlFn?: () => Promise<string>;
  minRows?: number;
  healKeywords?: string;
  map: (rec: Record<string, unknown>) => NormalizedRecord | null;
};

// ---------- TX ----------
const TX_PENDING_SPEC: StateSpec = {
  state: "TX",
  label: "Texas · pending",
  priority: "fast",
  socrata: {
    host: "data.texas.gov",
    dataset: "mxm5-tdpj",
    order: "submission_date DESC",
    limit: 5000,
  },
  healKeywords: "TABC pending application",
  map: (rec) => {
    const appId = cleanNumberId(rec.application_id ?? rec.applicationid);
    if (!appId) return null;
    const code = clean(rec.license_type);
    const owner = clean(rec.owner);
    const trade = clean(rec.trade_name);
    return {
      state: "TX",
      key: `TX-P-${appId}`,
      kind: "pending",
      status: clean(rec.applicationstatus ?? rec.application_status) ?? "Pending",
      licenseType: code,
      typeName: txTypeName(code),
      tradeName: trade ?? owner,
      ownerName: owner,
      phone: null,
      address: clean(rec.address),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip),
      county: cleanCounty(rec.county),
      filedAt: safeDate(rec.submission_date ?? rec.application_submission_date),
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.texas.gov/d/mxm5-tdpj",
    };
  },
};

const TX_RELOCATION_SPEC: StateSpec = {
  state: "TX",
  label: "Texas · change of location",
  priority: "fast",
  allowEmpty: true,
  socrata: {
    host: "data.texas.gov",
    dataset: "wrzc-mwf2",
    order: "application_submission_date DESC",
    limit: 2000,
  },
  healKeywords: "TABC change of location",
  map: (rec) => {
    const appId = cleanNumberId(rec.application_id);
    if (!appId) return null;
    const code = clean(rec.license_type);
    const owner = clean(rec.owner);
    const trade = clean(rec.trade_name);
    return {
      state: "TX",
      key: `TX-R-${appId}`,
      kind: "pending",
      status: clean(rec.application_status) ?? "Relocation Pending",
      licenseType: code,
      typeName: txTypeName(code),
      tradeName: trade ?? owner,
      ownerName: owner,
      phone: null,
      address: clean(rec.proposed_loc_line_1) ?? clean(rec.address),
      mailAddress: clean(rec.address),
      city: normalizeCity(rec.proposed_city ?? rec.city),
      zip: cleanZip(rec.proposed_zip ?? rec.zip),
      county: cleanCounty(rec.proposed_county ?? rec.county),
      filedAt: safeDate(rec.application_submission_date),
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.texas.gov/d/wrzc-mwf2",
    };
  },
};

const TX_ACTIVE_SPEC: StateSpec = {
  state: "TX",
  label: "Texas · active",
  priority: "fast",
  socrata: {
    host: "data.texas.gov",
    dataset: "7hf9-qc9f",
    where: "primary_status='Active'",
    order: "status_change_date DESC",
    limit: 5000,
  },
  healKeywords: "TABC license information",
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
      tradeName: clean(rec.trade_name) ?? clean(rec.owner),
      ownerName: clean(rec.owner),
      phone: clean(rec.phone),
      address: clean(rec.address),
      mailAddress: clean(rec.mail_address),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip),
      county: cleanCounty(rec.county),
      filedAt: safeDate(rec.original_issue_date),
      issuedAt: safeDate(rec.current_issued_date) ?? safeDate(rec.status_change_date),
      expiresAt: safeDate(rec.expiration_date, { allowFutureYears: 10 }),
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
  priority: "fast",
  socrata: {
    host: "data.ny.gov",
    dataset: "f8i8-k2gm",
    order: "received_date DESC",
    limit: 5000,
  },
  healKeywords: "liquor authority pending",
  map: (rec) => {
    const appId = clean(rec.application_id);
    if (!appId) return null;
    const { lat, lng } = extractGeoPoint(rec);
    const legal = clean(rec.legalname);
    return {
      state: "NY",
      key: `NY-P-${appId}`,
      kind: "pending",
      status: clean(rec.status) ?? "Pending",
      licenseType: clean(rec.class) ?? clean(rec.type),
      typeName: clean(rec.description),
      tradeName: clean(rec.dba) ?? legal,
      ownerName: legal,
      phone: null,
      address: clean(rec.actual_address_of_premises),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip_code),
      county: cleanCounty(rec.premises_county),
      filedAt: safeDate(rec.received_date),
      issuedAt: null,
      expiresAt: null,
      lat,
      lng,
      sourceUrl: "https://data.ny.gov/d/f8i8-k2gm",
    };
  },
};

const NY_ACTIVE_SPEC: StateSpec = {
  state: "NY",
  label: "New York · active",
  priority: "fast",
  socrata: {
    host: "data.ny.gov",
    dataset: "9s3h-dpkz",
    order: "originalissuedate DESC",
    limit: 5000,
  },
  healKeywords: "liquor authority active",
  map: (rec) => {
    const permitId = clean(rec.licensepermitid);
    if (!permitId) return null;
    const { lat, lng } = extractGeoPoint(rec);
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
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zipcode),
      county: cleanCounty(rec.premisescounty),
      filedAt: safeDate(rec.originalissuedate),
      issuedAt: safeDate(rec.lastissuedate) ?? safeDate(rec.effectivedate),
      expiresAt: safeDate(rec.expirationdate, { allowFutureYears: 10 }),
      lat,
      lng,
      sourceUrl: "https://data.ny.gov/d/9s3h-dpkz",
    };
  },
};

// ---------- CA ----------
// California ABC publishes a daily full CSV export inside a ZIP (~7.4MB zip,
// ~28MB uncompressed, refreshed each morning). Streaming line-by-line parse
// keeps memory low and composite keys prevent multi-type collisions.
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

const CA_SPEC: StateSpec = {
  state: "CA",
  label: "California · ABC daily filings",
  priority: "fast",
  isStaticRegister: false,
  fetchUrl:
    process.env.CA_EXPORT_URL ||
    "https://www.abc.ca.gov/wp-content/uploads/DailyExport-CSV.zip",
  minRows: 200,
  map: (rec) => {
    const licenseNo = clean(rec["file number"]);
    if (!licenseNo) return null;
    const licOrApp = (clean(rec["lic or app"]) ?? "").toUpperCase();
    const status = (clean(rec["type status"]) ?? "").toUpperCase();
    const isPending = licOrApp.startsWith("APP") || status.includes("PEND");
    const isActive = status === "ACTIVE" || status === "LIC";
    if (!isPending && !isActive) return null;

    const licType = clean(rec["license type"]) ?? "00";
    // Skip 1-day special event permits (71/72) — keep real venues & stores.
    if (licType === "71" || licType === "72") return null;

    const issued = safeDate(rec["type orig iss date"]);
    // Keep ALL pending applications + active licenses issued in the last 180 days
    // so CA runs in ~3-4s cleanly inside Vercel Hobby without 90k ancient rows.
    const cutoff180 = Date.now() - 180 * 86_400_000;
    if (!isPending && (!issued || issued.getTime() < cutoff180)) {
      return null;
    }

    return {
      state: "CA",
      key: `CA-${licenseNo}-${licType}`,
      kind: isPending ? "pending" : "active",
      status: isPending ? "Pending" : "Active",
      licenseType: licType,
      typeName: caTypeName(licType),
      tradeName: clean(rec["dba name"]) ?? clean(rec["primary name"]),
      ownerName: clean(rec["primary name"]),
      phone: null,
      address: clean(rec["prem addr 1"]),
      mailAddress: clean(rec["mail addr 1"]),
      city: normalizeCity(rec["prem city"]),
      zip: cleanZip(rec["prem zip"]),
      county: cleanCounty(rec["prem county"]),
      filedAt: issued,
      issuedAt: isPending ? null : issued,
      expiresAt: safeDate(rec["expir date"], { allowFutureYears: 10 }),
      lat: null,
      lng: null,
      sourceUrl: "https://www.abc.ca.gov/licensing/licensing-reports/",
    };
  },
};

// ---------- MISSOURI ----------
const MO_SPEC: StateSpec = {
  state: "MO",
  label: "Missouri · new liquor licenses",
  priority: "fast",
  socrata: {
    host: "data.mo.gov",
    dataset: "dymb-xy5c",
    order: ":updated_at DESC",
    limit: 3000,
  },
  healKeywords: "new liquor licenses missouri",
  map: (rec) => {
    const lic = clean(rec.license_number);
    if (!lic) return null;
    return {
      state: "MO",
      key: `MO-${lic}`,
      kind: "active",
      status: clean(rec.current_status) ?? "Active",
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: clean(rec.dbaname) ?? clean(rec.licensee),
      ownerName: clean(rec.licensee),
      phone: null,
      address:
        [clean(rec.street_number), clean(rec.street)].filter(Boolean).join(" ") ||
        null,
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip_code),
      county: cleanCounty(rec.county),
      filedAt: safeDate(rec.original_date),
      issuedAt: safeDate(rec.original_date),
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.mo.gov/d/dymb-xy5c",
    };
  },
};

const MO_ACTIVE_SPEC: StateSpec = {
  state: "MO",
  label: "Missouri · active w/ phones",
  priority: "fast",
  isStaticRegister: true,
  socrata: {
    host: "data.mo.gov",
    dataset: "yyhn-562y",
    order: ":updated_at DESC",
    limit: 4000,
  },
  healKeywords: "active alcohol license missouri",
  map: (rec) => {
    const lic = clean(rec.primary_license);
    if (!lic) return null;
    return {
      state: "MO",
      key: `MO-A-${lic}`,
      kind: "active",
      status: "Active",
      licenseType: clean(rec.primary_type),
      typeName: clean(rec.primary_type),
      tradeName: clean(rec.dbaname) ?? clean(rec.licensee),
      ownerName: clean(rec.licensee),
      contactName: clean(rec.name),
      phone: clean(rec.phone_number ?? rec.phone),
      address:
        [clean(rec.street_number), clean(rec.street)].filter(Boolean).join(" ") ||
        null,
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zipcode),
      county: cleanCounty(rec.county),
      filedAt: null,
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.mo.gov/d/yyhn-562y",
    };
  },
};

const MO_CLOSED_SPEC: StateSpec = {
  state: "MO",
  label: "Missouri · out of business",
  priority: "fast",
  allowEmpty: true,
  socrata: {
    host: "data.mo.gov",
    dataset: "nytw-fmz3",
    order: ":updated_at DESC",
    limit: 1500,
  },
  healKeywords: "alcohol licenses out of business missouri",
  map: (rec) => {
    const lic = clean(rec.license_number);
    if (!lic) return null;
    const licType = clean(rec.license_type) ?? "";
    // Skip non-alcohol administrative permissions (e.g. "Permission - Employ Minors")
    if (/employ minors|picnic|caterer temporary/i.test(licType)) return null;
    const when = safeDate(rec.status_effective_date);
    return {
      state: "MO",
      key: `MO-X-${lic}`,
      kind: "active",
      status: clean(rec.license_current_status) ?? "Out of Business",
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: clean(rec.dba_name) ?? clean(rec.licensee_name),
      ownerName: clean(rec.licensee_name),
      phone: null,
      address:
        [clean(rec.street_number), clean(rec.street_name)]
          .filter(Boolean)
          .join(" ") || null,
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip_code),
      county: cleanCounty(rec.county),
      filedAt: when,
      issuedAt: when,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.mo.gov/d/nytw-fmz3",
    };
  },
};

// ---------- COLORADO ----------
const CO_SPEC: StateSpec = {
  state: "CO",
  label: "Colorado · recently approved",
  priority: "fast",
  socrata: {
    host: "data.colorado.gov",
    dataset: "htyp-tqzh",
    order: ":updated_at DESC",
    limit: 3000,
  },
  healKeywords: "recently approved liquor licenses colorado",
  map: (rec) => {
    const lic = clean(rec.license_number);
    if (!lic) return null;
    const dateInLic = /^\d{4}-\d{2}-\d{2}/.test(lic) ? safeDate(lic) : null;
    const when = dateInLic ?? safeDate(rec.issue_date);
    const owner =
      clean(rec.licensee_name) ?? clean(rec.doing_business_as) ?? "unknown";
    const key =
      dateInLic !== null
        ? `CO-${lic}-${owner.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16)}`
        : `CO-${lic}`;
    return {
      state: "CO",
      key,
      kind: "active",
      status: "Approved",
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: clean(rec.doing_business_as) ?? clean(rec.licensee_name),
      ownerName: clean(rec.licensee_name),
      phone: null,
      address: clean(rec.street_address),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip),
      county: null,
      filedAt: when,
      issuedAt: when,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.colorado.gov/d/htyp-tqzh",
    };
  },
};

const CO_CLOSED_SPEC: StateSpec = {
  state: "CO",
  label: "Colorado · closed + surrendered",
  priority: "fast",
  socrata: {
    host: "data.colorado.gov",
    dataset: "pwjb-9dd5",
    order: "expirationdate DESC",
    limit: 3000,
  },
  healKeywords: "expired surrendered liquor licenses colorado",
  map: (rec) => {
    const lic = clean(rec.licensenumber);
    if (!lic) return null;
    const licType = clean(rec.licensetype) ?? "";
    // Exclude tobacco/vape/smoke shops — keep strictly alcohol venues.
    if (/tobacco|vape|smoke|nicotine|cigarette/i.test(licType)) return null;
    const status = clean(rec.licensestatus) ?? "Expired";
    const exp = safeDate(rec.expirationdate);
    return {
      state: "CO",
      key: `CO-X-${lic}`,
      kind: "active",
      status,
      licenseType: clean(rec.licensetype),
      typeName: clean(rec.licensetype),
      tradeName: clean(rec.doingbusinessas) ?? clean(rec.companyname),
      ownerName: clean(rec.companyname),
      phone: null,
      address: clean(rec.streetaddress),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip),
      county: null,
      filedAt: exp,
      issuedAt: exp,
      expiresAt: safeDate(rec.expirationdate, { allowFutureYears: 10 }),
      lat: null,
      lng: null,
      sourceUrl: "https://data.colorado.gov/d/pwjb-9dd5",
    };
  },
};

// ---------- CONNECTICUT ----------
// Connecticut's live unified Liquor Permits dataset (includes named permittees!).
const CT_PERMITS_SPEC: StateSpec = {
  state: "CT",
  label: "Connecticut · all liquor permits",
  priority: "fast",
  socrata: {
    host: "data.ct.gov",
    dataset: "gwv2-eswx",
    where: "status='ACTIVE' OR status='PENDING'",
    order: ":updated_at DESC",
    limit: 4000,
  },
  healKeywords: "liquor permits connecticut",
  map: (rec) => {
    const cred = clean(rec.credential);
    if (!cred) return null;
    const status = (clean(rec.status) ?? "ACTIVE").toUpperCase();
    const isPending = status.includes("PEND");
    const prefix = cred.split(".")[0] ?? "";
    // Skip 1-day nonprofit/picnic temporary permits (LTN/LTP)
    if (prefix === "LTN" || prefix === "LTP") return null;
    const CT_PREFIX: Record<string, string> = {
      LIR: "Restaurant Liquor",
      LCA: "Cafe Liquor",
      LIP: "Package Store Liquor",
      LGB: "Grocery Store Beer",
      LRW: "Restaurant Wine & Beer",
      LTR: "Tavern Liquor",
      LCL: "Club Liquor",
      LHO: "Hotel Liquor",
      LIW: "Wholesaler Liquor",
      LMB: "Manufacturer Brewpub",
    };
    const permittee =
      clean(rec.permittee_name) ??
      ([clean(rec.permittee_first_name), clean(rec.permittee_last_name)]
        .filter(Boolean)
        .join(" ") ||
        null);
    return {
      state: "CT",
      key: `CT-P-${cred}`,
      kind: isPending ? "pending" : "active",
      status: isPending ? "Pending" : "Active",
      licenseType: prefix || null,
      typeName: CT_PREFIX[prefix] ?? (prefix ? `CT Permit ${prefix}` : "Liquor Permit"),
      tradeName: clean(rec.dba) ?? clean(rec.backer),
      ownerName: clean(rec.backer),
      contactName: permittee ? normalizeCity(permittee) : null,
      phone: null,
      address: clean(rec.permit_address) ?? clean(rec.backer_address),
      mailAddress: clean(rec.backer_address),
      city: normalizeCity(rec.permit_city ?? rec.backer_city),
      zip: cleanZip(rec.permit_zip ?? rec.backer_zip),
      county: null,
      filedAt: safeDate(rec.effective_date),
      issuedAt: safeDate(rec.effective_date),
      expiresAt: safeDate(rec.expire_date, { allowFutureYears: 10 }),
      lat: null,
      lng: null,
      sourceUrl: "https://data.ct.gov/d/gwv2-eswx",
    };
  },
};

// ---------- WASHINGTON ----------
const WA_SPEC: StateSpec = {
  state: "WA",
  label: "Washington · LCB renewals",
  priority: "fast",
  isStaticRegister: true,
  socrata: {
    host: "data.wa.gov",
    dataset: "9dee-kzm5",
    order: "renewaldate DESC",
    limit: 5000,
  },
  healKeywords: "liquor renewal washington",
  map: (rec) => {
    const lic = clean(rec.license);
    if (!lic) return null;
    const { lat, lng } = extractGeoPoint(rec);
    return {
      state: "WA",
      key: `WA-${lic}`,
      kind: "active",
      status: "Licensed",
      licenseType: clean(rec.l_a_type),
      typeName: clean(rec.privdesc01) ?? clean(rec.l_a_type),
      tradeName: clean(rec.tradename),
      ownerName: clean(rec.tradename),
      contactName: clean(rec.designatedsignee) ? normalizeCity(rec.designatedsignee) : null,
      phone: clean(rec.dayphone),
      address: clean(rec.streetaddress),
      mailAddress: clean(rec.mailaddress),
      city: normalizeCity(rec.city ?? rec.cityname),
      zip: cleanZip(rec.zipcode),
      county: cleanCounty(rec.countyname ?? rec.countycode),
      filedAt: safeDate(rec.renewaldate),
      issuedAt: safeDate(rec.renewaldate),
      expiresAt: null,
      lat,
      lng,
      sourceUrl: "https://data.wa.gov/d/9dee-kzm5",
    };
  },
};

// Rolling weekday feed: WA LCB Local Authority Letters (can legitimately be empty on Sundays).
const WA_APPS_SPEC: StateSpec = {
  state: "WA",
  label: "Washington · new applications",
  priority: "fast",
  allowEmpty: true,
  socrata: {
    host: "data.wa.gov",
    dataset: "vgcw-qfjm",
    order: "applicationdate DESC",
    limit: 5000,
  },
  healKeywords: "liquor cannabis board local authority",
  map: (rec) => {
    const lic = clean(rec.license);
    if (!lic) return null;
    const { lat, lng } = extractGeoPoint(rec);
    return {
      state: "WA",
      key: `WA-A-${lic}`,
      kind: "pending",
      status: "Application filed",
      licenseType: clean(rec.l_a_type),
      typeName: clean(rec.privdesc01) ?? clean(rec.l_a_type),
      tradeName: clean(rec.tradename) ?? clean(rec.licenseename),
      ownerName: clean(rec.licenseename),
      phone: clean(rec.dayphone),
      address: clean(rec.streetaddress),
      city: normalizeCity(rec.city ?? rec.cityname),
      zip: cleanZip(rec.zipcode),
      county: cleanCounty(rec.countyname),
      filedAt: safeDate(rec.applicationdate),
      issuedAt: null,
      expiresAt: null,
      lat,
      lng,
      sourceUrl: "https://data.wa.gov/d/vgcw-qfjm",
    };
  },
};

// ---------- ILLINOIS (Chicago Metro — New Openings Only) ----------
const IL_SPEC: StateSpec = {
  state: "IL",
  label: "Illinois · Chicago new openings",
  priority: "fast",
  socrata: {
    host: "data.cityofchicago.org",
    dataset: "nrmj-3kcf",
    where: "application_type='ISSUE'",
    order: "date_issued DESC",
    limit: 3000,
  },
  healKeywords: "liquor licenses chicago",
  map: (rec) => {
    const id = clean(rec.license_number) ?? clean(rec.id);
    if (!id) return null;
    const statusMap: Record<string, string> = {
      AAI: "Active",
      AAC: "Canceled",
      REV: "Revoked",
      REA: "Revoked",
      INQ: "Pending",
    };
    const rawStatus = clean(rec.license_status) ?? "AAI";
    const status = statusMap[rawStatus] ?? rawStatus;
    const description =
      clean(rec.license_description) ?? clean(rec.business_activity);
    const hood = normalizeCity(rec.neighborhood ?? rec.community_area_name);
    return {
      state: "IL",
      key: `IL-${id}`,
      kind: rawStatus === "INQ" ? "pending" : "active",
      status,
      licenseType: clean(rec.license_code),
      typeName: description,
      tradeName: clean(rec.doing_business_as_name) ?? clean(rec.legal_name),
      ownerName: clean(rec.legal_name),
      phone: null,
      address: clean(rec.address),
      neighborhood: hood,
      city: normalizeCity(rec.city) ?? "Chicago",
      zip: cleanZip(rec.zip_code),
      county: hood ?? "Cook",
      filedAt: safeDate(rec.license_start_date) ?? safeDate(rec.date_issued),
      issuedAt: safeDate(rec.date_issued) ?? safeDate(rec.license_start_date),
      expiresAt: safeDate(rec.expiration_date ?? rec.license_term_expiration_date, {
        allowFutureYears: 10,
      }),
      lat: safeCoord(rec.latitude),
      lng: safeCoord(rec.longitude),
      sourceUrl: "https://data.cityofchicago.org/d/nrmj-3kcf",
    };
  },
};

// ---------- OREGON ----------
const OR_APPS_SPEC: StateSpec = {
  state: "OR",
  label: "Oregon · applications received",
  priority: "fast",
  socrata: {
    host: "data.oregon.gov",
    dataset: "qad4-bnxp",
    order: "date_received DESC",
    limit: 4000,
  },
  healKeywords: "OLCC liquor applications",
  map: (rec) => {
    const trade = clean(rec.trade_name);
    const addr = clean(rec.address);
    if (!trade && !addr) return null;
    const licType = clean(rec.license_type);
    const status = clean(rec.application_status);
    const received = safeDate(rec.date_received);
    const key = `OR-A-${(trade ?? "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20)}-${(addr ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20)}-${received?.toISOString().slice(0, 10) ?? "na"}`;
    let city: string | null = null;
    let zip: string | null = null;
    if (addr) {
      const m = addr.match(/,?\s*([A-Za-z .'\-]{3,})\s+OR\s+(\d{5})/);
      if (m) {
        city = normalizeCity(m[1]);
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
  priority: "fast",
  socrata: {
    host: "data.oregon.gov",
    dataset: "srxe-qkm2",
    order: "effective_date DESC",
    limit: 5000,
  },
  healKeywords: "OLCC liquor business licenses",
  map: (rec) => {
    const licNo = clean(rec.license_number);
    if (!licNo) return null;
    const addr = clean(rec.physical_address);
    let zip: string | null = null;
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
      tradeName: clean(rec.trade_name) ?? clean(rec.licensee_name),
      ownerName: clean(rec.licensee_name),
      phone: null,
      address: addr,
      city: normalizeCity(rec.city),
      zip,
      county: cleanCounty(rec.county),
      filedAt: safeDate(rec.effective_date),
      issuedAt: safeDate(rec.effective_date),
      expiresAt: safeDate(rec.license_expires, { allowFutureYears: 10 }),
      lat: null,
      lng: null,
      sourceUrl: "https://data.oregon.gov/d/srxe-qkm2",
    };
  },
};

const OR_NONRENEW_SPEC: StateSpec = {
  state: "OR",
  label: "Oregon · non-renewals",
  priority: "fast",
  allowEmpty: true,
  socrata: {
    host: "data.oregon.gov",
    dataset: "mhc6-qsxj",
    order: ":updated_at DESC",
    limit: 2500,
  },
  healKeywords: "OLCC non-renewals",
  map: (rec) => {
    const trade = clean(rec.trade_name);
    const owner = clean(rec.licensee_name);
    const addr = clean(rec.premises_address);
    if (!trade && !owner) return null;
    const exp = safeDate(rec.expiration_date);
    const key = `OR-X-${(trade ?? owner ?? "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24)}-${exp?.toISOString().slice(0, 10) ?? "na"}`;
    let zip: string | null = null;
    if (addr) {
      const m = addr.match(/OR\s+(\d{5})/);
      if (m) zip = m[1];
    }
    const city = normalizeCity(rec.local_governing_body);
    return {
      state: "OR",
      key,
      kind: "active",
      status: "Expired / Non-Renewed",
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: trade ?? owner,
      ownerName: owner,
      phone: null,
      address: addr,
      city,
      zip,
      county: cleanCounty(rec.local_governing_body),
      filedAt: exp,
      issuedAt: exp,
      expiresAt: safeDate(rec.expiration_date, { allowFutureYears: 5 }),
      lat: null,
      lng: null,
      sourceUrl: "https://data.oregon.gov/d/mhc6-qsxj",
    };
  },
};

// Master list of all 16 live-verified retail beverage feeds across our 9 honest markets.
// Zero fake "all 50 states" TTB filler, zero WAF-blocked FL, zero 1-county MD.
export const ALL_STATE_SOURCES: StateSpec[] = [
  TX_PENDING_SPEC,
  TX_RELOCATION_SPEC,
  TX_ACTIVE_SPEC,
  NY_PENDING_SPEC,
  NY_ACTIVE_SPEC,
  CA_SPEC,
  IL_SPEC,
  WA_APPS_SPEC,
  WA_SPEC,
  OR_APPS_SPEC,
  OR_LICENSES_SPEC,
  OR_NONRENEW_SPEC,
  CO_SPEC,
  CO_CLOSED_SPEC,
  CT_PERMITS_SPEC,
  MO_SPEC,
  MO_ACTIVE_SPEC,
  MO_CLOSED_SPEC,
];

export const HEAVY_SOURCE_LABELS = new Set(
  ALL_STATE_SOURCES.filter((s) => s.priority === "heavy").map((s) => s.label)
);

export const COVERED_STATES = Array.from(
  new Set(ALL_STATE_SOURCES.filter((s) => s.state !== "US").map((s) => s.state))
);

// ---------- Low-memory CSV + ZIP fetcher ----------

async function fetchGenericCsvMapped(
  url: string,
  mapFn: (rec: Record<string, unknown>) => NormalizedRecord | null
): Promise<NormalizedRecord[]> {
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": "LastCallLeads-PourWatch/2.0 (+public-records-monitor)",
        Accept: "text/csv,application/zip,*/*",
      },
    },
    { timeoutMs: 35_000, retries: 1 }
  );
  if (!res.ok) throw new Error(`CSV ${url} responded ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let text =
    buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b
      ? unzipFirstCsv(buf)
      : buf.toString("utf8");

  // Strip agency banner line (no commas) before the actual CSV header.
  const nl = text.indexOf("\n");
  if (nl > 0 && !text.slice(0, nl).includes(",") && text.slice(nl + 1).includes(",")) {
    text = text.slice(nl + 1);
  }
  return parseCsvStreaming(text, mapFn);
}

function unzipFirstCsv(buf: Buffer): string {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const entries = buf.readUInt16LE(i + 10);
    let p = buf.readUInt32LE(i + 16);
    for (let n = 0; n < entries && p + 46 <= buf.length; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commLen = buf.readUInt16LE(p + 32);
      const localOff = buf.readUInt32LE(p + 42);
      const name = buf.subarray(p + 46, p + 46 + nameLen).toString("latin1");
      if (name.toLowerCase().endsWith(".csv")) {
        const lhName = buf.readUInt16LE(localOff + 26);
        const lhExtra = buf.readUInt16LE(localOff + 28);
        const start = localOff + 30 + lhName + lhExtra;
        const data = buf.subarray(start, start + compSize);
        if (method === 0) return data.toString("utf8");
        if (method === 8) return zlib.inflateRawSync(data).toString("utf8");
      }
      p += 46 + nameLen + extraLen + commLen;
    }
    break;
  }
  throw new Error("no csv found inside zip");
}

// Single-pass CSV parser that maps rows on the fly without retaining a 2D array
// of 130,000 raw string rows in memory.
function parseCsvStreaming(
  csv: string,
  mapFn: (rec: Record<string, unknown>) => NormalizedRecord | null
): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  let header: string[] | null = null;
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  const flushRow = () => {
    if (!field.length && !cur.length) return;
    cur.push(field);
    field = "";
    if (!header) {
      header = cur.map((h) => h.toLowerCase().trim().replace(/^\uFEFF/, ""));
    } else {
      const obj: Record<string, unknown> = {};
      for (let j = 0; j < header.length; j++) {
        obj[header[j]] = cur[j] ?? "";
      }
      const mapped = mapFn(obj);
      if (mapped) out.push(mapped);
    }
    cur = [];
  };

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      flushRow();
      if (c === "\r" && csv[i + 1] === "\n") i++;
    } else {
      field += c;
    }
  }
  flushRow();
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
  statusChanges?: number;
  allowEmpty?: boolean;
  error?: string;
};

export async function runOneSource(
  spec: StateSpec,
  force = false
): Promise<SourceResult> {
  let rawRecords: NormalizedRecord[] = [];
  try {
    if (spec.socrata) {
      const dataset = (await getOverrideDataset(spec.label)) ?? spec.socrata.dataset;
      const rows = await fetchSocrata(spec.socrata.host, dataset, {
        where: spec.socrata.where,
        order: spec.socrata.order,
        limit: spec.socrata.limit ?? 5000,
      });
      for (const r of rows) {
        const mapped = spec.map(r);
        if (mapped) rawRecords.push(mapped);
      }
    } else if (spec.fetchUrlFn) {
      const url = await spec.fetchUrlFn();
      rawRecords = await fetchGenericCsvMapped(url, spec.map);
    } else if (spec.fetchUrl) {
      rawRecords = await fetchGenericCsvMapped(spec.fetchUrl, spec.map);
    } else {
      return {
        label: spec.label,
        state: spec.state,
        ok: true,
        rowsSeen: 0,
        newLicenses: 0,
        newEvents: 0,
        allowEmpty: spec.allowEmpty,
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
      allowEmpty: spec.allowEmpty,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Deduplicate within batch by (state|key) so multi-row sources never clash.
  const dedup = new Map<string, NormalizedRecord>();
  for (const r of rawRecords) {
    dedup.set(`${r.state}|${r.key}`, r);
  }
  const records = Array.from(dedup.values());

  if (!force && spec.minRows && records.length < spec.minRows) {
    return {
      label: spec.label,
      state: spec.state,
      ok: false,
      rowsSeen: records.length,
      newLicenses: 0,
      newEvents: 0,
      allowEmpty: spec.allowEmpty,
      error: `only ${records.length} rows parsed (floor ${spec.minRows}) — source layout likely changed`,
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
      allowEmpty: spec.allowEmpty,
    };
  }

  // Check if this source has ever completed before (prevents first-run event flood).
  const priorOk = await db
    .select({ id: ingestRuns.id })
    .from(ingestRuns)
    .where(and(eq(ingestRuns.source, spec.label), eq(ingestRuns.ok, true)))
    .limit(1);
  const isFirstRun = priorOk.length === 0;

  // Batched lookup of existing keys + statuses for status-change detection.
  const existingMap = new Map<string, string | null>();
  const stateSet = [...new Set(records.map((r) => r.state))];
  for (let i = 0; i < records.length; i += CHUNK) {
    const keys = records.slice(i, i + CHUNK).map((r) => r.key);
    const found = await db
      .select({
        state: licenses.state,
        key: licenses.licenseKey,
        status: licenses.status,
      })
      .from(licenses)
      .where(and(inArray(licenses.state, stateSet), inArray(licenses.licenseKey, keys)));
    for (const f of found) existingMap.set(`${f.state}|${f.key}`, f.status);
  }

  const now = Date.now();
  const cutoff30 = now - 30 * DAY_MS;
  const cutoff14 = now - 14 * DAY_MS;

  const toInsert: NormalizedRecord[] = [];
  const recentEvents: NormalizedRecord[] = [];
  const statusFlips: { rec: NormalizedRecord; prev: string | null }[] = [];

  for (const rec of records) {
    const id = `${rec.state}|${rec.key}`;
    if (!existingMap.has(id)) {
      toInsert.push(rec);
      // Bulk static registers never emit events on first seed; afterwards only
      // truly new entries (or dated records within 30d) emit events.
      if (spec.isStaticRegister && isFirstRun) continue;
      const when = (rec.filedAt ?? rec.issuedAt)?.getTime();
      if (when === undefined) {
        if (!isFirstRun && !spec.isStaticRegister) {
          recentEvents.push(rec);
        }
      } else {
        const minTs = rec.kind === "pending" && isFirstRun ? cutoff14 : cutoff30;
        if (when >= minTs) {
          recentEvents.push(rec);
        }
      }
    } else if (!isFirstRun) {
      const prevStatus = existingMap.get(id) ?? null;
      const nextStatus = rec.status ?? null;
      if (prevStatus !== nextStatus && nextStatus) {
        statusFlips.push({ rec, prev: prevStatus });
      }
    }
  }

  // FAKE-LEADS GUARD: if a source suddenly reports >50% unseen keys after
  // previously succeeding, its ID format likely mutated — block insert.
  if (!force && !isFirstRun) {
    const median = await priorMedianRows(spec.label);
    if (median >= 1000 && toInsert.length >= 1000 && toInsert.length > median * 0.5) {
      return {
        label: spec.label,
        state: spec.state,
        ok: false,
        rowsSeen: records.length,
        newLicenses: 0,
        newEvents: 0,
        allowEmpty: spec.allowEmpty,
        error: `ID-format change suspected: ${toInsert.length} unseen keys vs ${median} usual rows — insert BLOCKED`,
      };
    }
  }

  // Insert brand-new licenses in chunks.
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
    lastSeenAt: new Date(),
  }));

  for (let i = 0; i < values.length; i += CHUNK) {
    await db
      .insert(licenses)
      .values(values.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }

  // Apply real status updates (capped per run so a noisy feed can't stall DB).
  const appliedFlips = statusFlips.slice(0, 200);
  for (const { rec } of appliedFlips) {
    await db
      .update(licenses)
      .set({
        status: rec.status,
        kind: rec.kind,
        lastSeenAt: new Date(),
      })
      .where(and(eq(licenses.state, rec.state), eq(licenses.licenseKey, rec.key)));
  }

  // Build events (brand new filings + real status changes).
  const eventRows: (typeof events.$inferInsert)[] = recentEvents.map((rec) => {
    const when = rec.filedAt ?? rec.issuedAt ?? new Date();
    const closing = /expired|surrender|out of business|revoked|non-renew/i.test(
      rec.status ?? ""
    );
    const labelName = rec.tradeName ?? rec.ownerName ?? "New venue";
    const where = [rec.city ?? rec.county, rec.state].filter(Boolean).join(", ");
    return {
      state: rec.state,
      licenseKey: rec.key,
      eventType: closing
        ? "STATUS_CHANGE"
        : rec.kind === "pending"
          ? "NEW_PENDING"
          : "NEW_LICENSE",
      tradeName: rec.tradeName,
      ownerName: rec.ownerName,
      city: rec.city,
      county: rec.county,
      typeName: rec.typeName,
      occurredAt: when,
      summary: closing
        ? `CLOSING — ${labelName} (${where}) · account up for grabs`
        : `${rec.kind === "pending" ? "Application filed" : "License issued"} — ${labelName} (${where})${rec.typeName ? ` · ${rec.typeName}` : ""}`,
      payload: JSON.stringify({
        address: rec.address,
        zip: rec.zip,
        phone: rec.phone,
        contactName: rec.contactName ?? null,
        neighborhood: rec.neighborhood ?? null,
        mailAddress: rec.mailAddress ?? null,
        licenseType: rec.licenseType,
        sourceUrl: rec.sourceUrl,
      }),
    };
  });

  for (const { rec, prev } of appliedFlips) {
    const labelName = rec.tradeName ?? rec.ownerName ?? "Venue";
    const where = [rec.city ?? rec.county, rec.state].filter(Boolean).join(", ");
    eventRows.push({
      state: rec.state,
      licenseKey: rec.key,
      eventType: "STATUS_CHANGE",
      tradeName: rec.tradeName,
      ownerName: rec.ownerName,
      city: rec.city,
      county: rec.county,
      typeName: rec.typeName,
      occurredAt: new Date(),
      summary: `Status changed to ${rec.status} — ${labelName} (${where})`,
      payload: JSON.stringify({
        prev,
        next: rec.status,
        address: rec.address,
        zip: rec.zip,
        phone: rec.phone,
        contactName: rec.contactName ?? null,
        neighborhood: rec.neighborhood ?? null,
        mailAddress: rec.mailAddress ?? null,
        licenseType: rec.licenseType,
        sourceUrl: rec.sourceUrl,
      }),
    });
  }

  for (let i = 0; i < eventRows.length; i += CHUNK) {
    await db
      .insert(events)
      .values(eventRows.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }

  return {
    label: spec.label,
    state: spec.state,
    ok: true,
    rowsSeen: records.length,
    newLicenses: values.length,
    newEvents: eventRows.length,
    statusChanges: appliedFlips.length,
    allowEmpty: spec.allowEmpty,
  };
}

// Bounded-concurrency runner (4 at a time instead of 26 simultaneously) with
// optional time budget so serverless crons never hit a hard 504 wall.
export async function runSpecs(
  specs: StateSpec[],
  opts: { force?: boolean; concurrency?: number; budgetMs?: number } = {}
): Promise<{
  results: SourceResult[];
  skipped: string[];
  deferred: string[];
}> {
  const force = opts.force ?? false;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : null;

  await ensureSchema();
  const health = await getHealthMap();
  const queue: StateSpec[] = [];
  const skipped: string[] = [];
  for (const spec of specs) {
    const h = health.get(spec.label);
    if (!force && h?.status === "paused") skipped.push(spec.label);
    else queue.push(spec);
  }

  const results: SourceResult[] = [];
  const deferred: string[] = [];
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (cursor < queue.length) {
        const spec = queue[cursor++];
        if (deadline && Date.now() > deadline) {
          deferred.push(spec.label);
          continue;
        }
        const r = await runOneSource(spec, force);
        results.push(r);
        try {
          await recordRunResult(r);
        } catch {
          // PourWatch logging must never break an ingest sweep
        }
      }
    })
  );

  return { results, skipped, deferred };
}

export async function runAllSources(
  force = false,
  opts: { tier?: "fast" | "heavy" | "all"; budgetMs?: number; concurrency?: number } = {}
) {
  const tier = opts.tier ?? "all";
  const selected =
    tier === "all"
      ? ALL_STATE_SOURCES
      : ALL_STATE_SOURCES.filter((s) => (s.priority ?? "fast") === tier);
  return runSpecs(selected, {
    force,
    budgetMs: opts.budgetMs,
    concurrency: opts.concurrency,
  });
}

export async function runByState(state: string, force = false) {
  const wanted = state.trim().toUpperCase();
  return runSpecs(
    ALL_STATE_SOURCES.filter((spec) => spec.state === wanted),
    { force }
  );
}

/** Re-probe paused sources (and attempt Socrata catalog self-healing when broken). */
export async function reprobeAndHealPaused(reprobeAll = false) {
  await ensureSchema();
  const paused = await reprobeDue(reprobeAll);
  const pausedLabels = new Set(paused.map((p) => p.source));
  const targets = ALL_STATE_SOURCES.filter((s) => pausedLabels.has(s.label));
  const reprobed: {
    label: string;
    ok: boolean;
    rows: number;
    error?: string;
    selfHealed?: string;
  }[] = [];

  for (const spec of targets) {
    let r = await runOneSource(spec, true);
    let selfHealed: string | undefined;
    if (!r.ok && spec.socrata) {
      const heal = await autoHealSource(spec);
      if (heal.healed) {
        selfHealed = heal.detail;
        r = await runOneSource(spec, true);
      }
    }
    await recordRunResult(r);
    reprobed.push({
      label: r.label,
      ok: r.ok,
      rows: r.rowsSeen,
      ...(r.error ? { error: r.error } : {}),
      ...(selfHealed ? { selfHealed } : {}),
    });
  }
  return reprobed;
}
