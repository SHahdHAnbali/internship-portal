-- Seed for 160_retire_intern_task_workflows.test.sql. Runs just before
-- migration 20261018000000 (see run.sh), while the task functions still exist:
-- creates task history the way the portal did, then records row counts and
-- digests of the archive so the test can prove the migration kept every row.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','hr@x.com'),
 ('00000000-0000-0000-0000-000000000002','m1@x.com'),
 ('00000000-0000-0000-0000-000000000005','intern1@x.com'),
 ('00000000-0000-0000-0000-000000000006','intern2@x.com'),
 ('00000000-0000-0000-0000-000000000007','admin@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000002','Mentor One','m1@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Intern One','intern1@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000006','Intern Two','intern2@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000007','Admin','admin@x.com','ADMIN');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern One','intern1@x.com','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-0000000000b2','Intern Two','intern2@x.com','00000000-0000-0000-0000-000000000006');
INSERT INTO public.internships (id, title, capacity) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 5);
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2');
-- f1: running placement with open legacy tasks. f2: planned end date passed.
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 10, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 40, current_date - 1, 'ACTIVE', '00000000-0000-0000-0000-000000000002');

-- Task history through the (soon retired) functions: one open, one submitted
-- but unreviewed, one accepted.
SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Open task',NULL,current_date + 5,'HIGH');
SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Submitted task','Details',NULL,'MEDIUM');
SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','Accepted task',NULL,NULL,'LOW');
SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',
  (SELECT id FROM public.intern_tasks WHERE title = 'Submitted task'),'IN_PROGRESS','Started');
SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',
  (SELECT id FROM public.intern_tasks WHERE title = 'Submitted task'),'COMPLETED',NULL);
SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',
  (SELECT id FROM public.intern_tasks WHERE title = 'Accepted task'),'IN_PROGRESS',NULL);
SELECT * FROM public.update_my_intern_task_status('00000000-0000-0000-0000-000000000005',
  (SELECT id FROM public.intern_tasks WHERE title = 'Accepted task'),'COMPLETED',NULL);
SELECT * FROM public.review_mentor_intern_task('00000000-0000-0000-0000-000000000002',
  (SELECT id FROM public.intern_tasks WHERE title = 'Accepted task'),'ACCEPT','Well done');

-- f2: a weekly report submitted and awaiting the Mentor's review.
SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000006',
  date_trunc('week', current_date - 7)::date,'Finished the module',NULL,NULL,NULL);
SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000006',
  (SELECT id FROM public.intern_weekly_reports WHERE placement_id = '00000000-0000-0000-0000-0000000000f2'));

-- An old placement-row change, so the test can tell placement activity from the
-- (newer) task events in HR's last-activity time.
UPDATE public.intern_placements SET updated_at = '2026-01-01 00:00:00+00'
WHERE id = '00000000-0000-0000-0000-0000000000f1';

CREATE TABLE public.t_seed (name text PRIMARY KEY, row_count integer NOT NULL, digest text);
INSERT INTO public.t_seed (name, row_count, digest)
SELECT 'intern_tasks', count(*), md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id)) FROM public.intern_tasks AS t
UNION ALL
SELECT 'intern_task_events', count(*), md5(string_agg(row_to_json(e)::text, '|' ORDER BY e.id)) FROM public.intern_task_events AS e;
