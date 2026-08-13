import Redis from 'ioredis';
import { getRedisConnectionConfig } from '../common/utils/redis';
import {
  FRONTEND_COMMAND_REDIS_CHANNEL,
  type FrontendCommand
} from './frontend-command.types';

let publisher: Redis | undefined;

export async function publishFrontendCommand(command: FrontendCommand) {
  const redis = getPublisher();
  const subscriberCount = await redis.publish(
    FRONTEND_COMMAND_REDIS_CHANNEL,
    JSON.stringify(command)
  );

  return { subscriberCount };
}

export async function closeFrontendCommandPublisher() {
  const current = publisher;
  publisher = undefined;
  if (current) await current.quit();
}

function getPublisher() {
  publisher ??= new Redis(getRedisConnectionConfig());
  return publisher;
}
