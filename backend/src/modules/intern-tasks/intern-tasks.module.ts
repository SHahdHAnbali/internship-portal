import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { CreateMentorInternTaskUseCase } from './application/use-cases/create-mentor-intern-task.use-case.js';
import { ListMentorPlacementTasksUseCase } from './application/use-cases/list-mentor-placement-tasks.use-case.js';
import { ListMyMentorPlacementsUseCase } from './application/use-cases/list-my-mentor-placements.use-case.js';
import { ListMyInternTasksUseCase } from './application/use-cases/list-my-intern-tasks.use-case.js';
import { UpdateMyInternTaskStatusUseCase } from './application/use-cases/update-my-intern-task-status.use-case.js';
import { WithdrawMyInternTaskSubmissionUseCase } from './application/use-cases/withdraw-my-intern-task-submission.use-case.js';
import { MentorTasksService } from './application/services/mentor-tasks.service.js';
import { WeeklyReportRepository } from './domain/repositories/weekly-report.repository.js';
import { SupabaseWeeklyReportRepository } from './infrastructure/repositories/supabase-weekly-report.repository.js';
import { InternWeeklyReportsController, MentorWeeklyReportsController } from './presentation/controllers/weekly-reports.controller.js';
import { InternTaskRepository } from './domain/repositories/intern-task.repository.js';
import { SupabaseInternTaskRepository } from './infrastructure/repositories/supabase-intern-task.repository.js';
import { InternTasksController } from './presentation/controllers/intern-tasks.controller.js';
import { MentorInternTasksController } from './presentation/controllers/mentor-intern-tasks.controller.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [MentorInternTasksController, InternTasksController, InternWeeklyReportsController, MentorWeeklyReportsController],
  providers: [
    CreateMentorInternTaskUseCase,
    ListMentorPlacementTasksUseCase,
    ListMyMentorPlacementsUseCase,
    ListMyInternTasksUseCase,
    UpdateMyInternTaskStatusUseCase,
    WithdrawMyInternTaskSubmissionUseCase,
    MentorTasksService,
    {
      provide: WeeklyReportRepository,
      useClass: SupabaseWeeklyReportRepository,
    },
    {
      provide: InternTaskRepository,
      useClass: SupabaseInternTaskRepository,
    },
  ],
})
export class InternTasksModule {}
