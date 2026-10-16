-- Feature 6: Mentor assignment and reassignment by HR.
--
-- * Only open placements (SCHEDULED / ACTIVE) can get, change or lose a Mentor.
-- * Only active MENTOR accounts can be assigned (deactivated accounts are
--   unavailable); HR sees active Mentors with their open-placement count as
--   information only (no automatic assignment or balancing).
-- * Every assignment, reassignment and removal is recorded in the append-only
--   intern_placement_events (who, when, from → to, optional reason).
-- * Access follows the assignment: Mentor RPCs check
--   intern_placements.mentor_profile_id, so a replaced Mentor loses access
--   immediately.
--
-- Lock order: placement (FOR UPDATE) → Mentor profile (FOR SHARE). Admin role
-- changes lock the Mentor profile FOR UPDATE and then check open placements,
-- so an assignment and a demotion of the same Mentor serialize.

-- ---------------------------------------------------------------------------
-- 1. Mentor list for HR: active Mentors with their open placements.
--    (Return type changes, so the function is recreated.)
-- ---------------------------------------------------------------------------
DROP FUNCTION public.list_hr_mentors(uuid);

CREATE FUNCTION public.list_hr_mentors(p_actor_profile_id uuid)
RETURNS TABLE (id uuid, full_name text, email text, open_placements integer)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p WHERE p.id = p_actor_profile_id AND p.role = 'HR'
  ) THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email,
         (SELECT count(*)::integer FROM public.intern_placements AS ip
          WHERE ip.mentor_profile_id = p.id
            AND ip.status = ANY (ARRAY['SCHEDULED', 'ACTIVE']))
  FROM public.profiles AS p
  WHERE p.role = 'MENTOR' AND p.is_active
  ORDER BY p.full_name, p.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Assign or reassign (same signature as before, now with rules + history).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_intern_placement_mentor(
  p_actor_profile_id uuid,
  p_placement_id uuid,
  p_mentor_profile_id uuid
)
RETURNS SETOF public.intern_placements
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_placement public.intern_placements;
  v_mentor public.profiles;
  v_previous public.profiles;
  v_updated public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  IF p_mentor_profile_id IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'mentor_profile_required';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;
  IF NOT (v_placement.status = ANY (ARRAY['SCHEDULED', 'ACTIVE'])) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_assignable';
  END IF;

  SELECT p.* INTO v_mentor
  FROM public.profiles AS p WHERE p.id = p_mentor_profile_id FOR SHARE;
  IF NOT FOUND OR v_mentor.role IS DISTINCT FROM 'MENTOR' THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'mentor_profile_required';
  END IF;
  IF NOT v_mentor.is_active THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'mentor_inactive';
  END IF;
  IF v_placement.mentor_profile_id = p_mentor_profile_id THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'mentor_unchanged';
  END IF;

  IF v_placement.mentor_profile_id IS NOT NULL THEN
    SELECT p.* INTO v_previous FROM public.profiles AS p WHERE p.id = v_placement.mentor_profile_id;
  END IF;

  UPDATE public.intern_placements
  SET mentor_profile_id = p_mentor_profile_id, updated_at = now()
  WHERE id = v_placement.id
  RETURNING * INTO v_updated;

  INSERT INTO public.intern_placement_events (
    placement_id, event_type, from_status, to_status, details, actor_profile_id
  ) VALUES (
    v_placement.id, 'MENTOR_ASSIGNED', v_placement.status, v_placement.status,
    jsonb_build_object(
      'fromMentorProfileId', v_placement.mentor_profile_id,
      'fromMentorName', coalesce(v_previous.full_name, v_previous.email),
      'toMentorProfileId', v_mentor.id,
      'toMentorName', coalesce(v_mentor.full_name, v_mentor.email)
    ),
    p_actor_profile_id
  );

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Remove the Mentor from an open placement.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.unassign_intern_placement_mentor(
  p_actor_profile_id uuid,
  p_placement_id uuid,
  p_note text
)
RETURNS SETOF public.intern_placements
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_note text := nullif(btrim(p_note), '');
  v_placement public.intern_placements;
  v_previous public.profiles;
  v_updated public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'note_too_long';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;
  IF NOT (v_placement.status = ANY (ARRAY['SCHEDULED', 'ACTIVE'])) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_assignable';
  END IF;
  IF v_placement.mentor_profile_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'mentor_not_assigned';
  END IF;

  SELECT p.* INTO v_previous FROM public.profiles AS p WHERE p.id = v_placement.mentor_profile_id;

  UPDATE public.intern_placements
  SET mentor_profile_id = NULL, updated_at = now()
  WHERE id = v_placement.id
  RETURNING * INTO v_updated;

  INSERT INTO public.intern_placement_events (
    placement_id, event_type, from_status, to_status, details, note, actor_profile_id
  ) VALUES (
    v_placement.id, 'MENTOR_UNASSIGNED', v_placement.status, v_placement.status,
    jsonb_build_object(
      'fromMentorProfileId', v_placement.mentor_profile_id,
      'fromMentorName', coalesce(v_previous.full_name, v_previous.email)
    ),
    v_note, p_actor_profile_id
  );

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.list_hr_mentors(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_intern_placement_mentor(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unassign_intern_placement_mentor(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_hr_mentors(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_intern_placement_mentor(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unassign_intern_placement_mentor(uuid, uuid, text) TO service_role;
