"use client";

import { useState } from "react";
import { LoaderCircle, Play, RefreshCcw, ShieldCheck } from "lucide-react";

// Manual control room actions — all 18 live retail sources across 9 markets
// run cleanly inside Vercel Hobby (no GitHub Actions needed).
export default function RunButtons({ adminKey }: { adminKey: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");

  async function run(
    label: string,
    payload: {
      action: string;
      state?: string;
      tier?: "fast" | "heavy" | "all";
      force?: boolean;
      dryRun?: boolean;
      limit?: number;
    }
  ) {
    if (busy) return;
    setBusy(label);
    setLog(`Running: ${label}…`);
    try {
      const res = await fetch("/api/admin/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setLog(JSON.stringify(data, null, 2));
      window.setTimeout(
        () => window.location.reload(),
        payload.action === "ingest" ? 2800 : 2000
      );
    } catch (err) {
      setLog(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2.5">
        <Btn
          label="Pull All 9 Markets"
          busy={busy}
          onClick={() => run("Pull All 9 Markets", { action: "ingest", tier: "all" })}
        />
        <Btn
          label="Texas only"
          busy={busy}
          onClick={() => run("Texas only", { action: "ingest", state: "TX" })}
          secondary
        />
        <Btn
          label="New York only"
          busy={busy}
          onClick={() => run("New York only", { action: "ingest", state: "NY" })}
          secondary
        />
        <Btn
          label="California only"
          busy={busy}
          onClick={() => run("California only", { action: "ingest", state: "CA" })}
          secondary
        />
        <Btn
          label="PourWatch Self-Heal"
          busy={busy}
          onClick={() => run("PourWatch Self-Heal", { action: "pourwatch" })}
          secondary
          heal
        />
        <Btn
          label="TX Receipts"
          busy={busy}
          onClick={() => run("TX Receipts", { action: "receipts" })}
          secondary
        />
        <Btn
          label="Send Digests"
          busy={busy}
          onClick={() => run("Send Digests", { action: "digest" })}
          secondary
        />
        <Btn
          label="Weekly Briefings"
          busy={busy}
          onClick={() => run("Weekly Briefings", { action: "briefings" })}
          secondary
        />
        <Btn
          label="Monthly Recaps"
          busy={busy}
          onClick={() => run("Monthly Recaps", { action: "monthly_recaps" })}
          secondary
        />
        <Btn
          label="Outreach Dry-Run"
          busy={busy}
          onClick={() => run("Outreach Dry-Run", { action: "outreach", dryRun: true, limit: 3 })}
          secondary
        />
        <Btn
          label="Send Outreach (3 Live)"
          busy={busy}
          onClick={() => run("Send Outreach (3 Live)", { action: "outreach", dryRun: false, limit: 3 })}
          secondary
        />
        <Btn
          label="Clean Legacy DB"
          busy={busy}
          onClick={() => run("Clean Legacy DB", { action: "maintenance" })}
          secondary
          heal
        />
        <Btn
          label="Test Telegram"
          busy={busy}
          onClick={() => run("Test Telegram", { action: "test_telegram" })}
          secondary
        />
      </div>
      <p className="font-mono text-xs leading-relaxed tracking-[0.1em] text-smoke">
        NOTE: Vercel Cron runs daily automation automatically at 11:00 UTC (zero GitHub Actions
        needed). Manual runs are idempotent — duplicate filings are never created.
      </p>
      {log && (
        <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-ink p-4 font-mono text-xs leading-relaxed text-cream/80">
          {log}
        </pre>
      )}
    </div>
  );
}

function Btn({
  label,
  busy,
  onClick,
  secondary,
  heal,
}: {
  label: string;
  busy: string | null;
  onClick: () => void;
  secondary?: boolean;
  heal?: boolean;
}) {
  const isBusy = busy === label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className={`flex items-center gap-2 rounded-md px-4 py-2.5 font-mono text-xs font-semibold tracking-[0.12em] transition-all disabled:opacity-50 ${
        secondary
          ? "border border-line text-cream/80 hover:border-amber/60 hover:text-amber"
          : "bg-amber text-[#140b0e] hover:scale-[1.03]"
      }`}
    >
      {isBusy ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : heal ? (
        <ShieldCheck className="h-3.5 w-3.5" />
      ) : secondary ? (
        <RefreshCcw className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {label.toUpperCase()}
    </button>
  );
}
