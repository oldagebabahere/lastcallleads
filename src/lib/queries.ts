// Read helpers for pages. Every helper tolerates an empty/uninitialized
// database so the site renders beautifully even before the first pull.
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { desc, sql } from "drizzle-orm";
import { events, ingestRuns, licenses, subscribers } from "@/db/schema";

export type SiteStats = {
  watching: number;
  byState: { state: string; n: number }[];
  totalEvents: number;
  lastRunAt: Date | null;
  lastRunOk: boolean | null;
  activeSubscribers: number;
};

export async function getSiteStats(): Promise<SiteStats> {
  const empty: SiteStats = {
    watching: 0,
    byState: [],
    totalEvents: 0,
    lastRunAt: null,
    lastRunOk: null,
    activeSubscribers: 0,
  };
  try {
    await ensureSchema();
    const [byState, evtCount, lastRuns, subCount] = await Promise.all([
      db
        .select({ state: licenses.state, n: sql<number>`count(*)::int` })
        .from(licenses)
        .groupBy(licenses.state),
      db.select({ n: sql<number>`count(*)::int` }).from(events),
      db
        .select({ ok: ingestRuns.ok, finishedAt: ingestRuns.finishedAt, startedAt: ingestRuns.startedAt })
        .from(ingestRuns)
        .orderBy(desc(ingestRuns.id))
        .limit(1),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(subscribers),
    ]);
    const watching = byState.reduce((a, b) => a + b.n, 0);
    return {
      watching,
      byState,
      totalEvents: evtCount[0]?.n ?? 0,
      lastRunAt: lastRuns[0] ? (lastRuns[0].finishedAt ?? lastRuns[0].startedAt) : null,
      lastRunOk: lastRuns[0]?.ok ?? null,
      activeSubscribers: subCount[0]?.n ?? 0,
    };
  } catch {
    return empty;
  }
}

export async function getRecentEvents(limit = 14) {
  try {
    await ensureSchema();
    return await db
      .select()
      .from(events)
      .orderBy(desc(events.occurredAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export const FREE_DELAY_DAYS = 7;

export function embargoCutoff(): Date {
  return new Date(Date.now() - FREE_DELAY_DAYS * 86_400_000);
}

export function isLocked(occurredAt: Date | null): boolean {
  if (!occurredAt) return false;
  return occurredAt.getTime() > embargoCutoff().getTime();
}

// "san antonio" + "TX" → "san-antonio-tx" (city page URLs)
export function citySlug(city: string, state: string): string {
  const c = city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${c}-${state.toLowerCase()}`;
}

export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  // Corrupt future dates (registry typos like "2262") never reach the UI.
  if (date.getTime() > Date.now() + 86_400_000) return "—";
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 3600) return `${Math.max(1, Math.floor(secs / 60))}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Mask a business name for the free tier — keep a hint, hide the value.
export function maskName(name: string | null): string {
  if (!name) return "••••••";
  return name
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => (w.length <= 1 ? w : w[0] + "•".repeat(Math.min(6, Math.max(2, w.length - 1)))))
    .join(" ");
}
