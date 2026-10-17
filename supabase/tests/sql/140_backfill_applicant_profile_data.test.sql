-- Migration 20261017010000: fill-only backfill of applicants.profile_data from
-- the applicant's latest submitted (non-DRAFT) application. The harness has
-- already applied the migration to the empty schema; this test seeds fixtures
-- and runs the real migration file again (\ir), then once more to prove a
-- re-run changes nothing.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','intern@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','Intern','intern@x.com','INTERN');

INSERT INTO public.applicants (id, full_name, email, auth_user_id, profile_data) VALUES
 ('00000000-0000-0000-0000-0000000000b1','A01','a01@x.com','00000000-0000-0000-0000-000000000001', NULL),
 ('00000000-0000-0000-0000-0000000000b2','A02','a02@x.com',NULL,'{}'),
 ('00000000-0000-0000-0000-0000000000b3','A03','a03@x.com',NULL,'{"summary":"Kept"}'),
 ('00000000-0000-0000-0000-0000000000b4','A04','a04@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000b5','A05','a05@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000b6','A06','a06@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000b7','A07','a07@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000b8','A08','a08@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000b9','A09','a09@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000ba','A10','a10@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000bb','A11','a11@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000bc','A12','a12@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000bd','A13','a13@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000be','A14','a14@x.com',NULL,NULL),
 ('00000000-0000-0000-0000-0000000000bf','A15','a15@x.com',NULL,NULL);

