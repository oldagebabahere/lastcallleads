// High-intent B2B vertical SEO landing pages (/for/[role]).
// Each page targets exact buyer searches from industries that happily pay
// $129-$499/mo to reach new bars, restaurants & liquor stores before doors open.

export type BuyerVertical = {
  slug: string;
  badge: string;
  title: string;
  headline: string;
  headlineAccent: string;
  metaDescription: string;
  intro: string;
  avgAccountValue: string;
  paybackNote: string;
  targetSignals: { code: string; why: string }[];
  bullets: string[];
  faq: { q: string; a: string }[];
};

export const BUYER_VERTICALS: BuyerVertical[] = [
  {
    slug: "wine-spirits-distributors",
    badge: "FOR WINE & SPIRITS DISTRIBUTORS",
    title: "Liquor license leads for wine & spirits distributors",
    headline: "Own the well and wine list",
    headlineAccent: "60 days before opening night.",
    metaDescription:
      "Daily pre-opening bar, restaurant & package-store filings across 9 live US markets — with street address, legal LLC, beverage program fit, TX Comptroller volume & 1-click Google Maps route.",
    intro:
      "Once a new restaurant prints its opening cocktail menu or a liquor store stocks its shelves, dislodging the incumbent rep takes months. Last Call Leads emails your sales team every newly filed alcohol application the morning it hits official state portals.",
    avgAccountValue: "$18,000–$85,000/yr wholesale volume per landed bar",
    paybackNote: "One opening well-spirits placement pays for 5+ years of Territory alerts.",
    targetSignals: [
      { code: "MB + LH / Type 48", why: "Full-liquor bars pouring past midnight — highest spirits velocity." },
      { code: "P / Type 21 / LIP", why: "New liquor stores filling entire spirits walls and end-caps from scratch." },
      { code: "TX Multi-Unit Match", why: "Hospitality groups already pouring $50K–$300K/mo opening a new concept." },
    ],
    bullets: [
      "Premises street address, ZIP, legal LLC & named permittee/phone (where published)",
      "1-click multi-stop Google Maps driving route for morning drop-bys",
      "Beverage program classification so wine reps and spirits reps work separate queues",
      "19-column HubSpot & Salesforce CRM CSV included with every daily digest",
    ],
    faq: [
      {
        q: "How early do beverage distributors hear about new bars?",
        a: "State liquor license applications are filed 60 to 90 days before doors open — right when owners pick their opening well spirits, call brands, and wine-by-the-glass suppliers.",
      },
      {
        q: "Can we filter by specific ZIP codes or rep territories?",
        a: "Yes. Every subscriber gets a signed Preferences link to filter by 5-digit ZIP codes, cities, or venue classes (full bar, package store, restaurant, beer & wine).",
      },
    ],
  },
  {
    slug: "craft-breweries",
    badge: "FOR CRAFT BREWERIES & CIDERIES",
    title: "New bar & tap-handle leads for craft breweries",
    headline: "Win permanent draft lines",
    headlineAccent: "while the kegerator is still empty.",
    metaDescription:
      "Get notified every morning when a new bar, taproom, restaurant, or bottle shop files a liquor permit across 9 live US markets — with street address, beverage fit & pitch scripts.",
    intro:
      "Draft handles rarely rotate once a venue settles into its opening lineup. Show up during build-out with cold sample cans and draft-line pricing while the beverage director is choosing their opening 12 taps.",
    avgAccountValue: "$6,000–$24,000/yr per permanent draft handle",
    paybackNote: "Winning just one permanent tap handle covers your annual subscription 4x over.",
    targetSignals: [
      { code: "Type 41 / BE / LRW", why: "Beer & wine restaurants — zero spirits competition, beer drives bar profit." },
      { code: "MB / Type 47 / LIR", why: "Full-service restaurants & sports bars installing 8–24 draft lines." },
      { code: "Q / Type 20 / Package", why: "Craft bottle shops & cold-box convenience retail looking for local SKUs." },
    ],
    bullets: [
      "Filter exclusively for draft-heavy bars, beer/wine cafés, or off-premise cold-box stores",
      "1-click Google Maps route planner lets your territory rep hit 8 new build-outs in one morning",
      "Direct phone numbers in Washington & Missouri plus named permittees in Connecticut",
      "Ready-to-send brewery cold email & call openers tailored to each license class",
    ],
    faq: [
      {
        q: "Does this cover both on-premise draft accounts and off-premise retail?",
        a: "Yes — we tag every filing as on-premise (bars, restaurants, brewpubs) or off-premise (package stores, grocery, bottle shops) so you can filter exactly what your brewery targets.",
      },
      {
        q: "How many states are live?",
        a: "9 verified retail markets: Texas, New York, California, Illinois (Chicago), Washington, Oregon, Colorado, Connecticut, and Missouri — refreshed directly from official portals every morning.",
      },
    ],
  },
  {
    slug: "restaurant-pos-suppliers",
    badge: "FOR RESTAURANT POS & PAYMENTS REPS",
    title: "Pre-opening restaurant & bar leads for POS sales reps",
    headline: "Demo your POS terminal",
    headlineAccent: "before Toast or Square even knows they exist.",
    metaDescription:
      "Reach new bars & restaurants 60-90 days before opening via daily liquor license applications across 9 US markets. Includes street address, LLC entity, LinkedIn owner search & CRM CSV.",
    intro:
      "Every full-service restaurant and cocktail bar installs POS hardware, handhelds, and merchant processing 4 to 8 weeks before opening night. Liquor license filings are the single highest-intent public trigger that a new hospitality operator is signing vendor contracts right now.",
    avgAccountValue: "$3,500–$18,000/yr recurring processing & SaaS residuals",
    paybackNote: "A single closed Toast/Clover/SpotOn residual account pays for the entire year.",
    targetSignals: [
      { code: "Full Bar + Kitchen", why: "Multi-terminal + handheld POS setups with $1M+ annual card volume." },
      { code: "Relocations (TX)", why: "Expanding operators upgrading hardware at their brand-new address." },
      { code: "Chicago New Openings", why: "Strictly brand-new Chicago liquor openings — zero renewal noise." },
    ],
    bullets: [
      "Same-morning filing alerts 60–90 days ahead of Yelp/Google Business listing",
      "1-click LinkedIn owner search & State LLC officer lookup to find the managing partner",
      "TX Comptroller alcohol receipts expose proven multi-unit groups opening a new unit",
      "19-column CSV drops straight into HubSpot, Salesforce, or Apollo sequences",
    ],
    faq: [
      {
        q: "Why are liquor filings better than generic business registrations?",
        a: "LLC filings include thousands of shell companies and home businesses. A liquor license requires a signed commercial lease, floor plan, and real build-out capital — 100% verified hospitality buyers.",
      },
      {
        q: "Can a whole regional POS team share access?",
        a: "Yes — Multi-State ($249/mo) covers up to 3 markets with team seats, and All-9 Enterprise ($499/mo) includes a REST API key to auto-route leads into your CRM.",
      },
    ],
  },
  {
    slug: "commercial-insurance",
    badge: "FOR COMMERCIAL & LIQUOR LIABILITY BROKERS",
    title: "New bar & liquor liability insurance leads",
    headline: "Quote liquor liability coverage",
    headlineAccent: "the week they file their permit.",
    metaDescription:
      "Daily new bar, nightclub, restaurant & package store liquor filings across 9 live US markets — reach owners before their landlord demands a Certificate of Insurance.",
    intro:
      "Every new bar and liquor store MUST carry Liquor Liability, General Liability, and Commercial Property coverage before their landlord hands over keys or the state clears final inspection. Catching the application early puts your quote on the owner's desk first.",
    avgAccountValue: "$4,500–$25,000/yr commercial hospitality premium",
    paybackNote: "One late-night bar policy commission covers 12+ months of alerts.",
    targetSignals: [
      { code: "Late Hours / Nightclub", why: "High-premium liquor liability + assault & battery policies." },
      { code: "Full-Service Restaurant", why: "BOP + Liquor Liability + Workers Comp bundle." },
      { code: "Package Stores", why: "Commercial property, inventory & general liability packages." },
    ],
    bullets: [
      "Legal LLC entity name + premises address ready for quick ACORD prep",
      "Direct state Secretary of State links to pull managing member / registered agent",
      "Filter exclusively for high-premium late-night bars, full restaurants, or retail stores",
      "Zero shared lead-marketplace bidding wars — official public records straight to your inbox",
    ],
    faq: [
      {
        q: "Are these leads resold to 20 other insurance agents like lead marketplaces?",
        a: "No. You are subscribing to real-time official state licensing intelligence across your chosen territory — not competing on a shared pay-per-lead bidding form.",
      },
      {
        q: "Do you provide legal entity names for quoting?",
        a: "Yes — every filing includes both the DBA trade name and the exact legal LLC/corporation name filed with the state alcohol board.",
      },
    ],
  },
  {
    slug: "liquor-license-attorneys",
    badge: "FOR HOSPITALITY ATTORNEYS & LICENSING CONSULTANTS",
    title: "Daily liquor license filings for attorneys & hospitality consultants",
    headline: "Track every filing, relocation",
    headlineAccent: "and status flip across your state.",
    metaDescription:
      "Monitor pending liquor applications, relocations, closings & status flips daily across Texas, New York, California, Illinois (Chicago), Washington, Oregon, Colorado, Connecticut, and Missouri.",
    intro:
      "Stay ahead of every pending application, change-of-location, non-renewal, and closing in your jurisdiction. Whether you represent applicants, landlords, or neighboring licensees, get structured daily diffs instead of checking clumsy state portals manually.",
    avgAccountValue: "$3,000–$15,000+ per hospitality retainer",
    paybackNote: "Saves 30+ minutes of paralegal portal checking every single morning.",
    targetSignals: [
      { code: "Pending Applications", why: "Track every newly docketed application by county and license class." },
      { code: "Closed / Non-Renewals", why: "Identify distressed/transferable quota licenses & available spaces (California, Colorado, Missouri, Oregon)." },
      { code: "TX Relocations", why: "Monitor pending premise transfers and expansion filings daily." },
    ],
    bullets: [
      "Direct links back to official state portal datasets for instant verification",
      "Clean deduplicated daily log with record IDs, dates, and status changes",
      "County & ZIP filtering to monitor exact municipal hearing boards",
      "Export clean 30-day CSV registers anytime for client research",
    ],
    faq: [
      {
        q: "Does this track closed and surrendered licenses too?",
        a: "Yes — we actively track Colorado closed/surrendered alcohol licenses, Missouri out-of-business venues, Oregon non-renewals, and live status flips.",
      },
      {
        q: "Can we pull the data programmatically into our case system?",
        a: "Yes — our All-9 Enterprise plan ($499/mo) includes a REST API endpoint (`/api/v1`) with JSON responses.",
      },
    ],
  },
  {
    slug: "commercial-kitchen-equipment",
    badge: "FOR BAR & COMMERCIAL KITCHEN SUPPLIERS",
    title: "Pre-opening bar & restaurant leads for equipment suppliers",
    headline: "Quote ice machines, draft systems",
    headlineAccent: "& bar build-outs before construction wraps.",
    metaDescription:
      "Daily new bar & restaurant liquor license filings across 9 live US markets — with street address, Street View build-out check & 1-click Google Maps route planner.",
    intro:
      "Glassware, underbar sinks, ice makers, walk-in coolers, draft towers, and signage are ordered during the exact 60–90 day window between liquor license application and soft opening. Reach owners while budgets are open.",
    avgAccountValue: "$8,000–$75,000 per bar/kitchen build-out order",
    paybackNote: "One underbar or draft-tower quote covers years of territory coverage.",
    targetSignals: [
      { code: "New Bar Applications", why: "Immediate need for ice machines, speed rails, glasswashers & draft towers." },
      { code: "TX Relocations", why: "Existing operators fitting out a brand-new proposed premises address." },
      { code: "New Brewpubs", why: "Taproom furniture, glycol lines, walk-in coolers & glassware." },
    ],
    bullets: [
      "1-click Google Street View check on every lead to spot active build-out sites",
      "Multi-stop Google Maps driving route for field equipment reps",
      "Exact license class separates full kitchens from cocktail lounges & package stores",
      "Start with a 7-day free trial (no credit card required)",
    ],
    faq: [
      {
        q: "How do I verify if a location is actually under construction?",
        a: "Every lead includes 1-click Google Maps & Street View plus the exact premises street address and filing date so you can qualify the site in 10 seconds.",
      },
      {
        q: "Which markets are included?",
        a: "9 verified US markets: Texas, New York, California, Chicago (IL), Washington, Oregon, Colorado, Connecticut, and Missouri.",
      },
    ],
  },
];

export const VERTICAL_SLUGS = BUYER_VERTICALS.map((v) => v.slug);
export const VERTICAL_BY_SLUG: Record<string, BuyerVertical> = Object.fromEntries(
  BUYER_VERTICALS.map((v) => [v.slug, v])
);
