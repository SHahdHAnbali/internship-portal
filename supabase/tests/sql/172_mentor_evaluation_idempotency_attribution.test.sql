-- Migration 20261018020000: idempotent evaluation creation (client request
-- ids) and publisher attribution (original Mentor vs. publisher of the visible
-- version).
--
-- Profiles: 01 HR, 02 Mentor One, 03 Mentor Two, 05 Intern One, 06 Intern Two,
-- 07 Admin, 08 Intern Three. Placements: f1 ACTIVE (Intern One, Mentor One,
-- ended yesterday), f5 ACTIVE (Intern Two, Mentor One), f6 ACTIVE (Intern
-- Three, Mentor Two).
-- Assertions use SQLSTATEs and this file's own message keys only (never
-- PostgreSQL's translated messages), so they do not depend on the locale.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000003','m2@x.com'),
 ('00000000-0000-0000-0000-000000000005','i1@x.com'),
 ('00000000-0000-0000-0000-000000000006','i2@x.com'),
 ('00000000-0000-0000-0000-000000000007','admin@x.com'),
 ('00000000-0000-0000-0000-000000000008','i3@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000003','Mentor Two','m2@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern One','i1@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000006','Intern Two','i2@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000007','Admin','admin@x.com','ADMIN'),
 ('00000000-0000-0000-0000-000000000008','Intern Three','i3@x.com','INTERN');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern One','i1@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Intern Two','i2@x.com','00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-0000000000b3','Intern Three','i3@x.com','00000000-0000-0000-0000-000000000008');
INSERT INTO public.internships (id, title, capacity, selection_status) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 10, 'OPEN');
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c5','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c6','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b3');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 60, current_date - 1, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 10, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f6','00000000-0000-0000-0000-0000000000c6','00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 10, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000003');

