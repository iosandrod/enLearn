import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.SEARCH_FORM_BROWSER ||
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
  await page.goto(
    `${baseUrl}/dashboard/low-code/designer/planning_console`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForTimeout(800);
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Designer redirected to sign in.');
  const searchBlockRow = page.locator('.left-aside .layer-row--block').filter({
    has: page.locator('small', { hasText: 'lowcode-search-form' }),
  }).first();
  await searchBlockRow.waitFor({ state: 'visible' });
  await searchBlockRow.click();

  const selectedBlock = page.locator('.simulator-editor-content .list-group-item.focus').first();
  const searchForm = selectedBlock.locator('.lc-form').first();
  await searchForm.waitFor({ state: 'visible' });

  const fieldLabels = await searchForm.locator('.vxe-form--item-title').allTextContents();
  assert.ok(fieldLabels.length > 0, 'The stored search-form schema must render at least one field.');
  const expectedFields = fieldLabels.map((label) => label.trim()).filter(Boolean);
  for (const label of expectedFields) {
    await searchForm.getByText(label, { exact: true }).waitFor({ state: 'visible' });
  }
  assert.equal(
    await searchForm.locator('.vxe-form--item').count() >= expectedFields.length,
    true,
    'The designer must render every database-backed search field through LowCodeForm.',
  );
  assert.equal(
    await searchForm.locator('input').count() >= 2,
    true,
    'The search-form designer must render real input controls.',
  );
  assert.equal(
    await selectedBlock.locator('div[style*="#f8fafc"]').count(),
    0,
    'The search-form designer must not render placeholder input rectangles.',
  );

  const propertyTabs = page.locator(
    '.material-prop-form .lc-form-tabs .vxe-tabs-header--item-name',
  );
  const propertyTabLabels = (await propertyTabs.allTextContents()).map((label) => label.trim());
  for (const label of ['基础', '数据', '查询字段']) {
    assert.ok(propertyTabLabels.includes(label), `Missing search-form property tab: ${label}`);
  }
  await page.locator(
    '.material-prop-form .lc-form-tabs .vxe-tabs-header--item',
  ).filter({ hasText: '数据' }).click();
  await page.getByText('初始值', { exact: true }).last().waitFor({ state: 'visible' });

  await page.screenshot({
    path: join(artifactDir, 'lowcode-search-form-reused-component.png'),
    fullPage: true,
  });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    page: 'planning_console',
    renderedFields: expectedFields,
    screenshot: 'artifacts/lowcode-search-form-reused-component.png',
  }));
} finally {
  await context.close();
  await browser.close();
}
