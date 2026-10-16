-- Migration 20261011070000: HR intern progress overview (read-only counts).

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000005','intern@x.com'),
 ('00000000-0000-0000-0000-000000000007','admin@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern One','intern@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000007','Admin','admin@x.com','ADMIN');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern One','intern@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Future','future@x.com',NULL),
 ('00000000-0000-0000-0000-0000000000b3','Gone','gone@x.com',NULL);
INSERT INTO public.internships (id, title, capacity) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 5);
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c3','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b3');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', date_trunc('week', current_date)::date - 14, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date + 10, current_date + 40, 'SCHEDULED', NULL);
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, cancelled_at, cancellation_reason) VALUES
 ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date + 10, current_date + 40, 'CANCELLED', now(), 'Withdrew');

SET ROLE authenticated;
SELECT public.t_expect_error('P1 browsers cannot call the progress view',
  $q$SELECT * FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000001')$q$,
  'permission denied for function list_hr_intern_progress');
RESET ROLE; SET ROLE service_role;

SELECT public.t_expect_error('P2 ADMIN does not inherit HR progress access',
  $q$SELECT * FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000007')$q$, 'hr_role_required');
SELECT public.t_expect_error('P3 Mentors use their own scoped views',
  $q$SELECT * FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000002')$q$, 'hr_role_required');

-- Activity: two tasks (one accepted, one overdue), one submitted report, one private draft.
SELECT public.t_expect_ok('A1 Mentor assigns tasks',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','T1',NULL,NULL,NULL)$q$);
SELECT public.t_expect_ok('A2 overdue task',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','T2',NULL,current_date - 1,NULL)$q$);
SELECT public.t_expect_ok('A3 intern starts T1',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='T1'),'IN_PROGRESS',NULL)$q$);
SELECT public.t_expect_ok('A3b intern completes T1',
  $q$SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_tasks WHERE title='T1'),'COMPLETED',NULL)$q$);
SELECT public.t_expect_ok('A4 accept',
  $q$SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_tasks WHERE title='T1'),'ACCEPT',NULL)$q$);
SELECT public.t_expect_ok('A5 intern submits last week''s report',
  $q$SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000005',
       (SELECT id FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005', date_trunc('week', current_date)::date - 7, 'Did work', NULL, NULL, NULL)))$q$);
SELECT public.t_expect_ok('A6 intern keeps a draft for this week',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005', date_trunc('week', current_date)::date, 'Draft', NULL, NULL, NULL)$q$);

SELECT public.t_check('V1 HR sees active and scheduled placements, never cancelled ones',
  (SELECT array_agg(status ORDER BY status) FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000001'))
    = ARRAY['ACTIVE','SCHEDULED']);
SELECT public.t_check('V2 counts for the active placement (drafts excluded)',
  (SELECT tasks_total=2 AND tasks_open=1 AND tasks_overdue=1 AND tasks_accepted=1 AND tasks_awaiting_review=0
          AND reports_expected=3 AND reports_submitted=1 AND reports_accepted=0
          AND last_report_week = date_trunc('week', current_date)::date - 7
          AND mentor_name='Mentor One' AND mentor_active AND training_title='Engineering'
   FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000001') WHERE placement_id='00000000-0000-0000-0000-0000000000f1'));
SELECT public.t_check('V3 a scheduled placement expects no reports yet and has no Mentor',
  (SELECT reports_expected=0 AND mentor_name IS NULL
   FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000001') WHERE placement_id='00000000-0000-0000-0000-0000000000f2'));
RESET ROLE;
