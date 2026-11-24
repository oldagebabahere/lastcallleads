"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { CheckCircle2, Circle, Rocket } from "lucide-react";

const STORAGE_KEY = "lcl_playbook";
const EMPTY_SNAPSHOT = "{}";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

const STEPS: { id: string; label: string; hint: string }[] = [
  {
    id: "deploy",
    label: "Site & domain live",
    hint: "Custom domain opens cleanly and /coverage-page + /map show live state feeds",
  },
  {
    id: "pull",
    label: "Initial 9-market sweep completed",
    hint: "Dashboard → Pull All 9 Markets (then Vercel Cron runs daily at 11:00 UTC)",
  },
  {
    id: "gsc",
    label: "Sitemap submitted to Google Search Console",
    hint: "search.google.com/search-console → Sitemaps → sitemap.xml",
  },
  {
    id: "email",
    label: "Resend domain verified & tested",
    hint: "Customer Manager → Send Test Email → status 'sent'",
  },
  {
    id: "pay",
    label: "Dodo Payments + webhook live",
    hint: "DODO_API_KEY + product IDs + DODO_WEBHOOK_SECRET configured",
  },
  {
    id: "list",
    label: "Lead Lab CSV exported",
    hint: "Dashboard → Section 5 → DOWNLOAD CSV for first outreach batch",
  },
  {
    id: "five",
    label: "24/7 Google Apps Script Autopilot ON",
    hint: "Staggered Groq AI outreach (14-day Gmail warm-up) + daily Telegram reports",
  },
  {
    id: "trial",
    label: "First 7-day trial subscriber active",
    hint: "Verify trial-start email & morning digest delivery",
  },
  {
    id: "paid",
    label: "First paying subscriber live",
    hint: "Dodo webhook flips status to ACTIVE automatically",
  },
];

export default function FirstCustomerPlaybook() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
  const done = useMemo<Record<string, boolean>>(() => {
    try {
      return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      return {};
    }
  }, [raw]);

  const toggle = useCallback(
    (id: string) => {
      const next = { ...done, [id]: !done[id] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable
      }
      listeners.forEach((cb) => cb());
    },
    [done]
  );

  const completed = STEPS.filter((s) => done[s.id]).length;
  const nextStep = STEPS.find((s) => !done[s.id]);

  return (
    <div className="rounded-xl border border-amber/40 bg-gradient-to-b from-amber/10 to-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber/40 bg-amber/10">
            <Rocket className="h-4 w-4 text-amber" />
          </span>
          <div>
            <p className="font-mono text-xs tracking-[0.22em] text-amber">
              LAUNCH &amp; FIRST-CUSTOMER PLAYBOOK
            </p>
            <p className="mt-0.5 font-mono text-xs text-cream/70">
              {completed} / {STEPS.length} DONE
            </p>
          </div>
        </div>
        {nextStep && (
          <p className="max-w-md text-sm text-cream">
            <span className="font-mono text-xs tracking-[0.15em] text-amber">NEXT → </span>
            {nextStep.label}
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s) => {
          const isDone = Boolean(done[s.id]);
          return (
            <button
              type="button"
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${isDone
                ? "border-leaf/40 bg-leaf/5"
                : "border-line bg-ink hover:border-amber/40"
                }`}
            >
              {isDone ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-smoke" />
              )}
              <span className="min-w-0">
                <span
                  className={`block text-sm ${isDone ? "text-cream/70 line-through" : "text-cream"
                    }`}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 block font-mono text-xs leading-relaxed text-smoke">
                  {s.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
