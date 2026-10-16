-- Minimal reproduction of the live Supabase schema that predates the migrations
-- in supabase/migrations (those base tables were created outside migration
-- history). Mirrors the read-only catalog audit of 2026-10-10: columns,
-- constraints, indexes, RLS flags and the single profiles policy.
-- Used only by supabase/tests/run.sh on a throwaway local PostgreSQL.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Supabase's auth.uid(): the JWT subject of the current request.
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text NOT NULL,
  role text NOT NULL CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY['APPLICANT','INTERN','MENTOR','HR'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_email_unique ON public.profiles (lower(email));

CREATE TABLE public.internships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.internship_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id uuid NOT NULL CONSTRAINT internship_requirements_internship_id_key UNIQUE
    REFERENCES public.internships(id) ON DELETE CASCADE,
  required_skills text[] NOT NULL DEFAULT '{}',
  preferred_skills text[] NOT NULL DEFAULT '{}',
  minimum_education text,
  minimum_experience_years numeric,
  languages text[] NOT NULL DEFAULT '{}',
  certifications text[] NOT NULL DEFAULT '{}',
  other_requirements text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL CONSTRAINT applicants_email_key UNIQUE,
  cv_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  auth_user_id uuid CONSTRAINT applicants_auth_user_id_key UNIQUE
    REFERENCES auth.users(id) ON DELETE SET NULL,
  phone text,
  location text,
  profile_data jsonb
);

CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  internship_id uuid REFERENCES public.internships(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'NEW' CONSTRAINT applications_status_check
    CHECK (status = ANY (ARRAY['DRAFT','NEW','UNDER_REVIEW','SHORTLISTED','INTERVIEW','SELECTED','REJECTED'])),
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  cv_path text,
  extracted_data jsonb,
  review_token uuid DEFAULT gen_random_uuid(),
  submitted_at timestamptz,
  requested_training text,
  review_token_hash text,
  review_token_expires_at timestamptz,
  review_token_used_at timestamptz,
  CONSTRAINT applications_applicant_id_internship_id_key UNIQUE (applicant_id, internship_id),
  CONSTRAINT applications_training_target_check
    CHECK (internship_id IS NOT NULL OR NULLIF(TRIM(BOTH FROM requested_training), '') IS NOT NULL)
);
CREATE UNIQUE INDEX applications_review_token_hash_unique
  ON public.applications (review_token_hash) WHERE review_token_hash IS NOT NULL;
CREATE UNIQUE INDEX idx_applications_review_token ON public.applications (review_token);
CREATE INDEX idx_applications_applicant_id ON public.applications (applicant_id);
CREATE INDEX idx_applications_status ON public.applications (status);

CREATE TABLE public.application_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL CONSTRAINT application_matches_application_id_key UNIQUE
    REFERENCES public.applications(id) ON DELETE CASCADE,
  overall_score integer NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  skills_score integer, education_score integer, experience_score integer, languages_score integer,
  matched_requirements text[] NOT NULL DEFAULT '{}',
  missing_requirements text[] NOT NULL DEFAULT '{}',
  strengths text[] NOT NULL DEFAULT '{}',
  gaps text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internship_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

GRANT USAGE ON SCHEMA public, auth TO service_role, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
-- service_role is deliberately NOT granted auth.users: migrations must not
-- depend on reading Auth tables (unverified on the live project).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
