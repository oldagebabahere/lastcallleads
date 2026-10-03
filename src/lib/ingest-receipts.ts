// Texas Mixed Beverage Receipts — the GOLDMINE feed.
// The Comptroller publishes every venue's monthly alcohol revenue
// (liquor/wine/beer split). No competitor shows "which bar is worth
// calling first" — this is that data.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { venueReceipts } from "@/db/schema";
import { fetchSocrata, clean } from "@/lib/sources";
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
  if (/^\d{8}$/.test(v))
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const CHUNK = 400;

export async function runReceiptsIngest(): Promise<{
  ok: boolean;
  rowsSeen: number;
  stored: number;
  error?: string;
}> {
  await ensureSchema();
  try {
    // Most recent reporting periods first — re-running daily is cheap
    // because (permit, period) is unique and conflicts are ignored.
    const rows = (await fetchSocrata("data.texas.gov", "naix-2893", {
      order: "obligation_end_date_yyyymmdd DESC",
      limit: 15000,
    })) as unknown as TxReceipt[];

    const values: (typeof venueReceipts.$inferInsert)[] = [];
    for (const r of rows) {
      const permit =
        clean(r.tabc_permit_number) ??
        `${clean(r.taxpayer_number) ?? ""}-${clean(r.location_number) ?? ""}`;
      const periodEnd = ymd(r.obligation_end_date_yyyymmdd);
      const total = num(r.total_receipts);
      if (!permit || permit === "-" || !periodEnd || !total) continue;
      values.push({
        permit,
        tradeName: clean(r.location_name) ?? clean(r.taxpayer_name),
        city: clean(r.location_city),
        county: clean(r.location_county),
        state: "TX",
        periodEnd,
        total,
        liquor: num(r.liquor_receipts),
        wine: num(r.wine_receipts),
        beer: num(r.beer_receipts),
      });
    }

    let stored = 0;
    for (let i = 0; i < values.length; i += CHUNK) {
      const inserted = await db
        .insert(venueReceipts)
        .values(values.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .returning({ id: venueReceipts.id });
      stored += inserted.length;
    }

    const result = {
      ok: true,
      rowsSeen: rows.length,
      stored,
    };
    await recordRunResult({
      label: "TX · mixed beverage receipts",
      state: "TX",
      ok: true,
      rowsSeen: rows.length,
      newLicenses: 0,
      newEvents: 0,
    }).catch(() => undefined);
    return result;
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
