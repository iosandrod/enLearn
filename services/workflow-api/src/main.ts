import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getWorkflowEnv } from './common/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });

  app.enableCors({
    origin: true,
    credentials: true
  });
  app.setGlobalPrefix('api/workflow');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const env = getWorkflowEnv();
  const port = Number(env.WORKFLOW_API_PORT ?? env.PORT ?? 3010);
  await app.listen(port);

  console.log(`Workflow API listening on http://localhost:${port}/api/workflow`);
}

void bootstrap();
