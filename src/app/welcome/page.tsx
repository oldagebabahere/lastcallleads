import Link from "next/link";
import { and, desc, eq, gt, inArray, notLike, sql } from "drizzle-orm";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses, subscribers } from "@/db/schema";
import { buildBeverageDossier, parseEventMeta } from "@/lib/beverage-intel";
import { dedupeKey, isJunkEntity, scoreFiling } from "@/lib/lead-score";
import { LIVE_STATE_SET, formatStateNames } from "@/lib/states";
import {
  checkoutUpgradeUrl,
  exportUrl,
  filingUnlockUrl,
  prefsUrl,
  scopedToken,
  verifyScopedToken,
} from "@/lib/unsubscribe";
import { Footer, Nav } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your territory is live — Instant filings unlocked",
  robots: { index: false },
};

type InstantLead = {
  id: number;
  state: string;
  tradeName: string;
  ownerName: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  archetype: string;
  estSpend: string;
  score: number;
  dateLabel: string;
  unlockHref: string;
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    token?: string;
    states?: string;
    plan?: string;
    session?: string;
  }>;
}) {
  const { email, token, states, plan, session } = await searchParams;
  const cleanEmail = (email ?? "").trim().toLowerCase();
  const tokenValid = Boolean(cleanEmail && token && verifyScopedToken(cleanEmail, token, "unlock"));

  let subStates: string[] = (states ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => LIVE_STATE_SET.has(s));
  let subStatus: string = session === "ok" ? "active" : "trial";
  let subPlan = plan === "pro" ? "pro" : "solo";
  let instantLeads: InstantLead[] = [];

  if (tokenValid) {
    try {
      await ensureSchema();
      const rows = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.email, cleanEmail))
        .limit(1);
      const sub = rows[0];
      if (sub) {
        subStatus = sub.status;
        subPlan = sub.plan;
        const dbStates = sub.states
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s) => LIVE_STATE_SET.has(s));
        if (dbStates.length) subStates = dbStates;
      }

      const targetStates = subStates.length ? subStates : ["TX"];
      const cutoff = new Date(Date.now() - 30 * 86_400_000);
      const raw = await db
        .select()
        .from(events)
        .where(
          and(
            inArray(events.state, targetStates),
            gt(events.occurredAt, cutoff),
            sql`${events.occurredAt} <= now() + interval '1 day'`,
            notLike(events.licenseKey, "TTB-%")
          )
        )
        .orderBy(desc(events.occurredAt))
        .limit(120);

      const best = new Map<string, { e: (typeof raw)[number]; score: number }>();
      for (const e of raw) {
        if (isJunkEntity(e.tradeName, e.ownerName, e.typeName)) continue;
        const sc = scoreFiling({
          eventType: e.eventType,
          typeName: e.typeName,
          city: e.city,
          county: e.county,
          occurredAt: e.occurredAt,
          summary: e.summary,
        }).value;
        const dk = `${e.state}|${dedupeKey(e.tradeName ?? e.ownerName ?? e.summary, e.city)}`;
        const prev = best.get(dk);
        if (!prev || sc > prev.score) best.set(dk, { e, score: sc });
      }

      const top5 = [...best.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const keys = top5.map((x) => x.e.licenseKey).filter((k): k is string => Boolean(k));
      const licMap = new Map<string, { address: string | null; zip: string | null }>();
      if (keys.length) {
        const lics = await db
          .select({
            state: licenses.state,
            key: licenses.licenseKey,
            address: licenses.address,
            zip: licenses.zip,
          })
          .from(licenses)
          .where(
            and(inArray(licenses.state, targetStates), inArray(licenses.licenseKey, keys))
          );
        for (const l of lics) licMap.set(`${l.state}|${l.key}`, l);
      }

      instantLeads = top5.map(({ e, score }) => {
        const meta = parseEventMeta(e.payload);
        const lic = e.licenseKey ? licMap.get(`${e.state}|${e.licenseKey}`) : undefined;
        const dossier = buildBeverageDossier({
          state: e.state,
          eventType: e.eventType,
          tradeName: e.tradeName,
          ownerName: e.ownerName,
          city: e.city,
          typeName: e.typeName,
          occurredAt: e.occurredAt,
        });
        return {
          id: e.id,
          state: e.state,
          tradeName: e.tradeName ?? e.ownerName ?? "New Venue",
          ownerName: e.ownerName && e.ownerName !== e.tradeName ? e.ownerName : null,
          address: lic?.address ?? meta.address ?? null,
          city: e.city,
          zip: lic?.zip ?? meta.zip ?? null,
          archetype: dossier.archetype,
          estSpend: dossier.estAnnualSpend,
          score,
          dateLabel: e.occurredAt
            ? new Date(e.occurredAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
            : "Fresh",
          unlockHref: filingUnlockUrl(e.id, cleanEmail),
        };
      });
    } catch {
      instantLeads = [];
    }
  }

  const primaryState = subStates[0] ?? "TX";
  const unlockedMapHref = tokenValid
    ? `/map?state=${encodeURIComponent(primaryState)}&email=${encodeURIComponent(cleanEmail)}&token=${encodeURIComponent(scopedToken(cleanEmail, "unlock"))}`
    : "/map";
  const csvHref = tokenValid ? exportUrl(cleanEmail) : "/sample";
  const prefsHref = tokenValid ? prefsUrl(cleanEmail) : "/prefs";
  const proCheckoutHref = tokenValid ? checkoutUpgradeUrl(cleanEmail, "pro") : "/#pricing";
  const soloCheckoutHref = tokenValid ? checkoutUpgradeUrl(cleanEmail, "solo") : "/#pricing";
  const territoryPretty = subStates.length ? formatStateNames(subStates.join(",")) : "your selected market";

  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      <div className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-28">
        {/* Hero Status Banner */}
        <div className="rounded-2xl border border-leaf/40 bg-gradient-to-b from-leaf/10 via-panel to-panel p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-leaf/50 bg-leaf/15">
                <CheckCircle2 className="h-6 w-6 text-leaf" />
              </span>
              <div>
                <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-leaf">
                  {subStatus === "active"
                    ? "PAID MEMBERSHIP ACTIVE"
                    : "7-DAY FREE TRIAL UNLOCKED · NO CARD"}
                </p>
                <h1 className="font-display mt-1 text-3xl font-medium text-cream sm:text-4xl">
                  You&apos;re in — <span className="italic text-amber">{territoryPretty}</span> is
                  live.
                </h1>
              </div>
            </div>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-cream/80">
            Don&apos;t wait until tomorrow morning. Your instant territory map, 19-column CRM CSV,
            and top freshly filed venues are{" "}
            <strong className="text-cream">already unlocked below</strong> — plus we just emailed
            your starter dossier straight to your inbox.
          </p>

          {/* 3 Instant Value Action Buttons */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={unlockedMapHref}
              className="inline-flex items-center gap-2 rounded-lg bg-amber px-5 py-3 font-mono text-xs font-bold tracking-[0.12em] text-[#140b0e] transition-transform hover:scale-[1.02]"
            >
              <MapPin className="h-4 w-4" />
              OPEN UNLOCKED MAP + ROUTE PLANNER →
            </Link>
            <a
              href={csvHref}
              className="inline-flex items-center gap-2 rounded-lg border border-amber/45 bg-amber/10 px-4 py-3 font-mono text-xs font-semibold tracking-[0.1em] text-amber hover:bg-amber/20"
            >
              <Download className="h-4 w-4" />
              DOWNLOAD 30-DAY CRM CSV ↓
            </a>
            <a
              href={prefsHref}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-ink px-4 py-3 font-mono text-xs tracking-[0.1em] text-cream/85 hover:border-amber/50 hover:text-amber"
            >
              <SlidersHorizontal className="h-4 w-4" />
              FILTER ZIPS &amp; SLACK ALERTS
            </a>
          </div>
        </div>

        {/* INSTANT GRATIFICATION: Top 5 Real Fresh Venues Unlocked RIGHT NOW! */}
        {instantLeads.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-amber">
                  INSTANT ACCESS · CALL THESE FIRST
                </p>
                <h2 className="font-display mt-1 text-2xl font-medium text-cream">
                  Top {instantLeads.length} freshly filed accounts in {territoryPretty} right now
                </h2>
              </div>
              <Link
                href={unlockedMapHref}
                className="font-mono text-xs text-amber hover:underline"
              >
                Plot all on Google Maps route →
              </Link>
            </div>

            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
              {instantLeads.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-panel2/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber/45 bg-amber/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber">
                        SCORE {v.score}
                      </span>
                      <span className="font-mono text-[11px] text-smoke">{v.dateLabel}</span>
                      <span className="font-mono text-[11px] text-leaf">{v.estSpend}</span>
                    </div>
                    <Link
                      href={v.unlockHref}
                      className="font-display mt-1.5 block truncate text-xl font-medium text-cream hover:text-amber"
                    >
                      {v.tradeName}
                    </Link>
                    <p className="mt-0.5 text-xs text-cream/75">
                      {[v.address, v.city, v.state, v.zip].filter(Boolean).join(", ")}
                      {v.ownerName ? ` · Entity: ${v.ownerName}` : ""}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-smoke">{v.archetype}</p>
                  </div>
                  <Link
                    href={v.unlockHref}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber/50 bg-amber/10 px-4 py-2 font-mono text-[11px] font-bold tracking-[0.1em] text-amber hover:bg-amber hover:text-[#140b0e]"
                  >
                    OPEN DOSSIER &amp; SCRIPT <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* HIGH-CONVERTING PRO UPGRADE MODULE (For Trial Users!) */}
        {subStatus !== "active" && (
          <section className="mt-8 rounded-2xl border border-amber/50 bg-gradient-to-br from-[#2a131a] via-panel to-panel p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/45 bg-amber/15 px-3 py-1 font-mono text-[10px] font-bold tracking-[0.16em] text-amber">
                  <Sparkles className="h-3 w-3" /> MOST DISTRIBUTORS CHOOSE PRO
                </span>
                <h2 className="font-display mt-3 text-2xl font-medium text-cream sm:text-3xl">
                  Lock in your territory before our{" "}
                  <span className="italic text-amber">5-seat cap fills.</span>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-cream/75">
                  We cap every market at <strong className="text-cream">5 active seats</strong> so
                  you&apos;re never fighting 50 competing reps for the same opening bar. One landed
                  liquor or beer account pays for an entire year of alerts.
                </p>
                <ul className="mt-4 grid gap-2 text-xs text-cream/85 sm:grid-cols-2">
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber" /> Up to 3 US States on
                    Pro ($249/mo)
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber" /> Unlimited 19-Column CRM
                    CSV exports
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber" /> Instant Slack / Discord
                    / Zapier webhooks
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber" /> Cancel anytime in 1
                    click · 30-day guarantee
                  </li>
                </ul>
              </div>

              <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:min-w-[260px]">
                <a
                  href={proCheckoutHref}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber px-6 py-3.5 font-mono text-xs font-bold tracking-[0.12em] text-[#140b0e] transition-transform hover:scale-[1.02]"
                >
                  LOCK IN PRO ($249/MO · 3 STATES) →
                </a>
                {subPlan === "solo" && (
                  <a
                    href={soloCheckoutHref}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-ink px-5 py-3 font-mono text-[11px] font-semibold tracking-[0.1em] text-cream/80 hover:border-amber/50 hover:text-amber"
                  >
                    OR LOCK IN SOLO ($129/MO · 1 STATE)
                  </a>
                )}
                <p className="text-center font-mono text-[10px] text-smoke">
                  Keep testing free for 7 days — upgrade anytime.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Gmail Primary Tip */}
        <div className="mt-6 rounded-xl border border-line bg-panel/70 p-4 text-xs leading-relaxed text-smoke">
          <strong className="text-amber">Gmail deliverability tip (5 sec):</strong> Check your
          inbox right now — if our welcome dossier landed in Updates/Promotions, drag it to{" "}
          <strong className="text-cream">Primary</strong> so every 7:00 AM filing hits the top of
          your inbox.
        </div>
      </div>
      <Footer />
    </main>
  );
}
