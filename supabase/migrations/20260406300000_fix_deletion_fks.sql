-- Fix FK constraints that block user deletion from auth.users
--
-- 1. Drop created_by FKs — these are informational provenance, not structural.
--    NULL = platform-seeded, UUID preserved even if user is later deleted.
-- 2. Make coteries.owner_id nullable + SET NULL on delete → ownerless coteries.
--    All remaining members get admin privileges when owner_id IS NULL.
-- 3. Fix coteries_invitations FKs: invited_by CASCADE, user_id SET NULL.
--
-- Note: constraint names may differ between local (fresh schema) and cloud
-- (table was renamed from coterie_invitations → coteries_invitations, but
-- constraint names don't update on rename). We use dynamic lookup to be safe.

-- Drop created_by FK constraints (types, roles, objects)
ALTER TABLE types DROP CONSTRAINT IF EXISTS types_created_by_fkey;
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_created_by_fkey;
ALTER TABLE objects DROP CONSTRAINT IF EXISTS fk_objects_created_by;

-- Make coteries.owner_id nullable with SET NULL on delete
ALTER TABLE coteries ALTER COLUMN owner_id DROP NOT NULL;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.coteries'::regclass
      AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.coteries'::regclass AND attname = 'owner_id')
  LOOP
    EXECUTE format('ALTER TABLE coteries DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE coteries ADD CONSTRAINT coteries_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES profiles(user_id) ON DELETE SET NULL;

-- Fix coteries_invitations.invited_by → CASCADE
-- Drop any existing FK on invited_by (name may vary due to table rename)
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
