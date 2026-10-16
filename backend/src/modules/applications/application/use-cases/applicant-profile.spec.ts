import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { GetApplicantProfileUseCase } from './get-applicant-profile.use-case.js';
import { UpdateApplicantProfileUseCase } from './update-applicant-profile.use-case.js';

function supabaseStub(applicant: unknown, applications: unknown[], rpcResult: unknown = { error: null }, placements: unknown[] = []) {
  const filters: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {};
    query.select = () => query;
    // The applications query ends in .order() and is awaited directly.
    query.order = async () => ({ data: table === 'intern_placements' ? placements : applications, error: null });
    query.eq = (column: string, value: unknown) => { filters.push([table, column, value]); return query; };
    query.neq = (column: string, value: unknown) => { filters.push([table, `!${column}`, value]); return query; };
    query.maybeSingle = async () => ({ data: applicant, error: null });
    return query;
  });
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { supabase: { client: { from, rpc } } as never, filters, rpc };
}

const applicant = {
  id: 'applicant-id', full_name: 'Maya', email: 'maya@x.com', phone: null, location: 'Nablus',
  profile_data: { skills: ['SQL'] },
};

describe('GetApplicantProfileUseCase', () => {
  it('loads only the session owner\'s applicant row and non-draft applications', async () => {
    const { supabase, filters } = supabaseStub(applicant, []);
    await new GetApplicantProfileUseCase(supabase).execute('auth-user-id');
    expect(filters).toContainEqual(['applicants', 'auth_user_id', 'auth-user-id']);
    expect(filters).toContainEqual(['applications', 'applicant_id', 'applicant-id']);
    expect(filters).toContainEqual(['applications', '!status', 'DRAFT']);
  });

  it('shows the rejection reason only on rejected applications and never internal data', async () => {
    const { supabase } = supabaseStub(applicant, [
      { id: 'a1', status: 'REJECTED', applied_at: 't', submitted_at: 's', created_at: 'c', requested_training: null,
        rejection_reason: 'Missing required skills', internships: { id: 'i', title: 'Engineering' } },
      { id: 'a2', status: 'INTERVIEW', applied_at: 't', submitted_at: 's', created_at: 'c', requested_training: 'Data',
        rejection_reason: 'stale value', internships: null },
    ]);

    const profile = await new GetApplicantProfileUseCase(supabase).execute('auth-user-id');
    expect(profile.applications).toEqual([
      { id: 'a1', trainingTitle: 'Engineering', trainingType: 'INTERNSHIP', status: 'REJECTED',
        appliedAt: 't', submittedAt: 's', rejectionReason: 'Missing required skills', placement: null },
      { id: 'a2', trainingTitle: 'Data', trainingType: 'OTHER', status: 'INTERVIEW',
        appliedAt: 't', submittedAt: 's', rejectionReason: null, placement: null },
    ]);
    const serialized = JSON.stringify(profile);
    for (const forbidden of ['note', 'statusHistory', 'cv_path', 'cvUrl', 'actor']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('shows the applicant their own placement details, without Mentor or internal data', async () => {
    const { supabase, filters } = supabaseStub(applicant, [
      { id: 'a1', status: 'SELECTED', applied_at: 't', submitted_at: 's', created_at: 'c', requested_training: null,
        rejection_reason: null, internships: { id: 'i', title: 'Engineering' } },
    ], { error: null }, [
      { application_id: 'a1', status: 'SCHEDULED', company: 'Acme', department: 'R&D',
        start_date: '2026-11-01', end_date: '2027-01-31', internship: { title: 'Engineering' }, mentor_profile_id: 'secret-mentor' },
    ]);

    const profile = await new GetApplicantProfileUseCase(supabase).execute('auth-user-id');
    expect(profile.applications[0].placement).toEqual({
      status: 'SCHEDULED', company: 'Acme', department: 'R&D',
      startDate: '2026-11-01', endDate: '2027-01-31', trainingTitle: 'Engineering',
    });
    expect(JSON.stringify(profile)).not.toContain('secret-mentor');
    expect(filters).toContainEqual(['intern_placements', 'applicant_id', 'applicant-id']);
    expect(filters).toContainEqual(['intern_placements', '!status', 'CANCELLED']);
  });

  it('reports a missing applicant profile', async () => {
    const { supabase } = supabaseStub(null, []);
    await expect(new GetApplicantProfileUseCase(supabase).execute('auth-user-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UpdateApplicantProfileUseCase', () => {
  const dto = {
    fullName: 'Maya Odeh', phone: '0599', location: 'Nablus', summary: 'Hi',
    education: [], experience: [], skills: ['SQL'], languages: [], certifications: [],
    links: { linkedin: 'https://linkedin.com/in/maya', github: null, portfolio: null },
  };

  it('updates through the restricted RPC with the session identity and only allowed fields', async () => {
    const { supabase, rpc } = supabaseStub(applicant, []);
    await new UpdateApplicantProfileUseCase(supabase, new GetApplicantProfileUseCase(supabase)).execute('auth-user-id', dto as never);

    expect(rpc).toHaveBeenCalledWith('update_my_applicant_profile', {
      p_auth_user_id: 'auth-user-id',
      p_full_name: 'Maya Odeh',
      p_phone: '0599',
      p_location: 'Nablus',
      p_profile_data: {
        summary: 'Hi', education: [], experience: [], skills: ['SQL'], languages: [], certifications: [],
        links: { linkedin: 'https://linkedin.com/in/maya', github: null, portfolio: null },
      },
    });
  });

  it('maps a database role refusal to 403', async () => {
    const { supabase } = supabaseStub(applicant, [], { error: { code: 'PZ403', message: 'applicant_role_required' } });
    await expect(new UpdateApplicantProfileUseCase(supabase, new GetApplicantProfileUseCase(supabase)).execute('x', dto as never))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
