import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { WeeklyReportRepository } from './domain/repositories/weekly-report.repository.js';
import { SupabaseWeeklyReportRepository } from './infrastructure/repositories/supabase-weekly-report.repository.js';
import { InternWeeklyReportsController, MentorWeeklyReportsController } from './presentation/controllers/weekly-reports.controller.js';

// Weekly training reports (intern writes, assigned Mentor reviews). Same routes
// as before; only the module that hosts them changed.
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [InternWeeklyReportsController, MentorWeeklyReportsController],
  providers: [
    {
      provide: WeeklyReportRepository,
      useClass: SupabaseWeeklyReportRepository,
    },
  ],
})
export class WeeklyReportsModule {}
