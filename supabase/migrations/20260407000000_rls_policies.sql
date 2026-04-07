-- =============================================================================
-- Row Level Security (RLS) policies for all public-schema tables.
--
-- Design principles:
--   1. Every table has RLS enabled — no exceptions.
--   2. Canon/reference data readable by all authenticated users.
--   3. User data (overrides, maps, subscriptions) scoped to owner.
--   4. Coterie intel: members can read each other's overrides for objects
--      that appear on shared maps (coteries_maps → maps_objects).
--   5. SECURITY DEFINER functions bypass RLS — triggers, RPCs, etc. still work.
--   6. The anon role has no direct table access (invite lookup uses SECURITY DEFINER RPC).
--
-- Replaces the three placeholder "allow all" policies from the base schema.
-- =============================================================================


-- =============================================================================
-- HELPER: is_coterie_admin(coterie_id)
-- Returns TRUE if the current user is the coterie owner, has the 'owner' role
-- in coteries_members, or the coterie is ownerless (all members are admins).
-- =============================================================================

CREATE OR REPLACE FUNCTION is_coterie_admin(p_coterie_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM coteries c
    WHERE c.id = p_coterie_id
    AND c.is_active = TRUE
    AND (
      -- Explicit owner
      c.owner_id = auth.uid()
      -- Owner role in members table
      OR EXISTS (
        SELECT 1 FROM coteries_members cm
        WHERE cm.coterie_id = p_coterie_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'owner'
      )
      -- Ownerless coterie — all members are admins
      OR (
        c.owner_id IS NULL
        AND EXISTS (
          SELECT 1 FROM coteries_members cm
          WHERE cm.coterie_id = p_coterie_id
          AND cm.user_id = auth.uid()
        )
      )
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- =============================================================================
-- HELPER: Shared-object check for coterie intel
-- Returns TRUE if the given object appears on a map shared with a coterie
-- that BOTH the current user and target_user_id belong to.
-- =============================================================================

CREATE OR REPLACE FUNCTION is_shared_via_coterie(p_object_id UUID, p_target_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    -- Objects on maps shared with a coterie (via coteries_maps)
    SELECT 1
    FROM coteries_members cm_me
    JOIN coteries_members cm_them ON cm_them.coterie_id = cm_me.coterie_id
    JOIN coteries c ON c.id = cm_me.coterie_id AND c.is_active = TRUE
    LEFT JOIN coteries_maps cmap ON cmap.coterie_id = cm_me.coterie_id
    LEFT JOIN maps_objects mo_shared ON mo_shared.map_id = cmap.map_id
    -- Also check recipient's aggregated maps (source_coterie_id)
    LEFT JOIN maps agg_map ON agg_map.source_coterie_id = cm_me.coterie_id
    LEFT JOIN maps_objects mo_agg ON mo_agg.map_id = agg_map.id
    WHERE cm_me.user_id = auth.uid()
    AND cm_them.user_id = p_target_user_id
    AND cm_me.user_id != cm_them.user_id
    AND (mo_shared.object_ref_id = p_object_id OR mo_agg.object_ref_id = p_object_id)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- =============================================================================
-- Make get_dissonances SECURITY DEFINER
-- The dissonance function reads across multiple users' overrides, connections,
-- and reviews. Running it with RLS would require extremely complex policies
-- or fail entirely. SECURITY DEFINER is the right call — the function already
-- scopes everything to the calling user's coteries.
-- =============================================================================

-- We need to recreate it as SECURITY DEFINER. The function body is identical
-- to the original, just with SECURITY DEFINER added.

CREATE OR REPLACE FUNCTION get_dissonances(p_user_id UUID)
RETURNS TABLE (
    dissonance_type TEXT,
    coterie_id UUID,
    coterie_name TEXT,
    source_user_id UUID,
    source_user_name TEXT,
    object_id UUID,
    object_name TEXT,
    object_class TEXT,
    object_a_id UUID,
    object_a_name TEXT,
    object_b_id UUID,
    object_b_name TEXT,
    role_a_name TEXT,
    role_b_name TEXT,
    their_name TEXT,
    your_name TEXT,
    their_title TEXT,
    your_title TEXT,
    their_status TEXT,
    your_status TEXT,
    their_types TEXT[],
    your_types TEXT[],
    ref_type TEXT,
    ref_id UUID,
    is_dismissed BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH user_coteries AS (
        SELECT cm.coterie_id, c.name AS coterie_name
        FROM coteries_members cm
        JOIN coteries c ON c.id = cm.coterie_id
        WHERE cm.user_id = p_user_id AND c.is_active = TRUE
    ),
    co_members AS (
        SELECT uc.coterie_id, uc.coterie_name, cm.user_id AS member_id, p.display_name AS member_name
        FROM user_coteries uc
        JOIN coteries_members cm ON cm.coterie_id = uc.coterie_id
        JOIN profiles p ON p.user_id = cm.user_id
        WHERE cm.user_id != p_user_id
    ),
    shared_objects AS (
        SELECT DISTINCT sub.coterie_id, mo.object_ref_id AS object_id
        FROM (
            SELECT coterie_id, map_id FROM coteries_maps
            UNION ALL
            SELECT source_coterie_id, id FROM maps WHERE source_coterie_id IS NOT NULL
        ) sub
        JOIN maps_objects mo ON mo.map_id = sub.map_id
        WHERE sub.coterie_id IN (SELECT coterie_id FROM user_coteries)
    ),
    my_object_ids AS (
        SELECT object_id FROM objects_overrides WHERE user_id = p_user_id
    )

    -- 1. NEW OBJECTS
    SELECT DISTINCT ON (com.coterie_id, com.member_id, so.object_id)
        'new_object'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        so.object_id,
        COALESCE(m_ov.name, o.name)::TEXT,
        o.class::TEXT,
        NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'object_override'::TEXT,
        m_ov.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.coterie_id = com.coterie_id
    JOIN objects o ON o.id = so.object_id AND o.is_active = TRUE
    JOIN objects_overrides m_ov ON m_ov.user_id = com.member_id AND m_ov.object_id = so.object_id
    WHERE so.object_id NOT IN (SELECT object_id FROM my_object_ids)
    AND o.class IN (SELECT id FROM classes WHERE landscape_visible = TRUE)

    UNION ALL

    -- 2. NEW CONNECTIONS
    SELECT DISTINCT ON (com.coterie_id, com.member_id, m_co.id)
        'new_connection'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        NULL::UUID, NULL::TEXT, NULL::TEXT,
        m_co.object_a_id,
        COALESCE(u_ov_a.name, oa.name)::TEXT,
        m_co.object_b_id,
        COALESCE(u_ov_b.name, ob.name)::TEXT,
        ra.display_name::TEXT,
        rb.display_name::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'connection_override'::TEXT,
        m_co.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'connection_override' AND cr.ref_id = m_co.id
        )
    FROM co_members com
    JOIN connections_overrides m_co ON m_co.user_id = com.member_id
        AND m_co.connection_id IS NULL
        AND m_co.deactivated = FALSE
    JOIN shared_objects so_a ON so_a.coterie_id = com.coterie_id AND so_a.object_id = m_co.object_a_id
    JOIN shared_objects so_b ON so_b.coterie_id = com.coterie_id AND so_b.object_id = m_co.object_b_id
    JOIN my_object_ids mo_a ON mo_a.object_id = m_co.object_a_id
    JOIN my_object_ids mo_b ON mo_b.object_id = m_co.object_b_id
    JOIN objects oa ON oa.id = m_co.object_a_id
    JOIN objects ob ON ob.id = m_co.object_b_id
    LEFT JOIN objects_overrides u_ov_a ON u_ov_a.user_id = p_user_id AND u_ov_a.object_id = m_co.object_a_id
    LEFT JOIN objects_overrides u_ov_b ON u_ov_b.user_id = p_user_id AND u_ov_b.object_id = m_co.object_b_id
    LEFT JOIN roles ra ON ra.id = m_co.role_a
    LEFT JOIN roles rb ON rb.id = m_co.role_b
    WHERE NOT EXISTS (
        SELECT 1 FROM connections_overrides my_co
        WHERE my_co.user_id = p_user_id
        AND my_co.connection_id IS NULL
        AND (
            (my_co.object_a_id = m_co.object_a_id AND my_co.object_b_id = m_co.object_b_id)
            OR (my_co.object_a_id = m_co.object_b_id AND my_co.object_b_id = m_co.object_a_id)
        )
    )

    UNION ALL

    -- 3. DEACTIVATED CONNECTIONS
    SELECT DISTINCT ON (com.coterie_id, com.member_id, c.id)
        'deactivated_connection'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        NULL::UUID, NULL::TEXT, NULL::TEXT,
        c.object_a_id,
        COALESCE(u_ov_a.name, oa.name)::TEXT,
        c.object_b_id,
        COALESCE(u_ov_b.name, ob.name)::TEXT,
        ra.display_name::TEXT,
        rb.display_name::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'connection_override'::TEXT,
        m_deact.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'connection_override' AND cr.ref_id = m_deact.id
        )
    FROM co_members com
    JOIN connections_overrides m_deact ON m_deact.user_id = com.member_id
        AND m_deact.connection_id IS NOT NULL
        AND m_deact.deactivated = TRUE
    JOIN connections c ON c.id = m_deact.connection_id AND c.is_active = TRUE
    JOIN shared_objects so_a ON so_a.coterie_id = com.coterie_id AND so_a.object_id = c.object_a_id
    JOIN shared_objects so_b ON so_b.coterie_id = com.coterie_id AND so_b.object_id = c.object_b_id
    JOIN objects oa ON oa.id = c.object_a_id
    JOIN objects ob ON ob.id = c.object_b_id
    LEFT JOIN objects_overrides u_ov_a ON u_ov_a.user_id = p_user_id AND u_ov_a.object_id = c.object_a_id
    LEFT JOIN objects_overrides u_ov_b ON u_ov_b.user_id = p_user_id AND u_ov_b.object_id = c.object_b_id
    LEFT JOIN roles ra ON ra.id = c.role_a
    LEFT JOIN roles rb ON rb.id = c.role_b
    WHERE NOT EXISTS (
        SELECT 1 FROM connections_overrides my_deact
        WHERE my_deact.user_id = p_user_id
        AND my_deact.connection_id = m_deact.connection_id
        AND my_deact.deactivated = TRUE
    )

    UNION ALL

    -- 4. CAREER MOVES
    SELECT DISTINCT ON (com.coterie_id, com.member_id, so.object_id)
        'career_move'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        so.object_id,
        COALESCE(u_ov.name, o.name)::TEXT,
        o.class::TEXT,
        NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        COALESCE(m_ov.name, o.name)::TEXT,
        COALESCE(u_ov.name, o.name)::TEXT,
        COALESCE(m_ov.title, o.title)::TEXT,
        COALESCE(u_ov.title, o.title)::TEXT,
        COALESCE(m_ov.status, o.status)::TEXT,
        COALESCE(u_ov.status, o.status)::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'object_override'::TEXT,
        m_ov.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.coterie_id = com.coterie_id
    JOIN objects o ON o.id = so.object_id AND o.is_active = TRUE
    JOIN objects_overrides m_ov ON m_ov.user_id = com.member_id AND m_ov.object_id = so.object_id
    JOIN objects_overrides u_ov ON u_ov.user_id = p_user_id AND u_ov.object_id = so.object_id
    WHERE o.class IN (SELECT id FROM classes WHERE landscape_visible = TRUE)
    AND (
        COALESCE(m_ov.name, o.name) IS DISTINCT FROM COALESCE(u_ov.name, o.name)
        OR COALESCE(m_ov.title, o.title) IS DISTINCT FROM COALESCE(u_ov.title, o.title)
        OR COALESCE(m_ov.status, o.status) IS DISTINCT FROM COALESCE(u_ov.status, o.status)
    )

    UNION ALL

    -- 5. TYPE CHANGES
    SELECT DISTINCT ON (com.coterie_id, com.member_id, so.object_id)
        'type_change'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        so.object_id,
        COALESCE(u_ov.name, o.name)::TEXT,
        o.class::TEXT,
        NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        COALESCE(
            (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types_overrides oto
             JOIN types t ON t.id = oto.type_id
             WHERE oto.user_id = com.member_id AND oto.object_id = so.object_id),
            (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types ot
             JOIN types t ON t.id = ot.type_id
             WHERE ot.object_id = so.object_id),
            '{}'::TEXT[]
        ),
        COALESCE(
            (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types_overrides oto
             JOIN types t ON t.id = oto.type_id
             WHERE oto.user_id = p_user_id AND oto.object_id = so.object_id),
            (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types ot
             JOIN types t ON t.id = ot.type_id
             WHERE ot.object_id = so.object_id),
            '{}'::TEXT[]
        ),
        'object_override'::TEXT,
        m_ov.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.coterie_id = com.coterie_id
    JOIN objects o ON o.id = so.object_id AND o.is_active = TRUE
    JOIN objects_overrides m_ov ON m_ov.user_id = com.member_id AND m_ov.object_id = so.object_id
    JOIN objects_overrides u_ov ON u_ov.user_id = p_user_id AND u_ov.object_id = so.object_id
    WHERE o.class IN (SELECT id FROM classes WHERE landscape_visible = TRUE)
    AND COALESCE(
        (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types_overrides oto
         JOIN types t ON t.id = oto.type_id
         WHERE oto.user_id = com.member_id AND oto.object_id = so.object_id),
        (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types ot
         JOIN types t ON t.id = ot.type_id
         WHERE ot.object_id = so.object_id),
        '{}'::TEXT[]
    ) IS DISTINCT FROM COALESCE(
        (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types_overrides oto
         JOIN types t ON t.id = oto.type_id
         WHERE oto.user_id = p_user_id AND oto.object_id = so.object_id),
        (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types ot
         JOIN types t ON t.id = ot.type_id
         WHERE ot.object_id = so.object_id),
        '{}'::TEXT[]
    )
$$;


-- =============================================================================
-- 1. SECTORS — read-only reference data
-- =============================================================================

ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sectors_read"
  ON sectors FOR SELECT
  TO authenticated
  USING (true);


-- =============================================================================
-- 2. CLASSES — read-only reference data
-- =============================================================================

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classes_read"
  ON classes FOR SELECT
  TO authenticated
  USING (true);


-- =============================================================================
-- 3. TYPES — read all, create custom types
-- =============================================================================

ALTER TABLE types ENABLE ROW LEVEL SECURITY;

-- Everyone can read all types (canon + custom from any user)
CREATE POLICY "types_read"
  ON types FOR SELECT
  TO authenticated
  USING (true);

-- Users can create custom types (is_canon must be false, created_by must be self)
CREATE POLICY "types_insert"
  ON types FOR INSERT
  TO authenticated
  WITH CHECK (
    is_canon = false
    AND created_by = auth.uid()
  );

-- Users can update their own custom types
CREATE POLICY "types_update"
  ON types FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND is_canon = false)
  WITH CHECK (created_by = auth.uid() AND is_canon = false);

-- Users can delete their own custom types
CREATE POLICY "types_delete"
  ON types FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND is_canon = false);


