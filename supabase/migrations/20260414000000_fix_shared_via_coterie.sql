-- Fix is_shared_via_coterie() — still referenced dropped coteries_maps table.
-- Now uses maps.source_coterie_id (consistent with 1:1 map-coterie model).

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
