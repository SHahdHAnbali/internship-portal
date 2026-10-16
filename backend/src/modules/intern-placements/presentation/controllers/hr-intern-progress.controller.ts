import {
  Controller,
  Get,
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
import { InternProgressService } from '../../application/services/intern-progress.service.js';

@Controller('hr/intern-progress')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('HR')
export class HrInternProgressController {
  constructor(private readonly progress: InternProgressService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) throw new UnauthorizedException('Authentication required');
    return this.progress.list(actorProfileId);
  }
}
