import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.RUNTIME_GRID_FIELD_BROWSER ||
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

async function headerCell(label) {
  const cell = page.locator('.vxe-header--column').filter({
    has: page.locator('.vxe-cell--title', { hasText: label }),
  }).first();
  await cell.waitFor({ state: 'visible' });
  return cell;
}

async function openFieldEditor(label) {
  await (await headerCell(label)).click({ button: 'right' });
  const menuItem = page.locator(
    '.lc-page-grid-header-context-menu .vxe-table--context-menu--option',
    { hasText: '设计当前字段' },
  ).last();
  await menuItem.waitFor({ state: 'visible' });
  await menuItem.click();
  const dialog = page.locator('.runtime-form-field-editor-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  return dialog;
}

try {
  await waitForUrl(`http://127.0.0.1:${port}`);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(
    `http://127.0.0.1:${port}/tests/runtime-grid-field-editor-browser.html`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );
  await headerCell('物料编码');

  await (await headerCell('序号')).click({ button: 'right' });
  const sequenceMenu = page.locator(
    '.lc-page-grid-header-context-menu .vxe-table--context-menu--option',
    { hasText: '设计当前字段' },
  ).last();
  await sequenceMenu.waitFor({ state: 'visible' });
  await sequenceMenu.click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.runtime-form-field-editor-dialog:visible').count(), 0);

  const itemDialog = await openFieldEditor('物料编码');
  assert.equal(await itemDialog.locator('.vxe-tabs-header--item').count(), 4);
  const itemField = (field) => itemDialog.locator(`[data-lc-field="${field}"]`).first();
  assert.equal((await itemField('field').textContent()).trim(), '字段编码itemCode');
  assert.equal(await itemField('label').locator('input').inputValue(), '物料编码');
  await itemField('label').locator('input').fill('物料编码已设计');
  await itemField('required').locator('button, input').first().click();
  await itemDialog.locator('.lc-global-dialog__footer .vxe-button', { hasText: '保存' }).click();
  await itemDialog.waitFor({ state: 'hidden' });
  await headerCell('物料编码已设计');

  const dateDialog = await openFieldEditor('需求日期');
  const dateComponent = dateDialog.locator('[data-lc-field="component"]').first();
  assert.ok(
    ['输入框', 'vxe-input'].includes(await dateComponent.locator('input').inputValue()),
    'Date columns must use a valid value from the shared form component schema.',
  );
  await dateDialog.locator('.lc-global-dialog__footer .vxe-button', { hasText: '保存' }).click();
  await dateDialog.waitFor({ state: 'hidden' });

  const result = await page.evaluate(() => ({
    pageRecord: JSON.parse(JSON.stringify(window.__runtimeGridFieldEditorSmoke.pageRecord)),
    saveCalls: JSON.parse(JSON.stringify(window.__runtimeGridFieldEditorSmoke.saveCalls)),
  }));
  const block = result.pageRecord.schema.blocks.find(
    (candidate) => candidate.id === 'runtime-detail-grid',
  );
  assert.equal(result.saveCalls.length, 2);
  assert.equal(block.schema.grid.columns[1].title, '物料编码已设计');
  assert.equal(block.schema.grid.columns[1].field, 'itemCode');
  assert.equal(block.schema.grid.columns[1].editRender.name, 'VxeInput');
  assert.equal(block.schema.grid.editRules.itemCode.some((rule) => rule.required), true);
  assert.equal(block.schema.grid.columns[2].field, 'needDate');
  assert.equal(block.schema.grid.columns[2].editRender.name, 'VxeDatePicker');
  assert.equal(
    block.schema.grid.columns[2].params.lowcodeField.gridRendererName,
    'VxeDatePicker',
  );
  assert.equal(block.schema.grid.columns[3].title, '操作');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  console.log('Runtime grid field editor browser integration passed.');
} catch (error) {
      const debug = page
    ? await page.evaluate(() => ({
        smoke: window.__runtimeGridFieldEditorSmoke,
        dialogHtml: document.querySelector('.runtime-form-field-editor-dialog')?.innerHTML.slice(0, 12000),
        text: document.body.innerText.slice(0, 5000),
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
