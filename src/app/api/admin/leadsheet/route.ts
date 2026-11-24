// Auto lead sheet CSV / JSON export (any US state).
import { extractAdminKey, isAdminKey } from "@/lib/auth";
import { buildLeadSheet } from "@/lib/leadsheet";

export const dynamic = "force-dynamic";

function esc(v: string | null | undefined): string {
  return `"${(v ?? "").replace(/"/g, '""').trim()}"`;
}

export async function GET(req: Request) {
  if (!isAdminKey(extractAdminKey(req))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawState = (url.searchParams.get("state") ?? "TX").trim().toUpperCase();
  const state = /^[A-Z]{2}$/.test(rawState) ? rawState : "TX";
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7));

  const sheet = await buildLeadSheet(state, days);

  if (url.searchParams.get("format") === "csv") {
    const rows: string[] = ["county,new_filings,distributor,city,phone"];
    for (const c of sheet.counties) {
      if (c.distributors.length === 0) {
        rows.push([esc(c.county), String(c.filings), esc("—"), esc(""), esc("")].join(","));
      } else {
        for (const d of c.distributors) {
          rows.push(
            [esc(c.county), String(c.filings), esc(d.name), esc(d.city), esc(d.phone)].join(",")
          );
        }
      }
    }
    return new Response(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${state.toLowerCase()}-${days}d.csv"`,
      },
    });
  }

  return Response.json({ ok: true, ...sheet });
}
