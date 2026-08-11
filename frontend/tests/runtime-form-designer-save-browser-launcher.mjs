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
  menuText = '设计当前表单',
}) {
  const runtimeForm = page.locator('.lowcode-runtime-page .lc-form').filter({
    has: page.locator('.vxe-form--item-title', { hasText: currentLabel }),
  }).first();
  await runtimeForm.waitFor({ state: 'visible' });
  const fieldItem = runtimeForm.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: currentLabel }),
  }).first();
  const input = fieldItem.locator('.lc-field input').first();
  await input.fill(enteredValue);
  assert.equal(await input.inputValue(), enteredValue);

  const label = runtimeForm.locator('.vxe-form--item-title', { hasText: currentLabel }).first();
  await label.click({ button: 'right' });
  const designMenuItem = page.locator(
    '.enlearn-context-menu .vxe-context-menu--item-wrapper',
    { hasText: menuText },
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
  const updatedFieldItem = updatedForm.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: nextLabel }),
  }).first();
  assert.equal(
    await updatedFieldItem.locator('.lc-field input').first().inputValue(),
    enteredValue,
    `${currentLabel} value must survive the designer save and form remount.`,
  );
}

async function editRuntimeField({
  page,
  currentLabel,
  enteredValue,
  expectedSaveCount,
  nextLabel = currentLabel,
  requiredMessage = `${nextLabel}不能为空`,
  defaultValueScript = 'async function main() { return "AUTO-001"; }',
  optionsCode = 'order_code',
  updateScript = 'async function main(event) { return event.value; }',
  validationMessage = `${nextLabel}格式不正确`,
  validationScript = 'async function main(event) { return Boolean(event.value); }',
  createDisabled = true,
  editDisabled = true,
  component = 'vxe-input',
}) {
  const runtimeForm = page.locator('.lowcode-runtime-page .lc-form').filter({
    has: page.locator('.vxe-form--item-title', { hasText: currentLabel }),
  }).first();
  const fieldItem = runtimeForm.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: currentLabel }),
  }).first();
  const input = fieldItem.locator('.lc-field input').first();
  await input.fill(enteredValue);

  await fieldItem.locator('.vxe-form--item-title').click({ button: 'right' });
  const menuItem = page.locator(
    '.enlearn-context-menu .vxe-context-menu--item-wrapper',
    { hasText: '设计当前字段' },
  ).last();
  await menuItem.waitFor({ state: 'visible' });
  await menuItem.click();

  const dialog = page.locator('.runtime-form-field-editor-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(
    await page.locator('.form-designer-dialog:visible').count(),
    0,
    'Designing one field must not open the full form designer.',
  );
  const dialogBody = dialog.locator('.vxe-modal--body');
  const reveal = async (control) => {
    await dialogBody.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await control.scrollIntoViewIfNeeded();
  };

  const fieldControl = (label) => dialog.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: label }),
  }).first();
  await fieldControl('字段名称').locator('input').fill(nextLabel);
  const componentControl = fieldControl('组件类型');
  assert.ok(
    ['输入框', 'vxe-input'].includes(await componentControl.locator('input').inputValue()),
    'The component selector must initialize from the field component.',
  );
  if (component !== 'vxe-input') {
    await componentControl.locator('.vxe-select').click();
    await page.locator('.vxe-select--panel:visible .vxe-select-option', {
      hasText: component === 'vxe-textarea' ? '多行文本' : '下拉选择',
    }).click();
  }
  await fieldControl('必须录入').locator('button, input').first().click();
  await fieldControl('必录提示').locator('input').fill(requiredMessage);
  if (createDisabled) {
    await fieldControl('新增禁用').locator('button, input').first().click();
  }
  if (editDisabled) {
    await fieldControl('编辑禁用').locator('button, input').first().click();
  }
  await reveal(fieldControl('默认值类型'));
  await fieldControl('默认值类型').locator('.vxe-select').click({ force: true });
  await page.locator('.vxe-select-option', { hasText: '函数' }).last().click();
  await reveal(fieldControl('默认值函数'));
  await fieldControl('默认值函数').locator('textarea').fill(defaultValueScript);
  const optionsCodeControl = fieldControl('关联下拉 Code');
  await reveal(optionsCodeControl);
  await optionsCodeControl.locator('.vxe-select').click({ force: true });
  const option = page.locator('.vxe-select--panel:visible .vxe-select-option', {
    hasText: optionsCode,
  }).first();
  await option.waitFor({ state: 'visible' });
  await option.click();
  await reveal(fieldControl('值更新事件'));
  await fieldControl('值更新事件').locator('textarea').fill(updateScript);
  await reveal(fieldControl('校验提示'));
  await fieldControl('校验提示').locator('input').fill(validationMessage);
  await reveal(fieldControl('校验函数'));
  await fieldControl('校验函数').locator('textarea').fill(validationScript);

  await dialog.locator('.lc-global-dialog__footer .vxe-button', { hasText: '保存' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(
    (count) => window.__runtimeFormDesignerSaveSmoke.saveCalls.length === count,
    expectedSaveCount,
  );

  const updatedForm = page.locator('.lowcode-runtime-page .lc-form').filter({
    has: page.locator('.vxe-form--item-title', { hasText: nextLabel }),
  }).first();
  await updatedForm.waitFor({ state: 'visible' });
  const updatedField = updatedForm.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: nextLabel }),
  }).first();
  const updatedControl = component === 'vxe-textarea'
    ? updatedField.locator('.lc-field textarea').first()
    : updatedField.locator('.lc-field input').first();
  assert.equal(await updatedControl.inputValue(), enteredValue);
}

