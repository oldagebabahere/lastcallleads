import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { ensureSchema } from "@/db/bootstrap";
import { db } from "@/db";
import { desc, notIlike, sql } from "drizzle-orm";
import { events, licenses } from "@/db/schema";
import { citySlug } from "@/lib/queries";
import { GUIDE_SLUGS } from "@/app/guides/content";
import { TYPE_SLUGS } from "@/lib/license-types";
import { LIVE_MARKETS, LIVE_STATE_CODES } from "@/lib/states";
import { VERTICAL_SLUGS } from "@/lib/verticals";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/feed`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/datasets`, lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: `${base}/map`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/coverage`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/sample`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/snapshot`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/cities`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/reports`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${base}/insights`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/types`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/refer`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/partner`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/refunds`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    // 6 High-Intent B2B Buyer Vertical Landing Pages
    ...VERTICAL_SLUGS.map((role) => ({
      url: `${base}/for/${role}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    // All 9 Live State Coverage Pages
    ...LIVE_MARKETS.map((m) => ({
      url: `${base}/states/${m.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: m.code === "TX" || m.code === "NY" || m.code === "CA" ? 0.9 : 0.85,
    })),
    // All 9 Weekly Pipeline Reports
    ...LIVE_MARKETS.map((m) => ({
      url: `${base}/reports/${m.slug}-weekly-liquor-filings`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    // All 9 Live Data Desks
    ...LIVE_MARKETS.map((m) => ({
      url: `${base}/insights/${m.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    // Texas License Code Explainers
    ...TYPE_SLUGS.map((s) => ({
      url: `${base}/types/${s}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Evergreen Industry Guides
    ...GUIDE_SLUGS.map((g) => ({
      url: `${base}/guides/${g}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  try {
    await ensureSchema();
    let cities = await db
      .select({
        city: licenses.city,
        state: licenses.state,
        n: sql<number>`count(*)::int`,
      })
      .from(licenses)
      .where(sql`${licenses.city} IS NOT NULL AND ${licenses.city} <> ''`)
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

    const liveSet = new Set<string>(LIVE_STATE_CODES);
    const seen = new Set<string>();
    for (const c of cities) {
      if (!c.city || !liveSet.has(c.state)) continue;
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

    const recent = await db
      .select({ id: events.id, occurredAt: events.occurredAt })
      .from(events)
      .where(
        sql`${events.state} IN (${sql.join(LIVE_STATE_CODES.map((s) => sql`${s}`), sql`, `)}) AND coalesce(${events.licenseKey}, '') NOT LIKE 'TTB-%'`
      )
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
    // sitemap still ships the full static + vertical + 9-state + 9-report shell
  }

  return entries;
}
