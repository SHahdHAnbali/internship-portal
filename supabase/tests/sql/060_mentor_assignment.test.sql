-- Migration 20261011040000: Mentor assignment/reassignment/removal by HR,
-- availability (active Mentors only), open placements only, history, and the
-- previous Mentor losing access after reassignment.
-- Since 20261017000000 an ACTIVE placement cannot lose its Mentor without a
-- replacement; removal is exercised on a SCHEDULED placement.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000003','m2@x.com'),
 ('00000000-0000-0000-0000-000000000004','m-off@x.com'),
 ('00000000-0000-0000-0000-000000000005','intern@x.com'),
 ('00000000-0000-0000-0000-000000000006','admin@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000003','Mentor Two','m2@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000004','Mentor Off','m-off@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern','intern@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000006','Admin','admin@x.com','ADMIN');
UPDATE public.profiles SET is_active=false, deactivated_at=now() WHERE id='00000000-0000-0000-0000-000000000004';
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern','intern@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Other','other@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b3','Third','third@x.com',NULL);
INSERT INTO public.internships (id, title, capacity) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 3);
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c3','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b3');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date, current_date + 30, 'ACTIVE');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, cancelled_at, cancellation_reason) VALUES
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date, current_date + 30, 'CANCELLED', now(), 'Withdrew');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status) VALUES
 ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date + 7, current_date + 37, 'SCHEDULED');

-- Permissions ------------------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 authenticated cannot assign Mentors',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000002')$q$,
  'permission denied for function assign_intern_placement_mentor');
SELECT public.t_expect_error('P2 authenticated cannot remove Mentors',
  $q$SELECT * FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1',NULL)$q$,
  'permission denied for function unassign_intern_placement_mentor');
SELECT public.t_expect_error('P3 authenticated cannot list Mentors',
  $q$SELECT * FROM public.list_hr_mentors('00000000-0000-0000-0000-000000000001')$q$,
  'permission denied for function list_hr_mentors');
RESET ROLE; SET ROLE service_role;

-- Roles -------------------------------------------------------------------------------
SELECT public.t_expect_error('R1 a Mentor cannot assign themselves',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000002')$q$,
  'hr_role_required');
SELECT public.t_expect_error('R2 ADMIN does not inherit HR assignment rights',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000002')$q$,
  'hr_role_required');
SELECT public.t_expect_error('R3 ADMIN cannot list Mentors through the HR function',
  $q$SELECT * FROM public.list_hr_mentors('00000000-0000-0000-0000-000000000006')$q$, 'hr_role_required');

-- Availability ------------------------------------------------------------------------
SELECT public.t_check('L1 HR sees active Mentors only, with open-placement counts',
  (SELECT array_agg(full_name ORDER BY full_name) FROM public.list_hr_mentors('00000000-0000-0000-0000-000000000001'))
    = ARRAY['Mentor One','Mentor Two']
  AND (SELECT sum(open_placements) FROM public.list_hr_mentors('00000000-0000-0000-0000-000000000001')) = 0);
SELECT public.t_expect_error('V1 a deactivated Mentor cannot be assigned',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000004')$q$,
  'mentor_inactive');
SELECT public.t_expect_error('V2 a non-Mentor cannot be assigned',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000005')$q$,
  'mentor_profile_required');
SELECT public.t_expect_error('V3 a Mentor is required (removal has its own action)',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1',NULL)$q$,
  'mentor_profile_required');
SELECT public.t_expect_error('V4 a cancelled placement cannot get a Mentor',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000002')$q$,
  'placement_not_assignable');
SELECT public.t_expect_error('V5 unknown placement',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000ff','00000000-0000-0000-0000-000000000002')$q$,
  'placement_not_found');
SELECT public.t_expect_error('V6 nothing to remove yet',
  $q$SELECT * FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1',NULL)$q$,
  'mentor_not_assigned');

