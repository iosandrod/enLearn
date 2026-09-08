import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.GRID_DESIGNER_BROWSER ||
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

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
});

try {
  await mkdir(artifactDir, { recursive: true });
  await page.goto(`${baseUrl}/dashboard/sales/orders/edit`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(800);
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Page redirected to sign in.');

  const header = page.locator('.lc-grid .vxe-header--column').filter({ hasText: '物料编码' }).first();
  await header.waitFor({ state: 'visible', timeout: 30_000 });
  await header.click({ button: 'right' });
  const designAction = page.getByText('表格信息设计', { exact: true }).last();
  await designAction.waitFor({ state: 'visible' });
  await designAction.click();

  const dialog = page.locator('.grid-designer-dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });
  const filterTab = dialog.locator('.vxe-tabs-header--item:visible').filter({ hasText: '筛选条件' }).last();
  await filterTab.waitFor({ state: 'visible' });
  await filterTab.click();
  await page.waitForTimeout(250);

  const table = dialog.locator('.lc-array-table:visible').first();
  await table.waitFor({ state: 'visible' });
  const rowsBefore = await table.locator('.vxe-body--row').count();
  assert.ok(rowsBefore >= 1, '筛选条件表格必须至少有一行可编辑数据。');

  const addButton = dialog.getByText('新增条件', { exact: true });
  await addButton.waitFor({ state: 'visible' });
  await addButton.click();
  await page.waitForTimeout(250);

  const rowsAfter = await table.locator('.vxe-body--row').count();
  assert.equal(rowsAfter, rowsBefore + 1, '点击新增条件后筛选条件表格应新增一行。');
  assert.equal(
    await table.locator('.vxe-body--row').last().locator('input').count() > 0,
    true,
    '新增的筛选条件行必须包含可编辑字段。',
  );

  await page.screenshot({ path: join(artifactDir, 'grid-designer-add-condition.png'), fullPage: true });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    filterTab: '筛选条件',
    rowsBefore,
    rowsAfter,
    screenshot: 'artifacts/grid-designer-add-condition.png',
  }));
} finally {
  await context.close();
  await browser.close();
}
