"use client";

import { useState } from "react";
import { ArrowRight, Calculator } from "lucide-react";

export default function RoiCalculator() {
  const [repCount, setRepCount] = useState(2);
  const [dealValue, setDealValue] = useState(2400);
  const [accountsPerRep, setAccountsPerRep] = useState(1);

  const monthlyNewAccounts = repCount * accountsPerRep;
  const annualNewRevenue = monthlyNewAccounts * 12 * dealValue;
  const recommendedTier =
    repCount === 1
      ? { name: "Territory ($129/mo)", monthly: 129 }
      : repCount <= 4
        ? { name: "Multi-State ($249/mo)", monthly: 249 }
        : { name: "Enterprise ($499/mo)", monthly: 499 };
  const toolAnnualCost = recommendedTier.monthly * 12;
  const netRoi = annualNewRevenue - toolAnnualCost;
  const roiMultiple = Math.max(1, Math.round(annualNewRevenue / toolAnnualCost));

  return (
    <div className="rounded-2xl border border-amber/40 bg-gradient-to-b from-panel via-ink to-panel p-6 text-cream shadow-2xl sm:p-10">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber/40 bg-amber/10 text-amber">
          <Calculator className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow">[ Territory ROI Engine ]</p>
          <h3 className="font-display text-2xl font-medium text-cream sm:text-3xl">
            How much is being <span className="italic text-amber">first</span> worth to your team?
          </h3>
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <div>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-smoke">Territory Sales Reps:</span>
              <span className="font-semibold text-amber">
                {repCount} rep{repCount > 1 ? "s" : ""}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={15}
              value={repCount}
              onChange={(e) => setRepCount(Number(e.target.value))}
              aria-label="Territory sales reps"
              className="mt-2 h-2 w-full cursor-pointer rounded-lg bg-panel2 accent-amber"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-smoke">Annual Profit per Landed Account:</span>
              <span className="font-semibold text-amber">
                ${dealValue.toLocaleString()}/yr
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={10000}
              step={100}
              value={dealValue}
              onChange={(e) => setDealValue(Number(e.target.value))}
              aria-label="Annual profit per landed account"
              className="mt-2 h-2 w-full cursor-pointer rounded-lg bg-panel2 accent-amber"
            />
            <p className="mt-1 font-mono text-[10px] text-faint">
              Average margin for a tap handle, spirits rail, insurance policy, or POS contract
            </p>
          </div>

          <div>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-smoke">Extra Accounts / Rep / Month:</span>
              <span className="font-semibold text-amber">
                +{accountsPerRep} / rep ({monthlyNewAccounts} total/mo)
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              value={accountsPerRep}
              onChange={(e) => setAccountsPerRep(Number(e.target.value))}
              aria-label="Extra accounts landed per rep per month"
              className="mt-2 h-2 w-full cursor-pointer rounded-lg bg-panel2 accent-amber"
            />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-line bg-panel2/80 p-6 sm:p-7">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
              Estimated Annual Territory Upside
            </span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-leaf sm:text-5xl">
                +${annualNewRevenue.toLocaleString()}
              </span>
              <span className="font-mono text-xs text-smoke">/year</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-smoke">
              Net profit after <span className="text-cream">${toolAnnualCost.toLocaleString()}</span>/yr{" "}
              ({recommendedTier.name}):{" "}
              <span className="font-mono font-semibold text-leaf">
                +${netRoi.toLocaleString()}
              </span>
            </p>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-smoke">Estimated ROI Multiple:</span>
              <span className="rounded-full border border-amber/40 bg-amber/15 px-2.5 py-0.5 font-bold text-amber">
                {roiMultiple}x Return
              </span>
            </div>
            <a
              href="#pricing"
              onClick={(e) => {
                const target =
                  document.getElementById("act-allocation") ?? document.getElementById("pricing");
                if (target) {
                  e.preventDefault();
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                  window.history.replaceState(null, "", "#pricing");
                }
              }}
              className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-amber py-3 font-mono text-xs font-semibold tracking-[0.12em] text-[#140b0e] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              START 7-DAY FREE TRIAL <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
