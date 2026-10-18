-- Migration 20261017000000: activation requires an eligible assigned Mentor;
-- the assigned Mentor reads a completed placement's history read-only; an
-- ACTIVE placement cannot lose its Mentor without a replacement.
-- Since 20261018000000 the task functions are gone; the history checks here
-- use weekly reports (the archived task tables are covered by test 160).

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000003','m2@x.com'),
 ('00000000-0000-0000-0000-000000000004','m-off@x.com'),
 ('00000000-0000-0000-0000-000000000005','admin@x.com'),
 ('00000000-0000-0000-0000-000000000021','a1@x.com'),
 ('00000000-0000-0000-0000-000000000023','a3@x.com'),
 ('00000000-0000-0000-0000-000000000024','a4@x.com'),
 ('00000000-0000-0000-0000-000000000031','ic@x.com'),
 ('00000000-0000-0000-0000-000000000032','id@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000003','Mentor Two','m2@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000004','Mentor Off','m-off@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Admin','admin@x.com','ADMIN'),
 ('00000000-0000-0000-0000-000000000021','A1','a1@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000023','A3','a3@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000024','A4','a4@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000031','Intern C','ic@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000032','Intern D','id@x.com','INTERN');
UPDATE public.profiles SET is_active=false, deactivated_at=now() WHERE id='00000000-0000-0000-0000-000000000004';
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','A1','a1@x.com','00000000-0000-0000-0000-000000000021'),
 ('00000000-0000-0000-0000-0000000000b3','A3','a3@x.com','00000000-0000-0000-0000-000000000023'),
 ('00000000-0000-0000-0000-0000000000b4','A4','a4@x.com','00000000-0000-0000-0000-000000000024'),
 ('00000000-0000-0000-0000-0000000000bc','Intern C','ic@x.com','00000000-0000-0000-0000-000000000031'),
 ('00000000-0000-0000-0000-0000000000bd','Intern D','id@x.com','00000000-0000-0000-0000-000000000032'),
 ('00000000-0000-0000-0000-0000000000be','Withdrawn','w@x.com',NULL);
INSERT INTO public.internships (id, title, capacity, selection_status) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 10, 'OPEN');
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c3','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b3'),
 ('00000000-0000-0000-0000-0000000000c4','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b4'),
 ('00000000-0000-0000-0000-0000000000cc','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000bc'),
 ('00000000-0000-0000-0000-0000000000cd','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000bd'),
 ('00000000-0000-0000-0000-0000000000ce','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000be');
-- fc: Mentor One's placement that will be completed; fd: Mentor Two's active
-- placement; fe: cancelled (Mentor One); f3/f4: scheduled, Mentor One.
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000fc','00000000-0000-0000-0000-0000000000cc','00000000-0000-0000-0000-0000000000bc',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 20, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000fd','00000000-0000-0000-0000-0000000000cd','00000000-0000-0000-0000-0000000000bd',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 20, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date, current_date + 30, 'SCHEDULED', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000b4',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date, current_date + 30, 'SCHEDULED', '00000000-0000-0000-0000-000000000002');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id, cancelled_at, cancellation_reason) VALUES
 ('00000000-0000-0000-0000-0000000000fe','00000000-0000-0000-0000-0000000000ce','00000000-0000-0000-0000-0000000000be',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date, current_date + 30, 'CANCELLED', '00000000-0000-0000-0000-000000000002', now(), 'Withdrew');

-- Permissions (unchanged model) -------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 browsers cannot activate placements',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3')$q$,
  'permission denied for function activate_intern_placement');
SELECT public.t_expect_error('P3 browsers cannot read Mentor weekly reports',
  $q$SELECT * FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000fc')$q$,
  'permission denied for function list_mentor_weekly_reports');
RESET ROLE; SET ROLE service_role;

-- O. Opening an opportunity and selecting an applicant need no Mentor -----------------------
SELECT public.t_expect_ok('O1 HR opens a new opportunity (no Mentor involved)',
  $q$SELECT * FROM public.create_training_opportunity('00000000-0000-0000-0000-000000000001','Data',2,NULL,true,'OPEN')$q$);
