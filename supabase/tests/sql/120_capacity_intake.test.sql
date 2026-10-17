-- Migration 20261014000000: cumulative seats with explicit release, HR
-- approval/selection status, and the ADMIN portal-wide application intake.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','mentor@x.com'),
 ('00000000-0000-0000-0000-000000000007','admin@x.com'),
 ('00000000-0000-0000-0000-000000000011','a1@x.com'),
 ('00000000-0000-0000-0000-000000000021','draft1@x.com'),
 ('00000000-0000-0000-0000-000000000022','draft2@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor','mentor@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000007','Admin','admin@x.com','ADMIN'),
 ('00000000-0000-0000-0000-000000000011','A1','a1@x.com','APPLICANT');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','A1','a1@x.com','00000000-0000-0000-0000-000000000011'),
 ('00000000-0000-0000-0000-0000000000b2','A2','a2@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b3','A3','a3@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b4','A4','a4@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b5','A5','a5@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b6','A6','a6@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b7','A7','a7@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b8','A8','a8@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b9','A9','a9@x.com',NULL);
-- e1 approved with 2 seats; e2 listed but not approved (demand only); e3 closed; e4 one seat (race).
INSERT INTO public.internships (id, title, capacity, selection_status, is_active) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Backend', 2, 'OPEN', true),
 ('00000000-0000-0000-0000-0000000000e2','Design', 3, 'NOT_APPROVED', true),
 ('00000000-0000-0000-0000-0000000000e3','Closed track', 5, 'CLOSED', false),
 ('00000000-0000-0000-0000-0000000000e4','Race', 1, 'OPEN', true);
INSERT INTO public.training_request_mappings (normalized_label, internship_id, mapped_by) VALUES
 ('robotics','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001');
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','NEW','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','NEW','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c3','NEW','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b3'),
 ('00000000-0000-0000-0000-0000000000c4','NEW','00000000-0000-0000-0000-0000000000e2',NULL,'00000000-0000-0000-0000-0000000000b4'),
 ('00000000-0000-0000-0000-0000000000c5','NEW','00000000-0000-0000-0000-0000000000e3',NULL,'00000000-0000-0000-0000-0000000000b5'),
 ('00000000-0000-0000-0000-0000000000c6','NEW',NULL,'Robotics','00000000-0000-0000-0000-0000000000b6'),
 ('00000000-0000-0000-0000-0000000000c7','NEW',NULL,'Astronomy','00000000-0000-0000-0000-0000000000b7'),
 ('00000000-0000-0000-0000-0000000000c8','NEW','00000000-0000-0000-0000-0000000000e4',NULL,'00000000-0000-0000-0000-0000000000b8'),
 ('00000000-0000-0000-0000-0000000000c9','NEW','00000000-0000-0000-0000-0000000000e4',NULL,'00000000-0000-0000-0000-0000000000b9');
-- Two drafts awaiting the applicant's review (created while intake is open).
INSERT INTO public.applications (id, status, internship_id, requested_training, review_email, extracted_data, review_token_hash, review_token_expires_at, cv_path) VALUES
 ('00000000-0000-0000-0000-0000000000d1','DRAFT',NULL,'Data Science','draft1@x.com','{"email":"draft1@x.com"}', public.t_hash('tok-d1'), now() + interval '1 day','cvs/d1.pdf'),
 ('00000000-0000-0000-0000-0000000000d2','DRAFT',NULL,'Data Science','draft2@x.com','{"email":"draft2@x.com"}', public.t_hash('tok-d2'), now() + interval '1 day','cvs/d2.pdf');

-- Permissions ---------------------------------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 browsers cannot read portal settings',
  $q$SELECT * FROM public.portal_settings$q$, 'permission denied for table portal_settings');
SELECT public.t_expect_error('P2 browsers cannot change intake',
  $q$SELECT * FROM public.admin_set_application_intake('00000000-0000-0000-0000-000000000007', false, NULL)$q$,
  'permission denied for function admin_set_application_intake');
