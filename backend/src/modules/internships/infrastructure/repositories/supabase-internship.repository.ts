import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';

import { Internship } from '../../domain/entities/internship.entity.js';

import {
  InternshipRepository,
  type CreateInternshipInput,
  type ManagedInternship,
  type SelectionStatus,
  type UpdateInternshipInput,
} from '../../domain/repositories/internship.repository.js';

import { throwPlanningError } from '../../domain/types/planning-errors.js';

interface InternshipRow {
  id: string;
  title: string;
  is_active: boolean;
  created_at: string;
}

interface ManagedInternshipRow extends InternshipRow {
  selection_status: SelectionStatus;
  capacity: number | null;
}

@Injectable()
export class SupabaseInternshipRepository
  implements InternshipRepository
{
  constructor(
    private readonly supabase: SupabaseService,
  ) {}

  async findListed(): Promise<Internship[]> {
    const { data, error } = await this.supabase.client
      .from('internships')
      .select('id, title, is_active, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException('Unable to load internships');
    }

    return ((data ?? []) as InternshipRow[]).map(toEntity);
  }

  async findAllForHr(): Promise<ManagedInternship[]> {
    const { data, error } = await this.supabase.client
      .from('internships')
      .select('id, title, is_active, selection_status, capacity, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException('Unable to load internships');
    }

    return ((data ?? []) as ManagedInternshipRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      isActive: row.is_active,
      selectionStatus: row.selection_status,
      capacity: row.capacity,
      createdAt: row.created_at,
    }));
  }

  async create(input: CreateInternshipInput): Promise<Internship> {
    const { data, error } = await this.supabase.client.rpc('create_training_opportunity', {
      p_actor_profile_id: input.actorProfileId,
      p_title: input.title,
      p_capacity: input.capacity,
      p_note: input.note,
      p_is_active: input.isActive,
      p_selection_status: input.selectionStatus,
    });

    if (error) {
      throwPlanningError(error);
    }

    return toEntity(singleRow(data));
  }

  async update(input: UpdateInternshipInput): Promise<Internship> {
    const { data, error } = await this.supabase.client.rpc('update_training_opportunity', {
      p_actor_profile_id: input.actorProfileId,
      p_internship_id: input.internshipId,
      p_title: input.title,
      p_is_active: input.isActive,
      p_capacity: input.capacity,
      p_note: input.note,
      p_selection_status: input.selectionStatus,
    });

    if (error) {
      throwPlanningError(error);
    }

    return toEntity(singleRow(data));
  }
}

function singleRow(data: unknown): InternshipRow {
  if (!Array.isArray(data) || data.length !== 1 || typeof data[0]?.id !== 'string') {
    throw new InternalServerErrorException('Database operation returned an invalid result');
  }
  return data[0] as InternshipRow;
}

function toEntity(row: InternshipRow): Internship {
  return new Internship(row.id, row.title, row.is_active, new Date(row.created_at));
}
