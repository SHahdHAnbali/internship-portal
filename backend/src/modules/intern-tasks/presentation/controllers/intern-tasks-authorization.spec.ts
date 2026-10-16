import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../../../infrastructure/auth/roles.decorator.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { SupabaseAuthGuard } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { InternTasksController } from './intern-tasks.controller.js';
import { MentorInternTasksController } from './mentor-intern-tasks.controller.js';

describe('Intern task controller authorization', () => {
  it('protects Mentor task routes with authentication and MENTOR-only role metadata', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MentorInternTasksController))
      .toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, MentorInternTasksController)).toEqual(['MENTOR']);
  });

  it('protects Intern task routes with authentication and INTERN-only role metadata', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InternTasksController))
      .toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, InternTasksController)).toEqual(['INTERN']);
  });

  it('does not allow non-Intern roles to use Intern task endpoints', () => {
    const handler = Object.getOwnPropertyDescriptor(
      InternTasksController.prototype,
      'list',
    )?.value as Function;
    const guard = new RolesGuard(new Reflector());
    for (const role of ['APPLICANT', 'HR', 'MENTOR', 'ADMIN']) {
      expect(() => guard.canActivate({
        getHandler: () => handler,
        getClass: () => InternTasksController,
        switchToHttp: () => ({ getRequest: () => ({ authUser: { role } }) }),
      } as never)).toThrow(ForbiddenException);
    }
  });

  it('does not allow HR or Intern to use Mentor task endpoints', () => {
    const handler = Object.getOwnPropertyDescriptor(
      MentorInternTasksController.prototype,
      'listPlacementsForMentor',
    )?.value as Function;
    const guard = new RolesGuard(new Reflector());
    for (const role of ['APPLICANT', 'HR', 'INTERN', 'ADMIN']) {
      expect(() => guard.canActivate({
        getHandler: () => handler,
        getClass: () => MentorInternTasksController,
        switchToHttp: () => ({ getRequest: () => ({ authUser: { role } }) }),
      } as never)).toThrow(ForbiddenException);
    }
  });

  it('derives Mentor placement identity from the authenticated request', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const controller = new MentorInternTasksController({ execute } as never, {} as never, {} as never, {} as never);
    await expect(controller.listPlacementsForMentor({ authUser: { id: 'verified-mentor-id' } } as never)
    ).resolves.toEqual([]);
    expect(execute).toHaveBeenCalledWith('verified-mentor-id');
  });

  it('requires verified request identity before listing Intern tasks', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const controller = new InternTasksController({ execute } as never, {} as never, {} as never);
    expect(() => controller.list({ authUser: undefined } as never)).toThrow(UnauthorizedException);
    expect(execute).not.toHaveBeenCalled();
    await expect(controller.list({ authUser: { id: 'verified-id' } } as never)).resolves.toEqual([]);
    expect(execute).toHaveBeenCalledWith('verified-id');
  });

  it('derives the withdrawing intern from the verified request, never from the body', async () => {
    const execute = vi.fn().mockResolvedValue({ id: 'task-id', status: 'IN_PROGRESS' });
    const controller = new InternTasksController({} as never, {} as never, { execute } as never);
    expect(() => controller.withdraw('task-id', { authUser: undefined } as never)).toThrow(UnauthorizedException);
    expect(execute).not.toHaveBeenCalled();
    await expect(controller.withdraw('task-id', { authUser: { id: 'verified-intern-id' } } as never))
      .resolves.toMatchObject({ status: 'IN_PROGRESS' });
    expect(execute).toHaveBeenCalledWith('verified-intern-id', 'task-id');
  });
});
