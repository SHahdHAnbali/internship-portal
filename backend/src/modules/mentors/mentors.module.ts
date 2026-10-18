import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ListMyMentorPlacementsUseCase } from './application/use-cases/list-my-mentor-placements.use-case.js';
import { MentorPlacementRepository } from './domain/repositories/mentor-placement.repository.js';
import { SupabaseMentorPlacementRepository } from './infrastructure/repositories/supabase-mentor-placement.repository.js';
import { MentorPlacementsController } from './presentation/controllers/mentors.controller.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [MentorPlacementsController],
  providers: [
    ListMyMentorPlacementsUseCase,
    {
      provide: MentorPlacementRepository,
      useClass: SupabaseMentorPlacementRepository,
    },
  ],
})
export class MentorsModule {}
