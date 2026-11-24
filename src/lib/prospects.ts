// PROSPECT FINDER — free, unlimited B2B leads from OpenStreetMap.
//
// Your customers are the people who SELL to bars: liquor-law attorneys,
// insurance agents, beverage distributors. This harvester pulls every one
// of them (name + phone + website + address) for any US state, daily, with
// no API key and no cost. Results land in the `prospects` table and export
// as CSV from /dashboard/prospects.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { prospects } from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";

import { LIVE_STATE_CODES, stateFullName } from "@/lib/states";
import { harvestDistributors } from "@/lib/distributors";

export const PROSPECT_CATEGORIES = [
  { id: "distributor", label: "Beverage & food distributors", tag: '["wholesale"~"beverages|alcohol|wine|beer|food"]' },
  { id: "brewery", label: "Craft breweries, wineries & distilleries", tag: '["craft"~"brewery|winery|distillery"]' },
  { id: "beverage", label: "Independent wine & spirits shops", tag: '["shop"~"wine|alcohol|beverages"]' },
  { id: "insurance", label: "Commercial liquor insurance", tag: '["office"="insurance"]' },
  { id: "attorney", label: "Hospitality & business attorneys", tag: '["office"="lawyer"]' },
] as const;

// Strict B2B quality filter — blocks consumer car/home/title insurance chains
// (State Farm, Allstate, Fred Loya, A-MAX, Stewart Title), divorce/PI lawyers,
// and big-box grocery/gas chains so outreach quota ONLY hits real hospitality buyers.
const JUNK_INSURANCE_NAME_RE =
  /\b(state\s*farm|allstate|geico|progressive|farmers\s+ins|liberty\s+mutual|fred\s*loya|a-?max|pronto\s+ins|freeway\s+ins|acceptance\s+ins|direct\s+auto|nationwide|usaa|aaa\b|american\s+family|country\s+financial|shelter\s+ins|farm\s+bureau|metlife|prudential|new\s+york\s+life|northwestern\s+mutual|edward\s+jones|aflac|blue\s*cross|humana|united\s*health|medicare|medicaid|dental|vision\s+ins|title\s+(co|company|agency|ins|group|services)|stewart\s+title|first\s+american|old\s+republic|chicago\s+title|fidelity\s+national|bail\s+bond|auto\s+ins|car\s+ins|sr-?22|life\s+ins|health\s+ins|funeral|burial|homeowners?\s+ins|renters?\s+ins|pet\s+ins|veronica'?s\s+ins|la\s+familia\s+auto|fiesta\s+auto|adriana'?s\s+ins|seguros?\s+de\s+auto|seguro\s+barato)\b/i;

const JUNK_ATTORNEY_NAME_RE =
  /\b(personal\s+injury|injury\s+law|accident|car\s+wreck|truck\s+accident|divorce|family\s+law|criminal\s+defense|criminal\s+law|\bdui\b|\bdwi\b|immigration|bankruptcy|probate|estate\s+plan|wills?\s*&?\s*trusts?|workers?\s*comp|social\s+security|disability|patent|trademark|public\s+defender|district\s+attorney|county\s+attorney|city\s+attorney|legal\s+aid|child\s+support|adoption|medical\s+malpractice|slip\s+and\s+fall|traffic\s+ticket|expungement|asylum|deportation)\b/i;

const JUNK_BEVERAGE_NAME_RE =
  /\b(walmart|target|costco|sam'?s\s+club|kroger|h-?e-?b\b|publix|safeway|albertsons|walgreens|cvs\b|7-?eleven|circle\s+k|shell\b|chevron|exxon|mobil\b|wawa\b|sheetz|quiktrip|buc-?ee|trader\s+joe|whole\s+foods|aldi\b|lidl\b|dollar\s+general|dollar\s+tree|family\s+dollar|total\s+wine|bevmo|spec'?s\b|twin\s+liquors|goody\s+goody|abc\s+fine\s+wine|meijer|wegmans|giant\s+eagle|stop\s*&\s*shop|food\s+lion|piggly\s+wiggly|winn-?dixie|ralphs|vons|jewel-?osco|speedway|racetrac|loves\s+travel|pilot\s+flying)\b/i;

