ALTER TABLE domains ADD COLUMN management_enabled INTEGER NOT NULL DEFAULT 0 CHECK(management_enabled IN (0, 1));
CREATE UNIQUE INDEX domains_one_management ON domains(management_enabled) WHERE management_enabled = 1;
