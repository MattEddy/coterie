-- Replace per-member share_contacts and per-object coterie_shared with
-- universal coteries_shares join table for granular per-coterie, per-item sharing

-- 1. Drop view that depends on coterie_shared, then drop old flags
DROP VIEW IF EXISTS user_objects;
ALTER TABLE coteries_members DROP COLUMN IF EXISTS share_contacts;
ALTER TABLE objects_overrides DROP COLUMN IF EXISTS coterie_shared;

-- 2. Drop old function
DROP FUNCTION IF EXISTS get_coterie_shared_items(UUID, UUID);

-- 3. Recreate user_objects view without coterie_shared
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

-- 4. Create coteries_shares table
CREATE TABLE IF NOT EXISTS coteries_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coterie_id UUID NOT NULL REFERENCES coteries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    share_type TEXT NOT NULL,  -- 'contacts', 'project', 'event'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(coterie_id, user_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_coteries_shares_user ON coteries_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_coteries_shares_object ON coteries_shares(object_id);

-- 5. RLS
ALTER TABLE coteries_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coteries_shares_read_own" ON coteries_shares;
DROP POLICY IF EXISTS "coteries_shares_read_coterie" ON coteries_shares;
DROP POLICY IF EXISTS "coteries_shares_insert" ON coteries_shares;
DROP POLICY IF EXISTS "coteries_shares_delete" ON coteries_shares;

CREATE POLICY "coteries_shares_read_own" ON coteries_shares FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "coteries_shares_read_coterie" ON coteries_shares FOR SELECT TO authenticated USING (user_id != auth.uid() AND is_coterie_member(coterie_id));
CREATE POLICY "coteries_shares_insert" ON coteries_shares FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_coterie_member(coterie_id));
CREATE POLICY "coteries_shares_delete" ON coteries_shares FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 6. SECURITY DEFINER function for fetching shared intel from peers
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
  -- Contact shares: object_id = the person/company whose contacts are shared
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
  -- Project/event shares: find peer's shared items connected to p_object_id
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
      -- The shared project/event must be connected to the viewed object
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
