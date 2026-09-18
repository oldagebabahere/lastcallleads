// Auto lead sheet — download as CSV and start emailing.
// Admin-only. CSV columns: county, new_filings_7d, distributor, city, phone
import { isAdminKey } from "@/lib/auth";
import { buildLeadSheet } from "@/lib/leadsheet";

export const dynamic = "force-dynamic";

function esc(v: string | null | undefined): string {
  return `"${(v ?? "").replace(/"/g, '""').trim()}"`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!isAdminKey(key)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const state = url.searchParams.get("state")?.toUpperCase() === "NY" ? "NY" : "TX";
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));

  const sheet = await buildLeadSheet(state, days);

  if (url.searchParams.get("format") === "csv") {
    const rows: string[] = ["county,new_filings_7d,distributor,city,phone"];
    for (const c of sheet.counties) {
      const names = c.distributors.length ? c.distributors : ["—"];
      names.forEach((name, i) => {
        rows.push(
          [c.county, String(c.filings), name, esc(name), esc(c.phones[i] ?? null)].join(",")
        );
      });
    }
    const csv = rows.join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${state.toLowerCase()}-${days}d.csv"`,
      },
    });
  }

  return Response.json({ ok: true, ...sheet });
}
