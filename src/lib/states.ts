// Single source of truth for our 9 genuinely live, retail-verified US beverage
// markets. Zero fake "all 50 states" claims — every market below pulls live
// bar, restaurant, brewpub & liquor-store filings directly from official portals.

export type LiveMarket = {
  code: string;
  slug: string;
  name: string;
  scope: string; // e.g. "Statewide" or "Chicago Metro"
  agency: string;
  highlight: string;
  hasPending: boolean;
  hasPhones: boolean;
  hasReceipts?: boolean;
  entityLookupUrl: string;
  entityLookupLabel: string;
};

export const LIVE_MARKETS: LiveMarket[] = [
  {
    code: "TX",
    slug: "texas",
    name: "Texas",
    scope: "Statewide",
    agency: "Texas TABC + Comptroller",
    highlight: "Pending apps, relocations & monthly bar alcohol revenue",
    hasPending: true,
    hasPhones: false,
    hasReceipts: true,
    entityLookupUrl: "https://mycpa.cpa.state.tx.us/coa/",
    entityLookupLabel: "TX Comptroller Entity Search",
  },
  {
    code: "NY",
    slug: "new-york",
    name: "New York",
    scope: "Statewide",
    agency: "NY State Liquor Authority",
    highlight: "Pending SLA applications + newly issued licenses",
    hasPending: true,
    hasPhones: false,
    entityLookupUrl: "https://apps.dos.ny.gov/publicInquiry/",
    entityLookupLabel: "NY Dept. of State Entity Search",
  },
  {
    code: "CA",
    slug: "california",
    name: "California",
    scope: "Statewide",
    agency: "California ABC",
    highlight: "Daily ABC export — pending Type 47/48/41/21 filings",
    hasPending: true,
    hasPhones: false,
    entityLookupUrl: "https://bizfileonline.sos.ca.gov/search/business",
    entityLookupLabel: "CA Secretary of State Search",
  },
  {
    code: "IL",
    slug: "illinois",
    name: "Illinois (Chicago)",
    scope: "Chicago Metro",
    agency: "Chicago BACP",
    highlight: "Brand-new liquor openings only (renewals filtered) + neighborhoods",
    hasPending: false,
    hasPhones: false,
    entityLookupUrl: "https://apps.ilsos.gov/businessentitysearch/",
    entityLookupLabel: "IL Secretary of State Search",
  },
  {
    code: "WA",
    slug: "washington",
    name: "Washington",
    scope: "Statewide",
    agency: "WA Liquor & Cannabis Board",
    highlight: "Weekday new applications + direct daytime phones & signee names",
    hasPending: true,
    hasPhones: true,
    entityLookupUrl: "https://ccfs.sos.wa.gov/#/BusinessSearch",
    entityLookupLabel: "WA Secretary of State Search",
  },
  {
    code: "OR",
    slug: "oregon",
    name: "Oregon",
    scope: "Statewide",
    agency: "Oregon OLCC",
    highlight: "Live applications received + licensed venues + non-renewals",
    hasPending: true,
    hasPhones: false,
    entityLookupUrl: "https://egov.sos.state.or.us/br/pkg_web_name_srch_inq.login",
    entityLookupLabel: "OR Secretary of State Search",
  },
  {
    code: "CO",
    slug: "colorado",
    name: "Colorado",
    scope: "Statewide",
    agency: "Colorado LED",
    highlight: "Recently approved liquor licenses + closed alcohol venues",
    hasPending: false,
    hasPhones: false,
    entityLookupUrl: "https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do",
    entityLookupLabel: "CO Secretary of State Search",
  },
  {
    code: "CT",
    slug: "connecticut",
    name: "Connecticut",
    scope: "Statewide",
    agency: "CT Dept. of Consumer Protection",
    highlight: "Pending & active liquor permits with named permittees",
    hasPending: true,
    hasPhones: false,
    entityLookupUrl: "https://service.ct.gov/business/s/onlinebusinesssearch",
    entityLookupLabel: "CT Business Registry Search",
  },
  {
    code: "MO",
    slug: "missouri",
    name: "Missouri",
    scope: "Statewide",
    agency: "Missouri ATC",
    highlight: "New liquor licenses + active directory with direct phones",
    hasPending: false,
    hasPhones: true,
    entityLookupUrl: "https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx",
    entityLookupLabel: "MO Secretary of State Search",
  },
];

export const LIVE_STATE_CODES = LIVE_MARKETS.map((m) => m.code);
export const LIVE_STATE_SET = new Set<string>(LIVE_STATE_CODES);

export const LIVE_STATE_NAMES_LIST =
  "Texas, New York, California, Illinois (Chicago), Washington, Oregon, Colorado, Connecticut, and Missouri";

export const LIVE_STATE_NAMES_DOT = LIVE_MARKETS.map((m) => m.name).join(" · ");

export const MARKET_BY_CODE: Record<string, LiveMarket> = Object.fromEntries(
  LIVE_MARKETS.map((m) => [m.code, m])
);

export function stateFullName(code: string): string {
  const c = code.trim().toUpperCase();
  return MARKET_BY_CODE[c]?.name ?? ALL_US_STATE_NAMES[c] ?? c;
}

export function formatStateNames(states: string | string[]): string {
  const arr = Array.isArray(states)
    ? states
    : states
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  if (!arr.length) return "Texas";
  return arr.map((c) => stateFullName(c)).join(", ");
}

export const MARKET_BY_SLUG: Record<string, LiveMarket> = Object.fromEntries(
  LIVE_MARKETS.map((m) => [m.slug, m])
);

// Legacy tuple shape for backwards compatibility with components & pages.
export const US_STATES: [string, string][] = LIVE_MARKETS.map((m) => [m.code, m.name]);

// Full 50-state lookup solely for rendering historical city slugs cleanly without 404s.
export const ALL_US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
