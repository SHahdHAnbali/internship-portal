-- Migration 20261011020000: placement creation, activation (APPLICANT -> INTERN),
-- cancellation, history, defensive capacity check, concurrency.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','a2@x.com'),
 ('00000000-0000-0000-0000-000000000003','a3@x.com'),
 ('00000000-0000-0000-0000-000000000004','a4@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','A2','a2@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000003','A3','a3@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000004','A4','a4@x.com','APPLICANT');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b2','A2','a2@x.com','00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000b3','A3','a3@x.com','00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-0000000000b4','A4','a4@x.com','00000000-0000-0000-0000-000000000004');
INSERT INTO public.internships (id, title, capacity, selection_status) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 5, 'OPEN');
INSERT INTO public.training_request_mappings (normalized_label, internship_id, mapped_by) VALUES
 ('robotics','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001');
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,'Robotics','00000000-0000-0000-0000-0000000000b3'),
 ('00000000-0000-0000-0000-0000000000c4','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b4'),
 ('00000000-0000-0000-0000-0000000000c9','INTERVIEW','00000000-0000-0000-0000-0000000000e1',NULL,NULL);

-- Permissions -------------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 authenticated cannot cancel placements',
  $q$SELECT * FROM public.cancel_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','x')$q$,
  'permission denied for function cancel_intern_placement');
SELECT public.t_expect_error('P2 authenticated cannot read placement history',
  $q$SELECT * FROM public.intern_placement_events$q$, 'permission denied for table intern_placement_events');
RESET ROLE; SET ROLE service_role;

-- Creation ------------------------------------------------------------------------
SELECT public.t_expect_error('CR1 only HR creates placements',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c2','Acme',NULL,current_date,current_date+30)$q$,
  'hr_role_required');
SELECT public.t_expect_error('CR2 application must be selected',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c9','Acme',NULL,current_date,current_date+30)$q$,
  'application_not_eligible');
SELECT public.t_expect_error('CR3 a placement that has already ended is refused',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Acme',NULL,current_date-60,current_date-1)$q$,
  'placement_already_ended');
SELECT public.t_expect_error('CR4 end before start is refused',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Acme',NULL,current_date+10,current_date+5)$q$,
  'invalid_placement_date_range');
