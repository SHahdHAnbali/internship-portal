import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  openRouterApiKey:
    process.env.OPENROUTER_API_KEY,
}));