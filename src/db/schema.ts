import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// One row per real-world liquor license / application we are watching.
export const licenses = pgTable(
  "licenses",
  {
    id: serial("id").primaryKey(),
    state: text("state").notNull(), // TX | NY | CA
    licenseKey: text("license_key").notNull(), // unique id at the source
    kind: text("kind").notNull(), // pending | active
    status: text("status"),
    licenseType: text("license_type"), // raw code e.g. "MB"
    typeName: text("type_name"), // human label e.g. "Mixed Beverage"
    tradeName: text("trade_name"), // public business name
    ownerName: text("owner_name"), // legal entity / person
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    zip: text("zip"),
    county: text("county"),
    filedAt: timestamp("filed_at"), // application received / original issue
    issuedAt: timestamp("issued_at"),
    expiresAt: timestamp("expires_at"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    sourceUrl: text("source_url"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("licenses_state_key").on(t.state, t.licenseKey),
    index("licenses_state_idx").on(t.state),
    index("licenses_filed_idx").on(t.filedAt),
  ]
);

// The money table: every signal a subscriber pays for.
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    state: text("state").notNull(),
    licenseKey: text("license_key"),
    eventType: text("event_type").notNull(), // NEW_PENDING | NEW_LICENSE | STATUS_CHANGE
    tradeName: text("trade_name"),
    ownerName: text("owner_name"),
    city: text("city"),
    county: text("county"),
    typeName: text("type_name"),
    occurredAt: timestamp("occurred_at"), // date at the source
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    summary: text("summary").notNull(),
    payload: text("payload"), // JSON string, debug only
  },
  (t) => [
    index("events_detected_idx").on(t.detectedAt),
    index("events_state_idx").on(t.state),
  ]
);

// One row per automated pull. This is the health feed of the machine.
export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(), // tx-pending | tx-active | ny-pending | ny-active | ca
    ok: boolean("ok").default(true).notNull(),
    rowsSeen: integer("rows_seen").default(0).notNull(),
    newLicenses: integer("new_licenses").default(0).notNull(),
    newEvents: integer("new_events").default(0).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [index("ingest_source_idx").on(t.source)]
);

export const sourceHealth = pgTable("source_health", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().unique(), // spec label, e.g. "US · TTB alcohol wholesalers"
  state: text("state").notNull().default("US"),
  status: text("status").notNull().default("live"), // live | paused
  pausedReason: text("paused_reason"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastRows: integer("last_rows").notNull().default(0),
  medianRows: integer("median_rows").notNull().default(0),
  lastOkAt: timestamp("last_ok_at"),
  lastRunAt: timestamp("last_run_at"),
  lastProbeAt: timestamp("last_probe_at"),
  alertState: text("alert_state").notNull().default("none"), // none | paused | recovered
  // Auto-heal: when a dataset dies, PourWatch searches the Socrata catalog
  // for a replacement; the adopted dataset id is stored here and wins over
  // the hardcoded one.
  overrideDataset: text("override_dataset"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const venueReceipts = pgTable(
  "venue_receipts",
  {
    id: serial("id").primaryKey(),
    permit: text("permit").notNull(), // TABC permit / taxpayer+location
    tradeName: text("trade_name"),
    city: text("city"),
    county: text("county"),
    state: text("state").notNull().default("TX"),
    periodEnd: text("period_end"), // YYYY-MM-DD reporting period end
    total: doublePrecision("total").notNull().default(0), // $ alcohol receipts
    liquor: doublePrecision("liquor"),
    wine: doublePrecision("wine"),
    beer: doublePrecision("beer"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("venue_receipts_uidx").on(t.permit, t.periodEnd)]
);

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  plan: text("plan").default("pro").notNull(),
  status: text("status").default("waitlist").notNull(), // waitlist | active | canceled
  states: text("states").default("TX,NY").notNull(), // comma joined: "TX,NY,CA"
  emailOptOut: boolean("email_opt_out").default(false).notNull(),
  refBy: text("ref_by"), // email of the subscriber who referred this person
  referralCredits: integer("referral_credits").default(0).notNull(), // banked free months from successful referrals
  zipFilter: text("zip_filter"), // comma-joined ZIP codes, e.g. "77019,77002"
  typeFilter: text("type_filter"), // comma-joined intent tags: "full-bar,package-store"
  cityFilter: text("city_filter"), // saved search: city name (case-insensitive)
  keywordFilter: text("keyword_filter"), // saved search: free-text keywords
  prefsToken: text("prefs_token"), // magic link token for /prefs?token=...
  digestLimit: integer("digest_limit").default(40).notNull(),
  // 7-day free trial: digests flow from day one without a card; the day it
  // ends we send one "trial over" email and stop.
  trialEndsAt: timestamp("trial_ends_at"),
  trialNotified: boolean("trial_notified").default(false).notNull(),
  stripeCustomerId: text("stripe_customer_id"), // payment-provider customer id (any gateway)
  stripeSubscriptionId: text("stripe_subscription_id"),
  lastDigestAt: timestamp("last_digest_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const prospects = pgTable("prospects", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // attorney | insurance | beverage | bar
  osmKey: text("osm_key").notNull(), // "node/12345" from OpenStreetMap
  name: text("name").notNull(),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  state: text("state").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
});

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    subject: text("subject"),
    message: text("message").notNull(),
    status: text("status").default("new").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("contact_messages_created_idx").on(t.createdAt)]
);

export const emailLog = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull(), // sent | dry_run | error
    detail: text("detail"),
    eventCount: integer("event_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("email_log_created_idx").on(t.createdAt)]
);

export type License = typeof licenses.$inferSelect;
export type FilingEvent = typeof events.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
