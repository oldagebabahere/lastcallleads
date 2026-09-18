import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { subscribers } from "@/db/schema";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function params(req: Request) {
  const url = new URL(req.url);
  return {
    email: (url.searchParams.get("email") ?? "").trim().toLowerCase(),
    token: url.searchParams.get("token") ?? "",
  };
}

async function optOut(req: Request) {
  const { email, token } = params(req);
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return new Response("Invalid unsubscribe link", { status: 400 });
  }
  await ensureSchema();
  await db
    .update(subscribers)
    .set({ emailOptOut: true })
    .where(eq(subscribers.email, email));
  // RFC 8058 requests a blank 200/202 response for one-click POST.
  return new Response(null, { status: 200 });
}

export async function POST(req: Request) {
  return optOut(req);
}
