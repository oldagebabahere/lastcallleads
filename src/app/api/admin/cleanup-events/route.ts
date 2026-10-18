// One-time cleanup: removes the bulk-imported federal (TTB) rows that an
// earlier version of the importer logged as "new license" events. They made
// the feed, the digest and the CSV look like tens of thousands of brand-new
// licenses. The licence records themselves are NOT touched (the wholesaler
// list used for distributor outreach stays).
//   /api/admin/cleanup-events?key=ADMIN_KEY           -> only counts (safe)
//   /api/admin/cleanup-events?key=ADMIN_KEY&go=1      -> deletes in batches
// If "remaining" is above 0 after a delete run, just open the link again.
import { inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import { isAdminKey } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function countTtb(): Promise<number> {
  const row = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .where(like(events.licenseKey, "TTB-%"));
  return Number(row[0]?.n ?? 0);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isAdminKey(url.searchParams.get("key"))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  if (url.searchParams.get("go") !== "1") {
    return Response.json({ ok: true, mode: "count-only", wouldDelete: await countTtb() });
  }

  const started = Date.now();
  let deleted = 0;
  // Batches of 5,000, stop before the time limit; re-open the link to continue.
  while (Date.now() - started < 40_000) {
    const ids = await db
      .select({ id: events.id })
      .from(events)
      .where(like(events.licenseKey, "TTB-%"))
      .limit(5000);
    if (!ids.length) break;
    await db.delete(events).where(
      inArray(
        events.id,
        ids.map((r) => r.id)
      )
    );
    deleted += ids.length;
  }
  return Response.json({ ok: true, mode: "deleted", deleted, remaining: await countTtb() });
}
