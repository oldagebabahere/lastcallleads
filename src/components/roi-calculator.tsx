"use client";

import { useState } from "react";
import { ArrowRight, Calculator, DollarSign, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function RoiCalculator() {
  const [repCount, setRepCount] = useState(2);
  const [dealValue, setDealValue] = useState(2400); // average annual value of 1 landed account
  const [closeRate, setCloseRate] = useState(3); // extra accounts landed per month across the territory

  const monthlyNewAccounts = closeRate;
  const annualNewRevenue = monthlyNewAccounts * 12 * dealValue;
  const toolAnnualCost = 129 * 12; // $1,548/yr
  const netRoi = annualNewRevenue - toolAnnualCost;
  const roiMultiple = Math.round(annualNewRevenue / toolAnnualCost);

  return (
    <div className="rounded-2xl border border-amber/40 bg-gradient-to-b from-panel via-ink to-panel p-6 sm:p-10 shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber/40 bg-amber/10 text-amber">
          <Calculator className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow">[ Territory ROI Engine ]</p>
          <h3 className="font-display text-2xl font-medium text-cream sm:text-3xl">
            How much is being <span className="italic text-amber">first</span> worth to your route?
          </h3>
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {/* Sliders */}
        <div className="space-y-6">
          <div>
            <div className="flex justify-between text-sm font-mono">
              <span className="text-smoke">Territory Sales Reps:</span>
              <span className="text-amber font-semibold">{repCount} rep{repCount > 1 ? "s" : ""}</span>
            </div>
            <input
              type="range"
              min={1}
              max={15}
              value={repCount}
              onChange={(e) => setRepCount(Number(e.target.value))}
              className="mt-2 w-full accent-amber bg-panel2 h-2 rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-sm font-mono">
              <span className="text-smoke">Annual Profit per New Account:</span>
              <span className="text-amber font-semibold">${dealValue.toLocaleString()}/yr</span>
            </div>
            <input
              type="range"
              min={500}
              max={10000}
              step={100}
              value={dealValue}
              onChange={(e) => setDealValue(Number(e.target.value))}
              className="mt-2 w-full accent-amber bg-panel2 h-2 rounded-lg cursor-pointer"
            />
            <p className="mt-1 font-mono text-[10px] text-faint">
              (Average for beer tap handle, spirits rail, or POS subscription)
            </p>
          </div>

          <div>
            <div className="flex justify-between text-sm font-mono">
              <span className="text-smoke">Extra Accounts Landed / Month (First Mover):</span>
              <span className="text-amber font-semibold">+{closeRate} account{closeRate > 1 ? "s" : ""}/mo</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={closeRate}
              onChange={(e) => setCloseRate(Number(e.target.value))}
              className="mt-2 w-full accent-amber bg-panel2 h-2 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Output Box */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-panel2/70 p-6 sm:p-7">
          <div>
            <span className="font-mono text-[10px] tracking-[0.2em] text-faint uppercase">Estimated Territory Upside</span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl sm:text-5xl font-bold text-leaf">
                +${annualNewRevenue.toLocaleString()}
              </span>
              <span className="font-mono text-xs text-smoke">/year</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-smoke">
              Net profit after <span className="text-cream">${toolAnnualCost.toLocaleString()}</span> tool cost:{" "}
              <span className="font-mono text-leaf font-semibold">+${netRoi.toLocaleString()}</span>
            </p>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-smoke">Estimated ROI Multiple:</span>
              <span className="rounded-full bg-amber/15 border border-amber/40 px-2.5 py-0.5 text-amber font-bold">
                {roiMultiple}x Return
              </span>
            </div>
            <a
              href="#pricing"
              className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-amber py-3 font-mono text-xs font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.02]"
            >
              LOCK IN YOUR TERRITORY <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
