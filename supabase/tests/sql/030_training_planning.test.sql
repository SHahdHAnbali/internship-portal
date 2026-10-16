-- Migration 20261011010000: training planning, capacity-enforced selection,
-- "Other" request mapping, planning history, delete protection, concurrency.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','a@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Applicant','a@x.com','APPLICANT');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','A1','a1@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b2','A2','a2@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b3','A3','a3@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b4','A4','a4@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b5','A5','a5@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b6','A6','a6@x.com',NULL);
INSERT INTO public.internships (id, title, capacity, selection_status) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', NULL, 'OPEN'),
 ('00000000-0000-0000-0000-0000000000e2','Data', 1, 'OPEN');
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','NEW','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','INTERVIEW','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c3','NEW',NULL,'Cyber Security','00000000-0000-0000-0000-0000000000b3'),
 ('00000000-0000-0000-0000-0000000000c4','NEW',NULL,' cyber security ','00000000-0000-0000-0000-0000000000b4'),
 ('00000000-0000-0000-0000-0000000000c5','NEW','00000000-0000-0000-0000-0000000000e2',NULL,'00000000-0000-0000-0000-0000000000b5'),
 ('00000000-0000-0000-0000-0000000000c6','NEW','00000000-0000-0000-0000-0000000000e2',NULL,'00000000-0000-0000-0000-0000000000b6');

-- Permissions ---------------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 authenticated cannot create opportunities',
  $q$SELECT * FROM public.create_training_opportunity('00000000-0000-0000-0000-000000000001','X',1,NULL,true,'OPEN')$q$,
  'permission denied for function create_training_opportunity');
SELECT public.t_expect_error('P2 authenticated cannot read mappings',
  $q$SELECT * FROM public.training_request_mappings$q$, 'permission denied for table training_request_mappings');
SELECT public.t_expect_error('P3 authenticated cannot read planning history',
  $q$SELECT * FROM public.training_plan_events$q$, 'permission denied for table training_plan_events');
RESET ROLE; SET ROLE anon;
SELECT public.t_expect_error('P4 anon cannot map requests',
  $q$SELECT * FROM public.map_training_request('00000000-0000-0000-0000-000000000001','x','00000000-0000-0000-0000-0000000000e1',NULL)$q$,
  'permission denied for function map_training_request');
RESET ROLE; SET ROLE service_role;

-- Opportunity management -----------------------------------------------------------
SELECT public.t_expect_error('O1 only HR creates opportunities',
  $q$SELECT * FROM public.create_training_opportunity('00000000-0000-0000-0000-000000000002','X',1,NULL,true,'OPEN')$q$, 'hr_role_required');
SELECT public.t_expect_error('O2 blank title refused',
  $q$SELECT * FROM public.create_training_opportunity('00000000-0000-0000-0000-000000000001','   ',1,NULL,true,'OPEN')$q$, 'invalid_training_title');
SELECT public.t_expect_error('O3 negative capacity refused',
  $q$SELECT * FROM public.create_training_opportunity('00000000-0000-0000-0000-000000000001','Design',-1,NULL,true,'OPEN')$q$, 'invalid_training_capacity');
SELECT public.t_expect_ok('O4 create opportunity with capacity',
  $q$SELECT * FROM public.create_training_opportunity('00000000-0000-0000-0000-000000000001','  Design  ',3,'Spring cohort',true,'OPEN')$q$);
SELECT public.t_check('O4 created active with trimmed title and a history event',
  EXISTS (SELECT 1 FROM public.internships WHERE title='Design' AND capacity=3 AND is_active)
  AND EXISTS (SELECT 1 FROM public.training_plan_events WHERE event_type='OPPORTUNITY_CREATED' AND note='Spring cohort'
              AND details->>'title'='Design' AND (details->>'capacity')::int=3));

-- Selection needs a planned capacity ------------------------------------------------
SELECT public.t_expect_error('S1 selection refused while capacity is not set',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','SELECTED',NULL,NULL)$q$,
  'training_capacity_not_set');
