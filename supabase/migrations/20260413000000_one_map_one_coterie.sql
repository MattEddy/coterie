-- One Map, One Coterie
--
-- Simplify the coterie-map relationship from N:M (via coteries_maps join table)
-- to 1:1 (via source_coterie_id on maps). Every member's coterie-linked map has
-- source_coterie_id set — including the owner's. Any member can add objects to
-- their coterie-linked map, and those additions surface as dissonances.
--
-- Changes:
--   1. Drop coteries_maps table (and its RLS policies cascade with it)
--   2. Update is_map_shared_with_user() to use source_coterie_id
--   3. Replace create_coterie_with_maps (UUID[]) with create_coterie_with_map (UUID)
--   4. Update share_map_as_coterie wrapper
--   5. Update accept_coterie_invitation to query maps by source_coterie_id
--   6. Update get_dissonances shared_objects CTE

-- =============================================================================
-- 0. Fix coteries_read — allow invited (non-member) users to see coterie name
-- =============================================================================

-- SECURITY DEFINER helper to avoid RLS recursion (coteries → coteries_invitations → coteries)
CREATE OR REPLACE FUNCTION is_coterie_invitee(p_coterie_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM coteries_invitations ci
    WHERE ci.coterie_id = p_coterie_id
    AND ci.email = (auth.jwt() ->> 'email')
    AND ci.status = 'pending'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_coterie_invitee(UUID) TO authenticated;

DROP POLICY IF EXISTS "coteries_read" ON coteries;

CREATE POLICY "coteries_read"
  ON coteries FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR is_coterie_member(id)
    OR is_coterie_invitee(id)
  );

