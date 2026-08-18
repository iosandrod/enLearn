import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
type PgClient = InstanceType<typeof Client>;

const API_KEY_CHARS = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const HEX_CHARS = "1234567890abcdef";
const LOWERCASE_KEY_CHARS = "123456789abcdefghijkmnopqrstuvwxyz";
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ROOT = resolve(PACKAGE_ROOT, "..");

type ResourceAction = "created" | "promoted" | "reused";
type RuntimeEnvironmentType = "DEVELOPMENT" | "PRODUCTION";
type EnvironmentSlug = "dev" | "prod";

type CliOptions = {
  adminEmail?: string;
  adminName?: string;
  baseDir?: string;
  databaseUrl?: string;
  dryRun: boolean;
  encryptionKey?: string;
  envFile?: string;
  environment?: string;
  help: boolean;
  json: boolean;
  organizationSlug?: string;
  organizationTitle?: string;
  outputEnv?: string;
  patName?: string;
  projectName?: string;
  projectRef?: string;
  schema?: string;
  showSecrets: boolean;
};

type BootstrapConfig = {
  adminEmail: string;
  adminName: string;
  databaseUrl: string;
  databaseDisplay: string;
  dryRun: boolean;
  encryptionKey: string;
  environmentSlug: EnvironmentSlug;
  environmentType: RuntimeEnvironmentType;
  organizationSlug?: string;
  organizationTitle: string;
  outputEnv?: string;
  patName: string;
  projectName: string;
  projectRefHint?: string;
  schema: string;
  secretKeyHint?: string;
  sourceEnvFile?: string;
};

type EnvFileResolution = {
  checked: string[];
  loaded?: string;
};

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
};

type OrganizationRow = {
  id: string;
  slug: string;
  title: string;
};

type OrgMemberRow = {
  id: string;
  organizationId: string;
  userId: string;
};

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  externalRef: string;
  organizationId: string;
};

type EnvironmentRow = {
  id: string;
  slug: string;
  apiKey: string;
  pkApiKey: string;
  type: RuntimeEnvironmentType;
  projectId: string;
  organizationId: string;
  orgMemberId: string | null;
};

type PersonalAccessTokenRow = {
  id: string;
  name: string;
  encryptedToken: unknown;
  hashedToken: string;
};

type ProjectContext = {
  organization: OrganizationRow;
  project: ProjectRow;
};

type EnvironmentContext = ProjectContext & {
  environment: EnvironmentRow;
};

type Ensured<T> = {
  action: ResourceAction;
  value: T;
};

type BootstrapResult = {
  admin: Ensured<UserRow>;
  database: {
    display: string;
    schema: string;
  };
  dryRun: boolean;
  environment: Ensured<EnvironmentRow>;
  organization: Ensured<OrganizationRow>;
  pat: Ensured<PersonalAccessTokenRow> & { token: string };
  project: Ensured<ProjectRow>;
};

const cli = parseArgs(process.argv.slice(2));

if (cli.help) {
  printHelp();
  process.exit(0);
}

