"use client";

import { useState } from "react";
import { LoaderCircle, Mail, Play, Send, ShieldCheck, Sparkles } from "lucide-react";

// Ultra-clean 5-button Executive Command Bar for the Owner Control Room.
export default function RunButtons({ adminKey }: { adminKey: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; title: string; summary: string } | null>(null);
  const [rawJson, setRawJson] = useState<string>("");

  async function run(
    label: string,
    payload: {
      action: string;
      state?: string;
      tier?: "fast" | "heavy" | "all";
      dryRun?: boolean;
      limit?: number;
    }
  ) {
    if (busy) return;
    setBusy(label);
    setStatus(null);
    setRawJson("");
    try {
      const res = await fetch("/api/admin/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as Record<string, unknown>;
      setRawJson(JSON.stringify(data, null, 2));

      let summary = data.ok ? "Completed successfully." : String(data.error ?? "Action returned warning.");
      if (payload.action === "sync_all" && Array.isArray(data.results)) {
        const okN = data.results.filter((r: { ok?: boolean }) => r.ok).length;
        const newEv = data.results.reduce(
          (a: number, r: { newEvents?: number }) => a + Number(r.newEvents ?? 0),
          0
        );
        summary = `${okN}/${data.results.length} feeds synced · +${newEv.toLocaleString()} new filings captured.`;
      } else if (payload.action === "outreach" && data.report && typeof data.report === "object") {
        const rep = data.report as Record<string, unknown>;
        summary = `${rep.stateName ?? rep.state}: ${rep.sent ?? 0} sent, ${rep.followupsSent ?? 0} follow-ups${rep.reason ? ` (${rep.reason})` : ""}.`;
      } else if (payload.action === "maintenance") {
        summary = `Purged ${Number(data.prunedLegacyRows ?? 0).toLocaleString()} legacy rows · DB size: ${data.dbMb ?? "—"} MB.`;
      } else if (payload.action === "test_telegram") {
        summary = data.ok
          ? "Telegram ping sent! Check your phone."
          : `Telegram error: ${String(data.detail ?? "check token/chat id")}`;
      } else if (payload.action === "digest" && data.report && typeof data.report === "object") {
        const rep = data.report as Record<string, unknown>;
        summary = `Digests processed: ${rep.sent ?? 0} sent · ${rep.skipped ?? 0} skipped.`;
      }

      setStatus({ ok: Boolean(data.ok), title: label, summary });
      if (payload.action === "sync_all" || payload.action === "maintenance" || payload.action === "digest") {
        window.setTimeout(() => window.location.reload(), 2400);
      }
    } catch (err) {
      setStatus({
        ok: false,
        title: label,
        summary: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ActionBtn
          label="Sync All 9 States"
          busy={busy}
          primary
          icon={<Play className="h-3.5 w-3.5" />}
          onClick={() => run("Sync All 9 States", { action: "sync_all" })}
        />
        <ActionBtn
          label="Send 3 Outreach"
          busy={busy}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          onClick={() => run("Send 3 Outreach", { action: "outreach", dryRun: false, limit: 3 })}
        />
        <ActionBtn
          label="Send Digests"
          busy={busy}
          icon={<Mail className="h-3.5 w-3.5" />}
          onClick={() => run("Send Digests", { action: "digest" })}
        />
        <ActionBtn
          label="Test Telegram"
          busy={busy}
          icon={<Send className="h-3.5 w-3.5" />}
          onClick={() => run("Test Telegram", { action: "test_telegram" })}
        />
        <ActionBtn
          label="Clean DB"
          busy={busy}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          onClick={() => run("Clean DB", { action: "maintenance" })}
        />
      </div>

      {status && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.ok
              ? "border-leaf/40 bg-leaf/10 text-cream"
              : "border-amber/40 bg-amber/10 text-cream"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <span className="font-mono text-xs font-bold tracking-[0.12em] text-amber">
                {status.title.toUpperCase()}:
              </span>{" "}
              {status.summary}
            </p>
          </div>
          {rawJson && (
            <details className="mt-2">
              <summary className="cursor-pointer font-mono text-[11px] text-smoke hover:text-cream">
                Show raw JSON
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded border border-line bg-ink p-3 font-mono text-[11px] leading-relaxed text-cream/75">
                {rawJson}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  busy,
  primary,
  icon,
  onClick,
}: {
  label: string;
  busy: string | null;
  primary?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const isBusy = busy === label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-mono text-xs font-semibold tracking-[0.1em] transition-all disabled:opacity-50 ${
        primary
          ? "bg-amber text-[#140b0e] hover:brightness-110"
          : "border border-line bg-ink text-cream/85 hover:border-amber/60 hover:text-amber"
      }`}
    >
      {isBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label.toUpperCase()}
    </button>
  );
}
