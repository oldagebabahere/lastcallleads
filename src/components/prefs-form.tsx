"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";
import StatePicker from "@/components/state-picker";

const TAGS: { id: string; label: string }[] = [
  { id: "full-bar", label: "Full bars (spirits)" },
  { id: "restaurant", label: "Restaurants" },
  { id: "package-store", label: "Package stores" },
  { id: "brewery", label: "Breweries & wineries" },
  { id: "beer-wine-only", label: "Beer & wine only" },
  { id: "late-night", label: "Late-night venues" },
  { id: "new-application", label: "New applications only" },
];

type Phase = "loading" | "ready" | "saving" | "saved" | "error";

export default function PrefsForm({
  email,
  token,
  initialCity = "",
  initialQ = "",
}: {
  email: string;
  token: string;
  initialCity?: string;
  initialQ?: string;
}) {
  const qs = new URLSearchParams({ email, token }).toString();

  const [phase, setPhase] = useState<Phase>("loading");
  const [plan, setPlan] = useState("solo");
  const [maxStates, setMaxStates] = useState(1);
  const [states, setStates] = useState<string[]>(["TX"]);
  const [zips, setZips] = useState("");
  const [city, setCity] = useState(initialCity);
  const [keywords, setKeywords] = useState(initialQ);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [limit, setLimit] = useState(40);
  const [exportHref, setExportHref] = useState<string | null>(null);
  const [upgradeHref, setUpgradeHref] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/prefs?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.ok) {
          setPlan(d.prefs.plan ?? "solo");
          setMaxStates(d.prefs.maxStates ?? 1);
          setStates(d.prefs.states?.length ? d.prefs.states : ["TX"]);
          setZips(d.prefs.zipFilter ?? "");
          setCity((prev) => prev || (d.prefs.cityFilter ?? ""));
          setKeywords((prev) => prev || (d.prefs.keywordFilter ?? ""));
          setWebhookUrl(d.prefs.webhookUrl ?? "");
          setTags(d.prefs.typeFilter ? d.prefs.typeFilter.split(",") : []);
          setLimit(d.prefs.digestLimit ?? 40);
          setExportHref(d.prefs.exportHref ?? null);
          setUpgradeHref(d.prefs.upgradeHref ?? null);
          setPhase("ready");
        } else {
          setPhase("error");
        }
      })
      .catch(() => {
        if (active) setPhase("error");
      });
    return () => {
      active = false;
    };
  }, [qs]);

  function toggleState(code: string) {
    setStates((prev) => {
      if (prev.includes(code)) return prev.filter((x) => x !== code);
      if (prev.length >= maxStates) return prev;
      return [...prev, code];
    });
  }

  function toggleTag(id: string) {
    setTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save() {
    setPhase("saving");
    setMessage("");
    try {
      const res = await fetch(`/api/prefs?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          states,
          zipFilter: zips,
          typeFilter: tags.join(","),
          cityFilter: city,
          keywordFilter: keywords,
          webhookUrl,
          digestLimit: limit,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setStates(d.saved.states);
        setPhase("saved");
        setMessage(
          `Saved. ${d.saved.states.join(", ")} · ${d.saved.zips.length} ZIP${
            d.saved.zips.length === 1 ? "" : "s"
          } · ${d.saved.tags.length || "all"} lead type${d.saved.tags.length === 1 ? "" : "s"}`
        );
      } else {
        setPhase("error");
        setMessage(d.error ?? "Could not save preferences.");
      }
    } catch {
      setPhase("error");
      setMessage("Network error — please try again.");
    }
  }

  const input =
    "w-full rounded-md border border-line bg-ink px-3.5 py-2.5 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none";

  if (phase === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-panel p-6 text-sm text-smoke">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Loading your preferences…
      </div>
    );
  }

  if (phase === "error" && !message) {
    return (
      <div className="rounded-xl border border-blood/40 bg-blood/10 p-6 text-sm text-cream">
        Could not load your preferences. Please open the personal preferences link from your latest digest email.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {upgradeHref && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber/50 bg-amber/10 p-5">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber">
              FREE TRIAL · {plan.toUpperCase()} PLAN
            </p>
            <p className="mt-1 text-sm text-cream">
              Keep your daily morning alerts running seamlessly after day 7.
            </p>
          </div>
          <a
            href={upgradeHref}
            className="rounded-md bg-amber px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03]"
          >
            UPGRADE NOW →
          </a>
        </div>
      )}

      {/* 1. States */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          1. Which states?
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Your <span className="font-mono uppercase text-amber">{plan}</span> plan includes up to{" "}
          {maxStates} {maxStates === 1 ? "state" : "states"}.
        </p>
        <div className="mt-4">
          <StatePicker
            selected={states}
            onToggle={toggleState}
            onClear={() => setStates([])}
            max={maxStates}
          />
        </div>
      </section>

      {/* 2. ZIP codes */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          2. Narrow to ZIP codes{" "}
          <span className="font-mono text-[10px] tracking-[0.15em] text-faint">OPTIONAL</span>
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Leave empty to cover the entire state. Separate up to 25 five-digit ZIP codes with commas.
        </p>
        <input
          value={zips}
          onChange={(e) => setZips(e.target.value)}
          placeholder="77019, 77002, 78701"
          className={`${input} mt-4`}
        />
        <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-faint">
          TIP: FOCUSING ON YOUR CORE 5–10 ZIPS MEANS HIGHER-CONVERTING MORNING CALLS
        </p>
      </section>

      {/* 3. Saved search — city + keywords */}
      <section className="rounded-xl border border-amber/40 bg-amber/5 p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          3. Saved search filters{" "}
          <span className="font-mono text-[10px] tracking-[0.15em] text-amber">OPTIONAL</span>
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Restrict your daily digest to a specific city or keywords — only matching filings are sent each morning.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City — e.g. Houston"
            className={input}
          />
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Keywords — e.g. full bar, nightclub"
            className={input}
          />
        </div>
        <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-faint">
          EXAMPLE: CITY &ldquo;HOUSTON&rdquo; + KEYWORD &ldquo;FULL BAR&rdquo; = ONLY HOUSTON FULL-BAR FILINGS
        </p>
      </section>

      {/* 4. Lead types */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          4. Which venue types?
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Leave all unselected to receive every venue category, or select specific categories below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.id)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                tags.includes(t.id)
                  ? "border-amber/60 bg-amber/15 text-amber"
                  : "border-line bg-ink text-smoke hover:text-cream"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* 5. Digest size */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          5. Maximum leads per email
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Short shortlist or comprehensive list — highest-scoring leads always appear at the top.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <input
            type="range"
            min={10}
            max={150}
            step={10}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            aria-label="Maximum leads per email"
            className="h-2 flex-1 cursor-pointer rounded-lg bg-panel2 accent-amber"
          />
          <span className="font-display text-2xl font-semibold text-amber">{limit}</span>
        </div>
      </section>

      {/* 6. Real-time Slack / Discord / Zapier / CRM Webhook Push */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          6. Slack, Discord, or Zapier webhook{" "}
          <span className="font-mono text-[10px] tracking-[0.15em] text-amber">OPTIONAL</span>
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Paste any public <code className="text-cream">https://</code> Slack, Discord, Zapier,
          Make, or HubSpot webhook URL to auto-post new bars straight into your sales channel every
          morning.
        </p>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
          className={`${input} mt-4`}
        />
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={phase === "saving"}
          className="flex items-center gap-2 rounded-md bg-amber px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {phase === "saving" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          SAVE PREFERENCES
        </button>

        {exportHref && (
          <a
            href={exportHref}
            className="rounded-md border border-line px-5 py-3 font-mono text-[11px] tracking-[0.12em] text-smoke transition-colors hover:border-amber/50 hover:text-amber"
          >
            DOWNLOAD LAST 30 DAYS (CSV)
          </a>
        )}

        {(phase === "saved" || message) && (
          <span className="flex items-center gap-2 font-mono text-[11px] text-leaf">
            {phase === "saved" && <CheckCircle2 className="h-4 w-4" />}
            {message}
          </span>
        )}
      </div>

      <p className="font-mono text-[10px] leading-relaxed tracking-[0.06em] text-faint">
        CHANGES APPLY FROM YOUR NEXT MORNING DIGEST. KEEP THIS MAGIC LINK PRIVATE.
      </p>
    </div>
  );
}
