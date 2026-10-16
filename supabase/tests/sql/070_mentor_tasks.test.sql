-- Migration 20261011050000: Mentor task management (priority, edit, cancel,
-- review), intern progress notes, append-only task history, dashboard counts.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000003','m2@x.com'),
 ('00000000-0000-0000-0000-000000000005','intern@x.com'),
 ('00000000-0000-0000-0000-000000000006','intern2@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000003','Mentor Two','m2@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern One','intern@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000006','Intern Two','intern2@x.com','INTERN');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern One','intern@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Intern Two','intern2@x.com','00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-0000000000b3','Future','future@x.com',NULL);
INSERT INTO public.internships (id, title, capacity) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 5);
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c3','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b3');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 10, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 10, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date + 10, current_date + 40, 'SCHEDULED', '00000000-0000-0000-0000-000000000002');

-- Permissions -----------------------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 authenticated cannot read task history',
  $q$SELECT * FROM public.intern_task_events$q$, 'permission denied for table intern_task_events');
SELECT public.t_expect_error('P2 authenticated cannot review tasks',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',gen_random_uuid(),'ACCEPT',NULL)$q$,
  'permission denied for function review_mentor_intern_task');
RESET ROLE; SET ROLE service_role;

-- Creation ----------------------------------------------------------------------------------
SELECT public.t_expect_ok('C1 Mentor creates a high-priority task',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','  T1 ','Details',current_date + 5,'HIGH')$q$);
SELECT public.t_check('C1 stored with priority, creator and a CREATED event',
  (SELECT priority='HIGH' AND created_by_profile_id='00000000-0000-0000-0000-000000000002' AND status='ASSIGNED'
   FROM public.intern_tasks WHERE title='T1')
  AND EXISTS (SELECT 1 FROM public.intern_task_events e JOIN public.intern_tasks t ON t.id=e.task_id
              WHERE t.title='T1' AND e.event_type='CREATED' AND e.details->>'priority'='HIGH'));
SELECT public.t_expect_error('C2 invalid priority',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','X',NULL,NULL,'URGENT')$q$,
  'invalid_task_priority');
SELECT public.t_expect_error('C3 title longer than 200 characters',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1',repeat('a',201),NULL,NULL,NULL)$q$,
  'task_title_too_long');
SELECT public.t_expect_error('C4 another Mentor cannot create tasks on this placement',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f1','X',NULL,NULL,NULL)$q$,
  'placement_not_assigned_to_mentor');
SELECT public.t_expect_error('C5 no tasks before the placement is active',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f3','X',NULL,NULL,NULL)$q$,
  'placement_not_active');
SELECT public.t_expect_error('C6 HR cannot create tasks',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','X',NULL,NULL,NULL)$q$,
  'mentor_role_required');
SELECT public.t_expect_ok('C7 default priority',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','T2',NULL,NULL,NULL)$q$);
SELECT public.t_expect_ok('C8 overdue task',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','T3',NULL,current_date - 1,'LOW')$q$);
SELECT public.t_check('C7 priority defaults to MEDIUM',
  (SELECT priority FROM public.intern_tasks WHERE title='T2')='MEDIUM');

-- Editing --------------------------------------------------------------------------------------
SELECT public.t_expect_error('E1 another Mentor cannot see or edit the task',
  $q$SELECT * FROM public.update_mentor_intern_task('00000000-0000-0000-0000-000000000003',(SELECT id FROM public.intern_tasks WHERE title='T1'),'T1','Details',current_date + 5,'HIGH')$q$,
  'task_not_found');
SELECT public.t_expect_error('E2 an unchanged edit is refused',
  $q$SELECT * FROM public.update_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'T1','Details',current_date + 5,'HIGH')$q$,
  'task_unchanged');
SELECT public.t_expect_ok('E3 Mentor changes due date and priority',
  $q$SELECT * FROM public.update_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'T1','Details',current_date + 7,'MEDIUM')$q$);
SELECT public.t_check('E3 UPDATED event records only the changed fields',
  EXISTS (SELECT 1 FROM public.intern_task_events e JOIN public.intern_tasks t ON t.id=e.task_id
          WHERE t.title='T1' AND e.event_type='UPDATED'
            AND e.details->'priority'->>'from'='HIGH' AND e.details->'priority'->>'to'='MEDIUM'
            AND e.details ? 'dueDate' AND NOT e.details ? 'title'));

-- Intern progress and Mentor review ------------------------------------------------------------
SELECT public.t_expect_error('I1 another intern cannot touch the task',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000006',(SELECT id FROM public.intern_tasks WHERE title='T1'),'IN_PROGRESS',NULL)$q$,
  'task_not_found');
SELECT public.t_expect_error('I2 cannot skip straight to completed',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='T1'),'COMPLETED',NULL)$q$,
  'invalid_task_status_transition');
SELECT public.t_expect_ok('I3 intern starts the task with a progress note',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='T1'),'IN_PROGRESS',' Reading chapter 1 ')$q$);
SELECT public.t_expect_error('R1 nothing to review before completion',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'ACCEPT',NULL)$q$,
  'task_not_awaiting_review');
SELECT public.t_expect_ok('I4 intern submits the task',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='T1'),'COMPLETED',NULL)$q$);
SELECT public.t_expect_error('E4 a submitted task can no longer be edited',
  $q$SELECT * FROM public.update_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'T1 edited',NULL,NULL,'LOW')$q$,
  'task_not_editable');
