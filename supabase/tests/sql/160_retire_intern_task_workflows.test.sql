-- Migration 20261018000000: intern task workflows retired.
-- Data comes from 160_retire_intern_task_workflows.before-20261018000000.sql,
-- which ran before the migration while the task functions still existed.

-- Retired functions -------------------------------------------------------------------------
SELECT public.t_check('R1 the 13 task-only functions no longer exist',
  NOT EXISTS (SELECT 1 FROM unnest(ARRAY[
    'public.list_hr_intern_tasks(uuid, uuid)',
    'public.create_intern_task(uuid, uuid, text, text, date)',
    'public.list_my_intern_tasks(uuid)',
    'public.update_my_intern_task_status(uuid, uuid, text, text)',
    'public.list_mentor_intern_tasks(uuid, uuid)',
    'public.create_mentor_intern_task(uuid, uuid, text, text, date, text)',
    'public.update_mentor_intern_task(uuid, uuid, text, text, date, text)',
    'public.cancel_mentor_intern_task(uuid, uuid, text)',
    'public.review_mentor_intern_task(uuid, uuid, text, text)',
    'public.list_mentor_task_events(uuid, uuid)',
    'public.withdraw_my_intern_task_submission(uuid, uuid)',
    'public.mentor_lock_task(uuid, uuid)',
    'public.intern_task_withdrawal_open(date, timestamp with time zone)'
  ]) AS sig WHERE to_regprocedure(sig) IS NOT NULL));
SELECT public.t_check('R2 no other task function remains under any overload',
  NOT EXISTS (SELECT 1 FROM pg_proc AS p WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('list_hr_intern_tasks', 'create_intern_task', 'list_my_intern_tasks',
                                'update_my_intern_task_status', 'list_mentor_intern_tasks', 'create_mentor_intern_task',
                                'update_mentor_intern_task', 'cancel_mentor_intern_task', 'review_mentor_intern_task',
                                'list_mentor_task_events', 'withdraw_my_intern_task_submission', 'mentor_lock_task',
                                'intern_task_withdrawal_open')));
SELECT public.t_check('R3 no public function reads or writes the task archive any more',
  NOT EXISTS (SELECT 1 FROM pg_proc AS p WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname NOT LIKE 't\_%' AND p.prosrc ~ '\m(intern_tasks|intern_task_events)\M'));
SELECT public.t_check('R4 kept: the weekly-report text helper and the weekly-report functions',
  to_regprocedure('public.intern_task_clean_text(text)') IS NOT NULL
  AND to_regprocedure('public.save_my_weekly_report(uuid, date, text, text, text, text)') IS NOT NULL
  AND to_regprocedure('public.submit_my_weekly_report(uuid, uuid)') IS NOT NULL
  AND to_regprocedure('public.list_my_weekly_reports(uuid)') IS NOT NULL
  AND to_regprocedure('public.list_mentor_weekly_reports(uuid, uuid)') IS NOT NULL
  AND to_regprocedure('public.review_mentor_weekly_report(uuid, uuid, text, text)') IS NOT NULL
  AND to_regprocedure('public.intern_lock_active_placement(uuid)') IS NOT NULL
  AND to_regprocedure('public.intern_visible_placement_id(uuid)') IS NOT NULL);

-- Archive kept intact -------------------------------------------------------------------------
SELECT public.t_check('D1 the seed created real task history before the migration',
  (SELECT row_count FROM public.t_seed WHERE name = 'intern_tasks') = 3
  AND (SELECT row_count FROM public.t_seed WHERE name = 'intern_task_events') >= 8);
SELECT public.t_check('D2 every task row survived the migration unchanged',
  (SELECT count(*) FROM public.intern_tasks) = (SELECT row_count FROM public.t_seed WHERE name = 'intern_tasks')
  AND (SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id)) FROM public.intern_tasks AS t)
      = (SELECT digest FROM public.t_seed WHERE name = 'intern_tasks'));
SELECT public.t_check('D3 every task event survived the migration unchanged',
  (SELECT count(*) FROM public.intern_task_events) = (SELECT row_count FROM public.t_seed WHERE name = 'intern_task_events')
  AND (SELECT md5(string_agg(row_to_json(e)::text, '|' ORDER BY e.id)) FROM public.intern_task_events AS e)
      = (SELECT digest FROM public.t_seed WHERE name = 'intern_task_events'));

-- Archive privileges ----------------------------------------------------------------------------
SELECT public.t_check('G1 service_role keeps SELECT and loses every write privilege on both tables',
  (SELECT bool_and(has_table_privilege('service_role', t, 'SELECT')) FROM unnest(ARRAY['public.intern_tasks', 'public.intern_task_events']) AS t)
  AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['public.intern_tasks', 'public.intern_task_events']) AS t,
                  unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) AS priv
    WHERE has_table_privilege('service_role', t, priv))
  AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['public.intern_tasks', 'public.intern_task_events']) AS t
    WHERE has_any_column_privilege('service_role', t, 'INSERT, UPDATE, REFERENCES')));
