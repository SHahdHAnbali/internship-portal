import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { TrainingPlanningService } from './training-planning.service.js';
import { SupabaseInternshipRepository } from '../../infrastructure/repositories/supabase-internship.repository.js';
import { throwPlanningError } from '../../domain/types/planning-errors.js';
import {
  CreateInternshipDto,
  MapTrainingRequestDto,
  UpdateInternshipDto,
} from '../../presentation/dto/training-planning.dto.js';
import { TrainingDemandService } from '../../../hr/application/services/training-demand.service.js';

function tableStub(tables: Record<string, { data: unknown; error?: unknown }>) {
  const from = vi.fn((table: string) => {
    const result = tables[table] ?? { data: [] };
    const query: Record<string, unknown> = {};
    const resolved = Promise.resolve({ data: result.data, error: result.error ?? null });
    for (const method of ['select', 'neq', 'order']) query[method] = () => query;
    query.limit = () => resolved;
    // Plain selects are awaited at .select()/.neq(); expose the promise API
    // through dedicated terminal helpers instead of making the query thenable.
    return Object.assign(query, {
      select: () => Object.assign(Promise.resolve({ data: result.data, error: result.error ?? null }), query),
      neq: () => resolved,
    });
  });
  return from;
}

describe('TrainingPlanningService', () => {
  it('builds the plan from real rows (drafts excluded at the query)', async () => {
    const from = tableStub({
      internships: { data: [{ id: 'eng', title: 'Engineering', is_active: true, capacity: 2, created_at: 't', updated_at: null }] },
      internship_requirements: { data: [] },
      training_request_mappings: { data: [] },
      applications: { data: [{ id: 'a', status: 'SELECTED', internship_id: 'eng', requested_training: null, skills: ['SQL'] }] },
      intern_placements: { data: [] },
    });
    const service = new TrainingPlanningService({ client: { from } } as never);

    const plan = await service.getPlan();
    expect(plan.opportunities[0].seats).toMatchObject({ capacity: 2, selected: 1, remaining: 1 });
    expect(from).toHaveBeenCalledWith('applications');
  });

  it('does not leak database errors', async () => {
    const from = tableStub({ internships: { data: null, error: { message: 'secret detail' } } });
    const result = new TrainingPlanningService({ client: { from } } as never).getPlan();
    await expect(result).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(result).rejects.not.toMatchObject({ message: expect.stringContaining('secret') });
  });

  it('maps "Other" requests through the audited RPC with the verified HR actor', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ normalized_label: 'robotics', internship_id: 'eng' }], error: null });
    const service = new TrainingPlanningService({ client: { rpc } } as never);

    await expect(service.mapRequest('hr-id', 'Robotics', 'eng', 'same track')).resolves.toEqual({ label: 'robotics', internshipId: 'eng' });
    expect(rpc).toHaveBeenCalledWith('map_training_request', {
      p_actor_profile_id: 'hr-id', p_label: 'Robotics', p_internship_id: 'eng', p_note: 'same track',
    });
  });

  it('refuses to move a mapping that selections depend on', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: 'training_request_has_selections' } });
    await expect(new TrainingPlanningService({ client: { rpc } } as never).unmapRequest('hr-id', 'robotics', null))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('throwPlanningError', () => {
  it.each([
    ['invalid_training_title', BadRequestException],
    ['invalid_training_capacity', BadRequestException],
    ['planning_note_too_long', BadRequestException],
    ['training_not_found', NotFoundException],
    ['training_request_not_found', NotFoundException],
    ['capacity_below_selected', ConflictException],
    ['capacity_required_with_selections', ConflictException],
    ['training_unchanged', ConflictException],
    ['training_request_already_mapped', ConflictException],
    ['training_request_has_selections', ConflictException],
  ])('maps %s without database text', (message, Exception) => {
    expect(() => throwPlanningError({ code: 'PZ409', message })).toThrow(Exception);
    try {
      throwPlanningError({ code: 'PZ409', message });
    } catch (error) {
      expect((error as Error).message).not.toContain('_');
    }
  });

  it('maps a role refusal to 403', () => {
    expect(() => throwPlanningError({ code: 'PZ403', message: 'hr_role_required' })).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
});

describe('SupabaseInternshipRepository', () => {
  const row = { id: 'eng', title: 'Engineering', is_active: true, created_at: '2026-10-11T00:00:00Z' };

  it('creates through create_training_opportunity and returns only public fields', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...row, capacity: 3 }], error: null });
    const result = await new SupabaseInternshipRepository({ client: { rpc } } as never)
      .create({ actorProfileId: 'hr-id', title: 'Engineering', capacity: 3, note: null, isActive: true, selectionStatus: 'NOT_APPROVED' });

    expect(rpc).toHaveBeenCalledWith('create_training_opportunity', {
      p_actor_profile_id: 'hr-id', p_title: 'Engineering', p_capacity: 3, p_note: null,
      p_is_active: true, p_selection_status: 'NOT_APPROVED',
    });
    expect(result).toEqual(expect.objectContaining({ id: 'eng', title: 'Engineering', isActive: true }));
    expect(result).not.toHaveProperty('capacity');
  });

  it('updates through update_training_opportunity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    await new SupabaseInternshipRepository({ client: { rpc } } as never).update({
      actorProfileId: 'hr-id', internshipId: 'eng', title: 'Engineering', isActive: false, capacity: 5, note: 'closing intake',
      selectionStatus: 'CLOSED',
    });
    expect(rpc).toHaveBeenCalledWith('update_training_opportunity', {
      p_actor_profile_id: 'hr-id', p_internship_id: 'eng', p_title: 'Engineering',
      p_is_active: false, p_capacity: 5, p_note: 'closing intake', p_selection_status: 'CLOSED',
    });
  });

  it('maps a capacity below current selections to 409', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: 'capacity_below_selected' } });
    await expect(new SupabaseInternshipRepository({ client: { rpc } } as never).update({
      actorProfileId: 'hr-id', internshipId: 'eng', title: 'E', isActive: true, capacity: 0, note: null, selectionStatus: 'OPEN',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['training_has_selections', 'Applicants were already selected for this training, so its approval cannot be withdrawn. Close selection instead.'],
    ['capacity_below_selected', 'Capacity cannot be lower than the seats already consumed by selected applicants.'],
  ])('maps %s to a clear 409', async (key, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: key } });
    await expect(new SupabaseInternshipRepository({ client: { rpc } } as never).update({
      actorProfileId: 'hr-id', internshipId: 'eng', title: 'E', isActive: true, capacity: 0, note: null, selectionStatus: 'NOT_APPROVED',
    })).rejects.toMatchObject({ status: 409, message });
  });

  it('public listing returns listed types only; HR listing includes approval and capacity', async () => {
    const eqCalls: unknown[][] = [];
    const rows = [{ ...row, selection_status: 'OPEN', capacity: 3 }];
    const query = Object.assign(Promise.resolve({ data: rows, error: null }), {
      select: () => query,
      order: () => query,
      eq: (...args: unknown[]) => { eqCalls.push(args); return query; },
    });
    const repository = new SupabaseInternshipRepository({ client: { from: () => query } } as never);

    const listed = await repository.findListed();
    expect(eqCalls).toEqual([['is_active', true]]);
    expect(listed[0]).not.toHaveProperty('capacity');
    expect(listed[0]).not.toHaveProperty('selectionStatus');

    await expect(repository.findAllForHr()).resolves.toEqual([{
      id: 'eng', title: 'Engineering', isActive: true, selectionStatus: 'OPEN', capacity: 3, createdAt: '2026-10-11T00:00:00Z',
    }]);
    expect(eqCalls).toHaveLength(1);
  });
});

