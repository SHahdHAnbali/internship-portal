import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
  
  import type {
    Request,
  } from 'express';
  
  import { SupabaseService } from '../database/supabase.service.js';
  
  import type {
    UserRole,
  } from './user-role.type.js';
  
  export interface AuthenticatedRequest
    extends Request {
    authUser?: {
      id: string;
      email: string | null;
      role: UserRole;
    };
  }
  
  @Injectable()
  export class SupabaseAuthGuard
    implements CanActivate
  {
    constructor(
      private readonly supabase:
        SupabaseService,
    ) {}
  
    async canActivate(
      context: ExecutionContext,
    ): Promise<boolean> {
      const request =
        context
          .switchToHttp()
          .getRequest<AuthenticatedRequest>();
  
      const authorization =
        request.headers
          .authorization;
  
      if (
        !authorization ||
        !authorization.startsWith(
          'Bearer ',
        )
      ) {
        throw new UnauthorizedException(
          'Authentication required',
        );
      }
  
      const accessToken =
        authorization
          .slice(7)
          .trim();
  
      if (!accessToken) {
        throw new UnauthorizedException(
          'Authentication required',
        );
      }
  
      const {
        data: userData,
        error: userError,
      } =
        await this.supabase.client.auth.getUser(
          accessToken,
        );
  
      if (
        userError ||
        !userData.user
      ) {
        throw new UnauthorizedException(
          'Invalid or expired session',
        );
      }
  
      const {
        data: profile,
        error: profileError,
      } =
        await this.supabase.client
          .from('profiles')
          .select(`
            role,
            is_active
          `)
          .eq(
            'id',
            userData.user.id,
          )
          .maybeSingle();
  
      if (
        profileError ||
        !profile
      ) {
        throw new UnauthorizedException(
          'User profile not found',
        );
      }
  
      // Deactivated by an administrator (fail closed if the flag is missing).
      if (profile.is_active !== true) {
        throw new ForbiddenException(
          'This account has been deactivated',
        );
      }

      request.authUser = {
        id:
          userData.user.id,
  
        email:
          userData.user.email ??
          null,
  
        role:
          profile.role as UserRole,
      };
  
      return true;
    }
  }