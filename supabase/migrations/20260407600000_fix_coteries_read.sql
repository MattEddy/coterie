-- Fix: coteries_read must also allow the owner to see their coterie.
-- Previously only members could read — but the owner isn't a member yet
-- at INSERT time (member row is created in the next step).

DROP POLICY IF EXISTS "coteries_read" ON coteries;

CREATE POLICY "coteries_read"
  ON coteries FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR is_coterie_member(id)
  );
