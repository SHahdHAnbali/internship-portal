import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';

import { PasswordSetupService } from './application/services/password-setup.service.js';
import { AccountController } from './presentation/controllers/account.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [PasswordSetupService],
})
export class AccountModule {}
