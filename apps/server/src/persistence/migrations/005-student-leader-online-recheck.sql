ALTER TABLE team_leaders ADD COLUMN pending_online_recheck INTEGER NOT NULL DEFAULT 0
  CHECK (pending_online_recheck IN (0, 1));
