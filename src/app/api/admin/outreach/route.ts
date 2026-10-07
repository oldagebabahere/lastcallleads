// /api/admin/outreach — today's personalized cold-outreach batch.
//
// Pulls BUYER prospects (insurance / beverage / attorney) for a state,
// counts this week's REAL filings from the events table, and generates a
// one-line personalized opener with Groq or Gemini (falls back to a smart
// template when no key / any error). The Google Apps Script in
// OUTREACH-AUTOMATION.md fetches this once a day and sends via Gmail, so
// replies land in the owner's own inbox.
//
//   GET /api/admin/outreach?state=TX&key=ADMIN_KEY&limit=25
//   GET /api/admin/outreach?state=TX&category=insurance&key=...
import { db } from "@/db";
import { ensureSchema } from "@/db/bootstrap";
import { events, prospects } from "@/db/schema";
import { isAdminKey } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";

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

// The people we sell to — venues themselves (bar) are NOT outreach targets.
const BUYER_CATEGORIES = ["insurance", "beverage", "attorney"] as const;

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

// Guess a contact's first name from a business name when we can.
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
    // No filings in this state's feed this week — sell the timing, not a number.
    if (category === "insurance") {
      return `When a venue files its liquor application in ${where}, liquor-liability coverage is one of the first things it needs — we flag them the morning the filing posts.`;
    }
    if (category === "beverage") {
      return `Every venue that files a liquor application in ${where} hasn't chosen a distributor yet — we flag them the morning the filing posts.`;
    }
    return `Liquor applications in ${where} regularly hit hearings and objections — we flag every new filing the morning it posts.`;
  }
  if (category === "insurance") {
    return `${filings} new liquor applications landed in ${where} this week — most of those venues still need liquor-liability coverage before they can open.`;
  }
  if (category === "beverage") {
    return `${filings} new liquor applications landed in ${where} this week — every one of them is a venue that hasn't chosen a distributor yet.`;
  }
  return `${filings} new liquor applications landed in ${where} this week — a few usually run into hearings or objections and need counsel before they open.`;
}

type AiBatch = { company: string; city: string | null; state: string; category: string }[];

async function aiLinesGroq(
  batch: AiBatch,
  filings: number
): Promise<Map<string, string>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  const sys =
    "You write first lines for cold emails for Last Call Leads, a $129/mo service that emails beverage-industry sellers every new US liquor-license filing the morning it posts. Write ONE opening line (max 220 chars, no greeting, no sign-off, no emoji, no fluff) personalized to the recipient's business type and city. You may use this REAL stat: " +
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
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { lines?: Record<string, string> };
  return new Map(Object.entries(parsed.lines ?? {}));
}

async function aiLinesGemini(
  batch: AiBatch,
  filings: number
): Promise<Map<string, string>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  const prompt =
    "Write first lines for cold emails for Last Call Leads, a $129/mo service that emails beverage-industry sellers every new US liquor-license filing the morning it posts. For each business below write ONE opening line (max 220 chars, no greeting, no sign-off, no emoji, no fluff), personalized to their business type and city. Real stat you may use: " +
    `${filings} new liquor filings in their state this week. ` +
    'Return strict JSON {"lines": {"<company>": "<line>"}} — exactly one line per company.\n\n' +
    JSON.stringify(batch);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(25_000),
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
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? req.headers.get("x-admin-key");
  if (!isAdminKey(key)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const stateParam = (url.searchParams.get("state") ?? "AUTO")
    .trim()
    .toUpperCase();
  const auto = stateParam === "AUTO";
  if (!auto && stateParam.length !== 2) {
    return Response.json(
      { ok: false, error: "pass ?state=XX or ?state=AUTO" },
      { status: 400 }
    );
  }
  let state = stateParam;
  let pool: string[] = [];

  // AUTO: rotate weekly across every state that has a harvested prospect
  // pool (>= 20 prospects). Zero manual rotation — ever.
  if (auto) {
    const counts = await db
      .select({
        state: prospects.state,
        n: sql<number>`count(*)::int`,
      })
      .from(prospects)
      .groupBy(prospects.state);
    pool = counts
      .filter((c) => c.n >= 20)
      .map((c) => c.state)
      .sort();
    if (!pool.length) {
      return Response.json(
        {
          ok: false,
          error:
            "No prospect pool yet — open PROSPECT FINDER in the dashboard and run one state once. After that, rotation is fully automatic (the daily job also grows the pool by itself).",
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
    50
  );

  await ensureSchema();

  // Real, current hook: how many filings actually landed this week.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  // Uses the date at the SOURCE (occurredAt), not detectedAt — detectedAt is
  // the import time, so a bulk import made every record look "this week"
  // (e.g. 6,509 filings). If the number still looks implausible, drop it and
  // let the template sell timing instead of a number.
  const countRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .where(and(eq(events.state, state), gt(events.occurredAt, weekAgo)));
  const rawCount = Number(countRow[0]?.n ?? 0);
  const filingsThisWeek = rawCount > 1500 ? 0 : rawCount;

  // withEmail=1 -> only prospects that have a website (so an email can be
  // built). rotate=1 -> a different slice of the pool every day, so the
  // daily job never re-pulls the same first rows.
  const withEmail = url.searchParams.get("withEmail") === "1";
  const rotate = url.searchParams.get("rotate") === "1";
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
  // Over-fetch (4x) because the safety filters below drop some rows
  // (non-US, duplicates) — we trim back to `limit` after filtering.
  const fetchSize = Math.min(limit * 4, 200);
  const offset = rotate && total > fetchSize ? (dayIndex * fetchSize) % total : 0;

  const rows = await db
    .select()
    .from(prospects)
    .where(where)
    .orderBy(prospects.id)
    .limit(fetchSize)
    .offset(offset);

  // OSM sometimes lists the same business twice — dedupe by name.
  const seenNames = new Set<string>();
  const rawLeads: RawLead[] = [];
  for (const p of rows) {
    if (rawLeads.length >= limit) break;
    // Canada safety-net (older harvests pre-date the US-area fix): never
    // email .ca websites/emails or obviously-Canadian business names.
    const siteOrName = `${p.website ?? ""} ${p.name} ${p.city ?? ""}`.toLowerCase();
    if (
      /\.ca\b/.test(siteOrName) ||
      /\b(canada|canadian|ontario|quebec|british columbia|alberta|manitoba|toronto|vancouver|montreal|calgary|ottawa)\b/.test(siteOrName)
    ) {
      continue;
    }
    // Only US-style websites: skip any country-code TLD except .us
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

  // AI personalization (optional): one batched call, template fallback.
  let provider = "template";
  let lines = new Map<string, string>();
  if (rawLeads.length) {
    const batch: AiBatch = rawLeads.map((l) => ({
      company: l.company,
      city: l.city,
      state: l.state,
      category: l.category,
    }));
    try {
      lines = process.env.GROQ_API_KEY
        ? await aiLinesGroq(batch, filingsThisWeek)
        : await aiLinesGemini(batch, filingsThisWeek);
      provider = process.env.GROQ_API_KEY ? "groq" : "gemini";
    } catch {
      lines = new Map();
      provider = "template";
    }
  }

  const leads: OutLead[] = rawLeads.map((l) => {
    const guessed = domainEmail(l.website);
    const ai = lines.get(l.company);
    return {
      ...l,
      email: guessed ?? "",
      emailSource: guessed ? "guessed" : "none",
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
    aiProvider: provider,
    hint: "emailSource 'guessed' = info@<domain> from their website — verify or send at your own risk. 'none' = call them (phone included).",
    leads,
  });
}
