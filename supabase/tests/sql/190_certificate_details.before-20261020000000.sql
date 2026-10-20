-- Seed for 190_certificate_details.test.sql. Runs after 20261019000000
-- (certificates exist, without the new details) and just before
-- 20261020000000, so the test sees how that migration treats certificates
-- issued earlier. Fictional data only.
--
-- Profiles: HR 01 "Hala HR", 03 "Hadi HR", 0e (no full name; hr3@x.com);
-- Mentors 02 "Mona Mentor", 04 "Majd Mentor", 0f (no full name; m3@x.com);
-- 07 Admin; 0d Applicant; interns 05 (b1), 06 (b2), 08 (b3), 09 (b4),
-- 0a (b5), 0c (b6), 0b (b7).
-- Internships: e1 "Frontend Developer", e2 "Design Track", e3 "Backend Program".
-- Legacy, completed here:
--   fL1 (b1, e1, Mentor Mona, company "Acme Subsidiary"): completed by Hadi HR
--        through complete_intern_placement -> COMPLETION certificate.
--   fL2 (b5, e2, no Mentor): written as COMPLETED without a completion event,
--        start 2026-01-04, completed 2026-03-10 22:30 UTC (2026-03-11 in
--        Asia/Hebron) -> BACKFILL certificate.
-- Active, completed by the test: fA (b2, e1, Mentor Majd, company "Some Other
-- Co", past its end), fB (b3, e1, Mentor Mona, early), fC (b4, e3, Mentor
-- without a name, starts today in Asia/Hebron), fD (b6, e1, Mentor Mona;
-- atomicity), fR (b7, "Other" request "Robotics" linked by HR to e3).

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr1@x.com'),
 ('00000000-0000-0000-0000-000000000003','hr2@x.com'),
 ('00000000-0000-0000-0000-00000000000e','hr3@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000004','m2@x.com'),
 ('00000000-0000-0000-0000-00000000000f','m3@x.com'),
 ('00000000-0000-0000-0000-000000000005','i1@x.com'),
 ('00000000-0000-0000-0000-000000000006','i2@x.com'),
 ('00000000-0000-0000-0000-000000000007','admin@x.com'),
 ('00000000-0000-0000-0000-000000000008','i3@x.com'),
 ('00000000-0000-0000-0000-000000000009','i4@x.com'),
 ('00000000-0000-0000-0000-00000000000a','i5@x.com'),
 ('00000000-0000-0000-0000-00000000000b','i7@x.com'),
 ('00000000-0000-0000-0000-00000000000c','i6@x.com'),
 ('00000000-0000-0000-0000-00000000000d','a1@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','Hala HR','hr1@x.com','HR'),
 ('00000000-0000-0000-0000-000000000003','Hadi HR','hr2@x.com','HR'),
 ('00000000-0000-0000-0000-00000000000e',NULL,'hr3@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mona Mentor','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000004','Majd Mentor','m2@x.com','MENTOR'),
 ('00000000-0000-0000-0000-00000000000f','  ','m3@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern One','i1@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000006','Intern Two','i2@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000007','Admin','admin@x.com','ADMIN'),
 ('00000000-0000-0000-0000-000000000008','Intern Three','i3@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000009','Intern Four','i4@x.com','INTERN'),
 ('00000000-0000-0000-0000-00000000000a','Intern Five','i5@x.com','INTERN'),
 ('00000000-0000-0000-0000-00000000000b','Intern Seven','i7@x.com','INTERN'),
 ('00000000-0000-0000-0000-00000000000c','Intern Six','i6@x.com','INTERN'),
 ('00000000-0000-0000-0000-00000000000d','Applicant One','a1@x.com','APPLICANT');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern One','i1@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Intern Two','i2@x.com','00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-0000000000b3','Intern Three','i3@x.com','00000000-0000-0000-0000-000000000008'),
 ('00000000-0000-0000-0000-0000000000b4','Intern Four','i4@x.com','00000000-0000-0000-0000-000000000009'),
 ('00000000-0000-0000-0000-0000000000b5','Intern Five','i5@x.com','00000000-0000-0000-0000-00000000000a'),
 ('00000000-0000-0000-0000-0000000000b6','Intern Six','i6@x.com','00000000-0000-0000-0000-00000000000c'),
 ('00000000-0000-0000-0000-0000000000b7','Intern Seven','i7@x.com','00000000-0000-0000-0000-00000000000b');
