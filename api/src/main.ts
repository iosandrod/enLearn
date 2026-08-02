import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { registerChatSocket } from './chat-service/chat.socket';
import { responseCompressionMiddleware } from './common/middleware/compression.middleware';
import { getEnv } from './common/utils/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });

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

  console.log(`Nest API listening on http://localhost:${port}/api/service`);
}

void bootstrap();
