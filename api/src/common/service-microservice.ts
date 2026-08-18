import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import type { Type } from '@nestjs/common';

import { getRedisConnectionConfig } from './utils/redis';

export async function bootstrapRedisService(appModule: Type<unknown>, serviceLabel: string) {
  const app = await NestFactory.createMicroservice(appModule, {
    transport: Transport.REDIS,
    options: getRedisConnectionConfig()
  });

  await app.listen();
  console.log(`${serviceLabel} service is listening on Redis.`);
}
