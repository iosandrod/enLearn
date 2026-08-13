import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

type TestIdentity = {
  auth: JsonRecord;
  email: string;
  userId: string;
};

type Fixture = {
  completedRunId: string;
  finishedItemId: string;
  finishedItemName: string;
  queuedRunId: string;
  queuedRunName: string;
  scenarioId: string;
  scenarioName: string;
  versionId: string;
};

type DatasetTiming = {
  durationMs: number;
  status: number;
};

const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const BROWSER_EXECUTABLE = process.env.PLANNING_UI_BROWSER ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const GANTT_ONLY = process.env.PLANNING_GANTT_ONLY === '1';
const CONSOLE_PATH = '/dashboard/advanced/planning-console';
const TAB_LABELS = [
  '排产总览',
  '排产甘特',
  '工艺路线',
  '工艺 BOM',
  '需求与计划单',
  '物料与资源',
  '问题与约束',
  '运行记录'
];

function directProjectConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
  if (match && url.hostname.includes('.pooler.supabase.com')) {
    url.hostname = `db.${match[1]}.supabase.co`;
    url.port = '5432';
    url.username = 'postgres';
  }
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
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }
  return payload;
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
    await new Promise((done) => setTimeout(done, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function signIn(email: string, password: string, accountId: string) {
  const payload = await readJson(await fetch(`${API_URL}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, accountId })
  }));
  assert.ok(isRecord(payload), 'Sign-in returned an invalid payload.');
  return payload;
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

function accessToken(auth: JsonRecord) {
  const session = isRecord(auth.session) ? auth.session : {};
  const token = typeof session.access_token === 'string' ? session.access_token : '';
  assert.ok(token, 'The signed-in session is missing an access token.');
  return token;
}

async function prepareContext(browser: any, identity: TestIdentity, accountId: string, viewport: {
  width: number;
  height: number;
}) {
  const context = await browser.newContext({ viewport });
  const session = isRecord(identity.auth.session) ? identity.auth.session : {};
  const token = accessToken(identity.auth);
  const refreshToken = typeof session.refresh_token === 'string' ? session.refresh_token : '';
  await context.addInitScript(
    ({ accessToken: value, refreshToken: refresh, activeAccountId }: Record<string, string>) => {
      window.localStorage.setItem('enlearn_access_token', value);
      if (refresh) window.localStorage.setItem('enlearn_refresh_token', refresh);
      window.localStorage.setItem('enlearn_active_account_id', activeAccountId);
      window.sessionStorage.setItem('enlearn_dev_auto_login_disabled', '1');
    },
    { accessToken: token, refreshToken, activeAccountId: accountId }
  );
  return context;
}

async function waitForDashboard(page: any) {
  await page.locator('.admin-shell').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
    .catch(() => undefined);
}

async function waitForConsole(page: any) {
  await waitForDashboard(page);
  await page.locator('.admin-tab', { hasText: '排产控制台' }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.lc-node-tabs').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
    .catch(() => undefined);
}

function actionButton(page: any, label: string) {
  return page.locator('.lc-node-button-group .vxe-button', { hasText: label }).first();
}

async function clickTab(page: any, label: string) {
  const tab = page.locator('.lc-node-tabs .vxe-tabs-header--item', { hasText: label }).first();
  await tab.waitFor({ state: 'attached', timeout: 15_000 });
  await tab.scrollIntoViewIfNeeded();
  await tab.waitFor({ state: 'visible', timeout: 15_000 });
  await tab.click();
  await page.waitForTimeout(180);
}

async function clickInnerTab(page: any, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tab = page.locator(
    '.planning-console-inner-tabs:visible .vxe-tabs-header--item',
    { hasText: new RegExp(`^\\s*${escapedLabel}\\s*$`) }
  ).first();
  await tab.waitFor({ state: 'visible', timeout: 15_000 });
  await tab.click();
  await page.waitForTimeout(180);
}

async function insertDesignerMaterial(page: any, label: string) {
  const material = page.locator(`.left-aside [data-label="${label}"]`).first();
  const dropZone = page.locator('.simulator-drop-zone').first();
  await material.waitFor({ state: 'visible', timeout: 15_000 });
  await dropZone.waitFor({ state: 'visible', timeout: 15_000 });
  await material.dragTo(dropZone);
  await dropZone.locator('[data-label]', { hasText: label }).first()
    .waitFor({ state: 'visible', timeout: 15_000 });
}

async function assertTabHitTarget(page: any, label: string) {
  const tab = page.locator('.lc-node-tabs .vxe-tabs-header--item', { hasText: label }).first();
  await tab.scrollIntoViewIfNeeded();
  const metrics = await tab.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const hitElements = document.elementsFromPoint(x, y).slice(0, 8);
    const runtime = document.querySelector('.lowcode-runtime-page');

    return {
      clickable: hitElements.some((candidate) => candidate === element || element.contains(candidate)),
      hitElements: hitElements.map((candidate) => ({
        className: candidate.className,
        tagName: candidate.tagName,
        text: candidate.textContent?.trim().slice(0, 80) ?? ''
      })),
      point: { x, y },
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      runtimeChildren: runtime
        ? [...runtime.children].map((candidate) => {
            const childRect = candidate.getBoundingClientRect();
            return {
              className: candidate.className,
              tagName: candidate.tagName,
              text: candidate.textContent?.trim().slice(0, 80) ?? '',
              rect: {
                left: childRect.left,
                top: childRect.top,
                right: childRect.right,
                bottom: childRect.bottom
              }
            };
          })
        : []
    };
  });
  assert.ok(metrics.clickable, `The ${label} tab is covered by another block: ${JSON.stringify(metrics)}`);
}

function visibleRow(page: any, text: string) {
  return page.locator('.vxe-table--body-wrapper:visible .vxe-body--row:visible', { hasText: text }).first();
}

async function readPlanningConsoleRuntime(page: any) {
  return page.locator('.lowcode-runtime-page').first().evaluate((element: HTMLElement) => {
    let instance = (element as HTMLElement & {
      __vueParentComponent?: {
        exposed?: { getSnapshot?: () => unknown };
        parent?: unknown;
      };
    }).__vueParentComponent;

    while (instance) {
      if (typeof instance.exposed?.getSnapshot === 'function') {
        return instance.exposed.getSnapshot();
      }
      instance = instance.parent as typeof instance;
    }

    return undefined;
  });
}

async function readVisibleGridRows(page: any) {
  return page.locator('.lc-grid:visible').evaluateAll((elements: HTMLElement[]) =>
    elements.map((element) => {
      const instance = (element as HTMLElement & {
        __vueParentComponent?: { props?: { rows?: unknown } };
      }).__vueParentComponent;
      return Array.isArray(instance?.props?.rows) ? instance.props.rows : [];
    })
  );
}

async function selectOption(page: any, fieldName: string, label: string) {
  const select = page.locator(`#${fieldName}`).first();
  await select.waitFor({ state: 'visible', timeout: 15_000 });
  await select.click();
  const option = page.locator('.vxe-select--panel:visible .vxe-select-option', { hasText: label }).first();
  await option.waitFor({ state: 'visible', timeout: 15_000 });
  await option.click();
}

async function selectedOptionValue(page: any, fieldName: string) {
  return page.locator(`#${fieldName}`).first().evaluate((element: HTMLElement) => {
    const input = element.matches('input') ? element : element.querySelector('input');
    return input instanceof HTMLInputElement ? input.value : '';
  });
}

async function searchFormButton(page: any, label: string) {
  const form = page.locator('#planning_console_filter').first();
  const formButton = form.getByRole('button', { name: label }).first();
  if (await formButton.count()) return formButton;
  return page.locator('.lowcode-runtime-page > .lc-runtime-block').first()
    .getByRole('button', { name: label }).first();
}

async function statValue(page: any, label: string) {
  const card = page.locator('.lc-stat-card', { hasText: label }).first();
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  return (await card.innerText()).split(/\r?\n/).map((value: string) => value.trim()).filter(Boolean).join(' ');
}

async function assertRootFitsViewport(page: any) {
  const measurements = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    topbarBottom: document.querySelector('.admin-topbar')?.getBoundingClientRect().bottom ?? 0,
    bodyTop: document.querySelector('.admin-body')?.getBoundingClientRect().top ?? 0
  }));
  assert.ok(
    measurements.document <= measurements.viewport + 2,
    `Document overflows the viewport: ${JSON.stringify(measurements)}`
  );
  assert.ok(
    measurements.body <= measurements.viewport + 2,
    `Body overflows the viewport: ${JSON.stringify(measurements)}`
  );
  assert.ok(
    measurements.bodyTop + 1 >= measurements.topbarBottom,
    `The top bar overlaps the application body: ${JSON.stringify(measurements)}`
  );
}

async function clickFirstGanttTask(page: any) {
  const task = page.locator('.lc-planning-gantt__chart .wx-bar.wx-task').first();
  await task.waitFor({ state: 'visible', timeout: 30_000 });
  await task.click();
}

async function seedFixture(client: Client, accountId: string, suffix: string): Promise<Fixture> {
  const location = await client.query<{ id: string }>(`
    insert into public.planning_location (account_id, name, description)
    values ($1, $2, '排产控制台隔离验收地点') returning id
  `, [accountId, `总装工厂-${suffix}`]);
  const locationId = location.rows[0].id;

  const customer = await client.query<{ id: string }>(`
    insert into public.planning_customer (account_id, name, description)
    values ($1, $2, '排产控制台隔离验收客户') returning id
  `, [accountId, `华东客户-${suffix}`]);
  const customerId = customer.rows[0].id;

  const itemRows = await client.query<{ display_name: string; id: string; name: string }>(`
    insert into public.planning_item (
      account_id, name, display_name, description, type, cost, uom
    )
    values
      ($1, $2, $2, '原材料卷料', 'make to stock', 6, 'kg'),
      ($1, $3, $3, '切割组件', 'make to stock', 12, '件'),
      ($1, $4, $4, '装配半成品', 'make to stock', 35, '件'),
      ($1, $5, $5, '包装辅料', 'make to stock', 2, '套'),
      ($1, $6, $6, '控制台验收产成品', 'make to stock', 88, '台')
    returning id, name, display_name
  `, [
    accountId,
    `原料钢卷-${suffix}`,
    `切割组件-${suffix}`,
    `装配半成品-${suffix}`,
    `包装辅料-${suffix}`,
    `智能终端-${suffix}`
  ]);
  const [rawItem, componentItem, subassemblyItem, packagingItem, finishedItem] = itemRows.rows;

  const resourceRows = await client.query<{ id: string; name: string }>(`
    insert into public.planning_resource (
      account_id, name, description, type, constrained, maximum, location_id, efficiency
    ) values
      ($1, $2, '激光切割工作中心', 'default', true, 8, $5, 100),
      ($1, $3, '人工装配工作中心', 'default', true, 8, $5, 100),
      ($1, $4, '终检包装工作中心', 'default', true, 8, $5, 100)
    returning id, name
  `, [accountId, `激光切割线-${suffix}`, `总装线-${suffix}`, `终检包装线-${suffix}`, locationId]);
  const [cutResource, assemblyResource, packResource] = resourceRows.rows;

  const operationRows = await client.query<{ id: string; name: string }>(`
    insert into public.planning_operation (
      account_id, name, type, description, item_id, location_id, priority, duration,
      sizeminimum, cost
    ) values
      ($1, $2, 'fixed_time', '下料并切割原材料', $5, $8, 10, interval '2 hours', 1, 8),
      ($1, $3, 'fixed_time', '组件装配为半成品', $6, $8, 20, interval '3 hours', 1, 16),
      ($1, $4, 'fixed_time', '终检并完成包装', $7, $8, 30, interval '2 hours', 1, 12)
    returning id, name
  `, [
    accountId,
    `10-激光切割-${suffix}`,
    `20-组件装配-${suffix}`,
    `30-终检包装-${suffix}`,
    componentItem.id,
    subassemblyItem.id,
    finishedItem.id,
    locationId
  ]);
  const [cutOperation, assemblyOperation, packOperation] = operationRows.rows;

  await client.query(`
    insert into public.planning_operationmaterial (
      account_id, operation_id, item_id, location_id, quantity, type, name, priority
    ) values
      ($1, $2, $5, $8, -2, 'start', '钢卷投入', 10),
      ($1, $2, $6, $8, 1, 'end', '切割组件产出', 11),
      ($1, $3, $6, $8, -1, 'start', '切割组件投入', 20),
      ($1, $3, $7, $8, 1, 'end', '半成品产出', 21),
      ($1, $4, $7, $8, -1, 'start', '半成品投入', 30),
      ($1, $4, $9, $8, -1, 'start', '包装辅料投入', 31),
      ($1, $4, $10, $8, 1, 'end', '成品产出', 32)
  `, [
    accountId,
    cutOperation.id,
    assemblyOperation.id,
    packOperation.id,
    rawItem.id,
    componentItem.id,
    subassemblyItem.id,
    locationId,
    packagingItem.id,
    finishedItem.id
  ]);

  await client.query(`
    insert into public.planning_buffer (
      account_id, item_id, location_id, batch, type, onhand, minimum, description
    ) values
      ($1, $2, $7, '', 'default', 100, 20, '钢卷库存'),
      ($1, $3, $7, '', 'default', 0, 0, '切割组件缓冲'),
      ($1, $4, $7, '', 'default', 0, 0, '半成品缓冲'),
      ($1, $5, $7, '', 'default', 100, 10, '包装辅料库存'),
      ($1, $6, $7, '', 'default', 0, 0, '成品缓冲')
  `, [
    accountId,
    rawItem.id,
    componentItem.id,
    subassemblyItem.id,
    packagingItem.id,
    finishedItem.id,
    locationId
  ]);

  await client.query(`
    insert into public.planning_operationresource (
      account_id, operation_id, resource_id, quantity, priority, setup
    ) values
      ($1, $2, $5, 1, 10, 'CUT-A'),
      ($1, $3, $6, 1, 20, 'ASM-A'),
      ($1, $4, $7, 1, 30, 'PACK-A')
  `, [
    accountId,
    cutOperation.id,
    assemblyOperation.id,
    packOperation.id,
    cutResource.id,
    assemblyResource.id,
    packResource.id
  ]);

  await client.query(`
    insert into public.planning_operation_dependency (
      account_id, operation_id, blockedby_id, quantity, safety_leadtime
    ) values
      ($1, $3, $2, 1, interval '30 minutes'),
      ($1, $4, $3, 1, interval '1 hour')
  `, [accountId, cutOperation.id, assemblyOperation.id, packOperation.id]);

  const demand = await client.query<{ id: string; name: string }>(`
    insert into public.planning_demand (
      account_id, name, description, customer_id, item_id, location_id, due,
      status, operation_id, quantity, priority, maxlateness, source_type, source_system
    ) values (
      $1, $2, '隔离 UI 验收需求', $3, $4, $5, '2026-08-11T12:00:00Z',
      'open', $6, 10, 10, interval '3 days', 'manual', 'ui-smoke'
    ) returning id, name
  `, [
    accountId,
    `DEMAND-UI-${suffix}`,
    customerId,
    finishedItem.id,
    locationId,
    packOperation.id
  ]);

  const scenario = await client.query<{ id: string; name: string }>(`
    insert into public.planning_scenario (account_id, name, description, status, source)
    values ($1, $2, '排产控制台确定性可视化数据', 'free', 'ui-smoke')
    returning id, name
  `, [accountId, `控制台验收场景-${suffix}`]);

  const completedRun = await client.query<{ id: string }>(`
    insert into public.planning_run (
      account_id, scenario_id, name, submitted, started, finished, arguments,
      status, message, trigger_run_id, progress, attempt, output
    ) values (
      $1, $2, $3, '2026-08-09T08:00:00Z', '2026-08-09T08:00:05Z',
      '2026-08-09T08:00:12Z', '{"jobType":"supply_plan"}'::jsonb,
      'succeeded', 'frePPLe 求解完成，结果已原子写回', $4, 100, 1, '{"ok":true}'::jsonb
    ) returning id
  `, [accountId, scenario.rows[0].id, `控制台完整排产-${suffix}`, `ui-completed-${suffix}`]);

  const version = await client.query<{ id: string }>(`
    insert into public.planning_plan_version (
      account_id, code, name, scenario_id, run_id, horizon_start, horizon_end,
      solver, parameters, input_snapshot, result_summary, source
    ) values (
      $1, $2, $3, $4, $5, '2026-08-09T00:00:00Z', '2026-08-16T00:00:00Z',
      'frepple', '{"constraint":52}'::jsonb, '{"fixture":"planning-console-ui"}'::jsonb,
      '{}'::jsonb, 'ui-smoke'
    ) returning id
  `, [
    accountId,
    `UI-${suffix}`,
    `控制台计划版本-${suffix}`,
    scenario.rows[0].id,
    completedRun.rows[0].id
  ]);
  const versionId = version.rows[0].id;

  const planRows = await client.query<{ id: string; reference: string }>(`
    insert into public.planning_operationplan (
      account_id, reference, status, type, quantity, startdate, enddate, delay,
      operation_id, item_id, location_id, demand_id, due, name, plan_version_id, source
    ) values
      ($1, $2, 'proposed', 'MO', 10, '2026-08-10T08:00:00Z', '2026-08-10T10:00:00Z',
        interval '0 hours', $5, $8, $11, null, null, '切割计划', $12, 'ui-smoke'),
      ($1, $3, 'approved', 'MO', 10, '2026-08-10T10:30:00Z', '2026-08-10T14:00:00Z',
        interval '0 hours', $6, $9, $11, null, null, '装配计划', $12, 'ui-smoke'),
      ($1, $4, 'confirmed', 'MO', 10, '2026-08-12T08:00:00Z', '2026-08-12T14:00:00Z',
        interval '1 day 2 hours', $7, $10, $11, $13, '2026-08-11T12:00:00Z', '包装计划', $12, 'ui-smoke')
    returning id, reference
  `, [
    accountId,
    `MO-CUT-${suffix}`,
    `MO-ASM-${suffix}`,
    `MO-PACK-${suffix}`,
    cutOperation.id,
    assemblyOperation.id,
    packOperation.id,
    componentItem.id,
    subassemblyItem.id,
    finishedItem.id,
    locationId,
    versionId,
    demand.rows[0].id
  ]);
  const [cutPlan, assemblyPlan, packPlan] = planRows.rows;

  await client.query(`
    insert into public.planning_operationplanresource (
      account_id, resource_id, operationplan_id, quantity, setup, status, plan_version_id, source
    ) values
      ($1, $2, $5, 6, 'CUT-A', 'proposed', $8, 'ui-smoke'),
      ($1, $3, $6, 8, 'ASM-A', 'confirmed', $8, 'ui-smoke'),
      ($1, $4, $7, 10, 'PACK-A', 'confirmed', $8, 'ui-smoke')
  `, [
    accountId,
    cutResource.id,
    assemblyResource.id,
    packResource.id,
    cutPlan.id,
    assemblyPlan.id,
    packPlan.id,
    versionId
  ]);

  await client.query(`
    insert into public.planning_operationplanmaterial (
      account_id, item_id, location_id, operationplan_id, quantity, flowdate,
      onhand, minimum, status, plan_version_id, source
    ) values
      ($1, $2, $7, $8, -20, '2026-08-10T08:00:00Z', 80, 20, 'proposed', $11, 'ui-smoke'),
      ($1, $3, $7, $8, 10, '2026-08-10T10:00:00Z', 10, 0, 'proposed', $11, 'ui-smoke'),
      ($1, $3, $7, $9, -10, '2026-08-10T10:30:00Z', 0, 0, 'confirmed', $11, 'ui-smoke'),
      ($1, $4, $7, $9, 10, '2026-08-10T14:00:00Z', 10, 0, 'confirmed', $11, 'ui-smoke'),
      ($1, $4, $7, $10, -10, '2026-08-12T08:00:00Z', 0, 0, 'confirmed', $11, 'ui-smoke'),
      ($1, $5, $7, $10, -10, '2026-08-12T08:00:00Z', 40, 10, 'confirmed', $11, 'ui-smoke'),
      ($1, $6, $7, $10, 10, '2026-08-12T14:00:00Z', 10, 0, 'confirmed', $11, 'ui-smoke')
  `, [
    accountId,
    rawItem.id,
    componentItem.id,
    subassemblyItem.id,
    packagingItem.id,
    finishedItem.id,
    locationId,
    cutPlan.id,
    assemblyPlan.id,
    packPlan.id,
    versionId
  ]);

  await client.query(`
    insert into public.planning_resourceplan (
      account_id, run_id, plan_version_id, resource_id, startdate,
      available, unavailable, setup, load, free, load_confirmed
    ) values
      ($1, $2, $3, $4, '2026-08-10T00:00:00Z', 8, 0, 0.5, 6, 2, 0),
      ($1, $2, $3, $5, '2026-08-10T00:00:00Z', 8, 0, 0.5, 8, 0, 8),
      ($1, $2, $3, $6, '2026-08-12T00:00:00Z', 8, 0, 1, 10, -2, 10)
  `, [
    accountId,
    completedRun.rows[0].id,
    versionId,
    cutResource.id,
    assemblyResource.id,
    packResource.id
  ]);

  await client.query(`
    insert into public.planning_problem (
      account_id, run_id, plan_version_id, entity, owner, name, description, startdate, enddate
    ) values (
      $1, $2, $3, 'resource', $4, 'overload', '终检包装线超载 2 小时',
      '2026-08-12T08:00:00Z', '2026-08-12T14:00:00Z'
    )
  `, [accountId, completedRun.rows[0].id, versionId, packResource.name]);

  await client.query(`
    insert into public.planning_constraint (
      account_id, run_id, plan_version_id, demand_id, item_id, entity, owner,
      name, description, startdate, enddate
    ) values (
      $1, $2, $3, $4, $5, 'demand', $6, 'late', '受包装产能约束，计划交付延期 26 小时',
      '2026-08-11T12:00:00Z', '2026-08-12T14:00:00Z'
    )
  `, [
    accountId,
    completedRun.rows[0].id,
    versionId,
    demand.rows[0].id,
    finishedItem.id,
    demand.rows[0].name
  ]);

  await client.query(`
    select public.planning_finish_plan_version(
      $1, $2, 'completed',
      '{"operationPlans":3,"operationPlanMaterials":7,"operationPlanResources":3,"problems":1,"constraints":1,"resourcePlans":3}'::jsonb
    )
  `, [accountId, versionId]);

  const queuedRun = await client.query<{ id: string; name: string }>(`
    insert into public.planning_run (
      account_id, scenario_id, name, submitted, arguments, status, message, progress, attempt
    ) values (
      $1, $2, $3, '2026-08-09T09:00:00Z', '{"jobType":"supply_plan"}'::jsonb,
      'queued', '等待控制台取消', 0, 1
    ) returning id, name
  `, [accountId, scenario.rows[0].id, `待取消任务-${suffix}`]);

  return {
    completedRunId: completedRun.rows[0].id,
    finishedItemId: finishedItem.id,
    finishedItemName: finishedItem.display_name,
    queuedRunId: queuedRun.rows[0].id,
    queuedRunName: queuedRun.rows[0].name,
    scenarioId: scenario.rows[0].id,
    scenarioName: scenario.rows[0].name,
    versionId
  };
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
    waitForUrl(`${API_URL}/api/auth/account-options?login=admin`)
  ]);

  const postgres = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  postgres.on('error', (error) => {
    console.warn(`[planning-console-ui] PostgreSQL client error: ${error.message}`);
  });
  const supabaseAdmin = createSupabaseClient('admin');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const accountId = randomUUID();
  const password = `Planning-Console-${suffix}-A9!`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  let accountCreated = false;
  let browser: any;

  await postgres.connect();
  try {
    async function createAuthUser(kind: 'manager' | 'viewer') {
      const email = `planning-console-${kind}-${suffix}@example.test`;
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Planning console ${kind}` }
      });
      if (created.error || !created.data.user) throw created.error;
      createdUserIds.push(created.data.user.id);
      return { email, userId: created.data.user.id };
    }

    const managerUser = await createAuthUser('manager');
    const viewerUser = await createAuthUser('viewer');
    await postgres.query(`
      insert into basejump.accounts (
        id, primary_owner_user_id, name, slug, personal_account, code, status
      ) values ($1, $2, $3, $4, false, $5, 'active')
    `, [
      accountId,
      managerUser.userId,
      `Planning console UI smoke ${suffix}`,
      `planning-console-ui-${suffix}`,
      `PC${accountId.replace(/-/g, '').slice(0, 10)}`
    ]);
    accountCreated = true;
    await postgres.query(`
      insert into basejump.account_user (account_id, user_id, account_role)
      values
        ($1, $2, 'owner'::basejump.account_role),
        ($1, $3, 'member'::basejump.account_role)
      on conflict (account_id, user_id) do nothing
    `, [accountId, managerUser.userId, viewerUser.userId]);

    const roles = await postgres.query<{ code: string; id: string }>(`
      insert into public.admin_roles (code, name, status, sort_order, is_system)
      values
        ($1, 'Planning console UI manager', 'active', 9997, false),
        ($2, 'Planning console UI viewer', 'active', 9998, false)
      returning id, code
    `, [`planning_console_manager_${suffix}`, `planning_console_viewer_${suffix}`]);
    createdRoleIds.push(...roles.rows.map((row) => row.id));
    const managerRoleId = roles.rows.find((row) => row.code.includes('_manager_'))?.id;
    const viewerRoleId = roles.rows.find((row) => row.code.includes('_viewer_'))?.id;
    assert.ok(managerRoleId && viewerRoleId, 'Unable to create planning console test roles.');

    await postgres.query(`
      insert into public.admin_role_permissions (role_id, permission_id)
      select $1::uuid, id from public.admin_permissions
      where code in ('planning.models.view', 'planning.models.manage', 'lowcode.pages.manage')
        and status = 'active'
      union all
      select $2::uuid, id from public.admin_permissions
      where code = 'planning.models.view' and status = 'active'
    `, [managerRoleId, viewerRoleId]);
    await postgres.query(`
      insert into public.admin_user_roles (user_id, role_id, account_id)
      values ($1, $2, $5), ($3, $4, $5)
    `, [managerUser.userId, managerRoleId, viewerUser.userId, viewerRoleId, accountId]);

    const fixture = await seedFixture(postgres, accountId, suffix);
    const manager: TestIdentity = {
      ...managerUser,
      auth: await signIn(managerUser.email, password, accountId)
    };
    const viewer: TestIdentity = {
      ...viewerUser,
      auth: await signIn(viewerUser.email, password, accountId)
    };

    const managerToken = accessToken(manager.auth);
    const preflight = await serviceRequest(managerToken, accountId, 'preflightSupplyPlanIssues', {
      jobType: 'supply_plan',
      scenarioId: fixture.scenarioId
    });
    assert.ok(Array.isArray(preflight), 'Planning preflight must return issue rows.');
    assert.equal(
      preflight.some((issue) => isRecord(issue) && issue.severity === 'error'),
      false,
      `The deterministic UI fixture failed preflight: ${JSON.stringify(preflight)}`
    );

    const datasetExpectations: Record<string, (value: unknown) => boolean> = {
      summary: (value) => isRecord(value) && value.operationPlanCount === 3,
      demands: (value) => Array.isArray(value) && value.length === 1,
      operationPlans: (value) => Array.isArray(value) && value.length === 3,
      materials: (value) => Array.isArray(value) && value.length === 7,
      planResources: (value) => Array.isArray(value) && value.length === 3,
      resourcePlans: (value) => Array.isArray(value) && value.length === 3,
      problems: (value) => Array.isArray(value) && value.length === 1,
      constraints: (value) => Array.isArray(value) && value.length === 1,
      runs: (value) => Array.isArray(value) && value.length === 1,
      flow: (value) => isRecord(value) && Array.isArray(value.nodes) && value.nodes.length === 3 &&
        Array.isArray(value.edges) && value.edges.length === 2,
      bom: (value) => Array.isArray(value) && value.length === 1
    };
    for (const [dataset, validate] of Object.entries(datasetExpectations)) {
      const value = await serviceRequest(managerToken, accountId, 'getPlanningConsoleData', {
        dataset,
        filters: { scenarioId: fixture.scenarioId, planVersionId: fixture.versionId }
      });
      assert.ok(validate(value), `${dataset} returned an unexpected fixture payload: ${JSON.stringify(value)}`);
    }
    const filteredOperationPlans = await serviceRequest(
      managerToken,
      accountId,
      'getPlanningConsoleData',
      {
        dataset: 'operationPlans',
        filters: {
          scenarioId: fixture.scenarioId,
          planVersionId: fixture.versionId,
          itemId: fixture.finishedItemId
        }
      }
    );
    assert.ok(Array.isArray(filteredOperationPlans), 'Filtered operation plans must return rows.');
    assert.deepEqual(
      filteredOperationPlans.map((row) => isRecord(row) ? row.reference : undefined),
      [`MO-PACK-${suffix}`],
      `The backend item filter returned unexpected operation plans: ${JSON.stringify(filteredOperationPlans)}`
    );

    const playwrightModule = await import(pathToFileURL(playwrightPath).href);
    browser = await playwrightModule.default.chromium.launch({
      executablePath: BROWSER_EXECUTABLE,
      headless: true
    });

    const managerContext = await prepareContext(browser, manager, accountId, { width: 1600, height: 1000 });
    try {
      const page = await managerContext.newPage();
      const pageErrors: string[] = [];
      const failedApiResponses: string[] = [];
      const requestedDatasets = new Set<string>();
      const planningConsoleRequests: Array<{ dataset: string; filters: JsonRecord }> = [];
      const planningConsoleRequestStart = new WeakMap<object, number>();
      const datasetTimings = new Map<string, DatasetTiming[]>();
      page.on('pageerror', (error: Error) => pageErrors.push(error.message));
      page.on('request', (request: any) => {
        if (!request.url().endsWith('/api/service') || request.method() !== 'POST') return;
        try {
          const body = request.postDataJSON();
          if (body?.serviceName === 'planning' && body?.serviceMethod === 'getPlanningConsoleData') {
            const dataset = String(body?.postData?.dataset ?? '');
            requestedDatasets.add(dataset);
            planningConsoleRequestStart.set(request, performance.now());
            planningConsoleRequests.push({
              dataset,
              filters: isRecord(body?.postData?.filters) ? body.postData.filters : {}
            });
          }
        } catch {
          // Request auditing is best effort; API failures are captured separately.
        }
      });
      page.on('response', (response: any) => {
        const request = response.request();
        const startedAt = planningConsoleRequestStart.get(request);
        if (typeof startedAt === 'number') {
          try {
            const body = request.postDataJSON();
            const dataset = String(body?.postData?.dataset ?? '');
            datasetTimings.set(dataset, [
              ...(datasetTimings.get(dataset) ?? []),
              {
                durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
                status: response.status()
              }
            ]);
          } catch {
            // The request audit above already verifies dataset coverage.
          }
        }
        if (response.status() >= 400 && response.url().includes('/api/')) {
          failedApiResponses.push(`${response.status()} ${response.url()}`);
        }
      });

      await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
      await waitForDashboard(page);
      const advancedTrigger = page.locator('.admin-tool-launcher__trigger', { hasText: '高级功能' }).first();
      await advancedTrigger.waitFor({ state: 'visible', timeout: 30_000 });
      await advancedTrigger.click();
      const consoleTool = page.locator('.admin-tool-panel__item', { hasText: '排产控制台' }).first();
      await consoleTool.waitFor({ state: 'visible', timeout: 15_000 });
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-advanced-menu.png'), fullPage: true });
      await consoleTool.click();
      await page.waitForURL(new RegExp(`${CONSOLE_PATH.replaceAll('/', '\\/')}(?:\\?|$)`), { timeout: 30_000 });
      await waitForConsole(page);

      for (const label of TAB_LABELS) {
        await page.locator('.lc-node-tabs .vxe-tabs-header--item', { hasText: label }).first()
          .waitFor({ state: 'attached', timeout: 15_000 });
      }
      if (GANTT_ONLY) {
        const captureInstalled = await page.locator('.lowcode-runtime-page').first()
          .evaluate((element: HTMLElement) => {
            let instance = (element as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
            while (instance) {
              if (typeof instance.exposed?.getSnapshot === 'function') {
                const props = instance.props as {
                  onRuntimeEvent?: (event: { name?: unknown; payload?: Record<string, unknown> }) => unknown;
                };
                const original = props.onRuntimeEvent;
                if (typeof original !== 'function') return false;
                const events: Array<{ id?: unknown; name?: unknown; value?: unknown }> = [];
                (window as Window & { __planningGanttEvents?: typeof events }).__planningGanttEvents = events;
                props.onRuntimeEvent = (event) => {
                  events.push({
                    id: event.payload?.id,
                    name: event.name,
                    value: event.payload?.value
                  });
                  return original(event);
                };
                return true;
              }
              instance = instance.parent;
            }
            return false;
          });
        assert.ok(captureInstalled, 'Unable to instrument planning Gantt runtime events.');
        await clickTab(page, '排产甘特');
        const gantt = page.locator('.lc-planning-gantt__chart .wx-gantt').first();
        await gantt.waitFor({ state: 'visible', timeout: 30_000 });
        const desktopMetrics = await gantt.evaluate((element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        assert.ok(
          desktopMetrics.width > 400 && desktopMetrics.height > 200,
          `Gantt is too small: ${JSON.stringify(desktopMetrics)}`
        );

        const desktopTasks = await page.locator('.lc-planning-gantt__chart .wx-bar.wx-task')
          .evaluateAll((tasks: HTMLElement[]) => tasks.map((task) => ({
            color: getComputedStyle(task).backgroundColor,
            type: task.dataset.taskType,
            width: task.getBoundingClientRect().width
          })));
        assert.equal(desktopTasks.length, 3);
        assert.deepEqual(
          Object.fromEntries(desktopTasks.map((task) => [task.type, task.color])),
          {
            approved: 'rgb(37, 99, 166)',
            delayed: 'rgb(194, 65, 59)',
            proposed: 'rgb(183, 121, 31)'
          }
        );
        assert.ok(desktopTasks.every((task) => task.width > 0), `Gantt contains a zero-width task: ${JSON.stringify(desktopTasks)}`);
        await clickFirstGanttTask(page);
        await page.locator('.lc-planning-gantt__chart.has-selection').waitFor({ state: 'visible', timeout: 10_000 });
        await page.waitForFunction(() => {
          const events = (window as Window & {
            __planningGanttEvents?: Array<{ id?: unknown; name?: unknown }>;
          }).__planningGanttEvents ?? [];
          return events.some((event) => event.name === 'planningGantt.taskSelect' && event.id);
        }, undefined, { timeout: 10_000 });
        await page.screenshot({ path: resolve(artifactsDir, 'planning-console-gantt-desktop.png'), fullPage: true });

        await clickTab(page, '排产总览');
        await clickTab(page, '排产甘特');
        await page.locator('.lc-planning-gantt__chart .wx-bar.wx-task').first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        assert.equal(await page.locator('.lc-planning-gantt__chart .wx-bar.wx-task').count(), 3);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        const mobileMetrics = await gantt.evaluate((element: HTMLElement) => {
          const chart = element.closest<HTMLElement>('.lc-planning-gantt__chart');
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            chartWidth: chart?.getBoundingClientRect().width ?? 0
          };
        });
        assert.ok(
          mobileMetrics.width > 150 && mobileMetrics.height >= 340 && mobileMetrics.height <= 420,
          `Mobile Gantt is not usable: ${JSON.stringify(mobileMetrics)}`
        );
        assert.ok(mobileMetrics.chartWidth <= 390, `Mobile Gantt overflows the viewport: ${JSON.stringify(mobileMetrics)}`);
        assert.equal(await page.locator('.lc-planning-gantt__chart .wx-bar.wx-task').count(), 3);
        await assertRootFitsViewport(page);
        await page.screenshot({ path: resolve(artifactsDir, 'planning-console-gantt-mobile.png'), fullPage: false });
        assert.deepEqual(pageErrors, [], `Manager browser page errors: ${pageErrors.join('\n')}`);
        assert.deepEqual(failedApiResponses, [], `Manager failed API responses: ${failedApiResponses.join('\n')}`);

        console.log(JSON.stringify({
          desktop: { ...desktopMetrics, tasks: desktopTasks },
          mobile: { ...mobileMetrics, taskCount: 3 },
          page_errors: 0,
          failed_api_responses: 0,
          cleanup: 'verified in finally'
        }, null, 2));
        return;
      }
      assert.equal(await statValue(page, '控制权限'), '控制权限 可执行');
      assert.equal(await statValue(page, '排产引擎'), '排产引擎 可用');
      assert.match(await statValue(page, '后台任务'), /Worker (在线|离线)|在线状态未知/);
      assert.equal(await statValue(page, '计划单'), '计划单 3 单');
      assert.equal(await statValue(page, '需求'), '需求 1 条');
      assert.equal(await statValue(page, '延期需求'), '延期需求 1 条');
      assert.equal(await statValue(page, '计划问题'), '计划问题 1 项');
      assert.equal(await statValue(page, '超载资源'), '超载资源 1 个');
      assert.equal(await statValue(page, '运行中'), '运行中 1 个');
      await assertRootFitsViewport(page);
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-overview-desktop.png'), fullPage: true });

      await actionButton(page, '数据预检').click();
      await visibleRow(page, 'SCENARIO_BASELINE_INPUT').waitFor({ state: 'visible', timeout: 45_000 });
      assert.equal(await visibleRow(page, 'INPUT_BUILD_ERROR').count(), 0);
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-preflight.png'), fullPage: true });

      await clickTab(page, '排产甘特');
      await page.locator('.lc-planning-gantt__chart .wx-gantt').first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      const ganttBox = await page.locator('.lc-planning-gantt__chart .wx-gantt').first().boundingBox();
      assert.ok(ganttBox && ganttBox.width > 400 && ganttBox.height > 200, `Gantt is too small: ${JSON.stringify(ganttBox)}`);
      assert.equal(await page.locator('.lc-planning-gantt__chart .wx-bar.wx-task').count(), 3);
      assert.ok(
        await page.locator('.lc-planning-gantt__chart .wx-bar[data-task-type="delayed"]').count() > 0,
        'Delayed Gantt task is not rendered.'
      );
      const ganttStatusColors = await page.locator('.lc-planning-gantt__chart .wx-bar.wx-task')
        .evaluateAll((tasks: HTMLElement[]) => Object.fromEntries(tasks.map((task) => [
          task.dataset.taskType,
          getComputedStyle(task).backgroundColor
        ])));
      assert.equal(ganttStatusColors.proposed, 'rgb(183, 121, 31)');
      assert.equal(ganttStatusColors.approved, 'rgb(37, 99, 166)');
      assert.equal(ganttStatusColors.delayed, 'rgb(194, 65, 59)');
      await clickFirstGanttTask(page);
      await page.locator('.lc-planning-gantt__chart.has-selection').waitFor({ state: 'visible', timeout: 10_000 });
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-gantt-desktop.png'), fullPage: true });
      await clickTab(page, '排产总览');
      await clickTab(page, '排产甘特');
      await page.locator('.lc-planning-gantt__chart .wx-bar.wx-task').first()
        .waitFor({ state: 'visible', timeout: 30_000 });

      await clickTab(page, '工艺路线');
      const flow = page.locator('.lc-planning-flow').first();
      await flow.locator('.vue-flow__node').first().waitFor({ state: 'visible', timeout: 30_000 });
      assert.equal(await flow.locator('.vue-flow__node').count(), 3);
      assert.equal(await flow.locator('.vue-flow__edge').count(), 2);
      await flow.locator('.vue-flow__node').first().click({ position: { x: 70, y: 32 } });
      await page.waitForTimeout(120);
      const flowTransformBefore = await flow.locator('.vue-flow__transformationpane').getAttribute('style');
      await flow.getByRole('button', { name: '放大' }).click();
      await page.waitForTimeout(220);
      const flowTransformAfter = await flow.locator('.vue-flow__transformationpane').getAttribute('style');
      assert.notEqual(flowTransformAfter, flowTransformBefore, 'Flow zoom did not update the viewport transform.');
      await flow.getByRole('button', { name: '适应视图' }).click();
      await page.waitForTimeout(260);
      const flowTransformFitted = await flow.locator('.vue-flow__transformationpane').getAttribute('style');
      assert.notEqual(flowTransformFitted, flowTransformAfter, 'Flow fit-view did not restore the viewport transform.');
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-flow-desktop.png'), fullPage: true });
      await clickTab(page, '排产总览');
      await clickTab(page, '工艺路线');
      await flow.locator('.vue-flow__node').first().waitFor({ state: 'visible', timeout: 15_000 });
      const flowBox = await flow.locator('.lc-planning-flow__canvas').boundingBox();
      assert.ok(flowBox && flowBox.width > 400 && flowBox.height > 300, 'Flow did not recover after tab restoration.');

      await clickTab(page, '工艺 BOM');
      const bom = page.locator('.lc-planning-bom').first();
      await bom.locator('.vue-flow__node').first().waitFor({ state: 'visible', timeout: 30_000 });
      assert.equal(await bom.locator('.vue-flow__node').count(), 8);
      assert.equal(await bom.locator('.vue-flow__edge').count(), 7);
      await bom.locator('.lc-planning-bom-node__hit').first().click();
      await bom.locator('.lc-planning-bom-node.is-selected').first()
        .waitFor({ state: 'visible', timeout: 10_000 });
      const bomTransformBefore = await bom.locator('.vue-flow__transformationpane').getAttribute('style');
      await bom.getByRole('button', { name: '放大' }).click();
      await page.waitForTimeout(220);
      const bomTransformAfter = await bom.locator('.vue-flow__transformationpane').getAttribute('style');
      assert.notEqual(bomTransformAfter, bomTransformBefore, 'BOM zoom did not update the viewport transform.');
      await bom.locator('.lc-planning-bom-node__toggle').first().click();
      assert.equal(await bom.locator('.vue-flow__node').count(), 1);
      await bom.locator('.lc-planning-bom-node__toggle').first().click();
      assert.equal(await bom.locator('.vue-flow__node').count(), 8);
      await bom.getByRole('button', { name: '适应视图' }).click();
      await page.waitForTimeout(260);
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-bom-desktop.png'), fullPage: true });

      await selectOption(page, 'scenarioId', fixture.scenarioName);
      await selectOption(page, 'itemId', fixture.finishedItemName);
      assert.match(await selectedOptionValue(page, 'scenarioId'), /控制台验收场景/);
      assert.match(await selectedOptionValue(page, 'itemId'), /智能终端/);
      const filteredOperationPlanResponse = page.waitForResponse((response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.serviceName === 'planning' &&
            body?.serviceMethod === 'getPlanningConsoleData' &&
            body?.postData?.dataset === 'operationPlans' &&
            body?.postData?.filters?.itemId === fixture.finishedItemId;
        } catch {
          return false;
        }
      }, { timeout: 45_000 });
      await (await searchFormButton(page, '应用筛选')).click();
      const operationPlanResponse = await filteredOperationPlanResponse;
      const operationPlanResponsePayload = unwrapServicePayload(await operationPlanResponse.json());
      assert.ok(Array.isArray(operationPlanResponsePayload), 'Filtered operation plan response must contain rows.');
      assert.deepEqual(
        operationPlanResponsePayload.map((row) => isRecord(row) ? row.reference : undefined),
        [`MO-PACK-${suffix}`],
        `The browser received unexpected filtered operation plans: ${JSON.stringify(operationPlanResponsePayload)}`
      );
      await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
        .catch(() => undefined);
      await page.waitForTimeout(250);
      const latestOperationPlanRequest = [...planningConsoleRequests]
        .reverse()
        .find((request) => request.dataset === 'operationPlans');
      assert.equal(
        latestOperationPlanRequest?.filters.itemId,
        fixture.finishedItemId,
        `The search form did not send the selected item filter: ${JSON.stringify(latestOperationPlanRequest)}`
      );
      await clickTab(page, '需求与计划单');
      await page.waitForFunction(({ reference }: { reference: string }) => {
        const root = document.querySelector('.lowcode-runtime-page');
        let instance = (root as (HTMLElement & { __vueParentComponent?: any }) | null)
          ?.__vueParentComponent;
        while (instance) {
          if (typeof instance.exposed?.getSnapshot === 'function') {
            const rows = instance.exposed.getSnapshot()?.runtime?.sources?.operationPlans;
            return Array.isArray(rows) && rows.length === 1 && rows[0]?.reference === reference;
          }
          instance = instance.parent;
        }
        return false;
      }, { reference: `MO-PACK-${suffix}` }, { timeout: 45_000 });
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-filtered-orders.png'), fullPage: true });
      await visibleRow(page, `DEMAND-UI-${suffix}`).waitFor({ state: 'visible', timeout: 30_000 });
      await clickInnerTab(page, '计划单');
      await visibleRow(page, `MO-PACK-${suffix}`).waitFor({ state: 'visible', timeout: 30_000 });
      const runtimeSnapshot = await readPlanningConsoleRuntime(page) as {
        runtime?: {
          sources?: Record<string, unknown>;
          grids?: Record<string, { rows?: unknown[] }>;
        };
      } | undefined;
      const visibleGridRows = await readVisibleGridRows(page);
      assert.equal(
        await visibleRow(page, `MO-CUT-${suffix}`).isVisible(),
        false,
        `The filtered operation plan grid retained an old row: ${JSON.stringify({
          source: runtimeSnapshot?.runtime?.sources?.operationPlans,
          grid: runtimeSnapshot?.runtime?.grids?.planning_console_operation_plans_grid?.rows,
          visibleGridRows
        })}`
      );

      await clickTab(page, '物料与资源');
      await visibleRow(page, fixture.finishedItemName).waitFor({ state: 'visible', timeout: 30_000 });
      await visibleRow(page, `MO-PACK-${suffix}`).waitFor({ state: 'visible', timeout: 30_000 });
      await clickInnerTab(page, '计划资源分配');
      await visibleRow(page, `MO-PACK-${suffix}`).waitFor({ state: 'visible', timeout: 30_000 });
      await visibleRow(page, `终检包装线-${suffix}`).waitFor({ state: 'visible', timeout: 30_000 });
      await clickInnerTab(page, '资源负荷');
      await visibleRow(page, `终检包装线-${suffix}`).waitFor({ state: 'visible', timeout: 30_000 });

      await clickTab(page, '问题与约束');
      await visibleRow(page, '终检包装线超载 2 小时').waitFor({ state: 'visible', timeout: 30_000 });
      await clickInnerTab(page, '需求约束');
      await visibleRow(page, '计划交付延期 26 小时').waitFor({ state: 'visible', timeout: 30_000 });

      await clickTab(page, '运行记录');
      const queuedRow = visibleRow(page, fixture.queuedRunName);
      await queuedRow.waitFor({ state: 'visible', timeout: 30_000 });
      await queuedRow.click();
      await actionButton(page, '取消运行').click();
      await page.waitForFunction((runName: string) => {
        return [...document.querySelectorAll('.vxe-body--row')].some((row) =>
          row.textContent?.includes(runName) && row.textContent?.includes('canceled')
        );
      }, fixture.queuedRunName, { timeout: 30_000 });
      const canceledState = await postgres.query<{ status: string }>(`
        select status from public.planning_run where account_id = $1 and id = $2
      `, [accountId, fixture.queuedRunId]);
      assert.equal(canceledState.rows[0]?.status, 'canceled');
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-runs-canceled.png'), fullPage: true });

      await (await searchFormButton(page, '重置')).click();
      await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 45_000 })
        .catch(() => undefined);
      await clickTab(page, '排产总览');
      assert.equal(await statValue(page, '运行中'), '运行中 0 个');

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await assertRootFitsViewport(page);
      const mobileAdvancedTrigger = page.locator('.admin-tool-launcher__trigger', { hasText: '高级功能' }).first();
      await mobileAdvancedTrigger.click();
      const mobileToolBox = await page.locator('.admin-tool-panel').boundingBox();
      assert.ok(
        mobileToolBox && mobileToolBox.x >= 0 && mobileToolBox.x + mobileToolBox.width <= 390,
        `The advanced tools panel overflows the mobile viewport: ${JSON.stringify(mobileToolBox)}`
      );
      await mobileAdvancedTrigger.click();
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-overview-mobile.png'), fullPage: true });

      await assertTabHitTarget(page, '排产甘特');
      await clickTab(page, '排产甘特');
      await page.locator('.lc-planning-gantt__chart .wx-gantt').first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      assert.ok(
        await page.locator('.lc-planning-gantt__chart .wx-bar.wx-task').count() > 0,
        'Mobile Gantt appears blank.'
      );
      const mobileGanttMetrics = await page.locator('.lc-planning-gantt__chart .wx-gantt').first()
        .evaluate((element: HTMLElement) => {
          const chart = element.closest<HTMLElement>('.lc-planning-gantt__chart');
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            chartWidth: chart?.getBoundingClientRect().width ?? 0
          };
        });
      assert.ok(
        mobileGanttMetrics.width > 150 && mobileGanttMetrics.height >= 340 && mobileGanttMetrics.height <= 420,
        `Mobile Gantt is not usable: ${JSON.stringify(mobileGanttMetrics)}`
      );
      assert.ok(
        mobileGanttMetrics.chartWidth <= 390,
        `Mobile Gantt overflows the viewport: ${JSON.stringify(mobileGanttMetrics)}`
      );
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-gantt-mobile.png'), fullPage: false });

      await clickTab(page, '工艺 BOM');
      const mobileBomMetrics = await page.locator('.lc-planning-bom__canvas').evaluate((element: HTMLElement) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        nodes: element.querySelectorAll('.vue-flow__node').length
      }));
      assert.ok(
        mobileBomMetrics.width <= 390 && mobileBomMetrics.height >= 300 && mobileBomMetrics.nodes > 0,
        `Mobile BOM flow is not usable: ${JSON.stringify(mobileBomMetrics)}`
      );
      await assertRootFitsViewport(page);
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-bom-mobile.png'), fullPage: true });

      await page.setViewportSize({ width: 1600, height: 1000 });
      const designerUrl = `${FRONTEND_URL}/dashboard/low-code/designer`;
      await page.goto(designerUrl, { waitUntil: 'domcontentloaded' });
      await waitForDashboard(page);
      if (!page.url().startsWith(designerUrl)) {
        await page.goto(designerUrl, { waitUntil: 'domcontentloaded' });
        await waitForDashboard(page);
      }
      await page.locator('.visual-designer-page').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('.visual-designer-frame .content-panel').waitFor({ state: 'hidden', timeout: 30_000 })
        .catch(() => undefined);
      await page.locator('.left-aside').waitFor({ state: 'visible', timeout: 30_000 });
      const businessComponentsTab = page.locator('.left-aside .vxe-tabs-header--item', {
        hasText: '业务组件'
      }).first();
      await businessComponentsTab.waitFor({ state: 'visible', timeout: 30_000 });
      await businessComponentsTab.click();
      await page.waitForTimeout(500);
      for (const label of ['工艺路线图', '排产甘特图', '工艺 BOM']) {
        const material = page.locator(`.left-aside [data-label="${label}"]`).first();
        if (await material.count() === 0) {
          const diagnostics = await page.locator('.left-aside').evaluate((element: HTMLElement) => ({
            html: element.innerHTML.slice(0, 10_000),
            text: element.innerText,
            tabs: [...element.querySelectorAll('.vxe-tabs-header--item')].map((tab) => ({
              className: tab.className,
              text: tab.textContent?.trim()
            }))
          }));
          throw new Error(`Planning designer material ${label} is missing: ${JSON.stringify(diagnostics)}`);
        }
        await material.waitFor({ state: 'visible', timeout: 15_000 });
        await insertDesignerMaterial(page, label);
      }
      assert.equal(
        await page.locator('.simulator-drop-zone > [data-el="true"]').count(),
        3,
        'The visual designer did not insert all three planning materials.'
      );
      await page.locator('.lc-planning-flow .vue-flow__node').first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('.lc-planning-gantt__chart .wx-gantt').first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('.lc-planning-bom .vue-flow__node').first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      await page.screenshot({
        path: resolve(artifactsDir, 'planning-console-designer-materials.png'),
        fullPage: true
      });

      assert.deepEqual(pageErrors, [], `Manager browser page errors: ${pageErrors.join('\n')}`);
      assert.deepEqual(failedApiResponses, [], `Manager failed API responses: ${failedApiResponses.join('\n')}`);
      assert.deepEqual(
        [...requestedDatasets].filter(Boolean).sort(),
        Object.keys(datasetExpectations).sort(),
        'The console did not request every core planning dataset.'
      );
      for (const dataset of Object.keys(datasetExpectations)) {
        const timings = datasetTimings.get(dataset) ?? [];
        assert.ok(timings.length, `No response timing was captured for ${dataset}.`);
        assert.ok(timings.every((timing) => timing.status === 200), `${dataset} returned a failed response.`);
        assert.ok(
          Math.max(...timings.map((timing) => timing.durationMs)) < 10_000,
          `${dataset} exceeded the 10-second smoke threshold: ${JSON.stringify(timings)}`
        );
      }

      const timingReport = Object.fromEntries(
        Object.keys(datasetExpectations).sort().map((dataset) => {
          const durations = (datasetTimings.get(dataset) ?? []).map((timing) => timing.durationMs);
          return [dataset, {
            requests: durations.length,
            maxMs: Math.max(...durations),
            averageMs: Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 100) / 100
          }];
        })
      );
      console.log(`[planning-console-ui] dataset timings ${JSON.stringify(timingReport)}`);
    } finally {
      await managerContext.close();
    }

    const viewerContext = await prepareContext(browser, viewer, accountId, { width: 1600, height: 1000 });
    try {
      const page = await viewerContext.newPage();
      const pageErrors: string[] = [];
      const failedApiResponses: string[] = [];
      page.on('pageerror', (error: Error) => pageErrors.push(error.message));
      page.on('response', (response: any) => {
        if (response.status() >= 400 && response.url().includes('/api/')) {
          failedApiResponses.push(`${response.status()} ${response.url()}`);
        }
      });
      await page.goto(`${FRONTEND_URL}${CONSOLE_PATH}`, { waitUntil: 'domcontentloaded' });
      await waitForConsole(page);
      assert.equal(await statValue(page, '控制权限'), '控制权限 只读');
      assert.equal(await statValue(page, '计划单'), '计划单 3 单');
      const actionText = await page.locator('.lc-node-button-group').first().innerText();
      assert.match(actionText, /刷新/);
      assert.doesNotMatch(actionText, /数据预检|开始排产|取消运行|发布版本/);
      const advancedTrigger = page.locator('.admin-tool-launcher__trigger', { hasText: '高级功能' }).first();
      await advancedTrigger.click();
      await page.locator('.admin-tool-panel__item', { hasText: '排产控制台' }).first()
        .waitFor({ state: 'visible', timeout: 15_000 });
      await advancedTrigger.click();
      await page.screenshot({ path: resolve(artifactsDir, 'planning-console-viewer-readonly.png'), fullPage: true });
      assert.deepEqual(pageErrors, [], `Viewer browser page errors: ${pageErrors.join('\n')}`);
      assert.deepEqual(failedApiResponses, [], `Viewer failed API responses: ${failedApiResponses.join('\n')}`);
    } finally {
      await viewerContext.close();
    }

    console.log(JSON.stringify({
      advanced_menu: 'verified',
      tabs: TAB_LABELS.length,
      datasets: Object.keys(datasetExpectations).length,
      deterministic_fixture: 'verified',
      preflight: 'passed without errors',
      server_side_filters: 'verified',
      flow: '3 nodes / 2 edges / zoom / fit view / select / tab restore',
      gantt: 'desktop and mobile DOM / delayed color / task select / tab restore',
      bom: 'Vue Flow / 8 nodes / 7 edges / zoom / fit / select / collapse / mobile canvas; 40 roots / 7 levels / cycle in unit coverage',
      designer_materials: 'flow / gantt / BOM visible and inserted',
      cancel_action: 'verified queued -> canceled',
      viewer_actions: 'refresh only',
      screenshots: 13,
      page_errors: 0,
      failed_api_responses: 0,
      cleanup: 'verified in finally'
    }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    if (accountCreated) {
      let accountDeleteError: unknown;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await postgres.query('delete from basejump.accounts where id = $1', [accountId]);
          accountDeleteError = undefined;
          break;
        } catch (error) {
          accountDeleteError = error;
          await new Promise((done) => setTimeout(done, 250 * (attempt + 1)));
        }
      }
      if (accountDeleteError) throw accountDeleteError;
    }
    if (createdRoleIds.length) {
      await postgres.query('delete from public.admin_roles where id = any($1::uuid[])', [createdRoleIds])
        .catch(() => undefined);
    }
    for (const userId of createdUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    let residue: { rows: Array<{ count: string }> } | undefined;
    let residueError: unknown;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        residue = await postgres.query<{ count: string }>(`
          select count(*)::text as count from basejump.accounts where id = $1
        `, [accountId]);
        residueError = undefined;
        break;
      } catch (error) {
        residueError = error;
        await new Promise((done) => setTimeout(done, 250 * (attempt + 1)));
      }
    }
    if (residueError) throw residueError;
    assert.equal(residue?.rows[0]?.count, '0', 'The isolated planning console account was not removed.');
    await postgres.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
