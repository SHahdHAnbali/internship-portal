-- Feature 5: Admin user and system management.
--
-- * profiles.role gains ADMIN. ADMIN is a separate role: it does not inherit
--   HR, Mentor, Intern or Applicant permissions (each RPC checks its own role).
-- * profiles.is_active: deactivated accounts are refused by the backend auth
--   guard (and banned in Supabase Auth by the backend).
-- * Admins create staff profiles (HR / MENTOR / ADMIN) for Auth users the
--   backend just created, change staff roles and (de)activate accounts.
--   Applicant and Intern roles stay owned by the application/placement
--   workflow and cannot be changed here.
-- * Safety: an admin cannot change or deactivate their own account, the last
--   active admin cannot be removed, and a Mentor with open placements cannot
--   lose the role or be deactivated (HR must reassign first).
-- * admin_audit_events: append-only audit trail of every admin action.
-- * bootstrap_first_admin: one-time promotion used by a user-run script; it
--   refuses once any ADMIN exists.
--
-- All functions are SECURITY INVOKER and executable only by service_role.

-- ---------------------------------------------------------------------------
-- 1. Roles and account status.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['APPLICANT', 'INTERN', 'MENTOR', 'HR', 'ADMIN']));

ALTER TABLE public.profiles
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN deactivated_at timestamptz NULL;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_deactivation_consistent
  CHECK (is_active = (deactivated_at IS NULL));

