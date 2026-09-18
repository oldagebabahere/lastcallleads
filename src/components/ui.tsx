import Link from "next/link";
import { Wine } from "lucide-react";
import type { FilingEvent } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { scoreFiling } from "@/lib/lead-score";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function EventBadge({ type }: { type: string }) {
  if (type === "NEW_PENDING")
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-amber">
        <span className="h-1.5 w-1.5 rounded-full bg-amber pulse-dot" /> FILED
      </span>
    );
  if (type === "NEW_LICENSE")
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-leaf">
        <span className="h-1.5 w-1.5 rounded-full bg-leaf" /> ISSUED
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-smoke">
      <span className="h-1.5 w-1.5 rounded-full bg-smoke" /> UPDATE
    </span>
  );
}

export function StatePill({ state }: { state: string }) {
  return (
    <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] tracking-[0.15em] text-smoke">
      {state}
    </span>
  );
}

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-amber/40 bg-amber/10 text-amber">
            <Wine className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            {BRAND.name}<span className="text-amber">.</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 font-mono text-[11px] tracking-[0.15em] text-smoke md:flex">
          <Link href="/snapshot" className="transition-colors hover:text-cream">
            FREE SNAPSHOT
          </Link>
          <Link href="/feed" className="transition-colors hover:text-cream">
            LIVE FEED
          </Link>
          <Link href="/cities" className="transition-colors hover:text-cream">
            CITIES
          </Link>
          <Link href="/coverage" className="transition-colors hover:text-cream">
            COVERAGE
          </Link>
          <Link href="/sample" className="transition-colors hover:text-cream">
            SAMPLE
          </Link>
          <Link href="/reports" className="transition-colors hover:text-cream">
            REPORTS
          </Link>
          <Link href="/insights" className="transition-colors hover:text-cream">
            DATA DESK
          </Link>
          <Link href="/types" className="transition-colors hover:text-cream">
            TYPES
          </Link>
          <Link href="/guides" className="transition-colors hover:text-cream">
            GUIDES
          </Link>
          <Link href="/#pricing" className="transition-colors hover:text-cream">
            PRICING
          </Link>
          <Link href="/partner" className="transition-colors hover:text-amber">
            PARTNER
          </Link>
        </nav>
        <Link
          href="/#pricing"
          className="rounded-full bg-amber px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.04]"
        >
          GET ALERTS
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-semibold">
            {BRAND.name}<span className="text-amber">.</span>
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-[0.15em] text-faint">
            PUBLIC RECORDS · WATCHED HOURLY · DELIVERED DAILY
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px] tracking-[0.15em] text-smoke">
          <Link href="/feed" className="hover:text-cream">FEED</Link>
          <Link href="/cities" className="hover:text-cream">CITIES</Link>
          <Link href="/coverage" className="hover:text-cream">COVERAGE</Link>
          <Link href="/sample" className="hover:text-cream">SAMPLE EMAIL</Link>
          <Link href="/reports" className="hover:text-cream">WEEKLY REPORTS</Link>
          <Link href="/states/texas" className="hover:text-cream">TEXAS</Link>
          <Link href="/states/new-york" className="hover:text-cream">NEW YORK</Link>
          <Link href="/insights" className="hover:text-cream">DATA DESK</Link>
          <Link href="/types" className="hover:text-cream">LICENSE TYPES</Link>
          <Link href="/guides" className="hover:text-cream">GUIDES</Link>
          <Link href="/partner" className="hover:text-amber">PARTNER</Link>
          <Link href="/about" className="hover:text-cream">ABOUT</Link>
          <Link href="/contact" className="hover:text-cream">CONTACT</Link>
          <Link href="/setup" className="hover:text-cream">SYSTEM</Link>
        </div>
      </div>
      <div className="border-t border-line/60 px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-x-5 gap-y-2 font-mono text-[9px] tracking-[0.16em] text-faint sm:justify-between">
          <span className="hidden sm:block">PUBLIC RECORDS · REFRESHED DAILY</span>
          <span className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link href="/privacy" className="hover:text-cream">PRIVACY</Link>
            <Link href="/terms" className="hover:text-cream">TERMS</Link>
            <Link href="/refunds" className="hover:text-cream">REFUNDS</Link>
            <Link href="/contact" className="hover:text-cream">SUPPORT</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

export function LeadRow({ e, locked }: { e: FilingEvent; locked: boolean }) {
  const name = locked ? maskForRow(e) : (e.tradeName ?? e.ownerName ?? "Unnamed applicant");
  // Same scoring the digest uses — so the site and the email agree.
  const score = scoreFiling({
    eventType: e.eventType,
    typeName: e.typeName,
    city: e.city,
    county: e.county,
    occurredAt: e.occurredAt,
    summary: e.summary,
  });
  const isPriority = score.value >= 70;
  return (
    <Link
      href={locked ? "/#pricing" : `/feed/${e.id}`}
      className="group grid grid-cols-[86px_1fr_auto] items-center gap-3 border-b border-line/70 px-4 py-3 transition-colors hover:bg-panel sm:grid-cols-[96px_80px_1fr_52px_auto] sm:gap-4"
    >
      <span className="font-mono text-[11px] text-faint">{fmtDate(e.occurredAt)}</span>
      <span className="hidden sm:block"><EventBadge type={e.eventType} /></span>
      <span className="min-w-0">
        <span className={`block truncate text-sm text-cream group-hover:text-amber ${locked ? "locked-name" : ""}`}>
          {name}
        </span>
        <span className="block truncate font-mono text-[11px] text-smoke">
          {[e.city, e.typeName].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span
        className={`hidden justify-self-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold sm:inline-block ${
          isPriority
            ? "border-amber/50 bg-amber/15 text-amber"
            : "border-line bg-panel2/50 text-smoke"
        }`}
        title={score.reason}
      >
        {score.value}
      </span>
      <StatePill state={e.state} />
    </Link>
  );
}

function maskForRow(e: FilingEvent): string {
  const raw = e.tradeName ?? e.ownerName ?? "Applicant";
  return raw
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => (w.length <= 1 ? w : w[0] + "•".repeat(Math.min(5, w.length))))
    .join(" ");
}
