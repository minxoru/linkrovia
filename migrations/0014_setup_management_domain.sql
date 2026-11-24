ALTER TABLE setup_state ADD COLUMN deployment_hostname TEXT;
ALTER TABLE setup_state ADD COLUMN management_hostname TEXT;
ALTER TABLE setup_state ADD COLUMN management_operation_id TEXT;
ALTER TABLE setup_state ADD COLUMN management_operation_expires_at INTEGER;
