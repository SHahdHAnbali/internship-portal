-- Placement completion (business rules approved by the owner on 2026-10-11):
--
-- * Only HR completes an ACTIVE placement.
-- * Before the planned end date this is an early end and needs a reason; on or
--   after the end date the note is optional.
-- * Completion is refused while work is open: tasks ASSIGNED / IN_PROGRESS,
--   tasks COMPLETED but not yet reviewed, or weekly reports SUBMITTED but not
--   yet reviewed. HR asks the Mentor to finish or cancel them first.
-- * The intern keeps the INTERN role and read-only access: their task and report
--   lists show the active placement, or else their most recent completed one.
--   Every write already requires an ACTIVE placement, so a completed placement
--   is read-only for interns and Mentors.
-- * A completed placement frees its seat (capacity counts ACTIVE placements);
--   the application keeps its one non-cancelled placement.
--
-- Lock order matches activation/cancellation: application → placement.
-- Task and report writes lock the same placement row FOR UPDATE, so they
-- serialize with completion.

-- ---------------------------------------------------------------------------
-- 1. Completion columns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.intern_placements
  ADD COLUMN completed_at timestamptz NULL,
  ADD COLUMN completion_note text NULL,
  ADD COLUMN ended_early boolean NULL;

ALTER TABLE public.intern_placements
  ADD CONSTRAINT intern_placements_completion_check CHECK (
    (status = 'COMPLETED') = (completed_at IS NOT NULL)
    AND (completed_at IS NULL) = (ended_early IS NULL)
    AND (completion_note IS NULL OR char_length(completion_note) <= 1000)
    AND (ended_early IS NOT TRUE OR completion_note IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 2. Completion.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.complete_intern_placement(
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
  v_application_id uuid;
  v_current public.intern_placements;
  v_early boolean;
  v_open_tasks integer;
  v_unreviewed_tasks integer;
  v_pending_reports integer;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'completion_note_too_long';
  END IF;

  SELECT ip.application_id INTO v_application_id
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  PERFORM 1 FROM public.applications AS a WHERE a.id = v_application_id FOR UPDATE;

  SELECT ip.* INTO v_current
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id AND ip.application_id = v_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;
  IF v_current.status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_completable';
  END IF;

  v_early := current_date < v_current.end_date;
  IF v_early AND v_note IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'early_end_reason_required';
  END IF;

  SELECT count(*) FILTER (WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS')),
         count(*) FILTER (WHERE t.status = 'COMPLETED' AND t.review_status IS NULL)
  INTO v_open_tasks, v_unreviewed_tasks
  FROM public.intern_tasks AS t WHERE t.placement_id = p_placement_id;

  SELECT count(*) INTO v_pending_reports
  FROM public.intern_weekly_reports AS r
  WHERE r.placement_id = p_placement_id AND r.status = 'SUBMITTED';

  IF v_open_tasks > 0 OR v_unreviewed_tasks > 0 THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_has_open_tasks';
  END IF;
  IF v_pending_reports > 0 THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_has_pending_reports';
  END IF;

  UPDATE public.intern_placements AS ip
  SET status = 'COMPLETED',
      completed_at = now(),
      completion_note = v_note,
      ended_early = v_early,
      updated_at = now()
  WHERE ip.id = p_placement_id
  RETURNING * INTO v_placement;

  INSERT INTO public.intern_placement_events (
    placement_id, event_type, from_status, to_status, details, note, actor_profile_id
  ) VALUES (
    p_placement_id, 'COMPLETED', 'ACTIVE', 'COMPLETED',
    jsonb_build_object('endedEarly', v_early, 'plannedEndDate', v_current.end_date),
    v_note, p_actor_profile_id
  );

  RETURN NEXT v_placement;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Intern read access: the active placement, else the latest completed one.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.intern_visible_placement_id(p_auth_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT ip.id
  FROM public.applicants AS a
  JOIN public.intern_placements AS ip ON ip.applicant_id = a.id
  WHERE a.auth_user_id = p_auth_user_id
    AND ip.status IN ('ACTIVE', 'COMPLETED')
  ORDER BY (ip.status = 'ACTIVE') DESC, ip.completed_at DESC NULLS LAST, ip.start_date DESC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_intern_tasks(
  p_auth_user_id uuid
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT p.role::text INTO v_role
  FROM public.profiles AS p
  WHERE p.id = p_auth_user_id
  FOR SHARE;

  IF v_role IS DISTINCT FROM 'INTERN' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'intern_role_required';
  END IF;

  RETURN QUERY
  SELECT t.*
  FROM public.intern_tasks AS t
  WHERE t.placement_id = public.intern_visible_placement_id(p_auth_user_id)
  ORDER BY t.created_at, t.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_weekly_reports(p_auth_user_id uuid)
RETURNS SETOF public.intern_weekly_reports
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p WHERE p.id = p_auth_user_id AND p.role = 'INTERN'
  ) THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'intern_role_required';
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.intern_weekly_reports AS r
  WHERE r.placement_id = public.intern_visible_placement_id(p_auth_user_id)
  ORDER BY r.week_start DESC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.complete_intern_placement(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intern_visible_placement_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_intern_tasks(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_weekly_reports(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_intern_placement(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.intern_visible_placement_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_intern_tasks(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_weekly_reports(uuid) TO service_role;
