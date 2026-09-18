"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";

export default function UnsubscribeForm({ email, token }: { email: string; token: string }) {
  const [phase, setPhase] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function unsubscribe() {
    setPhase("sending");
    const query = new URLSearchParams({ email, token });
    const res = await fetch(`/api/unsubscribe?${query}`, { method: "POST" });
    setPhase(res.ok ? "done" : "error");
  }

  if (phase === "done") {
    return (
      <div className="rounded-xl border border-leaf/40 bg-leaf/10 p-6 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-leaf" />
        <p className="mt-3 font-medium text-cream">Alert emails stopped.</p>
        <p className="mt-2 text-sm leading-relaxed text-smoke">
          This changes email preferences only. Contact support separately if you also need to cancel billing.
        </p>
        <Link href="/" className="mt-5 inline-block font-mono text-[11px] tracking-[0.15em] text-amber hover:underline">
          RETURN HOME →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-6 text-center sm:p-8">
      <p className="text-sm leading-relaxed text-smoke">
        Stop daily filing alerts sent to <span className="text-cream">{email}</span>?
      </p>
      <button
        onClick={unsubscribe}
        disabled={phase === "sending"}
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-amber px-5 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink disabled:opacity-50"
      >
        {phase === "sending" && <LoaderCircle className="h-4 w-4 animate-spin" />}
        STOP ALERT EMAILS
      </button>
      {phase === "error" && (
        <p className="mt-4 text-sm text-blood">This link is invalid or expired. Contact support for help.</p>
      )}
    </div>
  );
}
