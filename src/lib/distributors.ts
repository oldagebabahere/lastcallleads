// DISTRIBUTOR FINDER — turns federal TTB wholesaler permits into outreach
// prospects by looking up each wholesaler's official domain via Brave Search API.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { licenses, prospects } from "@/db/schema";
import { and, eq, ilike, like, or } from "drizzle-orm";

const BAD_DOMAINS = [
  "facebook.com", "linkedin.com", "yelp.com", "yellowpages.com", "mapquest.com",
  "bbb.org", "opencorporates.com", "dnb.com", "zoominfo.com", "bizapedia.com",
  "manta.com", "chamberofcommerce.com", "instagram.com", "twitter.com", "x.com",
  "youtube.com", "wikipedia.org", "indeed.com", "glassdoor.com", "buzzfile.com",
  "corporationwiki.com", "dandb.com", "alignable.com", "cybo.com", "google.com",
  "tripadvisor.com", "amazon.com", "ebay.com", "pinterest.com", "bloomberg.com",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isBadHost(host: string): boolean {
  if (
    host.endsWith(".gov") ||
    host.endsWith(".mil") ||
    host.endsWith(".edu") ||
    host.endsWith(".ca")
  ) {
    return true;
  }
  return BAD_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

function nameToken(name: string): string | null {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        ![
          "distributing", "distributors", "distributor", "wholesale", "beverage",
          "beverages", "company", "corporation", "limited", "liquor", "wine",
          "spirits", "beer", "group", "brands", "imports", "importers",
        ].includes(w)
    );
  return words[0] ?? null;
}

async function findWebsite(
  name: string,
  city: string | null,
  state: string,
  token: string
): Promise<string | null> {
  const q = `${name} ${city ?? ""} ${state} beverage wholesale distributor`;
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6&country=us`,
    {
      headers: { Accept: "application/json", "X-Subscription-Token": token },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    web?: { results?: { url?: string; title?: string }[] };
  };
  const token1 = nameToken(name);
  for (const r of data.web?.results ?? []) {
    if (!r.url) continue;
    const host = hostOf(r.url);
    if (!host || isBadHost(host)) continue;
    const hay = `${host} ${r.title ?? ""}`.toLowerCase();
    if (token1 && !hay.includes(token1)) continue;
    return `https://${host}`;
  }
  return null;
}

export async function harvestDistributors(
  state: string,
  maxLookups = 5
): Promise<{ ok: boolean; looked: number; found: number; error?: string }> {
  const token = process.env.BRAVE_API_KEY?.trim();
  if (!token) return { ok: false, looked: 0, found: 0, error: "BRAVE_API_KEY missing" };
  try {
    await ensureSchema();
    const st = state.toUpperCase();

    const done = new Set(
      (
        await db
          .select({ k: prospects.osmKey })
          .from(prospects)
          .where(and(eq(prospects.state, st), eq(prospects.category, "distributor")))
      ).map((r) => r.k)
    );

    const rows = await db
      .select({
        key: licenses.licenseKey,
        trade: licenses.tradeName,
        owner: licenses.ownerName,
        address: licenses.address,
        city: licenses.city,
      })
      .from(licenses)
      .where(
        and(
          eq(licenses.state, st),
          like(licenses.licenseKey, "TTB-%"),
          or(
            ilike(licenses.typeName, "%wholesal%"),
            ilike(licenses.typeName, "%distribut%")
          )
        )
      )
      .limit(2000);

    let looked = 0;
    let found = 0;
    for (const r of rows) {
      if (looked >= maxLookups) break;
      const osmKey = `ttb/${r.key}`;
      if (done.has(osmKey)) continue;
      const name = (r.trade ?? r.owner ?? "").trim();
      if (name.length < 3) continue;
      looked++;
      let website: string | null = null;
      try {
        website = await findWebsite(name, r.city, st, token);
      } catch {
        website = null;
      }
      if (website) found++;
      await db
        .insert(prospects)
        .values({
          category: "distributor",
          osmKey,
          name,
          phone: null,
          website,
          address: r.address,
          city: r.city,
          state: st,
          lat: null,
          lng: null,
        })
        .onConflictDoNothing();
      await new Promise((res) => setTimeout(res, 1_100));
    }
    return { ok: true, looked, found };
  } catch (err) {
    return {
      ok: false,
      looked: 0,
      found: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
