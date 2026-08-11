import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.GRID_TABLE_TYPE_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const artifactDir = join(workspaceDir, 'artifacts');
const screenshotPath = join(artifactDir, 'grid-table-type-property.png');
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
let gridDefinition;

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
});
page.on('response', async (response) => {
  if (response.request().method() !== 'POST' || !response.url().includes('/api/service')) return;

  let postData;
  try {
    postData = response.request().postDataJSON();
  } catch {
    return;
  }
  if (
    postData?.serviceName !== 'lowcode' ||
    postData?.serviceMethod !== 'listItems' ||
    postData?.postData?.resource !== 'lowcode_form_definitions'
  ) return;

  const body = await response.json().catch(() => undefined);
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  gridDefinition = rows.find((row) => row?.code === 'material-prop.lowcode-grid');
});

function readOptionLabels() {
  return page.locator(
    '.vxe-pulldown--panel:visible .vxe-select-option--label, ' +
    '.vxe-select--panel:visible .vxe-select-option--label, ' +
    '.vxe-select-option:visible',
  ).allTextContents();
}

try {
  await mkdir(artifactDir, { recursive: true });
  await page.goto(
    `${baseUrl}/dashboard/low-code/designer/admin-system-options-edit`,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await page.waitForTimeout(800);
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Designer redirected to sign in.');

  const gridRow = page.locator('.left-aside .layer-row--block').filter({
    has: page.locator('small', { hasText: 'lowcode-grid' }),
  }).first();
  await gridRow.waitFor({ state: 'visible' });
  await gridRow.click();

  const propertyForm = page.locator('.material-prop-form');
  await propertyForm.waitFor({ state: 'visible' });
  const basicTab = propertyForm.locator('.vxe-tabs-header--item').filter({ hasText: '基础' });
  await basicTab.waitFor({ state: 'visible' });
  await basicTab.click();

  const tableTypeField = propertyForm.locator('.lc-form-item').filter({
    has: page.getByText('表格类型', { exact: true }),
  }).first();
  await tableTypeField.waitFor({ state: 'visible' });
  const select = tableTypeField.locator('.vxe-select').first();
  await select.click();

  const expectedOptions = ['main', 'detail', 'default'];
  await page.getByText('main', { exact: true }).last().waitFor({ state: 'visible' });
  const optionLabels = (await readOptionLabels()).map((label) => label.trim()).filter(Boolean);
  for (const option of expectedOptions) {
    assert.ok(optionLabels.includes(option), `Missing table type option: ${option}`);
  }

  await page.getByText('main', { exact: true }).last().click();
  await page.waitForTimeout(150);
  assert.equal(await tableTypeField.locator('input').first().inputValue(), 'main');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await select.click();
  await page.getByText('detail', { exact: true }).last().click();
  await page.waitForTimeout(150);
  assert.equal(await tableTypeField.locator('input').first().inputValue(), 'detail');

  const basicBlocks = gridDefinition?.schema?.layout?.[0]?.tabs
    ?.find((tab) => tab?.key === 'basic')?.blocks;
  assert.ok(
    Array.isArray(basicBlocks) && basicBlocks.some((block) => block?.field === 'tableType'),
    'The database-backed Grid basic tab must contain tableType.',
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);

  console.log(JSON.stringify({
    ok: true,
    options: expectedOptions,
    verifiedValues: ['main', 'detail'],
    screenshot: 'artifacts/grid-table-type-property.png',
  }));
} finally {
  await context.close();
  await browser.close();
}
