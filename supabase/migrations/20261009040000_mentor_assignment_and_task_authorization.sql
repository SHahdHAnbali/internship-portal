-- Link placements to an optional Mentor. Runtime access remains through the
-- NestJS service-role client and scoped RPCs.

ALTER TABLE public.intern_placements
  ADD COLUMN mentor_profile_id uuid NULL
  REFERENCES public.profiles (id)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;

CREATE INDEX intern_placements_mentor_profile_id_idx
  ON public.intern_placements (mentor_profile_id)
  WHERE mentor_profile_id IS NOT NULL;

CREATE FUNCTION public.list_hr_mentors(p_actor_profile_id uuid)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id
  FOR SHARE;

  IF v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email
  FROM public.profiles AS p
  WHERE p.role::text = 'MENTOR'
  ORDER BY p.full_name, p.id;
END;
$function$;

CREATE FUNCTION public.assign_intern_placement_mentor(
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
  v_mentor_role text;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id
  FOR SHARE;

  IF v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  IF p_mentor_profile_id IS NOT NULL THEN
    SELECT p.role::text INTO v_mentor_role
    FROM public.profiles AS p
    WHERE p.id = p_mentor_profile_id
    FOR SHARE;

    IF v_mentor_role IS DISTINCT FROM 'MENTOR' THEN
      RAISE SQLSTATE 'PZ400' USING MESSAGE = 'mentor_profile_required';
    END IF;
  END IF;

  UPDATE public.intern_placements AS ip
  SET mentor_profile_id = p_mentor_profile_id,
      updated_at = now()
  WHERE ip.id = p_placement_id
  RETURNING ip.* INTO v_placement;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  RETURN NEXT v_placement;
END;
$function$;

CREATE FUNCTION public.list_my_mentor_placements(p_mentor_profile_id uuid)
RETURNS TABLE (
  placement_id uuid,
  intern_name text,
  intern_email text,
  company text,
  department text,
  start_date date,
  end_date date,
  status text
)
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
  WHERE p.id = p_mentor_profile_id
  FOR SHARE;

  IF v_role IS DISTINCT FROM 'MENTOR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  RETURN QUERY
  SELECT ip.id, a.full_name, a.email, ip.company, ip.department,
         ip.start_date, ip.end_date, ip.status
  FROM public.intern_placements AS ip
  JOIN public.applicants AS a ON a.id = ip.applicant_id
  WHERE ip.mentor_profile_id = p_mentor_profile_id
  ORDER BY ip.start_date DESC, ip.id
  FOR SHARE OF ip;
END;
$function$;

CREATE FUNCTION public.list_mentor_intern_tasks(
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
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_role
  FROM public.profiles AS p
  WHERE p.id = p_mentor_profile_id
  FOR SHARE;

  IF v_role IS DISTINCT FROM 'MENTOR' THEN
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
  IF v_placement.status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  RETURN QUERY
  SELECT t.*
  FROM public.intern_tasks AS t
  WHERE t.placement_id = p_placement_id
  ORDER BY t.created_at, t.id;
END;
$function$;

CREATE FUNCTION public.create_mentor_intern_task(
  p_mentor_profile_id uuid,
  p_placement_id uuid,
  p_title text,
  p_description text,
  p_due_date date
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
  v_title text;
  v_task public.intern_tasks;
BEGIN
  SELECT p.role::text INTO v_role
  FROM public.profiles AS p
  WHERE p.id = p_mentor_profile_id
  FOR SHARE;

  IF v_role IS DISTINCT FROM 'MENTOR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'mentor_role_required';
  END IF;

  v_title := btrim(
    p_title,
    E' \t\n\r\f' || chr(11) || chr(160) || chr(5760)
      || chr(8192) || chr(8193) || chr(8194) || chr(8195)
      || chr(8196) || chr(8197) || chr(8198) || chr(8199)
      || chr(8200) || chr(8201) || chr(8202) || chr(8232)
      || chr(8233) || chr(8239) || chr(8287) || chr(12288)
      || chr(65279)
  );
  IF v_title IS NULL OR v_title = '' THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'task_title_required';
  END IF;

  -- The placement lock serializes task creation with mentor reassignment and
  -- placement activation/state changes.
  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id
  FOR UPDATE;

  IF NOT FOUND OR v_placement.mentor_profile_id IS DISTINCT FROM p_mentor_profile_id THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_assigned_to_mentor';
  END IF;
  IF v_placement.status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  INSERT INTO public.intern_tasks (
    placement_id, title, description, due_date, status
  ) VALUES (
    p_placement_id,
    v_title,
    NULLIF(btrim(p_description), ''),
    p_due_date,
    'ASSIGNED'
  )
  RETURNING * INTO v_task;

  RETURN NEXT v_task;
END;
$function$;

-- Disable the former HR task API at the database boundary as well as removing
-- its backend routes. Intern task ownership/status RPCs remain enabled.
REVOKE EXECUTE ON FUNCTION public.list_hr_intern_tasks(uuid, uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.create_intern_task(uuid, uuid, text, text, date) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.list_hr_mentors(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_intern_placement_mentor(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_mentor_placements(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_mentor_intern_tasks(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_mentor_intern_task(uuid, uuid, text, text, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_hr_mentors(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_intern_placement_mentor(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_mentor_placements(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mentor_intern_tasks(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_mentor_intern_task(uuid, uuid, text, text, date) TO service_role;
