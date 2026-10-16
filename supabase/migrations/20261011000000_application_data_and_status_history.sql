-- Feature 1/2: applicant data provenance, duplicate protection, HR decisions
-- with enforced transitions and an append-only status history, and safe
-- applicant profile edits. Runtime access remains through the NestJS
-- service-role client; nothing here is granted to anon or authenticated.
--
-- Rollback options: the previous update_application_status_safely function
-- is kept (re-GRANT EXECUTE to service_role); new columns are nullable.

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_application_status_v2',
        'update_my_applicant_profile',
        'applications_protect_original_extraction'
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001',
      MESSAGE = 'application_data_status_history_name_already_exists';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Original AI extraction, kept separately from the reviewed submission.
-- ---------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN original_extracted_data jsonb NULL;

COMMENT ON COLUMN public.applications.original_extracted_data IS
  'AI extraction exactly as produced at CV upload. Set once, never changed. NULL for applications submitted before 2026-10-11, whose original extraction had already been replaced by the reviewed data.';
COMMENT ON COLUMN public.applications.extracted_data IS
  'Applicant data shown for the application: the AI extraction while DRAFT; the applicant-reviewed submission once status <> DRAFT.';

ALTER TABLE public.applications
  ADD CONSTRAINT applications_original_extracted_data_object_check
  CHECK (original_extracted_data IS NULL OR jsonb_typeof(original_extracted_data) = 'object');

-- Backfill only what is genuinely original: a draft has never been reviewed,
-- so its extracted_data is still the AI output. Submitted applications are
-- left NULL because their original extraction no longer exists.
UPDATE public.applications AS a
SET original_extracted_data = a.extracted_data
WHERE a.status = 'DRAFT'
  AND a.extracted_data IS NOT NULL
  AND jsonb_typeof(a.extracted_data) = 'object'
  AND a.original_extracted_data IS NULL;

CREATE FUNCTION public.applications_protect_original_extraction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF OLD.original_extracted_data IS NOT NULL
     AND NEW.original_extracted_data IS DISTINCT FROM OLD.original_extracted_data THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'original_extraction_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.applications_protect_original_extraction()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER applications_protect_original_extraction
  BEFORE UPDATE OF original_extracted_data ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_protect_original_extraction();

-- ---------------------------------------------------------------------------
-- 2. Duplicate protection.
-- ---------------------------------------------------------------------------
-- SHA-256 of the uploaded CV file, set at upload.
ALTER TABLE public.applications
  ADD COLUMN cv_sha256 text NULL
  CONSTRAINT applications_cv_sha256_format_check CHECK (cv_sha256 IS NULL OR cv_sha256 ~ '^[0-9a-f]{64}$');

-- The same CV cannot be active twice for the same training target. Drafts and
-- rejected applications do not block; existing rows (NULL hash) are unaffected.
CREATE UNIQUE INDEX applications_cv_sha256_active_target_key
  ON public.applications (
    cv_sha256,
    (coalesce(internship_id::text, 'other:' || lower(btrim(requested_training))))
  )
  WHERE cv_sha256 IS NOT NULL AND status NOT IN ('DRAFT', 'REJECTED');

-- An applicant cannot submit the same "Other" training request twice. This
-- mirrors applications_applicant_id_internship_id_key for listed internships.
CREATE UNIQUE INDEX applications_applicant_other_training_key
  ON public.applications (applicant_id, (lower(btrim(requested_training))))
  WHERE internship_id IS NULL AND applicant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. HR decisions: rejection reason and status history.
-- ---------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN rejection_reason text NULL;

-- A rejection always has a (non-blank) applicant-visible reason; nothing else does.
ALTER TABLE public.applications
  ADD CONSTRAINT applications_rejection_reason_check CHECK (
    (status = 'REJECTED') = (rejection_reason IS NOT NULL)
    AND (rejection_reason IS NULL
         OR (length(btrim(rejection_reason)) > 0 AND char_length(rejection_reason) <= 1000))
  );

COMMENT ON COLUMN public.applications.rejection_reason IS
  'Reason shown to the applicant when the application is REJECTED.';

