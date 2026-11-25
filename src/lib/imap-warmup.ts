// Zero-dependency Gmail IMAP Warm-Up & Auto-Unspam Helper (built-in `node:tls`).
// Uses the exact same 16-char Google App Password already configured for SMTP!
// For peer warm-up emails ONLY (strictly filtered by `FROM <peerEmail>`):
//   1) Checks `[Gmail]/Spam` (or localized `\Junk` folder) -> copies to `INBOX`
//      (= clicking "Report not spam" in Gmail!) and deletes from Spam.
//   2) Opens `INBOX` -> marks peer warm-up messages `\Seen` (Read) + `\Flagged` (Starred).
// Hard-capped at 6s per mailbox and 100% fault-tolerant (never throws).
import tls from "node:tls";
import type { SmtpAccount } from "./mailer";

function imapQuote(val: string): string {
  return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseSearchUids(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("* SEARCH")) {
      const parts = line.slice("* SEARCH".length).trim().split(/\s+/);
      for (const p of parts) {
        if (/^\d+$/.test(p)) out.push(p);
      }
    }
  }
  return out;
}

class MiniImapClient {
  private socket: tls.TLSSocket;
  private buffer = "";
  private seq = 0;
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
    socket.on("error", () => {
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
    });
    socket.on("close", () => {
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        p.resolve({ ok: false, lines: p.lines });
      }
    });
  }

  static async connect(host: string, port = 993): Promise<MiniImapClient | null> {
    return new Promise((resolve) => {
      const sock = tls.connect(
        { host, port, servername: host, rejectUnauthorized: true },
        () => {
          const client = new MiniImapClient(sock);
          if (client.greeted) {
            resolve(client);
          } else {
            client.greetResolve = () => resolve(client);
          }
        }
      );
      sock.setTimeout(5_500, () => {
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
    const tag = `L${++this.seq}`;
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
      // ignore socket cleanup errors
    }
  }
}

export async function rescueAndEngageImapPeer(
  account: SmtpAccount,
  peerEmails: string[]
): Promise<{ rescuedFromSpam: number; engagedInbox: number }> {
  if (!account.host.includes("gmail") || peerEmails.length === 0) {
    return { rescuedFromSpam: 0, engagedInbox: 0 };
  }

  const work = async (): Promise<{ rescuedFromSpam: number; engagedInbox: number }> => {
    const client = await MiniImapClient.connect("imap.gmail.com", 993);
    if (!client) return { rescuedFromSpam: 0, engagedInbox: 0 };

    let rescuedFromSpam = 0;
    let engagedInbox = 0;

    try {
      const login = await client.cmd(
        `LOGIN ${imapQuote(account.user)} ${imapQuote(account.pass)}`
      );
      if (!login.ok) return { rescuedFromSpam: 0, engagedInbox: 0 };

      // Detect localized \Junk folder name (falls back to "[Gmail]/Spam")
      let spamBox = "[Gmail]/Spam";
      const listRes = await client.cmd(`LIST "" "*"`);
      if (listRes.ok) {
        const junkLine = listRes.lines.find((l) => /\\Junk\b/i.test(l));
        const m = junkLine?.match(/"([^"]+)"\s*$/);
        if (m?.[1]) spamBox = m[1];
      }

      // 1) Rescue any peer warm-up messages from Spam -> INBOX ("Report not spam")
      const selSpam = await client.cmd(`SELECT ${imapQuote(spamBox)}`);
      if (selSpam.ok) {
        const spamUids = new Set<string>();
        for (const peer of peerEmails) {
          const s = await client.cmd(`UID SEARCH FROM ${imapQuote(peer)}`);
          if (s.ok) {
            for (const uid of parseSearchUids(s.lines)) spamUids.add(uid);
          }
        }
        if (spamUids.size > 0) {
          const uidSet = [...spamUids].join(",");
          const copied = await client.cmd(`UID COPY ${uidSet} "INBOX"`);
          if (copied.ok) {
            rescuedFromSpam += spamUids.size;
            await client.cmd(`UID STORE ${uidSet} +FLAGS.SILENT (\\Deleted)`);
            await client.cmd(`EXPUNGE`);
          }
        }
      }

      // 2) Open INBOX and mark peer warm-up emails as Read (\Seen) + Starred (\Flagged)
      const selInbox = await client.cmd(`SELECT "INBOX"`);
      if (selInbox.ok) {
        const inboxUids = new Set<string>();
        for (const peer of peerEmails) {
          const s = await client.cmd(`UID SEARCH UNSEEN FROM ${imapQuote(peer)}`);
          if (s.ok) {
            for (const uid of parseSearchUids(s.lines)) inboxUids.add(uid);
          }
        }
        if (inboxUids.size > 0) {
          const uidSet = [...inboxUids].join(",");
          const flagged = await client.cmd(
            `UID STORE ${uidSet} +FLAGS.SILENT (\\Seen \\Flagged)`
          );
          if (flagged.ok) engagedInbox += inboxUids.size;
        }
      }

      await client.cmd(`LOGOUT`).catch(() => undefined);
    } finally {
      client.close();
    }

    return { rescuedFromSpam, engagedInbox };
  };

  return Promise.race([
    work().catch(() => ({ rescuedFromSpam: 0, engagedInbox: 0 })),
    new Promise<{ rescuedFromSpam: number; engagedInbox: number }>((resolve) =>
      setTimeout(() => resolve({ rescuedFromSpam: 0, engagedInbox: 0 }), 6_000)
    ),
  ]);
}
