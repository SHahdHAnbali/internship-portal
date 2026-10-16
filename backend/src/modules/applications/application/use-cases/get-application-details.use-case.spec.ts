import { GetApplicationDetailsUseCase } from './get-application-details.use-case.js';

function stub(options: { application: Record<string, unknown>; placements?: string[]; opportunityId?: string | null }) {
  const from = vi.fn((table: string) => {
    // A real promise with the chainable builder methods (the placements list is
    // awaited directly; single rows use maybeSingle).
    const builder: Record<string, unknown> = Object.assign(
      Promise.resolve({ data: (options.placements ?? []).map((status) => ({ status })), error: null }),
      {} as Record<string, unknown>,
    );
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.neq = () => builder;
    builder.order = async () => ({ data: [], error: null });
    builder.maybeSingle = async () => ({
      data: table === 'applications'
        ? options.application
        : { id: 'opp', title: 'Backend', is_active: true, selection_status: 'OPEN', capacity: 3 },
      error: null,
    });
    return builder;
  });
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'resolve_application_training' ? options.opportunityId ?? null : 2,
    error: null,
  }));
  return new GetApplicationDetailsUseCase({ client: { from, rpc } } as never);
}

const base = {
  id: 'application-id', status: 'SELECTED', applied_at: 'a', submitted_at: 's', created_at: 'c', cv_path: 'cv.pdf',
  extracted_data: {}, original_extracted_data: null, requested_training: null, rejection_reason: null,
  selection_released_at: null, selection_release_reason: null, releaser: null,
  applicants: { id: 'b', full_name: 'A', email: 'a@x.com' }, internships: { id: 'opp', title: 'Backend' },
};

describe('GetApplicationDetailsUseCase: opportunity seats and release', () => {
  it('reports the opportunity with cumulative seats and allows release without an open or completed placement', async () => {
    const details = await stub({ application: base, placements: ['CANCELLED'], opportunityId: 'opp' }).execute('application-id');
    expect(details.opportunity).toEqual({
      id: 'opp', title: 'Backend', selectionStatus: 'OPEN', capacity: 3, seatsConsumed: 2, remainingSeats: 1,
    });
    expect(details.canReleaseSelection).toBe(true);
    expect(details.selectionRelease).toBeNull();
  });

  it('never offers release while a placement is scheduled, active or completed', async () => {
    for (const status of ['SCHEDULED', 'ACTIVE', 'COMPLETED']) {
      const details = await stub({ application: base, placements: [status], opportunityId: 'opp' }).execute('application-id');
      expect(details.canReleaseSelection).toBe(false);
    }
  });

  it('shows a recorded release (final) and an unlinked request as no opportunity', async () => {
    const released = {
      ...base, internships: null, requested_training: 'Astronomy',
      selection_released_at: '2026-10-14T10:00:00Z', selection_release_reason: 'Declined offer', releaser: { full_name: 'HR Person' },
    };
    const details = await stub({ application: released, opportunityId: null }).execute('application-id');
    expect(details.opportunity).toBeNull();
    expect(details.selectionRelease).toEqual({ releasedAt: '2026-10-14T10:00:00Z', reason: 'Declined offer', releasedBy: 'HR Person' });
    expect(details.canReleaseSelection).toBe(false);
  });
});
