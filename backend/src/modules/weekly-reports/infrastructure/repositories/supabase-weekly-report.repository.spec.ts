import { SupabaseWeeklyReportRepository } from './supabase-weekly-report.repository.js';

const reportRow = {
  id: 'report-id',
  placement_id: 'placement-id',
  week_start: '2026-10-05',
  summary: 'Built the API',
  learnings: null,
  challenges: null,
  next_week_plan: null,
  status: 'SUBMITTED',
  submitted_at: 's',
  mentor_feedback: null,
  reviewed_at: null,
  created_at: 'c',
  updated_at: 'u',
};

describe('SupabaseWeeklyReportRepository', () => {
  it('saves drafts for the verified intern and the given week', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...reportRow, status: 'DRAFT' }], error: null });
    const repository = new SupabaseWeeklyReportRepository({ client: { rpc } } as never);
    await expect(repository.saveForIntern('intern-id', '2026-10-05', {
      summary: 'Built the API', learnings: null, challenges: 'Docker', nextWeekPlan: null,
    })).resolves.toMatchObject({ id: 'report-id', weekStart: '2026-10-05', status: 'DRAFT' });
    expect(rpc).toHaveBeenCalledWith('save_my_weekly_report', {
      p_auth_user_id: 'intern-id', p_week_start: '2026-10-05', p_summary: 'Built the API',
      p_learnings: null, p_challenges: 'Docker', p_next_week_plan: null,
    });
  });

  it('submits, lists and reviews through the scoped functions', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [reportRow], error: null });
    const repository = new SupabaseWeeklyReportRepository({ client: { rpc } } as never);
    await repository.submitForIntern('intern-id', 'report-id');
    expect(rpc).toHaveBeenLastCalledWith('submit_my_weekly_report', { p_auth_user_id: 'intern-id', p_report_id: 'report-id' });
    await repository.listForMentorPlacement('mentor-id', 'placement-id');
    expect(rpc).toHaveBeenLastCalledWith('list_mentor_weekly_reports', { p_mentor_profile_id: 'mentor-id', p_placement_id: 'placement-id' });
    await repository.reviewForMentor('mentor-id', 'report-id', 'RETURN', 'More detail');
    expect(rpc).toHaveBeenLastCalledWith('review_mentor_weekly_report', {
      p_mentor_profile_id: 'mentor-id', p_report_id: 'report-id', p_decision: 'RETURN', p_feedback: 'More detail',
    });
  });

  it.each([
    ['report_week_outside_placement', 409, 'You can only report weeks of your placement that have already started.'],
    ['report_not_editable', 409, 'This report has been submitted and can no longer be changed.'],
    ['report_summary_required', 400, 'Write a summary of your week before submitting.'],
    ['placement_not_active', 409, 'Weekly reports can only be changed while the placement is active.'],
    ['invalid_review_decision', 400, 'Choose whether to accept the report or return it.'],
    ['placement_not_assigned_to_mentor', 404, 'Placement not found'],
  ])('maps %s', async (key, status, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: key } });
    const repository = new SupabaseWeeklyReportRepository({ client: { rpc } } as never);
    await expect(repository.submitForIntern('intern-id', 'report-id')).rejects.toMatchObject({ status, message });
  });

  it.each([null, [{ ...reportRow, status: 'PUBLISHED' }], [{ ...reportRow, week_start: null }]])(
    'rejects malformed results', async (data) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      const repository = new SupabaseWeeklyReportRepository({ client: { rpc } } as never);
      await expect(repository.listForIntern('intern-id')).rejects.toMatchObject({ status: 500 });
    },
  );
});
