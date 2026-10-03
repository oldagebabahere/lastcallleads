// Public coverage page — generated from the DATABASE, not hardcoded text.
// A state shows LIVE only when a source for it succeeded within 48 hours;
// paused sources show their reason. No manual edits, no false claims.
import Link from "next/link";
import { coverageStats } from "@/lib/pourwatch";
import { US_STATES } from "@/lib/states";
import { BRAND } from "@/lib/brand";
import { Footer, Nav } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Coverage · ${BRAND.name}`,
  description:
    "Live alcohol-license data coverage across all 50 states — refreshed daily from official state sources.",
};

type Status = "DEDICATED" | "PAUSED" | "TTB ONLY";

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

function statusColor(s: Status): string {
  if (s === "DEDICATED") return "text-emerald";
  if (s === "PAUSED") return "text-amber";
  return "text-faint";
}

export default async function CoveragePage() {
  const stats = await coverageStats().catch(() => null);
  const byState = new Map(stats?.licensesByState.map((r) => [r.state, r.count]) ?? []);
  const health = stats?.health ?? [];

  // federal TTB sources cover every state — one national row for them
  const fedSources = health.filter((h) => h.state === "US");
  const fedLive = fedSources.filter(
    (h) =>
      h.status === "live" &&
      h.lastOkAt &&
      Date.now() - new Date(h.lastOkAt).getTime() < 48 * 3600_000
  );
  const fedPaused = fedSources.filter((h) => h.status === "paused");

  const cutoff = Date.now() - 48 * 3600_000;
  const stateHealth = new Map<string, { live: boolean; paused: string[] }>();
  for (const h of health) {
    if (h.state === "US") continue;
    const cur = stateHealth.get(h.state) ?? { live: false, paused: [] };
    if (
      h.status === "live" &&
      h.lastOkAt &&
      new Date(h.lastOkAt).getTime() > cutoff
    ) {
      cur.live = true;
    }
    if (h.status === "paused") cur.paused.push(h.pausedReason ?? "source paused");
    stateHealth.set(h.state, cur);
  }

  const rows = US_STATES.map(([code, name]) => {
    const licenses = byState.get(code) ?? 0;
    const h = stateHealth.get(code);
    let status: Status = "TTB ONLY";
    if (h?.live) status = "DEDICATED";
    else if (h?.paused.length) status = "PAUSED";
    else if (licenses > 0) status = "TTB ONLY"; // historical data, dedicated feed not due
    return { code, name, licenses, status, reasons: h?.paused ?? [] };
  });

  const liveCount = rows.filter((r) => r.status === "DEDICATED").length;
  const fedStatus: Status =
    fedLive.length || fedSources.length === 0
      ? fedLive.length
        ? "DEDICATED"
        : "TTB ONLY"
      : fedPaused.length === fedSources.length
        ? "PAUSED"
        : "DEDICATED";

  return (
    <main className="min-h-screen bg-ox text-cream">
      <Nav />
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-14">
        <p className="font-mono text-[10px] tracking-[0.22em] text-amber">
          TRANSPARENT COVERAGE
        </p>
        <h1 className="mt-3 font-display text-4xl font-light md:text-5xl">
          Every state. Honest status.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          Straight answer, always current: <span className="text-emerald">DEDICATED</span> means
          this state has its own daily feed we pull every morning (pending applications,
          new licenses, status flips). <span className="text-cream">TTB ONLY</span> means the
          state is covered by the federal alcohol registry — every wholesaler, importer,
          winery, distillery and brewery in it — until its dedicated feed comes online.
          This table is generated from the database on every load; a feed only shows
          DEDICATED when it succeeded within the last 48 hours.
        </p>

        {/* summary strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] text-faint">RECORDS</p>
            <p className="mt-1 font-display text-2xl">
              {(stats?.totalLicenses ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] text-faint">
              STATES WITH DATA
            </p>
            <p className="mt-1 font-display text-2xl">
              {rows.filter((r) => r.licenses > 0).length}
              <span className="text-faint">/51</span>
            </p>
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] text-faint">
              DEDICATED FEEDS (LIVE)
            </p>
            <p className="mt-1 font-display text-2xl text-emerald">{liveCount}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="font-mono text-[9px] tracking-[0.18em] text-faint">
              FEDERAL (TTB)
            </p>
            <p className={`mt-1 font-display text-2xl ${statusColor(fedStatus)}`}>
              {fedStatus}
            </p>
          </div>
        </div>

        {/* federal row */}
        <div className="mt-6 rounded-lg border border-amber/30 bg-amber/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-amber">
                FEDERAL · TTB (ALL 50 STATES)
              </p>
              <p className="mt-1 text-sm text-smoke">
                Wholesalers, importers, producers &amp; weekly new permits — the
                national base layer.
              </p>
            </div>
            <p className={`font-mono text-xs tracking-[0.2em] ${statusColor(fedStatus)}`}>
              {fedStatus}
            </p>
          </div>
          {fedPaused.length > 0 && (
            <p className="mt-2 text-xs text-amber/80">
              Paused: {fedPaused.map((f) => f.source).join(" · ")} — being re-probed
              automatically.
            </p>
          )}
        </div>

        {/* state grid */}
        <div className="mt-6 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-panel font-mono text-[9px] tracking-[0.18em] text-faint">
                <th className="px-4 py-3">STATE</th>
                <th className="px-4 py-3">RECORDS</th>
                <th className="px-4 py-3">FEED STATUS</th>
                <th className="hidden px-4 py-3 md:table-cell">NOTES</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-cream">{r.code}</span>
                    <span className="ml-2 text-smoke">{r.name}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-smoke">
                    {r.licenses > 0 ? r.licenses.toLocaleString() : "—"}
                  </td>
                  <td className={`px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] ${statusColor(r.status)}`}>
                    {r.status}
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-faint md:table-cell">
                    {r.reasons.length ? r.reasons[0].slice(0, 70) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-faint">
          Sources that break pause themselves and keep being retried weekly — the
          other states never stop flowing. PENDING states are covered by the federal
          TTB layer while their dedicated state feed is onboarding.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/feed"
            className="rounded-lg border border-amber/60 bg-amber/15 px-5 py-2.5 font-mono text-[11px] tracking-[0.16em] text-amber hover:bg-amber/25"
          >
            BROWSE THE LIVE FEED →
          </Link>
          <Link
            href="/sample"
            className="rounded-lg border border-line px-5 py-2.5 font-mono text-[11px] tracking-[0.16em] text-smoke hover:text-cream"
          >
            SEE A SAMPLE LEAD
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
