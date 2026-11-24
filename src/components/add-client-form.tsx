"use client";

import { useState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import StatePicker from "@/components/state-picker";

// Manual client onboarding across ALL 50 states + DC and any plan tier.
export default function AddClientForm({ adminKey }: { adminKey: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [states, setStates] = useState<string[]>(["TX"]);
  const [plan, setPlan] = useState<"solo" | "pro" | "enterprise">("solo");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const maxStates = plan === "solo" ? 1 : plan === "pro" ? 3 : 9;

  function toggleState(s: string) {
    setStates((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      if (prev.length >= maxStates) return prev;
      return [...prev, s];
    });
  }

  function onPlanChange(nextPlan: "solo" | "pro" | "enterprise") {
    setPlan(nextPlan);
    const nextMax = nextPlan === "solo" ? 1 : nextPlan === "pro" ? 3 : 9;
    setStates((prev) => prev.slice(0, nextMax));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!states.length) {
      setMsg("❌ Pick at least one state.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({
          action: "add_subscriber",
          email,
          name,
          states: states.join(","),
          plan,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg(
          `✔ ${email} is ACTIVE (${plan} · ${states.join(",")}) — welcome email: ${data.welcome ?? "queued"}.`
        );
        setEmail("");
        setName("");
      } else {
        setMsg("❌ " + (data.error ?? "failed"));
      }
    } catch {
      setMsg("❌ network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-5 rounded-xl border border-amber/40 bg-gradient-to-b from-amber/10 to-panel p-5"
    >
      <p className="font-mono text-xs tracking-[0.22em] text-amber">
        MANUAL CLIENT ONBOARD — 9 LIVE MARKETS · ANY PLAN
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_190px_auto]">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@distribution.com"
          className="min-w-0 rounded-md border border-line bg-ink px-3.5 py-2.5 text-sm text-cream placeholder:text-smoke focus:border-amber/60 focus:outline-none"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="min-w-0 rounded-md border border-line bg-ink px-3.5 py-2.5 text-sm text-cream placeholder:text-smoke focus:border-amber/60 focus:outline-none"
        />
        <select
          value={plan}
          onChange={(e) => onPlanChange(e.target.value as "solo" | "pro" | "enterprise")}
          className="rounded-md border border-line bg-ink px-3 py-2.5 text-sm text-cream focus:border-amber/60 focus:outline-none"
        >
          <option value="solo">Territory ($129 · 1 st)</option>
          <option value="pro">Multi-State ($249 · 3 st)</option>
          <option value="enterprise">Enterprise ($499 · All)</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-md bg-amber px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.12em] text-[#140b0e] transition-transform hover:scale-[1.03] disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserPlus className="h-3.5 w-3.5" />
          )}
          ADD CLIENT
        </button>
      </div>
      <div className="mt-3">
        <StatePicker
          selected={states}
          onToggle={toggleState}
          onClear={() => setStates([])}
          max={maxStates}
        />
      </div>
      {msg && <p className="mt-3 font-mono text-xs leading-relaxed text-cream/80">{msg}</p>}
    </form>
  );
}