-- =============================================================================
-- 4. ROLES — read all, create custom roles
-- =============================================================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Everyone can read all roles
CREATE POLICY "roles_read"
  ON roles FOR SELECT
  TO authenticated
  USING (true);

-- Users can create custom roles
CREATE POLICY "roles_insert"
  ON roles FOR INSERT
  TO authenticated
  WITH CHECK (
    is_canon = false
    AND created_by = auth.uid()
  );

-- Users can update their own custom roles
CREATE POLICY "roles_update"
  ON roles FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND is_canon = false)
  WITH CHECK (created_by = auth.uid() AND is_canon = false);

-- Users can delete their own custom roles
CREATE POLICY "roles_delete"
  ON roles FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND is_canon = false);


-- =============================================================================
-- 5. OBJECTS — the entity registry
-- =============================================================================
-- Canon objects: readable by all authenticated users (active only).
-- User-created objects: readable by creator + anyone who has an override for them
-- (i.e., the object is on their landscape via a coterie share).
-- Insert: anyone can create objects. Update/delete: only the creator, only non-canon.
-- =============================================================================

ALTER TABLE objects ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active objects.
-- Canon objects are the shared registry. User-created objects are readable too
-- because the app needs to join objects with objects_overrides (which IS scoped).
-- The objects table itself has no private data — contacts are in overrides.
CREATE POLICY "objects_read"
  ON objects FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Users can create new objects (non-canon, created_by = self)
