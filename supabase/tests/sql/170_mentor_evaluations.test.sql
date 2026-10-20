-- Migration 20261018010000: Mentor evaluations (draft, explicit publication,
-- revisions, metadata-only events, Mentor/intern access, completion read-only).
--
-- Profiles: 01 HR, 02 Mentor One, 03 Mentor Two, 04 Mentor Three, 05 Intern One,
-- 06 Intern Two, 07 Admin, 08 Mentor Off (inactive).
-- Placements: f3 ACTIVE (Intern One, Mentor Three, ended yesterday), f1
-- SCHEDULED (Intern One, Mentor One; activated later), f4 CANCELLED (Mentor One).

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000003','m2@x.com'),
 ('00000000-0000-0000-0000-000000000004','m3@x.com'),
 ('00000000-0000-0000-0000-000000000005','i1@x.com'),
 ('00000000-0000-0000-0000-000000000006','i2@x.com'),
 ('00000000-0000-0000-0000-000000000007','admin@x.com'),
 ('00000000-0000-0000-0000-000000000008','moff@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000003','Mentor Two','m2@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000004','Mentor Three','m3@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern One','i1@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000006','Intern Two','i2@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000007','Admin','admin@x.com','ADMIN'),
 ('00000000-0000-0000-0000-000000000008','Mentor Off','moff@x.com','MENTOR');
UPDATE public.profiles SET is_active = false, deactivated_at = now() WHERE id = '00000000-0000-0000-0000-000000000008';
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern One','i1@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Intern Two','i2@x.com','00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-0000000000b4','Withdrawn','w@x.com',NULL);
INSERT INTO public.internships (id, title, capacity, selection_status) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 10, 'OPEN'),
 ('00000000-0000-0000-0000-0000000000e2','Design', 10, 'OPEN');
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c3','SELECTED','00000000-0000-0000-0000-0000000000e2',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c4','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b4');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e2','Acme', current_date - 60, current_date - 1, 'ACTIVE', '00000000-0000-0000-0000-000000000004'),
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 10, current_date + 30, 'SCHEDULED', '00000000-0000-0000-0000-000000000002');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id, cancelled_at, cancellation_reason) VALUES
 ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000b4',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date, current_date + 30, 'CANCELLED', '00000000-0000-0000-0000-000000000002', now(), 'Withdrew');

-- The n-th evaluation (by creation) of a placement.
CREATE FUNCTION public.t_ev(p_placement uuid, p_n integer) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT e.id FROM public.intern_evaluations AS e WHERE e.placement_id = p_placement
  ORDER BY e.created_at, e.id OFFSET p_n - 1 LIMIT 1
$$;

-- Privileges -----------------------------------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 browsers cannot call Mentor evaluation functions',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000f3', gen_random_uuid(),'x')$q$,
  'permission denied for function create_mentor_evaluation');
SELECT public.t_expect_error('P2 browsers cannot read evaluations',
  $q$SELECT * FROM public.intern_evaluations$q$, 'permission denied for table intern_evaluations');
SELECT public.t_expect_error('P3 browsers cannot read evaluation events',
  $q$SELECT * FROM public.intern_evaluation_events$q$, 'permission denied for table intern_evaluation_events');
RESET ROLE; SET ROLE anon;
SELECT public.t_expect_error('P4 anon cannot call intern evaluation functions',
  $q$SELECT * FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000005')$q$,
  'permission denied for function list_my_evaluations');
RESET ROLE;
SELECT public.t_check('P5 service_role has only the minimum table privileges',
  has_table_privilege('service_role','public.intern_evaluations','SELECT')
  AND has_table_privilege('service_role','public.intern_evaluations','INSERT')
  AND NOT has_table_privilege('service_role','public.intern_evaluations','UPDATE')
  AND has_column_privilege('service_role','public.intern_evaluations','content','UPDATE')
  AND NOT has_column_privilege('service_role','public.intern_evaluations','author_profile_id','UPDATE')
  AND NOT has_column_privilege('service_role','public.intern_evaluations','placement_id','UPDATE')
  AND NOT has_column_privilege('service_role','public.intern_evaluations','created_at','UPDATE')
  AND NOT has_table_privilege('service_role','public.intern_evaluations','DELETE')
  AND NOT has_table_privilege('service_role','public.intern_evaluations','TRUNCATE')
  AND has_table_privilege('service_role','public.intern_evaluation_events','SELECT')
  AND has_table_privilege('service_role','public.intern_evaluation_events','INSERT')
  AND NOT has_table_privilege('service_role','public.intern_evaluation_events','UPDATE')
  AND NOT has_table_privilege('service_role','public.intern_evaluation_events','DELETE')
  AND NOT has_table_privilege('service_role','public.intern_evaluation_events','TRUNCATE'));
