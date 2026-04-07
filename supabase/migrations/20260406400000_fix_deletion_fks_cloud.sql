-- Fix remaining FK constraints blocking user deletion on cloud.
-- The previous migration (20260406300000) used static constraint names that
-- didn't match cloud (table was renamed, but FK names weren't updated).
-- This migration uses dynamic lookup to find and replace constraints.

-- Fix coteries_invitations.invited_by → CASCADE
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.coteries_invitations'::regclass
      AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.coteries_invitations'::regclass AND attname = 'invited_by')
  LOOP
    EXECUTE format('ALTER TABLE coteries_invitations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE coteries_invitations ADD CONSTRAINT coteries_invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES profiles(user_id) ON DELETE CASCADE;

-- Fix coteries_invitations.user_id → SET NULL
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.coteries_invitations'::regclass
      AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.coteries_invitations'::regclass AND attname = 'user_id')
  LOOP
    EXECUTE format('ALTER TABLE coteries_invitations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE coteries_invitations ADD CONSTRAINT coteries_invitations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;
