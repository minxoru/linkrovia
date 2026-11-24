CREATE TABLE click_rollup_repair (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  day_utc TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0 CHECK (finished IN (0, 1))
);
