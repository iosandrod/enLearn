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
    () => window.__buttonScriptDesignerSmoke.state.confirmed?.buttons?.[0]?.script ===
      window.__buttonScriptDesignerSmoke.insertedScript,
  );
  const persisted = await page.evaluate(() => ({
    confirmed: window.__buttonScriptDesignerSmoke.state.confirmed,
    resolved: window.__buttonScriptDesignerSmoke.state.resolved,
    error: window.__buttonScriptDesignerSmoke.state.error,
  }));
  assert.equal(persisted.error, '');
  assert.equal(persisted.confirmed.buttons[0].script, persisted.resolved.buttons[0].script);

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
