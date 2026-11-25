// Multi-Inbox Gmail IMAP -> Instant Telegram Reply & Conversation Forwarder.
// Watches ALL configured Gmail mailboxes (primary support + all outreach accounts):
//   1) Detects any real human reply (B2B prospects, press like Neil Fox, or customers)
//      while ignoring our own warm-up ring, newsletters, bounces, and system alerts.
//   2) Automatically pauses scheduled Day-3 / Day-7 follow-ups in `outreach_sent`
//      the moment a prospect replies (so the bot never interrupts a live human chat!).
//   3) Mirrors the full reply straight to the owner's Telegram Bot AND saves it to
//      `contact_messages` (Control Room Contact Inbox) with strict Message-ID dedupe.
import tls from "node:tls";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { contactMessages, emailLog, outreachSent, subscribers } from "@/db/schema";
import { mapLimit } from "./email-finder";
import {
  getOutreachSmtpAccounts,
  getPrimarySmtpAccount,
  type SmtpAccount,
} from "./mailer";
import { sendTelegramOwner } from "./notify";
import { PUBLIC_CONFIG } from "./public-config";

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

export type InboxSyncReport = {
  ok: boolean;
  mailboxesChecked: number;
  forwarded: number;
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
    return { ok: true, mailboxesChecked: 0, forwarded: 0, optedOut: 0 };
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
      .select({ email: outreachSent.email, company: outreachSent.company, state: outreachSent.state })
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

  const prospectByEmail = new Map<string, { company: string; state: string }>();
  const prospectByDomain = new Map<string, { company: string; state: string }>();
  for (const r of sentRows) {
    const em = r.email.toLowerCase();
    prospectByEmail.set(em, { company: r.company, state: r.state });
    const dom = em.split("@")[1];
    if (dom && !/^(gmail|yahoo|hotmail|outlook|icloud|aol)\./i.test(dom)) {
      prospectByDomain.set(dom, { company: r.company, state: r.state });
    }
  }
  const subByEmail = new Map(subRows.map((s) => [s.email.toLowerCase(), s]));
  const contactByEmail = new Set(msgRows.map((m) => m.email.toLowerCase()));

  const sinceDateStr = formatImapDate(new Date(Date.now() - 36 * 3_600_000));
  let forwarded = 0;
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

          // Automatically stop scheduled automated follow-ups whenever a prospect replies!
          const isOptOut =
            cleanReply.length < 260 &&
            /\b(unsubscribe|remove me|stop emailing|no thanks|not interested|take me off)\b/i.test(
              cleanReply
            );

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
              message: (cleanReply || "(empty message)").slice(0, 5000),
            })
            .catch(() => undefined);

          const badge = matchedProspect
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
              `💡 Reply from Gmail (${account.user}) to continue this conversation!`,
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
    optedOut,
    ...(armedNow ? { armedNow: true } : {}),
  };
}