SELECT public.t_check('G2 browser roles hold no privilege at all on the archive',
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['public.intern_tasks', 'public.intern_task_events']) AS t,
                  unnest(ARRAY['anon', 'authenticated']) AS r,
                  unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) AS priv
    WHERE has_table_privilege(r, t, priv)));

SET ROLE service_role;
SELECT public.t_expect_ok('G3 service_role can still read the archive',
  $q$SELECT count(*) FROM public.intern_tasks JOIN public.intern_task_events AS e ON e.task_id = intern_tasks.id$q$);
SELECT public.t_expect_error('G4 service_role cannot add tasks',
  $q$INSERT INTO public.intern_tasks (placement_id, title) VALUES ('00000000-0000-0000-0000-0000000000f1', 'New')$q$,
  'permission denied for table intern_tasks');
SELECT public.t_expect_error('G5 service_role cannot change tasks',
  $q$UPDATE public.intern_tasks SET title = 'Changed'$q$, 'permission denied for table intern_tasks');
SELECT public.t_expect_error('G6 service_role cannot delete tasks',
  $q$DELETE FROM public.intern_tasks$q$, 'permission denied for table intern_tasks');
SELECT public.t_expect_error('G7 service_role cannot truncate the history',
  $q$TRUNCATE public.intern_task_events$q$, 'permission denied for table intern_task_events');
SELECT public.t_expect_error('G8 service_role cannot add history',
  $q$INSERT INTO public.intern_task_events (task_id, placement_id, event_type, actor_profile_id)
     SELECT id, placement_id, 'UPDATED', '00000000-0000-0000-0000-000000000002' FROM public.intern_tasks LIMIT 1$q$,
  'permission denied for table intern_task_events');
SELECT public.t_expect_error('G9 a retired function cannot be called',
  $q$SELECT * FROM public.create_mentor_intern_task('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','X',NULL,NULL,NULL)$q$,
  'function public.create_mentor_intern_task(%) does not exist');
RESET ROLE;

SET ROLE authenticated;
SELECT public.t_expect_error('G10 browsers still cannot read the archive',
  $q$SELECT * FROM public.intern_tasks$q$, 'permission denied for table intern_tasks');
SELECT public.t_expect_error('G11 browsers cannot call the rebuilt Mentor list',
  $q$SELECT * FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002')$q$,
  'permission denied for function list_my_mentor_placements');
RESET ROLE;

SELECT public.t_check('G12 the rebuilt functions are executable by service_role only',
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['public.list_my_mentor_placements(uuid)', 'public.list_hr_intern_progress(uuid)',
                               'public.complete_intern_placement(uuid, uuid, text)']) AS f,
                  unnest(ARRAY['anon', 'authenticated']) AS r
    WHERE has_function_privilege(r, f, 'EXECUTE'))
  AND (SELECT bool_and(has_function_privilege('service_role', f, 'EXECUTE'))
       FROM unnest(ARRAY['public.list_my_mentor_placements(uuid)', 'public.list_hr_intern_progress(uuid)',
                         'public.complete_intern_placement(uuid, uuid, text)']) AS f));

-- Mentor placement list ----------------------------------------------------------------------
SELECT public.t_check('M1 the Mentor list returns no task columns and keeps reports_awaiting_review',
  pg_get_function_result('public.list_my_mentor_placements(uuid)'::regprocedure) NOT LIKE '%task%'
  AND pg_get_function_result('public.list_my_mentor_placements(uuid)'::regprocedure) LIKE '%reports_awaiting_review integer%');

