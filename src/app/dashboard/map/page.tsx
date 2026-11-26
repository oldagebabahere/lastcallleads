// MAP VIEW — every prospect pin on one map. Filter by state, click a pin for
// name + phone + website. /dashboard/map?key=...&state=TX
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { prospects } from "@/db/schema";
import { adminKeySet, isAdminKey } from "@/lib/auth";
import { isJunkProspect } from "@/lib/prospects";
import { LIVE_STATE_CODES } from "@/lib/states";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import ProspectMap, { type MapPin } from "@/components/prospect-map";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prospect Territory Map",
  robots: { index: false, follow: false },
};

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; state?: string }>;
}) {
  const { key, state } = await searchParams;

  if (!adminKeySet() || !isAdminKey(key ?? null)) {
    return (
      <main className="min-h-screen px-5 py-28">
        <form className="mx-auto max-w-xs space-y-3">
          <input name="key" placeholder="admin key" className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream" />
          <button className="w-full rounded-md bg-amber px-4 py-2 font-mono text-sm font-semibold tracking-[0.12em] text-ink">OPEN</button>
        </form>
      </main>
    );
  }

  await ensureSchema();
  const k = key!;
  const st = (state ?? "").trim().toUpperCase();
  const filter = /^[A-Z]{2}$/.test(st)
    ? and(isNotNull(prospects.lat), eq(prospects.state, st))
    : isNotNull(prospects.lat);

  const rows = await db
    .select()
    .from(prospects)
    .where(filter)
    .orderBy(desc(prospects.firstSeenAt))
    .limit(3000);

  const byState = await db
    .select({ state: prospects.state, n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(inArray(prospects.state, [...LIVE_STATE_CODES]))
    .groupBy(prospects.state)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const pins: MapPin[] = rows
    .filter((r) => r.lat !== null && r.lng !== null && !isJunkProspect(r.name, r.website, r.category))
    .map((r) => ({
      name: r.name,
      category: r.category,
      phone: r.phone,
      website: r.website,
      city: r.city,
      state: r.state,
      lat: r.lat as number,
      lng: r.lng as number,
    }));

  return (
    <main className="min-h-screen px-5 pb-20 pt-24">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">[ Prospect Map · {pins.length.toLocaleString()} verified buyers ]</p>
        <h1 className="font-display mt-4 text-3xl font-medium text-cream">
          B2B Buyer Territory Map {st ? `· ${st}` : ""}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cream/70">
          Craft breweries, beverage distributors, independent liquor insurance brokers &amp;
          hospitality attorneys — click any pin for phone &amp; website.
        </p>

        {/* state filter chips */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/dashboard/map?key=${k}`}
            className={`rounded-md border px-3 py-2 font-mono text-xs tracking-[0.12em] ${
              !st ? "border-amber/60 bg-amber/15 text-amber" : "border-line bg-panel text-cream/70 hover:text-cream"
            }`}
          >
            ALL
          </Link>
          {byState.map((s) => (
            <Link
              key={s.state}
              href={`/dashboard/map?key=${k}&state=${s.state}`}
              className={`rounded-md border px-3 py-2 font-mono text-xs tracking-[0.12em] ${
                st === s.state ? "border-amber/60 bg-amber/15 text-amber" : "border-line bg-panel text-cream/70 hover:text-cream"
              }`}
            >
              {s.state} · {s.n.toLocaleString()}
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <ProspectMap pins={pins} />
        </div>

        {pins.length === 0 && (
          <p className="mt-6 font-mono text-xs text-cream/70">
            No pins in this state yet — run the{" "}
            <Link href={`/dashboard/prospects?key=${k}`} className="text-amber hover:underline">
              PROSPECT FINDER
            </Link>{" "}
            harvest first.
          </p>
        )}

        <p className="mt-6 font-mono text-xs text-smoke">
          <Link href={`/dashboard?key=${k}`} className="text-amber hover:underline">← CONTROL ROOM</Link>
          {" · "}Data: OpenStreetMap (ODbL)
        </p>
      </div>
    </main>
  );
}
