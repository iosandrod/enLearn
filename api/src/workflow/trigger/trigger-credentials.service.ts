import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { configure } from '@trigger.dev/sdk';
import { Pool, type PoolClient } from 'pg';
import { getWorkflowEnv } from '../common/env';
import {
  decryptPersonalAccessToken,
  encryptToken,
  hashToken,
  type PersonalAccessTokenRow
} from './trigger-credentials.crypto';

const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_ADMIN_EMAIL = 'engine@local.dev';
const DEFAULT_ADMIN_NAME = 'enLearn Trigger Engine';
const DEFAULT_PAT_NAME = 'enlearn-engine-runtime';
const DEFAULT_PROJECT_NAME = 'enlearn-workflow-local';
const WORKFLOW_TASK_IDS = [
  'workflow.instance.run',
  'workflow.job.run',
  'workflow.job.scheduled',
  'workflow.supabase.users.log',
  'notification.dispatch'
];
const PAT_ALPHABET = '123456789abcdefghijkmnopqrstuvwxyz';
const ID_ALPHABET = '1234567890abcdefghijklmnopqrstuvwxyz';
const TRIGGER_CREDENTIALS_SERVICE_OPTIONS = Symbol('TRIGGER_CREDENTIALS_SERVICE_OPTIONS');

type TriggerEnvironmentType = 'DEVELOPMENT' | 'PRODUCTION';

type TriggerCredentialsConfig = {
  adminEmail: string;
  adminName: string;
  apiUrl: string;
  cacheTtlMs: number;
  databaseUrl?: string;
  encryptionKey?: string;
  environment: 'dev' | 'prod';
  environmentType: TriggerEnvironmentType;
  patName: string;
  projectName: string;
  schema: string;
};

type EnvironmentRow = {
  environmentId: string;
  environmentSlug: string;
  environmentType: TriggerEnvironmentType;
  environmentUserId: string | null;
  hasWorkflowTasks: boolean;
  organizationId: string;
  projectId: string;
  projectName: string;
  projectRef: string;
  secretKey: string;
  workerLastSeenAt: Date | null;
};

type AdminRow = {
  id: string;
  email: string;
};

export type TriggerCredentials = {
  accessToken: string;
  adminEmail: string;
  apiUrl: string;
  environment: 'dev' | 'prod';
  environmentId: string;
  loadedAt: string;
  projectName: string;
  projectRef: string;
  secretKey: string;
  selection: 'project-name' | 'project-created';
  source: 'trigger-database';
};

export type TriggerEngineStatus = {
  accessTokenConfigured: boolean;
  apiUrl: string;
  cacheExpiresAt: string | null;
  cached: boolean;
  configured: boolean;
  credentialSource: 'trigger-database';
  environment: 'dev' | 'prod';
  error?: string;
  missing: string[];
  projectName: string | null;
  projectRef: string | null;
  secretKeyConfigured: boolean;
  selection: TriggerCredentials['selection'] | null;
};

type CachedCredentials = {
  expiresAt: number;
  value: TriggerCredentials;
};

export type TriggerCredentialsServiceOptions = {
  cacheTtlMs?: number;
  loadCredentials?: () => Promise<TriggerCredentials>;
  now?: () => number;
  pool?: Pool;
};

@Injectable()
export class TriggerCredentialsService implements OnModuleDestroy {
  private readonly logger = new Logger(TriggerCredentialsService.name);
  private readonly config: TriggerCredentialsConfig;
  private readonly externalPool: boolean;
  private readonly loadCredentialsOverride?: () => Promise<TriggerCredentials>;
  private readonly now: () => number;
  private readonly pool?: Pool;
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
    this.externalPool = Boolean(resolvedOptions.pool);
    this.loadCredentialsOverride = resolvedOptions.loadCredentials;
    this.now = resolvedOptions.now ?? Date.now;

