import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// There is no database test harness in this project, so this is a static
// contract check of the migration text. It does not prove runtime behavior;
// that requires applying the migration to a test database.
const sql = readFileSync(
  resolve(
    process.cwd(),
    '../supabase/migrations/20261010000000_defer_applicant_provisioning_to_review.sql',
  ),
  'utf8',
);

const functionBody = sql.slice(
  sql.indexOf('CREATE FUNCTION public.submit_application_review_v2'),
  sql.indexOf('$function$;'),
);

describe('review submission migration contract', () => {
  it('adds a normalized review_email column without destructive changes', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS review_email text NULL/);
    expect(sql).toMatch(/review_email = lower\(btrim\(review_email\)\)/);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  });

  it('defines a SECURITY INVOKER function with a pinned search_path', () => {
    expect(functionBody).toMatch(/SECURITY INVOKER/);
    expect(functionBody).not.toMatch(/SECURITY DEFINER/);
    expect(functionBody).toMatch(/SET search_path = pg_catalog, pg_temp/);
  });

  it('restricts execution to service_role and retires the previous function', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.submit_application_review_v2\(\s*text, jsonb, uuid, boolean\s*\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.submit_application_review_v2\(\s*text, jsonb, uuid, boolean\s*\) TO service_role;/,
    );
    expect(sql).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/i);
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.submit_application_review_safely\(\s*text, jsonb, uuid\s*\) FROM service_role;/,
    );
  });

  it('locks the application and consumes the token exactly once', () => {
    expect(functionBody).toMatch(/WHERE a\.review_token_hash = p_review_token_hash\s+FOR UPDATE;/);
    expect(functionBody).toMatch(/review_token_used_at IS NOT NULL THEN\s+RAISE SQLSTATE 'PZ409' USING MESSAGE = 'review_token_already_used'/);
    expect(functionBody).toMatch(/review_token_used_at = v_submitted_at/);
    expect(functionBody).toMatch(/AND a\.review_token_used_at IS NULL\s+AND a\.review_token_expires_at > v_submitted_at/);
  });

  it('enforces the immutable review email, staff refusal, and no relinking', () => {
    expect(functionBody).toMatch(/v_submitted_email <> v_review_email/);
    expect(functionBody).toMatch(/'staff_account_not_eligible'/);
    expect(functionBody).toMatch(/v_by_email\.auth_user_id IS DISTINCT FROM p_auth_user_id/);
    expect(functionBody).toMatch(/'legacy_review_owner_mismatch'/);
    expect(functionBody).toMatch(/'duplicate_application'/);
    // applicants.email is never updated by the review.
    const applicantUpdate = functionBody.slice(
      functionBody.indexOf('UPDATE public.applicants AS a'),
      functionBody.indexOf('WHERE a.id = v_applicant_id;'),
    );
    expect(applicantUpdate).not.toMatch(/\bemail\s*=/);
  });
});
