-- Migration 20261013000000: interns withdraw a submission awaiting review,
-- before the end of the due day (Asia/Hebron), back to IN_PROGRESS.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000005','intern@x.com'),
 ('00000000-0000-0000-0000-000000000006','intern2@x.com'),
 ('00000000-0000-0000-0000-000000000007','admin@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern One','intern@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000006','Intern Two','intern2@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000007','Admin','admin@x.com','ADMIN');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern One','intern@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Intern Two','intern2@x.com','00000000-0000-0000-0000-000000000006');
INSERT INTO public.internships (id, title, capacity) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 5);
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 20, current_date + 60, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 20, current_date + 60, 'ACTIVE', '00000000-0000-0000-0000-000000000002');

-- "Today" in the organisation's timezone, the reference for due dates.
CREATE TEMP TABLE d AS SELECT (now() AT TIME ZONE 'Asia/Hebron')::date AS today;
GRANT SELECT ON d TO service_role, authenticated;

-- Tasks (created as the Mentor) with different due dates, then submitted by the intern.
SET ROLE service_role;
SELECT public.t_expect_ok('S0 tasks created',
  $q$SELECT 1 FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Future', NULL, (SELECT today + 3 FROM d), NULL)$q$);
SELECT public.t_expect_ok('S0b', $q$SELECT 1 FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','DueToday', NULL, (SELECT today FROM d), NULL)$q$);
SELECT public.t_expect_ok('S0c', $q$SELECT 1 FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Past', NULL, (SELECT today - 1 FROM d), NULL)$q$);
SELECT public.t_expect_ok('S0d', $q$SELECT 1 FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','NoDate', NULL, NULL, NULL)$q$);
SELECT public.t_expect_ok('S0e', $q$SELECT 1 FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','NeverSubmitted', NULL, (SELECT today + 3 FROM d), NULL)$q$);
SELECT public.t_expect_ok('S0f', $q$SELECT 1 FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Reviewed', NULL, (SELECT today + 3 FROM d), NULL)$q$);
SELECT public.t_expect_ok('S0g', $q$SELECT 1 FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Race', NULL, (SELECT today + 3 FROM d), NULL)$q$);
-- Move every task except NeverSubmitted to COMPLETED through the intern's own flow.
SELECT public.t_check('S1 intern starts the tasks',
  (SELECT count(*) FROM public.intern_tasks t,
     LATERAL public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005', t.id, 'IN_PROGRESS', NULL) s
   WHERE t.title <> 'NeverSubmitted') = 6);
SELECT public.t_check('S1b and submits them',
  (SELECT count(*) FROM public.intern_tasks t,
     LATERAL public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005', t.id, 'COMPLETED', 'Done') s
   WHERE t.title <> 'NeverSubmitted') = 6);
SELECT public.t_expect_ok('S2 Mentor accepts "Reviewed"',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='Reviewed'),'ACCEPT',NULL)$q$);
RESET ROLE;

SET ROLE authenticated;
SELECT public.t_expect_error('P1 browsers cannot call the withdrawal function',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000aa')$q$,
  'permission denied for function withdraw_my_intern_task_submission');
RESET ROLE; SET ROLE service_role;

-- Deadline rule at exact instants (due date counts in full, Asia/Hebron) ---------------------------
SELECT public.t_check('D1 open during the due day and one microsecond before local midnight',
  public.intern_task_withdrawal_open('2026-10-15', '2026-10-15 00:00:00 Asia/Hebron')
  AND public.intern_task_withdrawal_open('2026-10-15', '2026-10-15 23:59:59.999999 Asia/Hebron'));
SELECT public.t_check('D2 closed exactly at 00:00 Asia/Hebron after the due date, and later',
  NOT public.intern_task_withdrawal_open('2026-10-15', '2026-10-16 00:00:00 Asia/Hebron')
  AND NOT public.intern_task_withdrawal_open('2026-10-15', '2026-10-20 12:00:00 Asia/Hebron'));
SELECT public.t_check('D3 timezone-aware: 22:30 UTC on the due day is already the next day in Hebron (UTC+3 in October)',
  NOT public.intern_task_withdrawal_open('2026-10-15', '2026-10-15 22:30:00+00'));
SELECT public.t_check('D4 no due date never opens a window',
  NOT public.intern_task_withdrawal_open(NULL, now()));

-- Who may withdraw ---------------------------------------------------------------------------------
SELECT public.t_expect_error('W1 another intern cannot withdraw it (looks missing)',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000006',(SELECT id FROM public.intern_tasks WHERE title='Future'))$q$,
  'task_not_found');
SELECT public.t_expect_error('W2 HR cannot',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_tasks WHERE title='Future'))$q$,
  'intern_role_required');
SELECT public.t_expect_error('W3 ADMIN cannot',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000007',(SELECT id FROM public.intern_tasks WHERE title='Future'))$q$,
  'intern_role_required');
SELECT public.t_expect_error('W4 the Mentor cannot',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='Future'))$q$,
  'intern_role_required');

-- State and deadline refusals ------------------------------------------------------------------------
SELECT public.t_expect_error('R1 a task that was never submitted',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='NeverSubmitted'))$q$,
  'task_not_withdrawable');
SELECT public.t_expect_error('R2 a reviewed (accepted) submission',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='Reviewed'))$q$,
  'task_not_withdrawable');
