// Runs automatically after the daily pull. Sends one tidy email per active
// subscriber containing only what is new since their last email.
import { ensureSchema } from "@/db/bootstrap";
import { cronAuthorized } from "@/lib/auth";
import { runDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const report = await runDigest();
  return Response.json({ ...report, ranAt: new Date().toISOString() });
}
