// DISTRIBUTOR FINDER — turns the federal TTB wholesaler permit list that the
// site already ingests (licenses table, keys "TTB-…") into outreach prospects.
// TTB has no website/email, so each wholesaler's website is looked up once via
// the Brave Search API (free plan). Needs BRAVE_API_KEY; without it this does
// nothing and never throws. Rows are stored in `prospects` with category
// "distributor"; the outreach route builds info@<domain> from the website.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { licenses, prospects } from "@/db/schema";
import { and, eq, ilike, like, or } from "drizzle-orm";

// Directories / social sites are never a company's own website.
const BAD_HOSTS = [
  "facebook.", "linkedin.", "yelp.", "yellowpages.", "mapquest.", "bbb.org",
  "opencorporates.", "dnb.com", "zoominfo.", "bizapedia.", "manta.", "chamberofcommerce.",
  "instagram.", "twitter.", "x.com", "youtube.", "wikipedia.", "indeed.", "glassdoor.",
  "buzzfile.", "corporationwiki.", "dandb.", "alignable.", "cybo.", "mapquest.", "google.",
  "ttb.gov", "gov", "tripadvisor.", "amazon.", "ebay.", "pinterest.",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function nameToken(name: string): string | null {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !["distributing", "distributors", "distributor", "wholesale", "beverage",
          "beverages", "company", "corporation", "limited", "liquor", "wine", "spirits",
          "beer", "group", "brands", "imports", "importers"].includes(w)
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
    if (!host || host.endsWith(".ca")) continue;
    if (BAD_HOSTS.some((b) => host.includes(b))) continue;
    // The result must actually look like THIS company (avoid random sites).
    const hay = `${host} ${r.title ?? ""}`.toLowerCase();
    if (token1 && !hay.includes(token1)) continue;
    return `https://${host}`;
  }
  return null;
}

export async function harvestDistributors(
  state: string,
  maxLookups = 8
): Promise<{ ok: boolean; looked: number; found: number; error?: string }> {
  const token = process.env.BRAVE_API_KEY;
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
      // Always store (website may be null) so we never look the same one up twice.
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
      await new Promise((res) => setTimeout(res, 1_100)); // Brave free plan: 1 req/sec
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