-- =============================================================================
-- 1. Update is_shared_via_coterie() — remove coteries_maps reference
-- =============================================================================
CREATE OR REPLACE FUNCTION is_shared_via_coterie(p_object_id UUID, p_target_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM coteries_members cm_me
    JOIN coteries_members cm_them ON cm_them.coterie_id = cm_me.coterie_id
    JOIN coteries c ON c.id = cm_me.coterie_id AND c.is_active = TRUE
    JOIN maps m ON m.source_coterie_id = cm_me.coterie_id
    JOIN maps_objects mo ON mo.map_id = m.id
    WHERE cm_me.user_id = auth.uid()
    AND cm_them.user_id = p_target_user_id
    AND cm_me.user_id != cm_them.user_id
    AND mo.object_ref_id = p_object_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 2. Drop coteries_maps (RLS policies drop with CASCADE)
-- =============================================================================
DROP TABLE IF EXISTS coteries_maps CASCADE;

-- =============================================================================
-- 2. Update is_map_shared_with_user() — now checks source_coterie_id
-- =============================================================================
CREATE OR REPLACE FUNCTION is_map_shared_with_user(p_map_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM maps m
    JOIN coteries_members cmem ON cmem.coterie_id = m.source_coterie_id
    WHERE m.id = p_map_id
    AND cmem.user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 3. Replace create_coterie_with_maps → create_coterie_with_map
-- =============================================================================
-- Drop old function (signature changed: UUID[] → UUID)
DROP FUNCTION IF EXISTS create_coterie_with_maps(UUID, TEXT, UUID[], TEXT[]);

CREATE OR REPLACE FUNCTION create_coterie_with_map(
  p_user_id UUID,
  p_name TEXT,
  p_map_id UUID,
  p_emails TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coterie_id UUID;
  v_email TEXT;
BEGIN
  INSERT INTO public.coteries (name, owner_id)
  VALUES (trim(p_name), p_user_id)
  RETURNING id INTO v_coterie_id;

  INSERT INTO public.coteries_members (coterie_id, user_id, role)
  VALUES (v_coterie_id, p_user_id, 'owner');

  -- Link the map to this coterie
  UPDATE public.maps SET source_coterie_id = v_coterie_id
  WHERE id = p_map_id AND user_id = p_user_id;

  IF array_length(p_emails, 1) > 0 THEN
    FOREACH v_email IN ARRAY p_emails LOOP
      INSERT INTO public.coteries_invitations (coterie_id, invited_by, email)
      VALUES (v_coterie_id, p_user_id, v_email);
    END LOOP;
  END IF;

  RETURN v_coterie_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_coterie_with_map(UUID, TEXT, UUID, TEXT[]) TO authenticated;

-- =============================================================================
-- 4. Update share_map_as_coterie (now calls create_coterie_with_map)
-- =============================================================================
CREATE OR REPLACE FUNCTION share_map_as_coterie(
  p_user_id UUID,
  p_name TEXT,
  p_map_id UUID,
  p_emails TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_coterie_with_map(p_user_id, p_name, p_map_id, p_emails);
END;
$$;

-- =============================================================================
-- 5. Update accept_coterie_invitation — query by source_coterie_id, add ALL objects
-- =============================================================================
CREATE OR REPLACE FUNCTION accept_coterie_invitation(
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
  v_coterie RECORD;
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
BEGIN
  -- 1. Find and accept invitation
  IF p_invitation_id IS NOT NULL THEN
    UPDATE public.coteries_invitations
    SET status = 'accepted', user_id = p_user_id, updated_at = NOW()
    WHERE id = p_invitation_id AND status = 'pending'
    RETURNING * INTO v_inv;
  ELSIF p_token IS NOT NULL THEN
    UPDATE public.coteries_invitations
    SET status = 'accepted', user_id = p_user_id, updated_at = NOW()
    WHERE token = p_token AND status = 'pending'
    RETURNING * INTO v_inv;
  ELSE
    RAISE EXCEPTION 'Either p_invitation_id or p_token required';
  END IF;

  IF v_inv IS NULL THEN
    RETURN jsonb_build_object('error', 'Invitation not found or already accepted');
  END IF;

  -- 2. Add user as member
  INSERT INTO public.coteries_members (coterie_id, user_id, role)
  VALUES (v_inv.coterie_id, p_user_id, 'member')
  ON CONFLICT DO NOTHING;

  -- 3. Get coterie info
  SELECT name, owner_id INTO v_coterie
  FROM public.coteries WHERE id = v_inv.coterie_id;

  -- 4. Collect ALL objects from coterie-linked maps (via source_coterie_id)
  SELECT array_agg(DISTINCT mo.object_ref_id) INTO v_obj_ids
  FROM public.maps m
  JOIN public.maps_objects mo ON mo.map_id = m.id
  WHERE m.source_coterie_id = v_inv.coterie_id;
  v_obj_ids := COALESCE(v_obj_ids, '{}'::UUID[]);

  -- 5. Create recipient map with ALL objects
  INSERT INTO public.maps (name, user_id, source_coterie_id)
  VALUES (COALESCE(v_coterie.name, 'Shared Map'), p_user_id, v_inv.coterie_id)
  RETURNING id INTO v_new_map_id;

  IF array_length(v_obj_ids, 1) > 0 THEN
    INSERT INTO public.maps_objects (map_id, object_ref_id)
    SELECT v_new_map_id, unnest(v_obj_ids);
  END IF;

  -- 6. Find objects user doesn't already have (for placement)
  SELECT array_agg(ov.object_id) INTO v_existing_ids
  FROM public.objects_overrides ov WHERE ov.user_id = p_user_id;
  v_existing_ids := COALESCE(v_existing_ids, '{}'::UUID[]);

  SELECT array_agg(oid) INTO v_new_ids
  FROM unnest(v_obj_ids) AS oid WHERE oid != ALL(v_existing_ids);
  v_new_ids := COALESCE(v_new_ids, '{}'::UUID[]);

  IF array_length(v_new_ids, 1) IS NULL OR array_length(v_new_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'coterie_id', v_inv.coterie_id, 'coterie_name', v_coterie.name,
      'map_id', v_new_map_id, 'owner_id', v_coterie.owner_id,
      'items', '[]'::JSONB, 'connections', '[]'::JSONB, 'new_object_ids', '[]'::JSONB
    );
  END IF;

  -- 7. Compute centroid from owner positions
  IF v_coterie.owner_id IS NOT NULL THEN
    FOR v_rec IN
      SELECT ov.map_x, ov.map_y FROM public.objects_overrides ov
      WHERE ov.user_id = v_coterie.owner_id AND ov.object_id = ANY(v_new_ids)
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

  -- 8. Build items array with relative positions + owner override data
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
  LEFT JOIN public.objects_overrides oo ON oo.user_id = v_coterie.owner_id AND oo.object_id = nid.id;

  -- 9. Build connections array
  SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId', sub.a_id, 'targetId', sub.b_id)), '[]'::JSONB) INTO v_connections
  FROM (
    SELECT c.object_a_id AS a_id, c.object_b_id AS b_id
    FROM public.connections c
    WHERE c.is_active = TRUE AND c.object_a_id = ANY(v_new_ids) AND c.object_b_id = ANY(v_new_ids)
    UNION ALL
    SELECT co.object_a_id, co.object_b_id
    FROM public.connections_overrides co
    WHERE co.user_id = v_coterie.owner_id AND co.connection_id IS NULL
      AND co.deactivated = FALSE
      AND co.object_a_id = ANY(v_new_ids) AND co.object_b_id = ANY(v_new_ids)
  ) sub;

  RETURN jsonb_build_object(
    'coterie_id', v_inv.coterie_id, 'coterie_name', v_coterie.name,
    'map_id', v_new_map_id, 'owner_id', v_coterie.owner_id,
    'items', v_items, 'connections', v_connections, 'new_object_ids', to_jsonb(v_new_ids)
  );
END;
$$;

-- =============================================================================
-- 6. Update get_dissonances — simplified shared_objects CTE
-- =============================================================================
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
        SELECT DISTINCT m.source_coterie_id AS coterie_id, mo.object_ref_id AS object_id
        FROM maps m
        JOIN maps_objects mo ON mo.map_id = m.id
        WHERE m.source_coterie_id IS NOT NULL
        AND m.source_coterie_id IN (SELECT coterie_id FROM user_coteries)
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
