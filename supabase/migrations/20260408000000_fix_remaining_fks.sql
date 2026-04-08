-- Fix remaining FK constraints that default to NO ACTION.
-- Uses dynamic constraint lookup (names may differ between local and cloud).

-- Helper: drop FK on a specific column, then re-add with desired behavior
DO $$
DECLARE r RECORD;
BEGIN

  -- ============================================================
  -- connections.role_a → roles(id) ON DELETE SET NULL
  -- connections.role_b → roles(id) ON DELETE SET NULL
  -- ============================================================
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.connections'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.connections'::regclass AND attname = 'role_a')
  LOOP
    EXECUTE format('ALTER TABLE connections DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE connections ADD CONSTRAINT connections_role_a_fkey FOREIGN KEY (role_a) REFERENCES roles(id) ON DELETE SET NULL;

  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.connections'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.connections'::regclass AND attname = 'role_b')
  LOOP
    EXECUTE format('ALTER TABLE connections DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE connections ADD CONSTRAINT connections_role_b_fkey FOREIGN KEY (role_b) REFERENCES roles(id) ON DELETE SET NULL;

  -- ============================================================
  -- connections_overrides.role_a → roles(id) ON DELETE SET NULL
  -- connections_overrides.role_b → roles(id) ON DELETE SET NULL
  -- ============================================================
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.connections_overrides'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.connections_overrides'::regclass AND attname = 'role_a')
  LOOP
    EXECUTE format('ALTER TABLE connections_overrides DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE connections_overrides ADD CONSTRAINT connections_overrides_role_a_fkey FOREIGN KEY (role_a) REFERENCES roles(id) ON DELETE SET NULL;

  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.connections_overrides'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.connections_overrides'::regclass AND attname = 'role_b')
  LOOP
    EXECUTE format('ALTER TABLE connections_overrides DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE connections_overrides ADD CONSTRAINT connections_overrides_role_b_fkey FOREIGN KEY (role_b) REFERENCES roles(id) ON DELETE SET NULL;

  -- ============================================================
  -- objects_types.type_id → types(id) ON DELETE RESTRICT
  -- ============================================================
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.objects_types'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.objects_types'::regclass AND attname = 'type_id')
  LOOP
    EXECUTE format('ALTER TABLE objects_types DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE objects_types ADD CONSTRAINT objects_types_type_id_fkey FOREIGN KEY (type_id) REFERENCES types(id) ON DELETE RESTRICT;

  -- ============================================================
  -- objects_types_overrides.type_id → types(id) ON DELETE RESTRICT
  -- ============================================================
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.objects_types_overrides'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.objects_types_overrides'::regclass AND attname = 'type_id')
  LOOP
    EXECUTE format('ALTER TABLE objects_types_overrides DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE objects_types_overrides ADD CONSTRAINT objects_types_overrides_type_id_fkey FOREIGN KEY (type_id) REFERENCES types(id) ON DELETE RESTRICT;

  -- ============================================================
  -- maps.source_map_id → maps(id) ON DELETE SET NULL
  -- ============================================================
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.maps'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.maps'::regclass AND attname = 'source_map_id')
  LOOP
    EXECUTE format('ALTER TABLE maps DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE maps ADD CONSTRAINT maps_source_map_id_fkey FOREIGN KEY (source_map_id) REFERENCES maps(id) ON DELETE SET NULL;

  -- ============================================================
  -- maps.source_coterie_id → coteries(id) ON DELETE SET NULL
  -- ============================================================
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.maps'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.maps'::regclass AND attname = 'source_coterie_id')
  LOOP
    EXECUTE format('ALTER TABLE maps DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE maps ADD CONSTRAINT maps_source_coterie_id_fkey FOREIGN KEY (source_coterie_id) REFERENCES coteries(id) ON DELETE SET NULL;

  -- ============================================================
  -- types.class → classes(id) ON DELETE RESTRICT
  -- objects.class → classes(id) ON DELETE RESTRICT
  -- ============================================================
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.types'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.types'::regclass AND attname = 'class')
  LOOP
    EXECUTE format('ALTER TABLE types DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE types ADD CONSTRAINT types_class_fkey FOREIGN KEY (class) REFERENCES classes(id) ON DELETE RESTRICT;

  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.objects'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.objects'::regclass AND attname = 'class')
  LOOP
    EXECUTE format('ALTER TABLE objects DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE objects ADD CONSTRAINT objects_class_fkey FOREIGN KEY (class) REFERENCES classes(id) ON DELETE RESTRICT;

  -- ============================================================
  -- maps.sector_id → sectors(id) ON DELETE SET NULL
  -- ============================================================
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.maps'::regclass AND contype = 'f'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.maps'::regclass AND attname = 'sector_id')
  LOOP
    EXECUTE format('ALTER TABLE maps DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE maps ADD CONSTRAINT maps_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL;

END $$;
