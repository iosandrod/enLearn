import assert from 'node:assert/strict';
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
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
const page = await context.newPage();

const grid = () => page.locator('.lc-grid').filter({
  has: page.locator('.vxe-header--column', { hasText: '物料编码' }),
}).first();

async function openColumnDesigner() {
  await grid().locator('.vxe-header--column').filter({ hasText: '物料编码' }).first()
    .click({ button: 'right' });
  await page.getByText('表格信息设计', { exact: true }).last().click();

  const dialog = page.locator('.grid-designer-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByText('表格信息设计', { exact: true }).click();
  await dialog.locator('.vxe-tabs-header--item:visible').filter({ hasText: '列设计' }).first()
    .click();
  return dialog;
}

try {
  await page.goto(`${baseUrl}/dashboard/sales/orders/edit`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Page redirected to sign in.');

  const dialog = await openColumnDesigner();
  const input = dialog.locator('.lc-array-table .vxe-body--row input:not([readonly]):visible').first();
  await input.waitFor({ state: 'visible' });
  const initialValue = await input.inputValue();
  const original = await input.elementHandle();
  assert.ok(original, 'The first column-design input must exist.');

  await input.focus();
  await page.keyboard.press('End');
  await page.keyboard.insertText('x');
  await page.waitForTimeout(250);

  assert.equal(
    await original.evaluate((element) => document.activeElement === element),
    true,
    'Typing in an array-table input must retain focus on that same input.',
  );
  assert.equal(
    await original.evaluate((element) => element.value),
    `${initialValue}x`,
    'Typing in an array-table input must retain the new model value.',
  );

  await dialog.getByText('取消', { exact: true }).last().click();
  console.log(JSON.stringify({ ok: true, value: `${initialValue}x` }));
} finally {
  await context.close();
  await browser.close();
}
