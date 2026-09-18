"use client";

import { useState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";

// Manual client onboarding — the "deal closed on email" path.
// Type the client's email, pick their states, press ADD → they are active
// immediately and receive their first digest at the next 12:20 UTC sweep.
export default function AddClientForm({ adminKey }: { adminKey: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [states, setStates] = useState<string[]>(["TX"]);
  const [plan, setPlan] = useState<"solo" | "pro">("solo");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function toggleState(s: string) {
    setStates((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: adminKey,
          action: "add_subscriber",
          email,
          name,
          states: states.join(","),
          plan,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg(`✔ ${email} is ACTIVE — first digest lands at the next morning sweep.`);
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
    <form onSubmit={submit} className="mb-5 rounded-xl border border-amber/40 bg-gradient-to-b from-amber/10 to-panel p-5">
      <p className="font-mono text-[10px] tracking-[0.25em] text-amber">
        MANUAL CLIENT ONBOARD — DEAL CLOSED ON EMAIL? ADD THEM HERE
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
        <div className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@distribution.com"
            className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3.5 py-2.5 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="hidden w-40 rounded-md border border-line bg-ink px-3.5 py-2.5 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none sm:block"
          />
        </div>
        <div className="flex gap-2">
          {["TX", "NY"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleState(s)}
              className={`flex-1 rounded-md border px-3 py-2 font-mono text-[11px] tracking-[0.15em] ${
                states.includes(s)
                  ? "border-amber/60 bg-amber/15 text-amber"
                  : "border-line bg-ink text-smoke"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-md bg-amber px-5 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03] disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          ADD CLIENT
        </button>
      </div>
      {msg && <p className="mt-3 font-mono text-[11px] leading-relaxed text-smoke">{msg}</p>}
    </form>
  );
}
