import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwSupabaseRpcHttpException } from '../../../../infrastructure/database/supabase-rpc-error.js';
import {
  HR_TARGET_STATUSES,
  type HrTargetStatus,
} from '../../domain/types/application-status-rules.js';

export interface UpdateApplicationStatusCommand {
  actorProfileId: string;
  applicationId: string;
  status: HrTargetStatus;
  // Applicant-visible; required for (and only allowed with) REJECTED.
  reason?: string | null;
  // Internal HR note; never shown to the applicant.
  note?: string | null;
}

interface StatusResultRow {
  id: string;
  status: HrTargetStatus;
  rejection_reason: string | null;
  changed_at: string;
}

@Injectable()
export class UpdateApplicationStatusUseCase {
  constructor(
    private readonly supabase: SupabaseService,
  ) {}

  async execute(command: UpdateApplicationStatusCommand) {
    // Transition rules, locking and history are enforced by the database
    // function in one transaction; this layer only maps its outcome.
    const { data, error } = await this.supabase.client.rpc(
      'update_application_status_v2',
      {
        p_actor_profile_id: command.actorProfileId,
        p_application_id: command.applicationId,
        p_status: command.status,
        p_reason: command.reason ?? null,
        p_note: command.note ?? null,
      },
    );

    if (error) {
      throwStatusError(error);
    }

    if (!Array.isArray(data) || data.length !== 1 || !isStatusResult(data[0])) {
      throw new InternalServerErrorException('Database operation returned an invalid result');
    }

    const result = data[0];
    return {
      id: result.id,
      status: result.status,
      rejectionReason: result.rejection_reason,
      changedAt: result.changed_at,
    };
  }
}

function throwStatusError(error: { code?: string; message?: string }): never {
  switch (error.message) {
    case 'application_not_found':
      throw new NotFoundException('Application not found');
    case 'rejection_reason_required':
      throw new BadRequestException('A rejection reason is required.');
    case 'reason_only_for_rejection':
      throw new BadRequestException('A reason can only be given when rejecting an application.');
    case 'status_text_too_long':
      throw new BadRequestException('The reason or note is too long.');
    case 'application_decision_final':
      throw new ConflictException('This application already has a final decision and cannot be changed.');
    case 'application_status_unchanged':
      throw new ConflictException('The application already has this status.');
    case 'invalid_status_transition':
      throw new ConflictException('Applications can only move forward through the review stages.');
    case 'placement_requires_selected_application':
      throw new ConflictException('An application with a placement must remain selected.');
    case 'training_not_planned':
      throw new ConflictException('This requested training is not linked to a training opportunity yet. Link it in Training Planning before selecting.');
    case 'training_capacity_not_set':
      throw new ConflictException('Set the number of seats for this training in Training Planning before selecting applicants.');
    case 'training_capacity_full':
      throw new ConflictException('All seats for this training are taken. Completed or cancelled placements keep their seats; only releasing a selection or increasing capacity frees one.');
    case 'training_not_approved':
      throw new ConflictException('This training is not approved yet. Approve it in Training Planning before selecting applicants.');
    case 'training_selection_closed':
      throw new ConflictException('Selection is closed for this training. Reopen selection in Training Planning to select more applicants.');
    default:
      throwSupabaseRpcHttpException(error);
  }
}

function isStatusResult(value: unknown): value is StatusResultRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length > 0
    && typeof row.status === 'string'
    && (HR_TARGET_STATUSES as readonly string[]).includes(row.status)
    && (row.rejection_reason === null || typeof row.rejection_reason === 'string')
    && typeof row.changed_at === 'string';
}