    if (resolvedOptions.pool) {
      this.pool = resolvedOptions.pool;
    } else if (this.config.databaseUrl && !this.loadCredentialsOverride) {
      this.pool = new Pool({
        connectionString: this.config.databaseUrl,
        max: 3,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000
      });
      this.pool.on('error', (error) => {
        this.logger.warn(`Trigger credential database idle client error: ${error.message}`);
      });
    }
  }

  async getCredentials(forceRefresh = false): Promise<TriggerCredentials> {
    const now = this.now();
    if (!forceRefresh && this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

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
        projectRef: null,
        projectName: this.config.projectName ?? null,
        environment: this.config.environment,
        credentialSource: 'trigger-database',
        secretKeyConfigured: false,
        accessTokenConfigured: false,
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
        secretKeyConfigured: true,
        accessTokenConfigured: true,
        cached: Boolean(this.cache),
        cacheExpiresAt: this.cache ? new Date(this.cache.expiresAt).toISOString() : null,
        selection: credentials.selection,
        missing: []
      };
    } catch (error) {
      return {
        configured: false,
        apiUrl: this.config.apiUrl,
        projectRef: null,
        projectName: this.config.projectName ?? null,
        environment: this.config.environment,
        credentialSource: 'trigger-database',
        secretKeyConfigured: false,
        accessTokenConfigured: false,
        cached: false,
        cacheExpiresAt: null,
        selection: null,
        missing: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async onModuleDestroy() {
    if (!this.externalPool) {
      await this.pool?.end();
    }
  }

  private async loadCredentials(): Promise<TriggerCredentials> {
    const missing = this.missingInfrastructure();
    if (missing.length > 0 || !this.pool || !this.config.encryptionKey) {
      throw new Error(
        `Trigger credential database is not configured. Missing ${missing.join(', ')}.`
      );
    }

    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query('begin');
      transactionOpen = true;
      await setSearchPath(client, this.config.schema);
      await client.query("select pg_advisory_xact_lock(hashtext('enlearn:trigger-credentials:v1'))");
      const admin = await this.resolveAdmin(client);
      const environmentResolution = await this.resolveEnvironment(client, admin);
      const environment = environmentResolution.environment;
      const accessToken = await this.resolveAdminToken(client, admin.id);
      const selection = environmentResolution.created ? 'project-created' : 'project-name';

      await client.query('commit');
      transactionOpen = false;

      this.logger.log(
        `Loaded Trigger.dev credentials from database for ${environment.projectName}/${environment.environmentSlug}; ` +
          `selection=${selection}, cacheTtlMs=${this.config.cacheTtlMs}`
      );

      return {
        accessToken,
        adminEmail: admin.email,
        apiUrl: this.config.apiUrl,
        environment: this.config.environment,
        environmentId: environment.environmentId,
        loadedAt: new Date().toISOString(),
        projectName: environment.projectName,
        projectRef: environment.projectRef,
        secretKey: environment.secretKey,
        selection,
        source: 'trigger-database'
      };
    } catch (error) {
      if (transactionOpen) {
        await client.query('rollback').catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private missingInfrastructure() {
    return [
      this.config.databaseUrl ? undefined : 'TRIGGER_DATABASE_URL',
      this.config.encryptionKey ? undefined : 'TRIGGER_ENCRYPTION_KEY'
    ].filter((value): value is string => Boolean(value));
  }

  private async resolveEnvironment(
    client: PoolClient,
    admin: AdminRow
  ): Promise<{ created: boolean; environment: EnvironmentRow }> {
    const result = await client.query<EnvironmentRow>(
      `with environment_candidates as (
        select
          p."id" as "projectId",
          p."externalRef" as "projectRef",
          p."name" as "projectName",
          p."organizationId" as "organizationId",
          p."createdAt" as "projectCreatedAt",
          e."id" as "environmentId",
          e."slug" as "environmentSlug",
          e."type"::text as "environmentType",
          e."apiKey" as "secretKey",
          environment_user."id" as "environmentUserId",
          exists (
            select 1
            from "TaskIdentifier" task_identifier
            where task_identifier."projectId" = p."id"
              and task_identifier."runtimeEnvironmentId" = e."id"
              and task_identifier."slug" = any($3::text[])
              and task_identifier."isInLatestDeployment" = true
          ) or exists (
            select 1
            from "BackgroundWorkerTask" worker_task
            where worker_task."projectId" = p."id"
              and worker_task."runtimeEnvironmentId" = e."id"
              and worker_task."slug" = any($3::text[])
          ) as "hasWorkflowTasks",
          (
            select max(worker."createdAt")
            from "BackgroundWorker" worker
            where worker."projectId" = p."id"
              and worker."runtimeEnvironmentId" = e."id"
          ) as "workerLastSeenAt",
          row_number() over (
            partition by p."id"
            order by
              case when environment_user."admin" = true then 0 else 1 end,
              e."createdAt" asc
          ) as environment_rank
        from "Project" p
        join "RuntimeEnvironment" e on e."projectId" = p."id"
        left join "OrgMember" environment_member on environment_member."id" = e."orgMemberId"
        left join "User" environment_user on environment_user."id" = environment_member."userId"
        where p."deletedAt" is null
          and e."archivedAt" is null
          and e."parentEnvironmentId" is null
          and e."type"::text = $1
          and p."name" = $2
      )
      select
        "projectId", "projectRef", "projectName", "organizationId",
        "environmentId", "environmentSlug", "environmentType", "secretKey",
        "environmentUserId", "hasWorkflowTasks", "workerLastSeenAt"
      from environment_candidates
      where environment_rank = 1
      order by "projectCreatedAt" asc, "projectId" asc
      limit 1`,
      [this.config.environmentType, this.config.projectName, WORKFLOW_TASK_IDS]
    );

    const environment = result.rows[0];
    if (environment) {
      return { created: false, environment };
    }

    return {
      created: true,
      environment: await this.createProjectEnvironment(client, admin)
    };
  }

  private async resolveAdmin(client: PoolClient): Promise<AdminRow> {
    const result = await client.query<AdminRow>(
      `select "id", "email"
      from "User" admin_user
      where admin_user."admin" = true
      order by admin_user."createdAt" asc, admin_user."id" asc
      limit 1
      for update`
    );

    const admin = result.rows[0];
    if (admin) {
      return admin;
    }

    const existingUser = await client.query<AdminRow>(
      `select "id", "email"
      from "User"
      where lower("email") = lower($1)
      limit 1
      for update`,
      [this.config.adminEmail]
    );
    if (existingUser.rows[0]) {
      const promoted = await client.query<AdminRow>(
        `update "User"
        set "admin" = true,
            "confirmedBasicDetails" = true,
            "displayName" = coalesce("displayName", $2),
            "name" = coalesce("name", $2),
            "updatedAt" = now()
        where "id" = $1
        returning "id", "email"`,
        [existingUser.rows[0].id, this.config.adminName]
      );
      this.logger.log(`Promoted Trigger.dev user ${promoted.rows[0].email} to super-admin.`);
      return promoted.rows[0];
    }

    const inserted = await client.query<AdminRow>(
      `insert into "User" (
        "id", "email", "authenticationMethod", "displayName", "name", "admin",
        "confirmedBasicDetails", "createdAt", "updatedAt"
      ) values (
        $1, $2, 'MAGIC_LINK'::"AuthenticationMethod", $3, $3, true, true, now(), now()
      )
      on conflict ("email") do update set
        "admin" = true,
        "confirmedBasicDetails" = true,
        "displayName" = coalesce("User"."displayName", excluded."displayName"),
        "name" = coalesce("User"."name", excluded."name"),
        "updatedAt" = now()
      returning "id", "email"`,
      [createId('user'), this.config.adminEmail, this.config.adminName]
    );
    this.logger.log(`Created Trigger.dev super-admin ${inserted.rows[0].email}.`);
    return inserted.rows[0];
  }

  private async createProjectEnvironment(
    client: PoolClient,
    admin: AdminRow
  ): Promise<EnvironmentRow> {
    const organization = await this.resolveAdminOrganization(client, admin.id);
    const member = await client.query<{ id: string }>(
      `insert into "OrgMember" (
        "id", "organizationId", "userId", "role", "createdAt", "updatedAt"
      ) values ($1, $2, $3, 'ADMIN'::"OrgMemberRole", now(), now())
      on conflict ("organizationId", "userId") do update set
        "role" = 'ADMIN'::"OrgMemberRole", "updatedAt" = now()
      returning "id"`,
      [createId('member'), organization.id, admin.id]
    );

    const project = await this.createProject(client, organization.id);
    await this.createEnvironment(client, {
      adminId: admin.id,
      environmentType: 'PRODUCTION',
      memberId: member.rows[0].id,
      organizationId: organization.id,
      projectId: project.id
    });
    const environment = await this.createEnvironment(client, {
      adminId: admin.id,
      environmentType: 'DEVELOPMENT',
      memberId: member.rows[0].id,
      organizationId: organization.id,
      projectId: project.id
    });

    this.logger.log(`Created missing Trigger.dev project ${this.config.projectName}.`);
    return {
      ...environment,
      hasWorkflowTasks: false,
      projectName: this.config.projectName,
      projectRef: project.externalRef,
      workerLastSeenAt: null
    };
  }

  private async resolveAdminOrganization(client: PoolClient, adminId: string) {
    const existing = await client.query<{ id: string }>(
      `select organization."id"
      from "Organization" organization
      join "OrgMember" member on member."organizationId" = organization."id"
      where member."userId" = $1 and organization."deletedAt" is null
      order by member."createdAt" asc, organization."createdAt" asc
      limit 1
      for update of organization`,
      [adminId]
    );
    if (existing.rows[0]) {
      await client.query(
        `update "Organization"
        set "v3Enabled" = true, "runsEnabled" = true, "updatedAt" = now()
        where "id" = $1`,
        [existing.rows[0].id]
      );
      return existing.rows[0];
    }

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const slug = `enlearn-engine-${randomString(ID_ALPHABET, 6)}`;
      const inserted = await client.query<{ id: string }>(
        `insert into "Organization" (
          "id", "slug", "title", "companySize", "v3Enabled", "runsEnabled",
          "createdAt", "updatedAt"
        ) values ($1, $2, $3, '1-10', true, true, now(), now())
        on conflict do nothing
        returning "id"`,
        [createId('org'), slug, 'enLearn Engine']
      );
      if (inserted.rows[0]) return inserted.rows[0];
    }
    throw new Error('Unable to create a Trigger.dev organization for enLearn.');
  }

  private async createProject(client: PoolClient, organizationId: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const externalRef = `proj_${randomString('abcdefghijklmnopqrstuvwxyz', 20)}`;
      const slug = `enlearn-workflow-local-${randomString(ID_ALPHABET, 4)}`;
      const inserted = await client.query<{ externalRef: string; id: string }>(
        `insert into "Project" (
          "id", "slug", "name", "externalRef", "organizationId", "version", "engine",
          "createdAt", "updatedAt"
        ) values (
          $1, $2, $3, $4, $5, 'V3'::"ProjectVersion", 'V2'::"RunEngineVersion",
          now(), now()
        )
        on conflict do nothing
        returning "id", "externalRef"`,
        [createId('project'), slug, this.config.projectName, externalRef, organizationId]
      );
      if (inserted.rows[0]) return inserted.rows[0];
    }
    throw new Error(`Unable to create Trigger.dev project ${this.config.projectName}.`);
  }

  private async createEnvironment(
    client: PoolClient,
    options: {
      adminId: string;
      environmentType: TriggerEnvironmentType;
      memberId: string;
      organizationId: string;
      projectId: string;
    }
  ): Promise<EnvironmentRow> {
    const isDevelopment = options.environmentType === 'DEVELOPMENT';
    const prefix = isDevelopment ? 'dev' : 'prod';
    const result = await client.query<EnvironmentRow>(
      `insert into "RuntimeEnvironment" (
        "id", "slug", "apiKey", "pkApiKey", "type", "isBranchableEnvironment",
        "shortcode", "maximumConcurrencyLimit", "concurrencyLimitBurstFactor", "paused",
        "autoEnableInternalSources", "organizationId", "projectId", "orgMemberId",
        "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5::"RuntimeEnvironmentType", $6,
        $7, 5, 2.00, false,
        $8, $9, $10, $11,
        now(), now()
      )
      returning
        "id" as "environmentId", "slug" as "environmentSlug",
        "type"::text as "environmentType", "apiKey" as "secretKey",
        "orgMemberId" as "environmentUserId", "organizationId", "projectId"`,
      [
        createId('env'),
        prefix,
        `tr_${prefix}_${randomString(PAT_ALPHABET, 20)}`,
        `pk_${prefix}_${randomString(PAT_ALPHABET, 20)}`,
        options.environmentType,
        isDevelopment,
        `${randomString('abcdefghijklmnopqrstuvwxyz', 5)}-${randomString('abcdefghijklmnopqrstuvwxyz', 5)}`,
        !isDevelopment,
        options.organizationId,
        options.projectId,
        isDevelopment ? options.memberId : null
      ]
    );
    return {
      ...result.rows[0],
      environmentUserId: isDevelopment ? options.adminId : null,
      hasWorkflowTasks: false,
      projectName: this.config.projectName,
      projectRef: '',
      workerLastSeenAt: null
    };
  }

  private async resolveAdminToken(client: PoolClient, userId: string): Promise<string> {
    const result = await client.query<PersonalAccessTokenRow>(
      `select "id", "name", "encryptedToken", "hashedToken"
      from "PersonalAccessToken"
      where "userId" = $1 and "revokedAt" is null
      order by ("name" = $2) desc, "createdAt" asc`,
      [userId, this.config.patName]
    );

    if (result.rows.length > 0) {
      for (const tokenRow of result.rows) {
        try {
          return decryptPersonalAccessToken(tokenRow, this.config.encryptionKey!);
        } catch {
          // Try another active token before reporting an encryption-key mismatch.
        }
      }
      throw new Error(
        'Active Trigger.dev admin tokens exist but cannot be decrypted. ' +
          'TRIGGER_ENCRYPTION_KEY must match the Trigger.dev webapp ENCRYPTION_KEY.'
      );
    }

    return this.createAdminToken(client, userId);
  }

  private async createAdminToken(client: PoolClient, userId: string): Promise<string> {
    const token = `tr_pat_${randomString(PAT_ALPHABET, 40)}`;
    const encryptedToken = encryptToken(token, this.config.encryptionKey!);
    const body = token.slice('tr_pat_'.length);
    const obfuscatedToken = `tr_pat_${body.slice(0, 4)}${'*'.repeat(18)}${body.slice(-4)}`;

    await client.query(
      `insert into "PersonalAccessToken" (
        "id", "name", "encryptedToken", "obfuscatedToken", "hashedToken", "userId",
        "createdAt", "updatedAt"
      ) values ($1, $2, $3::jsonb, $4, $5, $6, now(), now())`,
      [
        `pat_${randomString(ID_ALPHABET, 24)}`,
        this.config.patName,
        JSON.stringify(encryptedToken),
        obfuscatedToken,
        hashToken(token),
        userId
      ]
    );
    this.logger.log(`Created missing Trigger.dev admin PAT named ${this.config.patName}.`);
    return token;
  }

}

function resolveCredentialsConfig(): TriggerCredentialsConfig {
  const env = getWorkflowEnv();
  const sourceEnvFile = resolveTriggerEnvFile(env.TRIGGER_ENV_FILE);
  const triggerFileEnv = sourceEnvFile ? parseEnvFile(sourceEnvFile) : {};
  const rawDatabaseUrl = normalizedValue(env.TRIGGER_DATABASE_URL) ?? triggerFileEnv.DATABASE_URL;
  const parsedDatabase = rawDatabaseUrl ? parseDatabaseUrl(rawDatabaseUrl) : undefined;
  const environment = normalizeEnvironment(env.TRIGGER_ENVIRONMENT);
  const encryptionKey =
    normalizedValue(env.TRIGGER_ENCRYPTION_KEY) ?? triggerFileEnv.ENCRYPTION_KEY;

  if (encryptionKey && Buffer.byteLength(encryptionKey, 'utf8') !== 32) {
    throw new Error('Trigger.dev ENCRYPTION_KEY must be exactly 32 bytes.');
  }

  return {
    adminEmail: normalizedValue(env.TRIGGER_ADMIN_EMAIL) ?? DEFAULT_ADMIN_EMAIL,
    adminName: normalizedValue(env.TRIGGER_ADMIN_NAME) ?? DEFAULT_ADMIN_NAME,
    apiUrl: trimTrailingSlash(normalizedValue(env.TRIGGER_API_URL) ?? 'http://localhost:3030'),
    cacheTtlMs: positiveInteger(env.TRIGGER_CREDENTIAL_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
    databaseUrl: parsedDatabase?.connectionString,
    encryptionKey,
    environment,
    environmentType: environment === 'dev' ? 'DEVELOPMENT' : 'PRODUCTION',
    patName: normalizedValue(env.TRIGGER_PAT_NAME) ?? DEFAULT_PAT_NAME,
    projectName: normalizedValue(env.TRIGGER_PROJECT_NAME) ?? DEFAULT_PROJECT_NAME,
    schema: normalizedValue(env.TRIGGER_DATABASE_SCHEMA) ?? parsedDatabase?.schema ?? 'public'
  };
}

function resolveTriggerEnvFile(explicitPath?: string) {
  if (explicitPath) {
    const path = resolve(explicitPath);
    if (!existsSync(path)) {
      throw new Error(`TRIGGER_ENV_FILE does not exist: ${path}`);
    }
    return path;
  }

  const cwd = process.cwd();
  const repoRoot = basename(cwd).toLowerCase() === 'api' ? resolve(cwd, '..') : cwd;
  const candidates = [
    resolve(repoRoot, '..', 'trigger.dev-main', '.env'),
    resolve(repoRoot, 'trigger.dev-main', '.env')
  ];
  return candidates.find((path) => existsSync(path));
}

function parseDatabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TRIGGER_DATABASE_URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('TRIGGER_DATABASE_URL must use postgres:// or postgresql://.');
  }

  const schema = url.searchParams.get('schema') ?? 'public';
  for (const parameter of [
    'schema',
    'connection_limit',
    'pool_timeout',
    'connection_timeout',
    'application_name'
  ]) {
    url.searchParams.delete(parameter);
  }
  return { connectionString: url.toString(), schema };
}

