-- Fix all remaining RLS recursion chains.
--
-- Root cause: policies on table A query table B, whose policies query table A.
-- Chains found:
--   coteries_maps INSERT → maps (maps_read) → coteries_maps → RECURSION
--   maps_read → coteries_maps (coteries_maps_read) → coteries_members → OK but fragile
--
-- Fix: SECURITY DEFINER helpers that bypass RLS for membership/visibility checks.
-- These join is_coterie_member (already exists) to cover all cases.

-- 1. is_map_shared_with_user: checks if a map is shared via a coterie the user belongs to.
--    Replaces the raw coteries_maps + coteries_members subquery in maps_read.
CREATE OR REPLACE FUNCTION is_map_shared_with_user(p_map_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM coteries_maps cm
    JOIN coteries_members cmem ON cmem.coterie_id = cm.coterie_id
    WHERE cm.map_id = p_map_id
    AND cmem.user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_map_shared_with_user(UUID) TO authenticated;

-- 2. Replace maps_read to use the helper (breaks maps ↔ coteries_maps recursion)
DROP POLICY IF EXISTS "maps_read" ON maps;

CREATE POLICY "maps_read"
  ON maps FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_published = true
    OR is_map_shared_with_user(id)
  );

-- 3. Replace coteries_maps_read to use is_coterie_member (already SECURITY DEFINER)
DROP POLICY IF EXISTS "coteries_maps_read" ON coteries_maps;

CREATE POLICY "coteries_maps_read"
  ON coteries_maps FOR SELECT
  TO authenticated
  USING (is_coterie_member(coterie_id));

-- 4. Replace maps_objects_read — it queries maps which could chain back
DROP POLICY IF EXISTS "maps_objects_read" ON maps_objects;

CREATE POLICY "maps_objects_read"
  ON maps_objects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maps m
      WHERE m.id = map_id
      AND (
        m.user_id = auth.uid()
        OR m.is_published = true
        OR is_map_shared_with_user(m.id)
      )
    )
  );

-- 5. Replace coteries_invitations policies that raw-query coteries_members
DROP POLICY IF EXISTS "coteries_invitations_read" ON coteries_invitations;

CREATE POLICY "coteries_invitations_read"
  ON coteries_invitations FOR SELECT
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR is_coterie_admin(coterie_id)
  );

DROP POLICY IF EXISTS "coteries_invitations_insert" ON coteries_invitations;

CREATE POLICY "coteries_invitations_insert"
  ON coteries_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND is_coterie_member(coterie_id)
  );

DROP POLICY IF EXISTS "coteries_invitations_update" ON coteries_invitations;

CREATE POLICY "coteries_invitations_update"
  ON coteries_invitations FOR UPDATE
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR is_coterie_admin(coterie_id)
  );

-- 6. Replace coteries_maps_insert — uses is_coterie_admin (already SECURITY DEFINER)
--    but also queries maps which could recurse. Simplify: admin OR map owner.
DROP POLICY IF EXISTS "coteries_maps_insert" ON coteries_maps;

CREATE POLICY "coteries_maps_insert"
  ON coteries_maps FOR INSERT
  TO authenticated
  WITH CHECK (
    is_coterie_admin(coterie_id)
    OR EXISTS (
      SELECT 1 FROM maps m
      WHERE m.id = map_id
      AND m.user_id = auth.uid()
    )
  );

-- 7. coteries_maps_delete — same pattern
DROP POLICY IF EXISTS "coteries_maps_delete" ON coteries_maps;

CREATE POLICY "coteries_maps_delete"
  ON coteries_maps FOR DELETE
  TO authenticated
  USING (
    is_coterie_admin(coterie_id)
    OR EXISTS (
      SELECT 1 FROM maps m
      WHERE m.id = map_id
      AND m.user_id = auth.uid()
    )
  );