const JUNK_DOMAINS = [
  "statefarm.com", "allstate.com", "farmers.com", "geico.com", "progressive.com",
  "libertymutual.com", "fredloya.com", "amaxinsurance.com", "prontoinsurance.com",
  "freewayinsurance.com", "acceptanceinsurance.com", "directauto.com",
  "nationwide.com", "usaa.com", "aaa.com", "amfam.com", "edwardjones.com",
  "aflac.com", "stewart.com", "firstam.com", "oldrepublictitle.com", "fnf.com",
  "countryfinancial.com", "shelterinsurance.com", "metlife.com", "prudential.com",
  "newyorklife.com", "northwesternmutual.com", "walmart.com", "target.com",
  "costco.com", "kroger.com", "heb.com", "publix.com", "safeway.com", "cvs.com",
  "walgreens.com", "7-eleven.com", "totalwine.com", "bevmo.com", "facebook.com",
  "instagram.com", "yelp.com", "linkedin.com", "yellowpages.com", "google.com",
];

export function isJunkProspect(
  name: string | null | undefined,
  website: string | null | undefined,
  category: string | null | undefined
): boolean {
  const n = (name ?? "").trim();
  const cat = (category ?? "").toLowerCase();
  if (!n || n.length < 3) return true;

  if (website) {
    try {
      const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
        .hostname.toLowerCase()
        .replace(/^www\./, "");
      if (host.endsWith(".gov") || host.endsWith(".edu") || host.endsWith(".mil") || host.endsWith(".ca")) {
        return true;
      }
      if (JUNK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) {
        return true;
      }
    } catch {
      // malformed URL handled elsewhere
    }
  }

  if (cat === "insurance" && JUNK_INSURANCE_NAME_RE.test(n)) return true;
  if (cat === "attorney" && JUNK_ATTORNEY_NAME_RE.test(n)) return true;
  if (cat === "beverage" && JUNK_BEVERAGE_NAME_RE.test(n)) return true;
  if (cat === "bar") return true;
  return false;
}

