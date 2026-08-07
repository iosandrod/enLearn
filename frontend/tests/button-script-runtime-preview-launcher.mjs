import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
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
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
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
    'preview',
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
  await waitForUrl(`http://127.0.0.1:${port}/`);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const rendererUrl = [...document.scripts]
      .map((script) => script.src)
      .find((src) => src.includes('/assets/index-'));
    if (!rendererUrl) throw new Error('Production entry chunk was not found.');

    const entrySource = await fetch(rendererUrl).then((response) => response.text());
    const rendererMatch = entrySource.match(/\.\/LowCodePageRenderer-[^"']+\.js/);
    if (!rendererMatch) throw new Error('Page renderer chunk was not found.');
    const rendererSource = await fetch(
      new URL(rendererMatch[0], rendererUrl),
    ).then((response) => response.text());
    const workerMatch = rendererSource.match(/\/assets\/script-runtime\.worker-[^"'`]+\.js/);
    if (!workerMatch) throw new Error('Script worker asset was not found.');

    const worker = new Worker(workerMatch[0], { type: 'module' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        worker.terminate();
        resolve({ ok: false, error: 'Production worker startup timed out.' });
      }, 20_000);
      worker.addEventListener('message', (event) => {
        if (event.data.type !== 'module-ready' && event.data.type !== 'module-error') return;
        clearTimeout(timer);
        worker.terminate();
        resolve({
          ok: event.data.type === 'module-ready',
          error: event.data.error,
          workerUrl: workerMatch[0],
        });
      });
      worker.addEventListener('error', (event) => {
        clearTimeout(timer);
        worker.terminate();
        resolve({ ok: false, error: event.message });
      });
    });
  });

  assert.equal(
    result.ok,
    true,
    result.error || pageErrors.join('\n') || JSON.stringify(result),
  );
  console.log('Button script production preview worker smoke passed.');
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
