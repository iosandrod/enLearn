import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { createSupabaseClient } from '../src/common/utils/supabase';
import { TriggerCredentialsService } from '../src/workflow/trigger/trigger-credentials.service';
import {
  ELECTRONICS_DEMO_ACCOUNT_CODE,
  ELECTRONICS_DEMO_CURRENT_DATE,
  ELECTRONICS_DEMO_SCENARIO_NAME
} from './planning-electronics-demo.fixture';

type JsonRecord = Record<string, unknown>;

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const BROWSER_EXECUTABLE = process.env.PLANNING_UI_BROWSER ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const START_FROM_UI = process.argv.includes('--start-from-ui');
const PLAN_VERSION_ARGUMENT = process.argv.slice(2).find((argument) => !argument.startsWith('--'))?.trim();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response) {
  const text = await response.text();
  const value = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(value)}`);
  return value;
}

async function serviceRequest(
  accessToken: string,
  serviceMethod: string,
  postData: JsonRecord
) {
  const payload = await readJson(await fetch(`${API_URL}/api/service`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-account-id': ACCOUNT_ID
    },
    body: JSON.stringify({ serviceName: 'planning', serviceMethod, postData })
  }));
  return isRecord(payload) && 'data' in payload ? payload.data : payload;
}

async function waitForUrl(url: string) {
  const deadline = Date.now() + 30_000;
  let error: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      error = new Error(`HTTP ${response.status}`);
    } catch (nextError) {
      error = nextError;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw error ?? new Error(`Unable to reach ${url}.`);
}

async function clickTab(page: any, label: string) {
  const tab = page.locator('.lc-node-tabs .vxe-tabs-header--item', { hasText: label }).first();
  await tab.waitFor({ state: 'visible', timeout: 30_000 });
  await tab.click();
  await page.waitForTimeout(250);
}

async function clickInnerTab(page: any, label: string) {
  const tab = page.locator(
    '.planning-console-inner-tabs:visible .vxe-tabs-header--item',
    { hasText: label }
  ).first();
  await tab.waitFor({ state: 'visible', timeout: 30_000 });
  await tab.click();
  await page.waitForTimeout(250);
}

async function selectOption(page: any, field: string, label: string) {
  const select = page.locator(`#${field}`).first();
  await select.waitFor({ state: 'visible', timeout: 30_000 });
  await select.click();
  const option = page.locator('.vxe-select--panel:visible .vxe-select-option', { hasText: label }).first();
  await option.waitFor({ state: 'visible', timeout: 30_000 });
  await option.click();
}

async function searchFormButton(page: any, label: string) {
  const form = page.locator('#planning_console_filter').first();
  const formButton = form.getByRole('button', { name: label }).first();
  if (await formButton.count()) return formButton;
  return page.locator('.lowcode-runtime-page > .lc-runtime-block').first()
    .getByRole('button', { name: label }).first();
}

function actionButton(page: any, label: string) {
  return page.locator('.lc-node-button-group .vxe-button', { hasText: label }).first();
}

