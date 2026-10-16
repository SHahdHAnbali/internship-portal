import { describe, expect, it } from 'vitest';

import { selectionBlockedReason } from './selection-eligibility';
import type { ApplicationDetails } from './types';

const opportunity = { id: 'o', title: 'Backend', selectionStatus: 'OPEN' as const, capacity: 2, seatsConsumed: 1, remainingSeats: 1 };
const app = (overrides: Partial<ApplicationDetails['opportunity']> | null) =>
  ({ opportunity: overrides === null ? null : { ...opportunity, ...overrides } }) as ApplicationDetails;

describe('selectionBlockedReason (mirrors the server rules)', () => {
  it('allows selection when approved, open, with capacity and a free seat', () => {
    expect(selectionBlockedReason(app({}))).toBeNull();
  });

  it.each([
    ['an unlinked request', null, 'not linked'],
    ['a type awaiting approval', { selectionStatus: 'NOT_APPROVED' as const }, 'not approved'],
    ['closed selection', { selectionStatus: 'CLOSED' as const }, 'Selection is closed'],
    ['no capacity', { capacity: null, remainingSeats: null }, 'Set the capacity'],
    ['no seat left (completed and cancelled placements keep their seats)', { seatsConsumed: 2, remainingSeats: 0 }, 'keep their seats'],
  ])('blocks %s', (_label, overrides, text) => {
    expect(selectionBlockedReason(app(overrides))).toContain(text);
  });
});
