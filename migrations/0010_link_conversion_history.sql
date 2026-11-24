CREATE TABLE conversion_link_cohort_rollups (
  day_utc TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  eligible_clicks INTEGER NOT NULL CHECK (eligible_clicks > 0),
  converted_clicks INTEGER NOT NULL CHECK (converted_clicks >= 0 AND converted_clicks <= eligible_clicks),
  PRIMARY KEY(day_utc, goal_id, link_id)
);
