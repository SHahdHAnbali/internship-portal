import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../../../infrastructure/auth/roles.decorator.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { SupabaseAuthGuard } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { HrCertificatesController } from './hr-certificates.controller.js';
import { InternCertificatesController } from './intern-certificates.controller.js';

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

describe('certificate controllers: authorization', () => {
  it('require authentication and INTERN (intern routes) or HR (HR routes)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InternCertificatesController)).toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, InternCertificatesController)).toEqual(['INTERN']);
    expect(Reflect.getMetadata(GUARDS_METADATA, HrCertificatesController)).toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, HrCertificatesController)).toEqual(['HR']);
  });

  it.each(['HR', 'MENTOR', 'ADMIN', 'APPLICANT'])('refuses %s on every intern route', (role) => {
    for (const handler of ['list', 'get']) {
      expect(rolesGuardRefuses(InternCertificatesController, handler, role)).toBe(true);
    }
  });

  it.each(['INTERN', 'MENTOR', 'ADMIN', 'APPLICANT'])('refuses %s on every HR route', (role) => {
    for (const handler of ['list', 'reissue']) {
      expect(rolesGuardRefuses(HrCertificatesController, handler, role)).toBe(true);
    }
  });

  it('take the intern only from the verified request', async () => {
    const certificates = { listForIntern: vi.fn().mockResolvedValue([]), getForIntern: vi.fn().mockResolvedValue({}) };
    const controller = new InternCertificatesController(certificates as never);
    const request = { authUser: { id: 'verified-intern', role: 'INTERN' } } as never;
    await controller.list(request);
    await controller.get('placement-1', request);
    expect(certificates.listForIntern).toHaveBeenCalledWith('verified-intern');
    expect(certificates.getForIntern).toHaveBeenCalledWith('verified-intern', 'placement-1');
    expect(() => controller.list({} as never)).toThrow(UnauthorizedException);
    expect(() => controller.get('placement-1', {} as never)).toThrow(UnauthorizedException);
  });

  it('take the HR user only from the verified request', async () => {
    const certificates = { listForHrPlacement: vi.fn().mockResolvedValue([]), reissueForHr: vi.fn().mockResolvedValue({}) };
    const controller = new HrCertificatesController(certificates as never);
    const request = { authUser: { id: 'verified-hr', role: 'HR' } } as never;
    await controller.list('placement-1', request);
    await controller.reissue('cert-1', { reason: 'Name corrected' }, request);
    expect(certificates.listForHrPlacement).toHaveBeenCalledWith('verified-hr', 'placement-1');
    expect(certificates.reissueForHr).toHaveBeenCalledWith('verified-hr', 'cert-1', 'Name corrected');
    expect(() => controller.reissue('cert-1', { reason: 'x' }, {} as never)).toThrow(UnauthorizedException);
  });
});
