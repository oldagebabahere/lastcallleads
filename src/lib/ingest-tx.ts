// Texas — Texas Alcoholic Beverage Commission via the official Texas Open
// Data Portal (Socrata). Two feeds:
//  1) Pending applications  → the gold signal (someone is about to open)
//  2) Active licenses       → newly issued licenses (just opened)
import {
  clean,
  cleanNumberId,
  cleanZip,
  fetchSocrata,
  NormalizedRecord,
  safeDate,
} from "./sources";

const HOST = "data.texas.gov";
const PENDING = "mxm5-tdpj"; // Pending Original New License Applications
const ACTIVE = "7hf9-qc9f"; // TABC License Information
export const TX_PENDING_URL = `https://${HOST}/d/${PENDING}`;
export const TX_ACTIVE_URL = `https://${HOST}/d/${ACTIVE}`;

const TX_TYPES: Record<string, string> = {
  // On-premise / bar & restaurant
  MB: "Mixed Beverage Permit (Full Bar)",
  FB: "Food & Beverage Certificate",
  LH: "Late Hours Permit",
  RM: "Mixed Beverage Restaurant",
  BE: "Beer On-Premise (Bar/Restaurant)",
  BB: "Beer Retailer (On-Premise)",
  SB: "Service Bar",
  CW: "Carrier / Warehouse",
  // Off-premise retail
  Q: "Wine & Malt Off-Premise",
  BF: "Beer Off-Premise (Convenience/Grocery)",
  BQ: "Beer & Wine Off-Premise (Retailer)",
  BG: "Beer & Wine Off-Premise (Package)",
  BN: "Beer & Wine Retailer",
  P: "Package Store (Liquor Store)",
  PR: "Package Store Retailer",
  // Production
  B: "Brewer (Production)",
  BP: "Brewpub",
  G: "Winery",
  D: "Distiller",
  DS: "Direct Shipper (Winery/Distillery)",
  BW: "Brewery Wholesaler",
  // Distribution
  W: "Wholesaler",
  LP: "Local Distributor",
  Y: "Local Cartage",
  PE: "Beverage Cartage",
  // Events & other
  NT: "Nonprofit / Temporary Event",
  S: "Caterer Permit",
  FC: "Food & Beverage Certificate",
  T: "Caterer-Temporary",
  V: "University Venue",
  N: "Brewer (out-of-state)",
  C: "Winery (out-of-state)",
  J: "Special Permit",
  JD: "Special Permit (Joint)",
};

export function txTypeName(code: string | null): string | null {
  if (!code) return null;
  return TX_TYPES[code.toUpperCase()] ?? `TABC License Type ${code.toUpperCase()}`;
}

export async function fetchTxPending(): Promise<NormalizedRecord[]> {
  const rows = await fetchSocrata(HOST, PENDING, {
    order: "submission_date DESC",
    limit: 5000,
  });
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    const appId = cleanNumberId(r.applicationid);
    if (!appId) continue;
    const type = clean(r.license_type);
    const owner = clean(r.owner);
    out.push({
      state: "TX",
      key: `TX-P-${appId}`,
      kind: "pending",
      status: clean(r.applicationstatus) ?? "Pending",
      licenseType: type,
      typeName: txTypeName(type),
      tradeName: null, // TABC pending feed lists the legal entity only
      ownerName: owner,
      phone: null,
      address: clean(r.address),
      city: clean(r.city),
      zip: cleanZip(r.zip),
      county: clean(r.county),
      filedAt: safeDate(r.submission_date),
      issuedAt: null,
      expiresAt: null,
      lat: null,
      lng: null,
      sourceUrl: TX_PENDING_URL,
    });
  }
  return out;
}

export async function fetchTxActive(): Promise<NormalizedRecord[]> {
  const rows = await fetchSocrata(HOST, ACTIVE, {
    where: "primary_status='Active'",
    order: "status_change_date DESC",
    limit: 6000,
  });
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    const licenseId = cleanNumberId(r.license_id);
    if (!licenseId) continue;
    const type = clean(r.license_type);
    out.push({
      state: "TX",
      key: `TX-L-${licenseId}`,
      kind: "active",
      status: clean(r.primary_status) ?? "Active",
      licenseType: type,
      typeName: txTypeName(type),
      tradeName: clean(r.trade_name),
      ownerName: clean(r.owner),
      phone: clean(r.phone),
      address: clean(r.address),
      city: clean(r.city),
      zip: cleanZip(r.zip),
      county: clean(r.county),
      filedAt: safeDate(r.original_issue_date),
      issuedAt: safeDate(r.current_issued_date) ?? safeDate(r.status_change_date),
      expiresAt: safeDate(r.expiration_date),
      lat: null,
      lng: null,
      sourceUrl: TX_ACTIVE_URL,
    });
  }
  return out;
}
