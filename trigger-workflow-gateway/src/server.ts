import http, { type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
type PgClient = InstanceType<typeof Client>;

type WorkflowMap = Record<string, string>;
type RuntimeEnvironmentType = "DEVELOPMENT" | "PRODUCTION";
type BootstrapEnvironmentSlug = "dev" | "prod";

type GatewayConfig = {
  port: number;
  triggerInternalUrl: string;
  triggerSecretKey: string;
  projectRef?: string;
  databaseUrl?: string;
  redisUrl?: string;
  bodyLimitBytes: number;
  corsOrigin?: string;
  workflows: WorkflowMap;
  keySource: string;
  bootstrap?: BootstrapResult;
};

type BootstrapOptions = {
  databaseUrl: string;
  projectRef?: string;
  userEmail: string;
  orgTitle: string;
  projectName: string;
  environment: string;
};

type BootstrapResult = {
  userEmail: string;
  organizationSlug: string;
  projectRef: string;
  environmentSlug: BootstrapEnvironmentSlug;
  apiKey: string;
};

type UserRow = { id: string; email: string };
type OrganizationRow = { id: string; slug: string; title: string };
type OrgMemberRow = { id: string; organizationId: string; userId: string };
type ProjectRow = { id: string; slug: string; name: string; externalRef: string };
type EnvironmentRow = {
  id: string;
  slug: string;
  apiKey: string;
  pkApiKey: string;
  type: RuntimeEnvironmentType;
};

type ProxyOptions = {
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
};

type RequestBody = Record<string, unknown>;
type HttpError = Error & { statusCode?: number };
type RedisCheck = { ok: boolean; host?: string; port?: number; message?: string };

function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && "statusCode" in error;
}

function isPgUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

loadDotEnv(resolve(process.cwd(), ".env"));

const config = await buildConfig();

if (Object.keys(config.workflows).length === 0) {
  fatal('At least one workflow is required. Set WORKFLOWS={"approval":"task-id"}.');
}

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    if (isHttpError(error) && error.statusCode) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }

    console.error(error);
    sendJson(res, 500, { error: "Gateway internal error" });
  }
});

server.listen(config.port, () => {
  console.log(`Workflow gateway listening on http://localhost:${config.port}`);
  console.log(`Trigger.dev internal API: ${config.triggerInternalUrl}`);
  console.log(`Project ref: ${config.projectRef ?? "(unknown)"}`);
  console.log(`Key source: ${config.keySource}`);
  console.log(`Internal key: ${obfuscateSecret(config.triggerSecretKey)}`);
  console.log(`Workflows: ${Object.keys(config.workflows).join(", ")}`);
});