SELECT public.t_expect_ok('CR5 create a scheduled placement',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','  Acme  ',' R&D ',current_date,current_date+90)$q$);
SELECT public.t_check('CR5 placement records its opportunity and a CREATED event',
  EXISTS (SELECT 1 FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2'
          AND status='SCHEDULED' AND company='Acme' AND department='R&D' AND internship_id='00000000-0000-0000-0000-0000000000e1')
  AND EXISTS (SELECT 1 FROM public.intern_placement_events e JOIN public.intern_placements p ON p.id=e.placement_id
              WHERE p.application_id='00000000-0000-0000-0000-0000000000c2' AND e.event_type='CREATED' AND e.to_status='SCHEDULED'));
SELECT public.t_expect_error('CR6 a second open placement for the same application is refused',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Other',NULL,current_date,current_date+30)$q$,
  'placement_already_exists');
SELECT public.t_expect_ok('CR7 a mapped "Other" request gets its mapped opportunity',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','Bots Inc',NULL,current_date,current_date+60)$q$);
SELECT public.t_check('CR7 opportunity resolved through the request mapping',
  (SELECT internship_id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3')='00000000-0000-0000-0000-0000000000e1');

-- Cancellation and replacement ----------------------------------------------------------
SELECT public.t_expect_error('CA1 cancellation requires a reason',
  $q$SELECT * FROM public.cancel_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3'),'  ')$q$,
  'cancellation_reason_required');
SELECT public.t_expect_ok('CA2 cancel a scheduled placement',
  $q$SELECT * FROM public.cancel_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3'),'Company withdrew the offer')$q$);
SELECT public.t_check('CA2 placement cancelled with reason; application still selected; event recorded',
  EXISTS (SELECT 1 FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3'
          AND status='CANCELLED' AND cancellation_reason='Company withdrew the offer' AND cancelled_at IS NOT NULL)
  AND (SELECT status FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c3')='SELECTED'
  AND EXISTS (SELECT 1 FROM public.intern_placement_events WHERE event_type='CANCELLED' AND note='Company withdrew the offer'));
SELECT public.t_expect_ok('CA3 a replacement placement can be created after cancellation',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','New Co',NULL,current_date,current_date+60)$q$);
SELECT public.t_check('CA3 two placements for the application: one cancelled, one scheduled',
  (SELECT count(*) FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3' AND status='CANCELLED')=1
  AND (SELECT count(*) FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3' AND status='SCHEDULED')=1);

-- Activation ---------------------------------------------------------------------------------
SELECT public.t_expect_ok('AC1 activate: placement ACTIVE and applicant becomes INTERN',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2'))$q$);
SELECT public.t_check('AC1 role transition and ACTIVATED event in the same transaction',
  (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000002')='INTERN'
  AND (SELECT status FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2')='ACTIVE'
  AND EXISTS (SELECT 1 FROM public.intern_placement_events WHERE event_type='ACTIVATED' AND from_status='SCHEDULED' AND to_status='ACTIVE'));
SELECT public.t_expect_error('AC2 an active placement cannot be activated again',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2'))$q$,
  'placement_not_eligible');
SELECT public.t_expect_error('AC3 an active placement cannot be cancelled',
  $q$SELECT * FROM public.cancel_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2'),'x')$q$,
  'placement_not_cancellable');
SELECT public.t_expect_error('AC4 a cancelled placement cannot be activated',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3' AND status='CANCELLED'))$q$,
  'placement_not_eligible');
RESET ROLE;
-- Simulate a scheduled placement whose end date has passed (direct write).
UPDATE public.intern_placements SET start_date=current_date-30, end_date=current_date-1
WHERE application_id='00000000-0000-0000-0000-0000000000c3' AND status='SCHEDULED';
SET ROLE service_role;
SELECT public.t_expect_error('AC5 an ended placement cannot be activated',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3' AND status='SCHEDULED'))$q$,
  'placement_already_ended');
SELECT public.t_check('AC5 failed activation left role and placement unchanged',
  (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000003')='APPLICANT'
  AND (SELECT status FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c3' AND status<>'CANCELLED')='SCHEDULED');

-- Defensive seat check: never more ACTIVE placements than capacity -------------------------------
SELECT public.t_expect_ok('SE1 schedule A4''s placement',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c4','Acme',NULL,current_date,current_date+30)$q$);
RESET ROLE;
UPDATE public.internships SET capacity=1 WHERE id='00000000-0000-0000-0000-0000000000e1';
SET ROLE service_role;
SELECT public.t_expect_error('SE2 activation refused when active placements already fill the seats',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c4'))$q$,
  'training_capacity_full');
RESET ROLE;
UPDATE public.internships SET capacity=5 WHERE id='00000000-0000-0000-0000-0000000000e1';

SELECT public.t_expect_error('H1 placement history is append-only',
  $q$SET ROLE service_role; DELETE FROM public.intern_placement_events$q$,
  'permission denied for table intern_placement_events');
RESET ROLE;

-- Concurrency: two HR users activate the same placement at once ----------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('other_hr', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('other_hr', 'SET ROLE service_role');

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC1 session A activates A4 (uncommitted)',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c4'))$q$);
SELECT dblink_send_query('other_hr', $q$
  SELECT status FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c4'));
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC2 session B waits for session A', dblink_is_busy('other_hr') = 1);
COMMIT;

SELECT * FROM dblink_get_result('other_hr', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC3 session B is refused after A commits (single activation)', msg LIKE '%placement_not_eligible%', msg
FROM (SELECT dblink_error_message('other_hr') AS msg) AS e;
SELECT dblink_disconnect('other_hr');
SELECT public.t_check('CC4 exactly one ACTIVATED event and role INTERN for A4',
  (SELECT count(*) FROM public.intern_placement_events e JOIN public.intern_placements p ON p.id=e.placement_id
   WHERE p.application_id='00000000-0000-0000-0000-0000000000c4' AND e.event_type='ACTIVATED')=1
  AND (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000004')='INTERN');
