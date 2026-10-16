-- Training capacity, explicit selection release, opportunity approval, and the
-- portal-wide application intake switch (owner-approved 2026-10-14).
--
-- Concepts on public.internships (Option A, one table):
-- * is_active          = the training type is listed for applicants.
-- * selection_status   = HR approval/selection: NOT_APPROVED | OPEN | CLOSED.
-- * capacity           = applicants that may be selected over the opportunity's
--                        cycle (set by HR after approval; NULL = not set).
-- Requested training (applications.internship_id or "Other" text) stays
-- separate; approval never happens because an applicant asked for something.
--
-- Seats (cumulative for the cycle): every SELECTED application resolved to the
-- opportunity consumes one seat, including those whose placement was completed
-- or cancelled. Only an explicit HR release (final for that application) frees
-- a seat. One opportunity row = one cycle: a later cohort is a new opportunity.
--
-- Portal intake (ADMIN): when closed, no application can be created and no
-- DRAFT can become NEW. Existing drafts and CVs are kept. HR work on submitted
-- applications is not affected.
--
-- Lock order: portal_settings -> applications -> intern_placements ->
-- applicants -> profiles -> training_request_mappings -> internships.

-- ---------------------------------------------------------------------------
-- 1. Opportunity approval / selection state.
-- ---------------------------------------------------------------------------
ALTER TABLE public.internships
  ADD COLUMN selection_status text NOT NULL DEFAULT 'NOT_APPROVED',
  ADD COLUMN selection_status_changed_at timestamptz NULL;

ALTER TABLE public.internships
  ADD CONSTRAINT internships_selection_status_check
    CHECK (selection_status IN ('NOT_APPROVED', 'OPEN', 'CLOSED'));

-- Existing rows were created under the old rule (creating = approving). Keep
-- that for rows HR already planned or selected into; the rest await approval.
UPDATE public.internships AS i
SET selection_status = 'OPEN',
    selection_status_changed_at = now()
WHERE i.capacity IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM public.applications AS a
     LEFT JOIN public.training_request_mappings AS m
       ON a.internship_id IS NULL AND m.normalized_label = lower(btrim(a.requested_training))
     WHERE a.status = 'SELECTED' AND coalesce(a.internship_id, m.internship_id) = i.id
   );

COMMENT ON COLUMN public.internships.is_active IS
  'Listed for applicants (they may request this training type). Independent of approval and capacity.';
COMMENT ON COLUMN public.internships.selection_status IS
  'HR approval: NOT_APPROVED (demand only), OPEN (HR may select), CLOSED (no further selections or replacements).';
COMMENT ON COLUMN public.internships.capacity IS
  'Applicants that may be selected over this opportunity''s cycle; only an explicit release frees a seat. NULL = not set.';

-- ---------------------------------------------------------------------------
-- 2. Explicit, final selection release (the application stays SELECTED).
-- ---------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN selection_released_at timestamptz NULL,
  ADD COLUMN selection_release_reason text NULL,
  ADD COLUMN selection_released_by uuid NULL REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_selection_release_check CHECK (
    (selection_released_at IS NULL) = (selection_release_reason IS NULL)
    AND (selection_released_at IS NULL) = (selection_released_by IS NULL)
    AND (selection_released_at IS NULL OR status = 'SELECTED')
    AND (selection_release_reason IS NULL OR (length(btrim(selection_release_reason)) > 0
                                              AND char_length(selection_release_reason) <= 1000))
  );

