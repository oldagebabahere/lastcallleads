"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import type { FilingEvent } from "@/db/schema";
import { LogoMark } from "@/components/logo";
import { BRAND } from "@/lib/brand";
import { scoreFiling } from "@/lib/lead-score";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  // Corrupt future dates (registry typos like "2262") never reach the UI.
  if (date.getTime() > Date.now() + 86_400_000) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
// Re-exported for convenience — the canonical copy lives in @/lib/fmt
// (callable from server components too).
export { fmtDate as fmtDateShared } from "@/lib/fmt";

export function EventBadge({ type }: { type: string }) {
  if (type === "NEW_PENDING")
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.18em] text-amber">
        <span className="h-1.5 w-1.5 rounded-full bg-amber pulse-dot" /> FILED
      </span>
    );
  if (type === "NEW_LICENSE")
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.18em] text-neon">
        <span className="h-1.5 w-1.5 rounded-full bg-neon" /> ISSUED
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.18em] text-smoke">
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

// Primary navigation — trimmed for clarity. Everything else lives in the footer.
const NAV_LINKS = [
  { href: "/feed", label: "LIVE FEED" },
  { href: "/coverage", label: "COVERAGE" },
  { href: "/sample", label: "SAMPLE" },
  { href: "/insights", label: "DATA DESK" },
  { href: "/guides", label: "GUIDES" },
] as const;

const MOBILE_LINKS = [
  { href: "/snapshot", label: "Free Snapshot" },
  { href: "/feed", label: "Live Feed" },
  { href: "/cities", label: "Cities" },
  { href: "/coverage", label: "Coverage" },
  { href: "/sample", label: "Sample Digest" },
  { href: "/reports", label: "Reports" },
  { href: "/insights", label: "Data Desk" },
  { href: "/types", label: "License Types" },
  { href: "/guides", label: "Guides" },
  { href: "/#pricing", label: "Pricing" },
] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // light/dark theme — choice saved in localStorage, defaults to system
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b border-black/30 bg-frame backdrop-blur-xl transition-shadow duration-500 ${
          scrolled ? "shadow-[0_18px_50px_-25px_rgba(0,0,0,0.85)]" : ""
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="logo-neon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber/40 bg-ink text-amber shadow-[inset_0_1px_0_rgba(232,176,84,0.15)] transition-all duration-500 group-hover:border-amber/70 group-hover:text-amber">
              <LogoMark className="h-5 w-5" withDrop />
            </span>
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">
              {BRAND.name}
              <span className="text-amber">.</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] lg:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-3.5 py-1.5 text-smoke transition-all duration-300 hover:border hover:border-white/25 hover:bg-white/5 hover:text-cream"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleTheme}
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              title={dark ? "Light theme" : "Dark theme"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-smoke transition-colors hover:border-smoke hover:text-cream"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              href="/#pricing"
              className="btn-mint hidden px-3.5 py-2 font-mono text-[11px] tracking-[0.12em] sm:inline-flex"
            >
              GET ALERTS
            </Link>
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-smoke transition-colors hover:border-smoke hover:text-cream lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Full-screen glass mobile menu */}
      <div
        className={`fixed inset-0 z-[70] transition-all duration-500 lg:hidden ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="absolute inset-0 bg-ink/95 backdrop-blur-2xl" onClick={() => setOpen(false)} />
        <div className="relative flex h-full flex-col px-6 pb-8 pt-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-semibold">
              {BRAND.name}<span className="text-amber">.</span>
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-smoke transition-colors hover:border-smoke hover:text-cream"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="mt-10 flex flex-1 flex-col gap-1 overflow-y-auto">
            {MOBILE_LINKS.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`border-b border-line/50 py-4 font-display text-2xl font-medium text-cream/90 transition-all duration-500 hover:pl-2 hover:text-amber ${
                  open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
                style={{ transitionDelay: `${60 + i * 45}ms` }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/#pricing"
            onClick={() => setOpen(false)}
            className="btn-mint mt-6 w-full justify-center px-6 py-4 text-sm"
          >
            Start getting alerts
          </Link>
        </div>
      </div>
    </>
  );
}

// social profiles - set these env vars and the icons appear automatically:
//   NEXT_PUBLIC_LINKEDIN_URL, NEXT_PUBLIC_X_URL, NEXT_PUBLIC_PINTEREST_URL
function SocialIcons() {
  const links = [
    {
      href: process.env.NEXT_PUBLIC_LINKEDIN_URL,
      label: "LinkedIn",
      path: "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z",
    },
    {
      href: process.env.NEXT_PUBLIC_X_URL,
      label: "X (Twitter)",
      path: "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z",
    },
    {
      href: process.env.NEXT_PUBLIC_PINTEREST_URL,
      label: "Pinterest",
      path: "M12.02 1.6C6.58 1.6 3.9 5.42 3.9 8.6c0 1.9 1.1 4.27 2.87 5.02.27.11.41.06.47-.19.05-.18.27-1.06.37-1.47.05-.19.03-.35-.13-.54-.4-.47-.65-1.08-.65-1.94 0-2.5 1.87-4.96 5.05-4.96 2.75 0 4.68 1.87 4.68 4.55 0 3.03-1.53 5.13-3.52 5.13-1.1 0-1.92-.91-1.66-2.03.31-1.33.92-2.76.92-3.72 0-.86-.46-1.57-1.41-1.57-1.12 0-2.02 1.16-2.02 2.71 0 .99.33 1.65.33 1.65l-1.36 5.76c-.36 1.52-.05 3.63-.03 3.83.02.12.17.15.24.06.1-.13 1.38-1.71 1.82-3.29.12-.44.7-2.72.7-2.72.34.65 1.35 1.23 2.42 1.23 3.19 0 5.35-2.9 5.35-6.79 0-2.94-2.49-5.68-6.28-5.68z",
    },
  ].filter((l) => l.href && l.href.startsWith("http"));
  if (!links.length) return null;
  return (
    <div className="mt-3 flex items-center gap-3">
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={l.label}
          className="text-smoke transition-colors hover:text-amber"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d={l.path} />
          </svg>
        </a>
      ))}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-cream/10 bg-ox-ink text-cream">
      <div className="overflow-hidden px-5 pt-10">
        <p className="footer-giant text-center">
          {BRAND.name.toUpperCase()}
        </p>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <LogoMark className="h-7 w-7 text-amber" />
            {BRAND.name}<span className="text-amber">.</span>
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-[0.15em] text-faint">
            CONFIDENTIAL INTEL · WATCHED HOURLY · DELIVERED DAILY
          </p>
          <SocialIcons />
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
          <Link href="/about" className="hover:text-cream">ABOUT</Link>
          <Link href="/contact" className="hover:text-cream">CONTACT</Link>
        </div>
      </div>
      <div className="border-t border-line/60 px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-x-5 gap-y-2 font-mono text-[9px] tracking-[0.16em] text-faint sm:justify-between">
          <span className="hidden sm:block">
            CONFIDENTIAL LEAD INTEL · REFRESHED DAILY · <span className="text-amber">50 STATES</span>
          </span>
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