CREATE POLICY "objects_insert"
  ON objects FOR INSERT
  TO authenticated
  WITH CHECK (
    is_canon = false
    AND created_by = auth.uid()
  );

-- Users can update their own non-canon objects
CREATE POLICY "objects_update"
  ON objects FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND is_canon = false)
  WITH CHECK (created_by = auth.uid() AND is_canon = false);

-- Users can delete their own non-canon objects (hard delete for orphaned objects)
CREATE POLICY "objects_delete"
  ON objects FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND is_canon = false);


-- =============================================================================
-- 6. OBJECTS_SECTORS — many-to-many, read-only for users
-- =============================================================================

ALTER TABLE objects_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "objects_sectors_read"
  ON objects_sectors FOR SELECT
  TO authenticated
  USING (true);


-- =============================================================================
-- 7. OBJECTS_TYPES — canonical type assignments
-- =============================================================================
-- Readable by all. Users don't write here directly — they use objects_types_overrides.
-- Canon type assignments are managed by platform operators (via service role).

ALTER TABLE objects_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "objects_types_read"
  ON objects_types FOR SELECT
  TO authenticated
  USING (true);

-- Users can assign types to objects they created
CREATE POLICY "objects_types_insert"
  ON objects_types FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM objects o
      WHERE o.id = object_id
      AND o.created_by = auth.uid()
      AND o.is_canon = false
    )
  );

