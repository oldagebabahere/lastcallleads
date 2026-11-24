// Shared digest, briefing, and monthly recap runner.
import { db, pool } from "@/db";
import { and, desc, eq, gt, ilike, inArray, isNull, lt, notLike, or, sql } from "drizzle-orm";
import { events, licenses, subscribers, type FilingEvent } from "@/db/schema";
import {
  sendBriefing,
  sendDigest,
  sendMonthlyRecap,
  sendTrialEnded,
  type DigestExtra,
} from "./email";
import { dedupeKey, isJunkEntity, matchesIntent, scoreFiling } from "./lead-score";
import { pushSubscriberWebhook } from "./notify";

export type DigestReport = {
  subscriber: string;
  events: number;
  status: string;
};

// Expired trials: send one-time "trial over" email (respecting emailOptOut) and stop digests.
export async function sweepTrials(): Promise<number> {
  const expired = await db
    .select()
    .from(subscribers)
    .where(
      and(
        eq(subscribers.status, "trial"),
        lt(subscribers.trialEndsAt, new Date()),
        eq(subscribers.trialNotified, false)
      )
    )
    .limit(100);

  let notified = 0;
  for (const sub of expired) {
    if (!sub.emailOptOut) {
      try {
        await sendTrialEnded({
          email: sub.email,
          states: sub.states,
          plan: sub.plan,
        });
        notified++;
      } catch {
        // mark notified regardless so one broken address can't retrigger daily
      }
    }
    await db
      .update(subscribers)
      .set({ trialNotified: true })
      .where(eq(subscribers.id, sub.id));
  }
  return notified;
}

