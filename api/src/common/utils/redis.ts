import { getEnv } from './env';

export type RedisConnectionConfig = {
  host: string;
  port: number;
  password?: string;
  db?: number;
};

function parseRedisUrl(redisUrl: string): RedisConnectionConfig {
  const url = new URL(redisUrl);
  const dbValue = url.pathname.replace(/^\/+/, '');

  return {
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || 6379),
    password: url.password || undefined,
    db: dbValue ? Number(dbValue) : undefined
  };
}

export function getRedisConnectionConfig(): RedisConnectionConfig {
  const env = getEnv();
  const redisUrl = env.REDIS_URL?.trim() || env.WORKFLOW_REDIS_URL?.trim() || '';

  if (redisUrl) {
    return parseRedisUrl(redisUrl);
  }

  const port = Number(env.REDIS_PORT ?? env.WORKFLOW_REDIS_PORT ?? 6379);
  const dbValue = env.REDIS_DB ?? env.WORKFLOW_REDIS_DB;

  return {
    host: env.REDIS_HOST?.trim() || env.WORKFLOW_REDIS_HOST?.trim() || '127.0.0.1',
    port: Number.isFinite(port) ? port : 6379,
    password: env.REDIS_PASSWORD?.trim() || env.WORKFLOW_REDIS_PASSWORD?.trim() || undefined,
    db: dbValue?.trim() ? Number(dbValue) : undefined
  };
}
