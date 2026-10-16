import {
    Injectable,
    InternalServerErrorException,
  } from '@nestjs/common';
  
  import { ConfigService } from '@nestjs/config';
  
  import {
    createClient,
    SupabaseClient,
  } from '@supabase/supabase-js';
  
  @Injectable()
  export class SupabaseService {
    public readonly client: SupabaseClient;
  
    constructor(
      private readonly configService: ConfigService,
    ) {
      const supabaseUrl =
        this.configService.get<string>(
          'database.supabaseUrl',
        );
  
      const secretKey =
        this.configService.get<string>(
          'database.supabaseSecretKey',
        );
  
      if (!supabaseUrl || !secretKey) {
        throw new InternalServerErrorException(
          'Supabase configuration is missing',
        );
      }
  
      this.client = createClient(
        supabaseUrl,
        secretKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );
    }
  }