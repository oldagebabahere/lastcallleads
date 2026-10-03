// PROSPECT FINDER — your own unlimited daily lead machine. Every attorney,
// insurance agent and beverage seller in America, pulled from
// OpenStreetMap, exportable as CSV for cold outreach.
import Link from "next/link";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { prospects } from "@/db/schema";
import { adminKeySet, isAdminKey } from "@/lib/auth";
import { PROSPECT_CATEGORIES } from "@/lib/prospects";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  if (!adminKeySet()) {
    return (
      <main className="min-h-screen px-5 py-28">
        <p className="mx-auto max-w-md font-mono text-xs text-smoke">
          Set ADMIN_KEY in your environment variables to open the prospect finder.
        </p>
      </main>
    );
  }
  if (!isAdminKey(key ?? null)) {
    return (
      <main className="min-h-screen px-5 py-28">
        <form className="mx-auto max-w-xs space-y-3">
          <input name="key" placeholder="admin key" className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream" />
          <button className="w-full rounded-md bg-amber px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink">OPEN</button>
        </form>
      </main>
    );
  }

  await ensureSchema();
  const k = key!;

  const byCat = await db
    .select({
      category: prospects.category,
      n: sql<number>`count(*)::int`,
      withPhone: sql<number>`count(${prospects.phone})::int`,
      withSite: sql<number>`count(${prospects.website})::int`,
    })
    .from(prospects)
    .groupBy(prospects.category);

  const byState = await db
    .select({ state: prospects.state, n: sql<number>`count(*)::int` })
    .from(prospects)
    .groupBy(prospects.state)
    .orderBy(desc(sql`count(*)`))
    .limit(15);

  const recent = await db
    .select()
    .from(prospects)
    .orderBy(desc(prospects.firstSeenAt))
    .limit(25);

  const label = (c: string) =>
    PROSPECT_CATEGORIES.find((x) => x.id === c)?.label ?? c;

  return (
    <main className="min-h-screen px-5 pb-20 pt-24">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">[ Prospect Finder · free & unlimited ]</p>
        <h1 className="font-display mt-4 text-3xl font-medium text-cream">
          Tumhare customers ka daily list
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smoke">
          Every attorney, insurance agent, beverage seller and bar in the USA.
          A new state is auto-harvested daily (cron 13:00 UTC). Download the
          CSV and start your email/phone outreach.
        </p>

        {/* run buttons */}
        <div className="mt-6 flex flex-wrap gap-2">
          {["TX", "FL", "CA", "NY", "GA", "PA", "IL", "OH", "AZ", "TN"].map((s) => (
            <a
              key={s}
              href={`/api/cron/prospects?state=${s}&secret=${k}`}
              className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-[11px] tracking-[0.12em] text-amber hover:border-amber/50"
            >
              RUN {s}
            </a>
          ))}
        </div>

        {/* totals by category */}
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          {byCat.map((c) => (
            <div key={c.category} className="rounded-xl border border-line bg-panel p-4">
              <p className="font-mono text-[10px] tracking-[0.15em] text-faint">
                {label(c.category).toUpperCase()}
              </p>
              <p className="font-display mt-1 text-2xl text-cream">{c.n.toLocaleString()}</p>
              <p className="mt-1 font-mono text-[10px] text-smoke">
                {c.withPhone.toLocaleString()} phone · {c.withSite.toLocaleString()} web
              </p>
              <a
                href={`/api/admin/prospects?key=${k}&category=${c.category}&format=csv`}
                className="mt-2 inline-block font-mono text-[10px] tracking-[0.15em] text-amber hover:underline"
              >
                CSV ↓
              </a>
            </div>
          ))}
        </div>

        {/* states */}
        <div className="mt-8">
          <p className="font-mono text-[10px] tracking-[0.18em] text-faint">STATES HARVESTED</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {byState.map((s) => (
              <span key={s.state} className="rounded border border-line bg-panel px-2.5 py-1.5 font-mono text-[10px] text-smoke">
                {s.state} · {s.n.toLocaleString()}
              </span>
            ))}
            {byState.length === 0 && (
              <span className="font-mono text-xs text-smoke">
                Abhi koi state harvest nahi hui — upar RUN button dabaao.
              </span>
            )}
          </div>
        </div>

        {/* recent rows */}
        <div className="mt-8 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink font-mono text-[10px] tracking-[0.15em] text-faint">
              <tr>
                <th className="px-4 py-3">NAME</th>
                <th className="px-4 py-3">CATEGORY</th>
                <th className="px-4 py-3">PHONE</th>
                <th className="px-4 py-3">CITY</th>
                <th className="px-4 py-3">STATE</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-line/60">
                  <td className="px-4 py-2.5 text-cream">{r.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-amber">{label(r.category)}</td>
                  <td className="px-4 py-2.5 text-smoke">{r.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-smoke">{r.city ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-smoke">{r.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 font-mono text-[10px] text-faint">
          <Link href={`/dashboard?key=${k}`} className="text-amber hover:underline">← CONTROL ROOM</Link>
          {" · "}Source: OpenStreetMap (ODbL) — free, no API key, unlimited.
        </p>
      </div>
    </main>
  );
}
