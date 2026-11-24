import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  getOutreachSmtpAccounts,
  isAutoOutreachActive,
  isMailTransportConfigured,
} from "@/lib/mailer";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
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
      outreachActive: isAutoOutreachActive(),
      outreachAccounts,
      telegramReady: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()),
      linkedinReady: Boolean(process.env.LINKEDIN_ACCESS_TOKEN?.trim()),
      missingRecommended: missing,
    },
    { status }
  );
}