describe('training planning DTOs', () => {
  const errors = async <T extends object>(cls: new () => T, plain: unknown) =>
    (await validate(plainToInstance(cls, plain), { whitelist: true })).map((e) => e.property);

  it('accepts an opportunity without a planned capacity', async () => {
    expect(await errors(CreateInternshipDto, { title: 'Engineering' })).toEqual([]);
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ title: 'x'.repeat(151) }, 'title'],
    [{ title: 'E', capacity: -1 }, 'capacity'],
    [{ title: 'E', capacity: 2.5 }, 'capacity'],
    [{ title: 'E', capacity: 10001 }, 'capacity'],
  ])('rejects an invalid new opportunity %j', async (plain, property) => {
    expect(await errors(CreateInternshipDto, plain)).toContain(property);
  });

  it('requires an explicit capacity (number or null), listing flag and selection status when updating', async () => {
    expect(await errors(UpdateInternshipDto, { title: 'E', isActive: true, capacity: null, selectionStatus: 'OPEN' })).toEqual([]);
    expect(await errors(UpdateInternshipDto, { title: 'E', isActive: 'yes', capacity: 1, selectionStatus: 'OPEN' })).toContain('isActive');
    expect(await errors(UpdateInternshipDto, { title: 'E', isActive: true, capacity: '3', selectionStatus: 'OPEN' })).toContain('capacity');
    expect(await errors(UpdateInternshipDto, { title: 'E', isActive: true, capacity: 3 })).toContain('selectionStatus');
    expect(await errors(UpdateInternshipDto, { title: 'E', isActive: true, capacity: 3, selectionStatus: 'APPROVED' })).toContain('selectionStatus');
  });

  it('a new opportunity may only start awaiting approval or approved', async () => {
    expect(await errors(CreateInternshipDto, { title: 'E', selectionStatus: 'OPEN', isActive: false })).toEqual([]);
    expect(await errors(CreateInternshipDto, { title: 'E', selectionStatus: 'CLOSED' })).toContain('selectionStatus');
  });

  it('requires a label and a valid opportunity id to map', async () => {
    expect(await errors(MapTrainingRequestDto, { label: ' Robotics ', internshipId: '11111111-1111-4111-8111-111111111111' })).toEqual([]);
    expect(await errors(MapTrainingRequestDto, { label: '', internshipId: 'nope' })).toEqual(expect.arrayContaining(['label', 'internshipId']));
  });
});

describe('TrainingDemandService (HR dashboard)', () => {
  it('derives demand from the planning summary, mapped requests included', async () => {
    const planning = {
      getPlan: vi.fn().mockResolvedValue({
        opportunities: [
          { title: 'Engineering', demand: { total: 3 } },
          { title: 'Empty', demand: { total: 0 } },
        ],
        unmatchedRequests: [{ label: 'Robotics', demand: { total: 2 } }],
        totals: { total: 5 },
      }),
    };

    await expect(new TrainingDemandService(planning as never).getDemand()).resolves.toEqual({
      totalRequests: 5,
      items: [
        { name: 'Engineering', type: 'INTERNSHIP', count: 3 },
        { name: 'Robotics', type: 'OTHER', count: 2 },
      ],
    });
  });
});
