-- Assigned tasks for active Internship Portal placements.
-- Runtime access is through the NestJS service-role client and scoped RPCs.

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'list_hr_intern_tasks',
        'create_intern_task',
        'list_my_intern_tasks',
        'update_my_intern_task_status'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PZ001',
      MESSAGE = 'intern_task_rpc_name_already_exists';
  END IF;
END;
$preflight$;

CREATE TABLE public.intern_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL,
  title text NOT NULL,
  description text NULL,
  due_date date NULL,
  status text NOT NULL DEFAULT 'ASSIGNED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intern_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT intern_tasks_placement_id_fkey
    FOREIGN KEY (placement_id)
    REFERENCES public.intern_placements (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT intern_tasks_title_nonblank_check
    CHECK (
      length(btrim(
        title,
        E' \t\n\r\f' || chr(11) || chr(160) || chr(5760)
          || chr(8192) || chr(8193) || chr(8194) || chr(8195)
          || chr(8196) || chr(8197) || chr(8198) || chr(8199)
          || chr(8200) || chr(8201) || chr(8202) || chr(8232)
          || chr(8233) || chr(8239) || chr(8287) || chr(12288)
          || chr(65279)
      )) > 0
    ),
  CONSTRAINT intern_tasks_title_length_check
    CHECK (char_length(title) <= 200),
  CONSTRAINT intern_tasks_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 5000),
  CONSTRAINT intern_tasks_status_check
    CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED'))
);

CREATE INDEX intern_tasks_placement_created_at_idx
  ON public.intern_tasks (placement_id, created_at, id);

ALTER TABLE public.intern_tasks ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.intern_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.intern_tasks TO service_role;

CREATE FUNCTION public.list_hr_intern_tasks(
  p_actor_profile_id uuid,
  p_placement_id uuid
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_placement_status text;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id
  FOR SHARE;

  IF v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  SELECT ip.status INTO v_placement_status
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;
  IF v_placement_status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_active';
  END IF;

  RETURN QUERY
  SELECT t.*
  FROM public.intern_tasks AS t
  WHERE t.placement_id = p_placement_id
  ORDER BY t.created_at, t.id;
END;
$function$;

CREATE FUNCTION public.create_intern_task(
  p_actor_profile_id uuid,
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
  v_actor_role text;
  v_placement_status text;
  v_title text;
  v_task public.intern_tasks;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id
  FOR SHARE;

  IF v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
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

  -- Lock the placement while checking its state and inserting the task.
  SELECT ip.status INTO v_placement_status
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;
  IF v_placement_status <> 'ACTIVE' THEN
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

CREATE FUNCTION public.list_my_intern_tasks(
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
  FROM public.applicants AS a
  JOIN public.intern_placements AS ip ON ip.applicant_id = a.id
  JOIN public.intern_tasks AS t ON t.placement_id = ip.id
  WHERE a.auth_user_id = p_auth_user_id
    AND ip.status = 'ACTIVE'
  ORDER BY t.created_at, t.id;
END;
$function$;

CREATE FUNCTION public.update_my_intern_task_status(
  p_auth_user_id uuid,
  p_task_id uuid,
  p_status text
)
RETURNS SETOF public.intern_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_placement_id uuid;
  v_current_status text;
  v_task public.intern_tasks;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('IN_PROGRESS', 'COMPLETED') THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_task_status';
  END IF;

  SELECT p.role::text INTO v_role
  FROM public.profiles AS p
  WHERE p.id = p_auth_user_id
  FOR SHARE;

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

  SELECT t.status INTO v_current_status
  FROM public.intern_tasks AS t
  WHERE t.id = p_task_id
    AND t.placement_id = v_placement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'task_not_found';
  END IF;

  IF NOT (
    (v_current_status = 'ASSIGNED' AND p_status = 'IN_PROGRESS')
    OR (v_current_status = 'IN_PROGRESS' AND p_status = 'COMPLETED')
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'invalid_task_status_transition';
  END IF;

  UPDATE public.intern_tasks AS t
  SET status = p_status,
      updated_at = now()
  WHERE t.id = p_task_id
    AND t.placement_id = v_placement_id
  RETURNING * INTO v_task;

  RETURN NEXT v_task;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_hr_intern_tasks(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_intern_task(uuid, uuid, text, text, date)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_intern_tasks(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_my_intern_task_status(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_hr_intern_tasks(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_intern_task(uuid, uuid, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_intern_tasks(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_my_intern_task_status(uuid, uuid, text) TO service_role;
