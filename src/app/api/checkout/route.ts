// Authenticated 1-click upgrade endpoint for trial/waitlist subscribers.
// Linked from trial welcome, trial-tip day 5, trial-ended emails, and /prefs.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { subscribers } from "@/db/schema";
import { createDodoCheckout, dodoConfigured } from "@/lib/dodo";
import { siteUrl } from "@/lib/site";
import { verifyScopedToken } from "@/lib/unsubscribe";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const token = url.searchParams.get("token") ?? "";
  const requestedPlan = (url.searchParams.get("plan") ?? "").toLowerCase();

  if (!email || !verifyScopedToken(email, token, "checkout")) {
    return Response.redirect(`${siteUrl()}/#pricing`, 302);
  }

  if (!dodoConfigured()) {
    return Response.redirect(
      `${siteUrl()}/contact?subject=${encodeURIComponent("Billing or cancellation")}`,
      302
    );
  }

  await ensureSchema();
  const rows = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);
  const sub = rows[0];
  if (!sub) {
    return Response.redirect(`${siteUrl()}/#pricing`, 302);
  }

  const plan =
    requestedPlan === "pro" || requestedPlan === "solo"
      ? requestedPlan
      : sub.plan === "pro"
        ? "pro"
        : "solo";

  try {
    const checkoutUrl = await createDodoCheckout({
      email: sub.email,
      subscriberId: sub.id,
      plan,
      returnUrl: `${siteUrl()}/welcome?session=ok`,
    });
    return Response.redirect(checkoutUrl, 302);
  } catch {
    return Response.redirect(`${siteUrl()}/contact`, 302);
  }
}
