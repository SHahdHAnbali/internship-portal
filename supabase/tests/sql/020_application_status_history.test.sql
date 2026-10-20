-- Migration 20261011000000: original extraction, duplicate protection,
-- HR status transitions with history, applicant profile edits.

-- Planned capacity so selections are possible (training planning, migration 20261011010000).
INSERT INTO public.internships (id, title, capacity, selection_status) VALUES
 ('00000000-0000-0000-0000-0000000000a1','Engineering', 5, 'OPEN');
INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','applicant@x.com'),
 ('00000000-0000-0000-0000-000000000003','mentor@x.com'),
 ('00000000-0000-0000-0000-000000000004','second@x.com'),
 ('00000000-0000-0000-0000-000000000005','third@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Applicant','applicant@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000003','Mentor','mentor@x.com','MENTOR');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b2','Applicant','applicant@x.com','00000000-0000-0000-0000-000000000002');

-- Submitted applications owned by the applicant (various statuses).
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id, extracted_data, original_extracted_data) VALUES
 ('00000000-0000-0000-0000-0000000000c1','NEW',NULL,'Data Science','00000000-0000-0000-0000-0000000000b2','{"email":"applicant@x.com"}','{"email":"applicant@x.com","fullName":"AI Name"}'),
 ('00000000-0000-0000-0000-0000000000c2','NEW',NULL,'Cloud','00000000-0000-0000-0000-0000000000b2','{}',NULL),
 ('00000000-0000-0000-0000-0000000000c3','NEW','00000000-0000-0000-0000-0000000000a1',NULL,'00000000-0000-0000-0000-0000000000b2','{}',NULL),
 ('00000000-0000-0000-0000-0000000000c4','INTERVIEW',NULL,'Mobile','00000000-0000-0000-0000-0000000000b2','{}',NULL),
 ('00000000-0000-0000-0000-0000000000c5','DRAFT',NULL,'Draft only',NULL,'{}',NULL);

-- 1. Original extraction ---------------------------------------------------------
SELECT public.t_expect_error('O1 original extraction cannot be changed once set',
  $q$UPDATE public.applications SET original_extracted_data='{"x":1}' WHERE id='00000000-0000-0000-0000-0000000000c1'$q$,
  'original_extraction_immutable');
SELECT public.t_expect_ok('O2 reviewed data (extracted_data) can still change',
  $q$UPDATE public.applications SET extracted_data='{"email":"applicant@x.com","fullName":"Reviewed"}' WHERE id='00000000-0000-0000-0000-0000000000c1'$q$);