SELECT public.t_expect_error('P3 browsers cannot release selections',
  $q$SELECT * FROM public.release_application_selection('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','x')$q$,
  'permission denied for function release_application_selection');
RESET ROLE; SET ROLE service_role;

-- Requests never depend on approval or capacity -------------------------------------------------------
SELECT public.t_check('Q1 intake is open by default', public.get_application_intake());
SELECT public.t_expect_ok('Q2 an "Other" request with no matching opportunity is accepted',
  $q$INSERT INTO public.applications (status, requested_training, review_email, extracted_data, review_token_hash, review_token_expires_at, cv_path)
     VALUES ('DRAFT','Quantum Computing','q@x.com','{}', public.t_hash('tok-q'), now() + interval '1 day','cvs/q.pdf')$q$);
SELECT public.t_expect_ok('Q3 a listed but not approved type without capacity is accepted',
  $q$INSERT INTO public.applications (status, internship_id, review_email, extracted_data, review_token_hash, review_token_expires_at, cv_path)
     VALUES ('DRAFT','00000000-0000-0000-0000-0000000000e2','r@x.com','{}', public.t_hash('tok-r'), now() + interval '1 day','cvs/r.pdf')$q$);

-- Selection rules -------------------------------------------------------------------------------------------
SELECT public.t_expect_error('S1 not approved: no selection',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c4','SELECTED',NULL,NULL)$q$,
  'training_not_approved');
SELECT public.t_expect_error('S2 selection closed',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c5','SELECTED',NULL,NULL)$q$,
  'training_selection_closed');
SELECT public.t_expect_error('S3 an unlinked "Other" request',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c7','SELECTED',NULL,NULL)$q$,
  'training_not_planned');
