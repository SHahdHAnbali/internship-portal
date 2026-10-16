-- Feature 7: Mentor task management.
--
-- * Tasks get a priority, their creator, cancellation (reason) and a Mentor
--   review: when the intern marks a task COMPLETED it awaits review; the
--   Mentor accepts it (optional feedback) or requests changes (feedback
--   required), which returns it to IN_PROGRESS.
-- * Mentors edit/cancel/review only tasks of ACTIVE placements assigned to
--   them. Interns change only their own tasks (ASSIGNED → IN_PROGRESS →
--   COMPLETED) and may add a progress note.
-- * intern_task_events: append-only task history (who, what, from → to, note).
--   No history is fabricated for tasks that existed before this migration.
-- * list_my_mentor_placements now returns per-placement task counts.
--
-- Lock order everywhere: actor profile (FOR SHARE) → placement (FOR UPDATE)
-- → task (FOR UPDATE).

-- ---------------------------------------------------------------------------
-- 1. Task columns and states.
-- ---------------------------------------------------------------------------
ALTER TABLE public.intern_tasks
  ADD COLUMN priority text NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN created_by_profile_id uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN review_status text NULL,
  ADD COLUMN mentor_feedback text NULL,
  ADD COLUMN reviewed_at timestamptz NULL,
  ADD COLUMN reviewed_by_profile_id uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN cancelled_at timestamptz NULL,
  ADD COLUMN cancellation_reason text NULL;

ALTER TABLE public.intern_tasks DROP CONSTRAINT intern_tasks_status_check;
ALTER TABLE public.intern_tasks ADD CONSTRAINT intern_tasks_status_check
  CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
ALTER TABLE public.intern_tasks ADD CONSTRAINT intern_tasks_priority_check
  CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH'));
ALTER TABLE public.intern_tasks ADD CONSTRAINT intern_tasks_review_check
  CHECK (
    review_status IS NULL
    OR (review_status = 'ACCEPTED' AND status = 'COMPLETED')
    OR (review_status = 'CHANGES_REQUESTED' AND status = 'IN_PROGRESS')
  );
ALTER TABLE public.intern_tasks ADD CONSTRAINT intern_tasks_feedback_length_check
  CHECK (mentor_feedback IS NULL OR char_length(mentor_feedback) <= 2000);
ALTER TABLE public.intern_tasks ADD CONSTRAINT intern_tasks_cancellation_check
  CHECK (
    (status = 'CANCELLED') = (cancelled_at IS NOT NULL)
    AND (cancelled_at IS NULL) = (cancellation_reason IS NULL)
    AND (cancellation_reason IS NULL OR char_length(cancellation_reason) <= 1000)
  );

