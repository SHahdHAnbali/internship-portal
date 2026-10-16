export interface Internship {
    id: string;
    title: string;
    isActive: boolean;
    createdAt: string;
  }
  
  // HR approval / selection state of a training opportunity.
  export type SelectionStatus = 'NOT_APPROVED' | 'OPEN' | 'CLOSED';

  export interface CreateInternshipInput {
    title: string;
    // Seats for the opportunity's cycle; usually set after approval.
    capacity?: number | null;
    note?: string | null;
    // Listed for applicants (they may request it).
    isActive?: boolean;
    // Awaiting approval (default) or approved now.
    selectionStatus?: 'NOT_APPROVED' | 'OPEN';
  }

  export interface UpdateInternshipInput {
    title: string;
    isActive: boolean;
    capacity: number | null;
    note?: string | null;
    selectionStatus: SelectionStatus;
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
    // Listed for applicants.
    isActive: boolean;
    selectionStatus: SelectionStatus;
    capacity: number | null;
    demand: DemandBreakdown;
    // Cumulative for the opportunity's cycle: completed or cancelled placements
    // keep their seat; only an explicit release frees one.
    seats: {
      capacity: number | null;
      selected: number;
      released: number;
      consumed: number;
      remaining: number | null;
      scheduledPlacements: number;
      activePlacements: number;
      completedPlacements: number;
    };
    mappedRequests: string[];
    hasRequirements: boolean;
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

  export interface PlanningChange {
    id: string;
    type: 'OPPORTUNITY_CREATED' | 'OPPORTUNITY_UPDATED' | 'REQUEST_MAPPED' | 'REQUEST_UNMAPPED' | 'SELECTION_RELEASED';
    internshipId: string | null;
    internshipTitle: string | null;
    requestLabel: string | null;
    details: Record<string, unknown>;
    note: string | null;
    actorName: string | null;
    createdAt: string;
  }

  export interface TrainingPlan {
    opportunities: PlannedOpportunity[];
    unmatchedRequests: UnmatchedRequest[];
    totals: DemandBreakdown & {
      plannedCapacity: number;
      remainingSeats: number;
      unplannedOpportunities: number;
      awaitingApproval: number;
    };
    recentChanges: PlanningChange[];
  }

  export interface InternshipRequirements {
    id: string;
    internshipId: string;
  
    requiredSkills: string[];
    preferredSkills: string[];
  
    minimumEducation: string | null;
    minimumExperienceYears: number | null;
  
    languages: string[];
    certifications: string[];
  
    otherRequirements: string | null;
  
    createdAt: string;
    updatedAt: string;
  }
  
  export interface SaveInternshipRequirementsInput {
    requiredSkills: string[];
    preferredSkills: string[];
  
    minimumEducation: string | null;
    minimumExperienceYears: number | null;
  
    languages: string[];
    certifications: string[];
  
    otherRequirements: string | null;
  }