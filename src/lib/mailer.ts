// Unified zero-cost & production email transport.
// Supports:
//   1) Resend API (when RESEND_API_KEY is set — best once you own a custom domain)
//   2) Free Gmail / Outlook / Brevo SMTP via Nodemailer (SMTP_USER + SMTP_PASS)
//      Works TODAY with a free Gmail account + Google App Password ($0 cost!)
//   3) Multi-Account Rotating Free Gmail/Outlook Outreach Pool (OUTREACH_SMTP_ACCOUNTS)
//      Format: "email1@gmail.com:apppass1, email2@outlook.com:pass2"
import nodemailer from "nodemailer";
import { Resend } from "resend";

export type MailPayload = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string; encoding?: "base64" | "utf8" }[];
};

export type MailResult = {
  status: "sent" | "dry_run" | "error";
  detail: string;
};

export type SmtpAccount = {
  id: string; // email address used for logging & per-account daily limits
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

function detectSmtpServer(email: string): { host: string; port: number; secure: boolean } {
  const lower = email.toLowerCase();
  if (lower.endsWith("@gmail.com") || lower.endsWith("@googlemail.com")) {
    return { host: "smtp.gmail.com", port: 465, secure: true };
  }
  if (
    lower.endsWith("@outlook.com") ||
    lower.endsWith("@hotmail.com") ||
    lower.endsWith("@live.com") ||
    lower.endsWith("@office365.com")
  ) {
    return { host: "smtp-mail.outlook.com", port: 587, secure: false };
  }
  if (lower.endsWith("@zoho.com") || lower.endsWith("@zohomail.com") || lower.endsWith("@zohomail.in")) {
    return { host: "smtp.zoho.com", port: 465, secure: true };
  }
  if (lower.endsWith("@yahoo.com")) {
    return { host: "smtp.mail.yahoo.com", port: 465, secure: true };
  }
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465) || 465,
    secure: (process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false",
  };
}

// Primary transactional SMTP account (e.g. supportlastcallleads@gmail.com + App Password)
export function getPrimarySmtpAccount(): SmtpAccount | null {
  const user = process.env.SMTP_USER?.trim();
  const rawPass = process.env.SMTP_PASS?.trim();
  if (!user || !rawPass) return null;
  const detected = detectSmtpServer(user);
  const host = process.env.SMTP_HOST?.trim() || detected.host;
  const port = Number(process.env.SMTP_PORT || detected.port) || detected.port;
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === "true"
    : port === 465;
  // Google displays 16-char App Passwords with spaces ("xxxx xxxx xxxx xxxx") — strip spaces automatically.
  const pass = host.includes("gmail") ? rawPass.replace(/\s+/g, "") : rawPass;
  return { id: user.toLowerCase(), host, port, secure, user, pass };
}

// Multi-account outreach pool:
// Accepts comma or newline-separated entries:
//   "outreach1@gmail.com:abcd efgh ijkl mnop, outreach2@outlook.com:myPass123"
// Or explicit host:port:user:pass
export function getOutreachSmtpAccounts(): SmtpAccount[] {
  const raw = process.env.OUTREACH_SMTP_ACCOUNTS?.trim();
  if (!raw) {
    const primary = getPrimarySmtpAccount();
    return primary ? [primary] : [];
  }

  const out: SmtpAccount[] = [];
  const entries = raw
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const parts = entry.split(":");
    if (parts.length === 2) {
      const user = parts[0].trim();
      const rawPass = parts[1].trim();
      if (!user.includes("@") || !rawPass) continue;
      const srv = detectSmtpServer(user);
      const pass = srv.host.includes("gmail") ? rawPass.replace(/\s+/g, "") : rawPass;
      out.push({ id: user.toLowerCase(), ...srv, user, pass });
    } else if (parts.length >= 4) {
      const host = parts[0].trim();
      const port = Number(parts[1].trim()) || 465;
      const user = parts[2].trim();
      const rawPass = parts.slice(3).join(":").trim();
      if (!host || !user || !rawPass) continue;
      const pass = host.includes("gmail") ? rawPass.replace(/\s+/g, "") : rawPass;
      out.push({
        id: user.toLowerCase(),
        host,
        port,
        secure: port === 465,
        user,
        pass,
      });
    }
  }
  return out;
}