export async function runDigest(): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  reports: DigestReport[];
}> {
  await sweepTrials().catch(() => 0);

  const subs = await db
    .select()
    .from(subscribers)
    .where(
      and(
        or(
          eq(subscribers.status, "active"),
          and(
            eq(subscribers.status, "trial"),
            gt(subscribers.trialEndsAt, new Date())
          )
        ),
        eq(subscribers.emailOptOut, false)
      )
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
    const freshWindow = new Date(Date.now() - 21 * 86_400_000);
    const cityWant = (sub.cityFilter ?? "").trim();

    // Push down state + strict 21-day occurrence freshness + no future-dated renewals + non-TTB + optional city filter.
    const conds = [
      inArray(events.state, stateList),
      gt(events.detectedAt, since),
      gt(events.occurredAt, freshWindow),
      sql`${events.occurredAt} <= now() + interval '1 day'`,
      or(isNull(events.licenseKey), notLike(events.licenseKey, "TTB-%")),
    ];
    if (cityWant) {
      conds.push(ilike(events.city, `%${cityWant}%`));
    }

    const raw = await db
      .select()
      .from(events)
      .where(and(...conds))
      .orderBy(desc(events.occurredAt))
      .limit(1000);

    // Fetch license enrichment (phone, address, zip, typeName, sourceUrl) BEFORE ZIP filtering.
    const extra: DigestExtra = new Map();
    const keys = raw.map((e) => e.licenseKey).filter((k): k is string => Boolean(k));
    for (let i = 0; i < keys.length; i += 400) {
      const lic = await db
        .select({
          state: licenses.state,
          key: licenses.licenseKey,
          phone: licenses.phone,
          address: licenses.address,
          zip: licenses.zip,
          typeName: licenses.typeName,
          sourceUrl: licenses.sourceUrl,
        })
        .from(licenses)
        .where(
          and(
            inArray(licenses.state, stateList),
            inArray(licenses.licenseKey, keys.slice(i, i + 400))
          )
        );
      for (const l of lic) {
        extra.set(`${l.state}|${l.key}`, {
          phone: l.phone,
          address: l.address,
          zip: l.zip,
          typeName: l.typeName,
          sourceUrl: l.sourceUrl,
          monthlyRevenue: null,
        });
      }
    }

    // TX Multi-Unit Operator enrichment: match venue or parent LLC against TX Comptroller alcohol receipts!
    if (stateList.includes("TX")) {
      const txNames = Array.from(
        new Set(
          raw
            .filter((e) => e.state === "TX")
            .flatMap((e) => [e.tradeName, e.ownerName])
            .map((n) => (n ?? "").trim().toLowerCase())
            .filter((n) => n.length >= 3)
        )
      ).slice(0, 300);
      if (txNames.length) {
        try {
          const revRes = await pool.query<{ k: string; total: number }>(
            `SELECT lower(coalesce(owner_name, trade_name)) AS k, max(total) AS total
             FROM venue_receipts
             WHERE lower(trade_name) = ANY($1::text[]) OR lower(owner_name) = ANY($1::text[])
             GROUP BY 1`,
            [txNames]
          );
          const revByName = new Map(revRes.rows.map((r) => [r.k, Number(r.total)]));
          for (const e of raw) {
            if (e.state !== "TX" || !e.licenseKey) continue;
            const hit =
              revByName.get((e.ownerName ?? "").trim().toLowerCase()) ??
              revByName.get((e.tradeName ?? "").trim().toLowerCase()) ??
              null;
            if (hit && hit > 0) {
              const cur = extra.get(`${e.state}|${e.licenseKey}`) ?? {
                phone: null,
                address: null,
                zip: null,
                typeName: e.typeName,
              };
              extra.set(`${e.state}|${e.licenseKey}`, { ...cur, monthlyRevenue: hit });
            }
          }
        } catch {
          // receipts table optional
        }
      }
    }

    let evts = raw;

    // 1) ZIP code filter (now genuinely enforced!)
    const zipSet = new Set(
      (sub.zipFilter ?? "")
        .split(/[,\s]+/)
        .map((z) => z.replace(/\D/g, "").slice(0, 5))
        .filter((z) => z.length === 5)
    );
    if (zipSet.size > 0) {
      evts = evts.filter((e) => {
        const info = e.licenseKey ? extra.get(`${e.state}|${e.licenseKey}`) : undefined;
        const z = (info?.zip ?? "").replace(/\D/g, "").slice(0, 5);
        return Boolean(z && zipSet.has(z));
      });
    }

    // 2) Lead-type / intent tag filter
    const tags = (sub.typeFilter ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length) {
      evts = evts.filter((e) =>
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
      );
    }

    // 3) Saved search keywords filter
    const kwWant = (sub.keywordFilter ?? "").trim().toLowerCase();
    if (kwWant) {
      const kws = kwWant.split(/[,\s]+/).filter(Boolean);
      evts = evts.filter((e) => {
        const hay = `${e.summary ?? ""} ${e.typeName ?? ""} ${e.tradeName ?? ""} ${e.city ?? ""}`.toLowerCase();
        return kws.every((k) => hay.includes(k));
      });
    }

    // 4) Drop nonprofits/temp-events, dedupe per business, rank by lead score.
    const scoreOf = (e: FilingEvent) =>
      scoreFiling({
        eventType: e.eventType,
        typeName: e.typeName,
        city: e.city,
        county: e.county,
        occurredAt: e.occurredAt,
        summary: e.summary,
      }).value;

    const best = new Map<string, { e: FilingEvent; v: number }>();
    for (const e of evts) {
      if (e.licenseKey?.startsWith("TTB-")) continue;
      if (isJunkEntity(e.tradeName, e.ownerName, e.summary, e.typeName)) continue;
      const key = dedupeKey(e.tradeName ?? e.ownerName ?? e.summary, e.city);
      const v = scoreOf(e);
      const cur = best.get(key);
      if (!cur || v > cur.v) best.set(key, { e, v });
    }
    const ranked = [...best.values()].sort((a, b) => b.v - a.v).map((x) => x.e);
    const totalFound = ranked.length;

    const cap = Math.min(200, Math.max(5, sub.digestLimit || 40));
    evts = ranked.slice(0, cap);

    if (evts.length === 0) {
      await db
        .update(subscribers)
        .set({ lastDigestAt: new Date() })
        .where(eq(subscribers.id, sub.id));
      reports.push({ subscriber: sub.email, events: 0, status: "nothing_new" });
      continue;
    }

    try {
      const result = await sendDigest(sub, evts, { total: totalFound, extra });
      if (sub.webhookUrl) {
        await pushSubscriberWebhook(sub, evts).catch(() => undefined);
      }
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

// Weekly territory briefing — Mondays only. Queries per subscriber state set so
// big states never crowd out smaller territories inside a global LIMIT.
export async function runBriefings(): Promise<{
  ok: boolean;
  sent: number;
  reports: { subscriber: string; status: string }[];
}> {
  const subs = await db
    .select()
    .from(subscribers)
    .where(
      and(
        or(
          eq(subscribers.status, "active"),
          and(
            eq(subscribers.status, "trial"),
            gt(subscribers.trialEndsAt, new Date())
          )
        ),
        eq(subscribers.emailOptOut, false)
      )
    )
    .limit(500);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const reports: { subscriber: string; status: string }[] = [];

  for (const sub of subs) {
    const stateList = sub.states
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!stateList.length) continue;

    const raw = await db
      .select()
      .from(events)
      .where(
        and(
          inArray(events.state, stateList),
          gt(events.occurredAt, weekAgo),
          or(isNull(events.licenseKey), notLike(events.licenseKey, "TTB-%"))
        )
      )
      .orderBy(desc(events.occurredAt))
      .limit(1000);

    const mine = raw.filter(
      (e) => !isJunkEntity(e.tradeName, e.ownerName, e.summary, e.typeName)
    );
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
    const hotLeads = mine
      .filter(
        (e) =>
          e.typeName &&
          /mixed beverage|package store|restaurant|brewpub|liquor/i.test(e.typeName)
      )
      .slice(0, 5)
      .map(
        (e) =>
          `${e.tradeName ?? e.ownerName ?? "Venue"} · ${e.city ?? e.county ?? e.state} · ${e.typeName}`
      );

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

// Monthly value recap — queries per subscriber state list cleanly.
export async function runMonthlyRecaps(): Promise<{
  ok: boolean;
  sent: number;
  reports: { subscriber: string; status: string }[];
}> {
  const subs = await db
    .select()
    .from(subscribers)
    .where(
      and(
        or(
          eq(subscribers.status, "active"),
          and(
            eq(subscribers.status, "trial"),
            gt(subscribers.trialEndsAt, new Date())
          )
        ),
        eq(subscribers.emailOptOut, false)
      )
    )
    .limit(500);

  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const reports: { subscriber: string; status: string }[] = [];

  for (const sub of subs) {
    const stateList = sub.states
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!stateList.length) continue;

    const raw = await db
      .select()
      .from(events)
      .where(
        and(
          inArray(events.state, stateList),
          gt(events.occurredAt, monthAgo),
          or(isNull(events.licenseKey), notLike(events.licenseKey, "TTB-%"))
        )
      )
      .orderBy(desc(events.occurredAt))
      .limit(2500);

    const mine = raw.filter(
      (e) => !isJunkEntity(e.tradeName, e.ownerName, e.summary, e.typeName)
    );
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
    const topCities = [...byCity.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([x]) => x);
    const topTypes = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([x]) => x);
    const sampleLeads = hot
      .slice(0, 5)
      .map(
        (e) =>
          `${e.tradeName ?? e.ownerName ?? "Venue"} · ${e.city ?? e.county ?? e.state} · ${e.typeName ?? "filing"}`
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
