-- Backfill missing applicant profile data from the applicant's own reviewed
-- submission (owner-approved 2026-10-17).
--
-- Why: applications submitted through the pre-repository legacy flow stored
-- the applicant-reviewed data in applications.extracted_data but never wrote
-- applicants.profile_data, so the applicant/intern profile shows no summary,
-- education, experience, skills, languages, certifications or links. For a
-- non-DRAFT application, extracted_data is the applicant-reviewed submission
-- (see the column comment from 20261011000000). The current submission
-- function (submit_application_review_v2) already writes profile_data and is
-- not changed here.
--
-- Safety:
-- * Fill-only: only applicants whose profile_data IS NULL are updated; any
--   non-NULL value (even '{}' or incomplete) is left exactly as it is. The
--   condition is re-checked by the UPDATE itself, so a concurrent submission
--   that writes profile_data first is never overwritten.
-- * Source: only the applicant's own applications (applications.applicant_id),
--   never matched by name or email; never a DRAFT (unreviewed AI extraction);
--   only with a recorded submitted_at and an extracted_data JSON object that
--   has at least one section of the expected type.
-- * Several eligible submissions: the latest by submitted_at, then created_at,
--   then id (descending) for a deterministic choice.
-- * Shape: the same seven keys submit_application_review_v2 writes. A section
--   whose JSON type does not match (summary: string; links: object; the
--   others: array) becomes null instead of being copied, so the profile view
--   never receives an unexpected structure. Nothing is invented.
-- * Only applicants.profile_data changes: no other column, table, function,
--   grant or policy. Re-running it changes nothing. The notice reports a count
--   only, never personal data.

DO $backfill$
DECLARE
  v_count integer;
BEGIN
  WITH eligible AS (
    SELECT DISTINCT ON (ap.applicant_id)
      ap.applicant_id,
      ap.extracted_data AS d
    FROM public.applications AS ap
    WHERE ap.applicant_id IS NOT NULL
      AND ap.status <> 'DRAFT'
      AND ap.submitted_at IS NOT NULL
      AND ap.extracted_data IS NOT NULL
      AND jsonb_typeof(ap.extracted_data) = 'object'
      AND (
        jsonb_typeof(ap.extracted_data->'summary') = 'string'
        OR jsonb_typeof(ap.extracted_data->'education') = 'array'
        OR jsonb_typeof(ap.extracted_data->'experience') = 'array'
        OR jsonb_typeof(ap.extracted_data->'skills') = 'array'
        OR jsonb_typeof(ap.extracted_data->'languages') = 'array'
        OR jsonb_typeof(ap.extracted_data->'certifications') = 'array'
        OR jsonb_typeof(ap.extracted_data->'links') = 'object'
      )
    ORDER BY ap.applicant_id, ap.submitted_at DESC, ap.created_at DESC, ap.id DESC
  )
  UPDATE public.applicants AS a
  SET profile_data = jsonb_build_object(
    'summary', CASE WHEN jsonb_typeof(e.d->'summary') = 'string' THEN e.d->'summary' END,
    'education', CASE WHEN jsonb_typeof(e.d->'education') = 'array' THEN e.d->'education' END,
    'experience', CASE WHEN jsonb_typeof(e.d->'experience') = 'array' THEN e.d->'experience' END,
    'skills', CASE WHEN jsonb_typeof(e.d->'skills') = 'array' THEN e.d->'skills' END,
    'languages', CASE WHEN jsonb_typeof(e.d->'languages') = 'array' THEN e.d->'languages' END,
    'certifications', CASE WHEN jsonb_typeof(e.d->'certifications') = 'array' THEN e.d->'certifications' END,
    'links', CASE WHEN jsonb_typeof(e.d->'links') = 'object' THEN e.d->'links' END
  )
  FROM eligible AS e
  WHERE a.id = e.applicant_id
    AND a.profile_data IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'applicant profile_data backfilled for % applicant(s)', v_count;
END
$backfill$;