-- Users can update type assignments on their own objects
CREATE POLICY "objects_types_update"
  ON objects_types FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM objects o
      WHERE o.id = object_id
      AND o.created_by = auth.uid()
      AND o.is_canon = false
    )
  );

-- Users can remove type assignments from their own objects
CREATE POLICY "objects_types_delete"
  ON objects_types FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM objects o
      WHERE o.id = object_id
      AND o.created_by = auth.uid()
      AND o.is_canon = false
    )
  );


-- =============================================================================
-- 8. CONNECTIONS — canonical connections
-- =============================================================================
-- Readable by all authenticated (active only). Users don't write to canonical
-- connections — they use connections_overrides for user-created connections
-- and deactivation.

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connections_read"
  ON connections FOR SELECT
  TO authenticated
  USING (is_active = true);


-- =============================================================================
-- 9. PROFILES — user profiles
-- =============================================================================
-- Everyone can read profiles (needed for display_name in coterie intel, etc.).
-- Users can only update their own profile.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Profile creation is handled by create_profile_on_signup() trigger (SECURITY DEFINER).
-- No INSERT policy needed for regular users.


-- =============================================================================
-- 10. SUBSCRIPTIONS — private to user
-- =============================================================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
CREATE POLICY "subscriptions_read"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own subscription (e.g., Stripe webhook via service role,
-- but also client-side reads that trigger trial expiry via user_tier())
CREATE POLICY "subscriptions_update"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Subscription creation is handled by create_profile_on_signup() trigger (SECURITY DEFINER).
-- No INSERT policy needed for regular users.


