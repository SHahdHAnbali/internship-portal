import { BadRequestException } from '@nestjs/common';
import { UpdateMyInternTaskStatusUseCase } from './update-my-intern-task-status.use-case.js';

describe('UpdateMyInternTaskStatusUseCase', () => {
  it.each(['ASSIGNED', 'CANCELLED', '', null])('rejects invalid requested status %s', (status) => {
    const updateStatus = vi.fn();
    const useCase = new UpdateMyInternTaskStatusUseCase({ updateStatus } as never);
    expect(() => useCase.execute('intern-user-id', 'task-id', status as string))
      .toThrow(BadRequestException);
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('passes only the authenticated identity, task ID, and forward status to the repository', async () => {
    const response = { id: 'task-id', status: 'IN_PROGRESS' };
    const updateStatus = vi.fn().mockResolvedValue(response);
    const useCase = new UpdateMyInternTaskStatusUseCase({ updateStatus } as never);

    await expect(useCase.execute('verified-intern-user-id', 'task-id', 'IN_PROGRESS'))
      .resolves.toBe(response);
    expect(updateStatus).toHaveBeenCalledWith(
      'verified-intern-user-id',
      'task-id',
      'IN_PROGRESS',
      null,
    );
  });
});
