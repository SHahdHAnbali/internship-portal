-- Migration 20261019000000: certificates of completion. Issued atomically by
-- complete_intern_placement (HR), backfilled for placements completed earlier,
-- immutable, reissued only by HR with a reason, readable by the intern who
-- owns them. Seeded by 180_internship_certificates.before-20261019000000.sql
-- (profiles and placements are described there).

CREATE EXTENSION IF NOT EXISTS dblink;

-- Opens a dblink session (15 s statement timeout as a backstop), optionally as
-- p_role, and returns its backend pid.
CREATE FUNCTION public.t_open(p_name text, p_role text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_pid integer;
BEGIN
  PERFORM dblink_connect(p_name, format('host=127.0.0.1 port=%s dbname=%s user=postgres',
    current_setting('port'), current_database()));
  PERFORM dblink_exec(p_name, 'SET statement_timeout = ''15s''');
  IF p_role IS NOT NULL THEN
    PERFORM dblink_exec(p_name, 'SET ROLE ' || quote_ident(p_role));
  END IF;
  SELECT t.pid INTO v_pid FROM dblink(p_name, 'SELECT pg_backend_pid()') AS t(pid integer);
  RETURN v_pid;
END $$;

-- Outcome of an async query, or a timeout with lock evidence (never blocks).
CREATE FUNCTION public.t_finish(p_name text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  IF public.t_wait_idle(p_name) THEN
    RETURN public.t_dblink_outcome(p_name);
  END IF;
  RETURN 'timeout ' || public.t_lock_snapshot();
END $$;

-- Number of certificates of a placement (all, or with the given status).
CREATE FUNCTION public.t_certs(p_placement uuid, p_status text DEFAULT NULL) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer FROM public.internship_certificates AS c
  WHERE c.placement_id = p_placement AND (p_status IS NULL OR c.status = p_status)
$$;

-- The current certificate of a placement.
CREATE FUNCTION public.t_current(p_placement uuid) RETURNS public.internship_certificates
LANGUAGE sql AS $$
  SELECT c.* FROM public.internship_certificates AS c WHERE c.placement_id = p_placement AND c.status = 'ISSUED'
$$;

-- ---------------------------------------------------------------------------
-- Schema, privileges and function properties
-- ---------------------------------------------------------------------------
SELECT public.t_check('S1 both tables exist with row level security enabled',
  (SELECT bool_and(c.relrowsecurity) AND count(*) = 2 FROM pg_class AS c
   WHERE c.oid IN ('public.internship_certificates'::regclass, 'public.internship_certificate_events'::regclass)));
-- Since 20261020000000 the signatories' names are copied (approved); still no
-- number, signature image, logo or stamp.
SELECT public.t_check('S2 no certificate number, signature, logo or stamp is stored (signatory names only)',
  NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name IN ('internship_certificates', 'internship_certificate_events')
                AND column_name ~ '(number|serial|code|signature|logo|stamp|seal|image)')
  AND (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('internship_certificates', 'internship_certificate_events')
         AND column_name ~ 'signat') = ARRAY['hr_signatory_name', 'mentor_signatory_name']);
-- Since 20261020000000 events also record the reissue reason (approved).
SELECT public.t_check('S3 the audit events hold metadata and the reissue reason only (no names or titles)',
  (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'internship_certificate_events')
  = ARRAY['actor_profile_id','certificate_id','created_at','event_type','id','issue_kind','placement_id','reason']);
SELECT public.t_check('S4 browser roles hold no privilege on either table',
  NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) AS r(role),
                            unnest(ARRAY['public.internship_certificates','public.internship_certificate_events']) AS t(tbl)
              WHERE has_any_column_privilege(r.role, t.tbl, 'SELECT, INSERT, UPDATE, REFERENCES')
                 OR has_table_privilege(r.role, t.tbl, 'DELETE, TRUNCATE, TRIGGER')));