-- A release can never be undone.
CREATE FUNCTION public.applications_release_is_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF OLD.selection_released_at IS NOT NULL AND (
       NEW.selection_released_at IS DISTINCT FROM OLD.selection_released_at
    OR NEW.selection_release_reason IS DISTINCT FROM OLD.selection_release_reason
    OR NEW.selection_released_by IS DISTINCT FROM OLD.selection_released_by
    OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'selection_release_is_final';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER applications_release_is_final
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_release_is_final();

ALTER TABLE public.training_plan_events DROP CONSTRAINT training_plan_events_type_check;
ALTER TABLE public.training_plan_events ADD CONSTRAINT training_plan_events_type_check CHECK (event_type IN (
  'OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'REQUEST_MAPPED', 'REQUEST_UNMAPPED', 'SELECTION_RELEASED'
));

-- ---------------------------------------------------------------------------
-- 3. Seats consumed: SELECTED applications resolved to the opportunity,
--    excluding explicit releases (completion/cancellation keep the seat).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.training_opportunity_seats_consumed(p_internship_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT count(*)::integer
  FROM public.applications AS a
  LEFT JOIN public.training_request_mappings AS m
    ON a.internship_id IS NULL
   AND m.normalized_label = lower(btrim(a.requested_training))
  WHERE a.status = 'SELECTED'
    AND a.selection_released_at IS NULL
    AND coalesce(a.internship_id, m.internship_id) = p_internship_id;
$function$;

COMMENT ON FUNCTION public.training_opportunity_selected_count(uuid) IS
  'All SELECTED applications ever resolved to the opportunity, releases included (history; used to protect request mappings). Seats use training_opportunity_seats_consumed.';

-- ---------------------------------------------------------------------------
-- 4. Portal-wide application intake (owned by ADMIN).
-- ---------------------------------------------------------------------------
CREATE TABLE public.portal_settings (
  id boolean NOT NULL DEFAULT true,
  applications_open boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT portal_settings_pkey PRIMARY KEY (id),
  CONSTRAINT portal_settings_single_row CHECK (id)
);

-- Open by default: behaviour is unchanged until an administrator closes it.
INSERT INTO public.portal_settings (id, applications_open) VALUES (true, true);

ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.portal_settings FROM PUBLIC, anon, authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON TABLE public.portal_settings FROM service_role;
-- UPDATE is needed for the row locks below; changes go through
-- admin_set_application_intake.
GRANT SELECT, UPDATE ON TABLE public.portal_settings TO service_role;

-- Shared lock on the settings row, then refuse while intake is closed.
CREATE FUNCTION public.application_intake_require_open()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_open boolean;
BEGIN
  SELECT s.applications_open INTO v_open
  FROM public.portal_settings AS s WHERE s.id FOR SHARE;
  IF NOT coalesce(v_open, false) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'applications_closed';
  END IF;
END;
$function$;

CREATE FUNCTION public.get_application_intake()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT coalesce((SELECT s.applications_open FROM public.portal_settings AS s WHERE s.id), false);
$function$;

-- Every new application (DRAFT) is refused while intake is closed.
CREATE FUNCTION public.applications_intake_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  PERFORM public.application_intake_require_open();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER applications_intake_guard
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_intake_guard();

-- Audit: settings changes have no target account.
ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_type_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_type_check CHECK (event_type = ANY (ARRAY[
  'ADMIN_BOOTSTRAPPED', 'USER_CREATED', 'ROLE_CHANGED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'SETTING_UPDATED'
]));
ALTER TABLE public.admin_audit_events ALTER COLUMN target_email DROP NOT NULL;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_target_check
  CHECK (event_type = 'SETTING_UPDATED' OR target_email IS NOT NULL);

CREATE FUNCTION public.admin_set_application_intake(
  p_actor_profile_id uuid,
  p_open boolean,
  p_note text
)
RETURNS SETOF public.portal_settings
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_note text := nullif(btrim(p_note), '');
  v_current public.portal_settings;
  v_updated public.portal_settings;
BEGIN
  PERFORM public.admin_require_actor(p_actor_profile_id);
  IF p_open IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_intake_setting';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'note_too_long';
  END IF;

  -- Exclusive lock: waits for submissions holding the shared lock.
  SELECT s.* INTO v_current FROM public.portal_settings AS s WHERE s.id FOR UPDATE;
  IF v_current.applications_open = p_open THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'intake_unchanged';
  END IF;

  UPDATE public.portal_settings AS s
  SET applications_open = p_open, updated_at = now(), updated_by = p_actor_profile_id
  WHERE s.id
  RETURNING * INTO v_updated;

  INSERT INTO public.admin_audit_events (event_type, actor_profile_id, target_profile_id, target_email, details, note)
  VALUES ('SETTING_UPDATED', p_actor_profile_id, NULL, NULL,
          jsonb_build_object('setting', 'applicationsOpen', 'from', v_current.applications_open, 'to', p_open),
          v_note);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Opportunity management: listing, approval state and capacity.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.create_training_opportunity(uuid, text, integer, text);

CREATE FUNCTION public.create_training_opportunity(
  p_actor_profile_id uuid,
  p_title text,
  p_capacity integer,
  p_note text,
  p_is_active boolean,
  p_selection_status text
)
RETURNS SETOF public.internships
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_title text;
  v_note text;
  v_status text := coalesce(p_selection_status, 'NOT_APPROVED');
  v_internship public.internships;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  v_title := btrim(coalesce(p_title, ''));
  v_note := nullif(btrim(p_note), '');
  IF v_title = '' OR char_length(v_title) > 150 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_title';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_status';
  END IF;
  -- A new opportunity is either still awaiting approval or approved now.
  IF v_status NOT IN ('NOT_APPROVED', 'OPEN') THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_selection_status';
  END IF;
  IF p_capacity IS NOT NULL AND (p_capacity < 0 OR p_capacity > 10000) THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_capacity';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'planning_note_too_long';
  END IF;

  INSERT INTO public.internships (title, is_active, capacity, selection_status, selection_status_changed_at)
  VALUES (v_title, p_is_active, p_capacity, v_status, CASE WHEN v_status = 'OPEN' THEN now() END)
  RETURNING * INTO v_internship;

  INSERT INTO public.training_plan_events (event_type, internship_id, details, note, actor_profile_id)
  VALUES ('OPPORTUNITY_CREATED', v_internship.id,
          jsonb_build_object('title', v_title, 'capacity', p_capacity, 'isActive', p_is_active,
                             'selectionStatus', v_status),
          v_note, p_actor_profile_id);

  RETURN NEXT v_internship;
END;
$function$;

DROP FUNCTION public.update_training_opportunity(uuid, uuid, text, boolean, integer, text);

CREATE FUNCTION public.update_training_opportunity(
  p_actor_profile_id uuid,
  p_internship_id uuid,
  p_title text,
  p_is_active boolean,
  p_capacity integer,
  p_note text,
  p_selection_status text
)
RETURNS SETOF public.internships
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_current public.internships;
  v_title text;
  v_note text;
  v_consumed integer;
  v_changes jsonb := '{}'::jsonb;
  v_updated public.internships;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  v_title := btrim(coalesce(p_title, ''));
  v_note := nullif(btrim(p_note), '');
  IF v_title = '' OR char_length(v_title) > 150 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_title';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_status';
  END IF;
  IF p_selection_status IS NULL OR p_selection_status NOT IN ('NOT_APPROVED', 'OPEN', 'CLOSED') THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_selection_status';
  END IF;
  IF p_capacity IS NOT NULL AND (p_capacity < 0 OR p_capacity > 10000) THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_capacity';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'planning_note_too_long';
  END IF;

  -- Same lock as selection and release: seat checks and changes serialize.
  SELECT i.* INTO v_current
  FROM public.internships AS i WHERE i.id = p_internship_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'training_not_found';
  END IF;

  IF v_current.capacity IS DISTINCT FROM p_capacity THEN
    v_consumed := public.training_opportunity_seats_consumed(p_internship_id);
    IF p_capacity IS NULL AND v_consumed > 0 THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'capacity_required_with_selections';
    END IF;
    IF p_capacity IS NOT NULL AND p_capacity < v_consumed THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'capacity_below_selected';
    END IF;
    v_changes := v_changes || jsonb_build_object(
      'capacity', jsonb_build_object('from', v_current.capacity, 'to', p_capacity));
  END IF;
  IF v_current.selection_status IS DISTINCT FROM p_selection_status THEN
    -- Approval cannot be withdrawn once anyone was selected into it.
    IF p_selection_status = 'NOT_APPROVED'
       AND public.training_opportunity_selected_count(p_internship_id) > 0 THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_has_selections';
    END IF;
    v_changes := v_changes || jsonb_build_object(
      'selectionStatus', jsonb_build_object('from', v_current.selection_status, 'to', p_selection_status));
  END IF;
  IF v_current.title IS DISTINCT FROM v_title THEN
    v_changes := v_changes || jsonb_build_object(
      'title', jsonb_build_object('from', v_current.title, 'to', v_title));
  END IF;
  IF v_current.is_active IS DISTINCT FROM p_is_active THEN
    v_changes := v_changes || jsonb_build_object(
      'isActive', jsonb_build_object('from', v_current.is_active, 'to', p_is_active));
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_unchanged';
  END IF;

  UPDATE public.internships AS i
  SET title = v_title,
      is_active = p_is_active,
      capacity = p_capacity,
      selection_status = p_selection_status,
      selection_status_changed_at = CASE WHEN v_current.selection_status IS DISTINCT FROM p_selection_status
                                         THEN now() ELSE i.selection_status_changed_at END,
      updated_at = now()
  WHERE i.id = p_internship_id
  RETURNING * INTO v_updated;

  INSERT INTO public.training_plan_events (event_type, internship_id, details, note, actor_profile_id)
  VALUES ('OPPORTUNITY_UPDATED', p_internship_id, v_changes, v_note, p_actor_profile_id);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Release Selection (HR): frees the seat; final for the application.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.release_application_selection(
  p_actor_profile_id uuid,
  p_application_id uuid,
  p_reason text
)
RETURNS TABLE (
  id uuid,
  status text,
  selection_released_at timestamptz,
  selection_release_reason text
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_reason text := nullif(btrim(p_reason), '');
  v_application public.applications;
  v_opportunity_id uuid;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;
  IF v_reason IS NULL THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'release_reason_required';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'release_reason_too_long';
  END IF;

  SELECT a.* INTO v_application
  FROM public.applications AS a WHERE a.id = p_application_id FOR UPDATE;
  IF NOT FOUND OR v_application.status = 'DRAFT' THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'application_not_found';
  END IF;
  IF v_application.selection_released_at IS NOT NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'selection_already_released';
  END IF;
  -- Only a selection without an open or completed placement can be released
  -- (cancel a scheduled placement first; a completed one keeps its seat).
  IF v_application.status <> 'SELECTED' OR EXISTS (
    SELECT 1 FROM public.intern_placements AS ip
    WHERE ip.application_id = p_application_id
      AND ip.status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED')
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'selection_not_releasable';
  END IF;

  v_opportunity_id := public.resolve_application_training(
    v_application.internship_id, v_application.requested_training);
  IF v_opportunity_id IS NOT NULL THEN
    -- Serialize with selections and capacity changes on the same opportunity.
    PERFORM 1 FROM public.internships AS i WHERE i.id = v_opportunity_id FOR UPDATE;
  END IF;

  UPDATE public.applications AS a
  SET selection_released_at = now(),
      selection_release_reason = v_reason,
      selection_released_by = p_actor_profile_id
  WHERE a.id = p_application_id;

  INSERT INTO public.training_plan_events (event_type, internship_id, details, note, actor_profile_id)
  VALUES ('SELECTION_RELEASED', v_opportunity_id,
          jsonb_build_object('applicationId', p_application_id), v_reason, p_actor_profile_id);

  RETURN QUERY
  SELECT a.id, a.status::text, a.selection_released_at, a.selection_release_reason
  FROM public.applications AS a WHERE a.id = p_application_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Selection, placement and review submission with the rules above.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_application_status_v2(
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
  v_internship_id uuid;
  v_requested_training text;
  v_opportunity_id uuid;
  v_capacity integer;
  v_selection_status text;
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

  SELECT a.status::text, a.internship_id, a.requested_training
    INTO v_current_status, v_internship_id, v_requested_training
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

  IF EXISTS (
    SELECT 1 FROM public.intern_placements AS ip
    WHERE ip.application_id = p_application_id
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'placement_requires_selected_application';
  END IF;

  IF p_status = 'SELECTED' THEN
    IF v_internship_id IS NULL THEN
      -- Hold the mapping steady while the seat is counted and taken.
      SELECT m.internship_id INTO v_opportunity_id
      FROM public.training_request_mappings AS m
      WHERE m.normalized_label = lower(btrim(v_requested_training))
      FOR SHARE;
    ELSE
      v_opportunity_id := v_internship_id;
    END IF;

    IF v_opportunity_id IS NULL THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_not_planned';
    END IF;

    -- Same exclusive lock as release, capacity and selection-status changes.
    SELECT i.capacity, i.selection_status INTO v_capacity, v_selection_status
    FROM public.internships AS i
    WHERE i.id = v_opportunity_id
    FOR UPDATE;
    IF v_selection_status = 'NOT_APPROVED' THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_not_approved';
    END IF;
    IF v_selection_status <> 'OPEN' THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_selection_closed';
    END IF;
    IF v_capacity IS NULL THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_not_set';
    END IF;
    -- Cumulative for the opportunity's cycle: completed or cancelled placements
    -- keep their seat; only an explicit release frees one.
    IF public.training_opportunity_seats_consumed(v_opportunity_id) >= v_capacity THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_full';
    END IF;
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
  v_released_at timestamptz;
  v_selection_status text;
  v_capacity integer;
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
  SELECT a.applicant_id, a.status::text, a.internship_id, a.requested_training, a.selection_released_at
    INTO v_applicant_id, v_application_status, v_internship_id, v_requested_training, v_released_at
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

  -- A released selection is final: no further placement for this application.
  IF v_released_at IS NOT NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'selection_released';
  END IF;

  -- Replacing a cancelled placement: the application still holds its seat,
  -- but only while HR keeps selection OPEN and within capacity.
  IF EXISTS (
    SELECT 1 FROM public.intern_placements AS ip
    WHERE ip.application_id = p_application_id AND ip.status = 'CANCELLED'
  ) THEN
    SELECT i.selection_status, i.capacity INTO v_selection_status, v_capacity
    FROM public.internships AS i WHERE i.id = v_opportunity_id FOR SHARE;
    IF v_selection_status IS DISTINCT FROM 'OPEN' THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_selection_closed';
    END IF;
    IF v_capacity IS NULL OR public.training_opportunity_seats_consumed(v_opportunity_id) > v_capacity THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_full';
    END IF;
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
  IF EXISTS (SELECT 1 FROM public.applications AS a
             WHERE a.id = v_application_id AND a.selection_released_at IS NOT NULL) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'selection_released';
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

  -- The application's seat was taken at selection and is still counted, so
  -- activation does not count anyone again; it only re-checks that the
  -- opportunity is within its capacity (cumulative seats, not active interns).
  SELECT i.capacity INTO v_capacity
  FROM public.internships AS i WHERE i.id = v_internship_id FOR SHARE;
  IF v_capacity IS NULL THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_not_set';
  END IF;
  IF public.training_opportunity_seats_consumed(v_internship_id) > v_capacity THEN
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

-- ---------------------------------------------------------------------------
-- 8. Privileges: service_role only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.applications_release_is_final() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.training_opportunity_seats_consumed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.application_intake_require_open() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_application_intake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.applications_intake_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_application_intake(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_training_opportunity(uuid, text, integer, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_training_opportunity(uuid, uuid, text, boolean, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_application_selection(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_application_status_v2(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_intern_placement(uuid, uuid, text, text, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_intern_placement(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_application_review_v2(text, jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.training_opportunity_seats_consumed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.application_intake_require_open() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_application_intake() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_application_intake(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_training_opportunity(uuid, text, integer, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_training_opportunity(uuid, uuid, text, boolean, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_application_selection(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_application_status_v2(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_intern_placement(uuid, uuid, text, text, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_intern_placement(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_application_review_v2(text, jsonb, uuid, boolean) TO service_role;
