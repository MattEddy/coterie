-- Notes as first-class objects
-- Each note is an object (class='note') connected to its parent via 'note_on' connection.
-- Sharing uses coteries_shares with share_type='note'.
-- Replaces the old shared_notes/private_notes columns on objects_overrides.

-- 1. Add note class (off-landscape)
INSERT INTO classes (id, display_name, icon, color, landscape_visible) VALUES
    ('note', 'Note', 'note.text', '#8B5CF6', FALSE);

-- 2. Add note_on role for note→parent connections
INSERT INTO roles (display_name, is_canon) VALUES ('Note On', TRUE);

-- 3. Drop old notes columns from overrides tables
DROP VIEW IF EXISTS user_objects;

ALTER TABLE objects_overrides DROP COLUMN IF EXISTS shared_notes;
ALTER TABLE objects_overrides DROP COLUMN IF EXISTS private_notes;
ALTER TABLE connections_overrides DROP COLUMN IF EXISTS shared_notes;
ALTER TABLE connections_overrides DROP COLUMN IF EXISTS private_notes;

-- 4. Recreate user_objects view without notes columns
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
    ov.tags,
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

-- 5. Update get_coterie_shared_intel to handle 'note' share_type
CREATE OR REPLACE FUNCTION get_coterie_shared_intel(p_user_id UUID, p_object_id UUID)
RETURNS TABLE(
  peer_user_id UUID,
  peer_display_name TEXT,
  coterie_id UUID,
  share_type TEXT,
  shared_object_id UUID,
  object_class TEXT,
  name TEXT,
  title TEXT,
  status TEXT,
  event_date DATE,
  contacts JSONB
) AS $$
  WITH my_coteries AS (
    SELECT cm.coterie_id FROM public.coteries_members cm WHERE cm.user_id = p_user_id
  ),
  contact_results AS (
    SELECT
      cs.user_id AS peer_user_id,
      pr.display_name AS peer_display_name,
      cs.coterie_id,
      cs.share_type,
      cs.object_id AS shared_object_id,
      NULL::TEXT AS object_class,
      NULL::TEXT AS name,
      NULL::TEXT AS title,
      NULL::TEXT AS status,
      NULL::DATE AS event_date,
      ov.data->'contacts' AS contacts
    FROM public.coteries_shares cs
    JOIN my_coteries mc ON mc.coterie_id = cs.coterie_id
    JOIN public.objects_overrides ov ON ov.object_id = cs.object_id AND ov.user_id = cs.user_id
    JOIN public.profiles pr ON pr.user_id = cs.user_id
    WHERE cs.user_id != p_user_id
      AND cs.object_id = p_object_id
      AND cs.share_type = 'contacts'
  ),
  item_shares AS (
    SELECT
      cs.user_id AS peer_user_id,
      pr.display_name AS peer_display_name,
      cs.coterie_id,
      cs.share_type,
      cs.object_id AS shared_object_id,
      o.class AS object_class,
      COALESCE(ov.name, o.name) AS name,
      COALESCE(ov.title, o.title) AS title,
      COALESCE(ov.status, o.status) AS status,
      COALESCE(ov.event_date, o.event_date) AS event_date,
      NULL::JSONB AS contacts
    FROM public.coteries_shares cs
    JOIN my_coteries mc ON mc.coterie_id = cs.coterie_id
    JOIN public.objects_overrides ov ON ov.object_id = cs.object_id AND ov.user_id = cs.user_id
    JOIN public.objects o ON o.id = cs.object_id AND o.class IN ('project', 'event', 'note')
    JOIN public.profiles pr ON pr.user_id = cs.user_id
    WHERE cs.user_id != p_user_id
      AND cs.share_type IN ('project', 'event', 'note')
      AND EXISTS (
        SELECT 1 FROM public.connections_overrides co
        WHERE co.user_id = cs.user_id
          AND co.connection_id IS NULL
          AND ((co.object_a_id = p_object_id AND co.object_b_id = cs.object_id)
            OR (co.object_a_id = cs.object_id AND co.object_b_id = p_object_id))
      )
  )
  SELECT * FROM contact_results
  UNION ALL
  SELECT * FROM item_shares;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_coterie_shared_intel(UUID, UUID) TO authenticated;
