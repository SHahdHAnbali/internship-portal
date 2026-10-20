-- Mentor evaluations (owner-approved plan, 2026-10-18).
--
-- * One free-text evaluation body per evaluation (no title, sections, criteria
--   or scores), at most 40,000 Unicode code points (char_length). The text is
--   stored exactly as received: never trimmed, truncated or normalized.
-- * Drafts are private to the Mentor. Publishing copies the saved text into a
--   separate snapshot; the intern only ever sees that snapshot. Later saves do
--   not change it until the Mentor publishes again. No unpublish, no delete.
-- * Every successful change (create, changed save, publish) produces exactly
--   one new revision and one metadata-only audit event for that revision. An
--   unchanged save produces neither. Saves and publishes require the expected
--   revision (optimistic concurrency); a stale revision is refused.
-- * The currently assigned, active Mentor reads evaluations of their ACTIVE or
--   COMPLETED placements and writes only on ACTIVE ones. Interns read only the
--   published snapshots of their own ACTIVE or COMPLETED placements. HR and
--   ADMIN have no function here. Completion is unchanged: drafts never block
--   it and are never published or deleted by it.
-- * Identity: the backend passes the verified Supabase Auth user id, which is
--   also the profile id (profiles.id is the primary key and a validated
--   foreign key to auth.users.id, confirmed live 2026-10-18). Every function
--   re-checks role, active status, assignment or ownership and placement state.
--
-- Lock order for writes (approved design choice, NOT a proven deadlock-free
-- guarantee): Mentor profile FOR SHARE -> placement FOR UPDATE -> evaluation
-- FOR UPDATE. This matches review_mentor_weekly_report and
-- intern_lock_active_placement (actor profile first). assign_intern_placement_mentor
-- and activate_intern_placement lock in the opposite order (placement, then
-- the Mentor profile FOR SHARE); whether that can form a deadlock together with
-- a queued exclusive lock on the same profile is an open question, exercised by
-- supabase/tests/sql/171_mentor_evaluations_concurrency.test.sql. Reads take no
-- row locks. No existing function is changed here.
--
-- Errors: each condition has its own SQLSTATE in the project's PZ class and its
-- own message key.
--   PZE01 evaluation_access_denied             (not an active MENTOR / INTERN)
--   PZE02 placement_not_found                  (missing or not assigned)
--   PZE03 evaluation_not_found                 (missing or not accessible)
--   PZE04 placement_not_active                 (write on a non-ACTIVE placement,
--                                               read on SCHEDULED/CANCELLED)
--   PZE05 evaluation_revision_conflict         (DETAIL: {"currentRevision": n})
--   PZE06 evaluation_nothing_to_publish
--   PZE07 evaluation_content_too_long
--   PZE08 evaluation_content_invalid_characters (control characters or NULL)
--   PZE09 evaluation_content_required          (publishing blank text)
--   PZE10 evaluation_integrity_violation        (direct writes breaking invariants)

-- ---------------------------------------------------------------------------
-- 1. Text helpers.
-- ---------------------------------------------------------------------------