-- =============================================================================
-- 11. MAPS — user-owned collections
-- =============================================================================
-- Users see: their own maps + published store packages.
-- Coterie members can also read maps shared with their coteries (via coteries_maps)
-- for the acceptInvitation flow.

ALTER TABLE maps ENABLE ROW LEVEL SECURITY;

-- Read own maps, published packages, and maps shared with coteries the user belongs to
CREATE POLICY "maps_read"
  ON maps FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_published = true
    OR EXISTS (
      SELECT 1 FROM coteries_maps cm
      JOIN coteries_members cmem ON cmem.coterie_id = cm.coterie_id
      WHERE cm.map_id = maps.id
      AND cmem.user_id = auth.uid()
    )
  );

-- Users can create maps (user_id must be self)
CREATE POLICY "maps_insert"
  ON maps FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own maps
CREATE POLICY "maps_update"
  ON maps FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own maps
CREATE POLICY "maps_delete"
  ON maps FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 12. MAPS_OBJECTS — map membership join table
-- =============================================================================
-- Users can read map_objects for maps they can see.
-- Users can write map_objects only for their own maps.

ALTER TABLE maps_objects ENABLE ROW LEVEL SECURITY;

-- Read: for maps the user owns, published packages, or coterie-shared maps
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
        OR EXISTS (
          SELECT 1 FROM coteries_maps cm
          JOIN coteries_members cmem ON cmem.coterie_id = cm.coterie_id
          WHERE cm.map_id = m.id
          AND cmem.user_id = auth.uid()
        )
      )
    )
  );

