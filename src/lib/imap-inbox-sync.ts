// Multi-Inbox Gmail IMAP -> Instant Telegram Reply & Conversation Forwarder.
// Watches ALL configured Gmail mailboxes (primary support + all outreach accounts):
//   1) Detects any real human reply (B2B prospects, press like Neil Fox, or customers)
//      while ignoring our own warm-up ring, newsletters, bounces, and system alerts.
//   2) Automatically pauses scheduled Day-3 / Day-7 follow-ups in `outreach_sent`
//      the moment a prospect replies (so the bot never interrupts a live human chat!).
//   3) Mirrors the full reply straight to the owner's Telegram Bot AND saves it to
//      `contact_messages` (Control Room Contact Inbox) with strict Message-ID dedupe.
import tls from "node:tls";
import { and, desc, eq, ilike, inArray, isNotNull, like, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { contactMessages, emailLog, licenses, outreachSent, subscribers } from "@/db/schema";
import { BRAND } from "./brand";
import { mapLimit } from "./email-finder";
import {
  getOutreachSmtpAccounts,
  getPrimarySmtpAccount,
  sendViaSmtpAccount,
  type SmtpAccount,
} from "./mailer";
import { sendTelegramOwner } from "./notify";
import { PUBLIC_CONFIG } from "./public-config";
import { stateFullName } from "./states";
import { prefsUrl, scopedToken, unsubscribeUrls } from "./unsubscribe";

const WATCHER_BOOT_MARKER = "imap-watcher@lastcallleads.internal";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function imapQuote(val: string): string {
  return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatImapDate(d: Date): string {
  return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

function decodeMimeWords(str: string): string {
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_all, charset, enc, body) => {
    try {
      const cs = String(charset).toLowerCase().includes("utf") ? "utf8" : "latin1";
      if (String(enc).toUpperCase() === "B") {
        return Buffer.from(body, "base64").toString(cs);
      }
      const q = String(body).replace(/_/g, " ");
      return decodeQuotedPrintable(q, cs);
    } catch {
      return body;
    }
  });
}

function decodeQuotedPrintable(input: string, encoding: BufferEncoding = "utf8"): string {
  const softStripped = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < softStripped.length; i++) {
    if (
      softStripped[i] === "=" &&
      i + 2 < softStripped.length &&
      /^[0-9A-Fa-f]{2}$/.test(softStripped.slice(i + 1, i + 3))
    ) {
      bytes.push(parseInt(softStripped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(softStripped.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString(encoding);
}

function parseHeaders(rawHeaderBlock: string): Map<string, string> {
  const unfolded = rawHeaderBlock.replace(/\r?\n[ \t]+/g, " ");
  const map = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const val = line.slice(colon + 1).trim();
    if (!map.has(key)) map.set(key, val);
  }
  return map;
}

function parseFromHeader(raw: string): { name: string; email: string } {
  const decoded = decodeMimeWords(raw).trim();
  const angle = decoded.match(/^(.*?)<([^<>@\s]+@[^<>@\s]+)>/);
  if (angle) {
    const cleanName = angle[1].trim().replace(/^["']|["']$/g, "").trim();
    return { name: cleanName, email: angle[2].trim().toLowerCase() };
  }
  const plain = decoded.match(/([^\s<>@]+@[^\s<>@]+)/);
  if (plain) {
    return { name: "", email: plain[1].trim().toLowerCase() };
  }
  return { name: "", email: "" };
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMimePlainText(rawMessage: string): string {
  const splitMatch = rawMessage.match(/\r?\n\r?\n/);
  if (!splitMatch || splitMatch.index === undefined) return rawMessage.trim();

  const headerBlock = rawMessage.slice(0, splitMatch.index);
  const bodyBlock = rawMessage.slice(splitMatch.index + splitMatch[0].length);
  const headers = parseHeaders(headerBlock);
  const ct = headers.get("content-type") ?? "text/plain";
  const cte = (headers.get("content-transfer-encoding") ?? "").toLowerCase();

  const boundaryMatch = ct.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const parts = bodyBlock.split(`--${boundary}`);
    let htmlFallback = "";
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith("--")) break;
      const trimmedPart = part.replace(/^\r?\n/, "");
      const subSplit = trimmedPart.match(/\r?\n\r?\n/);
      if (!subSplit || subSplit.index === undefined) continue;
      const subHeaders = parseHeaders(trimmedPart.slice(0, subSplit.index));
      const subCt = (subHeaders.get("content-type") ?? "text/plain").toLowerCase();
      if (subCt.startsWith("multipart/")) {
        const nested = extractMimePlainText(trimmedPart);
        if (nested) return nested;
      } else if (subCt.startsWith("text/plain")) {
        const decoded = extractMimePlainText(trimmedPart);
        if (decoded) return decoded;
      } else if (subCt.startsWith("text/html") && !htmlFallback) {
        htmlFallback = extractMimePlainText(trimmedPart);
      }
    }
    return htmlFallback;
  }

  let decoded = bodyBlock;
  if (cte.includes("base64")) {
    try {
      decoded = Buffer.from(bodyBlock.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      decoded = bodyBlock;
    }
  } else if (cte.includes("quoted-printable")) {
    decoded = decodeQuotedPrintable(bodyBlock, "utf8");
  }

  if (ct.toLowerCase().includes("text/html")) {
    return htmlToPlain(decoded);
  }
  return decoded.trim();
}

function stripQuotedReplyHistory(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /^On .+ wrote:$/i.test(trimmed) ||
      /^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed) ||
      /^From:\s+.+@/i.test(trimmed)
    ) {
      break;
    }
    if (trimmed.startsWith(">")) continue;
    out.push(line);
  }
  const cleaned = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || text.trim();
}

class ImapReader {
  private socket: tls.TLSSocket;
  private buffer = "";
  private seq = 0;
  private tagPrefix = `LCL${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  private pending: {
    tag: string;
    lines: string[];
    resolve: (res: { ok: boolean; lines: string[] }) => void;
  } | null = null;
  private greeted = false;
  private greetResolve: (() => void) | null = null;

  private constructor(socket: tls.TLSSocket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
    const failPending = () => {
      if (this.greetResolve) {
        const r = this.greetResolve;
        this.greetResolve = null;
        r();
      }
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        p.resolve({ ok: false, lines: p.lines });
      }
    };
    socket.on("error", failPending);
    socket.on("close", failPending);
  }

  static async connect(host: string, port = 993): Promise<ImapReader | null> {
    return new Promise((resolve) => {
      const sock = tls.connect(
        { host, port, servername: host, rejectUnauthorized: true },
        () => {
          const client = new ImapReader(sock);
          if (client.greeted) resolve(client);
          else client.greetResolve = () => resolve(client);
        }
      );
      sock.setTimeout(6_500, () => {
        sock.destroy();
        resolve(null);
      });
      sock.once("error", () => {
        sock.destroy();
        resolve(null);
      });
    });
  }

  private drain() {
    let idx: number;
    while ((idx = this.buffer.indexOf("\r\n")) !== -1) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);

      if (!this.greeted && line.startsWith("* OK")) {
        this.greeted = true;
        if (this.greetResolve) {
          const r = this.greetResolve;
          this.greetResolve = null;
          r();
        }
        continue;
      }

      if (this.pending) {
        if (line.startsWith(`${this.pending.tag} `)) {
          const p = this.pending;
          this.pending = null;
          const rest = line.slice(p.tag.length + 1).trimStart();
          p.resolve({ ok: rest.toUpperCase().startsWith("OK"), lines: p.lines });
        } else {
          this.pending.lines.push(line);
        }
      }
    }
  }

  cmd(command: string): Promise<{ ok: boolean; lines: string[] }> {
    if (this.socket.destroyed) return Promise.resolve({ ok: false, lines: [] });
    const tag = `${this.tagPrefix}_${++this.seq}`;
    return new Promise((resolve) => {
      this.pending = { tag, lines: [], resolve };
      this.socket.write(`${tag} ${command}\r\n`);
    });
  }

  close() {
    try {
      this.socket.end();
      this.socket.destroy();
    } catch {
      // ignore socket cleanup
    }
  }
}

function isAutomatedNoiseSender(email: string): boolean {
  if (!email || !email.includes("@")) return true;
  if (
    /(^|[@._-])(no-?reply|donotreply|mailer-daemon|postmaster|bounce|notifications?|alerts?|security|billing|receipts?|newsletter|updates?|marketing|automated)@/i.test(
      email
    )
  ) {
    return true;
  }
  if (
    /@(google\.com|accounts\.google\.com|googlemail\.com|cloudflare\.com|vercel\.com|github\.com|resend\.com|resend\.dev|dodopayments\.com|stripe\.com|linkedin\.com|facebookmail\.com|instagram\.com|youtube\.com|spotify\.com|redditmail\.com)$/i.test(
      email
    )
  ) {
    return true;
  }
  return false;
}

function isAutoResponderMessage(
  subject: string,
  body: string,
  headers: Map<string, string>
): boolean {
  const autoSub = (headers.get("auto-submitted") ?? "").toLowerCase().trim();
  if (autoSub && autoSub !== "no") return true;
  if (headers.has("x-autoreply") || headers.has("x-autorespond")) return true;
  const prec = (headers.get("precedence") ?? "").toLowerCase();
  if (prec === "auto_reply" || prec === "bulk" || prec === "junk") return true;

  if (
    /\b(thank you for your email|automatic reply|auto-?reply|out of (the )?office|ooo:|vacation reply|undeliverable|delivery status notification|mail delivery Subsystem)\b/i.test(
      subject
    )
  ) {
    return true;
  }

  const head = body.slice(0, 360);
  if (
    /\b(we have received your (email|message)|thank you for (contacting|reaching out|your email)|currently out of (the )?office|away from my desk|this is an automated (response|reply|message)|will respond as quickly as we possibly can)\b/i.test(
      head
    )
  ) {
    return true;
  }
  return false;
}

type ReplyClassification = {
  intent: "SEND_LEADS" | "AUTO_REPLY" | "OPT_OUT" | "CUSTOM_HUMAN";
  city: string | null;
};

async function classifyProspectReply(
  subject: string,
  cleanReply: string
): Promise<ReplyClassification> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (apiKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0,
          max_tokens: 100,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Classify a B2B prospect reply to our cold email offering 3 newly filed state liquor applications (street addresses + LLCs). Return strict JSON: {"intent": "SEND_LEADS" | "AUTO_REPLY" | "OPT_OUT" | "CUSTOM_HUMAN", "city": string | null}. Use "SEND_LEADS" if they say yes, sure, send them, interested, ask for addresses/LLCs/sample/info/pricing, or name a city/county they cover (put city in "city", else null). Use "AUTO_REPLY" for automated receipts ("we received your email"), OOO, or directory menus. Use "OPT_OUT" for no thanks, not interested, unsubscribe, remove, wrong person. Use "CUSTOM_HUMAN" for press, complex custom questions, or anything ambiguous.',
            },
            {
              role: "user",
              content: `Subject: ${subject}\nReply:\n${cleanReply.slice(0, 900)}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(4_000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
          intent?: string;
          city?: string | null;
        };
        if (
          parsed.intent === "SEND_LEADS" ||
          parsed.intent === "AUTO_REPLY" ||
          parsed.intent === "OPT_OUT" ||
          parsed.intent === "CUSTOM_HUMAN"
        ) {
          return {
            intent: parsed.intent,
            city:
              typeof parsed.city === "string" && parsed.city.trim().length >= 2
                ? parsed.city.trim()
                : null,
          };
        }
      }
    } catch {
      // fall through to deterministic keyword classifier
    }
  }

  if (
    cleanReply.length < 550 &&
    /\b(yes|yeah|yep|sure|please|send|share|interested|love to|sounds good|go ahead|addresses|llc|details|sample|info)\b/i.test(
      cleanReply
    ) &&
    !/\b(no thanks|not interested|unsubscribe|remove me|stop emailing|received your email)\b/i.test(
      cleanReply
    )
  ) {
    return { intent: "SEND_LEADS", city: null };
  }
  return { intent: "CUSTOM_HUMAN", city: null };
}