export function isMailTransportConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() || getPrimarySmtpAccount());
}

export function isOutreachTransportConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() || getOutreachSmtpAccounts().length > 0);
}

// Smart zero-touch activation:
//   - "false" => explicitly paused
//   - "true"  => explicitly active
//   - unset   => automatically active whenever dedicated OUTREACH_SMTP_ACCOUNTS are configured!
export function isAutoOutreachActive(): boolean {
  const flag = (process.env.AUTO_OUTREACH_ENABLED ?? "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  if (flag === "true" || flag === "1" || flag === "on") return true;
  return Boolean(process.env.OUTREACH_SMTP_ACCOUNTS?.trim());
}

export async function sendViaSmtpAccount(
  account: SmtpAccount,
  payload: MailPayload
): Promise<MailResult> {
  try {
    const transporter = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure,
      auth: { user: account.user, pass: account.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    // For Gmail/Outlook SMTP, sender address MUST match the authenticated mailbox
    // so emails pass SPF/DKIM cleanly instead of landing in spam.
    const displayName = payload.from.includes("<")
      ? payload.from.split("<")[0].trim().replace(/^"|"$/g, "")
      : "";
    const fromHeader = displayName ? `"${displayName}" <${account.user}>` : account.user;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: payload.to,
      replyTo: payload.replyTo || account.user,
      subject: payload.subject,
      ...(payload.text ? { text: payload.text } : {}),
      ...(payload.html ? { html: payload.html } : {}),
      headers: payload.headers,
      attachments: payload.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: a.encoding ?? "base64",
      })),
    });

    return {
      status: "sent",
      detail: `smtp:${account.user}:${info.messageId ?? "ok"}`,
    };
  } catch (err) {
    return {
      status: "error",
      detail: `smtp:${account.user}:${err instanceof Error ? err.message : String(err)}`.slice(0, 220),
    };
  }
}

export async function sendTransactionalMail(payload: MailPayload): Promise<MailResult> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const smtp = getPrimarySmtpAccount();
  let resendErr = "";

  // 1) Try Resend first (verified custom Cloudflare domain — 3,000 free/mo, best inbox placement)
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const r = await resend.emails.send({
        from: payload.from,
        to: payload.to,
        replyTo: payload.replyTo,
        subject: payload.subject,
        ...(payload.html ? { html: payload.html } : { text: payload.text ?? "" }),
        ...(payload.text && payload.html ? { text: payload.text } : {}),
        ...(payload.headers ? { headers: payload.headers } : {}),
        ...(payload.attachments?.length
          ? {
              attachments: payload.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
              })),
            }
          : {}),
      });
      if (!r.error) {
        return {
          status: "sent",
          detail: r.data?.id ? `resend:${r.data.id}` : "sent",
        };
      }
      resendErr = r.error.message ?? "Resend rejected mail";
    } catch (err) {
      resendErr = err instanceof Error ? err.message : String(err);
    }
  }

  // 2) Auto-failover to SMTP (Gmail/Outlook/Brevo) if Resend isn't set OR hit 100/day quota!
  if (smtp) {
    const smtpRes = await sendViaSmtpAccount(smtp, payload);
    if (smtpRes.status === "sent") {
      return {
        status: "sent",
        detail: resendErr ? `failover(${resendErr.slice(0, 40)})->${smtpRes.detail}` : smtpRes.detail,
      };
    }
    return smtpRes;
  }

  if (resendErr) {
    return { status: "error", detail: resendErr };
  }

  return {
    status: "dry_run",
    detail: "No RESEND_API_KEY or SMTP_USER/SMTP_PASS set — logged only",
  };
}
