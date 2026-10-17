-- Mentor Management rules (owner-approved 2026-10-17):
--
-- A. A placement can be activated only with an assigned Mentor: the assigned
--    profile must exist, have the MENTOR role and be active. Opening a
--    training opportunity and selecting an applicant are unchanged.
-- B. The assigned Mentor may read the tasks, task history and weekly reports
--    of a COMPLETED placement (read-only). SCHEDULED and CANCELLED placements
--    stay unreadable through these functions, and every write function stays
--    ACTIVE-only (unchanged here). The caller must still be the placement's
--    current Mentor with an active MENTOR profile.
-- C. An ACTIVE placement can never be left without a Mentor: removal is
--    refused for ACTIVE placements. HR replaces the Mentor with
--    assign_intern_placement_mentor, which already swaps the Mentor in a single
--    UPDATE under the placement lock (unchanged). Removal from a SCHEDULED
--    placement keeps working.
--
-- Lock order (unchanged conventions): activation locks the actor profile
-- (FOR SHARE) → application → placement (FOR UPDATE) → Mentor profile
-- (FOR SHARE) → applicant → intern profile → opportunity. Assignment and
-- removal lock the placement FOR UPDATE, so a Mentor change and an activation of
-- the same placement serialize: whichever commits second sees the new row.
-- An admin demoting or deactivating the Mentor locks that profile FOR UPDATE,
-- so it serializes with the activation's FOR SHARE lock.
--
-- Signatures, return types, volatility and SECURITY INVOKER are unchanged;
-- no table, column or data changes. Execution stays service_role only.

-- ---------------------------------------------------------------------------
-- A. Activation requires an eligible assigned Mentor.
--    Same as 20261014000000 except for the Mentor check after the placement
--    lock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_intern_placement(
  p_actor_profile_id uuid,
  p_placement_id uuid
)
RETURNS SETOF public.intern_placements
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_application_id uuid;
  v_applicant_id uuid;
  v_application_status text;
  v_auth_user_id uuid;
  v_profile_role text;
  v_placement_status text;
  v_end_date date;
  v_internship_id uuid;
  v_mentor_profile_id uuid;
  v_mentor_role text;
  v_mentor_active boolean;
  v_capacity integer;
  v_updated_profile_id uuid;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  -- This unlocked lookup only discovers which application row to lock first.
  SELECT ip.application_id INTO v_application_id
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  SELECT a.status::text INTO v_application_status
  FROM public.applications AS a WHERE a.id = v_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_application_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.applications AS a
             WHERE a.id = v_application_id AND a.selection_released_at IS NOT NULL) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'selection_released';
  END IF;

  SELECT ip.applicant_id, ip.status::text, ip.end_date, ip.internship_id, ip.mentor_profile_id
    INTO v_applicant_id, v_placement_status, v_end_date, v_internship_id, v_mentor_profile_id
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id AND ip.application_id = v_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  IF v_placement_status <> 'SCHEDULED' OR v_application_status <> 'SELECTED' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_eligible';
  END IF;
  IF v_end_date < current_date THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_already_ended';
  END IF;

  -- The Mentor read here comes from the locked placement row, so a concurrent
  -- assignment or removal has either committed already or waits for us.
  IF v_mentor_profile_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'mentor_required';
  END IF;
  SELECT p.role::text, p.is_active INTO v_mentor_role, v_mentor_active
  FROM public.profiles AS p WHERE p.id = v_mentor_profile_id FOR SHARE;
  IF NOT FOUND OR v_mentor_role IS DISTINCT FROM 'MENTOR' THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'mentor_profile_required';
  END IF;
  IF v_mentor_active IS NOT TRUE THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'mentor_inactive';
  END IF;

  SELECT a.auth_user_id INTO v_auth_user_id
  FROM public.applicants AS a WHERE a.id = v_applicant_id FOR UPDATE;
  IF NOT FOUND OR v_auth_user_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_auth_link_missing';
  END IF;

  SELECT p.role::text INTO v_profile_role
  FROM public.profiles AS p WHERE p.id = v_auth_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile_role IS DISTINCT FROM 'APPLICANT' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_profile_not_eligible';
  END IF;

  PERFORM 1 FROM public.intern_placements AS ip
  WHERE ip.applicant_id = v_applicant_id AND ip.status = 'ACTIVE' AND ip.id <> p_placement_id;
  IF FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_already_has_active_placement';
  END IF;

  -- The application's seat was taken at selection and is still counted, so
  -- activation does not count anyone again; it only re-checks that the
  -- opportunity is within its capacity (cumulative seats, not active interns).
  SELECT i.capacity INTO v_capacity
  FROM public.internships AS i WHERE i.id = v_internship_id FOR SHARE;
  IF v_capacity IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_not_set';
  END IF;
  IF public.training_opportunity_seats_consumed(v_internship_id) > v_capacity THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_full';
  END IF;

  UPDATE public.intern_placements AS ip
  SET status = 'ACTIVE', updated_at = now()
  WHERE ip.id = p_placement_id
  RETURNING * INTO v_placement;

  UPDATE public.profiles AS p
  SET role = 'INTERN', updated_at = now()
  WHERE p.id = v_auth_user_id AND p.role::text = 'APPLICANT'
  RETURNING p.id INTO v_updated_profile_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_role_changed';
  END IF;

  INSERT INTO public.intern_placement_events (
    placement_id, event_type, from_status, to_status, details, actor_profile_id
  ) VALUES (
    p_placement_id, 'ACTIVATED', 'SCHEDULED', 'ACTIVE',
    jsonb_build_object('internProfileId', v_auth_user_id), p_actor_profile_id
  );

  RETURN NEXT v_placement;
  RETURN;
