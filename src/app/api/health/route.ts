import { db } from "@/db";
import { sourceHealth } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { dodoConfigured } from "@/lib/dodo";
import {
  getOutreachSmtpAccounts,
  isAutoOutreachActive,
  isMailTransportConfigured,
} from "@/lib/mailer";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  let pausedSources = 0;
  let lastIngestHoursAgo: number | null = null;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
    const [pausedRow, latestRow] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(sourceHealth)
        .where(eq(sourceHealth.status, "paused"))
        .catch(() => [{ n: 0 }]),
      db
        .select({ lastOk: sql<Date | string | null>`max(${sourceHealth.lastOkAt})` })
        .from(sourceHealth)
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
      missingRecommended: missing,
    },
    { status }
  );
}
