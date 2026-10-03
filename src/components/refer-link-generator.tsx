"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";

// Step 1 + 2 of the referral flow: a rep enters their own email and gets
// their personal link (?ref=them@email.com). The subscribe form on the
// homepage reads that param and stores refBy on the new subscriber, so
// attribution happens automatically — no manual email round-trip.
export default function ReferLinkGenerator() {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://lastcallleads.com";
  const link = valid ? `${base}/?ref=${encodeURIComponent(email.trim().toLowerCase())}` : "";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // clipboard API can be blocked — fallback select+copy
      const el = document.getElementById("ref-link-box") as HTMLTextAreaElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-line bg-panel p-6">
        <Link2 className="h-5 w-5 text-amber" />
        <h2 className="font-display mt-4 text-xl font-medium text-cream">Step 1</h2>
        <p className="mt-2 text-sm leading-relaxed text-smoke">
          Enter your email — we&apos;ll build <span className="text-cream">your</span> referral link:
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setTouched(true);
          }}
          placeholder="you@distribution.com"
          className="mt-3 w-full rounded-md border border-line bg-ink px-3.5 py-2.5 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none"
        />
        {touched && !valid && (
          <p className="mt-2 font-mono text-[10px] text-blood">
            That email does not look right yet.
          </p>
        )}
        {link && (
          <div className="mt-3 flex items-start gap-2">
            <textarea
              id="ref-link-box"
              readOnly
              value={link}
              rows={2}
              className="min-w-0 flex-1 resize-none break-all rounded-md border border-amber/40 bg-ink px-3 py-2 font-mono text-[11px] text-amber"
            />
            <button
              type="button"
              onClick={copy}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber px-3 py-2.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03]"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "COPIED" : "COPY"}
            </button>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display mt-1 text-xl font-medium text-cream">Step 2</h2>
        <p className="mt-2 text-sm leading-relaxed text-smoke">
          Share it with a rep you know. When they sign up through your link and become a
          paying customer, <span className="text-cream">your next month is free</span> —
          their signup carries your email automatically.
        </p>
        <a
          href={`mailto:?subject=${encodeURIComponent(
            "New bar & liquor-license filings (TX/NY/CA…)"
          )}&body=${encodeURIComponent(
            "Check this out — daily filings of new bars and liquor licenses, before the crowds: "
          )}`}
          className="mt-4 inline-block rounded-full border border-amber/50 px-5 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-amber transition-colors hover:bg-amber hover:text-ink"
        >
          DRAFT A SHARE EMAIL
        </a>
      </div>
    </div>
  );
}
