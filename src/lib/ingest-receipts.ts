// Texas Mixed Beverage Receipts — monthly alcohol revenue per venue from the
// Texas Comptroller. Tells reps which venues pour the highest volume.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { venueReceipts } from "@/db/schema";
import { fetchSocrata, clean, normalizeCity, cleanCounty } from "@/lib/sources";
import { recordRunResult } from "@/lib/pourwatch";

type TxReceipt = {
  taxpayer_number?: string;
  taxpayer_name?: string;
  location_number?: string;
  location_name?: string;
  location_city?: string;
  location_county?: string;
  tabc_permit_number?: string;
  obligation_end_date_yyyymmdd?: string;
  liquor_receipts?: string;
  wine_receipts?: string;
  beer_receipts?: string;
  total_receipts?: string;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ymd(v: string | undefined): string | null {
  if (!v) return null;
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const CHUNK = 400;

export async function runReceiptsIngest(limit = 10_000): Promise<{
  ok: boolean;
  rowsSeen: number;
  stored: number;
  error?: string;
}> {
  await ensureSchema();
  try {
    const rows = (await fetchSocrata("data.texas.gov", "naix-2893", {
      order: "obligation_end_date_yyyymmdd DESC",
      limit,
      timeoutMs: 25_000,
    })) as unknown as TxReceipt[];

    const dedup = new Map<string, typeof venueReceipts.$inferInsert>();
    for (const r of rows) {
      const permit =
        clean(r.tabc_permit_number) ??
        `${clean(r.taxpayer_number) ?? ""}-${clean(r.location_number) ?? ""}`;
      const periodEnd = ymd(r.obligation_end_date_yyyymmdd);
      const total = num(r.total_receipts);
      if (!permit || permit === "-" || !periodEnd || !total || total <= 0) continue;
      dedup.set(`${permit}|${periodEnd}`, {
        permit,
        tradeName: clean(r.location_name) ?? clean(r.taxpayer_name),
        ownerName: clean(r.taxpayer_name),
        city: normalizeCity(r.location_city),
        county: cleanCounty(r.location_county),
        state: "TX",
        periodEnd,
        total,
        liquor: num(r.liquor_receipts),
        wine: num(r.wine_receipts),
        beer: num(r.beer_receipts),
      });
    }

    const values = Array.from(dedup.values());
    let stored = 0;
    for (let i = 0; i < values.length; i += CHUNK) {
      const inserted = await db
        .insert(venueReceipts)
        .values(values.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .returning({ id: venueReceipts.id });
      stored += inserted.length;
    }

    await recordRunResult({
      label: "TX · mixed beverage receipts",
      state: "TX",
      ok: true,
      rowsSeen: rows.length,
      newLicenses: 0,
      newEvents: 0,
    }).catch(() => undefined);
    return { ok: true, rowsSeen: rows.length, stored };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordRunResult({
      label: "TX · mixed beverage receipts",
      state: "TX",
      ok: false,
      rowsSeen: 0,
      newLicenses: 0,
      newEvents: 0,
      error,
    }).catch(() => undefined);
    return { ok: false, rowsSeen: 0, stored: 0, error };
  }
}
