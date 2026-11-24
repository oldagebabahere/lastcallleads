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

const SITE_URL = "https://lastcallleads.com"; // No trailing slash
const CRON_SECRET = "replace-with-your-exact-vercel-cron-secret";
const EMAILS_PER_PULSE = 5; // 5 emails every 2h during US daytime = ~25-30 human-paced emails/day

// Self-healing HTTP helper: automatically retries once after 8s on transient 5xx/timeouts!
function callWithRetry(path) {
  const url = SITE_URL + path;
  const opts = {
    method: "get",
    headers: { Authorization: "Bearer " + CRON_SECRET },
    muteHttpExceptions: true,
  };
  let res = UrlFetchApp.fetch(url, opts);
  if (res.getResponseCode() >= 500) {
    Utilities.sleep(8000);
    res = UrlFetchApp.fetch(url, opts);
  }
  return res;
}

function sendOutreachPulse() {
  // Only fire during US business hours (13:00 - 23:00 UTC = 8 AM - 6 PM US Central)
  // so US beverage distributors see your email live in their workday inbox!
  const utcHour = new Date().getUTCHours();
  if (utcHour < 13 || utcHour > 23) {
    Logger.log("Outside US business hours (UTC " + utcHour + "), skipping pulse.");
    return;
  }

  const res = callWithRetry("/api/cron/outreach?limit=" + EMAILS_PER_PULSE);
  Logger.log("Outreach pulse (" + res.getResponseCode() + "): " + res.getContentText());
}

function dailyHeartbeatBackup() {
  const res = callWithRetry("/api/cron/daily");
  Logger.log("Daily backup heartbeat (" + res.getResponseCode() + "): " + res.getContentText());
}

// Self-healing watchdog: runs every 6 hours. If any government feed paused or went stale >30h,
// automatically triggers PourWatch self-healer (re-probe + Socrata catalog replacement)!
function healthWatchdog() {
  const res = callWithRetry("/api/health");
  const code = res.getResponseCode();
  const body = res.getContentText();
  Logger.log("Health check (" + code + "): " + body);

  try {
    const data = JSON.parse(body);
    if (data.pausedSources > 0) {
      const heal = callWithRetry("/api/cron/pourwatch?reprobe=all");
      Logger.log("Auto-healed paused feeds (" + heal.getResponseCode() + "): " + heal.getContentText());
    }
    if (typeof data.lastIngestHoursAgo === "number" && data.lastIngestHoursAgo >= 30) {
      const kick = callWithRetry("/api/cron/daily");
      Logger.log("Stale ingest auto-kick (" + kick.getResponseCode() + "): " + kick.getContentText());
    }
  } catch (e) {
    Logger.log("Health parse fallback: " + e);
  }
}

// Keeps all 9 live markets stocked with fresh craft breweries & beverage distributors automatically!
function harvestProspectsPulse() {
  const res = callWithRetry("/api/cron/prospects");
  Logger.log("Prospect harvest (" + res.getResponseCode() + "): " + res.getContentText());
}

// Run THIS function ONCE to activate 24/7 hands-free self-healing autopilot forever!
function installAutopilotTriggers() {
  // Remove any old duplicate triggers first
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));

  // 1) Staggered outreach pulse every 2 hours (human-paced deliverability!)
  ScriptApp.newTrigger("sendOutreachPulse").timeBased().everyHours(2).create();

  // 2) Self-healing health watchdog every 6 hours (auto-heals any broken government feed!)
  ScriptApp.newTrigger("healthWatchdog").timeBased().everyHours(6).create();

  // 3) Backup daily ingest + digest heartbeat every morning at 12:00 UTC
  ScriptApp.newTrigger("dailyHeartbeatBackup").timeBased().everyDays(1).atHour(12).create();

  // 4) Daily B2B buyer harvest (rotates across all 9 live states automatically)
  ScriptApp.newTrigger("harvestProspectsPulse").timeBased().everyDays(1).atHour(9).create();

  // 5) Run an immediate self-check + prospect harvest right now!
  healthWatchdog();
  harvestProspectsPulse();
  Logger.log("SELF-HEALING AUTOPILOT INSTALLED! Zero manual clicks needed.");
}
