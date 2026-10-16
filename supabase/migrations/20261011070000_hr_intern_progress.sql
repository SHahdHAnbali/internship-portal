-- Feature 9: HR view of intern progress across placements (read-only).
--
-- HR sees, per open or finished placement, the intern, training, Mentor,
-- task progress and weekly-report status, so placements and Mentor
-- assignments can be followed up. Counts only: task and report content stays
-- with the intern and Mentor. Nothing is decided or ranked automatically.

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
  tasks_total integer,
  tasks_open integer,
  tasks_overdue integer,
  tasks_awaiting_review integer,
  tasks_accepted integer,
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
    (SELECT count(*) FROM public.intern_tasks AS t WHERE t.placement_id = ip.id AND t.status <> 'CANCELLED')::integer,
    (SELECT count(*) FROM public.intern_tasks AS t WHERE t.placement_id = ip.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS'))::integer,
    (SELECT count(*) FROM public.intern_tasks AS t
     WHERE t.placement_id = ip.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS') AND t.due_date < current_date)::integer,
    (SELECT count(*) FROM public.intern_tasks AS t
     WHERE t.placement_id = ip.id AND t.status = 'COMPLETED' AND t.review_status IS NULL)::integer,
    (SELECT count(*) FROM public.intern_tasks AS t WHERE t.placement_id = ip.id AND t.review_status = 'ACCEPTED')::integer,
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
      (SELECT max(e.created_at) FROM public.intern_task_events AS e WHERE e.placement_id = ip.id),
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

REVOKE EXECUTE ON FUNCTION public.list_hr_intern_progress(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_hr_intern_progress(uuid) TO service_role;
