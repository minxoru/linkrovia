ALTER TABLE conversion_rollups ADD COLUMN attributed INTEGER NOT NULL DEFAULT 0
  CHECK (attributed >= 0 AND attributed <= conversions);

CREATE TABLE conversion_cohort_rollups (
  day_utc TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  eligible_clicks INTEGER NOT NULL CHECK (eligible_clicks > 0),
  converted_clicks INTEGER NOT NULL CHECK (converted_clicks >= 0 AND converted_clicks <= eligible_clicks),
  PRIMARY KEY(day_utc, goal_id)
);
CREATE INDEX conversion_receipts_retention ON conversion_receipts(created_at, id);