async function editBaseInfoField({ page, expectedSaveCount }) {
  const fieldItem = runtimeField(page, '关联物料');
  await fieldItem.locator('.vxe-form--item-title').click({ button: 'right' });
  const menuItem = page.locator(
    '.enlearn-context-menu .vxe-context-menu--item-wrapper',
    { hasText: '设计当前字段' },
  ).last();
  await menuItem.waitFor({ state: 'visible' });
  await menuItem.click();

  const dialog = page.locator('.runtime-form-field-editor-dialog').last();
  await dialog.waitFor({ state: 'visible' });
  const fieldControl = (label) => dialog.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: label }),
  }).first();
  assert.ok(
    ['关联资料', 'base-info'].includes(await fieldControl('组件类型').locator('input').inputValue()),
  );

  const relationPanel = fieldControl('关联资料配置').locator('.lc-sub-form');
  await relationPanel.waitFor({ state: 'visible' });
  const relationControl = (label) => relationPanel.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: label }),
  }).first();
  assert.equal(await relationControl('实体编码').locator('input').inputValue(), 'planning_item');
  await relationControl('显示字段').locator('input').fill('description');

  const mappingRows = relationControl('字段映射').locator('.lc-array-table .vxe-body--row');
  assert.equal(await mappingRows.count(), 2);
  await relationControl('字段映射').locator('.lc-array-table__toolbar .vxe-button', {
    hasText: '新增映射',
  }).click();
  assert.equal(await mappingRows.count(), 3);
  const newInputs = mappingRows.nth(2).locator('input');
  await newInputs.nth(0).fill('uom');
  await newInputs.nth(1).fill('relatedItemUom');

  await dialog.locator('.lc-global-dialog__footer .vxe-button', { hasText: '保存' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(
    (count) => window.__runtimeFormDesignerSaveSmoke.saveCalls.length === count,
    expectedSaveCount,
  );
}

async function roundTripBaseInfoThroughFullDesigner({ page, expectedSaveCount }) {
  const field = runtimeField(page, '关联物料');
  await field.locator('.vxe-form--item-title').click({ button: 'right' });
  const menuItem = page.locator(
    '.enlearn-context-menu .vxe-context-menu--item-wrapper',
    { hasText: '设计当前表单' },
  ).last();
  await menuItem.waitFor({ state: 'visible' });
  await menuItem.click();

  const designer = page.locator('.form-designer-dialog').last();
  await designer.waitFor({ state: 'visible' });
  await designer.locator('.form-workbench-footer .vxe-button', { hasText: '确定' }).click();
  await designer.waitFor({ state: 'hidden' });
  await page.waitForFunction(
    (count) => window.__runtimeFormDesignerSaveSmoke.saveCalls.length === count,
    expectedSaveCount,
  );
}

function runtimeField(page, label) {
  return page.locator('.lowcode-runtime-page .vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: label }),
  }).first();
}

async function verifyModeDisabledBehavior(page, runtimeMode) {
  const createLockedInput = runtimeField(page, '新增禁用示例').locator('.lc-field input').first();
  const editLockedInput = runtimeField(page, '编辑禁用示例').locator('.lc-field input').first();
  assert.equal(await createLockedInput.isDisabled(), runtimeMode === 'create');
  assert.equal(await editLockedInput.isDisabled(), runtimeMode === 'edit');
}

