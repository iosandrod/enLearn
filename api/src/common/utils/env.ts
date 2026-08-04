import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

type EnvMap = Record<string, string>;

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

export function getEnv() {
  const cwd = process.cwd();
  const runningFromApi = basename(cwd) === 'api';
  const repoRoot = runningFromApi ? resolve(cwd, '..') : cwd;
  const apiRoot = runningFromApi ? cwd : resolve(repoRoot, 'api');

  return {
    ...parseEnvFile(resolve(repoRoot, '.env')),
    ...parseEnvFile(resolve(repoRoot, '.env.local')),
    ...parseEnvFile(resolve(apiRoot, '.env')),
    ...parseEnvFile(resolve(apiRoot, '.env.local')),
    ...process.env
  };
}

export function requireEnv(name: string, ...fallbackNames: string[]) {
  const env = getEnv();
  const value = [name, ...fallbackNames].find((key) => env[key]?.trim());

  if (!value) {
    throw new Error(
      `Missing required env var. Expected one of: ${[name, ...fallbackNames].join(', ')}`
    );
  }

  return env[value];
}

export function normalizePostgresConnectionString(value: string) {
  try {
    const url = new URL(value);
    url.searchParams.delete('pgbouncer');
    return url.toString();
  } catch {
    return value;
  }
}
