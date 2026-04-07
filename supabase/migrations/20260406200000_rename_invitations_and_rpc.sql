-- Rename coterie_invitations → coteries_invitations for table name consistency
-- Guarded: main schema may already use the new name (local dev reset)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coterie_invitations') THEN
    ALTER TABLE coterie_invitations RENAME TO coteries_invitations;
    ALTER INDEX idx_coterie_invitations_email RENAME TO idx_coteries_invitations_email;
    ALTER INDEX idx_coterie_invitations_user RENAME TO idx_coteries_invitations_user;
    ALTER INDEX idx_coterie_invitations_coterie RENAME TO idx_coteries_invitations_coterie;
    ALTER TRIGGER coterie_invitations_updated_at ON coteries_invitations RENAME TO coteries_invitations_updated_at;
  END IF;
END $$;

-- Public invite lookup — callable by anon (SECURITY DEFINER, no anon policy on table)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invite_token UUID)
RETURNS TABLE(
  invitation_id UUID,
  coterie_id UUID,
  status TEXT,
  email TEXT,
  coterie_name TEXT,
  sender_name TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ci.id,
    ci.coterie_id,
    ci.status::text,
    ci.email,
    c.name,
    p.display_name
  FROM coteries_invitations ci
  JOIN coteries c ON c.id = ci.coterie_id
  JOIN profiles p ON p.user_id = ci.invited_by
  WHERE ci.token = invite_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(UUID) TO anon, authenticated;