SELECT public.t_check('S5 service_role cannot rewrite the copied data or delete anything',
  NOT has_column_privilege('service_role', 'public.internship_certificates', 'recipient_name', 'UPDATE')
  AND NOT has_column_privilege('service_role', 'public.internship_certificates', 'training_title', 'UPDATE')
  AND NOT has_column_privilege('service_role', 'public.internship_certificates', 'completion_date', 'UPDATE')
  AND NOT has_column_privilege('service_role', 'public.internship_certificates', 'issued_by_profile_id', 'UPDATE')
  AND has_column_privilege('service_role', 'public.internship_certificates', 'status', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.internship_certificates', 'DELETE, TRUNCATE')
  AND NOT has_any_column_privilege('service_role', 'public.internship_certificate_events', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.internship_certificate_events', 'DELETE, TRUNCATE'));
SELECT public.t_check('S6 certificate functions: SECURITY INVOKER, pinned search_path, service_role only',
  (SELECT bool_and(NOT p.prosecdef
                   AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
                   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                   AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
          AND count(*) = 9
   FROM pg_proc AS p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('internship_certificates_guard','internship_certificates_require_successor',
                       'internship_certificate_events_guard','internship_certificate_issue',
                       'list_hr_placement_certificates','reissue_internship_certificate',
                       'list_my_certificates','get_my_certificate','complete_intern_placement')));
SELECT public.t_check('S7 completion issues the certificate and never consults evaluations',
  (SELECT p.prosrc LIKE '%internship_certificate_issue(p_placement_id, p_actor_profile_id, ''COMPLETION'')%'
          AND p.prosrc NOT ILIKE '%evaluation%'
   FROM pg_proc AS p WHERE p.oid = 'public.complete_intern_placement(uuid, uuid, text)'::regprocedure)
  AND (SELECT p.prosrc NOT ILIKE '%evaluation%' FROM pg_proc AS p
       WHERE p.oid = 'public.internship_certificate_issue(uuid, uuid, text)'::regprocedure));
SELECT public.t_check('S8 intern functions return no certificate id, reason or history',
  (SELECT bool_and(NOT (p.proargnames && ARRAY['certificate_id','id','reissue_reason','supersedes_certificate_id',
                                                'status','issue_kind','issued_by_name','superseded_at']))
   FROM pg_proc AS p WHERE p.oid IN ('public.list_my_certificates(uuid)'::regprocedure,
                                     'public.get_my_certificate(uuid, uuid)'::regprocedure)));

-- ---------------------------------------------------------------------------
-- Backfill (placements completed before the migration)
-- ---------------------------------------------------------------------------
SELECT public.t_check('B1 f1 (completed through the portal) was backfilled with HR as issuer',
  (SELECT c.status = 'ISSUED' AND c.issue_kind = 'BACKFILL' AND c.issued_by_profile_id = '00000000-0000-0000-0000-000000000001'
          AND c.placement_completed_at = ip.completed_at
          AND c.completion_date = (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date
   FROM public.internship_certificates AS c JOIN public.intern_placements AS ip ON ip.id = c.placement_id
   WHERE c.placement_id = '00000000-0000-0000-0000-0000000000f1')
  AND public.t_certs('00000000-0000-0000-0000-0000000000f1') = 1);
SELECT public.t_check('B2 f1 copies the fixed wording, the applicant name and the training title',
  (SELECT certificate_title = 'Certificate of Completion' AND issuer_name = 'Progineer Technologies'
          AND recipient_name = 'Intern One' AND training_title = 'Engineering'
   FROM public.t_current('00000000-0000-0000-0000-0000000000f1')));
SELECT public.t_check('B3 f9 (no completion event) was backfilled without an issuer profile',
  (SELECT issue_kind = 'BACKFILL' AND issued_by_profile_id IS NULL
          AND recipient_name = 'Intern Five' AND training_title = 'Data Analysis'
   FROM public.t_current('00000000-0000-0000-0000-0000000000f9')));
SELECT public.t_check('B4 completion date is the Asia/Hebron date (22:30 UTC on 10 March is 11 March)',
  (SELECT completion_date = DATE '2026-03-11' AND placement_completed_at = TIMESTAMPTZ '2026-03-10 22:30:00+00'
   FROM public.t_current('00000000-0000-0000-0000-0000000000f9')));
SELECT public.t_check('B5 one ISSUED BACKFILL event per backfilled certificate, same actor',
  (SELECT count(*) = 2 AND bool_and(e.event_type = 'ISSUED' AND e.issue_kind = 'BACKFILL'
                                    AND e.actor_profile_id IS NOT DISTINCT FROM c.issued_by_profile_id
                                    AND e.placement_id = c.placement_id)
   FROM public.internship_certificate_events AS e JOIN public.internship_certificates AS c ON c.id = e.certificate_id));

-- ---------------------------------------------------------------------------
-- No certificate before the official completion
-- ---------------------------------------------------------------------------
SELECT public.t_check('C0 active placements have no certificate',
  public.t_certs('00000000-0000-0000-0000-0000000000f2') = 0
  AND public.t_certs('00000000-0000-0000-0000-0000000000f3') = 0
  AND public.t_certs('00000000-0000-0000-0000-0000000000f4') = 0
  AND (SELECT count(*) FROM public.internship_certificates) = 2);
SET ROLE service_role;
SELECT public.t_check('C1 the intern of an active placement lists no certificate',
  (SELECT count(*) FROM public.list_my_certificates('00000000-0000-0000-0000-000000000006')) = 0);
SELECT public.t_expect_sqlstate('C2 nor can they open one',
  $q$SELECT * FROM public.get_my_certificate('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000f2')$q$,
  'PZ404', 'certificate_not_found');
SELECT public.t_expect_sqlstate('C3 the issuing helper refuses an active placement',
  $q$SELECT public.internship_certificate_issue('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000001','COMPLETION')$q$,
  'PZ409', 'placement_not_completed');
SELECT public.t_expect_sqlstate('C4 a direct insert for an active placement is refused',
  $q$INSERT INTO public.internship_certificates (placement_id, issue_kind, certificate_title, issuer_name, recipient_name,
       training_title, completion_date, placement_completed_at, issued_by_profile_id)
     VALUES ('00000000-0000-0000-0000-0000000000f2','COMPLETION','Certificate of Completion','Progineer Technologies',
       'Intern Two','Engineering', current_date, now(), '00000000-0000-0000-0000-000000000001')$q$,
  'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('C5 a refused completion (Mentor) issues nothing',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f2',NULL)$q$,
  'PZ403', 'hr_role_required');
SELECT public.t_expect_sqlstate('C6 a refused early completion (no reason) issues nothing',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3',' ')$q$,
  'PZ400', 'early_end_reason_required');
RESET ROLE;
SELECT public.t_check('C7 still no certificate for f2 or f3',
  public.t_certs('00000000-0000-0000-0000-0000000000f2') = 0 AND public.t_certs('00000000-0000-0000-0000-0000000000f3') = 0);

-- ---------------------------------------------------------------------------
-- Issued with the completion (no evaluation needed; early end eligible)
-- ---------------------------------------------------------------------------
SELECT public.t_check('N0 neither f2 nor f3 has any Mentor evaluation',
  NOT EXISTS (SELECT 1 FROM public.intern_evaluations
              WHERE placement_id IN ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f3')));
SET ROLE service_role;
SELECT public.t_expect_ok('N1 HR completes f2',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f2',NULL)$q$);
RESET ROLE;
SELECT public.t_check('N2 one COMPLETION certificate, copied from the applicant and the training, issued by HR',
  (SELECT c.issue_kind = 'COMPLETION' AND c.status = 'ISSUED' AND c.issued_by_profile_id = '00000000-0000-0000-0000-000000000001'
          AND c.certificate_title = 'Certificate of Completion' AND c.issuer_name = 'Progineer Technologies'
          AND c.recipient_name = 'Intern Two' AND c.training_title = 'Engineering'
          AND c.supersedes_certificate_id IS NULL AND c.reissue_reason IS NULL AND c.superseded_at IS NULL
   FROM public.t_current('00000000-0000-0000-0000-0000000000f2') AS c)
  AND public.t_certs('00000000-0000-0000-0000-0000000000f2') = 1);
SELECT public.t_check('N3 the date is the official completion in Asia/Hebron',
  (SELECT c.placement_completed_at = ip.completed_at AND c.completion_date = (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date
   FROM public.t_current('00000000-0000-0000-0000-0000000000f2') AS c
   JOIN public.intern_placements AS ip ON ip.id = c.placement_id));
SELECT public.t_check('N4 the placement completion itself is unchanged (status, note, early flag, event)',
  (SELECT status = 'COMPLETED' AND NOT ended_early AND completion_note IS NULL
   FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f2')
  AND (SELECT count(*) FROM public.intern_placement_events
       WHERE placement_id = '00000000-0000-0000-0000-0000000000f2' AND event_type = 'COMPLETED'
         AND actor_profile_id = '00000000-0000-0000-0000-000000000001') = 1);
SELECT public.t_check('N5 one ISSUED COMPLETION event by HR',
  (SELECT count(*) FROM public.internship_certificate_events
   WHERE placement_id = '00000000-0000-0000-0000-0000000000f2' AND event_type = 'ISSUED' AND issue_kind = 'COMPLETION'
     AND actor_profile_id = '00000000-0000-0000-0000-000000000001') = 1);
SET ROLE service_role;
SELECT public.t_expect_ok('N6 HR ends f3 early with a reason',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f3','Moved abroad')$q$);
RESET ROLE;
SELECT public.t_check('N7 an early completion gets its certificate too',
  (SELECT ip.ended_early FROM public.intern_placements AS ip WHERE ip.id = '00000000-0000-0000-0000-0000000000f3')
  AND (SELECT issue_kind = 'COMPLETION' AND recipient_name = 'Intern Three' AND training_title = 'Data Analysis'
       FROM public.t_current('00000000-0000-0000-0000-0000000000f3')));
SELECT public.t_check('N8 still no evaluation was needed or created',
  NOT EXISTS (SELECT 1 FROM public.intern_evaluations
              WHERE placement_id IN ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f3')));

-- ---------------------------------------------------------------------------
-- Atomicity: if the certificate cannot be issued, the completion rolls back
-- ---------------------------------------------------------------------------
UPDATE public.applicants SET full_name = '   ' WHERE id = '00000000-0000-0000-0000-0000000000b4';
SET ROLE service_role;
SELECT public.t_expect_sqlstate('A1 completion fails when the certificate cannot be issued',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f4',NULL)$q$,
  'PZ409', 'certificate_source_incomplete');
RESET ROLE;
SELECT public.t_check('A2 the placement stays ACTIVE with no completion data',
  (SELECT status = 'ACTIVE' AND completed_at IS NULL AND ended_early IS NULL AND completion_note IS NULL
   FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f4'));
SELECT public.t_check('A3 no completion event, certificate or certificate event was kept',
  NOT EXISTS (SELECT 1 FROM public.intern_placement_events
              WHERE placement_id = '00000000-0000-0000-0000-0000000000f4' AND event_type = 'COMPLETED')
  AND public.t_certs('00000000-0000-0000-0000-0000000000f4') = 0
  AND NOT EXISTS (SELECT 1 FROM public.internship_certificate_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f4'));
UPDATE public.applicants SET full_name = 'Intern Four' WHERE id = '00000000-0000-0000-0000-0000000000b4';

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
UPDATE public.applicants SET full_name = 'Intern One Renamed' WHERE id = '00000000-0000-0000-0000-0000000000b1';
UPDATE public.internships SET title = 'Software Engineering' WHERE id = '00000000-0000-0000-0000-0000000000e1';
SELECT public.t_check('I1 later name and title changes do not alter issued certificates',
  (SELECT recipient_name = 'Intern One' AND training_title = 'Engineering' FROM public.t_current('00000000-0000-0000-0000-0000000000f1'))
  AND (SELECT recipient_name = 'Intern Two' AND training_title = 'Engineering' FROM public.t_current('00000000-0000-0000-0000-0000000000f2')));
SET ROLE service_role;
SELECT public.t_check('I2 the intern still sees the name as issued',
  (SELECT recipient_name = 'Intern One' FROM public.list_my_certificates('00000000-0000-0000-0000-000000000005')));
SELECT public.t_expect_sqlstate('I3 service_role cannot update the copied name',
  $q$UPDATE public.internship_certificates SET recipient_name = 'X' WHERE placement_id = '00000000-0000-0000-0000-0000000000f1'$q$,
  '42501');
SELECT public.t_expect_sqlstate('I4 service_role cannot delete a certificate',
  $q$DELETE FROM public.internship_certificates WHERE placement_id = '00000000-0000-0000-0000-0000000000f1'$q$, '42501');
SELECT public.t_expect_sqlstate('I5 service_role cannot update an audit event',
  $q$UPDATE public.internship_certificate_events SET actor_profile_id = NULL$q$, '42501');
RESET ROLE;
SELECT public.t_expect_sqlstate('I6 not even the owner can change the copied data',
  $q$UPDATE public.internship_certificates SET recipient_name = 'X' WHERE placement_id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('I7 or the completion date',
  $q$UPDATE public.internship_certificates SET completion_date = completion_date + 1 WHERE placement_id = '00000000-0000-0000-0000-0000000000f2'$q$,
  'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('I8 or delete a certificate',
  $q$DELETE FROM public.internship_certificates WHERE placement_id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('I9 or truncate the certificates (with their events)',
  $q$TRUNCATE public.internship_certificates CASCADE$q$, 'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('I10 or change, delete or truncate audit events',
  $q$UPDATE public.internship_certificate_events SET actor_profile_id = NULL$q$, 'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('I11 (delete)',
  $q$DELETE FROM public.internship_certificate_events$q$, 'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('I12 (truncate)',
  $q$TRUNCATE public.internship_certificate_events$q$, 'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('I13 superseding needs superseded_at',
  $q$UPDATE public.internship_certificates SET status = 'SUPERSEDED' WHERE placement_id = '00000000-0000-0000-0000-0000000000f2'$q$,
  'PZ409', 'certificate_immutable');
BEGIN;
SET CONSTRAINTS public.internship_certificates_require_successor IMMEDIATE;
SET LOCAL ROLE service_role;
SELECT public.t_expect_sqlstate('I14 a certificate cannot be superseded without a reissue',
  $q$UPDATE public.internship_certificates SET status = 'SUPERSEDED', superseded_at = now()
     WHERE placement_id = '00000000-0000-0000-0000-0000000000f2' AND status = 'ISSUED'$q$,
  'PZ409', 'certificate_immutable');
COMMIT;
SELECT public.t_check('I15 nothing changed: 4 certificates, all ISSUED, 4 events',
  (SELECT count(*) = 4 AND bool_and(status = 'ISSUED') FROM public.internship_certificates)
  AND (SELECT count(*) FROM public.internship_certificate_events) = 4);

-- ---------------------------------------------------------------------------
-- One current certificate per placement; issuing is idempotent
-- ---------------------------------------------------------------------------
SELECT public.t_expect_sqlstate('U1 a second ISSUED certificate for a placement is refused',
  $q$INSERT INTO public.internship_certificates (placement_id, issue_kind, certificate_title, issuer_name, recipient_name,
       training_title, completion_date, placement_completed_at, issued_by_profile_id,
       placement_start_date, hr_signatory_name, mentor_signatory_name)
     SELECT ip.id, 'COMPLETION', 'Certificate of Completion', 'Progineer Technologies', 'Intern Two', 'Engineering',
            (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date, ip.completed_at, '00000000-0000-0000-0000-000000000001',
            d.placement_start_date, d.hr_signatory_name, d.mentor_signatory_name
     FROM public.intern_placements AS ip
     CROSS JOIN LATERAL public.internship_certificate_details(ip.id) AS d
     WHERE ip.id = '00000000-0000-0000-0000-0000000000f2'$q$,
  '23505');
SET ROLE service_role;
SELECT public.t_check('U2 issuing again returns the existing certificate unchanged',
  public.internship_certificate_issue('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000001','COMPLETION')
    = (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f2'))
  AND public.internship_certificate_issue('00000000-0000-0000-0000-0000000000f2', NULL, 'BACKFILL')
    = (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f2')));
SELECT public.t_check('U3 still one certificate and one event for f2',
  public.t_certs('00000000-0000-0000-0000-0000000000f2') = 1
  AND (SELECT count(*) FROM public.internship_certificate_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f2') = 1);
SELECT public.t_expect_sqlstate('U4 the helper only issues COMPLETION or BACKFILL',
  $q$SELECT public.internship_certificate_issue('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000001','REISSUE')$q$,
  'PZ400', 'certificate_issue_kind_invalid');
SELECT public.t_expect_sqlstate('U5 completing an already completed placement is still refused',
  $q$SELECT * FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f2',NULL)$q$,
  'PZ409', 'placement_not_completable');

-- ---------------------------------------------------------------------------
-- Reissue: HR only, with a reason; supersedes and preserves the old record
-- ---------------------------------------------------------------------------
SELECT public.t_expect_sqlstate('RE1 the Mentor cannot reissue',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000002', %L, 'Fix')$q$,
         (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f1'))), 'PZ403', 'hr_role_required');
SELECT public.t_expect_sqlstate('RE2 ADMIN does not inherit HR',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000007', %L, 'Fix')$q$,
         (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f1'))), 'PZ403', 'hr_role_required');
SELECT public.t_expect_sqlstate('RE3 the intern cannot reissue their own certificate',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000005', %L, 'Fix')$q$,
         (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f1'))), 'PZ403', 'hr_role_required');
SELECT public.t_expect_sqlstate('RE4 a reason is required',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001', %L, NULL)$q$,
         (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f1'))), 'PZ400', 'reissue_reason_required');
SELECT public.t_expect_sqlstate('RE5 a blank reason is not a reason',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001', %L, '   ')$q$,
         (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f1'))), 'PZ400', 'reissue_reason_required');
SELECT public.t_expect_sqlstate('RE6 the reason is limited to 1000 characters',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001', %L, repeat('x', 1001))$q$,
         (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f1'))), 'PZ400', 'reissue_reason_too_long');
SELECT public.t_expect_sqlstate('RE7 an unknown certificate is reported',
  $q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000ff','Fix')$q$,
  'PZ404', 'certificate_not_found');
RESET ROLE;
SELECT public.t_check('RE8 refused reissues changed nothing',
  public.t_certs('00000000-0000-0000-0000-0000000000f1') = 1
  AND (SELECT count(*) FROM public.internship_certificate_events) = 4);
CREATE TEMP TABLE t_old AS SELECT * FROM public.t_current('00000000-0000-0000-0000-0000000000f1');
GRANT SELECT ON t_old TO service_role;
SET ROLE service_role;
CREATE TEMP TABLE t_reissued AS
  SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001',
    (SELECT id FROM t_old), '  Name corrected after a records update  ');
RESET ROLE;
SELECT public.t_check('RE9 HR reissue returns the new record from the current source data',
  (SELECT count(*) = 1 AND bool_and(r.issue_kind = 'REISSUE' AND r.status = 'ISSUED'
          AND r.recipient_name = 'Intern One Renamed' AND r.training_title = 'Software Engineering'
          AND r.certificate_title = 'Certificate of Completion' AND r.issuer_name = 'Progineer Technologies'
          AND r.reissue_reason = 'Name corrected after a records update'
          AND r.supersedes_certificate_id = (SELECT id FROM t_old)
          AND r.completion_date = (SELECT completion_date FROM t_old)
          AND r.issued_by_name = 'HR' AND r.superseded_at IS NULL)
   FROM t_reissued AS r));
SELECT public.t_check('RE10 the old record is preserved exactly as issued, only marked SUPERSEDED',
  (SELECT c.status = 'SUPERSEDED' AND c.superseded_at IS NOT NULL
          AND (c.placement_id, c.issue_kind, c.certificate_title, c.issuer_name, c.recipient_name, c.training_title,
               c.completion_date, c.placement_completed_at, c.issued_at, c.issued_by_profile_id)
          = (o.placement_id, o.issue_kind, o.certificate_title, o.issuer_name, o.recipient_name, o.training_title,
             o.completion_date, o.placement_completed_at, o.issued_at, o.issued_by_profile_id)
   FROM public.internship_certificates AS c JOIN t_old AS o ON o.id = c.id));
SELECT public.t_check('RE11 exactly one current certificate for f1 (the new one) and two records in all',
  public.t_certs('00000000-0000-0000-0000-0000000000f1', 'ISSUED') = 1
  AND public.t_certs('00000000-0000-0000-0000-0000000000f1') = 2
  AND (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f1')) = (SELECT certificate_id FROM t_reissued));
SELECT public.t_check('RE12 events: SUPERSEDED for the old, ISSUED/REISSUE for the new, both by HR with the reason',
  (SELECT count(*) FROM public.internship_certificate_events
   WHERE certificate_id = (SELECT id FROM t_old) AND event_type = 'SUPERSEDED' AND issue_kind IS NULL
     AND actor_profile_id = '00000000-0000-0000-0000-000000000001'
     AND reason = 'Name corrected after a records update') = 1
  AND (SELECT count(*) FROM public.internship_certificate_events
       WHERE certificate_id = (SELECT certificate_id FROM t_reissued) AND event_type = 'ISSUED' AND issue_kind = 'REISSUE'
         AND actor_profile_id = '00000000-0000-0000-0000-000000000001'
         AND reason = 'Name corrected after a records update') = 1
  AND NOT EXISTS (SELECT 1 FROM public.internship_certificate_events
                  WHERE reason IS NOT NULL AND issue_kind IS DISTINCT FROM 'REISSUE' AND event_type <> 'SUPERSEDED')
  AND (SELECT count(*) FROM public.internship_certificate_events) = 6);
SET ROLE service_role;
SELECT public.t_expect_sqlstate('RE13 a superseded record cannot be reissued again',
  format($q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001', %L, 'Again')$q$,
         (SELECT id FROM t_old)), 'PZ409', 'certificate_not_current');
RESET ROLE;
SELECT public.t_expect_sqlstate('RE14 a superseded record cannot become current again',
  format($q$UPDATE public.internship_certificates SET status = 'ISSUED', superseded_at = NULL WHERE id = %L$q$,
         (SELECT id FROM t_old)), 'PZ409', 'certificate_immutable');
SELECT public.t_expect_sqlstate('RE15 a reissue cannot point at a current record',
  $q$INSERT INTO public.internship_certificates (placement_id, issue_kind, certificate_title, issuer_name, recipient_name,
       training_title, completion_date, placement_completed_at, issued_by_profile_id, supersedes_certificate_id, reissue_reason)
     SELECT ip.id, 'REISSUE', 'Certificate of Completion', 'Progineer Technologies', 'X', 'Y',
            (ip.completed_at AT TIME ZONE 'Asia/Hebron')::date, ip.completed_at, '00000000-0000-0000-0000-000000000001',
            (SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f3')), 'Forged'
     FROM public.intern_placements AS ip WHERE ip.id = '00000000-0000-0000-0000-0000000000f3'$q$,
  'PZ409', 'certificate_immutable');

-- ---------------------------------------------------------------------------
-- HR reads a placement's certificates
-- ---------------------------------------------------------------------------
SET ROLE service_role;
SELECT public.t_check('H1 HR lists current and superseded records, oldest first, with reason and issuer',
  (SELECT array_agg(status || ':' || issue_kind || ':' || coalesce(reissue_reason, '-') || ':' || coalesce(issued_by_name, '-')
                    ORDER BY issued_at, certificate_id)
   FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1'))
  = ARRAY['SUPERSEDED:BACKFILL:-:HR', 'ISSUED:REISSUE:Name corrected after a records update:HR']);
SELECT public.t_check('H2 a backfill without an issuer shows no issuer name',
  (SELECT issued_by_name IS NULL AND completion_date = DATE '2026-03-11'
   FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f9')));
SELECT public.t_check('H3 an active placement has none',
  (SELECT count(*) FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f4')) = 0);
SELECT public.t_expect_sqlstate('H4 unknown placement',
  $q$SELECT * FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000ff')$q$,
  'PZ404', 'placement_not_found');
SELECT public.t_expect_sqlstate('H5 the Mentor cannot list certificates',
  $q$SELECT * FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000f1')$q$,
  'PZ403', 'hr_role_required');
SELECT public.t_expect_sqlstate('H6 nor ADMIN',
  $q$SELECT * FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000f1')$q$,
  'PZ403', 'hr_role_required');
SELECT public.t_expect_sqlstate('H7 nor the intern',
  $q$SELECT * FROM public.list_hr_placement_certificates('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000f1')$q$,
  'PZ403', 'hr_role_required');

-- ---------------------------------------------------------------------------
-- Interns see only their own current certificate
-- ---------------------------------------------------------------------------
SELECT public.t_check('O1 Intern One sees one certificate: the current (reissued) one for f1',
  (SELECT count(*) = 1 AND bool_and(placement_id = '00000000-0000-0000-0000-0000000000f1'
          AND recipient_name = 'Intern One Renamed' AND training_title = 'Software Engineering'
          AND certificate_title = 'Certificate of Completion' AND issuer_name = 'Progineer Technologies')
   FROM public.list_my_certificates('00000000-0000-0000-0000-000000000005')));
SELECT public.t_check('O2 Intern Two sees only f2; Intern Four (not completed) sees nothing',
  (SELECT array_agg(placement_id) FROM public.list_my_certificates('00000000-0000-0000-0000-000000000006'))
    = ARRAY['00000000-0000-0000-0000-0000000000f2'::uuid]
  AND (SELECT count(*) FROM public.list_my_certificates('00000000-0000-0000-0000-000000000009')) = 0);
SELECT public.t_check('O3 Intern One opens their own certificate by placement',
  (SELECT recipient_name = 'Intern One Renamed' AND completion_date = (SELECT completion_date FROM t_reissued)
   FROM public.get_my_certificate('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000f1')));
SELECT public.t_expect_sqlstate('O4 but not another intern''s certificate',
  $q$SELECT * FROM public.get_my_certificate('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000f2')$q$,
  'PZ404', 'certificate_not_found');
SELECT public.t_expect_sqlstate('O5 an unknown placement looks the same',
  $q$SELECT * FROM public.get_my_certificate('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000ff')$q$,
  'PZ404', 'certificate_not_found');
SELECT public.t_check('O6 the result carries no certificate id (keyed by placement)',
  (SELECT to_jsonb(r) - ARRAY['placement_id','certificate_title','issuer_name','recipient_name','training_title',
                              'completion_date','issued_at','duration_months','duration_days',
                              'hr_signatory_name','mentor_signatory_name'] = '{}'::jsonb
   FROM public.get_my_certificate('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000f1') AS r));

-- ---------------------------------------------------------------------------
-- Other roles are refused
-- ---------------------------------------------------------------------------
SELECT public.t_expect_sqlstate('X1 HR cannot use the intern functions',
  $q$SELECT * FROM public.list_my_certificates('00000000-0000-0000-0000-000000000001')$q$, 'PZ403', 'intern_role_required');
SELECT public.t_expect_sqlstate('X2 nor the Mentor',
  $q$SELECT * FROM public.list_my_certificates('00000000-0000-0000-0000-000000000002')$q$, 'PZ403', 'intern_role_required');
SELECT public.t_expect_sqlstate('X3 nor ADMIN',
  $q$SELECT * FROM public.get_my_certificate('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000f1')$q$,
  'PZ403', 'intern_role_required');
SELECT public.t_expect_sqlstate('X4 nor an applicant',
  $q$SELECT * FROM public.list_my_certificates('00000000-0000-0000-0000-00000000000d')$q$, 'PZ403', 'intern_role_required');
SELECT public.t_expect_sqlstate('X5 nor an unknown user',
  $q$SELECT * FROM public.list_my_certificates('00000000-0000-0000-0000-0000000000ff')$q$, 'PZ403', 'intern_role_required');
RESET ROLE;
SET ROLE authenticated;
SELECT public.t_expect_sqlstate('X6 browsers cannot read certificates',
  $q$SELECT * FROM public.internship_certificates$q$, '42501');
SELECT public.t_expect_sqlstate('X7 or certificate events',
  $q$SELECT * FROM public.internship_certificate_events$q$, '42501');
SELECT public.t_expect_sqlstate('X8 or call the intern function',
  $q$SELECT * FROM public.list_my_certificates('00000000-0000-0000-0000-000000000005')$q$, '42501');
SELECT public.t_expect_sqlstate('X9 or reissue',
  $q$SELECT * FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000ff','x')$q$,
  '42501');
RESET ROLE;
SET ROLE anon;
SELECT public.t_expect_sqlstate('X10 nor can anonymous visitors',
  $q$SELECT * FROM public.get_my_certificate('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000f1')$q$, '42501');
SELECT public.t_expect_sqlstate('X11 (table)',
  $q$SELECT * FROM public.internship_certificates$q$, '42501');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Concurrency (dblink sessions; bounded lock-wait barriers)
-- ---------------------------------------------------------------------------
-- K1: two HR reissues of the same current certificate. The second waits for
-- the placement lock, then finds the record superseded.
CREATE TEMP TABLE t_pids AS SELECT public.t_open('a', 'service_role') AS a, public.t_open('b', 'service_role') AS b;
CREATE TEMP TABLE t_k1 AS SELECT id FROM public.t_current('00000000-0000-0000-0000-0000000000f2');
SELECT dblink_exec('a', 'BEGIN');
SELECT * FROM dblink('a', format($q$SELECT certificate_id::text FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001', %L, 'First')$q$,
                                 (SELECT id FROM t_k1))) AS t(v text);
SELECT dblink_send_query('b', format($q$SELECT certificate_id::text FROM public.reissue_internship_certificate('00000000-0000-0000-0000-000000000001', %L, 'Second')$q$,
                                     (SELECT id FROM t_k1)));
SELECT public.t_check('K1 the second reissue waits for the first', public.t_wait_blocked((SELECT b FROM t_pids)));
SELECT dblink_exec('a', 'COMMIT');
CREATE TEMP TABLE t_k1_outcome AS SELECT public.t_finish('b') AS outcome;
INSERT INTO public.t_results (label, ok, detail)
SELECT 'K2 the second reissue is refused as not current', outcome LIKE 'error:%certificate_not_current%', outcome FROM t_k1_outcome;
SELECT public.t_check('K3 one current certificate, two records, the winner''s reason, three events',
  public.t_certs('00000000-0000-0000-0000-0000000000f2', 'ISSUED') = 1
  AND public.t_certs('00000000-0000-0000-0000-0000000000f2') = 2
  AND (SELECT reissue_reason FROM public.t_current('00000000-0000-0000-0000-0000000000f2')) = 'First'
  AND (SELECT count(*) FROM public.internship_certificate_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f2') = 3);

-- K4: two HR completions of f4. The second waits for the application lock,
-- then finds the placement completed; exactly one certificate is issued.
SELECT dblink_exec('a', 'BEGIN');
SELECT * FROM dblink('a', $q$SELECT status FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f4',NULL)$q$) AS t(v text);
SELECT dblink_send_query('b', $q$SELECT status FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f4',NULL)$q$);
SELECT public.t_check('K4 the second completion waits for the first', public.t_wait_blocked((SELECT b FROM t_pids)));
SELECT public.t_check('K5 the uncommitted completion and certificate are invisible to others',
  public.t_certs('00000000-0000-0000-0000-0000000000f4') = 0);
SELECT dblink_exec('a', 'COMMIT');
CREATE TEMP TABLE t_k4_outcome AS SELECT public.t_finish('b') AS outcome;
INSERT INTO public.t_results (label, ok, detail)
SELECT 'K6 the second completion is refused', outcome LIKE 'error:%placement_not_completable%', outcome FROM t_k4_outcome;
SELECT public.t_check('K7 one completion event and one COMPLETION certificate (with the restored name)',
  (SELECT count(*) FROM public.intern_placement_events
   WHERE placement_id = '00000000-0000-0000-0000-0000000000f4' AND event_type = 'COMPLETED') = 1
  AND public.t_certs('00000000-0000-0000-0000-0000000000f4') = 1
  AND (SELECT issue_kind = 'COMPLETION' AND recipient_name = 'Intern Four' FROM public.t_current('00000000-0000-0000-0000-0000000000f4')));

-- K8: a completion rolled back by its caller leaves no certificate.
RESET ROLE;
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c5','SELECTED','00000000-0000-0000-0000-0000000000e2',NULL,'00000000-0000-0000-0000-0000000000b4');
INSERT INTO public.intern_placements (id, application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000b4',
  '00000000-0000-0000-0000-0000000000e2','Acme', current_date - 60, current_date - 1, 'ACTIVE', '00000000-0000-0000-0000-000000000002');
SELECT dblink_exec('a', 'BEGIN');
SELECT * FROM dblink('a', $q$SELECT status FROM public.complete_intern_placement('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f5',NULL)$q$) AS t(v text);
SELECT dblink_exec('a', 'ROLLBACK');
SELECT public.t_check('K8 a rolled-back completion leaves the placement ACTIVE and no certificate',
  (SELECT status = 'ACTIVE' FROM public.intern_placements WHERE id = '00000000-0000-0000-0000-0000000000f5')
  AND public.t_certs('00000000-0000-0000-0000-0000000000f5') = 0
  AND NOT EXISTS (SELECT 1 FROM public.internship_certificate_events WHERE placement_id = '00000000-0000-0000-0000-0000000000f5'));

SELECT dblink_disconnect('a');
SELECT dblink_disconnect('b');
