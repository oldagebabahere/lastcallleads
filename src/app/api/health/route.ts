import { db } from "@/db";
import { sourceHealth } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { cronAuthorized } from "@/lib/auth";
import { dodoConfigured } from "@/lib/dodo";
import { syncInboundRepliesToTelegram } from "@/lib/imap-inbox-sync";
import { ALL_STATE_SOURCES } from "@/lib/ingest-aggregator";
import {
  getOutreachSmtpAccounts,
  isAutoOutreachActive,
  isMailTransportConfigured,
} from "@/lib/mailer";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let dbOk = false;
  let pausedSources = 0;
  let lastIngestHoursAgo: number | null = null;
  const activeLabels = ALL_STATE_SOURCES.map((s) => s.label);
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
    const [pausedRow, latestRow] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(sourceHealth)
        .where(
          and(
            eq(sourceHealth.status, "paused"),
            inArray(sourceHealth.source, activeLabels)
          )
        )
        .catch(() => [{ n: 0 }]),
      db
        .select({ lastOk: sql<Date | string | null>`max(${sourceHealth.lastOkAt})` })
        .from(sourceHealth)
        .where(inArray(sourceHealth.source, activeLabels))
        .catch(() => [{ lastOk: null }]),
    ]);
    pausedSources = pausedRow[0]?.n ?? 0;
    if (latestRow[0]?.lastOk) {
      lastIngestHoursAgo = Math.max(
        0,
        Math.round((Date.now() - new Date(latestRow[0].lastOk).getTime()) / 3_600_000)
      );
    }
  } catch {
    dbOk = false;
  }

  const mailReady = isMailTransportConfigured();
  const outreachAccounts = getOutreachSmtpAccounts().length + (process.env.RESEND_API_KEY?.trim() ? 1 : 0);
  const missing: string[] = [];
  if (!dbOk) missing.push("DATABASE_URL");
  if (!mailReady) missing.push("RESEND_API_KEY or SMTP_USER+SMTP_PASS");
  if (!PUBLIC_CONFIG.postalAddress) missing.push("NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS");

  // When pinged by the authenticated Google Apps Script watchdog, also sync Gmail replies -> Telegram!
  const inboxSync =
    dbOk && cronAuthorized(req)
      ? await syncInboundRepliesToTelegram().catch(() => null)
      : null;

  const status = dbOk ? 200 : 500;
  return Response.json(
    {
      ok: dbOk,
      db: dbOk ? "connected" : "error",
      mailReady,
      mailMode: process.env.RESEND_API_KEY?.trim()
        ? process.env.SMTP_USER?.trim()
          ? "resend+smtp_failover"
          : "resend"
        : process.env.SMTP_USER?.trim()
          ? "smtp"
          : "dry_run",
      dodoReady: dodoConfigured(),
      pausedSources,
      lastIngestHoursAgo,
      outreachActive: isAutoOutreachActive(),
      outreachAccounts,
      telegramReady: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()),
      linkedinReady: Boolean(process.env.LINKEDIN_ACCESS_TOKEN?.trim()),
      ...(inboxSync ? { inboxSync } : {}),
      missingRecommended: missing,
    },
    { status }
  );
}
