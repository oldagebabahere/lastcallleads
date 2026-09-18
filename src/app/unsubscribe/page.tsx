import type { Metadata } from "next";
import UnsubscribeForm from "@/components/unsubscribe-form";
import { Footer, Nav } from "@/components/ui";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const p = await searchParams;
  const email = (p.email ?? "").trim().toLowerCase();
  const token = p.token ?? "";
  const valid = Boolean(email && verifyUnsubscribeToken(email, token));

  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      <div className="mx-auto flex w-full max-w-xl flex-1 items-center px-5 pb-16 pt-28">
        <div className="w-full">
          <p className="eyebrow text-center">[ Email preferences ]</p>
          <h1 className="font-display mt-4 text-center text-4xl font-medium">
            Control your <span className="italic text-amber">alerts.</span>
          </h1>
          <div className="mt-8">
            {/* Important: stopping emails and cancelling billing are two
                different things. Say so plainly so nobody is surprised. */}
            {valid && (
              <div className="mb-5 rounded-xl border border-line bg-panel p-5">
                <p className="font-mono text-[10px] tracking-[0.2em] text-faint">
                  TWO SEPARATE THINGS
                </p>
                <p className="mt-3 text-sm leading-relaxed text-smoke">
                  <span className="text-cream">Stopping emails</span> only turns off the
                  daily alerts — your subscription keeps running.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-smoke">
                  <span className="text-cream">Cancelling billing</span> is done in your
                  billing portal, in two clicks, with no need to contact us.
                </p>
                <a
                  href={PUBLIC_CONFIG.billingPortalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block rounded-md border border-amber/50 bg-amber/10 px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-amber"
                >
                  OPEN BILLING PORTAL →
                </a>
              </div>
            )}
            {valid ? (
              <UnsubscribeForm email={email} token={token} />
            ) : (
              <div className="rounded-xl border border-blood/40 bg-blood/10 p-6 text-center">
                <p className="text-sm text-cream">This unsubscribe link is invalid.</p>
                <a href={`mailto:${PUBLIC_CONFIG.contactEmail}`} className="mt-3 inline-block font-mono text-[11px] text-amber hover:underline">
                  CONTACT {PUBLIC_CONFIG.contactEmail.toUpperCase()}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
