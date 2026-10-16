-- Priority #8 foundation: intern placements.
-- Apply through the project's Supabase migration workflow.

ALTER TABLE public.applications
  ADD CONSTRAINT applications_id_applicant_id_key
  UNIQUE (id, applicant_id);

CREATE TABLE public.intern_placements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  applicant_id uuid NOT NULL,
  company text NOT NULL,
  department text NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intern_placements_pkey
    PRIMARY KEY (id),
  CONSTRAINT intern_placements_application_id_key
    UNIQUE (application_id),
  CONSTRAINT intern_placements_application_applicant_fkey
    FOREIGN KEY (application_id, applicant_id)
    REFERENCES public.applications (id, applicant_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT intern_placements_applicant_id_fkey
    FOREIGN KEY (applicant_id)
    REFERENCES public.applicants (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT intern_placements_status_check
    CHECK (status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT intern_placements_date_range_check
    CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX intern_placements_one_active_per_applicant_idx
  ON public.intern_placements (applicant_id)
  WHERE status = 'ACTIVE';

ALTER TABLE public.intern_placements ENABLE ROW LEVEL SECURITY;
