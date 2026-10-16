import {
    Module,
  } from '@nestjs/common';
  
  import {
    SupabaseAuthGuard,
  } from './supabase-auth.guard.js';
  
  import {
    RolesGuard,
  } from './roles.guard.js';
  
  @Module({
    providers: [
      SupabaseAuthGuard,
      RolesGuard,
    ],
  
    exports: [
      SupabaseAuthGuard,
      RolesGuard,
    ],
  })
  export class AuthModule {}