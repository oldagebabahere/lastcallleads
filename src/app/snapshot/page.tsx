import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Mail, Radar } from "lucide-react";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events } from "@/db/schema";
import Reveal from "@/components/reveal";
import SubscribeForm from "@/components/subscribe-form";
import { Footer, Nav } from "@/components/ui";
import { maskName } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free snapshot: new bars & restaurants filing this week (TX & NY)",
  description:
    "See the newest liquor-license filings from the last 7 days — names, cities, venue types. Free snapshot, updated daily from official records.",
};

// Public teaser page. 5 names visible, the rest locked. Email capture
// converts the visitor into a free trial / waitlist lead.
export default async function SnapshotPage() {
  await ensureSchema();

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  let rows: (typeof events.$inferSelect)[] = [];
  try {
    rows = await db
      .select()
      .from(events)
      .where(sql`${events.occurredAt} > ${weekAgo}`)
      .orderBy(desc(events.occurredAt))
      .limit(15);
  } catch {
    rows = [];
  }

  const visible = rows.slice(0, 5);
  const locked = rows.slice(5);

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ Free snapshot · updated daily ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium leading-tight sm:text-5xl">
          New bars &amp; restaurants that just filed
          <span className="italic text-amber"> — this week.</span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-smoke">
          Every venue below is 60–90 days from opening. These five are free to see.
          The rest unlock the moment you start a 7-day free trial.
        </p>

        {/* stat strip */}
        <div className="mt-8 flex flex-wrap gap-3">
          <span className="rounded-full border border-amber/40 bg-amber/10 px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-amber">
            {rows.length} FILED THIS WEEK
          </span>
          <span className="rounded-full border border-leaf/40 bg-leaf/10 px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-leaf">
            TX + NY COVERED
          </span>
          <span className="rounded-full border border-line bg-panel px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-smoke">
            NAMES LOCKED AFTER 7 DAYS
          </span>
        </div>

        {/* free names */}
        <div className="mt-10 overflow-hidden rounded-xl border border-line">
          {visible.length === 0 && (
            <p className="px-6 py-12 text-center font-mono text-xs text-smoke">
              First sweep populates this automatically. Check back soon.
            </p>
          )}
          {visible.map((e) => (
            <div key={e.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line/70 px-4 py-3.5 last:border-0">
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] text-amber">
                <Radar className="h-3 w-3" /> FILED
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-cream">
                  {e.tradeName ?? e.ownerName ?? "New venue"}
                </span>
                <span className="block truncate font-mono text-[11px] text-smoke">
                  {[e.city, e.typeName].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="font-mono text-[11px] text-faint">{e.state}</span>
            </div>
          ))}
        </div>

        {/* locked names teaser */}
        {locked.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-xl border border-amber/40 bg-gradient-to-b from-amber/10 to-panel">
            <div className="flex items-center gap-2 border-b border-amber/30 px-4 py-3">
              <LockKeyhole className="h-4 w-4 text-amber" />
              <p className="font-mono text-[11px] tracking-[0.2em] text-amber">
                {locked.length} MORE FILINGS UNLOCKED WITH TRIAL
              </p>
            </div>
            {locked.map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line/50 px-4 py-3 last:border-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-smoke locked-name">
                    {maskName(e.tradeName ?? e.ownerName ?? "Applicant")}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-faint">
                    {[e.city, e.typeName].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-amber">{e.state}</span>
              </div>
            ))}
          </div>
        )}

        {/* email capture */}
        <Reveal delay={100}>
          <div className="mt-8 rounded-2xl border border-amber/50 bg-gradient-to-b from-amber/15 to-panel p-7 sm:p-9">
            <Mail className="h-5 w-5 text-amber" />
            <h2 className="font-display mt-3 text-2xl font-medium text-cream">
              See every name, same morning it files.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-smoke">
              Start free. Pick your state, drop your email, and your first digest lands at the
              next morning sweep.
            </p>
            <div className="mt-6 max-w-md">
              <SubscribeForm plan="solo" />
            </div>
          </div>
        </Reveal>

        <div className="mt-8 text-center">
          <Link href="/feed" className="font-mono text-[11px] tracking-[0.15em] text-amber hover:underline">
            BROWSE THE FULL PUBLIC FEED →
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
