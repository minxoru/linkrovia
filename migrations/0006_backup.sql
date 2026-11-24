ALTER TABLE domains ADD COLUMN backup_archived_at INTEGER;
ALTER TABLE conversion_goals ADD COLUMN backup_archived_at INTEGER;
CREATE INDEX conversion_goals_backup_lookup
ON conversion_goals (link_id, event_name, backup_archived_at);

CREATE TABLE backup_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  instance_id TEXT NOT NULL,
  signing_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO backup_state (singleton, instance_id, signing_key)
VALUES (1, lower(hex(randomblob(16))), lower(hex(randomblob(32))));

-- Every configuration mutation invalidates a restore preview, including changes
-- to protection and one-time consumption. Analytics and audit rows are excluded.
CREATE TRIGGER backup_revision_domains_insert
AFTER INSERT ON domains
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_domains_update
AFTER UPDATE ON domains
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_domains_delete
AFTER DELETE ON domains
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_links_insert
AFTER INSERT ON links
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_links_update
AFTER UPDATE ON links
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_links_delete
AFTER DELETE ON links
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_tags_insert
AFTER INSERT ON tags
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_tags_update
AFTER UPDATE ON tags
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_tags_delete
AFTER DELETE ON tags
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_link_tags_insert
AFTER INSERT ON link_tags
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_link_tags_update
AFTER UPDATE ON link_tags
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_link_tags_delete
AFTER DELETE ON link_tags
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_redirect_rules_insert
AFTER INSERT ON redirect_rules
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_redirect_rules_update
AFTER UPDATE ON redirect_rules
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_redirect_rules_delete
AFTER DELETE ON redirect_rules
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_utm_templates_insert
AFTER INSERT ON utm_templates
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_utm_templates_update
AFTER UPDATE ON utm_templates
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_utm_templates_delete
AFTER DELETE ON utm_templates
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_conversion_goals_insert
AFTER INSERT ON conversion_goals
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_conversion_goals_update
AFTER UPDATE ON conversion_goals
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_conversion_goals_delete
AFTER DELETE ON conversion_goals
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_qr_codes_insert
AFTER INSERT ON qr_codes
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_qr_codes_update
AFTER UPDATE ON qr_codes
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_qr_codes_delete
AFTER DELETE ON qr_codes
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_app_settings_insert
AFTER INSERT ON app_settings
WHEN NEW.key IN ('default_locale', 'default_timezone')
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_app_settings_update
AFTER UPDATE ON app_settings
WHEN OLD.key IN ('default_locale', 'default_timezone') OR NEW.key IN ('default_locale', 'default_timezone')
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;

CREATE TRIGGER backup_revision_app_settings_delete
AFTER DELETE ON app_settings
WHEN OLD.key IN ('default_locale', 'default_timezone')
BEGIN
  UPDATE backup_state SET revision = revision + 1 WHERE singleton = 1;
END;