async function setSearchPath(client: PoolClient, schema: string) {
  const schemaExists = await client.query<{ exists: boolean }>(
    'select exists (select 1 from pg_namespace where nspname = $1) as exists',
    [schema]
  );
  if (!schemaExists.rows[0]?.exists) {
    throw new Error(`Trigger.dev database schema does not exist: ${schema}`);
  }
  const quotedSchema = `"${schema.replaceAll('"', '""')}"`;
  await client.query("select set_config('search_path', $1, true)", [quotedSchema]);
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

function randomString(alphabet: string, length: number) {
  let value = '';
  for (let index = 0; index < length; index++) {
    value += alphabet[crypto.randomInt(alphabet.length)];
  }
  return value;
}

function createId(prefix: string) {
  return `${prefix}_${randomString(ID_ALPHABET, 24)}`;
}

function normalizeEnvironment(value?: string): 'dev' | 'prod' {
  const normalized = value?.trim().toLowerCase() ?? 'dev';
  if (normalized === 'dev' || normalized === 'development') return 'dev';
  if (normalized === 'prod' || normalized === 'production') return 'prod';
  throw new Error('TRIGGER_ENVIRONMENT must be dev or prod.');
}

function normalizedValue(value?: string) {
  const normalized = value?.trim();
  return normalized || undefined;
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
