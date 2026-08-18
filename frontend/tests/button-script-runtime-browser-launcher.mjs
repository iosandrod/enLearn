import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.BUTTON_SCRIPT_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const smokePage = process.env.BUTTON_SCRIPT_SMOKE_PAGE || process.argv[2] ||
  'button-script-runtime-browser.html';
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
try {
  await waitForUrl(`http://127.0.0.1:${port}/tests/${smokePage}`);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  const { chromium } = playwrightModule.default;
  browser = await chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${port}/tests/${smokePage}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );
  const result = JSON.parse(await page.locator('#result').textContent());
  assert.equal(
    result.ok,
    true,
    result.error || JSON.stringify(result) || pageErrors.join('\n'),
  );
  if (smokePage === 'button-script-runtime-browser.html') {
    assert.equal(result.result.value, 42);
    assert.equal(result.result.apiCalls, 2);
    assert.equal(result.configuredFunctionResult.value, '1970-01-01T00:00:00.000Z');
    assert.equal(result.configuredAsyncFunctionResult.value, 'ASYNC-DEFAULT');
    assert.equal(result.isolated.value.mutationBlocked, true);
    assert.equal(result.isolated.value.guestValue, 1);
    assert.equal(result.isolated.value.hasWindow, false);
    assert.equal(result.isolated.value.hasDocument, false);
    assert.equal(result.isolated.value.hasHostLog, false);
    assert.deepEqual(result.scriptLogs, [
      { level: 'log', args: ['sales-order-form-data', { count: 1 }] },
      { level: 'info', args: ['script-info'] },
      { level: 'warn', args: ['script-warn'] },
      { level: 'error', args: ['script-error'] },
    ]);
    assert.match(result.timeoutMessage, /interrupted|timeout|超时/i);
    assert.match(result.rejectedApiMessage, /API denied by host policy/);
    assert.match(result.apiLimitMessage, /调用次数超过限制/);
    console.log('Button script QuickJS browser smoke passed.');
  } else {
    assert.ok(result.names.includes('refresh'));
    assert.ok(result.names.includes('set'));
    console.log('Button script Monaco completion browser smoke passed.');
  }
} catch (error) {
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${serverOutput}`,
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