SELECT public.t_check('P6 no evaluation function is executable by browser roles',
  NOT EXISTS (SELECT 1 FROM pg_proc AS p
              WHERE p.pronamespace = 'public'::regnamespace
                AND (p.proname LIKE '%evaluation%' OR p.proname = 'portal_text_is_blank')
                AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))));
SELECT public.t_check('P7 events hold metadata only (no text columns)',
  (SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'intern_evaluation_events')
  = ARRAY['id','evaluation_id','placement_id','event_type','revision','actor_profile_id','created_at']);
SELECT public.t_check('P8 HR and admin functions expose nothing about evaluations',
  pg_get_function_result('public.list_hr_intern_progress(uuid)'::regprocedure) NOT LIKE '%evaluation%'
  AND NOT EXISTS (SELECT 1 FROM pg_proc AS p WHERE p.pronamespace = 'public'::regnamespace
                    AND (p.proname LIKE 'hr\_%' OR p.proname LIKE 'admin\_%' OR p.proname LIKE '%\_hr\_%')
                    AND p.prosrc ~ 'intern_evaluation'));

SET ROLE service_role;

-- Access refusals -------------------------------------------------------------------------------------
SELECT public.t_expect_sqlstate('A1 HR is refused',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('A2 ADMIN is refused',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000f3')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('A3 an intern cannot use Mentor functions',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000f3', gen_random_uuid(),'x')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('A4 an inactive Mentor is refused',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-0000000000f3')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('A5 an unknown profile is refused',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000f3')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('A6 a Mentor not assigned to the placement cannot list it',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f3')$q$,
  'PZE02', 'placement_not_found');
SELECT public.t_expect_sqlstate('A7 … or write on it',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f3', gen_random_uuid(),'x')$q$,
  'PZE02', 'placement_not_found');
SELECT public.t_expect_sqlstate('A8 no evaluation on a SCHEDULED placement',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1', gen_random_uuid(),'x')$q$,
  'PZE04', 'placement_not_active');
SELECT public.t_expect_sqlstate('A9 a SCHEDULED placement is not readable here',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1')$q$,
  'PZE04', 'placement_not_active');
SELECT public.t_expect_sqlstate('A10 nor a CANCELLED one',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f4')$q$,
  'PZE04', 'placement_not_active');
SELECT public.t_expect_sqlstate('A11 an unknown placement looks the same as an unassigned one',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000ff')$q$,
  'PZE02', 'placement_not_found');
SELECT public.t_expect_sqlstate('A12 HR cannot use the intern functions',
  $q$SELECT * FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000001')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('A13 a Mentor cannot use the intern functions',
  $q$SELECT * FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000004')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_check('A14 refusals wrote nothing', NOT EXISTS (SELECT 1 FROM public.intern_evaluations));

-- Exact text, publication, completion (f3, Mentor Three) ------------------------------------------------
SELECT public.t_expect_ok('B1 Mentor Three creates a draft with mixed text',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000f3', gen_random_uuid(),
       E'  Línea uno\r\nسطر عربي 😀\n\tend  ')$q$);
SELECT public.t_check('B2 the text is stored exactly as sent (no trim or normalization)',
  (SELECT content = E'  Línea uno\r\nسطر عربي 😀\n\tend  ' AND status = 'DRAFT' AND revision = 1
          AND author_profile_id = '00000000-0000-0000-0000-000000000004'
          AND updated_by_profile_id = '00000000-0000-0000-0000-000000000004' AND published_content IS NULL
   FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f3', 1)));
SELECT public.t_check('B3 one CREATED event at revision 1',
  (SELECT array_agg(event_type || ':' || revision || ':' || actor_profile_id) FROM public.intern_evaluation_events
   WHERE evaluation_id = public.t_ev('00000000-0000-0000-0000-0000000000f3', 1))
  = ARRAY['CREATED:1:00000000-0000-0000-0000-000000000004']);
SELECT public.t_expect_ok('B4 publish revision 1',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000004',
       public.t_ev('00000000-0000-0000-0000-0000000000f3', 1), 1)$q$);
SELECT public.t_check('B5 published: revision 2, snapshot = saved text, publisher and first publication recorded',
  (SELECT status = 'PUBLISHED' AND revision = 2 AND published_revision = 2 AND published_content = content
          AND published_by_profile_id = '00000000-0000-0000-0000-000000000004'
          AND first_published_at = published_at
   FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f3', 1)));
SELECT public.t_expect_ok('B6 a second, private draft',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000f3', gen_random_uuid(),'Private draft on f3')$q$);
SELECT public.t_check('B7 the intern sees only the published snapshot',
  (SELECT array_agg(content) FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000005'))
  = ARRAY[E'  Línea uno\r\nسطر عربي 😀\n\tend  ']);

SELECT public.t_expect_ok('C1 HR completes f3 although a draft exists (drafts never block completion)',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3',NULL)$q$);
SELECT public.t_check('C2 completion published and deleted nothing',
  (SELECT count(*) FROM public.intern_evaluations WHERE placement_id = '00000000-0000-0000-0000-0000000000f3') = 2
  AND (SELECT status = 'DRAFT' AND content = 'Private draft on f3' AND published_content IS NULL AND revision = 1
       FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f3', 2))
  AND (SELECT count(*) FROM public.intern_evaluation_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f3') = 3);
SELECT public.t_check('C3 the assigned Mentor still reads both, labelled for a completed placement',
  (SELECT array_agg(placement_status || ':' || publication_state ORDER BY created_at)
   FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000f3'))
  = ARRAY['COMPLETED:PUBLISHED','COMPLETED:DRAFT']);
SELECT public.t_expect_sqlstate('C4 no save after completion',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000004',
       public.t_ev('00000000-0000-0000-0000-0000000000f3', 2), 1, 'Late edit')$q$, 'PZE04', 'placement_not_active');
SELECT public.t_expect_sqlstate('C5 no publish after completion',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000004',
       public.t_ev('00000000-0000-0000-0000-0000000000f3', 2), 1)$q$, 'PZE04', 'placement_not_active');
SELECT public.t_expect_sqlstate('C6 no new evaluation after completion',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000f3', gen_random_uuid(),'x')$q$,
  'PZE04', 'placement_not_active');
SELECT public.t_check('C7 the intern still sees the published snapshot of the completed placement',
  (SELECT count(*) FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000005')) = 1);
SELECT public.t_check('C8 refused writes changed nothing',
  (SELECT content = 'Private draft on f3' AND revision = 1 FROM public.intern_evaluations
   WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f3', 2))
  AND (SELECT count(*) FROM public.intern_evaluation_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f3') = 3);

-- Deactivation and demotion (Mentor Three now has no open placement) -------------------------------------
SELECT public.t_expect_ok('D1 the admin deactivates Mentor Three',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000004',false,'Left the company')$q$);
SELECT public.t_expect_sqlstate('D2 a deactivated Mentor loses access to historical evaluations',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000f3')$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_sqlstate('D3 … including a single evaluation',
  $q$SELECT * FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000004', public.t_ev('00000000-0000-0000-0000-0000000000f3', 1))$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_expect_ok('D4 reactivated',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000004',true,NULL)$q$);
SELECT public.t_check('D5 a reactivated Mentor reads them again',
  (SELECT count(*) FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000f3')) = 2);
SELECT public.t_expect_ok('D6 the admin demotes Mentor Three to HR',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000004','HR',NULL)$q$);
SELECT public.t_expect_sqlstate('D7 a demoted Mentor loses access',
  $q$SELECT * FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000004', public.t_ev('00000000-0000-0000-0000-0000000000f3', 1))$q$,
  'PZE01', 'evaluation_access_denied');
SELECT public.t_check('D8 the intern keeps the published snapshot',
  (SELECT count(*) FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000005')) = 1);

-- Revision and publication sequence (f1, Mentor One) -------------------------------------------------------
RESET ROLE;
UPDATE public.intern_placements SET status = 'ACTIVE' WHERE id = '00000000-0000-0000-0000-0000000000f1';
SET ROLE service_role;

SELECT public.t_expect_ok('E1 an empty draft is allowed',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1', gen_random_uuid(),'')$q$);
SELECT public.t_expect_sqlstate('E2 an empty draft cannot be published',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 1)$q$,
  'PZE09', 'evaluation_content_required');
SELECT public.t_expect_ok('E3 save whitespace only (revision 2)',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 1, E'   \n\t ')$q$);
SELECT public.t_expect_sqlstate('E4 blank text cannot be published',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 2)$q$,
  'PZE09', 'evaluation_content_required');
SELECT public.t_expect_ok('E5 save real text (revision 3)',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 2, 'First text')$q$);
SELECT public.t_expect_ok('E6 an unchanged save is accepted',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 3, 'First text')$q$);
SELECT public.t_check('E6 … and records nothing (still revision 3, three events)',
  (SELECT revision FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)) = 3
  AND (SELECT count(*) FROM public.intern_evaluation_events WHERE evaluation_id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)) = 3);
SELECT public.t_expect_sqlstate('E7 a stale save is refused',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 1, 'Stale')$q$,
  'PZE05', 'evaluation_revision_conflict');
SELECT public.t_expect_ok('E8 publish revision 3 (revision 4)',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 3)$q$);
SELECT public.t_check('E8 snapshot = First text at revision 4',
  (SELECT status = 'PUBLISHED' AND revision = 4 AND published_revision = 4 AND published_content = 'First text'
   FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)));
SELECT public.t_expect_sqlstate('E9 nothing new to publish',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 4)$q$,
  'PZE06', 'evaluation_nothing_to_publish');
SELECT public.t_expect_ok('E10 save after publication (revision 5)',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 4, 'Second text')$q$);
SELECT public.t_check('E10 unpublished changes; the snapshot did not move',
  (SELECT publication_state = 'UNPUBLISHED_CHANGES' AND content = 'Second text' AND published_content = 'First text'
          AND revision = 5 AND published_revision = 4
   FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1))));
SELECT public.t_check('E11 the intern still sees First text',
  (SELECT content FROM public.get_my_evaluation('00000000-0000-0000-0000-000000000005', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)))
  = 'First text');
SELECT public.t_expect_ok('E12 restore the published text (revision 6)',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 5, 'First text')$q$);
SELECT public.t_check('E12 state is PUBLISHED again (text equals the snapshot)',
  (SELECT publication_state FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)))
  = 'PUBLISHED');
SELECT public.t_expect_sqlstate('E13 so there is nothing to publish',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 6)$q$,
  'PZE06', 'evaluation_nothing_to_publish');
SELECT public.t_expect_ok('E14 save Third text (revision 7)',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 6, 'Third text')$q$);
SELECT public.t_expect_sqlstate('E15 a stale publish is refused',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 6)$q$,
  'PZE05', 'evaluation_revision_conflict');
