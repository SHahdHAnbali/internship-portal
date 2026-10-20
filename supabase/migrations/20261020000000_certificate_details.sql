-- Certificate details (2026-10-20). Extends 20261019000000 (applied together
-- with it; neither is live yet).
--
-- The certificate states the training by its internship title
-- (training_title, copied from internships.title of the placement's resolved
-- internship, as since 20261019000000); there is no separate classification.
--
-- * Certificates additionally copy, when issued:
--     placement_start_date   the placement's start date; with completion_date
--                            (Asia/Hebron date of completed_at) it fixes the
--                            actual duration, computed by
--                            internship_certificate_duration (completion day
--                            included; the planned end date is never used)
--     hr_signatory_name      full name of the HR user recorded as completing
--                            the placement (latest COMPLETED event); NULL if
--                            unknown or unnamed (never an email address)
--     mentor_signatory_name  full name of the Mentor assigned to the
--                            placement (fixed once completed); NULL if none
--   All are resolved by internship_certificate_details; the INSERT guard
--   accepts only those values, so no caller can supply them. A reissue
--   resolves them again for the new record (the HR signatory stays the
--   completing HR user, not the reissuing one); the superseded record keeps
--   its own copies.
-- * Audit: certificate events also record the reissue reason (on the
--   SUPERSEDED event of the old record and the ISSUED event of the new one).
-- * The company and issuer are always "Progineer Technologies" (issuer_name,
--   fixed since 20261019000000); intern_placements.company is never used.
-- * Certificates issued before this migration get the new columns filled
--   once from the same authoritative sources; their existing data is not
--   changed. Values that cannot be established stay NULL.
-- * Access is unchanged: service_role only, SECURITY INVOKER, pinned
--   search_path; interns see only their own current certificate (no id,
--   reason or history); HR reads and reissues; no browser access.

-- ---------------------------------------------------------------------------
-- 0. Preflight.
-- ---------------------------------------------------------------------------
DO $preflight$
BEGIN
  IF to_regclass('public.internship_certificates') IS NULL
     OR to_regclass('public.internship_certificate_events') IS NULL
     OR to_regprocedure('public.internship_certificate_issue(uuid, uuid, text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_details_prerequisites_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND ((table_name = 'internship_certificates'
                     AND column_name IN ('placement_start_date', 'hr_signatory_name', 'mentor_signatory_name'))
                    OR (table_name = 'internship_certificate_events' AND column_name = 'reason'))) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_details_already_exist';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Snapshot columns (nullable: unknown values stay unknown) and the
--    reason on audit events.
-- ---------------------------------------------------------------------------
ALTER TABLE public.internship_certificates
  ADD COLUMN placement_start_date date NULL,
  ADD COLUMN hr_signatory_name text NULL,
  ADD COLUMN mentor_signatory_name text NULL,
  ADD CONSTRAINT internship_certificates_signatory_check CHECK (
    (hr_signatory_name IS NULL OR btrim(hr_signatory_name) <> '')
    AND (mentor_signatory_name IS NULL OR btrim(mentor_signatory_name) <> '')
  );

ALTER TABLE public.internship_certificate_events
  ADD COLUMN reason text NULL,
  -- Only a reissue has a reason: on the replaced record's SUPERSEDED event and
  -- the new record's ISSUED/REISSUE event.
  ADD CONSTRAINT internship_certificate_events_reason_check CHECK (
    reason IS NULL
    OR ((event_type = 'SUPERSEDED' OR issue_kind = 'REISSUE')
        AND btrim(reason) <> '' AND char_length(reason) <= 1000)
  );

