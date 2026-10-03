"use client";

// Searchable US-state territory picker. Customer types "tx", "fla", "new
// york" — matching states filter live; click adds a chip, ✕ removes.
// Solves the "50 states but only 12 buttons" problem.
import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { US_STATES } from "@/lib/states";

const POPULAR = ["TX", "NY", "CA", "FL", "IL", "GA", "PA", "OH"];

export default function StatePicker({
  selected,
  onToggle,
  max = 3,
}: {
  selected: string[];
  onToggle: (code: string) => void;
  max?: number;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return US_STATES;
    return US_STATES.filter(
      ([code, name]) =>
        code.toLowerCase().startsWith(needle) ||
        name.toLowerCase().includes(needle)
    );
  }, [q]);

  const atMax = selected.length >= max;

  return (
    <div ref={boxRef} className="rounded-lg border border-line bg-panel">
      {/* search field */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={`Search states — TX, Florida…  (${selected.length}/${max} picked)`}
          className="w-full bg-transparent text-sm text-cream placeholder:text-faint focus:outline-none"
        />
        {selected.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selected.forEach((s) => onToggle(s))}
            className="shrink-0 font-mono text-[10px] tracking-[0.12em] text-faint hover:text-amber"
          >
            CLEAR
          </button>
        )}
      </div>

      {/* dropdown */}
      {open && (
        <div className="max-h-52 overflow-y-auto p-1.5">
          {list.length === 0 && (
            <p className="px-2 py-3 text-sm text-faint">No state matches “{q}”.</p>
          )}
          {list.map(([code, name]) => {
            const picked = selected.includes(code);
            const disabled = !picked && atMax;
            return (
              <button
                key={code}
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onToggle(code);
                  setQ("");
                }}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                  picked
                    ? "bg-amber/15 text-amber"
                    : disabled
                      ? "text-faint"
                      : "text-smoke hover:bg-ink hover:text-cream"
                }`}
              >
                <span>{name}</span>
                <span className="font-mono text-[11px] tracking-[0.12em]">
                  {picked ? "✓" : code}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* selected chips + quick picks */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {selected.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            className="flex items-center gap-1.5 rounded-md border border-amber/60 bg-amber/15 px-2.5 py-1.5 font-mono text-[11px] tracking-[0.12em] text-amber"
          >
            {s} <X className="h-3 w-3" />
          </button>
        ))}
        {selected.length === 0 && (
          <span className="font-mono text-[10px] tracking-[0.12em] text-faint">
            PICK AT LEAST ONE STATE
          </span>
        )}
      </div>

      {/* one-tap popular row (hidden on single-state plans — noise there) */}
      {max > 1 && (
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2.5">
        <span className="mr-1 font-mono text-[9px] tracking-[0.15em] text-faint">
          QUICK ADD
        </span>
        {POPULAR.filter((s) => !selected.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            className="rounded border border-line px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-smoke transition-colors hover:border-amber/50 hover:text-amber"
          >
            + {s}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