SELECT public.t_expect_ok('S4 first seat',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','SELECTED',NULL,NULL)$q$);

-- Portal intake (ADMIN) ---------------------------------------------------------------------------------------
SELECT public.t_expect_error('I1 HR cannot change intake',
  $q$SELECT * FROM public.admin_set_application_intake('00000000-0000-0000-0000-000000000001', false, NULL)$q$, 'admin_role_required');
SELECT public.t_expect_ok('I2 ADMIN closes intake with a note',
  $q$SELECT * FROM public.admin_set_application_intake('00000000-0000-0000-0000-000000000007', false, 'Cycle closed')$q$);
SELECT public.t_check('I2 audited with actor, from/to and note (no target account)',
  NOT public.get_application_intake()
  AND EXISTS (SELECT 1 FROM public.admin_audit_events WHERE event_type='SETTING_UPDATED' AND target_email IS NULL
              AND actor_profile_id='00000000-0000-0000-0000-000000000007' AND note='Cycle closed'
              AND details->>'from'='true' AND details->>'to'='false'));
SELECT public.t_expect_error('I3 closing again is refused',
  $q$SELECT * FROM public.admin_set_application_intake('00000000-0000-0000-0000-000000000007', false, NULL)$q$, 'intake_unchanged');
SELECT public.t_expect_error('I4 no new application while closed, "Other" included',
  $q$INSERT INTO public.applications (status, requested_training, review_email, extracted_data, review_token_hash, review_token_expires_at, cv_path)
     VALUES ('DRAFT','Marine Biology','m@x.com','{}', public.t_hash('tok-m'), now() + interval '1 day','cvs/m.pdf')$q$,
  'applications_closed');
SELECT public.t_expect_error('I5 a pending review cannot be finalized while closed',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-d1'), '{"email":"draft1@x.com","fullName":"Draft One"}'::jsonb, '00000000-0000-0000-0000-000000000021', true)$q$,
  'applications_closed');
SELECT public.t_check('I5 the draft, its token, CV and data are kept unchanged; no applicant or profile created',
  (SELECT status='DRAFT' AND review_token_used_at IS NULL AND cv_path='cvs/d1.pdf' AND applicant_id IS NULL
          AND extracted_data='{"email":"draft1@x.com"}'::jsonb
   FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000d1')
  AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000021')
  AND NOT EXISTS (SELECT 1 FROM public.applicants WHERE email='draft1@x.com'));
SELECT public.t_expect_ok('I6 HR still selects while intake is closed',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','SELECTED',NULL,NULL)$q$);
SELECT public.t_expect_ok('I7 ADMIN reopens intake',
  $q$SELECT * FROM public.admin_set_application_intake('00000000-0000-0000-0000-000000000007', true, NULL)$q$);
SELECT public.t_expect_ok('I8 the kept draft can be finalized after reopening',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-d1'), '{"email":"draft1@x.com","fullName":"Draft One"}'::jsonb, '00000000-0000-0000-0000-000000000021', true)$q$);
SELECT public.t_check('I8 now NEW', (SELECT status FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000d1')='NEW');

-- Capacity is cumulative: completion and cancellation keep the seat -------------------------------------------------
SELECT public.t_expect_error('C1 third selection refused (capacity 2)',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,NULL)$q$,
  'training_capacity_full');
SELECT public.t_expect_error('C2 a linked "Other" request uses the same seats',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c6','SELECTED',NULL,NULL)$q$,
  'training_capacity_full');
SELECT public.t_expect_ok('C3 place the first selected applicant',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','Acme',NULL,current_date,current_date + 60)$q$);
SELECT public.t_expect_ok('C3 assign its Mentor (required for activation)',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1'),'00000000-0000-0000-0000-000000000002')$q$);
SELECT public.t_expect_ok('C4 activation at full capacity does not count the person again',
  $q$SELECT * FROM public.activate_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1'))$q$);
SELECT public.t_expect_ok('C5 complete it (early, with a reason)',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c1'),'Finished early')$q$);
SELECT public.t_check('C5 the completed selection still consumes its seat',
  public.training_opportunity_seats_consumed('00000000-0000-0000-0000-0000000000e1') = 2);
SELECT public.t_expect_error('C6 completion did not free a seat',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,NULL)$q$,
  'training_capacity_full');
SELECT public.t_expect_ok('C7 place and cancel the second selected applicant',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Acme',NULL,current_date + 1,current_date + 60)$q$);
SELECT public.t_expect_ok('C7b cancel',
  $q$SELECT * FROM public.cancel_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2' AND status='SCHEDULED'),'Postponed')$q$);
SELECT public.t_expect_error('C8 cancellation did not free a seat',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,NULL)$q$,
  'training_capacity_full');

-- Replacing a cancelled placement -------------------------------------------------------------------------------
SELECT public.t_expect_ok('R1 replacement allowed while OPEN and within capacity',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Acme',NULL,current_date + 2,current_date + 60)$q$);
SELECT public.t_expect_ok('R1b cancel the replacement too',
  $q$SELECT * FROM public.cancel_intern_placement('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2' AND status='SCHEDULED'),'Postponed again')$q$);
SELECT public.t_expect_ok('R2 HR closes selection on Backend',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Backend',true,2,NULL,'CLOSED')$q$);
SELECT public.t_expect_error('R3 no replacement while selection is CLOSED',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Acme',NULL,current_date + 3,current_date + 60)$q$,
  'training_selection_closed');

-- Explicit release ------------------------------------------------------------------------------------------------
SELECT public.t_expect_error('L1 a completed placement keeps its seat (not releasable)',
  $q$SELECT * FROM public.release_application_selection('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','x')$q$,
  'selection_not_releasable');
SELECT public.t_expect_error('L2 a reason is required',
  $q$SELECT * FROM public.release_application_selection('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','  ')$q$,
  'release_reason_required');
SELECT public.t_expect_error('L3 only HR releases (ADMIN and Mentor refused)',
  $q$SELECT * FROM public.release_application_selection('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000c2','x')$q$,
  'hr_role_required');
SELECT public.t_expect_error('L3b Mentor refused',
  $q$SELECT * FROM public.release_application_selection('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c2','x')$q$,
  'hr_role_required');
SELECT public.t_expect_error('L4 a non-selected application cannot be released',
  $q$SELECT * FROM public.release_application_selection('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','x')$q$,
  'selection_not_releasable');
CREATE TEMP TABLE c2_history AS
  SELECT (SELECT count(*) FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2') AS placements,
         (SELECT count(*) FROM public.application_status_events WHERE application_id='00000000-0000-0000-0000-0000000000c2') AS status_events;
GRANT SELECT ON c2_history TO service_role;
SELECT public.t_expect_ok('L5 HR releases the cancelled applicant''s selection',
  $q$SELECT * FROM public.release_application_selection('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Accepted another offer')$q$);
SELECT public.t_check('L5 still SELECTED, release recorded, seat freed, history intact',
  (SELECT status='SELECTED' AND selection_released_at IS NOT NULL AND selection_release_reason='Accepted another offer'
          AND selection_released_by='00000000-0000-0000-0000-000000000001'
   FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c2')
  AND public.training_opportunity_seats_consumed('00000000-0000-0000-0000-0000000000e1') = 1
  AND public.training_opportunity_selected_count('00000000-0000-0000-0000-0000000000e1') = 2
  AND EXISTS (SELECT 1 FROM public.training_plan_events WHERE event_type='SELECTION_RELEASED'
              AND internship_id='00000000-0000-0000-0000-0000000000e1' AND note='Accepted another offer'
              AND details->>'applicationId'='00000000-0000-0000-0000-0000000000c2')
  AND (SELECT placements = (SELECT count(*) FROM public.intern_placements WHERE application_id='00000000-0000-0000-0000-0000000000c2')
          AND status_events = (SELECT count(*) FROM public.application_status_events WHERE application_id='00000000-0000-0000-0000-0000000000c2')
       FROM c2_history));
SELECT public.t_expect_error('L6 releasing twice is refused',
  $q$SELECT * FROM public.release_application_selection('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','again')$q$,
  'selection_already_released');
SELECT public.t_expect_error('L7 a freed seat does not reopen a CLOSED selection',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,NULL)$q$,
  'training_selection_closed');
SELECT public.t_expect_ok('L8 HR reopens selection',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Backend',true,2,'Late replacement agreed','OPEN')$q$);
SELECT public.t_expect_error('L9 release is final: no placement for the released application, even with a free seat',
  $q$SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Acme',NULL,current_date + 3,current_date + 60)$q$,
  'selection_released');
SELECT public.t_expect_ok('L10 the freed seat can go to another applicant while OPEN',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,NULL)$q$);
SELECT public.t_expect_error('L11 full again',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c6','SELECTED',NULL,NULL)$q$,
  'training_capacity_full');
SELECT public.t_expect_error('L12 a release cannot be undone',
  $q$UPDATE public.applications SET selection_released_at = NULL, selection_release_reason = NULL, selection_released_by = NULL
     WHERE id = '00000000-0000-0000-0000-0000000000c2'$q$,
  'selection_release_is_final');

-- Capacity and approval changes -----------------------------------------------------------------------------------
SELECT public.t_expect_error('E1 capacity cannot drop below seats consumed',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Backend',true,1,NULL,'OPEN')$q$,
  'capacity_below_selected');
SELECT public.t_expect_error('E2 capacity cannot be cleared while seats are consumed',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Backend',true,NULL,NULL,'OPEN')$q$,
  'capacity_required_with_selections');
SELECT public.t_expect_error('E3 approval cannot be withdrawn after selections',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Backend',true,2,NULL,'NOT_APPROVED')$q$,
  'training_has_selections');
SELECT public.t_expect_ok('E4 approving the demand-only type and setting its capacity',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e2','Design',true,1,'Approved after review','OPEN')$q$);
SELECT public.t_expect_ok('E5 now selectable',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c4','SELECTED',NULL,NULL)$q$);
SELECT public.t_check('E6 history records the approval change',
  EXISTS (SELECT 1 FROM public.training_plan_events WHERE event_type='OPPORTUNITY_UPDATED'
          AND internship_id='00000000-0000-0000-0000-0000000000e2'
          AND details->'selectionStatus'->>'from'='NOT_APPROVED' AND details->'selectionStatus'->>'to'='OPEN'));
SELECT public.t_expect_ok('N1 a new opportunity awaits approval and is unlisted unless HR chooses otherwise',
  $q$SELECT * FROM public.create_training_opportunity('00000000-0000-0000-0000-000000000001','Cloud',NULL,NULL,false,NULL)$q$);
SELECT public.t_check('N1 stored as NOT_APPROVED, unlisted, no capacity',
  (SELECT selection_status='NOT_APPROVED' AND NOT is_active AND capacity IS NULL FROM public.internships WHERE title='Cloud'));
SELECT public.t_expect_error('N2 a new opportunity cannot start CLOSED',
  $q$SELECT * FROM public.create_training_opportunity('00000000-0000-0000-0000-000000000001','Mobile',2,NULL,true,'CLOSED')$q$,
  'invalid_selection_status');
RESET ROLE;

-- Concurrency: two HR sessions take the last seat --------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('hr2', format('host=127.0.0.1 port=%s dbname=%s user=postgres', current_setting('port'), current_database()));
SELECT dblink_exec('hr2', 'SET ROLE service_role');
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC1 session A selects the last seat (uncommitted)',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c8','SELECTED',NULL,NULL)$q$);
SELECT dblink_send_query('hr2', $q$
  SELECT status FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000c9', 'SELECTED', NULL, NULL);
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC2 session B waits for the seat lock', dblink_is_busy('hr2') = 1);
COMMIT;
SELECT * FROM dblink_get_result('hr2', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC3 session B is refused once A commits (no overbooking)', msg LIKE '%training_capacity_full%', msg
FROM (SELECT dblink_error_message('hr2') AS msg) AS e;
SELECT dblink_disconnect('hr2');
SELECT public.t_check('CC4 exactly one seat taken',
  public.training_opportunity_seats_consumed('00000000-0000-0000-0000-0000000000e4') = 1);

-- Concurrency: ADMIN closes intake while an applicant finalizes a review ---------------------------------------------
SELECT dblink_connect('applicant', format('host=127.0.0.1 port=%s dbname=%s user=postgres', current_setting('port'), current_database()));
SELECT dblink_exec('applicant', 'SET ROLE service_role');
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC5 ADMIN closes intake (uncommitted)',
  $q$SELECT * FROM public.admin_set_application_intake('00000000-0000-0000-0000-000000000007', false, NULL)$q$);
SELECT dblink_send_query('applicant', format($q$
  SELECT status FROM public.submit_application_review_v2(%L, '{"email":"draft2@x.com","fullName":"Draft Two"}'::jsonb,
    '00000000-0000-0000-0000-000000000022', true);
$q$, public.t_hash('tok-d2')));
SELECT pg_sleep(0.5);
SELECT public.t_check('CC6 the submission waits for the intake change', dblink_is_busy('applicant') = 1);
COMMIT;
SELECT * FROM dblink_get_result('applicant', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC7 the submission is refused once the closure commits', msg LIKE '%applications_closed%', msg
FROM (SELECT dblink_error_message('applicant') AS msg) AS e;
SELECT dblink_disconnect('applicant');
SELECT public.t_check('CC8 the draft is unchanged and no applicant or profile was created',
  (SELECT status='DRAFT' AND review_token_used_at IS NULL FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000d2')
  AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000022')
  AND NOT EXISTS (SELECT 1 FROM public.applicants WHERE email='draft2@x.com'));