try {
  const baseDir = cli.baseDir ? resolve(process.cwd(), cli.baseDir) : process.cwd();
  const envFile = resolveEnvFile(cli, baseDir);
  if (envFile.loaded) {
    loadDotEnv(envFile.loaded);
  }

  const config = buildConfig(cli, envFile, baseDir);
  const result = await bootstrapTriggerDatabase(config);

  if (config.outputEnv) {
    writeCredentialsToEnv(config.outputEnv, result);
  }

  printResult(result, cli, config.outputEnv);
} catch (error) {
  console.error(`Trigger.dev bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function bootstrapTriggerDatabase(config: BootstrapConfig): Promise<BootstrapResult> {
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "enlearn-trigger-bootstrap",
  });
  let transactionOpen = false;

  await client.connect();

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    await setSearchPath(client, config.schema);
    await assertTriggerSchema(client, config.schema);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "enlearn:trigger-database-bootstrap:v1",
    ]);

    const admin = await ensureAdmin(client, config.adminEmail, config.adminName);

    let environmentContext: EnvironmentContext | undefined;
    if (config.secretKeyHint) {
      environmentContext = await findEnvironmentByApiKey(client, config.secretKeyHint);
      if (environmentContext && environmentContext.environment.type !== config.environmentType) {
        throw new Error(
          `TRIGGER_SECRET_KEY belongs to a ${environmentContext.environment.type.toLowerCase()} environment, ` +
            `but ${config.environmentSlug} was requested.`
        );
      }
      if (
        environmentContext &&
        config.projectRefHint &&
        environmentContext.project.externalRef !== config.projectRefHint
      ) {
        throw new Error("TRIGGER_SECRET_KEY and TRIGGER_PROJECT_REF point to different projects.");
      }
    }

    let projectContext: ProjectContext | undefined = environmentContext;
    if (!projectContext && config.projectRefHint) {
      projectContext = await findProjectByRef(client, config.projectRefHint);
    }
    if (!projectContext && !config.projectRefHint) {
      projectContext = await findProjectByName(client, config.projectName, admin.value.id);
    }

    let organization: Ensured<OrganizationRow>;
    let project: Ensured<ProjectRow>;

    if (projectContext) {
      await activateOrganization(client, projectContext.organization.id);
      organization = { action: "reused", value: projectContext.organization };
      project = { action: "reused", value: projectContext.project };
    } else {
      organization = await ensureOrganization(client, {
        adminUserId: admin.value.id,
        slug: config.organizationSlug,
        title: config.organizationTitle,
      });
      project = await ensureProject(client, {
        organizationId: organization.value.id,
        projectName: config.projectName,
        projectRef: config.projectRefHint,
      });
      projectContext = { organization: organization.value, project: project.value };
    }

    const orgMember = await ensureOrgMember(
      client,
      organization.value.id,
      admin.value.id
    );

    let environment: Ensured<EnvironmentRow>;
    if (environmentContext) {
      environment = { action: "reused", value: environmentContext.environment };
    } else {
      environment = await ensureEnvironment(client, {
        environmentType: config.environmentType,
        organizationId: organization.value.id,
        orgMemberId: orgMember.id,
        projectId: project.value.id,
      });
    }

    const pat = await ensurePersonalAccessToken(
      client,
      admin.value.id,
      config.patName,
      config.encryptionKey
    );

    if (config.dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
    transactionOpen = false;

    return {
      admin,
      database: { display: config.databaseDisplay, schema: config.schema },
      dryRun: config.dryRun,
      environment,
      organization,
      pat,
      project,
    };
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function setSearchPath(client: PgClient, schema: string): Promise<void> {
  const exists = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists",
    [schema]
  );
  if (!exists.rows[0]?.exists) {
    throw new Error(`Database schema does not exist: ${schema}`);
  }

  const quotedSchema = `"${schema.replaceAll('"', '""')}"`;
  await client.query("SELECT set_config('search_path', $1, true)", [quotedSchema]);
}

async function assertTriggerSchema(client: PgClient, schema: string): Promise<void> {
  const requiredTables = [
    "User",
    "Organization",
    "OrgMember",
    "Project",
    "RuntimeEnvironment",
    "PersonalAccessToken",
  ];
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = ANY($2::text[])
    `,
    [schema, requiredTables]
  );
  const found = new Set(result.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !found.has(table));

  if (missing.length > 0) {
    throw new Error(
      `Schema ${schema} is not a migrated Trigger.dev database; missing: ${missing.join(", ")}`
    );
  }
}

async function ensureAdmin(
  client: PgClient,
  email: string,
  displayName: string
): Promise<Ensured<UserRow>> {
  const existingAdmin = await client.query<UserRow>(
    `
      SELECT "id", "email", "displayName"
      FROM "User"
      WHERE "admin" = true
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT 1
      FOR UPDATE
    `
  );
  if (existingAdmin.rows[0]) {
    return { action: "reused", value: existingAdmin.rows[0] };
  }

  const existingUser = await client.query<UserRow>(
    `
      SELECT "id", "email", "displayName"
      FROM "User"
      WHERE lower("email") = lower($1)
      LIMIT 1
      FOR UPDATE
    `,
    [email]
  );
  if (existingUser.rows[0]) {
    const promoted = await client.query<UserRow>(
      `
        UPDATE "User"
        SET "admin" = true,
            "confirmedBasicDetails" = true,
            "displayName" = COALESCE("displayName", $2),
            "name" = COALESCE("name", $2),
            "updatedAt" = NOW()
        WHERE "id" = $1
        RETURNING "id", "email", "displayName"
      `,
      [existingUser.rows[0].id, displayName]
    );
    return { action: "promoted", value: promoted.rows[0] };
  }

  const inserted = await client.query<UserRow>(
    `
      INSERT INTO "User" (
        "id", "email", "authenticationMethod", "displayName", "name", "admin",
        "confirmedBasicDetails", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, 'MAGIC_LINK'::"AuthenticationMethod", $3, $3, true, true, NOW(), NOW())
      ON CONFLICT ("email") DO UPDATE SET
        "admin" = true,
        "confirmedBasicDetails" = true,
        "displayName" = COALESCE("User"."displayName", EXCLUDED."displayName"),
        "name" = COALESCE("User"."name", EXCLUDED."name"),
        "updatedAt" = NOW()
      RETURNING "id", "email", "displayName"
    `,
    [createId("user"), email, displayName]
  );

  return { action: "created", value: inserted.rows[0] };
}

async function findEnvironmentByApiKey(
  client: PgClient,
  apiKey: string
): Promise<EnvironmentContext | undefined> {
  const result = await client.query(
    `
      SELECT
        e."id" AS "environmentId",
        e."slug" AS "environmentSlug",
        e."apiKey",
        e."pkApiKey",
        e."type"::text AS "environmentType",
        e."projectId",
        e."organizationId",
        e."orgMemberId",
        p."slug" AS "projectSlug",
        p."name" AS "projectName",
        p."externalRef",
        o."slug" AS "organizationSlug",
        o."title" AS "organizationTitle"
      FROM "RuntimeEnvironment" e
      JOIN "Project" p ON p."id" = e."projectId"
      JOIN "Organization" o ON o."id" = e."organizationId"
      WHERE e."apiKey" = $1
        AND e."archivedAt" IS NULL
        AND p."deletedAt" IS NULL
        AND o."deletedAt" IS NULL
      LIMIT 1
      FOR UPDATE OF e, p, o
    `,
    [apiKey]
  );

  return result.rows[0] ? mapEnvironmentContext(result.rows[0]) : undefined;
}

async function findProjectByRef(
  client: PgClient,
  projectRef: string
): Promise<ProjectContext | undefined> {
  const result = await client.query(
    `
      SELECT
        p."id" AS "projectId",
        p."slug" AS "projectSlug",
        p."name" AS "projectName",
        p."externalRef",
        p."organizationId",
        o."slug" AS "organizationSlug",
        o."title" AS "organizationTitle"
      FROM "Project" p
      JOIN "Organization" o ON o."id" = p."organizationId"
      WHERE p."externalRef" = $1
        AND p."deletedAt" IS NULL
        AND o."deletedAt" IS NULL
      LIMIT 1
      FOR UPDATE OF p, o
    `,
    [projectRef]
  );

  return result.rows[0] ? mapProjectContext(result.rows[0]) : undefined;
}

async function findProjectByName(
  client: PgClient,
  projectName: string,
  adminUserId: string
): Promise<ProjectContext | undefined> {
  const result = await client.query(
    `
      SELECT
        p."id" AS "projectId",
        p."slug" AS "projectSlug",
        p."name" AS "projectName",
        p."externalRef",
        p."organizationId",
        o."slug" AS "organizationSlug",
        o."title" AS "organizationTitle"
      FROM "Project" p
      JOIN "Organization" o ON o."id" = p."organizationId"
      WHERE p."name" = $1
        AND p."deletedAt" IS NULL
        AND o."deletedAt" IS NULL
      ORDER BY EXISTS (
        SELECT 1 FROM "OrgMember" m
        WHERE m."organizationId" = o."id" AND m."userId" = $2
      ) DESC, p."createdAt" ASC
      LIMIT 1
      FOR UPDATE OF p, o
    `,
    [projectName, adminUserId]
  );

  return result.rows[0] ? mapProjectContext(result.rows[0]) : undefined;
}

async function ensureOrganization(
  client: PgClient,
  options: { adminUserId: string; slug?: string; title: string }
): Promise<Ensured<OrganizationRow>> {
  let existing;
  if (options.slug) {
    existing = await client.query<OrganizationRow>(
      `
        SELECT "id", "slug", "title"
        FROM "Organization"
        WHERE "slug" = $1 AND "deletedAt" IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [options.slug]
    );
  }
  if (!existing?.rows[0]) {
    existing = await client.query<OrganizationRow>(
      `
        SELECT "id", "slug", "title"
        FROM "Organization"
        WHERE "title" = $1 AND "deletedAt" IS NULL
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE
      `,
      [options.title]
    );
  }
  if (!existing?.rows[0]) {
    existing = await client.query<OrganizationRow>(
      `
        SELECT o."id", o."slug", o."title"
        FROM "Organization" o
        JOIN "OrgMember" m ON m."organizationId" = o."id"
        WHERE m."userId" = $1 AND o."deletedAt" IS NULL
        ORDER BY o."createdAt" ASC
        LIMIT 1
        FOR UPDATE OF o
      `,
      [options.adminUserId]
    );
  }

  if (existing?.rows[0]) {
    await activateOrganization(client, existing.rows[0].id);
    return { action: "reused", value: existing.rows[0] };
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const slug = options.slug ?? `${slugify(options.title)}-${randomString(HEX_CHARS, 4)}`;
    const inserted = await client.query<OrganizationRow>(
      `
        INSERT INTO "Organization" (
          "id", "slug", "title", "companySize", "v3Enabled", "runsEnabled",
          "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, '1-10', true, true, NOW(), NOW())
        ON CONFLICT DO NOTHING
        RETURNING "id", "slug", "title"
      `,
      [createId("org"), slug, options.title]
    );
    if (inserted.rows[0]) {
      return { action: "created", value: inserted.rows[0] };
    }

    if (options.slug) {
      const concurrent = await client.query<OrganizationRow>(
        `SELECT "id", "slug", "title" FROM "Organization" WHERE "slug" = $1 LIMIT 1`,
        [options.slug]
      );
      if (concurrent.rows[0]) {
        await activateOrganization(client, concurrent.rows[0].id);
        return { action: "reused", value: concurrent.rows[0] };
      }
      throw new Error(`Unable to create organization with slug ${options.slug}.`);
    }
  }

  throw new Error(`Unable to create a unique organization slug for ${options.title}.`);
}

