-- Mentor evaluations: idempotent creation and publisher attribution
-- (2026-10-18). Builds on 20261018010000_mentor_evaluations.sql, which is not
-- changed. No existing data is changed: the new columns are added NULL and are
-- only filled by the new create function.
--
-- * Idempotent creation. Every create carries a client request id: one
--   logical "create this draft" operation, generated once by the browser and
--   reused for every retry and recovery of that operation (never a new one
--   just because a request timed out). The pair (author Mentor, client request
--   id) is unique, enforced atomically by a unique constraint, so a retry can
--   never create a second evaluation:
--     - same key, same placement, same text  -> the existing evaluation is
--       returned (no new revision, no event);
--     - same key, same placement, other text -> PZE11 with the existing
--       evaluation's id in DETAIL (the caller is its assigned author), so the
--       browser continues with a normal save instead of a second create;
--     - same key, another placement          -> PZE11 without any detail.
--   The key is scoped to the calling Mentor; it gives no access to anything:
--   the role, active status, current assignment and ACTIVE checks run first,
--   exactly as before. Independent drafts simply use different keys. The text
--   of the original request is compared through its SHA-256 (no copy of the
--   text is kept for this).
-- * Attribution. author_profile_id (the original Mentor, immutable) and
--   published_by_profile_id / published_at (set only by a successful publish,
--   in the same UPDATE as the snapshot) already exist. The guard now also
--   requires the publisher of a publish to be its last editor. The Mentor and intern
--   views now also return the publisher's name next to the author's.
-- * Functions whose result type changes are dropped and re-created with the
--   same checks, lock order (Mentor profile FOR SHARE -> placement FOR UPDATE
--   -> evaluation FOR UPDATE) and privileges (service_role only).
--
-- New errors:
--   PZE11 evaluation_create_key_reused         (DETAIL: {"evaluationId": "<uuid>"} or none)
--   PZE12 evaluation_client_request_required   (missing client request id)
--
-- Transactions: like every migration in this repository, this file has no
-- explicit BEGIN/COMMIT. Whether the migration runner applies it atomically
-- must be confirmed before it is applied (docs/IMPLEMENTATION_CHECKLIST.md,
-- "Release verification"); the recovery steps for a partial application are
-- listed there and touch only the objects of this file.

-- ---------------------------------------------------------------------------
-- 1. Client request ids.
-- ---------------------------------------------------------------------------
ALTER TABLE public.intern_evaluations
  ADD COLUMN client_request_id uuid NULL,
  ADD COLUMN create_content_sha256 bytea NULL;

ALTER TABLE public.intern_evaluations
  ADD CONSTRAINT intern_evaluations_client_request_check
    CHECK ((client_request_id IS NULL) = (create_content_sha256 IS NULL)),
  ADD CONSTRAINT intern_evaluations_create_content_sha256_check
    CHECK (create_content_sha256 IS NULL OR octet_length(create_content_sha256) = 32),
  ADD CONSTRAINT intern_evaluations_author_client_request_key
    UNIQUE (author_profile_id, client_request_id);

-- The guard of 20261018010000, plus: the client request id and its hash never
-- change after the insert, and a publish is attributed to the Mentor who
-- performs it (publisher = last editor, as publish_mentor_evaluation sets
-- both). A publish is the only write that changes published_revision.
CREATE OR REPLACE FUNCTION public.intern_evaluations_guard()
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
     OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.create_content_sha256 IS DISTINCT FROM OLD.create_content_sha256
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
    -- A save: the published snapshot (and its publisher) must stay exactly as it was.
    IF (NEW.status, NEW.published_content, NEW.published_at, NEW.published_by_profile_id, NEW.first_published_at)
       IS DISTINCT FROM
       (OLD.status, OLD.published_content, OLD.published_at, OLD.published_by_profile_id, OLD.first_published_at) THEN
      RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
        DETAIL = 'snapshot_changed_by_save';
    END IF;
  ELSE
    -- A publish: snapshot := the saved text, at the new revision; the text itself
    -- is unchanged; the publisher is the Mentor making this change.
    IF NEW.status <> 'PUBLISHED'
       OR NEW.published_revision IS DISTINCT FROM NEW.revision
       OR NEW.published_content IS DISTINCT FROM NEW.content
       OR NEW.content IS DISTINCT FROM OLD.content
       OR NEW.published_by_profile_id IS DISTINCT FROM NEW.updated_by_profile_id THEN
      RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
        DETAIL = 'invalid_publish';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Functions whose result changes: dropped here, re-created below.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.create_mentor_evaluation(uuid, uuid, text);
