import { Injectable, Logger } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import {
  evaluationError,
  knownEvaluationErrorCode,
  throwEvaluationDatabaseError,
  type DatabaseErrorLike,
} from '../../domain/evaluation-errors.js';
import {
  EvaluationRepository,
  type EvaluationPlacementStatus,
  type EvaluationPublicationState,
  type InternEvaluationResponse,
  type MentorEvaluationResponse,
} from '../../domain/repositories/evaluation.repository.js';

// Rows returned by list_mentor_evaluations, get_mentor_evaluation,
// create_mentor_evaluation, save_mentor_evaluation and publish_mentor_evaluation.
interface MentorEvaluationRecord {
  evaluation_id: string;
  placement_id: string;
  placement_status: EvaluationPlacementStatus;
  content: string;
  publication_state: EvaluationPublicationState;
  revision: number;
  published_content: string | null;
  published_revision: number | null;
  published_at: string | null;
  first_published_at: string | null;
  published_by_current_user: boolean;
  author_name: string | null;
  last_editor_name: string | null;
  created_at: string;
  updated_at: string;
  client_request_id: string | null;
  published_by_name: string | null;
}

// Rows returned by list_my_evaluations and get_my_evaluation.
interface InternEvaluationRecord {
  evaluation_id: string;
  placement_id: string;
  placement_status: EvaluationPlacementStatus;
  training_title: string;
  company: string;
  content: string;
  published_at: string;
  author_name: string | null;
  published_by_name: string | null;
}

// Calls only the public evaluation functions (never the internal
// mentor_evaluation_rows helper). Identity arguments always come from the
// verified session; every function re-checks role, assignment or ownership
// and placement state itself.
@Injectable()
export class SupabaseEvaluationRepository implements EvaluationRepository {
  private readonly logger = new Logger('EvaluationRepository');

  constructor(private readonly supabase: SupabaseService) {}

  async listForMentorPlacement(mentorProfileId: string, placementId: string): Promise<MentorEvaluationResponse[]> {
    return this.call('list_mentor_evaluations', {
      p_mentor_profile_id: mentorProfileId,
      p_placement_id: placementId,
    }, mentorMany);
  }

  async getForMentor(mentorProfileId: string, evaluationId: string): Promise<MentorEvaluationResponse> {
    return this.call('get_mentor_evaluation', {
      p_mentor_profile_id: mentorProfileId,
      p_evaluation_id: evaluationId,
    }, mentorSingle);
  }

  async createForMentor(
    mentorProfileId: string,
    placementId: string,
    clientRequestId: string,
    content: string,
  ): Promise<MentorEvaluationResponse> {
    return this.call('create_mentor_evaluation', {
      p_mentor_profile_id: mentorProfileId,
      p_placement_id: placementId,
      p_client_request_id: clientRequestId,
      p_content: content,
    }, mentorSingle);
  }

  async saveForMentor(
    mentorProfileId: string,
    evaluationId: string,
    expectedRevision: number,
    content: string,
  ): Promise<MentorEvaluationResponse> {
    return this.call('save_mentor_evaluation', {
      p_mentor_profile_id: mentorProfileId,
      p_evaluation_id: evaluationId,
      p_expected_revision: expectedRevision,
      p_content: content,
    }, mentorSingle);
  }

  async publishForMentor(
    mentorProfileId: string,
    evaluationId: string,
    expectedRevision: number,
  ): Promise<MentorEvaluationResponse> {
    return this.call('publish_mentor_evaluation', {
      p_mentor_profile_id: mentorProfileId,
      p_evaluation_id: evaluationId,
      p_expected_revision: expectedRevision,
    }, mentorSingle);
  }

  async listForIntern(authUserId: string): Promise<InternEvaluationResponse[]> {
    return this.call('list_my_evaluations', { p_auth_user_id: authUserId }, internMany);
  }

  async getForIntern(authUserId: string, evaluationId: string): Promise<InternEvaluationResponse> {
    return this.call('get_my_evaluation', {
      p_auth_user_id: authUserId,
      p_evaluation_id: evaluationId,
    }, internSingle);
  }

  // One RPC call per operation: no retries, no follow-up writes.
  private async call<T>(fn: string, args: Record<string, unknown>, parse: (data: unknown) => T): Promise<T> {
    const { data, error } = await this.supabase.client.rpc(fn, args);
    if (error) {
      // Expected conditions (access, conflicts, validation) are answered
      // normally. Anything else becomes a 500 and is logged for diagnosis with
      // the function name and a sanitized error code only: never arguments,
      // evaluation text, user ids, tokens or the database message.
      if (!knownEvaluationErrorCode(error)) {
        this.logger.error(`Evaluation database call failed: function=${fn} code=${safeErrorCode(error)}`);
      }
      throwEvaluationDatabaseError(error);
    }
    try {
      return parse(data);
    } catch (parseError) {
      this.logger.error(`Evaluation database call returned an unexpected result: function=${fn}`);
      throw parseError;
    }
  }
}

