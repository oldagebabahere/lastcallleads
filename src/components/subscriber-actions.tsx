"use client";

import { useState } from "react";
import { LoaderCircle, Pause, Play } from "lucide-react";

// Money-bridge buttons: turn a subscriber on or off by hand — for the early
// customers who pay you through UPI/Razorpay/wire before a gateway exists.
export default function SubscriberActions({
  adminKey,
  email,
  status,
}: {
  adminKey: string;
  email: string;
  status: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setStatus(next: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey, action: "set_status", email, status: next }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error ?? "failed");
      else window.location.reload();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {error && <span className="font-mono text-xs text-blood">{error}</span>}
      {status === "active" ? (
        <button
          onClick={() => setStatus("canceled")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 font-mono text-xs tracking-[0.12em] text-cream/70 transition-colors hover:border-blood/60 hover:text-blood disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
          PAUSE
        </button>
      ) : (
        <button
          onClick={() => setStatus("active")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-leaf/50 bg-leaf/10 px-3 py-1.5 font-mono text-xs font-semibold tracking-[0.12em] text-leaf transition-transform hover:scale-[1.04] disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          ACTIVATE
        </button>
      )}
    </span>
  );
}
