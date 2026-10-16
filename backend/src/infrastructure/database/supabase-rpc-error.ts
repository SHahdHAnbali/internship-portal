import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

export interface SupabaseRpcError {
  code?: string;
}

export function throwSupabaseRpcHttpException(
  error: SupabaseRpcError,
): never {
  switch (error.code) {
    case 'PZ400':
    case 'PZ410':
    case '23502':
    case '23514':
      throw new BadRequestException('The request is invalid');

    case 'PZ403':
      throw new ForbiddenException('You do not have permission to perform this action');

    case 'PZ404':
      throw new NotFoundException('The requested resource was not found');

    case 'PZ409':
    case '23503':
    case '23505':
      throw new ConflictException('The requested operation conflicts with the current state');

    default:
      throw new InternalServerErrorException('The database operation failed');
  }
}
