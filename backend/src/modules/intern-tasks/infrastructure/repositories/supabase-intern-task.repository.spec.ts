import { SupabaseInternTaskRepository } from './supabase-intern-task.repository.js';

const taskRow = {
  id: 'task-id',
  placement_id: 'placement-id',
  title: 'Prepare onboarding notes',
  description: 'Read the handbook',
  due_date: '2027-02-12',
  status: 'ASSIGNED',
  priority: 'MEDIUM',
  review_status: null,
  mentor_feedback: null,
  reviewed_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: 'created',
  updated_at: 'updated',
};

describe('SupabaseInternTaskRepository', () => {
  it('calls the Mentor placement-task RPC with the verified actor and placement', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [taskRow], error: null });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);

    await expect(repository.listForMentorPlacement('verified-mentor-id', 'placement-id'))
      .resolves.toMatchObject([{ id: 'task-id', placementId: 'placement-id' }]);
    expect(rpc).toHaveBeenCalledWith('list_mentor_intern_tasks', {
      p_mentor_profile_id: 'verified-mentor-id',
      p_placement_id: 'placement-id',
    });
  });

  it('lists only placements returned by the Mentor-scoped RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      placement_id: 'placement-id', intern_name: 'Intern Name', intern_email: 'intern@example.test',
      company: 'Example Co', department: null, start_date: '2027-01-01', end_date: '2027-02-01', status: 'ACTIVE',
      training_title: 'Engineering', open_tasks: 2, awaiting_review: 1, overdue_tasks: 0, accepted_tasks: 3, reports_awaiting_review: 1,
    }], error: null });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
    await expect(repository.listForMentor('verified-mentor-id')).resolves.toEqual([{
      placementId: 'placement-id', internName: 'Intern Name', internEmail: 'intern@example.test',
      company: 'Example Co', department: null, startDate: '2027-01-01', endDate: '2027-02-01', status: 'ACTIVE',
      trainingTitle: 'Engineering', openTasks: 2, awaitingReview: 1, overdueTasks: 0, acceptedTasks: 3, reportsAwaitingReview: 1,
    }]);
    expect(rpc).toHaveBeenCalledWith('list_my_mentor_placements', {
      p_mentor_profile_id: 'verified-mentor-id',
    });
  });

  it('creates tasks through the Mentor-scoped RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [taskRow], error: null });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
    await repository.createForMentor({
      mentorProfileId: 'verified-mentor-id', placementId: 'placement-id', title: 'Task',
      description: null, dueDate: null, priority: 'HIGH',
    });
    expect(rpc).toHaveBeenCalledWith('create_mentor_intern_task', {
      p_mentor_profile_id: 'verified-mentor-id', p_placement_id: 'placement-id',
      p_title: 'Task', p_description: null, p_due_date: null, p_priority: 'HIGH',
    });
  });

  it('lists Intern tasks through the authenticated-user RPC without a caller-supplied placement ID', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);

    await expect(repository.listForIntern('verified-intern-id')).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith('list_my_intern_tasks', {
      p_auth_user_id: 'verified-intern-id',
    });
  });

  it('sends only the Intern identity, task ID, and permitted status for updates', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...taskRow, status: 'IN_PROGRESS' }], error: null });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);

    await expect(repository.updateStatus('verified-intern-id', 'task-id', 'IN_PROGRESS', 'Started reading'))
      .resolves.toMatchObject({ status: 'IN_PROGRESS' });
    expect(rpc).toHaveBeenCalledWith('update_my_intern_task_status', {
      p_auth_user_id: 'verified-intern-id',
      p_task_id: 'task-id',
      p_status: 'IN_PROGRESS',
      p_note: 'Started reading',
    });
  });

  it.each([null, {}, [null], [{ ...taskRow, status: 'UNKNOWN' }], [{ ...taskRow, priority: 'URGENT' }]])(
    'rejects malformed list responses', async (data) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
      await expect(repository.listForIntern('verified-intern-id')).rejects.toMatchObject({ status: 500 });
    },
  );

  it('sends Mentor edits, cancellations and reviews with the verified Mentor', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [taskRow], error: null });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
    await repository.updateForMentor({
      mentorProfileId: 'mentor-id', taskId: 'task-id', title: 'T', description: null, dueDate: '2027-03-01', priority: 'LOW',
    });
    expect(rpc).toHaveBeenLastCalledWith('update_mentor_intern_task', {
      p_mentor_profile_id: 'mentor-id', p_task_id: 'task-id', p_title: 'T', p_description: null,
      p_due_date: '2027-03-01', p_priority: 'LOW',
    });
    await repository.cancelForMentor('mentor-id', 'task-id', 'Not needed');
    expect(rpc).toHaveBeenLastCalledWith('cancel_mentor_intern_task', {
      p_mentor_profile_id: 'mentor-id', p_task_id: 'task-id', p_reason: 'Not needed',
    });
    await repository.reviewForMentor('mentor-id', 'task-id', 'REQUEST_CHANGES', 'Add tests');
    expect(rpc).toHaveBeenLastCalledWith('review_mentor_intern_task', {
      p_mentor_profile_id: 'mentor-id', p_task_id: 'task-id', p_decision: 'REQUEST_CHANGES', p_feedback: 'Add tests',
    });
  });

  it('maps task history rows', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      id: 'e1', task_id: 'task-id', event_type: 'STARTED', from_status: 'ASSIGNED', to_status: 'IN_PROGRESS',
      details: {}, note: 'Reading', actor_name: 'Intern', actor_role: 'INTERN', created_at: 't',
    }], error: null });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
    await expect(repository.listEventsForMentorPlacement('mentor-id', 'placement-id')).resolves.toEqual([{
      id: 'e1', taskId: 'task-id', type: 'STARTED', fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS',
      details: {}, note: 'Reading', actorName: 'Intern', actorRole: 'INTERN', createdAt: 't',
    }]);
  });

  it.each([
    ['task_not_awaiting_review', 409, 'This task is not waiting for a review.'],
    ['review_feedback_required', 400, 'Explain what should change.'],
    ['task_not_found', 404, 'Task not found'],
  ])('maps %s to a clear message', async (key, status, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: key } });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
    await expect(repository.reviewForMentor('mentor-id', 'task-id', 'ACCEPT', null))
      .rejects.toMatchObject({ status, message });
  });

  it('withdraws through the intern-scoped function with only identity and task id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...taskRow, status: 'IN_PROGRESS' }], error: null });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
    await expect(repository.withdrawSubmission('verified-intern-id', 'task-id'))
      .resolves.toMatchObject({ status: 'IN_PROGRESS', reviewStatus: null });
    expect(rpc).toHaveBeenCalledWith('withdraw_my_intern_task_submission', {
      p_auth_user_id: 'verified-intern-id',
      p_task_id: 'task-id',
    });
  });

  it.each([
    ['task_not_withdrawable', 409, 'Only a submission that is still waiting for your Mentor’s review can be withdrawn.'],
    ['task_withdrawal_deadline_passed', 409, 'The due date has passed, so this submission can no longer be withdrawn.'],
    ['task_withdrawal_requires_due_date', 409, 'This task has no due date, so its submission cannot be withdrawn. Ask your Mentor if you need to change it.'],
    ['task_not_found', 404, 'Task not found'],
    ['intern_role_required', 403, 'You do not have permission to perform this action'],
  ])('maps withdrawal refusal %s', async (key, status, message) => {
    const code = status === 404 ? 'PZ404' : status === 403 ? 'PZ403' : 'PZ409';
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: key } });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
    await expect(repository.withdrawSubmission('intern-id', 'task-id')).rejects.toMatchObject({ status, message });
  });

  it('maps task state conflicts without exposing database messages', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PZ409', message: 'private task transition detail' },
    });
    const repository = new SupabaseInternTaskRepository({ client: { rpc } } as never);
    await expect(repository.updateStatus('intern-id', 'task-id', 'COMPLETED', null))
      .rejects.toMatchObject({ status: 409, message: 'The requested operation conflicts with the current state' });
  });
});
