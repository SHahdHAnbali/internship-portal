-- Assertion helpers for supabase/tests/sql/*.test.sql. SECURITY INVOKER, so
-- statements run with the role active at call time (SET ROLE service_role etc.).

CREATE TABLE public.t_results (n serial, label text, ok boolean, detail text);
GRANT ALL ON public.t_results TO PUBLIC;
GRANT USAGE ON SEQUENCE public.t_results_n_seq TO PUBLIC;

CREATE FUNCTION public.t_hash(t text) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

-- Passes when p_sql raises an error whose message equals (or LIKE-matches) p_expected.
CREATE FUNCTION public.t_expect_error(p_label text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO public.t_results(label, ok, detail)
      VALUES (p_label, false, 'expected error ' || p_expected || ' but succeeded');
    RETURN;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.t_results(label, ok, detail)
      VALUES (p_label, SQLERRM = p_expected OR SQLERRM LIKE p_expected, SQLSTATE || ' ' || SQLERRM);
  END;
END $$;

CREATE FUNCTION public.t_expect_ok(p_label text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  INSERT INTO public.t_results(label, ok, detail) VALUES (p_label, true, 'ok');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.t_results(label, ok, detail) VALUES (p_label, false, SQLSTATE || ' ' || SQLERRM);
END $$;

CREATE FUNCTION public.t_check(p_label text, p_cond boolean)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.t_results(label, ok, detail)
  VALUES (p_label, coalesce(p_cond, false),
          CASE WHEN coalesce(p_cond, false) THEN 'ok' ELSE 'condition false' END)
$$;

GRANT EXECUTE ON FUNCTION public.t_hash(text), public.t_expect_error(text, text, text),
  public.t_expect_ok(text, text), public.t_check(text, boolean) TO PUBLIC;

-- Passes when p_sql raises an error with SQLSTATE p_sqlstate and, if given,
-- exactly the message p_message.
CREATE FUNCTION public.t_expect_sqlstate(p_label text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO public.t_results(label, ok, detail)
      VALUES (p_label, false, 'expected SQLSTATE ' || p_sqlstate || ' but succeeded');
    RETURN;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.t_results(label, ok, detail)
      VALUES (p_label, SQLSTATE = p_sqlstate AND (p_message IS NULL OR SQLERRM = p_message),
              SQLSTATE || ' ' || SQLERRM);
  END;
END $$;

-- Concurrency barriers for dblink tests (bounded; never wait forever).
-- True once backend p_pid is waiting on a lock held by another backend.
CREATE FUNCTION public.t_wait_blocked(p_pid integer, p_timeout interval DEFAULT '10 seconds')
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_deadline timestamptz := clock_timestamp() + p_timeout;
BEGIN
  LOOP
    IF cardinality(pg_blocking_pids(p_pid)) > 0 THEN RETURN true; END IF;
    IF clock_timestamp() >= v_deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
END $$;

-- True once the dblink connection has finished its query.
CREATE FUNCTION public.t_wait_idle(p_conn text, p_timeout interval DEFAULT '20 seconds')
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_deadline timestamptz := clock_timestamp() + p_timeout;
BEGIN
  LOOP
    IF dblink_is_busy(p_conn) = 0 THEN RETURN true; END IF;
    IF clock_timestamp() >= v_deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
END $$;

-- Result of an async dblink query that returns one text column:
-- 'ok:<value>' or 'error:<message>'.
CREATE FUNCTION public.t_dblink_outcome(p_conn text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_value text;
  v_message text;
BEGIN
  SELECT r.v INTO v_value FROM dblink_get_result(p_conn, false) AS r(v text);
  v_message := dblink_error_message(p_conn);
  PERFORM 1 FROM dblink_get_result(p_conn, false) AS r(v text);
  IF v_message IS NOT NULL AND v_message <> 'OK' AND v_message <> '' THEN
    RETURN 'error:' || v_message;
  END IF;
  RETURN 'ok:' || coalesce(v_value, '');
END $$;

-- Evidence for a failed or timed-out concurrency scenario: waiting sessions,
-- their wait events and blockers (query text truncated).
CREATE FUNCTION public.t_lock_snapshot()
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(format('pid=%s state=%s wait=%s/%s blocked_by=%s query=%s',
           a.pid, a.state, a.wait_event_type, a.wait_event, pg_blocking_pids(a.pid),
           left(regexp_replace(coalesce(a.query, ''), '\s+', ' ', 'g'), 80)), ' | ' ORDER BY a.pid), 'no sessions')
  FROM pg_stat_activity AS a
  WHERE a.datname = current_database() AND a.pid <> pg_backend_pid()
$$;

GRANT EXECUTE ON FUNCTION public.t_expect_sqlstate(text, text, text, text), public.t_wait_blocked(integer, interval),
  public.t_wait_idle(text, interval), public.t_dblink_outcome(text), public.t_lock_snapshot() TO PUBLIC;
