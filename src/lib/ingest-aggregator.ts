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
import { clean, cleanNumberId, cleanZip, normalizeCity, safeDate } from "./sources";
import { txTypeName } from "./ingest-tx";
import { and, eq, inArray } from "drizzle-orm";
import { getHealthMap, getOverrideDataset, priorMedianRows, recordRunResult } from "@/lib/pourwatch";
import zlib from "zlib";

export type StateSpec = {
  state: string;
  label: string;
  socrata?: { host: string; dataset: string; where?: string; limit?: number };
  fetchUrl?: string;
  // dynamic URL (TTB moves files into monthly folders — resolved at runtime)
  fetchUrlFn?: () => Promise<string>;
  // absolute floor for static registers: below this = layout changed = failure
  minRows?: number;
  // catalog search terms PourWatch uses to find a replacement dataset
  healKeywords?: string;
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
      city: normalizeCity(rec.city),
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
      city: normalizeCity(rec.city),
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
  healKeywords: "liquor authority",
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
      city: normalizeCity(rec.city),
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
  healKeywords: "liquor authority",
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
      city: normalizeCity(rec.city),
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
// California ABC publishes a full daily CSV export (pending + active) as a
// zip, refreshed each business day at 7 a.m. PT. fetchGenericCsv unzips it
// and strips the agency's "Updated ..." banner line automatically. If the
// agency ever moves the file, override with CA_EXPORT_URL.
const CA_SPEC: StateSpec = {
  state: "CA",
  label: "California · full export",
  fetchUrl:
    process.env.CA_EXPORT_URL ||
    "https://www.abc.ca.gov/wp-content/uploads/DailyExport-CSV.zip",
  map: (rec) => {
    const licenseNo = clean(rec["file number"]);
    if (!licenseNo) return null;
    const licOrApp = (clean(rec["lic or app"]) ?? "").toUpperCase();
    const status = clean(rec["type status"]);
    const kind =
      licOrApp.startsWith("APP") || (status ?? "").toUpperCase().includes("PEND")
        ? "pending"
        : "active";
    return {
      state: "CA",
      key: `CA-${licenseNo}`,
      kind,
      status: status ?? "Active",
      licenseType: clean(rec["license type"]),
      typeName: caTypeName(clean(rec["license type"])),
      tradeName: clean(rec["dba name"]) ?? clean(rec["primary name"]),
      ownerName: clean(rec["primary name"]),
      phone: null,
      address: clean(rec["prem addr 1"]),
      city: normalizeCity(rec["prem city"]),
      zip: cleanZip(rec["prem zip"]),
      county: clean(rec["prem county"]),
      filedAt: safeDate(rec["type orig iss date"]),
      issuedAt: safeDate(rec["type orig iss date"]),
      expiresAt: safeDate(rec["expir date"]),
      lat: null,
      lng: null,
      sourceUrl: "https://www.abc.ca.gov/licensing/licensing-reports/",
    };
  },
};

// ---------- MISSOURI ----------
// ---------- FL ----------
// Florida DBPR publishes fresh CSV extracts every morning (public records
// by law). The retail file covers every beer/wine/spirits retail license in
// the state — bars, restaurants, package stores — including PENDING
// applicants (primary status 10 = application in process = gold for leads).
const FL_STATUS: Record<string, string> = {
  "10": "Applicant — in process",
  "11": "Withdrawn",
  "12": "Application expired",
  "13": "Denied",
  "14": "Denied (discipline)",
  "20": "Current",
  "21": "Temporary certificate",
  "22": "Transfer approved",
  "30": "Current — probation",
  "31": "Current — obligations",
  "32": "Current — conditional",
  "41": "Escrow",
  "42": "Suspended",
  "45": "Delinquent",
  "46": "Voluntary relinquish",
  "60": "Null & void",
  "61": "Revoked",
  "80": "Closed",
  "90": "Conversion",
  "99": "Deleted",
};
const FL_SERIES: Record<string, string> = {
  "1": "Quota · beer & wine (package)",
  "2": "Quota · beer & wine (consumption)",
  "3": "Quota · beer, wine & spirits (consumption)",
  "4": "Quota · spirits (package)",
  "5": "Quota · beer (package)",
  "6": "Quota · spirits + beer/wine (package)",
  "7": "Quota · beer (consumption)",
  "11": "Hotel",
  "12": "Restaurant · beer & wine",
  "13": "Restaurant · spirits",
  "24": "Caterer",
  "61": "Special restaurant (wine)",
  "67": "Special restaurant (spirits)",
};
const FL_RETAIL_SPEC: StateSpec = {
  state: "FL",
  label: "Florida · retail alcohol",
  fetchUrl:
    "https://www2.myfloridalicense.com/sto/file_download/extracts/bd4006lic.csv",
  map: (rec) => {
    const lic = clean(rec["license number"]);
    if (!lic) return null;
    const statusCode = clean(rec["primary status"]) ?? "";
    const seriesCode = (clean(rec.series) ?? "").match(/^\d+/)?.[0] ?? "";
    const isPending = statusCode === "10";
    return {
      state: "FL",
      key: `FL-${lic}`,
      kind: isPending ? "pending" : "active",
      status: FL_STATUS[statusCode] ?? (statusCode || "Current"),
      licenseType: clean(rec.series),
      typeName:
        FL_SERIES[seriesCode] ??
        (clean(rec.series) ? `Series ${clean(rec.series)}` : null),
      tradeName: clean(rec.dba) ?? clean(rec["owner name"]),
      ownerName: clean(rec["owner name"]),
      phone: null,
      address: clean(rec["location address 1"]),
      city: normalizeCity(rec["location city"]),
      zip: cleanZip(rec["location zip"]),
      county: null,
      filedAt: safeDate(rec["original licensure date"]),
      issuedAt: safeDate(rec["effective date"]),
      expiresAt: safeDate(rec["expiration date"]),
      lat: null,
      lng: null,
      sourceUrl:
        "https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/public-records/",
    };
  },
};

// ---------- TTB · FEDERAL (all 50 states) ----------
// The federal TTB publishes the national permit registry as plain CSVs,
// refreshed weekly. One schema across all files, and every record carries
// its own state — so this single block covers ALL 50 states: new
// wholesalers, importers, wineries, distilleries opening anywhere in the
// USA become leads the same day we pull them.
const TTB_KNOWN_FOLDER = "2025-04"; // last manually verified folder (fallback)
let ttbFolderCache: string | null = null;
// TTB publishes into dated folders (…/2025-04/…). Instead of hardcoding one
// month forever, try folders from the current month backwards until one
// answers — the site can move files and our ingest self-heals.
async function resolveTtbUrl(file: string): Promise<string> {
  if (ttbFolderCache) {
    return `https://www.ttb.gov/system/files/${ttbFolderCache}/${file}.csv`;
  }
  const folders: string[] = [];
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1; // 1-12
  for (let i = 0; i < 30; i++) {
    folders.push(`${y}-${String(m).padStart(2, "0")}`);
    if (`${y}-${String(m).padStart(2, "0")}` === TTB_KNOWN_FOLDER) break;
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  for (const folder of folders) {
    const url = `https://www.ttb.gov/system/files/${folder}/${file}.csv`;
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "pourwatch/1.0 (+public-records-monitor)" },
        cache: "no-store",
      });
      if (res.ok) {
        ttbFolderCache = folder;
        return url;
      }
    } catch {
      // try the next-older folder
    }
  }
  ttbFolderCache = TTB_KNOWN_FOLDER;
  return `https://www.ttb.gov/system/files/${TTB_KNOWN_FOLDER}/${file}.csv`;
}
function mapTtb(rec: Record<string, unknown>): NormalizedRecord | null {
  const permit = clean(rec.permit_number);
  const state = (clean(rec.state) ?? "").toUpperCase();
  if (!permit || state.length !== 2) return null;
  const isNew = String(rec.new_permit_flag ?? "0").trim() === "1";
  return {
    state,
    key: `TTB-${permit}`,
    kind: "active",
    status: isNew ? "Newly issued" : "Active",
    licenseType: "FED",
    typeName: clean(rec.industry_type) ?? "Federal alcohol permit",
    tradeName: clean(rec.operating_name) ?? clean(rec.owner_name),
    ownerName: clean(rec.owner_name),
    phone: null,
    address: clean(rec.street),
    city: normalizeCity(rec.city),
    zip: cleanZip(rec.prem_zip),
    county: clean(rec.prem_county),
    filedAt: null,
    issuedAt: null,
    expiresAt: null,
    lat: null,
    lng: null,
    sourceUrl: "https://www.ttb.gov/public-information/foia/list-of-permittees",
  };
}
function ttbSpec(label: string, file: string, minRows: number): StateSpec {
  return {
    state: "US", // pseudo-state for run reporting; records carry real states
    label,
    fetchUrlFn: () => resolveTtbUrl(file),
    minRows,
    map: mapTtb,
  };
}
const TTB_NEW_SPEC = ttbSpec(
  "US · TTB permits issued this week",
  "FRL_Basic_Permits_Issued_Since_the_Last_Publication",
  10
);
const TTB_WHOLESALER_SPEC = ttbSpec(
  "US · TTB alcohol wholesalers",
  "FRL_Alcohol_Wholesaler_Permit_List",
  15000
);
const TTB_IMPORTER_SPEC = ttbSpec(
  "US · TTB alcohol importers",
  "FRL_Alcohol_Importer_Permit_List",
  8000
);
const TTB_SPIRITS_SPEC = ttbSpec(
  "US · TTB spirits producers",
  "FRL_Spirits_Producers_and_Bottlers_List",
  2500
);
const TTB_WINE_SPEC = ttbSpec(
  "US · TTB wine producers",
  "FRL_Wine_Producer_and_Blender_Permit_List",
  8000
);