SELECT public.t_expect_error('R2 requesting changes needs feedback',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'REQUEST_CHANGES','  ')$q$,
  'review_feedback_required');
SELECT public.t_expect_error('R3 another Mentor cannot review',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000003',(SELECT id FROM public.intern_tasks WHERE title='T1'),'ACCEPT',NULL)$q$,
  'task_not_found');
SELECT public.t_expect_ok('R4 Mentor requests changes',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'REQUEST_CHANGES','Add tests')$q$);
SELECT public.t_check('R4 task back in progress with the feedback',
  (SELECT status='IN_PROGRESS' AND review_status='CHANGES_REQUESTED' AND mentor_feedback='Add tests'
          AND reviewed_by_profile_id='00000000-0000-0000-0000-000000000002'
   FROM public.intern_tasks WHERE title='T1'));
SELECT public.t_expect_ok('I5 intern resubmits',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='T1'),'COMPLETED','Tests added')$q$);
SELECT public.t_check('I5 resubmission awaits a new review',
  (SELECT status='COMPLETED' AND review_status IS NULL FROM public.intern_tasks WHERE title='T1'));
SELECT public.t_expect_ok('R5 Mentor accepts',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'ACCEPT','Well done')$q$);
SELECT public.t_expect_error('R6 an accepted task is not reviewed twice',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'ACCEPT',NULL)$q$,
  'task_not_awaiting_review');
SELECT public.t_expect_error('I6 an accepted task is final for the intern',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='T1'),'IN_PROGRESS',NULL)$q$,
  'invalid_task_status_transition');
SELECT public.t_check('H1 full T1 history in order with actors and notes',
  (SELECT array_agg(e.event_type ORDER BY e.created_at, e.id) FROM public.intern_task_events e
   JOIN public.intern_tasks t ON t.id=e.task_id WHERE t.title='T1')
    = ARRAY['CREATED','UPDATED','STARTED','SUBMITTED','CHANGES_REQUESTED','SUBMITTED','ACCEPTED']
  AND EXISTS (SELECT 1 FROM public.intern_task_events WHERE event_type='STARTED' AND note='Reading chapter 1'
              AND actor_profile_id='00000000-0000-0000-0000-000000000005'));

-- Cancellation ------------------------------------------------------------------------------------
SELECT public.t_expect_error('X1 cancellation needs a reason',
  $q$SELECT * FROM public.cancel_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T2'),' ')$q$,
  'cancellation_reason_required');
SELECT public.t_expect_ok('X2 Mentor cancels an open task',
  $q$SELECT * FROM public.cancel_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T2'),'No longer needed')$q$);
SELECT public.t_expect_error('X3 the intern cannot start a cancelled task',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='T2'),'IN_PROGRESS',NULL)$q$,
  'invalid_task_status_transition');
SELECT public.t_expect_error('X4 an accepted task cannot be cancelled',
  $q$SELECT * FROM public.cancel_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'x')$q$,
  'task_not_cancellable');
SELECT public.t_expect_error('X5 cancellation fields stay consistent',
  $q$UPDATE public.intern_tasks SET cancelled_at=NULL WHERE title='T2'$q$, '%intern_tasks_cancellation_check%');

-- Dashboard and history access ---------------------------------------------------------------------
SELECT public.t_check('D1 Mentor dashboard counts per placement',
  (SELECT open_tasks=1 AND awaiting_review=0 AND overdue_tasks=1 AND accepted_tasks=1 AND training_title='Engineering'
   FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002') WHERE placement_id='00000000-0000-0000-0000-0000000000f1')
  AND (SELECT count(*) FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002'))=2);
SELECT public.t_check('D2 the assigned Mentor reads the placement task history with actor roles',
  (SELECT count(*) FROM public.list_mentor_task_events('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1')) = 10
  AND EXISTS (SELECT 1 FROM public.list_mentor_task_events('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1')
              WHERE event_type='STARTED' AND actor_role='INTERN' AND actor_name='Intern One'));
SELECT public.t_expect_error('D3 another Mentor cannot read that history',
  $q$SELECT * FROM public.list_mentor_task_events('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000f1')$q$,
  'placement_not_assigned_to_mentor');
SELECT public.t_expect_error('D4 task history is append-only',
  $q$DELETE FROM public.intern_task_events$q$, 'permission denied for table intern_task_events');

-- Reassignment revokes the previous Mentor's task actions -------------------------------------------
SELECT public.t_expect_ok('RA1 HR reassigns the placement to Mentor Two',
  $q$SELECT * FROM public.assign_intern_placement_mentor('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000003')$q$);
SELECT public.t_expect_error('RA2 Mentor One can no longer edit tasks',
  $q$SELECT * FROM public.update_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T3'),'T3',NULL,NULL,'HIGH')$q$,
  'task_not_found');
SELECT public.t_expect_ok('RA3 Mentor Two can',
  $q$SELECT * FROM public.update_mentor_intern_task('00000000-0000-0000-0000-000000000003',(SELECT id FROM public.intern_tasks WHERE title='T3'),'T3',NULL,current_date + 3,'HIGH')$q$);
RESET ROLE;
