-- Migration 20261011090000: placement completion (HR only, early end needs a
-- reason, blocked by reports awaiting review, intern keeps read-only access).
-- Since 20261018000000 archived tasks no longer block completion.

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
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 2);
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2');
-- f1 still running (early end); f2 past its planned end date.
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 20, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 60, current_date - 1, 'ACTIVE', '00000000-0000-0000-0000-000000000002');

SET ROLE authenticated;
SELECT public.t_expect_error('P1 browsers cannot complete placements',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f2',NULL)$q$,
  'permission denied for function complete_intern_placement');
RESET ROLE; SET ROLE service_role;

-- Who may complete ---------------------------------------------------------------------------------
SELECT public.t_expect_error('W1 the Mentor cannot complete',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f2',NULL)$q$, 'hr_role_required');
SELECT public.t_expect_error('W2 ADMIN does not inherit HR',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000f2',NULL)$q$, 'hr_role_required');
SELECT public.t_expect_error('W3 the intern cannot complete',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000f1','x')$q$, 'hr_role_required');

-- Open work blocks completion; archived tasks do not ---------------------------------------------
RESET ROLE;
-- A task left open by the retired task feature (written directly: no function writes tasks any more).
INSERT INTO public.intern_tasks (placement_id, title, status) VALUES ('00000000-0000-0000-0000-0000000000f1', 'Legacy open task', 'ASSIGNED');
SET ROLE service_role;
SELECT public.t_expect_ok('O0 the intern submits a report',
  $q$SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000005',
       (SELECT id FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005', date_trunc('week', current_date)::date - 7, 'Week', NULL, NULL, NULL)))$q$);
SELECT public.t_expect_error('O1 early end needs a reason',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','  ')$q$,
  'early_end_reason_required');
SELECT public.t_expect_error('O6 a report awaiting review blocks completion',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','Moved abroad')$q$,
  'placement_has_pending_reports');
SELECT public.t_expect_ok('O7 Mentor accepts the report',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports LIMIT 1),'ACCEPT',NULL)$q$);

-- Early end ------------------------------------------------------------------------------------------
SELECT public.t_expect_ok('E1 HR ends f1 early with a reason',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1',' Moved abroad ')$q$);
SELECT public.t_check('E1 completed early, history records actor, reason and planned end',
  (SELECT status='COMPLETED' AND ended_early AND completion_note='Moved abroad' AND completed_at IS NOT NULL
   FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000f1')
  AND EXISTS (SELECT 1 FROM public.intern_placement_events WHERE placement_id='00000000-0000-0000-0000-0000000000f1'
              AND event_type='COMPLETED' AND note='Moved abroad' AND (details->>'endedEarly')::boolean
              AND actor_profile_id='00000000-0000-0000-0000-000000000001'));
SELECT public.t_expect_error('E2 a completed placement cannot be completed again',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','x')$q$,
  'placement_not_completable');
SELECT public.t_check('E3 the intern keeps the INTERN role',
  (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000005')='INTERN');

-- Read-only afterwards -------------------------------------------------------------------------------
SELECT public.t_check('E4 completed although the archived task is still open (and unchanged)',
  (SELECT status FROM public.intern_tasks WHERE title='Legacy open task')='ASSIGNED');
SELECT public.t_check('R1 the intern still sees their reports',
  (SELECT count(*) FROM public.list_my_weekly_reports('00000000-0000-0000-0000-000000000005'))=1);
SELECT public.t_expect_error('R2 but cannot write reports',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005', date_trunc('week', current_date)::date, 'More', NULL, NULL, NULL)$q$,
  'active_placement_not_found');
SELECT public.t_expect_error('R3 and the Mentor cannot review reports any more',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports LIMIT 1),'RETURN','Late')$q$,
  'placement_not_active');
SELECT public.t_check('R4 another intern sees none of it',
  (SELECT count(*) FROM public.list_my_weekly_reports('00000000-0000-0000-0000-000000000006'))=0);
SELECT public.t_expect_error('R5 no second placement for the same application',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','Acme',NULL,current_date,current_date + 10)$q$,
  'placement_already_exists');
SELECT public.t_check('R6 the Mentor is free again (no open placements counted for f1)',
  (SELECT open_placements FROM public.list_hr_mentors('00000000-0000-0000-0000-000000000001'))=1);
SELECT public.t_check('R7 HR progress still lists the completed placement',
  EXISTS (SELECT 1 FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000001')
          WHERE placement_id='00000000-0000-0000-0000-0000000000f1' AND status='COMPLETED'));

-- Normal completion on/after the planned end ---------------------------------------------------------
SELECT public.t_expect_ok('N1 past its end date no reason is needed',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f2',NULL)$q$);
SELECT public.t_check('N1 not an early end',
  (SELECT NOT ended_early AND completion_note IS NULL FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000f2'));
SELECT public.t_check('N1 since 20261019000000 each completion issued exactly one certificate',
  (SELECT count(*) FROM public.internship_certificates WHERE placement_id='00000000-0000-0000-0000-0000000000f1' AND status='ISSUED')=1
  AND (SELECT count(*) FROM public.internship_certificates WHERE placement_id='00000000-0000-0000-0000-0000000000f2' AND status='ISSUED')=1);
SELECT public.t_expect_error('N2 the completion fields stay consistent',
  $q$UPDATE public.intern_placements SET completed_at=NULL WHERE id='00000000-0000-0000-0000-0000000000f2'$q$,
  '%intern_placements_completion_check%');
RESET ROLE;

-- Concurrency: HR completes while the intern saves a weekly report ------------------------------------
UPDATE public.intern_placements SET end_date = current_date + 30 WHERE id = '00000000-0000-0000-0000-0000000000f2';
UPDATE public.intern_placements SET status='ACTIVE', completed_at=NULL, ended_early=NULL, completion_note=NULL
  WHERE id='00000000-0000-0000-0000-0000000000f2';
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('intern', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('intern', 'SET ROLE service_role');
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC1 HR completes f2 (uncommitted)',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f2','Contract ended')$q$);
SELECT dblink_send_query('intern', $q$
  SELECT status FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000006',
    date_trunc('week', current_date)::date, 'Racing report', NULL, NULL, NULL);
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC2 the report save waits for the completion', dblink_is_busy('intern') = 1);
COMMIT;
SELECT * FROM dblink_get_result('intern', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC3 the report is refused after completion commits', msg LIKE '%active_placement_not_found%', msg
FROM (SELECT dblink_error_message('intern') AS msg) AS e;
SELECT dblink_disconnect('intern');
SELECT public.t_check('CC4 no report was added to the completed placement',
  NOT EXISTS (SELECT 1 FROM public.intern_weekly_reports WHERE summary='Racing report'));
SELECT public.t_check('CC5 completing f2 again (after the direct reset above) kept its one certificate',
  (SELECT count(*) FROM public.internship_certificates WHERE placement_id='00000000-0000-0000-0000-0000000000f2')=1);
