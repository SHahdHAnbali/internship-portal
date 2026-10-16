import { HttpException } from '@nestjs/common';
import { throwSupabaseRpcHttpException } from './supabase-rpc-error.js';

describe('throwSupabaseRpcHttpException', () => {
  it.each([
    ['PZ400', 400],
    ['23502', 400],
    ['23514', 400],
    ['PZ403', 403],
    ['PZ404', 404],
    ['PZ409', 409],
    ['23503', 409],
    ['23505', 409],
    ['XX999', 500],
  ])('maps SQLSTATE %s to HTTP %i without exposing database details', (code, status) => {
    let caught: unknown;
    try {
      throwSupabaseRpcHttpException({
        code,
        message: 'private database detail',
      } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(status);
    expect((caught as Error).message).not.toContain('private database detail');
  });
});
