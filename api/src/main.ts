import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { registerChatSocket } from './chat-service/chat.socket';
import { responseCompressionMiddleware } from './common/middleware/compression.middleware';
import { getEnv } from './common/utils/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  console.log(`Nest API listening on http://${host || 'localhost'}:${port}/api/service`);
}

void bootstrap();
