-- Migration 20261020000000: certificate details. The training is the
-- resolved internship's title (no separate classification); the actual
-- duration, the HR signatory (completing HR user) and the Mentor signatory
-- (the placement's Mentor) are copied when issued; the company is always
-- Progineer Technologies; reissue reasons are recorded on the audit events.
-- Seeded by 190_certificate_details.before-20261020000000.sql.

-- The current certificate of a placement.
CREATE FUNCTION public.t_cert(p_placement uuid) RETURNS public.internship_certificates
LANGUAGE sql AS $$
  SELECT c.* FROM public.internship_certificates AS c WHERE c.placement_id = p_placement AND c.status = 'ISSUED'
$$;

CREATE FUNCTION public.t_placement_of(p_application uuid) RETURNS uuid
LANGUAGE sql AS $$
  SELECT ip.id FROM public.intern_placements AS ip WHERE ip.application_id = p_application
$$;

-- ---------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------
SELECT public.t_check('S1 no internship type exists anywhere (the title is the training)',
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND column_name ILIKE '%internship_type%')
  AND to_regtype('public.internship_type') IS NULL
  AND NOT EXISTS (SELECT 1 FROM pg_proc AS p WHERE p.pronamespace = 'public'::regnamespace
                  AND (p.prosrc ILIKE '%internship_type%' OR coalesce(array_to_string(p.proargnames, ','), '') ILIKE '%internship_type%')));
SELECT public.t_check('S2 HR internship functions keep their applied signatures',
  to_regprocedure('public.create_training_opportunity(uuid, text, integer, text, boolean, text)') IS NOT NULL
  AND to_regprocedure('public.update_training_opportunity(uuid, uuid, text, boolean, integer, text, text)') IS NOT NULL);
SELECT public.t_check('S3 browser roles cannot execute the new or recreated functions',
  NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) AS r(role),
                            unnest(ARRAY[
                              'public.internship_certificate_details(uuid)',
                              'public.internship_certificate_duration(date, date)',
                              'public.list_hr_placement_certificates(uuid, uuid)',
                              'public.reissue_internship_certificate(uuid, uuid, text)',
                              'public.list_my_certificates(uuid)',
                              'public.get_my_certificate(uuid, uuid)']) AS f(fn)
              WHERE has_function_privilege(r.role, f.fn, 'EXECUTE')));
