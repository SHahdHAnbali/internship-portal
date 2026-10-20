-- One application per applicant, ever (2026-10-21).
--
-- Business rule: an applicant who has submitted an application (any status
-- other than DRAFT, for any training, with any CV) can never submit another.
-- The backend refuses this before calling submit_application_review_v2
-- (HTTP 409 PREVIOUS_APPLICATION_EXISTS); this migration makes the database
-- function enforce it atomically, including concurrent final submissions of
-- different drafts by the same applicant.
--
-- * submit_application_review_v2 (same signature, return type and privileges)
--   is redefined from 20261014000000 with exactly two additions:
--     1. a transaction-scoped advisory lock keyed on the review email, taken
--        right after the draft's row lock, so submissions for the same
--        identity run one at a time (READ COMMITTED: the check below then sees
--        an application committed by the other submission);
--     2. a check that raises PZ409 'previous_application_exists' when any
--        other non-DRAFT application belongs to this account's applicant row,
--        an applicant row with this email, or carries this review email.
--   It runs after the staff and identity checks (their errors are unchanged)
--   and before the per-training and CV checks, which stay as they were.
-- * No data is changed. No index is added: existing data is not touched and
--   no table constraint changes (see the proposal for an optional index).

CREATE OR REPLACE FUNCTION public.submit_application_review_v2(
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

  -- Portal intake first (shared lock on the settings row, before any
  -- application lock): a closure that has committed always wins.
  PERFORM public.application_intake_require_open();

  SELECT a.* INTO v_application
  FROM public.applications AS a
  WHERE a.review_token_hash = p_review_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'application_review_not_found';
  END IF;

  v_submitted_at := clock_timestamp();

  IF v_application.status <> 'DRAFT'
     OR v_application.review_token_used_at IS NOT NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_token_already_used';
  END IF;

  IF v_application.review_token_expires_at IS NULL
     OR v_application.review_token_expires_at <= v_submitted_at THEN
    RAISE SQLSTATE 'PZ410' USING MESSAGE = 'review_token_expired';
  END IF;

  v_review_email := lower(btrim(coalesce(
    v_application.review_email,
    v_application.extracted_data->>'email',
    ''
  )));

  IF v_review_email = '' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_email_unavailable';
  END IF;

  -- One submission at a time per applicant identity (the review email; the
  -- account and applicant row checked below must carry the same address), so
  -- concurrent submissions of different drafts cannot both pass the
  -- previous-application check. Taken after the draft's row lock; no other
  -- function takes this lock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('submit_application_review_v2:' || v_review_email, 0)
  );

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

  SELECT a.* INTO v_by_auth
  FROM public.applicants AS a
  WHERE a.auth_user_id = p_auth_user_id
  FOR UPDATE;
  v_by_auth_found := FOUND;

  SELECT count(*) INTO v_email_matches
  FROM public.applicants AS a
  WHERE lower(btrim(a.email)) = v_review_email;

  IF v_email_matches > 1 THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_identity_conflict';
  END IF;

  SELECT a.* INTO v_by_email
  FROM public.applicants AS a
  WHERE lower(btrim(a.email)) = v_review_email
  FOR UPDATE;
  v_by_email_found := FOUND;

  IF v_by_email_found
     AND v_by_email.auth_user_id IS DISTINCT FROM p_auth_user_id THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_identity_conflict';
  END IF;

  IF v_by_auth_found
     AND lower(btrim(v_by_auth.email)) <> v_review_email THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_identity_conflict';
  END IF;

  IF p_account_created AND v_by_auth_found THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_account_state_conflict';
  END IF;

  IF v_application.applicant_id IS NOT NULL
     AND (NOT v_by_auth_found OR v_by_auth.id <> v_application.applicant_id) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'legacy_review_owner_mismatch';
  END IF;

  SELECT p.* INTO v_profile
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
    SELECT 1 FROM public.profiles AS p
    WHERE lower(btrim(p.email)) = v_review_email
      AND p.id <> p_auth_user_id
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_account_state_conflict';
  END IF;

  -- Each applicant may submit only one application, ever: any other
  -- application of this identity that has left DRAFT (any status, training
  -- or CV) refuses the submission. The identity is the applicant row of this
  -- account, any applicant row with this email, and the stored review email.
  IF EXISTS (
    SELECT 1
    FROM public.applications AS o
    LEFT JOIN public.applicants AS oa ON oa.id = o.applicant_id
    WHERE o.id <> v_application.id
      AND o.status <> 'DRAFT'
      AND (
        oa.auth_user_id = p_auth_user_id
        OR lower(btrim(oa.email)) = v_review_email
        OR lower(btrim(o.review_email)) = v_review_email
      )
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'previous_application_exists';
  END IF;

  -- One application per applicant per training target (listed or "Other").
  IF v_by_auth_found AND EXISTS (
    SELECT 1 FROM public.applications AS o
    WHERE o.applicant_id = v_by_auth.id
      AND o.id <> v_application.id
      AND (
        (v_application.internship_id IS NOT NULL
          AND o.internship_id = v_application.internship_id)
        OR (v_application.internship_id IS NULL
          AND o.internship_id IS NULL
          AND lower(btrim(o.requested_training)) = lower(btrim(v_application.requested_training)))
      )
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'duplicate_application';
  END IF;

  -- The same CV cannot be active twice for the same training target.
  IF v_application.cv_sha256 IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.applications AS o
    WHERE o.cv_sha256 = v_application.cv_sha256
      AND o.id <> v_application.id
      AND o.status NOT IN ('DRAFT', 'REJECTED')
      AND coalesce(o.internship_id::text, 'other:' || lower(btrim(o.requested_training)))
        = coalesce(v_application.internship_id::text, 'other:' || lower(btrim(v_application.requested_training)))
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'duplicate_application';
  END IF;

  IF v_profile_found THEN
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

    UPDATE public.applicants AS a
    SET full_name = v_full_name,
        phone = v_phone,
        location = v_location,
        cv_url = v_application.cv_path,
        profile_data = v_profile_data
    WHERE a.id = v_applicant_id;
  ELSE
    INSERT INTO public.applicants (
      auth_user_id, full_name, email, phone, location, cv_url, profile_data
    )
    VALUES (
      p_auth_user_id, v_full_name, v_review_email, v_phone, v_location,
      v_application.cv_path, v_profile_data
    )
    RETURNING id INTO v_applicant_id;
  END IF;

  v_extracted_data := p_extracted_data
    || jsonb_build_object('email', v_review_email);

  -- original_extracted_data is deliberately not touched.
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
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_token_no_longer_valid';
  END IF;

  INSERT INTO public.application_status_events (
    application_id, from_status, to_status, actor_profile_id, created_at
  ) VALUES (
    v_application.id, 'DRAFT', 'NEW', p_auth_user_id, v_submitted_at
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_application_review_v2(text, jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_application_review_v2(text, jsonb, uuid, boolean) TO service_role;