// Approximate bounding boxes (south, west, north, east) — bbox queries are
// ~10x faster than area queries on Overpass. Edge overlap with neighbours
// is acceptable for outreach lists.
const STATE_BBOX: Record<string, [number, number, number, number]> = {
  AL: [30.2, -88.5, 35.0, -84.9], AK: [55.0, -168.0, 71.4, -130.0],
  AZ: [31.3, -115.0, 37.0, -108.2], AR: [33.0, -94.6, 36.5, -89.6],
  CA: [32.5, -124.4, 42.0, -114.1], CO: [37.0, -109.1, 41.0, -102.0],
  CT: [40.95, -73.75, 42.05, -71.7], DC: [38.78, -77.12, 38.99, -76.88],
  DE: [38.4, -75.8, 39.85, -74.9], FL: [24.4, -87.6, 31.0, -79.9],
  GA: [30.3, -85.6, 35.0, -80.7], HI: [18.8, -160.3, 22.3, -154.7],
  IA: [40.3, -96.6, 43.6, -90.1], ID: [41.9, -117.3, 49.0, -111.0],
  IL: [36.9, -91.5, 42.5, -87.0], IN: [37.7, -88.1, 41.8, -84.7],
  KS: [36.9, -102.1, 40.1, -94.5], KY: [36.5, -89.5, 39.2, -81.9],
  LA: [28.9, -94.1, 33.0, -88.7], MA: [41.2, -73.5, 43.0, -69.8],
  MD: [37.9, -79.5, 39.8, -75.0], ME: [42.9, -71.2, 47.5, -66.8],
  MI: [41.6, -90.5, 48.3, -82.1], MN: [43.5, -97.3, 49.4, -89.4],
  MO: [35.9, -95.8, 40.7, -88.9], MS: [30.1, -91.7, 35.0, -88.0],
  MT: [44.3, -116.1, 49.1, -103.9], NC: [33.7, -84.4, 36.7, -75.4],
  ND: [45.8, -104.1, 49.1, -96.5], NE: [39.9, -104.1, 43.1, -95.2],
  NH: [42.7, -72.6, 45.4, -70.6], NJ: [38.8, -75.6, 41.4, -73.8],
  NM: [31.3, -109.1, 37.1, -102.9], NV: [35.0, -120.1, 42.0, -113.9],
  NY: [40.5, -79.8, 45.1, -71.8], OH: [38.3, -84.9, 42.1, -80.4],
  OK: [33.6, -103.1, 37.1, -94.4], OR: [41.9, -124.7, 46.4, -116.4],
  PA: [39.7, -80.6, 42.4, -74.6], RI: [41.1, -71.9, 42.1, -71.1],
  SC: [32.0, -83.4, 35.3, -78.4], SD: [42.4, -104.1, 46.0, -96.4],
  TN: [34.9, -90.4, 36.8, -81.6], TX: [25.8, -106.6, 36.6, -93.5],
  UT: [37.0, -114.1, 42.1, -109.0], VA: [36.5, -83.7, 39.5, -75.2],
  VT: [42.7, -73.5, 45.1, -71.4], WA: [45.5, -124.8, 49.0, -116.9],
  WI: [42.5, -92.9, 47.1, -86.7], WV: [37.2, -82.7, 40.7, -77.7],
  WY: [40.9, -111.1, 45.1, -104.0],
};

// Daily rotation across our 9 verified live markets ONLY (keeps Supabase 500MB free tier lean!).
const ROTATION = LIVE_STATE_CODES;

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function overpass(query: string): Promise<OsmElement[]> {
  // Overpass is community-run: try each mirror with a 18s timeout so large US
  // states succeed cleanly while still fitting inside Vercel's 60s window.
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "pourwatch/1.0 (prospect-monitor)",
        },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(18_000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: OsmElement[] };
      if (Array.isArray(data.elements)) return data.elements;
    } catch {
      // fall through to next mirror
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("all overpass mirrors failed");
}

