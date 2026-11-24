import Link from "next/link";
import { and, desc, eq, ilike, inArray, notLike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import Reveal from "@/components/reveal";
import { Footer, LeadRow, Nav } from "@/components/ui";
import { embargoCutoff, maskName } from "@/lib/queries";
import { isJunkEntity } from "@/lib/lead-score";
import {
  LIVE_MARKETS,
  LIVE_STATE_CODES,
  LIVE_STATE_NAMES_LIST,
  LIVE_STATE_SET,
} from "@/lib/states";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live liquor-license filing feed — 9 verified US markets",
  description: `Freshly filed bar, restaurant & liquor-store license applications across ${LIVE_STATE_NAMES_LIST}.`,
  alternates: { canonical: "/feed" },
};

const FEED_STATE_OPTIONS = [
  { code: "ALL", label: "All Markets" },
  ...LIVE_MARKETS.map((m) => ({ code: m.code, label: m.name })),
];

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string; signal?: string }>;
}) {
  const { state, q, signal } = await searchParams;
  const upper = state?.toUpperCase();
  const cleanState = upper && LIVE_STATE_SET.has(upper) ? upper : undefined;

  const qs = (over: Record<string, string>) => {
    const merged = { state: cleanState ?? "ALL", signal: signal ?? "ALL", q: q ?? "", ...over };
    const p = new URLSearchParams();
    if (merged.state !== "ALL") p.set("state", merged.state);
    if (merged.signal !== "ALL") p.set("signal", merged.signal);
    if (merged.q) p.set("q", merged.q);
    const str = p.toString();
    return `/feed${str ? `?${str}` : ""}`;
  };

  let rows: (typeof events.$inferSelect)[] = [];
  try {
    await ensureSchema();
    const conds = [
      notLike(events.licenseKey, "TTB-%"),
      sql`${events.occurredAt} <= now() + interval '1 day'`,
      cleanState ? eq(events.state, cleanState) : inArray(events.state, LIVE_STATE_CODES),
    ];
    if (signal === "FILED") conds.push(eq(events.eventType, "NEW_PENDING"));
    if (signal === "ISSUED") conds.push(eq(events.eventType, "NEW_LICENSE"));
    if (signal === "STATUS") conds.push(eq(events.eventType, "STATUS_CHANGE"));
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      conds.push(
        or(
          ilike(events.summary, like),
          ilike(events.city, like),
          ilike(events.tradeName, like),
          ilike(events.ownerName, like),
          ilike(events.county, like)
        )!
      );
    }

    const raw = await db
      .select()
      .from(events)
      .where(and(...conds))
      .orderBy(desc(events.occurredAt))
      .limit(160);

    rows = raw
      .filter((e) => !isJunkEntity(e.tradeName, e.ownerName, e.typeName))
      .slice(0, 120);
  } catch {
    rows = [];
  }

  const cut = embargoCutoff();

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-28">
        <Reveal>
          <p className="eyebrow">[ Live public feed · 9 verified markets · 7-day embargo ]</p>
          <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">
            The filing <span className="italic text-amber">ticker.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-smoke">
            Every bar, restaurant &amp; liquor-store filing below is tracked straight from official
            state registries. <span className="text-cream">Subscribers</span> get the full beverage
            dossier — name, street address, LLC entity, phone (where filed), and pitch script —{" "}
            <span className="text-cream">the same morning</span>. Public preview unlocks after 7
            days.
          </p>
        </Reveal>

        <form className="mt-8 flex flex-wrap items-center gap-3" method="get">
          {cleanState && <input type="hidden" name="state" value={cleanState} />}
          {signal && signal !== "ALL" && <input type="hidden" name="signal" value={signal} />}
          <div className="flex flex-wrap rounded-md border border-line">
            {FEED_STATE_OPTIONS.map((opt) => (
              <Link
                key={opt.code}
                href={qs({ state: opt.code })}
                className={`px-3 py-2 font-mono text-[11px] tracking-[0.08em] transition-colors ${
                  (cleanState ?? "ALL") === opt.code
                    ? "bg-amber/15 text-amber"
                    : "text-smoke hover:text-cream"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <Link
            href="/#pricing"
            className="rounded-md border border-amber/40 bg-amber/10 px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-amber transition-colors hover:bg-amber hover:text-[#140b0e]"
          >
            START 7-DAY FREE TRIAL →
          </Link>
          <div className="flex flex-wrap rounded-md border border-line">
            {[
              ["ALL", "ALL SIGNALS"],
              ["FILED", "FILED"],
              ["ISSUED", "ISSUED"],
              ["STATUS", "STATUS"],
            ].map(([val, label]) => (
              <Link
                key={val}
                href={qs({ signal: val })}
                className={`px-3.5 py-2 font-mono text-[11px] tracking-[0.15em] transition-colors ${
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
              </Link>
            ))}
          </div>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search city, venue, county…"
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3.5 py-2 text-sm text-cream placeholder:text-faint focus:border-amber/60 focus:outline-none sm:max-w-xs"
          />
          <button
            type="submit"
            className="rounded-md bg-amber px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-[#140b0e]"
          >
            SEARCH
          </button>
          <Link
            href="/feed"
            className="font-mono text-[11px] tracking-[0.12em] text-smoke hover:text-cream"
          >
            RESET
          </Link>
        </form>

        <div className="mt-8 overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-[86px_1fr_auto] items-center gap-3 border-b border-line bg-panel px-4 py-2.5 sm:grid-cols-[96px_80px_1fr_52px_auto] sm:gap-4">
            <span className="font-mono text-[9px] tracking-[0.25em] text-faint">DATE</span>
            <span className="hidden font-mono text-[9px] tracking-[0.25em] text-faint sm:block">
              SIGNAL
            </span>
            <span className="font-mono text-[9px] tracking-[0.25em] text-faint">FILING</span>
            <span className="hidden text-center font-mono text-[9px] tracking-[0.15em] text-faint sm:block">
              SCORE
            </span>
            <span className="font-mono text-[9px] tracking-[0.25em] text-faint">STATE</span>
          </div>
          {rows.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="font-mono text-xs leading-relaxed text-smoke">
                No filings match those filters yet. Try clearing a filter, or check back after the
                next morning sweep.
              </p>
            </div>
          )}
          {rows.map((e) => {
            const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
            const row = locked
              ? {
                  ...e,
                  tradeName: maskName(e.tradeName ?? e.ownerName ?? "Applicant"),
                  ownerName: null,
                }
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
