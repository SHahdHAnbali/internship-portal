import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';

import { AdminOverviewService } from './application/services/admin-overview.service.js';
import { AdminUsersService } from './application/services/admin-users.service.js';
import { AdminSettingsService } from './application/services/admin-settings.service.js';
import { AdminController } from './presentation/controllers/admin.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminOverviewService, AdminUsersService, AdminSettingsService],
})
export class AdminModule {}
