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

export default function PrefsForm({ email, token }: { email: string; token: string }) {
  const qs = new URLSearchParams({ email, token }).toString();

  const [phase, setPhase] = useState<Phase>("loading");
  const [states, setStates] = useState<string[]>(["TX"]);
  const [zips, setZips] = useState("");
  const [city, setCity] = useState("");
  const [keywords, setKeywords] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [limit, setLimit] = useState(40);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // "Save this search" from /feed lands here with ?city=…&q=… prefilled.
    const pre = new URLSearchParams(window.location.search);
    const preCity = pre.get("city") ?? "";
    const preQ = pre.get("q") ?? "";
    if (preCity) setCity(preCity);
    if (preQ) setKeywords(preQ);
    fetch(`/api/prefs?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setStates(d.prefs.states?.length ? d.prefs.states : ["TX"]);
          setZips(d.prefs.zipFilter ?? "");
          setCity(d.prefs.cityFilter ?? "");
          setKeywords(d.prefs.keywordFilter ?? "");
          setTags(d.prefs.typeFilter ? d.prefs.typeFilter.split(",") : []);
          setLimit(d.prefs.digestLimit ?? 40);
          setPhase("ready");
        } else {
          setPhase("error");
        }
      })
      .catch(() => setPhase("error"));
  }, [qs]);

  function toggle<T>(list: T[], value: T, setter: (v: T[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function save() {
    setPhase("saving");
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
          digestLimit: limit,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setPhase("saved");
        setMessage(
          `Saved. ${d.saved.states.join(", ")} · ${d.saved.zips.length} ZIP${
            d.saved.zips.length === 1 ? "" : "s"
          } · ${d.saved.tags.length || "all"} lead type${d.saved.tags.length === 1 ? "" : "s"}`
        );
      } else {
        setPhase("error");
        setMessage(d.error ?? "Could not save");
      }
    } catch {
      setPhase("error");
      setMessage("Network error — try again");
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
        Could not load your preferences. Use the link from your latest digest email.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* states */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          1. Which states?
        </h2>
        <p className="mt-1 text-sm text-smoke">Pick every territory you sell into.</p>
        <div className="mt-4">
          <StatePicker selected={states} onToggle={(s) => toggle(states, s, setStates)} max={3} />
        </div>
            </section>

      {/* zips */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          2. Narrow to ZIP codes{" "}
          <span className="font-mono text-[10px] tracking-[0.15em] text-faint">
            OPTIONAL
          </span>
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Leave empty to receive the whole state. Separate up to 25 ZIPs with commas.
        </p>
        <input
          value={zips}
          onChange={(e) => setZips(e.target.value)}
          placeholder="77019, 77002, 78701"
          className={`${input} mt-4`}
        />
        <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-faint">
          TIP: YOUR BEST 5 ZIPS BEAT THE WHOLE STATE — FEWER, BETTER CALLS
        </p>
      </section>

      {/* saved search — city + keywords */}
      <section className="rounded-xl border border-amber/40 bg-amber/5 p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          Saved search{" "}
          <span className="font-mono text-[10px] tracking-[0.15em] text-amber">
            ALERTS
          </span>
        </h2>
        <p className="mt-1 text-sm text-smoke">
          City ya keywords — sirf matching filings aayenge, roz subah.
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
          EXAMPLE: CITY "HOUSTON" + KEYWORD "FULL BAR" = SIRF HOUSTON KE FULL-BAR FILINGS
        </p>
      </section>

      {/* lead types */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          3. Which kinds of venue?
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Pick none to receive every type. Pick one or more to filter.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(tags, t.id, setTags)}
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

      {/* size */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-xl font-medium text-cream">
          4. How many per email?
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Long list or short shortlist — your call. Highest-scoring always come first.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <input
            type="range"
            min={10}
            max={150}
            step={10}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer rounded-lg bg-panel2 accent-amber"
          />
          <span className="font-display text-2xl font-semibold text-amber">{limit}</span>
        </div>
      </section>

      {/* save */}
      <div className="flex flex-wrap items-center gap-4">
        <button
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

        <a
          href={`/api/export?${qs}`}
          className="rounded-md border border-line px-5 py-3 font-mono text-[11px] tracking-[0.12em] text-smoke transition-colors hover:border-amber/50 hover:text-amber"
        >
          DOWNLOAD LAST 30 DAYS (CSV)
        </a>

        {(phase === "saved" || message) && (
          <span className="flex items-center gap-2 font-mono text-[11px] text-leaf">
            {phase === "saved" && <CheckCircle2 className="h-4 w-4" />}
            {message}
          </span>
        )}
      </div>

      <p className="font-mono text-[10px] leading-relaxed tracking-[0.06em] text-faint">
        CHANGES APPLY FROM YOUR NEXT DIGEST. THIS LINK IS PRIVATE — ANYONE WITH IT CAN
        EDIT THESE SETTINGS.
      </p>
    </div>
  );
}
