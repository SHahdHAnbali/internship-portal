import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { userScopedKey } from './query-client';

describe('userScopedKey', () => {
  it('appends the user, so two users never share a cache entry', () => {
    expect(userScopedKey(['mentor', 'placements'], 'mentor-1')).toEqual(['mentor', 'placements', 'mentor-1']);
    expect(userScopedKey(['mentor', 'placements'], 'mentor-1')).not.toEqual(userScopedKey(['mentor', 'placements'], 'mentor-2'));
    expect(userScopedKey(['intern', 'profile'], undefined)).toEqual(['intern', 'profile', '']);
  });

  it('keeps existing prefix invalidations working (weekly reports invalidate the unscoped prefix)', async () => {
    const client = new QueryClient();
    client.setQueryData(userScopedKey(['mentor', 'placements'], 'mentor-1'), ['a']);
    client.setQueryData(userScopedKey(['mentor', 'weekly-reports', 'p1'], 'mentor-1'), ['b']);
    await client.invalidateQueries({ queryKey: ['mentor', 'placements'] });
    await client.invalidateQueries({ queryKey: ['mentor', 'weekly-reports', 'p1'] });
    expect(client.getQueryState(userScopedKey(['mentor', 'placements'], 'mentor-1'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(userScopedKey(['mentor', 'weekly-reports', 'p1'], 'mentor-1'))?.isInvalidated).toBe(true);
  });
});
