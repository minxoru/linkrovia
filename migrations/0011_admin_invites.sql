CREATE TABLE admin_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  accepted_by TEXT REFERENCES users(id),
  accepted_at INTEGER,
  CHECK ((accepted_by IS NULL) = (accepted_at IS NULL)),
  CHECK (accepted_by IS NULL OR revoked_at IS NULL)
);
CREATE UNIQUE INDEX admin_invites_pending_email ON admin_invites(email)
  WHERE revoked_at IS NULL AND accepted_by IS NULL;