async function verifyFieldScriptBehavior(page) {
  await page.waitForFunction(() => (
    window.__runtimeFormDesignerSaveSmoke
      .snapshot()
      ?.formModels?.['runtime-edit-form']
      ?.generatedCode === 'AUTO-form-generatedCode'
  ));

  const updateSource = runtimeField(page, '更新源').locator('.lc-field input').first();
  await updateSource.fill('VALUE-42');
  await page.waitForFunction(() => (
    window.__runtimeFormDesignerSaveSmoke
      .snapshot()
      ?.formModels?.['runtime-edit-form']
      ?.updateTarget === 'PATCHED-VALUE-42'
  ));
  assert.equal(
    await runtimeField(page, '更新目标').locator('.lc-field input').first().inputValue(),
    'PATCHED-VALUE-42',
    'An update script must patch both the runtime model and mounted field control.',
  );

  const validationField = runtimeField(page, '脚本校验值');
  const validationInput = validationField.locator('.lc-field input').first();
  const editForm = page.locator('.lowcode-runtime-page .lc-form').filter({
    has: page.locator('.vxe-form--item-title', { hasText: '脚本校验值' }),
  }).first();
  const validateForm = () => editForm.evaluate(async (element) => {
    const lowCodeForm = element.__vueParentComponent?.parent;
    return lowCodeForm?.exposed?.validate?.();
  });
  await validationInput.fill('valid');
  await validateForm();
  await page.waitForTimeout(80);
  assert.equal(await validationField.locator('.vxe-form--item.is--error').count(), 0);

  await validationInput.fill('message');
  await validateForm();
  const validationTooltip = validationField.locator(
    '.vxe-form-item--valid-error-icon-msg-tip',
  );
  await validationTooltip.waitFor({ state: 'attached' });
  assert.equal((await validationTooltip.textContent())?.trim(), '函数返回的校验提示');

  await validationInput.fill('throw');
  await validateForm();
  assert.match(
    await validationTooltip.textContent(),
    /函数抛出的校验提示$/,
  );
}

