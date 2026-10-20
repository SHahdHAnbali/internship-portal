-- Internship certificates of completion (2026-10-19, Stage 1: database).
--
-- * One fixed certificate per completed placement: title "Certificate of
--   Completion", issuer "Progineer Technologies". The recipient's name is
--   copied from applicants.full_name and the training from internships.title
--   when the certificate is issued; the completion date is the placement's
--   official completed_at in the Asia/Hebron time zone. These copies never
--   change afterwards, whatever happens to the source records.
-- * No certificate number exists. Each record has an internal id (for
--   integrity, audit and reissue); the intern-facing functions do not return
--   it. No signatory, signature, logo or stamp is stored.
-- * Issued with the official completion: complete_intern_placement (HR only)
--   now issues the certificate in the same transaction, so completion and
--   issuance succeed or fail together. Early completions are eligible. A
--   Mentor evaluation is never consulted.
-- * Placements already COMPLETED when this migration runs are backfilled.
-- * Corrections: HR reissues with a required reason. The current record is
--   marked SUPERSEDED (its copied data is kept as issued) and a new record is
--   created from the current source data. At most one ISSUED record per
--   placement (partial unique index). Records are never edited or deleted.
-- * Access: functions run as service_role only (SECURITY INVOKER, pinned
--   search_path); interns read only their own current certificates; HR reads
--   and reissues; Mentors, ADMIN and browser roles have no access.
-- * Audit: internship_certificate_events holds metadata only (no names,
--   titles or reasons).
--
-- Errors follow the placement functions' convention (SQLSTATE PZ4xx with a
-- message key): hr_role_required, intern_role_required, placement_not_found,
-- placement_not_completed, certificate_not_found, certificate_not_current,
-- certificate_source_incomplete, reissue_reason_required,
-- reissue_reason_too_long, certificate_immutable (DETAIL names the rule).

