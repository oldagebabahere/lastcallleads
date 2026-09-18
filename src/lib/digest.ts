// Shared digest runner used by the cron route and the manual admin trigger.
import { db } from "@/db";
import { and, desc, gt, inArray, eq } from "drizzle-orm";
import { events, subscribers, type FilingEvent } from "@/db/schema";
import { sendBriefing, sendDigest, sendMonthlyRecap } from "./email";
import { matchesIntent } from "./lead-score";

export type DigestReport = {
  subscriber: string;
  events: number;
  status: string;
};

export async function runDigest(): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  reports: DigestReport[];
}> {
  const subs = await db
    .select()
    .from(subscribers)
    .where(
      and(eq(subscribers.status, "active"), eq(subscribers.emailOptOut, false))
    )
    .limit(500);

  const reports: DigestReport[] = [];
  const dayAgo = new Date(Date.now() - 26 * 60 * 60 * 1000);

  for (const sub of subs) {
    const stateList = sub.states
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (stateList.length === 0) continue;
    const since = sub.lastDigestAt ?? dayAgo;

    const raw = await db
      .select()
      .from(events)
      .where(and(inArray(events.state, stateList), gt(events.detectedAt, since)))
      .orderBy(desc(events.occurredAt))
      .limit(300);

    // Apply the subscriber's own lead-type filter (chosen on /prefs).
    const tags = (sub.typeFilter ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    let evts = tags.length
      ? raw.filter((e) =>
          matchesIntent(
            {
              eventType: e.eventType,
              typeName: e.typeName,
              city: e.city,
              county: e.county,
              occurredAt: e.occurredAt,
              summary: e.summary,
            },
            tags
          )
        )
      : raw;

    // Respect the subscriber's requested digest size.
    const cap = sub.digestLimit || 40;
    evts = evts.slice(0, cap);

    if (evts.length === 0) {
      await db
        .update(subscribers)
        .set({ lastDigestAt: new Date() })
        .where(eq(subscribers.id, sub.id));
      reports.push({ subscriber: sub.email, events: 0, status: "nothing_new" });
      continue;
    }

    // One subscriber's failure must never stop the whole run — later runs
    // would otherwise skip everyone queued behind them.
    try {
      const result = await sendDigest(sub, evts);
      if (result.status !== "error") {
        await db
          .update(subscribers)
          .set({ lastDigestAt: new Date() })
          .where(eq(subscribers.id, sub.id));
      }
      reports.push({
        subscriber: sub.email,
        events: evts.length,
        status: result.status,
      });
    } catch (err) {
      reports.push({
        subscriber: sub.email,
        events: evts.length,
        status: "config_error",
      });
      console.error("digest failed for", sub.email, err);
    }
  }

  const sent = reports.filter((r) => r.status === "sent" || r.status === "dry_run").length;
  return { ok: true, sent, skipped: reports.length - sent, reports };
}

// Weekly territory briefing — extra value, every Monday.
export async function runBriefings(): Promise<{
  ok: boolean;
  sent: number;
  reports: { subscriber: string; status: string }[];
}> {
  const subs = await db
    .select()
    .from(subscribers)
    .where(
      and(eq(subscribers.status, "active"), eq(subscribers.emailOptOut, false))
    )
    .limit(500);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  // Briefing events for each subscriber's chosen states, within last 7 days.
  let weekEvents: FilingEvent[] = [];
  try {
    weekEvents = await db
      .select()
      .from(events)
      .where(and(gt(events.occurredAt, weekAgo)))
      .orderBy(desc(events.occurredAt))
      .limit(2000);
  } catch {
    weekEvents = [];
  }

  const reports: { subscriber: string; status: string }[] = [];
  for (const sub of subs) {
    const stateList = sub.states
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!stateList.length) continue;

    const mine = weekEvents.filter((e) => stateList.includes(e.state));
    if (mine.length === 0) continue;

    const byCounty = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const e of mine) {
      if (e.county) byCounty.set(e.county, (byCounty.get(e.county) ?? 0) + 1);
      if (e.typeName) byType.set(e.typeName, (byType.get(e.typeName) ?? 0) + 1);
    }
    const hotCounties = [...byCounty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);
    const topTypes = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    // Priority calls: hottest full-venue filings, names unlocked for members.
    const hotLeads = mine
      .filter((e) => e.typeName && /mixed beverage|package store|restaurant|brewpub|liquor/i.test(e.typeName))
      .slice(0, 5)
      .map((e) => `${e.tradeName ?? e.ownerName ?? "Venue"} · ${e.city ?? e.county ?? e.state} · ${e.typeName}`);

    try {
      const result = await sendBriefing({
        email: sub.email,
        states: sub.states,
        weekFilings: mine.length,
        hotCounties,
        topTypes,
        hotLeads,
      });
      reports.push({ subscriber: sub.email, status: result.status });
    } catch (err) {
      reports.push({ subscriber: sub.email, status: "config_error" });
      console.error("briefing failed for", sub.email, err);
    }
  }

  const sent = reports.filter((r) => r.status === "sent" || r.status === "dry_run").length;
  return { ok: true, sent, reports };
}

// Monthly value recap — retention email. Shows customer what they got.
export async function runMonthlyRecaps(): Promise<{
  ok: boolean;
  sent: number;
  reports: { subscriber: string; status: string }[];
}> {
  const subs = await db
    .select()
    .from(subscribers)
    .where(
      and(eq(subscribers.status, "active"), eq(subscribers.emailOptOut, false))
    )
    .limit(500);

  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const monthEvents = await db
    .select()
    .from(events)
    .where(gt(events.occurredAt, monthAgo))
    .orderBy(desc(events.occurredAt))
    .limit(5000);

  const reports: { subscriber: string; status: string }[] = [];
  for (const sub of subs) {
    const stateList = sub.states
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const mine = monthEvents.filter((e) => stateList.includes(e.state));
    if (!mine.length) continue;

    const hot = mine.filter((e) =>
      /mixed beverage|late hours|package store|restaurant|brewpub|liquor/i.test(
        `${e.typeName ?? ""} ${e.summary ?? ""}`
      )
    );
    const byCity = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const e of mine) {
      if (e.city) byCity.set(e.city, (byCity.get(e.city) ?? 0) + 1);
      if (e.typeName) byType.set(e.typeName, (byType.get(e.typeName) ?? 0) + 1);
    }
    const topCities = [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([x]) => x);
    const topTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([x]) => x);
    const sampleLeads = hot.slice(0, 5).map(
      (e) => `${e.tradeName ?? e.ownerName ?? "Venue"} · ${e.city ?? e.county ?? e.state} · ${e.typeName ?? "filing"}`
    );

    try {
      const result = await sendMonthlyRecap({
        email: sub.email,
        states: sub.states,
        monthFilings: mine.length,
        hotFilings: hot.length,
        topCities,
        topTypes,
        sampleLeads,
      });
      reports.push({ subscriber: sub.email, status: result.status });
    } catch (err) {
      reports.push({ subscriber: sub.email, status: "config_error" });
      console.error("monthly recap failed for", sub.email, err);
    }
  }

  const sent = reports.filter((r) => r.status === "sent" || r.status === "dry_run").length;
  return { ok: true, sent, reports };
}
