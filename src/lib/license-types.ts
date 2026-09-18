// Human-written library of liquor-license types. These pages are the
// "long-tail explainer" layer: evergreen plain-English answers + live
// filing counts rendered from the database. No AI bulk text — every
// paragraph below was written, edited and fact-checked by hand.

export type LicenseType = {
  slug: string;
  code: string;
  state: "TX";
  name: string; // must match the typeName we store for TX events
  oneLiner: string;
  body: string[];
  faq: { q: string; a: string }[];
};

export const TYPE_SLUGS = [
  "mixed-beverage-permit-mb",
  "late-hours-permit-lh",
  "food-beverage-certificate-fb",
  "package-store-p",
  "wine-malt-offpremise-q",
  "beer-offpremise-bf",
  "beer-onpremise-be",
  "brewpub-bp",
  "brewer-b",
  "winery-g",
  "wholesaler-w",
  "local-distributor-lp",
  "nonprofit-temporary-nt",
  "mixed-beverage-restaurant-rm",
] as const;

export const TYPE_LIBRARY: LicenseType[] = [
  {
    slug: "mixed-beverage-permit-mb",
    code: "MB",
    state: "TX",
    name: "Mixed Beverage Permit",
    oneLiner: "The full Texas bar permit — spirits, wine and beer on-premise.",
    body: [
      "The Mixed Beverage Permit is the license behind most Texas bars and cocktail lounges. It allows a venue to sell distilled spirits, wine and beer for consumption on the premises — the full bar program, not beer and wine only.",
      "For buyers, an MB filing is the loudest signal in the Texas registry. A venue with an MB permit needs back-bar stock, glassware, POS with tabs, insurance and staff — and it needs them before opening night, which is usually 60 to 90 days after the application lands.",
      "Combined with a Late Hours permit (LH), the venue plans to pour past midnight. Combined with a Food & Beverage Certificate (FB), it is a full restaurant and bar — the standard configuration for modern dining concepts in Texas.",
    ],
    faq: [
      { q: "How long does an MB permit take in Texas?", a: "A clean application typically clears in 30–60 days; near schools or churches, or with a protest, it can stretch to 90 days or more." },
      { q: "What does an MB filing tell a salesperson?", a: "That a full spirits program is being built right now — the venue is still choosing its suppliers. That is the window to show up." },
    ],
  },
  {
    slug: "late-hours-permit-lh",
    code: "LH",
    state: "TX",
    name: "Late Hours Permit",
    oneLiner: "Extends service past midnight — the nightlife fingerprint.",
    body: [
      "The Late Hours permit is a rider on a Texas license that lets a venue sell alcohol past the standard cutoff — typically until 2 a.m. It is the single most reliable indicator of a nightlife concept.",
      "When an MB application arrives with LH attached, the math is simple: full bar plus late hours equals a venue counting on volume after dark. High-volume accounts are precisely the ones where distributor placements matter most.",
      "Late-hour venues also buy more consumables per month — ice, mix, glassware, barware — which makes them disproportionately valuable accounts compared with daytime-only concepts.",
    ],
    faq: [
      { q: "Is a Late Hours permit separate from the main license?", a: "In Texas it is an add-on to a primary license — it appears as its own line in the application record, which is why watching for it is easy." },
      { q: "Why does LH matter for lead qualification?", a: "It converts a maybe-acount into a clear nightlife buy signal. A rep can tailor the pitch the moment the combo appears." },
    ],
  },
  {
    slug: "food-beverage-certificate-fb",
    code: "FB",
    state: "TX",
    name: "Food & Beverage Certificate",
    oneLiner: "The 'this is a real restaurant' stamp that unlocks food service.",
    body: [
      "The Food & Beverage Certificate lets a Texas venue serve food alongside alcohol — the requirement that separates a restaurant from a bar. Most new restaurant applications in Texas include it.",
      "MB + FB is the fingerprint of a full-service restaurant. MB + FB + LH is a restaurant that also runs the late-night bar program. Reading the combination tells you the concept before any press release exists.",
      "For distributors, a food-forward venue means a broader SKU mix: wine lists, premium spirits, non-alcoholic lines — more placement opportunities per account.",
    ],
    faq: [
      { q: "Can a bar operate in Texas without an FB certificate?", a: "Yes — a bar can sell alcohol without food service. But most modern concepts include food, and the FB line in the record tells you they plan to." },
      { q: "Does FB affect the application timeline?", a: "Rarely by itself. It is the location and protest factors that stretch Texas timelines, not the certificate." },
    ],
  },
  {
    slug: "package-store-p",
    code: "P",
    state: "TX",
    name: "Package Store (Liquor Store)",
    oneLiner: "Retail liquor sales — shelf space to fill, volume to win.",
    body: [
      "A Package Store is Texas's liquor retail license: off-premise sales of distilled spirits, wine and beer for consumption at home. New P filings mean shelves are being planned, priced and stocked.",
      "Unlike a bar, a package store is a pure shelf-slotting battle. Every distributor wants facings at a new store from day one, and the buyer's phone is open before the doors exist.",
      "P filings skew toward growing suburbs and new strips — often a cluster of applications follows new residential development into a zip code.",
    ],
    faq: [
      { q: "Are package stores limited by county in Texas?", a: "Yes — Texas local-option rules determine whether a county allows package stores at all, which is why new P filings are a subtle economic signal for an area." },
      { q: "Who cares about package store filings?", a: "Distributors, wholesalers and sales reps who win shelf space — plus real estate and merchant-service vendors watching retail growth." },
    ],
  },
  {
    slug: "wine-malt-offpremise-q",
    code: "Q",
    state: "TX",
    name: "Wine & Malt Off-Premise",
    oneLiner: "The grocery and convenience-store beer and wine license.",
    body: [
      "The Q license permits off-premise sale of wine and malt beverages without spirits — the everyday license for grocery and convenience stores, gas stations and specialty markets.",
      "Q filings are high-volume and fast-moving. A cluster of them in one corridor tells you where household retail is expanding, which is a useful read on a market before the stores even open.",
      "For beer suppliers especially, Q filings are the bread-and-butter pipeline: a new store is a new cold-box plan, a new cooler program, a new set of facings.",
    ],
    faq: [
      { q: "What's the difference between Q and BF?", a: "Q covers wine plus malt beverages; BF covers malt beverages only (beer). Both are off-premise retail licenses — the mix tells you the store's ambition." },
      { q: "Are Q licenses expensive?", a: "Fees are modest compared with full liquor retail, which is why they appear constantly and their volume is its own signal." },
    ],
  },
  {
    slug: "beer-offpremise-bf",
    code: "BF",
    state: "TX",
    name: "Beer Off-Premise (Convenience/Grocery)",
    oneLiner: "Malt-beverage retail — the convenience-store workhorse.",
    body: [
      "The BF license allows off-premise malt beverage sales — beer to go — without wine or spirits. It is the standard filing for convenience stores, gas stations and quick-serve retail.",
      "BF filings are the most frequent type in the Texas pending list, so they are easy to overlook — which is exactly why watching them systematically beats scanning them manually.",
      "For craft brewers and regional beer brands, a new BF license is a new chance at a tap wall, a single-serve cold case, a display end-cap. First in wins the planogram.",
    ],
    faq: [
      { q: "Why track BF if it's so common?", a: "Because volume is the point. The machine separates real new filings from the thousands of existing ones — that is the entire value." },
      { q: "Can a BF licensee later upgrade?", a: "Yes — many convenience operators add Q or P capability over time, which is why tracking a location's filing history is useful." },
    ],
  },
  {
    slug: "beer-onpremise-be",
    code: "BE",
    state: "TX",
    name: "Beer On-Premise (Bar/Restaurant)",
    oneLiner: "Beer-only service — the entry-level bar license.",
    body: [
      "The BE license allows on-premise beer service without table wine or spirits — a common starting point for sports bars, taprooms-that-are-not-yet-brewpubs, and casual restaurants.",
      "Many BE holders upgrade to full mixed beverage once the concept proves itself. A stream of BE filings in one district is an early read on where new nightlife is starting.",
      "For beer distributors, this is the purest prospect: a venue whose entire beverage program is beer from day one.",
    ],
    faq: [
      { q: "Can a BE venue sell wine?", a: "Not without an additional license type. The BE scope is malt beverages only — that limitation is why upgrades are common." },
      { q: "Is BE cheaper than MB?", a: "Generally yes, which makes it the low-risk entry point for new operators and a leading indicator of districts heating up." },
    ],
  },
  {
    slug: "brewpub-bp",
    code: "BP",
    state: "TX",
    name: "Brewpub",
    oneLiner: "Brewhouse plus bar plus kitchen — craft beer's flagship license.",
    body: [
      "The Brewpub license lets a Texas brewery manufacture beer on the same premises where it sells it, alongside food service. It is the license behind the modern taproom-with-kitchen concept.",
      "A BP filing is a rich signal: it implies equipment orders, kitchen buildout, and a brand launching its wholesale belt alongside its taproom.",
      "For everyone from hop suppliers to brewery equipment vendors to POS firms, a new brewpub is a multi-line opportunity in one filing.",
    ],
    faq: [
      { q: "How is a brewpub different from a brewery?", a: "A brewery can produce and distribute but its on-premise sales are limited; a brewpub sells on-premise too, usually with food. Both licenses appear separately in the record." },
      { q: "Why are brewpubs strong prospects?", a: "High engagement, high SKU counts, repeat local customers — and a passionate owner who answers the phone during buildout." },
    ],
  },
  {
    slug: "brewer-b",
    code: "B",
    state: "TX",
    name: "Brewer",
    oneLiner: "Production brewery licenses — the manufacturing side of beer.",
    body: [
      "The Brewer license covers manufacturing beer for wholesale distribution in Texas (and the out-of-state equivalents file under other codes). New brewer filings show up the moment someone commits to a production facility.",
      "A brewer filing is a heavy signal: tanks, canning lines, cold storage, taproom design, distribution planning. It is the earliest public evidence of a brand's existence.",
      "For ingredient suppliers, packaging vendors and service providers, brewer filings are the top of the funnel for multi-year accounts.",
    ],
    faq: [
      { q: "Do breweries need a liquor license?", a: "Yes — manufacturing, storage, and sales all require specific permits, and filings are part of the public record." },
      { q: "What's the difference between B and BP?", a: "B is manufacturing/wholesale focused; BP adds on-premise retail sale with food. Most operations hold one or the other, occasionally both in related entities." },
    ],
  },
  {
    slug: "winery-g",
    code: "G",
    state: "TX",
    name: "Winery",
    oneLiner: "Texas wine production licenses — from vineyard to tasting room.",
    body: [
      "The Winery license covers manufacturing and selling Texas wine, usually with an on-premise tasting room attached. New G filings sketch the growth of the Texas wine belt.",
      "A winery filing is a lifestyle-business signal: tasting room buildout, event programming, distribution deals, and a customer base that visits on weekends. For wine distributors, it is the start of a wholesale conversation.",
      "Wineries also buy hospitality services — event insurance, reservation software, glassware, cellar equipment — which makes them a broad B2B prospect category.",
    ],
    faq: [
      { q: "How many wineries operate in Texas?", a: "Hundreds, with steady new filings each quarter — the growth outlived the pandemic, and the registry records every one." },
      { q: "Are winery filings valuable leads?", a: "Yes for wine distributors and hospitality vendors; the buildout window after a filing is when purchasing decisions happen." },
    ],
  },
  {
    slug: "wholesaler-w",
    code: "W",
    state: "TX",
    name: "Wholesaler",
    oneLiner: "The distribution layer of Texas's three-tier system.",
    body: [
      "Wholesaler licenses cover the middle tier of Texas's three-tier alcohol system — the companies that buy from producers and sell to retailers. New W filings record the distribution layer's own growth.",
      "W filings can be interesting for competitive intelligence: a new wholesaler entering a county is a market event that affects every rep's territory math.",
      "They are also relevant to suppliers choosing distribution partners — the registry records who is licensed where before anyone announces anything.",
    ],
    faq: [
      { q: "Would I prospect wholesalers?", a: "Not usually as customers, but their filings matter as compettive intelligence and as a map of the three-tier landscape." },
      { q: "Are wholesaler licenses easy to find?", a: "Yes — they appear in the same public dataset as retail licenses, filtered by type." },
    ],
  },
  {
    slug: "local-distributor-lp",
    code: "LP",
    state: "TX",
    name: "Local Distributor",
    oneLiner: "Intra-company distribution permits — the quiet logistics layer.",
    body: [
      "The Local Distributor permit (LP) covers distribution within a limited local market — often a company's own delivery operation or a small local wholesaler. It is the quiet logistics layer of the industry.",
      "LP filings cluster in growing metros where delivery infrastructure expands ahead of retail. They are a leading indicator of distribution capacity entering a market.",
      "For anyone selling to the supply chain — fleet, logistics software, warehouse systems — LP filings are a legitimate but niche prospect pool.",
    ],
    faq: [
      { q: "Is an LP the same as a wholesaler?", a: "No. LP is narrower — local, often intra-company — while W covers the full wholesaler tier. The registry distinguishes them by code." },
      { q: "Why track niche permits at all?", a: "Because the bundle of signals — retail opening, capacity entering, wholesalers moving — is what makes a territory readable." },
    ],
  },
  {
    slug: "nonprofit-temporary-nt",
    code: "NT",
    state: "TX",
    name: "Nonprofit / Temporary Event",
    oneLiner: "One-off event permits — the noise layer, and also the social calendar.",
    body: [
      "Temporary event permits cover one-time sales at festivals, fundraisers, and events. They are the highest-volume, lowest-value layer of the registry — beer tents and charity dinners.",
      "But they are not all noise: repeated NT filings from the same organizer trace a city's event calendar, which is real intel for event vendors.",
      "The machine separates NT noise from venue-building signals by default, so subscribers' digests stay useful rather than junked with festival permits.",
    ],
    faq: [
      { q: "Should I ignore NT filings?", a: "As prospects, mostly yes. As a social calendar for venues and events, they have secondary value. The system keeps them out of the way by default." },
      { q: "Do NT permits appear in the pending feed?", a: "Yes — they are part of the public pending list, which is why deduplication and filtering matter." },
    ],
  },
  {
    slug: "mixed-beverage-restaurant-rm",
    code: "RM",
    state: "TX",
    name: "Mixed Beverage Restaurant",
    oneLiner: "The restaurant-specific mixed beverage permit — food-forward full liquor.",
    body: [
      "The RM (Mixed Beverage Restaurant) license is the food-first sibling of MB: full liquor service tied to a bonafide restaurant operation. It is the standard for white-tablecloth and busy-casual dining.",
      "RM filings are strong indicators of higher-end concepts — places investing in wine programs, craft cocktails, and premium spirits, which is exactly where the most placement value lives.",
      "For wine and spirits distributors, RM is a marquee prospect category: high SKU counts, educated buyers, and a buildout window that opens the door cleanly.",
    ],
    faq: [
      { q: "How is RM different from MB?", a: "Both permit full liquor; RM is the restaurant-scoped variant. In practice the two are the two halves of Texas's full-bar market." },
      { q: "Which is more valuable: MB or RM?", a: "RM skews food-forward (higher average spend per bottle); MB skews high-volume nightlife. Both are core prospects — the combination of filings tells the fuller story." },
    ],
  },
];
