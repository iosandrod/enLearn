import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';

import { getRedisConnectionConfig } from '../common/utils/redis';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice(AppModule, {
    transport: Transport.REDIS,
    options: getRedisConnectionConfig()
  });

  await app.listen();
  console.log('Domain service is listening on Redis.');
}

void bootstrap();
