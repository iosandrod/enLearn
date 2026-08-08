import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const previewUrl = process.env.ENLEARN_MOBILE_PREVIEW_URL
  ?? 'http://127.0.0.1:3100/?path=/login';
const chromePath = process.env.CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const loginAccount = process.env.ENLEARN_MOBILE_E2E_LOGIN ?? 'admin';
const loginPassword = process.env.ENLEARN_MOBILE_E2E_PASSWORD ?? '123456';

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

function dataSourceTableName(payload) {
  return payload?.postData?.tableName
    ?? payload?.postData?.table_name
    ?? payload?.postData?.resource
    ?? payload?.postData?.postData?.tableName
    ?? '';
}

function appendOverlayFixtures(servicePayload) {
  const pageRecord = servicePayload?.data ?? servicePayload;
  if (pageRecord?.code !== 'sales-orders' || !pageRecord.schema) return;

  const actionBlock = pageRecord.schema.blocks?.find((block) => block.kind === 'buttonGroup');
  actionBlock?.actions?.push(
    {
      code: 'e2e-open-modal',
      label: '打开工单弹窗',
      directives: [{ type: 'openBlock', blockId: 'e2e-work-order-modal' }],
    },
    {
      code: 'e2e-open-drawer',
      label: '打开工单抽屉',
      directives: [{ type: 'openBlock', blockId: 'e2e-work-order-drawer' }],
    },
  );

  pageRecord.overlays = [
    ...(Array.isArray(pageRecord.overlays) ? pageRecord.overlays : []),
    {
      id: 'e2e-work-order-modal',
      kind: 'modal',
      title: '工单快速处理',
      description: '嵌套业务操作验证',
      open: false,
      showFooter: true,
      blocks: [{
        id: 'e2e-modal-actions',
        kind: 'buttonGroup',
        actions: [{
          code: 'e2e-open-nested',
          label: '查看工序详情',
          directives: [{ type: 'openBlock', blockId: 'e2e-process-drawer' }],
        }],
      }],
      overlays: [{
        id: 'e2e-process-drawer',
        kind: 'drawer',
        title: '工序详情',
        open: false,
        blocks: [{ id: 'e2e-process-copy', kind: 'text', content: '装配工序 A-10' }],
      }],
    },
    {
      id: 'e2e-work-order-drawer',
      kind: 'drawer',
      title: '工单侧栏',
      open: false,
      blocks: [{ id: 'e2e-drawer-copy', kind: 'text', content: '工单状态：待执行' }],
    },
  ];
}

async function clickButtonByText(page, label) {
  const buttonId = await page.evaluate((text) => (
    [...document.querySelectorAll('span')]
      .filter((node) => node.textContent?.trim() === text)
      .map((node) => node.parentElement?.id)
      .filter(Boolean)
      .at(-1)
  ), label);
  assert.ok(buttonId, `the "${label}" action should be rendered`);
  await page.locator(`[id="${buttonId}"]`).click();
}

async function clickButtonByAriaLabel(page, label, rootSelector = '') {
  const buttonId = await page.evaluate(({ text, root }) => {
    const container = root ? document.querySelector(root) : document;
    return [...(container?.querySelectorAll('button') ?? [])]
      .find((node) => node.getAttribute('aria-label') === text)?.id;
  }, { text: label, root: rootSelector });
  assert.ok(buttonId, `the "${label}" button should be rendered`);
  await page.locator(`[id="${buttonId}"]`).click();
}

