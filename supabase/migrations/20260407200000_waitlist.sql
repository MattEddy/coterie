-- Waitlist for pre-launch signups (invite-only period)
CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Anon users can add themselves to the waitlist
CREATE POLICY "waitlist_anon_insert"
  ON waitlist FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated users (operators) can read the waitlist
CREATE POLICY "waitlist_authenticated_read"
  ON waitlist FOR SELECT
  TO authenticated
  USING (true);
