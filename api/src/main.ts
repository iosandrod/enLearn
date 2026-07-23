import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getEnv } from './common/utils/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });

  app.enableCors({
    origin: true,
    credentials: true
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const env = getEnv();
  const port = Number(env.API_PORT ?? env.PORT ?? 3002);
  await app.listen(port);

  console.log(`Nest API listening on http://localhost:${port}/api/service`);
}

void bootstrap();
