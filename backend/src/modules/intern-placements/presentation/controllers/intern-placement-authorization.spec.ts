import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { ROLES_KEY } from '../../../../infrastructure/auth/roles.decorator.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { SupabaseAuthGuard } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { HrInternPlacementsController } from './hr-intern-placements.controller.js';
import { InternPlacementController } from './intern-placement.controller.js';

function roleContext(handler: Function, controller: Function, role: string) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ authUser: { id: 'user-id', role } }),
    }),
  } as never;
}

describe('Intern placement controller authorization metadata', () => {
  it.each(['create', 'activate', 'getForApplication', 'getMentors', 'assignPlacementMentor'] as const)(
    'protects HR.%s with authentication and HR authorization',
    (methodName) => {
      const handler = HrInternPlacementsController.prototype[methodName];
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        SupabaseAuthGuard,
        RolesGuard,
      ]);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['HR']);
    },
  );

  it('protects the own-placement route as INTERN-only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InternPlacementController))
      .toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, InternPlacementController)).toEqual(['INTERN']);
  });

  it('allows HR and rejects Applicant, Intern, and Admin on HR placement endpoints', () => {
    const handler = Object.getOwnPropertyDescriptor(
      HrInternPlacementsController.prototype,
      'create',
    )?.value as Function;
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(
      roleContext(handler, HrInternPlacementsController, 'HR'),
    )).toBe(true);

    for (const role of ['APPLICANT', 'INTERN', 'ADMIN']) {
      expect(() => guard.canActivate(
        roleContext(handler, HrInternPlacementsController, role),
      )).toThrow(ForbiddenException);
    }
  });

  it('requires the authenticated session before reading an application placement', async () => {
    const getForApplication = vi.fn().mockResolvedValue({ id: 'placement-id' });
    const controller = new HrInternPlacementsController(
      {} as never,
      {} as never,
      {} as never,
      { execute: getForApplication } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() => controller.getForApplication(
      'application-id',
      { authUser: undefined } as never,
    )).toThrow(UnauthorizedException);
    expect(getForApplication).not.toHaveBeenCalled();

    await expect(controller.getForApplication(
      'application-id',
      { authUser: { id: 'verified-hr-id', role: 'HR' } } as never,
    )).resolves.toEqual({ id: 'placement-id' });
    expect(getForApplication).toHaveBeenCalledWith('application-id');
  });

  it('derives Mentor assignment actor from the verified request', async () => {
    const assign = vi.fn().mockResolvedValue({ id: 'placement-id' });
    const controller = new HrInternPlacementsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { execute: assign } as never,
      {} as never,
      {} as never,
    );
    await expect(controller.assignPlacementMentor(
      'placement-id',
      { mentorProfileId: 'requested-target-mentor-id' },
      { authUser: { id: 'verified-hr-id', role: 'HR' } } as never,
    )).resolves.toEqual({ id: 'placement-id' });
    expect(assign).toHaveBeenCalledWith('verified-hr-id', 'placement-id', 'requested-target-mentor-id');
  });

  it('derives the Mentor removal actor from the verified request', async () => {
    const unassign = vi.fn().mockResolvedValue({ id: 'placement-id' });
    const controller = new HrInternPlacementsController(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { execute: unassign } as never,
      {} as never,
    );
    expect(() => controller.unassignPlacementMentor('placement-id', {}, { authUser: undefined } as never))
      .toThrow(UnauthorizedException);
    await expect(controller.unassignPlacementMentor(
      'placement-id',
      { note: 'On leave' },
      { authUser: { id: 'verified-hr-id', role: 'HR' } } as never,
    )).resolves.toEqual({ id: 'placement-id' });
    expect(unassign).toHaveBeenCalledWith('verified-hr-id', 'placement-id', 'On leave');
  });

  it('derives the completing HR actor from the verified request', async () => {
    const complete = vi.fn().mockResolvedValue({ id: 'placement-id', status: 'COMPLETED' });
    const controller = new HrInternPlacementsController(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { execute: complete } as never,
    );
    expect(() => controller.complete('placement-id', {}, { authUser: undefined } as never)).toThrow(UnauthorizedException);
    await expect(controller.complete('placement-id', { note: 'Moved abroad' },
      { authUser: { id: 'verified-hr-id', role: 'HR' } } as never)).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(complete).toHaveBeenCalledWith('verified-hr-id', 'placement-id', 'Moved abroad');
  });
});