SELECT public.t_expect_ok('E16 republish (revision 8)',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 7)$q$);
SELECT public.t_check('E16 snapshot = Third text at revision 8; first publication time kept',
  (SELECT published_content = 'Third text' AND published_revision = 8 AND revision = 8 AND first_published_at < published_at
   FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)));
SELECT public.t_check('E17 exactly one event per revision, in order, all by Mentor One',
  (SELECT array_agg(event_type || ':' || revision ORDER BY revision) FROM public.intern_evaluation_events
   WHERE evaluation_id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1))
  = ARRAY['CREATED:1','UPDATED:2','UPDATED:3','PUBLISHED:4','UPDATED:5','UPDATED:6','UPDATED:7','PUBLISHED:8']
  AND (SELECT bool_and(actor_profile_id = '00000000-0000-0000-0000-000000000002') FROM public.intern_evaluation_events
       WHERE evaluation_id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)));
DO $do$
DECLARE
  v_detail text;
BEGIN
  PERFORM * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002',
    public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 2, 'Stale again');
  INSERT INTO public.t_results(label, ok, detail) VALUES ('E18 a conflict reports the current revision', false, 'no error');
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  INSERT INTO public.t_results(label, ok, detail)
  VALUES ('E18 a conflict reports the current revision',
          SQLSTATE = 'PZE05' AND (v_detail::json ->> 'currentRevision')::integer = 8, SQLSTATE || ' ' || coalesce(v_detail, ''));