SELECT public.t_expect_error('R3 after the due date',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='Past'))$q$,
  'task_withdrawal_deadline_passed');
SELECT public.t_expect_error('R4 a task without a due date',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='NoDate'))$q$,
  'task_withdrawal_requires_due_date');

-- Successful withdrawal and resubmission ---------------------------------------------------------------
CREATE TEMP TABLE before_withdraw AS
  SELECT id, title, description, due_date, priority, placement_id, created_by_profile_id, created_at
  FROM public.intern_tasks WHERE title = 'DueToday';
GRANT SELECT ON before_withdraw TO service_role;
SELECT public.t_expect_ok('OK1 withdraw on the due day itself',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='DueToday'))$q$);
SELECT public.t_check('OK2 back to IN_PROGRESS, not awaiting review, other fields untouched',
  (SELECT t.status = 'IN_PROGRESS' AND t.review_status IS NULL
      AND (t.title, t.description, t.due_date, t.priority, t.placement_id, t.created_by_profile_id, t.created_at)
          IS NOT DISTINCT FROM (b.title, b.description, b.due_date, b.priority, b.placement_id, b.created_by_profile_id, b.created_at)
   FROM public.intern_tasks t JOIN before_withdraw b ON b.id = t.id));
SELECT public.t_expect_error('OK3 a duplicate withdrawal is refused',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='DueToday'))$q$,
  'task_not_withdrawable');
SELECT public.t_expect_error('OK4 the Mentor can no longer review the withdrawn submission',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='DueToday'),'ACCEPT',NULL)$q$,
  'task_not_awaiting_review');
SELECT public.t_check('OK5 the Mentor dashboard no longer counts it as awaiting review',
  (SELECT awaiting_review FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002')
   WHERE placement_id = '00000000-0000-0000-0000-0000000000f1') = 4);
SELECT public.t_expect_ok('OK6 the intern resubmits',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='DueToday'),'COMPLETED','Fixed')$q$);
SELECT public.t_expect_ok('OK7 the Mentor reviews the resubmission',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='DueToday'),'ACCEPT','Good')$q$);
SELECT public.t_check('OK8 history keeps every submission plus exactly one withdrawal',
  (SELECT array_agg(e.event_type ORDER BY e.created_at, e.id) FROM public.intern_task_events e
   JOIN public.intern_tasks t ON t.id = e.task_id WHERE t.title = 'DueToday')
    = ARRAY['CREATED','STARTED','SUBMITTED','WITHDRAWN','SUBMITTED','ACCEPTED']
  AND EXISTS (SELECT 1 FROM public.intern_task_events e JOIN public.intern_tasks t ON t.id = e.task_id
              WHERE t.title='DueToday' AND e.event_type='WITHDRAWN' AND e.from_status='COMPLETED'
                AND e.to_status='IN_PROGRESS' AND e.actor_profile_id='00000000-0000-0000-0000-000000000005'));
RESET ROLE;

-- Concurrency: the Mentor accepts while the intern withdraws ----------------------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('intern', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('intern', 'SET ROLE service_role');
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC1 Mentor accepts "Race" (uncommitted)',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='Race'),'ACCEPT',NULL)$q$);
SELECT dblink_send_query('intern', $q$
  SELECT status FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005',
    (SELECT id FROM public.intern_tasks WHERE title = 'Race'));
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC2 the withdrawal waits for the review', dblink_is_busy('intern') = 1);
COMMIT;
SELECT * FROM dblink_get_result('intern', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC3 the withdrawal is refused once the review commits', msg LIKE '%task_not_withdrawable%', msg
FROM (SELECT dblink_error_message('intern') AS msg) AS e;
SELECT dblink_disconnect('intern');
SELECT public.t_check('CC4 final state is the review only: accepted, no WITHDRAWN event',
  (SELECT status = 'COMPLETED' AND review_status = 'ACCEPTED' FROM public.intern_tasks WHERE title = 'Race')
  AND NOT EXISTS (SELECT 1 FROM public.intern_task_events e JOIN public.intern_tasks t ON t.id = e.task_id
                  WHERE t.title = 'Race' AND e.event_type = 'WITHDRAWN'));

-- And the other order: the intern withdraws while the Mentor reviews -----------------------------------------
SELECT dblink_connect('mentor', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('mentor', 'SET ROLE service_role');
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC5 intern withdraws "Future" (uncommitted)',
  $q$SELECT * FROM public.withdraw_my_intern_task_submission('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='Future'))$q$);
SELECT dblink_send_query('mentor', $q$
  SELECT status FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',
    (SELECT id FROM public.intern_tasks WHERE title = 'Future'), 'ACCEPT', NULL);
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC6 the review waits for the withdrawal', dblink_is_busy('mentor') = 1);
COMMIT;
SELECT * FROM dblink_get_result('mentor', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC7 the stale review is refused once the withdrawal commits', msg LIKE '%task_not_awaiting_review%', msg
FROM (SELECT dblink_error_message('mentor') AS msg) AS e;
SELECT dblink_disconnect('mentor');
SELECT public.t_check('CC8 final state is the withdrawal only: in progress, not reviewed',
  (SELECT status = 'IN_PROGRESS' AND review_status IS NULL AND reviewed_at IS NULL FROM public.intern_tasks WHERE title = 'Future'));
