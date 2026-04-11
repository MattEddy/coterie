-- Consolidate multi-step frontend operations into server-side RPCs.
-- Every future client (iPad, etc.) gets these for free.

-- =============================================================================
-- RPC 1: create_note
-- =============================================================================
CREATE OR REPLACE FUNCTION create_note(
  p_user_id UUID,
  p_parent_id UUID,
  p_text TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id UUID;
BEGIN
  INSERT INTO public.objects (class, is_canon, created_by)
  VALUES ('note', FALSE, p_user_id)
  RETURNING id INTO v_note_id;

  INSERT INTO public.objects_overrides (user_id, object_id, name)
  VALUES (p_user_id, v_note_id, trim(p_text));

  INSERT INTO public.connections_overrides (user_id, object_a_id, object_b_id)
  VALUES (p_user_id, p_parent_id, v_note_id);

  RETURN v_note_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_note(UUID, UUID, TEXT) TO authenticated;

-- =============================================================================
-- RPC 2: create_connected_item
-- =============================================================================
CREATE OR REPLACE FUNCTION create_connected_item(
  p_user_id UUID,
  p_parent_id UUID,
  p_class TEXT,
  p_name TEXT,
  p_title TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_event_date DATE DEFAULT NULL,
  p_types TEXT[] DEFAULT '{}',
  p_link_ids UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obj_id UUID;
  v_link_id UUID;
BEGIN
  -- Skeleton object
  INSERT INTO public.objects (class, is_canon, created_by)
  VALUES (p_class, FALSE, p_user_id)
  RETURNING id INTO v_obj_id;

  -- Override with all user data
  INSERT INTO public.objects_overrides (user_id, object_id, name, title, status, event_date)
  VALUES (
    p_user_id, v_obj_id,
    trim(p_name),
    CASE WHEN trim(COALESCE(p_title, '')) = '' THEN NULL ELSE trim(p_title) END,
    CASE WHEN trim(COALESCE(p_status, '')) = '' THEN NULL ELSE trim(p_status) END,
    CASE WHEN p_class = 'event' THEN p_event_date ELSE NULL END
  );

  -- Resolve type display_names → UUIDs and insert
  IF array_length(p_types, 1) > 0 THEN
    INSERT INTO public.objects_types_overrides (user_id, object_id, type_id)
    SELECT p_user_id, v_obj_id, t.id
    FROM public.types t
    WHERE t.display_name = ANY(p_types) AND t.class = p_class;
  END IF;

  -- Connect to parent
  INSERT INTO public.connections_overrides (user_id, object_a_id, object_b_id)
  VALUES (p_user_id, p_parent_id, v_obj_id);

  -- Additional link connections
  IF array_length(p_link_ids, 1) > 0 THEN
    FOREACH v_link_id IN ARRAY p_link_ids LOOP
      INSERT INTO public.connections_overrides (user_id, object_a_id, object_b_id)
      VALUES (p_user_id, v_link_id, v_obj_id);
    END LOOP;
  END IF;

  RETURN v_obj_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_connected_item(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT[], UUID[]) TO authenticated;

-- =============================================================================
-- RPC 3: delete_object_with_cleanup
-- =============================================================================
CREATE OR REPLACE FUNCTION delete_object_with_cleanup(
  p_user_id UUID,
  p_object_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_canon BOOLEAN;
  v_created_by UUID;
  v_conn RECORD;
  v_orphan_id UUID;
  v_orphan_candidates UUID[];
  v_remaining BIGINT;
BEGIN
  -- Get object info
  SELECT is_canon, created_by INTO v_is_canon, v_created_by
  FROM public.objects WHERE id = p_object_id;

  -- 1. Delete override (removes from landscape)
  DELETE FROM public.objects_overrides
  WHERE object_id = p_object_id AND user_id = p_user_id;

  -- 2. Hard-delete if user-created and non-canonical
  IF NOT v_is_canon AND v_created_by = p_user_id THEN
    DELETE FROM public.objects WHERE id = p_object_id;
  END IF;

  -- 3. Collect orphan candidates BEFORE deleting connections
  SELECT array_agg(DISTINCT other_id) INTO v_orphan_candidates
  FROM (
    SELECT CASE WHEN c.object_a_id = p_object_id THEN c.object_b_id ELSE c.object_a_id END AS other_id
    FROM public.connections c
    WHERE c.is_active = TRUE AND (c.object_a_id = p_object_id OR c.object_b_id = p_object_id)
    UNION
    SELECT CASE WHEN co.object_a_id = p_object_id THEN co.object_b_id ELSE co.object_a_id END
    FROM public.connections_overrides co
    WHERE co.user_id = p_user_id AND co.connection_id IS NULL
      AND (co.object_a_id = p_object_id OR co.object_b_id = p_object_id)
  ) sub;

  v_orphan_candidates := COALESCE(v_orphan_candidates, '{}'::UUID[]);

  -- 4. Delete user-created connections involving this object
  DELETE FROM public.connections_overrides
  WHERE user_id = p_user_id
    AND (object_a_id = p_object_id OR object_b_id = p_object_id);

  -- 5. Deactivate canonical connections
  FOR v_conn IN
    SELECT c.id, c.object_a_id, c.object_b_id
    FROM public.connections c
    WHERE c.is_active = TRUE
      AND (c.object_a_id = p_object_id OR c.object_b_id = p_object_id)
  LOOP
    INSERT INTO public.connections_overrides (user_id, connection_id, object_a_id, object_b_id, deactivated)
    VALUES (p_user_id, v_conn.id, v_conn.object_a_id, v_conn.object_b_id, TRUE)
    ON CONFLICT (user_id, connection_id)
    DO UPDATE SET deactivated = TRUE;
  END LOOP;

  -- 6. Clean up orphaned off-landscape objects
  IF array_length(v_orphan_candidates, 1) > 0 THEN
    FOREACH v_orphan_id IN ARRAY v_orphan_candidates LOOP
      -- Active canonical connections (not deactivated by user, not involving deleted object)
      SELECT COUNT(*) INTO v_remaining
      FROM public.connections c
      WHERE c.is_active = TRUE
        AND (c.object_a_id = v_orphan_id OR c.object_b_id = v_orphan_id)
        AND c.object_a_id != p_object_id AND c.object_b_id != p_object_id
        AND NOT EXISTS (
          SELECT 1 FROM public.connections_overrides co2
          WHERE co2.user_id = p_user_id AND co2.connection_id = c.id AND co2.deactivated = TRUE
        );

      -- Plus user-created connections (not involving deleted object)
      v_remaining := v_remaining + (
        SELECT COUNT(*) FROM public.connections_overrides co
        WHERE co.user_id = p_user_id AND co.connection_id IS NULL
          AND (co.object_a_id = v_orphan_id OR co.object_b_id = v_orphan_id)
          AND co.object_a_id != p_object_id AND co.object_b_id != p_object_id
      );

      IF v_remaining = 0 THEN
        DELETE FROM public.objects_overrides
        WHERE object_id = v_orphan_id AND user_id = p_user_id;

        DELETE FROM public.objects_types_overrides
        WHERE object_id = v_orphan_id AND user_id = p_user_id;

        DELETE FROM public.objects
        WHERE id = v_orphan_id AND is_canon = FALSE AND created_by = p_user_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_object_with_cleanup(UUID, UUID) TO authenticated;

-- =============================================================================
-- RPC 4: delete_connected_item
-- =============================================================================
CREATE OR REPLACE FUNCTION delete_connected_item(
  p_user_id UUID,
  p_parent_id UUID,
  p_item_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conn RECORD;
  v_active_canon BIGINT;
  v_remaining_user BIGINT;
  v_is_canon BOOLEAN;
  v_created_by UUID;
BEGIN
  -- 1. Deactivate canonical connections between parent and item
  FOR v_conn IN
    SELECT c.id FROM public.connections c
    WHERE c.is_active = TRUE
      AND ((c.object_a_id = p_parent_id AND c.object_b_id = p_item_id)
        OR (c.object_a_id = p_item_id AND c.object_b_id = p_parent_id))
  LOOP
    INSERT INTO public.connections_overrides (user_id, connection_id, deactivated)
    VALUES (p_user_id, v_conn.id, TRUE)
    ON CONFLICT (user_id, connection_id)
    DO UPDATE SET deactivated = TRUE;
  END LOOP;

  -- 2. Delete user-created connections between parent and item
  DELETE FROM public.connections_overrides
  WHERE user_id = p_user_id AND connection_id IS NULL
    AND ((object_a_id = p_parent_id AND object_b_id = p_item_id)
      OR (object_a_id = p_item_id AND object_b_id = p_parent_id));

  -- 3. Count remaining connections for the item
  SELECT COUNT(*) INTO v_active_canon
  FROM public.connections c
  WHERE c.is_active = TRUE
    AND (c.object_a_id = p_item_id OR c.object_b_id = p_item_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.connections_overrides co
      WHERE co.user_id = p_user_id AND co.connection_id = c.id AND co.deactivated = TRUE
    );

  SELECT COUNT(*) INTO v_remaining_user
  FROM public.connections_overrides co
  WHERE co.user_id = p_user_id AND co.connection_id IS NULL
    AND (co.object_a_id = p_item_id OR co.object_b_id = p_item_id);

  -- 4. If orphaned, clean up
  IF (v_active_canon + v_remaining_user) <= 0 THEN
    DELETE FROM public.objects_overrides
    WHERE object_id = p_item_id AND user_id = p_user_id;

    DELETE FROM public.objects_types_overrides
    WHERE object_id = p_item_id AND user_id = p_user_id;

    SELECT is_canon, created_by INTO v_is_canon, v_created_by
    FROM public.objects WHERE id = p_item_id;

    IF NOT v_is_canon AND v_created_by = p_user_id THEN
      DELETE FROM public.objects WHERE id = p_item_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_connected_item(UUID, UUID, UUID) TO authenticated;

-- =============================================================================
-- RPC 5: delete_multiple_objects
-- =============================================================================
CREATE OR REPLACE FUNCTION delete_multiple_objects(
  p_user_id UUID,
  p_object_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_conn RECORD;
BEGIN
  -- 1. Delete all overrides
  DELETE FROM public.objects_overrides
  WHERE user_id = p_user_id AND object_id = ANY(p_object_ids);

  -- 2. Delete user-created connections
  DELETE FROM public.connections_overrides
  WHERE user_id = p_user_id AND connection_id IS NULL
    AND (object_a_id = ANY(p_object_ids) OR object_b_id = ANY(p_object_ids));

  -- 3. Deactivate canonical connections
  FOR v_conn IN
    SELECT c.id, c.object_a_id, c.object_b_id
    FROM public.connections c
    WHERE c.is_active = TRUE
      AND (c.object_a_id = ANY(p_object_ids) OR c.object_b_id = ANY(p_object_ids))
  LOOP
    INSERT INTO public.connections_overrides (user_id, connection_id, object_a_id, object_b_id, deactivated)
    VALUES (p_user_id, v_conn.id, v_conn.object_a_id, v_conn.object_b_id, TRUE)
    ON CONFLICT (user_id, connection_id)
    DO UPDATE SET deactivated = TRUE;
  END LOOP;

  -- 4. Hard-delete user-created objects
  DELETE FROM public.objects
  WHERE id = ANY(p_object_ids) AND is_canon = FALSE AND created_by = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_multiple_objects(UUID, UUID[]) TO authenticated;

-- =============================================================================
-- RPC 6: create_coterie_with_maps
-- =============================================================================
CREATE OR REPLACE FUNCTION create_coterie_with_maps(
  p_user_id UUID,
  p_name TEXT,
  p_map_ids UUID[],
  p_emails TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coterie_id UUID;
  v_map_id UUID;
  v_email TEXT;
BEGIN
  INSERT INTO public.coteries (name, owner_id)
  VALUES (trim(p_name), p_user_id)
  RETURNING id INTO v_coterie_id;

  INSERT INTO public.coteries_members (coterie_id, user_id, role)
  VALUES (v_coterie_id, p_user_id, 'owner');

  IF array_length(p_map_ids, 1) > 0 THEN
    FOREACH v_map_id IN ARRAY p_map_ids LOOP
      INSERT INTO public.coteries_maps (coterie_id, map_id)
      VALUES (v_coterie_id, v_map_id);
    END LOOP;
  END IF;

  IF array_length(p_emails, 1) > 0 THEN
    FOREACH v_email IN ARRAY p_emails LOOP
      INSERT INTO public.coteries_invitations (coterie_id, invited_by, email)
      VALUES (v_coterie_id, p_user_id, v_email);
    END LOOP;
  END IF;

  RETURN v_coterie_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_coterie_with_maps(UUID, TEXT, UUID[], TEXT[]) TO authenticated;

-- =============================================================================
-- RPC 7: share_map_as_coterie (convenience wrapper)
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
  RETURN public.create_coterie_with_maps(p_user_id, p_name, ARRAY[p_map_id], p_emails);
END;
$$;

GRANT EXECUTE ON FUNCTION share_map_as_coterie(UUID, TEXT, UUID, TEXT[]) TO authenticated;

-- =============================================================================
-- RPC 8a: accept_coterie_invitation (accept + prepare placement data)
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

  -- 4. Collect all objects from coterie maps
  SELECT array_agg(DISTINCT mo.object_ref_id) INTO v_obj_ids
  FROM public.coteries_maps cm
  JOIN public.maps_objects mo ON mo.map_id = cm.map_id
  WHERE cm.coterie_id = v_inv.coterie_id;
  v_obj_ids := COALESCE(v_obj_ids, '{}'::UUID[]);

  -- 5. Create recipient map
  INSERT INTO public.maps (name, user_id, source_coterie_id)
  VALUES (COALESCE(v_coterie.name, 'Shared Map'), p_user_id, v_inv.coterie_id)
  RETURNING id INTO v_new_map_id;

  IF array_length(v_obj_ids, 1) > 0 THEN
    INSERT INTO public.maps_objects (map_id, object_ref_id)
    SELECT v_new_map_id, unnest(v_obj_ids);
  END IF;

  -- 6. Find objects user doesn't already have
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

GRANT EXECUTE ON FUNCTION accept_coterie_invitation(UUID, UUID, UUID) TO authenticated;

-- =============================================================================
-- RPC 8b: place_coterie_objects (finalize placement at anchor point)
-- =============================================================================
CREATE OR REPLACE FUNCTION place_coterie_objects(
  p_user_id UUID,
  p_coterie_id UUID,
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
  SELECT owner_id INTO v_owner_id FROM public.coteries WHERE id = p_coterie_id;

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

GRANT EXECUTE ON FUNCTION place_coterie_objects(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION, JSONB) TO authenticated;

-- =============================================================================
-- RPC 9: save_item_with_types
-- =============================================================================
CREATE OR REPLACE FUNCTION save_item_with_types(
  p_user_id UUID,
  p_object_id UUID,
  p_class TEXT,
  p_name TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_event_date DATE DEFAULT NULL,
  p_types TEXT[] DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert override
  INSERT INTO public.objects_overrides (user_id, object_id, name, title, status, event_date)
  VALUES (
    p_user_id, p_object_id,
    CASE WHEN trim(COALESCE(p_name, '')) = '' THEN NULL ELSE trim(p_name) END,
    CASE WHEN trim(COALESCE(p_title, '')) = '' THEN NULL ELSE trim(p_title) END,
    CASE WHEN trim(COALESCE(p_status, '')) = '' THEN NULL ELSE trim(p_status) END,
    CASE WHEN p_class = 'event' THEN p_event_date ELSE NULL END
  )
  ON CONFLICT (user_id, object_id)
  DO UPDATE SET
    name = CASE WHEN trim(COALESCE(p_name, '')) = '' THEN NULL ELSE trim(p_name) END,
    title = CASE WHEN trim(COALESCE(p_title, '')) = '' THEN NULL ELSE trim(p_title) END,
    status = CASE WHEN trim(COALESCE(p_status, '')) = '' THEN NULL ELSE trim(p_status) END,
    event_date = CASE WHEN p_class = 'event' THEN p_event_date ELSE public.objects_overrides.event_date END;

  -- Replace type overrides
  DELETE FROM public.objects_types_overrides
  WHERE object_id = p_object_id AND user_id = p_user_id;

  IF array_length(p_types, 1) > 0 THEN
    INSERT INTO public.objects_types_overrides (user_id, object_id, type_id)
    SELECT p_user_id, p_object_id, t.id
    FROM public.types t
    WHERE t.display_name = ANY(p_types) AND t.class = p_class;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION save_item_with_types(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT[]) TO authenticated;

-- =============================================================================
-- RPC 10: link_existing_item
-- =============================================================================
CREATE OR REPLACE FUNCTION link_existing_item(
  p_user_id UUID,
  p_parent_id UUID,
  p_item_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.connections_overrides (user_id, object_a_id, object_b_id)
  VALUES (p_user_id, p_parent_id, p_item_id);

  INSERT INTO public.objects_overrides (user_id, object_id)
  VALUES (p_user_id, p_item_id)
  ON CONFLICT (user_id, object_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION link_existing_item(UUID, UUID, UUID) TO authenticated;

-- =============================================================================
-- RPC 11: create_map_with_objects
-- =============================================================================
CREATE OR REPLACE FUNCTION create_map_with_objects(
  p_user_id UUID,
  p_name TEXT,
  p_object_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_map_id UUID;
BEGIN
  INSERT INTO public.maps (name, user_id)
  VALUES (trim(p_name), p_user_id)
  RETURNING id INTO v_map_id;

  IF array_length(p_object_ids, 1) > 0 THEN
    INSERT INTO public.maps_objects (map_id, object_ref_id)
    SELECT v_map_id, unnest(p_object_ids);
  END IF;

  RETURN v_map_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_map_with_objects(UUID, TEXT, UUID[]) TO authenticated;
