-- Migration 20261021000000: one application per applicant, ever
-- (submit_application_review_v2 raises previous_application_exists), including
-- concurrent final submissions of different drafts by the same applicant.
-- Concurrency scenarios use dblink sessions and bounded lock-wait barriers
-- (disposable local cluster only); they exercise specific interleavings.
--
-- Accounts: 01 pending applicant (NEW), 02 intern (SELECTED), 03 rejected
-- applicant, 04 legacy applicant with two submitted applications (allowed by
-- the old per-training rule), 05 account with an applicant row but only
-- drafts, 06 brand-new account (no profile or applicant row yet), 07 and 08
-- other applicants for the "different identities do not wait" scenario, 09
-- an account with an applicant row and two drafts for the race in C1.

INSERT INTO public.internships (id, title) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering'),
 ('00000000-0000-0000-0000-0000000000e2','Design');
INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','pending@x.com'),
 ('00000000-0000-0000-0000-000000000002','intern@x.com'),
 ('00000000-0000-0000-0000-000000000003','rejected@x.com'),
 ('00000000-0000-0000-0000-000000000004','legacy@x.com'),
 ('00000000-0000-0000-0000-000000000005','drafts@x.com'),
 ('00000000-0000-0000-0000-000000000006','brandnew@x.com'),
 ('00000000-0000-0000-0000-000000000007','seven@x.com'),
 ('00000000-0000-0000-0000-000000000008','eight@x.com'),
 ('00000000-0000-0000-0000-000000000009','race@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','Pending','pending@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000002','Intern','intern@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000003','Rejected','rejected@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000004','Legacy','legacy@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000005','Drafts','drafts@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000007','Seven','seven@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000008','Eight','eight@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000009','Race','race@x.com','APPLICANT');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Pending','pending@x.com','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-0000000000b2','Intern','intern@x.com','00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000b3','Rejected','rejected@x.com','00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-0000000000b4','Legacy','Legacy@X.com','00000000-0000-0000-0000-000000000004'),
 ('00000000-0000-0000-0000-0000000000b5','Drafts','drafts@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b7','Seven','seven@x.com','00000000-0000-0000-0000-000000000007'),
 ('00000000-0000-0000-0000-0000000000b8','Eight','eight@x.com','00000000-0000-0000-0000-000000000008'),
 ('00000000-0000-0000-0000-0000000000b9','Race','race@x.com','00000000-0000-0000-0000-000000000009');
-- Submitted applications (review_email NULL, as on older live rows).
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id, rejection_reason) VALUES
 ('00000000-0000-0000-0000-0000000000c1','NEW','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1',NULL),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2',NULL),
 ('00000000-0000-0000-0000-0000000000c3','REJECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b3','Not a fit'),
 ('00000000-0000-0000-0000-0000000000c4','NEW','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b4',NULL),
 ('00000000-0000-0000-0000-0000000000c5','UNDER_REVIEW',NULL,'Robotics','00000000-0000-0000-0000-0000000000b4',NULL);
