"use client";

import { useState } from "react";
import { LoaderCircle, Play, RefreshCcw } from "lucide-react";

// The manual override panel: pull data now / send digests now.
// Automation runs daily on its own — these are just for showing off or testing.
export default function RunButtons({ adminKey }: { adminKey: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");

  async function run(action: string, label: string, source?: string) {
    if (busy) return;
    setBusy(label);
    setLog(`Running: ${label}…`);
    try {
      const res = await fetch("/api/admin/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey, action, source }),
      });
      const data = await res.json();
      setLog(JSON.stringify(data, null, 2));
      window.setTimeout(() => window.location.reload(), mutateMs(action));
    } catch (err) {
      setLog(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Btn label="Pull ALL sources now" busy={busy} onClick={() => run("ingest", "Pull all")} />
        <Btn label="Texas only" busy={busy} onClick={() => run("ingest", "Texas", "tx-pending")} secondary />
        <Btn label="New York only" busy={busy} onClick={() => run("ingest", "New York", "ny-pending")} secondary />
        <Btn label="Send digests now" busy={busy} onClick={() => run("digest", "Digests")} secondary />
        <Btn label="Send weekly briefings" busy={busy} onClick={() => run("briefings", "Briefings")} secondary />
        <Btn label="Send monthly recaps" busy={busy} onClick={() => run("monthly_recaps", "Monthly Recaps")} secondary />
      </div>
      <p className="font-mono text-[10px] leading-relaxed tracking-[0.1em] text-faint">
        NOTE: these run every morning automatically (12:00 + 12:20 UTC). Manual runs are
        safe — the machine never records the same filing twice.
      </p>
      {log && (
        <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-ink p-4 font-mono text-[11px] leading-relaxed text-smoke">
          {log}
        </pre>
      )}
    </div>
  );
}

function mutateMs(action: string): number {
  return action === "ingest" ? 2500 : 2000;
}

function Btn({
  label,
  busy,
  onClick,
  secondary,
}: {
  label: string;
  busy: string | null;
  onClick: () => void;
  secondary?: boolean;
}) {
  const isBusy = busy === label;
  return (
    <button
      onClick={onClick}
      disabled={busy !== null}
      className={`flex items-center gap-2 rounded-md px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] transition-all disabled:opacity-50 ${
        secondary
          ? "border border-line text-smoke hover:border-smoke hover:text-cream"
          : "bg-amber text-ink hover:scale-[1.03]"
      }`}
    >
      {isBusy ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : secondary ? (
        <RefreshCcw className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {label.toUpperCase()}
    </button>
  );
}
