// Live RSS / Atom XML feed for search engines, feed aggregators, and
// automated crawlers. Googlebot consumes RSS feeds for instant discovery
// of newly added public filings without waiting for full crawls.
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { siteUrl } from "@/lib/site";
import { maskName } from "@/lib/queries";

export const dynamic = "force-dynamic";

function escapeXml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = siteUrl();
  await ensureSchema();

  let rows: (typeof events.$inferSelect)[] = [];
  try {
    rows = await db
      .select()
      .from(events)
      .orderBy(desc(events.occurredAt))
      .limit(60);
  } catch {
    // fallback to empty feed
  }

  const itemsXml = rows
    .map((e) => {
      const isPending = e.eventType === "NEW_PENDING";
      const title = `${isPending ? "Application Filed" : "License Issued"}: ${maskName(e.tradeName ?? e.ownerName ?? "Applicant")} (${e.city ?? e.state})`;
      const link = `${base}/feed/${e.id}`;
      const pubDate = e.occurredAt ? new Date(e.occurredAt).toUTCString() : new Date().toUTCString();
      const desc = escapeXml(
        `${e.summary} — License Type: ${e.typeName ?? "Liquor License"} in ${e.county ?? e.city ?? e.state}. Monitored daily by ${BRAND.name}.`
      );

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${desc}</description>
      <category>${e.state}</category>
      <category>${escapeXml(e.typeName ?? "Liquor License")}</category>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(BRAND.name)} — Live Liquor License Filings Feed</title>
    <link>${base}</link>
    <description>Daily public record feed of newly filed liquor license applications and newly issued licenses in Texas and New York.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800, s-maxage=3600",
    },
  });
}
