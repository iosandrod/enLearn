import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.VISUAL_DESIGN_BROWSER ||
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
const consoleWarnings = [];
try {
  const url = `http://127.0.0.1:${port}/tests/visual-design-dialog-browser.html`;
  await waitForUrl(url);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.type() === 'warning') consoleWarnings.push(message.text());
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#result')?.textContent !== 'pending');

  await page.locator('#open-designer').click();
  const dialog = page.locator('.lowcode-design-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.locator('.visual-design-dialog-stub').getAttribute('data-code'), 'system-options');
  assert.equal(await dialog.locator('.visual-design-dialog-stub').getAttribute('data-embedded'), 'true');
  assert.equal(await dialog.getByText('下拉数据设计', { exact: true }).count(), 1);

  await dialog.getByRole('button', { name: '确定', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__visualDesignDialogSmoke.result?.action === 'confirm');
  const result = await page.evaluate(() => window.__visualDesignDialogSmoke);
  assert.deepEqual(result.calls, ['save']);
  assert.deepEqual(result.result.payload, { id: 'saved-page', version: 2 });

  await page.locator('#open-real-designer').click();
  const realDialog = page.locator('.lowcode-design-dialog').last();
  await realDialog.waitFor({ state: 'visible' });
  const workbench = realDialog.locator('.visual-editor-shell.is-without-header');
  await workbench.waitFor({ state: 'visible' });
  const workbenchBox = await workbench.boundingBox();
  assert.ok(workbenchBox && workbenchBox.width > 1000 && workbenchBox.height > 600);
  assert.equal(await page.locator('.lowcode-design-dialog').count(), 1);
  assert.equal(await page.evaluate(() => window.__visualDesignDialogSmoke.hostCount), 1);

  await realDialog.getByRole('button', { name: '确定', exact: true }).click();
  await realDialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__visualDesignDialogSmoke.realResult?.action === 'confirm');
  const realResult = await page.evaluate(() => window.__visualDesignDialogSmoke);
  assert.equal(realResult.realResult.payload.code, 'system-options');
  assert.equal(realResult.realResult.payload.version, 2);
  assert.equal(
    realResult.serviceCalls.filter(
      (call) => call.serviceName === 'lowcode' && call.serviceMethod === 'saveItem',
    ).length,
    1,
  );
  assert.deepEqual(realResult.routerCalls, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(consoleWarnings, []);

  console.log('Visual design dialog browser integration passed.');
} catch (error) {
  const debug = page
    ? await page.evaluate(() => ({
        smoke: window.__visualDesignDialogSmoke,
        text: document.body.innerText.slice(0, 3000),
        dialogs: document.querySelectorAll('.lowcode-design-dialog').length,
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${[...pageErrors, ...consoleErrors, ...consoleWarnings].join('\n')}\n${serverOutput.slice(-8000)}`,
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
