import { ConflictException } from '@nestjs/common';
import { SupabaseInternPlacementRepository } from './supabase-intern-placement.repository.js';

const placementRow = {
  id: 'placement-id',
  application_id: 'application-id',
  applicant_id: 'applicant-id',
  internship_id: 'internship-id',
  company: 'Example Company',
  department: null,
  start_date: '2027-01-10',
  end_date: '2027-04-10',
  status: 'SCHEDULED',
  mentor_profile_id: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: 'created',
  updated_at: 'updated',
} as const;

describe('SupabaseInternPlacementRepository RPC adapter', () => {
  it('lists eligible Mentors through the HR RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'mentor-id', full_name: 'Mentor Name', email: 'mentor@example.test', open_placements: 2 }], error: null,
    });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.listMentors('verified-hr-id')).resolves.toEqual([{
      id: 'mentor-id', fullName: 'Mentor Name', email: 'mentor@example.test', openPlacements: 2,
    }]);
    expect(rpc).toHaveBeenCalledWith('list_hr_mentors', { p_actor_profile_id: 'verified-hr-id' });
  });

  it('assigns a Mentor using the verified HR actor', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...placementRow, mentor_profile_id: 'mentor-id' }], error: null });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.assignMentor('verified-hr-id', 'placement-id', 'mentor-id'))
      .resolves.toMatchObject({ id: 'placement-id', mentorProfileId: 'mentor-id' });
    expect(rpc).toHaveBeenCalledWith('assign_intern_placement_mentor', {
      p_actor_profile_id: 'verified-hr-id',
      p_placement_id: 'placement-id',
      p_mentor_profile_id: 'mentor-id',
    });
  });

  it('removes a Mentor with an optional reason using the verified HR actor', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [placementRow], error: null });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.unassignMentor('verified-hr-id', 'placement-id', 'On leave'))
      .resolves.toMatchObject({ id: 'placement-id', mentorProfileId: null });
    expect(rpc).toHaveBeenCalledWith('unassign_intern_placement_mentor', {
      p_actor_profile_id: 'verified-hr-id',
      p_placement_id: 'placement-id',
      p_note: 'On leave',
    });
  });

  it.each([
    ['mentor_inactive', 'This Mentor’s account is deactivated, so they cannot be assigned.'],
    ['placement_not_assignable', 'Only a scheduled or active placement can have its Mentor changed.'],
    ['mentor_unchanged', 'This Mentor is already assigned to the placement.'],
  ])('maps %s to a clear conflict', async (key, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: key } });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.assignMentor('hr', 'placement-id', 'mentor-id')).rejects.toThrow(message);
  });

  it('activates with the verified HR actor', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...placementRow, status: 'ACTIVE', mentor_profile_id: 'mentor-id' }], error: null });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.activate('verified-hr-id', 'placement-id'))
      .resolves.toMatchObject({ status: 'ACTIVE', mentorProfileId: 'mentor-id' });
    expect(rpc).toHaveBeenCalledWith('activate_intern_placement', {
      p_actor_profile_id: 'verified-hr-id', p_placement_id: 'placement-id',
    });
  });

  it.each([
    ['mentor_required', 'PZ409', 'Assign a Mentor to this placement before activating it.'],
    ['mentor_inactive', 'PZ409', 'The assigned Mentor’s account is deactivated. Assign an active Mentor before activating the placement.'],
    ['mentor_profile_required', 'PZ400', 'The assigned Mentor no longer has a Mentor account. Assign an active Mentor before activating the placement.'],
  ])('maps %s on activation to a 409 conflict', async (key, code, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: key } });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    const failure = repository.activate('hr', 'placement-id');
    await expect(failure).rejects.toBeInstanceOf(ConflictException);
    await expect(failure).rejects.toMatchObject({ status: 409, message });
  });

  it('keeps the assignment wording for Mentor errors outside activation', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ400', message: 'mentor_profile_required' } });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.assignMentor('hr', 'placement-id', 'not-a-mentor'))
      .rejects.toMatchObject({ status: 400, message: 'Choose an existing Mentor.' });
  });

  it('refuses removing an active placement\'s Mentor with a clear conflict', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: 'active_placement_requires_mentor' } });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.unassignMentor('verified-hr-id', 'placement-id', null)).rejects.toMatchObject({
      status: 409,
      message: 'An active placement must always have a Mentor. Choose a replacement Mentor and use Change Mentor instead.',
    });
  });

  it('rejects a Mentor list without workload counts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'm', full_name: null, email: null }], error: null });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.listMentors('hr')).rejects.toThrow('Database operation returned an invalid result');
  });

  it('completes a placement with the verified HR actor and maps completion fields', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      ...placementRow, status: 'COMPLETED', completed_at: 'done', completion_note: 'Moved abroad', ended_early: true,
    }], error: null });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.complete('verified-hr-id', 'placement-id', 'Moved abroad')).resolves.toMatchObject({
      status: 'COMPLETED', completedAt: 'done', completionNote: 'Moved abroad', endedEarly: true,
    });
    expect(rpc).toHaveBeenCalledWith('complete_intern_placement', {
      p_actor_profile_id: 'verified-hr-id', p_placement_id: 'placement-id', p_note: 'Moved abroad',
    });
  });

  it.each([
    ['placement_has_open_tasks', 409, 'This placement still has open tasks from the retired task feature, so it cannot be completed until the pending database update is applied.'],
    ['placement_has_pending_reports', 409, 'A weekly report is waiting for the Mentor’s review. Ask the Mentor to review it first.'],
    ['early_end_reason_required', 400, 'Give a reason for ending the placement before its end date.'],
    ['placement_not_completable', 409, 'Only an active placement can be completed.'],
    ['certificate_source_incomplete', 409, 'The certificate of completion cannot be issued because the intern’s name or the training title is missing. Correct it, then complete the placement.'],
  ])('maps %s on completion', async (key, status, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: key } });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.complete('hr', 'placement-id', null)).rejects.toMatchObject({ status, message });
  });

  function overviewStub(options: {
    application: Record<string, unknown> | null;
    placements?: Record<string, unknown>[];
  }) {
    const filters: Array<[string, string, unknown]> = [];
    const from = vi.fn((table: string) => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = (column: string, value: unknown) => { filters.push([table, column, value]); return query; };
      query.in = () => query;
      query.maybeSingle = async () => ({
        data: table === 'applications' ? options.application : { title: 'Engineering', capacity: 3, selection_status: 'OPEN' },
        error: null,
      });
      query.order = async () => ({
        data: table === 'intern_placements' ? options.placements ?? [] : [],
        error: null,
      });
      return query;
    });
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'training_opportunity_seats_consumed' ? 2 : 'internship-id',
      error: null,
    }));
    return { repository: new SupabaseInternPlacementRepository({ client: { from, rpc } } as never), filters, rpc };
  }

  it('returns the open placement, cancelled ones and seats for a submitted application', async () => {
    const cancelled = { ...placementRow, id: 'old-id', status: 'CANCELLED', cancelled_at: 'c', cancellation_reason: 'Withdrawn' };
    const { repository, filters } = overviewStub({
      application: { id: 'application-id', status: 'SELECTED', internship_id: 'internship-id', requested_training: null },
      placements: [placementRow, cancelled],
    });

    const overview = await repository.getOverviewForApplication('application-id');
    expect(overview.current).toMatchObject({ id: 'placement-id', internshipId: 'internship-id', status: 'SCHEDULED' });
    expect(overview.cancelled).toEqual([expect.objectContaining({ id: 'old-id', cancellationReason: 'Withdrawn' })]);
    expect(overview.trainingTitle).toBe('Engineering');
    expect(overview.capacity).toBe(3);
    // Cumulative seats from the database rule, not a count of active placements.
    expect(overview).toMatchObject({ selectionStatus: 'OPEN', seatsConsumed: 2, selectionReleased: false });
    expect(filters).toContainEqual(['intern_placements', 'application_id', 'application-id']);
  });

  it('reports no placement yet without an error', async () => {
    const { repository } = overviewStub({
      application: { id: 'application-id', status: 'SELECTED', internship_id: 'internship-id', requested_training: null },
    });
    await expect(repository.getOverviewForApplication('application-id')).resolves.toMatchObject({
      current: null, cancelled: [], history: [],
    });
  });

  it.each([null, { id: 'application-id', status: 'DRAFT' }])('treats a missing or draft application as not found (%j)', async (application) => {
    const { repository } = overviewStub({ application });
    await expect(repository.getOverviewForApplication('application-id')).rejects.toMatchObject({ status: 404 });
  });

  it('cancels through the RPC with the verified actor and reason', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...placementRow, status: 'CANCELLED', cancelled_at: 'c', cancellation_reason: 'Company withdrew' }], error: null,
    });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    await expect(repository.cancel('verified-hr-id', 'placement-id', 'Company withdrew'))
      .resolves.toMatchObject({ status: 'CANCELLED', cancellationReason: 'Company withdrew' });
    expect(rpc).toHaveBeenCalledWith('cancel_intern_placement', {
      p_actor_profile_id: 'verified-hr-id', p_placement_id: 'placement-id', p_reason: 'Company withdrew',
    });
  });

  it.each([
    ['placement_not_cancellable', 409],
    ['placement_already_ended', 409],
    ['placement_already_exists', 409],
    ['cancellation_reason_required', 400],
    ['training_capacity_full', 409],
    ['selection_released', 409],
    ['training_selection_closed', 409],
  ])('maps %s to a clear error', async (message, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: status === 400 ? 'PZ400' : 'PZ409', message } });
    const repository = new SupabaseInternPlacementRepository({ client: { rpc } } as never);
    const result = repository.cancel('hr', 'placement-id', 'x');
    await expect(result).rejects.toMatchObject({ status });
    await expect(result).rejects.not.toMatchObject({ message: expect.stringContaining('_') });
  });

  it('calls create RPC with database-derived fields omitted and unwraps the SETOF row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [placementRow], error: null });
    const repository = new SupabaseInternPlacementRepository({
      client: { rpc },
    } as never);

    await expect(repository.create({
      actorProfileId: 'verified-hr-id',
      applicationId: 'application-id',
      company: 'Example Company',
      department: null,
      startDate: '2027-01-10',
      endDate: '2027-04-10',
    })).resolves.toEqual({
      id: 'placement-id',
      applicationId: 'application-id',
      applicantId: 'applicant-id',
      internshipId: 'internship-id',
      company: 'Example Company',
      department: null,
      startDate: '2027-01-10',
      endDate: '2027-04-10',
      status: 'SCHEDULED',
      mentorProfileId: null,
      cancelledAt: null,
      cancellationReason: null,
      completedAt: null,
      completionNote: null,
      endedEarly: null,
      createdAt: 'created',
      updatedAt: 'updated',
    });

    expect(rpc).toHaveBeenCalledWith('create_intern_placement', {
      p_actor_profile_id: 'verified-hr-id',
      p_application_id: 'application-id',
      p_company: 'Example Company',
      p_department: null,
      p_start_date: '2027-01-10',
      p_end_date: '2027-04-10',
    });
  });

  it('maps a duplicate-placement constraint error to conflict', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'private database detail' },
    });
    const repository = new SupabaseInternPlacementRepository({
      client: { rpc },
    } as never);

    await expect(repository.create({
      actorProfileId: 'verified-hr-id',
      applicationId: 'application-id',
      company: 'Example Company',
      department: null,
      startDate: '2027-01-10',
      endDate: '2027-04-10',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps activation eligibility SQLSTATEs to conflict', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PZ409', message: 'private database detail' },
    });
    const repository = new SupabaseInternPlacementRepository({
      client: { rpc },
    } as never);

    await expect(repository.activate('verified-hr-id', 'placement-id'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(rpc).toHaveBeenCalledWith('activate_intern_placement', {
      p_actor_profile_id: 'verified-hr-id',
      p_placement_id: 'placement-id',
    });
  });

  it.each([
    ['null', null],
    ['empty array', []],
    ['multiple rows', [placementRow, placementRow]],
    ['malformed row', [{}]],
    ['blank company', [{ ...placementRow, company: '\t\n' }]],
    ['invalid placement status', [{ ...placementRow, status: 'UNKNOWN' }]],
  ])('rejects %s create RPC results as an internal error', async (_label, data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    const repository = new SupabaseInternPlacementRepository({
      client: { rpc },
    } as never);

    await expect(repository.create({
      actorProfileId: 'verified-hr-id',
      applicationId: 'application-id',
      company: 'Example Company',
      department: null,
      startDate: '2027-01-10',
      endDate: '2027-04-10',
    })).rejects.toMatchObject({
      status: 500,
      message: 'Database operation returned an invalid result',
    });
  });

  it.each([
    ['null', null],
    ['empty array', []],
    ['malformed row', [{}]],
    ['unexpected status', [{ id: 'placement-id', status: 'NOT_A_STATUS' }]],
  ])('rejects %s activation RPC results as an internal error', async (_label, data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    const repository = new SupabaseInternPlacementRepository({
      client: { rpc },
    } as never);

    await expect(repository.activate('verified-hr-id', 'placement-id'))
      .rejects.toMatchObject({
        status: 500,
        message: 'Database operation returned an invalid result',
      });
  });

  it('resolves the active placement only through the authenticated user applicant link', async () => {
    const filters: Record<string, Record<string, unknown>> = {};
    const client = {
      from: (table: string) => {
        filters[table] = {};
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters[table][column] = value;
            return query;
          },
          in: (column: string, values: unknown) => {
            filters[table][column] = values;
            return query;
          },
          order: () => query,
          limit: () => query,
          maybeSingle: async () => table === 'applicants'
            ? { data: { id: 'own-applicant-id' }, error: null }
            : {
                data: {
                  ...placementRow,
                  applicant_id: 'own-applicant-id',
                  status: 'ACTIVE',
                  mentor_profile_id: 'mentor-id',
                  // The placement's own training opportunity (mapped requests included).
                  internship: { title: 'Backend Training' },
                  mentor: { full_name: 'Maya Mentor', email: 'maya@example.test' },
                },
                error: null,
              },
        };
        return query;
      },
    };
    const repository = new SupabaseInternPlacementRepository({ client } as never);

    await expect(repository.getActiveForAuthUser('verified-intern-id'))
      .resolves.toMatchObject({
        applicantId: 'own-applicant-id',
        status: 'ACTIVE',
        mentorProfileId: 'mentor-id',
        trainingTitle: 'Backend Training',
        mentor: { fullName: 'Maya Mentor', email: 'maya@example.test' },
      });
    expect(filters.applicants.auth_user_id).toBe('verified-intern-id');
    expect(filters.intern_placements.applicant_id).toBe('own-applicant-id');
    // Active first, else the latest completed placement (read-only).
    expect(filters.intern_placements.status).toEqual(['ACTIVE', 'COMPLETED']);
  });
});