SELECT public.t_check('O2 original kept beside reviewed data',
  (SELECT original_extracted_data->>'fullName' = 'AI Name' AND extracted_data->>'fullName' = 'Reviewed'
   FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c1'));
SELECT public.t_expect_ok('O3 a missing original can be set once',
  $q$UPDATE public.applications SET original_extracted_data='{"a":1}' WHERE id='00000000-0000-0000-0000-0000000000c2'$q$);
SELECT public.t_expect_error('O4 original must be a JSON object',
  $q$UPDATE public.applications SET original_extracted_data='[1]' WHERE id='00000000-0000-0000-0000-0000000000c3'$q$,
  '%applications_original_extracted_data_object_check%');

-- 2. Permissions -----------------------------------------------------------------
SET ROLE anon;
SELECT public.t_expect_error('P1 anon cannot change status',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','UNDER_REVIEW',NULL,NULL)$q$,
  'permission denied for function update_application_status_v2');
SELECT public.t_expect_error('P2 anon cannot read status history',
  $q$SELECT * FROM public.application_status_events$q$, 'permission denied for table application_status_events');
RESET ROLE; SET ROLE authenticated;
SELECT public.t_expect_error('P3 authenticated cannot change status',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','UNDER_REVIEW',NULL,NULL)$q$,
  'permission denied for function update_application_status_v2');
SELECT public.t_expect_error('P4 authenticated cannot edit applicant profiles via RPC',
  $q$SELECT public.update_my_applicant_profile('00000000-0000-0000-0000-000000000002','X',NULL,NULL,'{}')$q$,
  'permission denied for function update_my_applicant_profile');
RESET ROLE; SET ROLE service_role;
SELECT public.t_expect_error('P5 old unrestricted status function is retired',
  $q$SELECT * FROM public.update_application_status_safely('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','NEW')$q$,
  'permission denied for function update_application_status_safely');

-- 3. Transition rules ---------------------------------------------------------------
SELECT public.t_expect_error('T1 non-HR actor refused',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c2','UNDER_REVIEW',NULL,NULL)$q$,
  'hr_role_required');
SELECT public.t_expect_error('T2 drafts are invisible to HR',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c5','UNDER_REVIEW',NULL,NULL)$q$,
  'application_not_found');
SELECT public.t_expect_error('T3 cannot move back to NEW',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c4','NEW',NULL,NULL)$q$,
  'invalid_application_status');
SELECT public.t_expect_error('T4 review stages cannot move backwards',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c4','UNDER_REVIEW',NULL,NULL)$q$,
  'invalid_status_transition');
SELECT public.t_expect_ok('T5 HR may skip stages (NEW -> INTERVIEW) with an internal note',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','INTERVIEW',NULL,'  Strong portfolio  ')$q$);
SELECT public.t_expect_error('T6 same status is rejected',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','INTERVIEW',NULL,NULL)$q$,
  'application_status_unchanged');
SELECT public.t_expect_error('T7 rejection requires a reason',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','REJECTED','   ',NULL)$q$,
  'rejection_reason_required');
SELECT public.t_expect_error('T8 a reason is only for rejections',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SHORTLISTED','Because',NULL)$q$,
  'reason_only_for_rejection');
SELECT public.t_expect_ok('T9 reject with reason',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','REJECTED','Missing required skills','internal: compared with cohort')$q$);
SELECT public.t_check('T9 rejection reason stored on the application',
  (SELECT status='REJECTED' AND rejection_reason='Missing required skills' FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c2'));
SELECT public.t_expect_error('T10 a rejected application cannot be reopened',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','SELECTED',NULL,NULL)$q$,
  'application_decision_final');
SELECT public.t_expect_ok('T11 select directly from NEW',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,NULL)$q$);
SELECT public.t_expect_error('T12 a selected application cannot be reverted',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','REJECTED','Changed mind',NULL)$q$,
  'application_decision_final');
SELECT public.t_expect_error('T13 overlong note rejected',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c4','SELECTED',NULL,repeat('n',2001))$q$,
  'status_text_too_long');

-- 4. History ---------------------------------------------------------------------
SELECT public.t_check('H1 every change recorded with actor, from/to, reason and note',
  (SELECT count(*) = 3 FROM public.application_status_events)
  AND EXISTS (SELECT 1 FROM public.application_status_events WHERE application_id='00000000-0000-0000-0000-0000000000c2'
              AND from_status='NEW' AND to_status='INTERVIEW' AND note='Strong portfolio' AND reason IS NULL
              AND actor_profile_id='00000000-0000-0000-0000-000000000001')
  AND EXISTS (SELECT 1 FROM public.application_status_events WHERE application_id='00000000-0000-0000-0000-0000000000c2'
              AND from_status='INTERVIEW' AND to_status='REJECTED' AND reason='Missing required skills'));
SELECT public.t_check('H2 failed attempts leave no history and no status change',
  (SELECT status FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c4')='INTERVIEW'
  AND NOT EXISTS (SELECT 1 FROM public.application_status_events WHERE application_id='00000000-0000-0000-0000-0000000000c4'));
SELECT public.t_expect_error('H3 history is append-only (update)',
  $q$UPDATE public.application_status_events SET note='edited'$q$, 'permission denied for table application_status_events');
SELECT public.t_expect_error('H4 history is append-only (delete)',
  $q$DELETE FROM public.application_status_events$q$, 'permission denied for table application_status_events');
RESET ROLE;

-- 5. Constraint on direct writes --------------------------------------------------
SELECT public.t_expect_error('K1 REJECTED without a reason is impossible even directly',
  $q$UPDATE public.applications SET status='REJECTED' WHERE id='00000000-0000-0000-0000-0000000000c4'$q$,
  '%applications_rejection_reason_check%');

-- 6. Review submission: history event and duplicates ------------------------------
INSERT INTO public.applications (id, status, internship_id, requested_training, review_email, extracted_data, review_token_hash, review_token_expires_at, cv_path, cv_sha256) VALUES
 ('00000000-0000-0000-0000-0000000000d1','DRAFT',NULL,'Data science ','applicant@x.com','{"email":"applicant@x.com"}', public.t_hash('tok-dup-other'), now()+interval '1 hour','cv/d1.pdf', NULL),
 ('00000000-0000-0000-0000-0000000000d2','DRAFT','00000000-0000-0000-0000-0000000000a1',NULL,'second@x.com','{"email":"second@x.com"}', public.t_hash('tok-second'), now()+interval '1 hour','cv/d2.pdf', repeat('a',64)),
 ('00000000-0000-0000-0000-0000000000d3','DRAFT','00000000-0000-0000-0000-0000000000a1',NULL,'third@x.com','{"email":"third@x.com"}', public.t_hash('tok-third'), now()+interval '1 hour','cv/d3.pdf', repeat('a',64));
SET ROLE service_role;
-- Since 20261021000000 this applicant (who already has submitted applications) is refused for any training.
SELECT public.t_expect_error('D1 same applicant cannot submit the same "Other" training again (already applied)',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-dup-other'), '{"email":"applicant@x.com","fullName":"A"}', '00000000-0000-0000-0000-000000000002', false)$q$,
  'previous_application_exists');
SELECT public.t_expect_ok('D2 new applicant submits; history records DRAFT -> NEW',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-second'), '{"email":"second@x.com","fullName":"Second"}', '00000000-0000-0000-0000-000000000004', true)$q$);
SELECT public.t_check('D2 submission event attributed to the applicant',
  EXISTS (SELECT 1 FROM public.application_status_events WHERE application_id='00000000-0000-0000-0000-0000000000d2'
          AND from_status='DRAFT' AND to_status='NEW' AND actor_profile_id='00000000-0000-0000-0000-000000000004'));
SELECT public.t_expect_error('D3 the same CV cannot be submitted twice for the same training',
  $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-third'), '{"email":"third@x.com","fullName":"Third"}', '00000000-0000-0000-0000-000000000005', true)$q$,
  'duplicate_application');
SELECT public.t_check('D3 refused submission left no account rows and the draft intact',
  NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000005')
  AND (SELECT status FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000d3')='DRAFT');
RESET ROLE;
SELECT public.t_expect_error('D4 unique index blocks a second active copy of the same CV/target even directly',
  $q$UPDATE public.applications SET status='NEW' WHERE id='00000000-0000-0000-0000-0000000000d3'$q$,
  '%applications_cv_sha256_active_target_key%');

-- 7. Applicant profile edits -------------------------------------------------------
SET ROLE service_role;
SELECT public.t_expect_error('E1 HR cannot use the applicant profile edit',
  $q$SELECT public.update_my_applicant_profile('00000000-0000-0000-0000-000000000001','X',NULL,NULL,'{}')$q$,
  'applicant_role_required');
SELECT public.t_expect_error('E2 unknown profile fields are refused',
  $q$SELECT public.update_my_applicant_profile('00000000-0000-0000-0000-000000000002','Applicant',NULL,NULL,'{"role":"HR"}')$q$,
  'invalid_profile');
SELECT public.t_expect_error('E3 blank name refused',
  $q$SELECT public.update_my_applicant_profile('00000000-0000-0000-0000-000000000002','  ',NULL,NULL,'{}')$q$,
  'invalid_profile');
SELECT public.t_expect_ok('E4 applicant edits descriptive fields',
  $q$SELECT public.update_my_applicant_profile('00000000-0000-0000-0000-000000000002',' New Name ',' 0599 ','Nablus','{"skills":["SQL"],"summary":"Hi"}')$q$);
SELECT public.t_check('E4 applicant + profile updated; email and role unchanged; application snapshot untouched',
  (SELECT full_name='New Name' AND phone='0599' AND location='Nablus' AND profile_data->'skills'->>0='SQL' AND email='applicant@x.com'
   FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b2')
  AND (SELECT full_name='New Name' AND role='APPLICANT' AND email='applicant@x.com'
       FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000002')
  AND (SELECT extracted_data->>'fullName'='Reviewed' FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c1'));
RESET ROLE;
