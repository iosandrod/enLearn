import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.BUTTON_SCRIPT_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const desktopScreenshotPath = join(
  workspaceDir,
  'artifacts/lowcode-page-category-drawer-desktop.png',
);
const mobileScreenshotPath = join(
  workspaceDir,
  'artifacts/lowcode-page-category-drawer-mobile.png',
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

async function assertInsideViewport(page) {
  const layout = await page.evaluate(() => {
    const shell = document.querySelector('.lowcode-runtime-shell')?.getBoundingClientRect();
    const drawer = document.querySelector('.lowcode-category-drawer')?.getBoundingClientRect();
    const content = document.querySelector('.lowcode-runtime-page')?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      shell: shell && { left: shell.left, right: shell.right, width: shell.width },
      drawer: drawer && { left: drawer.left, right: drawer.right, width: drawer.width },
      content: content && { left: content.left, right: content.right, width: content.width },
    };
  });
  assert.ok(layout.shell && layout.drawer && layout.content, JSON.stringify(layout));
  assert.ok(layout.documentWidth <= layout.viewportWidth + 1, JSON.stringify(layout));
  assert.ok(layout.drawer.left >= -1, JSON.stringify(layout));
  assert.ok(layout.drawer.right <= layout.viewportWidth + 1, JSON.stringify(layout));
  assert.ok(layout.content.right <= layout.viewportWidth + 1, JSON.stringify(layout));
  return layout;
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
  await mkdir(dirname(desktopScreenshotPath), { recursive: true });
  const url = `http://127.0.0.1:${port}/tests/lowcode-page-category-drawer-browser.html`;
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

  const drawer = page.locator('.lowcode-category-drawer');
  const content = page.locator('.lowcode-runtime-page');
  await drawer.waitFor({ state: 'visible' });
  await page.locator('.lc-category-tree-node__label', { hasText: '原材料' }).waitFor();
  assert.equal(await page.getByText('板材', { exact: true }).count(), 1);
  assert.equal(await page.getByText('紧固件', { exact: true }).count(), 1);
  assert.equal(await page.getByText('成品', { exact: true }).count(), 1);

  const calls = await page.evaluate(() => window.__categoryDrawerSmoke.calls);
  assert.deepEqual(calls, [{
    serviceName: 'planning',
    serviceMethod: 'listRelationOptions',
    payload: {
      resource: 'planning_category',
      labelField: 'name',
      filters: { target_type: 'item', status: 'active' },
      tree: true,
    },
  }]);

  const rawMaterialsRow = page.locator('.lc-category-tree-node__row', { hasText: '原材料' }).first();
  const branchToggle = rawMaterialsRow.locator('.lc-category-tree-node__toggle');
  await branchToggle.click();
  assert.equal(await page.getByText('板材', { exact: true }).count(), 0);
  await branchToggle.click();
  await page.getByText('板材', { exact: true }).waitFor();

  await page.locator('.lc-category-tree-node__label', { hasText: '板材' }).click();
  await page.waitForFunction(() => window.__categoryDrawerSmoke.events.length > 0);
  const selectedEvent = await page.evaluate(() => window.__categoryDrawerSmoke.events.at(-1));
  assert.equal(selectedEvent.name, 'category.selected');
  assert.deepEqual(selectedEvent.payload, {
    id: 'boards',
    label: '板材',
    category: 'item',
  });

  const expandedLayout = await assertInsideViewport(page);
  assert.ok(expandedLayout.drawer.width >= 247 && expandedLayout.drawer.width <= 249);
  const expandedContentWidth = expandedLayout.content.width;
  await page.screenshot({ path: desktopScreenshotPath, fullPage: true });

  await page.getByRole('button', { name: '收起类别树' }).click();
  await page.waitForFunction(() => {
    const width = document.querySelector('.lowcode-category-drawer')?.getBoundingClientRect().width;
    return typeof width === 'number' && width <= 37;
  });
  const collapsedLayout = await assertInsideViewport(page);
  assert.ok(collapsedLayout.drawer.width >= 35 && collapsedLayout.drawer.width <= 37);
  assert.ok(collapsedLayout.content.width > expandedContentWidth + 200);
  await page.getByRole('button', { name: '展开类别树' }).click();
  await page.waitForFunction(() => {
    const width = document.querySelector('.lowcode-category-drawer')?.getBoundingClientRect().width;
    return typeof width === 'number' && width >= 247;
  });

  await page.setViewportSize({ width: 390, height: 760 });
  await page.waitForTimeout(200);
  const mobileLayout = await assertInsideViewport(page);
  assert.ok(mobileLayout.drawer.width <= 264);
  assert.ok(mobileLayout.content.left >= -1, JSON.stringify(mobileLayout));
  await page.screenshot({ path: mobileScreenshotPath, fullPage: true });

  assert.deepEqual(pageErrors, []);
  console.log('Low-code page category drawer browser smoke passed.');
} catch (error) {
  const debug = context?.pages?.()?.[0]
    ? await context.pages()[0].evaluate(() => ({
        calls: window.__categoryDrawerSmoke?.calls,
        events: window.__categoryDrawerSmoke?.events,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
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
