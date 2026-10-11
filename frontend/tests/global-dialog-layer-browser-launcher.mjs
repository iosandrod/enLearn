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

async function waitForUrl(url, timeoutMs = 60_000) {
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
try {
  const url = `http://127.0.0.1:${port}/tests/global-dialog-layer-browser.html`;
  await waitForUrl(url);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 30_000 },
  );

  await page.locator('#open-outer').click();
  const outer = page.locator('.button-group-designer-dialog');
  await outer.waitFor({ state: 'visible' });
  await outer.locator('#open-inner').click();
  const inner = page.locator('.button-default-picker-dialog');
  await inner.waitFor({ state: 'visible' });

  const [outerZIndex, innerZIndex] = await Promise.all([
    outer.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    inner.evaluate((element) => Number(getComputedStyle(element).zIndex)),
  ]);
  assert.equal(outerZIndex, 12000);
  assert.equal(innerZIndex, 12001);
  assert.ok(innerZIndex > outerZIndex);

  await inner.getByText('关闭内层', { exact: true }).click();
  await inner.waitFor({ state: 'hidden' });
  await outer.getByText('关闭外层', { exact: true }).click();
  await outer.waitFor({ state: 'hidden' });

  console.log('Global dialog layer browser integration passed.');
} catch (error) {
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${serverOutput.slice(-8000)}`,
  );
} finally {
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