-- True when the text is NULL or only whitespace (ASCII and Unicode spaces).
CREATE FUNCTION public.portal_text_is_blank(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT p_value IS NULL OR btrim(
    p_value,
    E' \t\n\r\f' || chr(11) || chr(160) || chr(5760)
      || chr(8192) || chr(8193) || chr(8194) || chr(8195)
      || chr(8196) || chr(8197) || chr(8198) || chr(8199)
      || chr(8200) || chr(8201) || chr(8202) || chr(8232)
      || chr(8233) || chr(8239) || chr(8287) || chr(12288)
      || chr(65279)
  ) = '';
$function$;

-- True when the text contains a control character other than tab, LF or CR
-- (C0 controls, DEL and C1 controls).
CREATE FUNCTION public.evaluation_text_has_invalid_characters(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT p_value ~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]';
$function$;

-- ---------------------------------------------------------------------------
-- 2. Evaluations.
-- ---------------------------------------------------------------------------
CREATE TABLE public.intern_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL,
  author_profile_id uuid NOT NULL,
  updated_by_profile_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT',
  revision integer NOT NULL DEFAULT 1,
  published_content text NULL,
  published_revision integer NULL,
  published_at timestamptz NULL,
  published_by_profile_id uuid NULL,
  first_published_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intern_evaluations_pkey PRIMARY KEY (id),
  CONSTRAINT intern_evaluations_placement_id_fkey
    FOREIGN KEY (placement_id) REFERENCES public.intern_placements (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_evaluations_author_profile_id_fkey
    FOREIGN KEY (author_profile_id) REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_evaluations_updated_by_profile_id_fkey
    FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_evaluations_published_by_profile_id_fkey
    FOREIGN KEY (published_by_profile_id) REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_evaluations_status_check CHECK (status IN ('DRAFT', 'PUBLISHED')),
  CONSTRAINT intern_evaluations_revision_check CHECK (revision >= 1),
  CONSTRAINT intern_evaluations_content_length_check CHECK (char_length(content) <= 40000),
  CONSTRAINT intern_evaluations_content_characters_check
    CHECK (NOT public.evaluation_text_has_invalid_characters(content)),
  CONSTRAINT intern_evaluations_published_content_check CHECK (
    published_content IS NULL
    OR (char_length(published_content) <= 40000
        AND NOT public.evaluation_text_has_invalid_characters(published_content))
  ),
  -- DRAFT: never published, no snapshot. PUBLISHED: a complete, non-blank snapshot.
  CONSTRAINT intern_evaluations_publication_check CHECK (
    (status = 'DRAFT'
      AND published_content IS NULL AND published_revision IS NULL AND published_at IS NULL
      AND published_by_profile_id IS NULL AND first_published_at IS NULL)
    OR
    (status = 'PUBLISHED'
      AND published_content IS NOT NULL AND NOT public.portal_text_is_blank(published_content)
      AND published_revision IS NOT NULL AND published_revision <= revision
      AND published_at IS NOT NULL AND published_by_profile_id IS NOT NULL
      AND first_published_at IS NOT NULL AND first_published_at <= published_at)
  ),
  CONSTRAINT intern_evaluations_timestamps_check CHECK (updated_at >= created_at)
);

CREATE INDEX intern_evaluations_placement_created_idx
  ON public.intern_evaluations (placement_id, created_at DESC, id);

-- Invariants enforced on every write, including direct writes by the owner.
CREATE FUNCTION public.intern_evaluations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 1 OR NEW.status <> 'DRAFT' OR NEW.updated_by_profile_id IS DISTINCT FROM NEW.author_profile_id THEN
      RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
        DETAIL = 'invalid_insert';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.placement_id IS DISTINCT FROM OLD.placement_id
     OR NEW.author_profile_id IS DISTINCT FROM OLD.author_profile_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.first_published_at IS NOT NULL AND NEW.first_published_at IS DISTINCT FROM OLD.first_published_at) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
      DETAIL = 'immutable_column';
  END IF;
  IF NEW.revision IS DISTINCT FROM OLD.revision + 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
      DETAIL = 'revision_sequence';
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
      DETAIL = 'unpublish_not_allowed';
  END IF;

  IF NEW.published_revision IS NOT DISTINCT FROM OLD.published_revision THEN
    -- A save: the published snapshot must stay exactly as it was.
    IF (NEW.status, NEW.published_content, NEW.published_at, NEW.published_by_profile_id, NEW.first_published_at)
       IS DISTINCT FROM
       (OLD.status, OLD.published_content, OLD.published_at, OLD.published_by_profile_id, OLD.first_published_at) THEN
      RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
        DETAIL = 'snapshot_changed_by_save';
    END IF;
  ELSE
    -- A publish: snapshot := the saved text, at the new revision; the text itself is unchanged.
    IF NEW.status <> 'PUBLISHED'
       OR NEW.published_revision IS DISTINCT FROM NEW.revision
       OR NEW.published_content IS DISTINCT FROM NEW.content
       OR NEW.content IS DISTINCT FROM OLD.content THEN
      RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
        DETAIL = 'invalid_publish';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER intern_evaluations_guard
