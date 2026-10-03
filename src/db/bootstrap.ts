import { pool } from "@/db";

// Self-healing: creates every table if it does not exist yet.
// Runs automatically before every scheduled pull, so a fresh deploy
// needs zero manual database setup. Safe to run any number of times.
const DDL = `
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

-- Events dedup: the same filing can be written by the legacy runner AND the
-- aggregator (both legitimately cover TX/NY/CA), and any re-run after an ID
-- format change would re-insert old filings as "new". One event per
-- (license, type) — duplicates are removed before the index is created.
DELETE FROM events e
  USING events d
  WHERE e.license_key IS NOT NULL
    AND e.license_key = d.license_key
    AND e.event_type = d.event_type
    AND e.id > d.id;
CREATE UNIQUE INDEX IF NOT EXISTS events_key_type_uidx ON events (license_key, event_type);

CREATE TABLE IF NOT EXISTS venue_receipts (
  id SERIAL PRIMARY KEY,
  permit TEXT NOT NULL,
  trade_name TEXT,
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
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL DEFAULT 'waitlist',
  states TEXT NOT NULL DEFAULT 'TX,NY',
  email_opt_out BOOLEAN NOT NULL DEFAULT false,
  ref_by TEXT,
  zip_filter TEXT,
  type_filter TEXT,
  prefs_token TEXT,
  digest_limit INTEGER NOT NULL DEFAULT 40,
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
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS referral_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS type_filter TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS city_filter TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS keyword_filter TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS prefs_token TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS digest_limit INTEGER NOT NULL DEFAULT 40;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS trial_notified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE source_health ADD COLUMN IF NOT EXISTS override_dataset TEXT;

ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false;

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
`;

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = pool.query(DDL).then(() => undefined).catch((err) => {
      ready = null; // allow retry on next call
      throw err;
    });
  }
  return ready;
}