async function buildConfig(): Promise<GatewayConfig> {
  const baseConfig = {
    port: integerEnv("GATEWAY_PORT", 3030),
    triggerInternalUrl: trimTrailingSlash(
      process.env.TRIGGER_INTERNAL_URL ?? "http://127.0.0.1:3031"
    ),
    triggerSecretKey: process.env.TRIGGER_SECRET_KEY,
    projectRef: process.env.TRIGGER_PROJECT_REF,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    bodyLimitBytes: integerEnv("BODY_LIMIT_BYTES", 1024 * 1024),
    corsOrigin: process.env.CORS_ORIGIN,
    workflows: loadWorkflowMap(),
    keySource: process.env.TRIGGER_SECRET_KEY ? "TRIGGER_SECRET_KEY" : undefined,
  };

  if (baseConfig.triggerSecretKey) {
    return {
      ...baseConfig,
      triggerSecretKey: baseConfig.triggerSecretKey,
      keySource: "TRIGGER_SECRET_KEY",
    };
  }

  if (!baseConfig.databaseUrl) {
    fatal("TRIGGER_SECRET_KEY or DATABASE_URL is required.");
  }

  const bootstrap = await bootstrapFromPostgres({
    databaseUrl: baseConfig.databaseUrl,
    projectRef: baseConfig.projectRef,
    userEmail: process.env.BOOTSTRAP_USER_EMAIL ?? "gateway@local.dev",
    orgTitle: process.env.BOOTSTRAP_ORG_TITLE ?? "Workflow Engine",
    projectName: process.env.BOOTSTRAP_PROJECT_NAME ?? "workflow-engine",
    environment: process.env.BOOTSTRAP_ENVIRONMENT ?? "dev",
  });

  return {
    ...baseConfig,
    triggerSecretKey: bootstrap.apiKey,
    projectRef: bootstrap.projectRef,
    keySource: `DATABASE_URL:${bootstrap.environmentSlug}`,
    bootstrap,
  };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (config.corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    await handleHealth(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/workflows") {
    sendJson(res, 200, {
      workflows: Object.keys(config.workflows),
      projectRef: config.projectRef ?? null,
      keySource: config.keySource,
    });
    return;
  }

  const startMatch = url.pathname.match(/^\/workflows\/([A-Za-z0-9_.-]+)\/start$/);
  if (startMatch) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await handleStartWorkflow(req, res, startMatch[1]);
    return;
  }

  const runMatch = url.pathname.match(/^\/workflows\/runs\/([A-Za-z0-9_.:-]+)$/);
  if (runMatch) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await proxyTriggerJson(res, `/api/v3/runs/${encodeURIComponent(runMatch[1])}`, {
      method: "GET",
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function handleHealth(res: ServerResponse): Promise<void> {
  const startedAt = Date.now();
  const redis = config.redisUrl ? await checkTcpUrl(config.redisUrl) : undefined;

  try {
    const response = await fetch(`${config.triggerInternalUrl}/healthcheck`, {
      signal: AbortSignal.timeout(5_000),
    });
    const ok = response.ok && (redis ? redis.ok : true);
    sendJson(res, ok ? 200 : 502, {
      ok,
      gateway: "ok",
      trigger: response.ok ? "ok" : "unhealthy",
      redis,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      gateway: "ok",
      trigger: "unreachable",
      redis,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function bootstrapFromPostgres(options: BootstrapOptions): Promise<BootstrapResult> {
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    const user = await ensureUser(client, options.userEmail);
    const organization = await ensureOrganization(client, options.orgTitle);
    const orgMember = await ensureOrgMember(client, organization.id, user.id);
    const project = await ensureProject(client, {
      organizationId: organization.id,
      name: options.projectName,
      projectRef: options.projectRef,
    });

    const devEnvironment = await ensureEnvironment(client, {
      organizationId: organization.id,
      projectId: project.id,
      orgMemberId: orgMember.id,
      type: "DEVELOPMENT",
    });
    const prodEnvironment = await ensureEnvironment(client, {
      organizationId: organization.id,
      projectId: project.id,
      orgMemberId: null,
      type: "PRODUCTION",
    });

    const environmentSlug = normalizeBootstrapEnvironment(options.environment);
    const selectedEnvironment = environmentSlug === "prod" ? prodEnvironment : devEnvironment;

    await client.query("COMMIT");

    return {
      userEmail: user.email,
      organizationSlug: organization.slug,
      projectRef: project.externalRef,
      environmentSlug,
      apiKey: selectedEnvironment.apiKey,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function ensureUser(client: PgClient, email: string): Promise<UserRow> {
  const id = createId("user");
  const result = await client.query(
    `
      INSERT INTO "User" (
        "id", "email", "authenticationMethod", "displayName", "name", "admin",
        "confirmedBasicDetails", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3::"AuthenticationMethod", $4, $5, true, true, NOW(), NOW())
      ON CONFLICT ("email") DO UPDATE SET
        "admin" = true,
        "confirmedBasicDetails" = true,
        "updatedAt" = NOW()
      RETURNING "id", "email"
    `,
    [id, email, "MAGIC_LINK", "Gateway User", "Gateway User"]
  );

  return result.rows[0];
}

async function ensureOrganization(client: PgClient, title: string): Promise<OrganizationRow> {
  const existing = await client.query(
    `SELECT "id", "slug", "title" FROM "Organization" WHERE "title" = $1 AND "deletedAt" IS NULL LIMIT 1`,
    [title]
  );
  if (existing.rows[0]) {
    const updated = await client.query(
      `UPDATE "Organization" SET "v3Enabled" = true, "updatedAt" = NOW() WHERE "id" = $1 RETURNING "id", "slug", "title"`,
      [existing.rows[0].id]
    );
    return updated.rows[0];
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const slug = `${slugify(title)}-${randomString("1234567890abcdef", 4)}`;
    try {
      const inserted = await client.query(
        `
          INSERT INTO "Organization" (
            "id", "slug", "title", "companySize", "v3Enabled", "runsEnabled",
            "createdAt", "updatedAt"
          )
          VALUES ($1, $2, $3, '1-10', true, true, NOW(), NOW())
          RETURNING "id", "slug", "title"
        `,
        [createId("org"), slug, title]
      );
      return inserted.rows[0];
    } catch (error) {
      if (!isPgUniqueViolation(error)) {
        throw error;
      }
    }
  }

  throw new Error(`Unable to create unique organization slug for ${title}`);
}

async function ensureOrgMember(
  client: PgClient,
  organizationId: string,
  userId: string
): Promise<OrgMemberRow> {
  const result = await client.query(
    `
      INSERT INTO "OrgMember" ("id", "organizationId", "userId", "role", "createdAt", "updatedAt")
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
  options: { organizationId: string; name: string; projectRef?: string }
): Promise<ProjectRow> {
  if (options.projectRef) {
    const existingByRef = await client.query(
      `SELECT "id", "slug", "name", "externalRef" FROM "Project" WHERE "externalRef" = $1 LIMIT 1`,
      [options.projectRef]
    );
    if (existingByRef.rows[0]) {
      return existingByRef.rows[0];
    }
  }

  const existingByName = await client.query(
    `SELECT "id", "slug", "name", "externalRef" FROM "Project" WHERE "organizationId" = $1 AND "name" = $2 AND "deletedAt" IS NULL LIMIT 1`,
    [options.organizationId, options.name]
  );
  if (existingByName.rows[0]) {
    return existingByName.rows[0];
  }

  const projectRef = options.projectRef ?? createProjectRef();
  for (let attempt = 0; attempt < 100; attempt++) {
    const slug = `${slugify(options.name)}-${randomString("1234567890abcdef", 4)}`;
    try {
      const inserted = await client.query(
        `
          INSERT INTO "Project" (
            "id", "slug", "name", "externalRef", "organizationId", "version", "engine",
            "createdAt", "updatedAt"
          )
          VALUES ($1, $2, $3, $4, $5, 'V3'::"ProjectVersion", 'V2'::"RunEngineVersion", NOW(), NOW())
          RETURNING "id", "slug", "name", "externalRef"
        `,
        [createId("project"), slug, options.name, projectRef, options.organizationId]
      );
      return inserted.rows[0];
    } catch (error) {
      if (!isPgUniqueViolation(error)) {
        throw error;
      }
    }
  }

  throw new Error(`Unable to create unique project slug for ${options.name}`);
}

async function ensureEnvironment(
  client: PgClient,
  options: {
    organizationId: string;
    projectId: string;
    orgMemberId: string | null;
    type: RuntimeEnvironmentType;
  }
): Promise<EnvironmentRow> {
  const existing = await client.query(
    `
      SELECT "id", "slug", "apiKey", "pkApiKey", "type"
      FROM "RuntimeEnvironment"
      WHERE "projectId" = $1 AND "type" = $2::"RuntimeEnvironmentType"
        AND "parentEnvironmentId" IS NULL AND "archivedAt" IS NULL
      LIMIT 1
    `,
    [options.projectId, options.type]
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const slug = environmentSlug(options.type);
  const inserted = await client.query(
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
      RETURNING "id", "slug", "apiKey", "pkApiKey", "type"
    `,
    [
      createId("env"),
      slug,
      createApiKeyForEnv(options.type),
      createPkApiKeyForEnv(options.type),
      options.type,
      options.type === "DEVELOPMENT",
      createShortcode(),
      options.type !== "DEVELOPMENT",
      options.organizationId,
      options.projectId,
      options.orgMemberId,
    ]
  );

  return inserted.rows[0];
}

async function handleStartWorkflow(
  req: IncomingMessage,
  res: ServerResponse,
  workflowName: string
): Promise<void> {
  const taskId = config.workflows[workflowName];
  if (!taskId) {
    sendJson(res, 404, {
      error: "Unknown workflow",
      workflow: workflowName,
      availableWorkflows: Object.keys(config.workflows),
    });
    return;
  }

  const body = await readJsonBody(req);
  const payload = Object.hasOwn(body, "payload") ? body.payload : body;
  const triggerBody = {
    payload: payload ?? {},
    ...(body?.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
    ...(body?.options && typeof body.options === "object" ? body.options : {}),
  };

  const idempotencyKey = req.headers["idempotency-key"];
  const headers = idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : undefined;

  await proxyTriggerJson(res, `/api/v1/tasks/${encodeURIComponent(taskId)}/trigger`, {
    method: "POST",
    body: triggerBody,
    headers,
  });
}

async function proxyTriggerJson(
  res: ServerResponse,
  pathname: string,
  options: ProxyOptions
): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.triggerSecretKey}`,
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${config.triggerInternalUrl}${pathname}`, {
    method: options.method,
    headers,
    body,
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";

  res.statusCode = response.status;
  res.setHeader("Content-Type", contentType);
  res.end(text);
}

async function readJsonBody(req: IncomingMessage): Promise<RequestBody> {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > config.bodyLimitBytes) {
      const error = new Error("Request body too large") as HttpError;
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON") as HttpError;
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function loadWorkflowMap(): WorkflowMap {
  const workflows: WorkflowMap = {};

  if (process.env.WORKFLOWS) {
    const parsed = JSON.parse(process.env.WORKFLOWS);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fatal("WORKFLOWS must be a JSON object mapping names to task IDs.");
    }

    for (const [name, taskId] of Object.entries(parsed)) {
      workflows[normalizeWorkflowName(name)] = assertTaskId(taskId, `WORKFLOWS.${name}`);
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^WORKFLOW_([A-Z0-9_]+)_TASK_ID$/);
    if (!match || !value) {
      continue;
    }

    const name = match[1].toLowerCase().replaceAll("_", "-");
    workflows[normalizeWorkflowName(name)] = assertTaskId(value, key);
  }

  return workflows;
}

function normalizeWorkflowName(name: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    fatal(`Invalid workflow name "${name}". Use letters, numbers, dot, underscore, or dash.`);
  }
  return name;
}

function assertTaskId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fatal(`${label} must be a non-empty task ID string.`);
  }
  return value.trim();
}

function integerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fatal(`${name} must be a positive integer.`);
  }

  return parsed;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeBootstrapEnvironment(value: string): BootstrapEnvironmentSlug {
  const normalized = value.toLowerCase();
  if (normalized === "dev" || normalized === "development") {
    return "dev";
  }
  if (normalized === "prod" || normalized === "production") {
    return "prod";
  }
  fatal("BOOTSTRAP_ENVIRONMENT must be dev or prod.");
}

function environmentSlug(type: RuntimeEnvironmentType): BootstrapEnvironmentSlug {
  switch (type) {
    case "DEVELOPMENT":
      return "dev";
    case "PRODUCTION":
      return "prod";
    default:
      throw new Error(`Unsupported bootstrap environment type ${type}`);
  }
}

function createApiKeyForEnv(type: RuntimeEnvironmentType): string {
  return `tr_${environmentSlug(type)}_${randomString(apiKeyChars(), 20)}`;
}

function createPkApiKeyForEnv(type: RuntimeEnvironmentType): string {
  return `pk_${environmentSlug(type)}_${randomString(apiKeyChars(), 20)}`;
}

function createProjectRef(): string {
  return `proj_${randomString("abcdefghijklmnopqrstuvwxyz", 20)}`;
}

function createShortcode(): string {
  return `${randomString("abcdefghijklmnopqrstuvwxyz", 5)}-${randomString("abcdefghijklmnopqrstuvwxyz", 5)}`;
}

function createId(prefix: string): string {
  return `${prefix}_${randomString("1234567890abcdefghijklmnopqrstuvwxyz", 24)}`;
}

function apiKeyChars(): string {
  return "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
}

function randomString(chars: string, length: number): string {
  let value = "";
  for (let index = 0; index < length; index++) {
    value += chars[crypto.randomInt(chars.length)];
  }
  return value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function obfuscateSecret(value: string): string {
  if (!value || value.length < 16) {
    return "(set)";
  }
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

async function checkTcpUrl(value: string): Promise<RedisCheck> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: "Invalid REDIS_URL" };
  }

  const host = url.hostname;
  const port = Number.parseInt(url.port || "6379", 10);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (result: RedisCheck) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1_000);
    socket.once("connect", () => done({ ok: true, host, port }));
    socket.once("timeout", () => done({ ok: false, host, port, message: "timeout" }));
    socket.once("error", (error) => done({ ok: false, host, port, message: error.message }));
  });
}

function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    value = value.replace(/\s+#.*$/, "");

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function fatal(message: string): never {
  console.error(message);
  process.exit(1);
}

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
