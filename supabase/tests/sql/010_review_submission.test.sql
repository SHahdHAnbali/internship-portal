-- Review submission (submit_application_review_v2): permissions, token
-- validation, account/applicant linking, staff refusal, legacy drafts.

-- Fixtures (as postgres) ------------------------------------------------------
INSERT INTO public.internships (id, title) VALUES
 ('00000000-0000-0000-0000-0000000000a1','Engineering'),('00000000-0000-0000-0000-0000000000a2','Design');
INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','new@x.com'),
 ('00000000-0000-0000-0000-000000000002','mismatch@x.com'),
 ('00000000-0000-0000-0000-000000000003','hr@x.com'),
 ('00000000-0000-0000-0000-000000000004','existing@x.com'),
 ('00000000-0000-0000-0000-000000000005','attacker@x.com'),
 ('00000000-0000-0000-0000-000000000006','victim@x.com'),
 ('00000000-0000-0000-0000-000000000007','legacy@x.com'),
 ('00000000-0000-0000-0000-000000000008','intruder@x.com'),
 ('00000000-0000-0000-0000-000000000009','intern@x.com'),
 ('00000000-0000-0000-0000-00000000000a','unlinked@x.com'),
 ('00000000-0000-0000-0000-00000000000b','mentor@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000003','HR Person','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000004','Existing','existing@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000005','Attacker','attacker@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000007','Legacy','legacy@x.com','APPLICANT'),
 ('00000000-0000-0000-0000-000000000009','Intern','intern@x.com','INTERN'),
 ('00000000-0000-0000-0000-00000000000b','Mentor','mentor@x.com','MENTOR');
-- The attacker's applicant row already carries the victim's email (old flaw).
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b5','Attacker','victim@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b7','Legacy','legacy@x.com','00000000-0000-0000-0000-000000000007'),
 ('00000000-0000-0000-0000-0000000000b9','Intern','intern@x.com','00000000-0000-0000-0000-000000000009'),
 ('00000000-0000-0000-0000-0000000000ba','Unlinked','unlinked@x.com',NULL);
INSERT INTO public.applications (id, status, internship_id, review_email, extracted_data, applicant_id, review_token_hash, review_token_expires_at, cv_path) VALUES
 ('00000000-0000-0000-0000-0000000000c1','DRAFT','00000000-0000-0000-0000-0000000000a1','new@x.com','{"email":"new@x.com"}',NULL, public.t_hash('tok-new'), now()+interval '1 hour','cv/new.pdf'),
 ('00000000-0000-0000-0000-0000000000c2','DRAFT','00000000-0000-0000-0000-0000000000a1','mismatch@x.com','{"email":"mismatch@x.com"}',NULL, public.t_hash('tok-mismatch'), now()+interval '1 hour','cv/m.pdf'),
 ('00000000-0000-0000-0000-0000000000c3','DRAFT','00000000-0000-0000-0000-0000000000a1','hr@x.com','{"email":"hr@x.com"}',NULL, public.t_hash('tok-hr'), now()+interval '1 hour','cv/hr.pdf'),
 ('00000000-0000-0000-0000-0000000000c4','DRAFT','00000000-0000-0000-0000-0000000000a1','existing@x.com','{"email":"existing@x.com"}',NULL, public.t_hash('tok-existing-created'), now()+interval '1 hour','cv/e.pdf'),
 ('00000000-0000-0000-0000-0000000000c5','DRAFT','00000000-0000-0000-0000-0000000000a1','victim@x.com','{"email":"victim@x.com"}',NULL, public.t_hash('tok-victim'), now()+interval '1 hour','cv/v.pdf'),
 ('00000000-0000-0000-0000-0000000000c6','DRAFT','00000000-0000-0000-0000-0000000000a1',NULL,'{"email":"Legacy@x.com"}','00000000-0000-0000-0000-0000000000b7', public.t_hash('tok-legacy'), now()+interval '1 hour','cv/l.pdf'),
 ('00000000-0000-0000-0000-0000000000c7','DRAFT','00000000-0000-0000-0000-0000000000a2',NULL,'{"email":"legacy@x.com"}','00000000-0000-0000-0000-0000000000b7', public.t_hash('tok-legacy-intruder'), now()+interval '1 hour','cv/l2.pdf'),
 ('00000000-0000-0000-0000-0000000000c8','DRAFT','00000000-0000-0000-0000-0000000000a1','new@x.com','{"email":"new@x.com"}',NULL, public.t_hash('tok-new-dup'), now()+interval '1 hour','cv/new2.pdf'),
 ('00000000-0000-0000-0000-0000000000c9','DRAFT','00000000-0000-0000-0000-0000000000a2','new@x.com','{"email":"new@x.com"}',NULL, public.t_hash('tok-new-other'), now()+interval '1 hour','cv/new3.pdf'),
 ('00000000-0000-0000-0000-0000000000ca','DRAFT','00000000-0000-0000-0000-0000000000a1','new@x.com','{"email":"new@x.com"}',NULL, public.t_hash('tok-expired'), now()-interval '1 minute','cv/x.pdf'),
 ('00000000-0000-0000-0000-0000000000cb','DRAFT','00000000-0000-0000-0000-0000000000a1','intern@x.com','{"email":"intern@x.com"}',NULL, public.t_hash('tok-intern'), now()+interval '1 hour','cv/i.pdf'),
 ('00000000-0000-0000-0000-0000000000cc','DRAFT','00000000-0000-0000-0000-0000000000a1','unlinked@x.com','{"email":"unlinked@x.com"}',NULL, public.t_hash('tok-unlinked'), now()+interval '1 hour','cv/u.pdf'),
 ('00000000-0000-0000-0000-0000000000cd','DRAFT','00000000-0000-0000-0000-0000000000a1','mentor@x.com','{"email":"mentor@x.com"}',NULL, public.t_hash('tok-mentor'), now()+interval '1 hour','cv/mt.pdf'),
 ('00000000-0000-0000-0000-0000000000ce','DRAFT','00000000-0000-0000-0000-0000000000a1',NULL,NULL,NULL, public.t_hash('tok-noemail'), now()+interval '1 hour','cv/ne.pdf');

