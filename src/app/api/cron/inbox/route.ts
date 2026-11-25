// Fast Multi-Inbox -> Telegram Reply Sync Endpoint.
// Checks all configured Gmail mailboxes (primary + outreach pool) via IMAP
// and forwards any real human replies or new conversations straight to Telegram!
import { cronAuthorized } from "@/lib/auth";
import { syncInboundRepliesToTelegram } from "@/lib/imap-inbox-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const report = await syncInboundRepliesToTelegram();
  return Response.json({ ranAt: new Date().toISOString(), ...report });
}
