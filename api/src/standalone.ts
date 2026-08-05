import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { responseCompressionMiddleware } from './common/middleware/compression.middleware';
import { getEnv } from './common/utils/env';
import { registerChatSocket } from './chat-service/chat.socket';
import { StandaloneAppModule } from './standalone/standalone.module';

async function bootstrap() {
  const app = await NestFactory.create(StandaloneAppModule);

  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useWebSocketAdapter(new IoAdapter(app));
  app.use(responseCompressionMiddleware);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const env = getEnv();
  const port = Number(env.API_PORT ?? env.PORT ?? 3002);
  registerChatSocket(app);
  await app.listen(port);

  console.log(`Standalone API listening on http://localhost:${port}/api/service`);
  console.log('Domain and workflow services are running in-process; Redis transport is disabled.');
}

void bootstrap();