-- Each application's summary carries a unique marker so leakage is detectable.
INSERT INTO public.applications (id, applicant_id, status, requested_training, extracted_data, submitted_at, applied_at, created_at) VALUES
 -- b1: NULL profile, one eligible submission (full reviewed data).
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','SELECTED','T01',
  '{"fullName":"A01","email":"a01@x.com","summary":"MARK01","education":[{"institution":"U","degree":"BSc","fieldOfStudy":"CS","startDate":null,"endDate":null}],"experience":[],"skills":["SQL","TypeScript"],"languages":["English"],"certifications":[],"links":{"linkedin":null,"github":"g","portfolio":null}}',
  now() - interval '5 days', now() - interval '6 days', now() - interval '6 days'),
 -- b2 / b3: non-NULL profiles with eligible submissions (must be preserved).
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2','NEW','T02',
  '{"summary":"MARK02","skills":["X"]}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b3','NEW','T03',
  '{"summary":"MARK03","skills":["X"]}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 -- b4: DRAFT only (even with a submitted_at value it is never used).
 ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000b4','DRAFT','T04',
  '{"summary":"MARK04","skills":["X"]}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 -- b5: extracted_data NULL; b6: not an object; b7: object without sections;
 -- b8: sections of the wrong type only.
 ('00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000b5','NEW','T05',
  NULL, now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 ('00000000-0000-0000-0000-0000000000c6','00000000-0000-0000-0000-0000000000b6','NEW','T06',
  '["MARK06"]', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 ('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-0000000000b7','NEW','T07',
  '{"fullName":"A07","email":"a07@x.com"}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 ('00000000-0000-0000-0000-0000000000c8','00000000-0000-0000-0000-0000000000b8','NEW','T08',
  '{"summary":["MARK08"],"education":"text","skills":{"a":1},"links":["x"]}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 -- b9: partly valid: wrong-typed sections become null, valid ones are kept.
 ('00000000-0000-0000-0000-0000000000c9','00000000-0000-0000-0000-0000000000b9','UNDER_REVIEW','T09',
  '{"summary":"MARK09","education":"text","skills":["SQL"]}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 -- ba: older and newer submissions plus a newer DRAFT: the newer submission wins.
 ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-0000000000ba','NEW','T10a',
  '{"summary":"MARK10-OLD"}', now() - interval '3 days', now() - interval '4 days', now() - interval '4 days'),
 ('00000000-0000-0000-0000-0000000000cb','00000000-0000-0000-0000-0000000000ba','NEW','T10b',
  '{"summary":"MARK10-NEW"}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 ('00000000-0000-0000-0000-0000000000cc','00000000-0000-0000-0000-0000000000ba','DRAFT','T10c',
  '{"summary":"MARK10-DRAFT"}', NULL, now(), now()),
 -- bb: identical submitted_at and created_at: the higher id wins.
 ('00000000-0000-0000-0000-0000000000cd','00000000-0000-0000-0000-0000000000bb','NEW','T11a',
  '{"summary":"MARK11-LOW-ID"}', '2026-10-01 10:00:00+00', '2026-10-01 09:00:00+00', '2026-10-01 09:00:00+00'),
 ('00000000-0000-0000-0000-0000000000ce','00000000-0000-0000-0000-0000000000bb','NEW','T11b',
  '{"summary":"MARK11-HIGH-ID"}', '2026-10-01 10:00:00+00', '2026-10-01 09:00:00+00', '2026-10-01 09:00:00+00'),
 -- bc: the newest submission is invalid, so the latest *eligible* one is used.
 ('00000000-0000-0000-0000-0000000000cf','00000000-0000-0000-0000-0000000000bc','NEW','T12a',
  '{"summary":"MARK12-VALID"}', now() - interval '3 days', now() - interval '4 days', now() - interval '4 days'),
 ('00000000-0000-0000-0000-0000000000d0','00000000-0000-0000-0000-0000000000bc','NEW','T12b',
  NULL, now() - interval '1 day', now() - interval '2 days', now() - interval '2 days'),
 -- bd: non-DRAFT but no recorded submission time: not eligible.
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000bd','NEW','T13',
  '{"summary":"MARK13"}', NULL, now() - interval '2 days', now() - interval '2 days'),
 -- An application without an applicant: never copied to anyone.
 ('00000000-0000-0000-0000-0000000000d2',NULL,'NEW','T15',
  '{"summary":"MARK15-ORPHAN"}', now() - interval '1 day', now() - interval '2 days', now() - interval '2 days');
-- be has no applications at all.

-- bf: identical submitted_at, different created_at. The later-created
-- application has the LOWER id, so only the created_at tie-breaker (not the
-- final id DESC) can make it win.
INSERT INTO public.applications (id, applicant_id, status, requested_training, extracted_data, submitted_at, applied_at, created_at) VALUES
 ('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000bf','NEW','T16a',
  '{"summary":"MARK16-LATER-CREATED","skills":["Later"]}', '2026-10-02 10:00:00+00', '2026-10-02 09:30:00+00', '2026-10-02 09:30:00+00'),
 ('00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000bf','NEW','T16b',
  '{"summary":"MARK16-EARLIER-CREATED","skills":["Earlier"]}', '2026-10-02 10:00:00+00', '2026-10-02 09:00:00+00', '2026-10-02 09:00:00+00');

CREATE TEMP TABLE t_before AS
SELECT
  (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.applications x) AS applications,
  (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.profiles x) AS profiles,
  (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM auth.users x) AS users,
  (SELECT md5(string_agg((to_jsonb(x) - 'profile_data')::text, '|' ORDER BY x.id)) FROM public.applicants x) AS applicant_other_columns,
  (SELECT count(*) FROM public.applicants) AS applicant_count;

-- Run the real migration against the fixtures.
\ir ../../migrations/20261017010000_backfill_applicant_profile_data.sql

-- Population ------------------------------------------------------------------------------------
SELECT public.t_check('F1 NULL profile + eligible submission: filled with the seven reviewed sections',
  (SELECT profile_data FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b1') =
  '{"summary":"MARK01","education":[{"institution":"U","degree":"BSc","fieldOfStudy":"CS","startDate":null,"endDate":null}],"experience":[],"skills":["SQL","TypeScript"],"languages":["English"],"certifications":[],"links":{"linkedin":null,"github":"g","portfolio":null}}'::jsonb);
SELECT public.t_check('F2 identity fields (fullName, email) are not copied into profile_data',
  NOT ((SELECT profile_data FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b1') ?| ARRAY['fullName','email','phone','location']));
SELECT public.t_check('F3 wrong-typed sections become null, valid ones are kept',
  (SELECT profile_data FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b9') =
  '{"summary":"MARK09","education":null,"experience":null,"skills":["SQL"],"languages":null,"certifications":null,"links":null}'::jsonb);

-- Preservation ----------------------------------------------------------------------------------
SELECT public.t_check('N1 an existing empty object is preserved exactly',
  (SELECT profile_data FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b2') = '{}'::jsonb);
SELECT public.t_check('N2 an existing incomplete profile is preserved exactly',
  (SELECT profile_data FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b3') = '{"summary":"Kept"}'::jsonb);

-- Ineligible sources ----------------------------------------------------------------------------
SELECT public.t_check('D1 a DRAFT-only applicant stays NULL',
  (SELECT profile_data IS NULL FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b4'));
SELECT public.t_check('I1 extracted_data NULL, not an object, without sections, or wrongly typed: stays NULL',
  (SELECT bool_and(profile_data IS NULL) FROM public.applicants WHERE id IN (
    '00000000-0000-0000-0000-0000000000b5','00000000-0000-0000-0000-0000000000b6',
    '00000000-0000-0000-0000-0000000000b7','00000000-0000-0000-0000-0000000000b8')));
SELECT public.t_check('I2 a non-DRAFT application without submitted_at is not used',
  (SELECT profile_data IS NULL FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000bd'));
SELECT public.t_check('I3 an applicant without applications stays NULL',
  (SELECT profile_data IS NULL FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000be'));

-- Selection -------------------------------------------------------------------------------------
SELECT public.t_check('S1 the latest submission wins (older submission and newer DRAFT ignored)',
  (SELECT profile_data->>'summary' FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000ba') = 'MARK10-NEW');
SELECT public.t_check('S2 equal timestamps: the higher application id wins deterministically',
  (SELECT profile_data->>'summary' FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000bb') = 'MARK11-HIGH-ID');
SELECT public.t_check('S3 an invalid newest submission falls back to the latest eligible one',
  (SELECT profile_data->>'summary' FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000bc') = 'MARK12-VALID');
SELECT public.t_check('S4 fixture isolates created_at: same submitted_at, the later-created row has the lower id',
  (SELECT count(DISTINCT submitted_at) = 1 FROM public.applications WHERE applicant_id='00000000-0000-0000-0000-0000000000bf')
  AND (SELECT created_at > (SELECT created_at FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000d6')
       FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000d5')
  AND '00000000-0000-0000-0000-0000000000d5'::uuid < '00000000-0000-0000-0000-0000000000d6'::uuid);
SELECT public.t_check('S4 equal submitted_at: the later created_at wins over the higher id',
  (SELECT profile_data FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000bf') =
  '{"summary":"MARK16-LATER-CREATED","education":null,"experience":null,"skills":["Later"],"languages":null,"certifications":null,"links":null}'::jsonb);

-- Linkage ----------------------------------------------------------------------------------------
SELECT public.t_check('L1 exactly the expected applicants were filled',
  (SELECT array_agg(full_name ORDER BY full_name) FROM public.applicants
   WHERE profile_data IS NOT NULL AND id NOT IN ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3'))
  = ARRAY['A01','A09','A10','A11','A12','A15']);
SELECT public.t_check('L2 every filled profile comes from that applicant''s own application (no cross-applicant data)',
  NOT EXISTS (
    SELECT 1 FROM public.applicants a
    WHERE a.profile_data ? 'summary' AND a.profile_data->>'summary' LIKE 'MARK%'
      AND NOT EXISTS (SELECT 1 FROM public.applications x
                      WHERE x.applicant_id = a.id AND x.extracted_data->>'summary' = a.profile_data->>'summary')));
SELECT public.t_check('L3 drafts, ineligible rows and the applicant-less application leaked nowhere',
  NOT EXISTS (SELECT 1 FROM public.applicants WHERE profile_data->>'summary' IN
    ('MARK04','MARK10-OLD','MARK10-DRAFT','MARK11-LOW-ID','MARK13','MARK15-ORPHAN','MARK16-EARLIER-CREATED')));

-- Nothing else changed -----------------------------------------------------------------------------
SELECT public.t_check('U1 applications, profiles, auth users and other applicant columns are unchanged',
  (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.applications x) = (SELECT applications FROM t_before)
  AND (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.profiles x) = (SELECT profiles FROM t_before)
  AND (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM auth.users x) = (SELECT users FROM t_before)
  AND (SELECT md5(string_agg((to_jsonb(x) - 'profile_data')::text, '|' ORDER BY x.id)) FROM public.applicants x) = (SELECT applicant_other_columns FROM t_before)
  AND (SELECT count(*) FROM public.applicants) = (SELECT applicant_count FROM t_before));

-- Re-run --------------------------------------------------------------------------------------------
CREATE TEMP TABLE t_after_first AS
SELECT (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.applicants x) AS applicants,
       (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.applications x) AS applications;

-- A new submission after the backfill must not overwrite the filled profile on a re-run.
INSERT INTO public.applications (id, applicant_id, status, requested_training, extracted_data, submitted_at, applied_at, created_at) VALUES
 ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000b1','NEW','T01-later',
  '{"summary":"MARK01-LATER"}', now(), now(), now());
UPDATE t_after_first SET applications =
  (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.applications x);

\ir ../../migrations/20261017010000_backfill_applicant_profile_data.sql

SELECT public.t_check('R1 re-running changes nothing, even with a newer submission available',
  (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.applicants x) = (SELECT applicants FROM t_after_first)
  AND (SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) FROM public.applications x) = (SELECT applications FROM t_after_first)
  AND (SELECT profile_data->>'summary' FROM public.applicants WHERE id='00000000-0000-0000-0000-0000000000b1') = 'MARK01');

-- Privileges are untouched: browser roles still cannot read applicant data.
SET ROLE anon;
SELECT public.t_expect_error('P1 anon still cannot read applicants',
  $q$SELECT count(*) FROM public.applicants$q$, 'permission denied for table applicants');
RESET ROLE;
