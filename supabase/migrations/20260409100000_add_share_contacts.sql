-- Per-member control over whether their contact info is shared with the coterie
ALTER TABLE coteries_members
  ADD COLUMN IF NOT EXISTS share_contacts BOOLEAN NOT NULL DEFAULT TRUE;
