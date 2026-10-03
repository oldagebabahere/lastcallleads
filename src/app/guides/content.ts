// Evergreen guides — written once, rank for years. This is the library that
// pulls buyers in from Google without spending a rupee on ads.

export type Guide = {
  slug: string;
  title: string;
  description: string;
  readMins: number;
  sections: { h2: string; body: string[] }[];
  faq: { q: string; a: string }[];
};

export const GUIDE_SLUGS = [
  "find-new-bars-before-competitors",
  "texas-liquor-license-timeline",
  "new-york-sla-application-guide",
] as const;

export const GUIDES: Guide[] = [
  {
    slug: "find-new-bars-before-competitors",
    title: "How to find new bars and restaurants before your competitors do",
    description:
      "The exact public-record sources that reveal every new bar, restaurant and liquor store weeks before opening — and how distributors use them to win accounts with zero competition.",
    readMins: 6,
    sections: [
      {
        h2: "The 60–90 day window nobody teaches reps about",
        body: [
          "Every bar and restaurant in America must file for a liquor license before it opens. That filing is public, and it happens 60 to 90 days before opening day — right when the owner is choosing a distributor, a POS system, insurance and a wine list all at once.",
          "By the time the 'Opening Soon' banner goes up on the building, those decisions are locked. The reps who win the account are the ones who showed up during the paperwork phase, when the owner is still comparing options and the phone actually gets answered.",
        ],
      },
      {
        h2: "Where the records actually live",
        body: [
          "Both states publish every pending application and new license in the official record, refreshed daily. That data is free and has been for years — the catch is that it is published for lawyers, not salespeople: raw codes, LLC names instead of humans, no alerts, no deduping.",
          "The problem was never access — the data has been public for years. The problem is that these portals are built for lawyers, not salespeople: raw codes, LLC names instead of humans, no alerts, no deduping. Nobody wants to diff a 78,000-row spreadsheet every morning before their route.",
        ],
      },
      {
        h2: "Manual method (free, painful)",
        body: [
          "In Texas you can open the licensing dataset, filter to new submissions, and decode license types by hand (MB + LH + FB means a full-service bar planning late nights; P alone means a package store). In New York you filter the pending applications by county and received date.",
          "Expect 30–45 minutes a day, easy to miss rows, and no memory of what you saw yesterday. It works for a week, then life happens. This is exactly why monitoring tools exist — the machine does the diffing every morning and only taps you when something new appears.",
        ],
      },
      {
        h2: "What a filing actually tells you",
        body: [
          "A cluster of applications in one zip code signals a district heating up — new landlords, new foot traffic, and usually three more venues behind the first. A single high-end concept filing (mixed beverage + late hours + food certificate in Texas) is a full spirits program on day one, not a beer-only account.",
          "License type, filing date and address are enough to prioritize your week. The rest — the human behind the LLC — takes one more layer of public lookup, which is why enrichment matters more than raw data volume.",
        ],
      },
      {
        h2: "The honest math",
        body: [
          "If one new account is worth $500–$5,000 a year to a rep in placements, then seeing filings even one week earlier pays for itself the first time it works. The cost of monitoring is a rounding error; the cost of hearing about a new venue at your next wholesaler meeting is permanent.",
          "That is the entire playbook: watch the paperwork, arrive during the deciding window, and never compete with three other reps again.",
        ],
      },
    ],
    faq: [
      {
        q: "Is watching liquor-license filings legal?",
        a: "Yes. These are public government records published specifically so the public can see them. Monitoring them is no different from reading the county clerk's register — just automated.",
      },
      {
        q: "How early do filings appear before opening?",
        a: "Typically 60–90 days in Texas and New York, sometimes longer when a location needs construction or faces a protest hearing.",
      },
      {
        q: "Can I just check the state portal myself?",
        a: "You can — Texas and New York both offer free public lookups. What they do not offer is daily change-detection, decoded license types, or alerts, which is where all the value lives.",
      },
    ],
  },
  {
    slug: "texas-liquor-license-timeline",
    title: "Texas liquor license timeline: from application to opening day",
    description:
      "How long a Texas liquor license really takes, what the license type codes mean, and where to watch new applications across the state in plain English.",
    readMins: 5,
    sections: [
      {
        h2: "How long licensing actually takes",
        body: [
          "A straightforward Texas application through the AIMS portal typically clears in 30 to 60 days. Locations near schools or churches, ownership changes, and protested applications stretch that to 90 days or more. Temporary permits exist for some situations but are not a shortcut for a new bar.",
          "For anyone watching the market, the important date is not approval — it is the submission date. That is the moment a new venue becomes visible in the filing data, months before their first pour.",
        ],
      },
      {
        h2: "The license codes, decoded",
        body: [
          "MB (Mixed Beverage) is the full bar permit — spirits, wine and beer. Pair it with LH (Late Hours) and the venue plans to pour past midnight. Add FB (Food & Beverage Certificate) and you are looking at a full-service restaurant and bar.",
          "P is a package store — a retail liquor store with shelf space to fill. Q and BF are wine/beer off-premise (grocery and convenience). BE is beer on-premise. When you see MB + LH + FB appear in a hot zip code, that is the highest-value lead in Texas.",
        ],
      },
      {
        h2: "County quirks that matter",
        body: [
          "Texas is a local-option state: some areas are dry, some allow beer and wine only, and rules can change block by block. An application in a historically dry precinct is a signal that an election or variance happened — and that first mover will hold serious local advantage.",
          "The state publishes every pending application publicly, including county and address, which makes territory-level watching possible without a lawyer on retainer.",
        ],
      },
      {
        h2: "Where to watch new Texas applications",
        body: [
          "Texas posts every pending application in the official licensing records, refreshed daily. It is free — and it is also a firehose with codes instead of plain language.",
          "Automated monitors (including the feed on this site) translate that firehose into a morning summary: who filed, where, and what kind of venue they are building. Watching raw data by hand works for a week; a machine does it forever.",
        ],
      },
    ],
    faq: [
      {
        q: "How much does a Texas liquor license cost?",
        a: "State fees range from roughly $150 for some beer permits to $6,000+ for a Mixed Beverage permit, plus local fees and possible surety requirements. The biggest cost is usually time, not fees.",
      },
      {
        q: "Are pending applications public?",
        a: "Yes — published in official state records with applicant entity, address, county, license type and submission date, refreshed daily.",
      },
      {
        q: "What does 'MB' mean on a license application?",
        a: "Mixed Beverage — the permit that lets a venue sell spirits, wine and beer for on-premise consumption. It is the standard full-bar license in Texas.",
      },
    ],
  },
  {
    slug: "new-york-sla-application-guide",
    title: "New York SLA applications: what to expect and where to watch them",
    description:
      "The New York liquor application process in plain English — timeline, the 500-foot rule, community boards, and where pending applications are published.",
    readMins: 5,
    sections: [
      {
        h2: "The New York timeline is longer than you think",
        body: [
          "A new on-premises liquor license in New York realistically takes 3 to 6 months. Community board review in New York City, the 500-foot rule near existing licenses, and the 200-foot rule near houses of worship and schools all add friction. Temporary retail permits can shorten the wait for some applicants.",
          "The received date on an SLA application is therefore an even earlier signal than in most states — often a full season before opening night.",
        ],
      },
      {
        h2: "Community boards are the hinge",
        body: [
          "In NYC, an applicant must notify the local community board before applying to the SLA. Boards cannot approve or deny, but their recommendations carry weight, and sloppy stipulations (hours, outdoor space, music) are where applications die.",
          "Watching new applications early matters for opponents and supporters alike — and absolutely for vendors, because a venue that has just filed is deep in planning mode for everything from glassware to insurance.",
        ],
      },
      {
        h2: "License classes in plain English",
        body: [
          "On-premises liquor (OP) is the full bar license. Restaurant wine (RW) covers wine and beer only with a food focus. Grocery and drug store beer licenses (A/DS) are the off-premise everyday licenses. The SLA's published descriptions are friendlier than Texas codes, but the volume — tens of thousands of active licenses — makes manual watching impractical.",
        ],
      },
      {
        h2: "Where New York publishes pending applications",
        body: [
          "New York publishes both pending applications and current active licenses in official records, updated regularly. Pending applications include the applicant entity, address, county, license class and the all-important received date.",
          "The feed on this site consumes that data every morning, classifies each change, and turns it into alerts — so watching New York costs you one email skim instead of one spreadsheet headache.",
        ],
      },
    ],
    faq: [
      {
        q: "How long does a New York liquor license take?",
        a: "Three to six months for a new on-premises license is realistic; temporary permits can open limited service sooner in qualifying situations.",
      },
      {
        q: "What is the 500-foot rule?",
        a: "If three or more existing liquor licenses operate within 500 feet, a new on-premises application triggers a public-interest hearing — a common delay point in dense neighborhoods.",
      },
      {
        q: "Are pending applications public?",
        a: "Yes. They are published in official state records with the entity name, premise address, county, license class and received date.",
      },
    ],
  },
];
