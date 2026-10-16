-- Refuse to overwrite any pre-existing definition. This also catches overloads
-- with the same function names so their ACLs cannot be silently overlooked.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_intern_placement',
        'activate_intern_placement',
        'update_application_status_safely'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PZ001',
      MESSAGE = 'intern_placement_rpc_name_already_exists';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.create_intern_placement(
  p_actor_profile_id uuid,
  p_application_id uuid,
  p_company text,
  p_department text,
  p_start_date date,
  p_end_date date
)
RETURNS SETOF public.intern_placements
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  -- Match ECMAScript String.prototype.trim() whitespace, including Unicode
  -- separators and BOM, so direct service-role RPC calls normalize consistently.
  v_trim_chars CONSTANT text := E' \t\n\r\f'
    || chr(11) || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
    || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
    || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
    || chr(12288) || chr(65279);
  v_actor_role text;
  v_applicant_id uuid;
  v_application_status text;
  v_company text;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text
    INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id
  FOR SHARE;

  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  v_company := btrim(p_company, v_trim_chars);
  IF v_company IS NULL OR v_company = '' THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'company_required';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'placement_dates_required';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_placement_date_range';
  END IF;

  -- Shared serialization point with activation and HR status updates.
  SELECT a.applicant_id, a.status::text
    INTO v_applicant_id, v_application_status
  FROM public.applications AS a
  WHERE a.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'application_not_found';
  END IF;

  IF v_application_status <> 'SELECTED' OR v_applicant_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'application_not_eligible';
  END IF;

  INSERT INTO public.intern_placements (
    application_id,
    applicant_id,
    company,
    department,
    start_date,
    end_date,
    status
  )
  VALUES (
    p_application_id,
    v_applicant_id,
    v_company,
    NULLIF(btrim(p_department, v_trim_chars), ''),
    p_start_date,
    p_end_date,
    'SCHEDULED'
  )
  RETURNING * INTO v_placement;

  RETURN NEXT v_placement;
  RETURN;
END;
$function$;

CREATE FUNCTION public.activate_intern_placement(
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
  v_updated_profile_id uuid;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text
    INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id
  FOR SHARE;

  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  -- This unlocked lookup only discovers which application row to lock first.
  SELECT ip.application_id
    INTO v_application_id
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  SELECT a.status::text
    INTO v_application_status
  FROM public.applications AS a
  WHERE a.id = v_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_application_missing';
  END IF;

  -- Recheck the parent association while locking the placement row.
  SELECT ip.applicant_id, ip.status::text
    INTO v_applicant_id, v_placement_status
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id
    AND ip.application_id = v_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  IF v_placement_status <> 'SCHEDULED'
     OR v_application_status <> 'SELECTED' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_eligible';
  END IF;

  SELECT a.auth_user_id
    INTO v_auth_user_id
  FROM public.applicants AS a
  WHERE a.id = v_applicant_id
  FOR UPDATE;

  IF NOT FOUND OR v_auth_user_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_auth_link_missing';
  END IF;

  SELECT p.role::text
    INTO v_profile_role
  FROM public.profiles AS p
  WHERE p.id = v_auth_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_profile_role IS DISTINCT FROM 'APPLICANT' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_profile_not_eligible';
  END IF;

  -- Compliant activations serialize on the applicant row; the partial unique
  -- index remains the final defense against competing writes.
  PERFORM 1
  FROM public.intern_placements AS ip
  WHERE ip.applicant_id = v_applicant_id
    AND ip.status = 'ACTIVE'
    AND ip.id <> p_placement_id;

  IF FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_already_has_active_placement';
  END IF;

  UPDATE public.intern_placements AS ip
  SET status = 'ACTIVE',
      updated_at = now()
  WHERE ip.id = p_placement_id
  RETURNING * INTO v_placement;

  UPDATE public.profiles AS p
  SET role = 'INTERN',
      updated_at = now()
  WHERE p.id = v_auth_user_id
    AND p.role::text = 'APPLICANT'
  RETURNING p.id INTO v_updated_profile_id;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_role_changed';
  END IF;

  RETURN NEXT v_placement;
  RETURN;
END;
$function$;

CREATE FUNCTION public.update_application_status_safely(
  p_actor_profile_id uuid,
  p_application_id uuid,
  p_status text
)
RETURNS TABLE (id uuid, status text)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_current_status text;
  v_has_placement boolean;
BEGIN
  SELECT p.role::text
    INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id
  FOR SHARE;

  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  IF p_status IS NULL OR p_status NOT IN (
    'NEW', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'
  ) THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_application_status';
  END IF;

  SELECT a.status::text
    INTO v_current_status
  FROM public.applications AS a
  WHERE a.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'application_not_found';
  END IF;

  IF v_current_status = 'DRAFT' THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'draft_application_not_manageable';
  END IF;

  -- Creation and activation lock this same application row before checking it.
  SELECT EXISTS (
    SELECT 1
    FROM public.intern_placements AS ip
    WHERE ip.application_id = p_application_id
  )
  INTO v_has_placement;

  IF v_has_placement AND p_status <> 'SELECTED' THEN
    RAISE SQLSTATE 'PZ409'
      USING MESSAGE = 'placement_requires_selected_application';
  END IF;

  RETURN QUERY
  UPDATE public.applications AS a
  SET status = p_status
  WHERE a.id = p_application_id
  RETURNING a.id, a.status::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_intern_placement(
  uuid, uuid, text, text, date, date
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.activate_intern_placement(
  uuid, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.update_application_status_safely(
  uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_intern_placement(
  uuid, uuid, text, text, date, date
) TO service_role;

GRANT EXECUTE ON FUNCTION public.activate_intern_placement(
  uuid, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.update_application_status_safely(
  uuid, uuid, text
) TO service_role;
