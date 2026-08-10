import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool, type PoolClient } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { createSupabaseClient } from '../src/common/utils/supabase';
import { TriggerCredentialsService } from '../src/workflow/trigger/trigger-credentials.service';

type JsonRecord = Record<string, unknown>;

const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const SIDECAR_URL = (process.env.PLANNING_ENGINE_ENDPOINT ?? 'http://127.0.0.1:8088/solve')
  .replace(/\/solve\/?$/, '');
const BROWSER_EXECUTABLE = process.env.PLANNING_UI_BROWSER ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CONSOLE_PATH = '/dashboard/advanced/planning-console';
const CURRENT_DATE = '2026-08-09T00:00:00.000Z';
const execFileAsync = promisify(execFile);

function stage(value: string) {
  console.log(`[planning-console-real-e2e] ${value}`);
}

function directProjectConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapServicePayload(value: unknown) {
  return isRecord(value) && 'success' in value && 'data' in value ? value.data : value;
}

async function readJson(response: Response) {
  const text = await response.text();
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : {};
  } catch {
    value = { message: text };
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(value)}`);
  return value;
}

async function serviceRequest(
  accessToken: string,
  accountId: string,
  serviceMethod: string,
  postData: JsonRecord
) {
  return unwrapServicePayload(await readJson(await fetch(`${API_URL}/api/service`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-account-id': accountId
    },
    body: JSON.stringify({ serviceName: 'planning', serviceMethod, postData })
  })));
}

async function waitForUrl(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}.`);
}

async function waitFor<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs: number,
  description: string,
  intervalMs = 250
) {
  const deadline = Date.now() + timeoutMs;
  let latest: T | undefined;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      latest = await read();
      if (accept(latest)) return latest;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(
    `Timed out waiting for ${description}: ${JSON.stringify(latest)}` +
    `${lastError ? `; last error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}`
  );
}

function delay(milliseconds: number) {
  return new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function query<T extends JsonRecord = JsonRecord>(
  client: QueryClient,
  text: string,
  values: unknown[] = []
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await client.query<T>(text, values);
    } catch (error) {
      lastError = error;
      if (!isTransientPostgresError(error) || attempt === 19) throw error;
      await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}

function isTransientPostgresError(error: unknown) {
  const code = isRecord(error) ? String(error.code ?? '') : '';
  const message = error instanceof Error ? error.message : String(error);
  return ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03', '08000', '08003', '08006']
    .includes(code) || /Connection terminated unexpectedly|read ECONNRESET|connect ETIMEDOUT/i.test(message);
}

async function prepareContext(browser: any, session: JsonRecord, accountId: string) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const accessToken = String(session.access_token ?? '');
  const refreshToken = String(session.refresh_token ?? '');
  assert.ok(accessToken, 'The test session is missing an access token.');
  await context.addInitScript(
    ({ accessToken: token, refreshToken: refresh, activeAccountId }: Record<string, string>) => {
      window.localStorage.setItem('enlearn_access_token', token);
      if (refresh) window.localStorage.setItem('enlearn_refresh_token', refresh);
      window.localStorage.setItem('enlearn_active_account_id', activeAccountId);
      window.sessionStorage.setItem('enlearn_dev_auto_login_disabled', '1');
    },
    { accessToken, refreshToken, activeAccountId: accountId }
  );
  return context;
}

async function waitForConsole(page: any) {
  await page.locator('.admin-shell').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.lc-node-tabs').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
    .catch(() => undefined);
}

async function selectOption(page: any, field: string, label: string) {
  const select = page.locator(`#${field}`).first();
  await select.waitFor({ state: 'visible', timeout: 15_000 });
  await select.click();
  const option = page.locator('.vxe-select--panel:visible .vxe-select-option', { hasText: label }).first();
  await option.waitFor({ state: 'visible', timeout: 15_000 });
  await option.click();
}

function actionButton(page: any, label: string) {
  return page.locator('.lc-node-button-group .vxe-button', { hasText: label }).first();
}

