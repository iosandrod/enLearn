import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.AI_ASSISTANT_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const screenshotPath = join(
  workspaceDir,
  'artifacts',
  'ai-sales-order-test-button-runtime.png',
);
const expectedNavigation =
  '/dashboard/sales/orders/edit?fromPage=sales-orders&id=sales-order-row-1';

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

await mkdir(join(workspaceDir, 'artifacts'), { recursive: true });
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
  const url = `http://127.0.0.1:${port}/tests/ai-sales-order-button-runtime-browser.html`;
  await waitForUrl(url);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );
  assert.deepEqual(
    JSON.parse(await page.locator('#result').textContent()),
    { ok: true },
  );

  const testButton = page.locator('.lc-node-button-group .vxe-button', {
    hasText: '测试',
  });
  await testButton.waitFor({ state: 'visible' });
  const row = page.locator(
    '.lc-grid .vxe-table--body-wrapper .vxe-body--row',
    { hasText: 'SO-AI-TEST-001' },
  );
  await row.waitFor({ state: 'visible' });
  await row.locator('.vxe-body--column').nth(1).click();
  await page.waitForFunction(() => (
    window.__aiSalesOrderButtonRuntimeSmoke
      .snapshot()
      ?.gridStates
      ?.['sales-order-grid']
      ?.currentRow
      ?.id === 'sales-order-row-1'
  ));

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testButton.click();
  await page.waitForFunction(() => (
    window.__aiSalesOrderButtonRuntimeSmoke.routerPushes.length === 1
  ));

  const result = await page.evaluate(() => {
    const smoke = window.__aiSalesOrderButtonRuntimeSmoke;
    return {
      candidateAction: smoke.candidateAction,
      routerPushes: smoke.routerPushes,
      serviceCalls: smoke.serviceCalls,
      selectedRow: smoke.snapshot()?.gridStates?.['sales-order-grid']?.currentRow,
    };
  });
  assert.equal(result.candidateAction.code, 'custom-record-edit');
  assert.equal(result.candidateAction.label, '测试');
  assert.equal(result.candidateAction.eventName, 'buttonGroup.custom-record-edit');
  assert.match(result.candidateAction.script, /executeFunction/);
  assert.match(result.candidateAction.script, /name: "edit"/);
  assert.equal(result.selectedRow.id, 'sales-order-row-1');
  assert.deepEqual(result.routerPushes, [expectedNavigation]);
  assert.deepEqual(
    result.serviceCalls.map(({ serviceName, serviceMethod }) => ({
      serviceName,
      serviceMethod,
    })),
    [{ serviceName: 'lowcode', serviceMethod: 'listItems' }],
  );
  assert.equal(
    result.serviceCalls.some(({ serviceMethod }) => serviceMethod === 'saveItem'),
    false,
  );
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({
    actionCode: result.candidateAction.code,
    actionLabel: result.candidateAction.label,
    builtinFunction: 'edit',
    selectedRowId: result.selectedRow.id,
    navigation: result.routerPushes[0],
    pageWrites: 0,
    screenshotPath,
  }));
} catch (error) {
  const debug = context?.pages?.()[0]
    ? await context.pages()[0].evaluate(() => ({
        smoke: window.__aiSalesOrderButtonRuntimeSmoke,
        text: document.body.innerText.slice(0, 5000),
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n` +
    `${JSON.stringify(debug)}\n${pageErrors.join('\n')}\n${serverOutput.slice(-8000)}`,
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
