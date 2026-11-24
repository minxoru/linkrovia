CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin')),
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT, -- NULL inherits the instance default. The application validates the IANA identifier.
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  disabled_at INTEGER
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id, expires_at);
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX domains_single_primary ON domains(is_primary) WHERE is_primary = 1;
CREATE TABLE links (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  slug TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  protection_mode TEXT NOT NULL DEFAULT 'none' CHECK(protection_mode IN ('none','password','one_time','password_one_time')),
  protection_password_hash TEXT,
  consumed_at INTEGER,
  utm_config_json TEXT,
  redirect_type INTEGER NOT NULL DEFAULT 302 CHECK(redirect_type IN (301,302,307,308)),
  is_active INTEGER NOT NULL DEFAULT 1,
  starts_at INTEGER,
  expires_at INTEGER,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER,
  UNIQUE(domain_id, slug),
  CHECK(expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at),
  CHECK((protection_mode IN ('password', 'password_one_time')) = (protection_password_hash IS NOT NULL)),
  CHECK(consumed_at IS NULL OR protection_mode IN ('one_time', 'password_one_time'))
);
CREATE INDEX links_domain_created ON links(domain_id, created_at DESC);
CREATE INDEX links_status ON links(domain_id, is_active, deleted_at);
CREATE TABLE redirect_rules (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('os','device','country','region','language')),
  operator TEXT NOT NULL DEFAULT 'eq' CHECK(operator IN ('eq','base_language')),
  rule_value TEXT NOT NULL, -- legacy single-condition compatibility
  conditions_json TEXT, -- validated AND condition list; when null use type/value
  destination_url TEXT NOT NULL,
  priority INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX redirect_rules_lookup ON redirect_rules(link_id,is_active,priority,id);
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE link_tags (
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (link_id, tag_id)
);
CREATE INDEX link_tags_tag ON link_tags(tag_id, link_id);
CREATE TABLE qr_codes (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- The default_timezone setting stores an IANA identifier as a JSON string.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  json_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE setup_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  completed_at INTEGER,
  owner_user_id TEXT,
  token_consumed_at INTEGER
);
INSERT INTO setup_state(singleton) VALUES (1);
CREATE TABLE analytics_rollups (
  day_utc TEXT NOT NULL,
  link_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  click_count REAL NOT NULL DEFAULT 0,
  estimated INTEGER NOT NULL DEFAULT 0,
  calculated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(day_utc,link_id,dimension,dimension_value)
);
CREATE INDEX analytics_rollups_link_day ON analytics_rollups(link_id, day_utc);
CREATE INDEX analytics_rollups_dim_day ON analytics_rollups(dimension, day_utc);
CREATE TABLE rollup_jobs (
  day_utc TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  started_at INTEGER,
  completed_at INTEGER,
  error_code TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  estimated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE utm_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  values_json TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE conversion_goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  link_id TEXT REFERENCES links(id), -- null: instance-wide goal
  event_name TEXT NOT NULL,
  attribution_window_hours INTEGER NOT NULL DEFAULT 24,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE click_attributions (
  ref_hash TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  -- secret reference is never stored in plaintext
  consumed_at INTEGER
);
CREATE INDEX click_attributions_expires ON click_attributions(expires_at);
CREATE TABLE conversion_receipts (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES conversion_goals(id),
  click_ref_hash TEXT, -- opaque reference; not raw IP, full URL, cookie or UA
  dedupe_key_hash TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  link_id TEXT REFERENCES links(id),
  status TEXT NOT NULL CHECK(status IN ('accepted','unattributed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(goal_id,dedupe_key_hash)
);
CREATE INDEX conversion_receipts_link_time ON conversion_receipts(link_id,occurred_at);
CREATE TABLE conversion_rollups (
  day_utc TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  conversions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day_utc,goal_id,link_id)
);
CREATE TABLE link_health (
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  destination_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','healthy','broken','blocked','unknown')),
  http_status INTEGER,
  failure_code TEXT,
  last_checked_at INTEGER,
  next_check_at INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(link_id,destination_fingerprint)
);
CREATE INDEX link_health_due ON link_health(next_check_at,status);
CREATE TABLE maintenance_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed')),
  cursor_value TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}', -- allowlisted, redacted
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX audit_events_created ON audit_events(created_at);
CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('links_csv','backup_restore')),
  status TEXT NOT NULL,
  checkpoint_json TEXT,
  report_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