-- New drafts (a different training and a different CV from every earlier application).
INSERT INTO public.applications (id, status, internship_id, review_email, extracted_data, review_token_hash, review_token_expires_at, cv_path, cv_sha256) VALUES
 ('00000000-0000-0000-0000-0000000000d1','DRAFT','00000000-0000-0000-0000-0000000000e2','pending@x.com','{"email":"pending@x.com"}', public.t_hash('tok-pending'), now()+interval '1 hour','cv/d1.pdf', repeat('1',64)),
 ('00000000-0000-0000-0000-0000000000d2','DRAFT','00000000-0000-0000-0000-0000000000e2','intern@x.com','{"email":"intern@x.com"}', public.t_hash('tok-intern'), now()+interval '1 hour','cv/d2.pdf', repeat('2',64)),
 ('00000000-0000-0000-0000-0000000000d3','DRAFT','00000000-0000-0000-0000-0000000000e2','rejected@x.com','{"email":"rejected@x.com"}', public.t_hash('tok-rejected'), now()+interval '1 hour','cv/d3.pdf', repeat('3',64)),
 ('00000000-0000-0000-0000-0000000000d4','DRAFT','00000000-0000-0000-0000-0000000000e2','legacy@x.com','{"email":"legacy@x.com"}', public.t_hash('tok-legacy'), now()+interval '1 hour','cv/d4.pdf', repeat('4',64)),
 ('00000000-0000-0000-0000-0000000000d5','DRAFT','00000000-0000-0000-0000-0000000000e1','drafts@x.com','{"email":"drafts@x.com"}', public.t_hash('tok-drafts-1'), now()+interval '1 hour','cv/d5.pdf', repeat('5',64)),
 ('00000000-0000-0000-0000-0000000000d6','DRAFT','00000000-0000-0000-0000-0000000000e2','drafts@x.com','{"email":"drafts@x.com"}', public.t_hash('tok-drafts-2'), now()+interval '1 hour','cv/d6.pdf', repeat('6',64)),
 ('00000000-0000-0000-0000-0000000000d7','DRAFT','00000000-0000-0000-0000-0000000000e1','brandnew@x.com','{"email":"brandnew@x.com"}', public.t_hash('tok-new-1'), now()+interval '1 hour','cv/d7.pdf', repeat('7',64)),
 ('00000000-0000-0000-0000-0000000000d8','DRAFT','00000000-0000-0000-0000-0000000000e2','brandnew@x.com','{"email":"brandnew@x.com"}', public.t_hash('tok-new-2'), now()+interval '1 hour','cv/d8.pdf', repeat('8',64)),
 ('00000000-0000-0000-0000-0000000000d9','DRAFT','00000000-0000-0000-0000-0000000000e1','seven@x.com','{"email":"seven@x.com"}', public.t_hash('tok-seven'), now()+interval '1 hour','cv/d9.pdf', repeat('9',64)),
 ('00000000-0000-0000-0000-0000000000da','DRAFT','00000000-0000-0000-0000-0000000000e1','eight@x.com','{"email":"eight@x.com"}', public.t_hash('tok-eight'), now()+interval '1 hour','cv/da.pdf', repeat('a',64)),
 ('00000000-0000-0000-0000-0000000000db','DRAFT','00000000-0000-0000-0000-0000000000e1','race@x.com','{"email":"race@x.com"}', public.t_hash('tok-race-1'), now()+interval '1 hour','cv/db.pdf', repeat('b',64)),
 ('00000000-0000-0000-0000-0000000000dc','DRAFT','00000000-0000-0000-0000-0000000000e2','race@x.com','{"email":"race@x.com"}', public.t_hash('tok-race-2'), now()+interval '1 hour','cv/dc.pdf', repeat('c',64));

-- Counts that must not change when a submission is refused.
CREATE FUNCTION public.t_submitted(p_applicant uuid) RETURNS bigint
LANGUAGE sql AS $$
  SELECT count(*) FROM public.applications WHERE applicant_id = p_applicant AND status <> 'DRAFT'
$$;

-- Existing applicants (sequential) ------------------------------------------------------------------------
SET ROLE service_role;
SELECT public.t_expect_sqlstate('E1 an applicant with a pending application is refused (other training, other CV)',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-pending'), '{"email":"pending@x.com","fullName":"Pending"}', '00000000-0000-0000-0000-000000000001', false)$q$,
  'PZ409', 'previous_application_exists');
SELECT public.t_expect_sqlstate('E2 an intern (SELECTED application) is refused',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-intern'), '{"email":"intern@x.com","fullName":"Intern"}', '00000000-0000-0000-0000-000000000002', false)$q$,
  'PZ409', 'previous_application_exists');
SELECT public.t_expect_sqlstate('E3 a rejected applicant is refused',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-rejected'), '{"email":"rejected@x.com","fullName":"Rejected"}', '00000000-0000-0000-0000-000000000003', false)$q$,
  'PZ409', 'previous_application_exists');
SELECT public.t_expect_sqlstate('E4 an applicant who already has two submitted applications (old rule) is refused',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-legacy'), '{"email":"legacy@x.com","fullName":"Legacy"}', '00000000-0000-0000-0000-000000000004', false)$q$,
  'PZ409', 'previous_application_exists');
