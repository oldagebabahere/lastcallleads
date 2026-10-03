// Monthly value recap: shows active customers what Last Call Leads watched
// for them this month. Retention tool, not a daily alert.
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { runMonthlyRecaps } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const report = await runMonthlyRecaps();
  return Response.json({ ...report, ranAt: new Date().toISOString() });
}
