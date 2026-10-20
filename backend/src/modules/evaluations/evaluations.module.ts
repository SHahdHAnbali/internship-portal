import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { EvaluationRepository } from './domain/repositories/evaluation.repository.js';
import { SupabaseEvaluationRepository } from './infrastructure/repositories/supabase-evaluation.repository.js';
import { InternEvaluationsController } from './presentation/controllers/intern-evaluations.controller.js';
import { MentorEvaluationsController } from './presentation/controllers/mentor-evaluations.controller.js';

// Mentor evaluations: assigned Mentors write and publish; interns read
// published snapshots. HR and ADMIN have no route here.
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [MentorEvaluationsController, InternEvaluationsController],
  providers: [
    {
      provide: EvaluationRepository,
      useClass: SupabaseEvaluationRepository,
    },
  ],
})
export class EvaluationsModule {}
