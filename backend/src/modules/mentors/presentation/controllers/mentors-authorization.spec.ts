import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../../../infrastructure/auth/roles.decorator.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { SupabaseAuthGuard } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { MentorPlacementsController } from './mentors.controller.js';

describe('Mentor placements controller authorization', () => {
  it('requires authentication and the MENTOR role', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MentorPlacementsController))
      .toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, MentorPlacementsController)).toEqual(['MENTOR']);
  });

  it('does not allow other roles to list Mentor placements', () => {
    const handler = Object.getOwnPropertyDescriptor(MentorPlacementsController.prototype, 'list')?.value as Function;
    const guard = new RolesGuard(new Reflector());
    for (const role of ['APPLICANT', 'HR', 'INTERN', 'ADMIN']) {
      expect(() => guard.canActivate({
        getHandler: () => handler,
        getClass: () => MentorPlacementsController,
        switchToHttp: () => ({ getRequest: () => ({ authUser: { role } }) }),
      } as never)).toThrow(ForbiddenException);
    }
  });

  it('derives the Mentor from the authenticated request', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const controller = new MentorPlacementsController({ execute } as never);
    await expect(controller.list({ authUser: { id: 'verified-mentor-id' } } as never)).resolves.toEqual([]);
    expect(execute).toHaveBeenCalledWith('verified-mentor-id');
  });

  it('refuses a request without a verified identity', () => {
    const controller = new MentorPlacementsController({ execute: vi.fn() } as never);
    expect(() => controller.list({} as never)).toThrow(UnauthorizedException);
  });
});