SELECT public.t_check('E1-E4 refused drafts unconsumed; existing applications, profiles and roles unchanged',
  (SELECT count(*) FROM public.applications WHERE id IN ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2',
     '00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d4') AND status = 'DRAFT' AND review_token_used_at IS NULL) = 4
  AND public.t_submitted('00000000-0000-0000-0000-0000000000b1') = 1
  AND public.t_submitted('00000000-0000-0000-0000-0000000000b2') = 1
  AND public.t_submitted('00000000-0000-0000-0000-0000000000b4') = 2
  AND (SELECT status FROM public.applications WHERE id = '00000000-0000-0000-0000-0000000000c2') = 'SELECTED'
  AND (SELECT role FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002') = 'INTERN'
  AND (SELECT full_name FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001') = 'Pending'
  AND NOT EXISTS (SELECT 1 FROM public.application_status_events WHERE application_id IN (
     '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2',
     '00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d4')));

SELECT public.t_expect_ok('N1 an applicant with only unsubmitted drafts submits normally',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-drafts-1'), '{"email":"drafts@x.com","fullName":"Drafts"}', '00000000-0000-0000-0000-000000000005', false)$q$);
SELECT public.t_expect_sqlstate('N2 ... and cannot then submit their other draft',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-drafts-2'), '{"email":"drafts@x.com","fullName":"Drafts"}', '00000000-0000-0000-0000-000000000005', false)$q$,
  'PZ409', 'previous_application_exists');
SELECT public.t_check('N1-N2 exactly one submitted application', public.t_submitted('00000000-0000-0000-0000-0000000000b5') = 1);
RESET ROLE;

-- Every submitted status, one applicant each (different training and CV from the earlier application) -------
DO $$
DECLARE
  v_status text;
  v_n integer := 0;
  v_user uuid;
  v_applicant uuid;
  v_email text;
BEGIN
  FOREACH v_status IN ARRAY ARRAY['NEW','UNDER_REVIEW','SHORTLISTED','INTERVIEW','SELECTED','REJECTED'] LOOP
    v_n := v_n + 1;
    v_user := ('00000000-0000-0000-0000-0000000001' || lpad(v_n::text, 2, '0'))::uuid;
    v_applicant := ('00000000-0000-0000-0000-0000000002' || lpad(v_n::text, 2, '0'))::uuid;
    v_email := 'status' || v_n || '@x.com';
    INSERT INTO auth.users (id, email) VALUES (v_user, v_email);
    INSERT INTO public.profiles (id, full_name, email, role)
      VALUES (v_user, 'Status ' || v_n, v_email, CASE WHEN v_status = 'SELECTED' THEN 'INTERN' ELSE 'APPLICANT' END);
    INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES (v_applicant, 'Status ' || v_n, v_email, v_user);
    INSERT INTO public.applications (status, internship_id, applicant_id, rejection_reason, cv_sha256)
      VALUES (v_status, '00000000-0000-0000-0000-0000000000e1', v_applicant,
              CASE WHEN v_status = 'REJECTED' THEN 'Not a fit' END, repeat('e', 63) || v_n);
    INSERT INTO public.applications (status, internship_id, review_email, extracted_data, review_token_hash, review_token_expires_at, cv_path, cv_sha256)
      VALUES ('DRAFT', '00000000-0000-0000-0000-0000000000e2', v_email, jsonb_build_object('email', v_email),
              public.t_hash('tok-status-' || v_n), now() + interval '1 hour', 'cv/s' || v_n || '.pdf', repeat('f', 63) || v_n);
  END LOOP;
END $$;

SET ROLE service_role;
DO $$
DECLARE
  v_status text;
  v_n integer := 0;
BEGIN
  FOREACH v_status IN ARRAY ARRAY['NEW','UNDER_REVIEW','SHORTLISTED','INTERVIEW','SELECTED','REJECTED'] LOOP
    v_n := v_n + 1;
    PERFORM public.t_expect_sqlstate(
      'S' || v_n || ' an applicant whose application is ' || v_status || ' is refused (other training, other CV)',
      format('SELECT * FROM public.submit_application_review_v2(%L, %L::jsonb, %L, false)',
        public.t_hash('tok-status-' || v_n),
        json_build_object('email', 'status' || v_n || '@x.com', 'fullName', 'Status ' || v_n)::text,
        ('00000000-0000-0000-0000-0000000001' || lpad(v_n::text, 2, '0'))::uuid),
      'PZ409', 'previous_application_exists');
  END LOOP;
END $$;
RESET ROLE;
SELECT public.t_check('S1-S6 every refused draft stayed DRAFT and every earlier application kept its status',
  (SELECT count(*) FROM public.applications WHERE review_email LIKE 'status%@x.com' AND status = 'DRAFT' AND review_token_used_at IS NULL) = 6
  AND (SELECT array_agg(a.status ORDER BY ap.email) FROM public.applications a JOIN public.applicants ap ON ap.id = a.applicant_id
       WHERE ap.email LIKE 'status%@x.com') = ARRAY['NEW','UNDER_REVIEW','SHORTLISTED','INTERVIEW','SELECTED','REJECTED']);

-- Concurrency ----------------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;

-- Opens a dblink session (15 s statement timeout as a backstop) as p_role and
-- returns its backend pid.
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

-- The final submission as one text column, for dblink.
CREATE FUNCTION public.t_submit_sql(p_token text, p_email text, p_auth uuid, p_created boolean) RETURNS text
LANGUAGE sql AS $$
  SELECT format('SELECT (SELECT status FROM public.submit_application_review_v2(%L, %L::jsonb, %L, %L))',
    public.t_hash(p_token), json_build_object('email', p_email, 'fullName', 'Applicant')::text, p_auth, p_created)
$$;

-- C1: an existing account (applicant row, no submitted application) submits two different drafts at once.
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', public.t_submit_sql('tok-race-1', 'race@x.com', '00000000-0000-0000-0000-000000000009', false)) AS t(v text);
SELECT dblink_send_query('b', public.t_submit_sql('tok-race-2', 'race@x.com', '00000000-0000-0000-0000-000000000009', false));
SELECT public.t_check('C1 the second submission waits for the first', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C1 the second draft is refused once the first is committed', :'b_out' LIKE 'error:%previous_application_exists%', :'b_out');
SELECT public.t_check('C1 exactly one submitted application; the other draft is unconsumed',
  public.t_submitted('00000000-0000-0000-0000-0000000000b9') = 1
  AND (SELECT status FROM public.applications WHERE id = '00000000-0000-0000-0000-0000000000dc') = 'DRAFT');
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');

-- C2: a brand-new identity (no profile or applicant row yet) submits two drafts at once: the first creates the
-- profile and applicant row, the second (same account) must be refused, not race the inserts.
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', public.t_submit_sql('tok-new-1', 'brandnew@x.com', '00000000-0000-0000-0000-000000000006', true)) AS t(v text);
SELECT dblink_send_query('b', public.t_submit_sql('tok-new-2', 'brandnew@x.com', '00000000-0000-0000-0000-000000000006', false));
SELECT public.t_check('C2 the second submission waits for the first', public.t_wait_blocked(:b_pid));
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C2 the second draft is refused with previous_application_exists', :'b_out' LIKE 'error:%previous_application_exists%', :'b_out');
SELECT public.t_check('C2 one profile, one applicant row, one submitted application',
  (SELECT count(*) FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000006') = 1
  AND (SELECT count(*) FROM public.applicants WHERE auth_user_id = '00000000-0000-0000-0000-000000000006') = 1
  AND (SELECT count(*) FROM public.applications WHERE review_email = 'brandnew@x.com' AND status <> 'DRAFT') = 1);
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');

-- C3: different applicants never wait for each other.
SELECT public.t_open('a', 'service_role') AS a_pid \gset
SELECT public.t_open('b', 'service_role') AS b_pid \gset
SELECT dblink_exec('a', 'BEGIN');
SELECT t.v FROM dblink('a', public.t_submit_sql('tok-seven', 'seven@x.com', '00000000-0000-0000-0000-000000000007', false)) AS t(v text);
SELECT dblink_send_query('b', public.t_submit_sql('tok-eight', 'eight@x.com', '00000000-0000-0000-0000-000000000008', false));
SELECT public.t_finish('b') AS b_out \gset
INSERT INTO public.t_results (label, ok, detail)
VALUES ('C3 another applicant submits while the first transaction is still open', :'b_out' = 'ok:NEW', :'b_out');
SELECT dblink_exec('a', 'COMMIT');
SELECT public.t_check('C3 both submitted',
  public.t_submitted('00000000-0000-0000-0000-0000000000b7') = 1 AND public.t_submitted('00000000-0000-0000-0000-0000000000b8') = 1);
SELECT dblink_disconnect('a'); SELECT dblink_disconnect('b');
