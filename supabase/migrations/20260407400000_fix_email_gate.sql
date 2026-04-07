-- Fix case-sensitive email comparison in is_email_allowed
CREATE OR REPLACE FUNCTION is_email_allowed(p_email TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  ) OR EXISTS (
    SELECT 1 FROM coteries_invitations WHERE lower(email) = lower(p_email)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
