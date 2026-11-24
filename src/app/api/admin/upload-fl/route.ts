// Authenticated Florida DBPR CSV importer — ingests pre-filtered fresh/pending
// records from the official FL DBPR `bd4006lic.csv` extract downloaded in the
// owner's browser (zero 413 payload limits, zero WAF bypasses, 100% official data).
import { ensureSchema } from "@/db/bootstrap";
import { db } from "@/db";
import { events, ingestRuns, licenses } from "@/db/schema";
import { extractAdminKey, isAdminKey } from "@/lib/auth";
import { clean, cleanZip, normalizeCity, safeDate } from "@/lib/sources";
import { runDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type FlRowInput = {
  licenseNumber: string;
  primaryStatus?: string;
  series?: string;
  dba?: string;
  ownerName?: string;
  address?: string;
  city?: string;
  zip?: string;
  county?: string;
  originalDate?: string;
  effectiveDate?: string;
  expirationDate?: string;
};

const FL_STATUS: Record<string, string> = {
  "10": "Applicant — in process",
  "11": "Withdrawn",
  "12": "Application expired",
  "13": "Denied",
  "20": "Current",
  "21": "Temporary certificate",
  "22": "Transfer approved",
  "30": "Current — probation",
  "32": "Current — conditional",
};

const FL_SERIES: Record<string, string> = {
  "1": "Quota · Beer & Wine (Package)",
  "2": "Quota · Beer & Wine (On-Premises)",
  "3": "Quota · Full Bar Liquor, Beer & Wine",
  "4": "Quota · Spirits Package Store",
  "5": "Quota · Beer Package",
  "6": "Quota · Spirits + Beer/Wine Package",
  "7": "Quota · Beer On-Premises",
  "11": "Hotel Full Liquor License",
  "12": "Restaurant Beer & Wine",
  "13": "Restaurant Full Spirits",
  "24": "Alcohol Caterer",
  "61": "Special Restaurant (Wine)",
  "67": "Special Food Service (Full Bar Spirits)",
};

export async function POST(req: Request) {
  const key = extractAdminKey(req);
  if (!isAdminKey(key)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { rows?: FlRowInput[]; triggerDigest?: boolean };
  try {
    body = (await req.json()) as { rows?: FlRowInput[]; triggerDigest?: boolean };
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const rawRows = Array.isArray(body.rows) ? body.rows.slice(0, 3000) : [];
  if (!rawRows.length) {
    return Response.json({ ok: false, error: "no_rows_provided" }, { status: 400 });
  }

  await ensureSchema();
  const startedAt = new Date();
  const now = new Date();

  const licValues: (typeof licenses.$inferInsert)[] = [];
  const evtValues: (typeof events.$inferInsert)[] = [];
  const seenKeys = new Set<string>();

  for (const r of rawRows) {
    const licNo = clean(r.licenseNumber);
    if (!licNo) continue;
    const licenseKey = `FL-${licNo}`;
    if (seenKeys.has(licenseKey)) continue;
    seenKeys.add(licenseKey);

    const statusCode = clean(r.primaryStatus) ?? "";
    const isPending = statusCode === "10";
    const seriesCode = (clean(r.series) ?? "").match(/^\d+/)?.[0] ?? "";
    const typeName =
      FL_SERIES[seriesCode] ?? (clean(r.series) ? `Florida Series ${clean(r.series)}` : "Florida Retail Alcohol");
    const tradeName = clean(r.dba) ?? clean(r.ownerName);
    const ownerName = clean(r.ownerName);
    const address = clean(r.address);
    const city = normalizeCity(r.city);
    const zip = cleanZip(r.zip);
    const county = normalizeCity(r.county);
    const filedAt = safeDate(r.originalDate);
    const issuedAt = safeDate(r.effectiveDate);
    const expiresAt = safeDate(r.expirationDate, { allowFutureYears: 6 });
    const occurredAt = (isPending ? filedAt : issuedAt) ?? filedAt ?? issuedAt ?? now;
    const eventType = isPending ? "NEW_PENDING" : "NEW_LICENSE";

    licValues.push({
      state: "FL",
      licenseKey,
      kind: isPending ? "pending" : "active",
      status: FL_STATUS[statusCode] ?? (statusCode || "Current"),
      licenseType: clean(r.series),
      typeName,
      tradeName,
      ownerName,
      phone: null,
      address,
      city,
      zip,
      county,
      filedAt,
      issuedAt,
      expiresAt,
      lat: null,
      lng: null,
      sourceUrl: "https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/public-records/",
      lastSeenAt: now,
    });

    const summary = `${tradeName ?? ownerName ?? "New Florida Venue"} — ${typeName}${city ? ` in ${city}, FL` : ", FL"}`;
    evtValues.push({
      state: "FL",
      licenseKey,
      eventType,
      summary,
      tradeName,
      ownerName,
      city,
      county,
      typeName,
      occurredAt,
      detectedAt: now,
      payload: JSON.stringify({
        address,
        zip,
        licenseType: clean(r.series),
        sourceUrl:
          "https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/public-records/",
      }),
    });
  }

  let storedLicenses = 0;
  let storedEvents = 0;
  const CHUNK = 250;

  for (let i = 0; i < licValues.length; i += CHUNK) {
    const res = await db
      .insert(licenses)
      .values(licValues.slice(i, i + CHUNK))
      .onConflictDoNothing()
      .returning({ id: licenses.id });
    storedLicenses += res.length;
  }

  for (let i = 0; i < evtValues.length; i += CHUNK) {
    const res = await db
      .insert(events)
      .values(evtValues.slice(i, i + CHUNK))
      .onConflictDoNothing()
      .returning({ id: events.id });
    storedEvents += res.length;
  }

  await db
    .insert(ingestRuns)
    .values({
      source: "Florida · DBPR CSV upload",
      startedAt,
      finishedAt: new Date(),
      ok: true,
      rowsSeen: rawRows.length,
      newLicenses: storedLicenses,
      newEvents: storedEvents,
    })
    .catch(() => undefined);

  let digestSent = 0;
  if (body.triggerDigest && storedEvents > 0) {
    const dig = await runDigest().catch(() => ({ sent: 0 }));
    digestSent = dig.sent ?? 0;
  }

  return Response.json({
    ok: true,
    rowsReceived: rawRows.length,
    newLicenses: storedLicenses,
    newEvents: storedEvents,
    digestSent,
  });
}
