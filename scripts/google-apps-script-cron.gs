/**
 * Last Call Leads — 100% FREE 24/7 Google Cloud Autopilot Trigger
 *
 * WHY THIS IS BETTER THAN SENDING EMAILS VIA APPS SCRIPT MailApp:
 *   - Sending cold emails directly via Gmail `MailApp.sendEmail` risks suspending
 *     your entire Google account (Gmail + Drive).
 *   - Instead, this script ONLY runs as a 100% FREE, rock-solid Google Cloud Timer
 *     (runs 24/7/365 even when your phone & laptop are completely OFF!) and pings
 *     your Vercel app's own multi-account rotating outreach & daily cron endpoints.
 *
 * 60-SECOND ONE-TIME SETUP (DO IT ONCE, NEVER TOUCH AGAIN):
 *   1. Open https://script.google.com -> Click "New project"
 *   2. Delete the empty function and paste this entire file.
 *   3. Replace SITE_URL and CRON_SECRET below with your real Vercel values.
 *   4. Select `installAutopilotTriggers` from the top dropdown -> Click "Run" once
 *      -> Approve permissions -> DONE FOREVER!
 */

const SITE_URL = "https://your-domain.com"; // No trailing slash
const CRON_SECRET = "replace-with-your-exact-vercel-cron-secret";
const EMAILS_PER_PULSE = 5; // 5 emails every 2h during US daytime = ~25-30 human-paced emails/day

function sendOutreachPulse() {
  // Only fire during US business hours (13:00 - 23:00 UTC = 8 AM - 6 PM US Central)
  // so US beverage distributors see your email live in their workday inbox!
  const utcHour = new Date().getUTCHours();
  if (utcHour < 13 || utcHour > 23) {
    Logger.log("Outside US business hours (UTC " + utcHour + "), skipping pulse.");
    return;
  }

  const res = UrlFetchApp.fetch(
    SITE_URL + "/api/cron/outreach?limit=" + EMAILS_PER_PULSE,
    {
      method: "get",
      headers: { Authorization: "Bearer " + CRON_SECRET },
      muteHttpExceptions: true,
    }
  );
  Logger.log("Outreach pulse (" + res.getResponseCode() + "): " + res.getContentText());
}

function dailyHeartbeatBackup() {
  const res = UrlFetchApp.fetch(SITE_URL + "/api/cron/daily", {
    method: "get",
    headers: { Authorization: "Bearer " + CRON_SECRET },
    muteHttpExceptions: true,
  });
  Logger.log("Daily backup heartbeat (" + res.getResponseCode() + "): " + res.getContentText());
}

// Run THIS function ONCE to activate 24/7 hands-free cloud autopilot forever!
function installAutopilotTriggers() {
  // Remove any old duplicate triggers first
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));

  // 1) Staggered outreach pulse every 2 hours (human-paced deliverability!)
  ScriptApp.newTrigger("sendOutreachPulse").timeBased().everyHours(2).create();

  // 2) Backup daily ingest + digest heartbeat every morning at 12:00 UTC
  ScriptApp.newTrigger("dailyHeartbeatBackup").timeBased().everyDays(1).atHour(12).create();

  // 3) Run an immediate initial pull right now so your database populates instantly!
  dailyHeartbeatBackup();
  Logger.log("AUTOPILOT INSTALLED SUCCESSFULLY! You never need to click any dashboard button.");
}
