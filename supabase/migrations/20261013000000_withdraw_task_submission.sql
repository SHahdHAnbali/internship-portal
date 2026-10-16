-- Interns may withdraw a task submission (COMPLETED, not yet reviewed) back to
-- IN_PROGRESS to correct it.
--
-- Rules (approved by the owner on 2026-10-13):
-- * Only the intern of the task's ACTIVE placement (the caller's own task).
-- * Only while the submission awaits review: status COMPLETED and
--   review_status IS NULL. Accepted tasks, tasks returned with changes
--   requested, open or cancelled tasks cannot be withdrawn.
-- * Only before the deadline: the due date is a calendar day and counts in
--   full in the organisation's timezone (Asia/Hebron). Withdrawal closes at
--   00:00 Asia/Hebron on the day after the due date. The database clock
--   decides, never the client.
-- * Tasks without a due date cannot be withdrawn (no open-ended window).
-- * Nothing else on the task changes; the submission stays in the history
--   (SUBMITTED event) and the withdrawal adds a WITHDRAWN event.
--
-- Concurrency: like the Mentor review (mentor_lock_task), withdrawal locks the
-- placement FOR UPDATE and then the task FOR UPDATE, so a withdrawal and a
-- review of the same submission serialize: whichever commits second sees the
-- new state and is refused.

-- ---------------------------------------------------------------------------
-- 1. History: allow WITHDRAWN events.
-- ---------------------------------------------------------------------------
ALTER TABLE public.intern_task_events DROP CONSTRAINT intern_task_events_type_check;
ALTER TABLE public.intern_task_events ADD CONSTRAINT intern_task_events_type_check CHECK (event_type IN (
  'CREATED', 'UPDATED', 'STARTED', 'SUBMITTED', 'ACCEPTED', 'CHANGES_REQUESTED', 'CANCELLED', 'WITHDRAWN'
));

-- ---------------------------------------------------------------------------
-- 2. Deadline rule, separate so it can be tested at exact instants.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.intern_task_withdrawal_open(p_due_date date, p_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT p_due_date IS NOT NULL
     AND p_at IS NOT NULL
     AND (p_at AT TIME ZONE 'Asia/Hebron')::date <= p_due_date;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Withdrawal.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.withdraw_my_intern_task_submission(
  p_auth_user_id uuid,
  p_task_id uuid
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
  v_task public.intern_tasks;
  v_updated public.intern_tasks;
BEGIN
  -- Role check plus the caller's own ACTIVE placement, locked FOR UPDATE.
  v_placement := public.intern_lock_active_placement(p_auth_user_id);

  SELECT t.* INTO v_task
  FROM public.intern_tasks AS t
  WHERE t.id = p_task_id AND t.placement_id = v_placement.id
  FOR UPDATE;
  IF NOT FOUND THEN
    -- Same answer for missing tasks and other interns' tasks.
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'task_not_found';
  END IF;

  IF v_task.status <> 'COMPLETED' OR v_task.review_status IS NOT NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'task_not_withdrawable';
  END IF;
  IF v_task.due_date IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'task_withdrawal_requires_due_date';
  END IF;
  IF NOT public.intern_task_withdrawal_open(v_task.due_date, now()) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'task_withdrawal_deadline_passed';
  END IF;

  UPDATE public.intern_tasks
  SET status = 'IN_PROGRESS', updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_updated;

  INSERT INTO public.intern_task_events (task_id, placement_id, event_type, from_status, to_status, details, actor_profile_id)
  VALUES (v_task.id, v_task.placement_id, 'WITHDRAWN', 'COMPLETED', 'IN_PROGRESS',
          jsonb_build_object('dueDate', v_task.due_date), p_auth_user_id);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.intern_task_withdrawal_open(date, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.withdraw_my_intern_task_submission(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intern_task_withdrawal_open(date, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_my_intern_task_submission(uuid, uuid) TO service_role;