-- DETAIL of the error raised by p_sql ('-' when it succeeds or has none).
CREATE FUNCTION public.t_error_detail(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_detail text;
BEGIN
  EXECUTE p_sql;
  RETURN '-';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN coalesce(nullif(v_detail, ''), '-');
END $$;
GRANT EXECUTE ON FUNCTION public.t_error_detail(text) TO PUBLIC;

-- The evaluation an author created with a key (keys are unique per author only).
CREATE FUNCTION public.t_by_author_key(p_author uuid, p_key uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT e.id FROM public.intern_evaluations AS e WHERE e.author_profile_id = p_author AND e.client_request_id = p_key
$$;
-- Mentor One's evaluation for a key.
CREATE FUNCTION public.t_by_key(p_key uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT public.t_by_author_key('00000000-0000-0000-0000-000000000002', p_key) $$;
-- Rows and events written so far (to prove a refused retry wrote nothing).
CREATE FUNCTION public.t_counts() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM public.intern_evaluations)::text || '/' || (SELECT count(*) FROM public.intern_evaluation_events)::text
$$;
GRANT EXECUTE ON FUNCTION public.t_by_author_key(uuid, uuid), public.t_by_key(uuid), public.t_counts() TO PUBLIC;

-- Schema ---------------------------------------------------------------------------------------------------
SELECT public.t_check('S1 the non-idempotent create no longer exists',
  to_regprocedure('public.create_mentor_evaluation(uuid, uuid, text)') IS NULL
  AND to_regprocedure('public.create_mentor_evaluation(uuid, uuid, uuid, text)') IS NOT NULL);
SELECT public.t_check('S2 browsers still cannot call or read anything',
  NOT has_function_privilege('authenticated', 'public.create_mentor_evaluation(uuid, uuid, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.create_mentor_evaluation(uuid, uuid, uuid, text)', 'EXECUTE')
  AND NOT has_any_column_privilege('authenticated', 'public.intern_evaluations', 'SELECT')
  AND NOT has_any_column_privilege('anon', 'public.intern_evaluations', 'SELECT'));
SELECT public.t_check('S3 the client request id cannot be updated by the backend role',
  NOT has_column_privilege('service_role', 'public.intern_evaluations', 'client_request_id', 'UPDATE')
  AND NOT has_column_privilege('service_role', 'public.intern_evaluations', 'create_content_sha256', 'UPDATE'));
SELECT public.t_check('S4 HR progress still exposes nothing about evaluations',
  pg_get_function_result('public.list_hr_intern_progress(uuid)'::regprocedure) NOT LIKE '%evaluation%');

SET ROLE service_role;

-- Idempotent creation --------------------------------------------------------------------------------------
SELECT public.t_expect_ok('K1 Mentor One creates a draft with key k1',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa01','Draft A')$q$);
SELECT public.t_check('K2 a retry with the same key and text returns the same evaluation (timeout after success)',
  (SELECT r.evaluation_id = public.t_by_key('00000000-0000-0000-0000-00000000aa01') AND r.revision = 1
          AND r.client_request_id = '00000000-0000-0000-0000-00000000aa01'
   FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-00000000aa01','Draft A') AS r));
SELECT public.t_check('K3 … and writes nothing (one row, one event)',
  (SELECT count(*) FROM public.intern_evaluations WHERE placement_id = '00000000-0000-0000-0000-0000000000f1') = 1
  AND (SELECT count(*) FROM public.intern_evaluation_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f1') = 1);
SELECT public.t_expect_sqlstate('K4 the same key with other text is refused',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa01','Draft A, edited after recovery')$q$,
  'PZE11', 'evaluation_create_key_reused');
SELECT public.t_check('K5 … naming only the existing evaluation (for the caller, its assigned author)',
  public.t_error_detail($q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000aa01','Draft A, edited after recovery')$q$)
  = json_build_object('evaluationId', public.t_by_key('00000000-0000-0000-0000-00000000aa01'))::text);
SELECT public.t_expect_sqlstate('K6 the same key on another placement is refused',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f5',
       '00000000-0000-0000-0000-00000000aa01','Draft A')$q$,
  'PZE11', 'evaluation_create_key_reused');
SELECT public.t_check('K7 … without naming any evaluation',
  public.t_error_detail($q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-00000000aa01','Draft A')$q$) = '-');
SELECT public.t_expect_ok('K8 a different key is a separate, legitimate draft (same text)',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa02','Draft A')$q$);
SELECT public.t_check('K9 two evaluations on f1, nothing on f5',
  (SELECT count(*) FROM public.intern_evaluations WHERE placement_id = '00000000-0000-0000-0000-0000000000f1') = 2
  AND NOT EXISTS (SELECT 1 FROM public.intern_evaluations WHERE placement_id = '00000000-0000-0000-0000-0000000000f5'));
SELECT public.t_expect_sqlstate('K10 a Mentor not assigned to f1 learns nothing from a known key',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa01','Draft A')$q$,
  'PZE02', 'placement_not_found');
SELECT public.t_expect_sqlstate('K11 HR cannot create, with or without a key',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa03','x')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('K12 a missing key is refused',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',
       NULL,'x')$q$,
  'PZE12', 'evaluation_client_request_required');
SELECT public.t_expect_sqlstate('K13 content rules still apply before anything is stored',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa04', repeat('a', 40001))$q$,
  'PZE07', 'evaluation_content_too_long');
SELECT public.t_expect_ok('K14 the first draft is saved (revision 2)',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002',
       public.t_by_key('00000000-0000-0000-0000-00000000aa01'), 1, 'Draft A2')$q$);
SELECT public.t_check('K15 a late retry of the original create returns the evaluation as it is now, unchanged',
  (SELECT r.revision = 2 AND r.content = 'Draft A2'
   FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-00000000aa01','Draft A') AS r)
  AND (SELECT count(*) FROM public.intern_evaluation_events
       WHERE evaluation_id = public.t_by_key('00000000-0000-0000-0000-00000000aa01')) = 2);
SELECT public.t_check('K16 another Mentor may use the same key value for an independent draft on their own placement',
  (SELECT r.placement_id = '00000000-0000-0000-0000-0000000000f6' AND r.revision = 1 AND r.content = 'Mentor Two draft'
          AND r.client_request_id = '00000000-0000-0000-0000-00000000aa01'
          AND r.evaluation_id IS DISTINCT FROM public.t_by_key('00000000-0000-0000-0000-00000000aa01')
   FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f6',
          '00000000-0000-0000-0000-00000000aa01','Mentor Two draft') AS r));
SELECT public.t_check('K16 … authored by Mentor Two, while Mentor One''s evaluation for that key is unchanged',
  (SELECT author_profile_id = '00000000-0000-0000-0000-000000000003' AND placement_id = '00000000-0000-0000-0000-0000000000f6'
   FROM public.intern_evaluations
   WHERE id = public.t_by_author_key('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000aa01'))
  AND (SELECT placement_id = '00000000-0000-0000-0000-0000000000f1' AND revision = 2 AND content = 'Draft A2'
       FROM public.intern_evaluations WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000aa01'))
  AND (SELECT count(*) FROM public.intern_evaluations WHERE client_request_id = '00000000-0000-0000-0000-00000000aa01') = 2);
RESET ROLE;
SELECT public.t_expect_sqlstate('K17 the client request id never changes, even for the owner',
  $q$UPDATE public.intern_evaluations SET client_request_id = gen_random_uuid(), revision = revision + 1
     WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000aa02')$q$, 'PZE10');
SELECT public.t_expect_sqlstate('K18 a second row with the same Mentor and key is impossible (unique violation)',
  $q$INSERT INTO public.intern_evaluations (placement_id, author_profile_id, updated_by_profile_id, content,
       client_request_id, create_content_sha256)
     VALUES ('00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',
       'x','00000000-0000-0000-0000-00000000aa01', sha256('x'::bytea))$q$,
  '23505');

-- Concurrent creates with one key ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;

CREATE FUNCTION public.t_open(p_name text, p_role text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_pid integer;
BEGIN
  PERFORM dblink_connect(p_name, format('host=127.0.0.1 port=%s dbname=%s user=postgres',
    current_setting('port'), current_database()));
  PERFORM dblink_exec(p_name, 'SET statement_timeout = ''15s''');
  IF p_role IS NOT NULL THEN
    PERFORM dblink_exec(p_name, 'SET ROLE ' || quote_ident(p_role));
  END IF;
  SELECT t.pid INTO v_pid FROM dblink(p_name, 'SELECT pg_backend_pid()') AS t(pid integer);
  RETURN v_pid;
END $$;

CREATE FUNCTION public.t_finish(p_name text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  IF public.t_wait_idle(p_name) THEN
    RETURN public.t_dblink_outcome(p_name);
  END IF;
  RETURN 'timeout ' || public.t_lock_snapshot();
END $$;

-- Q1: the same request twice at once on one placement: the second waits for the
-- placement lock, then returns the first one's evaluation.
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', $q$SELECT (SELECT evaluation_id::text FROM public.create_mentor_evaluation(
  '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-00000000bb01','Same'))$q$)
  AS t(v text);
SELECT dblink_send_query('b', $q$SELECT (SELECT evaluation_id::text FROM public.create_mentor_evaluation(
  '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-00000000bb01','Same'))$q$);
SELECT public.t_check('Q1 the concurrent retry waits for the first create', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('Q1 the concurrent retry returns the same evaluation',
        :'b_out' = 'ok:' || public.t_by_key('00000000-0000-0000-0000-00000000bb01')::text, :'b_out');
SELECT public.t_check('Q1 exactly one evaluation and one event for the key',
  (SELECT count(*) FROM public.intern_evaluations WHERE client_request_id = '00000000-0000-0000-0000-00000000bb01') = 1
  AND (SELECT count(*) FROM public.intern_evaluation_events
       WHERE evaluation_id = public.t_by_key('00000000-0000-0000-0000-00000000bb01')) = 1);

-- Q2: one key used at once on two placements: the unique constraint settles it.
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', $q$SELECT (SELECT evaluation_id::text FROM public.create_mentor_evaluation(
  '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000bb02','Race'))$q$)
  AS t(v text);
SELECT dblink_send_query('b', $q$SELECT (SELECT evaluation_id::text FROM public.create_mentor_evaluation(
  '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-00000000bb02','Race'))$q$);
SELECT public.t_check('Q2 the second create waits on the key held by the first', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out2 \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('Q2 the second create is refused as a reused key', :'b_out2' LIKE 'error:%evaluation_create_key_reused%', :'b_out2');
SELECT public.t_check('Q2 one evaluation for the key, on the first placement only',
  (SELECT count(*) FROM public.intern_evaluations WHERE client_request_id = '00000000-0000-0000-0000-00000000bb02') = 1
  AND (SELECT placement_id FROM public.intern_evaluations WHERE client_request_id = '00000000-0000-0000-0000-00000000bb02')
      = '00000000-0000-0000-0000-0000000000f1');
-- Q3: one key at once with two different texts on one placement: the second
-- waits for the placement lock, then is refused as a reused key (with the
-- evaluation id: the caller is its assigned author); one evaluation, one event.
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', $q$SELECT (SELECT evaluation_id::text FROM public.create_mentor_evaluation(
  '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-00000000bb03','Content A'))$q$)
  AS t(v text);
SELECT dblink_send_query('b', $q$SELECT (SELECT evaluation_id::text FROM public.create_mentor_evaluation(
  '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-00000000bb03','Content B'))$q$);
SELECT public.t_check('Q3 the request with other text waits for the first', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out3 \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('Q3 the request with other text is refused as a reused key', :'b_out3' LIKE 'error:%evaluation_create_key_reused%', :'b_out3');
SELECT public.t_check('Q3 one evaluation with the first text, one revision, one event',
  (SELECT count(*) FROM public.intern_evaluations WHERE client_request_id = '00000000-0000-0000-0000-00000000bb03') = 1
  AND (SELECT content = 'Content A' AND revision = 1
       FROM public.intern_evaluations WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000bb03'))
  AND (SELECT count(*) FROM public.intern_evaluation_events
       WHERE evaluation_id = public.t_by_key('00000000-0000-0000-0000-00000000bb03')) = 1);
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');

-- Attribution ----------------------------------------------------------------------------------------------
SET ROLE service_role;
SELECT public.t_expect_ok('P1 Mentor One publishes the first draft (revision 3)',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002',
       public.t_by_key('00000000-0000-0000-0000-00000000aa01'), 2)$q$);
SELECT public.t_check('P1 the intern sees the original Mentor as author and publisher',
  (SELECT author_name = 'Mentor One' AND published_by_name = 'Mentor One' AND content = 'Draft A2'
   FROM public.get_my_evaluation('00000000-0000-0000-0000-000000000005', public.t_by_key('00000000-0000-0000-0000-00000000aa01'))));
SELECT public.t_expect_ok('P2 Mentor One edits the draft without publishing (revision 4)',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002',
       public.t_by_key('00000000-0000-0000-0000-00000000aa01'), 3, 'Unpublished edit')$q$);
SELECT public.t_check('P2 an unpublished edit changes neither the snapshot nor its publisher',
  (SELECT content = 'Draft A2' AND published_by_name = 'Mentor One'
   FROM public.get_my_evaluation('00000000-0000-0000-0000-000000000005', public.t_by_key('00000000-0000-0000-0000-00000000aa01')))
  AND (SELECT published_by_profile_id = '00000000-0000-0000-0000-000000000002' AND published_revision = 3
       FROM public.intern_evaluations WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000aa01')));
SELECT public.t_check('P3 the Mentor view returns both names and the client request id',
  (SELECT author_name = 'Mentor One' AND published_by_name = 'Mentor One'
          AND client_request_id = '00000000-0000-0000-0000-00000000aa01' AND publication_state = 'UNPUBLISHED_CHANGES'
   FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_by_key('00000000-0000-0000-0000-00000000aa01'))));
SELECT public.t_check('P4 a draft has no publisher',
  (SELECT published_by_name IS NULL
   FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_by_key('00000000-0000-0000-0000-00000000aa02'))));
RESET ROLE;
SELECT public.t_expect_ok('P5 HR reassigns f1 to Mentor Two',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000003')$q$);
SET ROLE service_role;
SELECT public.t_counts() AS counts_before_r \gset
SELECT public.t_expect_sqlstate('R1 a retry by the former Mentor is refused by the assignment check first …',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa01','Draft A')$q$,
  'PZE02', 'placement_not_found');
SELECT public.t_check('R1 … naming no evaluation and writing nothing',
  public.t_error_detail($q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000aa01','Other text')$q$) = '-'
  AND public.t_counts() = :'counts_before_r');
SELECT public.t_expect_ok('R2 the new Mentor creates a draft on f1 with key aa06',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa06','By Mentor Two')$q$);
SELECT public.t_expect_sqlstate('P6 a stale publish by the new Mentor fails …',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000003',
       public.t_by_key('00000000-0000-0000-0000-00000000aa01'), 3)$q$,
  'PZE05', 'evaluation_revision_conflict');
SELECT public.t_check('P6 … and changes no attribution',
  (SELECT published_by_profile_id = '00000000-0000-0000-0000-000000000002' AND published_revision = 3 AND revision = 4
   FROM public.intern_evaluations WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000aa01')));
SELECT public.t_expect_sqlstate('P7 the former Mentor can no longer publish',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002',
       public.t_by_key('00000000-0000-0000-0000-00000000aa01'), 4)$q$,
  'PZE03', 'evaluation_not_found');
SELECT public.t_expect_ok('P8 the new Mentor republishes (revision 5)',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000003',
       public.t_by_key('00000000-0000-0000-0000-00000000aa01'), 4)$q$);
SELECT public.t_check('P8 the intern sees the original author and the new publisher',
  (SELECT author_name = 'Mentor One' AND published_by_name = 'Mentor Two' AND content = 'Unpublished edit'
   FROM public.get_my_evaluation('00000000-0000-0000-0000-000000000005', public.t_by_key('00000000-0000-0000-0000-00000000aa01')))
  AND (SELECT author_profile_id = '00000000-0000-0000-0000-000000000002'
              AND published_by_profile_id = '00000000-0000-0000-0000-000000000003'
       FROM public.intern_evaluations WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000aa01')));
SELECT public.t_check('P9 the other intern sees nothing of it',
  NOT EXISTS (SELECT 1 FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000006')));
SELECT public.t_expect_sqlstate('P10 HR has no intern or Mentor view',
  $q$SELECT * FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000001')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('P11 nor has ADMIN',
  $q$SELECT * FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000007', public.t_by_key('00000000-0000-0000-0000-00000000aa01'))$q$,
  'PZE01', 'evaluation_access_denied');
RESET ROLE;
SELECT public.t_expect_ok('P12 HR completes f1 (drafts do not block it)',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1',NULL)$q$);
SET ROLE service_role;
SELECT public.t_expect_sqlstate('P13 after completion nothing can be published',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000003',
       public.t_by_key('00000000-0000-0000-0000-00000000aa02'), 1)$q$,
  'PZE04', 'placement_not_active');
SELECT public.t_counts() AS counts_before_c \gset
SELECT public.t_expect_sqlstate('R3 a retry of an existing create after completion is refused …',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa06','By Mentor Two')$q$,
  'PZE04', 'placement_not_active');
SELECT public.t_check('R3 … and creates no evaluation or event (the draft stays as it was)',
  public.t_counts() = :'counts_before_c'
  AND (SELECT status = 'DRAFT' AND revision = 1 AND content = 'By Mentor Two'
       FROM public.intern_evaluations
       WHERE id = public.t_by_author_key('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000aa06')));
SELECT public.t_expect_sqlstate('P14 … nor created again with a known key',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-00000000aa05','x')$q$,
  'PZE04', 'placement_not_active');
SELECT public.t_check('P15 completion kept the snapshot, its attribution and the private draft',
  (SELECT author_name = 'Mentor One' AND published_by_name = 'Mentor Two' AND placement_status = 'COMPLETED'
   FROM public.get_my_evaluation('00000000-0000-0000-0000-000000000005', public.t_by_key('00000000-0000-0000-0000-00000000aa01')))
  AND (SELECT status = 'DRAFT' AND published_content IS NULL
       FROM public.intern_evaluations WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000aa02')));
RESET ROLE;

-- A publish is attributed to the Mentor who performs it (guard, owner writes) ------------------------------
SELECT public.t_expect_sqlstate('I1 a publish naming another publisher than its editor is refused',
  $q$UPDATE public.intern_evaluations
     SET status = 'PUBLISHED', revision = revision + 1, published_content = content, published_revision = revision + 1,
         published_at = now(), first_published_at = now(),
         published_by_profile_id = '00000000-0000-0000-0000-000000000002',
         updated_by_profile_id = '00000000-0000-0000-0000-000000000003', updated_at = now()
     WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000aa02')$q$,
  'PZE10', 'evaluation_integrity_violation');
SELECT public.t_check('I1 the draft is unchanged',
  (SELECT status = 'DRAFT' AND revision = 1 AND published_by_profile_id IS NULL
   FROM public.intern_evaluations WHERE id = public.t_by_key('00000000-0000-0000-0000-00000000aa02')));
SELECT public.t_check('I2 every publish in this file kept publisher = editor',
  NOT EXISTS (SELECT 1 FROM public.intern_evaluations
              WHERE status = 'PUBLISHED' AND published_by_profile_id IS DISTINCT FROM updated_by_profile_id
                AND published_revision = revision));