async function fetchThreeDetailedBars(
  state: string,
  barsJson: string | null,
  requestedCity: string | null
): Promise<
  {
    tradeName: string;
    ownerName: string;
    address: string;
    city: string;
    zip: string;
    typeName: string;
  }[]
> {
  const picked: {
    tradeName: string;
    ownerName: string;
    address: string;
    city: string;
    zip: string;
    typeName: string;
  }[] = [];
  const seen = new Set<string>();

  const pushRows = (
    rows: {
      tradeName: string | null;
      ownerName: string | null;
      address: string | null;
      city: string | null;
      zip: string | null;
      typeName: string | null;
    }[]
  ) => {
    for (const r of rows) {
      if (picked.length >= 3) break;
      const name = (r.tradeName ?? r.ownerName ?? "").trim();
      const addr = (r.address ?? "").trim();
      if (!name || !addr) continue;
      const key = `${name.toLowerCase()}|${addr.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({
        tradeName: name,
        ownerName: (r.ownerName ?? name).trim(),
        address: addr,
        city: (r.city ?? stateFullName(state)).trim(),
        zip: (r.zip ?? "").trim(),
        typeName: (r.typeName ?? "Liquor License Application").trim(),
      });
    }
  };

  // 1) If prospect asked for a specific city, pull fresh bars in that exact city first!
  if (requestedCity) {
    const cityRows = await db
      .select({
        tradeName: licenses.tradeName,
        ownerName: licenses.ownerName,
        address: licenses.address,
        city: licenses.city,
        zip: licenses.zip,
        typeName: licenses.typeName,
      })
      .from(licenses)
      .where(
        and(
          eq(licenses.state, state),
          ilike(licenses.city, `%${requestedCity}%`),
          isNotNull(licenses.address),
          ne(licenses.address, "")
        )
      )
      .orderBy(
        sql`CASE WHEN ${licenses.kind} = 'pending' THEN 0 ELSE 1 END`,
        desc(licenses.filedAt),
        desc(licenses.id)
      )
      .limit(5)
      .catch(() => []);
    pushRows(cityRows);
  }

  // 2) Match the exact 3 bar names we originally pitched them in Touch #1 (`barsJson`)!
  if (picked.length < 3 && barsJson) {
    try {
      const names = (JSON.parse(barsJson) as string[])
        .map((n) => n.trim().toLowerCase())
        .filter(Boolean);
      if (names.length > 0) {
        const exactRows = await db
          .select({
            tradeName: licenses.tradeName,
            ownerName: licenses.ownerName,
            address: licenses.address,
            city: licenses.city,
            zip: licenses.zip,
            typeName: licenses.typeName,
          })
          .from(licenses)
          .where(
            and(
              eq(licenses.state, state),
              inArray(sql`lower(${licenses.tradeName})`, names),
              isNotNull(licenses.address),
              ne(licenses.address, "")
            )
          )
          .limit(6)
          .catch(() => []);
        pushRows(exactRows);
      }
    } catch {
      // ignore malformed json
    }
  }

  // 3) Top up to 3 verified local filings with complete street addresses & LLCs
  if (picked.length < 3) {
    const fallbackRows = await db
      .select({
        tradeName: licenses.tradeName,
        ownerName: licenses.ownerName,
        address: licenses.address,
        city: licenses.city,
        zip: licenses.zip,
        typeName: licenses.typeName,
      })
      .from(licenses)
      .where(
        and(
          eq(licenses.state, state),
          isNotNull(licenses.tradeName),
          ne(licenses.tradeName, ""),
          isNotNull(licenses.address),
          ne(licenses.address, "")
        )
      )
      .orderBy(
        sql`CASE WHEN ${licenses.kind} = 'pending' THEN 0 ELSE 1 END`,
        desc(licenses.filedAt),
        desc(licenses.id)
      )
      .limit(8)
      .catch(() => []);
    pushRows(fallbackRows);
  }

  return picked;
}

export type InboxSyncReport = {
  ok: boolean;
  mailboxesChecked: number;
  forwarded: number;
  autoClosed: number;
  optedOut: number;
  armedNow?: boolean;
};

export async function syncInboundRepliesToTelegram(): Promise<InboxSyncReport> {
  await ensureSchema();

  const pool: SmtpAccount[] = [...getOutreachSmtpAccounts()];
  const primary = getPrimarySmtpAccount();
  if (primary && !pool.some((a) => a.id === primary.id)) {
    pool.push(primary);
  }
  const gmailAccounts = pool.filter((a) => a.host.includes("gmail"));
  if (gmailAccounts.length === 0) {
    return { ok: true, mailboxesChecked: 0, forwarded: 0, autoClosed: 0, optedOut: 0 };
  }

  // 1) Check or arm the first-boot watermark so historical Gmail messages never flood Telegram!
  const bootRows = await db
    .select()
    .from(emailLog)
    .where(eq(emailLog.toEmail, WATCHER_BOOT_MARKER))
    .orderBy(desc(emailLog.id))
    .limit(1)
    .catch(() => []);

  let armedNow = false;
  let minDateMs = Date.now() - 10 * 60_000;
  if (bootRows.length === 0) {
    armedNow = true;
    const nowIso = new Date().toISOString();
    await db
      .insert(emailLog)
      .values({
        toEmail: WATCHER_BOOT_MARKER,
        subject: "[SYSTEM] Multi-Inbox Telegram Reply Watcher Armed",
        status: "received",
        detail: nowIso,
        eventCount: gmailAccounts.length,
      })
      .catch(() => undefined);
  } else if (bootRows[0].detail) {
    const parsedBoot = Date.parse(bootRows[0].detail);
    if (!Number.isNaN(parsedBoot)) {
      minDateMs = Math.max(parsedBoot - 10 * 60_000, Date.now() - 72 * 3_600_000);
    }
  }

  // 2) Load already-forwarded Message-IDs + known prospects/subscribers/contacts for smart context tagging
  const [seenLogs, sentRows, subRows, msgRows] = await Promise.all([
    db
      .select({ detail: emailLog.detail })
      .from(emailLog)
      .where(eq(emailLog.status, "received"))
      .orderBy(desc(emailLog.id))
      .limit(400)
      .catch(() => []),
    db
      .select({
        email: outreachSent.email,
        company: outreachSent.company,
        state: outreachSent.state,
        barsJson: outreachSent.barsJson,
      })
      .from(outreachSent)
      .orderBy(desc(outreachSent.id))
      .limit(1500)
      .catch(() => []),
    db
      .select({ email: subscribers.email, plan: subscribers.plan, status: subscribers.status })
      .from(subscribers)
      .limit(500)
      .catch(() => []),
    db
      .select({ email: contactMessages.email, name: contactMessages.name })
      .from(contactMessages)
      .limit(200)
      .catch(() => []),
  ]);

  const seenKeys = new Set(seenLogs.map((r) => r.detail).filter(Boolean) as string[]);
  const ownEmails = new Set([
    ...pool.map((a) => a.user.toLowerCase()),
    PUBLIC_CONFIG.contactEmail.toLowerCase(),
  ]);

  const prospectByEmail = new Map<
    string,
    { company: string; state: string; barsJson: string | null }
  >();
  const prospectByDomain = new Map<
    string,
    { company: string; state: string; barsJson: string | null }
  >();
  for (const r of sentRows) {
    const em = r.email.toLowerCase();
    const info = { company: r.company, state: r.state, barsJson: r.barsJson };
    prospectByEmail.set(em, info);
    const dom = em.split("@")[1];
    if (dom && !/^(gmail|yahoo|hotmail|outlook|icloud|aol)\./i.test(dom)) {
      prospectByDomain.set(dom, info);
    }
  }
  const subByEmail = new Map(subRows.map((s) => [s.email.toLowerCase(), s]));
  const contactByEmail = new Set(msgRows.map((m) => m.email.toLowerCase()));

  const sinceDateStr = formatImapDate(new Date(Date.now() - 36 * 3_600_000));
  let forwarded = 0;
  let autoClosed = 0;
  let optedOut = 0;

  await mapLimit(gmailAccounts, 3, async (account) => {
    const work = async () => {
      const client = await ImapReader.connect("imap.gmail.com", 993);
      if (!client) return;

      try {
        const login = await client.cmd(
          `LOGIN ${imapQuote(account.user)} ${imapQuote(account.pass)}`
        );
        if (!login.ok) return;

        const sel = await client.cmd(`SELECT "INBOX"`);
        if (!sel.ok) return;

        const search = await client.cmd(`UID SEARCH SINCE ${sinceDateStr}`);
        if (!search.ok) return;

        const uids: string[] = [];
        for (const l of search.lines) {
          if (l.startsWith("* SEARCH")) {
            for (const tok of l.slice("* SEARCH".length).trim().split(/\s+/)) {
              if (/^\d+$/.test(tok)) uids.push(tok);
            }
          }
        }
        const recentUids = uids.slice(-20);
        for (const uid of recentUids) {
          const fallbackKey = `imap:${account.id}:${uid}`;
          if (seenKeys.has(fallbackKey)) continue;

          // Peek only the first 16 KB of raw RFC-822 message (fast, never marks unseen, skips huge attachments)
          const fetched = await client.cmd(`UID FETCH ${uid} (BODY.PEEK[]<0.16384>)`);
          if (!fetched.ok || fetched.lines.length < 2) continue;

          // Strip the leading `* <seq> FETCH (... {size}` line and trailing IMAP `)` closer
          const rawLines = fetched.lines.slice(1);
          const rawMsg = rawLines.join("\r\n").replace(/\r?\n?\)\s*$/, "");
          const splitMatch = rawMsg.match(/\r?\n\r?\n/);
          if (!splitMatch || splitMatch.index === undefined) continue;

          const headers = parseHeaders(rawMsg.slice(0, splitMatch.index));
          const { name: fromName, email: fromEmail } = parseFromHeader(
            headers.get("from") ?? ""
          );
          if (!fromEmail || ownEmails.has(fromEmail) || isAutomatedNoiseSender(fromEmail)) {
            continue;
          }

          const subject = decodeMimeWords(headers.get("subject") ?? "(no subject)").trim();
          if (subject.startsWith("[Website] ")) continue;

          const dateRaw = headers.get("date") ?? "";
          const msgTime = Date.parse(dateRaw);
          if (!Number.isNaN(msgTime) && msgTime < minDateMs) {
            continue;
          }

          const rawMsgId = (headers.get("message-id") ?? "").trim();
          const msgKey = rawMsgId ? `msgid:${rawMsgId}` : fallbackKey;
          if (seenKeys.has(msgKey)) continue;

          const fromDom = fromEmail.split("@")[1] ?? "";
          const matchedProspect =
            prospectByEmail.get(fromEmail) ?? prospectByDomain.get(fromDom);
          const matchedSub = subByEmail.get(fromEmail);
          const matchedContact = contactByEmail.has(fromEmail);
          const isKnownPerson = Boolean(matchedProspect || matchedSub || matchedContact);

          // For completely unknown cold senders, skip bulk newsletters (`List-Unsubscribe` / `Auto-Submitted`)
          if (!isKnownPerson) {
            const autoSub = (headers.get("auto-submitted") ?? "").toLowerCase();
            if (autoSub && autoSub !== "no") continue;
            if (headers.has("list-unsubscribe") && !headers.has("in-reply-to")) {
              continue;
            }
          }

          seenKeys.add(msgKey);
          seenKeys.add(fallbackKey);

          const fullPlain = extractMimePlainText(rawMsg);
          const cleanReply = stripQuotedReplyHistory(fullPlain).slice(0, 1800);

          // 1) Quietly absorb automated OOO / "We have received your email" receipts
          //    (like PM Spirits auto-responder) so they never clutter Telegram/Contact Inbox
          //    and never trigger auto-reply loops!
          if (isAutoResponderMessage(subject, cleanReply, headers)) {
            await db
              .insert(emailLog)
              .values({
                toEmail: fromEmail,
                subject: `[AUTO-RECEIPT] ${subject}`.slice(0, 200),
                status: "received",
                detail: msgKey.slice(0, 240),
                eventCount: 0,
              })
              .catch(() => undefined);
            continue;
          }

          // 2) Classify prospect intent (Opt-Out vs Send 3 Leads vs Custom Question)
          let isOptOut =
            cleanReply.length < 260 &&
            /\b(unsubscribe|remove me|stop emailing|no thanks|not interested|take me off)\b/i.test(
              cleanReply
            );
          let classification: ReplyClassification = { intent: "CUSTOM_HUMAN", city: null };
          if (matchedProspect && !isOptOut) {
            classification = await classifyProspectReply(subject, cleanReply);
            if (classification.intent === "AUTO_REPLY") {
              await db
                .insert(emailLog)
                .values({
                  toEmail: fromEmail,
                  subject: `[AUTO-RECEIPT] ${subject}`.slice(0, 200),
                  status: "received",
                  detail: msgKey.slice(0, 240),
                  eventCount: 0,
                })
                .catch(() => undefined);
              continue;
            }
            if (classification.intent === "OPT_OUT") {
              isOptOut = true;
            }
          }

          if (matchedProspect) {
            await db
              .update(outreachSent)
              .set({ followupCount: 2, followupSentAt: new Date() })
              .where(eq(outreachSent.email, fromEmail))
              .catch(() => undefined);
          }

          // Persist dedupe marker first so concurrent crons never double-alert
          await db
            .insert(emailLog)
            .values({
              toEmail: fromEmail,
              subject: `[INBOUND] ${subject}`.slice(0, 200),
              status: "received",
              detail: msgKey.slice(0, 240),
              eventCount: 1,
            })
            .catch(() => undefined);

          if (isOptOut) {
            optedOut++;
            await sendTelegramOwner(
              [
                `🛑 OUTREACH OPT-OUT (Follow-ups Auto-Stopped)`,
                `📬 Mailbox: ${account.user}`,
                `👤 From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`,
                matchedProspect ? `🏢 Company: ${matchedProspect.company} (${matchedProspect.state})` : "",
                ``,
                cleanReply || "(opt-out)",
              ]
                .filter(Boolean)
                .join("\n")
            ).catch(() => undefined);
            continue;
          }

          // 3) 100% HANDS-FREE AUTO-CLOSER: If an outreach prospect replies "Yes / Send them / Interested",
          //    automatically reply in-thread with the 3 full street addresses + LLCs AND unlock their
          //    7-day free trial (strictly AT-MOST-ONCE per prospect email forever)!
          let autoClosedNote = "";
          if (matchedProspect && classification.intent === "SEND_LEADS") {
            const priorAuto = await db
              .select({ id: emailLog.id })
              .from(emailLog)
              .where(
                and(
                  eq(emailLog.toEmail, fromEmail),
                  like(emailLog.subject, "[AUTO-CLOSER]%")
                )
              )
              .limit(1)
              .catch(() => []);

            if (priorAuto.length === 0) {
              const stCode = matchedProspect.state;
              const stName = stateFullName(stCode);
              const bars = await fetchThreeDetailedBars(
                stCode,
                matchedProspect.barsJson,
                classification.city
              );

              if (bars.length > 0) {
                // Auto-activate complimentary 7-day territory trial if not already subscribed!
                if (!matchedSub) {
                  await db
                    .insert(subscribers)
                    .values({
                      email: fromEmail,
                      name: (fromName || matchedProspect.company).slice(0, 100),
                      plan: "solo",
                      status: "trial",
                      states: stCode,
                      cityFilter: classification.city ?? null,
                      prefsToken: scopedToken(fromEmail, "prefs"),
                      trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
                      trialNotified: false,
                    })
                    .onConflictDoNothing()
                    .catch(() => undefined);
                }

                const replySubj = subject.toLowerCase().startsWith("re:")
                  ? subject
                  : `Re: ${subject}`;
                const greetName = fromName
                  ? fromName.split(/\s+/)[0]
                  : `${matchedProspect.company} team`;
                const formattedBars = bars
                  .map(
                    (b, idx) =>
                      `${idx + 1}. ${b.tradeName} — ${b.typeName}\n   Address: ${b.address}, ${b.city}, ${stCode}${b.zip ? ` ${b.zip}` : ""}\n   Applicant LLC: ${b.ownerName}`
                  )
                  .join("\n\n");
                const pLink = prefsUrl(fromEmail);
                const uLink = unsubscribeUrls(fromEmail).page;
                const footerLine = `${PUBLIC_CONFIG.legalName}${PUBLIC_CONFIG.postalAddress ? ` | ${PUBLIC_CONFIG.postalAddress}` : ""}`;

                const replyBody = [
                  `Hi ${greetName},`,
                  ``,
                  `Appreciate the reply! Here are the street addresses, legal LLCs, and permit details from the official ${stName} alcohol board${classification.city ? ` (${classification.city} area)` : ""}:`,
                  ``,
                  formattedBars,
                  ``,
                  `We sweep the official ${stName} licensing portal every morning at 7 AM so you catch new bars, restaurants, and package stores 60-90 days before doors open.`,
                  ``,
                  `I also turned on a complimentary 7-day morning feed for ${stName} on ${fromEmail} (no card needed) so tomorrow's new filings hit your inbox automatically:`,
                  `- Filter your exact cities or ZIP codes: ${pLink}`,
                  `- Plans & full sample dossier: https://lastcallleads.com/sample`,
                  ``,
                  `Best,`,
                  `Research Desk`,
                  `${BRAND.name}`,
                  `--`,
                  `Pause or opt out in 1 click anytime: ${uLink} | ${footerLine}`,
                ].join("\n");

                const sendRes = await sendViaSmtpAccount(account, {
                  from: `"${BRAND.name} Desk" <${account.user}>`,
                  to: fromEmail,
                  replyTo: account.user,
                  subject: replySubj,
                  text: replyBody,
                  headers: rawMsgId
                    ? { "In-Reply-To": rawMsgId, References: rawMsgId }
                    : undefined,
                });

                if (sendRes.status === "sent") {
                  autoClosed++;
                  autoClosedNote = `\n\n🤖✅ AUTO-REPLIED IN THREAD: Sent ${bars.length} full street addresses + LLCs & activated 7-day ${stName} Free Trial automatically! (Zero action needed from you)`;
                  await db
                    .insert(emailLog)
                    .values({
                      toEmail: fromEmail,
                      subject: `[AUTO-CLOSER] ${replySubj}`.slice(0, 200),
                      status: "sent",
                      detail: sendRes.detail,
                      eventCount: bars.length,
                    })
                    .catch(() => undefined);
                }
              }
            }
          }

          // Also save into Control Room Contact Inbox so owner has a permanent dashboard record + 1-click Reply
          await db
            .insert(contactMessages)
            .values({
              name: (fromName || matchedProspect?.company || fromEmail.split("@")[0]).slice(0, 100),
              email: fromEmail.slice(0, 254),
              company: matchedProspect
                ? `${matchedProspect.company} (${matchedProspect.state})`.slice(0, 150)
                : matchedSub
                  ? `Subscriber (${matchedSub.plan})`
                  : null,
              subject: `[${account.user}] ${subject}`.slice(0, 150),
              message: `${cleanReply || "(empty message)"}${autoClosedNote}`.slice(0, 5000),
            })
            .catch(() => undefined);

          const badge = autoClosedNote
            ? `🤖🔥 HOT LEAD AUTO-CLOSED! (${matchedProspect?.company} · ${matchedProspect?.state})`
            : matchedProspect
              ? `🔥 HOT OUTREACH REPLY! (${matchedProspect.company} · ${matchedProspect.state})`
              : matchedSub
                ? `💎 SUBSCRIBER MESSAGE (${matchedSub.plan.toUpperCase()})`
                : matchedContact
                  ? `💬 THREAD REPLY`
                  : `📩 NEW INBOUND EMAIL`;

          await sendTelegramOwner(
            [
              badge,
              `📬 Mailbox: ${account.user}`,
              `👤 From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`,
              `📌 Subject: ${subject}`,
              `────────────────────`,
              cleanReply || "(no text body)",
              `────────────────────`,
              autoClosedNote
                ? autoClosedNote.trim()
                : `💡 Reply from Gmail (${account.user}) if needed!`,
            ].join("\n")
          ).catch(() => undefined);

          forwarded++;
        }

        await client.cmd(`LOGOUT`).catch(() => undefined);
      } finally {
        client.close();
      }
    };

    await Promise.race([
      work().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
    ]);
  });

  return {
    ok: true,
    mailboxesChecked: gmailAccounts.length,
    forwarded,
    autoClosed,
    optedOut,
    ...(armedNow ? { armedNow: true } : {}),
  };
}
