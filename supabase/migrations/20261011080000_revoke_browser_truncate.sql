-- Final hardening: browser roles never need TRUNCATE, TRIGGER or REFERENCES on
-- the base tables created before migration history (TRUNCATE ignores RLS).
-- All runtime access goes through the backend's service_role client; this
-- changes no service_role privilege and no RLS policy.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.applicants,
  public.application_matches,
  public.applications,
  public.intern_placements,
  public.internship_requirements,
  public.internships
FROM PUBLIC, anon, authenticated;
