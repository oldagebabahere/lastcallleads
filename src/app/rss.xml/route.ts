// Live RSS / Atom XML feed for search engines, feed aggregators, and
// automated crawlers. Always enforces the 7-day embargo on names & summaries.
import { desc, notLike } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { siteUrl } from "@/lib/site";
import { embargoCutoff, maskName } from "@/lib/queries";
import { isJunkEntity } from "@/lib/lead-score";

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

  let rows: (typeof events.$inferSelect)[] = [];
  try {
    await ensureSchema();
    const raw = await db
      .select()
      .from(events)
      .where(notLike(events.licenseKey, "TTB-%"))
      .orderBy(desc(events.occurredAt))
      .limit(90);
    rows = raw
      .filter((e) => !isJunkEntity(e.tradeName, e.ownerName, e.typeName))
      .slice(0, 60);
  } catch {
    rows = [];
  }

  const cut = embargoCutoff();

  const itemsXml = rows
    .map((e) => {
      const isPending = e.eventType === "NEW_PENDING";
      const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
      const rawName = e.tradeName ?? e.ownerName ?? "Applicant";
      const safeName = locked ? maskName(rawName) : rawName;
      const loc = [e.city, e.state].filter(Boolean).join(", ");
      const verb = isPending
        ? "Application Filed"
        : e.eventType === "STATUS_CHANGE"
          ? "Status Updated"
          : "License Issued";

      const title = `${verb}: ${safeName}${loc ? ` (${loc})` : ""}`;
      const link = `${base}/feed/${e.id}`;
      const pubDate = e.occurredAt
        ? new Date(e.occurredAt).toUTCString()
        : new Date().toUTCString();

      // Never leak raw e.summary during the 7-day member embargo!
      const summaryText = locked
        ? `${verb} — ${safeName} (${loc || e.state}). License Type: ${e.typeName ?? "Liquor License"}. Full venue name unlocks after 7 days (same-morning for members).`
        : `${e.summary} — License Type: ${e.typeName ?? "Liquor License"} in ${e.county ?? e.city ?? e.state}. Monitored daily by ${BRAND.name}.`;

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(summaryText)}</description>
      <category>${escapeXml(e.state)}</category>
      <category>${escapeXml(e.typeName ?? "Liquor License")}</category>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(BRAND.name)} — Live Liquor License Filings Feed</title>
    <link>${base}</link>
    <description>Daily intelligence feed of newly filed liquor license applications and newly issued licenses across covered US states.</description>
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