-- Permissions -------------------------------------------------------------------
SET ROLE anon;
SELECT public.t_expect_error('P1 anon cannot execute v2', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-new'), '{}'::jsonb, '00000000-0000-0000-0000-000000000001', true)$q$, 'permission denied for function submit_application_review_v2');
RESET ROLE; SET ROLE authenticated;
SELECT public.t_expect_error('P2 authenticated cannot execute v2', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-new'), '{}'::jsonb, '00000000-0000-0000-0000-000000000001', true)$q$, 'permission denied for function submit_application_review_v2');
RESET ROLE; SET ROLE service_role;
SELECT public.t_expect_error('P3 service_role can no longer execute the old function', $q$SELECT * FROM public.submit_application_review_safely(public.t_hash('tok-new'), '{}'::jsonb, NULL)$q$, 'permission denied for function submit_application_review_safely');

-- Input / token validation ------------------------------------------------------
SELECT public.t_expect_error('V1 malformed hash', $q$SELECT * FROM public.submit_application_review_v2('not-a-hash', '{"email":"new@x.com","fullName":"N"}', '00000000-0000-0000-0000-000000000001', true)$q$, 'invalid_review_submission');
SELECT public.t_expect_error('V2 unknown token', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('nope'), '{"email":"new@x.com","fullName":"N"}', '00000000-0000-0000-0000-000000000001', true)$q$, 'application_review_not_found');
SELECT public.t_expect_error('V3 expired token', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-expired'), '{"email":"new@x.com","fullName":"N"}', '00000000-0000-0000-0000-000000000001', true)$q$, 'review_token_expired');
SELECT public.t_expect_error('V4 changed email rejected', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-mismatch'), '{"email":"other@x.com","fullName":"M"}', '00000000-0000-0000-0000-000000000002', true)$q$, 'review_email_mismatch');
SELECT public.t_expect_error('V5 draft without any review email', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-noemail'), '{"email":"x@x.com","fullName":"X"}', '00000000-0000-0000-0000-000000000002', true)$q$, 'review_email_unavailable');

-- Happy path: new account -------------------------------------------------------
SELECT public.t_expect_ok('S1 new account submits', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-new'), '{"email":" NEW@x.com ","fullName":"New Person","phone":"123","skills":["ts"]}', '00000000-0000-0000-0000-000000000001', true)$q$);
SELECT public.t_check('S1 profile created as APPLICANT with review email', EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000001' AND role='APPLICANT' AND email='new@x.com'));
SELECT public.t_check('S1 applicant created and linked', EXISTS (SELECT 1 FROM public.applicants WHERE auth_user_id='00000000-0000-0000-0000-000000000001' AND email='new@x.com' AND phone='123'));
SELECT public.t_check('S1 application NEW, linked, token consumed, review_email stored', EXISTS (SELECT 1 FROM public.applications a JOIN public.applicants p ON p.id=a.applicant_id WHERE a.id='00000000-0000-0000-0000-0000000000c1' AND a.status='NEW' AND a.review_token_used_at IS NOT NULL AND a.review_email='new@x.com' AND a.extracted_data->>'email'='new@x.com' AND p.auth_user_id='00000000-0000-0000-0000-000000000001'));
SELECT public.t_expect_error('S2 token cannot be reused', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-new'), '{"email":"new@x.com","fullName":"New Person"}', '00000000-0000-0000-0000-000000000001', false)$q$, 'review_token_already_used');
SELECT public.t_check('V4 mismatch left no rows behind', NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000002') AND NOT EXISTS (SELECT 1 FROM public.applicants WHERE auth_user_id='00000000-0000-0000-0000-000000000002'));

-- Returning applicant (signed in) -----------------------------------------------
SELECT public.t_expect_error('D1 duplicate application for same internship', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-new-dup'), '{"email":"new@x.com","fullName":"New Person"}', '00000000-0000-0000-0000-000000000001', false)$q$, 'duplicate_application');
SELECT public.t_check('D1 duplicate left the draft unconsumed', EXISTS (SELECT 1 FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c8' AND status='DRAFT' AND review_token_used_at IS NULL));
SELECT public.t_expect_error('A1 existing account cannot be used as "newly created"', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-new-other'), '{"email":"new@x.com","fullName":"New Person"}', '00000000-0000-0000-0000-000000000001', true)$q$, 'review_account_state_conflict');
SELECT public.t_expect_ok('R1 signed-in applicant submits a second internship', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-new-other'), '{"email":"new@x.com","fullName":"New Person Renamed"}', '00000000-0000-0000-0000-000000000001', false)$q$);
SELECT public.t_check('R1 same applicant reused, role and email preserved', (SELECT count(*) FROM public.applicants WHERE auth_user_id='00000000-0000-0000-0000-000000000001')=1 AND EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000001' AND role='APPLICANT' AND email='new@x.com' AND full_name='New Person Renamed'));
SELECT public.t_expect_error('A2 pre-existing profile with "account created" flag', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-existing-created'), '{"email":"existing@x.com","fullName":"E"}', '00000000-0000-0000-0000-000000000004', true)$q$, 'review_account_state_conflict');

-- Staff -------------------------------------------------------------------------
SELECT public.t_expect_error('ST1 HR account refused', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-hr'), '{"email":"hr@x.com","fullName":"HR"}', '00000000-0000-0000-0000-000000000003', false)$q$, 'staff_account_not_eligible');
SELECT public.t_expect_error('ST2 Mentor account refused', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-mentor'), '{"email":"mentor@x.com","fullName":"M"}', '00000000-0000-0000-0000-00000000000b', false)$q$, 'staff_account_not_eligible');
SELECT public.t_check('ST profiles unchanged', (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000003')='HR' AND NOT EXISTS (SELECT 1 FROM public.applicants WHERE auth_user_id='00000000-0000-0000-0000-000000000003'));
SELECT public.t_expect_ok('IN1 INTERN may submit; role preserved', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-intern'), '{"email":"intern@x.com","fullName":"Intern"}', '00000000-0000-0000-0000-000000000009', false)$q$);
SELECT public.t_check('IN1 role still INTERN', (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000009')='INTERN');

-- Identity conflicts ------------------------------------------------------------
SELECT public.t_expect_error('C1 victim email held by attacker applicant row is not relinked', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-victim'), '{"email":"victim@x.com","fullName":"Victim"}', '00000000-0000-0000-0000-000000000006', true)$q$, 'applicant_identity_conflict');
SELECT public.t_check('C1 attacker applicant untouched; no victim profile', (SELECT full_name FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b5')='Attacker' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000006'));
SELECT public.t_expect_error('C2 unlinked applicant with matching email is not silently linked', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-unlinked'), '{"email":"unlinked@x.com","fullName":"U"}', '00000000-0000-0000-0000-00000000000a', true)$q$, 'applicant_identity_conflict');

-- Legacy drafts -----------------------------------------------------------------
SELECT public.t_expect_error('L1 legacy draft refused for a different signed-in account', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-legacy-intruder'), '{"email":"legacy@x.com","fullName":"Intruder"}', '00000000-0000-0000-0000-000000000008', false)$q$, '%conflict%');
SELECT public.t_expect_ok('L2 legacy draft usable by its verified owner', $q$SELECT * FROM public.submit_application_review_v2(public.t_hash('tok-legacy'), '{"email":"legacy@x.com","fullName":"Legacy Owner"}', '00000000-0000-0000-0000-000000000007', false)$q$);
SELECT public.t_check('L2 linked to original applicant; review_email backfilled', EXISTS (SELECT 1 FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c6' AND status='NEW' AND applicant_id='00000000-0000-0000-0000-0000000000b7' AND review_email='legacy@x.com'));
RESET ROLE;

-- Constraint --------------------------------------------------------------------
SELECT public.t_expect_error('K1 non-normalized review_email rejected by constraint', $q$UPDATE public.applications SET review_email=' Mixed@X.com' WHERE id='00000000-0000-0000-0000-0000000000ce'$q$, '%applications_review_email_normalized_check%');
