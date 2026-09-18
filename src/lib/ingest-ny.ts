// New York — State Liquor Authority via the official NY Open Data portal
// (Socrata). Two feeds:
//  1) Current SLA Pending Licenses  → applications in flight (gold signal)
//  2) Current SLA Active Licenses   → newly issued licenses
import {
  clean,
  cleanZip,
  fetchSocrata,
  NormalizedRecord,
  safeDate,
} from "./sources";

const HOST = "data.ny.gov";
const PENDING = "f8i8-k2gm"; // Current SLA Pending Licenses
const ACTIVE = "9s3h-dpkz"; // Current Liquor Authority Active Licenses
export const NY_PENDING_URL = `https://${HOST}/d/${PENDING}`;
export const NY_ACTIVE_URL = `https://${HOST}/d/${ACTIVE}`;

function geo(r: Record<string, unknown>): { lat: number | null; lng: number | null } {
  const g = r.georeference as { coordinates?: [number, number] } | undefined;
  if (g && Array.isArray(g.coordinates) && g.coordinates.length === 2) {
    return { lng: g.coordinates[0], lat: g.coordinates[1] };
  }
  return { lat: null, lng: null };
}

export async function fetchNyPending(): Promise<NormalizedRecord[]> {
  const rows = await fetchSocrata(HOST, PENDING, {
    order: "received_date DESC",
    limit: 5000,
  });
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    const appId = clean(r.application_id);
    if (!appId) continue;
    const { lat, lng } = geo(r);
    const legalName = clean(r.legalname);
    out.push({
      state: "NY",
      key: `NY-P-${appId}`,
      kind: "pending",
      status: clean(r.status) ?? "Pending",
      licenseType: clean(r.class) ?? clean(r.type),
      typeName: clean(r.description),
      tradeName: legalName,
      ownerName: legalName,
      phone: null,
      address: clean(r.actual_address_of_premises),
      city: clean(r.city),
      zip: cleanZip(r.zip_code),
      county: clean(r.premises_county),
      filedAt: safeDate(r.received_date),
      issuedAt: null,
      expiresAt: null,
      lat,
      lng,
      sourceUrl: NY_PENDING_URL,
    });
  }
  return out;
}

export async function fetchNyActive(): Promise<NormalizedRecord[]> {
  const rows = await fetchSocrata(HOST, ACTIVE, {
    order: "originalissuedate DESC",
    limit: 6000,
  });
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    const permitId = clean(r.licensepermitid);
    if (!permitId) continue;
    const { lat, lng } = geo(r);
    out.push({
      state: "NY",
      key: `NY-L-${permitId}`,
      kind: "active",
      status: "Active",
      licenseType: clean(r.class) ?? clean(r.type),
      typeName: clean(r.description),
      tradeName: clean(r.dba) ?? clean(r.legalname),
      ownerName: clean(r.legalname),
      phone: null,
      address: clean(r.actualaddressofpremises),
      city: clean(r.city),
      zip: cleanZip(r.zipcode),
      county: clean(r.premisescounty),
      filedAt: safeDate(r.originalissuedate),
      issuedAt: safeDate(r.lastissuedate) ?? safeDate(r.effectivedate),
      expiresAt: safeDate(r.expirationdate),
      lat,
      lng,
      sourceUrl: NY_ACTIVE_URL,
    });
  }
  return out;
}
