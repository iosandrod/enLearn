import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.RUNTIME_FORM_BROWSER ||
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
let activePage;
const pageErrors = [];
const consoleErrors = [];

async function editRuntimeForm({
  page,
  currentLabel,
  nextLabel,
  enteredValue,
  expectedSaveCount,
}) {
  const runtimeForm = page.locator('.lowcode-runtime-page .lc-form').filter({
    has: page.locator('.vxe-form--item-title', { hasText: currentLabel }),
  }).first();
  await runtimeForm.waitFor({ state: 'visible' });
  const input = runtimeForm.locator('.lc-field input').first();
  await input.fill(enteredValue);
  assert.equal(await input.inputValue(), enteredValue);

  const label = runtimeForm.locator('.vxe-form--item-title', { hasText: currentLabel }).first();
  await label.click({ button: 'right' });
  const designMenuItem = page.locator(
    '.enlearn-context-menu .vxe-context-menu--item-wrapper',
    { hasText: '设计当前表单' },
  ).last();
  await designMenuItem.waitFor({ state: 'visible' });
  await designMenuItem.click();

  const designer = page.locator('.form-designer-dialog').last();
  await designer.waitFor({ state: 'visible' });
  const labelProperty = designer.locator('.material-prop-form .vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: '输入框左侧文本' }),
  }).first();
  await labelProperty.waitFor({ state: 'visible' });
  await labelProperty.locator('input').fill(nextLabel);

  await designer.locator('.form-workbench-footer .vxe-button', {
    hasText: '确定',
  }).click();
  await designer.waitFor({ state: 'hidden' });
  await page.waitForFunction(
    ({ count, text }) => {
      const smoke = window.__runtimeFormDesignerSaveSmoke;
      return smoke.saveCalls.length === count && document.body.innerText.includes(text);
    },
    { count: expectedSaveCount, text: nextLabel },
  );

  const updatedForm = page.locator('.lowcode-runtime-page .lc-form').filter({
    has: page.locator('.vxe-form--item-title', { hasText: nextLabel }),
  }).first();
  await updatedForm.waitFor({ state: 'visible' });
  assert.equal(
    await updatedForm.locator('.lc-field input').first().inputValue(),
    enteredValue,
    `${currentLabel} value must survive the designer save and form remount.`,
  );
}

async function runScenario(pageMode) {
  const url = `http://127.0.0.1:${port}/tests/runtime-form-designer-save-browser.html?page=${pageMode}`;
  await activePage.goto(url, { waitUntil: 'domcontentloaded' });
  await activePage.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );
  const bootResult = JSON.parse(await activePage.locator('#result').textContent());
  assert.equal(bootResult.ok, true, pageErrors.join('\n'));

  await editRuntimeForm({
    page: activePage,
    currentLabel: '姓名',
    nextLabel: `姓名已更新-${pageMode}`,
    enteredValue: `保留姓名-${pageMode}`,
    expectedSaveCount: 1,
  });
  await editRuntimeForm({
    page: activePage,
    currentLabel: '关键字',
    nextLabel: `关键字已更新-${pageMode}`,
    enteredValue: `保留关键字-${pageMode}`,
    expectedSaveCount: 2,
  });

  const result = await activePage.evaluate(() => {
    const smoke = window.__runtimeFormDesignerSaveSmoke;
    return {
      pageRecord: JSON.parse(JSON.stringify(smoke.pageRecord)),
      saveCalls: JSON.parse(JSON.stringify(smoke.saveCalls)),
      snapshot: smoke.snapshot(),
    };
  });
  assert.equal(result.saveCalls.length, 2);
  assert.equal(result.saveCalls[0].resource, 'lowcode_pages');
  assert.equal(result.saveCalls[0].id, result.pageRecord.id);
  assert.equal(result.saveCalls[0].data.version, 2);
  assert.equal(result.saveCalls[1].data.version, 3);
  assert.equal(result.pageRecord.version, 3);
  assert.equal(
    result.pageRecord.schema.blocks[0].schema.fields[0].label,
    `姓名已更新-${pageMode}`,
  );
  assert.equal(
    result.pageRecord.schema.blocks[1].schema.fields[0].label,
    `关键字已更新-${pageMode}`,
  );
  assert.equal(result.snapshot.formModels['runtime-edit-form'].name, `保留姓名-${pageMode}`);
  assert.equal(
    result.snapshot.formModels['runtime-search-form'].keyword,
    `保留关键字-${pageMode}`,
  );
}

try {
  await waitForUrl(`http://127.0.0.1:${port}`);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
  activePage = await context.newPage();
  activePage.on('pageerror', (error) => pageErrors.push(error.message));
  activePage.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });

  await runScenario('plain');
  await runScenario('reactive');

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('Runtime form designer immediate save browser integration passed.');
} catch (error) {
  const debug = activePage
    ? await activePage.evaluate(() => ({
        smoke: window.__runtimeFormDesignerSaveSmoke,
        dialogs: document.querySelectorAll('.form-designer-dialog').length,
        menus: document.querySelectorAll('.enlearn-context-menu').length,
        text: document.body.innerText.slice(0, 5000),
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${pageErrors.join('\n')}\n${consoleErrors.join('\n')}\n${serverOutput.slice(-8000)}`,
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
