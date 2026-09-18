import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { contactMessages } from "@/db/schema";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: {
    name?: string;
    email?: string;
    company?: string;
    subject?: string;
    message?: string;
    website?: string; // honeypot — humans never fill this
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  if (body.website) {
    // Quietly accept bots without storing or sending their spam.
    return Response.json({ ok: true });
  }

  const name = (body.name ?? "").trim().slice(0, 100);
  const email = (body.email ?? "").trim().toLowerCase().slice(0, 254);
  const company = (body.company ?? "").trim().slice(0, 150) || null;
  const subject = (body.subject ?? "General question").trim().slice(0, 150);
  const message = (body.message ?? "").trim().slice(0, 5000);

  if (name.length < 2 || !EMAIL_RE.test(email) || message.length < 10) {
    return Response.json({ ok: false, error: "invalid_fields" }, { status: 422 });
  }

  await ensureSchema();
  await db.insert(contactMessages).values({
    name,
    email,
    company,
    subject,
    message,
  });

  const key = process.env.RESEND_API_KEY;
  const supportInbox = process.env.SUPPORT_INBOX_EMAIL;
  const from = process.env.ALERT_FROM_EMAIL;
  if (key && supportInbox && from) {
    try {
      const resend = new Resend(key);
      await resend.emails.send({
        from,
        to: supportInbox,
        replyTo: email,
        subject: `[Website] ${subject}`,
        text: `Name: ${name}\nEmail: ${email}\nCompany: ${company ?? "—"}\n\n${message}`,
      });
    } catch {
      // The message is already safe in Postgres; owner can see it there later.
    }
  }

  return Response.json({
    ok: true,
    message: `Thanks — your message was received. We normally reply from ${PUBLIC_CONFIG.contactEmail}.`,
  });
}
