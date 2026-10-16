import { BadRequestException } from '@nestjs/common';
import { CreateMentorInternTaskUseCase } from './create-mentor-intern-task.use-case.js';

describe('CreateMentorInternTaskUseCase', () => {
  it('normalizes task details before passing them to the Mentor-scoped repository', async () => {
    const createForMentor = vi.fn().mockResolvedValue({ id: 'task-id' });
    const useCase = new CreateMentorInternTaskUseCase({ createForMentor } as never);

    await expect(useCase.execute({
      mentorProfileId: 'mentor-id', placementId: 'placement-id', title: '  Prepare notes  ',
      description: '  Read handbook  ', dueDate: '2027-02-12',
    })).resolves.toEqual({ id: 'task-id' });
    expect(createForMentor).toHaveBeenCalledWith({
      mentorProfileId: 'mentor-id', placementId: 'placement-id', title: 'Prepare notes',
      description: 'Read handbook', dueDate: '2027-02-12', priority: 'MEDIUM',
    });
  });

  it('rejects an invalid due date without calling the repository', async () => {
    const createForMentor = vi.fn();
    const useCase = new CreateMentorInternTaskUseCase({ createForMentor } as never);
    expect(() => useCase.execute({
      mentorProfileId: 'mentor-id', placementId: 'placement-id', title: 'Task', dueDate: '2027-02-31',
    })).toThrow(BadRequestException);
    expect(createForMentor).not.toHaveBeenCalled();
  });
});
