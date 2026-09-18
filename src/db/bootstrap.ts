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
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS ref_by TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS type_filter TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS prefs_token TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS digest_limit INTEGER NOT NULL DEFAULT 40;

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
