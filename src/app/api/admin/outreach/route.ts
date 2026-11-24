// /api/admin/outreach — today's personalized cold-outreach batch.
//   GET /api/admin/outreach?state=AUTO&withEmail=1&rotate=1&limit=25&key=ADMIN_KEY
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, prospects } from "@/db/schema";
import { extractAdminKey, isAdminKey } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { harvestDistributors } from "@/lib/distributors";
import { findRealEmail, mapLimit } from "@/lib/email-finder";
import { and, desc, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RawLead = {
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string;
  category: string;
};

type OutLead = RawLead & {
  email: string;
  emailSource: "listed" | "guessed" | "none";
  filingsThisWeek: number;
  aiLine: string;
  aiSource: "ai" | "template";
};

const BUYER_CATEGORIES = ["insurance", "distributor", "beverage", "attorney"] as const;

function domainEmail(site: string | null): string | null {
  if (!site) return null;
  const stripped = site
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "");
  const m = stripped.match(/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i);
  if (!m) return null;
  return `info@${m[0].replace(/\/$/, "").toLowerCase()}`;
}

function guessContact(company: string): string | null {
  const of = company.match(/^law offices? of ([a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+)?)/i);
  if (of) return of[1].split(" ")[0];
  const person = company.match(/\b([A-Z][a-z]+)\s+(?:Insurance|Agency|Group|Law|LLC)/);
  if (person) return person[1];
  return null;
}

function templateLine(
  category: string,
  city: string | null,
  state: string,
  filings: number
): string {
  const where = city ? `${city}, ${state}` : state;
  if (filings <= 0) {
    if (category === "insurance") {
      return `When a venue files its liquor application in ${where}, liquor-liability coverage is one of the first things it needs — we flag them the morning the filing posts.`;
    }
    if (category === "beverage" || category === "distributor") {
      return `Every venue that files a liquor application in ${where} hasn't chosen a distributor yet — we flag them the morning the filing posts.`;
    }
    return `Liquor applications in ${where} regularly hit hearings and objections — we flag every new filing the morning it posts.`;
  }
  if (category === "insurance") {
    return `${filings} new liquor applications landed in ${where} this week — most of those venues still need liquor-liability coverage before they can open.`;
  }
  if (category === "beverage" || category === "distributor") {
    return `${filings} new liquor applications landed in ${where} this week — every one of them is a venue that hasn't chosen a distributor yet.`;
  }
  return `${filings} new liquor applications landed in ${where} this week — a few usually run into hearings or objections and need counsel before they open.`;
}

type AiBatch = { company: string; city: string | null; state: string; category: string }[];

async function aiLinesGroq(batch: AiBatch, filings: number): Promise<Map<string, string>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  const sys =
    "You write first lines for cold emails for Last Call Leads, a $129/mo service that emails beverage-industry sellers every new US liquor-license filing the morning it posts. Write ONE opening line (max 220 chars, no greeting, no sign-off, no emoji, no fluff) personalized to the recipient's business type and city. Real stat you may use: " +
    `${filings} new liquor filings in their state this week. ` +
    'Return strict JSON: {"lines": {"<company>": "<line>"}} with exactly one line per company given.';
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(batch) },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { lines?: Record<string, string> };
  return new Map(Object.entries(parsed.lines ?? {}));
}

async function aiLinesGemini(batch: AiBatch, filings: number): Promise<Map<string, string>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  const prompt =
    "Write first lines for cold emails for Last Call Leads, a $129/mo service that emails beverage-industry sellers every new US liquor-license filing the morning it posts. For each business below write ONE opening line (max 220 chars, no greeting, no sign-off, no emoji, no fluff), personalized to their business type and city. Real stat you may use: " +
    `${filings} new liquor filings in their state this week. ` +
    'Return strict JSON {"lines": {"<company>": "<line>"}} — exactly one line per company.\n\n' +
    JSON.stringify(batch);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const parsed = JSON.parse(raw) as { lines?: Record<string, string> };
  return new Map(Object.entries(parsed.lines ?? {}));
}