BEFORE INSERT OR UPDATE ON public.intern_evaluations
FOR EACH ROW EXECUTE FUNCTION public.intern_evaluations_guard();

-- ---------------------------------------------------------------------------
-- 3. Metadata-only audit events (one per revision; never any text).
-- ---------------------------------------------------------------------------
CREATE TABLE public.intern_evaluation_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL,
  placement_id uuid NOT NULL,
  event_type text NOT NULL,
  revision integer NOT NULL,
  actor_profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intern_evaluation_events_pkey PRIMARY KEY (id),
  CONSTRAINT intern_evaluation_events_evaluation_id_fkey
    FOREIGN KEY (evaluation_id) REFERENCES public.intern_evaluations (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_evaluation_events_placement_id_fkey
    FOREIGN KEY (placement_id) REFERENCES public.intern_placements (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_evaluation_events_actor_profile_id_fkey
    FOREIGN KEY (actor_profile_id) REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT intern_evaluation_events_type_check CHECK (event_type IN ('CREATED', 'UPDATED', 'PUBLISHED')),
  CONSTRAINT intern_evaluation_events_revision_check CHECK (revision >= 1),
  CONSTRAINT intern_evaluation_events_created_check CHECK ((event_type = 'CREATED') = (revision = 1)),
  CONSTRAINT intern_evaluation_events_one_per_revision UNIQUE (evaluation_id, revision)
);

CREATE INDEX intern_evaluation_events_placement_created_idx
  ON public.intern_evaluation_events (placement_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. Privileges. REVOKE ALL first (Supabase's default privileges grant
--    everything to service_role and part to the browser roles on new tables),
--    then the minimum for the functions below. No DELETE, no TRUNCATE.
-- ---------------------------------------------------------------------------
ALTER TABLE public.intern_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intern_evaluation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.intern_evaluations, public.intern_evaluation_events
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT ON TABLE public.intern_evaluations TO service_role;
GRANT UPDATE (content, status, revision, updated_by_profile_id, updated_at, published_content,
              published_revision, published_at, published_by_profile_id, first_published_at)
  ON TABLE public.intern_evaluations TO service_role;
GRANT SELECT, INSERT ON TABLE public.intern_evaluation_events TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Mentor view rows (internal helper; does no authorization itself and is
--    only called by the functions below after their checks).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.mentor_evaluation_rows(
  p_mentor_profile_id uuid,
  p_placement_id uuid,
  p_evaluation_id uuid
)
RETURNS TABLE (
  evaluation_id uuid,
  placement_id uuid,
  placement_status text,
  content text,
  publication_state text,
  revision integer,
  published_content text,
  published_revision integer,
  published_at timestamptz,
  first_published_at timestamptz,
  published_by_current_user boolean,
  author_name text,
  last_editor_name text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT e.id,
         e.placement_id,
         ip.status,
         e.content,
         CASE WHEN e.status = 'DRAFT' THEN 'DRAFT'
              WHEN e.content IS DISTINCT FROM e.published_content THEN 'UNPUBLISHED_CHANGES'
              ELSE 'PUBLISHED' END,
         e.revision,
         e.published_content,
         e.published_revision,
         e.published_at,
         e.first_published_at,
         (e.published_by_profile_id IS NOT NULL AND e.published_by_profile_id = p_mentor_profile_id),
         coalesce(author.full_name, author.email),
         coalesce(editor.full_name, editor.email),
         e.created_at,
         e.updated_at
  FROM public.intern_evaluations AS e
  JOIN public.intern_placements AS ip ON ip.id = e.placement_id
  JOIN public.profiles AS author ON author.id = e.author_profile_id
  JOIN public.profiles AS editor ON editor.id = e.updated_by_profile_id
  WHERE (p_placement_id IS NULL OR e.placement_id = p_placement_id)
    AND (p_evaluation_id IS NULL OR e.id = p_evaluation_id)
  ORDER BY e.created_at, e.id;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Mentor: reads (no row locks).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_mentor_evaluations(
  p_mentor_profile_id uuid,
  p_placement_id uuid
)
RETURNS TABLE (
  evaluation_id uuid, placement_id uuid, placement_status text, content text, publication_state text,
  revision integer, published_content text, published_revision integer, published_at timestamptz,
  first_published_at timestamptz, published_by_current_user boolean, author_name text,
  last_editor_name text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_mentor_profile_id AND p.role = 'MENTOR' AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE01', MESSAGE = 'evaluation_access_denied';
  END IF;

  SELECT ip.* INTO v_placement FROM public.intern_placements AS ip WHERE ip.id = p_placement_id;
  IF NOT FOUND OR v_placement.mentor_profile_id IS DISTINCT FROM p_mentor_profile_id THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE02', MESSAGE = 'placement_not_found';
  END IF;
  IF NOT (v_placement.status = ANY (ARRAY['ACTIVE', 'COMPLETED'])) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE04', MESSAGE = 'placement_not_active';
  END IF;

  RETURN QUERY SELECT * FROM public.mentor_evaluation_rows(p_mentor_profile_id, p_placement_id, NULL);
END;
$function$;

CREATE FUNCTION public.get_mentor_evaluation(
  p_mentor_profile_id uuid,
  p_evaluation_id uuid
)
RETURNS TABLE (
  evaluation_id uuid, placement_id uuid, placement_status text, content text, publication_state text,
  revision integer, published_content text, published_revision integer, published_at timestamptz,
  first_published_at timestamptz, published_by_current_user boolean, author_name text,
  last_editor_name text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_mentor_profile_id AND p.role = 'MENTOR' AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE01', MESSAGE = 'evaluation_access_denied';
  END IF;

  -- Missing, not this Mentor's placement, or a placement status that cannot
  -- hold readable evaluations: all the same answer.
  IF NOT EXISTS (
    SELECT 1
    FROM public.intern_evaluations AS e
    JOIN public.intern_placements AS ip ON ip.id = e.placement_id
    WHERE e.id = p_evaluation_id
      AND ip.mentor_profile_id = p_mentor_profile_id
      AND ip.status = ANY (ARRAY['ACTIVE', 'COMPLETED'])
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE03', MESSAGE = 'evaluation_not_found';
  END IF;

  RETURN QUERY SELECT * FROM public.mentor_evaluation_rows(p_mentor_profile_id, NULL, p_evaluation_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Mentor: writes. Lock order: Mentor profile FOR SHARE -> placement FOR
--    UPDATE -> evaluation FOR UPDATE; every check after the relevant lock.
-- ---------------------------------------------------------------------------

-- Raises the content validation error for p_content, if any.
CREATE FUNCTION public.mentor_evaluation_check_content(p_content text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_content IS NULL OR public.evaluation_text_has_invalid_characters(p_content) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE08', MESSAGE = 'evaluation_content_invalid_characters';
  END IF;
  IF char_length(p_content) > 40000 THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE07', MESSAGE = 'evaluation_content_too_long';
  END IF;
END;
$function$;

-- Locks the caller's profile (FOR SHARE) and requires an active MENTOR.
CREATE FUNCTION public.mentor_evaluation_lock_mentor(p_mentor_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_role text;
  v_active boolean;
BEGIN
  SELECT p.role::text, p.is_active INTO v_role, v_active
  FROM public.profiles AS p WHERE p.id = p_mentor_profile_id
  FOR SHARE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'MENTOR' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE01', MESSAGE = 'evaluation_access_denied';
  END IF;
END;
$function$;

CREATE FUNCTION public.create_mentor_evaluation(
  p_mentor_profile_id uuid,
  p_placement_id uuid,
  p_content text
)
RETURNS TABLE (
  evaluation_id uuid, placement_id uuid, placement_status text, content text, publication_state text,
  revision integer, published_content text, published_revision integer, published_at timestamptz,
  first_published_at timestamptz, published_by_current_user boolean, author_name text,
  last_editor_name text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
  v_evaluation_id uuid;
BEGIN
  PERFORM public.mentor_evaluation_lock_mentor(p_mentor_profile_id);

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip WHERE ip.id = p_placement_id
  FOR UPDATE;
  IF NOT FOUND OR v_placement.mentor_profile_id IS DISTINCT FROM p_mentor_profile_id THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE02', MESSAGE = 'placement_not_found';
  END IF;
  IF v_placement.status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE04', MESSAGE = 'placement_not_active';
  END IF;

  PERFORM public.mentor_evaluation_check_content(p_content);

  INSERT INTO public.intern_evaluations (placement_id, author_profile_id, updated_by_profile_id, content)
  VALUES (p_placement_id, p_mentor_profile_id, p_mentor_profile_id, p_content)
  RETURNING id INTO v_evaluation_id;

  INSERT INTO public.intern_evaluation_events (evaluation_id, placement_id, event_type, revision, actor_profile_id)
  VALUES (v_evaluation_id, p_placement_id, 'CREATED', 1, p_mentor_profile_id);

  RETURN QUERY SELECT * FROM public.mentor_evaluation_rows(p_mentor_profile_id, NULL, v_evaluation_id);
END;
$function$;

-- Locks profile, placement and evaluation for a write on an existing
-- evaluation, applying every access, lifecycle and revision check. Returns the
-- locked evaluation row.
CREATE FUNCTION public.mentor_evaluation_lock_for_write(
  p_mentor_profile_id uuid,
  p_evaluation_id uuid,
  p_expected_revision integer
)
RETURNS public.intern_evaluations
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement_id uuid;
  v_placement public.intern_placements;
  v_evaluation public.intern_evaluations;
BEGIN
  PERFORM public.mentor_evaluation_lock_mentor(p_mentor_profile_id);

  -- placement_id never changes (trigger), so an unlocked read is enough to find it.
  SELECT e.placement_id INTO v_placement_id FROM public.intern_evaluations AS e WHERE e.id = p_evaluation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE03', MESSAGE = 'evaluation_not_found';
  END IF;

  SELECT ip.* INTO v_placement
  FROM public.intern_placements AS ip WHERE ip.id = v_placement_id
  FOR UPDATE;
  IF NOT FOUND OR v_placement.mentor_profile_id IS DISTINCT FROM p_mentor_profile_id
     OR NOT (v_placement.status = ANY (ARRAY['ACTIVE', 'COMPLETED'])) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE03', MESSAGE = 'evaluation_not_found';
  END IF;
  IF v_placement.status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE04', MESSAGE = 'placement_not_active';
  END IF;

  SELECT e.* INTO v_evaluation FROM public.intern_evaluations AS e WHERE e.id = p_evaluation_id FOR UPDATE;
  IF p_expected_revision IS NULL OR v_evaluation.revision <> p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE05', MESSAGE = 'evaluation_revision_conflict',
      DETAIL = json_build_object('currentRevision', v_evaluation.revision)::text;
  END IF;

  RETURN v_evaluation;
END;
$function$;

CREATE FUNCTION public.save_mentor_evaluation(
  p_mentor_profile_id uuid,
  p_evaluation_id uuid,
  p_expected_revision integer,
  p_content text
)
RETURNS TABLE (
  evaluation_id uuid, placement_id uuid, placement_status text, content text, publication_state text,
  revision integer, published_content text, published_revision integer, published_at timestamptz,
  first_published_at timestamptz, published_by_current_user boolean, author_name text,
  last_editor_name text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_evaluation public.intern_evaluations;
  v_revision integer;
BEGIN
  PERFORM public.mentor_evaluation_check_content(p_content);
  v_evaluation := public.mentor_evaluation_lock_for_write(p_mentor_profile_id, p_evaluation_id, p_expected_revision);

  -- Unchanged text: nothing to record (no new revision, no event).
  IF v_evaluation.content = p_content THEN
    RETURN QUERY SELECT * FROM public.mentor_evaluation_rows(p_mentor_profile_id, NULL, p_evaluation_id);
    RETURN;
  END IF;

  UPDATE public.intern_evaluations AS e
  SET content = p_content,
      revision = e.revision + 1,
      updated_by_profile_id = p_mentor_profile_id,
      updated_at = now()
  WHERE e.id = p_evaluation_id AND e.revision = p_expected_revision
  RETURNING e.revision INTO v_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE05', MESSAGE = 'evaluation_revision_conflict';
  END IF;

  INSERT INTO public.intern_evaluation_events (evaluation_id, placement_id, event_type, revision, actor_profile_id)
  VALUES (p_evaluation_id, v_evaluation.placement_id, 'UPDATED', v_revision, p_mentor_profile_id);

  RETURN QUERY SELECT * FROM public.mentor_evaluation_rows(p_mentor_profile_id, NULL, p_evaluation_id);
END;
$function$;

CREATE FUNCTION public.publish_mentor_evaluation(
  p_mentor_profile_id uuid,
  p_evaluation_id uuid,
  p_expected_revision integer
)
RETURNS TABLE (
  evaluation_id uuid, placement_id uuid, placement_status text, content text, publication_state text,
  revision integer, published_content text, published_revision integer, published_at timestamptz,
  first_published_at timestamptz, published_by_current_user boolean, author_name text,
  last_editor_name text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_evaluation public.intern_evaluations;
  v_revision integer;
BEGIN
  v_evaluation := public.mentor_evaluation_lock_for_write(p_mentor_profile_id, p_evaluation_id, p_expected_revision);

  IF public.portal_text_is_blank(v_evaluation.content) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE09', MESSAGE = 'evaluation_content_required';
  END IF;
  IF v_evaluation.status = 'PUBLISHED' AND v_evaluation.content = v_evaluation.published_content THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE06', MESSAGE = 'evaluation_nothing_to_publish';
  END IF;

  -- The snapshot is the saved text of the locked row (never client input).
  UPDATE public.intern_evaluations AS e
  SET status = 'PUBLISHED',
      revision = e.revision + 1,
      published_content = e.content,
      published_revision = e.revision + 1,
      published_at = now(),
      published_by_profile_id = p_mentor_profile_id,
      first_published_at = coalesce(e.first_published_at, now()),
      updated_by_profile_id = p_mentor_profile_id,
      updated_at = now()
  WHERE e.id = p_evaluation_id AND e.revision = p_expected_revision
  RETURNING e.revision INTO v_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE05', MESSAGE = 'evaluation_revision_conflict';
  END IF;

  INSERT INTO public.intern_evaluation_events (evaluation_id, placement_id, event_type, revision, actor_profile_id)
  VALUES (p_evaluation_id, v_evaluation.placement_id, 'PUBLISHED', v_revision, p_mentor_profile_id);

  RETURN QUERY SELECT * FROM public.mentor_evaluation_rows(p_mentor_profile_id, NULL, p_evaluation_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Intern: published snapshots of their own ACTIVE or COMPLETED placements
--    (no working text, revision or state). No row locks.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_my_evaluations(p_auth_user_id uuid)
RETURNS TABLE (
  evaluation_id uuid,
  placement_id uuid,
  placement_status text,
  training_title text,
  company text,
  content text,
  published_at timestamptz,
  author_name text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_auth_user_id AND p.role = 'INTERN' AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE01', MESSAGE = 'evaluation_access_denied';
  END IF;

  RETURN QUERY
  SELECT e.id, e.placement_id, ip.status, i.title, ip.company, e.published_content, e.published_at,
         coalesce(author.full_name, author.email)
  FROM public.intern_evaluations AS e
  JOIN public.intern_placements AS ip ON ip.id = e.placement_id
  JOIN public.applicants AS a ON a.id = ip.applicant_id
  JOIN public.internships AS i ON i.id = ip.internship_id
  JOIN public.profiles AS author ON author.id = e.author_profile_id
  WHERE a.auth_user_id = p_auth_user_id
    AND ip.status = ANY (ARRAY['ACTIVE', 'COMPLETED'])
    AND e.status = 'PUBLISHED'
  ORDER BY e.published_at DESC, e.id;
END;
$function$;

CREATE FUNCTION public.get_my_evaluation(p_auth_user_id uuid, p_evaluation_id uuid)
RETURNS TABLE (
  evaluation_id uuid,
  placement_id uuid,
  placement_status text,
  training_title text,
  company text,
  content text,
  published_at timestamptz,
  author_name text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_auth_user_id AND p.role = 'INTERN' AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE01', MESSAGE = 'evaluation_access_denied';
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.list_my_evaluations(p_auth_user_id) AS r
  WHERE r.evaluation_id = p_evaluation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE03', MESSAGE = 'evaluation_not_found';
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Function privileges: service_role only (Supabase's default privileges
--    also grant EXECUTE to anon/authenticated, so revoke them explicitly).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.portal_text_is_blank(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluation_text_has_invalid_characters(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intern_evaluations_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mentor_evaluation_rows(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_mentor_evaluations(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_mentor_evaluation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mentor_evaluation_check_content(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mentor_evaluation_lock_mentor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_mentor_evaluation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mentor_evaluation_lock_for_write(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_mentor_evaluation(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_mentor_evaluation(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_evaluations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_evaluation(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.portal_text_is_blank(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluation_text_has_invalid_characters(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_evaluation_rows(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mentor_evaluations(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_mentor_evaluation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_evaluation_check_content(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_evaluation_lock_mentor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_mentor_evaluation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_evaluation_lock_for_write(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_mentor_evaluation(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_mentor_evaluation(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_evaluations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_evaluation(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Postflight: the result is checked, not assumed (REVOKE only removes
--     grants made by the executing role).
-- ---------------------------------------------------------------------------
DO $postflight$
DECLARE
  v_table text;
  v_role text;
  v_privilege text;
  v_function regprocedure;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['public.intern_evaluations', 'public.intern_evaluation_events'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_role, v_table, v_privilege) THEN
          RAISE EXCEPTION USING ERRCODE = 'PZ001',
            MESSAGE = format('evaluation_table_exposed: %s has %s on %s', v_role, v_privilege, v_table);
        END IF;
      END LOOP;
      IF has_any_column_privilege(v_role, v_table, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('evaluation_columns_exposed: %s on %s', v_role, v_table);
      END IF;
    END LOOP;
    FOREACH v_privilege IN ARRAY ARRAY['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('service_role', v_table, v_privilege) THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ001',
          MESSAGE = format('evaluation_table_overgranted: service_role has %s on %s', v_privilege, v_table);
      END IF;
    END LOOP;
  END LOOP;
  IF has_table_privilege('service_role', 'public.intern_evaluations', 'UPDATE')
     OR has_column_privilege('service_role', 'public.intern_evaluations', 'author_profile_id', 'UPDATE')
     OR has_column_privilege('service_role', 'public.intern_evaluations', 'placement_id', 'UPDATE')
     OR has_column_privilege('service_role', 'public.intern_evaluations', 'created_at', 'UPDATE')
     OR has_table_privilege('service_role', 'public.intern_evaluation_events', 'UPDATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'evaluation_update_overgranted';
  END IF;

  FOR v_function IN
    SELECT p.oid::regprocedure FROM pg_catalog.pg_proc AS p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('portal_text_is_blank', 'evaluation_text_has_invalid_characters', 'intern_evaluations_guard',
                        'mentor_evaluation_rows', 'list_mentor_evaluations', 'get_mentor_evaluation',
                        'mentor_evaluation_check_content', 'mentor_evaluation_lock_mentor', 'create_mentor_evaluation',
                        'mentor_evaluation_lock_for_write', 'save_mentor_evaluation', 'publish_mentor_evaluation',
                        'list_my_evaluations', 'get_my_evaluation')
  LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE') OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('evaluation_function_exposed: %s', v_function);
    END IF;
  END LOOP;
END;
$postflight$;
