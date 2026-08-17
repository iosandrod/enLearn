import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

function readDotEnv(filePath) {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return env;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 0) return env;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = value;
      return env;
    }, {});
}

const env = readDotEnv(resolve(workspaceDir, '.env.local'));
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ??
  env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
}

async function readPage() {
  const rows = await supabaseRequest(
    'lowcode_pages?select=*&code=eq.admin-system-entities&limit=1',
  );
  if (!Array.isArray(rows) || !rows[0]) throw new Error('Entity-management page not found.');
  return rows[0];
}

async function restorePage(original) {
  const mutableFields = {
    code: original.code,
    route: original.route,
    title: original.title,
    description: original.description,
    layout: original.layout,
    status: original.status,
    keep_alive: original.keep_alive,
    page_type: original.page_type,
    edit_page_id: original.edit_page_id,
    table_name: original.table_name,
    schema: original.schema,
    version: original.version,
    published_at: original.published_at,
  };
  await supabaseRequest(`lowcode_pages?id=eq.${original.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(mutableFields),
  });
  const restored = await readPage();
  assert.deepEqual(restored.schema, original.schema);
  assert.equal(restored.version, original.version);
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
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
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function openPageInfoDialog(page) {
  const tab = page.locator('.admin-tab').filter({ hasText: '实体管理' }).last();
  await tab.waitFor({ state: 'visible', timeout: 60_000 });
  await tab.click({ button: 'right' });
  const action = page.getByText('页面信息设计', { exact: true }).last();
  await action.waitFor({ state: 'visible' });
  await action.click();
  const dialog = page.locator('.dashboard-page-info-design-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  return dialog;
}

async function selectDialogTab(dialog, label) {
  const tab = dialog.getByText(label, { exact: true }).first();
  await tab.waitFor({ state: 'visible' });
  await tab.click();
}

async function findArrayRow(dialog, value) {
  const rows = dialog.locator('.lc-array-table .vxe-body--row');
  const index = await rows.evaluateAll(
    (elements, expected) => elements.findIndex((element) =>
      [...element.querySelectorAll('input')].some((input) => input.value === expected),
    ),
    value,
  );
  assert.ok(index >= 0, `Could not find array row ${value}.`);
  return rows.nth(index);
}

async function fillRowInput(row, columnIndex, value) {
  const input = row.locator('input').nth(columnIndex - 1);
  await input.waitFor({ state: 'visible' });
  await input.fill(value);
}

async function editableArrayRows(dialog) {
  return dialog.locator('.lc-array-table .vxe-body--row:has(input)');
}

async function rowInputValue(row, columnIndex) {
  return row.locator('input').nth(columnIndex - 1).inputValue();
}

const original = await readPage();
const unique = Date.now().toString(36);
const functionName = `roundTrip${unique}`;
const apiName = `roundTripApi${unique}`;
const functionLabel = `往返测试 ${unique}`;
const functionDescription = `页面函数完整保存 ${unique}`;
const functionScript = `async function main() {\n  return { marker: "${unique}", args: this.event.args };\n}`;
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
const consoleErrors = [];
const failedRequests = [];
try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForUrl(baseUrl);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.goto(`${baseUrl}/dashboard/system/entities`, { waitUntil: 'domcontentloaded' });

  let dialog = await openPageInfoDialog(page);
  const tabLabels = await dialog.locator('.vxe-tabs-header--item').allTextContents();
  assert.deepEqual(tabLabels.map((label) => label.trim()), ['基础信息', '页面函数', '页面 API']);

  await selectDialogTab(dialog, '页面函数');
  await dialog.getByRole('button', { name: '新增函数' }).click();
  const functionRows = await editableArrayRows(dialog);
  const functionRow = functionRows.last();
  await fillRowInput(functionRow, 1, functionName);
  await fillRowInput(functionRow, 2, functionLabel);
  await fillRowInput(functionRow, 3, functionDescription);
  const functionSwitch = functionRow.locator('.vxe-switch').first();
  await functionSwitch.click();
  const scriptTrigger = functionRow.locator('.lc-monaco-editor__trigger').first();
  await scriptTrigger.click();
  const scriptDialog = page.locator('.lc-monaco-editor-dialog').last();
  await scriptDialog.waitFor({ state: 'visible' });
  await page.evaluate((script) => {
    const editor = [...(window.__lcMonacoEditors ?? [])]
      .reverse()
      .find((candidate) => candidate?.getModel?.());
    if (!editor) throw new Error('Monaco editor not found.');
    editor.setValue(script);
  }, functionScript);
  const contextDrawer = page.locator('.lowcode-context-drawer').last();
  if (await contextDrawer.isVisible()) {
    await page.keyboard.press('Escape');
    await contextDrawer.waitFor({ state: 'hidden' });
  }
  await scriptDialog.getByRole('button', { name: '确定' }).click();
  await scriptDialog.waitFor({ state: 'hidden' });

  await selectDialogTab(dialog, '页面 API');
  await dialog.getByRole('button', { name: '新增 API' }).click();
  const apiRows = await editableArrayRows(dialog);
  const apiRow = apiRows.last();
  await fillRowInput(apiRow, 1, apiName);
  await fillRowInput(apiRow, 2, 'entityDesign');
  await fillRowInput(apiRow, 3, 'validateView');
  await fillRowInput(apiRow, 5, 'columns');

  await dialog.getByRole('button', { name: '保存' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 });

  const savedPage = await readPage();
  const savedFunction = savedPage.schema.functions.find((item) => item.name === functionName);
  assert.deepEqual(savedFunction, {
    name: functionName,
    label: functionLabel,
    description: functionDescription,
    enabled: false,
    script: functionScript,
  });
  assert.deepEqual(savedPage.schema.apis[apiName], {
    serviceName: 'entityDesign',
    serviceMethod: 'validateView',
    method: 'POST',
    resultPath: 'columns',
  });

  dialog = await openPageInfoDialog(page);
  await selectDialogTab(dialog, '页面函数');
  const reopenedFunctionRow = await findArrayRow(dialog, functionName);
  assert.equal(
    await rowInputValue(reopenedFunctionRow, 2),
    functionLabel,
  );
  assert.equal(
    await rowInputValue(reopenedFunctionRow, 3),
    functionDescription,
  );
  await reopenedFunctionRow.locator('.lc-monaco-editor__trigger').click();
  const reopenedScriptDialog = page.locator('.lc-monaco-editor-dialog').last();
  await reopenedScriptDialog.waitFor({ state: 'visible' });
  const reopenedScript = await page.evaluate(() => {
    const editor = [...(window.__lcMonacoEditors ?? [])]
      .reverse()
      .find((candidate) => candidate?.getModel?.());
    return editor?.getValue?.() ?? '';
  });
  assert.equal(reopenedScript, functionScript);
  const reopenedContextDrawer = page.locator('.lowcode-context-drawer').last();
  if (await reopenedContextDrawer.isVisible()) {
    await page.keyboard.press('Escape');
    await reopenedContextDrawer.waitFor({ state: 'hidden' });
  }
  await reopenedScriptDialog.getByRole('button', { name: '取消' }).click();
  await reopenedScriptDialog.waitFor({ state: 'hidden' });
  await selectDialogTab(dialog, '页面 API');
  const reopenedApiRow = await findArrayRow(dialog, apiName);
  assert.equal(
    await rowInputValue(reopenedApiRow, 2),
    'entityDesign',
  );
  assert.equal(
    await rowInputValue(reopenedApiRow, 3),
    'validateView',
  );
  assert.equal(
    await rowInputValue(reopenedApiRow, 5),
    'columns',
  );
  await selectDialogTab(dialog, '页面函数');
  await page.screenshot({
    path: resolve(workspaceDir, 'artifacts/page-info-functions-roundtrip.png'),
    fullPage: true,
  });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    tabLabels,
    functionName,
    apiName,
    screenshot: 'artifacts/page-info-functions-roundtrip.png',
  }));
} catch (error) {
  const debug = context?.pages?.()?.[0]
    ? await context.pages()[0].evaluate(() => ({
        url: location.href,
        text: document.body.innerText.slice(0, 5000),
        dialogs: document.querySelectorAll('.vxe-modal--wrapper').length,
        rows: document.querySelectorAll('.lc-array-table .vxe-body--row').length,
        rowHtml: [...document.querySelectorAll('.lc-array-table .vxe-body--row')]
          .map((row) => row.outerHTML.slice(0, 1500)),
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${pageErrors.join('\n')}\n${consoleErrors.join('\n')}\n${failedRequests.join('\n')}\n${serverOutput.slice(-8000)}`,
  );
} finally {
  try {
    await restorePage(original);
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (process.platform === 'win32' && server.pid) {
      const killer = spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', `taskkill /pid ${server.pid} /t /f >nul 2>nul`],
        { windowsHide: true, stdio: 'ignore' },
      );
      await new Promise((resolveExit) => killer.once('exit', resolveExit));
    } else if (server.pid) {
      process.kill(-server.pid, 'SIGTERM');
    }
  }
}
