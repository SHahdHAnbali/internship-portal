-- Feature 4: selection -> placement -> activation (applicant to intern).
--
-- Placements record the training opportunity they fill. Creation and
-- activation gain date and capacity prerequisites; HR can cancel a
-- placement that has not started (with a reason) and create a new one.
-- Every lifecycle step is recorded in an append-only placement history.
-- Activation keeps its single-transaction APPLICANT -> INTERN transition.
--
-- Runtime access remains through the NestJS service-role client.

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cancel_intern_placement'
  ) OR to_regclass('public.intern_placement_events') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001',
      MESSAGE = 'placement_lifecycle_name_already_exists';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Placement -> training opportunity (backfilled from each application's
--    resolved training; verified resolvable before deployment).
-- ---------------------------------------------------------------------------
ALTER TABLE public.intern_placements
  ADD COLUMN internship_id uuid NULL
  CONSTRAINT intern_placements_internship_id_fkey
    REFERENCES public.internships (id) ON UPDATE RESTRICT ON DELETE RESTRICT;

UPDATE public.intern_placements AS ip
SET internship_id = public.resolve_application_training(a.internship_id, a.requested_training)
FROM public.applications AS a
WHERE a.id = ip.application_id
  AND ip.internship_id IS NULL;

ALTER TABLE public.intern_placements
  ALTER COLUMN internship_id SET NOT NULL;

CREATE INDEX intern_placements_internship_status_idx
  ON public.intern_placements (internship_id, status);

-- ---------------------------------------------------------------------------
-- 2. Cancellation before activation; a cancelled placement can be replaced.
-- ---------------------------------------------------------------------------
ALTER TABLE public.intern_placements
  ADD COLUMN cancelled_at timestamptz NULL,
  ADD COLUMN cancellation_reason text NULL;