SET ROLE service_role;
SELECT public.t_check('M2 the Mentor sees both placements with the right report counts',
  (SELECT array_agg(placement_id::text || ':' || reports_awaiting_review ORDER BY placement_id)
   FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002'))
  = ARRAY['00000000-0000-0000-0000-0000000000f1:0', '00000000-0000-0000-0000-0000000000f2:1']);
SELECT public.t_expect_error('M3 a non-Mentor is still refused',
  $q$SELECT * FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000001')$q$, 'mentor_role_required');

-- HR progress ---------------------------------------------------------------------------------
SELECT public.t_check('H1 HR progress returns no task columns',
  pg_get_function_result('public.list_hr_intern_progress(uuid)'::regprocedure) NOT LIKE '%task%');
SELECT public.t_check('H2 last activity ignores task events (f1 has only an old placement change)',
  (SELECT last_activity_at FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000001')
   WHERE placement_id = '00000000-0000-0000-0000-0000000000f1') = '2026-01-01 00:00:00+00'::timestamptz
  AND (SELECT max(created_at) FROM public.intern_task_events) > '2026-01-01 00:00:00+00'::timestamptz);
SELECT public.t_check('H3 last activity still counts weekly-report submissions (f2)',
  (SELECT last_activity_at = (SELECT max(created_at) FROM public.intern_weekly_report_events
                              WHERE placement_id = '00000000-0000-0000-0000-0000000000f2' AND event_type = 'SUBMITTED')
          AND reports_submitted = 1
   FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000001')
   WHERE placement_id = '00000000-0000-0000-0000-0000000000f2'));
SELECT public.t_expect_error('H4 a non-HR actor is still refused',
  $q$SELECT * FROM public.list_hr_intern_progress('00000000-0000-0000-0000-000000000007')$q$, 'hr_role_required');

-- Weekly reports still work after the migration ------------------------------------------------
SELECT public.t_expect_ok('W1 the intern saves this week''s report (uses intern_task_clean_text)',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',
       date_trunc('week', current_date)::date, '  Built the API  ', NULL, 'Docker', NULL)$q$);
SELECT public.t_check('W2 the text was cleaned as before',
  (SELECT summary FROM public.intern_weekly_reports WHERE placement_id = '00000000-0000-0000-0000-0000000000f1') = 'Built the API');
SELECT public.t_expect_ok('W3 the intern submits it',
  $q$SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000005',
       (SELECT id FROM public.intern_weekly_reports WHERE placement_id = '00000000-0000-0000-0000-0000000000f1'))$q$);
SELECT public.t_check('W4 the Mentor sees it awaiting review',
  (SELECT status FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1')) = 'SUBMITTED'
  AND (SELECT reports_awaiting_review FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002')
       WHERE placement_id = '00000000-0000-0000-0000-0000000000f1') = 1);

-- Completion no longer depends on tasks ----------------------------------------------------------
SELECT public.t_expect_error('C1 completion stays HR only',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1','x')$q$,
  'hr_role_required');
SELECT public.t_expect_error('C2 an early end still needs a reason',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1',NULL)$q$,
  'early_end_reason_required');
SELECT public.t_expect_error('C3 a weekly report awaiting review still blocks completion',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','Moved abroad')$q$,
  'placement_has_pending_reports');
SELECT public.t_expect_ok('C4 the Mentor returns the report with feedback',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',
       (SELECT id FROM public.intern_weekly_reports WHERE placement_id = '00000000-0000-0000-0000-0000000000f1'), 'RETURN', 'More detail')$q$);
SELECT public.t_check('C5 the legacy open and unreviewed tasks are still there',
  (SELECT count(*) FROM public.intern_tasks WHERE placement_id = '00000000-0000-0000-0000-0000000000f1'
     AND (status IN ('ASSIGNED', 'IN_PROGRESS') OR (status = 'COMPLETED' AND review_status IS NULL))) = 2);
SELECT public.t_expect_ok('C6 HR completes the placement despite the legacy open tasks',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','  Moved abroad ')$q$);
SELECT public.t_check('C7 completed early with the reason and a COMPLETED event',
  (SELECT status = 'COMPLETED' AND ended_early AND completion_note = 'Moved abroad' AND completed_at IS NOT NULL
   FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f1')
  AND EXISTS (SELECT 1 FROM public.intern_placement_events
              WHERE placement_id = '00000000-0000-0000-0000-0000000000f1' AND event_type = 'COMPLETED'
                AND details->>'endedEarly' = 'true' AND note = 'Moved abroad' AND actor_profile_id = '00000000-0000-0000-0000-000000000001'));
SELECT public.t_expect_error('C8 a completed placement cannot be completed again',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','Again')$q$,
  'placement_not_completable');
SELECT public.t_expect_error('C9 f2 is still blocked by its submitted report',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f2',NULL)$q$,
  'placement_has_pending_reports');
SELECT public.t_expect_ok('C10 the Mentor accepts f2''s report',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',
       (SELECT id FROM public.intern_weekly_reports WHERE placement_id = '00000000-0000-0000-0000-0000000000f2'), 'ACCEPT', NULL)$q$);
SELECT public.t_expect_ok('C10b after the review, f2 completes on its planned end without a note',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f2',NULL)$q$);
SELECT public.t_check('C11 f2 completed on time',
  (SELECT status = 'COMPLETED' AND NOT ended_early FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f2'));
SELECT public.t_check('C12 the intern still reads the completed placement''s reports',
  (SELECT count(*) FROM public.list_my_weekly_reports('00000000-0000-0000-0000-000000000005')) = 1);
RESET ROLE;

SELECT public.t_check('C13 completion changed no archived task row',
  (SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id)) FROM public.intern_tasks AS t)
    = (SELECT digest FROM public.t_seed WHERE name = 'intern_tasks')
  AND (SELECT md5(string_agg(row_to_json(e)::text, '|' ORDER BY e.id)) FROM public.intern_task_events AS e)
    = (SELECT digest FROM public.t_seed WHERE name = 'intern_task_events'));
