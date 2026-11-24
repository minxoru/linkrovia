ALTER TABLE domains ADD COLUMN provider_mode TEXT NOT NULL DEFAULT 'unconfigured'
  CHECK(provider_mode IN ('unconfigured','cloudflare_custom_domain','external_dns_guided'));
ALTER TABLE domains ADD COLUMN connection_status TEXT NOT NULL DEFAULT 'draft'
  CHECK(connection_status IN ('draft','checking','awaiting_authorization','awaiting_dns','provisioning','verifying','active','warning','failed','disconnected'));
ALTER TABLE domains ADD COLUMN cloudflare_zone_id TEXT;
ALTER TABLE domains ADD COLUMN cloudflare_domain_id TEXT;
ALTER TABLE domains ADD COLUMN dns_instructions_json TEXT; -- Only public DNS record instructions.
ALTER TABLE domains ADD COLUMN last_checked_at INTEGER;
ALTER TABLE domains ADD COLUMN verified_at INTEGER;
ALTER TABLE domains ADD COLUMN connection_error_code TEXT;
ALTER TABLE domains ADD COLUMN connection_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX domains_connection_status ON domains(connection_status, last_checked_at);

CREATE TABLE domain_connection_operations (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('preflight','connect','verify','disconnect')),
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','needs_user_action')),
  attempt INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  error_code TEXT,
  sanitized_result_json TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER
);
CREATE INDEX domain_connection_operations_domain ON domain_connection_operations(domain_id, started_at DESC);
