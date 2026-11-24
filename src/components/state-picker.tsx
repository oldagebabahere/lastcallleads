"use client";

import { Check, X } from "lucide-react";
import { LIVE_MARKETS, stateFullName } from "@/lib/states";

export default function StatePicker({
  selected,
  onToggle,
  onClear,
  max = 3,
}: {
  selected: string[];
  onToggle: (code: string) => void;
  onClear?: () => void;
  max?: number;
}) {
  const atMax = selected.length >= max;

  return (
    <div className="rounded-lg border border-line bg-panel p-3 text-cream">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-smoke">
          9 VERIFIED LIVE MARKETS ({selected.length}/{max})
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (onClear) onClear();
              else selected.forEach((s) => onToggle(s));
            }}
            className="font-mono text-[10px] tracking-[0.12em] text-faint hover:text-amber"
          >
            CLEAR
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {LIVE_MARKETS.map((m) => {
          const picked = selected.includes(m.code);
          const disabled = !picked && atMax;
          return (
            <button
              key={m.code}
              type="button"
              disabled={disabled}
              title={`${m.name} (${m.scope}) — ${m.highlight}`}
              onClick={() => onToggle(m.code)}
              className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                picked
                  ? "border-amber/70 bg-amber/15 text-amber"
                  : disabled
                    ? "cursor-not-allowed border-line/50 bg-ink/40 text-faint opacity-45"
                    : "border-line bg-ink/60 text-smoke hover:border-amber/40 hover:text-cream"
              }`}
            >
              <span className="min-w-0 truncate text-xs font-medium">
                {m.name}{" "}
                <span className="font-mono text-[10px] opacity-65">({m.code})</span>
              </span>
              {picked ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-amber" />
              ) : null}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-2.5">
          {selected.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onToggle(s)}
              className="inline-flex items-center gap-1 rounded border border-amber/50 bg-amber/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] text-amber"
            >
              {stateFullName(s)} <X className="h-2.5 w-2.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
