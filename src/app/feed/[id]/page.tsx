import { and, desc, eq, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { db, pool } from "@/db";
import { subscribers } from "@/db/schema";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import { EventBadge, Footer, Nav, StatePill } from "@/components/ui";
import { fmtDate } from "@/lib/fmt";
import { citySlug, embargoCutoff, maskName } from "@/lib/queries";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    await ensureSchema();
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.id, Number(id)))
      .limit(1);
    const e = rows[0];
    if (!e) return { title: "Filing not found" };
    // Embargo applies to metadata too — the full name is member-only until
    // the public cutoff passes. (Title/description leak = embargo bypass.)
    const cut = embargoCutoff();
    const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
    const verb = e.eventType === "NEW_PENDING" ? "application filed" : "license issued";
    if (locked) {
      return {
        title: `New liquor-license ${verb} in ${e.city ?? e.state}`,
        description:
          "A new venue just filed with the state. The name unlocks for the public after the embargo — members see it the same morning it posts.",
      };
    }
    const name = e.tradeName ?? e.ownerName ?? "New applicant";
    return {
      title: `${name} — ${verb} in ${e.city ?? e.state}`,
      description: e.summary,
    };
  } catch {
    return { title: "Liquor-license filing" };
  }
}

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { id } = await params;
  const { email, token } = await searchParams;
  await ensureSchema();

  const rows = await db.select().from(events).where(eq(events.id, Number(id))).limit(1);
  const e = rows[0];
  if (!e) notFound();

  const cut = embargoCutoff();
  let locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;

  // Texas goldmine: does this venue report alcohol receipts? (monthly,
  // public Comptroller data — shows which fish is worth calling first)
  let revenue: { total: number; periodEnd: string } | null = null;
  if (e.state === "TX") {
    try {
      const names = [e.tradeName, e.ownerName]
        .map((n) => (n ?? "").trim().toLowerCase())
        .filter(Boolean);
      if (names.length) {
        const r = await pool.query<{ total: number; period_end: string }>(
          `SELECT total, period_end FROM venue_receipts
           WHERE lower(trade_name) = ANY($1::text[])
           ORDER BY period_end DESC LIMIT 1`,
          [names]
        );
        if (r.rows[0]?.total > 0) {
          revenue = {
            total: Number(r.rows[0].total),
            periodEnd: r.rows[0].period_end,
          };
        }
      }
    } catch {
      // receipts table optional
    }
  }

  // Active subscribers coming from their digest email unlock the page
  // immediately — they already paid for same-day details.
  if (locked && email && token) {
    try {
      if (verifyUnsubscribeToken(email.trim().toLowerCase(), token)) {
        const subs = await db
          .select({ status: subscribers.status, trialEndsAt: subscribers.trialEndsAt })
          .from(subscribers)
          .where(eq(subscribers.email, email.trim().toLowerCase()))
          .limit(1);
        const s = subs[0];
        const trialLive =
          s?.status === "trial" &&
          s.trialEndsAt &&
          new Date(s.trialEndsAt).getTime() > Date.now();
        if (s?.status === "active" || trialLive) locked = false;
      }
    } catch {
      // unlock must never break the page
    }
  }
  const name = locked
    ? maskName(e.tradeName ?? e.ownerName ?? "Applicant")
    : e.tradeName ?? e.ownerName ?? "Unnamed applicant";

  let cityPeers: typeof rows = [];
  if (e.city) {
    cityPeers = await db
      .select()
      .from(events)
      .where(and(ilikeCity(e.city), ne(events.id, e.id)))
      .orderBy(desc(events.occurredAt))
      .limit(6);
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: locked ? "New liquor-license filing (member-only name)" : e.summary,
            datePublished: e.occurredAt?.toISOString(),
            dateModified: e.detectedAt?.toISOString(),
            isAccessibleForFree: !locked,
            about: { "@type": "Place", name: [e.city, e.state].filter(Boolean).join(", ") },
          }),
        }}
      />
      <div className="mx-auto max-w-4xl px-5 pt-28 pb-20">
        <Link href="/feed" className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke hover:text-cream">
          <ArrowLeft className="h-3.5 w-3.5" /> BACK TO FEED
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <EventBadge type={e.eventType} />
          <StatePill state={e.state} />
          <span className="font-mono text-[11px] text-faint">{fmtDate(e.occurredAt)}</span>
        </div>

        <h1 className={`font-display mt-5 text-4xl font-medium leading-tight sm:text-5xl ${locked ? "locked-name" : ""}`}>
          {name}
        </h1>

        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-panel">
          <div className="grid gap-x-8 gap-y-5 p-7 sm:grid-cols-2">
            <Field label="Signal" value={e.eventType === "NEW_PENDING" ? "Application filed — venue is being planned" : e.eventType === "NEW_LICENSE" ? "License issued" : "Status changed"} />
            <Field label="License type" value={e.typeName ?? "—"} />
            <Field label="City" value={e.city ?? "—"} />
            <Field label="County" value={e.county ?? "—"} />
            <Field label="Filed / occurred" value={fmtDate(e.occurredAt)} />
            <Field label="First detected" value={fmtDate(e.detectedAt)} />
          </div>
          {!locked && (
            <div className="border-t border-line px-7 py-5">
              <p className="flex items-center gap-2 font-mono text-[11px] leading-relaxed tracking-[0.1em] text-smoke">
                <MapPin className="h-3.5 w-3.5 text-amber" />
                {[e.city, e.county, e.state].filter(Boolean).join(" · ")}
              </p>
              {/* maps enrichment — one click to the venue, no API key needed */}
              <div className="mt-3 flex flex-wrap gap-2">
                {(() => {
                  const q = encodeURIComponent(
                    [name, e.city, e.state].filter(Boolean).join(" ")
                  );
                  const links = [
                    { label: "GOOGLE MAPS", href: `https://www.google.com/maps/search/?api=1&query=${q}` },
                    { label: "DIRECTIONS", href: `https://www.google.com/maps/dir/?api=1&destination=${q}` },
                    { label: "STREET VIEW", href: `https://www.google.com/maps/search/?api=1&query=${q}&layer=c` },
                    { label: "OSM", href: `https://www.openstreetmap.org/search?query=${q}` },
                  ];
                  return links.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-amber/40 bg-amber/10 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-amber transition-colors hover:bg-amber hover:text-ink"
                    >
                      {l.label} ↗
                    </a>
                  ));
                })()}
              </div>
              <p className="mt-2 font-mono text-[9px] tracking-[0.1em] text-faint">
                VENUE RATING/PHOTOS MAPS PE EK CLICK — SALES CALL SE PEHLE DEKH LO
              </p>
            </div>
          )}
        </div>

        {locked && (
          <div className="mt-6 rounded-xl border border-amber/40 bg-gradient-to-b from-amber/15 to-panel p-7">
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-amber" />
              <p className="font-display text-xl font-medium">Members saw this filing {Math.max(1, Math.ceil(((e.occurredAt?.getTime() ?? 0) - cut.getTime()) / 86_400_000))} day(s) before the public preview.</p>
            </div>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-smoke">
              Subscribers saw the full name and details the morning it posted — while this
              venue is still choosing its suppliers.
            </p>
            <Link
              href="/#pricing"
              className="mt-5 inline-block rounded-full bg-amber px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03]"
            >
              UNLOCK SAME-DAY ALERTS
            </Link>
          </div>
        )}

        {revenue && (
          <div className="mt-6 rounded-xl border border-amber/50 bg-gradient-to-b from-amber/20 to-panel p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] text-amber">
                  ALCOHOL RECEIPTS · TEXAS COMPTROLLER
                </p>
                <p className="mt-2 font-display text-4xl font-light text-cream">
                  ${Math.round(revenue.total).toLocaleString()}
                  <span className="text-lg text-smoke"> /month</span>
                </p>
              </div>
              <p className="max-w-xs font-mono text-[10px] leading-relaxed tracking-[0.08em] text-smoke">
                REPORTING PERIOD ENDING {revenue.periodEnd} — A VENUE THIS SIZE
                IS WORTH CALLING FIRST
              </p>
            </div>
          </div>
        )}

        <div className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-mono text-[11px] tracking-[0.25em] text-faint">
              MORE FILINGS {e.city ? `NEAR ${e.city.toUpperCase()}` : "RECENTLY"}
            </h2>
            {e.city && (
              <Link
                href={`/cities/${citySlug(e.city, e.state)}`}
                className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline"
              >
                {e.city.toUpperCase()} TERRITORY PAGE →
              </Link>
            )}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            {cityPeers.length === 0 && (
              <p className="px-6 py-8 font-mono text-xs text-smoke">No other filings yet.</p>
            )}
            {cityPeers.map((p) => {
              const pLocked = p.occurredAt ? p.occurredAt.getTime() > cut.getTime() : false;
              return (
                <Link
                  key={p.id}
                  href={pLocked ? "/#pricing" : `/feed/${p.id}`}
                  className="grid grid-cols-[90px_1fr_auto] items-center gap-3 border-b border-line/70 px-4 py-3 transition-colors last:border-0 hover:bg-panel"
                >
                  <span className="font-mono text-[11px] text-faint">{fmtDate(p.occurredAt)}</span>
                  <span className={`truncate text-sm ${pLocked ? "locked-name text-smoke" : "text-cream"}`}>
                    {pLocked ? maskName(p.tradeName ?? p.ownerName ?? "Applicant") : p.tradeName ?? p.ownerName ?? "Unnamed applicant"}
                  </span>
                  <StatePill state={p.state} />
                </Link>
              );
            })}
          </div>
          <p className="mt-6 font-mono text-[11px] tracking-[0.12em] text-faint">
            RECORD # {e.id} · DETECTED BY THE {BRAND.name.toUpperCase()} MONITOR
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}

function ilikeCity(city: string) {
  return sql`${events.city} ILIKE ${city}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.22em] text-faint">{label.toUpperCase()}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-cream">{value}</p>
    </div>
  );
}
