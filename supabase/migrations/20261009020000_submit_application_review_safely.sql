-- A valid review token is claimed and all Postgres-owned submission changes
-- are committed as one transaction by this function invocation.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'submit_application_review_safely'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PZ001',
      MESSAGE = 'submit_application_review_safely_already_exists';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.submit_application_review_safely(
  p_review_token_hash text,
  p_extracted_data jsonb,
  p_new_auth_user_id uuid
)
RETURNS TABLE (
  application_id uuid,
  status text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_application public.applications%ROWTYPE;
  v_applicant public.applicants%ROWTYPE;
  v_auth_user_id uuid;
  v_email text;
  v_full_name text;
  v_phone text;
  v_location text;
  v_profile_data jsonb;
  v_submitted_at timestamptz;
BEGIN
  IF p_review_token_hash IS NULL
     OR p_review_token_hash !~ '^[0-9a-f]{64}$'
     OR p_extracted_data IS NULL
     OR jsonb_typeof(p_extracted_data) IS DISTINCT FROM 'object' THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_review_submission';
  END IF;

  -- The application row is the single-use serialization point. Every caller
  -- rechecks token state after acquiring this lock before touching profiles.
  SELECT a.*
    INTO v_application
  FROM public.applications AS a
  WHERE a.review_token_hash = p_review_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'application_review_not_found';
  END IF;

  -- Evaluate expiry only after any wait for the application's row lock.
  v_submitted_at := clock_timestamp();

  IF v_application.status <> 'DRAFT'
     OR v_application.review_token_used_at IS NOT NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_token_already_used';
  END IF;

  IF v_application.review_token_expires_at IS NULL
     OR v_application.review_token_expires_at <= v_submitted_at THEN
    RAISE SQLSTATE 'PZ410' USING MESSAGE = 'review_token_expired';
  END IF;

  IF v_application.applicant_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_applicant_not_linked';
  END IF;

  v_email := lower(btrim(coalesce(p_extracted_data->>'email', '')));
  v_full_name := btrim(coalesce(p_extracted_data->>'fullName', ''));
  v_phone := nullif(btrim(coalesce(p_extracted_data->>'phone', '')), '');
  v_location := nullif(btrim(coalesce(p_extracted_data->>'location', '')), '');

  IF v_email = '' OR v_full_name = '' THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'review_name_and_email_required';
  END IF;

  SELECT a.*
    INTO v_applicant
  FROM public.applicants AS a
  WHERE a.id = v_application.applicant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_applicant_missing';
  END IF;

  IF v_applicant.auth_user_id IS NULL THEN
    IF p_new_auth_user_id IS NULL THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_auth_user_required';
    END IF;
    v_auth_user_id := p_new_auth_user_id;
  ELSE
    IF p_new_auth_user_id IS NOT NULL THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_auth_link_changed';
    END IF;
    v_auth_user_id := v_applicant.auth_user_id;
  END IF;

  v_profile_data := jsonb_build_object(
    'summary', p_extracted_data->'summary',
    'education', p_extracted_data->'education',
    'experience', p_extracted_data->'experience',
    'skills', p_extracted_data->'skills',
    'languages', p_extracted_data->'languages',
    'certifications', p_extracted_data->'certifications',
    'links', p_extracted_data->'links'
  );

  -- On conflict, update profile fields while deliberately preserving role.
  INSERT INTO public.profiles (id, full_name, email, role, updated_at)
  VALUES (
    v_auth_user_id,
    v_full_name,
    coalesce(v_applicant.email, v_email),
    'APPLICANT',
    v_submitted_at
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = EXCLUDED.updated_at;

  UPDATE public.applicants AS a
  SET auth_user_id = v_auth_user_id,
      full_name = v_full_name,
      email = v_email,
      phone = v_phone,
      location = v_location,
      cv_url = v_application.cv_path,
      profile_data = v_profile_data
  WHERE a.id = v_applicant.id;

  RETURN QUERY
  UPDATE public.applications AS a
  SET extracted_data = p_extracted_data,
      status = 'NEW',
      submitted_at = v_submitted_at,
      review_token_used_at = v_submitted_at
  WHERE a.id = v_application.id
    AND a.status = 'DRAFT'
    AND a.review_token_hash = p_review_token_hash
    AND a.review_token_used_at IS NULL
    AND a.review_token_expires_at > v_submitted_at
  RETURNING a.id, a.status::text, a.submitted_at;

  IF NOT FOUND THEN
    -- This exception rolls back the applicant/profile updates above too.
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_token_no_longer_valid';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_application_review_safely(
  text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_application_review_safely(
  text, jsonb, uuid
) TO service_role;
