import { Injectable } from '@nestjs/common';

import {
  InternTaskRepository,
  type InternTaskEventResponse,
  type InternTaskPriority,
  type InternTaskResponse,
  type TaskReviewDecision,
} from '../../domain/repositories/intern-task.repository.js';

// Mentor actions on tasks of their own ACTIVE placements. The database
// functions re-check the Mentor, the assignment and the task state.
@Injectable()
export class MentorTasksService {
  constructor(private readonly tasks: InternTaskRepository) {}

  update(
    mentorProfileId: string,
    taskId: string,
    input: { title: string; description: string | null; dueDate: string | null; priority: InternTaskPriority },
  ): Promise<InternTaskResponse> {
    return this.tasks.updateForMentor({ mentorProfileId, taskId, ...input });
  }

  cancel(mentorProfileId: string, taskId: string, reason: string): Promise<InternTaskResponse> {
    return this.tasks.cancelForMentor(mentorProfileId, taskId, reason);
  }

  review(
    mentorProfileId: string,
    taskId: string,
    decision: TaskReviewDecision,
    feedback: string | null,
  ): Promise<InternTaskResponse> {
    return this.tasks.reviewForMentor(mentorProfileId, taskId, decision, feedback);
  }

  listEvents(mentorProfileId: string, placementId: string): Promise<InternTaskEventResponse[]> {
    return this.tasks.listEventsForMentorPlacement(mentorProfileId, placementId);
  }
}
