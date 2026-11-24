// Subscriber CRM-ready CSV export — 19 enriched Beverage Sales columns
// (venue, owner LLC, permittee/contact, direct phone, full address, beverage
// archetype, program fit, spend estimate, Maps & LinkedIn owner search URLs).
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, licenses, subscribers } from "@/db/schema";
import { buildBeverageDossier, parseEventMeta } from "@/lib/beverage-intel";
import { dedupeKey, isJunkEntity, matchesIntent, scoreFiling } from "@/lib/lead-score";
import { verifyScopedToken } from "@/lib/unsubscribe";
import { and, desc, eq, gt, inArray, isNull, notLike, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

function esc(v: string | number | null | undefined): string {
  return `"${String(v ?? "").replace(/"/g, '""').trim()}"`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const token = url.searchParams.get("token") ?? "";
  if (!email || !verifyScopedToken(email, token, "export")) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const rows = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);
  const sub = rows[0];
  if (!sub) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const trialLive =
    sub.status === "trial" &&
    Boolean(sub.trialEndsAt) &&
    new Date(sub.trialEndsAt!).getTime() > Date.now();
  if (sub.status !== "active" && !trialLive) {
    return Response.json(
      { ok: false, error: "subscription_inactive" },
      { status: 403 }
    );
  }

  const stateList = sub.states
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const since = new Date(Date.now() - 30 * 86_400_000);

  const data = await db
    .select()
    .from(events)
    .where(
      and(
        stateList.length ? inArray(events.state, stateList) : undefined,
        gt(events.detectedAt, since),
        or(isNull(events.licenseKey), notLike(events.licenseKey, "TTB-%"))
      )
    )
    .orderBy(desc(events.occurredAt))
    .limit(2000);

  const keys = data.map((e) => e.licenseKey).filter((k): k is string => Boolean(k));
  const info = new Map<
    string,
    { address: string | null; zip: string | null; phone: string | null; sourceUrl: string | null }
  >();
  for (let i = 0; i < keys.length; i += 400) {
    const part = await db
      .select({
        state: licenses.state,
        key: licenses.licenseKey,
        address: licenses.address,
        zip: licenses.zip,
        phone: licenses.phone,
        sourceUrl: licenses.sourceUrl,
      })
      .from(licenses)
      .where(
        and(
          stateList.length ? inArray(licenses.state, stateList) : undefined,
          inArray(licenses.licenseKey, keys.slice(i, i + 400))
        )
      );
    for (const l of part) info.set(`${l.state}|${l.key}`, l);
  }

  const zipSet = new Set(
    (sub.zipFilter ?? "")
      .split(/[,\s]+/)
      .map((z) => z.replace(/\D/g, "").slice(0, 5))
      .filter((z) => z.length === 5)
  );
  const tags = (sub.typeFilter ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const cityNeedle = (sub.cityFilter ?? "").trim().toLowerCase();
  const keywords = (sub.keywordFilter ?? "")
    .split(/[,\s]+/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  const filtered0 = data.filter((e) => {
    if (e.licenseKey?.startsWith("TTB-")) return false;
    if (isJunkEntity(e.tradeName, e.ownerName, e.summary, e.typeName)) return false;
    if (zipSet.size > 0) {
      const meta = parseEventMeta(e.payload);
      const z = (info.get(`${e.state}|${e.licenseKey}`)?.zip ?? meta.zip ?? "")
        .replace(/\D/g, "")
        .slice(0, 5);
      if (!z || !zipSet.has(z)) return false;
    }
    if (tags.length > 0 && !matchesIntent(e, tags)) return false;
    const city = (e.city ?? "").toLowerCase();
    if (cityNeedle && !city.includes(cityNeedle)) return false;
    if (keywords.length) {
      const hay = `${e.summary ?? ""} ${e.typeName ?? ""} ${e.tradeName ?? ""} ${city}`.toLowerCase();
      return keywords.every((k) => hay.includes(k));
    }
    return true;
  });

  const seen = new Set<string>();
  const filtered = filtered0.filter((e) => {
    const k = dedupeKey(e.tradeName ?? e.ownerName, e.city);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const header = [
    "signal",
    "lead_score",
    "venue_name",
    "owner_llc",
    "contact_name",
    "phone",
    "street_address",
    "city",
    "county",
    "state",
    "zip",
    "license_type",
    "venue_archetype",
    "beverage_program_fit",
    "est_annual_spend",
    "event_date",
    "google_maps_url",
    "linkedin_owner_search",
    "official_registry_url",
  ].join(",");

  const lines = filtered.map((e) => {
    const meta = parseEventMeta(e.payload);
    const lic = e.licenseKey ? info.get(`${e.state}|${e.licenseKey}`) : undefined;
    const address = lic?.address ?? meta.address ?? null;
    const zip = lic?.zip ?? meta.zip ?? null;
    const phone = lic?.phone ?? meta.phone ?? null;
    const sourceUrl = lic?.sourceUrl ?? meta.sourceUrl ?? null;

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
      contactName: meta.contactName,
      address,
      city: e.city,
      zip,
      county: e.county,
      neighborhood: meta.neighborhood,
      typeName: e.typeName,
      licenseType: meta.licenseType,
      sourceUrl,
      occurredAt: e.occurredAt,
    });

    return [
      esc(
        e.eventType === "NEW_PENDING"
          ? "APPLICATION FILED"
          : e.eventType === "NEW_LICENSE"
            ? "LICENSE ISSUED"
            : "STATUS CHANGE"
      ),
      esc(score.value),
      esc(e.tradeName ?? ""),
      esc(e.ownerName ?? ""),
      esc(meta.contactName ?? ""),
      esc(phone),
      esc(address),
      esc(e.city ?? ""),
      esc(e.county ?? ""),
      esc(e.state),
      esc(zip),
      esc(e.typeName ?? ""),
      esc(dossier.archetype),
      esc(dossier.beverageProgram),
      esc(dossier.estAnnualSpend),
      esc(e.occurredAt ? new Date(e.occurredAt).toISOString().slice(0, 10) : ""),
      esc(dossier.links.googleMaps),
      esc(dossier.links.linkedinOwner),
      esc(sourceUrl ?? dossier.links.entityLookup),
    ].join(",");
  });

  const csv = [header, ...lines].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lastcallleads-${stateList.join("-").toLowerCase()}-beverage-crm.csv"`,
    },
  });
}
