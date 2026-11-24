// Beverage-Buyer Intelligence Engine — turns a raw government liquor filing
// into an actionable B2B sales dossier for beverage distributors, craft
// breweries, wine/spirits reps, and bar/POS suppliers.
import { MARKET_BY_CODE } from "./states";

export type EventPayloadMeta = {
  address?: string | null;
  zip?: string | null;
  phone?: string | null;
  contactName?: string | null;
  neighborhood?: string | null;
  mailAddress?: string | null;
  licenseType?: string | null;
  sourceUrl?: string | null;
};

export function parseEventMeta(payload: string | null | undefined): EventPayloadMeta {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return {
      address: typeof parsed.address === "string" ? parsed.address : null,
      zip: typeof parsed.zip === "string" ? parsed.zip : null,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      contactName: typeof parsed.contactName === "string" ? parsed.contactName : null,
      neighborhood: typeof parsed.neighborhood === "string" ? parsed.neighborhood : null,
      mailAddress: typeof parsed.mailAddress === "string" ? parsed.mailAddress : null,
      licenseType: typeof parsed.licenseType === "string" ? parsed.licenseType : null,
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : null,
    };
  } catch {
    return {};
  }
}

export type BeverageDossier = {
  archetype: string;
  beverageProgram: string;
  estAnnualSpend: string;
  estOpeningWindow: string;
  buyingWindow: string;
  pitchAngle: string;
  links: {
    googleMaps: string;
    streetView: string;
    linkedinOwner: string;
    instagramSearch: string;
    entityLookup: string;
    entityLookupLabel: string;
    webSearch: string;
    officialSource: string | null;
  };
  outreach: {
    coldEmailSubject: string;
    coldEmailBody: string;
    callOpener: string;
    dropByNote: string;
  };
};

const STATE_RUNWAY_DAYS: Record<string, number> = {
  TX: 60,
  NY: 90,
  CA: 75,
  IL: 35,
  WA: 45,
  OR: 45,
  CO: 35,
  CT: 60,
  MO: 35,
};

type FilingInput = {
  state: string;
  eventType: string;
  tradeName?: string | null;
  ownerName?: string | null;
  contactName?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  county?: string | null;
  neighborhood?: string | null;
  typeName?: string | null;
  licenseType?: string | null;
  sourceUrl?: string | null;
  occurredAt?: Date | null;
};

const METRO_CITIES = new Set([
  "austin", "dallas", "houston", "san antonio", "fort worth",
  "new york", "brooklyn", "manhattan", "queens", "bronx",
  "los angeles", "san francisco", "san diego", "oakland", "san jose",
  "chicago", "seattle", "portland", "denver", "st louis", "kansas city",
  "hartford", "stamford", "new haven",
]);

