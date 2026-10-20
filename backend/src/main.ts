import {
  ValidationPipe,
} from '@nestjs/common';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { resolveHttpServerSettings } from './config/http-server.config.js';

async function bootstrap() {
  const app =
    await NestFactory.create(AppModule);

  // Read after the app is created: ConfigModule has loaded .env by then.
  // Invalid or (in production) missing settings stop the start-up.
  const { corsOrigins, port } =
    resolveHttpServerSettings(process.env);

  app.enableCors({
    origin: corsOrigins,
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(port);

  console.log(
    `Backend listening on port ${port}`,
  );
}

void bootstrap();