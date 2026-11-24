import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gt, inArray, notLike } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses, subscribers } from "@/db/schema";
import { buildBeverageDossier, parseEventMeta } from "@/lib/beverage-intel";
import { dedupeKey, isJunkEntity, scoreFiling } from "@/lib/lead-score";
import { embargoCutoff, hoursAgoMs, maskName } from "@/lib/queries";
import { LIVE_MARKETS, LIVE_STATE_CODES, LIVE_STATE_SET, stateFullName } from "@/lib/states";
import { checkoutUpgradeUrl, exportUrl, verifyScopedToken, filingUnlockUrl } from "@/lib/unsubscribe";
import { Footer, Nav } from "@/components/ui";
import TerritoryMap, { type TerritoryPin } from "@/components/territory-map";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live bar & liquor-license territory map + Google Maps route planner",
  description:
    "Explore newly filed bars, restaurants & liquor stores pinned across 9 verified US markets and build a 1-click multi-stop Google Maps driving route for field visits.",
  alternates: { canonical: "/map" },
};

// Accurate metro coordinates fallback when a state portal omits lat/lng
const CITY_COORDS: Record<string, [number, number]> = {
  "austin,tx": [30.2672, -97.7431],
  "houston,tx": [29.7604, -95.3698],
  "dallas,tx": [32.7767, -96.797],
  "san antonio,tx": [29.4241, -98.4936],
  "fort worth,tx": [32.7555, -97.3308],
  "katy,tx": [29.7858, -95.8245],
  "new york,ny": [40.7128, -74.006],
  "manhattan,ny": [40.7831, -73.9712],
  "brooklyn,ny": [40.6782, -73.9442],
  "queens,ny": [40.7282, -73.7949],
  "bronx,ny": [40.8448, -73.8648],
  "buffalo,ny": [42.8864, -78.8784],
  "los angeles,ca": [34.0522, -118.2437],
  "san francisco,ca": [37.7749, -122.4194],
  "san diego,ca": [32.7157, -117.1611],
  "sacramento,ca": [38.5816, -121.4944],
  "oakland,ca": [37.8044, -122.2712],
  "san jose,ca": [37.3382, -121.8863],
  "chicago,il": [41.8781, -87.6298],
  "seattle,wa": [47.6062, -122.3321],
  "spokane,wa": [47.6588, -117.426],
  "tacoma,wa": [47.2529, -122.4443],
  "portland,or": [45.5152, -122.6784],
  "bend,or": [44.0582, -121.3153],
  "eugene,or": [44.0521, -123.0868],
  "denver,co": [39.7392, -104.9903],
  "colorado springs,co": [38.8339, -104.8214],
  "boulder,co": [40.015, -105.2705],
  "hartford,ct": [41.7658, -72.6734],
  "stamford,ct": [41.0534, -73.5387],
  "new haven,ct": [41.3083, -72.9279],
  "st louis,mo": [38.627, -90.1994],
  "saint louis,mo": [38.627, -90.1994],
  "kansas city,mo": [39.0997, -94.5786],
};

const STATE_CENTERS: Record<string, [number, number]> = {
  TX: [31.0, -99.0],
  NY: [42.6, -75.5],
  CA: [36.7, -119.7],
  IL: [41.88, -87.63],
  WA: [47.4, -120.5],
  OR: [44.0, -120.5],
  CO: [39.1, -105.5],
  CT: [41.6, -72.7],
  MO: [38.5, -92.5],
};

function jitter(id: number, scale = 0.035): [number, number] {
  const a = ((id * 9301 + 49297) % 233280) / 233280 - 0.5;
  const b = ((id * 49297 + 9301) % 233280) / 233280 - 0.5;
  return [a * scale, b * scale];
}

