CREATE TABLE management_signins (
  state_hash TEXT PRIMARY KEY NOT NULL,
  verifier_hash TEXT NOT NULL,
  target_origin TEXT NOT NULL,
  code_hash TEXT UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  CHECK ((code_hash IS NULL) = (user_id IS NULL))
);
CREATE INDEX management_signins_expiry_idx ON management_signins(expires_at);
