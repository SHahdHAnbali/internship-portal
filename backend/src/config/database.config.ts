import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
}));