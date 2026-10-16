-- Feature 3: HR training demand and planning.
--
-- A training opportunity is an existing internships row. HR plans each one
-- with a capacity (seats). "Other" requests are mapped to an opportunity
-- without changing what the applicant asked for. Selecting an applicant
-- consumes a seat of the application's resolved opportunity; selection is
-- refused when no opportunity/capacity is planned or the seats are taken.
-- Every planning change is recorded in an append-only history.
--
-- Runtime access remains through the NestJS service-role client.

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'training_opportunity_selected_count',
        'resolve_application_training',
        'create_training_opportunity',
        'update_training_opportunity',
        'map_training_request',
        'unmap_training_request'
      )
  ) OR to_regclass('public.training_request_mappings') IS NOT NULL
    OR to_regclass('public.training_plan_events') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001',
      MESSAGE = 'training_planning_name_already_exists';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Planning fields on training opportunities.
-- ---------------------------------------------------------------------------
ALTER TABLE public.internships
  ADD COLUMN capacity integer NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.internships
  ADD CONSTRAINT internships_capacity_check
    CHECK (capacity IS NULL OR capacity BETWEEN 0 AND 10000),
  ADD CONSTRAINT internships_title_check
    CHECK (length(btrim(title)) > 0 AND char_length(title) <= 150);

COMMENT ON COLUMN public.internships.capacity IS
  'Seats HR plans to fill. NULL = not planned yet; selection requires a capacity.';

