import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const previewUrl = process.env.ENLEARN_MOBILE_PREVIEW_URL
  ?? 'http://127.0.0.1:3100/?path=/login';
const browserPath = process.env.CHROME_PATH
  ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const loginAccount = process.env.ENLEARN_MOBILE_E2E_LOGIN
  ?? 'mes-e2e-validation@example.test';
const loginPassword = process.env.ENLEARN_MOBILE_E2E_PASSWORD ?? '';
const expectedPages = ['计划释放', '生产执行工作台', '生产事务', '物料追溯'];
const expectedRouteCodes = [
  'production-root',
  'production-release',
  'production-execution',
  'production-ledger',
  'production-material-ledger',
];
const debugScreenshot = process.env.ENLEARN_MOBILE_E2E_SCREENSHOT ?? '';
const runCommandChain = ['1', 'true', 'yes'].includes(
  String(process.env.ENLEARN_MOBILE_E2E_COMMAND_CHAIN ?? '').trim().toLowerCase(),
);

assert.ok(
  loginPassword,
  'ENLEARN_MOBILE_E2E_PASSWORD is required; use the dedicated MES E2E account.',
);

function serviceRequestPayload(request) {
  if (!request.url().includes('/api/service')) return null;
  try {
    return request.postDataJSON();
  } catch {
    return null;
  }
}

function isServiceRequest(request, serviceName, serviceMethod) {
  const payload = serviceRequestPayload(request);
  return payload?.serviceName === serviceName && payload?.serviceMethod === serviceMethod;
}

async function clickText(page, label, last = false) {
  const locator = page.getByText(label, { exact: true });
  const count = await locator.count();
  assert.ok(count, `the "${label}" control should be rendered`);
  await (last ? locator.nth(count - 1) : locator.first()).click();
}

async function waitForPage(page, title) {
  await page.getByText(title, { exact: true }).first().waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
}

async function openMenu(page) {
  const menuTitle = page.getByText('MES 移动工作台', { exact: true }).first();
  if (await menuTitle.isVisible()) return;
  const labelledControl = page.locator('[aria-label="打开菜单"]').first();
  const fallbackControl = page.getByText('☰', { exact: true }).first();
  const control = await labelledControl.isVisible() ? labelledControl : fallbackControl;
  await control.click({ force: true });
  await menuTitle.waitFor({ state: 'visible' });
}

async function closeMenu(page) {
  const menuTitle = page.getByText('MES 移动工作台', { exact: true }).first();
  if (!await menuTitle.isVisible()) return;
  const labelledControl = page.locator('[aria-label="关闭菜单"]').first();
  if (await labelledControl.isVisible()) {
    await labelledControl.click();
  } else {
    await page.getByText('×', { exact: true }).first().click();
  }
  await menuTitle.waitFor({ state: 'hidden' });
}

async function openProductionPage(page, title) {
  await openMenu(page);
  const production = page.getByText('生产管理', { exact: true }).first();
  await production.waitFor({ state: 'visible' });
  const target = page.getByText(title, { exact: true }).last();
  if (!await target.isVisible()) await production.click();
  await target.click();
  await waitForPage(page, title);
}

async function selectWorkOrder(page, workOrder) {
  const detailResponses = [
    'mes_work_order_operation_runtime_view',
    'mes_work_order_component_runtime_view',
    'mes_production_transaction_runtime_view',
    'mes_material_transaction_runtime_view',
  ].map((resource) => page.waitForResponse((response) => {
    const payload = serviceRequestPayload(response.request());
    return payload?.serviceName === 'mes'
      && payload?.serviceMethod === 'listItems'
      && payload?.postData?.resource === resource
      && payload?.postData?.filters?.work_order_id === workOrder.id;
  }, { timeout: 60_000 }));
  await page.getByText(String(workOrder.work_order_no), { exact: true }).first().click();
  const loadedDetails = await Promise.all(detailResponses);
  assert.ok(
    loadedDetails.every((response) => response.status() === 200),
    'selecting a work order should load all MES execution details',
  );
}

async function waitForMesCommand(page, method, action) {
  const responsePromise = page.waitForResponse((response) => (
    isServiceRequest(response.request(), 'mes', method)
  ), { timeout: 60_000 });
  await action();
  const response = await responsePromise;
  const body = await response.text();
  assert.ok(response.ok(), `${method} failed: ${response.status()} ${body}`);
}

async function waitForDialogCommand(page, method) {
  const request = await page.waitForRequest((request) => (
    isServiceRequest(request, 'mes', method)
  ), { timeout: 5_000 }).catch(() => null);
  if (request) return request;
  throw new Error(`${method} did not dispatch; dialog text: ${await page.locator('body').innerText()}`);
}

async function clickMesCommand(page, label, method) {
  await page.getByText(label, { exact: true }).first().waitFor({ state: 'visible' });
  await waitForMesCommand(page, method, () => (
    page.getByText(label, { exact: true }).first().click()
  ));
}

