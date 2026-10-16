-- Feature 8: intern weekly training reports.
--
-- * One report per placement and week (week_start = Monday). Only weeks that
--   overlap the placement period and have started can be reported.
-- * States: DRAFT → SUBMITTED → ACCEPTED (final) or RETURNED (Mentor feedback
--   required) → edited and SUBMITTED again.
-- * The intern writes only reports of their own ACTIVE placement; the
--   assigned Mentor of that ACTIVE placement reviews them.
-- * intern_weekly_report_events: append-only history.
-- * list_my_mentor_placements gains reports_awaiting_review.
--
-- Lock order: actor profile (FOR SHARE) → placement (FOR UPDATE) → report.

-- ---------------------------------------------------------------------------
-- 1. Reports.
-- ---------------------------------------------------------------------------
CREATE TABLE public.intern_weekly_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL,
  week_start date NOT NULL,
  summary text NULL,
  learnings text NULL,
  challenges text NULL,
  next_week_plan text NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  submitted_at timestamptz NULL,
  mentor_feedback text NULL,
  reviewed_at timestamptz NULL,
  reviewed_by_profile_id uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intern_weekly_reports_pkey PRIMARY KEY (id),
  CONSTRAINT intern_weekly_reports_placement_id_fkey
    FOREIGN KEY (placement_id) REFERENCES public.intern_placements (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_weekly_reports_one_per_week UNIQUE (placement_id, week_start),
  CONSTRAINT intern_weekly_reports_monday_check CHECK (extract(isodow FROM week_start) = 1),
  CONSTRAINT intern_weekly_reports_status_check CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'RETURNED')),
  CONSTRAINT intern_weekly_reports_lengths_check CHECK (
    (summary IS NULL OR char_length(summary) <= 5000)
    AND (learnings IS NULL OR char_length(learnings) <= 5000)
    AND (challenges IS NULL OR char_length(challenges) <= 5000)
    AND (next_week_plan IS NULL OR char_length(next_week_plan) <= 5000)
    AND (mentor_feedback IS NULL OR char_length(mentor_feedback) <= 2000)
  ),
  -- Anything past DRAFT has been submitted with a summary.
  CONSTRAINT intern_weekly_reports_submitted_check CHECK (
    status = 'DRAFT' OR (submitted_at IS NOT NULL AND summary IS NOT NULL)
  ),
  CONSTRAINT intern_weekly_reports_review_check CHECK (
    (status IN ('ACCEPTED', 'RETURNED')) = (reviewed_at IS NOT NULL)
    AND (status <> 'RETURNED' OR mentor_feedback IS NOT NULL)
  )
);

CREATE INDEX intern_weekly_reports_placement_idx ON public.intern_weekly_reports (placement_id, week_start DESC);

