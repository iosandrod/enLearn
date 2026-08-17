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
const screenshotPath = join(artifactDir, 'grid-selection-column-runtime.png');
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

const grid = () => page.locator('.lc-grid').filter({
  has: page.locator('.vxe-header--column', { hasText: '物料编码' }),
}).first();

async function openGridDesigner() {
  const runtimeGrid = grid();
  await runtimeGrid.locator('.vxe-header--column').filter({ hasText: '物料编码' }).first()
    .click({ button: 'right' });
  await page.getByText('表格信息设计', { exact: true }).last().click();

  const dialog = page.locator('.grid-designer-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByText('表格信息设计', { exact: true }).click();
  await dialog.locator('.vxe-tabs-header--item:visible').filter({ hasText: '表单设置' }).last()
    .click();
  return dialog;
}

async function setSelectionMode(dialog, label) {
  const field = dialog.locator('[data-lc-field="selectionColumnType"]:visible');
  await field.waitFor({ state: 'visible' });
  if (await field.locator('input').inputValue() === label) return false;

  await field.locator('.vxe-select').click();
  await page.locator('.vxe-select--panel:visible .vxe-select-option')
    .filter({ hasText: label })
    .click();
  await page.waitForTimeout(200);
  assert.equal(await field.locator('input').inputValue(), label);
  return true;
}

async function confirmDesigner(dialog) {
  await dialog.getByText('确定', { exact: true }).last().click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForTimeout(1_000);
}

try {
  await mkdir(artifactDir, { recursive: true });
  await page.goto(`${baseUrl}/dashboard/sales/orders/edit`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(500);
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Page redirected to sign in.');

  let dialog = await openGridDesigner();
  const selectionField = dialog.locator('[data-lc-field="selectionColumnType"]:visible');
  const originalMode = await selectionField.locator('input').inputValue();
  const originalSelectionType = originalMode === '复选'
    ? 'checkbox'
    : originalMode === '单选'
      ? 'radio'
      : '';

  const changedToCheckbox = await setSelectionMode(dialog, '复选');
  assert.equal(
    await dialog.locator('[data-lc-field="selectionColumnWidth"]:visible').count(),
    1,
    'Selection width must appear when the selection column is enabled.',
  );

  await dialog.locator('.vxe-tabs-header--item:visible').filter({ hasText: '列设计' }).first()
    .click();
  await page.waitForTimeout(250);
  const firstRowValues = await dialog.locator('.lc-array-table .vxe-body--row').first()
    .locator('input')
    .evaluateAll((elements) => elements.map((element) => element.value));
  assert.equal(firstRowValues[0], '', 'A selection column must remain fieldless.');
  assert.equal(firstRowValues[1], '', 'A selection column must remain titleless.');
  assert.equal(firstRowValues[3], '复选');
  assert.equal(firstRowValues[4], '48');

  await confirmDesigner(dialog);
  await grid().locator('.vxe-header--column.col--checkbox').first().waitFor({
    state: 'attached',
    timeout: changedToCheckbox ? 5_000 : 1_000,
  });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  dialog = await openGridDesigner();
  const restoredOriginalMode = await setSelectionMode(dialog, originalMode);
  await confirmDesigner(dialog);
  if (!originalSelectionType && restoredOriginalMode) {
    assert.equal(
      await grid().locator('.vxe-header--column.col--checkbox, .vxe-header--column.col--radio').count(),
      0,
      'The test must restore the original disabled selection-column state.',
    );
  }

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    restoredMode: originalMode,
    screenshot: 'artifacts/grid-selection-column-runtime.png',
  }));
} finally {
  await context.close();
  await browser.close();
}
