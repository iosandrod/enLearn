import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export type WorkflowApiEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PROJECT_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
  WORKFLOW_API_PORT?: string;
  WORKFLOW_INTERVAL_SCHEDULER_ENABLED?: string;
  WORKFLOW_TRIGGER_LOCAL_FALLBACK_ENABLED?: string;
  TRIGGER_PROJECT_REF?: string;
  TRIGGER_SECRET_KEY?: string;
  TRIGGER_API_URL?: string;
  PORT?: string;
};

type EnvMap = Record<string, string>;

let cachedEnv: WorkflowApiEnv | undefined;

export function getWorkflowEnv(): WorkflowApiEnv {
  if (cachedEnv) return cachedEnv;

  const cwd = process.cwd();
  const runningFromWorkflowApi = basename(cwd) === 'workflow-api';
  const repoRoot = runningFromWorkflowApi ? resolve(cwd, '..', '..') : cwd;
  const workflowApiRoot = runningFromWorkflowApi
    ? cwd
    : resolve(repoRoot, 'services', 'workflow-api');

  const fileEnv = {
    ...parseEnvFile(resolve(repoRoot, '.env')),
    ...parseEnvFile(resolve(repoRoot, '.env.local')),
    ...parseEnvFile(resolve(workflowApiRoot, '.env')),
    ...parseEnvFile(resolve(workflowApiRoot, '.env.local'))
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
