-- Per-object flag for sharing projects/events with coterie members
ALTER TABLE objects_overrides
  ADD COLUMN IF NOT EXISTS coterie_shared BOOLEAN NOT NULL DEFAULT FALSE;

-- Must DROP + CREATE (not CREATE OR REPLACE) because new column is added before 'types'
DROP VIEW IF EXISTS user_objects;

CREATE VIEW user_objects AS
SELECT
    ov.user_id,
    o.id,
    o.class,
    COALESCE(ov.name, o.name) AS name,
    COALESCE(ov.title, o.title) AS title,
    COALESCE(ov.status, o.status) AS status,
    COALESCE(ov.photo_url, o.photo_url) AS photo_url,
    COALESCE(ov.event_date, o.event_date) AS event_date,
    COALESCE(ov.data, o.data) AS data,
    o.is_canon,
    o.created_by,
    ov.map_x,
    ov.map_y,
    ov.shared_notes,
    ov.private_notes,
    ov.tags,
    ov.coterie_shared,
    COALESCE(
        (SELECT array_agg(t.display_name) FROM objects_types_overrides oto
         JOIN types t ON t.id = oto.type_id
         WHERE oto.user_id = ov.user_id AND oto.object_id = o.id),
        (SELECT array_agg(t.display_name) FROM objects_types ot
         JOIN types t ON t.id = ot.type_id
         WHERE ot.object_id = o.id),
        '{}'::TEXT[]
    ) AS types
FROM objects_overrides ov
JOIN objects o ON o.id = ov.object_id
WHERE o.is_active = TRUE;

-- SECURITY DEFINER function to fetch coterie-shared projects/events from peers
-- Bypasses RLS on connections_overrides (which requires both endpoints in shared maps)
CREATE OR REPLACE FUNCTION get_coterie_shared_items(p_user_id UUID, p_object_id UUID)
RETURNS TABLE(
  peer_user_id UUID,
  peer_display_name TEXT,
  object_id UUID,
  object_class TEXT,
  name TEXT,
  title TEXT,
  status TEXT,
  event_date DATE
) AS $$
  WITH my_coteries AS (
    SELECT coterie_id FROM public.coteries_members WHERE user_id = p_user_id
  ),
  peers AS (
    SELECT DISTINCT cm.user_id
    FROM public.coteries_members cm
    JOIN my_coteries mc ON mc.coterie_id = cm.coterie_id
    WHERE cm.user_id != p_user_id
  ),
  peer_connections AS (
    -- Peers' user-created connections involving p_object_id
    SELECT co.user_id,
      CASE WHEN co.object_a_id = p_object_id THEN co.object_b_id ELSE co.object_a_id END AS other_id
    FROM public.connections_overrides co
    JOIN peers p ON p.user_id = co.user_id
    WHERE co.connection_id IS NULL
      AND (co.object_a_id = p_object_id OR co.object_b_id = p_object_id)
  )
  SELECT
    pc.user_id AS peer_user_id,
    pr.display_name AS peer_display_name,
    ov.object_id,
    o.class AS object_class,
    COALESCE(ov.name, o.name) AS name,
    COALESCE(ov.title, o.title) AS title,
    COALESCE(ov.status, o.status) AS status,
    COALESCE(ov.event_date, o.event_date) AS event_date
  FROM peer_connections pc
  JOIN public.objects_overrides ov ON ov.object_id = pc.other_id AND ov.user_id = pc.user_id
  JOIN public.objects o ON o.id = ov.object_id AND o.class IN ('project', 'event')
  JOIN public.profiles pr ON pr.user_id = pc.user_id
  WHERE ov.coterie_shared = TRUE;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_coterie_shared_items(UUID, UUID) TO authenticated;
