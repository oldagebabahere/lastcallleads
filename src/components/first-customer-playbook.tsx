"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Rocket } from "lucide-react";

// A simple, persistent checklist so the owner always has the next action
// in front of them. State lives in localStorage — no backend needed.
const STEPS: { id: string; label: string; hint: string }[] = [
  {
    id: "deploy",
    label: "Site live hai",
    hint: "lastcallleads.com khulta hai aur /coverage pe states dikh rahe hain",
  },
  {
    id: "pull",
    label: "Pehla data pull ho gaya",
    hint: "Dashboard → Pull ALL sources now → saare sources green",
  },
  {
    id: "gsc",
    label: "Google Search Console me sitemap submit kiya",
    hint: "search.google.com/search-console → Sitemaps → sitemap.xml",
  },
  {
    id: "email",
    label: "Email live hai (Resend)",
    hint: "Dashboard → Send digests now → status 'sent' dikh raha hai",
  },
  {
    id: "pay",
    label: "Paisa lene ka raasta ready hai",
    hint: "Razorpay link ya Dodo Payments keys — dono me se ek",
  },
  {
    id: "list",
    label: "Lead Lab CSV download kiya",
    hint: "Dashboard → Lead Lab → DOWNLOAD CSV — pehla prospect list",
  },
  {
    id: "five",
    label: "Pehle 5 outreach emails bheje",
    hint: "OUTREACH.md template — 30 minute ka kaam",
  },
  {
    id: "trial",
    label: "Pehla trial client activate kiya",
    hint: "Dashboard → Add Client → welcome email automatic jayegi",
  },
  {
    id: "paid",
    label: "🎉 Pehla paying customer",
    hint: "Paisa aaya → Add Client → status ACTIVE",
  },
];

export default function FirstCustomerPlaybook() {
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem("lcl_playbook") ?? "{}");
    } catch {
      return {};
    }
  });

  function toggle(id: string) {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try {
      window.localStorage.setItem("lcl_playbook", JSON.stringify(next));
    } catch {
      // storage unavailable — checklist still works for this session
    }
  }

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
            <p className="font-mono text-[10px] tracking-[0.22em] text-amber">
              FIRST CUSTOMER PLAYBOOK
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-smoke">
              {completed} / {STEPS.length} DONE
            </p>
          </div>
        </div>
        {nextStep && (
          <p className="max-w-md text-sm text-cream">
            <span className="font-mono text-[10px] tracking-[0.15em] text-amber">
              NEXT →{" "}
            </span>
            {nextStep.label}
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s) => {
          const isDone = Boolean(done[s.id]);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                isDone
                  ? "border-leaf/40 bg-leaf/5"
                  : "border-line bg-ink hover:border-amber/40"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
              )}
              <span className="min-w-0">
                <span
                  className={`block text-sm ${
                    isDone ? "text-smoke line-through" : "text-cream"
                  }`}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] leading-relaxed text-faint">
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
