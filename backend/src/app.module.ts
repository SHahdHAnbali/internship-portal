import {
  Module,
} from '@nestjs/common';

import {
  ConfigModule,
} from '@nestjs/config';

import databaseConfig from './config/database.config.js';
import aiConfig from './config/ai.config.js';
import emailConfig from './config/email.config.js';

import {
  DatabaseModule,
} from './infrastructure/database/database.module.js';

import {
  AuthModule,
} from './infrastructure/auth/auth.module.js';

import {
  HrModule,
} from './modules/hr/hr.module.js';

import {
  ApplicationsModule,
} from './modules/applications/applications.module.js';

import {
  InternshipsModule,
} from './modules/internships/internships.module.js';

import {
  InternPlacementsModule,
} from './modules/intern-placements/intern-placements.module.js';

import { InternTasksModule } from './modules/intern-tasks/intern-tasks.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AccountModule } from './modules/account/account.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,

      load: [
        databaseConfig,
        aiConfig,
        emailConfig,
      ],
    }),

    DatabaseModule,

    AuthModule,

    HrModule,

    ApplicationsModule,

    InternshipsModule,

    InternPlacementsModule,

    InternTasksModule,

    AdminModule,

    AccountModule,
  ],
})
export class AppModule {}