-- The authoritative values a certificate copies, for one placement.
CREATE FUNCTION public.internship_certificate_details(p_placement_id uuid)
RETURNS TABLE (
  placement_start_date date,
  hr_signatory_name text,
  mentor_signatory_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT ip.start_date,
         -- The HR user recorded on the placement's completion (full name only).
         (SELECT nullif(btrim(hr.full_name), '')
          FROM public.intern_placement_events AS e
          JOIN public.profiles AS hr ON hr.id = e.actor_profile_id
          WHERE e.placement_id = ip.id AND e.event_type = 'COMPLETED'
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT 1),
         -- The Mentor assigned to this placement (cannot change once completed).
         (SELECT nullif(btrim(m.full_name), '') FROM public.profiles AS m WHERE m.id = ip.mentor_profile_id)
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id
$function$;

-- Actual duration from the start date to the completion date, the completion
-- day included (calendar months, then days). No row when either is unknown
-- or the completion is before the start.
CREATE FUNCTION public.internship_certificate_duration(p_start_date date, p_completion_date date)
RETURNS TABLE (duration_months integer, duration_days integer)
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT (extract(year FROM s.span)::integer * 12 + extract(month FROM s.span)::integer),
         extract(day FROM s.span)::integer
  FROM (SELECT age((p_completion_date + 1)::timestamp, p_start_date::timestamp) AS span) AS s
  WHERE p_start_date IS NOT NULL AND p_completion_date IS NOT NULL AND p_completion_date >= p_start_date
$function$;

-- ---------------------------------------------------------------------------
-- 2. Guard: the new copies are immutable too, and a new record must carry
--    exactly the authoritative values.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internship_certificates_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ409', MESSAGE = 'certificate_immutable', DETAIL = 'delete_not_allowed';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- A new record is current, carries the fixed wording, belongs to a
    -- COMPLETED placement and copies its official completion and the
    -- authoritative details; a reissue names a record of the same placement
    -- that was superseded first.
    IF NEW.status <> 'ISSUED' OR NEW.superseded_at IS NOT NULL
       OR NEW.certificate_title <> 'Certificate of Completion' OR NEW.issuer_name <> 'Progineer Technologies'
       OR NOT EXISTS (
         SELECT 1 FROM public.intern_placements AS ip
         WHERE ip.id = NEW.placement_id AND ip.status = 'COMPLETED'
           AND ip.completed_at = NEW.placement_completed_at
           AND (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date = NEW.completion_date)
       OR NOT EXISTS (
         SELECT 1 FROM public.internship_certificate_details(NEW.placement_id) AS d
         WHERE (d.placement_start_date, d.hr_signatory_name, d.mentor_signatory_name)
               IS NOT DISTINCT FROM
               (NEW.placement_start_date, NEW.hr_signatory_name, NEW.mentor_signatory_name))
       OR (NEW.supersedes_certificate_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.internship_certificates AS c
         WHERE c.id = NEW.supersedes_certificate_id AND c.placement_id = NEW.placement_id
           AND c.status = 'SUPERSEDED')) THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ409', MESSAGE = 'certificate_immutable', DETAIL = 'invalid_insert';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'ISSUED' OR NEW.status <> 'SUPERSEDED' OR NEW.superseded_at IS NULL
     OR (NEW.id, NEW.placement_id, NEW.issue_kind, NEW.certificate_title, NEW.issuer_name, NEW.recipient_name,
         NEW.training_title, NEW.completion_date, NEW.placement_completed_at, NEW.issued_at, NEW.issued_by_profile_id,
         NEW.supersedes_certificate_id, NEW.reissue_reason, NEW.placement_start_date,
         NEW.hr_signatory_name, NEW.mentor_signatory_name)
        IS DISTINCT FROM
        (OLD.id, OLD.placement_id, OLD.issue_kind, OLD.certificate_title, OLD.issuer_name, OLD.recipient_name,
         OLD.training_title, OLD.completion_date, OLD.placement_completed_at, OLD.issued_at, OLD.issued_by_profile_id,
         OLD.supersedes_certificate_id, OLD.reissue_reason, OLD.placement_start_date,
         OLD.hr_signatory_name, OLD.mentor_signatory_name) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ409', MESSAGE = 'certificate_immutable', DETAIL = 'only_supersede_allowed';
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Issuing (body of 20261019000000 plus the details). The training title is
--    the resolved internship's title.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internship_certificate_issue(
  p_placement_id uuid,
  p_actor_profile_id uuid,
  p_issue_kind text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
  v_details record;
  v_recipient text;
  v_training text;
  v_certificate_id uuid;
BEGIN
  IF p_issue_kind IS NULL OR p_issue_kind NOT IN ('COMPLETION', 'BACKFILL') THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ400', MESSAGE = 'certificate_issue_kind_invalid';
  END IF;

  -- Same lock order as reissue (placement, then certificate); completion
  -- already holds this lock.
  SELECT ip.* INTO v_placement FROM public.intern_placements AS ip WHERE ip.id = p_placement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;
  IF v_placement.status <> 'COMPLETED' OR v_placement.completed_at IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_completed';
  END IF;

  SELECT c.id INTO v_certificate_id
  FROM public.internship_certificates AS c
  WHERE c.placement_id = p_placement_id AND c.status = 'ISSUED';
  IF FOUND THEN
    RETURN v_certificate_id;
  END IF;

  SELECT a.full_name INTO v_recipient FROM public.applicants AS a WHERE a.id = v_placement.applicant_id;
  SELECT i.title INTO v_training FROM public.internships AS i WHERE i.id = v_placement.internship_id;
  IF btrim(coalesce(v_recipient, '')) = '' OR btrim(coalesce(v_training, '')) = '' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'certificate_source_incomplete';
  END IF;
  SELECT d.* INTO v_details FROM public.internship_certificate_details(p_placement_id) AS d;

  INSERT INTO public.internship_certificates (
    placement_id, issue_kind, certificate_title, issuer_name, recipient_name, training_title,
    completion_date, placement_completed_at, issued_by_profile_id,
    placement_start_date, hr_signatory_name, mentor_signatory_name
  ) VALUES (
    p_placement_id, p_issue_kind, 'Certificate of Completion', 'Progineer Technologies', v_recipient, v_training,
    (v_placement.completed_at AT TIME ZONE 'Asia/Hebron')::date, v_placement.completed_at, p_actor_profile_id,
    v_details.placement_start_date, v_details.hr_signatory_name, v_details.mentor_signatory_name
  )
  RETURNING id INTO v_certificate_id;

  INSERT INTO public.internship_certificate_events (certificate_id, placement_id, event_type, issue_kind, actor_profile_id)
  VALUES (v_certificate_id, p_placement_id, 'ISSUED', p_issue_kind, p_actor_profile_id);

  RETURN v_certificate_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. HR list and reissue, intern list and get: new result columns, so the
--    functions are recreated (same names, arguments and checks).
-- ---------------------------------------------------------------------------
DROP FUNCTION public.reissue_internship_certificate(uuid, uuid, text);
DROP FUNCTION public.list_hr_placement_certificates(uuid, uuid);
DROP FUNCTION public.get_my_certificate(uuid, uuid);
DROP FUNCTION public.list_my_certificates(uuid);

CREATE FUNCTION public.list_hr_placement_certificates(p_actor_profile_id uuid, p_placement_id uuid)
RETURNS TABLE (
  certificate_id uuid,
  placement_id uuid,
  status text,
  issue_kind text,
  certificate_title text,
  issuer_name text,
  recipient_name text,
  training_title text,
  completion_date date,
  issued_at timestamptz,
  issued_by_name text,
  supersedes_certificate_id uuid,
  reissue_reason text,
  superseded_at timestamptz,
  placement_start_date date,
  duration_months integer,
  duration_days integer,
  hr_signatory_name text,
  mentor_signatory_name text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_actor_profile_id AND p.role = 'HR') THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intern_placements AS ip WHERE ip.id = p_placement_id) THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  RETURN QUERY
  SELECT c.id, c.placement_id, c.status, c.issue_kind, c.certificate_title, c.issuer_name, c.recipient_name,
         c.training_title, c.completion_date, c.issued_at, coalesce(issuer.full_name, issuer.email),
         c.supersedes_certificate_id, c.reissue_reason, c.superseded_at,
         c.placement_start_date, d.duration_months, d.duration_days,
         c.hr_signatory_name, c.mentor_signatory_name
  FROM public.internship_certificates AS c
  LEFT JOIN public.profiles AS issuer ON issuer.id = c.issued_by_profile_id
  LEFT JOIN LATERAL public.internship_certificate_duration(c.placement_start_date, c.completion_date) AS d ON true
  WHERE c.placement_id = p_placement_id
  ORDER BY c.issued_at, c.id;