async function confirmMesDialog(page, inputValues, confirmLabel, method) {
  const entries = Object.entries(inputValues);
  for (const [label, value] of entries) {
    const fieldLabel = page.getByText(label, { exact: true }).last();
    await fieldLabel.waitFor({ state: 'visible' });
    const field = fieldLabel
      .locator('xpath=ancestor::*[.//input[not(@disabled)] or .//textarea[not(@disabled)]][1]')
      .locator('input:not([disabled]), textarea:not([disabled])')
      .first();
    await field.waitFor({ state: 'visible' });
    await field.fill(String(value));
    await field.press('Tab');
    await page.waitForTimeout(50);
  }
  const confirmText = page.getByText(confirmLabel, { exact: true }).last();
  const requestPromise = waitForDialogCommand(page, method);
  await confirmText.click();
  const request = await requestPromise;
  const response = await request.response();
  assert.ok(response, `${method} should return a response`);
  const body = await response.text();
  assert.ok(response.ok(), `${method} failed: ${response.status()} ${body}`);
}

async function activateTab(page, label) {
  await page.getByText(label, { exact: true }).last().click();
  await page.waitForTimeout(150);
}

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
});

let activePage;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  activePage = page;
  const runtimeErrors = [];
  const failedApiResponses = [];
  const commandRequests = [];
  const mesListResponses = [];
  const serviceRequests = [];
  let navigationDiagnostics = null;
  const commandMethods = new Set([
    'releaseWorkOrder',
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

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('response', async (response) => {
    if (response.status() < 400 || !response.url().includes('/api/')) return;
    const request = response.request();
    failedApiResponses.push({
      status: response.status(),
      url: response.url(),
      request: serviceRequestPayload(request),
      response: await response.text().catch(() => ''),
    });
  });
  page.on('response', async (response) => {
    const request = response.request();
    if (!isServiceRequest(request, 'mes', 'listItems')) return;
    const requestPayload = serviceRequestPayload(request);
    try {
      const payload = await response.json();
      const rows = Array.isArray(payload?.data) ? payload.data : payload;
      mesListResponses.push({
        resource: requestPayload?.postData?.resource,
        status: response.status(),
        count: Array.isArray(rows) ? rows.length : -1,
        firstWorkOrderNo: Array.isArray(rows) ? rows[0]?.work_order_no : null,
      });
    } catch (error) {
      mesListResponses.push({
        resource: requestPayload?.postData?.resource,
        status: response.status(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  page.on('response', async (response) => {
    const request = response.request();
    if (!isServiceRequest(request, 'admin', 'listNavigationRoutes')) return;
    try {
      const payload = await response.json();
      const rows = Array.isArray(payload?.data) ? payload.data : payload;
      const routes = Array.isArray(rows) ? rows : [];
      navigationDiagnostics = {
        status: response.status(),
        count: routes.length,
        mesRoutes: routes
          .filter((route) => expectedRouteCodes.includes(route?.code))
          .map((route) => ({
            code: route.code,
            parentId: route.parent_id,
            pageCode: route.page_code,
            metadata: route.metadata,
          })),
        businessRoot: routes.find((route) => route?.code === 'business-root') ?? null,
      };
    } catch (error) {
      navigationDiagnostics = {
        status: response.status(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  page.on('request', (request) => {
    const payload = serviceRequestPayload(request);
    if (payload) {
      serviceRequests.push({
        serviceName: payload.serviceName,
        serviceMethod: payload.serviceMethod,
        resource: payload.postData?.resource,
      });
    }
    if (payload?.serviceName === 'mes' && commandMethods.has(payload.serviceMethod)) {
      commandRequests.push({
        method: payload.serviceMethod,
        requestId: request.headers()['x-request-id'],
        postData: payload.postData,
      });
    }
  });

  const separator = previewUrl.includes('?') ? '&' : '?';
  await page.goto(`${previewUrl}${separator}mesE2e=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const storage = window.__localStorage ?? window.localStorage;
    [
      'enlearn_access_token',
      'enlearn_refresh_token',
      'enlearn_active_account_id',
      'enlearn_login_account',
      'enlearn_login_account_set_id',
    ].forEach((key) => storage.removeItem(key));
  });
  await page.reload({ waitUntil: 'networkidle' });

  const accountResponse = page.waitForResponse((response) => (
    response.url().includes('/api/auth/account-options') && response.status() === 200
  ), { timeout: 45_000 });
  await page.locator('input[type="text"]').first().fill(loginAccount);
  await page.locator('input[type="text"]').first().blur();
  await accountResponse;
  await page.locator('input[type="password"]').fill(loginPassword);

  const signInResponse = page.waitForResponse((response) => (
    response.url().includes('/api/auth/signin')
  ), { timeout: 45_000 });
  const navigationRequest = page.waitForRequest((request) => (
    isServiceRequest(request, 'admin', 'listNavigationRoutes')
  ), { timeout: 60_000 });
  await clickText(page, '登录');
  assert.equal((await signInResponse).status(), 201, 'the MES E2E account should sign in');
  await navigationRequest;
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => (
    !document.body.textContent?.includes('正在加载页面')
      && !document.body.textContent?.includes('正在同步菜单')
  ), undefined, { timeout: 60_000 });

  assert.ok(navigationDiagnostics, 'the navigation response should be captured');
  const actualRouteCodes = new Set(
    navigationDiagnostics.mesRoutes?.map((route) => route.code) ?? [],
  );
  for (const code of expectedRouteCodes) {
    assert.ok(actualRouteCodes.has(code), `${code} must be returned to the mobile client`);
  }

  await openMenu(page);
  const production = page.getByText('生产管理', { exact: true }).first();
  await production.waitFor({ state: 'visible' });
  for (const title of expectedPages) {
    await page.getByText(title, { exact: true }).last().waitFor({ state: 'visible' });
  }

  const workOrderResponse = page.waitForResponse((response) => {
    const payload = serviceRequestPayload(response.request());
    return payload?.serviceName === 'mes'
      && payload?.serviceMethod === 'listItems'
      && payload?.postData?.resource === 'mes_work_order_runtime_view';
  }, { timeout: 60_000 });
  await openProductionPage(page, '生产执行工作台');
  const workOrderListResponse = await workOrderResponse;
  const workOrderPayload = await workOrderListResponse.json();
  const workOrders = Array.isArray(workOrderPayload?.data)
    ? workOrderPayload.data
    : Array.isArray(workOrderPayload)
      ? workOrderPayload
      : [];
  const workOrderNo = String(workOrders[0]?.work_order_no ?? '');
  assert.ok(workOrderNo, 'the persistent MES E2E work order should be visible');

  await selectWorkOrder(page, workOrders[0]);
  await page.getByText('开工', { exact: true }).first().waitFor({ state: 'visible' });

  const visibleCommands = new Set();
  for (const label of ['开工', '暂停', '恢复', '报工', '完工', '投料', '退料', '撤销报工', '反向事务']) {
    if (await page.getByText(label, { exact: true }).count()) visibleCommands.add(label);
  }
  assert.ok(
    visibleCommands.size > 0,
    'at least one state-valid MES command should be rendered for persistent E2E facts',
  );

  if (runCommandChain) {
    await clickMesCommand(page, '开工', 'startOperation');

    await page.getByText('暂停', { exact: true }).first().click();
    await confirmMesDialog(page, { 暂停原因: 'E2E 暂停验证' }, '确定', 'pauseOperation');
    await clickMesCommand(page, '恢复', 'resumeOperation');

    await activateTab(page, '投退料');
    await page.getByText('投料', { exact: true }).first().click();
    await confirmMesDialog(page, { 投料数量: '2' }, '确定', 'issueMaterial');
    await page.getByText('退料', { exact: true }).first().click();
    await confirmMesDialog(
      page,
      { 退料数量: '1', 退料原因: 'E2E 退料验证' },
      '确定',
      'returnMaterial',
    );

    await activateTab(page, '工序执行');
    await page.getByText('报工', { exact: true }).first().click();
    await confirmMesDialog(page, { 良品数量: '10', 报废数量: '0' }, '确定', 'reportProduction');
    await clickMesCommand(page, '完工', 'completeOperation');

    await activateTab(page, '生产事务');
    await page.getByText('撤销报工', { exact: true }).first().click();
    await confirmMesDialog(page, { 撤销原因: 'E2E 撤销报工验证' }, '确定', 'reverseProduction');

    await activateTab(page, '物料事务');
    await page.getByText('反向事务', { exact: true }).first().click();
    await confirmMesDialog(page, { 反向原因: 'E2E 反向退料验证' }, '确定', 'reverseMaterial');
    await page.getByText('反向事务', { exact: true }).first().click();
    await confirmMesDialog(page, { 反向原因: 'E2E 反向投料验证' }, '确定', 'reverseMaterial');
  }

  const significantErrors = runtimeErrors.filter((message) => (
    !message.includes('favicon.ico')
      && !message.includes('Failed to load resource')
      && !message.includes('ResizeObserver loop')
  ));
  assert.deepEqual(significantErrors, [], 'the mobile MES pages should not report runtime errors');
  assert.deepEqual(
    failedApiResponses,
    [],
    `the mobile MES page flow should not return failed API responses: ${JSON.stringify(failedApiResponses)}`,
  );

  for (const request of commandRequests) {
    assert.ok(request.requestId, `${request.method} must carry X-Request-Id`);
    assert.equal(request.postData.commandId, request.requestId);
    assert.equal(typeof request.postData.deviceId, 'string');
    assert.ok(Number.isSafeInteger(Number(request.postData.localSequence)));
  }

  if (debugScreenshot) {
    await page.screenshot({
      path: debugScreenshot,
      fullPage: true,
    });
  }

  await context.close();
  console.log(JSON.stringify({
    pages: expectedPages,
    persistentWorkOrder: workOrderNo,
    visibleCommands: [...visibleCommands],
    capturedCommandEnvelopes: commandRequests.length,
    commandChainVerified: runCommandChain,
    mobileMesE2e: true,
  }));
} finally {
  if (debugScreenshot && activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: debugScreenshot, fullPage: true }).catch(() => undefined);
  }
  await browser.close();
}
