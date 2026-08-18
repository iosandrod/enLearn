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
  const url = `http://127.0.0.1:${port}/tests/view-management-create-browser.html`;
  await waitForUrl(url);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
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

  const createButton = page.locator(
    '.lc-node-button-group .vxe-button',
    { hasText: '新增' },
  ).first();
  await createButton.waitFor({ state: 'visible' });
  await createButton.click();
  const sqlDialog = page.locator('.vxe-modal--wrapper', { hasText: '新增视图' }).last();
  await sqlDialog.waitFor({ state: 'visible' });
  await sqlDialog.getByRole('button', { name: '分析 SQL', exact: true }).click();

  await page.waitForFunction(() => {
    const snapshot = window.__viewManagementCreateSmoke.snapshot();
    const form = snapshot?.formModels?.['entity-view-edit-form'];
    return form?.definition_sql === 'select 1::integer as id' &&
      snapshot?.resolvedData?.editViewColumns?.length === 2;
  });

  const result = await page.evaluate(() => ({
    snapshot: window.__viewManagementCreateSmoke.snapshot(),
    analyzedColumns: window.__viewManagementCreateSmoke.analyzedColumns,
    serviceCalls: window.__viewManagementCreateSmoke.serviceCalls,
  }));
  const form = result.snapshot.formModels['entity-view-edit-form'];
  assert.equal(form.definition_sql, 'select 1::integer as id');
  assert.deepEqual(result.snapshot.resolvedData.editViewColumns, result.analyzedColumns);
  assert.deepEqual(
    result.snapshot.gridStates['entity-view-edit-columns-grid'].rows,
    result.analyzedColumns,
  );
  assert.deepEqual(
    result.serviceCalls.filter((call) => call.serviceMethod === 'validateView'),
    [
      {
        serviceName: 'entityDesign',
        serviceMethod: 'validateView',
        payload: { sql: 'select 1::integer as id' },
      },
    ],
  );
  assert.equal(
    await page.locator('.lc-grid .vxe-body--row').count(),
    2,
    'The separate view-fields detail grid must render two analyzed rows.',
  );
  assert.deepEqual(pageErrors, []);

  console.log('View management create-from-SQL browser integration passed.');
} catch (error) {
  const debug = context?.pages?.()?.[0]
    ? await context.pages()[0].evaluate(() => ({
        snapshot: window.__viewManagementCreateSmoke?.snapshot?.(),
        serviceCalls: window.__viewManagementCreateSmoke?.serviceCalls,
        text: document.body.innerText.slice(0, 4000),
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${pageErrors.join('\n')}\n${serverOutput.slice(-8000)}`,
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
