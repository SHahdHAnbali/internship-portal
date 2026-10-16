-- Defer applicant account/profile provisioning until a review link is used,
-- and bind every review to the immutable address the link was sent to.
-- Runtime access remains through the NestJS service-role client.
--
-- Rollback option: the previous submit_application_review_safely function is
-- kept in place. Re-enable it with
--   GRANT EXECUTE ON FUNCTION public.submit_application_review_safely(text, jsonb, uuid) TO service_role;
-- after reverting the backend to the matching code.

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'submit_application_review_v2'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PZ001',
      MESSAGE = 'submit_application_review_v2_already_exists';
  END IF;
END;
$preflight$;

-- The normalized address the review link was emailed to. Set once when the
-- draft is created and never taken from reviewed (client-supplied) data.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS review_email text NULL;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_review_email_normalized_check
  CHECK (
    review_email IS NULL
    OR (review_email = lower(btrim(review_email)) AND review_email <> '')
  );

-- p_auth_user_id is either an Auth user created by the backend in the same
-- request after the token and email were validated (p_account_created = true),
-- or the user of a verified session whose confirmed email matches the review
-- email (p_account_created = false). Existing accounts are never selected by
-- email alone.
CREATE FUNCTION public.submit_application_review_v2(
  p_review_token_hash text,
  p_extracted_data jsonb,
  p_auth_user_id uuid,
  p_account_created boolean
)
RETURNS TABLE (
  application_id uuid,
  applicant_id uuid,
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
  v_review_email text;
  v_submitted_email text;
  v_full_name text;
  v_phone text;
  v_location text;
  v_profile public.profiles%ROWTYPE;
  v_profile_found boolean;
  v_by_auth public.applicants%ROWTYPE;
  v_by_auth_found boolean;
  v_by_email public.applicants%ROWTYPE;
  v_by_email_found boolean;
  v_email_matches integer;
  v_applicant_id uuid;
  v_profile_data jsonb;
  v_extracted_data jsonb;
  v_submitted_at timestamptz;
BEGIN
  IF p_review_token_hash IS NULL
     OR p_review_token_hash !~ '^[0-9a-f]{64}$'
     OR p_extracted_data IS NULL
     OR jsonb_typeof(p_extracted_data) IS DISTINCT FROM 'object'
     OR p_auth_user_id IS NULL
     OR p_account_created IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_review_submission';
  END IF;

  -- The application row is the single-use serialization point. Lock order
  -- (applications -> applicants -> profiles) matches the placement functions.
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

  -- Legacy drafts (created before review_email existed) were emailed to the
  -- address stored in their original extracted data.
  v_review_email := lower(btrim(coalesce(
    v_application.review_email,
    v_application.extracted_data->>'email',
    ''
  )));

  IF v_review_email = '' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_email_unavailable';
  END IF;

  v_submitted_email := lower(btrim(coalesce(p_extracted_data->>'email', '')));
  IF v_submitted_email <> v_review_email THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'review_email_mismatch';
  END IF;

  v_full_name := btrim(coalesce(p_extracted_data->>'fullName', ''));
  IF v_full_name = '' THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'review_name_required';
  END IF;

  v_phone := nullif(btrim(coalesce(p_extracted_data->>'phone', '')), '');
  v_location := nullif(btrim(coalesce(p_extracted_data->>'location', '')), '');

  -- Applicant resolution. Records are never merged or relinked: any
  -- disagreement between the account link and the email is refused.
  SELECT a.*
    INTO v_by_auth
  FROM public.applicants AS a
  WHERE a.auth_user_id = p_auth_user_id
  FOR UPDATE;
  v_by_auth_found := FOUND;

  SELECT count(*)
    INTO v_email_matches
  FROM public.applicants AS a
  WHERE lower(btrim(a.email)) = v_review_email;

  IF v_email_matches > 1 THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_identity_conflict';
  END IF;

  SELECT a.*
    INTO v_by_email
  FROM public.applicants AS a
  WHERE lower(btrim(a.email)) = v_review_email
  FOR UPDATE;
  v_by_email_found := FOUND;

  IF v_by_email_found
     AND v_by_email.auth_user_id IS DISTINCT FROM p_auth_user_id THEN
    -- Includes applicant rows with no Auth link: their owner is ambiguous.
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_identity_conflict';
  END IF;

  IF v_by_auth_found
     AND lower(btrim(v_by_auth.email)) <> v_review_email THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_identity_conflict';
  END IF;

  IF p_account_created AND v_by_auth_found THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_account_state_conflict';
  END IF;

  -- A legacy draft linked to an applicant at upload time is usable only by
  -- that applicant's own account.
  IF v_application.applicant_id IS NOT NULL
     AND (NOT v_by_auth_found OR v_by_auth.id <> v_application.applicant_id) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'legacy_review_owner_mismatch';
  END IF;

  -- Account/profile checks. Staff accounts never enter the applicant workflow.
  SELECT p.*
    INTO v_profile
  FROM public.profiles AS p
  WHERE p.id = p_auth_user_id
  FOR UPDATE;
  v_profile_found := FOUND;

  IF v_profile_found THEN
    IF p_account_created THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_account_state_conflict';
    END IF;

    IF v_profile.role::text NOT IN ('APPLICANT', 'INTERN') THEN
      RAISE SQLSTATE 'PZ403' USING MESSAGE = 'staff_account_not_eligible';
    END IF;

    IF lower(btrim(v_profile.email)) <> v_review_email THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_account_email_mismatch';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE lower(btrim(p.email)) = v_review_email
      AND p.id <> p_auth_user_id
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_account_state_conflict';
  END IF;

  IF v_by_auth_found
     AND v_application.internship_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.applications AS o
       WHERE o.applicant_id = v_by_auth.id
         AND o.internship_id = v_application.internship_id
         AND o.id <> v_application.id
     ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'duplicate_application';
  END IF;

  IF v_profile_found THEN
    -- Preserve role and email; only the reviewed display name is updated.
    UPDATE public.profiles AS p
    SET full_name = v_full_name,
        updated_at = v_submitted_at
    WHERE p.id = p_auth_user_id;
  ELSE
    INSERT INTO public.profiles (id, full_name, email, role, updated_at)
    VALUES (p_auth_user_id, v_full_name, v_review_email, 'APPLICANT', v_submitted_at);
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

  IF v_by_auth_found THEN
    v_applicant_id := v_by_auth.id;

    -- applicants.email is deliberately never changed through review.
    UPDATE public.applicants AS a
    SET full_name = v_full_name,
        phone = v_phone,
        location = v_location,
        cv_url = v_application.cv_path,
        profile_data = v_profile_data
    WHERE a.id = v_applicant_id;
  ELSE
    INSERT INTO public.applicants (
      auth_user_id,
      full_name,
      email,
      phone,
      location,
      cv_url,
      profile_data
    )
    VALUES (
      p_auth_user_id,
      v_full_name,
      v_review_email,
      v_phone,
      v_location,
      v_application.cv_path,
      v_profile_data
    )
    RETURNING id INTO v_applicant_id;
  END IF;

  v_extracted_data := p_extracted_data
    || jsonb_build_object('email', v_review_email);

  RETURN QUERY
  UPDATE public.applications AS a
  SET applicant_id = v_applicant_id,
      extracted_data = v_extracted_data,
      review_email = v_review_email,
      status = 'NEW',
      submitted_at = v_submitted_at,
      review_token_used_at = v_submitted_at
  WHERE a.id = v_application.id
    AND a.status = 'DRAFT'
    AND a.review_token_hash = p_review_token_hash
    AND a.review_token_used_at IS NULL
    AND a.review_token_expires_at > v_submitted_at
  RETURNING a.id, a.applicant_id, a.status::text, a.submitted_at;

  IF NOT FOUND THEN
    -- This exception rolls back every profile/applicant change above too.
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_token_no_longer_valid';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_application_review_v2(
  text, jsonb, uuid, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_application_review_v2(
  text, jsonb, uuid, boolean
) TO service_role;

-- Retire the previous submission path at the database boundary. It accepted
-- reviewed email changes and linked applicants created before verification.
REVOKE EXECUTE ON FUNCTION public.submit_application_review_safely(
  text, jsonb, uuid
) FROM service_role;