// Showcase pins rendered cleanly if DB is empty before first sweep.
const SHOWCASE_PINS: TerritoryPin[] = [
  {
    id: 9001,
    state: "TX",
    eventType: "NEW_PENDING",
    displayName: "La Llorona Cantina",
    locked: false,
    city: "Katy",
    county: "Harris",
    address: "19128 W Little York Rd",
    zip: "77449",
    typeName: "Mixed Beverage Permit (Full Bar)",
    archetype: "Full-Liquor Restaurant & Bar",
    score: 88,
    lat: 29.7858,
    lng: -95.8245,
    dateLabel: "Sample",
    unlockHref: "/sample",
  },
  {
    id: 9002,
    state: "TX",
    eventType: "NEW_PENDING",
    displayName: "Congress Ave Mezcaleria",
    locked: false,
    city: "Austin",
    county: "Travis",
    address: "612 Congress Ave",
    zip: "78701",
    typeName: "Mixed Beverage + Late Hours",
    archetype: "Full Cocktail Bar & Late-Night Venue",
    score: 94,
    lat: 30.2682,
    lng: -97.7429,
    dateLabel: "Sample",
    unlockHref: "/sample",
  },
  {
    id: 9003,
    state: "NY",
    eventType: "NEW_PENDING",
    displayName: "Baku Palace Lounge",
    locked: false,
    city: "Brooklyn",
    county: "Kings",
    address: "2001 Emmons Ave",
    zip: "11235",
    typeName: "On-Premises Restaurant Liquor",
    archetype: "Full-Liquor Restaurant & Bar",
    score: 86,
    lat: 40.5835,
    lng: -73.9478,
    dateLabel: "Sample",
    unlockHref: "/sample",
  },
  {
    id: 9004,
    state: "IL",
    eventType: "NEW_LICENSE",
    displayName: "Devil Dawgs / Sin & Tonic",
    locked: false,
    city: "Chicago",
    county: "West Loop",
    address: "5257 N Clark St",
    zip: "60640",
    typeName: "Tavern / Consumption on Premises",
    archetype: "Full Cocktail Bar & Late-Night Venue",
    score: 81,
    lat: 41.9776,
    lng: -87.6684,
    dateLabel: "Sample",
    unlockHref: "/sample",
  },
  {
    id: 9005,
    state: "WA",
    eventType: "NEW_LICENSE",
    displayName: "Ballard Craft Bottle Shop",
    locked: false,
    city: "Seattle",
    county: "King",
    address: "2003 Western Ave",
    zip: "98121",
    typeName: "Spirits / Beer / Wine Retail",
    archetype: "Liquor & Package Retail Store",
    score: 84,
    lat: 47.6104,
    lng: -122.3451,
    dateLabel: "Sample",
    unlockHref: "/sample",
  },
];

type SubscriberCtx = {
  unlocked: boolean;
  status: "active" | "trial" | null;
  plan: string | null;
  trialDaysLeft: number;
};

async function getSubscriberContext(
  email: string | undefined,
  token: string | undefined
): Promise<SubscriberCtx> {
  const cleanEmail = (email ?? "").trim().toLowerCase();
  if (!cleanEmail || !token || !verifyScopedToken(cleanEmail, token, "unlock")) {
    return { unlocked: false, status: null, plan: null, trialDaysLeft: 0 };
  }
  try {
    await ensureSchema();
    const subs = await db
      .select({
        status: subscribers.status,
        plan: subscribers.plan,
        trialEndsAt: subscribers.trialEndsAt,
      })
      .from(subscribers)
      .where(eq(subscribers.email, cleanEmail))
      .limit(1);
    const s = subs[0];
    if (!s) return { unlocked: false, status: null, plan: null, trialDaysLeft: 0 };
    if (s.status === "active") {
      return { unlocked: true, status: "active", plan: s.plan, trialDaysLeft: 0 };
    }
    if (s.status === "trial" && s.trialEndsAt && new Date(s.trialEndsAt).getTime() > Date.now()) {
      const daysLeft = Math.max(
        1,
        Math.ceil((new Date(s.trialEndsAt).getTime() - Date.now()) / 86_400_000)
      );
      return { unlocked: true, status: "trial", plan: s.plan, trialDaysLeft: daysLeft };
    }
    return { unlocked: false, status: null, plan: null, trialDaysLeft: 0 };
  } catch {
    return { unlocked: false, status: null, plan: null, trialDaysLeft: 0 };
  }
}