END
$do$;

-- Limits (code points), characters ------------------------------------------------------------------------
SELECT public.t_expect_ok('F1 40,000 emoji (surrogate pairs in JavaScript) are accepted',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1', gen_random_uuid(), repeat('😀', 40000))$q$);
SELECT public.t_check('F1 stored as 40,000 code points',
  (SELECT char_length(content) = 40000 AND octet_length(content) = 160000 FROM public.intern_evaluations
   WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 2)));
SELECT public.t_expect_sqlstate('F2 40,001 code points are refused',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 1, repeat('😀', 40001))$q$,
  'PZE07', 'evaluation_content_too_long');
SELECT public.t_expect_ok('F3 40,000 Arabic letters are accepted',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 1, repeat('ب', 40000))$q$);
SELECT public.t_expect_ok('F4 combining marks count as code points: 20,000 × (e + U+0301) = 40,000',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 2, repeat('e' || chr(769), 20000))$q$);
SELECT public.t_expect_sqlstate('F5 … and one more code point is refused',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 3, repeat('e' || chr(769), 20000) || 'x')$q$,
  'PZE07', 'evaluation_content_too_long');
SELECT public.t_expect_sqlstate('F6 a C0 control character is refused',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 3, 'bell' || chr(7))$q$,
  'PZE08', 'evaluation_content_invalid_characters');