function delay(milliseconds: number) {
  return new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isTransientPostgresError(error: unknown) {
  const code = isRecord(error) ? String(error.code ?? '') : '';
  const message = error instanceof Error ? error.message : String(error);
  return ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03', '08000', '08003', '08006']
    .includes(code) || /Connection terminated unexpectedly|read ECONNRESET|connect ETIMEDOUT/i.test(message);
}

async function query<T extends Record<string, unknown>>(
  pool: Pool,
  text: string,
  values: unknown[] = []
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await pool.query<T>(text, values);
    } catch (error) {
      lastError = error;
      if (!isTransientPostgresError(error) || attempt === 19) throw error;
      await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}

type CleanupReport = {
  authUserDeleted: boolean;
  membershipDeleted: boolean;
  roleDeleted: boolean;
  run?: {
    cancellationRequested: boolean;
    id: string;
    resultRows: number;
    runStatus: string;
    triggerStatus: string;
    triggerRunId: string;
    versionStatus: string;
  };
};

async function readRunCleanupState(pool: Pool, runId: string) {
  const state = await query<{
    result_rows: number;
    run_status: string;
    trigger_run_id: string | null;
    version_status: string;
  }>(pool, `
    select
      run.status as run_status,
      run.trigger_run_id,
      version.status as version_status,
      (
        (select count(*) from public.planning_operationplan
          where account_id = run.account_id and plan_version_id = version.id) +
        (select count(*) from public.planning_operationplanmaterial
          where account_id = run.account_id and plan_version_id = version.id) +
        (select count(*) from public.planning_operationplanresource
          where account_id = run.account_id and plan_version_id = version.id) +
        (select count(*) from public.planning_resourceplan
          where account_id = run.account_id and plan_version_id = version.id) +
        (select count(*) from public.planning_problem
          where account_id = run.account_id and plan_version_id = version.id) +
        (select count(*) from public.planning_constraint
          where account_id = run.account_id and plan_version_id = version.id)
      )::int as result_rows
    from public.planning_run run
    join public.planning_plan_version version
      on version.account_id = run.account_id and version.run_id = run.id
    where run.account_id = $1 and run.id = $2
  `, [ACCOUNT_ID, runId]);
  return state.rows[0];
}

async function waitForCanceledRun(pool: Pool, runId: string) {
  const deadline = Date.now() + 30_000;
  let latest = await readRunCleanupState(pool, runId);
  while (Date.now() < deadline && latest &&
    (latest.run_status !== 'canceled' || latest.version_status !== 'canceled')) {
    await delay(250);
    latest = await readRunCleanupState(pool, runId);
  }
  return latest;
}

async function waitForCanceledTrigger(triggerRunId: string) {
  if (!triggerRunId) return '';
  const trigger = new TriggerCredentialsService();
  const credentials = await trigger.getCredentials();
  const deadline = Date.now() + 60_000;
  let latest = await trigger.getRun(credentials.environmentId, triggerRunId);
  while (Date.now() < deadline && (latest.isQueued || latest.isExecuting || latest.isWaiting)) {
    await delay(500);
    latest = await trigger.getRun(credentials.environmentId, triggerRunId);
  }
  return String(latest.status ?? '');
}

async function deleteAuthUser(admin: ReturnType<typeof createSupabaseClient>, userId: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (!deleted.error) return;
      lastError = deleted.error;
    } catch (error) {
      lastError = error;
    }
    await delay(250 * (attempt + 1));
  }
  throw lastError ?? new Error(`Unable to delete smoke-test auth user ${userId}.`);
}