END;
$function$;

-- Corrections: lock the placement, then the current certificate; supersede
-- it and issue a new record from the current source data, with the reason.
CREATE FUNCTION public.reissue_internship_certificate(
  p_actor_profile_id uuid,
  p_certificate_id uuid,
  p_reason text
)
RETURNS TABLE (
  certificate_id uuid,
  placement_id uuid,
  status text,
  issue_kind text,
  certificate_title text,
  issuer_name text,
  recipient_name text,
  training_title text,
  completion_date date,
  issued_at timestamptz,
  issued_by_name text,
  supersedes_certificate_id uuid,
  reissue_reason text,
  superseded_at timestamptz,
  placement_start_date date,
  duration_months integer,
  duration_days integer,
  hr_signatory_name text,
  mentor_signatory_name text
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_reason text := nullif(btrim(p_reason), '');
  v_placement_id uuid;
  v_placement public.intern_placements;
  v_current public.internship_certificates;
  v_details record;
  v_recipient text;
  v_training text;
  v_new_id uuid;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;
  IF v_reason IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'reissue_reason_required';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'reissue_reason_too_long';
  END IF;

  -- placement_id never changes (guard), so an unlocked read finds the placement.
  SELECT c.placement_id INTO v_placement_id FROM public.internship_certificates AS c WHERE c.id = p_certificate_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'certificate_not_found';
  END IF;

  SELECT ip.* INTO v_placement FROM public.intern_placements AS ip WHERE ip.id = v_placement_id FOR UPDATE;
  SELECT c.* INTO v_current FROM public.internship_certificates AS c WHERE c.id = p_certificate_id FOR UPDATE;
  IF v_current.status <> 'ISSUED' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'certificate_not_current';
  END IF;
  IF v_placement.status <> 'COMPLETED' OR v_placement.completed_at IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_completed';
  END IF;

  SELECT a.full_name INTO v_recipient FROM public.applicants AS a WHERE a.id = v_placement.applicant_id;
  SELECT i.title INTO v_training FROM public.internships AS i WHERE i.id = v_placement.internship_id;
  IF btrim(coalesce(v_recipient, '')) = '' OR btrim(coalesce(v_training, '')) = '' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'certificate_source_incomplete';
  END IF;
  -- Resolved again from the records for the new record only; the HR
  -- signatory remains the HR user who completed the placement.
  SELECT d.* INTO v_details FROM public.internship_certificate_details(v_placement_id) AS d;

  UPDATE public.internship_certificates AS c
  SET status = 'SUPERSEDED', superseded_at = now()
  WHERE c.id = p_certificate_id;

  INSERT INTO public.internship_certificates (
    placement_id, issue_kind, certificate_title, issuer_name, recipient_name, training_title,
    completion_date, placement_completed_at, issued_by_profile_id, supersedes_certificate_id, reissue_reason,
    placement_start_date, hr_signatory_name, mentor_signatory_name
  ) VALUES (
    v_placement_id, 'REISSUE', 'Certificate of Completion', 'Progineer Technologies', v_recipient, v_training,
    (v_placement.completed_at AT TIME ZONE 'Asia/Hebron')::date, v_placement.completed_at, p_actor_profile_id,
    p_certificate_id, v_reason,
    v_details.placement_start_date, v_details.hr_signatory_name, v_details.mentor_signatory_name
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.internship_certificate_events (certificate_id, placement_id, event_type, issue_kind, actor_profile_id, reason)
  VALUES (p_certificate_id, v_placement_id, 'SUPERSEDED', NULL, p_actor_profile_id, v_reason),
         (v_new_id, v_placement_id, 'ISSUED', 'REISSUE', p_actor_profile_id, v_reason);

  RETURN QUERY
  SELECT r.* FROM public.list_hr_placement_certificates(p_actor_profile_id, v_placement_id) AS r
  WHERE r.certificate_id = v_new_id;
END;
$function$;

-- Interns: their own current certificates, by placement. No internal
-- certificate id, no reason, no history, no issuer profile.
CREATE FUNCTION public.list_my_certificates(p_auth_user_id uuid)
RETURNS TABLE (
  placement_id uuid,
  certificate_title text,
  issuer_name text,
  recipient_name text,
  training_title text,
  completion_date date,
  issued_at timestamptz,
  duration_months integer,
  duration_days integer,
  hr_signatory_name text,
  mentor_signatory_name text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_auth_user_id AND p.role = 'INTERN') THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'intern_role_required';
  END IF;

  RETURN QUERY
  SELECT c.placement_id, c.certificate_title, c.issuer_name, c.recipient_name, c.training_title,
         c.completion_date, c.issued_at, d.duration_months, d.duration_days,
         c.hr_signatory_name, c.mentor_signatory_name
  FROM public.internship_certificates AS c
  JOIN public.intern_placements AS ip ON ip.id = c.placement_id
  JOIN public.applicants AS a ON a.id = ip.applicant_id
  LEFT JOIN LATERAL public.internship_certificate_duration(c.placement_start_date, c.completion_date) AS d ON true
  WHERE a.auth_user_id = p_auth_user_id
    AND ip.status = 'COMPLETED'
    AND c.status = 'ISSUED'
  ORDER BY c.completion_date DESC, c.placement_id;
END;
$function$;

CREATE FUNCTION public.get_my_certificate(p_auth_user_id uuid, p_placement_id uuid)
RETURNS TABLE (
  placement_id uuid,
  certificate_title text,
  issuer_name text,
  recipient_name text,
  training_title text,
  completion_date date,
  issued_at timestamptz,
  duration_months integer,
  duration_days integer,
  hr_signatory_name text,
  mentor_signatory_name text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_auth_user_id AND p.role = 'INTERN') THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'intern_role_required';
  END IF;

  RETURN QUERY
  SELECT r.* FROM public.list_my_certificates(p_auth_user_id) AS r WHERE r.placement_id = p_placement_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'certificate_not_found';
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Function privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.internship_certificate_details(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internship_certificate_duration(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_hr_placement_certificates(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reissue_internship_certificate(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_certificates(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_certificate(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- Replaced in place (CREATE OR REPLACE keeps privileges); restated for clarity.
REVOKE ALL ON FUNCTION public.internship_certificates_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internship_certificate_issue(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.internship_certificate_details(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.internship_certificate_duration(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_hr_placement_certificates(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reissue_internship_certificate(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_certificates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_certificate(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.internship_certificate_issue(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Certificates issued before this migration: fill the new columns once
--    from the authoritative sources (existing columns are not touched). The
--    guard forbids any update besides superseding, so it is suspended for
--    this one statement only.
-- ---------------------------------------------------------------------------
ALTER TABLE public.internship_certificates DISABLE TRIGGER internship_certificates_guard;

UPDATE public.internship_certificates AS c
SET placement_start_date = d.placement_start_date,
    hr_signatory_name = d.hr_signatory_name,
    mentor_signatory_name = d.mentor_signatory_name
FROM public.intern_placements AS ip
CROSS JOIN LATERAL public.internship_certificate_details(ip.id) AS d
WHERE ip.id = c.placement_id
  AND c.placement_start_date IS NULL;

ALTER TABLE public.internship_certificates ENABLE TRIGGER internship_certificates_guard;

-- ---------------------------------------------------------------------------
-- 7. Postflight.
-- ---------------------------------------------------------------------------
DO $postflight$
DECLARE
  v_role text;
  v_function regprocedure;
BEGIN
  IF (SELECT t.tgenabled FROM pg_catalog.pg_trigger AS t
      WHERE t.tgrelid = 'public.internship_certificates'::regclass AND t.tgname = 'internship_certificates_guard') IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_guard_not_enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.internship_certificates AS c WHERE c.placement_start_date IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_details_backfill_incomplete';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_any_column_privilege(v_role, 'public.internship_certificates', 'SELECT, INSERT, UPDATE, REFERENCES')
       OR has_any_column_privilege(v_role, 'public.internship_certificate_events', 'SELECT, INSERT, UPDATE, REFERENCES') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_table_exposed: %s', v_role);
    END IF;
  END LOOP;
  IF has_column_privilege('service_role', 'public.internship_certificates', 'placement_start_date', 'UPDATE')
     OR has_column_privilege('service_role', 'public.internship_certificates', 'hr_signatory_name', 'UPDATE')
     OR has_column_privilege('service_role', 'public.internship_certificates', 'mentor_signatory_name', 'UPDATE')
     OR has_any_column_privilege('service_role', 'public.internship_certificate_events', 'UPDATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_snapshot_updatable';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.internship_certificate_details(uuid)'::regprocedure,
    'public.internship_certificate_duration(date, date)'::regprocedure,
    'public.internship_certificate_issue(uuid, uuid, text)'::regprocedure,
    'public.list_hr_placement_certificates(uuid, uuid)'::regprocedure,
    'public.reissue_internship_certificate(uuid, uuid, text)'::regprocedure,
    'public.list_my_certificates(uuid)'::regprocedure,
    'public.get_my_certificate(uuid, uuid)'::regprocedure,
    'public.complete_intern_placement(uuid, uuid, text)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE') OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_function_exposed: %s', v_function);
    END IF;
    IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_function_not_executable: %s', v_function);
    END IF;
    IF (SELECT p.prosecdef OR NOT coalesce(p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp'], false)
        FROM pg_catalog.pg_proc AS p WHERE p.oid = v_function::oid) THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_function_unsafe: %s', v_function);
    END IF;
  END LOOP;
END;
$postflight$;