SELECT public.t_expect_sqlstate('F7 DEL is refused',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 3, 'del' || chr(127))$q$,
  'PZE08', 'evaluation_content_invalid_characters');
SELECT public.t_expect_sqlstate('F8 a C1 control character is refused',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 3, 'nel' || chr(133))$q$,
  'PZE08', 'evaluation_content_invalid_characters');
SELECT public.t_expect_sqlstate('F9 NULL is refused',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 3, NULL)$q$,
  'PZE08', 'evaluation_content_invalid_characters');
SELECT public.t_expect_ok('F10 tab, LF and CR are allowed',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 3, E'a\tb\r\nc\n')$q$);
SELECT public.t_check('F11 refused saves left the text and revision unchanged',
  (SELECT content = E'a\tb\r\nc\n' AND revision = 4 FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 2))
  AND (SELECT count(*) FROM public.intern_evaluation_events WHERE evaluation_id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 2)) = 4);

-- Intern access -------------------------------------------------------------------------------------------
SELECT public.t_check('G1 the intern lists published snapshots of both own placements, never drafts or working text',
  (SELECT array_agg(placement_status || ':' || left(content, 12) ORDER BY placement_status)
   FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000005'))
  = ARRAY['ACTIVE:Third text', 'COMPLETED:' || left(E'  Línea uno\r\nسطر عربي 😀\n\tend  ', 12)]);
SELECT public.t_expect_sqlstate('G2 a draft is not found for the intern',
  $q$SELECT * FROM public.get_my_evaluation('00000000-0000-0000-0000-000000000005', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2))$q$,
  'PZE03', 'evaluation_not_found');
SELECT public.t_expect_sqlstate('G3 nor the private draft of the completed placement',
  $q$SELECT * FROM public.get_my_evaluation('00000000-0000-0000-0000-000000000005', public.t_ev('00000000-0000-0000-0000-0000000000f3', 2))$q$,
  'PZE03', 'evaluation_not_found');
SELECT public.t_expect_sqlstate('G4 another intern cannot read it',
  $q$SELECT * FROM public.get_my_evaluation('00000000-0000-0000-0000-000000000006', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1))$q$,
  'PZE03', 'evaluation_not_found');
