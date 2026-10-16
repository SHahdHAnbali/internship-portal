import { IsUUID } from 'class-validator';

export class AssignInternPlacementMentorDto {
  @IsUUID()
  mentorProfileId!: string;
}
