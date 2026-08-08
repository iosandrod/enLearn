import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.BUTTON_SCRIPT_BROWSER ||
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
const pageErrors = [];
try {
  const url = `http://127.0.0.1:${port}/tests/button-script-designer-browser.html`;
  await waitForUrl(url);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  const { chromium } = playwrightModule.default;
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );
  const bootResult = JSON.parse(await page.locator('#result').textContent());
  assert.equal(bootResult.ok, true, pageErrors.join('\n'));

  await page.evaluate(() => window.__buttonScriptDesignerSmoke.open());
  const designer = page.locator('.button-group-designer-dialog').last();
  await designer.waitFor({ state: 'visible' });
  assert.ok((await designer.textContent()).includes('执行脚本'));
  assert.ok((await designer.textContent()).includes('选择默认按钮'));

  const buttonTableFill = await designer.evaluate((dialog) => {
    const pane = dialog.querySelector('.vxe-tabs-pane--item.is--visible');
    const grid = pane?.querySelector('.lc-form-grid');
    const table = pane?.querySelector('.lc-array-table');
    if (!grid || !table) return null;
    const gridRect = grid.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    return {
      gridHeight: gridRect.height,
      tableHeight: tableRect.height,
      bottomDelta: Math.abs(gridRect.bottom - tableRect.bottom),
    };
  });
  assert.ok(buttonTableFill, 'The button table must render inside the form grid.');
  assert.ok(
    buttonTableFill.tableHeight > buttonTableFill.gridHeight * 0.95 &&
      buttonTableFill.bottomDelta < 2,
    `The button table must fill its flexible form row: ${JSON.stringify(buttonTableFill)}`,
  );

  await page.setViewportSize({ width: 900, height: 520 });
  await page.waitForFunction(() => {
    const dialog = document.querySelector('.button-group-designer-dialog');
    const formGrid = dialog?.querySelector('.vxe-tabs-pane--item.is--visible .lc-form-grid');
    const table = dialog?.querySelector('.lc-array-table');
    if (!formGrid || !table) return false;
    const formGridRect = formGrid.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    return (
      Math.abs(formGridRect.height - tableRect.height) < 2 &&
      Math.abs(formGridRect.bottom - tableRect.bottom) < 2
    );
  });
  const compactTableFill = await designer.evaluate((dialog) => {
    const pane = dialog.querySelector('.vxe-tabs-pane--item.is--visible');
    const formGrid = pane?.querySelector('.lc-form-grid');
    const table = pane?.querySelector('.lc-array-table');
    const viewport = pane?.querySelector('.lc-array-table__viewport');
    const vxeTable = pane?.querySelector('.lc-array-table__grid');
    if (!formGrid || !table || !viewport || !vxeTable) return null;
    const formGridRect = formGrid.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const vxeTableRect = vxeTable.getBoundingClientRect();
    return {
      formGridHeight: formGridRect.height,
      tableHeight: tableRect.height,
      viewportHeight: viewportRect.height,
      vxeTableHeight: vxeTableRect.height,
      tableBottomDelta: Math.abs(formGridRect.bottom - tableRect.bottom),
      gridBottomDelta: Math.abs(viewportRect.bottom - vxeTableRect.bottom),
    };
  });
  assert.ok(compactTableFill, 'The compact button table must remain measurable.');
  assert.ok(
    Math.abs(compactTableFill.formGridHeight - compactTableFill.tableHeight) < 2 &&
      compactTableFill.tableBottomDelta < 2 &&
      Math.abs(compactTableFill.viewportHeight - compactTableFill.vxeTableHeight) < 2 &&
      compactTableFill.gridBottomDelta < 2,
    `System table minimums must not overflow a fill-height table: ${JSON.stringify(compactTableFill)}`,
  );
  await page.setViewportSize({ width: 1440, height: 900 });

  await designer.locator('.vxe-tabs-header--item', { hasText: '组件信息' }).click();
  const infoGrid = designer.locator('.vxe-tabs-pane--item.is--visible .lc-form-grid');
  await page.waitForFunction(() => {
    const grid = document.querySelector(
      '.button-group-designer-dialog .vxe-tabs-pane--item.is--visible .lc-form-grid',
    );
    if (!grid) return false;
    const rows = getComputedStyle(grid).gridTemplateRows
      .split(' ')
      .map((value) => Number.parseFloat(value));
    return rows.length === 3 && rows[2] > rows[0] * 2;
  });
  const infoRows = await infoGrid.evaluate((grid) =>
    getComputedStyle(grid).gridTemplateRows
      .split(' ')
      .map((value) => Number.parseFloat(value)),
  );
  assert.equal(infoRows.length, 3, JSON.stringify(infoRows));
  assert.ok(
    Math.max(infoRows[0], infoRows[1]) < 140,
    `Leading form rows must stay content-sized: ${JSON.stringify(infoRows)}`,
  );
  assert.ok(
    infoRows[2] > Math.max(infoRows[0], infoRows[1]) * 2,
    `Only the final form row should absorb remaining height: ${JSON.stringify(infoRows)}`,
  );
  await designer.locator('.vxe-tabs-header--item', { hasText: '按钮设计' }).click();

  await designer.locator('.lc-array-table__toolbar .vxe-button', {
    hasText: '新增按钮',
  }).click();
  const mainRows = designer.locator(
    '.lc-array-table__grid .vxe-table--main-wrapper .vxe-body--row',
  );
  await assert.doesNotReject(() => mainRows.nth(1).waitFor({ state: 'visible' }));
  const addedRowInputs = mainRows.nth(1).locator('.vxe-input input');
  await addedRowInputs.nth(0).fill('新增');
  await addedRowInputs.nth(1).fill('create');

  const scriptTrigger = designer.locator('.lc-monaco-editor__trigger').first();
  await scriptTrigger.scrollIntoViewIfNeeded();
  await scriptTrigger.click();

  const scriptDialog = page.locator('.lc-monaco-editor-dialog').last();
  const drawer = page.locator('.lowcode-context-drawer').last();
  await scriptDialog.waitFor({ state: 'visible' });
  await drawer.waitFor({ state: 'visible' });
  const scriptDialogBox = await scriptDialog.locator('.vxe-modal--box').boundingBox();
  const contextDrawerBox = await drawer.locator('.vxe-drawer--box').boundingBox();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  assert.ok(scriptDialogBox && contextDrawerBox);
  assert.ok(
    scriptDialogBox.x + scriptDialogBox.width <= contextDrawerBox.x - 8,
    JSON.stringify({ scriptDialogBox, contextDrawerBox }),
  );
  assert.ok(
    scriptDialogBox.x + scriptDialogBox.width / 2 < viewportWidth / 2,
    JSON.stringify({ scriptDialogBox, viewportWidth }),
  );
  assert.equal(
    await page.evaluate(() => window.__buttonScriptDesignerSmoke.editorValue()),
    'const selected = "replace-me";',
  );

  const fieldTab = drawer.locator('.lc-context-drawer__tab').filter({ hasText: '字段' });
  await fieldTab.click();
  await drawer.locator('input').first().fill('名称');
  assert.equal(
    await page.evaluate(() => window.__buttonScriptDesignerSmoke.selectText('"replace-me"')),
    true,
  );
  await drawer.locator('.lc-context-drawer__entry', { hasText: '名称' }).first().click();
  await page.waitForFunction(
    () => window.__buttonScriptDesignerSmoke.editorValue() ===
      window.__buttonScriptDesignerSmoke.insertedScript,
  );

  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await scriptDialog.locator('.lc-global-dialog__footer .vxe-button', { hasText: '取消' }).click();
  await scriptDialog.waitFor({ state: 'hidden' });
  assert.equal(
    await designer.locator('.lc-monaco-editor--dialog-input input').first().inputValue(),
    'const selected = "replace-me";',
    'Cancelling the nested editor must leave the table cell unchanged.',
  );

  await scriptTrigger.click();
  await scriptDialog.waitFor({ state: 'visible' });
  await drawer.waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(() => window.__buttonScriptDesignerSmoke.editorValue()),
    'const selected = "replace-me";',
  );
  assert.equal(
    await page.evaluate(() => window.__buttonScriptDesignerSmoke.selectText('"replace-me"')),
    true,
  );
  await drawer.locator('.lc-context-drawer__entry', { hasText: '名称' }).first().click();
  await page.waitForFunction(
    () => window.__buttonScriptDesignerSmoke.editorValue() ===
      window.__buttonScriptDesignerSmoke.insertedScript,
  );
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await scriptDialog.locator('.lc-global-dialog__footer .vxe-button', { hasText: '确定' }).click();
  await scriptDialog.waitFor({ state: 'hidden' });
  assert.equal(
    await designer.locator('.lc-monaco-editor--dialog-input input').first().inputValue(),
    'const selected = this.forms["records-form"]?.["name"];',
  );

  await scriptTrigger.click();
  await scriptDialog.waitFor({ state: 'visible' });
  await drawer.waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(() => window.__buttonScriptDesignerSmoke.editorValue()),
    'const selected = this.forms["records-form"]?.["name"];',
    'Reopening the nested editor must retain the confirmed script.',
  );
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await scriptDialog.locator('.lc-global-dialog__footer .vxe-button', { hasText: '确定' }).click();
  await scriptDialog.waitFor({ state: 'hidden' });

  await designer.locator('.lc-global-dialog__footer .vxe-button', { hasText: '确定' }).click();
  await designer.waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () => window.__buttonScriptDesignerSmoke.state.confirmed &&
      window.__buttonScriptDesignerSmoke.state.resolved,
  );
  const persisted = await page.evaluate(() => ({
    confirmed: window.__buttonScriptDesignerSmoke.state.confirmed,
    resolved: window.__buttonScriptDesignerSmoke.state.resolved,
    error: window.__buttonScriptDesignerSmoke.state.error,
    insertedScript: window.__buttonScriptDesignerSmoke.insertedScript,
    ambientForms: window.__buttonScriptDesignerSmoke.ambientRuntime.state.forms,
  }));
  assert.equal(persisted.error, '');
  assert.equal(persisted.confirmed.buttons.length, 2);
  assert.equal(persisted.confirmed.buttons[1].label, '新增');
  assert.equal(persisted.confirmed.buttons[1].code, 'create');
  assert.equal(persisted.confirmed.buttons[0].script, persisted.insertedScript);
  assert.equal(persisted.confirmed.buttons[0].script, persisted.resolved.buttons[0].script);
  assert.equal(
    Object.hasOwn(persisted.ambientForms, 'button-group-designer-buttons-form'),
    false,
    'An ambient page runtime must not take ownership of the designer form model.',
  );

  console.log('Button script designer browser integration passed.');
} catch (error) {
  const debug = context?.pages?.()?.[0]
    ? await context.pages()[0].evaluate(() => ({
        editorValue: window.__buttonScriptDesignerSmoke?.editorValue?.(),
        state: window.__buttonScriptDesignerSmoke?.state,
        drawers: document.querySelectorAll('.lowcode-context-drawer').length,
        dialogs: document.querySelectorAll('.vxe-modal--wrapper').length,
        text: document.body.innerText.slice(0, 3000),
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${pageErrors?.join?.('\n') ?? ''}\n${serverOutput.slice(-8000)}`,
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
