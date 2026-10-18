// One-time cleanup: removes the bulk-imported federal (TTB) rows that an
// earlier version of the importer logged as "new license" events. They made
// the feed, the digest and the CSV look like thousands of brand-new licenses.
//   /api/admin/cleanup-events?key=ADMIN_KEY           -> only counts (safe)
//   /api/admin/cleanup-events?key=ADMIN_KEY&go=1      -> deletes them
import { like, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import { isAdminKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isAdminKey(url.searchParams.get("key"))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const row = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .where(like(events.licenseKey, "TTB-%"));
  const found = Number(row[0]?.n ?? 0);
  if (url.searchParams.get("go") !== "1") {
    return Response.json({ ok: true, mode: "count-only", wouldDelete: found });
  }
  await db.delete(events).where(like(events.licenseKey, "TTB-%"));
  return Response.json({ ok: true, mode: "deleted", deleted: found });
}
