import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.GRID_LOAD_DATA_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
const page = await context.newPage();
const pageErrors = [];
const failedRequests = [];
const detailRequests = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
});
page.on('request', (request) => {
  if (request.method() !== 'POST' || !request.url().includes('/api/service')) return;

  try {
    const body = request.postDataJSON();
    if (
      body?.serviceName === 'admin' &&
      body?.serviceMethod === 'listItems' &&
      body?.postData?.tableName === 'sales_order_lines'
    ) {
      detailRequests.push(body.postData);
    }
  } catch {
    // Ignore unrelated requests without a JSON body.
  }
});

try {
  await page.goto(`${baseUrl}/dashboard/sales/orders`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(800);
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Page redirected to sign in.');
  assert.equal(
    detailRequests.length,
    0,
    'A detail grid must not request all rows before a main row is selected.',
  );

  const mainGrid = page.locator('.vxe-table:visible').filter({ hasText: '单据日期' }).first();
  const mainRows = mainGrid.locator(
    '.vxe-table--main-wrapper .vxe-table--body-wrapper .vxe-body--row',
  );
  await mainRows.first().waitFor({ state: 'visible' });
  assert.ok(await mainRows.count() >= 2, 'The sales-order main grid must contain two rows.');

  await mainRows.nth(1).click();
  await page.waitForTimeout(500);

  assert.equal(detailRequests.length, 1, 'Selecting one main row must issue one detail request.');
  const detailRequest = detailRequests[0];
  assert.equal(typeof detailRequest.filters?.order_id, 'string');
  assert.ok(detailRequest.filters.order_id.length > 0);
  assert.deepEqual(detailRequest.requiredFilters, ['order_id']);

  const detailGrid = page.locator('.vxe-table:visible').filter({ hasText: '行号' }).last();
  const detailRows = detailGrid.locator(
    '.vxe-table--main-wrapper .vxe-table--body-wrapper .vxe-body--row',
  );
  await detailRows.first().waitFor({ state: 'visible', timeout: 15_000 });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  console.log(JSON.stringify({
    ok: true,
    detailRequest: {
      filters: detailRequest.filters,
      requiredFilters: detailRequest.requiredFilters,
    },
    detailRows: await detailRows.count(),
  }));
} finally {
  await context.close();
  await browser.close();
}