SELECT public.t_check('S4 service_role cannot update the new columns; browsers cannot read them',
  NOT has_column_privilege('service_role', 'public.internship_certificates', 'placement_start_date', 'UPDATE')
  AND NOT has_column_privilege('service_role', 'public.internship_certificates', 'hr_signatory_name', 'UPDATE')
  AND NOT has_column_privilege('service_role', 'public.internship_certificates', 'mentor_signatory_name', 'UPDATE')
  AND NOT has_column_privilege('service_role', 'public.internship_certificate_events', 'reason', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.internship_certificates', 'hr_signatory_name', 'SELECT')
  AND NOT has_column_privilege('anon', 'public.internship_certificate_events', 'reason', 'SELECT'));
SELECT public.t_check('S5 the certificate guard is enabled again after the one-time fill',
  (SELECT t.tgenabled FROM pg_trigger AS t
   WHERE t.tgrelid = 'public.internship_certificates'::regclass AND t.tgname = 'internship_certificates_guard') = 'O');
SELECT public.t_check('S6 reissue still accepts only actor, certificate and reason (nothing server-derived)',
  (SELECT p.proargnames FROM pg_proc AS p WHERE p.oid = 'public.reissue_internship_certificate(uuid, uuid, text)'::regprocedure)[1:3]
  = ARRAY['p_actor_profile_id', 'p_certificate_id', 'p_reason']
  AND (SELECT p.pronargs FROM pg_proc AS p WHERE p.oid = 'public.reissue_internship_certificate(uuid, uuid, text)'::regprocedure) = 3);

-- ---------------------------------------------------------------------------
-- Legacy certificates: filled once from authoritative sources only
-- ---------------------------------------------------------------------------
SELECT public.t_check('L1 legacy certificates kept every existing column and record',
  (SELECT count(*) FROM public.t_seed_certs) = 2
  AND NOT EXISTS (
    SELECT 1 FROM public.t_seed_certs AS s
    LEFT JOIN public.internship_certificates AS c ON c.id = s.id
    WHERE (c.placement_id, c.status, c.issue_kind, c.certificate_title, c.issuer_name, c.recipient_name, c.training_title,
           c.completion_date, c.placement_completed_at, c.issued_at, c.issued_by_profile_id)
          IS DISTINCT FROM
          (s.placement_id, s.status, s.issue_kind, s.certificate_title, s.issuer_name, s.recipient_name, s.training_title,
           s.completion_date, s.placement_completed_at, s.issued_at, s.issued_by_profile_id))
  AND (SELECT count(*) FROM public.internship_certificates) = 2);
SELECT public.t_check('L2 fL1: its internship title, start date, completing HR user (Hadi) and Mentor (Mona)',
  (SELECT training_title = 'Frontend Developer' AND placement_start_date = current_date - 70 AND hr_signatory_name = 'Hadi HR'
          AND mentor_signatory_name = 'Mona Mentor' AND issuer_name = 'Progineer Technologies'
   FROM public.t_cert('00000000-0000-0000-0000-00000000f0a1')));
SELECT public.t_check('L3 fL2 (no completion event, no Mentor): title kept, no signatory names made up',
  (SELECT training_title = 'Design Track' AND placement_start_date = DATE '2026-01-04'
          AND hr_signatory_name IS NULL AND mentor_signatory_name IS NULL AND completion_date = DATE '2026-03-11'
   FROM public.t_cert('00000000-0000-0000-0000-00000000f0a2')));
SET ROLE service_role;
SELECT public.t_check('L4 the legacy intern view: title, Asia/Hebron date, duration; nulls stay null',
  (SELECT training_title = 'Design Track' AND completion_date = DATE '2026-03-11' AND duration_months = 2 AND duration_days = 8
          AND hr_signatory_name IS NULL AND mentor_signatory_name IS NULL AND recipient_name = 'Intern Five'
   FROM public.get_my_certificate('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000f0a2')));

-- ---------------------------------------------------------------------------
-- Completion issues the certificate with the details
-- ---------------------------------------------------------------------------
SELECT public.t_expect_ok('C1 Hala HR completes fA',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000f00a',NULL)$q$);
SELECT public.t_expect_ok('C2 Hadi HR ends fB early',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000f00b','Moved abroad')$q$);
SELECT public.t_expect_ok('C3 an HR user without a full name ends fC on its first day',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-00000000f00c','Withdrew')$q$);
SELECT public.t_expect_ok('C4 Hala HR completes the "Other" request''s placement early',
  format($q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001', %L, 'Project ended')$q$,
         public.t_placement_of('00000000-0000-0000-0000-0000000000c7')));
RESET ROLE;
SELECT public.t_check('C5 the training title is the resolved internship''s title',
  (SELECT training_title FROM public.t_cert('00000000-0000-0000-0000-00000000f00a')) = 'Frontend Developer'
  AND (SELECT training_title FROM public.t_cert('00000000-0000-0000-0000-00000000f00c')) = 'Backend Program');
SELECT public.t_check('C6 an "Other" request linked by HR gets the linked internship''s title, not the request text',
  (SELECT training_title FROM public.t_cert(public.t_placement_of('00000000-0000-0000-0000-0000000000c7'))) = 'Backend Program');
SELECT public.t_check('C7 the HR signatory is the user who completed the placement',
  (SELECT hr_signatory_name FROM public.t_cert('00000000-0000-0000-0000-00000000f00a')) = 'Hala HR'
  AND (SELECT hr_signatory_name FROM public.t_cert('00000000-0000-0000-0000-00000000f00b')) = 'Hadi HR');
SELECT public.t_check('C8 the Mentor signatory is the Mentor of that placement',
  (SELECT mentor_signatory_name FROM public.t_cert('00000000-0000-0000-0000-00000000f00a')) = 'Majd Mentor'
  AND (SELECT mentor_signatory_name FROM public.t_cert('00000000-0000-0000-0000-00000000f00b')) = 'Mona Mentor');
SELECT public.t_check('C9 without a full name the line stays unnamed: never an email address',
  (SELECT hr_signatory_name IS NULL AND mentor_signatory_name IS NULL FROM public.t_cert('00000000-0000-0000-0000-00000000f00c'))
  AND NOT EXISTS (SELECT 1 FROM public.internship_certificates
                  WHERE hr_signatory_name LIKE '%@%' OR mentor_signatory_name LIKE '%@%'));
SELECT public.t_check('C10 the company is Progineer Technologies whatever intern_placements.company says',
  (SELECT bool_and(c.issuer_name = 'Progineer Technologies') FROM public.internship_certificates AS c)
  AND (SELECT company FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-00000000f00a') = 'Some Other Co'
  AND NOT EXISTS (SELECT 1 FROM public.internship_certificates AS c JOIN public.intern_placements AS ip ON ip.id = c.placement_id
                  WHERE c.training_title = ip.company OR c.issuer_name = ip.company));
SELECT public.t_check('C11 the completion date is completed_at in Asia/Hebron; the start date is the placement''s',
  (SELECT c.completion_date = (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date AND c.placement_start_date = ip.start_date
   FROM public.t_cert('00000000-0000-0000-0000-00000000f00a') AS c JOIN public.intern_placements AS ip ON ip.id = c.placement_id));
SET ROLE service_role;
SELECT public.t_check('C12 duration runs from the actual start to the actual completion (completion day included)',
  (SELECT r.duration_months = d.duration_months AND r.duration_days = d.duration_days
   FROM public.get_my_certificate('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-00000000f00a') AS r,
        public.internship_certificate_duration(current_date - 40, r.completion_date) AS d));
SELECT public.t_check('C13 an early completion counts the period actually completed, not the planned end',
  (SELECT r.duration_months = 0 AND r.duration_days BETWEEN 10 AND 12
   FROM public.get_my_certificate('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-00000000f00b') AS r));
SELECT public.t_check('C14 a placement completed on its first day lasted one day',
  (SELECT r.duration_months = 0 AND r.duration_days = 1
   FROM public.get_my_certificate('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-00000000f00c') AS r));
RESET ROLE;

-- Duration calculation (calendar months, then days; completion day included).
SELECT public.t_check('D1 same day = 1 day',
  (SELECT duration_months = 0 AND duration_days = 1 FROM public.internship_certificate_duration('2026-03-11', '2026-03-11')));
SELECT public.t_check('D2 15 January to 3 February (across a month boundary) = 20 days',
  (SELECT duration_months = 0 AND duration_days = 20 FROM public.internship_certificate_duration('2026-01-15', '2026-02-03')));
SELECT public.t_check('D3 1 January to 31 March = exactly 3 months',
  (SELECT duration_months = 3 AND duration_days = 0 FROM public.internship_certificate_duration('2026-01-01', '2026-03-31')));
SELECT public.t_check('D4 1 January to 30 March = 2 months and 30 days (not rounded up to 3 months)',
  (SELECT duration_months = 2 AND duration_days = 30 FROM public.internship_certificate_duration('2026-01-01', '2026-03-30')));
SELECT public.t_check('D5 more than a year = 13 months and 15 days',
  (SELECT duration_months = 13 AND duration_days = 15 FROM public.internship_certificate_duration('2025-01-01', '2026-02-15')));
SELECT public.t_check('D6 a completion before the start, or an unknown date, gives no duration',
  NOT EXISTS (SELECT 1 FROM public.internship_certificate_duration('2026-03-11', '2026-03-10'))
  AND NOT EXISTS (SELECT 1 FROM public.internship_certificate_duration(NULL, '2026-03-10')));

-- ---------------------------------------------------------------------------
-- Issued copies do not follow later changes of their sources
-- ---------------------------------------------------------------------------
SET ROLE service_role;
SELECT public.t_expect_ok('H0 HR renames the internship afterwards',
  $q$SELECT * FROM public.update_training_opportunity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',
       'Frontend Developer (React)',true,10,NULL,'NOT_APPROVED')$q$);
RESET ROLE;
UPDATE public.profiles SET full_name = 'Majd Renamed' WHERE id = '00000000-0000-0000-0000-000000000004';
UPDATE public.profiles SET full_name = 'Hala Renamed' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT public.t_check('H1 the issued certificate keeps its title and names',
  (SELECT training_title = 'Frontend Developer' AND hr_signatory_name = 'Hala HR' AND mentor_signatory_name = 'Majd Mentor'
   FROM public.t_cert('00000000-0000-0000-0000-00000000f00a')));
SET ROLE service_role;
SELECT public.t_check('H2 so does the intern''s view of it',
  (SELECT training_title = 'Frontend Developer' AND hr_signatory_name = 'Hala HR' AND mentor_signatory_name = 'Majd Mentor'
   FROM public.list_my_certificates('00000000-0000-0000-0000-000000000006')));
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Reissue: new details from the records, old version kept, reason recorded
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_old AS SELECT * FROM public.t_cert('00000000-0000-0000-0000-00000000f00a');
GRANT SELECT ON t_old TO service_role;
SET ROLE service_role;
CREATE TEMP TABLE t_new AS
  SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000003', (SELECT id FROM t_old), ' Title corrected ');
RESET ROLE;
SELECT public.t_check('R1 the new version has the current title and names; the HR signatory is still the completing user',
  (SELECT training_title = 'Frontend Developer (React)' AND mentor_signatory_name = 'Majd Renamed'
          AND hr_signatory_name = 'Hala Renamed' AND reissue_reason = 'Title corrected' AND issued_by_name = 'Hadi HR'
          AND issue_kind = 'REISSUE' AND supersedes_certificate_id = (SELECT id FROM t_old)
          AND placement_start_date = (SELECT placement_start_date FROM t_old)
          AND completion_date = (SELECT completion_date FROM t_old)
   FROM t_new));
SELECT public.t_check('R2 the old version is kept exactly as issued (title and signatory snapshots unchanged)',
  (SELECT c.status = 'SUPERSEDED' AND c.training_title = 'Frontend Developer' AND c.hr_signatory_name = 'Hala HR'
          AND c.mentor_signatory_name = 'Majd Mentor' AND c.placement_start_date = o.placement_start_date
   FROM public.internship_certificates AS c JOIN t_old AS o ON o.id = c.id));
SELECT public.t_check('R3 the reason is on both audit events of the reissue',
  (SELECT count(*) FROM public.internship_certificate_events
   WHERE reason = 'Title corrected' AND actor_profile_id = '00000000-0000-0000-0000-000000000003'
     AND ((certificate_id = (SELECT id FROM t_old) AND event_type = 'SUPERSEDED')
          OR (certificate_id = (SELECT certificate_id FROM t_new) AND event_type = 'ISSUED' AND issue_kind = 'REISSUE'))) = 2);
SELECT public.t_check('R4 one current certificate; the duration is unchanged by the reissue',
  (SELECT count(*) FROM public.internship_certificates
   WHERE placement_id = '00000000-0000-0000-0000-00000000f00a' AND status = 'ISSUED') = 1
  AND (SELECT (duration_months, duration_days) FROM t_new)
      = (SELECT (d.duration_months, d.duration_days) FROM t_old AS o, public.internship_certificate_duration(o.placement_start_date, o.completion_date) AS d));
SET ROLE service_role;
SELECT public.t_expect_sqlstate('R5 a reissue needs a reason',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000003', %L, '  ')$q$,
         (SELECT id FROM public.t_cert('00000000-0000-0000-0000-00000000f00b'))), 'PZ400', 'reissue_reason_required');
SELECT public.t_expect_sqlstate('R6 only HR may reissue (Mentor refused)',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000002', %L, 'Fix')$q$,
         (SELECT id FROM public.t_cert('00000000-0000-0000-0000-00000000f00b'))), 'PZ403', 'hr_role_required');
SELECT public.t_check('R7 reissuing a legacy certificate keeps unknown values unknown in the new record',
  (SELECT hr_signatory_name IS NULL AND mentor_signatory_name IS NULL AND training_title = 'Design Track'
   FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001',
          (SELECT c.id FROM public.internship_certificates AS c
           WHERE c.placement_id = '00000000-0000-0000-0000-00000000f0a2' AND c.status = 'ISSUED'), 'Reprint')));
SELECT public.t_check('R8 HR history shows both versions with their own titles',
  (SELECT array_agg(status || ':' || training_title || ':' || coalesce(mentor_signatory_name, '-') ORDER BY issued_at, certificate_id)
   FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000f00a'))
  = ARRAY['SUPERSEDED:Frontend Developer:Majd Mentor', 'ISSUED:Frontend Developer (React):Majd Renamed']);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Server-derived values cannot be supplied or changed
-- ---------------------------------------------------------------------------
SELECT public.t_expect_sqlstate('F1 a record with a made-up Mentor name is refused',
  $q$INSERT INTO public.internship_certificates (placement_id, issue_kind, certificate_title, issuer_name, recipient_name,
       training_title, completion_date, placement_completed_at, issued_by_profile_id,
       placement_start_date, hr_signatory_name, mentor_signatory_name, supersedes_certificate_id, reissue_reason)
     SELECT ip.id, 'REISSUE', 'Certificate of Completion', 'Progineer Technologies', 'Intern Two', 'Frontend Developer (React)',
            (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date, ip.completed_at, '00000000-0000-0000-0000-000000000001',
            ip.start_date, 'Hala Renamed', 'Someone Else', (SELECT id FROM t_old), 'x'
     FROM public.intern_placements AS ip WHERE ip.id = '00000000-0000-0000-0000-00000000f00a'$q$,
  'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('F2 or with another company',
  $q$INSERT INTO public.internship_certificates (placement_id, issue_kind, certificate_title, issuer_name, recipient_name,
       training_title, completion_date, placement_completed_at, issued_by_profile_id)
     SELECT ip.id, 'COMPLETION', 'Certificate of Completion', 'Some Other Co', 'Intern Three', 'Frontend Developer',
            (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date, ip.completed_at, '00000000-0000-0000-0000-000000000001'
     FROM public.intern_placements AS ip WHERE ip.id = '00000000-0000-0000-0000-00000000f00b'$q$,
  'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('F3 the owner cannot edit a copied name',
  $q$UPDATE public.internship_certificates SET mentor_signatory_name = 'X' WHERE placement_id = '00000000-0000-0000-0000-00000000f00b'$q$,
  'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('F4 or the start date (which fixes the duration)',
  $q$UPDATE public.internship_certificates SET placement_start_date = placement_start_date - 30 WHERE placement_id = '00000000-0000-0000-0000-00000000f00b'$q$,
  'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('F5 or an audit event''s reason',
  $q$UPDATE public.internship_certificate_events SET reason = 'Changed' WHERE reason IS NOT NULL$q$, 'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('F6 a reason cannot be attached to an ordinary issue event',
  $q$INSERT INTO public.internship_certificate_events (certificate_id, placement_id, event_type, issue_kind, actor_profile_id, reason)
     SELECT c.id, c.placement_id, 'ISSUED', 'COMPLETION', '00000000-0000-0000-0000-000000000001', 'x'
     FROM public.t_cert('00000000-0000-0000-0000-00000000f00b') AS c$q$, '23514');
SET ROLE service_role;
SELECT public.t_expect_sqlstate('F7 service_role cannot update the copied start date',
  $q$UPDATE public.internship_certificates SET placement_start_date = current_date WHERE placement_id = '00000000-0000-0000-0000-00000000f00c'$q$, '42501');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Atomicity and idempotency are unchanged
-- ---------------------------------------------------------------------------
UPDATE public.applicants SET full_name = ' ' WHERE id = '00000000-0000-0000-0000-0000000000b6';
SET ROLE service_role;
SELECT public.t_expect_sqlstate('A1 completion fails when its certificate cannot be issued',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000f00d',NULL)$q$,
  'PZ409', 'certificate_source_incomplete');
RESET ROLE;
SELECT public.t_check('A2 nothing of that completion remains',
  (SELECT status = 'ACTIVE' AND completed_at IS NULL FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-00000000f00d')
  AND NOT EXISTS (SELECT 1 FROM public.intern_placement_events WHERE placement_id = '00000000-0000-0000-0000-00000000f00d' AND event_type = 'COMPLETED')
  AND NOT EXISTS (SELECT 1 FROM public.internship_certificates WHERE placement_id = '00000000-0000-0000-0000-00000000f00d'));
SET ROLE service_role;
SELECT public.t_expect_sqlstate('A3 completing a completed placement again is refused',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000f00b','Again')$q$,
  'PZ409', 'placement_not_completable');
SELECT public.t_check('A4 issuing again returns the current certificate; still one per placement',
  public.internship_certificate_issue('00000000-0000-0000-0000-00000000f00b', NULL, 'BACKFILL')
    = (SELECT id FROM public.t_cert('00000000-0000-0000-0000-00000000f00b'))
  AND (SELECT count(*) FROM public.internship_certificates WHERE placement_id = '00000000-0000-0000-0000-00000000f00b') = 1);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Access is unchanged
-- ---------------------------------------------------------------------------
SET ROLE service_role;
SELECT public.t_expect_sqlstate('X1 the Mentor cannot read certificates',
  $q$SELECT * FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000f00b')$q$,
  'PZ403', 'hr_role_required');
SELECT public.t_expect_sqlstate('X2 ADMIN cannot read intern certificates',
  $q$SELECT * FROM public.list_my_certificates('00000000-0000-0000-0000-000000000007')$q$, 'PZ403', 'intern_role_required');
SELECT public.t_expect_sqlstate('X3 nor an applicant',
  $q$SELECT * FROM public.list_my_certificates('00000000-0000-0000-0000-00000000000d')$q$, 'PZ403', 'intern_role_required');
SELECT public.t_expect_sqlstate('X4 an intern cannot open another intern''s certificate',
  $q$SELECT * FROM public.get_my_certificate('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-00000000f00b')$q$,
  'PZ404', 'certificate_not_found');
SELECT public.t_check('X5 the intern sees only the current version: no id, reason, start date or history',
  (SELECT count(*) = 1 AND bool_and(to_jsonb(r) ?& ARRAY['training_title', 'duration_months', 'duration_days',
                                                          'hr_signatory_name', 'mentor_signatory_name']
                                    AND NOT (to_jsonb(r) ?| ARRAY['certificate_id', 'id', 'reissue_reason', 'status',
                                                                 'placement_start_date', 'supersedes_certificate_id']))
   FROM public.list_my_certificates('00000000-0000-0000-0000-000000000006') AS r)
  AND (SELECT training_title FROM public.list_my_certificates('00000000-0000-0000-0000-000000000006')) = 'Frontend Developer (React)');
RESET ROLE;
SET ROLE authenticated;
SELECT public.t_expect_sqlstate('X6 browsers cannot resolve certificate details',
  $q$SELECT * FROM public.internship_certificate_details('00000000-0000-0000-0000-00000000f00a')$q$, '42501');
SELECT public.t_expect_sqlstate('X7 or read certificate events',
  $q$SELECT * FROM public.internship_certificate_events$q$, '42501');
RESET ROLE;
