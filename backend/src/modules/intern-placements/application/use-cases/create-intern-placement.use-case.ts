import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import {
  InternPlacementRepository,
  type InternPlacementResponse,
} from '../../domain/repositories/intern-placement.repository.js';

export interface CreateInternPlacementCommand {
  actorProfileId: string;
  applicationId: string;
  company: string;
  department?: string | null;
  startDate: string;
  endDate: string;
}

@Injectable()
export class CreateInternPlacementUseCase {
  constructor(
    private readonly placements: InternPlacementRepository,
  ) {}

  execute(
    command: CreateInternPlacementCommand,
  ): Promise<InternPlacementResponse> {
    const company = command.company.trim();
    if (!company) {
      throw new BadRequestException('Company is required');
    }

    if (
      !isDateOnly(command.startDate) ||
      !isDateOnly(command.endDate) ||
      command.endDate < command.startDate
    ) {
      throw new BadRequestException('A valid placement date range is required');
    }

    return this.placements.create({
      ...command,
      company,
      department: command.department?.trim() || null,
    });
  }
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
