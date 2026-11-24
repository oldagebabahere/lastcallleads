import { and, desc, eq, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Flame,
  LockKeyhole,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { db, pool } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses, subscribers } from "@/db/schema";
import { verifyScopedToken } from "@/lib/unsubscribe";
import { buildBeverageDossier, parseEventMeta } from "@/lib/beverage-intel";
import { scoreFiling, tierLabel } from "@/lib/lead-score";
import { EventBadge, Footer, Nav, StatePill } from "@/components/ui";
import OutreachKit from "@/components/outreach-kit";
import VenueMiniMap from "@/components/venue-mini-map";
import { fmtDate } from "@/lib/fmt";
import { citySlug, embargoCutoff, maskName } from "@/lib/queries";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numId = parseId(id);
  if (!numId) return { title: "Filing not found" };
  try {
    await ensureSchema();
    const rows = await db.select().from(events).where(eq(events.id, numId)).limit(1);
    const e = rows[0];
    if (!e) return { title: "Filing not found" };
    const cut = embargoCutoff();
    const locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;
    const verb =
      e.eventType === "NEW_PENDING"
        ? "application filed"
        : e.eventType === "STATUS_CHANGE"
          ? "status update"
          : "license issued";
    if (locked) {
      return {
        title: `New liquor-license ${verb} in ${e.city ?? e.state}`,
        description:
          "A new venue just filed with the state. Full beverage dossier unlocks after 7 days — subscribers receive it the same morning.",
        alternates: { canonical: `/feed/${numId}` },
      };
    }
    const name = e.tradeName ?? e.ownerName ?? "New applicant";
    return {
      title: `${name} — ${verb} in ${e.city ?? e.state}`,
      description: e.summary,
      alternates: { canonical: `/feed/${numId}` },
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
  const numId = parseId(id);
  if (!numId) notFound();

  const { email, token } = await searchParams;
  await ensureSchema();

  const rows = await db.select().from(events).where(eq(events.id, numId)).limit(1);
  const e = rows[0];
  if (!e) notFound();

  const cut = embargoCutoff();
  let locked = e.occurredAt ? e.occurredAt.getTime() > cut.getTime() : false;

  if (locked && email && token) {
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (verifyScopedToken(cleanEmail, token, "unlock")) {
        const subs = await db
          .select({ status: subscribers.status, trialEndsAt: subscribers.trialEndsAt })
          .from(subscribers)
          .where(eq(subscribers.email, cleanEmail))
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

  const meta = parseEventMeta(e.payload);

  // Enrich unlocked views with live licenses row (address, zip, phone, sourceUrl)
  let licenseDetail: {
    address: string | null;
    zip: string | null;
    phone: string | null;
    status: string | null;
    licenseType: string | null;
    sourceUrl: string | null;
    lat: number | null;
    lng: number | null;
  } | null = null;
  if (!locked && e.licenseKey) {
    try {
      const lic = await db
        .select({
          address: licenses.address,
          zip: licenses.zip,
          phone: licenses.phone,
          status: licenses.status,
          licenseType: licenses.licenseType,
          sourceUrl: licenses.sourceUrl,
          lat: licenses.lat,
          lng: licenses.lng,
        })
        .from(licenses)
        .where(and(eq(licenses.state, e.state), eq(licenses.licenseKey, e.licenseKey)))
        .limit(1);
      licenseDetail = lic[0] ?? null;
    } catch {
      // optional enrichment
    }
  }

  // Texas Comptroller receipts — matches BOTH venue DBA AND parent LLC (multi-unit operator signal!)
  let revenue: { total: number; periodEnd: string; matchedVenue: string | null; isParentMatch: boolean } | null =
    null;
  if (e.state === "TX" && !locked) {
    try {
      const names = [e.tradeName, e.ownerName]
        .map((n) => (n ?? "").trim().toLowerCase())
        .filter((n) => n.length >= 3);
      if (names.length) {
        const r = await pool.query<{
          total: number;
          period_end: string;
          trade_name: string | null;
          owner_name: string | null;
        }>(
          `SELECT total, period_end, trade_name, owner_name FROM venue_receipts
           WHERE lower(trade_name) = ANY($1::text[]) OR lower(owner_name) = ANY($1::text[])
           ORDER BY period_end DESC, total DESC LIMIT 1`,
          [names]
        );
        if (r.rows[0]?.total > 0) {
          const hit = r.rows[0];
          const isParentMatch = Boolean(
            e.tradeName &&
              hit.trade_name &&
              e.tradeName.toLowerCase() !== hit.trade_name.toLowerCase()
          );
          revenue = {
            total: Number(hit.total),
            periodEnd: hit.period_end,
            matchedVenue: hit.trade_name,
            isParentMatch,
          };
        }
      }
    } catch {
      // receipts optional
    }
  }

  const address = licenseDetail?.address ?? meta.address ?? null;
  const zip = licenseDetail?.zip ?? meta.zip ?? null;
  const phone = licenseDetail?.phone ?? meta.phone ?? null;
  const contactName = meta.contactName ?? null;
  const neighborhood = meta.neighborhood ?? null;
  const sourceUrl = licenseDetail?.sourceUrl ?? meta.sourceUrl ?? null;

  const name = locked
    ? maskName(e.tradeName ?? e.ownerName ?? "Applicant")
    : (e.tradeName ?? e.ownerName ?? "Unnamed applicant");

  const score = scoreFiling({
    eventType: e.eventType,
    typeName: e.typeName,
    city: e.city,
    county: e.county,
    occurredAt: e.occurredAt,
    summary: e.summary,
  });

  const dossier = buildBeverageDossier({
    state: e.state,
    eventType: e.eventType,
    tradeName: e.tradeName,
    ownerName: e.ownerName,
    contactName,
    address,
    city: e.city,
    zip,
    county: e.county,
    neighborhood,
    typeName: e.typeName,
    licenseType: licenseDetail?.licenseType ?? meta.licenseType,
    sourceUrl,
    occurredAt: e.occurredAt,
  });

  let cityPeers: typeof rows = [];
  if (e.city) {
    cityPeers = await db
      .select()
      .from(events)
      .where(and(ilikeCity(e.city), eq(events.state, e.state), ne(events.id, e.id)))
      .orderBy(desc(events.occurredAt))
      .limit(6);
  }

  const fullAddress = !locked
    ? [address, neighborhood, e.city, e.state, zip].filter(Boolean).join(", ")
    : [e.city, e.county, e.state].filter(Boolean).join(" · ");

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
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-28">
        <Link
          href="/feed"
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-smoke hover:text-cream"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> BACK TO FEED
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <EventBadge type={e.eventType} />
          <StatePill state={e.state} />
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] ${
              score.tier === "A"
                ? "border-amber/50 bg-amber/15 text-amber"
                : "border-line bg-panel text-smoke"
            }`}
          >
            SCORE {score.value} · {tierLabel(score.tier)}
          </span>
          <span className="font-mono text-[11px] text-faint">{fmtDate(e.occurredAt)}</span>
        </div>

        <h1
          className={`font-display mt-5 text-4xl font-medium leading-tight sm:text-5xl ${
            locked ? "locked-name" : ""
          }`}
        >
          {name}
        </h1>

        {!locked && (
          <p className="mt-2 font-mono text-xs tracking-[0.08em] text-amber">
            {dossier.archetype.toUpperCase()} · {dossier.estAnnualSpend.toUpperCase()}
          </p>
        )}

        {/* Primary Filing & Contact Details Card */}
        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-panel">
          <div className="grid gap-x-8 gap-y-5 p-7 sm:grid-cols-2">
            <Field
              label="Signal & buying window"
              value={dossier.buyingWindow}
            />
            <Field label="License class" value={e.typeName ?? "—"} />
            {!locked && e.ownerName && (
              <Field label="Legal entity / LLC" value={e.ownerName} />
            )}
            {!locked && contactName && (
              <div>
                <p className="font-mono text-[10px] tracking-[0.22em] text-faint">
                  NAMED PERMITTEE / SIGNEE
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-amber">
                  <UserCheck className="h-3.5 w-3.5" />
                  {contactName}
                </p>
              </div>
            )}
            {!locked && address && (
              <Field
                label="Premises street address"
                value={[address, neighborhood, e.city, e.state, zip].filter(Boolean).join(", ")}
              />
            )}
            {!locked && meta.mailAddress && meta.mailAddress !== address && (
              <Field label="Mailing / prior address" value={meta.mailAddress} />
            )}
            {!locked && phone && (
              <div>
                <p className="font-mono text-[10px] tracking-[0.22em] text-faint">DIRECT PHONE</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-amber">
                  <Phone className="h-3.5 w-3.5" />
                  <a href={`tel:${phone}`} className="hover:underline">
                    {phone}
                  </a>
                </p>
              </div>
            )}
            <Field label="City / County" value={[e.city, e.county].filter(Boolean).join(" · ") || "—"} />
            <Field label="Filed / detected" value={`${fmtDate(e.occurredAt)} · logged ${fmtDate(e.detectedAt)}`} />
          </div>

          {/* 1-Click Decision-Maker & Verification Dossier Bar */}
          {!locked && (
            <div className="border-t border-line bg-panel2/40 px-7 py-5">
              <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-smoke">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-amber" />
                {fullAddress || [e.city, e.county, e.state].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <a
                  href={dossier.links.googleMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber/45 bg-amber/12 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-amber transition-colors hover:bg-amber hover:text-[#140b0e]"
                >
                  <MapPin className="h-3 w-3" /> GOOGLE MAPS ↗
                </a>
                <a
                  href={dossier.links.streetView}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber/45 bg-amber/12 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-amber transition-colors hover:bg-amber hover:text-[#140b0e]"
                >
                  STREET VIEW ↗
                </a>
                <a
                  href={dossier.links.linkedinOwner}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-cream transition-colors hover:border-amber/50 hover:text-amber"
                >
                  <Search className="h-3 w-3" /> FIND OWNER ON LINKEDIN ↗
                </a>
                <a
                  href={dossier.links.instagramSearch}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-cream transition-colors hover:border-amber/50 hover:text-amber"
                >
                  INSTAGRAM PAGE ↗
                </a>
                <a
                  href={dossier.links.entityLookup}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-cream transition-colors hover:border-amber/50 hover:text-amber"
                >
                  <Building2 className="h-3 w-3" /> {dossier.links.entityLookupLabel.toUpperCase()} ↗
                </a>
                <a
                  href={dossier.links.webSearch}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-smoke transition-colors hover:border-amber/50 hover:text-cream"
                >
                  CONCEPT &amp; NEWS ↗
                </a>
                {dossier.links.officialSource && (
                  <a
                    href={dossier.links.officialSource}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-smoke transition-colors hover:border-amber/50 hover:text-cream"
                  >
                    <ExternalLink className="h-3 w-3" /> OFFICIAL PORTAL ↗
                  </a>
                )}
              </div>
              <p className="mt-2.5 font-mono text-[9px] tracking-[0.1em] text-faint">
                VERIFY STOREFRONT CONSTRUCTION, PULL LLC OFFICERS, AND LOCATE THE BEVERAGE BUYER IN ONE CLICK
              </p>
              {licenseDetail?.lat && licenseDetail?.lng && (
                <div className="mt-4">
                  <VenueMiniMap
                    lat={licenseDetail.lat}
                    lng={licenseDetail.lng}
                    label={name}
                  />
                </div>
              )}
              <div className="mt-3">
                <Link
                  href={`/map?state=${e.state}`}
                  className="font-mono text-[10px] font-semibold tracking-[0.14em] text-amber hover:underline"
                >
                  📍 PLOT ALL {e.state} VENUES &amp; BUILD GOOGLE MAPS ROUTE →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Beverage Program Intelligence Card */}
        {!locked && (
          <div className="mt-6 rounded-xl border border-line bg-panel p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-amber">
                <Sparkles className="h-3.5 w-3.5" /> BEVERAGE PROGRAM INTELLIGENCE
              </p>
              <span className="rounded-full border border-mint/40 bg-mint/10 px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.1em] text-mint-bright">
                {dossier.estOpeningWindow.toUpperCase()}
              </span>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] tracking-[0.18em] text-faint">WHAT THEY WILL BUY</p>
                <p className="mt-1.5 text-sm leading-relaxed text-cream">{dossier.beverageProgram}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-[0.18em] text-faint">RECOMMENDED PITCH ANGLE</p>
                <p className="mt-1.5 text-sm leading-relaxed text-cream">{dossier.pitchAngle}</p>
              </div>
            </div>
          </div>
        )}

        {/* TX Comptroller Revenue / Multi-Unit Operator Match */}
        {revenue && (
          <div className="mt-6 rounded-xl border border-amber/50 bg-gradient-to-b from-amber/20 to-panel p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-amber">
                  <Flame className="h-3.5 w-3.5" />
                  {revenue.isParentMatch
                    ? `MULTI-UNIT OPERATOR · EXISTING LOCATION: ${revenue.matchedVenue ?? "TX"}`
                    : "ALCOHOL RECEIPTS · TEXAS COMPTROLLER"}
                </p>
                <p className="mt-2 font-display text-4xl font-light text-cream">
                  ${Math.round(revenue.total).toLocaleString()}
                  <span className="text-lg text-smoke"> /month</span>
                </p>
              </div>
              <p className="max-w-xs font-mono text-[10px] leading-relaxed tracking-[0.08em] text-smoke">
                REPORTING PERIOD ENDING {revenue.periodEnd} — PROVEN HIGH-VOLUME BUYER WORTH
                CALLING FIRST
              </p>
            </div>
          </div>
        )}

        {/* Ready-to-Send Beverage Rep Outreach Kit */}
        {!locked && (
          <div className="mt-6">
            <OutreachKit
              coldEmailSubject={dossier.outreach.coldEmailSubject}
              coldEmailBody={dossier.outreach.coldEmailBody}
              callOpener={dossier.outreach.callOpener}
              dropByNote={dossier.outreach.dropByNote}
              venueName={name}
              venueAddress={fullAddress}
              venuePhone={phone}
              ownerName={e.ownerName}
            />
          </div>
        )}

        {locked && (
          <div className="mt-6 rounded-xl border border-amber/40 bg-gradient-to-b from-amber/15 to-panel p-7">
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-amber" />
              <p className="font-display text-xl font-medium">
                Subscribers received this full beverage dossier{" "}
                {Math.max(
                  1,
                  Math.ceil(((e.occurredAt?.getTime() ?? 0) - cut.getTime()) / 86_400_000)
                )}{" "}
                day(s) before the public preview.
              </p>
            </div>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-smoke">
              Full venue name, street address, legal LLC entity, direct phone (where filed), 1-click
              LinkedIn &amp; LLC lookup, and custom outreach script unlock immediately with a 7-day
              free trial.
            </p>
            <Link
              href="/#pricing"
              className="mt-5 inline-block rounded-full bg-amber px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-[#140b0e] transition-transform hover:scale-[1.03]"
            >
              START 7-DAY FREE TRIAL (NO CARD)
            </Link>
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
                  <span
                    className={`truncate text-sm ${pLocked ? "locked-name text-smoke" : "text-cream"}`}
                  >
                    {pLocked
                      ? maskName(p.tradeName ?? p.ownerName ?? "Applicant")
                      : (p.tradeName ?? p.ownerName ?? "Unnamed applicant")}
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
