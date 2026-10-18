import { SupabaseMentorPlacementRepository } from './supabase-mentor-placement.repository.js';

const placementRow = {
  placement_id: 'placement-id',
  intern_name: 'Intern Name',
  intern_email: 'intern@example.test',
  company: 'Example Co',
  department: null,
  start_date: '2027-01-01',
  end_date: '2027-02-01',
  status: 'ACTIVE',
  training_title: 'Engineering',
  reports_awaiting_review: 1,
};

const expected = {
  placementId: 'placement-id', internName: 'Intern Name', internEmail: 'intern@example.test',
  company: 'Example Co', department: null, startDate: '2027-01-01', endDate: '2027-02-01', status: 'ACTIVE',
  trainingTitle: 'Engineering', reportsAwaitingReview: 1,
};

describe('SupabaseMentorPlacementRepository', () => {
  it('lists the verified Mentor\'s placements through the Mentor-scoped RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [placementRow], error: null });
    const repository = new SupabaseMentorPlacementRepository({ client: { rpc } } as never);
    await expect(repository.listForMentor('verified-mentor-id')).resolves.toEqual([expected]);
    expect(rpc).toHaveBeenCalledWith('list_my_mentor_placements', { p_mentor_profile_id: 'verified-mentor-id' });
  });

  it('accepts rows that still carry the retired task counts and leaves them out of the response', async () => {
    const legacyRow = { ...placementRow, open_tasks: 2, awaiting_review: 1, overdue_tasks: 0, accepted_tasks: 3 };
    const rpc = vi.fn().mockResolvedValue({ data: [legacyRow], error: null });
    const repository = new SupabaseMentorPlacementRepository({ client: { rpc } } as never);
    const [placement] = await repository.listForMentor('verified-mentor-id');
    expect(placement).toEqual(expected);
    expect(placement).not.toHaveProperty('openTasks');
  });

  it.each([
    null,
    [{ ...placementRow, status: 'PAUSED' }],
    [{ ...placementRow, reports_awaiting_review: '1' }],
    [{ ...placementRow, company: '' }],
  ])('rejects malformed results', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    const repository = new SupabaseMentorPlacementRepository({ client: { rpc } } as never);
    await expect(repository.listForMentor('verified-mentor-id')).rejects.toMatchObject({ status: 500 });
  });

  it('maps a refused role to 403 without exposing database text', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ403', message: 'mentor_role_required' } });
    const repository = new SupabaseMentorPlacementRepository({ client: { rpc } } as never);
    await expect(repository.listForMentor('someone')).rejects.toMatchObject({ status: 403 });
  });
});
