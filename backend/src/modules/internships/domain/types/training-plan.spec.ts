import { buildTrainingPlan, type PlanApplicationRow } from './training-plan.js';

const internships = [
  { id: 'eng', title: 'Engineering', is_active: true, selection_status: 'OPEN' as const, capacity: 3, created_at: 't', updated_at: 'u' },
  { id: 'data', title: 'Data', is_active: true, selection_status: 'OPEN' as const, capacity: null, created_at: 't', updated_at: null },
  { id: 'old', title: 'Legacy', is_active: false, selection_status: 'CLOSED' as const, capacity: 1, created_at: 't', updated_at: null },
];

const app = (
  id: string,
  status: string,
  internshipId: string | null,
  requested: string | null,
  skills: unknown = [],
  releasedAt: string | null = null,
): PlanApplicationRow => ({ id, status, internship_id: internshipId, requested_training: requested, selection_released_at: releasedAt, skills });

const plan = (applications: PlanApplicationRow[], extras: Partial<Parameters<typeof buildTrainingPlan>[0]> = {}) =>
  buildTrainingPlan({
    internships,
    requirements: [{ internship_id: 'eng', required_skills: ['TypeScript', 'SQL'] }],
    mappings: [{ normalized_label: 'cyber security', internship_id: 'eng' }],
    applications,
    placements: [],
    ...extras,
  });

describe('buildTrainingPlan', () => {
  it('counts demand by status per opportunity, including mapped "Other" requests', () => {
    const result = plan([
      app('1', 'NEW', 'eng', null),
      app('2', 'SELECTED', 'eng', null),
      app('3', 'REJECTED', 'eng', null),
      app('4', 'INTERVIEW', null, '  Cyber Security '),
      app('5', 'DRAFT', 'eng', null),
    ]);
    const eng = result.opportunities.find((o) => o.id === 'eng')!;

    expect(eng.demand).toEqual({ total: 4, inReview: 2, selected: 1, rejected: 1 });
    expect(eng.mappedRequests).toEqual(['cyber security']);
    expect(eng.seats).toEqual({ capacity: 3, selected: 1, released: 0, consumed: 1, remaining: 2, scheduledPlacements: 0, activePlacements: 0, completedPlacements: 0 });
  });

  it('never counts drafts', () => {
    const result = plan([app('1', 'DRAFT', 'eng', null), app('2', 'DRAFT', null, 'Robotics')]);
    expect(result.totals.total).toBe(0);
    expect(result.unmatchedRequests).toEqual([]);
  });

  it('groups unmatched "Other" requests case- and space-insensitively with the most common spelling', () => {
    const result = plan([
      app('1', 'NEW', null, 'Robotics'),
      app('2', 'NEW', null, ' robotics'),
      app('3', 'REJECTED', null, 'Robotics'),
      app('4', 'NEW', null, 'UX Design'),
    ]);

    expect(result.unmatchedRequests.map((r) => [r.label, r.normalizedLabel, r.demand.total])).toEqual([
      ['Robotics', 'robotics', 3],
      ['UX Design', 'ux design', 1],
    ]);
    expect(result.unmatchedRequests[0].demand).toEqual({ total: 3, inReview: 2, selected: 0, rejected: 1 });
  });

  it('reports required-skill coverage and top skills from reviewed applicant data', () => {
    const result = plan([
      app('1', 'NEW', 'eng', null, ['TypeScript', 'sql', 'Docker']),
      app('2', 'NEW', 'eng', null, ['typescript', 'TypeScript']),
      app('3', 'NEW', 'eng', null, 'not a list'),
    ]);
    const eng = result.opportunities.find((o) => o.id === 'eng')!;

    expect(eng.hasRequirements).toBe(true);
    expect(eng.requiredSkillCoverage).toEqual([
      { skill: 'TypeScript', applicants: 2 },
      { skill: 'SQL', applicants: 1 },
    ]);
    expect(eng.topSkills[0]).toEqual({ skill: 'TypeScript', applicants: 2 });
    expect(result.opportunities.find((o) => o.id === 'data')!.hasRequirements).toBe(false);
  });

  it('tracks placements and seat totals; unplanned opportunities have no remaining count', () => {
    const result = plan(
      [app('1', 'SELECTED', 'eng', null), app('2', 'SELECTED', 'eng', null), app('3', 'SELECTED', 'old', null)],
      { placements: [{ application_id: '1', status: 'ACTIVE' }, { application_id: '2', status: 'SCHEDULED' }] },
    );
    const eng = result.opportunities.find((o) => o.id === 'eng')!;

    expect(eng.seats).toMatchObject({ selected: 2, remaining: 1, activePlacements: 1, scheduledPlacements: 1 });
    expect(result.opportunities.find((o) => o.id === 'data')!.seats.remaining).toBeNull();
    expect(result.totals).toMatchObject({
      selected: 3,
      plannedCapacity: 4,
      remainingSeats: 1,
      unplannedOpportunities: 1,
    });
  });

  it('counts seats cumulatively: completion and cancellation keep the seat, only a release frees it', () => {
    const result = plan(
      [
        app('1', 'SELECTED', 'eng', null),
        app('2', 'SELECTED', 'eng', null),
        app('3', 'SELECTED', 'eng', null, [], '2026-10-14T10:00:00Z'),
      ],
      { placements: [
        { application_id: '1', status: 'COMPLETED' },
        { application_id: '2', status: 'CANCELLED' },
        { application_id: '2', status: 'SCHEDULED' },
        { application_id: '3', status: 'CANCELLED' },
      ] },
    );
    expect(result.opportunities.find((o) => o.id === 'eng')!.seats).toEqual({
      capacity: 3, selected: 3, released: 1, consumed: 2, remaining: 1,
      scheduledPlacements: 1, activePlacements: 0, completedPlacements: 1,
    });
  });

  it('keeps approval separate from listing and counts opportunities awaiting approval', () => {
    const result = plan([app('1', 'NEW', 'pending', null)], {
      internships: [...internships, {
        id: 'pending', title: 'Cloud', is_active: true, selection_status: 'NOT_APPROVED', capacity: null, created_at: 't', updated_at: null,
      }],
    });
    const pending = result.opportunities.find((o) => o.id === 'pending')!;
    expect(pending).toMatchObject({ isActive: true, selectionStatus: 'NOT_APPROVED', capacity: null });
    expect(pending.demand.total).toBe(1);
    expect(result.totals).toMatchObject({ awaitingApproval: 1, unplannedOpportunities: 1 });
  });

  it('lists active opportunities first, then by demand', () => {
    const result = plan([app('1', 'NEW', 'data', null), app('2', 'NEW', 'data', null), app('3', 'NEW', 'eng', null)]);
    expect(result.opportunities.map((o) => o.id)).toEqual(['data', 'eng', 'old']);
  });
});