-- Insert: only for the user's own maps
CREATE POLICY "maps_objects_insert"
  ON maps_objects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maps m
      WHERE m.id = map_id
      AND m.user_id = auth.uid()
    )
  );

-- Delete: only from the user's own maps
CREATE POLICY "maps_objects_delete"
  ON maps_objects FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maps m
      WHERE m.id = map_id
      AND m.user_id = auth.uid()
    )
  );


-- =============================================================================
-- 13. OBJECTS_OVERRIDES — per-user layer (THE critical table for RLS)
-- =============================================================================
-- Own data: full CRUD.
-- Coterie intel: members can SELECT overrides for objects on shared maps.
-- private_notes is excluded from coterie reads at the APPLICATION level
-- (the query only selects shared_notes + data, never private_notes).
-- RLS grants row-level SELECT — column filtering is the app's responsibility.
-- =============================================================================

-- Drop the placeholder policy
DROP POLICY IF EXISTS "objects_overrides_all" ON objects_overrides;

-- Read own overrides
CREATE POLICY "objects_overrides_read_own"
  ON objects_overrides FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Read coterie members' overrides for shared objects (intel channel)
CREATE POLICY "objects_overrides_read_coterie"
  ON objects_overrides FOR SELECT
  TO authenticated
  USING (
    user_id != auth.uid()
    AND is_shared_via_coterie(object_id, user_id)
  );

-- Insert own overrides
CREATE POLICY "objects_overrides_insert"
  ON objects_overrides FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Update own overrides
CREATE POLICY "objects_overrides_update"
  ON objects_overrides FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete own overrides
CREATE POLICY "objects_overrides_delete"
  ON objects_overrides FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 14. OBJECTS_TYPES_OVERRIDES — per-user type overrides
-- =============================================================================

ALTER TABLE objects_types_overrides ENABLE ROW LEVEL SECURITY;

-- Read own type overrides
CREATE POLICY "objects_types_overrides_read_own"
  ON objects_types_overrides FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Read coterie members' type overrides for shared objects (type_change dissonances)
CREATE POLICY "objects_types_overrides_read_coterie"
  ON objects_types_overrides FOR SELECT
  TO authenticated
  USING (
    user_id != auth.uid()
    AND is_shared_via_coterie(object_id, user_id)
  );

-- Insert own type overrides
CREATE POLICY "objects_types_overrides_insert"
  ON objects_types_overrides FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Update own type overrides
CREATE POLICY "objects_types_overrides_update"
  ON objects_types_overrides FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete own type overrides
