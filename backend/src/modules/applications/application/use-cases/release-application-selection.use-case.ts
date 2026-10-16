import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwSupabaseRpcHttpException } from '../../../../infrastructure/database/supabase-rpc-error.js';

export interface ReleasedSelection {
  id: string;
  status: string;
  selectionReleasedAt: string;
  selectionReleaseReason: string;
}

// HR explicitly releases a selection: the seat is freed for the opportunity,
// the application stays SELECTED with the reason, actor and time kept, and it
// can never receive another placement. The database checks role, state and
// placements and serializes with selections on the same opportunity.
@Injectable()
export class ReleaseApplicationSelectionUseCase {
  constructor(private readonly supabase: SupabaseService) {}

  async execute(actorProfileId: string, applicationId: string, reason: string): Promise<ReleasedSelection> {
    const { data, error } = await this.supabase.client.rpc('release_application_selection', {
      p_actor_profile_id: actorProfileId,
      p_application_id: applicationId,
      p_reason: reason,
    });
    if (error) {
      throwReleaseError(error);
    }
    const row = Array.isArray(data) && data.length === 1 ? data[0] as Record<string, unknown> : null;
    if (!row || typeof row.id !== 'string' || typeof row.selection_released_at !== 'string') {
      throw new InternalServerErrorException('Database operation returned an invalid result');
    }
    return {
      id: row.id,
      status: String(row.status),
      selectionReleasedAt: row.selection_released_at,
      selectionReleaseReason: String(row.selection_release_reason),
    };
  }
}

const MESSAGES: Record<string, () => Error> = {
  release_reason_required: () => new BadRequestException('Give a reason for releasing this selection.'),
  release_reason_too_long: () => new BadRequestException('The reason is too long.'),
  application_not_found: () => new NotFoundException('Application not found'),
  selection_already_released: () => new ConflictException('This selection has already been released.'),
  selection_not_releasable: () => new ConflictException(
    'Only a selected application without a scheduled, active or completed placement can be released. Cancel a scheduled placement first.',
  ),
};

function throwReleaseError(error: { code?: string; message?: string }): never {
  const build = error.message ? MESSAGES[error.message] : undefined;
  if (build) {
    throw build();
  }
  throwSupabaseRpcHttpException(error);
}
