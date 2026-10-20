import type { PipeTransform } from '@nestjs/common';

import { evaluationContentProblem } from '../../domain/evaluation-content.js';
import { evaluationError } from '../../domain/evaluation-errors.js';

// Request bodies are parsed strictly here instead of by the global
// ValidationPipe, which would silently drop unknown fields: any field other
// than the ones listed (for example an actor, author, role, status or
// snapshot) is refused with 400 VALIDATION_FAILED. The text is passed on
// exactly as received (no trimming or normalization).

export interface CreateEvaluationBody {
  content: string;
  // One logical create operation, generated once by the browser and reused
  // for every retry of it.
  clientRequestId: string;
}

export interface SaveEvaluationBody {
  content: string;
  expectedRevision: number;
}

export interface PublishEvaluationBody {
  expectedRevision: number;
}

function strictObject(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw evaluationError('VALIDATION_FAILED');
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw evaluationError('VALIDATION_FAILED');
  }
  return record;
}

function content(value: unknown): string {
  if (typeof value !== 'string') throw evaluationError('VALIDATION_FAILED');
  const problem = evaluationContentProblem(value);
  if (problem) throw evaluationError(problem);
  return value;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientRequestId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw evaluationError('VALIDATION_FAILED');
  return value.toLowerCase();
}

function expectedRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw evaluationError('VALIDATION_FAILED');
  return value as number;
}

export function parseCreateEvaluationBody(body: unknown): CreateEvaluationBody {
  const record = strictObject(body, ['content', 'clientRequestId']);
  return { clientRequestId: clientRequestId(record.clientRequestId), content: content(record.content) };
}

export function parseSaveEvaluationBody(body: unknown): SaveEvaluationBody {
  const record = strictObject(body, ['content', 'expectedRevision']);
  return { expectedRevision: expectedRevision(record.expectedRevision), content: content(record.content) };
}

export function parsePublishEvaluationBody(body: unknown): PublishEvaluationBody {
  const record = strictObject(body, ['expectedRevision']);
  return { expectedRevision: expectedRevision(record.expectedRevision) };
}

export class EvaluationBodyPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly parse: (body: unknown) => T) {}

  transform(value: unknown): T {
    return this.parse(value);
  }
}