async function searchFormButton(page: any, label: string) {
  const form = page.locator('#planning_console_filter').first();
  const formButton = form.getByRole('button', { name: label }).first();
  if (await formButton.count()) return formButton;
  return page.locator('.lowcode-runtime-page > .lc-runtime-block').first()
    .getByRole('button', { name: label }).first();
}

async function clickTab(page: any, label: string) {
  const tab = page.locator('.lc-node-tabs .vxe-tabs-header--item', { hasText: label }).first();
  await tab.waitFor({ state: 'visible', timeout: 15_000 });
  await tab.click();
  await delay(180);
}

async function health() {
  return readJson(await fetch(`${SIDECAR_URL}/health`)) as Promise<JsonRecord>;
}

async function dockerTop() {
  const result = await execFileAsync(
    'docker',
    ['top', 'enlearn-planning-frepple-sidecar-1', '-eo', 'pid,ppid,args'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 }
  );
  return result.stdout;
}

type QueryClient = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

async function readRun(client: QueryClient, accountId: string, runId: string) {
  const result = await query<JsonRecord>(client, `
    select
      r.id as run_id, r.name as run_name, r.status as run_status, r.trigger_run_id,
      r.progress, r.message, r.output, v.id as version_id, v.code as version_code,
      v.status as version_status, v.is_current, v.result_summary,
      (select count(*)::int from public.planning_operationplan
        where account_id = $1 and plan_version_id = v.id) as operationplan_count,
      (select count(*)::int from public.planning_operationplanmaterial
        where account_id = $1 and plan_version_id = v.id) as material_count,
      (select count(*)::int from public.planning_operationplanresource
        where account_id = $1 and plan_version_id = v.id) as resource_count,
      (select count(*)::int from public.planning_problem
        where account_id = $1 and plan_version_id = v.id) as problem_count,
      (select count(*)::int from public.planning_constraint
        where account_id = $1 and plan_version_id = v.id) as constraint_count,
      (select count(*)::int from public.planning_resourceplan
        where account_id = $1 and plan_version_id = v.id) as resourceplan_count
    from public.planning_run r
    join public.planning_plan_version v on v.account_id = r.account_id and v.run_id = r.id
    where r.account_id = $1 and r.id = $2
  `, [accountId, runId]);
  return result.rows[0] ?? {};
}

async function readTriggerRun(trigger: TriggerCredentialsService, triggerRunId: string) {
  const credentials = await trigger.getCredentials();
  return trigger.getRun(credentials.environmentId, triggerRunId);
}

