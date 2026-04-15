-- Move multi-step frontend operations into server-side RPCs.
-- Reduces round trips, adds transaction safety, and gives future clients (iPad, etc.) these for free.

-- =============================================================================
-- RPC: create_object
-- Atomic object creation: skeleton row + override + auto-add to maps
-- Replaces 3+ sequential queries in Canvas.tsx handleCreateObject
-- =============================================================================
CREATE OR REPLACE FUNCTION create_object(
  p_user_id UUID,
  p_class TEXT,
  p_name TEXT,
  p_map_x DOUBLE PRECISION,
  p_map_y DOUBLE PRECISION
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obj_id UUID;
BEGIN
  -- 1. Skeleton objects row
  INSERT INTO public.objects (class, is_canon, created_by)
  VALUES (p_class, FALSE, p_user_id)
  RETURNING id INTO v_obj_id;

  -- 2. Override with name + position
  INSERT INTO public.objects_overrides (user_id, object_id, name, map_x, map_y)
  VALUES (p_user_id, v_obj_id, trim(p_name), p_map_x, p_map_y);

  -- 3. Auto-add to maps with auto_add enabled
  INSERT INTO public.maps_objects (map_id, object_ref_id)
  SELECT m.id, v_obj_id
  FROM public.maps m
  WHERE m.user_id = p_user_id AND m.auto_add = TRUE;

  RETURN v_obj_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_object(UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- =============================================================================
-- RPC: upsert_connection
-- Role resolution + connection upsert in one call
-- Replaces 4-6 queries in Canvas.tsx handleConnectSubmit + resolveRoleId
-- =============================================================================
CREATE OR REPLACE FUNCTION upsert_connection(
  p_user_id UUID,
  p_object_a_id UUID,
  p_object_b_id UUID,
  p_role_a_name TEXT DEFAULT NULL,
  p_role_b_name TEXT DEFAULT NULL,
  p_editing_connection_id UUID DEFAULT NULL,
  p_is_user_created BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_a UUID;
  v_role_b UUID;
  v_existing_override_id UUID;
BEGIN
  -- Resolve role_a: lookup by display_name, create if not found (min 2 chars)
  IF p_role_a_name IS NOT NULL AND trim(p_role_a_name) != '' THEN
    SELECT id INTO v_role_a FROM public.roles WHERE display_name = trim(p_role_a_name) LIMIT 1;
    IF v_role_a IS NULL AND length(trim(p_role_a_name)) >= 2 THEN
      INSERT INTO public.roles (display_name, is_canon, created_by)
      VALUES (trim(p_role_a_name), FALSE, p_user_id)
      RETURNING id INTO v_role_a;
    END IF;
  END IF;

  -- Resolve role_b
  IF p_role_b_name IS NOT NULL AND trim(p_role_b_name) != '' THEN
    SELECT id INTO v_role_b FROM public.roles WHERE display_name = trim(p_role_b_name) LIMIT 1;
    IF v_role_b IS NULL AND length(trim(p_role_b_name)) >= 2 THEN
      INSERT INTO public.roles (display_name, is_canon, created_by)
      VALUES (trim(p_role_b_name), FALSE, p_user_id)
      RETURNING id INTO v_role_b;
    END IF;
  END IF;

  IF p_editing_connection_id IS NOT NULL THEN
    -- Editing existing connection
    IF p_is_user_created THEN
      UPDATE public.connections_overrides
      SET role_a = v_role_a, role_b = v_role_b
      WHERE id = p_editing_connection_id;
    ELSE
      -- Canonical connection — upsert override
      INSERT INTO public.connections_overrides (user_id, connection_id, object_a_id, object_b_id, role_a, role_b)
      VALUES (p_user_id, p_editing_connection_id, p_object_a_id, p_object_b_id, v_role_a, v_role_b)
      ON CONFLICT (user_id, connection_id)
      DO UPDATE SET role_a = v_role_a, role_b = v_role_b;
    END IF;
  ELSE
    -- Creating new connection
    INSERT INTO public.connections_overrides (user_id, object_a_id, object_b_id, role_a, role_b)
    VALUES (p_user_id, p_object_a_id, p_object_b_id, v_role_a, v_role_b);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_connection(UUID, UUID, UUID, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;

-- =============================================================================
-- RPC: get_user_maps
-- Single query replacing N+1 count queries in MapsFrame.tsx loadMaps
-- =============================================================================
CREATE OR REPLACE FUNCTION get_user_maps(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  auto_add BOOLEAN,
  origin_map_id UUID,
  object_count BIGINT,
  member_count BIGINT,
  is_admin BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name,
    m.description,
    m.auto_add,
    m.origin_map_id,
    (SELECT COUNT(*) FROM public.maps_objects mo WHERE mo.map_id = m.id) AS object_count,
    CASE WHEN m.origin_map_id IS NOT NULL THEN
      (SELECT COUNT(*) FROM public.maps m2 WHERE m2.origin_map_id = m.origin_map_id)
    ELSE 0 END AS member_count,
    (m.origin_map_id = m.id) AS is_admin
  FROM public.maps m
  WHERE m.user_id = p_user_id
  ORDER BY m.name;
$$;

GRANT EXECUTE ON FUNCTION get_user_maps(UUID) TO authenticated;

-- =============================================================================
-- RPC: get_pending_invites
-- 3-table join replacing sequential queries in MapsFrame.tsx loadPendingInvites
-- =============================================================================
CREATE OR REPLACE FUNCTION get_pending_invites(p_email TEXT)
RETURNS TABLE(
  id UUID,
  map_id UUID,
  map_name TEXT,
  sender_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mi.id,
    mi.map_id,
    COALESCE(m.name, 'Shared Map') AS map_name,
    COALESCE(p.display_name, 'Someone') AS sender_name,
    mi.created_at
  FROM public.maps_invitations mi
  JOIN public.maps m ON m.id = mi.map_id
  JOIN public.profiles p ON p.user_id = mi.invited_by
  WHERE mi.email = p_email AND mi.status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION get_pending_invites(TEXT) TO authenticated;

-- =============================================================================
-- RPC: get_connected_items
-- Graph traversal + override merge replacing 6 queries in DetailPanel.tsx
-- =============================================================================
CREATE OR REPLACE FUNCTION get_connected_items(
  p_user_id UUID,
  p_object_id UUID,
  p_class TEXT
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  title TEXT,
  status TEXT,
  event_date DATE,
  types TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH effective_connections AS (
    -- Canonical connections (not deactivated by user)
    SELECT c.object_a_id, c.object_b_id
    FROM public.connections c
    WHERE c.is_active = TRUE
      AND (c.object_a_id = p_object_id OR c.object_b_id = p_object_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.connections_overrides co
        WHERE co.user_id = p_user_id AND co.connection_id = c.id AND co.deactivated = TRUE
      )
    UNION ALL
    -- User-created connections
    SELECT co.object_a_id, co.object_b_id
    FROM public.connections_overrides co
    WHERE co.user_id = p_user_id AND co.connection_id IS NULL
      AND (co.object_a_id = p_object_id OR co.object_b_id = p_object_id)
  ),
  related_ids AS (
    SELECT DISTINCT
      CASE WHEN ec.object_a_id = p_object_id THEN ec.object_b_id ELSE ec.object_a_id END AS other_id
    FROM effective_connections ec
  )
  SELECT
    o.id,
    COALESCE(ov.name, o.name, '(unnamed)') AS name,
    COALESCE(ov.title, o.title) AS title,
    COALESCE(ov.status, o.status) AS status,
    COALESCE(ov.event_date, o.event_date) AS event_date,
    COALESCE(
      ARRAY(
        SELECT t.display_name FROM public.objects_types_overrides oto
        JOIN public.types t ON t.id = oto.type_id
        WHERE oto.user_id = p_user_id AND oto.object_id = o.id
      ),
      '{}'::TEXT[]
    ) AS types
  FROM related_ids r
  JOIN public.objects o ON o.id = r.other_id AND o.class = p_class
  LEFT JOIN public.objects_overrides ov ON ov.object_id = o.id AND ov.user_id = p_user_id
  ORDER BY
    CASE p_class
      WHEN 'event' THEN NULL  -- handled below
      WHEN 'note' THEN NULL   -- handled below
      ELSE COALESCE(ov.name, o.name, '')
    END ASC,
    CASE WHEN p_class = 'event' THEN COALESCE(ov.event_date, o.event_date) ELSE NULL END DESC,
    CASE WHEN p_class = 'note' THEN o.created_at ELSE NULL END DESC;
$$;

GRANT EXECUTE ON FUNCTION get_connected_items(UUID, UUID, TEXT) TO authenticated;

-- =============================================================================
-- RPC: preflight_delete_object
-- Orphan detection in a single query, replacing O(N) loop in DetailPanel.tsx
-- =============================================================================
CREATE OR REPLACE FUNCTION preflight_delete_object(
  p_user_id UUID,
  p_object_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_connections INT;
  v_orphaned_projects INT DEFAULT 0;
  v_orphaned_events INT DEFAULT 0;
  v_related RECORD;
BEGIN
  -- Get all effective connections for this object
  -- Count only those where the other endpoint is on the user's landscape
  SELECT COUNT(*) INTO v_total_connections
  FROM (
    SELECT c.id,
      CASE WHEN c.object_a_id = p_object_id THEN c.object_b_id ELSE c.object_a_id END AS other_id
    FROM public.connections c
    WHERE c.is_active = TRUE
      AND (c.object_a_id = p_object_id OR c.object_b_id = p_object_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.connections_overrides co
        WHERE co.user_id = p_user_id AND co.connection_id = c.id AND co.deactivated = TRUE
      )
    UNION ALL
    SELECT co.id,
      CASE WHEN co.object_a_id = p_object_id THEN co.object_b_id ELSE co.object_a_id END
    FROM public.connections_overrides co
    WHERE co.user_id = p_user_id AND co.connection_id IS NULL
      AND (co.object_a_id = p_object_id OR co.object_b_id = p_object_id)
  ) sub
  WHERE EXISTS (
    SELECT 1 FROM public.objects_overrides ov
    WHERE ov.user_id = p_user_id AND ov.object_id = sub.other_id
  );

  -- Check orphans: related objects that would have zero connections after deletion
  FOR v_related IN
    SELECT DISTINCT
      CASE WHEN ec.object_a_id = p_object_id THEN ec.object_b_id ELSE ec.object_a_id END AS other_id
    FROM (
      SELECT c.object_a_id, c.object_b_id
      FROM public.connections c
      WHERE c.is_active = TRUE
        AND (c.object_a_id = p_object_id OR c.object_b_id = p_object_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.connections_overrides co
          WHERE co.user_id = p_user_id AND co.connection_id = c.id AND co.deactivated = TRUE
        )
      UNION ALL
      SELECT co.object_a_id, co.object_b_id
      FROM public.connections_overrides co
      WHERE co.user_id = p_user_id AND co.connection_id IS NULL
        AND (co.object_a_id = p_object_id OR co.object_b_id = p_object_id)
    ) ec
  LOOP
    -- Count remaining connections for this related object (excluding the one being deleted)
    DECLARE
      v_remaining BIGINT;
      v_class TEXT;
    BEGIN
      SELECT o.class INTO v_class FROM public.objects o WHERE o.id = v_related.other_id;
      IF v_class NOT IN ('project', 'event') THEN CONTINUE; END IF;

      -- Canonical connections (not deactivated, not involving deleted object)
      SELECT COUNT(*) INTO v_remaining
      FROM public.connections c
      WHERE c.is_active = TRUE
        AND (c.object_a_id = v_related.other_id OR c.object_b_id = v_related.other_id)
        AND c.object_a_id != p_object_id AND c.object_b_id != p_object_id
        AND NOT EXISTS (
          SELECT 1 FROM public.connections_overrides co2
          WHERE co2.user_id = p_user_id AND co2.connection_id = c.id AND co2.deactivated = TRUE
        );

      -- Plus user-created connections (not involving deleted object)
      v_remaining := v_remaining + (
        SELECT COUNT(*) FROM public.connections_overrides co
        WHERE co.user_id = p_user_id AND co.connection_id IS NULL
          AND (co.object_a_id = v_related.other_id OR co.object_b_id = v_related.other_id)
          AND co.object_a_id != p_object_id AND co.object_b_id != p_object_id
      );

      IF v_remaining = 0 THEN
        IF v_class = 'project' THEN v_orphaned_projects := v_orphaned_projects + 1;
        ELSIF v_class = 'event' THEN v_orphaned_events := v_orphaned_events + 1;
        END IF;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'connections', v_total_connections,
    'orphanedProjects', v_orphaned_projects,
    'orphanedEvents', v_orphaned_events
  );
END;
$$;

GRANT EXECUTE ON FUNCTION preflight_delete_object(UUID, UUID) TO authenticated;

-- =============================================================================
-- RPC: set_object_types
-- Delete + resolve + insert in one call
-- Replaces 3-query pattern in DetailPanel.tsx saveTypes and UpdatesFrame accept
-- =============================================================================
CREATE OR REPLACE FUNCTION set_object_types(
  p_user_id UUID,
  p_object_id UUID,
  p_class TEXT,
  p_type_names TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.objects_types_overrides
  WHERE user_id = p_user_id AND object_id = p_object_id;

  IF array_length(p_type_names, 1) > 0 THEN
    INSERT INTO public.objects_types_overrides (user_id, object_id, type_id)
    SELECT p_user_id, p_object_id, t.id
    FROM public.types t
    WHERE t.display_name = ANY(p_type_names) AND t.class = p_class;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_object_types(UUID, UUID, TEXT, TEXT[]) TO authenticated;

-- =============================================================================
-- RPC: accept_dissonance
-- Handles all dissonance acceptance types in one call
-- Replaces multi-query patterns in UpdatesFrame.tsx handleAccept
-- =============================================================================
CREATE OR REPLACE FUNCTION accept_dissonance(
  p_user_id UUID,
  p_dissonance_type TEXT,
  p_ref_id UUID,
  p_object_id UUID DEFAULT NULL,
  p_origin_map_id UUID DEFAULT NULL,
  p_map_x DOUBLE PRECISION DEFAULT NULL,
  p_map_y DOUBLE PRECISION DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_ov RECORD;
  v_member_conn RECORD;
  v_connection_id UUID;
  v_user_map_id UUID;
BEGIN
  CASE p_dissonance_type

  WHEN 'new_object' THEN
    -- Copy member's override data for this object
    SELECT name, title, status, event_date, data
    INTO v_member_ov
    FROM public.objects_overrides WHERE id = p_ref_id;

    IF v_member_ov IS NULL THEN RETURN; END IF;

    INSERT INTO public.objects_overrides (user_id, object_id, name, title, status, map_x, map_y, event_date, data)
    VALUES (p_user_id, p_object_id, v_member_ov.name, v_member_ov.title, v_member_ov.status,
            COALESCE(p_map_x, 0), COALESCE(p_map_y, 0), v_member_ov.event_date, v_member_ov.data)
    ON CONFLICT (user_id, object_id) DO NOTHING;

    -- Add to user's map in this sharing group
    SELECT m.id INTO v_user_map_id
    FROM public.maps m
    WHERE m.user_id = p_user_id AND m.origin_map_id = p_origin_map_id
    LIMIT 1;

    IF v_user_map_id IS NOT NULL AND p_object_id IS NOT NULL THEN
      INSERT INTO public.maps_objects (map_id, object_ref_id)
      VALUES (v_user_map_id, p_object_id)
      ON CONFLICT DO NOTHING;
    END IF;

  WHEN 'new_connection' THEN
    SELECT object_a_id, object_b_id, role_a, role_b, data
    INTO v_member_conn
    FROM public.connections_overrides WHERE id = p_ref_id;

    IF v_member_conn IS NULL THEN RETURN; END IF;

    INSERT INTO public.connections_overrides (user_id, object_a_id, object_b_id, role_a, role_b, data)
    VALUES (p_user_id, v_member_conn.object_a_id, v_member_conn.object_b_id,
            v_member_conn.role_a, v_member_conn.role_b, v_member_conn.data);

  WHEN 'deactivated_connection' THEN
    SELECT connection_id INTO v_connection_id
    FROM public.connections_overrides WHERE id = p_ref_id;

    IF v_connection_id IS NULL THEN RETURN; END IF;

    INSERT INTO public.connections_overrides (user_id, connection_id, deactivated)
    VALUES (p_user_id, v_connection_id, TRUE)
    ON CONFLICT (user_id, connection_id)
    DO UPDATE SET deactivated = TRUE;

  WHEN 'career_move' THEN
    -- p_ref_id is the member's override row; read their values
    SELECT name, title, status INTO v_member_ov
    FROM public.objects_overrides WHERE id = p_ref_id;

    IF v_member_ov IS NOT NULL AND p_object_id IS NOT NULL THEN
      UPDATE public.objects_overrides
      SET name = COALESCE(v_member_ov.name, name),
          title = COALESCE(v_member_ov.title, title),
          status = COALESCE(v_member_ov.status, status)
      WHERE user_id = p_user_id AND object_id = p_object_id;
    END IF;

  WHEN 'type_change' THEN
    -- p_ref_id = member's override row; copy their type overrides
    IF p_object_id IS NULL THEN RETURN; END IF;

    DECLARE
      v_member_user_id UUID;
      v_object_class TEXT;
    BEGIN
      SELECT user_id INTO v_member_user_id FROM public.objects_overrides WHERE id = p_ref_id;
      SELECT class INTO v_object_class FROM public.objects WHERE id = p_object_id;

      DELETE FROM public.objects_types_overrides
      WHERE user_id = p_user_id AND object_id = p_object_id;

      INSERT INTO public.objects_types_overrides (user_id, object_id, type_id)
      SELECT p_user_id, p_object_id, oto.type_id
      FROM public.objects_types_overrides oto
      WHERE oto.user_id = v_member_user_id AND oto.object_id = p_object_id;
    END;

  ELSE
    RAISE EXCEPTION 'Unknown dissonance type: %', p_dissonance_type;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_dissonance(UUID, TEXT, UUID, UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- =============================================================================
-- RPC: leave_shared_map
-- Safe leave with guard against admin leaving + cleanup
-- Replaces direct UPDATE in MapsFrame.tsx handleLeaveMap
-- =============================================================================
CREATE OR REPLACE FUNCTION leave_shared_map(
  p_user_id UUID,
  p_map_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_map RECORD;
BEGIN
  SELECT id, origin_map_id INTO v_map
  FROM public.maps WHERE id = p_map_id AND user_id = p_user_id;

  IF v_map IS NULL THEN
    RAISE EXCEPTION 'Map not found';
  END IF;

  IF v_map.origin_map_id IS NULL THEN
    RAISE EXCEPTION 'Map is not shared';
  END IF;

  -- Prevent admin (origin map owner) from leaving — they should delete/disband instead
  IF v_map.origin_map_id = v_map.id THEN
    RAISE EXCEPTION 'Admin cannot leave their own shared map. Delete the map instead.';
  END IF;

  -- Clean up: remove shares, reviews, and objects for this map
  DELETE FROM public.maps_shares WHERE map_id = v_map.origin_map_id AND user_id = p_user_id;
  DELETE FROM public.maps_reviews WHERE user_id = p_user_id
    AND source_user_id IN (
      SELECT m.user_id FROM public.maps m WHERE m.origin_map_id = v_map.origin_map_id
    );
  DELETE FROM public.maps_objects WHERE map_id = p_map_id;

  -- Disconnect from sharing group
  UPDATE public.maps SET origin_map_id = NULL WHERE id = p_map_id;
END;
$$;

GRANT EXECUTE ON FUNCTION leave_shared_map(UUID, UUID) TO authenticated;

-- =============================================================================
-- RPC: get_share_picker_state
-- Single query replacing 3 queries in SharePicker.tsx load
-- =============================================================================
CREATE OR REPLACE FUNCTION get_share_picker_state(
  p_user_id UUID,
  p_object_id UUID,
  p_share_type TEXT
)
RETURNS TABLE(
  origin_map_id UUID,
  map_name TEXT,
  shared BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_shared_maps AS (
    SELECT DISTINCT m.origin_map_id
    FROM public.maps m
    WHERE m.user_id = p_user_id AND m.origin_map_id IS NOT NULL
  )
  SELECT
    usm.origin_map_id,
    COALESCE(om.name, 'Unknown') AS map_name,
    EXISTS (
      SELECT 1 FROM public.maps_shares ms
      WHERE ms.map_id = usm.origin_map_id
        AND ms.user_id = p_user_id
        AND ms.object_id = p_object_id
        AND ms.share_type = p_share_type
    ) AS shared
  FROM user_shared_maps usm
  JOIN public.maps om ON om.id = usm.origin_map_id;
$$;

GRANT EXECUTE ON FUNCTION get_share_picker_state(UUID, UUID, TEXT) TO authenticated;

-- =============================================================================
-- RPC: deactivate_connection
-- Single upsert replacing check-then-insert in Canvas.tsx handleConnectDelete
-- =============================================================================
CREATE OR REPLACE FUNCTION deactivate_connection(
  p_user_id UUID,
  p_connection_id UUID,
  p_object_a_id UUID,
  p_object_b_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.connections_overrides (user_id, connection_id, object_a_id, object_b_id, deactivated)
  VALUES (p_user_id, p_connection_id, p_object_a_id, p_object_b_id, TRUE)
  ON CONFLICT (user_id, connection_id)
  DO UPDATE SET deactivated = TRUE;
$$;

GRANT EXECUTE ON FUNCTION deactivate_connection(UUID, UUID, UUID, UUID) TO authenticated;
