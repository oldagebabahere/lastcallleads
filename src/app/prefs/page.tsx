import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Nav } from "@/components/ui";
import PrefsForm from "@/components/prefs-form";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Your alert preferences",
  robots: { index: false, follow: false },
};

export default async function PrefsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const p = await searchParams;
  const email = (p.email ?? "").trim().toLowerCase();
  const token = p.token ?? "";
  const valid = Boolean(email && verifyUnsubscribeToken(email, token));

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-2xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Your preferences ]</p>
        <h1 className="font-display mt-4 text-4xl font-medium">
          Shape your <span className="italic text-amber">alerts.</span>
        </h1>

        {valid ? (
          <>
            <p className="mt-4 text-base leading-relaxed text-smoke">
              Signed in as <span className="text-cream">{email}</span> — no password
              needed, this link <em>is</em> your login. Change anything below and your
              next digest follows the new rules.
            </p>
            <div className="mt-8">
              <PrefsForm email={email} token={token} />
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-xl border border-blood/40 bg-blood/10 p-6">
            <p className="text-sm text-cream">
              This preferences link is invalid or has expired.
            </p>
            <p className="mt-2 text-sm text-smoke">
              Every digest email contains your personal preferences link at the bottom —
              use that one.
            </p>
            <a
              href={`mailto:${PUBLIC_CONFIG.contactEmail}`}
              className="mt-4 inline-block font-mono text-[11px] text-amber hover:underline"
            >
              CONTACT {PUBLIC_CONFIG.contactEmail.toUpperCase()}
            </a>
          </div>
        )}

        <div className="mt-10 border-t border-line pt-6">
          <Link
            href="/"
            className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
          >
            ← BACK TO SITE
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
