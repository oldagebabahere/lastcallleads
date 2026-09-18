// Lead scoring — the retention engine.
//
// Raw filings are commodity. What keeps a paying subscriber is being told
// WHICH ONE to call first. This module turns every filing into a 0-100
// score with a plain-English reason, so the digest can headline the single
// best lead of the day.
//
// Scoring inputs (all derived from public record fields we already store):
//   1. Licence type  — full bar / package store = high buying intent
//   2. Signal type   — a new APPLICATION beats an issued licence (earlier)
//   3. Freshness     — filed in the last 7 days = still deciding
//   4. Market size   — metro city = more SKUs to place
//   5. Data richness — we have city + county + phone = easier to act on

export type ScorableFiling = {
  eventType: string;
  typeName?: string | null;
  city?: string | null;
  county?: string | null;
  occurredAt?: Date | null;
  summary?: string | null;
};

export type Score = {
  value: number; // 0-100
  tier: "A" | "B" | "C";
  reason: string;
  action: string;
};

// Licence-type intent weights. These are the venue categories where a real
// beverage programme gets decided, not a one-off permit.
const TYPE_WEIGHTS: { match: RegExp; points: number; reason: string; action: string }[] = [
  {
    match: /mixed beverage.*late|late hours.*mixed/i,
    points: 40,
    reason: "Full bar with late-night service — the highest-volume account profile",
    action: "Call today, ask for the beverage lead",
  },
  {
    match: /mixed beverage.*restaurant|restaurant.*mixed beverage/i,
    points: 38,
    reason: "Full-liquor restaurant — high value per bottle, educated buyer",
    action: "Send your wine and premium spirits list",
  },
  {
    match: /mixed beverage|full service|on.?sale general/i,
    points: 35,
    reason: "Full spirits programme on day one",
    action: "Book a tasting or menu-building visit",
  },
  {
    match: /package|off.?sale general|liquor store/i,
    points: 33,
    reason: "Retail store with shelf space to fill",
    action: "Pitch shelf facings and cold-box programmes",
  },
  {
    match: /brewpub|brewer|brewery|winery/i,
    points: 28,
    reason: "Production plus taproom — equipment and distribution decisions",
    action: "Discuss distribution and packaging",
  },
  {
    match: /restaurant|eating place|food/i,
    points: 25,
    reason: "Food-first concept — wine list and premium spirits likely",
    action: "Lead with your wine and aperitif range",
  },
  {
    match: /tavern|bar\b|cabaret|nightclub/i,
    points: 24,
    reason: "On-premise bar programme — steady volume account",
    action: "Focus on well and back-bar staples",
  },
  {
    match: /wine|malt|beer/i,
    points: 18,
    reason: "Beer or wine only — narrower but fast-moving range",
    action: "Lead with your core beer or wine lines",
  },
];

// Metro markets carry more venues per rep visit, so a filing there is worth
// more route time. Kept deliberately short — these are the biggest markets
// across every state we cover.
const METRO_HINTS = [
  "new york", "brooklyn", "queens", "bronx", "manhattan", "buffalo",
  "houston", "dallas", "austin", "san antonio", "fort worth", "arlington",
  "chicago", "seattle", "spokane", "st louis", "kansas city", "springfield",
  "denver", "colorado springs", "aurora", "baltimore", "rockville",
  "silver spring", "hartford", "stamford", "new haven", "bridgeport",
  "napa", "los angeles", "san francisco", "san diego", "sacramento",
];

export function scoreFiling(f: ScorableFiling): Score {
  let points = 10; // baseline for any real filing
  const reasons: string[] = [];
  let action = "Add to your call list";

  const label = `${f.typeName ?? ""} ${f.summary ?? ""}`;

  // 1. licence-type intent
  for (const w of TYPE_WEIGHTS) {
    if (w.match.test(label)) {
      points += w.points;
      reasons.push(w.reason);
      action = w.action;
      break;
    }
  }

  // 2. new application beats an issued licence (earlier buying window)
  const isApplication = f.eventType === "NEW_PENDING";
  if (isApplication) {
    points += 15;
    reasons.unshift("Fresh application — the buying window is open right now");
  } else if (f.eventType === "NEW_LICENSE") {
    points += 6;
    reasons.push("Licence just granted — fit-out and stocking phase");
  }

  // 3. freshness
  if (f.occurredAt) {
    const ageDays = (Date.now() - new Date(f.occurredAt).getTime()) / 86_400_000;
    if (ageDays <= 7) {
      points += 8;
    } else if (ageDays <= 30) {
      points += 3;
    }
  }

  // 4. market size
  const city = (f.city ?? "").toLowerCase();
  if (city && METRO_HINTS.some((m) => city.includes(m))) {
    points += 6;
  }

  // 5. data richness (actionable without more research)
  if (f.city) points += 3;
  if (f.county) points += 2;

  const value = Math.max(5, Math.min(100, points));
  const tier: Score["tier"] = value >= 70 ? "A" : value >= 45 ? "B" : "C";

  return {
    value,
    tier,
    reason: reasons[0] ?? "Standard filing — worth a call",
    action,
  };
}

export function tierLabel(tier: Score["tier"]): string {
  if (tier === "A") return "CALL TODAY";
  if (tier === "B") return "CALL THIS WEEK";
  return "WORTH A LOOK";
}

// ---------------------------------------------------------------------------
// Intent tags — subscriber-selectable "lead type" filters.
// A subscriber can say "only send me full bars" and the digest honours it.
// Every tag is derived from public licence-type text, so nothing new is
// required from the data sources.
// ---------------------------------------------------------------------------

export const INTENT_TAGS: { id: string; label: string; match: RegExp }[] = [
  {
    id: "full-bar",
    label: "Full bars (spirits licence)",
    match: /mixed beverage|on.?sale general|full service|type 47|type 48|type 75/i,
  },
  {
    id: "restaurant",
    label: "Restaurants (food-led venues)",
    match: /restaurant|eating place|food|bona.?fide|type 41|type 75/i,
  },
  {
    id: "package-store",
    label: "Package stores & liquor retail",
    match: /package|off.?sale|liquor store|type 20|type 21/i,
  },
  {
    id: "brewery",
    label: "Breweries, brewpubs & wineries",
    match: /brew|winery|cidery|distill/i,
  },
  {
    id: "beer-wine-only",
    label: "Beer & wine only",
    match: /beer|wine|malt|type 41|type 20/i,
  },
  {
    id: "late-night",
    label: "Late-night venues",
    match: /late hours|cabaret|nightclub|tavern/i,
  },
  {
    id: "new-application",
    label: "New applications only (earliest signal)",
    match: /.*/, // handled separately via eventType
  },
];

export function tagLabel(id: string): string {
  return INTENT_TAGS.find((t) => t.id === id)?.label ?? id;
}

// Does this filing match any of the subscriber's chosen intent tags?
// An empty selection means "send everything".
export function matchesIntent(
  filing: ScorableFiling,
  selected: string[]
): boolean {
  if (selected.length === 0) return true;

  const label = `${filing.typeName ?? ""} ${filing.summary ?? ""}`;

  for (const id of selected) {
    if (id === "new-application") {
      if (filing.eventType === "NEW_PENDING") return true;
      continue;
    }
    const tag = INTENT_TAGS.find((t) => t.id === id);
    if (tag && tag.id !== "new-application" && tag.match.test(label)) return true;
  }
  return false;
}
