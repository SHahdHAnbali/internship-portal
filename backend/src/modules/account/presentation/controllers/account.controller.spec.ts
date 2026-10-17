import { Global, Module, type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { AccountModule } from '../../account.module.js';

type Role = 'APPLICANT' | 'INTERN' | 'MENTOR' | 'HR' | 'ADMIN';
const ROLES: Role[] = ['APPLICANT', 'INTERN', 'MENTOR', 'HR', 'ADMIN'];
const tokenFor = (role: Role) => `${role.toLowerCase()}-token`;
const idFor = (role: Role) => `${role.toLowerCase()}-user-id`;

function createSupabaseMock() {
  // Role tokens have not set a password yet (setup pending); the "-set"
  // tokens already have one (e.g. a later password reset).
  const users = new Map<string, { id: string; role: Role | null; active?: boolean; passwordSetAt?: string | null }>(
    ROLES.map((role) => [tokenFor(role), { id: idFor(role), role, passwordSetAt: null }]),
  );
  for (const role of ROLES) users.set(`${tokenFor(role)}-set`, { id: idFor(role), role, passwordSetAt: '2026-10-01T00:00:00Z' });
  users.set('no-profile-token', { id: 'no-profile-user-id', role: null });
  users.set('inactive-hr-token', { id: 'inactive-hr-id', role: 'HR', active: false });

  const rpc = vi.fn(async (_name: string, _args: { p_profile_id: string }) => (
    { data: '2026-10-17T12:00:00.000Z' as string | null, error: null as null | { code: string; message: string } }
  ));

  return {
    rpc,
    client: {
      auth: {
        getUser: vi.fn(async (token: string) => {
          const user = users.get(token);
          return user
            ? { data: { user: { id: user.id, email: `${user.id}@example.com` } }, error: null }
            : { data: { user: null }, error: { message: 'invalid' } };
        }),
      },
      from: vi.fn(() => {
        let profileId = '';
        const query = {
          select: () => query,
          eq: (_column: string, value: string) => { profileId = value; return query; },
          maybeSingle: async () => {
            const user = [...users.values()].find((candidate) => candidate.id === profileId);
            return {
              data: user?.role ? { role: user.role, is_active: user.active ?? true, password_set_at: user.passwordSetAt ?? null } : null,
              error: null,
            };
          },
        };
        return query;
      }),
      rpc,
    },
  };
}

describe('POST /account/password-setup', () => {
  let app: INestApplication;
  let supabase: ReturnType<typeof createSupabaseMock>;

  beforeAll(async () => {
    supabase = createSupabaseMock();
    // Stands in for the app's global DatabaseModule.
    @Global()
    @Module({ providers: [{ provide: SupabaseService, useValue: supabase }], exports: [SupabaseService] })
    class TestDatabaseModule {}
    const moduleRef = await Test.createTestingModule({ imports: [TestDatabaseModule, AccountModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { supabase.rpc.mockClear(); });

  const send = (token?: string, body?: object) => {
    let req = request(app.getHttpServer()).post('/account/password-setup');
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  };

  it('rejects missing, forged and profile-less sessions with 401 and records nothing', async () => {
    await send().expect(401);
    await send('forged-token').expect(401);
    await send('no-profile-token').expect(401);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('refuses a deactivated account with 403', async () => {
    await send('inactive-hr-token').expect(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each(ROLES)('stays reachable for %s after a password is already set (password reset)', async (role) => {
    await send(`${tokenFor(role)}-set`).expect(200);
    expect(supabase.rpc).toHaveBeenCalledWith('mark_my_password_set', { p_profile_id: idFor(role) });
  });

  it.each(ROLES)('lets %s with setup pending record their own setup, using the verified profile only', async (role) => {
    const response = await send(tokenFor(role), { profileId: 'someone-else', password: 'never-sent' }).expect(200);
    expect(response.body).toEqual({ passwordSetAt: '2026-10-17T12:00:00.000Z' });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('mark_my_password_set', { p_profile_id: idFor(role) });
  });

  it('maps a database refusal to a safe HTTP error', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PZ404', message: 'profile_not_found' } });
    const response = await send(tokenFor('HR')).expect(404);
    expect(JSON.stringify(response.body)).not.toContain('profile_not_found');
  });
});