-- ---------------------------------------------------------------------------
-- 0. Preflight: refuse before changing anything.
-- ---------------------------------------------------------------------------
DO $preflight$
BEGIN
  IF to_regclass('public.internship_certificates') IS NOT NULL
     OR to_regclass('public.internship_certificate_events') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_objects_already_exist';
  END IF;
  IF to_regprocedure('public.complete_intern_placement(uuid, uuid, text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'complete_intern_placement_missing';
  END IF;
  -- The time zone used for completion dates must be known to this server.
  PERFORM now() AT TIME ZONE 'Asia/Hebron';
  -- Every placement to backfill must have the data a certificate copies.
  IF EXISTS (
    SELECT 1
    FROM public.intern_placements AS ip
    LEFT JOIN public.applicants AS a ON a.id = ip.applicant_id
    LEFT JOIN public.internships AS i ON i.id = ip.internship_id
    WHERE ip.status = 'COMPLETED'
      AND (ip.completed_at IS NULL OR btrim(coalesce(a.full_name, '')) = '' OR btrim(coalesce(i.title, '')) = '')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_backfill_source_incomplete';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Certificates (issued records; the copied data is immutable).
-- ---------------------------------------------------------------------------
CREATE TABLE public.internship_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ISSUED',
  issue_kind text NOT NULL,
  certificate_title text NOT NULL,
  issuer_name text NOT NULL,
  recipient_name text NOT NULL,
  training_title text NOT NULL,
  completion_date date NOT NULL,
  placement_completed_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by_profile_id uuid NULL,
  supersedes_certificate_id uuid NULL,
  reissue_reason text NULL,
  superseded_at timestamptz NULL,
  CONSTRAINT internship_certificates_pkey PRIMARY KEY (id),
  CONSTRAINT internship_certificates_placement_id_fkey
    FOREIGN KEY (placement_id) REFERENCES public.intern_placements (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT internship_certificates_issued_by_profile_id_fkey
    FOREIGN KEY (issued_by_profile_id) REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT internship_certificates_supersedes_certificate_id_fkey
    FOREIGN KEY (supersedes_certificate_id) REFERENCES public.internship_certificates (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT internship_certificates_supersedes_once_key UNIQUE (supersedes_certificate_id),
  CONSTRAINT internship_certificates_status_check CHECK (status IN ('ISSUED', 'SUPERSEDED')),
  CONSTRAINT internship_certificates_issue_kind_check CHECK (issue_kind IN ('COMPLETION', 'BACKFILL', 'REISSUE')),
  CONSTRAINT internship_certificates_text_check CHECK (
    btrim(certificate_title) <> '' AND btrim(issuer_name) <> ''
    AND btrim(recipient_name) <> '' AND btrim(training_title) <> ''
  ),
  -- A reissue always names the record it replaces and a reason; nothing else does.
  CONSTRAINT internship_certificates_reissue_check CHECK (
    (issue_kind = 'REISSUE') = (supersedes_certificate_id IS NOT NULL)
    AND (issue_kind = 'REISSUE') = (reissue_reason IS NOT NULL)
    AND (reissue_reason IS NULL OR (btrim(reissue_reason) <> '' AND char_length(reissue_reason) <= 1000))
    AND (supersedes_certificate_id IS NULL OR supersedes_certificate_id <> id)
  ),
  -- Only a backfill may lack the issuing HR profile (a completion recorded before events existed).
  CONSTRAINT internship_certificates_issuer_profile_check CHECK (issue_kind = 'BACKFILL' OR issued_by_profile_id IS NOT NULL),
  CONSTRAINT internship_certificates_superseded_check CHECK ((status = 'SUPERSEDED') = (superseded_at IS NOT NULL))
);

-- At most one current (ISSUED) certificate per placement.
CREATE UNIQUE INDEX internship_certificates_one_issued_per_placement
  ON public.internship_certificates (placement_id) WHERE status = 'ISSUED';
CREATE INDEX internship_certificates_placement_issued_idx
  ON public.internship_certificates (placement_id, issued_at, id);

-- Issued data never changes: the only allowed change is ISSUED -> SUPERSEDED
-- (with superseded_at). No delete, no truncate, also not for the owner.
CREATE FUNCTION public.internship_certificates_guard()
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
    -- COMPLETED placement and copies its official completion; a reissue
    -- names a record of the same placement that was superseded first.
    IF NEW.status <> 'ISSUED' OR NEW.superseded_at IS NOT NULL
       OR NEW.certificate_title <> 'Certificate of Completion' OR NEW.issuer_name <> 'Progineer Technologies'
       OR NOT EXISTS (
         SELECT 1 FROM public.intern_placements AS ip
         WHERE ip.id = NEW.placement_id AND ip.status = 'COMPLETED'
           AND ip.completed_at = NEW.placement_completed_at
           AND (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date = NEW.completion_date)
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
         NEW.supersedes_certificate_id, NEW.reissue_reason)
        IS DISTINCT FROM
        (OLD.id, OLD.placement_id, OLD.issue_kind, OLD.certificate_title, OLD.issuer_name, OLD.recipient_name,
         OLD.training_title, OLD.completion_date, OLD.placement_completed_at, OLD.issued_at, OLD.issued_by_profile_id,
         OLD.supersedes_certificate_id, OLD.reissue_reason) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ409', MESSAGE = 'certificate_immutable', DETAIL = 'only_supersede_allowed';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER internship_certificates_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.internship_certificates
FOR EACH ROW EXECUTE FUNCTION public.internship_certificates_guard();
CREATE TRIGGER internship_certificates_no_truncate
BEFORE TRUNCATE ON public.internship_certificates
FOR EACH STATEMENT EXECUTE FUNCTION public.internship_certificates_guard();

-- A record is superseded only by a reissue: by the end of the transaction a
-- newer record must name it, so a completed placement never loses its
-- current certificate.
CREATE FUNCTION public.internship_certificates_require_successor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NEW.status = 'SUPERSEDED' AND NOT EXISTS (
    SELECT 1 FROM public.internship_certificates AS c WHERE c.supersedes_certificate_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ409', MESSAGE = 'certificate_immutable', DETAIL = 'superseded_without_reissue';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER internship_certificates_require_successor
AFTER UPDATE ON public.internship_certificates
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.internship_certificates_require_successor();

-- ---------------------------------------------------------------------------
-- 2. Metadata-only audit events (never a name, title or reason).
-- ---------------------------------------------------------------------------
CREATE TABLE public.internship_certificate_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL,
  placement_id uuid NOT NULL,
  event_type text NOT NULL,
  issue_kind text NULL,
  actor_profile_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internship_certificate_events_pkey PRIMARY KEY (id),
  CONSTRAINT internship_certificate_events_certificate_id_fkey
    FOREIGN KEY (certificate_id) REFERENCES public.internship_certificates (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT internship_certificate_events_placement_id_fkey
    FOREIGN KEY (placement_id) REFERENCES public.intern_placements (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT internship_certificate_events_actor_profile_id_fkey
    FOREIGN KEY (actor_profile_id) REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT internship_certificate_events_type_check CHECK (event_type IN ('ISSUED', 'SUPERSEDED')),
  CONSTRAINT internship_certificate_events_kind_check CHECK (
    (event_type = 'ISSUED') = (issue_kind IS NOT NULL)
    AND (issue_kind IS NULL OR issue_kind IN ('COMPLETION', 'BACKFILL', 'REISSUE'))
  ),
  CONSTRAINT internship_certificate_events_actor_check CHECK (actor_profile_id IS NOT NULL OR issue_kind = 'BACKFILL'),
  CONSTRAINT internship_certificate_events_once_key UNIQUE (certificate_id, event_type)
);

CREATE INDEX internship_certificate_events_placement_created_idx
  ON public.internship_certificate_events (placement_id, created_at);

-- Append-only.
CREATE FUNCTION public.internship_certificate_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'PZ409', MESSAGE = 'certificate_immutable', DETAIL = 'events_are_append_only';
END;
$function$;

CREATE TRIGGER internship_certificate_events_guard
BEFORE UPDATE OR DELETE ON public.internship_certificate_events
FOR EACH ROW EXECUTE FUNCTION public.internship_certificate_events_guard();
CREATE TRIGGER internship_certificate_events_no_truncate
BEFORE TRUNCATE ON public.internship_certificate_events
FOR EACH STATEMENT EXECUTE FUNCTION public.internship_certificate_events_guard();

-- ---------------------------------------------------------------------------
-- 3. Privileges: service_role only, minimal (RLS on, no policies).
-- ---------------------------------------------------------------------------
ALTER TABLE public.internship_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internship_certificate_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.internship_certificates, public.internship_certificate_events
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT ON TABLE public.internship_certificates TO service_role;
GRANT UPDATE (status, superseded_at) ON TABLE public.internship_certificates TO service_role;
GRANT SELECT, INSERT ON TABLE public.internship_certificate_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Issuing (internal; called by complete_intern_placement and the backfill).
--    Idempotent: a placement that already has a current certificate keeps it
--    exactly as issued and gets no second one.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.internship_certificate_issue(
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

  INSERT INTO public.internship_certificates (
    placement_id, issue_kind, certificate_title, issuer_name, recipient_name, training_title,
    completion_date, placement_completed_at, issued_by_profile_id
  ) VALUES (
    p_placement_id, p_issue_kind, 'Certificate of Completion', 'Progineer Technologies', v_recipient, v_training,
    (v_placement.completed_at AT TIME ZONE 'Asia/Hebron')::date, v_placement.completed_at, p_actor_profile_id
  )
  RETURNING id INTO v_certificate_id;

  INSERT INTO public.internship_certificate_events (certificate_id, placement_id, event_type, issue_kind, actor_profile_id)
  VALUES (v_certificate_id, p_placement_id, 'ISSUED', p_issue_kind, p_actor_profile_id);

  RETURN v_certificate_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Completion issues the certificate atomically. The body is the one of
--    20261018000000 unchanged (same checks, locks, errors, metadata and
--    event); the only addition is the issuing call before the result.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_intern_placement(
  p_actor_profile_id uuid,
  p_placement_id uuid,
  p_note text
)
RETURNS SETOF public.intern_placements
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_note text := nullif(btrim(p_note), '');
  v_application_id uuid;
  v_current public.intern_placements;
  v_early boolean;
  v_pending_reports integer;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'completion_note_too_long';
  END IF;

  SELECT ip.application_id INTO v_application_id
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  PERFORM 1 FROM public.applications AS a WHERE a.id = v_application_id FOR UPDATE;

  SELECT ip.* INTO v_current
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id AND ip.application_id = v_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;
  IF v_current.status <> 'ACTIVE' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_completable';
  END IF;

  v_early := current_date < v_current.end_date;
  IF v_early AND v_note IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'early_end_reason_required';
  END IF;

  SELECT count(*) INTO v_pending_reports
  FROM public.intern_weekly_reports AS r
  WHERE r.placement_id = p_placement_id AND r.status = 'SUBMITTED';

  IF v_pending_reports > 0 THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_has_pending_reports';
  END IF;

  UPDATE public.intern_placements AS ip
  SET status = 'COMPLETED',
      completed_at = now(),
      completion_note = v_note,
      ended_early = v_early,
      updated_at = now()
  WHERE ip.id = p_placement_id
  RETURNING * INTO v_placement;

  INSERT INTO public.intern_placement_events (
    placement_id, event_type, from_status, to_status, details, note, actor_profile_id
  ) VALUES (
    p_placement_id, 'COMPLETED', 'ACTIVE', 'COMPLETED',
    jsonb_build_object('endedEarly', v_early, 'plannedEndDate', v_current.end_date),
    v_note, p_actor_profile_id
  );

  -- Certificate of completion, in the same transaction: if it cannot be
  -- issued, the completion is rolled back too.
  PERFORM public.internship_certificate_issue(p_placement_id, p_actor_profile_id, 'COMPLETION');

  RETURN NEXT v_placement;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. HR: list a placement's certificates (current and superseded) and reissue.
-- ---------------------------------------------------------------------------
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
  superseded_at timestamptz
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
         c.supersedes_certificate_id, c.reissue_reason, c.superseded_at
  FROM public.internship_certificates AS c
  LEFT JOIN public.profiles AS issuer ON issuer.id = c.issued_by_profile_id
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
  superseded_at timestamptz
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

  UPDATE public.internship_certificates AS c
  SET status = 'SUPERSEDED', superseded_at = now()
  WHERE c.id = p_certificate_id;

  INSERT INTO public.internship_certificates (
    placement_id, issue_kind, certificate_title, issuer_name, recipient_name, training_title,
    completion_date, placement_completed_at, issued_by_profile_id, supersedes_certificate_id, reissue_reason
  ) VALUES (
    v_placement_id, 'REISSUE', 'Certificate of Completion', 'Progineer Technologies', v_recipient, v_training,
    (v_placement.completed_at AT TIME ZONE 'Asia/Hebron')::date, v_placement.completed_at, p_actor_profile_id,
    p_certificate_id, v_reason
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.internship_certificate_events (certificate_id, placement_id, event_type, issue_kind, actor_profile_id)
  VALUES (p_certificate_id, v_placement_id, 'SUPERSEDED', NULL, p_actor_profile_id),
         (v_new_id, v_placement_id, 'ISSUED', 'REISSUE', p_actor_profile_id);

  RETURN QUERY
  SELECT r.* FROM public.list_hr_placement_certificates(p_actor_profile_id, v_placement_id) AS r
  WHERE r.certificate_id = v_new_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Interns: their own current certificates, by placement. No internal
--    certificate id, no reason, no history, no issuer profile.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_my_certificates(p_auth_user_id uuid)
RETURNS TABLE (
  placement_id uuid,
  certificate_title text,
  issuer_name text,
  recipient_name text,
  training_title text,
  completion_date date,
  issued_at timestamptz
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
         c.completion_date, c.issued_at
  FROM public.internship_certificates AS c
  JOIN public.intern_placements AS ip ON ip.id = c.placement_id
  JOIN public.applicants AS a ON a.id = ip.applicant_id
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
  issued_at timestamptz
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
-- 8. Function privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.internship_certificates_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internship_certificates_require_successor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internship_certificate_events_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internship_certificate_issue(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_hr_placement_certificates(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reissue_internship_certificate(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_certificates(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_certificate(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- complete_intern_placement keeps its privileges (CREATE OR REPLACE); restated for clarity.
REVOKE ALL ON FUNCTION public.complete_intern_placement(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.internship_certificate_issue(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_hr_placement_certificates(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reissue_internship_certificate(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_certificates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_certificate(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_intern_placement(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Backfill: placements already COMPLETED get their certificate, issued by
--    the HR profile recorded on their completion event when there is one.
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT ip.id,
           (SELECT e.actor_profile_id FROM public.intern_placement_events AS e
            WHERE e.placement_id = ip.id AND e.event_type = 'COMPLETED'
            ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS actor_profile_id
    FROM public.intern_placements AS ip
    WHERE ip.status = 'COMPLETED'
    ORDER BY ip.completed_at, ip.id
  LOOP
    PERFORM public.internship_certificate_issue(v_row.id, v_row.actor_profile_id, 'BACKFILL');
  END LOOP;
END;
$backfill$;

-- ---------------------------------------------------------------------------
-- 10. Postflight: checked, not assumed.
-- ---------------------------------------------------------------------------
DO $postflight$
DECLARE
  v_table text;
  v_role text;
  v_function regprocedure;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['public.internship_certificates', 'public.internship_certificate_events'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_any_column_privilege(v_role, v_table, 'SELECT, INSERT, UPDATE, REFERENCES')
         OR has_table_privilege(v_role, v_table, 'DELETE, TRUNCATE, TRIGGER') THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_table_exposed: %s on %s', v_role, v_table);
      END IF;
    END LOOP;
    IF has_table_privilege('service_role', v_table, 'UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_table_overgranted: %s', v_table);
    END IF;
  END LOOP;
  IF has_column_privilege('service_role', 'public.internship_certificates', 'recipient_name', 'UPDATE')
     OR has_column_privilege('service_role', 'public.internship_certificates', 'training_title', 'UPDATE')
     OR has_column_privilege('service_role', 'public.internship_certificates', 'completion_date', 'UPDATE')
     OR has_any_column_privilege('service_role', 'public.internship_certificate_events', 'UPDATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_snapshot_updatable';
  END IF;

  FOR v_function IN
    SELECT p.oid::regprocedure FROM pg_catalog.pg_proc AS p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('internship_certificates_guard', 'internship_certificates_require_successor',
                        'internship_certificate_events_guard',
                        'internship_certificate_issue', 'list_hr_placement_certificates',
                        'reissue_internship_certificate', 'list_my_certificates', 'get_my_certificate',
                        'complete_intern_placement')
  LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE') OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_function_exposed: %s', v_function);
    END IF;
    IF (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p WHERE p.oid = v_function::oid) THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_function_security_definer: %s', v_function);
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.internship_certificate_issue(uuid, uuid, text)'::regprocedure,
    'public.list_hr_placement_certificates(uuid, uuid)'::regprocedure,
    'public.reissue_internship_certificate(uuid, uuid, text)'::regprocedure,
    'public.list_my_certificates(uuid)'::regprocedure,
    'public.get_my_certificate(uuid, uuid)'::regprocedure,
    'public.complete_intern_placement(uuid, uuid, text)'::regprocedure
  ] LOOP
    IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('certificate_function_not_executable: %s', v_function);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.intern_placements AS ip
    WHERE ip.status = 'COMPLETED'
      AND NOT EXISTS (SELECT 1 FROM public.internship_certificates AS c
                      WHERE c.placement_id = ip.id AND c.status = 'ISSUED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'certificate_backfill_incomplete';
  END IF;
END;
$postflight$;
