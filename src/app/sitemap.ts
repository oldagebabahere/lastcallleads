import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { ensureSchema } from "@/db/bootstrap";
import { db } from "@/db";
import { desc, eq, notIlike, sql } from "drizzle-orm";
import { events, licenses } from "@/db/schema";
import { citySlug } from "@/lib/queries";
import { GUIDE_SLUGS } from "@/app/guides/content";
import { TYPE_SLUGS } from "@/lib/license-types";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/feed`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/snapshot`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/refer`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/refunds`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/types`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...TYPE_SLUGS.map((s) => ({
      url: `${base}/types/${s}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${base}/reports`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/reports/texas-weekly-liquor-filings`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/reports/new-york-weekly-liquor-filings`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/insights`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/insights/texas`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/insights/new-york`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/states/texas`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/states/new-york`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/states/missouri`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/states/colorado`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/states/connecticut`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/states/washington`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/states/illinois`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/states/oregon`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/states/maryland`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/states/california`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...GUIDE_SLUGS.map((g) => ({
      url: `${base}/guides/${g}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  // Programmatic pages: every city with filings + recent individual filings.
  // Read the licence register (covers every state, including ones with no
  // recent events) and top up from events if needed.
  try {
    await ensureSchema();
    let cities = await db
      .select({
        city: licenses.city,
        state: licenses.state,
        n: sql<number>`count(*)::int`,
      })
      .from(licenses)
      .where(notIlike(licenses.city, ""))
      .groupBy(licenses.city, licenses.state)
      .orderBy(desc(sql`count(*)`))
      .limit(2000);

    if (cities.length === 0) {
      cities = await db
        .select({
          city: events.city,
          state: events.state,
          n: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(notIlike(events.city, ""))
        .groupBy(events.city, events.state)
        .orderBy(desc(sql`count(*)`))
        .limit(2000);
    }

    const seen = new Set<string>();
    for (const c of cities) {
      if (!c.city) continue;
      const slug = citySlug(c.city, c.state);
      if (seen.has(slug)) continue;
      seen.add(slug);
      entries.push({
        url: `${base}/cities/${slug}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }

    // Cities directory index (auto-routes to /cities).
    entries.push({
      url: `${base}/cities`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    });

    // Coverage page — live state/city totals.
    entries.push({
      url: `${base}/coverage`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    });

    // Sample digest preview — high-conversion page for prospects.
    entries.push({
      url: `${base}/sample`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    });

    const recent = await db
      .select({ id: events.id, occurredAt: events.occurredAt })
      .from(events)
      .orderBy(desc(events.occurredAt))
      .limit(150);
    for (const e of recent) {
      entries.push({
        url: `${base}/feed/${e.id}`,
        lastModified: e.occurredAt ?? now,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch {
    // sitemap still ships the static shell if the DB is unreachable
  }

  return entries;
}
