-- Password sign-in after the first verified email link (owner-approved
-- 2026-10-17).
--
-- Why a column: Supabase cannot tell whether a person has chosen a password.
-- Every live Auth user already has an internal password hash, including the
-- accounts the portal provisioned without one, and service_role cannot read
-- auth.users. The portal therefore records the completed setup itself.
--
-- * profiles.password_set_at: when the person last set a password through
--   the portal (NULL = setup still required; every existing account starts as
--   NULL and is asked to set one at its next sign-in).
-- * The browser sets the password with Supabase Auth (updateUser) and then
--   asks the backend to record it; mark_my_password_set stamps the verified
--   caller's own profile only. Browser roles can read their own row (existing
--   RLS policy) but cannot write it.
-- * The flag only decides whether the Set Password page is shown. It is never
--   used for authorization: the backend keeps verifying the Supabase session,
--   role and active status on every request.
-- * No password, hash or secret is stored by the portal.

ALTER TABLE public.profiles
  ADD COLUMN password_set_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.password_set_at IS
  'When the person last set a password through the portal. NULL = password setup required. Routing only, never authorization.';

CREATE FUNCTION public.mark_my_password_set(p_profile_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_set_at timestamptz;
BEGIN
  UPDATE public.profiles AS p
  SET password_set_at = now(),
      updated_at = now()
  WHERE p.id = p_profile_id
    AND p.is_active
  RETURNING p.password_set_at INTO v_set_at;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'profile_not_found';
  END IF;

  RETURN v_set_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_my_password_set(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_my_password_set(uuid) TO service_role;
