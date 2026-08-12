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
  const url = `http://127.0.0.1:${port}/tests/button-group-runtime-save-browser.html`;
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

  const runtimeGroup = page.locator('.lc-node-button-group').first();
  await runtimeGroup.waitFor({ state: 'visible' });
  await runtimeGroup.click({ button: 'right', position: { x: 20, y: 20 } });
  const designMenuItem = page.locator(
    '.enlearn-context-menu .vxe-context-menu--item-wrapper',
    { hasText: '设计按钮' },
  );
  await designMenuItem.waitFor({ state: 'visible' });
  await designMenuItem.click();

  const designer = page.locator('.button-group-designer-dialog').last();
  await designer.waitFor({ state: 'visible' });
  await designer.locator('.lc-array-table__toolbar .vxe-button', {
    hasText: '选择默认按钮',
  }).click();
  const picker = page.locator('.button-default-picker-dialog').last();
  await picker.waitFor({ state: 'visible' });
  const pickerRows = picker.locator('.vxe-table--body-wrapper .vxe-body--row');
  const pickerLabels = (await pickerRows.locator('.vxe-cell--label').allTextContents())
    .map((label) => label.trim())
    .filter(Boolean);
  assert.ok(pickerLabels.includes('编辑'));
  assert.ok(pickerLabels.includes('审核'));
  assert.ok(pickerLabels.includes('打印'));
  assert.equal(pickerLabels.includes('复制'), false);
  assert.equal(pickerLabels.includes('保存'), false);
  await picker.locator('.lc-global-dialog__footer .vxe-button', {
    hasText: '取消',
  }).click();
  await picker.waitFor({ state: 'hidden' });

  const mainRows = designer.locator(
    '.lc-array-table__grid .vxe-table--main-wrapper .vxe-body--row',
  );
  await mainRows.nth(0).waitFor({ state: 'visible' });
  assert.equal(await mainRows.count(), 1);
  await designer.locator('.lc-global-dialog__footer .vxe-button', {
    hasText: '确定',
  }).click();
  await designer.waitFor({ state: 'hidden' });

  await page.waitForFunction(() => {
    const smoke = window.__buttonGroupRuntimeSaveSmoke;
    return smoke.saveCalls.length === 1 &&
      smoke.pageRecord.schema.blocks[0]?.actions?.some(
        (action) => action.code === 'create' && action.script?.includes('executeFunction'),
      );
  });
  const saved = await page.evaluate(() => ({
    saveCalls: window.__buttonGroupRuntimeSaveSmoke.saveCalls,
    pageRecord: window.__buttonGroupRuntimeSaveSmoke.pageRecord,
  }));
  assert.equal(saved.saveCalls.length, 1);
  assert.equal(saved.saveCalls[0].serviceName, undefined);
  assert.equal(saved.saveCalls[0].resource, 'lowcode_pages');
  assert.equal(saved.saveCalls[0].id, 'runtime-button-save-page');
  assert.deepEqual(
    saved.saveCalls[0].data.schema.blocks[0].actions.map(({ label, code }) => ({ label, code })),
    [
      { label: '新增', code: 'create' },
    ],
  );
  assert.match(
    saved.saveCalls[0].data.schema.blocks[0].actions[0].script,
    /executeFunction[\s\S]*?name: "create"/,
  );
  assert.equal(
    saved.saveCalls[0].data.schema.blocks[0].actions[0].eventName,
    'buttonGroup.create',
  );
  assert.equal(saved.saveCalls[0].data.version, 2);
  assert.deepEqual(
    saved.pageRecord.schema.blocks[0].actions.map(({ label, code }) => ({ label, code })),
    [
      { label: '新增', code: 'create' },
    ],
  );
  await page.getByRole('button', { name: '新增', exact: true }).waitFor({ state: 'visible' });
  assert.equal(
    await page.locator('.lowcode-runtime-page > p').textContent(),
    '按钮配置已保存。',
  );
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.waitForFunction(
    () => window.__buttonGroupRuntimeSaveSmoke.routerPushes.length === 1,
  );
  assert.deepEqual(
    await page.evaluate(() => window.__buttonGroupRuntimeSaveSmoke.routerPushes),
    ['/runtime-button-save/edit?fromPage=runtime-button-save'],
  );

  await runtimeGroup.click({ button: 'right', position: { x: 20, y: 20 } });
  await designMenuItem.waitFor({ state: 'visible' });
  await designMenuItem.click();
  await designer.waitFor({ state: 'visible' });
  const reopenedRows = designer.locator(
    '.lc-array-table__grid .vxe-table--main-wrapper .vxe-body--row',
  );
  await reopenedRows.nth(0).waitFor({ state: 'visible' });
  assert.equal(await reopenedRows.count(), 1);
  const reopenedInputs = reopenedRows.nth(0).locator('.vxe-input input');
  assert.equal(await reopenedInputs.nth(0).inputValue(), '新增');
  assert.equal(await reopenedInputs.nth(1).inputValue(), 'create');
  await designer.locator('.lc-global-dialog__footer .vxe-button', {
    hasText: '取消',
  }).click();
  await designer.waitFor({ state: 'hidden' });

  await page.goto(`${url}?pageType=edit&recordId=order-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );
  const editRuntimeGroup = page.locator('.lc-node-button-group').first();
  await editRuntimeGroup.waitFor({ state: 'visible' });
  await editRuntimeGroup.click({ button: 'right', position: { x: 20, y: 20 } });
  const editDesignMenuItem = page.locator(
    '.enlearn-context-menu .vxe-context-menu--item-wrapper',
    { hasText: '设计按钮' },
  );
  await editDesignMenuItem.waitFor({ state: 'visible' });
  await editDesignMenuItem.click();
  const editDesigner = page.locator('.button-group-designer-dialog').last();
  await editDesigner.waitFor({ state: 'visible' });
  const designerToolbarButtons = editDesigner.locator('.lc-array-table__toolbar .vxe-button');
  assert.equal(await designerToolbarButtons.count(), 3);
  for (let index = 0; index < 3; index += 1) {
    assert.equal(
      await designerToolbarButtons.nth(index).isDisabled(),
      false,
      'Business-page scan mode must not disable button-designer tools.',
    );
  }
  await editDesigner.locator('.lc-array-table__toolbar .vxe-button', {
    hasText: '选择默认按钮',
  }).click();
  const editPicker = page.locator('.button-default-picker-dialog').last();
  await editPicker.waitFor({ state: 'visible' });
  const editPickerLabels = (await editPicker
    .locator('.vxe-table--body-wrapper .vxe-body--row .vxe-cell--label')
    .allTextContents())
    .map((label) => label.trim())
    .filter(Boolean);
  for (const label of ['复制', '新增', '修改', '保存', '审核', '反审', '关闭', '打开', '刷新', '退出']) {
    assert.ok(editPickerLabels.includes(label), `Edit picker must include ${label}.`);
  }
  for (const label of ['编辑', '打印', '导入', '导出', '更多']) {
    assert.equal(editPickerLabels.includes(label), false, `Edit picker must exclude ${label}.`);
  }
  await editPicker.locator('.lc-global-dialog__footer .vxe-button', {
    hasText: '取消',
  }).click();
  await editPicker.waitFor({ state: 'hidden' });
  await editDesigner.locator('.lc-global-dialog__footer .vxe-button', {
    hasText: '取消',
  }).click();
  await editDesigner.waitFor({ state: 'hidden' });
  assert.deepEqual(pageErrors, []);

  console.log('Runtime button designer persistence browser integration passed.');
} catch (error) {
  const debug = context?.pages?.()?.[0]
    ? await context.pages()[0].evaluate(() => ({
        smoke: window.__buttonGroupRuntimeSaveSmoke,
        dialogs: document.querySelectorAll('.vxe-modal--wrapper').length,
        menus: document.querySelectorAll('.vxe-context-menu--wrapper').length,
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
