"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import StatePicker from "@/components/state-picker";
import { LIVE_STATE_SET } from "@/lib/states";

type Phase = "idle" | "sending" | "done" | "error";

export default function SubscribeForm({
  plan,
  defaultState = "TX",
}: {
  plan: "solo" | "pro";
  defaultState?: string;
}) {
  const maxStates = plan === "solo" ? 1 : 3;
  const initialSt = LIVE_STATE_SET.has(defaultState.toUpperCase())
    ? defaultState.toUpperCase()
    : "TX";
  const [email, setEmail] = useState("");
  const [states, setStates] = useState<string[]>([initialSt]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const qsState = (new URLSearchParams(window.location.search).get("state") ?? "")
      .trim()
      .toUpperCase();
    if (qsState && LIVE_STATE_SET.has(qsState) && qsState !== initialSt) {
      queueMicrotask(() => setStates([qsState]));
    }
  }, [initialSt]);

  function toggleState(s: string) {
    setStates((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      if (prev.length >= maxStates) return prev;
      return [...prev, s];
    });
  }

  async function submitFlow(immediateCheckout: boolean) {
    if (phase === "sending") return;
    if (!states.length) {
      setPhase("error");
      setMessage("Please pick at least one state first.");
      return;
    }
    setPhase("sending");
    setMessage("");
    const ref =
      typeof window !== "undefined"
        ? (new URLSearchParams(window.location.search).get("ref") ?? "")
        : "";
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, states, plan, ref, immediateCheckout }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.ok && data.welcomeUrl) {
        window.location.href = data.welcomeUrl;
        return;
      }
      if (data.ok) {
        setPhase("done");
        setMessage(data.message ?? "Your 7-day free trial is active.");
      } else {
        setPhase("error");
        setMessage(
          data.message ??
          (data.error === "invalid_email"
            ? "That email does not look right — please double-check it."
            : data.error === "pick_at_least_one_state"
              ? "Please select at least one state."
              : "Something hiccuped. Please try again.")
        );
      }
    } catch {
      setPhase("error");
      setMessage("Network hiccup. Please try again.");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submitFlow(false);
  }

  if (phase === "done") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-leaf/40 bg-panel p-4 text-left">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf" />
        <div>
          <p className="text-sm font-semibold text-cream">You are locked in.</p>
          <p className="mt-1 font-mono text-xs leading-relaxed text-smoke">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <p className="font-mono text-[10px] tracking-[0.18em] opacity-75">
          {plan === "solo" ? "PICK YOUR STATE" : "PICK UP TO 3 STATES"}
        </p>
        <div className="mt-2">
          <StatePicker
            selected={states}
            onToggle={toggleState}
            onClear={() => setStates([])}
            max={maxStates}
          />
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
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-[#140b0e] transition-transform hover:scale-[1.03] disabled:opacity-60"
          disabled={phase === "sending"}
        >
          {phase === "sending" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <>
              START FREE <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-mono text-[10px] opacity-70">7 days free · no card</span>
        <button
          type="button"
          disabled={phase === "sending" || !email.includes("@")}
          onClick={() => void submitFlow(true)}
          className="font-mono text-[10px] underline underline-offset-2 opacity-75 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Skip trial &amp; subscribe now
        </button>
      </div>
      {phase === "error" && (
        <p className="font-mono text-xs text-blood">{message}</p>
      )}
    </form>
  );
}
