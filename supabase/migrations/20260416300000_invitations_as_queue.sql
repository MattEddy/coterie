-- Invitations as a work queue: rows exist only while pending.
-- Accept = delete. Decline = delete. No status column needed.

-- 1. Clean up non-pending rows (accepted/declined are historical noise)
DELETE FROM public.maps_invitations WHERE status != 'pending';

-- 2. Drop the status column + its CHECK constraint
ALTER TABLE public.maps_invitations DROP COLUMN status;

-- 3. Rewrite share_map — simple INSERT, no ON CONFLICT needed
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
  UPDATE public.maps SET origin_map_id = id
  WHERE id = p_map_id AND user_id = p_user_id;

  IF array_length(p_emails, 1) > 0 THEN
    FOREACH v_email IN ARRAY p_emails LOOP
      INSERT INTO public.maps_invitations (map_id, invited_by, email)
      VALUES (p_map_id, p_user_id, v_email);
    END LOOP;
  END IF;

  RETURN p_map_id;
END;
$$;

-- 4. Rewrite get_invitation_by_token — no status filter or return field
DROP FUNCTION IF EXISTS public.get_invitation_by_token(UUID);
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invite_token UUID)
RETURNS TABLE(
  invitation_id UUID,
  map_id UUID,
  email TEXT,
  map_name TEXT,
  sender_name TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    mi.id,
    mi.map_id,
    mi.email,
    m.name,
    p.display_name
  FROM maps_invitations mi
  JOIN maps m ON m.id = mi.map_id
  JOIN profiles p ON p.user_id = mi.invited_by
  WHERE mi.token = invite_token
  LIMIT 1;
$$;

-- 5. Rewrite accept_map_invitation — DELETE instead of UPDATE
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
  -- 1. Find and delete invitation (accept = remove from queue)
  IF p_invitation_id IS NOT NULL THEN
    DELETE FROM public.maps_invitations
    WHERE id = p_invitation_id
    RETURNING * INTO v_inv;
  ELSIF p_token IS NOT NULL THEN
    DELETE FROM public.maps_invitations
    WHERE token = p_token
    RETURNING * INTO v_inv;
  ELSE
    RAISE EXCEPTION 'Either p_invitation_id or p_token required';
  END IF;

  IF v_inv IS NULL THEN
    RETURN jsonb_build_object('error', 'Invitation not found or already accepted');
  END IF;

  -- 2. Get origin map info
  SELECT id, name, user_id INTO v_origin_map
  FROM public.maps WHERE id = v_inv.map_id;

  v_owner_id := v_origin_map.user_id;

  -- 3. Collect ALL objects from all maps in the sharing group
  SELECT array_agg(DISTINCT mo.object_ref_id) INTO v_obj_ids
  FROM public.maps m
  JOIN public.maps_objects mo ON mo.map_id = m.id
  WHERE m.origin_map_id = v_inv.map_id;
  v_obj_ids := COALESCE(v_obj_ids, '{}'::UUID[]);

  -- 4. Create recipient map
  INSERT INTO public.maps (name, user_id, origin_map_id)
  VALUES (COALESCE(v_origin_map.name, 'Shared Map'), p_user_id, v_inv.map_id)
  RETURNING id INTO v_new_map_id;

  IF array_length(v_obj_ids, 1) > 0 THEN
    INSERT INTO public.maps_objects (map_id, object_ref_id)
    SELECT v_new_map_id, unnest(v_obj_ids);
  END IF;

  -- 5. Find objects user doesn't already have
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

-- 6. Rewrite get_pending_invites — no status filter
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
  WHERE mi.email = p_email;
$$;

-- 7. Rewrite is_map_invitee — no status filter
CREATE OR REPLACE FUNCTION is_map_invitee(p_origin_map_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM maps_invitations
    WHERE map_id = p_origin_map_id
    AND email = (auth.jwt() ->> 'email')
  );
$$;
