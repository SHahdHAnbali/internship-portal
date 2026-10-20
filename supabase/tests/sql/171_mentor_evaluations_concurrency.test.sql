-- Migration 20261018010000: Mentor evaluations under concurrency (disposable
-- local cluster only). Sessions are dblink connections; ordering uses lock-wait
-- barriers (pg_blocking_pids), every wait is bounded, and a timeout fails the
-- scenario with a lock snapshot as evidence. Lock order of evaluation writes:
-- Mentor profile FOR SHARE -> placement FOR UPDATE -> evaluation FOR UPDATE.
-- These tests exercise specific interleavings; they do not prove the absence
-- of deadlocks in general.
--
-- Profiles: 01 HR, 02 Mentor One, 03 Mentor Two, 05 Intern One, 06 Applicant
-- Two, 07 Admin. Placements: f1 ACTIVE (Intern One, Mentor One), f2 SCHEDULED
-- (Applicant Two, Mentor One).

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000003','m2@x.com'),
 ('00000000-0000-0000-0000-000000000005','i1@x.com'),
 ('00000000-0000-0000-0000-000000000006','a2@x.com'),
 ('00000000-0000-0000-0000-000000000007','admin@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000003','Mentor Two','m2@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern One','i1@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000006','Applicant Two','a2@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000007','Admin','admin@x.com','ADMIN');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern One','i1@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Applicant Two','a2@x.com','00000000-0000-0000-0000-000000000006');
INSERT INTO public.internships (id, title, capacity, selection_status) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 10, 'OPEN');
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 10, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date, current_date + 30, 'SCHEDULED', '00000000-0000-0000-0000-000000000002');

CREATE EXTENSION IF NOT EXISTS dblink;

-- Opens a dblink session (15 s statement timeout as a backstop), optionally as
-- p_role, and returns its backend pid.
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

-- Outcome of an async query, or a timeout with lock evidence (never blocks).
CREATE FUNCTION public.t_finish(p_name text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  IF public.t_wait_idle(p_name) THEN
    RETURN public.t_dblink_outcome(p_name);
  END IF;
  RETURN 'timeout ' || public.t_lock_snapshot();
END $$;

-- Text, revision, state, snapshot and event count of an evaluation.
CREATE FUNCTION public.t_state(p_id uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT format('%s|r%s|%s|p%s|%s|e%s', e.content, e.revision, e.status, coalesce(e.published_revision::text, '-'),
                coalesce(e.published_content, '-'),
                (SELECT count(*) FROM public.intern_evaluation_events AS ev WHERE ev.evaluation_id = e.id))
  FROM public.intern_evaluations AS e WHERE e.id = p_id
$$;

SET ROLE service_role;
SELECT public.t_expect_ok('S0 Mentor One creates the evaluation (revision 1)',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1', gen_random_uuid(),'Start')$q$);
RESET ROLE;
SELECT id AS ev FROM public.intern_evaluations \gset

-- C1: two saves based on the same revision -------------------------------------------------------------------
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', format('SELECT (SELECT revision::text FROM public.save_mentor_evaluation(%L, %L, 1, %L))',
  '00000000-0000-0000-0000-000000000002', :'ev', 'Text A')) AS t(v text);
SELECT dblink_send_query('b', format('SELECT (SELECT revision::text FROM public.save_mentor_evaluation(%L, %L, 1, %L))',
  '00000000-0000-0000-0000-000000000002', :'ev', 'Text B'));
SELECT public.t_check('C1 the second save waits for the first', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C1 the second save is refused with a revision conflict', :'b_out' LIKE 'error:%evaluation_revision_conflict%', :'b_out');
SELECT public.t_check('C1 exactly one save applied', public.t_state(:'ev') = 'Text A|r2|DRAFT|p-|-|e2');
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');

-- C2: save versus publish from the same revision ------------------------------------------------------------
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', format('SELECT (SELECT revision::text FROM public.save_mentor_evaluation(%L, %L, 2, %L))',
  '00000000-0000-0000-0000-000000000002', :'ev', 'Text A2')) AS t(v text);
SELECT dblink_send_query('b', format('SELECT (SELECT revision::text FROM public.publish_mentor_evaluation(%L, %L, 2))',
  '00000000-0000-0000-0000-000000000002', :'ev'));
SELECT public.t_check('C2 the publish waits for the save', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C2 the stale publish is refused', :'b_out' LIKE 'error:%evaluation_revision_conflict%', :'b_out');
SELECT public.t_check('C2 nothing was published', public.t_state(:'ev') = 'Text A2|r3|DRAFT|p-|-|e3');
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');

-- C3: an original request and its explicit retry (same body, same revision) ---------------------------------
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', format('SELECT (SELECT revision::text FROM public.save_mentor_evaluation(%L, %L, 3, %L))',
  '00000000-0000-0000-0000-000000000002', :'ev', 'Retry text')) AS t(v text);
