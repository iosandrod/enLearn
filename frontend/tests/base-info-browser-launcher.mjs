import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.BASE_INFO_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForUrl(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

const port = await freePort();
const server = spawn(
  process.execPath,
  [
    process.platform === 'win32'
      ? 'C:\\Program Files\\nodejs\\node_modules\\pnpm\\bin\\pnpm.cjs'
      : 'pnpm',
    'exec',
    'vite',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  {
    cwd: frontendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  },
);
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

let browser;
let context;
let page;
const pageErrors = [];
const consoleErrors = [];

function formField(label) {
  return page.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: label }),
  }).first();
}

async function openRelationPanel(label) {
  const input = formField(label).locator('.lc-field input').first();
  await input.focus();
  const panel = page.locator('.lc-base-info-pulldown:visible').last();
  await panel.waitFor({ state: 'visible' });
  await panel.locator('.vxe-body--row').first().waitFor({ state: 'visible' });
  return { input, panel };
}

try {
  await waitForUrl(`http://127.0.0.1:${port}`);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(
    `http://127.0.0.1:${port}/tests/base-info-browser.html`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );
  await page.waitForFunction(() => (
    window.__baseInfoSmoke.snapshot().formModels['relation-form'].item_id_label ===
      'RM-MCU-STM32'
  ));
  assert.equal(
    await formField('实体物料').locator('.lc-field input').first().inputValue(),
    'RM-MCU-STM32',
  );

  const entity = await openRelationPanel('实体物料');
  const entityRow = entity.panel.locator('.vxe-body--row').filter({
    hasText: 'RM-MCU-STM32',
  }).first();
  await entityRow.dblclick();
  await formField('实体物料').locator('.lc-base-info:not(.is--visible)').waitFor();
  assert.equal(await entity.input.inputValue(), 'RM-MCU-STM32');
  assert.equal(
    (await formField('物料名称').locator('.vxe-input--readonly').textContent())?.trim(),
    'RM-MCU-STM32',
  );
  assert.equal(
    (await formField('单位').locator('.vxe-input--readonly').textContent())?.trim(),
    'PCS',
  );

  await page.waitForFunction(() => (
    window.__baseInfoSmoke.runtimeEvents.some((event) => (
      event.name === 'form.relateSelect' && event.payload?.row?.id === 'item-1'
    ))
  ));
  let snapshot = await page.evaluate(() => window.__baseInfoSmoke.snapshot());
  assert.equal(snapshot.formModels['relation-form'].item_id, 'item-1');
  assert.equal(snapshot.formModels['relation-form'].item_id_label, 'RM-MCU-STM32');
  assert.equal(snapshot.formModels['relation-form'].item_name, 'RM-MCU-STM32');
  assert.equal(snapshot.formModels['relation-form'].uom, 'PCS');

  await formField('实体物料').locator('.vxe-input').hover();
  await formField('实体物料').locator('.vxe-input--clear-icon').click();
  await page.waitForFunction(() => (
    window.__baseInfoSmoke.snapshot().formModels['relation-form'].item_id === ''
  ));
  snapshot = await page.evaluate(() => window.__baseInfoSmoke.snapshot());
  assert.equal(snapshot.formModels['relation-form'].item_id_label, '');
  assert.equal(snapshot.formModels['relation-form'].item_name, '');
  assert.equal(snapshot.formModels['relation-form'].uom, '');

  const reopenedEntity = await openRelationPanel('实体物料');
  const secondEntityRow = reopenedEntity.panel.locator('.vxe-body--row').filter({
    hasText: 'RM-OTHER-001',
  }).first();
  await secondEntityRow.dblclick();
  await formField('实体物料').locator('.lc-base-info:not(.is--visible)').waitFor();
  assert.equal(await reopenedEntity.input.inputValue(), 'RM-OTHER-001');
  snapshot = await page.evaluate(() => window.__baseInfoSmoke.snapshot());
  assert.equal(snapshot.formModels['relation-form'].item_id, 'item-2');
  assert.equal(snapshot.formModels['relation-form'].item_id_label, 'RM-OTHER-001');
  assert.equal(snapshot.formModels['relation-form'].item_name, 'RM-OTHER-001');
  assert.equal(snapshot.formModels['relation-form'].uom, 'EA');

  const pageSource = await openRelationPanel('页面物料');
  assert.match(await pageSource.panel.locator('.vxe-table--header').innerText(), /物料编码/);
  assert.match(await pageSource.panel.locator('.vxe-table--header').innerText(), /单位/);
  const searchInput = pageSource.panel.locator('.lc-base-info-panel__search input').first();
  await searchInput.fill('OTHER');
  await page.waitForFunction(() => (
    window.__baseInfoSmoke.serviceCalls.some((call) => (
      call.serviceName === 'planning' &&
      call.serviceMethod === 'listItems' &&
      call.payload?.search === 'OTHER'
    ))
  ));
  const visibleRows = pageSource.panel.locator('.vxe-body--row');
  await visibleRows.filter({ hasText: 'RM-OTHER-001' }).first().waitFor({ state: 'visible' });
  assert.equal(await visibleRows.count(), 1);
  assert.match(await visibleRows.first().innerText(), /RM-OTHER-001/);
  await visibleRows.first().dblclick();
  await formField('页面物料').locator('.lc-base-info:not(.is--visible)').waitFor();
  assert.equal(await pageSource.input.inputValue(), 'RM-OTHER-001');
  assert.equal(
    (await formField('页面物料名称').locator('.vxe-input--readonly').textContent())?.trim(),
    'RM-OTHER-001',
  );

  await page.waitForFunction(() => (
    window.__baseInfoSmoke.runtimeEvents.some((event) => (
      event.name === 'form.relateSelect' && event.payload?.row?.id === 'item-2'
    ))
  ));
  const reopenedPageSource = await openRelationPanel('页面物料');
  assert.equal(
    await reopenedPageSource.panel.locator('.lc-base-info-panel__search input').inputValue(),
    '',
  );
  await reopenedPageSource.panel.locator('.vxe-body--row').nth(1).waitFor({ state: 'visible' });
  assert.equal(await reopenedPageSource.panel.locator('.vxe-body--row').count(), 2);
  await reopenedPageSource.panel.locator('.vxe-body--row').filter({
    hasText: 'RM-MCU-STM32',
  }).first().dblclick();
  await formField('页面物料').locator('.lc-base-info:not(.is--visible)').waitFor();
  assert.equal(await reopenedPageSource.input.inputValue(), 'RM-MCU-STM32');

  const result = await page.evaluate(() => ({
    snapshot: window.__baseInfoSmoke.snapshot(),
    runtimeEvents: window.__baseInfoSmoke.runtimeEvents,
    serviceCalls: window.__baseInfoSmoke.serviceCalls,
  }));
  assert.equal(result.snapshot.formModels['relation-form'].page_item_id, 'item-1');
  assert.equal(
    result.snapshot.formModels['relation-form'].page_item_id_label,
    'RM-MCU-STM32',
  );
  assert.ok(result.serviceCalls.some((call) => (
    call.serviceName === 'admin' && call.payload?.resource === 'admin_entities'
  )));
  assert.ok(result.serviceCalls.some((call) => (
    call.serviceName === 'planning' &&
    call.payload?.filters?.id === 'item-1' &&
    call.payload?.limit === 1
  )));
  assert.ok(result.serviceCalls.some((call) => (
    call.serviceName === 'lowcode' && call.payload?.tableName === 'lowcode_pages'
  )));
  const pageSearchCall = result.serviceCalls.find((call) => (
    call.serviceName === 'planning' && call.payload?.search === 'OTHER'
  ));
  assert.ok(pageSearchCall);
  assert.equal(Object.hasOwn(pageSearchCall.payload, 'requiredFilters'), false);
  assert.equal(Object.hasOwn(pageSearchCall.payload?.filters ?? {}, 'id'), false);
  const selectedEvents = result.runtimeEvents.filter(
    (event) => event.name === 'form.relateSelect',
  );
  assert.equal(selectedEvents.length, 4);
  assert.equal(selectedEvents[0].payload.row.uom, 'PCS');
  assert.equal(selectedEvents[1].payload.row.description, 'Other material');
  assert.equal(selectedEvents[2].payload.row.description, 'Other material');
  assert.equal(selectedEvents[3].payload.row.description, 'Main controller');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('Base-info browser integration passed.');
} catch (error) {
  const debug = page
    ? await page.evaluate(() => ({
        smoke: window.__baseInfoSmoke,
        text: document.body.innerText.slice(0, 5000),
        html: document.querySelector('.lowcode-runtime-page')?.innerHTML.slice(0, 12000),
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${pageErrors.join('\n')}\n${consoleErrors.join('\n')}\n${serverOutput.slice(-8000)}`,
  );
} finally {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (process.platform === 'win32' && server.pid) {
    const killer = spawn(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', `taskkill /pid ${server.pid} /t /f >nul 2>nul`],
      { windowsHide: true, stdio: 'ignore' },
    );
    await new Promise((resolve) => killer.once('exit', resolve));
  } else if (server.pid) {
    process.kill(-server.pid, 'SIGTERM');
  }
}
