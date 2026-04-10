-- Rename for consistency with other coteries_* tables
ALTER TABLE IF EXISTS coterie_shares RENAME TO coteries_shares;
ALTER INDEX IF EXISTS idx_coterie_shares_user RENAME TO idx_coteries_shares_user;
ALTER INDEX IF EXISTS idx_coterie_shares_object RENAME TO idx_coteries_shares_object;

-- Recreate function with new table name
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
    JOIN public.objects o ON o.id = cs.object_id AND o.class IN ('project', 'event')
    JOIN public.profiles pr ON pr.user_id = cs.user_id
    WHERE cs.user_id != p_user_id
      AND cs.share_type IN ('project', 'event')
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