CREATE TABLE public.application_status_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  actor_profile_id uuid NOT NULL,
  reason text NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_events_pkey PRIMARY KEY (id),
  CONSTRAINT application_status_events_application_id_fkey
    FOREIGN KEY (application_id) REFERENCES public.applications (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT application_status_events_actor_profile_id_fkey
    FOREIGN KEY (actor_profile_id) REFERENCES public.profiles (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT application_status_events_status_check CHECK (
    from_status IN ('DRAFT','NEW','UNDER_REVIEW','SHORTLISTED','INTERVIEW','SELECTED','REJECTED')
    AND to_status IN ('NEW','UNDER_REVIEW','SHORTLISTED','INTERVIEW','SELECTED','REJECTED')
    AND from_status <> to_status
  ),
  CONSTRAINT application_status_events_reason_check CHECK (
    (to_status = 'REJECTED') = (reason IS NOT NULL)
    AND (reason IS NULL OR (length(btrim(reason)) > 0 AND char_length(reason) <= 1000))
  ),
  CONSTRAINT application_status_events_note_check CHECK (
    note IS NULL OR (length(btrim(note)) > 0 AND char_length(note) <= 2000)
  )
);

COMMENT ON TABLE public.application_status_events IS
  'Append-only application status history. reason is applicant-visible (rejections); note is internal to HR.';

CREATE INDEX application_status_events_application_created_idx
  ON public.application_status_events (application_id, created_at, id);

ALTER TABLE public.application_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.application_status_events FROM PUBLIC, anon, authenticated;
-- Append-only even for the backend.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.application_status_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.application_status_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. HR status changes with enforced transitions.
--    Review stages only move forward (stages may be skipped); SELECTED and
--    REJECTED are final; rejection requires a reason; drafts are not manageable.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.update_application_status_v2(
  p_actor_profile_id uuid,
  p_application_id uuid,
  p_status text,
  p_reason text,
  p_note text
)
RETURNS TABLE (
  id uuid,
  status text,
  rejection_reason text,
  changed_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_current_status text;
  v_reason text;
  v_note text;
  v_current_rank integer;
  v_target_rank integer;
  v_changed_at timestamptz;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id
  FOR SHARE;

  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  IF p_status IS NULL OR p_status NOT IN (
    'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'
  ) THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_application_status';
  END IF;

  v_reason := nullif(btrim(p_reason), '');
  v_note := nullif(btrim(p_note), '');

  IF p_status = 'REJECTED' AND v_reason IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'rejection_reason_required';
  END IF;
  IF p_status <> 'REJECTED' AND v_reason IS NOT NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'reason_only_for_rejection';
  END IF;
  IF char_length(v_reason) > 1000 OR char_length(v_note) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'status_text_too_long';
  END IF;

  -- Shared serialization point with placement creation/activation.
  SELECT a.status::text INTO v_current_status
  FROM public.applications AS a
  WHERE a.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'application_not_found';
  END IF;
  IF v_current_status = 'DRAFT' THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'application_not_found';
  END IF;
  IF v_current_status IN ('SELECTED', 'REJECTED') THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'application_decision_final';
  END IF;
  IF v_current_status = p_status THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'application_status_unchanged';
  END IF;

  v_current_rank := CASE v_current_status
    WHEN 'NEW' THEN 1 WHEN 'UNDER_REVIEW' THEN 2
    WHEN 'SHORTLISTED' THEN 3 WHEN 'INTERVIEW' THEN 4 END;
  v_target_rank := CASE p_status
    WHEN 'UNDER_REVIEW' THEN 2 WHEN 'SHORTLISTED' THEN 3
    WHEN 'INTERVIEW' THEN 4 ELSE 5 END;

  IF v_target_rank <= v_current_rank THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'invalid_status_transition';
  END IF;

  -- Defensive: a placement only ever exists for a SELECTED application.
  IF EXISTS (
    SELECT 1 FROM public.intern_placements AS ip
    WHERE ip.application_id = p_application_id
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_requires_selected_application';
  END IF;

  v_changed_at := clock_timestamp();

  UPDATE public.applications AS a
  SET status = p_status,
      rejection_reason = CASE WHEN p_status = 'REJECTED' THEN v_reason ELSE NULL END
  WHERE a.id = p_application_id;

  INSERT INTO public.application_status_events (
    application_id, from_status, to_status, actor_profile_id, reason, note, created_at
  ) VALUES (
    p_application_id, v_current_status, p_status, p_actor_profile_id,
    CASE WHEN p_status = 'REJECTED' THEN v_reason ELSE NULL END, v_note, v_changed_at
  );

  RETURN QUERY
  SELECT a.id, a.status::text, a.rejection_reason, v_changed_at
  FROM public.applications AS a
  WHERE a.id = p_application_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_application_status_v2(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_application_status_v2(uuid, uuid, text, text, text)
  TO service_role;

-- Retire the unrestricted transition function at the database boundary.
REVOKE EXECUTE ON FUNCTION public.update_application_status_safely(uuid, uuid, text)
  FROM service_role;

-- ---------------------------------------------------------------------------
-- 5. Review submission: same contract as before, plus the "Other" duplicate
--    check and the DRAFT -> NEW history event (actor = the applicant).
-- ---------------------------------------------------------------------------
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

-- CREATE OR REPLACE keeps the existing ACL; restate it explicitly.
REVOKE EXECUTE ON FUNCTION public.submit_application_review_v2(text, jsonb, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_application_review_v2(text, jsonb, uuid, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Applicant self-service profile edits. Only descriptive profile fields;
--    never email, role, applications, decisions or the submitted snapshots.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.update_my_applicant_profile(
  p_auth_user_id uuid,
  p_full_name text,
  p_phone text,
  p_location text,
  p_profile_data jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_applicant_id uuid;
  v_full_name text;
BEGIN
  SELECT p.role::text INTO v_role
  FROM public.profiles AS p
  WHERE p.id = p_auth_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_role NOT IN ('APPLICANT', 'INTERN') THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'applicant_role_required';
  END IF;

  SELECT a.id INTO v_applicant_id
  FROM public.applicants AS a
  WHERE a.auth_user_id = p_auth_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'applicant_profile_not_found';
  END IF;

  v_full_name := btrim(coalesce(p_full_name, ''));
  IF v_full_name = '' OR char_length(v_full_name) > 200
     OR char_length(p_phone) > 50 OR char_length(p_location) > 200 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_profile';
  END IF;

  IF p_profile_data IS NULL
     OR jsonb_typeof(p_profile_data) <> 'object'
     OR (p_profile_data - ARRAY['summary','education','experience','skills','languages','certifications','links']) <> '{}'::jsonb THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_profile';
  END IF;

  UPDATE public.applicants AS a
  SET full_name = v_full_name,
      phone = nullif(btrim(p_phone), ''),
      location = nullif(btrim(p_location), ''),
      profile_data = p_profile_data
  WHERE a.id = v_applicant_id;

  UPDATE public.profiles AS p
  SET full_name = v_full_name,
      updated_at = now()
  WHERE p.id = p_auth_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_my_applicant_profile(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_applicant_profile(uuid, text, text, text, jsonb)
  TO service_role;
