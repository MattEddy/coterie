-- Fix infinite recursion in coteries_members RLS policy.
-- The old policy queried coteries_members from within its own SELECT policy,
-- causing PostgreSQL to re-evaluate the policy endlessly.
-- Fix: SECURITY DEFINER helper bypasses RLS on the inner check.

CREATE OR REPLACE FUNCTION is_coterie_member(p_coterie_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM coteries_members
    WHERE coterie_id = p_coterie_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_coterie_member(UUID) TO authenticated;

-- Replace the self-referencing policy
DROP POLICY IF EXISTS "coteries_members_read" ON coteries_members;

CREATE POLICY "coteries_members_read"
  ON coteries_members FOR SELECT
  TO authenticated
  USING (is_coterie_member(coterie_id));
