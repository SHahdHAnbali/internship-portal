import { AdminSettingsService } from './admin-settings.service.js';

function stub(rpcResult: unknown = { data: [{}], error: null }) {
  const row = { applications_open: false, updated_at: 't', updater: { full_name: 'Admin', email: 'a@x.com' } };
  const query = { select: () => query, maybeSingle: vi.fn(async () => ({ data: row, error: null })) };
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { service: new AdminSettingsService({ client: { from: () => query, rpc } } as never), rpc };
}

describe('AdminSettingsService', () => {
  it('changes intake through the ADMIN-only function and returns the stored setting', async () => {
    const { service, rpc } = stub();
    await expect(service.setApplicationIntake('admin-id', false, 'Cycle closed'))
      .resolves.toEqual({ applicationsOpen: false, updatedAt: 't', updatedBy: 'Admin' });
    expect(rpc).toHaveBeenCalledWith('admin_set_application_intake', {
      p_actor_profile_id: 'admin-id', p_open: false, p_note: 'Cycle closed',
    });
  });

  it.each([
    ['admin_role_required', 403],
    ['intake_unchanged', 409],
    ['invalid_intake_setting', 400],
  ])('maps %s to %i', async (key, status) => {
    const { service } = stub({ data: null, error: { code: status === 403 ? 'PZ403' : 'PZ409', message: key } });
    await expect(service.setApplicationIntake('x', true, null)).rejects.toMatchObject({ status });
  });
});