INSERT INTO public.internships (id, title, capacity) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Frontend Developer', 10),
 ('00000000-0000-0000-0000-0000000000e2','Design Track', 10),
 ('00000000-0000-0000-0000-0000000000e3','Backend Program', 10);
-- HR linked the "Other" request "Robotics" to Backend Program (as
-- map_training_request stores it).
INSERT INTO public.training_request_mappings (normalized_label, internship_id, mapped_by) VALUES
 ('robotics','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-000000000001');
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c3','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b3'),
 ('00000000-0000-0000-0000-0000000000c4','SELECTED','00000000-0000-0000-0000-0000000000e3',NULL,'00000000-0000-0000-0000-0000000000b4'),
 ('00000000-0000-0000-0000-0000000000c5','SELECTED','00000000-0000-0000-0000-0000000000e2',NULL,'00000000-0000-0000-0000-0000000000b5'),
 ('00000000-0000-0000-0000-0000000000c6','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b6'),
 ('00000000-0000-0000-0000-0000000000c7','SELECTED',NULL,'  Robotics ','00000000-0000-0000-0000-0000000000b7');

INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-00000000f0a1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme Subsidiary', current_date - 70, current_date - 1, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-00000000f00a','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Some Other Co', current_date - 40, current_date - 1, 'ACTIVE', '00000000-0000-0000-0000-000000000004'),
 ('00000000-0000-0000-0000-00000000f00b','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 10, current_date + 50, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-00000000f00c','00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000b4',
  '00000000-0000-0000-0000-0000000000e3','Acme', (now() AT TIME ZONE 'Asia/Hebron')::date, (now() AT TIME ZONE 'Asia/Hebron')::date + 30,
  'ACTIVE', '00000000-0000-0000-0000-00000000000f'),
 ('00000000-0000-0000-0000-00000000f00d','00000000-0000-0000-0000-0000000000c6','00000000-0000-0000-0000-0000000000b6',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 30, current_date - 1, 'ACTIVE', '00000000-0000-0000-0000-000000000002');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status,
                                      mentor_profile_id, completed_at, ended_early) VALUES
 ('00000000-0000-0000-0000-00000000f0a2','00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000b5',
  '00000000-0000-0000-0000-0000000000e2','Acme', '2026-01-04', '2026-03-10', 'COMPLETED', NULL,
  '2026-03-10 22:30:00+00', false);

-- The "Other" request's placement, created by HR through the portal function
-- (the internship is resolved from the request's link; HR enters no training).
SET ROLE service_role;
SELECT * FROM public.create_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c7',
  'Acme', NULL, current_date, current_date + 60);
RESET ROLE;
UPDATE public.intern_placements SET start_date = current_date - 20, status = 'ACTIVE', mentor_profile_id = '00000000-0000-0000-0000-000000000004'
WHERE application_id = '00000000-0000-0000-0000-0000000000c7';

-- Legacy certificates, issued the way 20261019000000 issues them.
SET ROLE service_role;
SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000f0a1',NULL);
RESET ROLE;
SELECT public.internship_certificate_issue('00000000-0000-0000-0000-00000000f0a2', NULL, 'BACKFILL');

-- What the legacy certificates looked like before 20261020000000.
CREATE TABLE public.t_seed_certs AS
  SELECT c.id, c.placement_id, c.status, c.issue_kind, c.certificate_title, c.issuer_name, c.recipient_name,
         c.training_title, c.completion_date, c.placement_completed_at, c.issued_at, c.issued_by_profile_id
  FROM public.internship_certificates AS c;
