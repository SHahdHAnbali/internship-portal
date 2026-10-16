// Pure planning computation over real rows. Advisory only: it counts and
// summarizes; it never selects, ranks or rejects anyone.
//
// Requested training (what applicants asked for) and opportunities (what HR
// approved) are separate: an opportunity's demand includes its listed requests
// and the "Other" requests HR linked to it; unlinked requests stay unmatched.
// Seats are cumulative for the opportunity's cycle: every selection consumes one
// until HR explicitly releases it (completion or cancellation keep the seat).

export type SelectionStatus = 'NOT_APPROVED' | 'OPEN' | 'CLOSED';

export interface PlanInternshipRow {
  id: string;
  title: string;
  is_active: boolean;
  selection_status: SelectionStatus;
  capacity: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface PlanRequirementRow {
  internship_id: string;
  required_skills: string[] | null;
}

export interface PlanMappingRow {
  normalized_label: string;
  internship_id: string;
}

export interface PlanApplicationRow {
  id: string;
  status: string;
  internship_id: string | null;
  requested_training: string | null;
  selection_released_at: string | null;
  // Applicant-reviewed skills (extracted_data->skills).
  skills: unknown;
}

export interface PlanPlacementRow {
  application_id: string;
  status: string;
}

export interface DemandBreakdown {
  total: number;
  inReview: number;
  selected: number;
  rejected: number;
}

export interface SkillCount {
  skill: string;
  applicants: number;
}

export interface PlannedOpportunity {
  id: string;
  title: string;
  // Listed for applicants (they may request it).
  isActive: boolean;
  // HR approval / selection state.
  selectionStatus: SelectionStatus;
  capacity: number | null;
  demand: DemandBreakdown;
  seats: {
    capacity: number | null;
    // Every applicant ever selected into this opportunity (releases included).
    selected: number;
    // Selections HR explicitly released (their seats were freed).
    released: number;
    // Seats in use: selected minus released.
    consumed: number;
    // Seats still available for selection (null when capacity is not set).
    remaining: number | null;
    scheduledPlacements: number;
    activePlacements: number;
    completedPlacements: number;
  };
  mappedRequests: string[];
  hasRequirements: boolean;
  // How many submitted applicants list each required skill.
  requiredSkillCoverage: SkillCount[];
  topSkills: SkillCount[];
  updatedAt: string | null;
}

export interface UnmatchedRequest {
  label: string;
  normalizedLabel: string;
  demand: DemandBreakdown;
  topSkills: SkillCount[];
}

export interface TrainingPlan {
  opportunities: PlannedOpportunity[];
  unmatchedRequests: UnmatchedRequest[];
  totals: DemandBreakdown & {
    plannedCapacity: number;
    remainingSeats: number;
    // Approved (OPEN or CLOSED) but without a capacity yet.
    unplannedOpportunities: number;
    awaitingApproval: number;
  };
}

const IN_REVIEW = new Set(['NEW', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW']);
const TOP_SKILLS = 8;
const STATUS_ORDER: Record<SelectionStatus, number> = { OPEN: 0, NOT_APPROVED: 1, CLOSED: 2 };

export const normalizeLabel = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase();

const emptyDemand = (): DemandBreakdown => ({ total: 0, inReview: 0, selected: 0, rejected: 0 });

function addToDemand(demand: DemandBreakdown, status: string) {
  demand.total += 1;
  if (IN_REVIEW.has(status)) demand.inReview += 1;
  if (status === 'SELECTED') demand.selected += 1;
  if (status === 'REJECTED') demand.rejected += 1;
}

function skillsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Map<string, string>();
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      const key = item.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, item.trim());
    }
  }
  return [...seen.values()];
}

class SkillTally {
  private readonly counts = new Map<string, { display: string; count: number }>();

  add(skills: string[]) {
    for (const skill of skills) {
      const key = skill.toLowerCase();
      const entry = this.counts.get(key);
      if (entry) entry.count += 1;
      else this.counts.set(key, { display: skill, count: 1 });
    }
  }

  count(skill: string): number {
    return this.counts.get(skill.trim().toLowerCase())?.count ?? 0;
  }

  top(limit: number): SkillCount[] {
    return [...this.counts.values()]
      .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
      .slice(0, limit)
      .map(({ display, count }) => ({ skill: display, applicants: count }));
  }
}

