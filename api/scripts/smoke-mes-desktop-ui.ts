import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import {
  createMesE2eDatabase,
  createMesE2eFixture,
  releaseMesE2eWorkOrder,
} from './mes-e2e-fixture';

type JsonRecord = Record<string, unknown>;

const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://127.0.0.1:3161').replace(/\/$/, '');
const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3154').replace(/\/$/, '');
const BROWSER_EXECUTABLE = process.env.MES_UI_BROWSER
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const verifyRefreshFailure = ['1', 'true', 'yes'].includes(
  String(process.env.MES_DESKTOP_E2E_REFRESH_FAILURE ?? '').trim().toLowerCase(),
);
const executionRefreshResources = [
  'mes_work_order_runtime_view',
  'mes_work_order_operation_runtime_view',
  'mes_work_order_component_runtime_view',
  'mes_production_transaction_runtime_view',
  'mes_material_transaction_runtime_view',
];
const commandMethods = new Set([
  'startOperation',
  'pauseOperation',
  'resumeOperation',
  'reportProduction',
  'issueMaterial',
  'returnMaterial',
  'completeOperation',
  'reverseProduction',
  'reverseMaterial',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function servicePayload(request: { url(): string; postDataJSON(): unknown }) {
  if (!request.url().includes('/api/service')) return null;
  try {
    const payload = request.postDataJSON();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isServiceRequest(
  request: { url(): string; postDataJSON(): unknown },
  serviceName: string,
  serviceMethod: string,
) {
  const payload = servicePayload(request);
  return payload?.serviceName === serviceName && payload?.serviceMethod === serviceMethod;
}

function mesListResource(response: { request(): { url(): string; postDataJSON(): unknown } }) {
  const payload = servicePayload(response.request());
  return payload?.serviceName === 'mes' && payload?.serviceMethod === 'listItems'
    ? String((payload.postData as JsonRecord | undefined)?.resource ?? '')
    : '';
}

async function readJson(response: Response) {
  const text = await response.text();
  let payload: unknown;
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

async function waitForUrl(url: string) {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function runMesCommand(page: any, method: string, action: () => Promise<void>) {
  let commandResponse: any;
  const refreshResponses: any[] = [];
  const capture = (response: any) => {
    if (isServiceRequest(response.request(), 'mes', method)) {
      commandResponse = response;
      return;
    }
    if (executionRefreshResources.includes(mesListResource(response))) {
      refreshResponses.push(response);
    }
  };
  page.on('response', capture);
  try {
    await action();
    const deadline = Date.now() + 60_000;
    while (!commandResponse || refreshResponses.length < executionRefreshResources.length) {
      if (commandResponse && !commandResponse.ok()) {
        throw new Error(`${method} failed: ${commandResponse.status()} ${await commandResponse.text()}`);
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `${method} timed out; command=${Boolean(commandResponse)} refreshes=${refreshResponses.map(mesListResource).join(',')}`,
        );
      }
      await page.waitForTimeout(50);
    }

    const commandBody = await commandResponse.text();
    assert.ok(commandResponse.ok(), `${method} failed: ${commandResponse.status()} ${commandBody}`);
    for (const response of refreshResponses.slice(0, executionRefreshResources.length)) {
      const resource = mesListResource(response);
      const body = await response.text();
      assert.ok(response.ok(), `${resource} refresh failed: ${response.status()} ${body}`);
    }
    assert.deepEqual(
      refreshResponses.slice(0, executionRefreshResources.length).map(mesListResource),
      executionRefreshResources,
      'MES refreshes must preserve configured order.',
    );
  } finally {
    page.off('response', capture);
  }
}

async function waitForAction(page: any, label: string) {
  const exactLabel = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  const action = page.locator('.vxe-button:visible', { hasText: exactLabel }).first();
  await action.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction((text: string) => {
    const candidates = [...document.querySelectorAll<HTMLElement>('.vxe-button')];
    return candidates.some((candidate) => (
      candidate.innerText.trim() === text
      && candidate.offsetParent !== null
      && candidate.getAttribute('aria-disabled') !== 'true'
      && !candidate.classList.contains('is--disabled')
    ));
  }, label, { timeout: 60_000 });
  return action;
}

async function clickAction(page: any, label: string) {
  const action = await waitForAction(page, label);
  await action.click();
}

async function fillDialog(page: any, values: Record<string, string>) {
  const modal = page.locator('.vxe-modal--wrapper:visible').last();
  await modal.waitFor({ state: 'visible', timeout: 60_000 });
  for (const [label, value] of Object.entries(values)) {
    const fieldLabel = modal.getByText(label, { exact: true }).last();
    const fieldName = await fieldLabel
      .locator('xpath=ancestor::*[@data-lc-field][1]')
      .getAttribute('data-lc-field');
    assert.ok(fieldName, `Dialog field ${label} must expose its low-code field name.`);
    const field = modal
      .locator(`[data-lc-field="${fieldName}"] input:not([disabled]), [data-lc-field="${fieldName}"] textarea:not([disabled])`)
      .first();
    await field.fill(value);
    await field.dispatchEvent('input');
    await field.dispatchEvent('change');
    await field.press('Tab');
    await page.waitForTimeout(100);
    assert.equal(await field.inputValue(), value, `Dialog field ${label} must retain its value.`);
  }
}

async function executeDirectCommand(page: any, label: string, method: string) {
  await runMesCommand(page, method, () => clickAction(page, label));
  await page.waitForFunction(() => (
    document.querySelector('.lowcode-runtime-page')?.getAttribute('data-mes-command-executing') === 'false'
  ), undefined, { timeout: 60_000 });
}

async function executeRapidDoubleClickCommand(page: any, label: string, method: string) {
  let requestCount = 0;
  const capture = (request: any) => {
    if (isServiceRequest(request, 'mes', method)) requestCount += 1;
  };
  page.on('request', capture);
  try {
    await runMesCommand(page, method, async () => {
      const action = await waitForAction(page, label);
      await action.evaluate((element: HTMLElement) => {
        element.click();
        element.click();
      });
    });
    await page.waitForFunction(() => (
      document.querySelector('.lowcode-runtime-page')?.getAttribute('data-mes-command-executing') === 'false'
    ), undefined, { timeout: 60_000 });
    await page.waitForTimeout(250);
    assert.equal(requestCount, 1, `Rapid double-clicking ${label} must dispatch one ${method} request.`);
  } finally {
    page.off('request', capture);
  }
}

async function executeDialogCommand(
  page: any,
  openLabel: string,
  values: Record<string, string>,
  confirmLabel: string,
  method: string,
) {
  await clickAction(page, openLabel);
  await fillDialog(page, values);
  await runMesCommand(page, method, () => clickAction(page, confirmLabel));
  await page.waitForFunction(() => (
    document.querySelector('.lowcode-runtime-page')?.getAttribute('data-mes-command-executing') === 'false'
  ), undefined, { timeout: 60_000 });
}

async function verifyStrictRefreshFailure(page: any) {
  let commandCommitted = false;
  let refreshFailed = false;
  await page.route('**/api/service', async (route: any) => {
    const request = route.request();
    if (!isServiceRequest(request, 'mes', 'startOperation')) {
      const resource = servicePayload(request)?.serviceName === 'mes'
        && servicePayload(request)?.serviceMethod === 'listItems'
        ? String((servicePayload(request)?.postData as JsonRecord | undefined)?.resource ?? '')
        : '';
      if (commandCommitted && !refreshFailed && resource === executionRefreshResources[0]) {
        refreshFailed = true;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Simulated MES projection refresh failure.' }),
        });
        return;
      }
      await route.continue();
      return;
    }

    const response = await route.fetch();
    commandCommitted = response.ok();
    await route.fulfill({ response });
  });

  try {
    await clickAction(page, '开工');
    await page.waitForFunction(() => (
      document.querySelector('.lowcode-runtime-page')?.getAttribute('data-mes-command-executing') === 'false'
    ), undefined, { timeout: 60_000 });
    assert.equal(commandCommitted, true, 'The command must commit before refresh failure is simulated.');
    assert.equal(refreshFailed, true, 'The first strict MES refresh must be failed by the test route.');
    const pageMessage = page.locator('.lowcode-runtime-page > .lc-error').first();
    await pageMessage.waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(
      await pageMessage.innerText(),
      /Simulated MES projection refresh failure/,
      'The refresh error must remain visible after the command lock is released.',
    );
    assert.equal(
      await page.getByText('工序已开工。', { exact: true }).count(),
      0,
      'A strict refresh failure must suppress the configured success message.',
    );
  } finally {
    await page.unroute('**/api/service');
  }
}

async function activateTab(page: any, label: string) {
  const tab = page.locator('.vxe-tabs-header--item:visible', { hasText: label }).last();
  await tab.click();
  await page.waitForTimeout(150);
}

async function main() {
  await waitForUrl(`${FRONTEND_URL}/signin`);
  await waitForUrl(`${API_URL}/api/auth/account-options?login=mes-e2e-validation%40example.test`);
  const database = await createMesE2eDatabase();
  const fixture = await createMesE2eFixture(database);
  const workOrder = await releaseMesE2eWorkOrder(database, fixture);
  let browser: { close(): Promise<void> } | undefined;

  try {
    const auth = await readJson(await fetch(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: fixture.email,
        password: fixture.password,
        accountId: fixture.accountId,
        setDefault: false,
      }),
    }));
    assert.ok(isRecord(auth));
    const session = isRecord(auth.session) ? auth.session : {};
    const accessToken = String(session.access_token ?? '');
    const refreshToken = String(session.refresh_token ?? '');
    assert.ok(accessToken, 'MES desktop E2E sign-in must return an access token.');

    const require = createRequire(import.meta.url);
    const { chromium } = require(resolve(process.cwd(), '../mobile-app/node_modules/playwright-core'));
    browser = await chromium.launch({
      executablePath: existsSync(BROWSER_EXECUTABLE) ? BROWSER_EXECUTABLE : undefined,
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addInitScript(({ token, refresh, accountId }) => {
      window.localStorage.setItem('enlearn_access_token', token);
      window.localStorage.setItem('enlearn_refresh_token', refresh);
      window.localStorage.setItem('enlearn_active_account_id', accountId);
      window.sessionStorage.setItem('enlearn_dev_auto_login_disabled', '1');
    }, { token: accessToken, refresh: refreshToken, accountId: fixture.accountId });
    const page = await context.newPage();
    const runtimeErrors: string[] = [];
    const failedApiResponses: string[] = [];
    const commandRequests: Array<{
      method: string;
      requestId: string;
      postData: JsonRecord;
    }> = [];
    page.on('pageerror', (error: Error) => runtimeErrors.push(error.message));
    page.on('response', (response: any) => {
      if (response.status() >= 400 && response.url().includes('/api/')) {
        failedApiResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('request', (request: any) => {
      const payload = servicePayload(request);
      if (payload?.serviceName !== 'mes' || !commandMethods.has(String(payload.serviceMethod))) return;
      commandRequests.push({
        method: String(payload.serviceMethod),
        requestId: String(request.headers()['x-request-id'] ?? ''),
        postData: isRecord(payload.postData) ? payload.postData : {},
      });
    });

    await page.goto(`${FRONTEND_URL}/dashboard/production/execution`, { waitUntil: 'networkidle' });
    await page.getByText('生产执行工作台', { exact: true }).first().waitFor({ state: 'visible' });
    const detailResponses = executionRefreshResources.slice(1).map((resource) => page.waitForResponse(
      (response: any) => {
        const payload = servicePayload(response.request());
        const postData = isRecord(payload?.postData) ? payload.postData : {};
        const filters = isRecord(postData.filters) ? postData.filters : {};
        return mesListResource(response) === resource && filters.work_order_id === workOrder.workOrderId;
      },
      { timeout: 60_000 },
    ));
    await page.getByText(workOrder.workOrderNo, { exact: true }).first().click();
    assert.ok((await Promise.all(detailResponses)).every((response: any) => response.ok()));

    if (verifyRefreshFailure) {
      await verifyStrictRefreshFailure(page);
      assert.equal(commandRequests.length, 1, 'The refresh-failure scenario must dispatch one command.');
      assert.deepEqual(runtimeErrors, []);
      await context.close();
      console.log(JSON.stringify({
        workOrderNo: workOrder.workOrderNo,
        strictRefreshFailureVerified: true,
        successMessageSuppressed: true,
        commandLockReleased: true,
        desktopMesE2e: true,
      }));
      return;
    }

    await executeRapidDoubleClickCommand(page, '开工', 'startOperation');
    await executeDialogCommand(
      page,
      '暂停',
      { 暂停原因: '桌面 E2E 暂停验证' },
      '确认暂停',
      'pauseOperation',
    );
    await executeDirectCommand(page, '恢复', 'resumeOperation');

    await activateTab(page, '投退料');
    await executeDialogCommand(page, '投料', { 投料数量: '2' }, '确认投料', 'issueMaterial');
    await executeDialogCommand(
      page,
      '退料',
      { 退料数量: '1', 退料原因: '桌面 E2E 退料验证' },
      '确认退料',
      'returnMaterial',
    );

    await activateTab(page, '工序执行');
    await executeDialogCommand(
      page,
      '报工',
      { 良品数量: '10', 报废数量: '0' },
      '确认报工',
      'reportProduction',
    );
    await executeDirectCommand(page, '完工', 'completeOperation');

    await activateTab(page, '生产事务');
    await executeDialogCommand(
      page,
      '撤销报工',
      { 撤销原因: '桌面 E2E 撤销报工验证' },
      '确认撤销',
      'reverseProduction',
    );

    await activateTab(page, '物料事务');
    await executeDialogCommand(
      page,
      '反向事务',
      { 反向原因: '桌面 E2E 反向退料验证' },
      '确认反向',
      'reverseMaterial',
    );
    await executeDialogCommand(
      page,
      '反向事务',
      { 反向原因: '桌面 E2E 反向投料验证' },
      '确认反向',
      'reverseMaterial',
    );

    assert.equal(commandRequests.length, 10, 'The desktop command chain must dispatch ten commands.');
    const deviceIds = new Set<string>();
    const localSequences = new Set<number>();
    for (const request of commandRequests) {
      assert.ok(request.requestId, `${request.method} must carry X-Request-Id.`);
      assert.equal(request.postData.commandId, request.requestId);
      assert.match(String(request.postData.deviceId ?? ''), /^mes-web-/);
      const sequence = Number(request.postData.localSequence);
      assert.ok(Number.isSafeInteger(sequence) && sequence >= 0);
      deviceIds.add(String(request.postData.deviceId));
      localSequences.add(sequence);
    }
    assert.equal(deviceIds.size, 1, 'The desktop MES device id must remain stable.');
    assert.equal(localSequences.size, commandRequests.length, 'Desktop local sequences must be unique.');
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(failedApiResponses, []);

    await context.close();
    console.log(JSON.stringify({
      workOrderNo: workOrder.workOrderNo,
      capturedCommandEnvelopes: commandRequests.length,
      orderedRefreshesPerCommand: executionRefreshResources.length,
      duplicateClickVerified: true,
      desktopMesE2e: true,
    }));
  } finally {
    await browser?.close().catch(() => undefined);
    await database.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