async function cleanupDatabaseSubject(
  pool: Pool,
  text: string,
  values: unknown[],
  description: string
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await query(pool, text, values);
      return;
    } catch (error) {
      lastError = error;
      await delay(250 * (attempt + 1));
    }
  }
  throw new Error(
    `Unable to clean ${description}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function main() {
  if (!PLAN_VERSION_ARGUMENT && !START_FROM_UI) {
    throw new Error(
      'Usage: tsx scripts/smoke-electronics-planning-console.ts <plan-version-id> | --start-from-ui'
    );
  }
  if (!existsSync(BROWSER_EXECUTABLE)) throw new Error(`Browser executable not found: ${BROWSER_EXECUTABLE}`);
  await Promise.all([
    waitForUrl(FRONTEND_URL),
    waitForUrl(`${API_URL}/api/auth/account-options?login=admin`)
  ]);

  const env = getEnv();
  const connectionString = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!connectionString) throw new Error('DATABASE_URL or DIRECT_URL is required.');
  const pool = new Pool({
    connectionString: normalizePostgresConnectionString(connectionString),
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 4,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('connect', (client) => client.on('error', () => undefined));
  pool.on('error', () => undefined);
  const admin = createSupabaseClient('admin');
  const auth = createSupabaseClient('public');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `electronics-console-${suffix}@example.test`;
  const password = `Electronics-Console-${suffix}-A9!`;
  const roleId = randomUUID();
  let userId = '';
  let browser: any;
  let planVersionId = PLAN_VERSION_ARGUMENT ?? '';
  let versionCode = '';
  let uiStartedRunId = '';
  let accessToken = '';
  let primaryError: unknown;
  const cleanup: CleanupReport = {
    authUserDeleted: false,
    membershipDeleted: false,
    roleDeleted: false
  };
  const repoRoot = resolve(process.cwd().toLowerCase().endsWith('api') ? '..' : '.');
  const artifacts = resolve(repoRoot, 'artifacts');
  await mkdir(artifacts, { recursive: true });

  try {
    const account = await pool.query<{ code: string; name: string }>(`
      select code, name from basejump.accounts where id = $1 and status = 'active'
    `, [ACCOUNT_ID]);
    assert.equal(account.rows[0]?.code, ELECTRONICS_DEMO_ACCOUNT_CODE);
    const scenario = await pool.query<{ id: string }>(`
      select id from public.planning_scenario
      where account_id = $1 and name = $2
    `, [ACCOUNT_ID, ELECTRONICS_DEMO_SCENARIO_NAME]);
    const demoScenarioId = scenario.rows[0]?.id;
    assert.match(demoScenarioId ?? '', /^[0-9a-f-]{36}$/i);

    if (planVersionId) {
      const version = await pool.query<{ code: string; scenario_name: string; status: string }>(`
        select version.status, scenario.name as scenario_name, version.code
        from public.planning_plan_version version
        join public.planning_scenario scenario
          on scenario.account_id = version.account_id and scenario.id = version.scenario_id
        where version.account_id = $1 and version.id = $2
      `, [ACCOUNT_ID, planVersionId]);
      assert.equal(version.rows[0]?.scenario_name, ELECTRONICS_DEMO_SCENARIO_NAME);
      assert.ok(['completed', 'published'].includes(version.rows[0]?.status ?? ''));
      versionCode = String(version.rows[0]?.code ?? '');
      assert.ok(versionCode);
    }

    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error;
    userId = created.data.user.id;
    await pool.query(`
      insert into basejump.account_user (account_id, user_id, account_role)
      values ($1, $2, 'member'::basejump.account_role)
      on conflict (account_id, user_id) do nothing
    `, [ACCOUNT_ID, userId]);
    await pool.query(`
      insert into public.admin_roles (id, code, name, status, sort_order, is_system)
      values ($1, $2, '电子制造控制台验收', 'active', 9998, false)
    `, [roleId, `electronics_console_${suffix.replace(/[^a-z0-9]/gi, '_')}`]);
    await pool.query(`
      insert into public.admin_role_permissions (role_id, permission_id)
      select $1, id from public.admin_permissions
      where code in ('planning.models.view', 'planning.models.manage') and status = 'active'
    `, [roleId]);
    await pool.query(`
      insert into public.admin_user_roles (user_id, role_id, account_id)
      values ($1, $2, $3)
    `, [userId, roleId, ACCOUNT_ID]);

    const signedIn = await auth.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error;
    const session = signedIn.data.session;
    accessToken = session.access_token;

    const loadExpected = async () => ({
      bom: await serviceRequest(accessToken, 'getPlanningConsoleData', {
        dataset: 'bom',
        filters: { itemId: (await pool.query<{ id: string }>(`
          select id from public.planning_item where account_id = $1 and name = 'FG-CTRL-100'
        `, [ACCOUNT_ID])).rows[0].id }
      }),
      constraints: await serviceRequest(accessToken, 'getPlanningConsoleData', {
        dataset: 'constraints', filters: { planVersionId }
      }),
      flow: await serviceRequest(accessToken, 'getPlanningConsoleData', {
        dataset: 'flow', filters: {}
      }),
      operationPlans: await serviceRequest(accessToken, 'getPlanningConsoleData', {
        dataset: 'operationPlans', filters: { planVersionId }
      }),
      materials: await serviceRequest(accessToken, 'getPlanningConsoleData', {
        dataset: 'materials', filters: { planVersionId }
      }),
      planResources: await serviceRequest(accessToken, 'getPlanningConsoleData', {
        dataset: 'planResources', filters: { planVersionId }
      }),
      problems: await serviceRequest(accessToken, 'getPlanningConsoleData', {
        dataset: 'problems', filters: { planVersionId }
      }),
      resourcePlans: await serviceRequest(accessToken, 'getPlanningConsoleData', {
        dataset: 'resourcePlans', filters: { planVersionId }
      })
    });
    const rows = (value: unknown) => Array.isArray(value) ? value : [];

    const playwrightPath = resolve(
      repoRoot,
      'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js'
    );
    const playwright = await import(pathToFileURL(playwrightPath).href);
    browser = await playwright.default.chromium.launch({
      executablePath: BROWSER_EXECUTABLE,
      headless: true
    });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addInitScript(({ token, refreshToken }: { token: string; refreshToken: string }) => {
      window.localStorage.setItem('enlearn_access_token', token);
      window.localStorage.setItem('enlearn_refresh_token', refreshToken);
      window.localStorage.setItem('enlearn_active_account_id', '00000000-0000-4000-8000-000000000001');
      window.sessionStorage.setItem('enlearn_dev_auto_login_disabled', '1');
    }, { token: accessToken, refreshToken: session.refresh_token });

    const page = await context.newPage();
    const pageErrors: string[] = [];
    const failedApiResponses: string[] = [];
    const planningServiceRequests: string[] = [];
    page.on('pageerror', (error: Error) => pageErrors.push(error.message));
    page.on('request', (request: any) => {
      if (!request.url().endsWith('/api/service') || request.method() !== 'POST') return;
      try {
        const body = request.postDataJSON();
        if (body?.serviceName === 'planning') planningServiceRequests.push(String(body.serviceMethod ?? ''));
      } catch {
        // Ignore non-JSON service requests in diagnostics.
      }
    });
    page.on('response', (response: any) => {
      if (response.status() >= 400 && response.url().includes('/api/')) {
        failedApiResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(`${FRONTEND_URL}/dashboard/advanced/planning-console`, {
      waitUntil: 'domcontentloaded'
    });
    await page.locator('.admin-shell').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('.lc-node-tabs').first().waitFor({ state: 'visible', timeout: 30_000 });
    const scenarioRefreshPromise = page.waitForResponse((response: any) => {
      if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
      try {
        const body = response.request().postDataJSON();
        return body?.serviceName === 'planning' &&
          body?.serviceMethod === 'listPlanningConsoleVersions' &&
          body?.postData?.scenarioId === demoScenarioId;
      } catch {
        return false;
      }
    }, { timeout: 45_000 });
    await selectOption(page, 'scenarioId', ELECTRONICS_DEMO_SCENARIO_NAME);
    await scenarioRefreshPromise;
    await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
      .catch(() => undefined);
    if (START_FROM_UI) {
      const capabilities = await serviceRequest(accessToken, 'getRuntimeCapabilities', {}) as JsonRecord;
      assert.equal(capabilities.canManage, true);
      assert.equal((capabilities.engine as JsonRecord | undefined)?.available, true);
      assert.equal((capabilities.trigger as JsonRecord | undefined)?.configured, true);
      assert.equal((capabilities.worker as JsonRecord | undefined)?.online, true);
      await page.locator('.lc-stat-card', { hasText: 'Worker 在线' }).first()
        .waitFor({ state: 'visible', timeout: 45_000 });
      const runResponsePromise = page.waitForResponse((response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.serviceName === 'planning' && body?.serviceMethod === 'runSupplyPlan';
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      const runButton = actionButton(page, '开始排产');
      await runButton.waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForFunction(() => {
        const buttons = [...document.querySelectorAll('.lc-node-button-group .vxe-button')];
        const button = buttons.find((candidate) => candidate.textContent?.includes('开始排产'));
        return Boolean(button && !button.classList.contains('is--disabled') &&
          button.getAttribute('aria-disabled') !== 'true');
      }, undefined, { timeout: 45_000 });
      const runButtonState = await runButton.evaluate((button: HTMLElement) => ({
        ariaDisabled: button.getAttribute('aria-disabled'),
        classes: button.className,
        disabled: (button as HTMLButtonElement).disabled,
        html: button.outerHTML,
        text: button.innerText
      }));
      await runButton.click();
      await Promise.race([
        runResponsePromise.then(() => undefined),
        page.locator('.lowcode-runtime-page > .lc-error').first()
          .waitFor({ state: 'visible', timeout: 45_000 })
          .then(async () => {
            throw new Error(`Planning button script failed: ${await page.locator('.lowcode-runtime-page > .lc-error').first().innerText()}`);
          })
      ]);
      const runResponse = await runResponsePromise.catch((error: unknown) => {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; ` +
          `run button: ${JSON.stringify(runButtonState)}; ` +
          `planning service requests: ${JSON.stringify(planningServiceRequests)}; ` +
          `page errors: ${JSON.stringify(pageErrors)}; failed APIs: ${JSON.stringify(failedApiResponses)}`
        );
      });
      const launchedPayload = await runResponse.json();
      const launched = isRecord(launchedPayload) && 'data' in launchedPayload
        ? launchedPayload.data
        : launchedPayload;
      assert.ok(isRecord(launched) && isRecord(launched.run) && isRecord(launched.version));
      uiStartedRunId = String(launched.run.id ?? '');
      planVersionId = String(launched.version.id ?? '');
      versionCode = String(launched.version.code ?? '');
      assert.match(uiStartedRunId, /^[0-9a-f-]{36}$/i);
      assert.match(planVersionId, /^[0-9a-f-]{36}$/i);
      assert.ok(versionCode);

      const deadline = Date.now() + 180_000;
      let runState: { run_status: string; version_status: string } | undefined;
      while (Date.now() < deadline) {
        const state = await query<{ run_status: string; version_status: string }>(pool, `
          select run.status as run_status, version.status as version_status
          from public.planning_run run
          join public.planning_plan_version version
            on version.account_id = run.account_id and version.run_id = run.id
          where run.account_id = $1 and run.id = $2
        `, [ACCOUNT_ID, uiStartedRunId]);
        runState = state.rows[0];
        if (['succeeded', 'failed', 'canceled'].includes(runState?.run_status ?? '')) break;
        await delay(500);
      }
      assert.deepEqual(runState, { run_status: 'succeeded', version_status: 'completed' });

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
    }
    await selectOption(page, 'planVersionId', versionCode);
    await (await searchFormButton(page, '应用筛选')).click();
    await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
      .catch(() => undefined);

    const expected = await loadExpected();
    const operationPlans = rows(expected.operationPlans) as JsonRecord[];
    const operationPlanTypes = operationPlans.reduce<Record<string, number>>((counts, row) => {
      const type = String(row.type ?? '');
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {});
    assert.deepEqual(operationPlanTypes, {
      DLVR: 3,
      DO: 82,
      MO: 16,
      PO: 1,
      STCK: 18,
      WO: 56
    });
    assert.equal(operationPlans.length, 176);
    assert.equal(rows(expected.materials).length, 294);
    assert.equal(rows(expected.planResources).length, 138);
    assert.equal(rows(expected.resourcePlans).length, 944);
    assert.equal(rows(expected.problems).length, 8);
    assert.equal(rows(expected.constraints).length, 10);
    assert.ok(isRecord(expected.flow) && rows(expected.flow.nodes).length === 18);
    assert.equal(rows(expected.bom).length, 1);

    await clickTab(page, '排产甘特');
    const ganttTasks = page.locator('.lc-planning-gantt__chart .wx-bar.wx-task');
    await ganttTasks.first().waitFor({ state: 'visible', timeout: 45_000 });
    const ganttCount = await ganttTasks.count();
    assert.ok(ganttCount >= 14, `Expected manufacturing Gantt rows, got ${ganttCount}.`);
    const ganttText = await page.locator('.lc-planning-gantt__chart').innerText();
    assert.match(ganttText, /RES-/);
    assert.doesNotMatch(ganttText, /01-01-1971|1968年/);
    await page.screenshot({ path: resolve(artifacts, 'electronics-planning-gantt.png'), fullPage: true });

    await clickTab(page, '工艺路线');
    const flow = page.locator('.lc-planning-flow').first();
    await flow.locator('.vue-flow__node').first().waitFor({ state: 'visible', timeout: 45_000 });
    const flowNodes = await flow.locator('.vue-flow__node').count();
    const flowEdges = await flow.locator('.vue-flow__edge').count();
    assert.ok(flowNodes >= 18);
    assert.ok(flowEdges >= 14);
    await page.screenshot({ path: resolve(artifacts, 'electronics-planning-routing.png'), fullPage: true });

    await clickTab(page, '工艺 BOM');
    const bom = page.locator('.lc-planning-bom').first();
    await bom.locator('.vue-flow__node').first().waitFor({ state: 'visible', timeout: 45_000 });
    const bomNodes = await bom.locator('.vue-flow__node').count();
    const bomEdges = await bom.locator('.vue-flow__edge').count();
    assert.ok(bomNodes >= 20);
    assert.ok(bomEdges >= bomNodes - 1);
    await page.screenshot({ path: resolve(artifacts, 'electronics-planning-bom.png'), fullPage: true });

    await clickTab(page, '物料与资源');
    await clickInnerTab(page, '计划资源分配');
    await page.locator('.planning-console-supply-tabs:visible .vxe-table--body-wrapper:visible', {
      hasText: 'RES-AGING-01'
    }).first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    await clickInnerTab(page, '资源负荷');
    await page.locator('.planning-console-supply-tabs:visible .vxe-table--body-wrapper:visible', {
      hasText: 'RES-AGING-01'
    }).first()
      .waitFor({ state: 'visible', timeout: 45_000 });

    await clickTab(page, '问题与约束');
    await page.getByText('material shortage', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    await clickInnerTab(page, '需求约束');
    await page.getByText('overload', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    await page.screenshot({ path: resolve(artifacts, 'electronics-planning-diagnostics.png'), fullPage: true });

    if (START_FROM_UI) {
      const publishResponsePromise = page.waitForResponse((response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.serviceName === 'planning' && body?.serviceMethod === 'publishPlanVersion';
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      await actionButton(page, '发布版本').click();
      assert.equal((await publishResponsePromise).status(), 200);
      const published = await query<{ is_current: boolean; status: string }>(pool, `
        select status, is_current from public.planning_plan_version
        where account_id = $1 and id = $2
      `, [ACCOUNT_ID, planVersionId]);
      assert.deepEqual(published.rows[0], { is_current: true, status: 'published' });
    }

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedApiResponses, []);
    console.log(JSON.stringify({
      accountCode: ELECTRONICS_DEMO_ACCOUNT_CODE,
      currentDate: ELECTRONICS_DEMO_CURRENT_DATE,
      planVersionId,
      uiStartedRunId: uiStartedRunId || undefined,
      uiStart: START_FROM_UI ? 'verified' : 'not requested',
      publication: START_FROM_UI ? 'published through UI' : 'pre-existing version',
      api: {
        operationPlans: operationPlans.length,
        operationPlanTypes,
        materials: rows(expected.materials).length,
        planResources: rows(expected.planResources).length,
        resourcePlans: rows(expected.resourcePlans).length,
        problems: rows(expected.problems).length,
        constraints: rows(expected.constraints).length
      },
      ui: { ganttCount, flowNodes, flowEdges, bomNodes, bomEdges },
      screenshots: [
        'electronics-planning-gantt.png',
        'electronics-planning-routing.png',
        'electronics-planning-bom.png',
        'electronics-planning-diagnostics.png'
      ]
    }));
    await context.close();
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (uiStartedRunId) {
      const before = await readRunCleanupState(pool, uiStartedRunId).catch(() => undefined);
      let cancellationRequested = false;
      if (before && ['queued', 'running'].includes(before.run_status) && accessToken) {
        await serviceRequest(accessToken, 'cancelPlanningRun', { runId: uiStartedRunId });
        cancellationRequested = true;
      }
      const terminal = cancellationRequested
        ? await waitForCanceledRun(pool, uiStartedRunId)
        : before;
      const triggerRunId = String(terminal?.trigger_run_id ?? '');
      const triggerStatus = cancellationRequested
        ? await waitForCanceledTrigger(triggerRunId)
        : '';
      cleanup.run = {
        cancellationRequested,
        id: uiStartedRunId,
        resultRows: Number(terminal?.result_rows ?? 0),
        runStatus: String(terminal?.run_status ?? ''),
        triggerRunId,
        triggerStatus,
        versionStatus: String(terminal?.version_status ?? '')
      };
      if (cancellationRequested) {
        assert.equal(cleanup.run.runStatus, 'canceled');
        assert.equal(cleanup.run.versionStatus, 'canceled');
        assert.equal(cleanup.run.resultRows, 0);
        if (triggerRunId) assert.match(triggerStatus, /CANCEL/i);
      }
    }
    if (userId) {
      await cleanupDatabaseSubject(
        pool,
        'delete from basejump.account_user where account_id = $1 and user_id = $2',
        [ACCOUNT_ID, userId],
        `account membership ${userId}`
      );
      cleanup.membershipDeleted = true;
    }
    await cleanupDatabaseSubject(
      pool,
      'delete from public.admin_roles where id = $1',
      [roleId],
      `role ${roleId}`
    );
    cleanup.roleDeleted = true;
    if (userId) {
      await deleteAuthUser(admin, userId);
      cleanup.authUserDeleted = true;
    }
    const residue = await query<{
      memberships: string;
      roles: string;
      users: string;
    }>(pool, `
      select
        (select count(*)::text from basejump.account_user
          where account_id = $1 and user_id = nullif($2, '')::uuid) as memberships,
        (select count(*)::text from public.admin_roles where id = $3) as roles,
        (select count(*)::text from auth.users where id = nullif($2, '')::uuid) as users
    `, [ACCOUNT_ID, userId, roleId]);
    const cleanupVerified = residue.rows[0] ?? { memberships: '0', roles: '0', users: '0' };
    if (!primaryError) {
      assert.deepEqual(cleanupVerified, { memberships: '0', roles: '0', users: '0' });
    }
    console.log(JSON.stringify({ cleanup, residue: cleanupVerified }));
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
