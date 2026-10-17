-- Migration 20261017020000: profiles.password_set_at and mark_my_password_set.

INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-000000000001','user@x.com'),
 ('00000000-0000-0000-0000-000000000002','other@x.com'),
 ('00000000-0000-0000-0000-000000000003','off@x.com');
INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','User','user@x.com','INTERN'),
 ('00000000-0000-0000-0000-000000000002','Other','other@x.com','HR'),
 ('00000000-0000-0000-0000-000000000003','Off','off@x.com','MENTOR');
UPDATE public.profiles SET is_active = false, deactivated_at = now() WHERE id = '00000000-0000-0000-0000-000000000003';

SELECT public.t_check('C1 existing and new profiles start with password setup required (NULL)',
  (SELECT bool_and(password_set_at IS NULL) FROM public.profiles));

-- Browser roles ---------------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
SELECT public.t_check('B1 a signed-in user reads their own password_set_at',
  (SELECT count(*) FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001' AND password_set_at IS NULL) = 1);
SELECT public.t_check('B2 and only their own row',
  (SELECT count(*) FROM public.profiles) = 1);
SELECT public.t_expect_error('B3 a signed-in user cannot set the flag directly',
  $q$UPDATE public.profiles SET password_set_at = now() WHERE id = '00000000-0000-0000-0000-000000000001'$q$,
  'permission denied for table profiles');
SELECT public.t_expect_error('B4 nor call the function',
  $q$SELECT public.mark_my_password_set('00000000-0000-0000-0000-000000000001')$q$,
  'permission denied for function mark_my_password_set');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT public.t_expect_error('B5 anonymous callers cannot call the function',
  $q$SELECT public.mark_my_password_set('00000000-0000-0000-0000-000000000001')$q$,
  'permission denied for function mark_my_password_set');
RESET ROLE;

-- Backend (service_role) ----------------------------------------------------------------------------
SET ROLE service_role;
SELECT public.t_expect_ok('S1 the backend records the setup for the verified profile',
  $q$SELECT public.mark_my_password_set('00000000-0000-0000-0000-000000000001')$q$);
SELECT public.t_check('S2 only that profile is stamped',
  (SELECT password_set_at IS NOT NULL FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001')
  AND (SELECT password_set_at IS NULL FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002'));
RESET ROLE;
CREATE TEMP TABLE t_first AS
  SELECT password_set_at FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001';
GRANT SELECT ON t_first TO service_role;
SELECT pg_sleep(0.01);
SET ROLE service_role;
SELECT public.t_expect_ok('S3 repeating it (retry or later password change) is safe',
  $q$SELECT public.mark_my_password_set('00000000-0000-0000-0000-000000000001')$q$);
SELECT public.t_check('S4 a repeat moves the timestamp forward and changes nothing else',
  (SELECT password_set_at > (SELECT password_set_at FROM t_first) FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001')
  AND (SELECT role = 'INTERN' AND is_active FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'));
SELECT public.t_expect_error('S5 an unknown profile is refused',
  $q$SELECT public.mark_my_password_set('00000000-0000-0000-0000-0000000000ff')$q$, 'profile_not_found');
SELECT public.t_expect_error('S6 a deactivated profile is refused',
  $q$SELECT public.mark_my_password_set('00000000-0000-0000-0000-000000000003')$q$, 'profile_not_found');
SELECT public.t_check('S7 the deactivated profile is unchanged',
  (SELECT password_set_at IS NULL FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000003'));
RESET ROLE;