export function buildTrainingPlan(input: {
  internships: PlanInternshipRow[];
  requirements: PlanRequirementRow[];
  mappings: PlanMappingRow[];
  applications: PlanApplicationRow[];
  placements: PlanPlacementRow[];
}): TrainingPlan {
  const mappingByLabel = new Map(input.mappings.map((m) => [m.normalized_label, m.internship_id]));
  const requiredByInternship = new Map(
    input.requirements.map((r) => [r.internship_id, (r.required_skills ?? []).filter((s) => s.trim())]),
  );
  // An application can have cancelled placements and one current one; the
  // current (non-cancelled) placement is the one that matters.
  const placementByApplication = new Map<string, string>();
  for (const placement of input.placements) {
    const known = placementByApplication.get(placement.application_id);
    if (!known || known === 'CANCELLED') placementByApplication.set(placement.application_id, placement.status);
  }

  const byOpportunity = new Map(input.internships.map((internship) => [internship.id, {
    internship,
    demand: emptyDemand(),
    skills: new SkillTally(),
    scheduled: 0,
    active: 0,
    completed: 0,
    released: 0,
  }]));

  const unmatched = new Map<string, { labels: Map<string, number>; demand: DemandBreakdown; skills: SkillTally }>();
  const totals = emptyDemand();

  for (const application of input.applications) {
    if (application.status === 'DRAFT') continue;
    addToDemand(totals, application.status);
    const skills = skillsOf(application.skills);
    const label = normalizeLabel(application.requested_training);
    const opportunityId = application.internship_id ?? mappingByLabel.get(label) ?? null;
    const target = opportunityId ? byOpportunity.get(opportunityId) : undefined;

    if (target) {
      addToDemand(target.demand, application.status);
      target.skills.add(skills);
      const placementStatus = placementByApplication.get(application.id);
      if (placementStatus === 'SCHEDULED') target.scheduled += 1;
      if (placementStatus === 'ACTIVE') target.active += 1;
      if (placementStatus === 'COMPLETED') target.completed += 1;
      if (application.status === 'SELECTED' && application.selection_released_at) target.released += 1;
    } else if (!application.internship_id && label) {
      const group = unmatched.get(label) ?? { labels: new Map(), demand: emptyDemand(), skills: new SkillTally() };
      const display = (application.requested_training ?? '').trim();
      group.labels.set(display, (group.labels.get(display) ?? 0) + 1);
      addToDemand(group.demand, application.status);
      group.skills.add(skills);
      unmatched.set(label, group);
    }
  }

  const mappedByInternship = new Map<string, string[]>();
  for (const mapping of input.mappings) {
    const list = mappedByInternship.get(mapping.internship_id) ?? [];
    list.push(mapping.normalized_label);
    mappedByInternship.set(mapping.internship_id, list);
  }

  const opportunities: PlannedOpportunity[] = [...byOpportunity.values()]
    .map(({ internship, demand, skills, scheduled, active, completed, released }) => {
      const required = requiredByInternship.get(internship.id) ?? [];
      const consumed = demand.selected - released;
      return {
        id: internship.id,
        title: internship.title,
        isActive: internship.is_active,
        selectionStatus: internship.selection_status,
        capacity: internship.capacity,
        demand,
        seats: {
          capacity: internship.capacity,
          selected: demand.selected,
          released,
          consumed,
          remaining: internship.capacity === null ? null : Math.max(internship.capacity - consumed, 0),
          scheduledPlacements: scheduled,
          activePlacements: active,
          completedPlacements: completed,
        },
        mappedRequests: (mappedByInternship.get(internship.id) ?? []).sort(),
        hasRequirements: requiredByInternship.has(internship.id),
        requiredSkillCoverage: required.map((skill) => ({ skill, applicants: skills.count(skill) })),
        topSkills: skills.top(TOP_SKILLS),
        updatedAt: internship.updated_at,
      };
    })
    .sort((a, b) => STATUS_ORDER[a.selectionStatus] - STATUS_ORDER[b.selectionStatus]
      || Number(b.isActive) - Number(a.isActive) || b.demand.total - a.demand.total || a.title.localeCompare(b.title));

  const unmatchedRequests: UnmatchedRequest[] = [...unmatched.entries()]
    .map(([normalizedLabel, group]) => ({
      // Most common original spelling, for display.
      label: [...group.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      normalizedLabel,
      demand: group.demand,
      topSkills: group.skills.top(TOP_SKILLS),
    }))
    .sort((a, b) => b.demand.total - a.demand.total || a.label.localeCompare(b.label));

  const planned = opportunities.filter((o) => o.capacity !== null);
  const approved = opportunities.filter((o) => o.selectionStatus !== 'NOT_APPROVED');
  return {
    opportunities,
    unmatchedRequests,
    totals: {
      ...totals,
      plannedCapacity: planned.reduce((sum, o) => sum + (o.capacity ?? 0), 0),
      remainingSeats: planned.reduce((sum, o) => sum + (o.seats.remaining ?? 0), 0),
      unplannedOpportunities: approved.filter((o) => o.capacity === null).length,
      awaitingApproval: opportunities.length - approved.length,
    },
  };
}