async function runScenario(pageMode, runtimeMode) {
  const url = `http://127.0.0.1:${port}/tests/runtime-form-designer-save-browser.html?page=${pageMode}&mode=${runtimeMode}`;
  await activePage.goto(url, { waitUntil: 'domcontentloaded' });
  await activePage.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );
  const bootResult = JSON.parse(await activePage.locator('#result').textContent());
  assert.equal(bootResult.ok, true, pageErrors.join('\n'));
  await verifyModeDisabledBehavior(activePage, runtimeMode);
  await verifyFieldScriptBehavior(activePage);

  await editRuntimeForm({
    page: activePage,
    currentLabel: '姓名',
    nextLabel: `姓名已更新-${pageMode}`,
    enteredValue: `保留姓名-${pageMode}`,
    expectedSaveCount: 1,
  });
  await editRuntimeField({
    page: activePage,
    currentLabel: '编码',
    enteredValue: `保留编码-${pageMode}`,
    expectedSaveCount: 2,
    requiredMessage: '编码不能为空',
    validationMessage: '编码格式不正确',
    validationScript:
      'async function main(event) { return String(event.value || "").startsWith("保留"); }',
    component: 'vxe-textarea',
  });
  await editRuntimeField({
    page: activePage,
    currentLabel: '关键字',
    enteredValue: `保留关键字-${pageMode}`,
    expectedSaveCount: 3,
    nextLabel: `关键字已更新-${pageMode}`,
    optionsCode: 'search_keyword',
    defaultValueScript: 'async function main() { return "SEARCH-AUTO"; }',
    updateScript: 'async function main(event) { return event.value; }',
    validationMessage: '关键字格式不正确',
    validationScript:
      'async function main(event) { return String(event.value || "").startsWith("保留"); }',
  });
  await editBaseInfoField({ page: activePage, expectedSaveCount: 4 });
  await roundTripBaseInfoThroughFullDesigner({ page: activePage, expectedSaveCount: 5 });

  const result = await activePage.evaluate(() => {
    const smoke = window.__runtimeFormDesignerSaveSmoke;
    return {
      pageRecord: JSON.parse(JSON.stringify(smoke.pageRecord)),
      saveCalls: JSON.parse(JSON.stringify(smoke.saveCalls)),
      snapshot: smoke.snapshot(),
    };
  });
  assert.equal(result.saveCalls.length, 5);
  assert.equal(result.saveCalls[0].resource, 'lowcode_pages');
  assert.equal(result.saveCalls[0].id, result.pageRecord.id);
  assert.equal(result.saveCalls[0].data.version, 2);
  assert.equal(result.saveCalls[1].data.version, 3);
  assert.equal(result.saveCalls[2].data.version, 4);
  assert.equal(result.saveCalls[3].data.version, 5);
  assert.equal(result.saveCalls[4].data.version, 6);
  assert.equal(result.pageRecord.version, 6);
  assert.equal(
    result.pageRecord.schema.blocks[0].schema.fields[0].label,
    `姓名已更新-${pageMode}`,
  );
  assert.equal(
    result.pageRecord.schema.blocks[0].schema.fields[1].optionsCode,
    'order_code',
  );
  assert.equal(result.pageRecord.schema.blocks[0].schema.fields[1].component, 'vxe-textarea');
  assert.equal(result.pageRecord.schema.blocks[0].schema.fields[1].createDisabled, true);
  assert.equal(result.pageRecord.schema.blocks[0].schema.fields[1].editDisabled, true);
  assert.equal(result.pageRecord.schema.blocks[0].schema.fields[1].defaultValueType, 'function');
  assert.match(result.pageRecord.schema.blocks[0].schema.fields[1].defaultValueScript, /AUTO-001/);
  assert.match(result.pageRecord.schema.blocks[0].schema.fields[1].updateScript, /event\.value/);
  assert.match(result.pageRecord.schema.blocks[0].schema.fields[1].validationScript, /startsWith/);
  assert.equal(
    result.pageRecord.schema.blocks[0].schema.fields[1].rules.some((rule) => rule.required),
    true,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.pageRecord.schema.blocks[0].initialValues, 'code'),
    false,
    'Function defaults must replace the previous literal initial value.',
  );
  assert.deepEqual(
    result.pageRecord.schema.blocks[0].schema.actions,
    [{ code: 'validate', label: '执行校验', type: 'submit' }],
  );
  assert.equal(result.pageRecord.schema.blocks[0].schema.fields[0].field, 'name');
  assert.equal(
    result.pageRecord.schema.blocks[1].schema.fields[0].label,
    `关键字已更新-${pageMode}`,
  );
  assert.equal(
    result.pageRecord.schema.blocks[1].schema.fields[0].optionsCode,
    'search_keyword',
  );
  assert.equal(result.pageRecord.schema.blocks[1].schema.fields[0].createDisabled, true);
  assert.equal(result.pageRecord.schema.blocks[1].schema.fields[0].editDisabled, true);
  assert.equal(
    result.pageRecord.schema.blocks[1].schema.fields[0].defaultValueType,
    'function',
  );
  assert.match(
    result.pageRecord.schema.blocks[1].schema.fields[0].validationScript,
    /startsWith/,
  );
  assert.equal(
    result.pageRecord.schema.blocks[1].schema.fields[0].rules.some((rule) => rule.required),
    true,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.pageRecord.schema.blocks[1].initialValues,
      'keyword',
    ),
    false,
    'Search-form function defaults must replace literal initial values.',
  );
  assert.equal(result.snapshot.formModels['runtime-edit-form'].name, `保留姓名-${pageMode}`);
  assert.equal(result.snapshot.formModels['runtime-edit-form'].code, `保留编码-${pageMode}`);
  assert.equal(
    result.snapshot.formModels['runtime-search-form'].keyword,
    `保留关键字-${pageMode}`,
  );
  const relatedItem = result.pageRecord.schema.blocks[0].schema.fields.find(
    (field) => field.field === 'relatedItem',
  );
  assert.equal(relatedItem.component, 'base-info');
  assert.equal(relatedItem.props.relateInfoConfig.entityCode, 'planning_item');
  assert.equal(relatedItem.props.relateInfoConfig.displayField, 'description');
  assert.deepEqual(relatedItem.props.relateInfoConfig.fieldMappings, [
    { sourceField: 'id', targetField: 'relatedItem' },
    { sourceField: 'name', targetField: 'relatedItemName' },
    { sourceField: 'uom', targetField: 'relatedItemUom' },
  ]);
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

  await runScenario('plain', 'create');
  await runScenario('reactive', 'edit');

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