SELECT public.t_expect_ok('S2 HR sets capacity 1 for Engineering',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Engineering',true,1,NULL,'OPEN')$q$);
SELECT public.t_expect_ok('S3 select within capacity',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','SELECTED',NULL,NULL)$q$);
SELECT public.t_expect_error('S4 selection refused when seats are taken',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','SELECTED',NULL,NULL)$q$,
  'training_capacity_full');
SELECT public.t_check('S4 refused selection left status and history unchanged',
  (SELECT status FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c2')='INTERVIEW'
  AND NOT EXISTS (SELECT 1 FROM public.application_status_events WHERE application_id='00000000-0000-0000-0000-0000000000c2'));
SELECT public.t_expect_ok('S5 rejection does not need a seat',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','REJECTED','No seats left this cohort',NULL)$q$);

-- Capacity revisions -----------------------------------------------------------------
SELECT public.t_expect_error('R1 capacity cannot drop below selected applicants',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Engineering',true,0,NULL,'OPEN')$q$,
  'capacity_below_selected');
SELECT public.t_expect_error('R2 capacity cannot be cleared while selections exist',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Engineering',true,NULL,NULL,'OPEN')$q$,
  'capacity_required_with_selections');
SELECT public.t_expect_error('R3 no-op update refused',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Engineering',true,1,NULL,'OPEN')$q$,
  'training_unchanged');
SELECT public.t_expect_ok('R4 rename, close intake and enlarge capacity with a note',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','Software Engineering',false,4,'Budget approved','OPEN')$q$);
SELECT public.t_check('R4 history records each changed field with from/to',
  EXISTS (SELECT 1 FROM public.training_plan_events WHERE event_type='OPPORTUNITY_UPDATED' AND note='Budget approved'
          AND details->'capacity'->>'from'='1' AND details->'capacity'->>'to'='4'
          AND details->'title'->>'to'='Software Engineering' AND details->'isActive'->>'to'='false'));
SELECT public.t_expect_error('R5 unknown opportunity',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000ff','X',true,1,NULL,'OPEN')$q$,
  'training_not_found');

-- "Other" requests ---------------------------------------------------------------------
SELECT public.t_expect_error('M1 unmapped "Other" request cannot be selected',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,NULL)$q$,
  'training_not_planned');
SELECT public.t_expect_error('M2 mapping an unknown request label is refused',
  $q$SELECT * FROM public.map_training_request('00000000-0000-0000-0000-000000000001','Basket weaving','00000000-0000-0000-0000-0000000000e1',NULL)$q$,
  'training_request_not_found');
SELECT public.t_expect_ok('M3 map "Cyber Security" (case/space-insensitive) to Software Engineering',
  $q$SELECT * FROM public.map_training_request('00000000-0000-0000-0000-000000000001','  CYBER security','00000000-0000-0000-0000-0000000000e1','Same track')$q$);
SELECT public.t_check('M3 one mapping row for the normalized label; applicant requests unchanged',
  (SELECT count(*) FROM public.training_request_mappings WHERE normalized_label='cyber security')=1
  AND (SELECT requested_training FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c3')='Cyber Security'
  AND (SELECT internship_id FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c3') IS NULL);
SELECT public.t_expect_error('M4 mapping to the same opportunity again is refused',
  $q$SELECT * FROM public.map_training_request('00000000-0000-0000-0000-000000000001','cyber security','00000000-0000-0000-0000-0000000000e1',NULL)$q$,
  'training_request_already_mapped');
SELECT public.t_expect_ok('M5 a mapped "Other" request can be selected and uses that opportunity''s seats',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','SELECTED',NULL,NULL)$q$);
SELECT public.t_check('M5 selected count includes mapped requests',
  public.training_opportunity_selected_count('00000000-0000-0000-0000-0000000000e1') = 2
  AND public.resolve_application_training(NULL, ' Cyber Security') = '00000000-0000-0000-0000-0000000000e1');
SELECT public.t_expect_error('M6 a mapping with selections cannot be moved',
  $q$SELECT * FROM public.map_training_request('00000000-0000-0000-0000-000000000001','cyber security','00000000-0000-0000-0000-0000000000e2',NULL)$q$,
  'training_request_has_selections');
SELECT public.t_expect_error('M7 a mapping with selections cannot be removed',
  $q$SELECT public.unmap_training_request('00000000-0000-0000-0000-000000000001','cyber security',NULL)$q$,
  'training_request_has_selections');
SELECT public.t_expect_error('M8 unmapping an unknown label',
  $q$SELECT public.unmap_training_request('00000000-0000-0000-0000-000000000001','nothing',NULL)$q$,
  'training_request_not_mapped');

-- History and integrity -------------------------------------------------------------------
SELECT public.t_expect_error('H1 planning history is append-only',
  $q$UPDATE public.training_plan_events SET note='edited'$q$, 'permission denied for table training_plan_events');
RESET ROLE;
SELECT public.t_expect_error('F1 an opportunity referenced by applications cannot be deleted',
  $q$DELETE FROM public.internships WHERE id='00000000-0000-0000-0000-0000000000e2'$q$,
  '%applications_internship_id_fkey%');
SELECT public.t_expect_error('F2 capacity bounds are enforced on direct writes',
  $q$UPDATE public.internships SET capacity=-5 WHERE id='00000000-0000-0000-0000-0000000000e2'$q$,
  '%internships_capacity_check%');

-- Concurrency: two HR users take the last seat at the same time -----------------------------
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('other_hr', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));

BEGIN;
SET LOCAL ROLE service_role;
-- Session A takes Data's only seat and keeps its transaction open.
SELECT public.t_expect_ok('C1 session A selects the last seat (uncommitted)',
  $q$SELECT * FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c5','SELECTED',NULL,NULL)$q$);
-- Session B tries the same seat for another applicant.
SELECT dblink_exec('other_hr', 'SET ROLE service_role');
SELECT dblink_send_query('other_hr', $q$
  SELECT status FROM public.update_application_status_v2('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c6','SELECTED',NULL,NULL);
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('C2 session B waits on session A''s seat lock', dblink_is_busy('other_hr') = 1);
COMMIT;

SELECT * FROM dblink_get_result('other_hr', false) AS r(status text);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'C3 session B is refused once A commits (no overbooking)', msg LIKE '%training_capacity_full%', msg
FROM (SELECT dblink_error_message('other_hr') AS msg) AS e;
SELECT dblink_disconnect('other_hr');
SELECT public.t_check('C4 exactly one of the two applicants holds the seat',
  public.training_opportunity_selected_count('00000000-0000-0000-0000-0000000000e2') = 1
  AND (SELECT status FROM public.applications WHERE id='00000000-0000-0000-0000-0000000000c6')='NEW');
