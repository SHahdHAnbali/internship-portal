import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import type { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';

// Loads an application for an HR endpoint. Unsubmitted drafts are reported
// exactly like a missing application, so their existence is not revealed and
// they can never be read, matched, parsed or downloaded by HR.
export async function loadSubmittedApplication<T extends { status: string }>(
  supabase: SupabaseService,
  applicationId: string,
  columns: string,
): Promise<T> {
  const { data, error } = await supabase.client
    .from('applications')
    .select(columns)
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    throw new InternalServerErrorException('Unable to load the application');
  }

  const row = data as T | null;
  if (!row || row.status === 'DRAFT') {
    throw new NotFoundException('Application not found');
  }

  return row;
}
