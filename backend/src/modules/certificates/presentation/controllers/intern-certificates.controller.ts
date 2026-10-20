import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { CertificateRepository } from '../../domain/repositories/certificate.repository.js';

// The intern's own current certificates of completion. A certificate has no
// number and the intern never receives its internal record id: one is
// addressed by its placement. The intern is always the verified session's
// user; ownership is re-checked in the database.
@Controller('intern/me/certificates')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('INTERN')
export class InternCertificatesController {
  constructor(private readonly certificates: CertificateRepository) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest) {
    return this.certificates.listForIntern(userId(request));
  }

  @Get(':placementId')
  @Header('Cache-Control', 'no-store')
  get(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.certificates.getForIntern(userId(request), placementId);
  }
}

function userId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) throw new UnauthorizedException('Authentication required');
  return id;
}