async function assertTerminalResultGuard(
  client: Pool,
  accountId: string,
  versionId: string,
  reference: string
) {
  const connection = await client.connect();
  await connection.query('begin');
  try {
    await assert.rejects(
      connection.query(`
        insert into public.planning_operationplan (
          account_id, reference, type, status, quantity, plan_version_id
        ) values ($1, $2, 'STCK', 'proposed', 1, $3)
      `, [accountId, reference, versionId]),
      (error: NodeJS.ErrnoException) => error.code === '23514'
    );
  } finally {
    await connection.query('rollback').catch(() => undefined);
    connection.release();
  }
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  if (!existsSync(BROWSER_EXECUTABLE)) throw new Error(`Browser executable not found: ${BROWSER_EXECUTABLE}`);

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const artifactsDir = resolve(repoRoot, 'artifacts');
  const playwrightPath = resolve(
    repoRoot,
    'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js'
  );
  await mkdir(artifactsDir, { recursive: true });
  await Promise.all([
    waitForUrl(FRONTEND_URL),
    waitForUrl(`${API_URL}/api/auth/account-options?login=admin`),
    waitForUrl(`${SIDECAR_URL}/health`)
  ]);

  const postgres = new Pool({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 4,
    ssl: { rejectUnauthorized: false }
  });
  postgres.on('connect', (client) => client.on('error', () => undefined));
  postgres.on('error', () => undefined);
  const supabaseAdmin = createSupabaseClient('admin');
  const supabasePublic = createSupabaseClient('public');
  const trigger = new TriggerCredentialsService();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const accountId = randomUUID();
  const email = `planning-console-real-${suffix}@example.test`;
  const password = `Planning-Console-Real-${suffix}-A9!`;
  const createdRoleIds: string[] = [];
  let userId = '';
  let accountCreated = false;
  let browser: any;
  let activeTriggerRunId = '';
  let successRun: JsonRecord | undefined;
  let canceledRun: JsonRecord | undefined;
  let pageErrors: string[] = [];
  let failedApiResponses: string[] = [];
  let primaryError: unknown;
  let sidecarDelayEnabled = false;

  try {
    stage('checking runtime services');
    const worker = await trigger.getDevPresenceStatus();
    assert.equal(worker.connected, true, `Trigger.dev worker is not online: ${JSON.stringify(worker)}`);
    assert.equal((await health()).active, 0, 'The sidecar must be idle before the real UI E2E begins.');

    stage('creating isolated account and fixture');
    const createdUser = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Planning console real E2E' }
    });
    if (createdUser.error || !createdUser.data.user) throw createdUser.error;
    userId = createdUser.data.user.id;

    await query(postgres, `
      insert into basejump.accounts (
        id, primary_owner_user_id, name, slug, personal_account, code, status
      ) values ($1, $2, $3, $4, false, $5, 'active')
    `, [
      accountId,
      userId,
      `Planning console real E2E ${suffix}`,
      `planning-console-real-e2e-${suffix}`,
      `PCE${accountId.replace(/-/g, '').slice(0, 9)}`
    ]);
    accountCreated = true;
    await query(postgres, `
      insert into basejump.account_user (account_id, user_id, account_role)
      values ($1, $2, 'owner'::basejump.account_role)
    `, [accountId, userId]);

    const role = await query<{ id: string }>(postgres, `
      insert into public.admin_roles (code, name, status, sort_order, is_system)
      values ($1, 'Planning console real E2E', 'active', 9996, false)
      returning id
    `, [`planning_console_real_${suffix}`]);
    createdRoleIds.push(role.rows[0].id);
    await query(postgres, `
      insert into public.admin_role_permissions (role_id, permission_id)
      select $1, id from public.admin_permissions
      where code in ('planning.models.view', 'planning.models.manage') and status = 'active'
    `, [role.rows[0].id]);
    await query(postgres, `
      insert into public.admin_user_roles (user_id, role_id, account_id)
      values ($1, $2, $3)
    `, [userId, role.rows[0].id, accountId]);

    const location = await query<{ id: string }>(postgres, `
      insert into public.planning_location (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `真实验收工厂-${suffix}`]);
    const customer = await query<{ id: string }>(postgres, `
      insert into public.planning_customer (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `真实验收客户-${suffix}`]);
    const supplier = await query<{ id: string }>(postgres, `
      insert into public.planning_supplier (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `真实验收供应商-${suffix}`]);
    const item = await query<{ id: string }>(postgres, `
      insert into public.planning_item (account_id, name, type, cost, uom)
      values ($1, $2, 'make to stock', 2.5, '件') returning id
    `, [accountId, `真实验收物料-${suffix}`]);
    await query(postgres, `
      insert into public.planning_itemsupplier (
        account_id, supplier_id, item_id, location_id, leadtime, sizeminimum, priority
      ) values ($1, $2, $3, $4, interval '1 day', 1, 1)
    `, [accountId, supplier.rows[0].id, item.rows[0].id, location.rows[0].id]);
    const demand = await query<{
      deliverydate: string;
      id: string;
      plannedquantity: string;
    }>(postgres, `
      insert into public.planning_demand (
        account_id, name, customer_id, item_id, location_id, due, status,
        quantity, priority, plannedquantity, deliverydate
      ) values (
        $1, $2, $3, $4, $5, '2026-08-12T00:00:00Z', 'open', 10, 10,
        3.25, '2026-08-10T06:00:00Z'
      ) returning id, plannedquantity::text, deliverydate::text
    `, [
      accountId,
      `REAL-DEMAND-${suffix}`,
      customer.rows[0].id,
      item.rows[0].id,
      location.rows[0].id
    ]);
    const scenario = await query<{ id: string; name: string }>(postgres, `
      insert into public.planning_scenario (account_id, name, description, status)
      values ($1, $2, 'UI -> Trigger.dev -> frePPLe C++ real E2E', 'free')
      returning id, name
    `, [accountId, `真实排产场景-${suffix}`]);

    const signedIn = await supabasePublic.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error;
    const session = signedIn.data.session as unknown as JsonRecord;
    const accessToken = String(session.access_token);

    stage('opening planning console');
    const playwrightModule = await import(pathToFileURL(playwrightPath).href);
    browser = await playwrightModule.default.chromium.launch({
      executablePath: BROWSER_EXECUTABLE,
      headless: true
    });
    const context = await prepareContext(browser, session, accountId);
    try {
      const page = await context.newPage();
      pageErrors = [];
      failedApiResponses = [];
      page.on('pageerror', (error: Error) => pageErrors.push(error.message));
      page.on('response', (response: any) => {
        if (response.status() >= 400 && response.url().includes('/api/')) {
          failedApiResponses.push(`${response.status()} ${response.url()}`);
        }
      });

      await page.goto(`${FRONTEND_URL}${CONSOLE_PATH}`, { waitUntil: 'domcontentloaded' });
      await waitForConsole(page);
      await selectOption(page, 'scenarioId', scenario.rows[0].name);
      const runResponsePromise = page.waitForResponse((response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.serviceName === 'planning' && body?.serviceMethod === 'runSupplyPlan';
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      stage('starting supply plan through the UI');
      await actionButton(page, '开始排产').click();
      const runResponse = await runResponsePromise;
      const launched = unwrapServicePayload(await runResponse.json());
      assert.ok(isRecord(launched) && isRecord(launched.run));
      const successRunId = String(launched.run.id ?? '');
      assert.match(successRunId, /^[0-9a-f-]{36}$/i);
      successRun = await waitFor(
        () => readRun(postgres, accountId, successRunId),
        (state) => ['succeeded', 'failed', 'canceled'].includes(String(state.run_status)),
        120_000,
        'the UI-started planning run to finish',
        500
      );
      assert.equal(successRun.run_status, 'succeeded', JSON.stringify(successRun));
      assert.equal(successRun.version_status, 'completed');
      assert.ok(successRun.trigger_run_id);
      assert.ok(Number(successRun.operationplan_count) > 0);
      assert.ok(Number(successRun.material_count) > 0);
      assert.deepEqual(
        [
          'operationplan_count', 'material_count', 'resource_count',
          'problem_count', 'constraint_count', 'resourceplan_count'
        ].map((key) => Number(successRun?.[key])),
        [
          Number((successRun.output as JsonRecord)?.operationPlanCount),
          Number((successRun.output as JsonRecord)?.operationPlanMaterialCount),
          Number((successRun.output as JsonRecord)?.operationPlanResourceCount),
          Number((successRun.output as JsonRecord)?.problemCount),
          Number((successRun.output as JsonRecord)?.constraintCount),
          Number((successRun.output as JsonRecord)?.resourcePlanCount)
        ]
      );
      const completedTrigger = await waitFor(
        () => readTriggerRun(trigger, String(successRun?.trigger_run_id)),
        (state) => Boolean(state && !state.isQueued && !state.isExecuting && !state.isWaiting),
        60_000,
        'the successful Trigger.dev run to reach a terminal state',
        500
      );
      assert.match(String(completedTrigger?.status), /COMPLETED|SUCCESS|SUCCEEDED/i);

      stage('successful Trigger.dev and frePPLe run completed');
      await clickTab(page, '运行记录');
      await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
        .catch(() => undefined);
      await page.locator('.vxe-table--body-wrapper:visible .vxe-body--row:visible', {
        hasText: String(successRun.run_name)
      }).first().waitFor({ state: 'visible', timeout: 45_000 });
      await page.screenshot({
        path: resolve(artifactsDir, 'planning-console-real-run-succeeded.png'),
        fullPage: true
      });

      const versionRefreshPromise = page.waitForResponse((response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.serviceName === 'planning' && body?.serviceMethod === 'listPlanningConsoleVersions';
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      await actionButton(page, '刷新').click();
      await versionRefreshPromise;
      await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
        .catch(() => undefined);
      await selectOption(page, 'planVersionId', String(successRun.version_code));
      const publishResponsePromise = page.waitForResponse((response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.serviceName === 'planning' && body?.serviceMethod === 'publishPlanVersion';
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      stage('publishing completed version through the UI');
      await actionButton(page, '发布版本').click();
      const publishResponse = await publishResponsePromise;
      assert.equal(publishResponse.status(), 200);
      const published = await query<{ is_current: boolean; status: string }>(postgres, `
        select status, is_current from public.planning_plan_version
        where account_id = $1 and id = $2
      `, [accountId, successRun.version_id]);
      assert.deepEqual(published.rows[0], { is_current: true, status: 'published' });
      await assertTerminalResultGuard(
        postgres,
        accountId,
        String(successRun.version_id),
        `IMMUTABLE-${suffix}`
      );
      const baselineDemand = await query<{
        deliverydate: string;
        plannedquantity: string;
      }>(postgres, `
        select plannedquantity::text, deliverydate::text from public.planning_demand
        where account_id = $1 and id = $2
      `, [accountId, demand.rows[0].id]);
      assert.deepEqual(baselineDemand.rows[0], {
        plannedquantity: demand.rows[0].plannedquantity,
        deliverydate: demand.rows[0].deliverydate
      });
      await page.screenshot({
        path: resolve(artifactsDir, 'planning-console-real-version-published.png'),
        fullPage: true
      });

      stage('starting cancellable Trigger.dev run');
      await execFileAsync('docker', [
        'compose', '-f', resolve(repoRoot, 'infra/planning/docker-compose.yml'),
        'up', '-d', '--no-deps', '--force-recreate', 'frepple-sidecar'
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, PLANNING_SIDECAR_TEST_DELAY_SECONDS: '120' },
        maxBuffer: 1024 * 1024
      });
      sidecarDelayEnabled = true;
      await waitForUrl(`${SIDECAR_URL}/health`, 30_000);
      const secondLaunch = await serviceRequest(accessToken, accountId, 'runSupplyPlan', {
        scenarioId: scenario.rows[0].id,
        jobType: 'supply_plan',
        name: `真实取消链路-${suffix}`,
        overrides: { currentdate: CURRENT_DATE }
      });
      assert.ok(isRecord(secondLaunch) && isRecord(secondLaunch.run));
      const canceledRunId = String(secondLaunch.run.id ?? '');
      const canceledVersionId = String((secondLaunch.version as JsonRecord)?.id ?? '');
      const triggerRunId = String(secondLaunch.triggerRunId ?? '');
      assert.ok(canceledRunId && canceledVersionId && triggerRunId);
      activeTriggerRunId = triggerRunId;

      await waitFor(
        async () => ({
          active: Number((await health()).active ?? 0),
          run: await readRun(postgres, accountId, canceledRunId),
          top: await dockerTop()
        }),
        (state) => state.run.run_status === 'running' && state.active === 1 &&
          /\/usr\/bin\/frepple\s/.test(state.top),
        60_000,
        'the cancellable run to enter frePPLe C++ execution',
        100
      );

      stage('frePPLe C++ process is active; canceling through the UI');
      const unfilteredRunsResponsePromise = page.waitForResponse((response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          const postData = isRecord(body?.postData) ? body.postData : {};
          const filters = isRecord(postData.filters) ? postData.filters : {};
          return body?.serviceName === 'planning' &&
            body?.serviceMethod === 'getPlanningConsoleData' &&
            postData.dataset === 'runs' &&
            !String(filters.planVersionId ?? '').trim();
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      await (await searchFormButton(page, '重置')).click();
      const unfilteredRunsResponse = await unfilteredRunsResponsePromise;
      assert.equal(unfilteredRunsResponse.status(), 200);
      const unfilteredRuns = unwrapServicePayload(await unfilteredRunsResponse.json());
      assert.ok(
        Array.isArray(unfilteredRuns) && unfilteredRuns.some((row) =>
          isRecord(row) && row.id === canceledRunId
        ),
        'Resetting the low-code filter did not load the active run without planVersionId.'
      );
      await page.waitForFunction(({ runId }: { runId: string }) => {
        const root = document.querySelector('.lowcode-runtime-page');
        let instance = (root as (HTMLElement & { __vueParentComponent?: any }) | null)
          ?.__vueParentComponent;
        while (instance) {
          if (typeof instance.exposed?.getSnapshot === 'function') {
            const snapshot = instance.exposed.getSnapshot();
            const form = snapshot?.formModels?.planning_console_filter ?? {};
            const rows = snapshot?.runtime?.sources?.runs;
            return !String(form.planVersionId ?? '').trim() &&
              Array.isArray(rows) && rows.some((row) => row?.id === runId);
          }
          instance = instance.parent;
        }
        return false;
      }, { runId: canceledRunId }, { timeout: 45_000 });
      await clickTab(page, '运行记录');
      const cancelRow = page.locator('.vxe-table--body-wrapper:visible .vxe-body--row:visible', {
        hasText: `真实取消链路-${suffix}`
      }).first();
      await cancelRow.waitFor({ state: 'visible', timeout: 45_000 });
      await cancelRow.click();
      const cancelResponsePromise = page.waitForResponse((response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.serviceName === 'planning' && body?.serviceMethod === 'cancelPlanningRun' &&
            body?.postData?.runId === canceledRunId;
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      await actionButton(page, '取消运行').click();
      const cancelResponse = await cancelResponsePromise;
      assert.equal(cancelResponse.status(), 200);

      canceledRun = await waitFor(
        () => readRun(postgres, accountId, canceledRunId),
        (state) => state.run_status === 'canceled' && state.version_status === 'canceled',
        30_000,
        'the database cancellation state',
        250
      );
      await waitFor(
        health,
        (state) => Number(state.active ?? -1) === 0,
        15_000,
        'the sidecar process count to return to zero',
        100
      );
      assert.doesNotMatch(await dockerTop(), /\/usr\/bin\/frepple\s/);
      assert.deepEqual(
        [
          canceledRun.operationplan_count,
          canceledRun.material_count,
          canceledRun.resource_count,
          canceledRun.problem_count,
          canceledRun.constraint_count,
          canceledRun.resourceplan_count
        ].map(Number),
        [0, 0, 0, 0, 0, 0]
      );
      stage('database and sidecar cancellation verified');
      const canceledTrigger = await waitFor(
        () => readTriggerRun(trigger, triggerRunId),
        (state) => Boolean(state && !state.isQueued && !state.isExecuting && !state.isWaiting),
        60_000,
        'the canceled Trigger.dev run to reach a terminal state',
        500
      );
      assert.match(String(canceledTrigger?.status), /CANCEL/i);
      stage('Trigger.dev cancellation verified');
      activeTriggerRunId = '';
      await delay(6_000);
      const protectedState = await readRun(postgres, accountId, canceledRunId);
      assert.equal(`${protectedState.run_status}/${protectedState.version_status}`, 'canceled/canceled');
      assert.deepEqual(
        [
          protectedState.operationplan_count,
          protectedState.material_count,
          protectedState.resource_count,
          protectedState.problem_count,
          protectedState.constraint_count,
          protectedState.resourceplan_count
        ].map(Number),
        [0, 0, 0, 0, 0, 0],
        'A late worker retry wrote results after cancellation.'
      );
      await assertTerminalResultGuard(
        postgres,
        accountId,
        canceledVersionId,
        `CANCELED-IMMUTABLE-${suffix}`
      );
      await page.screenshot({
        path: resolve(artifactsDir, 'planning-console-real-run-canceled.png'),
        fullPage: true
      });
      assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('\n')}`);
      assert.deepEqual(failedApiResponses, [], `Browser failed API responses: ${failedApiResponses.join('\n')}`);
    } finally {
      await context.close();
    }

    console.log(JSON.stringify({
      uiStart: 'verified',
      successfulRun: {
        runStatus: successRun.run_status,
        versionStatus: 'published',
        triggerRunId: successRun.trigger_run_id,
        operationPlans: successRun.operationplan_count,
        operationPlanMaterials: successRun.material_count,
        sixResultFamilies: 'persisted and counted'
      },
      publication: {
        current: true,
        terminalResultsImmutable: true,
        baselineDemandUnchanged: true
      },
      runningCancellation: {
        runStatus: canceledRun?.run_status,
        versionStatus: canceledRun?.version_status,
        triggerRun: 'canceled',
        sidecarActive: 0,
        cppProcess: 'terminated',
        resultRows: 0,
        retryRevival: 'blocked'
      },
      screenshots: 3,
      pageErrors: pageErrors.length,
      failedApiResponses: failedApiResponses.length,
      cleanup: 'verified in finally'
    }, null, 2));
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    stage('cleaning isolated account');
    await browser?.close().catch(() => undefined);
    if (activeTriggerRunId) {
      const credentials = await trigger.getCredentials().catch(() => undefined);
      if (credentials) {
        const { configure, runs } = await import('@trigger.dev/sdk');
        configure({ baseURL: credentials.apiUrl, accessToken: credentials.secretKey });
        await runs.cancel(activeTriggerRunId).catch(() => undefined);
      }
      await waitFor(
        health,
        (state) => Number(state.active ?? -1) === 0,
        15_000,
        'the sidecar to stop after E2E cleanup',
        100
      ).catch(() => undefined);
    }
    if (sidecarDelayEnabled) {
      await execFileAsync('docker', [
        'compose', '-f', resolve(repoRoot, 'infra/planning/docker-compose.yml'),
        'up', '-d', '--no-deps', '--force-recreate', 'frepple-sidecar'
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, PLANNING_SIDECAR_TEST_DELAY_SECONDS: '0' },
        maxBuffer: 1024 * 1024
      }).catch(() => undefined);
      await waitForUrl(`${SIDECAR_URL}/health`, 30_000).catch(() => undefined);
    }
    if (accountCreated) {
      let accountDeleteError: unknown;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          await deleteIsolatedAccount(postgres, accountId);
          accountDeleteError = undefined;
          break;
        } catch (error) {
          accountDeleteError = error;
          await delay(250);
        }
      }
      if (accountDeleteError && !primaryError) throw accountDeleteError;
    }
    if (createdRoleIds.length) {
      await query(postgres, 'delete from public.admin_roles where id = any($1::uuid[])', [createdRoleIds])
        .catch(() => undefined);
    }
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    const residue = await query<{ count: string }>(postgres, `
      select count(*)::text as count from basejump.accounts where id = $1
    `, [accountId]).catch(() => ({ rows: [{ count: 'cleanup-query-failed' }] }));
    if (!primaryError) {
      assert.equal(residue.rows[0]?.count, '0', 'The isolated real UI E2E account was not removed.');
    }
    await postgres.end();
  }
}

async function deleteIsolatedAccount(pool: Pool, accountId: string) {
  const connection = await pool.connect();
  const guardedTables = [
    'planning_operationplan',
    'planning_operationplanmaterial',
    'planning_operationplanresource',
    'planning_problem',
    'planning_constraint',
    'planning_resourceplan'
  ];
  try {
    await connection.query('begin');
    for (const table of guardedTables) {
      await connection.query(`alter table public.${table} disable trigger ${table}_published_guard`);
    }
    await connection.query('delete from basejump.accounts where id = $1', [accountId]);
    for (const table of guardedTables) {
      await connection.query(`alter table public.${table} enable trigger ${table}_published_guard`);
    }
    await connection.query('commit');
  } catch (error) {
    await connection.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
