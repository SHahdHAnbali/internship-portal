import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SupabaseAuthGuard, type AuthenticatedRequest } from './supabase-auth.guard.js';
import { ALLOW_PENDING_PASSWORD_SETUP_KEY } from './password-setup.js';

type ProfileResult = { data: unknown; error: { code?: string; message?: string } | null };

function guardWith(results: ProfileResult[], allowPending = false) {
  const selects: string[] = [];
  const supabase = {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'u1@example.com' } }, error: null })) },
      from: vi.fn(() => {
        const query = {
          select: (columns: string) => { selects.push(columns); return query; },
          eq: () => query,
          maybeSingle: async () => results.shift() ?? { data: null, error: null },
        };
        return query;
      }),
    },
  };
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => (key === ALLOW_PENDING_PASSWORD_SETUP_KEY ? allowPending : undefined));
  const request = { headers: { authorization: 'Bearer test-token' } } as unknown as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { guard: new SupabaseAuthGuard(supabase as never, reflector), context, request, selects };
}

describe('SupabaseAuthGuard password setup', () => {
  it('lets a user with a password set through and attaches the verified identity', async () => {
    const { guard, context, request } = guardWith([{ data: { role: 'HR', is_active: true, password_set_at: '2026-10-01T00:00:00Z' }, error: null }]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authUser).toEqual({ id: 'u1', email: 'u1@example.com', role: 'HR' });
  });

  it('refuses a pending user with PASSWORD_SETUP_REQUIRED', async () => {
    const { guard, context, request } = guardWith([{ data: { role: 'HR', is_active: true, password_set_at: null }, error: null }]);
    const failure = guard.canActivate(context);
    await expect(failure).rejects.toBeInstanceOf(ForbiddenException);
    await expect(failure).rejects.toMatchObject({ response: { code: 'PASSWORD_SETUP_REQUIRED' } });
    expect(request.authUser).toBeUndefined();
  });

  it('lets a pending user through only on routes marked for setup', async () => {
    const { guard, context } = guardWith([{ data: { role: 'INTERN', is_active: true, password_set_at: null }, error: null }], true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('checks deactivation before setup', async () => {
    const { guard, context } = guardWith([{ data: { role: 'HR', is_active: false, password_set_at: null }, error: null }], true);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ message: 'This account has been deactivated' });
  });

  it('before the migration (column missing) keeps the previous behaviour', async () => {
    const { guard, context, selects } = guardWith([
      { data: null, error: { code: '42703', message: 'column profiles.password_set_at does not exist' } },
      { data: { role: 'HR', is_active: true }, error: null },
    ]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(selects).toEqual(['role, is_active, password_set_at', 'role, is_active']);
  });

  it('treats any other profile error as an invalid session', async () => {
    const { guard, context } = guardWith([{ data: null, error: { code: 'PGRST301', message: 'boom' } }]);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
