-- Fix: remove ON CONFLICT (display_name) from role creation — roles table has no unique constraint on display_name

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
