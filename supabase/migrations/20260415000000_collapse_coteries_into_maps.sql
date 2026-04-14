-- Collapse Coteries into Maps
--
-- The coterie abstraction is redundant now that maps and coteries have a 1:1
-- relationship. This migration eliminates the coterie layer entirely. Maps
-- become the sharing primitive directly via origin_map_id (self-referential).
--
-- Membership is derived: SELECT user_id FROM maps WHERE origin_map_id = :origin
-- No maps_members table needed. The map copies ARE the membership records.
--
-- origin_map_id semantics:
--   NULL       = standalone unshared map
--   self (= id) = this is the origin map (admin's map)
--   other UUID = recipient's copy, points to the origin
--
-- Tables dropped: coteries, coteries_members
-- Tables renamed: coteries_invitations -> maps_invitations
--                 coteries_shares      -> maps_shares
--                 coteries_reviews     -> maps_reviews
-- Column added:   maps.origin_map_id
-- Column dropped: maps.source_coterie_id

-- =============================================================================
-- PHASE A: SCHEMA CHANGES + DATA MIGRATION
-- =============================================================================

-- A1. Add origin_map_id to maps
ALTER TABLE maps ADD COLUMN origin_map_id UUID REFERENCES maps(id) ON DELETE SET NULL;

CREATE INDEX idx_maps_origin ON maps(origin_map_id) WHERE origin_map_id IS NOT NULL;
CREATE INDEX idx_maps_origin_user ON maps(origin_map_id, user_id) WHERE origin_map_id IS NOT NULL;

-- A2. Populate origin_map_id from coterie data

-- Owner maps: origin_map_id = self (self-referential)
UPDATE maps SET origin_map_id = maps.id
FROM coteries c
WHERE maps.source_coterie_id = c.id
  AND maps.user_id = c.owner_id;

-- Recipient maps: origin_map_id = owner's map
UPDATE maps m SET origin_map_id = owner_map.id
FROM coteries c
JOIN maps owner_map ON owner_map.source_coterie_id = c.id
  AND owner_map.user_id = c.owner_id
WHERE m.source_coterie_id = c.id
  AND m.user_id != c.owner_id;

-- Ownerless coteries: pick earliest-joined member's map as origin
WITH ownerless_origins AS (
  SELECT DISTINCT ON (cm.coterie_id)
    cm.coterie_id,
    m.id AS origin_map_id
  FROM coteries c
  JOIN coteries_members cm ON cm.coterie_id = c.id
  JOIN maps m ON m.source_coterie_id = c.id AND m.user_id = cm.user_id
  WHERE c.owner_id IS NULL
  ORDER BY cm.coterie_id, cm.joined_at ASC
)
UPDATE maps SET origin_map_id = oo.origin_map_id
FROM ownerless_origins oo
WHERE maps.source_coterie_id = oo.coterie_id
  AND maps.origin_map_id IS NULL;

-- Make the chosen ownerless origins self-referential
UPDATE maps SET origin_map_id = maps.id
WHERE origin_map_id IS NOT NULL
  AND origin_map_id = maps.id;  -- already correct for owner maps; catches ownerless origins

-- A3. Migrate coteries_invitations -> maps_invitations

-- Must drop RLS policies before dropping coterie_id (policies reference it)
DROP POLICY IF EXISTS "coteries_invitations_read" ON coteries_invitations;
DROP POLICY IF EXISTS "coteries_invitations_insert" ON coteries_invitations;
DROP POLICY IF EXISTS "coteries_invitations_update" ON coteries_invitations;
DROP POLICY IF EXISTS "coteries_invitations_delete" ON coteries_invitations;

-- Add map_id column (will replace coterie_id)
ALTER TABLE coteries_invitations ADD COLUMN map_id UUID;

-- Populate: coterie_id -> origin map id
UPDATE coteries_invitations ci SET map_id = m.id
FROM maps m
WHERE m.source_coterie_id = ci.coterie_id
  AND m.origin_map_id = m.id;  -- origin map (self-referential)

-- Drop old constraints and column
ALTER TABLE coteries_invitations DROP CONSTRAINT IF EXISTS coteries_invitations_coterie_id_email_key;
ALTER TABLE coteries_invitations DROP CONSTRAINT IF EXISTS coteries_invitations_coterie_id_fkey;
ALTER TABLE coteries_invitations DROP COLUMN coterie_id;

-- Make map_id required and add new constraints
ALTER TABLE coteries_invitations ALTER COLUMN map_id SET NOT NULL;
ALTER TABLE coteries_invitations ADD CONSTRAINT maps_invitations_map_id_fkey
  FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE coteries_invitations ADD CONSTRAINT maps_invitations_map_id_email_key
  UNIQUE (map_id, email);

-- Rename table and indexes
ALTER TABLE coteries_invitations RENAME TO maps_invitations;
ALTER INDEX IF EXISTS idx_coteries_invitations_email RENAME TO idx_maps_invitations_email;
ALTER INDEX IF EXISTS idx_coteries_invitations_user RENAME TO idx_maps_invitations_user;
ALTER INDEX IF EXISTS idx_coteries_invitations_coterie RENAME TO idx_maps_invitations_map;

-- A4. Migrate coteries_shares -> maps_shares

-- Must drop RLS policies before dropping coterie_id
DROP POLICY IF EXISTS "coteries_shares_read_own" ON coteries_shares;
DROP POLICY IF EXISTS "coteries_shares_read_coterie" ON coteries_shares;
DROP POLICY IF EXISTS "coteries_shares_insert" ON coteries_shares;
DROP POLICY IF EXISTS "coteries_shares_delete" ON coteries_shares;

ALTER TABLE coteries_shares ADD COLUMN map_id UUID;

UPDATE coteries_shares cs SET map_id = m.id
FROM maps m
WHERE m.source_coterie_id = cs.coterie_id
  AND m.origin_map_id = m.id;

ALTER TABLE coteries_shares DROP CONSTRAINT IF EXISTS coteries_shares_coterie_id_user_id_object_id_key;
ALTER TABLE coteries_shares DROP CONSTRAINT IF EXISTS coteries_shares_coterie_id_fkey;
ALTER TABLE coteries_shares DROP COLUMN coterie_id;

ALTER TABLE coteries_shares ALTER COLUMN map_id SET NOT NULL;
ALTER TABLE coteries_shares ADD CONSTRAINT maps_shares_map_id_fkey
  FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE coteries_shares ADD CONSTRAINT maps_shares_map_id_user_id_object_id_key
  UNIQUE (map_id, user_id, object_id);

ALTER TABLE coteries_shares RENAME TO maps_shares;
ALTER INDEX IF EXISTS idx_coteries_shares_user RENAME TO idx_maps_shares_user;
ALTER INDEX IF EXISTS idx_coteries_shares_object RENAME TO idx_maps_shares_object;

-- A5. Rename coteries_reviews -> maps_reviews (no coterie_id column)
ALTER TABLE coteries_reviews RENAME TO maps_reviews;
ALTER INDEX IF EXISTS idx_coteries_reviews_user RENAME TO idx_maps_reviews_user;
ALTER INDEX IF EXISTS idx_coteries_reviews_source RENAME TO idx_maps_reviews_source;


-- =============================================================================
-- PHASE B: DROP OLD RLS POLICIES + FUNCTIONS
-- =============================================================================

-- B1. Drop remaining RLS policies that reference old coterie helper functions
-- (invitations and shares policies were already dropped in Phase A before column drops)

DROP POLICY IF EXISTS "coteries_reviews_read" ON maps_reviews;
DROP POLICY IF EXISTS "coteries_reviews_insert" ON maps_reviews;
DROP POLICY IF EXISTS "coteries_reviews_update" ON maps_reviews;
DROP POLICY IF EXISTS "coteries_reviews_delete" ON maps_reviews;

-- Drop override-read policies that reference is_shared_via_coterie
DROP POLICY IF EXISTS "objects_overrides_read_coterie" ON objects_overrides;
DROP POLICY IF EXISTS "objects_types_overrides_read_coterie" ON objects_types_overrides;
DROP POLICY IF EXISTS "connections_overrides_read_coterie" ON connections_overrides;

-- B2. Drop old helper functions (CASCADE drops dependent policies on coteries/coteries_members)
DROP FUNCTION IF EXISTS is_coterie_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_coterie_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_coterie_invitee(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_shared_via_coterie(UUID, UUID) CASCADE;

-- B3. Drop old RPC functions
DROP FUNCTION IF EXISTS create_coterie_with_map(UUID, TEXT, UUID, TEXT[]);
DROP FUNCTION IF EXISTS share_map_as_coterie(UUID, TEXT, UUID, TEXT[]);
DROP FUNCTION IF EXISTS accept_invitation_by_token(UUID, UUID);
DROP FUNCTION IF EXISTS accept_coterie_invitation(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS place_coterie_objects(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION, JSONB);
DROP FUNCTION IF EXISTS get_coterie_shared_intel(UUID, UUID);
DROP FUNCTION IF EXISTS get_dissonances(UUID);
DROP FUNCTION IF EXISTS get_invitation_by_token(UUID);


-- =============================================================================
-- PHASE C: DROP OLD TABLES
-- =============================================================================

-- Drop FK from maps to coteries
ALTER TABLE maps DROP CONSTRAINT IF EXISTS fk_maps_source_coterie;

-- Drop triggers before tables
DROP TRIGGER IF EXISTS coteries_updated_at ON coteries;
-- Note: coteries_invitations_updated_at trigger auto-renamed with table

-- Drop coterie tables (their remaining RLS policies cascade)
DROP TABLE IF EXISTS coteries_members CASCADE;
DROP TABLE IF EXISTS coteries CASCADE;

-- Drop the now-unused column
ALTER TABLE maps DROP COLUMN IF EXISTS source_coterie_id;

-- Drop the source_coterie index
DROP INDEX IF EXISTS idx_maps_source_coterie;


-- =============================================================================
-- PHASE D: NEW HELPER FUNCTIONS
-- =============================================================================

-- is_map_admin: checks if auth.uid() owns the origin map
CREATE OR REPLACE FUNCTION is_map_admin(p_origin_map_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM maps
    WHERE id = p_origin_map_id
    AND origin_map_id = id  -- self-referential = origin
    AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- is_map_member: checks if auth.uid() has any map in the sharing group
CREATE OR REPLACE FUNCTION is_map_member(p_origin_map_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM maps
    WHERE origin_map_id = p_origin_map_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- is_map_invitee: checks if auth.uid() has a pending invite on the origin map
CREATE OR REPLACE FUNCTION is_map_invitee(p_origin_map_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM maps_invitations
    WHERE map_id = p_origin_map_id
    AND email = (auth.jwt() ->> 'email')
    AND status = 'pending'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- is_shared_via_map: checks if object is in a shared map group containing both users
CREATE OR REPLACE FUNCTION is_shared_via_map(p_object_id UUID, p_target_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM maps m_me
    JOIN maps m_them ON m_them.origin_map_id = m_me.origin_map_id
    WHERE m_me.user_id = auth.uid()
    AND m_them.user_id = p_target_user_id
    AND m_me.user_id != m_them.user_id
    AND m_me.origin_map_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM maps m_any
      JOIN maps_objects mo ON mo.map_id = m_any.id
      WHERE m_any.origin_map_id = m_me.origin_map_id
      AND mo.object_ref_id = p_object_id
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- is_map_shared_with_user: rewrite to use origin_map_id
CREATE OR REPLACE FUNCTION is_map_shared_with_user(p_map_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM maps m
    JOIN maps peer ON peer.origin_map_id = m.origin_map_id
    WHERE m.id = p_map_id
    AND m.origin_map_id IS NOT NULL
    AND peer.user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_map_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_map_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_map_invitee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_shared_via_map(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_map_shared_with_user(UUID) TO authenticated;


-- =============================================================================
-- PHASE E: NEW RPC FUNCTIONS
-- =============================================================================

-- share_map: replaces create_coterie_with_map and share_map_as_coterie
CREATE OR REPLACE FUNCTION share_map(
  p_user_id UUID,
  p_map_id UUID,
  p_emails TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Set origin_map_id = self (makes this the origin)
  UPDATE public.maps SET origin_map_id = id
  WHERE id = p_map_id AND user_id = p_user_id;

  -- Create invitations
  IF array_length(p_emails, 1) > 0 THEN
    FOREACH v_email IN ARRAY p_emails LOOP
      INSERT INTO public.maps_invitations (map_id, invited_by, email)
      VALUES (p_map_id, p_user_id, v_email);
    END LOOP;
  END IF;

  RETURN p_map_id;
END;
$$;

GRANT EXECUTE ON FUNCTION share_map(UUID, UUID, TEXT[]) TO authenticated;


-- get_invitation_by_token: returns map info instead of coterie info
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invite_token UUID)
RETURNS TABLE(
  invitation_id UUID,
  map_id UUID,
  status TEXT,
  email TEXT,
  map_name TEXT,
  sender_name TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    mi.id,
    mi.map_id,
    mi.status::text,
    mi.email,
    m.name,
    p.display_name
  FROM maps_invitations mi
  JOIN maps m ON m.id = mi.map_id
  JOIN profiles p ON p.user_id = mi.invited_by
  WHERE mi.token = invite_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_invitation_by_token(UUID) TO authenticated, anon;


-- accept_map_invitation: replaces accept_coterie_invitation
CREATE OR REPLACE FUNCTION accept_map_invitation(
  p_user_id UUID,
  p_invitation_id UUID DEFAULT NULL,
  p_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_origin_map RECORD;
  v_new_map_id UUID;
  v_obj_ids UUID[];
  v_existing_ids UUID[];
  v_new_ids UUID[];
  v_sum_x DOUBLE PRECISION DEFAULT 0;
  v_sum_y DOUBLE PRECISION DEFAULT 0;
  v_pos_count INT DEFAULT 0;
  v_centroid_x DOUBLE PRECISION DEFAULT 0;
  v_centroid_y DOUBLE PRECISION DEFAULT 0;
  v_items JSONB;
  v_connections JSONB;
  v_rec RECORD;
  v_owner_id UUID;
BEGIN
  -- 1. Find and accept invitation
  IF p_invitation_id IS NOT NULL THEN
    UPDATE public.maps_invitations
    SET status = 'accepted', user_id = p_user_id, updated_at = NOW()
    WHERE id = p_invitation_id AND status = 'pending'
    RETURNING * INTO v_inv;
  ELSIF p_token IS NOT NULL THEN
    UPDATE public.maps_invitations
    SET status = 'accepted', user_id = p_user_id, updated_at = NOW()
    WHERE token = p_token AND status = 'pending'
    RETURNING * INTO v_inv;
  ELSE
    RAISE EXCEPTION 'Either p_invitation_id or p_token required';
  END IF;

  IF v_inv IS NULL THEN
    RETURN jsonb_build_object('error', 'Invitation not found or already accepted');
  END IF;

  -- 2. Get origin map info (map_id in invitation IS the origin map)
  SELECT id, name, user_id INTO v_origin_map
  FROM public.maps WHERE id = v_inv.map_id;

  v_owner_id := v_origin_map.user_id;

  -- 3. Collect ALL objects from all maps in the sharing group
  SELECT array_agg(DISTINCT mo.object_ref_id) INTO v_obj_ids
  FROM public.maps m
  JOIN public.maps_objects mo ON mo.map_id = m.id
  WHERE m.origin_map_id = v_inv.map_id;
  v_obj_ids := COALESCE(v_obj_ids, '{}'::UUID[]);

  -- 4. Create recipient map with ALL objects (origin_map_id -> origin)
  INSERT INTO public.maps (name, user_id, origin_map_id)
  VALUES (COALESCE(v_origin_map.name, 'Shared Map'), p_user_id, v_inv.map_id)
  RETURNING id INTO v_new_map_id;

  IF array_length(v_obj_ids, 1) > 0 THEN
    INSERT INTO public.maps_objects (map_id, object_ref_id)
    SELECT v_new_map_id, unnest(v_obj_ids);
  END IF;

  -- 5. Find objects user doesn't already have (for placement)
  SELECT array_agg(ov.object_id) INTO v_existing_ids
  FROM public.objects_overrides ov WHERE ov.user_id = p_user_id;
  v_existing_ids := COALESCE(v_existing_ids, '{}'::UUID[]);

  SELECT array_agg(oid) INTO v_new_ids
  FROM unnest(v_obj_ids) AS oid WHERE oid != ALL(v_existing_ids);
  v_new_ids := COALESCE(v_new_ids, '{}'::UUID[]);

  IF array_length(v_new_ids, 1) IS NULL OR array_length(v_new_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'origin_map_id', v_inv.map_id, 'map_name', v_origin_map.name,
      'map_id', v_new_map_id, 'owner_id', v_owner_id,
      'items', '[]'::JSONB, 'connections', '[]'::JSONB, 'new_object_ids', '[]'::JSONB
    );
  END IF;

  -- 6. Compute centroid from owner positions
  IF v_owner_id IS NOT NULL THEN
    FOR v_rec IN
      SELECT ov.map_x, ov.map_y FROM public.objects_overrides ov
      WHERE ov.user_id = v_owner_id AND ov.object_id = ANY(v_new_ids)
        AND ov.map_x IS NOT NULL AND ov.map_y IS NOT NULL
    LOOP
      v_sum_x := v_sum_x + v_rec.map_x;
      v_sum_y := v_sum_y + v_rec.map_y;
      v_pos_count := v_pos_count + 1;
    END LOOP;
    IF v_pos_count > 0 THEN
      v_centroid_x := v_sum_x / v_pos_count;
      v_centroid_y := v_sum_y / v_pos_count;
    END IF;
  END IF;

  -- 7. Build items array with relative positions + owner override data
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'objectId', o.id,
    'name', COALESCE(oo.name, o.name, 'Unknown'),
    'class', o.class,
    'relativeX', COALESCE(oo.map_x - v_centroid_x, 0),
    'relativeY', COALESCE(oo.map_y - v_centroid_y, 0),
    'owner_name', oo.name,
    'owner_title', oo.title,
    'owner_status', oo.status
  )), '[]'::JSONB) INTO v_items
  FROM unnest(v_new_ids) AS nid(id)
  JOIN public.objects o ON o.id = nid.id
  LEFT JOIN public.objects_overrides oo ON oo.user_id = v_owner_id AND oo.object_id = nid.id;

  -- 8. Build connections array
  SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId', sub.a_id, 'targetId', sub.b_id)), '[]'::JSONB) INTO v_connections
  FROM (
    SELECT c.object_a_id AS a_id, c.object_b_id AS b_id
    FROM public.connections c
    WHERE c.is_active = TRUE AND c.object_a_id = ANY(v_new_ids) AND c.object_b_id = ANY(v_new_ids)
    UNION ALL
    SELECT co.object_a_id, co.object_b_id
    FROM public.connections_overrides co
    WHERE co.user_id = v_owner_id AND co.connection_id IS NULL
      AND co.deactivated = FALSE
      AND co.object_a_id = ANY(v_new_ids) AND co.object_b_id = ANY(v_new_ids)
  ) sub;

  RETURN jsonb_build_object(
    'origin_map_id', v_inv.map_id, 'map_name', v_origin_map.name,
    'map_id', v_new_map_id, 'owner_id', v_owner_id,
    'items', v_items, 'connections', v_connections, 'new_object_ids', to_jsonb(v_new_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_map_invitation(UUID, UUID, UUID) TO authenticated;


-- place_shared_objects: replaces place_coterie_objects
CREATE OR REPLACE FUNCTION place_shared_objects(
  p_user_id UUID,
  p_origin_map_id UUID,
  p_anchor_x DOUBLE PRECISION,
  p_anchor_y DOUBLE PRECISION,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_owner_id UUID;
  v_new_ids UUID[];
BEGIN
  -- Get owner from origin map (self-referential map = origin)
  SELECT user_id INTO v_owner_id
  FROM public.maps
  WHERE id = p_origin_map_id AND origin_map_id = id;

  SELECT array_agg((elem->>'objectId')::UUID) INTO v_new_ids
  FROM jsonb_array_elements(p_items) AS elem;

  -- 1. Create overrides with anchor-relative positions + owner data
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.objects_overrides (user_id, object_id, map_x, map_y, name, title, status)
    VALUES (
      p_user_id,
      (v_item->>'objectId')::UUID,
      p_anchor_x + (v_item->>'relativeX')::DOUBLE PRECISION,
      p_anchor_y + (v_item->>'relativeY')::DOUBLE PRECISION,
      NULLIF(v_item->>'owner_name', 'null'),
      NULLIF(v_item->>'owner_title', 'null'),
      NULLIF(v_item->>'owner_status', 'null')
    )
    ON CONFLICT (user_id, object_id) DO NOTHING;
  END LOOP;

  -- 2. Copy owner's user-created connections between new objects
  IF v_owner_id IS NOT NULL AND array_length(v_new_ids, 1) > 0 THEN
    INSERT INTO public.connections_overrides (user_id, object_a_id, object_b_id, role_a, role_b, deactivated)
    SELECT p_user_id, co.object_a_id, co.object_b_id, co.role_a, co.role_b, FALSE
    FROM public.connections_overrides co
    WHERE co.user_id = v_owner_id AND co.connection_id IS NULL AND co.deactivated = FALSE
      AND co.object_a_id = ANY(v_new_ids) AND co.object_b_id = ANY(v_new_ids);
  END IF;

  -- 3. Copy owner's type overrides
  IF v_owner_id IS NOT NULL AND array_length(v_new_ids, 1) > 0 THEN
    INSERT INTO public.objects_types_overrides (user_id, object_id, type_id, is_primary)
    SELECT p_user_id, oto.object_id, oto.type_id, oto.is_primary
    FROM public.objects_types_overrides oto
    WHERE oto.user_id = v_owner_id AND oto.object_id = ANY(v_new_ids)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION place_shared_objects(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION, JSONB) TO authenticated;


-- get_dissonances: rewritten to use origin_map_id instead of coteries
CREATE OR REPLACE FUNCTION get_dissonances(p_user_id UUID)
RETURNS TABLE (
    dissonance_type TEXT,
    origin_map_id UUID,
    map_name TEXT,
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
    WITH user_shared_maps AS (
        -- All sharing groups this user belongs to (join to origin for canonical name)
        SELECT DISTINCT m.origin_map_id, origin.name AS map_name
        FROM maps m
        JOIN maps origin ON origin.id = m.origin_map_id AND origin.origin_map_id = origin.id
        WHERE m.user_id = p_user_id AND m.origin_map_id IS NOT NULL
    ),
    co_members AS (
        -- All other members in those sharing groups
        SELECT usm.origin_map_id, usm.map_name, peer.user_id AS member_id, p.display_name AS member_name
        FROM user_shared_maps usm
        JOIN maps peer ON peer.origin_map_id = usm.origin_map_id
        JOIN profiles p ON p.user_id = peer.user_id
        WHERE peer.user_id != p_user_id
    ),
    shared_objects AS (
        -- All objects in any map in the sharing groups
        SELECT DISTINCT m.origin_map_id, mo.object_ref_id AS object_id
        FROM maps m
        JOIN maps_objects mo ON mo.map_id = m.id
        WHERE m.origin_map_id IS NOT NULL
        AND m.origin_map_id IN (SELECT origin_map_id FROM user_shared_maps)
    ),
    my_object_ids AS (
        SELECT object_id FROM objects_overrides WHERE user_id = p_user_id
    )

    -- 1. NEW OBJECTS
    SELECT DISTINCT ON (com.origin_map_id, com.member_id, so.object_id)
        'new_object'::TEXT,
        com.origin_map_id, com.map_name, com.member_id, com.member_name,
        so.object_id,
        COALESCE(m_ov.name, o.name)::TEXT,
        o.class::TEXT,
        NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'object_override'::TEXT,
        m_ov.id,
        EXISTS(
            SELECT 1 FROM maps_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.origin_map_id = com.origin_map_id
    JOIN objects o ON o.id = so.object_id AND o.is_active = TRUE
    JOIN objects_overrides m_ov ON m_ov.user_id = com.member_id AND m_ov.object_id = so.object_id
    WHERE so.object_id NOT IN (SELECT object_id FROM my_object_ids)
    AND o.class IN (SELECT id FROM classes WHERE landscape_visible = TRUE)

    UNION ALL

    -- 2. NEW CONNECTIONS
    SELECT DISTINCT ON (com.origin_map_id, com.member_id, m_co.id)
        'new_connection'::TEXT,
        com.origin_map_id, com.map_name, com.member_id, com.member_name,
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
            SELECT 1 FROM maps_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'connection_override' AND cr.ref_id = m_co.id
        )
    FROM co_members com
    JOIN connections_overrides m_co ON m_co.user_id = com.member_id
        AND m_co.connection_id IS NULL
        AND m_co.deactivated = FALSE
    JOIN shared_objects so_a ON so_a.origin_map_id = com.origin_map_id AND so_a.object_id = m_co.object_a_id
    JOIN shared_objects so_b ON so_b.origin_map_id = com.origin_map_id AND so_b.object_id = m_co.object_b_id
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
    SELECT DISTINCT ON (com.origin_map_id, com.member_id, c.id)
        'deactivated_connection'::TEXT,
        com.origin_map_id, com.map_name, com.member_id, com.member_name,
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
            SELECT 1 FROM maps_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'connection_override' AND cr.ref_id = m_deact.id
        )
    FROM co_members com
    JOIN connections_overrides m_deact ON m_deact.user_id = com.member_id
        AND m_deact.connection_id IS NOT NULL
        AND m_deact.deactivated = TRUE
    JOIN connections c ON c.id = m_deact.connection_id AND c.is_active = TRUE
    JOIN shared_objects so_a ON so_a.origin_map_id = com.origin_map_id AND so_a.object_id = c.object_a_id
    JOIN shared_objects so_b ON so_b.origin_map_id = com.origin_map_id AND so_b.object_id = c.object_b_id
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
    SELECT DISTINCT ON (com.origin_map_id, com.member_id, so.object_id)
        'career_move'::TEXT,
        com.origin_map_id, com.map_name, com.member_id, com.member_name,
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
            SELECT 1 FROM maps_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.origin_map_id = com.origin_map_id
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
    SELECT DISTINCT ON (com.origin_map_id, com.member_id, so.object_id)
        'type_change'::TEXT,
        com.origin_map_id, com.map_name, com.member_id, com.member_name,
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
            SELECT 1 FROM maps_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.origin_map_id = com.origin_map_id
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

GRANT EXECUTE ON FUNCTION get_dissonances(UUID) TO authenticated;


-- get_shared_intel: replaces get_coterie_shared_intel
CREATE OR REPLACE FUNCTION get_shared_intel(p_user_id UUID, p_object_id UUID)
RETURNS TABLE(
  peer_user_id UUID,
  peer_display_name TEXT,
  origin_map_id UUID,
  share_type TEXT,
  shared_object_id UUID,
  object_class TEXT,
  name TEXT,
  title TEXT,
  status TEXT,
  event_date DATE,
  contacts JSONB
) AS $$
  WITH my_shared_maps AS (
    SELECT DISTINCT m.origin_map_id
    FROM maps m
    WHERE m.user_id = p_user_id AND m.origin_map_id IS NOT NULL
  ),
  contact_results AS (
    SELECT
      ms.user_id AS peer_user_id,
      pr.display_name AS peer_display_name,
      ms.map_id AS origin_map_id,
      ms.share_type,
      ms.object_id AS shared_object_id,
      NULL::TEXT AS object_class,
      NULL::TEXT AS name,
      NULL::TEXT AS title,
      NULL::TEXT AS status,
      NULL::DATE AS event_date,
      ov.data->'contacts' AS contacts
    FROM maps_shares ms
    JOIN my_shared_maps msm ON msm.origin_map_id = ms.map_id
    JOIN objects_overrides ov ON ov.object_id = ms.object_id AND ov.user_id = ms.user_id
    JOIN profiles pr ON pr.user_id = ms.user_id
    WHERE ms.user_id != p_user_id
      AND ms.object_id = p_object_id
      AND ms.share_type = 'contacts'
  ),
  item_shares AS (
    SELECT
      ms.user_id AS peer_user_id,
      pr.display_name AS peer_display_name,
      ms.map_id AS origin_map_id,
      ms.share_type,
      ms.object_id AS shared_object_id,
      o.class AS object_class,
      COALESCE(ov.name, o.name) AS name,
      COALESCE(ov.title, o.title) AS title,
      COALESCE(ov.status, o.status) AS status,
      COALESCE(ov.event_date, o.event_date) AS event_date,
      NULL::JSONB AS contacts
    FROM maps_shares ms
    JOIN my_shared_maps msm ON msm.origin_map_id = ms.map_id
    JOIN objects_overrides ov ON ov.object_id = ms.object_id AND ov.user_id = ms.user_id
    JOIN objects o ON o.id = ms.object_id AND o.class IN ('project', 'event')
    JOIN profiles pr ON pr.user_id = ms.user_id
    WHERE ms.user_id != p_user_id
      AND ms.share_type IN ('project', 'event')
      AND EXISTS (
        SELECT 1 FROM connections_overrides co
        WHERE co.user_id = ms.user_id
          AND co.connection_id IS NULL
          AND ((co.object_a_id = p_object_id AND co.object_b_id = ms.object_id)
            OR (co.object_a_id = ms.object_id AND co.object_b_id = p_object_id))
      )
  )
  SELECT * FROM contact_results
  UNION ALL
  SELECT * FROM item_shares;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_shared_intel(UUID, UUID) TO authenticated;


-- =============================================================================
-- PHASE F: NEW RLS POLICIES
-- =============================================================================

-- F1. maps_invitations policies
ALTER TABLE maps_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maps_invitations_read"
  ON maps_invitations FOR SELECT
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR is_map_admin(map_id)
    OR is_map_member(map_id)
  );

CREATE POLICY "maps_invitations_insert"
  ON maps_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND is_map_member(map_id)
  );

CREATE POLICY "maps_invitations_update"
  ON maps_invitations FOR UPDATE
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR is_map_admin(map_id)
  );

CREATE POLICY "maps_invitations_delete"
  ON maps_invitations FOR DELETE
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR is_map_admin(map_id)
  );


-- F2. maps_shares policies
ALTER TABLE maps_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maps_shares_read_own"
  ON maps_shares FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "maps_shares_read_shared"
  ON maps_shares FOR SELECT
  TO authenticated
  USING (user_id != auth.uid() AND is_map_member(map_id));

CREATE POLICY "maps_shares_insert"
  ON maps_shares FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_map_member(map_id));

CREATE POLICY "maps_shares_delete"
  ON maps_shares FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- F3. maps_reviews policies
ALTER TABLE maps_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maps_reviews_read"
  ON maps_reviews FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "maps_reviews_insert"
  ON maps_reviews FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "maps_reviews_update"
  ON maps_reviews FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "maps_reviews_delete"
  ON maps_reviews FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- F4. Override read policies (shared intel between map group members)
CREATE POLICY "objects_overrides_read_shared"
  ON objects_overrides FOR SELECT
  TO authenticated
  USING (user_id != auth.uid() AND is_shared_via_map(object_id, user_id));

CREATE POLICY "objects_types_overrides_read_shared"
  ON objects_types_overrides FOR SELECT
  TO authenticated
  USING (user_id != auth.uid() AND is_shared_via_map(object_id, user_id));

CREATE POLICY "connections_overrides_read_shared"
  ON connections_overrides FOR SELECT
  TO authenticated
  USING (
    user_id != auth.uid()
    AND (
      (connection_id IS NULL AND object_a_id IS NOT NULL AND object_b_id IS NOT NULL
       AND is_shared_via_map(object_a_id, user_id)
       AND is_shared_via_map(object_b_id, user_id))
      OR
      (connection_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM connections c
        WHERE c.id = connection_id
        AND (is_shared_via_map(c.object_a_id, user_id)
          OR is_shared_via_map(c.object_b_id, user_id))
      ))
    )
  );


-- F5. maps_read policy: already uses is_map_shared_with_user() which was rewritten above.
-- The policy itself doesn't need changing -- just the helper was rewritten.
-- But let's also allow invitees to see the map name:
DROP POLICY IF EXISTS "maps_read" ON maps;

CREATE POLICY "maps_read"
  ON maps FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_published = true
    OR is_map_shared_with_user(id)
    OR is_map_invitee(origin_map_id)
  );


-- =============================================================================
-- PHASE G: TRIGGER CLEANUP
-- =============================================================================

-- The coteries_invitations_updated_at trigger was auto-renamed with the table.
-- Drop it and recreate with correct name.
DROP TRIGGER IF EXISTS coteries_invitations_updated_at ON maps_invitations;

CREATE TRIGGER maps_invitations_updated_at
    BEFORE UPDATE ON maps_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
