-- Retire the intern task workflows (the portal stopped using them on
-- 2026-10-18; owner-approved plan, decision D6).
--
-- * Drops the 13 task-only functions. Nothing in the application calls them.
-- * Rebuilds the Mentor placement list and the HR progress view without task
--   counts. HR "last activity" now comes from the placement row and weekly-report
--   submissions/reviews only (task events no longer count).
-- * Placement completion no longer looks at tasks; every other rule is kept
--   (HR only, ACTIVE only, early-end reason, pending weekly reports, the
--   COMPLETED event).
-- * Keeps public.intern_tasks and public.intern_task_events with every row as a
--   read-only archive: no table, column or row is dropped or changed. Browser
--   roles keep no privileges and service_role keeps SELECT only.
-- * Keeps intern_task_clean_text(text): the weekly-report functions use it.
--
-- Signatures of the rebuilt list functions change (columns removed), so they
-- are dropped and created again. Backend code from Batch 1 accepts rows with or
-- without the task columns. Execution stays service_role only.

-- ---------------------------------------------------------------------------
-- 0. Preflight: the objects this migration relies on exist as expected.
-- ---------------------------------------------------------------------------
DO $preflight$
BEGIN
  IF to_regclass('public.intern_tasks') IS NULL OR to_regclass('public.intern_task_events') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'intern_task_tables_missing';
  END IF;
  IF to_regprocedure('public.intern_task_clean_text(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'intern_task_clean_text_missing';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Mentor placement list without task counts (weekly reports kept).
-- ---------------------------------------------------------------------------
DROP FUNCTION public.list_my_mentor_placements(uuid);

CREATE FUNCTION public.list_my_mentor_placements(p_mentor_profile_id uuid)
RETURNS TABLE (
  placement_id uuid,
  intern_name text,
  intern_email text,
  company text,
  department text,
  start_date date,
  end_date date,
  status text,
  training_title text,
  reports_awaiting_review integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p WHERE p.id = p_mentor_profile_id AND p.role = 'MENTOR'
  ) THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  RETURN QUERY
  SELECT ip.id, a.full_name, a.email, ip.company, ip.department,
         ip.start_date, ip.end_date, ip.status, i.title,
         (SELECT count(*) FROM public.intern_weekly_reports AS r
          WHERE r.placement_id = ip.id AND r.status = 'SUBMITTED')::integer
  FROM public.intern_placements AS ip
  JOIN public.applicants AS a ON a.id = ip.applicant_id
  JOIN public.internships AS i ON i.id = ip.internship_id
  WHERE ip.mentor_profile_id = p_mentor_profile_id
  ORDER BY (ip.status = 'ACTIVE') DESC, ip.start_date DESC, ip.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. HR intern progress without task columns.
--    last_activity_at = latest of the placement row change (status, Mentor,
--    completion) and weekly-report submissions/reviews. Draft edits stay
--    private to the intern, as before.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.list_hr_intern_progress(uuid);

CREATE FUNCTION public.list_hr_intern_progress(p_actor_profile_id uuid)
RETURNS TABLE (
  placement_id uuid,
  application_id uuid,
  intern_name text,
  intern_email text,
  training_title text,
  company text,
  department text,
  start_date date,
  end_date date,
  status text,
  mentor_name text,
  mentor_active boolean,
  reports_expected integer,
  reports_submitted integer,
  reports_accepted integer,
  reports_returned integer,
  last_report_week date,
  last_activity_at timestamptz
)
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
  SELECT
    ip.id,
    ip.application_id,
    a.full_name,
    a.email,
    i.title,
    ip.company,
    ip.department,
    ip.start_date,
    ip.end_date,
    ip.status,
    coalesce(m.full_name, m.email),
    m.is_active,
    -- Weeks of the placement that have started (the same rule interns report by).
    CASE WHEN ip.status = 'SCHEDULED' OR ip.start_date > current_date THEN 0
         ELSE ((date_trunc('week', least(current_date, ip.end_date))::date
                - date_trunc('week', ip.start_date)::date) / 7 + 1)
    END::integer,
    (SELECT count(*) FROM public.intern_weekly_reports AS r WHERE r.placement_id = ip.id AND r.status <> 'DRAFT')::integer,
    (SELECT count(*) FROM public.intern_weekly_reports AS r WHERE r.placement_id = ip.id AND r.status = 'ACCEPTED')::integer,
    (SELECT count(*) FROM public.intern_weekly_reports AS r WHERE r.placement_id = ip.id AND r.status = 'RETURNED')::integer,
    (SELECT max(r.week_start) FROM public.intern_weekly_reports AS r WHERE r.placement_id = ip.id AND r.status <> 'DRAFT'),
    greatest(
      ip.updated_at,
      -- Draft edits are private to the intern, so only submissions and reviews count.
      (SELECT max(e.created_at) FROM public.intern_weekly_report_events AS e
       WHERE e.placement_id = ip.id AND e.event_type IN ('SUBMITTED', 'ACCEPTED', 'RETURNED'))
    )
  FROM public.intern_placements AS ip
  JOIN public.applicants AS a ON a.id = ip.applicant_id
  JOIN public.internships AS i ON i.id = ip.internship_id
  LEFT JOIN public.profiles AS m ON m.id = ip.mentor_profile_id
  WHERE ip.status <> 'CANCELLED'
  ORDER BY (ip.status = 'ACTIVE') DESC, (ip.status = 'SCHEDULED') DESC, ip.start_date DESC, ip.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Placement completion without the legacy task check.
--    Same as 20261011090000 except that open or unreviewed tasks no longer
--    block completion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_intern_placement(
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

  SELECT count(*) INTO v_pending_reports
  FROM public.intern_weekly_reports AS r
  WHERE r.placement_id = p_placement_id AND r.status = 'SUBMITTED';

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
-- 4. Drop the task-only functions. Exact signatures: a missing or changed
--    function makes the migration fail instead of being skipped silently.
--    Callers are dropped before the helpers they call.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.list_hr_intern_tasks(uuid, uuid);
DROP FUNCTION public.create_intern_task(uuid, uuid, text, text, date);
DROP FUNCTION public.list_my_intern_tasks(uuid);
DROP FUNCTION public.update_my_intern_task_status(uuid, uuid, text, text);
DROP FUNCTION public.list_mentor_intern_tasks(uuid, uuid);
DROP FUNCTION public.create_mentor_intern_task(uuid, uuid, text, text, date, text);
DROP FUNCTION public.update_mentor_intern_task(uuid, uuid, text, text, date, text);
DROP FUNCTION public.cancel_mentor_intern_task(uuid, uuid, text);
DROP FUNCTION public.review_mentor_intern_task(uuid, uuid, text, text);
DROP FUNCTION public.list_mentor_task_events(uuid, uuid);
DROP FUNCTION public.withdraw_my_intern_task_submission(uuid, uuid);
DROP FUNCTION public.mentor_lock_task(uuid, uuid);
DROP FUNCTION public.intern_task_withdrawal_open(date, timestamptz);

-- ---------------------------------------------------------------------------
-- 5. Task tables become a read-only archive.
--    REVOKE ALL covers every table privilege (including DELETE, TRUNCATE,
--    REFERENCES, TRIGGER and, on PostgreSQL 17, MAINTAIN), whether it came
--    from an explicit grant or from Supabase's default privileges; SELECT is
--    then granted back to service_role for historical access. The table owner
--    is not affected (ownership is administrative access, not an application
--    path).
-- ---------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.intern_tasks, public.intern_task_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.intern_tasks, public.intern_task_events TO service_role;

COMMENT ON TABLE public.intern_tasks IS
  'Archive of the retired intern task feature (retired 2026-10-18). Read-only: no application path writes here.';
COMMENT ON TABLE public.intern_task_events IS
  'Archive of the retired intern task history (retired 2026-10-18). Read-only: no application path writes here.';

-- ---------------------------------------------------------------------------
-- 6. Privileges of the rebuilt functions: service_role only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.list_my_mentor_placements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_hr_intern_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_intern_placement(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_my_mentor_placements(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_hr_intern_progress(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_intern_placement(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Postflight: the archive is effectively read-only for every application
--    role (REVOKE only removes grants made by the executing role, so the
--    result is checked rather than assumed), no function in public still reads
--    or writes the archive, and the weekly-report text helper is still there.
-- ---------------------------------------------------------------------------
DO $postflight$
DECLARE
  v_names text;
  v_table text;
  v_role text;
  v_privilege text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['public.intern_tasks', 'public.intern_task_events'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
                                   || CASE WHEN current_setting('server_version_num')::integer >= 170000
                                           THEN ARRAY['MAINTAIN'] ELSE ARRAY[]::text[] END LOOP
        IF has_table_privilege(v_role, v_table, v_privilege) THEN
          RAISE EXCEPTION USING ERRCODE = 'PZ001',
            MESSAGE = format('task_archive_still_writable: %s has %s on %s', v_role, v_privilege, v_table);
        END IF;
      END LOOP;
      -- Column-level grants are checked separately from table-level ones.
      IF has_any_column_privilege(v_role, v_table, 'INSERT, UPDATE, REFERENCES') THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ001',
          MESSAGE = format('task_archive_columns_still_writable: %s on %s', v_role, v_table);
      END IF;
    END LOOP;
    IF has_table_privilege('anon', v_table, 'SELECT') OR has_table_privilege('authenticated', v_table, 'SELECT') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('task_archive_readable_by_browser: %s', v_table);
    END IF;
    IF NOT has_table_privilege('service_role', v_table, 'SELECT') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('task_archive_not_readable: %s', v_table);
    END IF;
  END LOOP;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text) INTO v_names
  FROM pg_catalog.pg_proc AS p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosrc ~ '\m(intern_tasks|intern_task_events)\M';
  IF v_names IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'functions_still_use_task_archive: ' || v_names;
  END IF;
  IF to_regprocedure('public.intern_task_clean_text(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'intern_task_clean_text_missing';
  END IF;
END;
$postflight$;