export default async function TerritoryMapPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; signal?: string; email?: string; token?: string }>;
}) {
  const { state, signal, email, token } = await searchParams;
  const upper = state?.toUpperCase();
  const cleanState = upper && LIVE_STATE_SET.has(upper) ? upper : undefined;
  const cleanEmail = (email ?? "").trim().toLowerCase();
  const subCtx = await getSubscriberContext(cleanEmail, token);
  const isSubscriberView = subCtx.unlocked;

  let pins: TerritoryPin[] = [];
  const cut = embargoCutoff();
  const recentCutoff = new Date(hoursAgoMs(45 * 24));

  try {
    await ensureSchema();
    const conds = [
      notLike(events.licenseKey, "TTB-%"),
      gt(events.occurredAt, recentCutoff),
      cleanState ? eq(events.state, cleanState) : inArray(events.state, LIVE_STATE_CODES),
    ];
    if (signal === "FILED") conds.push(eq(events.eventType, "NEW_PENDING"));
    if (signal === "ISSUED") conds.push(eq(events.eventType, "NEW_LICENSE"));

    const raw = await db
      .select()
      .from(events)
      .where(and(...conds))
      .orderBy(desc(events.occurredAt))
      .limit(240);

    // Deduplicate venues (prevents same store appearing twice) and rank highest-value bars FIRST!
    const bestByVenue = new Map<string, { e: (typeof raw)[number]; score: number }>();
    for (const e of raw) {
      if (isJunkEntity(e.tradeName, e.ownerName, e.typeName)) continue;
      const sc = scoreFiling({
        eventType: e.eventType,
        typeName: e.typeName,
        city: e.city,
        county: e.county,
        occurredAt: e.occurredAt,
        summary: e.summary,
      }).value;
      const dk = `${e.state}|${dedupeKey(e.tradeName ?? e.ownerName ?? e.summary, e.city)}`;
      const prev = bestByVenue.get(dk);
      if (!prev || sc > prev.score) {
        bestByVenue.set(dk, { e, score: sc });
      }
    }

    const rankedEntries = [...bestByVenue.values()]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ta = a.e.occurredAt ? new Date(a.e.occurredAt).getTime() : 0;
        const tb = b.e.occurredAt ? new Date(b.e.occurredAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 75);

    const cleanRows = rankedEntries.map((x) => x.e);
    const scoreById = new Map(rankedEntries.map((x) => [x.e.id, x.score]));

    const keys = cleanRows.map((e) => e.licenseKey).filter((k): k is string => Boolean(k));
    const licMap = new Map<
      string,
      { address: string | null; zip: string | null; lat: number | null; lng: number | null }
    >();
    if (keys.length) {
      const lics = await db
        .select({
          state: licenses.state,
          key: licenses.licenseKey,
          address: licenses.address,
          zip: licenses.zip,
          lat: licenses.lat,
          lng: licenses.lng,
        })
        .from(licenses)
        .where(
          and(
            cleanState ? eq(licenses.state, cleanState) : inArray(licenses.state, LIVE_STATE_CODES),
            inArray(licenses.licenseKey, keys)
          )
        );
      for (const l of lics) licMap.set(`${l.state}|${l.key}`, l);
    }

    pins = cleanRows.map((e) => {
      const locked =
        !isSubscriberView && Boolean(e.occurredAt && e.occurredAt.getTime() > cut.getTime());
      const lic = e.licenseKey ? licMap.get(`${e.state}|${e.licenseKey}`) : undefined;
      const meta = parseEventMeta(e.payload);
      const address = locked ? null : (lic?.address ?? meta.address ?? null);
      const zip = locked ? null : (lic?.zip ?? meta.zip ?? null);

      const cityKey = `${(e.city ?? "").toLowerCase().trim()},${e.state.toLowerCase()}`;
      const [jLat, jLng] = jitter(e.id);
      let lat = lic?.lat ?? null;
      let lng = lic?.lng ?? null;
      if (lat === null || lng === null) {
        const base = CITY_COORDS[cityKey] ?? STATE_CENTERS[e.state] ?? [39.5, -98.35];
        lat = base[0] + jLat;
        lng = base[1] + jLng;
      } else if (locked) {
        // Fuzz exact pin coordinates during 7-day embargo so public map doesn't reveal storefront.
        lat += jLat * 1.4;
        lng += jLng * 1.4;
      }

      const score = scoreById.get(e.id) ?? 50;

      const dossier = buildBeverageDossier({
        state: e.state,
        eventType: e.eventType,
        tradeName: e.tradeName,
        ownerName: e.ownerName,
        city: e.city,
        typeName: e.typeName,
        occurredAt: e.occurredAt,
      });

      const rawName = e.tradeName ?? e.ownerName ?? "New Venue";
      return {
        id: e.id,
        state: e.state,
        eventType: e.eventType,
        displayName: locked ? maskName(rawName) : rawName,
        locked,
        city: e.city,
        county: e.county,
        address,
        zip,
        typeName: e.typeName,
        archetype: dossier.archetype,
        estSpend: dossier.estAnnualSpend,
        score,
        lat,
        lng,
        dateLabel: e.occurredAt
          ? new Date(e.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "—",
        unlockHref: locked
          ? "/#pricing"
          : isSubscriberView
            ? filingUnlockUrl(e.id, cleanEmail)
            : `/feed/${e.id}`,
      };
    });
  } catch {
    pins = [];
  }

  const displayPins =
    pins.length > 0
      ? pins
      : cleanState
        ? SHOWCASE_PINS.filter((p) => p.state === cleanState)
        : SHOWCASE_PINS;

  const qs = (over: { state?: string; signal?: string }) => {
    const p = new URLSearchParams();
    const st = over.state ?? cleanState ?? "ALL";
    const sig = over.signal ?? signal ?? "ALL";
    if (st !== "ALL") p.set("state", st);
    if (sig !== "ALL") p.set("signal", sig);
    if (isSubscriberView && cleanEmail && token) {
      p.set("email", cleanEmail);
      p.set("token", token);
    }
    const str = p.toString();
    return `/map${str ? `?${str}` : ""}`;
  };

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-28">
        <p className="eyebrow">
          [ Live Territory Map &amp; Google Maps Route Planner · {LIVE_MARKETS.length} Markets ]
        </p>
        <h1 className="font-display mt-4 text-4xl font-medium sm:text-5xl">
          Plot every new bar. <span className="italic text-amber">Drive the route in 1 click.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          Check up to 8 new bar, restaurant, or liquor-store filings in your territory and launch a
          turn-by-turn multi-stop <span className="text-cream">Google Maps driving route</span>{" "}
          straight on your phone. Subscribers unlock same-day names and exact storefront pins.
        </p>

        {/* Filter bar */}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap rounded-md border border-line">
            {[
              { code: "ALL", label: "All Markets" },
              ...LIVE_MARKETS.map((m) => ({ code: m.code, label: m.name })),
            ].map((opt) => (
              <Link
                key={opt.code}
                href={qs({ state: opt.code })}
                className={`px-3 py-2 font-mono text-[11px] tracking-[0.08em] transition-colors ${
                  (cleanState ?? "ALL") === opt.code
                    ? "bg-amber/15 text-amber"
                    : "text-smoke hover:text-cream"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap rounded-md border border-line">
            {[
              ["ALL", "ALL SIGNALS"],
              ["FILED", "FILED"],
              ["ISSUED", "ISSUED"],
            ].map(([val, label]) => (
              <Link
                key={val}
                href={qs({ signal: val })}
                className={`px-3.5 py-2 font-mono text-[11px] tracking-[0.14em] transition-colors ${
                  (signal ?? "ALL") === val || (val === "ALL" && !signal)
                    ? "bg-panel2 text-amber"
                    : "text-smoke hover:text-cream"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Trial-to-Pro Conversion Strip OR Public Unlock CTA */}
        {subCtx.status === "trial" && cleanEmail ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber/45 bg-gradient-to-r from-amber/15 via-panel to-panel p-4">
            <div>
              <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-amber">
                ⏳ 7-DAY FREE TRIAL · {subCtx.trialDaysLeft} DAY
                {subCtx.trialDaysLeft === 1 ? "" : "S"} REMAINING
              </p>
              <p className="mt-1 text-sm text-cream/90">
                Lock in your{" "}
                <strong className="text-cream">
                  {cleanState ? stateFullName(cleanState) : "Multi-State"} Pro Seat ($249/mo · 3
                  States + Instant Slack Alerts)
                </strong>{" "}
                before our 5-seat cap fills.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={exportUrl(cleanEmail)}
                className="rounded-lg border border-line bg-ink px-3.5 py-2 font-mono text-[11px] text-cream/85 hover:border-amber/50 hover:text-amber"
              >
                DOWNLOAD CSV ↓
              </a>
              <a
                href={checkoutUpgradeUrl(cleanEmail, "pro")}
                className="rounded-lg bg-amber px-4 py-2 font-mono text-[11px] font-bold tracking-[0.1em] text-[#140b0e] hover:brightness-110"
              >
                UPGRADE TO PRO ($249/MO) →
              </a>
            </div>
          </div>
        ) : !isSubscriberView ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber/35 bg-amber/5 p-4">
            <p className="text-sm text-cream/85">
              <strong className="text-amber">Same-day venues are masked for public visitors.</strong>{" "}
              Start a free 7-day trial (no card) to unlock exact street addresses, LLCs, and
              multi-stop Google Maps routes instantly.
            </p>
            <Link
              href="/#pricing"
              className="shrink-0 rounded-lg bg-amber px-4 py-2 font-mono text-[11px] font-bold tracking-[0.1em] text-[#140b0e] hover:brightness-110"
            >
              UNLOCK FREE FOR 7 DAYS →
            </Link>
          </div>
        ) : null}

        <div className="mt-6">
          <TerritoryMap pins={displayPins} isSubscriberView={isSubscriberView} />
        </div>
      </div>
      <Footer />
    </main>
  );
}
