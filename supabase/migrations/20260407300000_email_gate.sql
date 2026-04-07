-- Pre-OTP email gate: check if email belongs to an existing user or has an invitation.
-- Callable by anon so the check happens before authentication.

CREATE OR REPLACE FUNCTION is_email_allowed(p_email TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = p_email
  ) OR EXISTS (
    SELECT 1 FROM coteries_invitations WHERE email = p_email
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_email_allowed(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION is_email_allowed(TEXT) TO authenticated;
