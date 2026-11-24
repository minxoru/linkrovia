ALTER TABLE users
  ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'
  CONSTRAINT users_theme_check CHECK (theme IN ('system', 'light', 'dark'));
