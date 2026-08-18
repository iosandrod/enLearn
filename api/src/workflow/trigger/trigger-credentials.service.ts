import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { configure, runs } from '@trigger.dev/sdk';
import { getWorkflowEnv } from '../common/env';

const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_ADMIN_EMAIL = 'engine@local.dev';
const DEFAULT_PROJECT_NAME = 'enlearn-workflow-local';
const TRIGGER_CREDENTIALS_SERVICE_OPTIONS = Symbol('TRIGGER_CREDENTIALS_SERVICE_OPTIONS');

type TriggerCredentialsConfig = {
  accessToken?: string;
  adminEmail: string;
  apiUrl: string;
  cacheTtlMs: number;
  environment: 'dev' | 'prod';
  environmentId?: string;
  projectName: string;
  projectRef?: string;
  secretKey?: string;
};

export type TriggerCredentials = {
  accessToken?: string;
  adminEmail: string;
  apiUrl: string;
  environment: 'dev' | 'prod';
  environmentId: string;
  loadedAt: string;
  projectName: string;
  projectRef: string;
  secretKey: string;
  selection: 'configured';
  source: 'environment';
};

export type TriggerEngineStatus = {
  accessTokenConfigured: boolean;
  apiUrl: string;
  cacheExpiresAt: string | null;
  cached: boolean;
  configured: boolean;
  credentialSource: 'environment';
  environment: 'dev' | 'prod';
  error?: string;
  missing: string[];
  projectName: string | null;
  projectRef: string | null;
  secretKeyConfigured: boolean;
  selection: TriggerCredentials['selection'] | null;
};

export type TriggerWorkerStatus = {
  activeWorkerCount: number;
  environmentConcurrencyLimit: number | null;
  workers: Array<{
    id: string;
    name: string;
    resourceIdentifier: string;
    lastHeartbeatAt: string;
    lastDequeueAt?: string;
  }>;
};

export type TriggerDatabaseRun = {
  id: string;
  status: string;
  taskIdentifier: string;
  tags: string[];
  isQueued: boolean;
  isExecuting: boolean;
  isWaiting: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
};

type CachedCredentials = {
  expiresAt: number;
  value: TriggerCredentials;
};

export type TriggerCredentialsServiceOptions = {
  cacheTtlMs?: number;
  loadCredentials?: () => Promise<TriggerCredentials>;
  now?: () => number;
};

export type TriggerDevPresenceStatus = {
  connected: boolean | null;
  error?: string;
};

@Injectable()
export class TriggerCredentialsService implements OnModuleDestroy {
  private readonly logger = new Logger(TriggerCredentialsService.name);
  private readonly config: TriggerCredentialsConfig;
  private readonly loadCredentialsOverride?: () => Promise<TriggerCredentials>;
  private readonly now: () => number;
  private cache?: CachedCredentials;
  private refreshPromise?: Promise<TriggerCredentials>;

  constructor(
    @Optional()
    @Inject(TRIGGER_CREDENTIALS_SERVICE_OPTIONS)
    options?: TriggerCredentialsServiceOptions
  ) {
    const resolvedOptions = options ?? {};
    this.config = {
      ...resolveCredentialsConfig(),
      ...(resolvedOptions.cacheTtlMs === undefined
        ? {}
        : { cacheTtlMs: resolvedOptions.cacheTtlMs })
    };
    this.loadCredentialsOverride = resolvedOptions.loadCredentials;
    this.now = resolvedOptions.now ?? Date.now;
  }

