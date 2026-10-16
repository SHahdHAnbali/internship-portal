import type { Internship } from '../entities/internship.entity.js';

export type SelectionStatus = 'NOT_APPROVED' | 'OPEN' | 'CLOSED';

// HR view of a training type: listing, approval and capacity (never public).
export interface ManagedInternship {
  id: string;
  title: string;
  // Listed for applicants.
  isActive: boolean;
  selectionStatus: SelectionStatus;
  capacity: number | null;
  createdAt: string;
}

export interface CreateInternshipInput {
  actorProfileId: string;
  title: string;
  // Planned seats; null = not planned yet.
  capacity: number | null;
  note: string | null;
  // Listed for applicants.
  isActive: boolean;
  // A new opportunity awaits approval unless HR approves it now.
  selectionStatus: 'NOT_APPROVED' | 'OPEN';
}

export interface UpdateInternshipInput {
  actorProfileId: string;
  internshipId: string;
  title: string;
  isActive: boolean;
  capacity: number | null;
  note: string | null;
  selectionStatus: SelectionStatus;
}

export abstract class InternshipRepository {
  // Public listing: listed training types only (id, title, listed flag, creation
  // time). Approval and capacity are never exposed.
  abstract findListed(): Promise<Internship[]>;

  // HR: every training type with its listing, approval and capacity.
  abstract findAllForHr(): Promise<ManagedInternship[]>;

  // Both go through audited database functions (HR-only, history recorded).
  abstract create(input: CreateInternshipInput): Promise<Internship>;

  abstract update(input: UpdateInternshipInput): Promise<Internship>;
}
