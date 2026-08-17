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

async function openColumnDesigner() {
  const runtimeGrid = grid();
  await runtimeGrid.locator('.vxe-header--column').filter({ hasText: '物料编码' }).first()
    .click({ button: 'right' });
  await page.getByText('表格信息设计', { exact: true }).last().click();

  const dialog = page.locator('.grid-designer-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByText('表格信息设计', { exact: true }).click();
  await dialog.locator('.vxe-tabs-header--item:visible').filter({ hasText: '列设计' }).first()
    .click();
  await dialog.locator('.lc-array-table .vxe-cell--drag-handle').first().waitFor({
    state: 'visible',
  });
  return dialog;
}

async function readRows(dialog) {
  return dialog.locator('.lc-array-table .vxe-body--row').evaluateAll((rows) =>
    rows.map((row, domIndex) => ({
      domIndex,
      values: [...row.querySelectorAll('input')].map((input) => input.value),
    })),
  );
}

async function dragRowAfter(dialog, sourceIndex, targetIndex) {
  const rows = dialog.locator('.lc-array-table .vxe-body--row');
  const source = rows.nth(sourceIndex).locator('.vxe-cell--drag-handle');
  const target = rows.nth(targetIndex);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(sourceBox, 'The source row drag handle must be visible.');
  assert.ok(targetBox, 'The target row must be visible.');

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 12,
    sourceBox.y + sourceBox.height / 2 + 8,
    { steps: 4 },
  );
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height * 0.8,
    { steps: 12 },
  );
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

async function confirmDesigner(dialog) {
  const saveRequest = page.waitForRequest((request) =>
    request.method() !== 'GET' && request.postData()?.includes('lowcode_pages'),
  );
  await dialog.getByText('确定', { exact: true }).last().click();
  await saveRequest;
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForTimeout(1_000);
}

try {
  await page.goto(`${baseUrl}/dashboard/sales/orders/edit`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(500);
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Page redirected to sign in.');

  let dialog = await openColumnDesigner();
  const originalRows = await readRows(dialog);
  const dataRows = originalRows.filter((row) => row.values[0]?.trim());
  assert.ok(dataRows.length >= 2, 'The column designer needs at least two data columns.');
  const [first, second] = dataRows;
  const firstField = first.values[0];
  const secondField = second.values[0];

  await dragRowAfter(dialog, first.domIndex, second.domIndex);
  let currentDataRows = (await readRows(dialog)).filter((row) => row.values[0]?.trim());
  assert.deepEqual(
    currentDataRows.slice(0, 2).map((row) => row.values[0]),
    [secondField, firstField],
    'Dragging the first data column below the second must swap their model order.',
  );

  await confirmDesigner(dialog);

  dialog = await openColumnDesigner();
  currentDataRows = (await readRows(dialog)).filter((row) => row.values[0]?.trim());
  assert.deepEqual(
    currentDataRows.slice(0, 2).map((row) => row.values[0]),
    [secondField, firstField],
    'The persisted column designer must reopen with the dragged row order.',
  );
  await dragRowAfter(dialog, currentDataRows[0].domIndex, currentDataRows[1].domIndex);
  currentDataRows = (await readRows(dialog)).filter((row) => row.values[0]?.trim());
  assert.deepEqual(
    currentDataRows.slice(0, 2).map((row) => row.values[0]),
    [firstField, secondField],
    'The browser test must restore the original designer order.',
  );
  await confirmDesigner(dialog);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    reordered: [secondField, firstField],
    restored: [firstField, secondField],
  }));
} finally {
  await context.close();
  await browser.close();
}
