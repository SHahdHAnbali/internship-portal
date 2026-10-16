-- Migration 20261011080000 and overall browser-role boundary: no table
-- (t_results is the test harness's own table.)
-- writes, no TRUNCATE, no callable public functions.

SELECT public.t_check('B1 browser roles hold no TRUNCATE on any public table',
  NOT EXISTS (SELECT 1 FROM pg_class c
              WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname <> 't_results'
                AND (has_table_privilege('anon', c.oid, 'TRUNCATE') OR has_table_privilege('authenticated', c.oid, 'TRUNCATE'))));
SELECT public.t_check('B2 browser roles cannot write any public table',
  NOT EXISTS (SELECT 1 FROM pg_class c
              WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname <> 't_results'
                AND (has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE')
                     OR has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE'))));
SELECT public.t_check('B3 no public function is executable by browser roles',
  NOT EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace AND p.proname NOT LIKE 't\_%'
                AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))));
SELECT public.t_check('B4 every public table has RLS enabled',
  NOT EXISTS (SELECT 1 FROM pg_class c
              WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity
                AND c.relname <> 't_results'));