ALTER TABLE public.intern_placements
  ADD CONSTRAINT intern_placements_cancellation_check CHECK (
    (status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
    AND (cancellation_reason IS NULL
         OR (length(btrim(cancellation_reason)) > 0 AND char_length(cancellation_reason) <= 1000))
  );

ALTER TABLE public.intern_placements
  DROP CONSTRAINT intern_placements_application_id_key;

CREATE UNIQUE INDEX intern_placements_one_open_per_application_idx
  ON public.intern_placements (application_id)
  WHERE status <> 'CANCELLED';

-- ---------------------------------------------------------------------------
-- 3. Append-only placement history.
-- ---------------------------------------------------------------------------
CREATE TABLE public.intern_placement_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NULL,
  actor_profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intern_placement_events_pkey PRIMARY KEY (id),
  CONSTRAINT intern_placement_events_placement_id_fkey
    FOREIGN KEY (placement_id) REFERENCES public.intern_placements (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_placement_events_actor_profile_id_fkey
    FOREIGN KEY (actor_profile_id) REFERENCES public.profiles (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_placement_events_type_check CHECK (event_type IN (
    'CREATED', 'ACTIVATED', 'CANCELLED', 'COMPLETED', 'MENTOR_ASSIGNED', 'MENTOR_UNASSIGNED'
  )),
  CONSTRAINT intern_placement_events_details_check CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT intern_placement_events_note_check CHECK (
    note IS NULL OR (length(btrim(note)) > 0 AND char_length(note) <= 2000)
  )
);

CREATE INDEX intern_placement_events_placement_created_idx
  ON public.intern_placement_events (placement_id, created_at, id);

ALTER TABLE public.intern_placement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.intern_placement_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.intern_placement_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.intern_placement_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Creation: SELECTED application, resolved opportunity, dates not ended,
--    no open placement for the application.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_intern_placement(
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
  v_trim_chars CONSTANT text := E' \t\n\r\f'
    || chr(11) || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
    || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
    || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
    || chr(12288) || chr(65279);
  v_actor_role text;
  v_applicant_id uuid;
  v_application_status text;
  v_internship_id uuid;
  v_requested_training text;
  v_opportunity_id uuid;
  v_company text;
  v_department text;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  v_company := btrim(p_company, v_trim_chars);
  IF v_company IS NULL OR v_company = '' OR char_length(v_company) > 200 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'company_required';
  END IF;
  v_department := NULLIF(btrim(p_department, v_trim_chars), '');
  IF char_length(v_department) > 200 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'department_too_long';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'placement_dates_required';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_placement_date_range';
  END IF;
  IF p_end_date < current_date THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'placement_already_ended';
  END IF;

  -- Shared serialization point with activation, cancellation and status changes.
  SELECT a.applicant_id, a.status::text, a.internship_id, a.requested_training
    INTO v_applicant_id, v_application_status, v_internship_id, v_requested_training
  FROM public.applications AS a
  WHERE a.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND OR v_application_status = 'DRAFT' THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'application_not_found';
  END IF;
  IF v_application_status <> 'SELECTED' OR v_applicant_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'application_not_eligible';
  END IF;

  -- A selected application's mapping cannot change (see map_training_request).
  v_opportunity_id := public.resolve_application_training(v_internship_id, v_requested_training);
  IF v_opportunity_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_not_planned';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.intern_placements AS ip
    WHERE ip.application_id = p_application_id
      AND ip.status <> 'CANCELLED'
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_already_exists';
  END IF;

  INSERT INTO public.intern_placements (
    application_id, applicant_id, internship_id, company, department,
    start_date, end_date, status
  )
  VALUES (
    p_application_id, v_applicant_id, v_opportunity_id, v_company, v_department,
    p_start_date, p_end_date, 'SCHEDULED'
  )
  RETURNING * INTO v_placement;

  INSERT INTO public.intern_placement_events (
    placement_id, event_type, from_status, to_status, details, actor_profile_id
  ) VALUES (
    v_placement.id, 'CREATED', NULL, 'SCHEDULED',
    jsonb_build_object('company', v_company, 'department', v_department,
                       'startDate', p_start_date, 'endDate', p_end_date),
    p_actor_profile_id
  );

  RETURN NEXT v_placement;
  RETURN;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Activation: as before (single transaction, APPLICANT -> INTERN), plus
--    "not ended" and a defensive seat check against active placements.
--    Lock order: application -> placement -> applicant -> profile -> opportunity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_intern_placement(
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
  v_end_date date;
  v_internship_id uuid;
  v_capacity integer;
  v_updated_profile_id uuid;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  -- This unlocked lookup only discovers which application row to lock first.
  SELECT ip.application_id INTO v_application_id
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  SELECT a.status::text INTO v_application_status
  FROM public.applications AS a WHERE a.id = v_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_application_missing';
  END IF;

  SELECT ip.applicant_id, ip.status::text, ip.end_date, ip.internship_id
    INTO v_applicant_id, v_placement_status, v_end_date, v_internship_id
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id AND ip.application_id = v_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  IF v_placement_status <> 'SCHEDULED' OR v_application_status <> 'SELECTED' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_eligible';
  END IF;
  IF v_end_date < current_date THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_already_ended';
  END IF;

  SELECT a.auth_user_id INTO v_auth_user_id
  FROM public.applicants AS a WHERE a.id = v_applicant_id FOR UPDATE;
  IF NOT FOUND OR v_auth_user_id IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_auth_link_missing';
  END IF;

  SELECT p.role::text INTO v_profile_role
  FROM public.profiles AS p WHERE p.id = v_auth_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile_role IS DISTINCT FROM 'APPLICANT' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_profile_not_eligible';
  END IF;

  PERFORM 1 FROM public.intern_placements AS ip
  WHERE ip.applicant_id = v_applicant_id AND ip.status = 'ACTIVE' AND ip.id <> p_placement_id;
  IF FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_already_has_active_placement';
  END IF;

  -- Defensive: never more active placements than planned seats.
  SELECT i.capacity INTO v_capacity
  FROM public.internships AS i WHERE i.id = v_internship_id FOR SHARE;
  IF v_capacity IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_not_set';
  END IF;
  IF (SELECT count(*) FROM public.intern_placements AS ip
      WHERE ip.internship_id = v_internship_id AND ip.status = 'ACTIVE') >= v_capacity THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_full';
  END IF;

  UPDATE public.intern_placements AS ip
  SET status = 'ACTIVE', updated_at = now()
  WHERE ip.id = p_placement_id
  RETURNING * INTO v_placement;

  UPDATE public.profiles AS p
  SET role = 'INTERN', updated_at = now()
  WHERE p.id = v_auth_user_id AND p.role::text = 'APPLICANT'
  RETURNING p.id INTO v_updated_profile_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applicant_role_changed';
  END IF;

  INSERT INTO public.intern_placement_events (
    placement_id, event_type, from_status, to_status, details, actor_profile_id
  ) VALUES (
    p_placement_id, 'ACTIVATED', 'SCHEDULED', 'ACTIVE',
    jsonb_build_object('internProfileId', v_auth_user_id), p_actor_profile_id
  );

  RETURN NEXT v_placement;
  RETURN;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Cancellation of a placement that has not started (SCHEDULED only).
--    The application stays SELECTED (its seat is kept) so HR can create a
--    replacement placement.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cancel_intern_placement(
  p_actor_profile_id uuid,
  p_placement_id uuid,
  p_reason text
)
RETURNS SETOF public.intern_placements
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_reason text;
  v_application_id uuid;
  v_status text;
  v_placement public.intern_placements;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  v_reason := nullif(btrim(p_reason), '');
  IF v_reason IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'cancellation_reason_required';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'cancellation_reason_too_long';
  END IF;

  SELECT ip.application_id INTO v_application_id
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;

  PERFORM 1 FROM public.applications AS a WHERE a.id = v_application_id FOR UPDATE;

  SELECT ip.status::text INTO v_status
  FROM public.intern_placements AS ip
  WHERE ip.id = p_placement_id AND ip.application_id = v_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'placement_not_found';
  END IF;
  IF v_status <> 'SCHEDULED' THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_not_cancellable';
  END IF;

  UPDATE public.intern_placements AS ip
  SET status = 'CANCELLED',
      cancelled_at = now(),
      cancellation_reason = v_reason,
      updated_at = now()
  WHERE ip.id = p_placement_id
  RETURNING * INTO v_placement;

  INSERT INTO public.intern_placement_events (
    placement_id, event_type, from_status, to_status, note, actor_profile_id
  ) VALUES (
    p_placement_id, 'CANCELLED', 'SCHEDULED', 'CANCELLED', v_reason, p_actor_profile_id
  );

  RETURN NEXT v_placement;
  RETURN;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Privileges: backend only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_intern_placement(uuid, uuid, text, text, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_intern_placement(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_intern_placement(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_intern_placement(uuid, uuid, text, text, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_intern_placement(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_intern_placement(uuid, uuid, text) TO service_role;
