import { BadRequestException, Injectable } from '@nestjs/common';

import {
  InternTaskRepository,
  type InternTaskPriority,
  type InternTaskResponse,
} from '../../domain/repositories/intern-task.repository.js';

export interface CreateMentorInternTaskCommand {
  mentorProfileId: string;
  placementId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: InternTaskPriority;
}

@Injectable()
export class CreateMentorInternTaskUseCase {
  constructor(private readonly tasks: InternTaskRepository) {}

  execute(command: CreateMentorInternTaskCommand): Promise<InternTaskResponse> {
    const title = command.title.trim();
    if (!title) throw new BadRequestException('Task title is required');

    const dueDate = command.dueDate || null;
    if (dueDate && !isDateOnly(dueDate)) {
      throw new BadRequestException('Due date must be a valid calendar date');
    }

    return this.tasks.createForMentor({
      ...command,
      title,
      description: command.description?.trim() || null,
      dueDate,
      priority: command.priority ?? 'MEDIUM',
    });
  }
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
