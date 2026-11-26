// Public coverage page — 100% honest, live from Postgres.
// Only lists our 9 genuinely live, retail-verified US beverage markets.
// Zero fake "50 states" claims.
import Link from "next/link";
import { ensureSchema } from "@/db/bootstrap";
import { coverageStats } from "@/lib/pourwatch";
import { hoursAgoMs } from "@/lib/queries";
import { LIVE_MARKETS, LIVE_STATE_NAMES_LIST } from "@/lib/states";
import { BRAND } from "@/lib/brand";
import { PUBLIC_CONFIG } from "@/lib/public-config";
import { Footer, Nav } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "9 Live US Liquor License Markets — Daily Portal Coverage",
  description: `100% honest live alcohol-license coverage across 9 verified US beverage markets — ${LIVE_STATE_NAMES_LIST}.`,
  alternates: { canonical: "/coverage" },
};

type Status = "LIVE" | "PAUSED" | "ARMED";

function statusColor(s: Status): string {
  if (s === "LIVE") return "text-mint-bright";
  if (s === "PAUSED") return "text-amber";
  return "text-smoke";
}

export default async function CoveragePage() {
  const stats = await ensureSchema()
    .then(() => coverageStats())
    .catch(() => null);
  const byState = new Map(stats?.licensesByState.map((r) => [r.state, r.count]) ?? []);
  const health = stats?.health ?? [];
  const cutoff = hoursAgoMs(48);

  const stateHealth = new Map<string, { live: boolean; paused: string[] }>();
  for (const h of health) {
    const cur = stateHealth.get(h.state) ?? { live: false, paused: [] };
    if (h.status === "live" && h.lastOkAt && new Date(h.lastOkAt).getTime() > cutoff) {
      cur.live = true;
    }
    if (h.status === "paused") cur.paused.push(h.pausedReason ?? "source paused");
    stateHealth.set(h.state, cur);
  }

  const rows = LIVE_MARKETS.map((m) => {
    const licenses = byState.get(m.code) ?? 0;
    const h = stateHealth.get(m.code);
    let status: Status = "ARMED";
    if (h?.live) status = "LIVE";
    else if (h?.paused.length) status = "PAUSED";
    return { ...m, licenses, status, reasons: h?.paused ?? [] };
  });

  const liveCount = rows.filter((r) => r.status === "LIVE").length;
  const totalRecords = rows.reduce((a, r) => a + r.licenses, 0);

  return (
    <main className="min-h-screen bg-ox text-cream">
      <Nav />
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-28">
        <p className="font-mono text-[10px] tracking-[0.22em] text-amber">
          ZERO FAKE CLAIMS · LIVE REGISTRY COVERAGE
        </p>
        <h1 className="mt-3 font-display text-4xl font-light md:text-5xl">
          9 verified US markets. Honest status.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          We only sell states where we pull{" "}
          <span className="text-cream">
            real retail bar, restaurant, brewpub &amp; liquor-store filings
          </span>{" "}
          directly from official government portals every morning. No padded &ldquo;50
          states&rdquo; wholesaler filler, no dead feeds. Status below is computed live from our
          PourWatch health monitor.
        </p>

        {/* summary strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] text-faint">VERIFIED MARKETS</p>
            <p className="mt-1 font-display text-2xl text-cream">{LIVE_MARKETS.length}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] text-faint">SWEPT IN LAST 48H</p>
            <p className="mt-1 font-display text-2xl text-mint-bright">
              {liveCount}
              <span className="text-faint">/{LIVE_MARKETS.length}</span>
            </p>
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] text-faint">RETAIL RECORDS</p>
            <p className="mt-1 font-display text-2xl">{totalRecords.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] text-faint">SWEEP CADENCE</p>
            <p className="mt-1 font-display text-2xl text-amber">Daily</p>
          </div>
        </div>

        {/* 9 verified markets table */}
        <div className="mt-8 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-panel font-mono text-[9px] tracking-[0.18em] text-faint">
                <th className="px-4 py-3">MARKET</th>
                <th className="hidden px-4 py-3 sm:table-cell">SCOPE &amp; AGENCY</th>
                <th className="px-4 py-3">RECORDS</th>
                <th className="px-4 py-3">STATUS</th>
                <th className="hidden px-4 py-3 md:table-cell">BEVERAGE REP DATA INCLUDED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-line/60 last:border-0 hover:bg-panel/40">
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/states/${r.slug}`}
                      className="font-medium text-cream hover:text-amber"
                    >
                      <span>{r.name}</span>
                      <span className="ml-2 font-mono text-[10px] text-amber/80">({r.code})</span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3.5 text-xs text-smoke sm:table-cell">
                    <span className="text-cream/85">{r.scope}</span>
                    <span className="block font-mono text-[10px] text-faint">{r.agency}</span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-smoke">
                    {r.licenses > 0 ? r.licenses.toLocaleString() : "—"}
                  </td>
                  <td
                    className={`px-4 py-3.5 font-mono text-[11px] font-semibold tracking-[0.14em] ${statusColor(r.status)}`}
                  >
                    {r.status}
                  </td>
                  <td className="hidden px-4 py-3.5 text-xs text-smoke md:table-cell">
                    {r.status !== "LIVE" && r.reasons.length ? (
                      <span className="text-amber">{r.reasons[0].slice(0, 75)}</span>
                    ) : (
                      r.highlight
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Honest expansion request card */}
        <div className="mt-8 rounded-xl border border-amber/30 bg-amber/5 p-6">
          <p className="font-mono text-[10px] tracking-[0.2em] text-amber">
            NEED FLORIDA, GEORGIA, OHIO OR ANOTHER STATE?
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smoke">
            We only activate a state once its official retail licensing portal passes automated
            daily reliability checks. Need priority coverage for your territory? Email us your
            target state and we prioritize what paying beverage teams ask for first.
          </p>
          <a
            href={`mailto:${PUBLIC_CONFIG.contactEmail}?subject=Request%20New%20State%20Coverage`}
            className="mt-4 inline-block font-mono text-[11px] font-semibold tracking-[0.14em] text-amber hover:underline"
          >
            REQUEST A STATE — {PUBLIC_CONFIG.contactEmail.toUpperCase()} →
          </a>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/sample"
            className="rounded-lg bg-amber px-5 py-2.5 font-mono text-[11px] font-semibold tracking-[0.16em] text-[#140b0e]"
          >
            SEE SAMPLE BEVERAGE DOSSIER →
          </Link>
          <Link
            href="/feed"
            className="rounded-lg border border-line px-5 py-2.5 font-mono text-[11px] tracking-[0.16em] text-smoke hover:text-cream"
          >
            BROWSE LIVE FEED
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
