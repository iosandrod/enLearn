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
  const url = `http://127.0.0.1:${port}/tests/lowcode-context-drawer-browser.html`;
  await waitForUrl(url);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  const { chromium } = playwrightModule.default;
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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

  await page.evaluate(() => window.__contextDrawerSmoke.openEditableDialog());
  const dialog = page.locator('.vxe-modal--wrapper').last();
  await dialog.waitFor({ state: 'visible' });
  const drawer = page.locator('.lowcode-context-drawer').last();
  await drawer.waitFor({ state: 'visible' });

  const tabs = drawer.locator('.lc-context-drawer__tab');
  assert.equal(await tabs.count(), 4);
  await tabs.filter({ hasText: 'API' }).click();
  await drawer.locator('input').first().fill('records.allowed');
  assert.equal(await drawer.locator('.lc-context-drawer__entry', { hasText: 'records.allowed' }).count(), 1);
  await tabs.filter({ hasText: '函数' }).click();
  await drawer.locator('input').first().fill('读取表单');
  assert.equal(await drawer.locator('.lc-context-drawer__entry', { hasText: '读取表单' }).count(), 1);
  await tabs.filter({ hasText: '节点' }).click();
  await drawer.locator('input').first().fill('records-grid');
  assert.equal(await drawer.locator('.lc-context-drawer__node', { hasText: 'records-grid' }).count(), 1);
  assert.equal(
    await drawer.locator('.lc-context-drawer__node-method', { hasText: 'reloadData' }).count(),
    1,
  );
  await drawer.locator('input').first().fill('record-dialog');
  assert.equal(
    await drawer.locator('.lc-context-drawer__node-method', { hasText: 'open' }).count(),
    1,
  );
  await drawer.locator('input').first().fill('records-form');
  const setDataMethod = drawer.locator(
    '.lc-context-drawer__node-method',
    { hasText: 'setData' },
  ).first();
  assert.equal(await setDataMethod.count(), 1);
  await setDataMethod.click();
  await page.waitForFunction(
    () => window.__contextDrawerSmoke.state.code.value.includes('method: "setData"'),
  );
  await page.evaluate(() => window.__lcMonacoEditors[0].trigger('test', 'undo', null));
  await page.waitForFunction(
    () => window.__contextDrawerSmoke.state.code.value === 'const selected = "replace-me";',
  );
  await tabs.filter({ hasText: '字段' }).click();

  const searchInput = drawer.locator('input').first();
  await searchInput.fill('名称');
  const fieldEntry = drawer.locator('.lc-context-drawer__entry', { hasText: '名称' }).first();
  await fieldEntry.waitFor({ state: 'visible' });

  assert.equal(
    await page.evaluate(() => window.__contextDrawerSmoke.selectText('"replace-me"')),
    true,
  );
  await fieldEntry.click();
  await page.waitForFunction(
    () => window.__contextDrawerSmoke.state.code.value.includes(
      'this.forms["records-form"]?.["name"]',
    ),
    undefined,
    { timeout: 10_000 },
  );
  const insertedCode = await page.evaluate(() => window.__contextDrawerSmoke.state.code.value);
  assert.equal(
    insertedCode,
    'const selected = this.forms["records-form"]?.["name"];',
  );

  await page.evaluate(() => window.__lcMonacoEditors[0].trigger('test', 'undo', null));
  await page.waitForFunction(
    () => window.__contextDrawerSmoke.state.code.value === 'const selected = "replace-me";',
    undefined,
    { timeout: 10_000 },
  );

  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await dialog.waitFor({ state: 'visible' });
  const toggle = dialog.locator('.lc-monaco-editor__context-trigger');
  await toggle.click();
  await drawer.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const box = document.querySelector(
      '.lowcode-context-drawer .vxe-drawer--box',
    )?.getBoundingClientRect();
    return Boolean(
      box &&
        box.left >= 0 &&
        box.right <= window.innerWidth + 1,
    );
  });

  const drawerBox = await drawer.locator('.vxe-drawer--box').boundingBox();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  assert.ok(
    drawerBox &&
      drawerBox.width <= 470 &&
      drawerBox.x >= 0 &&
      drawerBox.x + drawerBox.width <= viewportWidth + 1,
    JSON.stringify({ drawerBox, viewportWidth }),
  );

  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  await page.evaluate(() => window.__contextDrawerSmoke.openReadonlyDialog());
  const readonlyDialog = page.locator('.vxe-modal--wrapper').last();
  await readonlyDialog.waitFor({ state: 'visible' });
  await drawer.waitFor({ state: 'visible' });
  assert.equal(await drawer.locator('.lc-context-drawer__insert').count(), 0);
  const readonlyBefore = await page.evaluate(() => window.__contextDrawerSmoke.state.readonlyCode.value);
  await drawer.locator('.lc-context-drawer__entry').first().click();
  const readonlyAfter = await page.evaluate(() => window.__contextDrawerSmoke.state.readonlyCode.value);
  assert.equal(readonlyAfter, readonlyBefore);

  await page.setViewportSize({ width: 560, height: 720 });
  await page.waitForFunction(() => {
    const box = document.querySelector(
      '.lowcode-context-drawer .vxe-drawer--box',
    )?.getBoundingClientRect();
    return Boolean(
      box &&
        box.left >= 0 &&
        box.right <= window.innerWidth + 1,
    );
  });
  const narrowBox = await drawer.locator('.vxe-drawer--box').boundingBox();
  const narrowViewportWidth = await page.evaluate(() => window.innerWidth);
  assert.ok(
    narrowBox &&
      narrowBox.width <= narrowViewportWidth &&
      narrowBox.x >= 0 &&
      narrowBox.x + narrowBox.width <= narrowViewportWidth + 1,
    JSON.stringify({ narrowBox, narrowViewportWidth }),
  );

  console.log('Low-code context drawer browser smoke passed.');
} catch (error) {
  const debug = context?.pages?.()?.[0]
    ? await context.pages()[0].evaluate(() => ({
        code: window.__contextDrawerSmoke?.state?.code?.value,
        drawers: document.querySelectorAll('.lowcode-context-drawer').length,
        dialogs: document.querySelectorAll('.vxe-modal--wrapper').length,
        active: document.activeElement?.className,
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${serverOutput.slice(-8000)}`,
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