  async getCredentials(forceRefresh = false): Promise<TriggerCredentials> {
    const now = this.now();
    if (!forceRefresh && this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    if (this.refreshPromise) return this.refreshPromise;

    const staleCredentials = this.cache?.value;
    this.refreshPromise = (this.loadCredentialsOverride ?? (() => this.loadCredentials()))()
      .then((value) => {
        this.cache = {
          value,
          expiresAt: this.now() + this.config.cacheTtlMs
        };
        return value;
      })
      .catch((error) => {
        if (!forceRefresh && staleCredentials) {
          this.logger.warn(
            `Unable to refresh Trigger.dev credentials; using stale in-memory credentials for 30 seconds: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          this.cache = {
            value: staleCredentials,
            expiresAt: this.now() + Math.min(this.config.cacheTtlMs, 30_000)
          };
          return staleCredentials;
        }
        throw error;
      })
      .finally(() => {
        this.refreshPromise = undefined;
      });

    return this.refreshPromise;
  }

  async configureSdk(forceRefresh = false): Promise<TriggerCredentials> {
    const credentials = await this.getCredentials(forceRefresh);
    configure({
      baseURL: credentials.apiUrl,
      accessToken: credentials.secretKey
    });
    return credentials;
  }

  invalidate() {
    this.cache = undefined;
  }

  async getStatus(): Promise<TriggerEngineStatus> {
    const missing = this.missingInfrastructure();
    if (missing.length > 0) {
      return {
        configured: false,
        apiUrl: this.config.apiUrl,
        projectRef: this.config.projectRef ?? null,
        projectName: this.config.projectName ?? null,
        environment: this.config.environment,
        credentialSource: 'environment',
        secretKeyConfigured: Boolean(this.config.secretKey),
        accessTokenConfigured: Boolean(this.config.accessToken),
        cached: false,
        cacheExpiresAt: null,
        selection: null,
        missing
      };
    }

    try {
      const credentials = await this.getCredentials();
      return {
        configured: true,
        apiUrl: credentials.apiUrl,
        projectRef: credentials.projectRef,
        projectName: credentials.projectName,
        environment: credentials.environment,
        credentialSource: credentials.source,
        secretKeyConfigured: Boolean(credentials.secretKey),
        accessTokenConfigured: Boolean(credentials.accessToken),
        cached: Boolean(this.cache),
        cacheExpiresAt: this.cache ? new Date(this.cache.expiresAt).toISOString() : null,
        selection: credentials.selection,
        missing: []
      };
    } catch (error) {
      return {
        configured: false,
        apiUrl: this.config.apiUrl,
        projectRef: this.config.projectRef ?? null,
        projectName: this.config.projectName ?? null,
        environment: this.config.environment,
        credentialSource: 'environment',
        secretKeyConfigured: Boolean(this.config.secretKey),
        accessTokenConfigured: Boolean(this.config.accessToken),
        cached: false,
        cacheExpiresAt: null,
        selection: null,
        missing: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getWorkerStatus(_environmentId: string): Promise<TriggerWorkerStatus> {
    // Trigger.dev's public API exposes dev-presence separately but does not
    // expose WorkerInstance rows. Runtime status reports presence through the
    // official dev-status endpoint and leaves database-only details unknown.
    return {
      activeWorkerCount: 0,
      environmentConcurrencyLimit: null,
      workers: []
    };
  }

  async getDevPresenceStatus(): Promise<TriggerDevPresenceStatus> {
    let credentials: TriggerCredentials;
    try {
      credentials = await this.getCredentials();
    } catch (error) {
      return {
        connected: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    if (credentials.environment !== 'dev') {
      return { connected: null, error: 'Worker presence is only exposed for development environments.' };
    }
    if (!credentials.accessToken) {
      return { connected: null, error: 'TRIGGER_ACCESS_TOKEN is not configured.' };
    }

    try {
      const response = await fetch(
        `${credentials.apiUrl.replace(/\/+$/, '')}/api/v1/projects/${encodeURIComponent(credentials.projectRef)}/dev-status`,
        { headers: { authorization: `Bearer ${credentials.accessToken}` } }
      );
      if (!response.ok) {
        throw new Error(`Trigger.dev dev status returned HTTP ${response.status}.`);
      }
      const payload = await response.json() as { isConnected?: unknown };
      return { connected: payload.isConnected === true };
    } catch (error) {
      return {
        connected: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async listRecentRuns(
    _environmentId: string,
    taskIdentifiers: string[],
    limit: number
  ): Promise<TriggerDatabaseRun[]> {
    await this.configureSdk();
    const page = await runs.list({
      taskIdentifier: taskIdentifiers,
      limit: Math.min(100, Math.max(1, Math.floor(limit))),
      from: Date.now() - 7 * 24 * 60 * 60 * 1000
    });
    return page.data.slice(0, limit).map(mapTriggerRun);
  }

  async getRun(_environmentId: string, friendlyId: string): Promise<TriggerDatabaseRun | null> {
    await this.configureSdk();
    try {
      return mapTriggerRun(await runs.retrieve(friendlyId));
    } catch (error) {
      if (readHttpStatus(error) === 404) return null;
      throw error;
    }
  }

  async onModuleDestroy() {
    // No database pool is owned by this service.
  }

  private async loadCredentials(): Promise<TriggerCredentials> {
    const missing = this.missingInfrastructure();
    if (missing.length > 0 || !this.config.projectRef || !this.config.secretKey) {
      throw new Error(`Trigger.dev credentials are not configured. Missing ${missing.join(', ')}.`);
    }

    return {
      accessToken: this.config.accessToken,
      adminEmail: this.config.adminEmail,
      apiUrl: this.config.apiUrl,
      environment: this.config.environment,
      environmentId: this.config.environmentId ?? this.config.environment,
      loadedAt: new Date().toISOString(),
      projectName: this.config.projectName,
      projectRef: this.config.projectRef,
      secretKey: this.config.secretKey,
      selection: 'configured',
      source: 'environment'
    };
  }

  private missingInfrastructure() {
    return [
      this.config.projectRef ? undefined : 'TRIGGER_PROJECT_REF',
      this.config.secretKey ? undefined : 'TRIGGER_SECRET_KEY'
    ].filter((value): value is string => Boolean(value));
  }
}

function resolveCredentialsConfig(): TriggerCredentialsConfig {
  const env = getWorkflowEnv();
  const sourceEnvFile = resolveTriggerEnvFile(env.TRIGGER_ENV_FILE);
  const triggerFileEnv = sourceEnvFile ? parseEnvFile(sourceEnvFile) : {};
  const environment = normalizeEnvironment(env.TRIGGER_ENVIRONMENT ?? triggerFileEnv.TRIGGER_ENVIRONMENT);

  return {
    accessToken: normalizedValue(env.TRIGGER_ACCESS_TOKEN) ?? normalizedValue(triggerFileEnv.TRIGGER_ACCESS_TOKEN),
    adminEmail: normalizedValue(env.TRIGGER_ADMIN_EMAIL) ?? DEFAULT_ADMIN_EMAIL,
    apiUrl: trimTrailingSlash(
      normalizedValue(env.TRIGGER_API_URL) ??
      normalizedValue(triggerFileEnv.TRIGGER_API_URL) ??
      'http://localhost:3030'
    ),
    cacheTtlMs: positiveInteger(env.TRIGGER_CREDENTIAL_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
    environment,
    environmentId:
      normalizedValue(env.TRIGGER_ENVIRONMENT_ID) ??
      normalizedValue(triggerFileEnv.TRIGGER_ENVIRONMENT_ID),
    projectName: normalizedValue(env.TRIGGER_PROJECT_NAME) ?? DEFAULT_PROJECT_NAME,
    projectRef:
      normalizedValue(env.TRIGGER_PROJECT_REF) ??
      normalizedValue(triggerFileEnv.TRIGGER_PROJECT_REF),
    secretKey:
      normalizedValue(env.TRIGGER_SECRET_KEY) ??
      normalizedValue(triggerFileEnv.TRIGGER_SECRET_KEY)
  };
}

function resolveTriggerEnvFile(explicitPath?: string) {
  if (explicitPath) {
    const path = resolve(explicitPath);
    if (!existsSync(path)) throw new Error(`TRIGGER_ENV_FILE does not exist: ${path}`);
    return path;
  }

  const cwd = process.cwd();
  const repoRoot = basename(cwd).toLowerCase() === 'api' ? resolve(cwd, '..') : cwd;
  return [
    resolve(repoRoot, '..', 'trigger.dev-main', '.env'),
    resolve(repoRoot, 'trigger.dev-main', '.env')
  ].find((path) => existsSync(path));
}

function parseEnvFile(path: string): Record<string, string> {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .reduce<Record<string, string>>((result, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return result;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 1) return result;
      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, '');
      }
      result[key] = value;
      return result;
    }, {});
}

function mapTriggerRun(run: unknown): TriggerDatabaseRun {
  if (!isRecord(run)) throw new Error('Trigger.dev returned an invalid run.');
  const status = readString(run.status);
  const tags = Array.isArray(run.tags) ? run.tags.map(readString).filter(Boolean) : [];
  return {
    id: readString(run.id),
    status,
    taskIdentifier: readString(run.taskIdentifier),
    tags,
    isQueued: typeof run.isQueued === 'boolean'
      ? run.isQueued
      : ['PENDING_VERSION', 'QUEUED', 'DELAYED'].includes(status),
    isExecuting: typeof run.isExecuting === 'boolean'
      ? run.isExecuting
      : ['DEQUEUED', 'EXECUTING'].includes(status),
    isWaiting: typeof run.isWaiting === 'boolean' ? run.isWaiting : status === 'WAITING',
    createdAt: toIso(run.createdAt),
    updatedAt: toIso(run.updatedAt),
    ...(run.startedAt ? { startedAt: toIso(run.startedAt) } : {}),
    ...(run.finishedAt ? { finishedAt: toIso(run.finishedAt) } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) throw new Error('Trigger.dev returned an invalid timestamp.');
  return date.toISOString();
}

function readHttpStatus(error: unknown) {
  if (!isRecord(error)) return undefined;
  const response = isRecord(error.response) ? error.response : {};
  const value = error.status ?? error.statusCode ?? response.status;
  return typeof value === 'number' ? value : Number(value) || undefined;
}

function normalizeEnvironment(value?: string): 'dev' | 'prod' {
  const normalized = value?.trim().toLowerCase() ?? 'dev';
  if (normalized === 'dev' || normalized === 'development') return 'dev';
  if (normalized === 'prod' || normalized === 'production') return 'prod';
  throw new Error('TRIGGER_ENVIRONMENT must be dev or prod.');
}

function normalizedValue(value?: string) {
  return value?.trim() || undefined;
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('TRIGGER_CREDENTIAL_CACHE_TTL_MS must be a positive integer.');
  }
  return parsed;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