DROP FUNCTION public.list_mentor_evaluations(uuid, uuid);
DROP FUNCTION public.get_mentor_evaluation(uuid, uuid);
DROP FUNCTION public.save_mentor_evaluation(uuid, uuid, integer, text);
DROP FUNCTION public.publish_mentor_evaluation(uuid, uuid, integer);
DROP FUNCTION public.mentor_evaluation_rows(uuid, uuid, uuid);
DROP FUNCTION public.get_my_evaluation(uuid, uuid);
DROP FUNCTION public.list_my_evaluations(uuid);

-- ---------------------------------------------------------------------------
-- 3. Mentor view rows (internal helper; no authorization of its own, only
--    called by the functions below after their checks).
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
  updated_at timestamptz,
  client_request_id uuid,
  published_by_name text
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
         e.updated_at,
         e.client_request_id,
         CASE WHEN e.published_by_profile_id IS NULL THEN NULL ELSE coalesce(publisher.full_name, publisher.email) END
  FROM public.intern_evaluations AS e
  JOIN public.intern_placements AS ip ON ip.id = e.placement_id
  JOIN public.profiles AS author ON author.id = e.author_profile_id
  JOIN public.profiles AS editor ON editor.id = e.updated_by_profile_id
  LEFT JOIN public.profiles AS publisher ON publisher.id = e.published_by_profile_id
  WHERE (p_placement_id IS NULL OR e.placement_id = p_placement_id)
    AND (p_evaluation_id IS NULL OR e.id = p_evaluation_id)
  ORDER BY e.created_at, e.id;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Mentor: reads (no row locks). Same checks as 20261018010000.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_mentor_evaluations(
  p_mentor_profile_id uuid,
  p_placement_id uuid
)
RETURNS TABLE (
  evaluation_id uuid, placement_id uuid, placement_status text, content text, publication_state text,
  revision integer, published_content text, published_revision integer, published_at timestamptz,
  first_published_at timestamptz, published_by_current_user boolean, author_name text,
  last_editor_name text, created_at timestamptz, updated_at timestamptz, client_request_id uuid,
  published_by_name text
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
  last_editor_name text, created_at timestamptz, updated_at timestamptz, client_request_id uuid,
  published_by_name text
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
-- 5. Mentor: writes. Lock order unchanged: Mentor profile FOR SHARE ->
--    placement FOR UPDATE -> evaluation FOR UPDATE.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.create_mentor_evaluation(
  p_mentor_profile_id uuid,
  p_placement_id uuid,
  p_client_request_id uuid,
  p_content text
)
RETURNS TABLE (
  evaluation_id uuid, placement_id uuid, placement_status text, content text, publication_state text,
  revision integer, published_content text, published_revision integer, published_at timestamptz,
  first_published_at timestamptz, published_by_current_user boolean, author_name text,
  last_editor_name text, created_at timestamptz, updated_at timestamptz, client_request_id uuid,
  published_by_name text
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_placement public.intern_placements;
  v_existing public.intern_evaluations;
  v_hash bytea;
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
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE12', MESSAGE = 'evaluation_client_request_required';
  END IF;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_content, 'UTF8'));

  -- An earlier request of this operation (this Mentor, this key).
  SELECT e.* INTO v_existing FROM public.intern_evaluations AS e
  WHERE e.author_profile_id = p_mentor_profile_id AND e.client_request_id = p_client_request_id;

  IF NOT FOUND THEN
    INSERT INTO public.intern_evaluations
      (placement_id, author_profile_id, updated_by_profile_id, content, client_request_id, create_content_sha256)
    VALUES (p_placement_id, p_mentor_profile_id, p_mentor_profile_id, p_content, p_client_request_id, v_hash)
    ON CONFLICT ON CONSTRAINT intern_evaluations_author_client_request_key DO NOTHING
    RETURNING id INTO v_evaluation_id;

    IF v_evaluation_id IS NOT NULL THEN
      INSERT INTO public.intern_evaluation_events (evaluation_id, placement_id, event_type, revision, actor_profile_id)
      VALUES (v_evaluation_id, p_placement_id, 'CREATED', 1, p_mentor_profile_id);
      RETURN QUERY SELECT * FROM public.mentor_evaluation_rows(p_mentor_profile_id, NULL, v_evaluation_id);
      RETURN;
    END IF;

    -- A concurrent request with this key committed first (the same placement
    -- is serialized by its lock, so this is another placement or a race the
    -- unique constraint settled). Read what it created.
    SELECT e.* INTO v_existing FROM public.intern_evaluations AS e
    WHERE e.author_profile_id = p_mentor_profile_id AND e.client_request_id = p_client_request_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'PZE10', MESSAGE = 'evaluation_integrity_violation',
        DETAIL = 'client_request_conflict_without_row';
    END IF;
  END IF;

  IF v_existing.placement_id IS DISTINCT FROM p_placement_id THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE11', MESSAGE = 'evaluation_create_key_reused';
  END IF;
  IF v_existing.create_content_sha256 IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'PZE11', MESSAGE = 'evaluation_create_key_reused',
      DETAIL = json_build_object('evaluationId', v_existing.id)::text;
  END IF;

  -- A retry of the same request: its evaluation, unchanged (no revision, no event).
  RETURN QUERY SELECT * FROM public.mentor_evaluation_rows(p_mentor_profile_id, NULL, v_existing.id);
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
  last_editor_name text, created_at timestamptz, updated_at timestamptz, client_request_id uuid,
  published_by_name text
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
  last_editor_name text, created_at timestamptz, updated_at timestamptz, client_request_id uuid,
  published_by_name text
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

  -- The snapshot is the saved text of the locked row (never client input); the
  -- publisher and time are set in the same UPDATE, so they always describe
  -- the snapshot. The author never changes.
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
-- 6. Intern: published snapshots of their own ACTIVE or COMPLETED placements,
--    with the original author and the publisher of the visible version (no
--    working text, revision or state). No row locks.
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
  author_name text,
  published_by_name text
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
         coalesce(author.full_name, author.email),
         coalesce(publisher.full_name, publisher.email)
  FROM public.intern_evaluations AS e
  JOIN public.intern_placements AS ip ON ip.id = e.placement_id
  JOIN public.applicants AS a ON a.id = ip.applicant_id
  JOIN public.internships AS i ON i.id = ip.internship_id
  JOIN public.profiles AS author ON author.id = e.author_profile_id
  JOIN public.profiles AS publisher ON publisher.id = e.published_by_profile_id
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
  author_name text,
  published_by_name text
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
-- 7. Function privileges: service_role only (re-created functions get
--    Supabase's default privileges again, so revoke them explicitly).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mentor_evaluation_rows(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_mentor_evaluations(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_mentor_evaluation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_mentor_evaluation(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_mentor_evaluation(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_mentor_evaluation(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_evaluations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_evaluation(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mentor_evaluation_rows(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mentor_evaluations(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_mentor_evaluation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_mentor_evaluation(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_mentor_evaluation(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_mentor_evaluation(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_evaluations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_evaluation(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Postflight: checked, not assumed.
-- ---------------------------------------------------------------------------
DO $postflight$
DECLARE
  v_table text;
  v_role text;
  v_function regprocedure;
BEGIN
  IF to_regprocedure('public.create_mentor_evaluation(uuid, uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'evaluation_non_idempotent_create_still_exists';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['public.intern_evaluations', 'public.intern_evaluation_events'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_any_column_privilege(v_role, v_table, 'SELECT, INSERT, UPDATE, REFERENCES')
         OR has_table_privilege(v_role, v_table, 'DELETE, TRUNCATE, TRIGGER') THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('evaluation_table_exposed: %s on %s', v_role, v_table);
      END IF;
    END LOOP;
  END LOOP;
  IF has_column_privilege('service_role', 'public.intern_evaluations', 'client_request_id', 'UPDATE')
     OR has_column_privilege('service_role', 'public.intern_evaluations', 'create_content_sha256', 'UPDATE')
     OR has_column_privilege('service_role', 'public.intern_evaluations', 'author_profile_id', 'UPDATE')
     OR has_table_privilege('service_role', 'public.intern_evaluations', 'UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('service_role', 'public.intern_evaluation_events', 'UPDATE, DELETE, TRUNCATE') THEN
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
    IF (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p WHERE p.oid = v_function::oid) THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = format('evaluation_function_security_definer: %s', v_function);
    END IF;
  END LOOP;
END;
$postflight$;