// SQLSTATE (5 characters) or PostgREST code (e.g. PGRST202, missing function);
// anything else is reported as 'unknown'.
function safeErrorCode(error: DatabaseErrorLike): string {
  const code = error.code;
  return typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? code : 'unknown';
}

function mentorMany(data: unknown): MentorEvaluationResponse[] {
  if (!Array.isArray(data) || !data.every(isMentorEvaluationRecord)) {
    throw evaluationError('EVALUATION_SERVER_ERROR');
  }
  return data.map(toMentorResponse);
}

function mentorSingle(data: unknown): MentorEvaluationResponse {
  const rows = mentorMany(data);
  if (rows.length !== 1) throw evaluationError('EVALUATION_SERVER_ERROR');
  return rows[0];
}

function internSingle(data: unknown): InternEvaluationResponse {
  const rows = internMany(data);
  if (rows.length !== 1) throw evaluationError('EVALUATION_SERVER_ERROR');
  return rows[0];
}

function internMany(data: unknown): InternEvaluationResponse[] {
  if (!Array.isArray(data) || !data.every(isInternEvaluationRecord)) {
    throw evaluationError('EVALUATION_SERVER_ERROR');
  }
  return data.map((row) => ({
    id: row.evaluation_id,
    placementId: row.placement_id,
    placementStatus: row.placement_status,
    trainingTitle: row.training_title,
    company: row.company,
    content: row.content,
    publishedAt: row.published_at,
    authorName: row.author_name,
    publishedByName: row.published_by_name,
  }));
}

function toMentorResponse(row: MentorEvaluationRecord): MentorEvaluationResponse {
  return {
    id: row.evaluation_id,
    placementId: row.placement_id,
    placementStatus: row.placement_status,
    readOnly: row.placement_status !== 'ACTIVE',
    content: row.content,
    publicationState: row.publication_state,
    revision: row.revision,
    published: row.publication_state === 'DRAFT'
      ? null
      : {
        content: row.published_content as string,
        revision: row.published_revision as number,
        publishedAt: row.published_at as string,
        firstPublishedAt: row.first_published_at as string,
        publishedByCurrentUser: row.published_by_current_user,
        publishedByName: row.published_by_name,
      },
    authorName: row.author_name,
    lastEditorName: row.last_editor_name,
    clientRequestId: row.client_request_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PLACEMENT_STATUSES = ['ACTIVE', 'COMPLETED'];
const PUBLICATION_STATES = ['DRAFT', 'UNPUBLISHED_CHANGES', 'PUBLISHED'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown) => typeof value === 'string' && value !== '';
const isNullableString = (value: unknown) => value === null || typeof value === 'string';
const isRevision = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1;

function isMentorEvaluationRecord(value: unknown): value is MentorEvaluationRecord {
  if (!isObject(value)) return false;
  const row = value;
  if (!['evaluation_id', 'placement_id', 'created_at', 'updated_at'].every((key) => isNonEmptyString(row[key]))) return false;
  if (!PLACEMENT_STATUSES.includes(String(row.placement_status))) return false;
  if (typeof row.content !== 'string' || !isRevision(row.revision)) return false;
  if (!PUBLICATION_STATES.includes(String(row.publication_state))) return false;
  if (typeof row.published_by_current_user !== 'boolean') return false;
  if (!isNullableString(row.author_name) || !isNullableString(row.last_editor_name)) return false;
  if (!isNullableString(row.client_request_id) || !isNullableString(row.published_by_name)) return false;
  if (row.publication_state === 'DRAFT') {
    return row.published_content === null && row.published_revision === null
      && row.published_at === null && row.first_published_at === null && row.published_by_name === null;
  }
  return typeof row.published_content === 'string' && isRevision(row.published_revision)
    && isNonEmptyString(row.published_at) && isNonEmptyString(row.first_published_at);
}

function isInternEvaluationRecord(value: unknown): value is InternEvaluationRecord {
  if (!isObject(value)) return false;
  const row = value;
  return ['evaluation_id', 'placement_id', 'published_at', 'training_title', 'company'].every((key) => isNonEmptyString(row[key]))
    && PLACEMENT_STATUSES.includes(String(row.placement_status))
    && typeof row.content === 'string'
    && isNullableString(row.author_name)
    && isNullableString(row.published_by_name);
}
