-- Fix: delete_object_with_cleanup and delete_multiple_objects weren't cleaning up
-- maps_objects rows for canonical objects. The FK CASCADE only fires on hard-delete
-- of the objects row, which doesn't happen for canonical objects.

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

  -- 2. Remove from user's maps
  DELETE FROM public.maps_objects
  WHERE object_ref_id = p_object_id
    AND map_id IN (SELECT id FROM public.maps WHERE user_id = p_user_id);

  -- 3. Hard-delete if user-created and non-canonical
  IF NOT v_is_canon AND v_created_by = p_user_id THEN
    DELETE FROM public.objects WHERE id = p_object_id;
  END IF;

  -- 4. Collect orphan candidates BEFORE deleting connections
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

  -- 5. Delete user-created connections involving this object
  DELETE FROM public.connections_overrides
  WHERE user_id = p_user_id
    AND (object_a_id = p_object_id OR object_b_id = p_object_id);

  -- 6. Deactivate canonical connections
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

  -- 7. Clean up orphaned off-landscape objects
  IF array_length(v_orphan_candidates, 1) > 0 THEN
    FOREACH v_orphan_id IN ARRAY v_orphan_candidates LOOP
      SELECT COUNT(*) INTO v_remaining
      FROM public.connections c
      WHERE c.is_active = TRUE
        AND (c.object_a_id = v_orphan_id OR c.object_b_id = v_orphan_id)
        AND c.object_a_id != p_object_id AND c.object_b_id != p_object_id
        AND NOT EXISTS (
          SELECT 1 FROM public.connections_overrides co2
          WHERE co2.user_id = p_user_id AND co2.connection_id = c.id AND co2.deactivated = TRUE
        );

      v_remaining := v_remaining + (
        SELECT COUNT(*) FROM public.connections_overrides co
        WHERE co.user_id = p_user_id AND co.connection_id IS NULL
          AND (co.object_a_id = v_orphan_id OR co.object_b_id = v_orphan_id)
          AND co.object_a_id != p_object_id AND co.object_b_id != p_object_id
      );

      IF v_remaining = 0 THEN
        DELETE FROM public.objects_overrides
        WHERE object_id = v_orphan_id AND user_id = p_user_id;

        DELETE FROM public.maps_objects
        WHERE object_ref_id = v_orphan_id
          AND map_id IN (SELECT id FROM public.maps WHERE user_id = p_user_id);

        DELETE FROM public.objects_types_overrides
        WHERE object_id = v_orphan_id AND user_id = p_user_id;

        DELETE FROM public.objects
        WHERE id = v_orphan_id AND is_canon = FALSE AND created_by = p_user_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;


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

  -- 2. Remove from user's maps
  DELETE FROM public.maps_objects
  WHERE object_ref_id = ANY(p_object_ids)
    AND map_id IN (SELECT id FROM public.maps WHERE user_id = p_user_id);

  -- 3. Delete user-created connections
  DELETE FROM public.connections_overrides
  WHERE user_id = p_user_id AND connection_id IS NULL
    AND (object_a_id = ANY(p_object_ids) OR object_b_id = ANY(p_object_ids));

  -- 4. Deactivate canonical connections
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

  -- 5. Hard-delete user-created objects
  DELETE FROM public.objects
  WHERE id = ANY(p_object_ids) AND is_canon = FALSE AND created_by = p_user_id;
END;
$$;
