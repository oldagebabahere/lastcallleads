import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { licenses } from "@/db/schema";
import { Footer, Nav } from "@/components/ui";
import { TYPE_LIBRARY } from "@/lib/license-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Texas liquor license types explained — MB, FB, LH, P and more",
  description:
    "Every Texas liquor license code decoded in plain English: what Mixed Beverage, Package Store, Late Hours and the rest mean — with live filing counts for each.",
};

export default async function TypesIndex() {
  await ensureSchema();
  let pendingByCode = new Map<string, number>();
  try {
    const rows = await db
      .select({ code: licenses.licenseType, n: sql<number>`count(*)::int` })
      .from(licenses)
      .where(sql`${licenses.state} = 'TX' AND ${licenses.kind} = 'pending'`)
      .groupBy(licenses.licenseType);
    for (const r of rows) {
      if (r.code) pendingByCode.set(r.code.toUpperCase(), r.n);
    }
  } catch {
    // counts are a garnish; page still renders
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-5xl px-5 pt-28 pb-20">
        <p className="eyebrow">[ Library · decode the paperwork ]</p>
        <h1 className="font-display mt-5 max-w-2xl text-4xl font-medium leading-tight sm:text-5xl">
          Texas liquor license types,
          <span className="italic text-amber"> in plain English.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke">
          Two letters on a filing decide everything: what the venue will be, what it will
          buy, and how hot a prospect it is. Here is every code that matters in Texas —
          with live counts of how many applications of each type are in the pipeline right now.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {TYPE_LIBRARY.map((t) => {
            const live = pendingByCode.get(t.code);
            return (
              <Link
                key={t.slug}
                href={`/types/${t.slug}`}
                className="group flex flex-col rounded-xl border border-line bg-panel p-6 transition-colors hover:border-amber/40"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-md border border-amber/40 bg-amber/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-[0.15em] text-amber">
                    {t.code}
                  </span>
                  {typeof live === "number" && (
                    <span className="font-mono text-[10px] tracking-[0.15em] text-smoke">
                      {live.toLocaleString()} PENDING NOW
                    </span>
                  )}
                </div>
                <h2 className="font-display mt-4 text-xl font-medium text-cream transition-colors group-hover:text-amber">
                  {t.name}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-smoke">{t.oneLiner}</p>
                <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-amber">
                  EXPLAINED <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                </p>
              </Link>
            );
          })}
        </div>
      </div>
      <Footer />
    </main>
  );
}
