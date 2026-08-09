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

async function openGridDesigner() {
  await page.goto(`${baseUrl}/dashboard/sales/orders/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Page redirected to sign in.');

  const header = page.locator('.lc-grid .vxe-header--column').filter({ hasText: '物料编码' }).first();
  await header.waitFor({ state: 'visible' });
  await header.click({ button: 'right' });
  const designAction = page.getByText('表格信息设计', { exact: true }).last();
  await designAction.waitFor({ state: 'visible' });
  await designAction.click();

  const dialog = page.locator('.grid-designer-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByText('表格信息设计', { exact: true }).click();
  return dialog;
}

async function verifySubForm(dialog, tabLabel, expectedFields) {
  const tab = dialog.locator('.vxe-tabs-header--item').filter({ hasText: tabLabel }).last();
  await tab.click();
  await page.waitForTimeout(150);
  const subForm = dialog.locator('.lc-sub-form:visible').filter({ hasText: expectedFields[0] }).first();
  await subForm.waitFor({ state: 'visible' });
  const text = await subForm.innerText();
  for (const field of expectedFields) {
    assert.match(text, new RegExp(field), `${tabLabel} must render ${field}.`);
  }
  assert.ok(
    await subForm.locator('input, .vxe-switch').count() >= expectedFields.length,
    `${tabLabel} must render an editor for every child field.`,
  );
  const metrics = await subForm.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const fields = Array.from(element.querySelectorAll('.lc-form-grid-cell')).map((field) => {
      const rectangle = field.getBoundingClientRect();
      return { left: rectangle.left, right: rectangle.right };
    });
    return { left: bounds.left, right: bounds.right, fields };
  });
  assert.ok(
    metrics.fields.every(
      (field) => field.left >= metrics.left - 1 && field.right <= metrics.right + 1,
    ),
    `${tabLabel} child controls must stay inside the sub-form panel.`,
  );
}

async function editAndVerifyPersistence(dialog, tabLabel, fieldLabel, value) {
  const tab = dialog.locator('.vxe-tabs-header--item:visible').filter({ hasText: tabLabel }).last();
  await tab.click();
  const field = dialog.locator('.lc-field:visible').filter({ hasText: fieldLabel }).first();
  const input = field.locator('input').first();
  await input.fill(value);
  await input.press('Tab');
  await dialog.locator('.vxe-tabs-header--item:visible').filter({ hasText: '列设计' }).first().click();
  await dialog.getByText('表格信息设计', { exact: true }).click();
  await dialog.locator('.vxe-tabs-header--item:visible').filter({ hasText: tabLabel }).last().click();
  assert.equal(
    await dialog.locator('.lc-field:visible').filter({ hasText: fieldLabel }).first().locator('input').first().inputValue(),
    value,
    `${tabLabel}.${fieldLabel} must survive a tab close/reopen cycle.`,
  );
}

try {
  await mkdir(artifactDir, { recursive: true });
  const dialog = await openGridDesigner();

  await verifySubForm(
    dialog,
    '行配置',
    ['keyField', 'useKey', 'isCurrent', 'isHover', 'resizable', 'drag'],
  );
  await verifySubForm(
    dialog,
    '列配置',
    ['useKey', 'resizable', 'isCurrent', 'isHover', 'drag', 'minWidth'],
  );
  await editAndVerifyPersistence(dialog, '行配置', 'keyField', 'canonical_row_id');
  await editAndVerifyPersistence(dialog, '列配置', 'minWidth', '168');

  await page.screenshot({
    path: join(artifactDir, 'grid-designer-column-config-sub-form.png'),
    fullPage: true,
  });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    screenshot: 'artifacts/grid-designer-column-config-sub-form.png',
  }));
} finally {
  await context.close();
  await browser.close();
}
