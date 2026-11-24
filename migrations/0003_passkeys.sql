CREATE TABLE passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  public_key TEXT NOT NULL,
  sign_count INTEGER NOT NULL CHECK (sign_count BETWEEN 0 AND 4294967295),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX passkey_credentials_user ON passkey_credentials(user_id);

CREATE TABLE passkey_challenges (
  token_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL UNIQUE,
  flow TEXT NOT NULL CHECK (flow IN ('owner', 'login')),
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  proof_hash TEXT,
  owner_id TEXT,
  owner_email TEXT,
  owner_locale TEXT,
  expires_at INTEGER NOT NULL,
  CHECK (
    (flow = 'owner' AND proof_hash IS NOT NULL AND owner_id IS NOT NULL
      AND owner_email IS NOT NULL AND owner_locale IS NOT NULL)
    OR
    (flow = 'login' AND proof_hash IS NULL AND owner_id IS NULL
      AND owner_email IS NULL AND owner_locale IS NULL)
  )
);
CREATE INDEX passkey_challenges_expiry ON passkey_challenges(expires_at);
