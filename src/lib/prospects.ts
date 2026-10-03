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

export const PROSPECT_CATEGORIES = [
  { id: "attorney", label: "Attorneys", tag: '["office"="lawyer"]' },
  { id: "insurance", label: "Insurance agents", tag: '["office"="insurance"]' },
  { id: "beverage", label: "Beverage sellers", tag: '["shop"="alcohol"]' },
  { id: "bar", label: "Bars (end leads)", tag: '["amenity"="bar"]' },
] as const;

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

// Daily rotation: the biggest bar-market states first.
const ROTATION = [
  "TX", "FL", "CA", "NY", "GA", "PA", "IL", "OH", "NC", "MI",
  "AZ", "TN", "VA", "NJ", "MA", "WA", "CO", "MO", "LA", "IN",
  "SC", "MD", "OR", "CT", "MN", "WI", "NV", "AL", "OK", "KY",
];

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
  // Overpass is community-run: it can answer "server busy" or hang, so we
  // retry each mirror with a short backoff before moving to the next one.
  for (const mirror of MIRRORS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(mirror, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "pourwatch/1.0 (prospect-monitor)",
          },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(90_000),
          cache: "no-store",
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { elements?: OsmElement[] };
        if (Array.isArray(data.elements)) return data.elements;
      } catch {
        // fall through to retry
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("all overpass mirrors failed");
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
        try {
          const q = `[out:json][timeout:80];(node${cat.tag}(${s},${w},${n},${e});way${cat.tag}(${s},${w},${n},${e}););out center 5000;`;
          const els = await overpass(q);
          const rows = els
            .filter((el) => el.tags?.name)
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
