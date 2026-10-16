import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ActivateInternPlacementUseCase } from './application/use-cases/activate-intern-placement.use-case.js';
import { CreateInternPlacementUseCase } from './application/use-cases/create-intern-placement.use-case.js';
import { GetMyInternPlacementUseCase } from './application/use-cases/get-my-intern-placement.use-case.js';
import { GetApplicationInternPlacementUseCase } from './application/use-cases/get-application-intern-placement.use-case.js';
import { AssignInternPlacementMentorUseCase } from './application/use-cases/assign-intern-placement-mentor.use-case.js';
import { CancelInternPlacementUseCase } from './application/use-cases/cancel-intern-placement.use-case.js';
import { CompleteInternPlacementUseCase } from './application/use-cases/complete-intern-placement.use-case.js';
import { ListHrMentorsUseCase } from './application/use-cases/list-hr-mentors.use-case.js';
import { UnassignInternPlacementMentorUseCase } from './application/use-cases/unassign-intern-placement-mentor.use-case.js';
import { InternPlacementRepository } from './domain/repositories/intern-placement.repository.js';
import { SupabaseInternPlacementRepository } from './infrastructure/repositories/supabase-intern-placement.repository.js';
import { HrInternPlacementsController } from './presentation/controllers/hr-intern-placements.controller.js';
import { InternPlacementController } from './presentation/controllers/intern-placement.controller.js';
import { HrInternProgressController } from './presentation/controllers/hr-intern-progress.controller.js';
import { InternProgressService } from './application/services/intern-progress.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [HrInternPlacementsController, InternPlacementController, HrInternProgressController],
  providers: [
    CreateInternPlacementUseCase,
    ActivateInternPlacementUseCase,
    CancelInternPlacementUseCase,
    CompleteInternPlacementUseCase,
    GetMyInternPlacementUseCase,
    GetApplicationInternPlacementUseCase,
    AssignInternPlacementMentorUseCase,
    UnassignInternPlacementMentorUseCase,
    ListHrMentorsUseCase,
    InternProgressService,
    {
      provide: InternPlacementRepository,
      useClass: SupabaseInternPlacementRepository,
    },
  ],
})
export class InternPlacementsModule {}