-- Browser roles only ever read their own row (RLS policy); they never need
-- TRUNCATE / TRIGGER / REFERENCES on the role table.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Append-only admin audit trail.
-- ---------------------------------------------------------------------------
CREATE TABLE public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CONSTRAINT admin_audit_events_type_check CHECK (event_type = ANY (ARRAY[
    'ADMIN_BOOTSTRAPPED', 'USER_CREATED', 'ROLE_CHANGED', 'USER_DEACTIVATED', 'USER_REACTIVATED'
  ])),
  actor_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Snapshot so the trail stays readable if the account is later removed.
  target_email text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NULL CONSTRAINT admin_audit_events_note_length CHECK (char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_events_created_at_idx ON public.admin_audit_events (created_at DESC);
CREATE INDEX admin_audit_events_target_idx ON public.admin_audit_events (target_profile_id);

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.admin_audit_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.admin_audit_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.admin_audit_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Shared checks.
-- ---------------------------------------------------------------------------

-- The acting profile must be an active ADMIN.
CREATE FUNCTION public.admin_require_actor(p_actor_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_actor_profile_id AND p.role = 'ADMIN' AND p.is_active
  ) THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'admin_role_required';
  END IF;
END;
$function$;

-- Serializes every change to who is an (active) admin, so two concurrent
-- requests can never remove the last admin between them.
CREATE FUNCTION public.admin_lock_membership()
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT pg_advisory_xact_lock(hashtext('public.admin_membership'));
$function$;

CREATE FUNCTION public.admin_mentor_has_open_placements(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.intern_placements AS ip
    WHERE ip.mentor_profile_id = p_profile_id
      AND ip.status = ANY (ARRAY['SCHEDULED', 'ACTIVE'])
  );
$function$;

-- ---------------------------------------------------------------------------
-- 4. Staff profile creation (the backend has just created the Auth user).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_create_staff_profile(
  p_actor_profile_id uuid,
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_profile public.profiles;
BEGIN
  PERFORM public.admin_require_actor(p_actor_profile_id);

  IF p_role IS NULL OR NOT (p_role = ANY (ARRAY['HR', 'MENTOR', 'ADMIN'])) THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_staff_role';
  END IF;
  IF v_email = '' OR char_length(v_email) > 254 OR position('@' IN v_email) < 2 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_email';
  END IF;
  IF v_full_name = '' OR char_length(v_full_name) > 200 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'full_name_required';
  END IF;

  PERFORM public.admin_lock_membership();

  BEGIN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (p_user_id, v_full_name, v_email, p_role)
    RETURNING * INTO v_profile;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'account_already_exists';
    WHEN foreign_key_violation THEN
      RAISE SQLSTATE 'PZ404' USING MESSAGE = 'auth_user_not_found';
  END;

  INSERT INTO public.admin_audit_events (event_type, actor_profile_id, target_profile_id, target_email, details)
  VALUES ('USER_CREATED', p_actor_profile_id, v_profile.id, v_profile.email,
          jsonb_build_object('role', p_role));

  RETURN NEXT v_profile;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Staff role changes (HR / MENTOR / ADMIN only).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_change_user_role(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_role text,
  p_note text
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_note text := nullif(btrim(p_note), '');
  v_target public.profiles;
  v_updated public.profiles;
BEGIN
  PERFORM public.admin_require_actor(p_actor_profile_id);

  IF p_role IS NULL OR NOT (p_role = ANY (ARRAY['HR', 'MENTOR', 'ADMIN'])) THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_staff_role';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'note_too_long';
  END IF;
  IF p_target_profile_id = p_actor_profile_id THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'cannot_change_own_account';
  END IF;

  PERFORM public.admin_lock_membership();
  -- Re-check after waiting for the lock: the actor may have lost the role.
  PERFORM public.admin_require_actor(p_actor_profile_id);

  SELECT p.* INTO v_target FROM public.profiles AS p WHERE p.id = p_target_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'user_not_found';
  END IF;
  IF NOT (v_target.role = ANY (ARRAY['HR', 'MENTOR', 'ADMIN'])) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'role_not_staff';
  END IF;
  IF v_target.role = p_role THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'role_unchanged';
  END IF;
  IF v_target.role = 'ADMIN' AND v_target.is_active AND NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.role = 'ADMIN' AND p.is_active AND p.id <> v_target.id
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'last_admin';
  END IF;
  IF v_target.role = 'MENTOR' AND public.admin_mentor_has_open_placements(v_target.id) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'mentor_has_open_placements';
  END IF;

  UPDATE public.profiles
  SET role = p_role, updated_at = now()
  WHERE id = v_target.id
  RETURNING * INTO v_updated;

  INSERT INTO public.admin_audit_events (event_type, actor_profile_id, target_profile_id, target_email, details, note)
  VALUES ('ROLE_CHANGED', p_actor_profile_id, v_target.id, v_target.email,
          jsonb_build_object('fromRole', v_target.role, 'toRole', p_role), v_note);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Account (de)activation. Idempotent: repeating the current state returns
--    the row without a new event, so the backend can retry the Auth step.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_set_user_active(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_active boolean,
  p_note text
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_note text := nullif(btrim(p_note), '');
  v_target public.profiles;
  v_updated public.profiles;
BEGIN
  PERFORM public.admin_require_actor(p_actor_profile_id);

  IF p_active IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_account_status';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'note_too_long';
  END IF;
  IF p_target_profile_id = p_actor_profile_id THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'cannot_change_own_account';
  END IF;

  PERFORM public.admin_lock_membership();
  PERFORM public.admin_require_actor(p_actor_profile_id);

  SELECT p.* INTO v_target FROM public.profiles AS p WHERE p.id = p_target_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'user_not_found';
  END IF;

  IF v_target.is_active = p_active THEN
    RETURN NEXT v_target;
    RETURN;
  END IF;

  IF NOT p_active THEN
    IF v_note IS NULL THEN
      RAISE SQLSTATE 'PZ400' USING MESSAGE = 'deactivation_reason_required';
    END IF;
    IF v_target.role = 'ADMIN' AND NOT EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.role = 'ADMIN' AND p.is_active AND p.id <> v_target.id
    ) THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'last_admin';
    END IF;
    IF v_target.role = 'MENTOR' AND public.admin_mentor_has_open_placements(v_target.id) THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'mentor_has_open_placements';
    END IF;
  END IF;

  UPDATE public.profiles
  SET is_active = p_active,
      deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = v_target.id
  RETURNING * INTO v_updated;

  INSERT INTO public.admin_audit_events (event_type, actor_profile_id, target_profile_id, target_email, details, note)
  VALUES (CASE WHEN p_active THEN 'USER_REACTIVATED' ELSE 'USER_DEACTIVATED' END,
          p_actor_profile_id, v_target.id, v_target.email,
          jsonb_build_object('role', v_target.role), v_note);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. One-time first-admin bootstrap (run by the project owner via
--    backend/scripts/bootstrap-admin.mjs). Refuses once any ADMIN exists.
--    The script verifies the Auth account exists and is email-confirmed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.bootstrap_first_admin(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_allow_role_change boolean
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_full_name text := nullif(btrim(p_full_name), '');
  v_existing public.profiles;
  v_profile public.profiles;
BEGIN
  PERFORM public.admin_lock_membership();

  IF EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.role = 'ADMIN') THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'admin_already_exists';
  END IF;
  IF v_email = '' OR position('@' IN v_email) < 2 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_email';
  END IF;
  IF char_length(v_full_name) > 200 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'full_name_required';
  END IF;

  SELECT p.* INTO v_existing FROM public.profiles AS p WHERE p.id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.profiles (id, full_name, email, role)
      VALUES (p_user_id, v_full_name, v_email, 'ADMIN')
      RETURNING * INTO v_profile;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE SQLSTATE 'PZ409' USING MESSAGE = 'account_already_exists';
      WHEN foreign_key_violation THEN
        RAISE SQLSTATE 'PZ404' USING MESSAGE = 'auth_user_not_found';
    END;
  ELSE
    -- Applicant and Intern accounts carry application/placement data.
    IF NOT (v_existing.role = ANY (ARRAY['HR', 'MENTOR'])) THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'profile_role_not_promotable';
    END IF;
    IF NOT coalesce(p_allow_role_change, false) THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'role_change_confirmation_required';
    END IF;
    IF v_existing.role = 'MENTOR' AND public.admin_mentor_has_open_placements(v_existing.id) THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'mentor_has_open_placements';
    END IF;

    UPDATE public.profiles
    SET role = 'ADMIN', is_active = true, deactivated_at = NULL, updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_profile;
  END IF;

  INSERT INTO public.admin_audit_events (event_type, actor_profile_id, target_profile_id, target_email, details)
  VALUES ('ADMIN_BOOTSTRAPPED', v_profile.id, v_profile.id, v_profile.email,
          jsonb_build_object('previousRole', v_existing.role));

  RETURN NEXT v_profile;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_require_actor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_lock_membership() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mentor_has_open_placements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_staff_profile(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_change_user_role(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_active(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_require_actor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_lock_membership() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mentor_has_open_placements(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_staff_profile(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_user_role(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(uuid, text, text, boolean) TO service_role;