const MO_SPEC: StateSpec = {
  state: "MO",
  label: "Missouri · liquor licenses",
  socrata: { host: "data.mo.gov", dataset: "dymb-xy5c", limit: 3000 },
  healKeywords: "liquor license missouri",
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
      city: normalizeCity(rec.city),
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

// Missouri also publishes the full ACTIVE register — this one has PHONE
// NUMBERS, which makes its rows the richest leads in the whole pipeline.
const MO_ACTIVE_SPEC: StateSpec = {
  state: "MO",
  label: "Missouri · active register",
  socrata: { host: "data.mo.gov", dataset: "yyhn-562y", limit: 8000 },
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
      phone: clean(rec.phone_number),
      address:
        [clean(rec.street_number), clean(rec.street)].filter(Boolean).join(" ") ||
        null,
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zipcode),
      county: clean(rec.county),
      filedAt: null,
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.mo.gov/d/yyhn-562y",
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
    // Colorado's feed is messy: for many rows `license_number` actually
    // contains the approval DATE ("2025-09-16") while `issue_date` holds a
    // corrupt year (e.g. 2262). Recover the real date when we can, and make
    // keys collision-free so two venues approved the same day don't clash.
    const dateInLic = /^\d{4}-\d{2}-\d{2}/.test(lic) ? safeDate(lic) : null;
    const when = dateInLic ?? safeDate(rec.issue_date);
    const licLooksLikeDate = dateInLic !== null;
    const owner = clean(rec.licensee_name) ?? clean(rec.doing_business_as) ?? "unknown";
    const key = licLooksLikeDate
      ? `CO-${lic}-${owner.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16)}`
      : `CO-${lic}`;
    return {
      state: "CO",
      key,
      kind: "active",
      status: "Approved",
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: clean(rec.doing_business_as),
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

// Colorado's complete license register — every active license statewide.
const CO_FULL_SPEC: StateSpec = {
  state: "CO",
  label: "Colorado · full register",
  socrata: { host: "data.colorado.gov", dataset: "ier5-5ms2", limit: 20000 },
  map: (rec) => {
    const lic = clean(rec.license_number);
    if (!lic) return null;
    return {
      state: "CO",
      key: `CO-F-${lic}`,
      kind: "active",
      status: "Active",
      licenseType: clean(rec.license_type),
      typeName: clean(rec.license_type),
      tradeName: clean(rec.doing_business_as),
      ownerName: clean(rec.licensee_name),
      phone: null,
      address: clean(rec.street_address),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip),
      county: null,
      filedAt: null,
      issuedAt: null,
      expiresAt: safeDate(rec.expiration),
      lat: null,
      lng: null,
      sourceUrl: "https://data.colorado.gov/d/ier5-5ms2",
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
      city: normalizeCity(rec.city),
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

// Connecticut also breaks out cafes and taverns — two more venue categories
// for the same pipeline. Separate key prefixes keep them collision-free.
const CT_CAFE_SPEC: StateSpec = {
  state: "CT",
  label: "Connecticut · cafe liquor",
  socrata: { host: "data.ct.gov", dataset: "q22c-zdg8", limit: 3000 },
  map: (rec) => {
    const id = clean(rec.credentialid);
    if (!id) return null;
    return {
      state: "CT",
      key: `CT-C-${id}`,
      kind: "active",
      status: clean(rec.status) ?? "Active",
      licenseType: clean(rec.credentialtype),
      typeName: "Cafe Liquor",
      tradeName: clean(rec.dba),
      ownerName: clean(rec.name),
      phone: null,
      address: clean(rec.address),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip),
      county: null,
      filedAt: safeDate(rec.issuedate),
      issuedAt: safeDate(rec.issuedate),
      expiresAt: safeDate(rec.expirationdate),
      lat: null,
      lng: null,
      sourceUrl: "https://data.ct.gov/d/q22c-zdg8",
    };
  },
};

const CT_TAVERN_SPEC: StateSpec = {
  state: "CT",
  label: "Connecticut · tavern liquor",
  socrata: { host: "data.ct.gov", dataset: "rz33-sg3g", limit: 3000 },
  map: (rec) => {
    const id = clean(rec.credentialid);
    if (!id) return null;
    return {
      state: "CT",
      key: `CT-T-${id}`,
      kind: "active",
      status: clean(rec.status) ?? "Active",
      licenseType: clean(rec.credentialtype),
      typeName: "Tavern Liquor",
      tradeName: clean(rec.dba) ?? clean(rec.businessname),
      ownerName: clean(rec.name),
      phone: null,
      address: clean(rec.address),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zip),
      county: null,
      filedAt: safeDate(rec.issuedate),
      issuedAt: safeDate(rec.issuedate),
      expiresAt: safeDate(rec.expirationdate),
      lat: null,
      lng: null,
      sourceUrl: "https://data.ct.gov/d/rz33-sg3g",
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
      city: normalizeCity(rec.city),
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

// Washington NEW APPLICATIONS — pending filings with a daytime phone number,
// the richest single lead signal we have (application date + phone).
const WA_APPS_SPEC: StateSpec = {
  state: "WA",
  label: "Washington · new applications",
  socrata: { host: "data.wa.gov", dataset: "vgcw-qfjm", limit: 5000 },
  healKeywords: "liquor cannabis board application",
  map: (rec) => {
    const lic = clean(rec.license);
    if (!lic) return null;
    // applicationdate arrives as YYYYMMDD ("20260917")
    const d = clean(rec.applicationdate);
    const filedAt =
      d && /^\d{8}$/.test(d)
        ? new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`)
        : null;
    return {
      state: "WA",
      key: `WA-A-${lic}`,
      kind: "pending",
      status: "Application filed",
      licenseType: clean(rec.l_a_type),
      typeName: clean(rec.l_a_type),
      tradeName: clean(rec.tradename) ?? clean(rec.licenseename),
      ownerName: clean(rec.licenseename),
      phone: clean(rec.dayphone),
      address: clean(rec.streetaddress),
      city: normalizeCity(rec.city),
      zip: cleanZip(rec.zipcode),
      county: clean(rec.countyname),
      filedAt,
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: "https://data.wa.gov/d/vgcw-qfjm",
    };
  },
};

// Colorado venues that EXPIRED or SURRENDERED their license — for distributors
// this is the "account up for grabs" signal: a closed venue's beer/wine
// contract reopens.
const CO_CLOSED_SPEC: StateSpec = {
  state: "CO",
  label: "Colorado · closed + surrendered licenses",
  socrata: { host: "data.colorado.gov", dataset: "pwjb-9dd5", limit: 5000 },
  healKeywords: "expired surrendered liquor licenses colorado",
  map: (rec) => {
    const lic = clean(rec.licensenumber);
    if (!lic) return null;
    const status = clean(rec.licensestatus) ?? "Expired";
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
      filedAt: null,
      issuedAt: null,
      expiresAt: safeDate(rec.expirationdate),
      lat: null,
      lng: null,
      sourceUrl: "https://data.colorado.gov/d/pwjb-9dd5",
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
      city: normalizeCity(rec.city) ?? "Chicago",
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
      city: normalizeCity(rec.city),
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
    let city: string | null = normalizeCity(rec.city);
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
  FL_RETAIL_SPEC,
  NAPA_SPEC,
  MO_SPEC,
  MO_ACTIVE_SPEC,
  CO_SPEC,
  CO_FULL_SPEC,
  CT_SPEC,
  CT_CAFE_SPEC,
  CT_TAVERN_SPEC,
  WA_SPEC,
  WA_APPS_SPEC,
  CO_CLOSED_SPEC,
  IL_SPEC,
  MD_SPEC,
  OR_APPS_SPEC,
  OR_LICENSES_SPEC,
  TTB_NEW_SPEC,
  TTB_WHOLESALER_SPEC,
  TTB_IMPORTER_SPEC,
  TTB_SPIRITS_SPEC,
  TTB_WINE_SPEC,
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
  const buf = Buffer.from(await res.arrayBuffer());
  // Some agencies (California ABC) ship the CSV inside a ZIP — extract it
  // transparently so the cron never needs manual babysitting.
  let text =
    buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b
      ? unzipFirstCsv(buf)
      : buf.toString("utf8");
  // Strip an agency banner line like "Updated Wednesday 30th of …" so the
  // real CSV header is always the first row. (Detects it by having no commas
  // — a header always has commas, a banner line never does.)
  const nl = text.indexOf("\n");
  if (
    nl > 0 &&
    !text.slice(0, nl).includes(",") &&
    text.slice(nl + 1).includes(",")
  ) {
    text = text.slice(nl + 1);
  }
  return parseCsv(text);
}

// Minimal ZIP reader (stored + deflate entries) using Node's built-in zlib —
// no extra dependency, works on any standard zip an agency publishes.
function unzipFirstCsv(buf: Buffer): string {
  // Locate the end-of-central-directory record.
  for (let i = buf.length - 22; i >= 0; i--) {
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
      const name = buf.slice(p + 46, p + 46 + nameLen).toString("latin1");
      if (name.toLowerCase().endsWith(".csv")) {
        const lhName = buf.readUInt16LE(localOff + 26);
        const lhExtra = buf.readUInt16LE(localOff + 28);
        const start = localOff + 30 + lhName + lhExtra;
        const data = buf.slice(start, start + compSize);
        if (method === 0) return data.toString("utf8");
        if (method === 8) return zlib.inflateRawSync(data).toString("utf8");
      }
      p += 46 + nameLen + extraLen + commLen;
    }
    break;
  }
  throw new Error("no csv found inside zip");
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
  const header = rows[0].map((h) => h.toLowerCase().trim().replace(/^\uFEFF/, ""));
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

export async function runOneSource(
  spec: StateSpec,
  force = false
): Promise<SourceResult> {
  let records: NormalizedRecord[] = [];
  try {
    if (spec.socrata) {
      const params = spec.socrata.where
        ? { where: spec.socrata.where, limit: spec.socrata.limit ?? 5000 }
        : { limit: spec.socrata.limit ?? 5000 };
      // PourWatch may have adopted a replacement dataset for this source.
      const dataset = (await getOverrideDataset(spec.label)) ?? spec.socrata.dataset;
      const rows = await fetchSocrataRows(spec.socrata.host, dataset, params);
      for (const r of rows) {
        const mapped = spec.map(r);
        if (mapped) records.push(mapped);
      }
    } else if (spec.fetchUrlFn) {
      const url = await spec.fetchUrlFn();
      const rows = await fetchGenericCsv(url);
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

  // Static registers (TTB lists) must keep a minimum size — if the row count
  // collapses, the layout or folder changed, and that is a failure, not "ok".
  if (!force && spec.minRows && records.length < spec.minRows) {
    return {
      label: spec.label,
      state: spec.state,
      ok: false,
      rowsSeen: records.length,
      newLicenses: 0,
      newEvents: 0,
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
    };
  }

  // Persist to database — fully batched so thousands of rows stay fast.
  let newLicenses = 0;
  let newEvents = 0;

  // Which of these keys do we already know about? (batched lookup)
  const existingSet = new Set<string>();
  // A national feed (TTB) contributes records across MANY states, so look
  // up by the states actually present; single-state specs are unaffected.
  const stateSet = [...new Set(records.map((r) => r.state))];
  for (let i = 0; i < records.length; i += CHUNK) {
    const keys = records.slice(i, i + CHUNK).map((r) => r.key);
    const found = await db
      .select({ key: licenses.licenseKey })
      .from(licenses)
      .where(and(inArray(licenses.state, stateSet), inArray(licenses.licenseKey, keys)));
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
    const when = (rec.filedAt ?? rec.issuedAt ?? rec.expiresAt)?.getTime();
    if (when === undefined) {
      // No date at all (e.g. a static register) → treat as current.
      recentOnly.push(rec);
    } else if (when >= cutoff) {
      recentOnly.push(rec);
    }
  }

  // ── FAKE-LEADS GUARD ────────────────────────────────────────────────
  // If a source suddenly reports most of its register as brand-new keys, its
  // ID format almost certainly changed — customers would get thousands of
  // phantom "new filings". Block the insert; PourWatch pauses the source.
  if (!force) {
    const median = await priorMedianRows(spec.label);
    if (
      median >= 1000 &&
      toInsert.length >= 1000 &&
      toInsert.length > median * 0.5
    ) {
      return {
        label: spec.label,
        state: spec.state,
        ok: false,
        rowsSeen: records.length,
        newLicenses: 0,
        newEvents: 0,
        error: `ID-format change suspected: ${toInsert.length} unseen keys vs ${median} usual rows — insert BLOCKED to protect customers`,
      };
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
    const when = rec.filedAt ?? rec.issuedAt ?? rec.expiresAt ?? new Date();
    // Closing venues (expired/surrendered licenses) are a STATUS_CHANGE, not
    // a "new license" — the feed badges them as UPDATE.
    const closing = /expired|surrender/i.test(rec.status ?? "");
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
        ? `CLOSING — ${rec.tradeName ?? rec.ownerName ?? "Venue"} · ${rec.city ?? rec.county ?? rec.state} (account up for grabs)`
        : `${rec.tradeName ?? rec.ownerName ?? "New venue"} · ${rec.city ?? rec.county ?? rec.state}`,
    };
  });
  for (let i = 0; i < eventRows.length; i += CHUNK) {
    await db.insert(events).values(eventRows.slice(i, i + CHUNK)).onConflictDoNothing();
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

// Runs the given specs: paused sources are skipped (unless force), each
// result is recorded to PourWatch (ingest_runs + source_health + alerts).
export async function runSpecs(specs: StateSpec[], force = false): Promise<{
  results: SourceResult[];
  skipped: string[];
}> {
  await ensureSchema();
  const health = await getHealthMap();
  const run: StateSpec[] = [];
  const skipped: string[] = [];
  for (const spec of specs) {
    const h = health.get(spec.label);
    if (!force && h?.status === "paused") skipped.push(spec.label);
    else run.push(spec);
  }
  // Sources are independent, so they run in parallel — the big CSV/zip
  // downloads (CA ~7MB, FL ~14MB) overlap and the whole sweep stays well
  // inside serverless time limits.
  const results = await Promise.all(run.map((spec) => runOneSource(spec, force)));
  for (const r of results) {
    try {
      await recordRunResult(r);
    } catch {
      // PourWatch must never break an ingest
    }
  }
  return { results, skipped };
}

export async function runAllSources(force = false): Promise<{
  results: SourceResult[];
  skipped: string[];
}> {
  return runSpecs(ALL_STATE_SOURCES, force);
}

export async function runByState(
  state: string,
  force = false
): Promise<{ results: SourceResult[]; skipped: string[] }> {
  const wanted = state.trim().toUpperCase();
  return runSpecs(
    ALL_STATE_SOURCES.filter((spec) => spec.state === wanted),
    force
  );
}

// All states we currently cover — used by the API + dashboard.
export const COVERED_STATES = Array.from(
  new Set(ALL_STATE_SOURCES.map((s) => s.state))
);
