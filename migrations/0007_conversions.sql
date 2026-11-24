ALTER TABLE links ADD COLUMN conversion_tracking INTEGER NOT NULL DEFAULT 0
  CHECK (conversion_tracking IN (0, 1));
ALTER TABLE click_attributions ADD COLUMN eligible_goals_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(eligible_goals_json));

INSERT INTO schema_meta (key, value)
VALUES ('conversion_reference_key', lower(hex(randomblob(32))));

CREATE INDEX click_attributions_cohort ON click_attributions (created_at, link_id);
CREATE INDEX conversion_receipts_goal_time ON conversion_receipts (goal_id, occurred_at);
CREATE UNIQUE INDEX conversion_receipts_goal_click ON conversion_receipts (goal_id, click_ref_hash)
  WHERE click_ref_hash IS NOT NULL;
CREATE UNIQUE INDEX conversion_goals_live_event ON conversion_goals (coalesce(link_id, ''), event_name)
  WHERE backup_archived_at IS NULL;
