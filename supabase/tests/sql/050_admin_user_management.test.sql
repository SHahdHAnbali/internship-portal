-- Migration 20261011030000: ADMIN role, account status, staff provisioning,
-- role changes, (de)activation, last-admin protection, first-admin bootstrap,
-- append-only admin audit trail, concurrency.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','owner@x.com'),
 ('00000000-0000-0000-0000-000000000002','admin2@x.com'),
 ('00000000-0000-0000-0000-000000000003','hr@x.com'),
 ('00000000-0000-0000-0000-000000000004','mentor-busy@x.com'),
 ('00000000-0000-0000-0000-000000000005','mentor-free@x.com'),
 ('00000000-0000-0000-0000-000000000006','applicant@x.com'),
 ('00000000-0000-0000-0000-000000000007','new-mentor@x.com'),
 ('00000000-0000-0000-0000-000000000008','late@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','Owner','owner@x.com','HR'),
 ('00000000-0000-0000-0000-000000000003','HR','hr@x.com','HR'),
 ('00000000-0000-0000-0000-000000000004','Busy Mentor','mentor-busy@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000005','Free Mentor','mentor-free@x.com','MENTOR'),
 ('00000000-0000-0000-0000-000000000006','Applicant','applicant@x.com','APPLICANT');
INSERT INTO public.applicants (id, full_name, email, auth_user_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Intern','intern@x.com',NULL);
INSERT INTO public.internships (id, title, capacity) VALUES
 ('00000000-0000-0000-0000-0000000000e1','Engineering', 3);
INSERT INTO public.applications (id, status, internship_id, requested_training, applicant_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','SELECTED','00000000-0000-0000-0000-0000000000e1',NULL,'00000000-0000-0000-0000-0000000000b1');
INSERT INTO public.intern_placements (application_id, applicant_id, internship_id, company, start_date, end_date, status, mentor_profile_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1',
  'Acme', current_date, current_date + 30, 'SCHEDULED', '00000000-0000-0000-0000-000000000004');

-- Permissions -----------------------------------------------------------------------
SET ROLE authenticated;
SELECT public.t_expect_error('P1 authenticated cannot bootstrap an admin',
  $q$SELECT * FROM public.bootstrap_first_admin('00000000-0000-0000-0000-000000000008','late@x.com',NULL,false)$q$,
  'permission denied for function bootstrap_first_admin');
SELECT public.t_expect_error('P2 authenticated cannot read the admin audit trail',
  $q$SELECT * FROM public.admin_audit_events$q$, 'permission denied for table admin_audit_events');
SELECT public.t_expect_error('P3 authenticated cannot truncate profiles',
  $q$TRUNCATE public.profiles CASCADE$q$, 'permission denied for table profiles');
SELECT public.t_expect_error('P4 authenticated cannot change roles',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','ADMIN',NULL)$q$,
  'permission denied for function admin_change_user_role');
RESET ROLE; SET ROLE anon;
SELECT public.t_expect_error('P5 anon cannot create staff',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','x@x.com','X','HR')$q$,
  'permission denied for function admin_create_staff_profile');
RESET ROLE; SET ROLE service_role;

-- First-admin bootstrap ---------------------------------------------------------------
SELECT public.t_expect_error('B1 an applicant account cannot be promoted',
  $q$SELECT * FROM public.bootstrap_first_admin('00000000-0000-0000-0000-000000000006','applicant@x.com',NULL,true)$q$,
  'profile_role_not_promotable');
SELECT public.t_expect_error('B2 promoting a staff account needs explicit confirmation',
  $q$SELECT * FROM public.bootstrap_first_admin('00000000-0000-0000-0000-000000000001','owner@x.com',NULL,false)$q$,
  'role_change_confirmation_required');
SELECT public.t_expect_error('B3 a Mentor with open placements cannot be promoted',
  $q$SELECT * FROM public.bootstrap_first_admin('00000000-0000-0000-0000-000000000004','mentor-busy@x.com',NULL,true)$q$,
  'mentor_has_open_placements');
SELECT public.t_expect_ok('B4 confirmed promotion of an existing account',
  $q$SELECT * FROM public.bootstrap_first_admin('00000000-0000-0000-0000-000000000001','owner@x.com',NULL,true)$q$);
SELECT public.t_check('B4 owner is an active ADMIN with a bootstrap event',
  (SELECT role = 'ADMIN' AND is_active FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000001')
  AND EXISTS (SELECT 1 FROM public.admin_audit_events WHERE event_type='ADMIN_BOOTSTRAPPED'
              AND target_profile_id='00000000-0000-0000-0000-000000000001' AND details->>'previousRole'='HR'));
SELECT public.t_expect_error('B5 bootstrap refuses once an admin exists',
  $q$SELECT * FROM public.bootstrap_first_admin('00000000-0000-0000-0000-000000000008','late@x.com','Late',false)$q$,
  'admin_already_exists');

-- Staff creation ------------------------------------------------------------------------
SELECT public.t_expect_error('C1 HR cannot create staff accounts',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000007','new-mentor@x.com','M','MENTOR')$q$,
  'admin_role_required');
SELECT public.t_expect_error('C2 applicant/intern roles cannot be created by admins',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','new-mentor@x.com','M','INTERN')$q$,
  'invalid_staff_role');
SELECT public.t_expect_error('C3 full name required',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','new-mentor@x.com','  ','MENTOR')$q$,
  'full_name_required');
SELECT public.t_expect_error('C4 invalid email refused',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','not-an-email','M','MENTOR')$q$,
  'invalid_email');
SELECT public.t_expect_error('C5 duplicate email refused (case-insensitive)',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','HR@X.com','M','MENTOR')$q$,
  'account_already_exists');
SELECT public.t_expect_error('C6 unknown Auth user refused',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000ff','ghost@x.com','G','MENTOR')$q$,
  'auth_user_not_found');
SELECT public.t_expect_ok('C7 admin creates a Mentor',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','  New-Mentor@X.com ','  New Mentor ','MENTOR')$q$);
SELECT public.t_check('C7 Mentor stored normalized with a creation event',
  (SELECT email='new-mentor@x.com' AND full_name='New Mentor' AND role='MENTOR' AND is_active
   FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000007')
  AND EXISTS (SELECT 1 FROM public.admin_audit_events WHERE event_type='USER_CREATED'
              AND target_profile_id='00000000-0000-0000-0000-000000000007' AND details->>'role'='MENTOR'
              AND actor_profile_id='00000000-0000-0000-0000-000000000001'));
SELECT public.t_expect_ok('C8 admin creates a second admin',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','admin2@x.com','Admin Two','ADMIN')$q$);

-- Role changes ----------------------------------------------------------------------------
SELECT public.t_expect_error('R1 an admin cannot change their own role',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','HR',NULL)$q$,
  'cannot_change_own_account');
SELECT public.t_expect_error('R2 HR cannot promote themselves',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','ADMIN',NULL)$q$,
  'admin_role_required');
SELECT public.t_expect_error('R3 applicant roles are workflow-owned',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','HR',NULL)$q$,
  'role_not_staff');
SELECT public.t_expect_error('R4 cannot assign the INTERN role',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','INTERN',NULL)$q$,
  'invalid_staff_role');
SELECT public.t_expect_error('R5 unchanged role refused',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','HR',NULL)$q$,
  'role_unchanged');
SELECT public.t_expect_error('R6 Mentor with open placements keeps the role',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','HR',NULL)$q$,
  'mentor_has_open_placements');
SELECT public.t_expect_error('R7 unknown user',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000ff','HR',NULL)$q$,
  'user_not_found');
SELECT public.t_expect_ok('R8 free Mentor becomes HR',
  $q$SELECT * FROM public.admin_change_user_role('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','HR','Moved to recruiting')$q$);
SELECT public.t_check('R8 role changed with an audited from/to and note',
  (SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000005')='HR'
  AND EXISTS (SELECT 1 FROM public.admin_audit_events WHERE event_type='ROLE_CHANGED'
              AND target_profile_id='00000000-0000-0000-0000-000000000005'
              AND details->>'fromRole'='MENTOR' AND details->>'toRole'='HR' AND note='Moved to recruiting'));

-- (De)activation ---------------------------------------------------------------------------
SELECT public.t_expect_error('A1 an admin cannot deactivate themselves',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',false,'x')$q$,
  'cannot_change_own_account');
SELECT public.t_expect_error('A2 deactivation needs a reason',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',false,'  ')$q$,
  'deactivation_reason_required');
SELECT public.t_expect_error('A3 Mentor with open placements cannot be deactivated',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004',false,'Left')$q$,
  'mentor_has_open_placements');
SELECT public.t_expect_ok('A4 deactivate HR',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',false,'Left the company')$q$);
SELECT public.t_expect_ok('A5 repeating the same state is a no-op',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',false,'again')$q$);
SELECT public.t_check('A4/A5 inactive with timestamp and exactly one deactivation event',
  (SELECT NOT is_active AND deactivated_at IS NOT NULL FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000003')
  AND (SELECT count(*) FROM public.admin_audit_events WHERE event_type='USER_DEACTIVATED'
       AND target_profile_id='00000000-0000-0000-0000-000000000003')=1);
SELECT public.t_expect_ok('A6 reactivate HR',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',true,NULL)$q$);
SELECT public.t_check('A6 active again with a reactivation event',
  (SELECT is_active AND deactivated_at IS NULL FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000003')
  AND EXISTS (SELECT 1 FROM public.admin_audit_events WHERE event_type='USER_REACTIVATED'
              AND target_profile_id='00000000-0000-0000-0000-000000000003'));
SELECT public.t_expect_ok('A7 deactivate the second admin',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',false,'Test')$q$);
SELECT public.t_expect_error('A8 an inactive admin can no longer act',
  $q$SELECT * FROM public.admin_create_staff_profile('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000008','late@x.com','Late','HR')$q$,
  'admin_role_required');
SELECT public.t_expect_ok('A9 reactivate the second admin',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',true,NULL)$q$);

SELECT public.t_expect_error('D1 deactivation timestamp must match the status',
  $q$UPDATE public.profiles SET is_active=false WHERE id='00000000-0000-0000-0000-000000000003'$q$,
  '%profiles_deactivation_consistent%');
SELECT public.t_expect_error('D2 admin audit trail is append-only',
  $q$DELETE FROM public.admin_audit_events$q$, 'permission denied for table admin_audit_events');
SELECT public.t_expect_error('D3 admin audit trail cannot be edited',
  $q$UPDATE public.admin_audit_events SET note='x'$q$, 'permission denied for table admin_audit_events');
RESET ROLE;

-- Concurrency: two admins deactivate each other at once ---------------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('admin_b', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));
SELECT dblink_exec('admin_b', 'SET ROLE service_role');

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_expect_ok('CC1 admin A deactivates admin B (uncommitted)',
  $q$SELECT * FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',false,'race')$q$);
SELECT dblink_send_query('admin_b', $q$
  SELECT is_active FROM public.admin_set_user_active('00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001', false, 'race');
$q$);
SELECT pg_sleep(0.5);
SELECT public.t_check('CC2 admin B waits for admin A', dblink_is_busy('admin_b') = 1);
COMMIT;

SELECT * FROM dblink_get_result('admin_b', false) AS r(is_active boolean);
INSERT INTO public.t_results (label, ok, detail)
SELECT 'CC3 admin B is refused once deactivated (no admin-less system)', msg LIKE '%admin_role_required%', msg
FROM (SELECT dblink_error_message('admin_b') AS msg) AS e;
SELECT dblink_disconnect('admin_b');
SELECT public.t_check('CC4 exactly one active admin remains',
  (SELECT count(*) FROM public.profiles WHERE role='ADMIN' AND is_active)=1
  AND (SELECT is_active FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000001'));

-- Deleting an Auth user keeps the audit trail (FK SET NULL runs as owner) --------------------
DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000007';
SELECT public.t_check('F1 audit rows survive account removal with the email snapshot',
  EXISTS (SELECT 1 FROM public.admin_audit_events WHERE event_type='USER_CREATED'
          AND target_profile_id IS NULL AND target_email='new-mentor@x.com'));
