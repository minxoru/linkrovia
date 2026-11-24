ALTER TABLE links ADD COLUMN gate_token TEXT;
CREATE UNIQUE INDEX links_gate_token ON links(gate_token) WHERE gate_token IS NOT NULL;

CREATE TABLE link_unlocks (
  token_hash TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  link_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX link_unlocks_expiry ON link_unlocks(expires_at);
CREATE INDEX link_unlocks_link ON link_unlocks(link_id);

-- Existing protected records predate the public gate and need a route token.
UPDATE links SET gate_token = lower(hex(randomblob(32))) WHERE protection_mode <> 'none';