async function clickButtonByExactText(page, text, last = false) {
  const targetId = await page.evaluate(({ label, useLast }) => {
    const targets = [...document.querySelectorAll('span')]
      .filter((node) => node.textContent?.trim() === label)
      .map((node) => node.parentElement)
      .filter((node) => node?.id);
    const target = useLast ? targets.at(-1) : targets[0];
    return target?.id;
  }, { label: text, useLast: last });
  assert.ok(targetId, `the "${text}" button should be rendered`);
  await page.locator(`[id="${targetId}"]`).click();
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const runtimeErrors = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.route('**/api/service', async (route) => {
    if (!isServiceRequest(route.request(), 'lowcode', 'getRuntimePage')) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const payload = await response.json();
    appendOverlayFixtures(payload);
    await route.fulfill({ response, json: payload });
  });

  const separator = previewUrl.includes('?') ? '&' : '?';
  await page.goto(`${previewUrl}${separator}e2e=${Date.now()}`, { waitUntil: 'networkidle' });
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

  const accountResponsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/auth/account-options') && response.status() === 200
  ));
  await page.locator('input[type="text"]').first().fill(loginAccount);
  await accountResponsePromise;
  await page.locator('input[type="password"]').fill(loginPassword);

  const signInResponsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/auth/signin')
  ));
  const navigationRequestPromise = page.waitForRequest((request) => (
    isServiceRequest(request, 'admin', 'listNavigationRoutes')
  ));
  const runtimePageRequestPromise = page.waitForRequest((request) => (
    isServiceRequest(request, 'lowcode', 'getRuntimePage')
  ));
  await clickButtonByText(page, '登录');
  const signInResponse = await signInResponsePromise;
  assert.equal(signInResponse.status(), 201, 'the MES test account should sign in');
  await navigationRequestPromise;
  await runtimePageRequestPromise;
  await page.waitForFunction(() => (
    document.body.textContent?.includes('SO-001-ISO-01')
      && document.body.textContent?.includes('销售订单明细')
  ));

  await clickButtonByExactText(page, '☰');
  await page.waitForFunction(() => document.body.textContent?.includes('MES 移动工作台'));
  assert.equal(
    await page.locator('span').evaluateAll((nodes) => nodes.some(
      (node) => node.textContent?.trim() === '销售订单',
    )),
    true,
    'the authorized sales order route should be present in the mobile menu',
  );
  await clickButtonByExactText(page, '×', true);
  await page.waitForFunction(() => !document.body.textContent?.includes('MES 移动工作台'));

  const detailRequestPromise = page.waitForRequest((request) => {
    const payload = serviceRequestPayload(request);
    return payload?.serviceMethod === 'listItems'
      && dataSourceTableName(payload) === 'sales_order_lines'
      && Boolean(payload?.postData?.filters?.order_id);
  });
  const firstOrderRowId = await page.evaluate(() => (
    [...document.querySelectorAll('span')]
      .find((node) => node.textContent?.trim() === 'SO-001-ISO-02')
      ?.closest('[id]')?.id
  ));
  assert.ok(firstOrderRowId, 'the first sales order row should be rendered');
  await page.locator(`[id="${firstOrderRowId}"]`).click();
  const detailRequest = await detailRequestPromise;
  assert.ok(
    serviceRequestPayload(detailRequest)?.postData?.filters?.order_id,
    'selecting an order should load its line records',
  );

  await clickButtonByText(page, '打开工单弹窗');
  await page.waitForFunction(() => document.body.textContent?.includes('工单快速处理'));
  await clickButtonByText(page, '查看工序详情');
  await page.waitForFunction(() => document.body.textContent?.includes('工序详情'));
  await clickButtonByExactText(page, '×', true);
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator('span').evaluateAll((nodes) => nodes.some(
      (node) => node.textContent?.trim() === '装配工序 A-10',
    )),
    false,
    'closing the nested drawer should remove its content',
  );
  await clickButtonByExactText(page, '×', true);
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator('span').evaluateAll((nodes) => nodes.some(
      (node) => node.textContent?.trim() === '嵌套业务操作验证',
    )),
    false,
    'closing the modal should remove its content',
  );

  await clickButtonByText(page, '打开工单抽屉');
  await page.waitForFunction(() => document.body.textContent?.includes('工单侧栏'));
  await clickButtonByExactText(page, '×');
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator('span').evaluateAll((nodes) => nodes.some(
      (node) => node.textContent?.trim() === '工单状态：待执行',
    )),
    false,
    'closing the drawer should remove its content',
  );

  const significantErrors = runtimeErrors.filter((message) => (
    !message.includes('favicon.ico')
      && !message.includes('Failed to load resource')
  ));
  assert.deepEqual(significantErrors, [], 'the MES flow should not report console or page errors');

  if (process.env.ENLEARN_MOBILE_E2E_SCREENSHOT) {
    await page.screenshot({
      path: process.env.ENLEARN_MOBILE_E2E_SCREENSHOT,
      fullPage: true,
    });
  }

  await context.close();
  console.log('MES mobile Web E2E checks passed');
} finally {
  await browser.close();
}