END;
$function$;

-- ---------------------------------------------------------------------------
-- B. Read-only history for the assigned Mentor of a COMPLETED placement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_mentor_intern_tasks(
  p_mentor_profile_id uuid,
  p_placement_id uuid
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_active boolean;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text, p.is_active INTO v_role, v_active
  FROM public.profiles AS p
  WHERE p.id = p_mentor_profile_id
  FOR SHARE;

  IF v_role IS DISTINCT FROM 'MENTOR' OR v_active IS NOT TRUE THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id
    AND ip.mentor_profile_id = p_mentor_profile_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_assigned_to_mentor';
  END IF;
  IF NOT (v_placement.status = ANY (ARRAY['ACTIVE', 'COMPLETED'])) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  RETURN QUERY
  SELECT t.*
  FROM public.intern_tasks AS t
  WHERE t.placement_id = p_placement_id
  ORDER BY t.created_at, t.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_mentor_task_events(
  p_mentor_profile_id uuid,
  p_placement_id uuid
)
RETURNS TABLE (
  id uuid,
  task_id uuid,
  event_type text,
  from_status text,
  to_status text,
  details jsonb,
  note text,
  actor_name text,
  actor_role text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_mentor_profile_id AND p.role = 'MENTOR' AND p.is_active
  ) THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id AND ip.mentor_profile_id = p_mentor_profile_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_assigned_to_mentor';
  END IF;
  IF NOT (v_placement.status = ANY (ARRAY['ACTIVE', 'COMPLETED'])) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  RETURN QUERY
  SELECT e.id, e.task_id, e.event_type, e.from_status, e.to_status, e.details, e.note,
         coalesce(p.full_name, p.email), p.role, e.created_at
  FROM public.intern_task_events AS e
  JOIN public.profiles AS p ON p.id = e.actor_profile_id
  WHERE e.placement_id = p_placement_id
  ORDER BY e.created_at, e.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_mentor_weekly_reports(
  p_mentor_profile_id uuid,
  p_placement_id uuid
)
RETURNS SETOF public.intern_weekly_reports
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_mentor_profile_id AND p.role = 'MENTOR' AND p.is_active
  ) THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id AND ip.mentor_profile_id = p_mentor_profile_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_assigned_to_mentor';
  END IF;
  IF NOT (v_placement.status = ANY (ARRAY['ACTIVE', 'COMPLETED'])) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  RETURN QUERY
  SELECT r.* FROM public.intern_weekly_reports AS r
  WHERE r.placement_id = p_placement_id AND r.status <> 'DRAFT'
  ORDER BY r.week_start DESC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- C. An ACTIVE placement cannot lose its Mentor without a replacement.
--    Same as 20261011040000 except for the ACTIVE check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unassign_intern_placement_mentor(
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
  -- Checked on the locked row: an activation that committed first is seen here.
  IF v_placement.status = 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'active_placement_requires_mentor';
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
-- Privileges: service_role only (restated; CREATE OR REPLACE keeps them).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.activate_intern_placement(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_mentor_intern_tasks(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_mentor_task_events(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_mentor_weekly_reports(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unassign_intern_placement_mentor(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.activate_intern_placement(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mentor_intern_tasks(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mentor_task_events(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mentor_weekly_reports(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unassign_intern_placement_mentor(uuid, uuid, text) TO service_role;