export async function GET(req: Request) {
  if (!rateLimit({ key: `outreach:${clientIp(req)}`, max: 20, windowMs: 60_000 })) {
    return tooManyRequests();
  }
  if (!isAdminKey(extractAdminKey(req))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Always ensure schema BEFORE any DB query (prevents cold-DB crash in state=AUTO).
  await ensureSchema();

  const url = new URL(req.url);
  const stateParam = (url.searchParams.get("state") ?? "AUTO")
    .trim()
    .toUpperCase();
  const auto = stateParam === "AUTO";
  if (!auto && !/^[A-Z]{2}$/.test(stateParam)) {
    return Response.json(
      { ok: false, error: "pass ?state=XX or ?state=AUTO" },
      { status: 400 }
    );
  }
  let state = stateParam;
  let pool: string[] = [];

  if (auto) {
    const [counts, liveRows] = await Promise.all([
      db
        .select({ state: prospects.state, n: sql<number>`count(*)::int` })
        .from(prospects)
        .groupBy(prospects.state),
      db.selectDistinct({ state: events.state }).from(events),
    ]);
    const live = new Set(liveRows.map((r) => r.state));
    pool = counts
      .filter((c) => c.n >= 20 && live.has(c.state))
      .map((c) => c.state)
      .sort();
    if (!pool.length) {
      return Response.json(
        {
          ok: false,
          error:
            "No prospect pool yet — open PROSPECT FINDER in the dashboard and run one state once.",
        },
        { status: 400 }
      );
    }
    const weekIndex = Math.floor(Date.now() / (7 * 86_400_000));
    state = pool[weekIndex % pool.length];
  }

  const catsParam = (url.searchParams.get("category") ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => (BUYER_CATEGORIES as readonly string[]).includes(c));
  const categories = catsParam.length ? catsParam : [...BUYER_CATEGORIES];
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1),
    35
  );

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [countRow, proofRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(distinct ${events.licenseKey})::int` })
      .from(events)
      .where(
        and(
          eq(events.state, state),
          eq(events.eventType, "NEW_PENDING"),
          gt(events.occurredAt, weekAgo),
          sql`coalesce(${events.licenseKey}, '') NOT LIKE 'TTB-%'`,
          sql`coalesce(${events.typeName}, '') NOT ILIKE '%temporary%'`,
          sql`coalesce(${events.typeName}, '') NOT ILIKE '%nonprofit%'`
        )
      ),
    db
      .select({ name: events.tradeName, city: events.city })
      .from(events)
      .where(
        and(
          eq(events.state, state),
          isNotNull(events.tradeName),
          isNotNull(events.occurredAt),
          gt(events.occurredAt, new Date(Date.now() - 30 * 86_400_000))
        )
      )
      .orderBy(desc(events.occurredAt))
      .limit(3),
  ]);

  const rawCount = Number(countRow[0]?.n ?? 0);
  const filingsThisWeek = rawCount > 1500 ? 0 : rawCount;
  const proof = proofRows
    .filter((r) => r.name && r.name.trim().length > 2)
    .map((r) => (r.city ? `${r.name!.trim()} (${r.city})` : r.name!.trim()));

  if (categories.includes("distributor")) {
    await harvestDistributors(state, 4).catch(() => undefined);
  }

  // Default to withEmail=1 & rotate=1 unless explicitly set to "0" so callers
  // always get fresh, actionable leads with websites instead of repeating row 1.
  const withEmail = url.searchParams.get("withEmail") !== "0";
  const rotate = url.searchParams.get("rotate") !== "0";

  const where = and(
    eq(prospects.state, state),
    inArray(prospects.category, categories),
    ...(withEmail ? [isNotNull(prospects.website), ne(prospects.website, "")] : [])
  );
  const totalRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(where);
  const total = Number(totalRow[0]?.n ?? 0);
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const fetchSize = Math.min(limit * 3, 120);
  const offset = rotate && total > fetchSize ? (dayIndex * limit) % total : 0;

  const rows = await db
    .select()
    .from(prospects)
    .where(where)
    .orderBy(prospects.id)
    .limit(fetchSize)
    .offset(offset);

  const seenNames = new Set<string>();
  const rawLeads: RawLead[] = [];
  for (const p of rows) {
    if (rawLeads.length >= limit) break;
    const siteOrName = `${p.website ?? ""} ${p.name} ${p.city ?? ""}`.toLowerCase();
    if (
      /\.ca\b/.test(siteOrName) ||
      /\b(canada|canadian|ontario|quebec|british columbia|alberta|manitoba|toronto|vancouver|montreal|calgary|ottawa)\b/.test(
        siteOrName
      )
    ) {
      continue;
    }
    const host = (p.website ?? "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0];
    const tld = host.split(".").pop() ?? "";
    if (tld.length === 2 && tld !== "us") continue;
    const k = p.name.trim().toLowerCase();
    if (seenNames.has(k)) continue;
    seenNames.add(k);
    rawLeads.push({
      company: p.name,
      contactName: guessContact(p.name),
      email: null,
      phone: p.phone,
      website: p.website,
      city: p.city,
      state: p.state,
      category: p.category,
    });
  }

  // Run AI line generation and real-email discovery in parallel to stay well under 60s.
  const aiPromise = (async (): Promise<{ provider: string; lines: Map<string, string> }> => {
    if (!rawLeads.length) return { provider: "template", lines: new Map() };
    const batch: AiBatch = rawLeads.map((l) => ({
      company: l.company,
      city: l.city,
      state: l.state,
      category: l.category,
    }));
    if (process.env.GROQ_API_KEY) {
      try {
        return { provider: "groq", lines: await aiLinesGroq(batch, filingsThisWeek) };
      } catch {
        // fall through to Gemini or template
      }
    }
    if (process.env.GEMINI_API_KEY) {
      try {
        return { provider: "gemini", lines: await aiLinesGemini(batch, filingsThisWeek) };
      } catch {
        // fall through to template
      }
    }
    return { provider: "template", lines: new Map() };
  })();

  const [aiResult, found] = await Promise.all([
    aiPromise,
    mapLimit(rawLeads, 6, (l) => findRealEmail(l.website)),
  ]);

  const allowGuess = url.searchParams.get("guess") === "1";
  const leads: OutLead[] = rawLeads.map((l, idx) => {
    const real = found[idx];
    const guessed = allowGuess && !real ? domainEmail(l.website) : null;
    const email = real ?? guessed ?? "";
    const ai = aiResult.lines.get(l.company);
    return {
      ...l,
      email,
      emailSource: real ? "listed" : guessed ? "guessed" : "none",
      filingsThisWeek,
      aiLine:
        (ai && ai.length <= 300 ? ai.trim() : "") ||
        templateLine(l.category, l.city, l.state, filingsThisWeek),
      aiSource: ai && ai.length <= 300 ? "ai" : "template",
    };
  });

  return Response.json({
    ok: true,
    state,
    ...(auto ? { autoRotated: true, rotationPool: pool } : {}),
    filingsThisWeek,
    proof,
    aiProvider: aiResult.provider,
    leads,
  });
}