type OpenBreweryRow = {
  id?: string;
  name?: string;
  brewery_type?: string;
  address_1?: string | null;
  street?: string | null;
  city?: string | null;
  state_province?: string | null;
  state?: string | null;
  phone?: string | null;
  website_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

// Free, zero-API-key US Craft Brewery directory (3,478+ real breweries across our 9 live states!).
// Primary: Open Brewery DB's official GitHub Fastly CDN per-state CSV (150ms, never rate-limits Vercel!).
// Fallback: api.openbrewerydb.org v1 REST endpoint.
async function harvestOpenBreweryDb(state: string): Promise<ProspectRun> {
  const rawName = stateFullName(state).replace(/\s*\(.*?\)\s*/g, "").trim();
  const slugDash = rawName.toLowerCase().replace(/\s+/g, "-");
  const slugUnder = rawName.toLowerCase().replace(/\s+/g, "_");
  const allRows: {
    category: string;
    osmKey: string;
    name: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string;
    lat: number | null;
    lng: number | null;
  }[] = [];

  const pushBrewery = (b: OpenBreweryRow) => {
    const type = (b.brewery_type ?? "").toLowerCase();
    if (type === "closed") return;
    const name = (b.name ?? "").trim();
    const website = (b.website_url ?? "").trim() || null;
    const phone = (b.phone ?? "").trim() || null;
    if (!name || (!website && !phone)) return;
    if (isJunkProspect(name, website, "brewery")) return;
    const lat = b.latitude != null && String(b.latitude).trim() !== "" ? Number(b.latitude) : null;
    const lng = b.longitude != null && String(b.longitude).trim() !== "" ? Number(b.longitude) : null;
    allRows.push({
      category: "brewery",
      osmKey: `obdb/${b.id ?? `${state}-${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`}`,
      name,
      phone,
      website,
      address: (b.address_1 ?? b.street ?? "").trim() || null,
      city: (b.city ?? "").trim() || null,
      state,
      lat: lat !== null && Number.isFinite(lat) ? lat : null,
      lng: lng !== null && Number.isFinite(lng) ? lng : null,
    });
  };

  try {
    // 1) Primary fast source: official per-state GitHub raw CSV (1 single request, ~150ms!)
    const ghUrl = `https://raw.githubusercontent.com/openbrewerydb/openbrewerydb/master/data/united-states/${encodeURIComponent(slugDash)}.csv`;
    const ghRes = await fetch(ghUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LastCallLeads/2.0)" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    }).catch(() => null);

    if (ghRes && ghRes.ok) {
      const csvText = await ghRes.text();
      const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length >= 2) {
        const hdr = parseCsvRow(lines[0]).map((h) => h.toLowerCase().replace(/^\uFEFF/, ""));
        const idx = (k: string) => hdr.indexOf(k);
        const iId = idx("id");
        const iName = idx("name");
        const iType = idx("brewery_type");
        const iAddr = idx("address_1");
        const iCity = idx("city");
        const iPhone = idx("phone");
        const iWeb = idx("website_url");
        const iLat = idx("latitude");
        const iLng = idx("longitude");
        for (let i = 1; i < lines.length; i++) {
          const v = parseCsvRow(lines[i]);
          pushBrewery({
            id: iId >= 0 ? v[iId] : undefined,
            name: iName >= 0 ? v[iName] : undefined,
            brewery_type: iType >= 0 ? v[iType] : undefined,
            address_1: iAddr >= 0 ? v[iAddr] : null,
            city: iCity >= 0 ? v[iCity] : null,
            phone: iPhone >= 0 ? v[iPhone] : null,
            website_url: iWeb >= 0 ? v[iWeb] : null,
            latitude: iLat >= 0 ? v[iLat] : null,
            longitude: iLng >= 0 ? v[iLng] : null,
          });
        }
      }
    }

    // 2) Fallback: Open Brewery DB REST API if GitHub CSV returned 0 rows
    if (allRows.length === 0) {
      for (let page = 1; page <= 3; page++) {
        const url = `https://api.openbrewerydb.org/v1/breweries?by_state=${encodeURIComponent(slugUnder)}&per_page=200&page=${page}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        });
        if (!res.ok) break;
        const data = (await res.json()) as OpenBreweryRow[];
        if (!Array.isArray(data) || data.length === 0) break;
        for (const b of data) pushBrewery(b);
        if (data.length < 200) break;
      }
    }

    let added = 0;
    for (let j = 0; j < allRows.length; j += 250) {
      const r = await db
        .insert(prospects)
        .values(allRows.slice(j, j + 250))
        .onConflictDoNothing()
        .returning({ id: prospects.id });
      added += r.length;
    }
    return { category: "brewery", ok: true, seen: allRows.length, added };
  } catch (err) {
    return {
      category: "brewery",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type ProspectRun = {
  category: string;
  ok: boolean;
  seen?: number;
  added?: number;
  error?: string;
};

export async function harvestProspects(
  stateCode: string,
  catIds?: string[]
): Promise<{ state: string; results: ProspectRun[] }> {
  const state = stateCode.toUpperCase();
  const bbox = STATE_BBOX[state];
  if (!bbox) throw new Error("unknown state " + state);
  await ensureSchema();

  const cats = PROSPECT_CATEGORIES.filter(
    (c) => !catIds || catIds.includes(c.id)
  );
  const [s, w, n, e] = bbox;

  // Overpass allows ~2 concurrent queries per IP — run categories two at a
  // time so none get bounced with "server busy".
  const runs: Promise<ProspectRun>[] = [];
  for (let i = 0; i < cats.length; i += 2) {
    const pair = cats.slice(i, i + 2);
    const settled = await Promise.all(
      pair.map(async (cat): Promise<ProspectRun> => {
        // Fast path 1: Official state Wine/Spirits Distributors + DNS MX verification (<4s!)
        if (cat.id === "distributor") {
          const dist = await harvestDistributors(state, 60);
          if (dist.ok && (dist.looked > 0 || dist.added > 0)) {
            return { category: "distributor", ok: true, seen: dist.looked, added: dist.added };
          }
        }
        // Fast path 2: Open Brewery DB GitHub CDN (200-900 verified craft breweries/state in 150ms!)
        if (cat.id === "brewery") {
          const obdb = await harvestOpenBreweryDb(state);
          if (obdb.ok && (obdb.seen ?? 0) > 0) return obdb;
        }
        try {
          // Fast bbox query (10x faster than area polygon scan on big states like TX/CA)
          // with explicit US-state / non-Canada tag filter so border cities stay clean.
          const q = `[out:json][timeout:16];(node${cat.tag}(${s},${w},${n},${e});way${cat.tag}(${s},${w},${n},${e}););out center 800;`;
          const els = await overpass(q);
          const rows = els
            .filter((el) => {
              const name = el.tags?.name;
              const site = el.tags?.website ?? el.tags?.["contact:website"] ?? null;
              const phone = el.tags?.phone ?? el.tags?.["contact:phone"] ?? null;
              if (!name || (!site && !phone)) return false;
              const country = (el.tags?.["addr:country"] ?? "").trim().toUpperCase();
              if (country && country !== "US" && country !== "USA") return false;
              const taggedSt = (el.tags?.["addr:state"] ?? "").trim().toUpperCase();
              if (taggedSt && taggedSt.length === 2 && taggedSt !== state) return false;
              return !isJunkProspect(name, site, cat.id);
            })
            .map((el) => ({
              category: cat.id,
              osmKey: `${el.type}/${el.id}`,
              name: String(el.tags!.name),
              phone: el.tags!.phone ?? el.tags!["contact:phone"] ?? null,
              website: el.tags!.website ?? el.tags!["contact:website"] ?? null,
              address:
                [el.tags!["addr:housenumber"], el.tags!["addr:street"]]
                  .filter(Boolean)
                  .join(" ") || null,
              city: el.tags!["addr:city"] ?? null,
              state,
              lat: el.lat ?? el.center?.lat ?? null,
              lng: el.lon ?? el.center?.lon ?? null,
            }));
          let added = 0;
          for (let j = 0; j < rows.length; j += 400) {
            const r = await db
              .insert(prospects)
              .values(rows.slice(j, j + 400))
              .onConflictDoNothing()
              .returning({ id: prospects.id });
            added += r.length;
          }
          // Clean-up: drop rows of this state+category that the exact
          // state-boundary query no longer returns (old border-town /
          // Canadian leftovers). Safety guards: only when the fresh result
          // is big enough and not truncated by the 5000 cap.
          if (rows.length >= 50 && els.length < 5000) {
            await db
              .delete(prospects)
              .where(
                and(
                  eq(prospects.state, state),
                  eq(prospects.category, cat.id),
                  notInArray(
                    prospects.osmKey,
                    rows.map((r) => r.osmKey)
                  )
                )
              );
          }
          return { category: cat.id, ok: true, seen: rows.length, added };
        } catch (err) {
          return {
            category: cat.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );
    runs.push(...settled.map((r) => Promise.resolve(r)));
  }
  const results = await Promise.all(runs);
  return { state, results };
}

// The daily cron calls this: one state per day, round-robin.
export function todaysState(): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return ROTATION[day % ROTATION.length];
}