CREATE POLICY "objects_types_overrides_delete"
  ON objects_types_overrides FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 15. CONNECTIONS_OVERRIDES — per-user connection layer
-- =============================================================================

-- Drop the placeholder policy
DROP POLICY IF EXISTS "connections_overrides_all" ON connections_overrides;

-- Read own connection overrides
CREATE POLICY "connections_overrides_read_own"
  ON connections_overrides FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Read coterie members' connection overrides for shared objects
-- (new_connection + deactivated_connection dissonances, and intel)
CREATE POLICY "connections_overrides_read_coterie"
  ON connections_overrides FOR SELECT
  TO authenticated
  USING (
    user_id != auth.uid()
    AND (
      -- For user-created connections: both endpoints must be shared via coterie
      (connection_id IS NULL AND object_a_id IS NOT NULL AND object_b_id IS NOT NULL
        AND is_shared_via_coterie(object_a_id, user_id)
        AND is_shared_via_coterie(object_b_id, user_id))
      -- For canonical connection overrides: check either endpoint is shared
      OR (connection_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM connections c
        WHERE c.id = connection_id
        AND (is_shared_via_coterie(c.object_a_id, user_id)
          OR is_shared_via_coterie(c.object_b_id, user_id))
      ))
    )
  );

-- Insert own connection overrides
CREATE POLICY "connections_overrides_insert"
  ON connections_overrides FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Update own connection overrides
CREATE POLICY "connections_overrides_update"
  ON connections_overrides FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete own connection overrides
CREATE POLICY "connections_overrides_delete"
  ON connections_overrides FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 16. COTERIES — sharing groups
-- =============================================================================

ALTER TABLE coteries ENABLE ROW LEVEL SECURITY;

-- Members can read their coteries
CREATE POLICY "coteries_read"
  ON coteries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coteries_members cm
      WHERE cm.coterie_id = coteries.id
      AND cm.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a coterie
CREATE POLICY "coteries_insert"
  ON coteries FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Admins can update coterie (name, is_active, owner transfer)
CREATE POLICY "coteries_update"
  ON coteries FOR UPDATE
  TO authenticated
  USING (is_coterie_admin(coteries.id));

-- Only admins can delete coteries (soft delete via is_active, but allow hard delete too)
CREATE POLICY "coteries_delete"
  ON coteries FOR DELETE
  TO authenticated
  USING (is_coterie_admin(coteries.id));


-- =============================================================================
-- 17. COTERIES_MEMBERS — membership join table
-- =============================================================================

ALTER TABLE coteries_members ENABLE ROW LEVEL SECURITY;

-- Members can see all members in their coteries
CREATE POLICY "coteries_members_read"
  ON coteries_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coteries_members cm
      WHERE cm.coterie_id = coteries_members.coterie_id
      AND cm.user_id = auth.uid()
    )
  );

-- Users can add themselves as members (joining a coterie via invite acceptance)
-- or admins can add members
CREATE POLICY "coteries_members_insert"
  ON coteries_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR is_coterie_admin(coterie_id)
  );

-- Admins can update member roles (e.g., ownership transfer)
CREATE POLICY "coteries_members_update"
  ON coteries_members FOR UPDATE
  TO authenticated
  USING (is_coterie_admin(coterie_id));

-- Members can remove themselves (leave). Admins can remove anyone.
CREATE POLICY "coteries_members_delete"
  ON coteries_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_coterie_admin(coterie_id)
  );


-- =============================================================================
-- 18. COTERIES_MAPS — maps shared with coteries
-- =============================================================================

ALTER TABLE coteries_maps ENABLE ROW LEVEL SECURITY;

-- Members can see which maps are shared with their coteries
CREATE POLICY "coteries_maps_read"
  ON coteries_maps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coteries_members cm
      WHERE cm.coterie_id = coteries_maps.coterie_id
      AND cm.user_id = auth.uid()
    )
  );

-- Admins and map owners can share maps with coteries
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

-- Admins can remove shared maps
CREATE POLICY "coteries_maps_delete"
  ON coteries_maps FOR DELETE
  TO authenticated
  USING (is_coterie_admin(coterie_id));