RESET ROLE;
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id)
SELECT '00000000-0000-0000-0000-0000000000c1','NEW', i.id, NULL, '00000000-0000-0000-0000-0000000000b1'
FROM public.internships AS i WHERE i.title = 'Data';
SET ROLE service_role;
SELECT public.t_expect_ok('O2 HR selects the applicant (no Mentor involved)',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','SELECTED',NULL,NULL)$q$);
SELECT public.t_expect_ok('O3 HR schedules a placement without a Mentor',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','Acme',NULL,current_date,current_date + 60)$q$);
SELECT public.t_check('O3 the scheduled placement has no Mentor yet',
  (SELECT status = 'SCHEDULED' AND mentor_profile_id IS NULL FROM public.intern_placements
   WHERE application_id='00000000-0000-0000-0000-0000000000c1'));

-- A. Activation requires an eligible assigned Mentor -----------------------------------------
SELECT public.t_expect_error('A1 activation without a Mentor is refused',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1'))$q$,
  'mentor_required');
RESET ROLE;
-- Simulate inconsistent assignments (direct writes the RPCs would refuse).
UPDATE public.intern_placements SET mentor_profile_id='00000000-0000-0000-0000-000000000001'
WHERE application_id='00000000-0000-0000-0000-0000000000c1';
SET ROLE service_role;
SELECT public.t_expect_error('A2 a non-Mentor profile does not satisfy the requirement',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1'))$q$,
  'mentor_profile_required');
RESET ROLE;
UPDATE public.intern_placements SET mentor_profile_id='00000000-0000-0000-0000-000000000004'
WHERE application_id='00000000-0000-0000-0000-0000000000c1';
SET ROLE service_role;
SELECT public.t_expect_error('A3 a deactivated Mentor does not satisfy the requirement',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1'))$q$,
  'mentor_inactive');
SELECT public.t_check('A4 refused activations changed nothing',
  (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000021')='APPLICANT'
  AND (SELECT status FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1')='SCHEDULED'
  AND NOT EXISTS (SELECT 1 FROM public.intern_placement_events e JOIN public.intern_placements p ON p.id=e.placement_id
                  WHERE p.application_id='00000000-0000-0000-0000-0000000000c1' AND e.event_type='ACTIVATED'));
SELECT public.t_expect_ok('A5 HR assigns an eligible Mentor',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1'),'00000000-0000-0000-0000-000000000003')$q$);
SELECT public.t_expect_ok('A6 activation succeeds with an eligible Mentor',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1'))$q$);
SELECT public.t_check('A6 placement ACTIVE with its Mentor and the applicant is now INTERN',
  (SELECT status = 'ACTIVE' AND mentor_profile_id='00000000-0000-0000-0000-000000000003'
   FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1')
  AND (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000021')='INTERN');
SELECT public.t_check('A7 existing active placements are untouched by the migration',
  (SELECT count(*) FROM public.intern_placements WHERE id IN ('00000000-0000-0000-0000-0000000000fc','00000000-0000-0000-0000-0000000000fd')
   AND status='ACTIVE')=2);

-- C. An ACTIVE placement cannot lose its Mentor without a replacement ------------------------
SELECT public.t_expect_error('C1 HR cannot remove the Mentor of an active placement',
  $q$SELECT * FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000fd','On leave')$q$,
  'active_placement_requires_mentor');
SELECT public.t_expect_ok('C2 HR replaces the Mentor of an active placement in one operation',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000fd','00000000-0000-0000-0000-000000000002')$q$);
SELECT public.t_check('C2 the placement never had a gap: one MENTOR_ASSIGNED event, Mentor Two -> Mentor One',
  (SELECT mentor_profile_id FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000fd')='00000000-0000-0000-0000-000000000002'
  AND (SELECT array_agg(event_type || ':' || coalesce(details->>'fromMentorName','-') || '>' || coalesce(details->>'toMentorName','-'))
       FROM public.intern_placement_events WHERE placement_id='00000000-0000-0000-0000-0000000000fd')
      = ARRAY['MENTOR_ASSIGNED:Mentor Two>Mentor One']);
SELECT public.t_expect_ok('C3 swap back (Mentor Two supervises fd for the rest of the test)',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000fd','00000000-0000-0000-0000-000000000003')$q$);

-- B. Completed placement: the assigned Mentor reads history, read-only ----------------------
SELECT public.t_expect_ok('B0 intern submits a weekly report',
  $q$SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000031',
       (SELECT id FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000031', date_trunc('week', current_date)::date - 7, 'Week', NULL, NULL, NULL)))$q$);
SELECT public.t_expect_ok('B0 Mentor One accepts the report',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports WHERE placement_id='00000000-0000-0000-0000-0000000000fc'),'ACCEPT',NULL)$q$);
SELECT public.t_expect_ok('B0 HR completes fc early',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000fc','Finished early')$q$);

SELECT public.t_check('B1 a completed placement keeps its assigned Mentor',
  (SELECT status = 'COMPLETED' AND mentor_profile_id='00000000-0000-0000-0000-000000000002'
   FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000fc'));
SELECT public.t_expect_error('B1 the Mentor of a completed placement cannot be changed',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000fc','00000000-0000-0000-0000-000000000003')$q$,
  'placement_not_assignable');
SELECT public.t_expect_error('B1 or removed',
  $q$SELECT * FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000fc',NULL)$q$,
  'placement_not_assignable');

RESET ROLE;
CREATE TEMP TABLE t_before AS
SELECT (SELECT md5(string_agg(row_to_json(r)::text, '|' ORDER BY r.id)) FROM public.intern_weekly_reports r) AS reports,
       (SELECT count(*) FROM public.intern_weekly_report_events) AS report_events;
GRANT SELECT ON t_before TO service_role;
SET ROLE service_role;

SELECT public.t_check('B4 the assigned Mentor reads the completed placement''s weekly reports',
  (SELECT array_agg(status) FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000fc'))
    = ARRAY['ACCEPTED']);
SELECT public.t_check('B5 the dashboard still lists the completed placement for its Mentor',
  EXISTS (SELECT 1 FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002')
          WHERE placement_id='00000000-0000-0000-0000-0000000000fc' AND status='COMPLETED'));

SELECT public.t_expect_error('B10 the Mentor cannot review reports of a completed placement',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports WHERE placement_id='00000000-0000-0000-0000-0000000000fc'),'RETURN','Redo')$q$,
  'placement_not_active');
SELECT public.t_check('B11 reads and refused writes left every report and history row unchanged',
  (SELECT md5(string_agg(row_to_json(r)::text, '|' ORDER BY r.id)) FROM public.intern_weekly_reports r) = (SELECT reports FROM t_before)
  AND (SELECT count(*) FROM public.intern_weekly_report_events) = (SELECT report_events FROM t_before));

-- Isolation between Mentors, and unreadable statuses -----------------------------------------
SELECT public.t_expect_error('I3 another Mentor cannot read the completed placement''s reports',
  $q$SELECT * FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000fc')$q$,
  'placement_not_assigned_to_mentor');
SELECT public.t_expect_error('I6 Mentor One cannot read the reports of Mentor Two''s active placement',
  $q$SELECT * FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000fd')$q$,
  'placement_not_assigned_to_mentor');
SELECT public.t_check('I7 Mentor Two''s dashboard does not list Mentor One''s placements',
  NOT EXISTS (SELECT 1 FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000003')
              WHERE placement_id IN ('00000000-0000-0000-0000-0000000000fc','00000000-0000-0000-0000-0000000000fe')));
SELECT public.t_expect_error('S3 a cancelled placement stays unreadable (reports)',
  $q$SELECT * FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000fe')$q$,
  'placement_not_active');
SELECT public.t_expect_error('S4 a scheduled placement stays unreadable through these functions',
  $q$SELECT * FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f3')$q$,
  'placement_not_active');
RESET ROLE;

-- Concurrency ---------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('hr2', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('hr2', 'SET ROLE service_role');

-- CC1: removal (session A) commits before activation (session B) of the same placement.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC1 session A removes f3''s Mentor (uncommitted)',
  $q$SELECT * FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3',NULL)$q$);
SELECT dblink_send_query('hr2', $q$
  SELECT status FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3');
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC1 the activation waits for the removal', dblink_is_busy('hr2') = 1);
COMMIT;
SELECT * FROM dblink_get_result('hr2', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC1 the activation is refused once the removal commits', msg LIKE '%mentor_required%', msg
FROM (SELECT dblink_error_message('hr2') AS msg) AS e;
SELECT public.t_check('CC1 f3 is still scheduled, without a Mentor; A3 is still an applicant',
  (SELECT status = 'SCHEDULED' AND mentor_profile_id IS NULL FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000f3')
  AND (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000023')='APPLICANT');

-- Fresh second session (the previous one ended on an error result).
SELECT dblink_disconnect('hr2');
SELECT dblink_connect('hr2', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('hr2', 'SET ROLE service_role');

-- CC2: activation (session A) commits before removal (session B).
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC2 session A activates f4 (uncommitted)',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f4')$q$);
SELECT dblink_send_query('hr2', $q$
  SELECT status FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f4',NULL);
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC2 the removal waits for the activation', dblink_is_busy('hr2') = 1);
COMMIT;
SELECT * FROM dblink_get_result('hr2', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC2 the removal is refused once the placement is active', msg LIKE '%active_placement_requires_mentor%', msg
FROM (SELECT dblink_error_message('hr2') AS msg) AS e;
SELECT public.t_check('CC2 f4 is active and keeps Mentor One',
  (SELECT status = 'ACTIVE' AND mentor_profile_id='00000000-0000-0000-0000-000000000002' FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000f4'));

-- Fresh second session (the previous one ended on an error result).
SELECT dblink_disconnect('hr2');
SELECT dblink_connect('hr2', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('hr2', 'SET ROLE service_role');

-- CC3: reassignment (session A) and removal (session B) of an active placement's Mentor.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC3 session A reassigns f4 to Mentor Two (uncommitted)',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-000000000003')$q$);
SELECT dblink_send_query('hr2', $q$
  SELECT status FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f4',NULL);
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC3 the removal waits for the reassignment', dblink_is_busy('hr2') = 1);
COMMIT;
SELECT * FROM dblink_get_result('hr2', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC3 the removal is refused; the placement is never left without a Mentor', msg LIKE '%active_placement_requires_mentor%', msg
FROM (SELECT dblink_error_message('hr2') AS msg) AS e;
SELECT public.t_check('CC3 f4 is supervised by Mentor Two',
  (SELECT mentor_profile_id FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000f4')='00000000-0000-0000-0000-000000000003');
SELECT dblink_disconnect('hr2');

-- D. A deactivated or demoted Mentor loses the historical access ------------------------------
SET ROLE service_role;
SELECT public.t_expect_ok('D1 the admin deactivates Mentor One (no open placements left)',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002',false,'Left the company')$q$);
SELECT public.t_expect_error('D4 a deactivated Mentor cannot read the completed placement''s reports',
  $q$SELECT * FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000fc')$q$,
  'mentor_role_required');
SELECT public.t_expect_ok('D5 reactivated',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002',true,NULL)$q$);
SELECT public.t_check('D5 a reactivated Mentor reads it again',
  (SELECT count(*) FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000fc'))=1);
SELECT public.t_expect_ok('D6 the admin demotes Mentor One to HR',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','HR',NULL)$q$);
SELECT public.t_expect_error('D9 a demoted Mentor cannot read the completed placement''s reports',
  $q$SELECT * FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000fc')$q$,
  'mentor_role_required');
SELECT public.t_check('D10 the history itself is kept',
  (SELECT count(*) FROM public.intern_weekly_reports WHERE placement_id='00000000-0000-0000-0000-0000000000fc')=1);
RESET ROLE;