-- ---------------------------------------------------------------------------
-- 2. Append-only task history.
-- ---------------------------------------------------------------------------
CREATE TABLE public.intern_task_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  placement_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NULL,
  actor_profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intern_task_events_pkey PRIMARY KEY (id),
  CONSTRAINT intern_task_events_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES public.intern_tasks (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_task_events_placement_id_fkey
    FOREIGN KEY (placement_id) REFERENCES public.intern_placements (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_task_events_actor_profile_id_fkey
    FOREIGN KEY (actor_profile_id) REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_task_events_type_check CHECK (event_type IN (
    'CREATED', 'UPDATED', 'STARTED', 'SUBMITTED', 'ACCEPTED', 'CHANGES_REQUESTED', 'CANCELLED'
  )),
  CONSTRAINT intern_task_events_details_check CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT intern_task_events_note_check CHECK (
    note IS NULL OR (length(btrim(note)) > 0 AND char_length(note) <= 2000)
  )
);

CREATE INDEX intern_task_events_placement_idx ON public.intern_task_events (placement_id, created_at);
CREATE INDEX intern_task_events_task_idx ON public.intern_task_events (task_id, created_at);

ALTER TABLE public.intern_task_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.intern_task_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.intern_task_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.intern_task_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Shared helpers.
-- ---------------------------------------------------------------------------

-- Trims ASCII and Unicode whitespace (same set as the title constraint).
CREATE FUNCTION public.intern_task_clean_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT nullif(btrim(
    p_value,
    E' \t\n\r\f' || chr(11) || chr(160) || chr(5760)
      || chr(8192) || chr(8193) || chr(8194) || chr(8195)
      || chr(8196) || chr(8197) || chr(8198) || chr(8199)
      || chr(8200) || chr(8201) || chr(8202) || chr(8232)
      || chr(8233) || chr(8239) || chr(8287) || chr(12288)
      || chr(65279)
  ), '');
$function$;

-- Locks and returns the task of an ACTIVE placement assigned to the Mentor.
CREATE FUNCTION public.mentor_lock_task(p_mentor_profile_id uuid, p_task_id uuid)
RETURNS public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_placement_id uuid;
  v_placement public.intern_placements;
  v_task public.intern_tasks;
BEGIN
  SELECT p.role::text INTO v_role
  FROM public.profiles AS p WHERE p.id = p_mentor_profile_id FOR SHARE;
  IF v_role IS DISTINCT FROM 'MENTOR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  SELECT t.placement_id INTO v_placement_id FROM public.intern_tasks AS t WHERE t.id = p_task_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'task_not_found';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip WHERE ip.id = v_placement_id FOR UPDATE;
  IF v_placement.mentor_profile_id IS DISTINCT FROM p_mentor_profile_id THEN
    -- Same answer as a missing task: no information about other placements.
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'task_not_found';
  END IF;
  IF v_placement.status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  SELECT t.* INTO v_task FROM public.intern_tasks AS t WHERE t.id = p_task_id FOR UPDATE;
  RETURN v_task;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Mentor: create (now with priority, creator and history).
-- ---------------------------------------------------------------------------
DROP FUNCTION public.create_mentor_intern_task(uuid, uuid, text, text, date);

CREATE FUNCTION public.create_mentor_intern_task(
  p_mentor_profile_id uuid,
  p_placement_id uuid,
  p_title text,
  p_description text,
  p_due_date date,
  p_priority text
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_placement public.intern_placements;
  v_title text := public.intern_task_clean_text(p_title);
  v_description text := public.intern_task_clean_text(p_description);
  v_priority text := coalesce(p_priority, 'MEDIUM');
  v_task public.intern_tasks;
BEGIN
  SELECT p.role::text INTO v_role
  FROM public.profiles AS p WHERE p.id = p_mentor_profile_id FOR SHARE;
  IF v_role IS DISTINCT FROM 'MENTOR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  IF v_title IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'task_title_required';
  END IF;
  IF char_length(v_title) > 200 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'task_title_too_long';
  END IF;
  IF char_length(v_description) > 5000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'task_description_too_long';
  END IF;
  IF v_priority NOT IN ('LOW', 'MEDIUM', 'HIGH') THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_task_priority';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id FOR UPDATE;
  IF NOT FOUND OR v_placement.mentor_profile_id IS DISTINCT FROM p_mentor_profile_id THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_assigned_to_mentor';
  END IF;
  IF v_placement.status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  INSERT INTO public.intern_tasks (
    placement_id, title, description, due_date, status, priority, created_by_profile_id
  ) VALUES (
    p_placement_id, v_title, v_description, p_due_date, 'ASSIGNED', v_priority, p_mentor_profile_id
  )
  RETURNING * INTO v_task;

  INSERT INTO public.intern_task_events (task_id, placement_id, event_type, to_status, details, actor_profile_id)
  VALUES (v_task.id, v_task.placement_id, 'CREATED', 'ASSIGNED',
          jsonb_build_object('title', v_title, 'priority', v_priority, 'dueDate', p_due_date),
          p_mentor_profile_id);

  RETURN NEXT v_task;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Mentor: edit an open task.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.update_mentor_intern_task(
  p_mentor_profile_id uuid,
  p_task_id uuid,
  p_title text,
  p_description text,
  p_due_date date,
  p_priority text
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_task public.intern_tasks;
  v_title text := public.intern_task_clean_text(p_title);
  v_description text := public.intern_task_clean_text(p_description);
  v_changes jsonb := '{}'::jsonb;
  v_updated public.intern_tasks;
BEGIN
  IF v_title IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'task_title_required';
  END IF;
  IF char_length(v_title) > 200 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'task_title_too_long';
  END IF;
  IF char_length(v_description) > 5000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'task_description_too_long';
  END IF;
  IF p_priority IS NULL OR p_priority NOT IN ('LOW', 'MEDIUM', 'HIGH') THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_task_priority';
  END IF;

  v_task := public.mentor_lock_task(p_mentor_profile_id, p_task_id);
  IF v_task.status NOT IN ('ASSIGNED', 'IN_PROGRESS') THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'task_not_editable';
  END IF;

  IF v_task.title IS DISTINCT FROM v_title THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('from', v_task.title, 'to', v_title));
  END IF;
  IF v_task.description IS DISTINCT FROM v_description THEN
    v_changes := v_changes || jsonb_build_object('description', true);
  END IF;
  IF v_task.due_date IS DISTINCT FROM p_due_date THEN
    v_changes := v_changes || jsonb_build_object('dueDate', jsonb_build_object('from', v_task.due_date, 'to', p_due_date));
  END IF;
  IF v_task.priority IS DISTINCT FROM p_priority THEN
    v_changes := v_changes || jsonb_build_object('priority', jsonb_build_object('from', v_task.priority, 'to', p_priority));
  END IF;
  IF v_changes = '{}'::jsonb THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'task_unchanged';
  END IF;

  UPDATE public.intern_tasks
  SET title = v_title, description = v_description, due_date = p_due_date,
      priority = p_priority, updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_updated;

  INSERT INTO public.intern_task_events (task_id, placement_id, event_type, from_status, to_status, details, actor_profile_id)
  VALUES (v_task.id, v_task.placement_id, 'UPDATED', v_task.status, v_task.status, v_changes, p_mentor_profile_id);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Mentor: cancel an open task (reason required).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cancel_mentor_intern_task(
  p_mentor_profile_id uuid,
  p_task_id uuid,
  p_reason text
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_reason text := public.intern_task_clean_text(p_reason);
  v_task public.intern_tasks;
  v_updated public.intern_tasks;
BEGIN
  IF v_reason IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'cancellation_reason_required';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'cancellation_reason_too_long';
  END IF;

  v_task := public.mentor_lock_task(p_mentor_profile_id, p_task_id);
  IF v_task.status NOT IN ('ASSIGNED', 'IN_PROGRESS') THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'task_not_cancellable';
  END IF;

  UPDATE public.intern_tasks
  SET status = 'CANCELLED', review_status = NULL, cancelled_at = now(),
      cancellation_reason = v_reason, updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_updated;

  INSERT INTO public.intern_task_events (task_id, placement_id, event_type, from_status, to_status, note, actor_profile_id)
  VALUES (v_task.id, v_task.placement_id, 'CANCELLED', v_task.status, 'CANCELLED', v_reason, p_mentor_profile_id);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Mentor: review a completed task.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.review_mentor_intern_task(
  p_mentor_profile_id uuid,
  p_task_id uuid,
  p_decision text,
  p_feedback text
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_feedback text := public.intern_task_clean_text(p_feedback);
  v_task public.intern_tasks;
  v_updated public.intern_tasks;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('ACCEPT', 'REQUEST_CHANGES') THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_review_decision';
  END IF;
  IF p_decision = 'REQUEST_CHANGES' AND v_feedback IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'review_feedback_required';
  END IF;
  IF char_length(v_feedback) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'review_feedback_too_long';
  END IF;

  v_task := public.mentor_lock_task(p_mentor_profile_id, p_task_id);
  IF v_task.status <> 'COMPLETED' OR v_task.review_status IS NOT NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'task_not_awaiting_review';
  END IF;

  UPDATE public.intern_tasks
  SET status = CASE WHEN p_decision = 'ACCEPT' THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,
      review_status = CASE WHEN p_decision = 'ACCEPT' THEN 'ACCEPTED' ELSE 'CHANGES_REQUESTED' END,
      mentor_feedback = v_feedback,
      reviewed_at = now(),
      reviewed_by_profile_id = p_mentor_profile_id,
      updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_updated;

  INSERT INTO public.intern_task_events (task_id, placement_id, event_type, from_status, to_status, note, actor_profile_id)
  VALUES (v_task.id, v_task.placement_id,
          CASE WHEN p_decision = 'ACCEPT' THEN 'ACCEPTED' ELSE 'CHANGES_REQUESTED' END,
          'COMPLETED', v_updated.status, v_feedback, p_mentor_profile_id);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Intern: progress their own task, with an optional progress note.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.update_my_intern_task_status(uuid, uuid, text);

CREATE FUNCTION public.update_my_intern_task_status(
  p_auth_user_id uuid,
  p_task_id uuid,
  p_status text,
  p_note text
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_note text := public.intern_task_clean_text(p_note);
  v_placement_id uuid;
  v_task public.intern_tasks;
  v_updated public.intern_tasks;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('IN_PROGRESS', 'COMPLETED') THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_task_status';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'progress_note_too_long';
  END IF;

  SELECT p.role::text INTO v_role
  FROM public.profiles AS p WHERE p.id = p_auth_user_id FOR SHARE;
  IF v_role IS DISTINCT FROM 'INTERN' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'intern_role_required';
  END IF;

  -- Lock the authenticated user's active placement first, then their task.
  SELECT ip.id INTO v_placement_id
  FROM public.applicants AS a
  JOIN public.intern_placements AS ip ON ip.applicant_id = a.id
  WHERE a.auth_user_id = p_auth_user_id
    AND ip.status = 'ACTIVE'
  FOR UPDATE OF ip;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'active_placement_not_found';
  END IF;

  SELECT t.* INTO v_task
  FROM public.intern_tasks AS t
  WHERE t.id = p_task_id AND t.placement_id = v_placement_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'task_not_found';
  END IF;

  IF NOT (
    (v_task.status = 'ASSIGNED' AND p_status = 'IN_PROGRESS')
    OR (v_task.status = 'IN_PROGRESS' AND p_status = 'COMPLETED')
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'invalid_task_status_transition';
  END IF;

  -- Completing (again) sends the task back to the Mentor for review.
  UPDATE public.intern_tasks
  SET status = p_status,
      review_status = CASE WHEN p_status = 'COMPLETED' THEN NULL ELSE review_status END,
      updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_updated;

  INSERT INTO public.intern_task_events (task_id, placement_id, event_type, from_status, to_status, note, actor_profile_id)
  VALUES (v_task.id, v_task.placement_id,
          CASE WHEN p_status = 'IN_PROGRESS' THEN 'STARTED' ELSE 'SUBMITTED' END,
          v_task.status, p_status, v_note, p_auth_user_id);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Mentor dashboard: placements with task counts.
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
  accepted_tasks integer
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
         count(t.id) FILTER (WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS'))::integer,
         count(t.id) FILTER (WHERE t.status = 'COMPLETED' AND t.review_status IS NULL)::integer,
         count(t.id) FILTER (WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS') AND t.due_date < current_date)::integer,
         count(t.id) FILTER (WHERE t.review_status = 'ACCEPTED')::integer
  FROM public.intern_placements AS ip
  JOIN public.applicants AS a ON a.id = ip.applicant_id
  JOIN public.internships AS i ON i.id = ip.internship_id
  LEFT JOIN public.intern_tasks AS t ON t.placement_id = ip.id
  WHERE ip.mentor_profile_id = p_mentor_profile_id
  GROUP BY ip.id, a.full_name, a.email, i.title
  ORDER BY (ip.status = 'ACTIVE') DESC, ip.start_date DESC, ip.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 10. Task history for the assigned Mentor of an ACTIVE placement.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_mentor_task_events(
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
  SELECT e.id, e.task_id, e.event_type, e.from_status, e.to_status, e.details, e.note,
         coalesce(p.full_name, p.email), p.role, e.created_at
  FROM public.intern_task_events AS e
  JOIN public.profiles AS p ON p.id = e.actor_profile_id
  WHERE e.placement_id = p_placement_id
  ORDER BY e.created_at, e.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 11. Privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.intern_task_clean_text(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mentor_lock_task(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_mentor_intern_task(uuid, uuid, text, text, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_mentor_intern_task(uuid, uuid, text, text, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_mentor_intern_task(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_mentor_intern_task(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_my_intern_task_status(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_mentor_placements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_mentor_task_events(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.intern_task_clean_text(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_lock_task(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_mentor_intern_task(uuid, uuid, text, text, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_mentor_intern_task(uuid, uuid, text, text, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_mentor_intern_task(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_mentor_intern_task(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_my_intern_task_status(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_mentor_placements(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mentor_task_events(uuid, uuid) TO service_role;