async function activateOrganization(client: PgClient, organizationId: string): Promise<void> {
  await client.query(
    `
      UPDATE "Organization"
      SET "v3Enabled" = true, "runsEnabled" = true, "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    [organizationId]
  );
}

async function ensureOrgMember(
  client: PgClient,
  organizationId: string,
  userId: string
): Promise<OrgMemberRow> {
  const result = await client.query<OrgMemberRow>(
    `
      INSERT INTO "OrgMember" (
        "id", "organizationId", "userId", "role", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, 'ADMIN'::"OrgMemberRole", NOW(), NOW())
      ON CONFLICT ("organizationId", "userId") DO UPDATE SET
        "role" = 'ADMIN'::"OrgMemberRole",
        "updatedAt" = NOW()
      RETURNING "id", "organizationId", "userId"
    `,
    [createId("member"), organizationId, userId]
  );
  return result.rows[0];
}

async function ensureProject(
  client: PgClient,
  options: { organizationId: string; projectName: string; projectRef?: string }
): Promise<Ensured<ProjectRow>> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const projectRef = options.projectRef ?? createProjectRef();
    const slug = `${slugify(options.projectName)}-${randomString(HEX_CHARS, 4)}`;
    const inserted = await client.query<ProjectRow>(
      `
        INSERT INTO "Project" (
          "id", "slug", "name", "externalRef", "organizationId", "version", "engine",
          "createdAt", "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4, $5, 'V3'::"ProjectVersion", 'V2'::"RunEngineVersion",
          NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
        RETURNING "id", "slug", "name", "externalRef", "organizationId"
      `,
      [createId("project"), slug, options.projectName, projectRef, options.organizationId]
    );
    if (inserted.rows[0]) {
      return { action: "created", value: inserted.rows[0] };
    }

    if (options.projectRef) {
      const concurrent = await client.query<ProjectRow>(
        `
          SELECT "id", "slug", "name", "externalRef", "organizationId"
          FROM "Project"
          WHERE "externalRef" = $1 AND "deletedAt" IS NULL
          LIMIT 1
        `,
        [options.projectRef]
      );
      if (concurrent.rows[0]) {
        return { action: "reused", value: concurrent.rows[0] };
      }
      throw new Error(`Unable to create project with ref ${options.projectRef}.`);
    }
  }

  throw new Error(`Unable to create a unique project for ${options.projectName}.`);
}

async function ensureEnvironment(
  client: PgClient,
  options: {
    environmentType: RuntimeEnvironmentType;
    organizationId: string;
    orgMemberId: string;
    projectId: string;
  }
): Promise<Ensured<EnvironmentRow>> {
  const existing = await findEnvironmentForProject(client, options);
  if (existing) {
    return { action: "reused", value: existing };
  }

  const slug = environmentSlug(options.environmentType);
  const orgMemberId = options.environmentType === "DEVELOPMENT" ? options.orgMemberId : null;

  for (let attempt = 0; attempt < 100; attempt++) {
    const inserted = await client.query<EnvironmentRow>(
      `
        INSERT INTO "RuntimeEnvironment" (
          "id", "slug", "apiKey", "pkApiKey", "type", "isBranchableEnvironment",
          "shortcode", "maximumConcurrencyLimit", "concurrencyLimitBurstFactor", "paused",
          "autoEnableInternalSources", "organizationId", "projectId", "orgMemberId",
          "createdAt", "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4, $5::"RuntimeEnvironmentType", $6,
          $7, 5, 2.00, false,
          $8, $9, $10, $11,
          NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
        RETURNING
          "id", "slug", "apiKey", "pkApiKey", "type"::text AS "type",
          "projectId", "organizationId", "orgMemberId"
      `,
      [
        createId("env"),
        slug,
        createApiKey(options.environmentType, false),
        createApiKey(options.environmentType, true),
        options.environmentType,
        options.environmentType === "DEVELOPMENT",
        createShortcode(),
        options.environmentType !== "DEVELOPMENT",
        options.organizationId,
        options.projectId,
        orgMemberId,
      ]
    );
    if (inserted.rows[0]) {
      return { action: "created", value: inserted.rows[0] };
    }

    const concurrent = await findEnvironmentForProject(client, options);
    if (concurrent) {
      return { action: "reused", value: concurrent };
    }
  }

  throw new Error(`Unable to create the ${slug} runtime environment.`);
}

async function findEnvironmentForProject(
  client: PgClient,
  options: {
    environmentType: RuntimeEnvironmentType;
    orgMemberId: string;
    projectId: string;
  }
): Promise<EnvironmentRow | undefined> {
  const memberPredicate =
    options.environmentType === "DEVELOPMENT"
      ? `AND "orgMemberId" = $3`
      : `AND "orgMemberId" IS NULL`;
  const parameters =
    options.environmentType === "DEVELOPMENT"
      ? [options.projectId, options.environmentType, options.orgMemberId]
      : [options.projectId, options.environmentType];
  const result = await client.query<EnvironmentRow>(
    `
      SELECT
        "id", "slug", "apiKey", "pkApiKey", "type"::text AS "type",
        "projectId", "organizationId", "orgMemberId"
      FROM "RuntimeEnvironment"
      WHERE "projectId" = $1
        AND "type" = $2::"RuntimeEnvironmentType"
        AND "parentEnvironmentId" IS NULL
        AND "archivedAt" IS NULL
        ${memberPredicate}
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE
    `,
    parameters
  );
  return result.rows[0];
}

async function ensurePersonalAccessToken(
  client: PgClient,
  userId: string,
  preferredName: string,
  encryptionKey: string
): Promise<Ensured<PersonalAccessTokenRow> & { token: string }> {
  const existing = await client.query<PersonalAccessTokenRow>(
    `
      SELECT "id", "name", "encryptedToken", "hashedToken"
      FROM "PersonalAccessToken"
      WHERE "userId" = $1 AND "revokedAt" IS NULL
      ORDER BY ("name" = $2) DESC, "createdAt" ASC
      FOR UPDATE
    `,
    [userId, preferredName]
  );

  if (existing.rows.length > 0) {
    for (const row of existing.rows) {
      try {
        const token = decryptPersonalAccessToken(row, encryptionKey);
        return { action: "reused", token, value: row };
      } catch {
        // Try all active PATs before reporting an encryption-key mismatch.
      }
    }
    throw new Error(
      "The admin has an active PAT, but it cannot be decrypted. Use the same ENCRYPTION_KEY as Trigger.dev."
    );
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const token = createPersonalAccessToken();
    const encryptedToken = encryptToken(token, encryptionKey);
    const inserted = await client.query<PersonalAccessTokenRow>(
      `
        INSERT INTO "PersonalAccessToken" (
          "id", "name", "encryptedToken", "obfuscatedToken", "hashedToken", "userId",
          "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW(), NOW())
        ON CONFLICT DO NOTHING
        RETURNING "id", "name", "encryptedToken", "hashedToken"
      `,
      [
        createId("pat"),
        preferredName,
        JSON.stringify(encryptedToken),
        obfuscatePersonalAccessToken(token),
        hashToken(token),
        userId,
      ]
    );
    if (inserted.rows[0]) {
      return { action: "created", token, value: inserted.rows[0] };
    }
  }

  throw new Error("Unable to create a unique admin personal access token.");
}

function mapProjectContext(row: Record<string, unknown>): ProjectContext {
  const organizationId = String(row.organizationId);
  return {
    organization: {
      id: organizationId,
      slug: String(row.organizationSlug),
      title: String(row.organizationTitle),
    },
    project: {
      id: String(row.projectId),
      slug: String(row.projectSlug),
      name: String(row.projectName),
      externalRef: String(row.externalRef),
      organizationId,
    },
  };
}

function mapEnvironmentContext(row: Record<string, unknown>): EnvironmentContext {
  const projectContext = mapProjectContext(row);
  return {
    ...projectContext,
    environment: {
      id: String(row.environmentId),
      slug: String(row.environmentSlug),
      apiKey: String(row.apiKey),
      pkApiKey: String(row.pkApiKey),
      type: String(row.environmentType) as RuntimeEnvironmentType,
      projectId: String(row.projectId),
      organizationId: String(row.organizationId),
      orgMemberId: row.orgMemberId === null ? null : String(row.orgMemberId),
    },
  };
}

function buildConfig(
  options: CliOptions,
  envFile: EnvFileResolution,
  baseDir: string
): BootstrapConfig {
  const rawDatabaseUrl =
    options.databaseUrl ?? process.env.TRIGGER_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!rawDatabaseUrl) {
    throw new Error(
      `TRIGGER_DATABASE_URL or DATABASE_URL is required.${envFileHelp(envFile)}`
    );
  }

  const parsedDatabase = parseDatabaseUrl(rawDatabaseUrl, options.schema);
  const encryptionKey =
    options.encryptionKey ?? process.env.TRIGGER_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error(
      "TRIGGER_ENCRYPTION_KEY or ENCRYPTION_KEY is required to create/read the admin PAT." +
        envFileHelp(envFile)
    );
  }
  if (Buffer.byteLength(encryptionKey, "utf8") !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes, matching Trigger.dev.");
  }

  const environment = (
    options.environment ??
    process.env.TRIGGER_ENVIRONMENT ??
    process.env.BOOTSTRAP_ENVIRONMENT ??
    "dev"
  ).toLowerCase();
  const environmentSlug = normalizeEnvironment(environment);

  const adminEmail = normalizeEmail(
    options.adminEmail ??
      process.env.TRIGGER_ADMIN_EMAIL ??
      process.env.BOOTSTRAP_USER_EMAIL ??
      "admin@local.dev"
  );
  const projectRefHint = normalizedOptional(
    options.projectRef ?? process.env.TRIGGER_PROJECT_REF
  );
  if (projectRefHint && !/^proj_[A-Za-z0-9_-]+$/.test(projectRefHint)) {
    throw new Error("TRIGGER_PROJECT_REF must start with proj_ and contain URL-safe characters.");
  }

  if (options.dryRun && options.outputEnv) {
    throw new Error("--dry-run cannot be combined with --output-env.");
  }

  return {
    adminEmail,
    adminName: normalizedRequired(
      options.adminName ?? process.env.TRIGGER_ADMIN_NAME ?? "Trigger Admin",
      "admin name"
    ),
    databaseUrl: parsedDatabase.connectionString,
    databaseDisplay: parsedDatabase.display,
    dryRun: options.dryRun,
    encryptionKey,
    environmentSlug,
    environmentType: environmentSlug === "dev" ? "DEVELOPMENT" : "PRODUCTION",
    organizationSlug: normalizedOptional(
      options.organizationSlug ?? process.env.TRIGGER_ORG_SLUG
    ),
    organizationTitle: normalizedRequired(
      options.organizationTitle ??
        process.env.TRIGGER_ORG_TITLE ??
        process.env.BOOTSTRAP_ORG_TITLE ??
        "Engine",
      "organization title"
    ),
    outputEnv: options.outputEnv ? resolve(baseDir, options.outputEnv) : undefined,
    patName: normalizedRequired(
      options.patName ?? process.env.TRIGGER_PAT_NAME ?? "enlearn-engine-bootstrap",
      "PAT name"
    ),
    projectName: normalizedRequired(
      options.projectName ??
        process.env.TRIGGER_PROJECT_NAME ??
        process.env.BOOTSTRAP_PROJECT_NAME ??
        "enlearn-workflow-local",
      "project name"
    ),
    projectRefHint,
    schema: parsedDatabase.schema,
    secretKeyHint: normalizedOptional(process.env.TRIGGER_SECRET_KEY),
    sourceEnvFile: envFile.loaded,
  };
}

function resolveEnvFile(options: CliOptions, baseDir: string): EnvFileResolution {
  const explicit = options.envFile ?? process.env.TRIGGER_ENV_FILE;
  if (explicit) {
    const path = resolve(baseDir, explicit);
    if (!existsSync(path)) {
      throw new Error(`Environment file does not exist: ${path}`);
    }
    return { checked: [path], loaded: path };
  }

  const candidates = uniquePaths([
    resolve(baseDir, ".env.bootstrap"),
    resolve(PACKAGE_ROOT, ".env.bootstrap"),
    resolve(PROJECT_ROOT, "..", "trigger.dev-main", ".env"),
    resolve(PACKAGE_ROOT, ".env"),
    resolve(process.cwd(), ".env"),
  ]);
  const loaded = candidates.find((candidate) => existsSync(candidate));
  return { checked: candidates, loaded };
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = process.platform === "win32" ? path.toLowerCase() : path;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function envFileHelp(resolution: EnvFileResolution): string {
  if (resolution.loaded) {
    return ` Loaded config file: ${resolution.loaded}. It must contain Trigger.dev's DATABASE_URL and exact 32-byte ENCRYPTION_KEY.`;
  }
  return ` No config file was found. Checked: ${resolution.checked.join(", ")}. Pass --env-file <Trigger.dev .env>.`;
}

function parseDatabaseUrl(rawValue: string, schemaOverride?: string) {
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("Trigger database URL is invalid.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Trigger database URL must use postgres:// or postgresql://.");
  }

  const schema = normalizedRequired(
    schemaOverride ?? process.env.TRIGGER_DATABASE_SCHEMA ?? url.searchParams.get("schema") ?? "public",
    "database schema"
  );
  if (schema.includes("\0")) {
    throw new Error("Database schema contains an invalid null character.");
  }

  url.searchParams.delete("schema");
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
  const port = url.port || "5432";

  return {
    connectionString: url.toString(),
    display: `${url.hostname}:${port}/${database}`,
    schema,
  };
}

function parseArgs(args: string[]): CliOptions {
  const result: CliOptions = {
    dryRun: false,
    help: false,
    json: false,
    showSecrets: false,
  };
  const valueFlags: Record<string, keyof CliOptions> = {
    "--admin-email": "adminEmail",
    "--admin-name": "adminName",
    "--base-dir": "baseDir",
    "--database-url": "databaseUrl",
    "--encryption-key": "encryptionKey",
    "--env-file": "envFile",
    "--environment": "environment",
    "--org-slug": "organizationSlug",
    "--org-title": "organizationTitle",
    "--output-env": "outputEnv",
    "--pat-name": "patName",
    "--project-name": "projectName",
    "--project-ref": "projectRef",
    "--schema": "schema",
  };

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);

    if (flag === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (flag === "--help" || flag === "-h") {
      result.help = true;
      continue;
    }
    if (flag === "--json") {
      result.json = true;
      continue;
    }
    if (flag === "--show-secrets") {
      result.showSecrets = true;
      continue;
    }

    const property = valueFlags[flag];
    if (!property) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = inlineValue ?? args[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    (result[property] as string | undefined) = value;
  }

  return result;
}

function printHelp(): void {
  console.log(`Trigger.dev database bootstrap

Checks or creates a Trigger.dev admin, project/runtime key, and admin PAT.

Usage:
  pnpm run bootstrap -- --env-file C:\\path\\to\\trigger.dev\\.env

Options:
  --env-file <path>       Load DATABASE_URL and ENCRYPTION_KEY from a file
  --base-dir <path>       Resolve relative env-file/output paths from here
  --database-url <url>    Override TRIGGER_DATABASE_URL / DATABASE_URL
  --schema <name>         Override ?schema=... from the database URL
  --encryption-key <key>  Override TRIGGER_ENCRYPTION_KEY / ENCRYPTION_KEY
  --admin-email <email>   Email used only when no admin exists
  --admin-name <name>     Display name for a created/promoted admin
  --org-title <title>     Organization title (default: Engine)
  --org-slug <slug>       Prefer or create this organization slug
  --project-name <name>   Project name (default: enlearn-workflow-local)
  --project-ref <ref>     Prefer or create this exact proj_ reference
  --environment <dev|prod> Runtime environment to use (default: dev)
  --pat-name <name>       Name for a newly created PAT
  --output-env <path>     Update credentials in an env file
  --show-secrets          Print complete secret key and PAT
  --json                  Emit JSON (secrets remain masked unless requested)
  --dry-run               Execute checks/inserts, then roll back
  -h, --help              Show this help

Environment output:
  TRIGGER_PROJECT_REF     Project.externalRef
  TRIGGER_SECRET_KEY      RuntimeEnvironment.apiKey
  TRIGGER_ACCESS_TOKEN    Admin PersonalAccessToken (tr_pat_...)

Prefer an env file over command-line secret arguments because command lines may
be visible to other local processes. Without --env-file, the script looks for
.env.bootstrap and then a sibling trigger.dev-main/.env before the gateway .env.`);
}

function printResult(result: BootstrapResult, options: CliOptions, outputEnv?: string): void {
  const secretKey = options.showSecrets
    ? result.environment.value.apiKey
    : maskSecret(result.environment.value.apiKey);
  const token = options.showSecrets ? result.pat.token : maskSecret(result.pat.token);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          dryRun: result.dryRun,
          database: result.database,
          admin: {
            action: result.admin.action,
            id: result.admin.value.id,
            email: result.admin.value.email,
          },
          organization: {
            action: result.organization.action,
            id: result.organization.value.id,
            slug: result.organization.value.slug,
          },
          project: {
            action: result.project.action,
            id: result.project.value.id,
            name: result.project.value.name,
          },
          environment: {
            action: result.environment.action,
            id: result.environment.value.id,
            slug: result.environment.value.slug,
          },
          pat: {
            action: result.pat.action,
            id: result.pat.value.id,
            name: result.pat.value.name,
          },
          credentials: {
            TRIGGER_PROJECT_REF: result.project.value.externalRef,
            TRIGGER_SECRET_KEY: secretKey,
            TRIGGER_ACCESS_TOKEN: token,
          },
          outputEnv: outputEnv ?? null,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Database: ${result.database.display} (schema: ${result.database.schema})`);
  console.log(`${actionLabel(result.admin.action, result.dryRun)} admin: ${result.admin.value.email}`);
  console.log(
    `${actionLabel(result.organization.action, result.dryRun)} organization: ${result.organization.value.slug}`
  );
  console.log(
    `${actionLabel(result.project.action, result.dryRun)} project: ${result.project.value.name}`
  );
  console.log(
    `${actionLabel(result.environment.action, result.dryRun)} environment: ${result.environment.value.slug}`
  );
  console.log(
    `${actionLabel(result.pat.action, result.dryRun)} admin PAT: ${result.pat.value.name}`
  );
  console.log("");
  console.log(`TRIGGER_PROJECT_REF=${result.project.value.externalRef}`);
  console.log(`TRIGGER_SECRET_KEY=${secretKey}`);
  console.log(`TRIGGER_ACCESS_TOKEN=${token}`);

  if (outputEnv) {
    console.log(`Credentials written to ${outputEnv}`);
  } else if (!options.showSecrets) {
    console.log("Use --show-secrets to print full secrets, or --output-env <path> to write them.");
  }
  if (result.dryRun) {
    console.log("Dry run complete: all database changes were rolled back.");
  }
}

function writeCredentialsToEnv(path: string, result: BootstrapResult): void {
  const filePath = resolve(path);
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  let next = existing;
  next = setDotEnvValue(next, "TRIGGER_PROJECT_REF", result.project.value.externalRef);
  next = setDotEnvValue(next, "TRIGGER_SECRET_KEY", result.environment.value.apiKey);
  next = setDotEnvValue(next, "TRIGGER_ACCESS_TOKEN", result.pat.token);
  writeFileSync(filePath, next, { encoding: "utf8", mode: 0o600 });
}

function setDotEnvValue(content: string, key: string, value: string): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content ? content.split(/\r?\n/) : [];
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  let replaced = false;
  const updated = lines.map((line) => {
    if (!pattern.test(line)) {
      return line;
    }
    replaced = true;
    return `${key}=${value}`;
  });
  if (!replaced) {
    if (updated.length > 0 && updated[updated.length - 1] !== "") {
      updated.push("");
    }
    updated.push(`${key}=${value}`);
  }
  while (updated.length > 1 && updated[updated.length - 1] === "" && updated[updated.length - 2] === "") {
    updated.pop();
  }
  return `${updated.join(newline).replace(new RegExp(`${escapeRegExp(newline)}+$`), "")}${newline}`;
}

function loadDotEnv(path: string): void {
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("export ")) {
      line = line.slice(7).trim();
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    process.env[key] = value;
  }
}

function encryptToken(value: string, key: string) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "utf8"), nonce);
  let ciphertext = cipher.update(value, "utf8", "hex");
  ciphertext += cipher.final("hex");
  return {
    nonce: nonce.toString("hex"),
    ciphertext,
    tag: cipher.getAuthTag().toString("hex"),
  };
}

function decryptPersonalAccessToken(row: PersonalAccessTokenRow, key: string): string {
  if (!isEncryptedToken(row.encryptedToken)) {
    throw new Error(`PAT ${row.id} has an invalid encryptedToken value.`);
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "utf8"),
    Buffer.from(row.encryptedToken.nonce, "hex")
  );
  decipher.setAuthTag(Buffer.from(row.encryptedToken.tag, "hex"));
  let token = decipher.update(row.encryptedToken.ciphertext, "hex", "utf8");
  token += decipher.final("utf8");

  if (!token.startsWith("tr_pat_") || hashToken(token) !== row.hashedToken) {
    throw new Error(`PAT ${row.id} failed its hash check.`);
  }
  return token;
}

function isEncryptedToken(
  value: unknown
): value is { nonce: string; ciphertext: string; tag: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).nonce === "string" &&
    typeof (value as Record<string, unknown>).ciphertext === "string" &&
    typeof (value as Record<string, unknown>).tag === "string"
  );
}

function hashToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createApiKey(type: RuntimeEnvironmentType, publicKey: boolean): string {
  const prefix = publicKey ? "pk" : "tr";
  return `${prefix}_${environmentSlug(type)}_${randomString(API_KEY_CHARS, 20)}`;
}

function createPersonalAccessToken(): string {
  return `tr_pat_${randomString(LOWERCASE_KEY_CHARS, 40)}`;
}

function obfuscatePersonalAccessToken(token: string): string {
  const body = token.slice("tr_pat_".length);
  return `tr_pat_${body.slice(0, 4)}${"\u2022".repeat(18)}${body.slice(-4)}`;
}

function createProjectRef(): string {
  return `proj_${randomString("abcdefghijklmnopqrstuvwxyz", 20)}`;
}

function createShortcode(): string {
  return `${randomString("abcdefghijklmnopqrstuvwxyz", 5)}-${randomString(
    "abcdefghijklmnopqrstuvwxyz",
    5
  )}`;
}

function createId(prefix: string): string {
  return `${prefix}_${randomString("1234567890abcdefghijklmnopqrstuvwxyz", 24)}`;
}

function randomString(alphabet: string, length: number): string {
  let result = "";
  for (let index = 0; index < length; index++) {
    result += alphabet[crypto.randomInt(alphabet.length)];
  }
  return result;
}

function environmentSlug(type: RuntimeEnvironmentType): EnvironmentSlug {
  return type === "DEVELOPMENT" ? "dev" : "prod";
}

function normalizeEnvironment(value: string): EnvironmentSlug {
  if (value === "dev" || value === "development") {
    return "dev";
  }
  if (value === "prod" || value === "production") {
    return "prod";
  }
  throw new Error("Environment must be dev or prod.");
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid admin email: ${value}`);
  }
  return email;
}

function normalizedRequired(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty.`);
  }
  return normalized;
}

function normalizedOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "trigger";
}

function actionLabel(action: ResourceAction, dryRun: boolean): string {
  if (dryRun && action === "created") {
    return "[would create]";
  }
  if (dryRun && action === "promoted") {
    return "[would promote]";
  }
  return `[${action}]`;
}

function maskSecret(value: string): string {
  if (value.length <= 14) {
    return "***";
  }
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
