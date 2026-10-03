import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import Reveal from "@/components/reveal";
import { Footer, LeadRow, Nav } from "@/components/ui";
import { embargoCutoff, maskName } from "@/lib/queries";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live liquor-license filing feed",
  description:
    "Freshly filed liquor-license applications and newly issued licenses across eleven states — straight from official state records.",
};

// Retail-filing states get chips; every state works via the dropdown
// (federal TTB permits flow into all 50).
const FEED_STATES = ["ALL", "TX", "NY", "CA", "FL", "IL", "WA", "OR", "MO", "CO", "CT", "MD"];
const ALL_US_STATES = "AL AK AZ AR CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" ");

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string; signal?: string }>;
}) {
  const { state, q, signal } = await searchParams;
  await ensureSchema();

  // builds filter links that preserve the other filters
  const qs = (over: Record<string, string>) => {
    const merged = { state: state ?? "ALL", signal: signal ?? "ALL", q: q ?? "", ...over };
    const p = new URLSearchParams();
    if (merged.state !== "ALL") p.set("state", merged.state);
    if (merged.signal !== "ALL") p.set("signal", merged.signal);
    if (merged.q) p.set("q", merged.q);
    const str = p.toString();
    return `/feed${str ? `?${str}` : ""}`;
  };

  const conds = [];
  if (state && /^[A-Z]{2}$/.test(state)) {
    conds.push(eq(events.state, state));
  }
  if (signal === "FILED") conds.push(eq(events.eventType, "NEW_PENDING"));
  if (signal === "ISSUED") conds.push(eq(events.eventType, "NEW_LICENSE"));
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    conds.push(
      or(
        ilike(events.summary, like),
        ilike(events.city, like),
        ilike(events.tradeName, like),
        ilike(events.ownerName, like),
        ilike(events.county, like)
      )
    );
  }

  const rows = await db
    .select()
    .from(events)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(events.occurredAt))
    .limit(120);

  const cut = embargoCutoff();

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pt-28 pb-20">
        <Reveal>
          <p className="eyebrow">[ Public feed · 7-day delay on names ]</p>
          <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
            The filing <span className="italic text-amber">ticker.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-smoke">
            Every application and license below is tracked the moment it hits the registry.
            <span className="text-cream">Confidential member intel</span> — names, addresses,
            phones — posts <span className="text-cream">the same morning</span>. This public
            preview reveals full details after 7 days.
          </p>
        </Reveal>

        <form className="mt-8 flex flex-wrap items-center gap-3" method="get">
          <div className="flex flex-wrap rounded-md border border-line">
            {FEED_STATES.map((s) => (
              <a
                key={s}
                href={qs({ state: s })}
                className={`px-4 py-2 font-mono text-[11px] tracking-[0.15em] transition-colors ${
                  (state ?? "ALL") === s
                    ? "bg-amber/15 text-amber"
                    : "text-smoke hover:text-cream"
                }`}
              >
                {s}
              </a>
            ))}
          </div>
          {/* every US state — federal TTB permits flow into all 50 */}
          <select
            name="state"
            defaultValue={state && /^[A-Z]{2}$/.test(state) ? state : ""}
            className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-[11px] tracking-[0.15em] text-smoke focus:border-amber/60 focus:outline-none"
            aria-label="Any US state"
          >
            <option value="">ANY STATE (50)</option>
            {ALL_US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {/* save this search → daily email alerts (city + keywords) */}
          <a
            href={`/prefs${(state || q) ? `?${new URLSearchParams({ ...(state ? { city: "" } : {}), ...(q ? { q } : {}) }).toString()}` : ""}`}
            className="rounded-md border border-amber/40 bg-amber/10 px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-amber transition-colors hover:bg-amber hover:text-ink"
          >
            SAVE THIS SEARCH ⚑
          </a>
          <div className="flex flex-wrap rounded-md border border-line">
            {[
              ["ALL", "ALL SIGNALS"],
              ["FILED", "FILED"],
              ["ISSUED", "ISSUED"],
            ].map(([val, label]) => (
              <a
                key={val}
                href={qs({ signal: val })}
                className={`px-4 py-2 font-mono text-[11px] tracking-[0.15em] transition-colors ${
                  (signal ?? "ALL") === val || (val === "ALL" && !signal)
                    ? val === "FILED"
                      ? "bg-amber/15 text-amber"
                      : val === "ISSUED"
                        ? "bg-leaf/15 text-leaf"
                        : "bg-panel2 text-cream"
                    : "text-smoke hover:text-cream"
                }`}
              >
                {label}
              </a>
            ))}
          </div>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search city, name, county…"
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3.5 py-2 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none sm:max-w-xs"
          />
          <button
            type="submit"
            className="rounded-md bg-amber px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink"
          >
            SEARCH
          </button>
          <a href="/feed" className="font-mono text-[11px] tracking-[0.12em] text-smoke hover:text-cream">
            RESET
          </a>
        </form>

        <div className="mt-8 overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-[86px_1fr_auto] items-center gap-3 border-b border-line bg-panel px-4 py-2.5 sm:grid-cols-[96px_80px_1fr_52px_auto] sm:gap-4">
            <span className="font-mono text-[9px] tracking-[0.25em] text-faint">DATE</span>
            <span className="hidden font-mono text-[9px] tracking-[0.25em] text-faint sm:block">SIGNAL</span>
            <span className="font-mono text-[9px] tracking-[0.25em] text-faint">FILING</span>
            <span className="hidden text-center font-mono text-[9px] tracking-[0.15em] text-faint sm:block">
              SCORE
            </span>
            <span className="font-mono text-[9px] tracking-[0.25em] text-faint">STATE</span>
          </div>
          {rows.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="font-mono text-xs leading-relaxed text-smoke">
                No filings found yet. The machine pulls fresh records on its daily sweep —
                or the owner can run one from the control room.
              </p>
            </div>
          )}
          {rows.map((e) => {
            const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
            const row = locked
              ? { ...e, tradeName: maskName(e.tradeName ?? e.ownerName ?? "Applicant"), ownerName: null }
              : e;
            return <LeadRow key={e.id} e={row} locked={locked} />;
          })}
        </div>
        <p className="mt-4 text-center font-mono text-[10px] tracking-[0.18em] text-faint">
          SHOWING {rows.length} MOST RECENT · NAMES FROM THE LAST 7 DAYS ARE LOCKED
        </p>
      </div>
      <Footer />
    </main>
  );
}
