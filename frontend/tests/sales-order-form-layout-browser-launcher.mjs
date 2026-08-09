import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.SALES_ORDER_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const artifactDir = join(workspaceDir, 'artifacts');
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
const expectedTabs = ['单据信息', '客户与收货', '商务条款', '金额汇总', '来源与备注'];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
});

async function open(path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  assert.notEqual(new URL(page.url()).pathname, '/signin', `${path} redirected to sign in.`);
}

async function verifySalesOrderTabs(scope, pageName, interactive = true) {
  const tabs = scope.locator('.lc-form-tabs').first();
  await tabs.waitFor({ state: 'visible' });
  const labels = (await tabs.locator('.vxe-tabs-header--item-name').allTextContents())
    .map((label) => label.trim());
  assert.deepEqual(labels, expectedTabs, `${pageName} must render the five sales-order tabs.`);

  if (!interactive) return;

  for (const label of expectedTabs) {
    await tabs.locator('.vxe-tabs-header--item').filter({ hasText: label }).click();
    await page.waitForTimeout(100);
    const activeLabels = await tabs.locator(
      '.vxe-tabs-header--item.is--active .vxe-tabs-header--item-name',
    ).allTextContents();
    assert.ok(
      activeLabels.some((value) => value.trim() === label),
      `${pageName} could not activate ${label}.`,
    );
  }
}

try {
  await mkdir(artifactDir, { recursive: true });

  await open('/dashboard/sales/orders/edit');
  await verifySalesOrderTabs(page.locator('main, body').last(), 'Runtime page');
  await page.screenshot({
    path: join(artifactDir, 'sales-order-runtime-tabs.png'),
    fullPage: true,
  });

  await open('/dashboard/low-code/designer/sales-orders-edit');
  const salesOrderForm = page.locator('.lc-form').filter({ hasText: '订单号' }).first();
  await salesOrderForm.waitFor({ state: 'visible' });
  await verifySalesOrderTabs(salesOrderForm, 'Visual designer', false);
  const formStructure = page.locator('.left-aside .layer-group').filter({
    has: page.locator('.layer-row--slot', { hasText: '表单结构' }),
  }).first();
  await formStructure.waitFor({ state: 'visible' });
  const outlineText = await formStructure.innerText();
  for (const label of expectedTabs) {
    assert.match(outlineText, new RegExp(label), `The form outline must include ${label}.`);
  }
  await page.screenshot({
    path: join(artifactDir, 'sales-order-designer-tabs.png'),
    fullPage: true,
  });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    tabs: expectedTabs,
    screenshots: [
      'artifacts/sales-order-runtime-tabs.png',
      'artifacts/sales-order-designer-tabs.png',
    ],
  }));
} finally {
  await context.close();
  await browser.close();
}