-- Assignment and the Mentor's access ----------------------------------------------------
SELECT public.t_expect_ok('A1 HR assigns Mentor One',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000002')$q$);
SELECT public.t_expect_error('A2 assigning the same Mentor again is refused',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000002')$q$,
  'mentor_unchanged');
SELECT public.t_expect_ok('A3 Mentor One creates a task for the active placement',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Read the handbook',NULL,NULL,NULL)$q$);
SELECT public.t_check('A4 Mentor One sees the placement; Mentor Two does not',
  (SELECT count(*) FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002'))=1
  AND (SELECT count(*) FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000003'))=0);
SELECT public.t_check('A5 open-placement count reflects the assignment',
  (SELECT open_placements FROM public.list_hr_mentors('00000000-0000-0000-0000-000000000001') WHERE full_name='Mentor One')=1);

-- Reassignment: the previous Mentor loses access ------------------------------------------
SELECT public.t_expect_ok('RA1 HR reassigns to Mentor Two',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000003')$q$);
SELECT public.t_check('RA2 Mentor One no longer sees the placement; Mentor Two does',
  (SELECT count(*) FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002'))=0
  AND (SELECT count(*) FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000003'))=1);
SELECT public.t_expect_error('RA3 Mentor One can no longer create tasks there',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Late task',NULL,NULL,NULL)$q$,
  'placement_not_assigned_to_mentor');
SELECT public.t_expect_error('RA4 Mentor One can no longer read its tasks',
  $q$SELECT * FROM public.list_mentor_intern_tasks('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1')$q$,
  'placement_not_assigned_to_mentor');
SELECT public.t_check('RA5 Mentor Two sees the existing task (tasks belong to the placement)',
  (SELECT count(*) FROM public.list_mentor_intern_tasks('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f1'))=1);

-- Removal ----------------------------------------------------------------------------------
SELECT public.t_expect_error('U1 HR cannot remove the Mentor of an active placement without a replacement',
  $q$SELECT * FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','  Mentor on leave ')$q$,
  'active_placement_requires_mentor');
SELECT public.t_check('U2 the active placement keeps Mentor Two, who keeps access',
  (SELECT mentor_profile_id FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000f1')='00000000-0000-0000-0000-000000000003'
  AND (SELECT count(*) FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000003'))=1
  AND NOT EXISTS (SELECT 1 FROM public.intern_placement_events
                  WHERE placement_id='00000000-0000-0000-0000-0000000000f1' AND event_type='MENTOR_UNASSIGNED'));
SELECT public.t_expect_ok('U3 HR assigns Mentor One to the scheduled placement',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-000000000002')$q$);
SELECT public.t_expect_ok('U4 HR removes the Mentor of a scheduled placement with a reason',
  $q$SELECT * FROM public.unassign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3','  Mentor on leave ')$q$);
SELECT public.t_check('U5 scheduled placement unassigned and Mentor One lost access',
  (SELECT mentor_profile_id IS NULL FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000f3')
  AND (SELECT count(*) FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002'))=0);

-- History ------------------------------------------------------------------------------------
SELECT public.t_check('H1 assignment history records actor, from/to and the reason',
  (SELECT array_agg(event_type || ':' || coalesce(details->>'fromMentorName','-') || '>' || coalesce(details->>'toMentorName','-') ORDER BY created_at, event_type)
   FROM public.intern_placement_events WHERE placement_id='00000000-0000-0000-0000-0000000000f1')
    = ARRAY['MENTOR_ASSIGNED:->Mentor One','MENTOR_ASSIGNED:Mentor One>Mentor Two']
  AND (SELECT array_agg(event_type || ':' || coalesce(details->>'fromMentorName','-') || '>' || coalesce(details->>'toMentorName','-') ORDER BY created_at, event_type)
   FROM public.intern_placement_events WHERE placement_id='00000000-0000-0000-0000-0000000000f3')
    = ARRAY['MENTOR_ASSIGNED:->Mentor One','MENTOR_UNASSIGNED:Mentor One>-']
  AND (SELECT bool_and(actor_profile_id='00000000-0000-0000-0000-000000000001') FROM public.intern_placement_events
       WHERE placement_id IN ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f3'))
  AND EXISTS (SELECT 1 FROM public.intern_placement_events WHERE event_type='MENTOR_UNASSIGNED' AND note='Mentor on leave'
              AND placement_id='00000000-0000-0000-0000-0000000000f3'));
RESET ROLE;

-- Concurrency: an admin demotes a Mentor while HR assigns them ------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('hr_session', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('hr_session', 'SET ROLE service_role');

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC1 admin demotes Mentor One to HR (uncommitted)',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','HR',NULL)$q$);
SELECT dblink_send_query('hr_session', $q$
  SELECT status FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000002');
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC2 the assignment waits for the role change', dblink_is_busy('hr_session') = 1);
COMMIT;

SELECT * FROM dblink_get_result('hr_session', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC3 the assignment is refused after the demotion commits', msg LIKE '%mentor_profile_required%', msg
FROM (SELECT dblink_error_message('hr_session') AS msg) AS e;
SELECT dblink_disconnect('hr_session');
SELECT public.t_check('CC4 the placement keeps Mentor Two and the former Mentor is HR',
  (SELECT mentor_profile_id FROM public.intern_placements WHERE id='00000000-0000-0000-0000-0000000000f1')='00000000-0000-0000-0000-000000000003'
  AND (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000002')='HR');