SELECT dblink_send_query('b', format('SELECT (SELECT revision::text FROM public.save_mentor_evaluation(%L, %L, 3, %L))',
  '00000000-0000-0000-0000-000000000002', :'ev', 'Retry text'));
SELECT public.t_check('C3 the retry waits for the original', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C3 the retry is refused, not applied twice or treated as unchanged', :'b_out' LIKE 'error:%evaluation_revision_conflict%', :'b_out');
SELECT public.t_check('C3 one revision and one event for the pair', public.t_state(:'ev') = 'Retry text|r4|DRAFT|p-|-|e4');
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');

-- C4: a save waiting while the Mentor is deactivated (simulated direct change) ------------------------------
SELECT public.t_open('a', NULL) AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT dblink_exec('a', $q$UPDATE public.profiles SET is_active = false, deactivated_at = now() WHERE id = '00000000-0000-0000-0000-000000000002'$q$);
SELECT dblink_send_query('b', format('SELECT (SELECT revision::text FROM public.save_mentor_evaluation(%L, %L, 4, %L))',
  '00000000-0000-0000-0000-000000000002', :'ev', 'After deactivation'));
SELECT public.t_check('C4 the save waits for the profile change', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C4 the deactivated Mentor is refused after the change commits', :'b_out' LIKE 'error:%evaluation_access_denied%', :'b_out');
SELECT public.t_check('C4 nothing changed', public.t_state(:'ev') = 'Retry text|r4|DRAFT|p-|-|e4');
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');
UPDATE public.profiles SET is_active = true, deactivated_at = NULL WHERE id = '00000000-0000-0000-0000-000000000002';

-- C5: a save waiting while the Mentor is demoted (simulated direct change) ----------------------------------
SELECT public.t_open('a', NULL) AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT dblink_exec('a', $q$UPDATE public.profiles SET role = 'HR' WHERE id = '00000000-0000-0000-0000-000000000002'$q$);
SELECT dblink_send_query('b', format('SELECT (SELECT revision::text FROM public.save_mentor_evaluation(%L, %L, 4, %L))',
  '00000000-0000-0000-0000-000000000002', :'ev', 'After demotion'));
SELECT public.t_check('C5 the save waits for the role change', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C5 the demoted Mentor is refused after the change commits', :'b_out' LIKE 'error:%evaluation_access_denied%', :'b_out');
SELECT public.t_check('C5 nothing changed', public.t_state(:'ev') = 'Retry text|r4|DRAFT|p-|-|e4');
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');
UPDATE public.profiles SET role = 'MENTOR' WHERE id = '00000000-0000-0000-0000-000000000002';

-- C6: a save by the current Mentor racing a reassignment ----------------------------------------------------
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', $q$SELECT (SELECT mentor_profile_id::text FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000003'))$q$) AS t(v text);
SELECT dblink_send_query('b', format('SELECT (SELECT revision::text FROM public.save_mentor_evaluation(%L, %L, 4, %L))',
  '00000000-0000-0000-0000-000000000002', :'ev', 'Former Mentor text'));
SELECT public.t_check('C6 the save waits for the reassignment', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C6 the former Mentor is refused once the reassignment commits', :'b_out' LIKE 'error:%evaluation_not_found%', :'b_out');
SELECT public.t_check('C6 nothing changed; the author is still Mentor One',
  public.t_state(:'ev') = 'Retry text|r4|DRAFT|p-|-|e4'
  AND (SELECT author_profile_id FROM public.intern_evaluations WHERE id = :'ev') = '00000000-0000-0000-0000-000000000002');
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');

-- C7: publish by the new Mentor racing placement completion -------------------------------------------------
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', $q$SELECT (SELECT status FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000f1','Contract ended'))$q$) AS t(v text);
SELECT dblink_send_query('b', format('SELECT (SELECT revision::text FROM public.publish_mentor_evaluation(%L, %L, 4))',
  '00000000-0000-0000-0000-000000000003', :'ev'));
