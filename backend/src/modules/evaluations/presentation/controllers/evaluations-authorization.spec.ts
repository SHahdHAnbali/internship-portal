import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../../../infrastructure/auth/roles.decorator.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { SupabaseAuthGuard } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { InternEvaluationsController } from './intern-evaluations.controller.js';
import { MentorEvaluationsController } from './mentor-evaluations.controller.js';

function rolesGuardRefuses(controller: Function, handlerName: string, role: string): boolean {
  const handler = Object.getOwnPropertyDescriptor(controller.prototype, handlerName)?.value as Function;
  try {
    new RolesGuard(new Reflector()).canActivate({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ authUser: { role } }) }),
    } as never);
    return false;
  } catch (error) {
    return error instanceof ForbiddenException;
  }
}

describe('evaluation controllers: authorization', () => {
  it('require authentication and MENTOR (Mentor routes) or INTERN (intern routes)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MentorEvaluationsController)).toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, MentorEvaluationsController)).toEqual(['MENTOR']);
    expect(Reflect.getMetadata(GUARDS_METADATA, InternEvaluationsController)).toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, InternEvaluationsController)).toEqual(['INTERN']);
  });

  it.each(['HR', 'ADMIN', 'APPLICANT', 'INTERN'])('refuses %s on every Mentor route', (role) => {
    for (const handler of ['list', 'create', 'get', 'save', 'publish']) {
      expect(rolesGuardRefuses(MentorEvaluationsController, handler, role)).toBe(true);
    }
  });

  it.each(['HR', 'ADMIN', 'APPLICANT', 'MENTOR'])('refuses %s on every intern route', (role) => {
    for (const handler of ['list', 'get']) {
      expect(rolesGuardRefuses(InternEvaluationsController, handler, role)).toBe(true);
    }
  });

  it('take the Mentor only from the verified request', async () => {
    const evaluations = {
      listForMentorPlacement: vi.fn().mockResolvedValue([]),
      createForMentor: vi.fn().mockResolvedValue({}),
      getForMentor: vi.fn().mockResolvedValue({}),
      saveForMentor: vi.fn().mockResolvedValue({}),
      publishForMentor: vi.fn().mockResolvedValue({}),
    };
    const controller = new MentorEvaluationsController(evaluations as never);
    const request = { authUser: { id: 'verified-mentor', role: 'MENTOR' } } as never;
    await controller.list('placement-1', request);
    await controller.create('placement-1', { content: ' Exact ', clientRequestId: 'key-1' }, request);
    await controller.get('eval-1', request);
    await controller.save('eval-1', { content: 'Text', expectedRevision: 2 }, request);
    await controller.publish('eval-1', { expectedRevision: 3 }, request);
    expect(evaluations.listForMentorPlacement).toHaveBeenCalledWith('verified-mentor', 'placement-1');
    expect(evaluations.createForMentor).toHaveBeenCalledWith('verified-mentor', 'placement-1', 'key-1', ' Exact ');
    expect(evaluations.getForMentor).toHaveBeenCalledWith('verified-mentor', 'eval-1');
    expect(evaluations.saveForMentor).toHaveBeenCalledWith('verified-mentor', 'eval-1', 2, 'Text');
    expect(evaluations.publishForMentor).toHaveBeenCalledWith('verified-mentor', 'eval-1', 3);
    expect(() => controller.get('eval-1', {} as never)).toThrow(UnauthorizedException);
  });

  it('take the intern only from the verified request', async () => {
    const evaluations = { listForIntern: vi.fn().mockResolvedValue([]), getForIntern: vi.fn().mockResolvedValue({}) };
    const controller = new InternEvaluationsController(evaluations as never);
    const request = { authUser: { id: 'verified-intern', role: 'INTERN' } } as never;
    await controller.list(request);
    await controller.get('eval-1', request);
    expect(evaluations.listForIntern).toHaveBeenCalledWith('verified-intern');
    expect(evaluations.getForIntern).toHaveBeenCalledWith('verified-intern', 'eval-1');
    expect(() => controller.list({} as never)).toThrow(UnauthorizedException);
  });
});
