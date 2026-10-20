import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
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
import {
  ReissueCertificateBodyPipe,
  type ReissueCertificateBody,
} from '../dto/reissue-certificate-body.js';

// HR: a placement's certificate records (current and superseded) and
// reissue with a reason. Certificates are issued by completing the placement
// (POST /hr/placements/:placementId/complete), not here. The HR user is
// always the verified session's user; the database re-checks the HR role.
@Controller('hr')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('HR')
export class HrCertificatesController {
  constructor(private readonly certificates: CertificateRepository) {}

  @Get('placements/:placementId/certificates')
  @Header('Cache-Control', 'no-store')
  list(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.certificates.listForHrPlacement(userId(request), placementId);
  }

  // Supersedes the current record and creates a new one from the current
  // name and training title (201 with the new record).
  @Post('certificates/:certificateId/reissue')
  @Header('Cache-Control', 'no-store')
  reissue(
    @Param('certificateId', ParseUUIDPipe) certificateId: string,
    @Body(new ReissueCertificateBodyPipe()) body: ReissueCertificateBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.certificates.reissueForHr(userId(request), certificateId, body.reason);
  }
}

function userId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) throw new UnauthorizedException('Authentication required');
  return id;
}
