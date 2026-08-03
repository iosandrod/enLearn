import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export type WorkflowApiEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  REDIS_DB?: string;
  REDIS_HOST?: string;
  REDIS_PASSWORD?: string;
  REDIS_PORT?: string;
  REDIS_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  WORKFLOW_REDIS_DB?: string;
  WORKFLOW_REDIS_HOST?: string;
  WORKFLOW_REDIS_PASSWORD?: string;
  WORKFLOW_REDIS_PORT?: string;
  WORKFLOW_REDIS_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PROJECT_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
  TRIGGER_ADMIN_EMAIL?: string;
  TRIGGER_ADMIN_NAME?: string;
  TRIGGER_CREDENTIAL_CACHE_TTL_MS?: string;
  TRIGGER_DATABASE_SCHEMA?: string;
  TRIGGER_DATABASE_URL?: string;
  TRIGGER_ENCRYPTION_KEY?: string;
  TRIGGER_ENV_FILE?: string;
  TRIGGER_ENVIRONMENT?: string;
  TRIGGER_PAT_NAME?: string;
  TRIGGER_PROJECT_NAME?: string;
  TRIGGER_API_URL?: string;
  PORT?: string;
};

type EnvMap = Record<string, string>;

let cachedEnv: WorkflowApiEnv | undefined;

export function getWorkflowEnv(): WorkflowApiEnv {
  if (cachedEnv) return cachedEnv;

  const cwd = process.cwd();
  const runningFromApi = basename(cwd) === 'api';
  const repoRoot = runningFromApi ? resolve(cwd, '..') : cwd;
  const apiRoot = runningFromApi ? cwd : resolve(repoRoot, 'api');

  const fileEnv = {
    ...parseEnvFile(resolve(repoRoot, '.env')),
    ...parseEnvFile(resolve(repoRoot, '.env.local')),
    ...parseEnvFile(resolve(apiRoot, '.env')),
    ...parseEnvFile(resolve(apiRoot, '.env.local'))
  };

  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  cachedEnv = {
    ...fileEnv,
    ...process.env
  };

  return cachedEnv;
}

function parseEnvFile(filePath: string): EnvMap {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce<EnvMap>((env, line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return env;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) {
        return env;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
      env[key] = rawValue.replace(/^["']|["']$/g, '');
      return env;
    }, {});
}
