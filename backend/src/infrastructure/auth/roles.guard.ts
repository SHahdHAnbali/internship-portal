import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
  } from '@nestjs/common';
  
  import {
    Reflector,
  } from '@nestjs/core';
  
  import {
    ROLES_KEY,
  } from './roles.decorator.js';
  
  import type {
    UserRole,
  } from './user-role.type.js';
  
  import type {
    AuthenticatedRequest,
  } from './supabase-auth.guard.js';
  
  @Injectable()
  export class RolesGuard
    implements CanActivate
  {
    constructor(
      private readonly reflector:
        Reflector,
    ) {}
  
    canActivate(
      context: ExecutionContext,
    ): boolean {
      const allowedRoles =
        this.reflector
          .getAllAndOverride<
            UserRole[]
          >(
            ROLES_KEY,
            [
              context.getHandler(),
              context.getClass(),
            ],
          );
  
      if (
        !allowedRoles ||
        allowedRoles.length === 0
      ) {
        return true;
      }
  
      const request =
        context
          .switchToHttp()
          .getRequest<AuthenticatedRequest>();
  
      const role =
        request.authUser?.role;
  
      if (
        !role ||
        !allowedRoles.includes(
          role,
        )
      ) {
        throw new ForbiddenException(
          'You do not have permission to access this resource',
        );
      }
  
      return true;
    }
  }