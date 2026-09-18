// Weekly self-care: compacts old debug data, trims logs, measures database
// size, and emails the owner if any government source is stale.
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { runMaintenance } from "@/lib/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const report = await runMaintenance();
  return Response.json({ ...report, ranAt: new Date().toISOString() });
}
