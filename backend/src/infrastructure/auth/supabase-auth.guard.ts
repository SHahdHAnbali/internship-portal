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
  
  import { Reflector } from '@nestjs/core';

  import { SupabaseService } from '../database/supabase.service.js';

  import {
    ALLOW_PENDING_PASSWORD_SETUP_KEY,
    passwordSetupRequired,
  } from './password-setup.js';
  
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
      private readonly reflector:
        Reflector,
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
  
      const loadProfile = (columns: string) =>
        this.supabase.client
          .from('profiles')
          .select(columns)
          .eq(
            'id',
            userData.user.id,
          )
          .maybeSingle<{
            role: string;
            is_active: boolean;
            password_set_at?: string | null;
          }>();

      let {
        data: profile,
        error: profileError,
      } =
        await loadProfile('role, is_active, password_set_at');

      // Until migration 20261017020000 adds password_set_at, keep the previous
      // behaviour (no setup requirement) instead of locking everyone out.
      let passwordColumnMissing = false;
      if (profileError?.code === '42703') {
        passwordColumnMissing = true;
        ({
          data: profile,
          error: profileError,
        } = await loadProfile('role, is_active'));
      }
  
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

      // A verified, active person who has not set a password yet may only use
      // the routes that complete setup (marked @AllowPendingPasswordSetup).
      const setupPending =
        !passwordColumnMissing &&
        (profile.password_set_at === null || profile.password_set_at === undefined);
      if (
        setupPending &&
        !this.reflector.getAllAndOverride<boolean>(
          ALLOW_PENDING_PASSWORD_SETUP_KEY,
          [
            context.getHandler(),
            context.getClass(),
          ],
        )
      ) {
        throw passwordSetupRequired();
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