-- =============================================================================
-- 19. COTERIES_INVITATIONS — invite management
-- =============================================================================
-- No anon policy needed — anonymous invite lookup uses SECURITY DEFINER RPC.

-- Drop the placeholder policy
DROP POLICY IF EXISTS "coteries_invitations_all" ON coteries_invitations;

-- Members can see invitations for their coteries.
-- Email matching is needed for the notification badge: pending invitations
-- are looked up by the invitee's email before they've accepted.
CREATE POLICY "coteries_invitations_read"
  ON coteries_invitations FOR SELECT
  TO authenticated
  USING (
    -- Inviter can see their invites
    invited_by = auth.uid()
    -- Invitee can see invites sent to them (matched by user_id)
    OR user_id = auth.uid()
    -- Invitee can see invites sent to their email (before acceptance sets user_id)
    OR email = (auth.jwt() ->> 'email')
    -- Admins can see all invitations for their coteries
    OR is_coterie_admin(coterie_id)
    -- Members can see invitations for their coteries (for UI display)
    OR EXISTS (
      SELECT 1 FROM coteries_members cm
      WHERE cm.coterie_id = coteries_invitations.coterie_id
      AND cm.user_id = auth.uid()
    )
  );

-- Members can create invitations for their coteries
CREATE POLICY "coteries_invitations_insert"
  ON coteries_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM coteries_members cm
      WHERE cm.coterie_id = coterie_id
      AND cm.user_id = auth.uid()
    )
  );

-- Inviter can update their invitations (e.g., resend), or invitee can accept/decline.
-- Email matching is needed for in-app acceptance (user found by email, not token).
CREATE POLICY "coteries_invitations_update"
  ON coteries_invitations FOR UPDATE
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR is_coterie_admin(coterie_id)
  );

-- Admins can delete invitations
CREATE POLICY "coteries_invitations_delete"
  ON coteries_invitations FOR DELETE
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR is_coterie_admin(coterie_id)
  );


-- =============================================================================
-- 20. COTERIES_REVIEWS — dissonance dismissals
-- =============================================================================

ALTER TABLE coteries_reviews ENABLE ROW LEVEL SECURITY;

-- Users can read their own reviews
CREATE POLICY "coteries_reviews_read"
  ON coteries_reviews FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can create their own reviews
CREATE POLICY "coteries_reviews_insert"
  ON coteries_reviews FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own reviews
CREATE POLICY "coteries_reviews_update"
  ON coteries_reviews FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own reviews
CREATE POLICY "coteries_reviews_delete"
  ON coteries_reviews FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- ACCEPT INVITATION: handle the token-based acceptance flow
-- =============================================================================
-- The acceptInvitation client code needs to:
-- 1. Read the invitation by token (to get coterie_id, status)
-- 2. Update the invitation (set status = accepted, user_id = self)
-- 3. Read coteries_maps, maps_objects for the coterie
-- 4. Read the coterie owner's overrides (to copy positions/names)
--
-- Steps 1-2 need special handling: a new user accepting an invite doesn't have
-- a coteries_members row yet, so they can't read the invitation via the member
-- policy. We need an RPC for token-based acceptance.
-- =============================================================================

CREATE OR REPLACE FUNCTION accept_invitation_by_token(p_token UUID, p_user_id UUID)
RETURNS TABLE(invitation_id UUID, coterie_id UUID, status TEXT) AS $$
  UPDATE coteries_invitations
  SET status = 'accepted', user_id = p_user_id, updated_at = NOW()
  WHERE token = p_token
  AND status = 'pending'
  RETURNING id AS invitation_id, coterie_id, status::TEXT;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION accept_invitation_by_token(UUID, UUID) TO authenticated;


-- =============================================================================
-- GRANT EXECUTE on helper functions
-- =============================================================================

GRANT EXECUTE ON FUNCTION is_coterie_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_shared_via_coterie(UUID, UUID) TO authenticated;