SELECT public.t_check('G5 another intern lists nothing',
  NOT EXISTS (SELECT 1 FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000006')));
SELECT public.t_check('G6 intern results carry no working text, revision or state',
  pg_get_function_result('public.list_my_evaluations(uuid)'::regprocedure) NOT LIKE '%revision%'
  AND pg_get_function_result('public.list_my_evaluations(uuid)'::regprocedure) NOT LIKE '%publication_state%'
  AND pg_get_function_result('public.list_my_evaluations(uuid)'::regprocedure) NOT LIKE '%published_content%');
RESET ROLE;
UPDATE public.profiles SET is_active = false, deactivated_at = now() WHERE id = '00000000-0000-0000-0000-000000000005';
SET ROLE service_role;
SELECT public.t_expect_sqlstate('G7 a deactivated intern is refused',
  $q$SELECT * FROM public.list_my_evaluations('00000000-0000-0000-0000-000000000005')$q$, 'PZE01', 'evaluation_access_denied');
RESET ROLE;
UPDATE public.profiles SET is_active = true, deactivated_at = NULL WHERE id = '00000000-0000-0000-0000-000000000005';
SET ROLE service_role;

-- Reassignment: the former Mentor loses access; the author never changes ------------------------------------
SELECT public.t_expect_sqlstate('H0 another Mentor cannot read before reassignment',
  $q$SELECT * FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000003', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1))$q$,
  'PZE03', 'evaluation_not_found');
SELECT public.t_expect_ok('H1 HR reassigns f1 to Mentor Two',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000003')$q$);
SELECT public.t_expect_sqlstate('H2 the former Mentor cannot list',
  $q$SELECT * FROM public.list_mentor_evaluations('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1')$q$,
  'PZE02', 'placement_not_found');
SELECT public.t_expect_sqlstate('H3 … read',
  $q$SELECT * FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1))$q$,
  'PZE03', 'evaluation_not_found');
SELECT public.t_expect_sqlstate('H4 … save',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 8, 'x')$q$,
  'PZE03', 'evaluation_not_found');
SELECT public.t_expect_sqlstate('H5 … or publish',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000002', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 8)$q$,
  'PZE03', 'evaluation_not_found');
SELECT public.t_expect_ok('H6 the new Mentor saves (revision 9)',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000003', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 8, 'Fourth text')$q$);
SELECT public.t_expect_ok('H7 and publishes (revision 10)',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000003', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 9)$q$);
SELECT public.t_check('H8 author unchanged, last editor and publisher are the new Mentor',
  (SELECT author_profile_id = '00000000-0000-0000-0000-000000000002'
          AND updated_by_profile_id = '00000000-0000-0000-0000-000000000003'
          AND published_by_profile_id = '00000000-0000-0000-0000-000000000003' AND revision = 10
   FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1))
  AND (SELECT author_name = 'Mentor One' AND last_editor_name = 'Mentor Two' AND published_by_current_user
       FROM public.get_mentor_evaluation('00000000-0000-0000-0000-000000000003', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1))));
RESET ROLE;

-- Direct writes cannot break the invariants (owner role) ------------------------------------------------
SELECT public.t_expect_sqlstate('I1 a change without a new revision is refused',
  $q$UPDATE public.intern_evaluations SET content = 'x' WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)$q$, 'PZE10');
SELECT public.t_expect_sqlstate('I2 a revision jump is refused',
  $q$UPDATE public.intern_evaluations SET content = 'x', revision = revision + 2 WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)$q$, 'PZE10');
SELECT public.t_expect_sqlstate('I3 the author cannot change',
  $q$UPDATE public.intern_evaluations SET author_profile_id = '00000000-0000-0000-0000-000000000003', revision = revision + 1
     WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)$q$, 'PZE10');
SELECT public.t_expect_sqlstate('I4 the placement cannot change',
  $q$UPDATE public.intern_evaluations SET placement_id = '00000000-0000-0000-0000-0000000000f3', revision = revision + 1
     WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)$q$, 'PZE10');
SELECT public.t_expect_sqlstate('I5 no unpublish',
  $q$UPDATE public.intern_evaluations SET status = 'DRAFT', published_content = NULL, published_revision = NULL, published_at = NULL,
       published_by_profile_id = NULL, first_published_at = NULL, revision = revision + 1
     WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)$q$, 'PZE10');
