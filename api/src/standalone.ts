import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { responseCompressionMiddleware } from './common/middleware/compression.middleware';
import { getEnv } from './common/utils/env';
import { registerChatSocket } from './chat-service/chat.socket';
import { StandaloneAppModule } from './standalone/standalone.module';
import { maybeStartTriggerDevWorkerFromApi } from './workflow/trigger/trigger-worker-autostart';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(StandaloneAppModule);

  app.useBodyParser('json', { limit: '20mb' });
  app.useBodyParser('urlencoded', { limit: '20mb', extended: true });

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
  const host = String(env.API_HOST ?? '').trim();
  registerChatSocket(app);
  if (host) await app.listen(port, host);
  else await app.listen(port);

  console.log(`Standalone API listening on http://${host || 'localhost'}:${port}/api/service`);
  console.log('Domain and workflow services are running in-process; Redis transport is disabled.');
  maybeStartTriggerDevWorkerFromApi();
}

void bootstrap();