SELECT public.t_check('C7 the publish waits for the completion', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C7 the publish is refused once the placement is completed', :'b_out' LIKE 'error:%placement_not_active%', :'b_out');
SELECT public.t_check('C7 the draft stayed private and unchanged; completion published nothing',
  public.t_state(:'ev') = 'Retry text|r4|DRAFT|p-|-|e4'
  AND (SELECT status FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f1') = 'COMPLETED');
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');

-- T1: three sessions on Mentor One and f2 (the open lock-order question) -----------------------------------
-- act = activate_intern_placement (placement, then Mentor profile FOR SHARE),
-- ev  = create_mentor_evaluation  (Mentor profile FOR SHARE, then placement),
-- adm = admin_set_user_active     (Mentor profile FOR UPDATE, queued behind ev).
-- A holder session h releases f2 so that act gets it while ev holds the Mentor
-- profile and adm is queued. Either no deadlock or a detected deadlock (40P01)
-- is acceptable here; a hang, a partial write or an inconsistent result is not.
-- The observed outcome is recorded.
SELECT public.t_open('h', NULL) AS h_pid \gset
SELECT public.t_open('act', 'service_role') AS act_pid \gset
SELECT public.t_open('ev', 'service_role') AS ev_pid \gset
SELECT public.t_open('adm', 'service_role') AS adm_pid \gset
SELECT dblink_exec('h', 'BEGIN');
SELECT t.v FROM dblink('h', $q$SELECT id::text FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f2' FOR UPDATE$q$) AS t(v text);
SELECT dblink_send_query('act', $q$SELECT (SELECT status FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000f2'))$q$);
SELECT public.t_check('T1 activation waits for the placement', public.t_wait_blocked(:act_pid));
SELECT dblink_send_query('ev', $q$SELECT (SELECT revision::text FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-0000000000f2', gen_random_uuid(),'Race evaluation'))$q$);
SELECT public.t_check('T1 the evaluation write holds the Mentor profile and waits for the placement', public.t_wait_blocked(:ev_pid));
SELECT dblink_send_query('adm', $q$SELECT (SELECT is_active::text FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000007',
  '00000000-0000-0000-0000-000000000002', false, 'Leaving'))$q$);
SELECT public.t_check('T1 the admin change queues on the Mentor profile', public.t_wait_blocked(:adm_pid));
SELECT dblink_exec('h', 'COMMIT');
SELECT public.t_finish('act') AS act_out \gset
SELECT public.t_finish('ev') AS ev_out \gset
SELECT public.t_finish('adm') AS adm_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('T1 every session finished (no hang)',
        :'act_out' NOT LIKE 'timeout%' AND :'ev_out' NOT LIKE 'timeout%' AND :'adm_out' NOT LIKE 'timeout%',
        format('act=%s ev=%s adm=%s', :'act_out', :'ev_out', :'adm_out'));
INSERT INTO public.t_results (label, ok, detail)
VALUES ('T1 each outcome is an expected one',
        (:'act_out' = 'ok:ACTIVE' OR :'act_out' LIKE 'error:%deadlock detected%')
        AND (:'ev_out' = 'ok:1' OR :'ev_out' LIKE 'error:%placement_not_active%' OR :'ev_out' LIKE 'error:%deadlock detected%')
        AND (:'adm_out' LIKE 'error:%mentor_has_open_placements%' OR :'adm_out' LIKE 'error:%deadlock detected%'),
        format('act=%s ev=%s adm=%s', :'act_out', :'ev_out', :'adm_out'));
INSERT INTO public.t_results (label, ok, detail)
VALUES ('T1 observed outcome (informational): '
        || CASE WHEN :'act_out' || :'ev_out' || :'adm_out' LIKE '%deadlock detected%' THEN 'DEADLOCK DETECTED' ELSE 'no deadlock' END
        || regexp_replace(format(' — act=%s ev=%s adm=%s', :'act_out', :'ev_out', :'adm_out'), '\s+', ' ', 'g'),
        true, NULL);
SELECT public.t_check('T1 activation is all-or-nothing',
  CASE WHEN :'act_out' = 'ok:ACTIVE' THEN
         (SELECT status FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f2') = 'ACTIVE'
         AND (SELECT role FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000006') = 'INTERN'
         AND (SELECT count(*) FROM public.intern_placement_events
              WHERE placement_id = '00000000-0000-0000-0000-0000000000f2' AND event_type = 'ACTIVATED') = 1
       ELSE
         (SELECT status FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f2') = 'SCHEDULED'
         AND (SELECT role FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000006') = 'APPLICANT'
         AND NOT EXISTS (SELECT 1 FROM public.intern_placement_events
                         WHERE placement_id = '00000000-0000-0000-0000-0000000000f2' AND event_type = 'ACTIVATED')
  END);
SELECT public.t_check('T1 the evaluation write is all-or-nothing',
  CASE WHEN :'ev_out' = 'ok:1' THEN
         (SELECT count(*) FROM public.intern_evaluations WHERE placement_id = '00000000-0000-0000-0000-0000000000f2') = 1
         AND (SELECT count(*) FROM public.intern_evaluation_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f2') = 1
       ELSE
         NOT EXISTS (SELECT 1 FROM public.intern_evaluations WHERE placement_id = '00000000-0000-0000-0000-0000000000f2')
         AND NOT EXISTS (SELECT 1 FROM public.intern_evaluation_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f2')
  END);
SELECT public.t_check('T1 the Mentor was not deactivated (open placement)',
  (SELECT is_active FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002'));
SELECT dblink_disconnect('h'); SELECT dblink_disconnect('act'); SELECT dblink_disconnect('ev'); SELECT dblink_disconnect('adm');
