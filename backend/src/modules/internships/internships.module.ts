import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';

import { CreateInternshipUseCase } from './application/use-cases/create-internship.use-case.js';

import { ListInternshipsUseCase } from './application/use-cases/list-internships.use-case.js';

import { UpdateInternshipUseCase } from './application/use-cases/update-internship.use-case.js';

import { InternshipRepository } from './domain/repositories/internship.repository.js';

import { SupabaseInternshipRepository } from './infrastructure/repositories/supabase-internship.repository.js';

import { InternshipsController } from './presentation/controllers/internships.controller.js';

import { InternshipRequirementsService } from './application/services/internship-requirements.service.js';

import { InternshipRequirementsController } from './presentation/controllers/internship-requirements.controller.js';

import { TrainingPlanningService } from './application/services/training-planning.service.js';

import { TrainingPlanningController } from './presentation/controllers/training-planning.controller.js';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
  ],

  controllers: [
    InternshipsController,
    InternshipRequirementsController,
    TrainingPlanningController,
  ],

  providers: [
    ListInternshipsUseCase,
    CreateInternshipUseCase,
    UpdateInternshipUseCase,
    InternshipRequirementsService,
    TrainingPlanningService,
    {
      provide: InternshipRepository,
      useClass: SupabaseInternshipRepository,
    },
  ],

  // The HR dashboard reuses the planning summary for its demand card.
  exports: [TrainingPlanningService],
})
export class InternshipsModule {}