SELECT public.t_expect_sqlstate('I6 a save cannot change the snapshot',
  $q$UPDATE public.intern_evaluations SET published_content = 'Forged', revision = revision + 1
     WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)$q$, 'PZE10');
SELECT public.t_expect_sqlstate('I7 a publish must snapshot the unchanged saved text',
  $q$UPDATE public.intern_evaluations SET content = 'Other', published_content = 'Other', published_revision = revision + 1,
       revision = revision + 1 WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1)$q$, 'PZE10');
SELECT public.t_expect_sqlstate('I8 a new evaluation must start as a revision-1 draft',
  $q$INSERT INTO public.intern_evaluations (placement_id, author_profile_id, updated_by_profile_id, content, revision)
     VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','x',2)$q$, 'PZE10');
SELECT public.t_expect_sqlstate('I9 the length limit is also a table constraint',
  $q$INSERT INTO public.intern_evaluations (placement_id, author_profile_id, updated_by_profile_id, content)
     VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003', repeat('a', 40001))$q$, '23514');
SELECT public.t_expect_sqlstate('I10 an UPDATED event cannot claim revision 1',
  $q$INSERT INTO public.intern_evaluation_events (evaluation_id, placement_id, event_type, revision, actor_profile_id)
     VALUES (public.t_ev('00000000-0000-0000-0000-0000000000f1', 1),'00000000-0000-0000-0000-0000000000f1','UPDATED',1,'00000000-0000-0000-0000-000000000003')$q$, '23514');
SELECT public.t_expect_sqlstate('I11 two events cannot share a revision',
  $q$INSERT INTO public.intern_evaluation_events (evaluation_id, placement_id, event_type, revision, actor_profile_id)
     VALUES (public.t_ev('00000000-0000-0000-0000-0000000000f1', 1),'00000000-0000-0000-0000-0000000000f1','UPDATED',9,'00000000-0000-0000-0000-000000000003')$q$, '23505');

-- Atomicity: if the event cannot be written, nothing is written ----------------------------------------------
CREATE FUNCTION public.t_fail_evaluation_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'forced event failure'; END $$;
CREATE TRIGGER t_fail_evaluation_event BEFORE INSERT ON public.intern_evaluation_events
  FOR EACH ROW EXECUTE FUNCTION public.t_fail_evaluation_event();
SET ROLE service_role;
SELECT public.t_expect_error('J1 a save whose event fails is rolled back',
  $q$SELECT * FROM public.save_mentor_evaluation('00000000-0000-0000-0000-000000000003', public.t_ev('00000000-0000-0000-0000-0000000000f1', 1), 10, 'Fifth text')$q$,
  'forced event failure');
SELECT public.t_expect_error('J2 a publish whose event fails is rolled back',
  $q$SELECT * FROM public.publish_mentor_evaluation('00000000-0000-0000-0000-000000000003', public.t_ev('00000000-0000-0000-0000-0000000000f1', 2), 4)$q$,
  'forced event failure');
SELECT public.t_expect_error('J3 a create whose event fails is rolled back',
  $q$SELECT * FROM public.create_mentor_evaluation('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f1', gen_random_uuid(),'Never stored')$q$,
  'forced event failure');
RESET ROLE;
DROP TRIGGER t_fail_evaluation_event ON public.intern_evaluation_events;
DROP FUNCTION public.t_fail_evaluation_event();
SELECT public.t_check('J4 nothing changed: text, revision, snapshot and events are as before',
  (SELECT content = 'Fourth text' AND revision = 10 AND published_revision = 10 AND published_content = 'Fourth text'
   FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 1))
  AND (SELECT status = 'DRAFT' AND revision = 4 AND published_content IS NULL
       FROM public.intern_evaluations WHERE id = public.t_ev('00000000-0000-0000-0000-0000000000f1', 2))
  AND NOT EXISTS (SELECT 1 FROM public.intern_evaluations WHERE content = 'Never stored')
  AND (SELECT count(*) FROM public.intern_evaluation_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f1') = 14);