function classifyVenue(f: FilingInput): {
  archetype: string;
  beverageProgram: string;
  estAnnualSpend: string;
  pitchAngle: string;
} {
  const hay = `${f.typeName ?? ""} ${f.licenseType ?? ""}`.toLowerCase();
  const isMetro = METRO_CITIES.has((f.city ?? "").toLowerCase());

  if (/late hours|nightclub|cabaret|type 48|bar\b|tavern|lounge/.test(hay)) {
    return {
      archetype: "Full Cocktail Bar & Late-Night Venue",
      beverageProgram:
        "High-velocity well & call spirits, craft cocktail modifiers, draft beer lines, RTDs & mixers",
      estAnnualSpend: isMetro
        ? "$220K–$500K/yr est. wholesale spend"
        : "$120K–$280K/yr est. wholesale spend",
      pitchAngle:
        "Lead with well-pour velocity pricing, back-bar visibility programs, and fast restock cadence.",
    };
  }

  if (/package|off.?sale general|liquor store|type 21|lip\b|package goods/.test(hay)) {
    return {
      archetype: "Liquor & Package Retail Store",
      beverageProgram:
        "Full spirits wall, cold-box craft beer & RTDs, wine end-caps, seasonal floor stacks",
      estAnnualSpend: isMetro
        ? "$300K–$850K/yr est. wholesale spend"
        : "$160K–$450K/yr est. wholesale spend",
      pitchAngle:
        "Pitch opening inventory assortment, cold-box facings, and introductory case-deal margins.",
    };
  }

  if (/mixed beverage|on.?sale general|full service|type 47|type 75|restaurant liquor|lir\b/.test(hay)) {
    return {
      archetype: "Full-Liquor Restaurant & Bar",
      beverageProgram:
        "By-the-glass wine list, house cocktail program, premium spirits, craft draft & bottled beer",
      estAnnualSpend: isMetro
        ? "$160K–$380K/yr est. wholesale spend"
        : "$90K–$220K/yr est. wholesale spend",
      pitchAngle:
        "Offer a curated opening cocktail & BTG wine tasting before they lock menu print deadlines.",
    };
  }

  if (/brew|winery|distill|cidery|lmb\b/.test(hay)) {
    return {
      archetype: "Brewery, Taproom or Producer",
      beverageProgram:
        "Guest taps, wine/cider/NA options, packaging, distribution partnership & taproom equipment",
      estAnnualSpend: "$80K–$250K/yr est. beverage & distribution volume",
      pitchAngle:
        "Open with guest-beverage variety (NA, cider, wine) or regional distribution capacity.",
    };
  }

  if (/off.?sale beer|type 20|grocery|market|convenience|lgb\b|q\b|bf\b/.test(hay)) {
    return {
      archetype: "Off-Premise Beer & Wine Retail",
      beverageProgram:
        "Grab-and-go cold-box craft beer, domestic staples, canned RTDs, value & mid-tier wine",
      estAnnualSpend: "$70K–$180K/yr est. wholesale spend",
      pitchAngle:
        "Pitch top-turning cold-box SKUs, cooler-door planograms, and intro displays.",
    };
  }

  if (/beer|wine|malt|cafe|eating place|restaurant|type 41|lca\b|lrw\b/.test(hay)) {
    return {
      archetype: "Beer & Wine Restaurant / Café",
      beverageProgram:
        "Approachable BTG wine list, local craft cans/drafts, aperitifs, and non-alcoholic pairings",
      estAnnualSpend: isMetro
        ? "$65K–$150K/yr est. wholesale spend"
        : "$40K–$95K/yr est. wholesale spend",
      pitchAngle:
        "Keep it frictionless: offer a tight 6-wine + 4-beer starter menu with clean pour-cost math.",
    };
  }

  return {
    archetype: "New Licensed Alcohol Venue",
    beverageProgram:
      "Core spirits, wine, craft beer & bar program tailored to permit class",
    estAnnualSpend: "$80K–$220K/yr est. wholesale spend",
    pitchAngle:
      "Reach out early while initial supplier slots and opening orders are still undecided.",
  };
}

