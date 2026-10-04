// One-shot local harness for the social auto-post path (NOT part of the app):
//   1. fake Zapier webhooks on localhost — X + LinkedIn configured, Pinterest not
//   2. seed this-week events + an unlocked showcase venue
//   3. buildSocialPost() -> assert webhooks fired with right payloads
//   4. run again same day -> assert dedupe (no double post)
import http from "node:http";
import { buildSocialPost } from "@/lib/owner-tasks";
import { ensureSchema } from "@/db/bootstrap";
import { db } from "@/db";
import { emailLog, events } from "@/db/schema";
import { sql } from "drizzle-orm";

const hits: { url: string; body: { text?: string; link?: string; image_url?: string } }[] = [];
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    hits.push({ url: req.url ?? "", body: raw ? JSON.parse(raw) : {} });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"status":"success"}');
  });
});

async function main() {
  await ensureSchema();
  await db
    .delete(emailLog)
    .where(sql`subject LIKE '✓ Posted to%' OR subject LIKE 'Social post ready%'`);
  await db.delete(events).where(sql`trade_name LIKE 'TEST AUTO%'`);
  await db.insert(events).values([
    { state: "TX", eventType: "NEW_PENDING", tradeName: "TEST AUTO VENUE", city: "Austin", occurredAt: new Date(), detectedAt: new Date(), summary: "test" },
    { state: "TX", eventType: "NEW_PENDING", tradeName: "TEST AUTO VENUE 2", city: "Austin", occurredAt: new Date(), detectedAt: new Date(Date.now() - 86_400_000), summary: "test" },
    { state: "NY", eventType: "NEW_PENDING", tradeName: "TEST AUTO VENUE 3", city: "Buffalo", occurredAt: new Date(), detectedAt: new Date(), summary: "test" },
    { state: "CA", eventType: "NEW_LICENSE", tradeName: "TEST SHOWCASE OLD", city: "Fresno", occurredAt: new Date(Date.now() - 12 * 86_400_000), detectedAt: new Date(), summary: "test" },
  ]);

  await new Promise<void>((r) => server.listen(9099, "127.0.0.1", r));
  process.env.ZAPIER_X_WEBHOOK_URL = "http://127.0.0.1:9099/hook/x";
  process.env.ZAPIER_LINKEDIN_WEBHOOK_URL = "http://127.0.0.1:9099/hook/linkedin";
  delete process.env.ZAPIER_PINTEREST_WEBHOOK_URL;
  process.env.OPS_EMAIL = "ops@test.local";

  const r1 = await buildSocialPost();
  console.log("RUN1:", JSON.stringify(r1));
  const r2 = await buildSocialPost();
  console.log("RUN2:", JSON.stringify(r2));
  server.close();

  const logs = await db
    .select({ subject: emailLog.subject, status: emailLog.status, detail: emailLog.detail })
    .from(emailLog)
    .where(sql`subject LIKE '✓ Posted to%' OR subject LIKE 'Social post ready%'`);
  console.log("EMAIL_LOG:", JSON.stringify(logs, null, 1));

  const errs: string[] = [];
  const xHit = hits.find((h) => h.url === "/hook/x");
  const liHit = hits.find((h) => h.url === "/hook/linkedin");
  if (hits.length !== 2) errs.push(`expected 2 webhook hits, got ${hits.length}: ${hits.map((h) => h.url).join(",")}`);
  if (!xHit?.body.text || !xHit.body.text.includes("liquor filings")) errs.push("x payload text missing");
  if (!xHit?.body.link) errs.push("x payload link missing");
  if (!liHit?.body.text || !liHit.body.text.includes("NEW BARS")) errs.push("linkedin payload text missing");
  if (!liHit?.body.text || !liHit.body.text.includes("TEST SHOWCASE OLD")) errs.push("linkedin showcase venue missing");
  if (!liHit?.body.image_url || !liHit.body.image_url.includes("og.png")) errs.push("image_url missing from payload");
  if (JSON.stringify(r1.posted) !== JSON.stringify(["x", "linkedin"])) errs.push("r1.posted wrong: " + JSON.stringify(r1.posted));
  if (r1.detail.indexOf("auto: x,linkedin") === -1) errs.push("r1.detail wrong: " + r1.detail);
  if (r2.detail.indexOf("dedupe") === -1) errs.push("r2 not deduped: " + r2.detail);
  if (hits.length !== 2) errs.push("webhook fired twice — dedupe leak");
  if (!logs.some((l) => l.subject.startsWith("✓ Posted to X —"))) errs.push("no X posted log row");
  if (!logs.some((l) => l.subject.startsWith("✓ Posted to LinkedIn —"))) errs.push("no LinkedIn posted log row");
  if (logs.some((l) => l.subject.startsWith("✓ Posted to Pinterest"))) errs.push("unexpected Pinterest post");
  if (!logs.some((l) => l.subject.startsWith("✓ Posted to X + LinkedIn"))) errs.push("no confirmation email row");

  if (errs.length) {
    console.error("FAIL:\n" + errs.join("\n"));
    process.exit(1);
  }
  console.log("ALL ASSERTIONS PASSED — webhooks fired, payloads correct, dedupe works, log rows correct");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
