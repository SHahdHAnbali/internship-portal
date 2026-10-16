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
