"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import StatePicker from "@/components/state-picker";

type Phase = "idle" | "sending" | "waitlist" | "error";

// Ask for email + states. If payments are live the server answers with a
// checkout link and we hop straight there; otherwise we confirm the
// early-access spot.
export default function SubscribeForm({ plan }: { plan: "solo" | "pro" }) {
  const [email, setEmail] = useState("");
  const [states, setStates] = useState<string[]>(["TX"]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  // Referral/partner attribution from the URL (?ref=someone@email.com)
  let ref = "";
  if (typeof window !== "undefined") {
    ref = new URLSearchParams(window.location.search).get("ref") ?? "";
  }

  function toggleState(s: string) {
    setStates((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phase === "sending") return;
    setPhase("sending");
    setMessage("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, states, plan, ref }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.ok) {
        setPhase("waitlist");
        setMessage(data.message ?? "You are on the list.");
      } else {
        setPhase("error");
        setMessage(
          data.error === "invalid_email"
            ? "That email does not look right — check it once."
            : "Something hiccuped. Try again."
        );
      }
    } catch {
      setPhase("error");
      setMessage("Network hiccup. Try again.");
    }
  }

  if (phase === "waitlist") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-leaf/30 bg-leaf/10 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf" />
        <div>
          <p className="text-sm font-semibold text-cream">You are locked in.</p>
          <p className="mt-0.5 font-mono text-xs leading-relaxed text-smoke">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <p className="font-mono text-[10px] tracking-[0.18em] text-faint">
          PICK YOUR TERRITORY — ALL 50 STATES
        </p>
        <div className="mt-2">
          <StatePicker
            selected={states}
            onToggle={toggleState}
            max={plan === "solo" ? 1 : 3}
          />
          <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-faint">
            {plan === "solo"
              ? "TERRITORY PLAN = 1 STATE · UPGRADE ANYTIME FOR MORE"
              : "MULTI-STATE PLAN = UP TO 3 STATES · NEED ALL 50? ENTERPRISE"}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@distribution.com"
          className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3.5 py-2.5 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-md bg-amber px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03] disabled:opacity-60"
          disabled={phase === "sending"}
        >
          {phase === "sending" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <>
              START <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
      {phase === "error" && (
        <p className="font-mono text-xs text-blood">{message}</p>
      )}
    </form>
  );
}