ALTER TABLE public.intern_weekly_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.intern_weekly_reports FROM PUBLIC, anon, authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.intern_weekly_reports FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.intern_weekly_reports TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Append-only report history.
-- ---------------------------------------------------------------------------
CREATE TABLE public.intern_weekly_report_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  placement_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  note text NULL,
  actor_profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intern_weekly_report_events_pkey PRIMARY KEY (id),
  CONSTRAINT intern_weekly_report_events_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES public.intern_weekly_reports (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_weekly_report_events_placement_id_fkey
    FOREIGN KEY (placement_id) REFERENCES public.intern_placements (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_weekly_report_events_actor_profile_id_fkey
    FOREIGN KEY (actor_profile_id) REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_weekly_report_events_type_check CHECK (event_type IN (
    'CREATED', 'UPDATED', 'SUBMITTED', 'ACCEPTED', 'RETURNED'
  )),
  CONSTRAINT intern_weekly_report_events_note_check CHECK (
    note IS NULL OR (length(btrim(note)) > 0 AND char_length(note) <= 2000)
  )
);

CREATE INDEX intern_weekly_report_events_report_idx ON public.intern_weekly_report_events (report_id, created_at);

ALTER TABLE public.intern_weekly_report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.intern_weekly_report_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.intern_weekly_report_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.intern_weekly_report_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Intern: the caller's ACTIVE placement, locked.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.intern_lock_active_placement(p_auth_user_id uuid)
RETURNS public.intern_placements
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_role
  FROM public.profiles AS p WHERE p.id = p_auth_user_id FOR SHARE;
  IF v_role IS DISTINCT FROM 'INTERN' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'intern_role_required';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.applicants AS a
  JOIN public.intern_placements AS ip ON ip.applicant_id = a.id
  WHERE a.auth_user_id = p_auth_user_id AND ip.status = 'ACTIVE'
  FOR UPDATE OF ip;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'active_placement_not_found';
  END IF;
  RETURN v_placement;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Intern: save a draft (create or edit) for a week.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.save_my_weekly_report(
  p_auth_user_id uuid,
  p_week_start date,
  p_summary text,
  p_learnings text,
  p_challenges text,
  p_next_week_plan text
)
RETURNS SETOF public.intern_weekly_reports
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
  v_summary text := public.intern_task_clean_text(p_summary);
  v_learnings text := public.intern_task_clean_text(p_learnings);
  v_challenges text := public.intern_task_clean_text(p_challenges);
  v_plan text := public.intern_task_clean_text(p_next_week_plan);
  v_report public.intern_weekly_reports;
  v_saved public.intern_weekly_reports;
BEGIN
  IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_report_week';
  END IF;
  IF char_length(v_summary) > 5000 OR char_length(v_learnings) > 5000
     OR char_length(v_challenges) > 5000 OR char_length(v_plan) > 5000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'report_text_too_long';
  END IF;

  v_placement := public.intern_lock_active_placement(p_auth_user_id);

  IF p_week_start > current_date
     OR p_week_start + 6 < v_placement.start_date
     OR p_week_start > v_placement.end_date THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'report_week_outside_placement';
  END IF;

  SELECT r.* INTO v_report
  FROM public.intern_weekly_reports AS r
  WHERE r.placement_id = v_placement.id AND r.week_start = p_week_start
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.intern_weekly_reports (placement_id, week_start, summary, learnings, challenges, next_week_plan)
    VALUES (v_placement.id, p_week_start, v_summary, v_learnings, v_challenges, v_plan)
    RETURNING * INTO v_saved;

    INSERT INTO public.intern_weekly_report_events (report_id, placement_id, event_type, to_status, actor_profile_id)
    VALUES (v_saved.id, v_placement.id, 'CREATED', 'DRAFT', p_auth_user_id);
  ELSE
    IF v_report.status NOT IN ('DRAFT', 'RETURNED') THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'report_not_editable';
    END IF;
    -- A returned report was already submitted, so it keeps a summary.
    IF v_report.status = 'RETURNED' AND v_summary IS NULL THEN
      RAISE SQLSTATE 'PZ400' USING MESSAGE = 'report_summary_required';
    END IF;

    UPDATE public.intern_weekly_reports
    SET summary = v_summary, learnings = v_learnings, challenges = v_challenges,
        next_week_plan = v_plan, updated_at = now()
    WHERE id = v_report.id
    RETURNING * INTO v_saved;

    INSERT INTO public.intern_weekly_report_events (report_id, placement_id, event_type, from_status, to_status, actor_profile_id)
    VALUES (v_report.id, v_placement.id, 'UPDATED', v_report.status, v_report.status, p_auth_user_id);
  END IF;

  RETURN NEXT v_saved;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Intern: submit a draft or returned report.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.submit_my_weekly_report(
  p_auth_user_id uuid,
  p_report_id uuid
)
RETURNS SETOF public.intern_weekly_reports
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
  v_report public.intern_weekly_reports;
  v_saved public.intern_weekly_reports;
BEGIN
  v_placement := public.intern_lock_active_placement(p_auth_user_id);

  SELECT r.* INTO v_report
  FROM public.intern_weekly_reports AS r
  WHERE r.id = p_report_id AND r.placement_id = v_placement.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'report_not_found';
  END IF;
  IF v_report.status NOT IN ('DRAFT', 'RETURNED') THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'report_not_editable';
  END IF;
  IF v_report.summary IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'report_summary_required';
  END IF;

  UPDATE public.intern_weekly_reports
  SET status = 'SUBMITTED', submitted_at = now(), reviewed_at = NULL, updated_at = now()
  WHERE id = v_report.id
  RETURNING * INTO v_saved;

  INSERT INTO public.intern_weekly_report_events (report_id, placement_id, event_type, from_status, to_status, actor_profile_id)
  VALUES (v_report.id, v_placement.id, 'SUBMITTED', v_report.status, 'SUBMITTED', p_auth_user_id);

  RETURN NEXT v_saved;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Intern: list reports of the active placement.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_my_weekly_reports(p_auth_user_id uuid)
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
  FROM public.applicants AS a
  JOIN public.intern_placements AS ip ON ip.applicant_id = a.id
  JOIN public.intern_weekly_reports AS r ON r.placement_id = ip.id
  WHERE a.auth_user_id = p_auth_user_id AND ip.status = 'ACTIVE'
  ORDER BY r.week_start DESC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Mentor: list and review reports of an assigned ACTIVE placement.
--    Drafts stay private to the intern.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_mentor_weekly_reports(
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
    SELECT 1 FROM public.profiles AS p WHERE p.id = p_mentor_profile_id AND p.role = 'MENTOR'
  ) THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id AND ip.mentor_profile_id = p_mentor_profile_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_assigned_to_mentor';
  END IF;
  IF v_placement.status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  RETURN QUERY
  SELECT r.* FROM public.intern_weekly_reports AS r
  WHERE r.placement_id = p_placement_id AND r.status <> 'DRAFT'
  ORDER BY r.week_start DESC;
END;
$function$;

CREATE FUNCTION public.review_mentor_weekly_report(
  p_mentor_profile_id uuid,
  p_report_id uuid,
  p_decision text,
  p_feedback text
)
RETURNS SETOF public.intern_weekly_reports
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_feedback text := public.intern_task_clean_text(p_feedback);
  v_placement_id uuid;
  v_placement public.intern_placements;
  v_report public.intern_weekly_reports;
  v_saved public.intern_weekly_reports;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('ACCEPT', 'RETURN') THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_review_decision';
  END IF;
  IF p_decision = 'RETURN' AND v_feedback IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'review_feedback_required';
  END IF;
  IF char_length(v_feedback) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'review_feedback_too_long';
  END IF;

  SELECT p.role::text INTO v_role
  FROM public.profiles AS p WHERE p.id = p_mentor_profile_id FOR SHARE;
  IF v_role IS DISTINCT FROM 'MENTOR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  SELECT r.placement_id INTO v_placement_id FROM public.intern_weekly_reports AS r WHERE r.id = p_report_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'report_not_found';
  END IF;
  SELECT ip.* INTO v_placement FROM public.intern_placements AS ip WHERE ip.id = v_placement_id FOR UPDATE;
  IF v_placement.mentor_profile_id IS DISTINCT FROM p_mentor_profile_id THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'report_not_found';
  END IF;
  IF v_placement.status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  SELECT r.* INTO v_report FROM public.intern_weekly_reports AS r WHERE r.id = p_report_id FOR UPDATE;
  IF v_report.status <> 'SUBMITTED' THEN
    -- Drafts look like missing reports to the Mentor.
    IF v_report.status = 'DRAFT' THEN
      RAISE SQLSTATE 'PZ404' USING MESSAGE = 'report_not_found';
    END IF;
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'report_not_awaiting_review';
  END IF;

  UPDATE public.intern_weekly_reports
  SET status = CASE WHEN p_decision = 'ACCEPT' THEN 'ACCEPTED' ELSE 'RETURNED' END,
      mentor_feedback = v_feedback,
      reviewed_at = now(),
      reviewed_by_profile_id = p_mentor_profile_id,
      updated_at = now()
  WHERE id = v_report.id
  RETURNING * INTO v_saved;

  INSERT INTO public.intern_weekly_report_events (report_id, placement_id, event_type, from_status, to_status, note, actor_profile_id)
  VALUES (v_report.id, v_placement.id,
          CASE WHEN p_decision = 'ACCEPT' THEN 'ACCEPTED' ELSE 'RETURNED' END,
          'SUBMITTED', v_saved.status, v_feedback, p_mentor_profile_id);

  RETURN NEXT v_saved;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Mentor dashboard: add submitted reports awaiting review.
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
  open_tasks integer,
  awaiting_review integer,
  overdue_tasks integer,
  accepted_tasks integer,
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
         (SELECT count(*) FROM public.intern_tasks AS t
          WHERE t.placement_id = ip.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS'))::integer,
         (SELECT count(*) FROM public.intern_tasks AS t
          WHERE t.placement_id = ip.id AND t.status = 'COMPLETED' AND t.review_status IS NULL)::integer,
         (SELECT count(*) FROM public.intern_tasks AS t
          WHERE t.placement_id = ip.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS') AND t.due_date < current_date)::integer,
         (SELECT count(*) FROM public.intern_tasks AS t
          WHERE t.placement_id = ip.id AND t.review_status = 'ACCEPTED')::integer,
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
-- 9. Privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.intern_lock_active_placement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_my_weekly_report(uuid, date, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_my_weekly_report(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_weekly_reports(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_mentor_weekly_reports(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_mentor_weekly_report(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_mentor_placements(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.intern_lock_active_placement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_my_weekly_report(uuid, date, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_my_weekly_report(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_weekly_reports(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mentor_weekly_reports(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_mentor_weekly_report(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_mentor_placements(uuid) TO service_role;
