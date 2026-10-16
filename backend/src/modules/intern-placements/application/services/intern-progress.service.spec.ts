import { InternProgressService } from './intern-progress.service.js';

const row = {
  placement_id: 'p1', application_id: 'a1', intern_name: 'Intern', intern_email: 'i@example.test',
  training_title: 'Engineering', company: 'Acme', department: null, start_date: '2026-09-01', end_date: '2026-12-01',
  status: 'ACTIVE', mentor_name: 'Mentor', mentor_active: true,
  tasks_total: 4, tasks_open: 2, tasks_overdue: 1, tasks_awaiting_review: 1, tasks_accepted: 1,
  reports_expected: 6, reports_submitted: 5, reports_accepted: 4, reports_returned: 1,
  last_report_week: '2026-10-05', last_activity_at: '2026-10-10T10:00:00Z',
};

describe('InternProgressService', () => {
  it('calls the HR-scoped function with the verified actor and maps counts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const service = new InternProgressService({ client: { rpc } } as never);
    await expect(service.list('hr-id')).resolves.toEqual([expect.objectContaining({
      placementId: 'p1',
      tasks: { total: 4, open: 2, overdue: 1, awaitingReview: 1, accepted: 1 },
      reports: { expected: 6, submitted: 5, accepted: 4, returned: 1, lastWeek: '2026-10-05' },
    })]);
    expect(rpc).toHaveBeenCalledWith('list_hr_intern_progress', { p_actor_profile_id: 'hr-id' });
  });

  it('maps a non-HR refusal to 403 and rejects malformed rows', async () => {
    const refused = new InternProgressService({ client: { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ403', message: 'hr_role_required' } }) } } as never);
    await expect(refused.list('x')).rejects.toMatchObject({ status: 403 });
    const malformed = new InternProgressService({ client: { rpc: vi.fn().mockResolvedValue({ data: [{ ...row, tasks_open: '2' }], error: null }) } } as never);
    await expect(malformed.list('x')).rejects.toMatchObject({ status: 500 });
  });
});
