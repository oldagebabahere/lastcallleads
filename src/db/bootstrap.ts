import { pool } from "@/db";

// Bump SCHEMA_VERSION whenever DDL changes so existing databases upgrade once
// without running ALTER TABLE locks on every serverless cold start.
const SCHEMA_VERSION = 6;

const DDL = `
CREATE TABLE IF NOT EXISTS _schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS licenses (
  id SERIAL PRIMARY KEY,
  state TEXT NOT NULL,
  license_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT,
  license_type TEXT,
  type_name TEXT,
  trade_name TEXT,
  owner_name TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  zip TEXT,
  county TEXT,
  filed_at TIMESTAMP,
  issued_at TIMESTAMP,
  expires_at TIMESTAMP,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  source_url TEXT,
  first_seen_at TIMESTAMP NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS licenses_state_key ON licenses (state, license_key);
CREATE INDEX IF NOT EXISTS licenses_state_idx ON licenses (state);
CREATE INDEX IF NOT EXISTS licenses_filed_idx ON licenses (filed_at);
CREATE INDEX IF NOT EXISTS licenses_state_city_idx ON licenses (state, city);
CREATE INDEX IF NOT EXISTS licenses_state_kind_idx ON licenses (state, kind);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  state TEXT NOT NULL,
  license_key TEXT,
  event_type TEXT NOT NULL,
  trade_name TEXT,
  owner_name TEXT,
  city TEXT,
  county TEXT,
  type_name TEXT,
  occurred_at TIMESTAMP,
  detected_at TIMESTAMP NOT NULL DEFAULT now(),
  summary TEXT NOT NULL,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS events_detected_idx ON events (detected_at);
CREATE INDEX IF NOT EXISTS events_state_idx ON events (state);
CREATE INDEX IF NOT EXISTS events_occurred_idx ON events (occurred_at);
CREATE INDEX IF NOT EXISTS events_state_occurred_idx ON events (state, occurred_at);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT true,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  new_licenses INTEGER NOT NULL DEFAULT 0,
  new_events INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  finished_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ingest_source_idx ON ingest_runs (source);

CREATE TABLE IF NOT EXISTS venue_receipts (
  id SERIAL PRIMARY KEY,
  permit TEXT NOT NULL,
  trade_name TEXT,
  owner_name TEXT,
  city TEXT,
  county TEXT,
  state TEXT NOT NULL DEFAULT 'TX',
  period_end TEXT,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  liquor DOUBLE PRECISION,
  wine DOUBLE PRECISION,
  beer DOUBLE PRECISION,
  first_seen_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_receipts_uidx ON venue_receipts (permit, period_end);

CREATE TABLE IF NOT EXISTS source_health (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'US',
  status TEXT NOT NULL DEFAULT 'live',
  paused_reason TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_rows INTEGER NOT NULL DEFAULT 0,
  median_rows INTEGER NOT NULL DEFAULT 0,
  last_ok_at TIMESTAMP,
  last_run_at TIMESTAMP,
  last_probe_at TIMESTAMP,
  alert_state TEXT NOT NULL DEFAULT 'none',
  override_dataset TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'solo',
  status TEXT NOT NULL DEFAULT 'trial',
  states TEXT NOT NULL DEFAULT 'TX',
  email_opt_out BOOLEAN NOT NULL DEFAULT false,
  ref_by TEXT,
  referral_rewarded BOOLEAN NOT NULL DEFAULT false,
  referral_credits INTEGER NOT NULL DEFAULT 0,
  zip_filter TEXT,
  type_filter TEXT,
  city_filter TEXT,
  keyword_filter TEXT,
  webhook_url TEXT,
  prefs_token TEXT,
  digest_limit INTEGER NOT NULL DEFAULT 40,
  trial_ends_at TIMESTAMP,
  trial_notified BOOLEAN NOT NULL DEFAULT false,
  welcome_sent_at TIMESTAMP,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  last_digest_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospects (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  osm_key TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  first_seen_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prospects_cat_osm ON prospects (category, osm_key);
CREATE INDEX IF NOT EXISTS prospects_state_idx ON prospects (state);

ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS ref_by TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS referral_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS type_filter TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS city_filter TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS keyword_filter TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS prefs_token TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS digest_limit INTEGER NOT NULL DEFAULT 40;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS trial_notified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMP;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE source_health ADD COLUMN IF NOT EXISTS override_dataset TEXT;
ALTER TABLE venue_receipts ADD COLUMN IF NOT EXISTS owner_name TEXT;
CREATE INDEX IF NOT EXISTS venue_receipts_owner_idx ON venue_receipts (lower(owner_name));

CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_messages_created_idx ON contact_messages (created_at);

CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_events_processed_idx ON webhook_events (processed_at);

CREATE TABLE IF NOT EXISTS outreach_sent (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  state TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sender_account TEXT,
  last_subject TEXT,
  bars_json TEXT,
  followup_count INTEGER NOT NULL DEFAULT 0,
  followup_sent_at TIMESTAMP,
  sent_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_sent_state_idx ON outreach_sent (state, sent_at);
ALTER TABLE outreach_sent ADD COLUMN IF NOT EXISTS sender_account TEXT;
ALTER TABLE outreach_sent ADD COLUMN IF NOT EXISTS last_subject TEXT;
ALTER TABLE outreach_sent ADD COLUMN IF NOT EXISTS bars_json TEXT;
ALTER TABLE outreach_sent ADD COLUMN IF NOT EXISTS followup_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_sent ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMP;
`;

// One-time dedupe + unique index for legacy databases upgrading from v1 -> v3.
const EVENTS_UIDX_MIGRATION = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'events_key_type_uidx'
  ) THEN
    DELETE FROM events e
      USING events d
      WHERE e.license_key IS NOT NULL
        AND e.license_key = d.license_key
        AND e.event_type = d.event_type
        AND e.id > d.id;
    CREATE UNIQUE INDEX IF NOT EXISTS events_key_type_uidx ON events (license_key, event_type);
  END IF;
END $$;
`;

let ready: Promise<void> | null = null;

async function applyIfNeeded(): Promise<void> {
  // Fast path (~1ms, zero locks): check if schema is already at SCHEMA_VERSION.
  try {
    const check = await pool.query<{ version: number }>(
      `SELECT version FROM _schema_meta WHERE id = 1`
    );
    if ((check.rows[0]?.version ?? 0) >= SCHEMA_VERSION) {
      return;
    }
  } catch {
    // _schema_meta does not exist yet — fall through to full bootstrap.
  }

  await pool.query(DDL);
  await pool.query(EVENTS_UIDX_MIGRATION);
  await pool.query(
    `INSERT INTO _schema_meta (id, version, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET version = GREATEST(_schema_meta.version, $1), updated_at = now()`,
    [SCHEMA_VERSION]
  );
}

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = applyIfNeeded().catch((err) => {
      ready = null; // allow retry on next call
      throw err;
    });
  }
  return ready;
}