-- Training records referenced by applications must never disappear with them.
ALTER TABLE public.applications
  DROP CONSTRAINT applications_internship_id_fkey,
  ADD CONSTRAINT applications_internship_id_fkey
    FOREIGN KEY (internship_id) REFERENCES public.internships (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2. "Other" request labels mapped to an opportunity.
-- ---------------------------------------------------------------------------
CREATE TABLE public.training_request_mappings (
  normalized_label text NOT NULL,
  internship_id uuid NOT NULL,
  mapped_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_request_mappings_pkey PRIMARY KEY (normalized_label),
  CONSTRAINT training_request_mappings_label_check CHECK (
    normalized_label = lower(btrim(normalized_label))
    AND length(normalized_label) BETWEEN 1 AND 150
  ),
  CONSTRAINT training_request_mappings_internship_id_fkey
    FOREIGN KEY (internship_id) REFERENCES public.internships (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT training_request_mappings_mapped_by_fkey
    FOREIGN KEY (mapped_by) REFERENCES public.profiles (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX training_request_mappings_internship_idx
  ON public.training_request_mappings (internship_id);

ALTER TABLE public.training_request_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.training_request_mappings FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON TABLE public.training_request_mappings FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_request_mappings TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Append-only planning history.
-- ---------------------------------------------------------------------------
CREATE TABLE public.training_plan_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  internship_id uuid NULL,
  request_label text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NULL,
  actor_profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_plan_events_pkey PRIMARY KEY (id),
  CONSTRAINT training_plan_events_type_check CHECK (event_type IN (
    'OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'REQUEST_MAPPED', 'REQUEST_UNMAPPED'
  )),
  CONSTRAINT training_plan_events_details_check CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT training_plan_events_note_check CHECK (
    note IS NULL OR (length(btrim(note)) > 0 AND char_length(note) <= 2000)
  ),
  CONSTRAINT training_plan_events_internship_id_fkey
    FOREIGN KEY (internship_id) REFERENCES public.internships (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT training_plan_events_actor_profile_id_fkey
    FOREIGN KEY (actor_profile_id) REFERENCES public.profiles (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX training_plan_events_internship_created_idx
  ON public.training_plan_events (internship_id, created_at);

ALTER TABLE public.training_plan_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.training_plan_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.training_plan_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.training_plan_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Helpers: resolved opportunity and committed seats.
-- ---------------------------------------------------------------------------
-- The opportunity an application counts against: its listed internship, or
-- the opportunity its "Other" label is mapped to (NULL when unmapped).
CREATE FUNCTION public.resolve_application_training(
  p_internship_id uuid,
  p_requested_training text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT coalesce(
    p_internship_id,
    (SELECT m.internship_id
     FROM public.training_request_mappings AS m
     WHERE m.normalized_label = lower(btrim(p_requested_training)))
  );
$function$;

-- Seats committed to an opportunity: selected applications resolved to it.
CREATE FUNCTION public.training_opportunity_selected_count(p_internship_id uuid)
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
    AND coalesce(a.internship_id, m.internship_id) = p_internship_id;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Opportunity management.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.create_training_opportunity(
  p_actor_profile_id uuid,
  p_title text,
  p_capacity integer,
  p_note text
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
  IF p_capacity IS NOT NULL AND (p_capacity < 0 OR p_capacity > 10000) THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_capacity';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'planning_note_too_long';
  END IF;

  INSERT INTO public.internships (title, is_active, capacity)
  VALUES (v_title, true, p_capacity)
  RETURNING * INTO v_internship;

  INSERT INTO public.training_plan_events (event_type, internship_id, details, note, actor_profile_id)
  VALUES ('OPPORTUNITY_CREATED', v_internship.id,
          jsonb_build_object('title', v_title, 'capacity', p_capacity, 'isActive', true),
          v_note, p_actor_profile_id);

  RETURN NEXT v_internship;
END;
$function$;

CREATE FUNCTION public.update_training_opportunity(
  p_actor_profile_id uuid,
  p_internship_id uuid,
  p_title text,
  p_is_active boolean,
  p_capacity integer,
  p_note text
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
  v_selected integer;
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
  IF p_capacity IS NOT NULL AND (p_capacity < 0 OR p_capacity > 10000) THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_capacity';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'planning_note_too_long';
  END IF;

  -- Same lock as selection: capacity checks and seat changes serialize.
  SELECT i.* INTO v_current
  FROM public.internships AS i WHERE i.id = p_internship_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'training_not_found';
  END IF;

  IF v_current.capacity IS DISTINCT FROM p_capacity THEN
    v_selected := public.training_opportunity_selected_count(p_internship_id);
    IF p_capacity IS NULL AND v_selected > 0 THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'capacity_required_with_selections';
    END IF;
    IF p_capacity IS NOT NULL AND p_capacity < v_selected THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'capacity_below_selected';
    END IF;
    v_changes := v_changes || jsonb_build_object(
      'capacity', jsonb_build_object('from', v_current.capacity, 'to', p_capacity));
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
      updated_at = now()
  WHERE i.id = p_internship_id
  RETURNING * INTO v_updated;

  INSERT INTO public.training_plan_events (event_type, internship_id, details, note, actor_profile_id)
  VALUES ('OPPORTUNITY_UPDATED', p_internship_id, v_changes, v_note, p_actor_profile_id);

  RETURN NEXT v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Mapping "Other" requests to opportunities.
--    A mapping cannot move or disappear while selections depend on it.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.map_training_request(
  p_actor_profile_id uuid,
  p_label text,
  p_internship_id uuid,
  p_note text
)
RETURNS SETOF public.training_request_mappings
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_label text;
  v_note text;
  v_existing public.training_request_mappings;
  v_existing_found boolean;
  v_mapping public.training_request_mappings;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  v_label := lower(btrim(coalesce(p_label, '')));
  v_note := nullif(btrim(p_note), '');
  IF v_label = '' OR char_length(v_label) > 150 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'invalid_training_request';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'planning_note_too_long';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.applications AS a
    WHERE a.internship_id IS NULL
      AND a.status <> 'DRAFT'
      AND lower(btrim(a.requested_training)) = v_label
  ) THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'training_request_not_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.internships AS i WHERE i.id = p_internship_id) THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'training_not_found';
  END IF;

  -- Serializes with selection, which reads this mapping FOR SHARE.
  SELECT m.* INTO v_existing
  FROM public.training_request_mappings AS m
  WHERE m.normalized_label = v_label
  FOR UPDATE;
  v_existing_found := FOUND;

  IF v_existing_found AND v_existing.internship_id = p_internship_id THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_request_already_mapped';
  END IF;

  IF v_existing_found AND EXISTS (
    SELECT 1 FROM public.applications AS a
    WHERE a.internship_id IS NULL
      AND a.status = 'SELECTED'
      AND lower(btrim(a.requested_training)) = v_label
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_request_has_selections';
  END IF;

  INSERT INTO public.training_request_mappings (normalized_label, internship_id, mapped_by)
  VALUES (v_label, p_internship_id, p_actor_profile_id)
  ON CONFLICT (normalized_label) DO UPDATE
    SET internship_id = EXCLUDED.internship_id,
        mapped_by = EXCLUDED.mapped_by,
        updated_at = now()
  RETURNING * INTO v_mapping;

  INSERT INTO public.training_plan_events (event_type, internship_id, request_label, details, note, actor_profile_id)
  VALUES ('REQUEST_MAPPED', p_internship_id, v_label,
          jsonb_build_object('fromInternshipId', v_existing.internship_id, 'toInternshipId', p_internship_id),
          v_note, p_actor_profile_id);

  RETURN NEXT v_mapping;
END;
$function$;

CREATE FUNCTION public.unmap_training_request(
  p_actor_profile_id uuid,
  p_label text,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor_role text;
  v_label text;
  v_note text;
  v_existing public.training_request_mappings;
BEGIN
  SELECT p.role::text INTO v_actor_role
  FROM public.profiles AS p WHERE p.id = p_actor_profile_id FOR SHARE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'HR' THEN
    RAISE SQLSTATE 'PZ403' USING MESSAGE = 'hr_role_required';
  END IF;

  v_label := lower(btrim(coalesce(p_label, '')));
  v_note := nullif(btrim(p_note), '');
  IF char_length(v_note) > 2000 THEN
    RAISE SQLSTATE 'PZ400' USING MESSAGE = 'planning_note_too_long';
  END IF;

  SELECT m.* INTO v_existing
  FROM public.training_request_mappings AS m
  WHERE m.normalized_label = v_label
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PZ404' USING MESSAGE = 'training_request_not_mapped';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.applications AS a
    WHERE a.internship_id IS NULL
      AND a.status = 'SELECTED'
      AND lower(btrim(a.requested_training)) = v_label
  ) THEN
    RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_request_has_selections';
  END IF;

  DELETE FROM public.training_request_mappings AS m WHERE m.normalized_label = v_label;

  INSERT INTO public.training_plan_events (event_type, internship_id, request_label, details, note, actor_profile_id)
  VALUES ('REQUEST_UNMAPPED', v_existing.internship_id, v_label,
          jsonb_build_object('fromInternshipId', v_existing.internship_id), v_note, p_actor_profile_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. HR status changes: as before, plus capacity enforcement on SELECTED.
--    Lock order: application -> request mapping (share) -> opportunity.
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

    SELECT i.capacity INTO v_capacity
    FROM public.internships AS i
    WHERE i.id = v_opportunity_id
    FOR UPDATE;

    IF v_capacity IS NULL THEN
      RAISE SQLSTATE 'PZ409' USING MESSAGE = 'training_capacity_not_set';
    END IF;
    IF public.training_opportunity_selected_count(v_opportunity_id) >= v_capacity THEN
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

-- ---------------------------------------------------------------------------
-- 8. Privileges: backend only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.resolve_application_training(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.training_opportunity_selected_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_training_opportunity(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_training_opportunity(uuid, uuid, text, boolean, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.map_training_request(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unmap_training_request(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_application_status_v2(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_application_training(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.training_opportunity_selected_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_training_opportunity(uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_training_opportunity(uuid, uuid, text, boolean, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.map_training_request(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unmap_training_request(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_application_status_v2(uuid, uuid, text, text, text) TO service_role;