export function buildBeverageDossier(f: FilingInput): BeverageDossier {
  const cls = classifyVenue(f);
  const market = MARKET_BY_CODE[f.state.toUpperCase()];

  const venue = f.tradeName ?? f.ownerName ?? "New Venue";
  const entity = f.ownerName && f.ownerName !== venue ? f.ownerName : f.ownerName ?? venue;
  const loc = [f.city, f.state].filter(Boolean).join(", ");
  const addrQuery = encodeURIComponent(
    [f.address, f.city, f.state, f.zip].filter(Boolean).join(" ") ||
      [venue, f.city, f.state].filter(Boolean).join(" ")
  );

  // Build targeted decision-maker search query for LinkedIn
  const linkedInTerms = f.contactName
    ? `"${f.contactName}" ${f.city ?? f.state}`
    : `("${venue}" OR "${entity}") (owner OR founder OR "beverage director" OR partner OR GM) ${f.city ?? f.state}`;
  const linkedinOwner = `https://www.google.com/search?q=${encodeURIComponent(
    `site:linkedin.com/in ${linkedInTerms}`
  )}`;

  const webSearch = `https://www.google.com/search?q=${encodeURIComponent(
    `"${venue}" ${f.city ?? ""} ${f.state} opening OR menu OR yelp`
  )}`;

  const instagramSearch = `https://www.google.com/search?q=${encodeURIComponent(
    `site:instagram.com "${venue}" ${f.city ?? f.state}`
  )}`;

  const runwayDays = STATE_RUNWAY_DAYS[f.state.toUpperCase()] ?? 60;
  const baseDate = f.occurredAt ? new Date(f.occurredAt) : new Date();
  const estOpenDate = new Date(baseDate.getTime() + runwayDays * 86_400_000);
  const estOpenLabel = estOpenDate.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  const estOpeningWindow =
    f.eventType === "NEW_PENDING"
      ? `Est. Doors Open: ${estOpenLabel} (~${runwayDays}d ${market?.name ?? f.state} runway)`
      : f.eventType === "STATUS_CHANGE"
        ? "Active Status Transition · Immediate Pitch Window"
        : "Permit Cleared · Immediate Stocking & Opening Window";

  const entityLookup =
    market?.entityLookupUrl ??
    `https://opencorporates.com/companies?q=${encodeURIComponent(entity)}`;
  const entityLookupLabel = market?.entityLookupLabel ?? "OpenCorporates LLC Search";

  const ageDays = f.occurredAt
    ? Math.max(0, Math.floor((Date.now() - new Date(f.occurredAt).getTime()) / 86_400_000))
    : null;
  const buyingWindow =
    f.eventType === "NEW_PENDING"
      ? `${ageDays !== null ? `Filed ${ageDays === 0 ? "today" : `${ageDays}d ago`} · ` : ""}Est. 60–90 days to first pour — distributor, POS & menu choices open now`
      : f.eventType === "STATUS_CHANGE"
        ? "Status change detected — ownership/location transition or replacement opportunity"
        : `${ageDays !== null ? `Issued ${ageDays === 0 ? "today" : `${ageDays}d ago`} · ` : ""}Cleared to stock — opening inventory & tap-line placement window`;

  const greeting = f.contactName ? `Hi ${f.contactName.split(" ")[0]},` : `Hi ${venue} team,`;
  const whereLine = f.neighborhood
    ? `${f.neighborhood} (${loc})`
    : f.address
      ? `${f.address} in ${loc}`
      : loc || f.state;

  const coldEmailSubject = `Congrats on the upcoming opening — ${venue} (${f.city ?? f.state})`;
  const coldEmailBody = `${greeting}

Saw the new ${f.typeName ?? "alcohol license"} filing for ${venue} at ${whereLine} — congrats on the upcoming launch!

I work with ${f.city ?? f.state} hospitality operators on their opening beverage program (${cls.beverageProgram.toLowerCase()}). Most new venues lock their opening lineup 4–6 weeks before doors open, and I'd love to drop off 3–4 sample bottles or send a tight pour-cost sheet tailored to your concept.

Worth a quick 5-minute call this week, or should I swing by the site?

Best,
[Your Name]
[Your Company · Direct Cell]`;

  const callOpener = `"${greeting} I'm [Your Name] with [Company] here in ${f.city ?? f.state}. Saw you just filed the ${f.typeName ?? "liquor"} paperwork for ${venue}${f.address ? ` over on ${f.address}` : ""} — congrats! We supply several nearby ${cls.archetype.toLowerCase()} spots and wanted to introduce ourselves early before you finalize your opening order. Are you handling beverage purchasing directly, or is there a GM/beverage lead I should send a quick sample list to?"`;

  const dropByNote = `Site visit tip (${f.address ?? whereLine}): Check Street View first to see if construction/build-out is active. Ask for ${f.contactName ?? `the managing partner behind ${entity}`} and leave a 1-page intro pricing sheet focused on: ${cls.pitchAngle}`;

  return {
    archetype: cls.archetype,
    beverageProgram: cls.beverageProgram,
    estAnnualSpend: cls.estAnnualSpend,
    estOpeningWindow,
    buyingWindow,
    pitchAngle: cls.pitchAngle,
    links: {
      googleMaps: `https://www.google.com/maps/search/?api=1&query=${addrQuery}`,
      streetView: `https://www.google.com/maps/search/?api=1&query=${addrQuery}&layer=c`,
      linkedinOwner,
      instagramSearch,
      entityLookup,
      entityLookupLabel,
      webSearch,
      officialSource: f.sourceUrl ?? null,
    },
    outreach: {
      coldEmailSubject,
      coldEmailBody,
      callOpener,
      dropByNote,
    },
  };
}
