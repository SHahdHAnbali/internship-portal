-- Migration 20261011060000: intern weekly reports (one per week, states,
-- Mentor review, drafts private, history, dashboard count).

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
 ('00000000-0000-0000-0000-0000000000b2','Intern Two','intern2@x.com','00000000-0000-0000-0000-000000000006');
INSERT INTO public.internships (id, title, capacity) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 5);
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000c2','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b2');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 20, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000e1','Acme', current_date - 20, current_date + 30, 'ACTIVE', '00000000-0000-0000-0000-000000000003');

CREATE TEMP TABLE w AS SELECT date_trunc('week', current_date)::date AS this_week;
GRANT SELECT ON w TO service_role, authenticated;

-- Permissions --------------------------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 authenticated cannot read reports',
  $q$SELECT * FROM public.intern_weekly_reports$q$, 'permission denied for table intern_weekly_reports');
SELECT public.t_expect_error('P2 authenticated cannot save reports',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week FROM w),'x',NULL,NULL,NULL)$q$,
  'permission denied for function save_my_weekly_report');
RESET ROLE; SET ROLE service_role;

-- Saving drafts ----------------------------------------------------------------------------------
SELECT public.t_expect_error('S1 week must start on a Monday',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week + 1 FROM w),'x',NULL,NULL,NULL)$q$,
  'invalid_report_week');
SELECT public.t_expect_error('S2 future weeks cannot be reported',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week + 7 FROM w),'x',NULL,NULL,NULL)$q$,
  'report_week_outside_placement');
SELECT public.t_expect_error('S3 weeks before the placement cannot be reported',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week - 35 FROM w),'x',NULL,NULL,NULL)$q$,
  'report_week_outside_placement');
SELECT public.t_expect_error('S4 only interns write reports',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT this_week FROM w),'x',NULL,NULL,NULL)$q$,
  'intern_role_required');
SELECT public.t_expect_ok('S5 save a draft without a summary',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week - 7 FROM w),NULL,' Learned SQL ',NULL,NULL)$q$);
SELECT public.t_expect_error('S6 a draft needs a summary before submission',
  $q$SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_weekly_reports LIMIT 1))$q$,
  'report_summary_required');
SELECT public.t_expect_ok('S7 saving the same week edits the draft (one report per week)',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week - 7 FROM w),'Set up the project','Learned SQL',NULL,'Write tests')$q$);
SELECT public.t_check('S7 one report, CREATED then UPDATED',
  (SELECT count(*) FROM public.intern_weekly_reports)=1
  AND (SELECT array_agg(event_type ORDER BY created_at, id) FROM public.intern_weekly_report_events)=ARRAY['CREATED','UPDATED']);

-- Drafts are private ---------------------------------------------------------------------------------
SELECT public.t_check('V1 the Mentor does not see drafts',
  (SELECT count(*) FROM public.list_mentor_weekly_reports('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1'))=0);
SELECT public.t_expect_error('V2 the Mentor cannot review a draft',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports LIMIT 1),'ACCEPT',NULL)$q$,
  'report_not_found');
SELECT public.t_expect_error('V3 another intern cannot submit it',
  $q$SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000006',(SELECT id FROM public.intern_weekly_reports LIMIT 1))$q$,
  'report_not_found');

-- Submission and review -------------------------------------------------------------------------------
SELECT public.t_expect_ok('R1 intern submits',
  $q$SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_weekly_reports LIMIT 1))$q$);
SELECT public.t_expect_error('R2 a submitted report is locked for the intern',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week - 7 FROM w),'Changed',NULL,NULL,NULL)$q$,
  'report_not_editable');
SELECT public.t_check('R3 Mentor dashboard shows one report awaiting review',
  (SELECT reports_awaiting_review FROM public.list_my_mentor_placements('00000000-0000-0000-0000-000000000002'))=1);
SELECT public.t_expect_error('R4 another Mentor cannot review it',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000003',(SELECT id FROM public.intern_weekly_reports LIMIT 1),'ACCEPT',NULL)$q$,
  'report_not_found');
SELECT public.t_expect_error('R5 returning needs feedback',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports LIMIT 1),'RETURN',' ')$q$,
  'review_feedback_required');
SELECT public.t_expect_ok('R6 Mentor returns the report',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports LIMIT 1),'RETURN','Add what blocked you')$q$);
SELECT public.t_expect_error('R7 a returned report keeps its summary',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week - 7 FROM w),'  ',NULL,NULL,NULL)$q$,
  'report_summary_required');
SELECT public.t_expect_ok('R8 intern edits the returned report',
  $q$SELECT * FROM public.save_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT this_week - 7 FROM w),'Set up the project','Learned SQL','Docker networking','Write tests')$q$);
SELECT public.t_expect_ok('R9 and resubmits',
  $q$SELECT * FROM public.submit_my_weekly_report('00000000-0000-0000-0000-000000000005',(SELECT id FROM public.intern_weekly_reports LIMIT 1))$q$);
SELECT public.t_expect_ok('R10 Mentor accepts',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports LIMIT 1),'ACCEPT','Good week')$q$);
SELECT public.t_expect_error('R11 accepted reports are final',
  $q$SELECT * FROM public.review_mentor_weekly_report('00000000-0000-0000-0000-000000000002',(SELECT id FROM public.intern_weekly_reports LIMIT 1),'RETURN','x')$q$,
  'report_not_awaiting_review');
SELECT public.t_check('R12 full history in order with the Mentor feedback',
  (SELECT array_agg(event_type ORDER BY created_at, id) FROM public.intern_weekly_report_events)
    = ARRAY['CREATED','UPDATED','SUBMITTED','RETURNED','UPDATED','SUBMITTED','ACCEPTED']
  AND EXISTS (SELECT 1 FROM public.intern_weekly_report_events WHERE event_type='RETURNED' AND note='Add what blocked you'
              AND actor_profile_id='00000000-0000-0000-0000-000000000002')
  AND (SELECT status='ACCEPTED' AND mentor_feedback='Good week' AND challenges='Docker networking' FROM public.intern_weekly_reports));
SELECT public.t_check('R13 intern list shows the report; the other intern sees none',
  (SELECT count(*) FROM public.list_my_weekly_reports('00000000-0000-0000-0000-000000000005'))=1
  AND (SELECT count(*) FROM public.list_my_weekly_reports('00000000-0000-0000-0000-000000000006'))=0);

-- Integrity -----------------------------------------------------------------------------------------------
SELECT public.t_expect_error('I1 one report per placement and week',
  $q$INSERT INTO public.intern_weekly_reports (placement_id, week_start) SELECT '00000000-0000-0000-0000-0000000000f1', this_week - 7 FROM w$q$,
  '%intern_weekly_reports_one_per_week%');
SELECT public.t_expect_error('I2 report history is append-only',
  $q$DELETE FROM public.intern_weekly_report_events$q$, 'permission denied for table intern_weekly_report_events');
SELECT public.t_expect_error('I3 reports cannot be deleted',
  $q$DELETE FROM public.intern_weekly_reports$q$, 'permission denied for table intern_weekly_reports');
RESET ROLE;
