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

async function waitForSmokeReady(page) {
  await page.waitForFunction(() => {
    const resultElement = document.querySelector('#result');
    const smoke = window.__runtimeFormDesignerSaveSmoke;
    if (!resultElement || resultElement.textContent === 'pending') return false;
    if (!smoke || typeof smoke.snapshot !== 'function') return false;
    try {
      return JSON.parse(resultElement.textContent ?? '{}').ok === true && Boolean(smoke.snapshot());
    } catch {
      return false;
    }
  }, undefined, { timeout: 30_000 });
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
  defaultValueType = 'function',
  defaultValueProcedure = 'public.test_order_default',
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
  const tab = async (label) => {
    const tabItem = dialog.locator('.vxe-tabs-header--item', { hasText: label });
    await tabItem.click();
    await page.waitForTimeout(40);
  };

  const activePane = () => dialog.locator('.vxe-tabs-pane--item.is--visible');
  const fieldControl = (label) => activePane().locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: label }),
  }).first();
  assert.equal(await dialog.locator('.vxe-tabs-header--item').count(), 4);
  assert.equal(await fieldControl('字段名称').count(), 1);
  assert.equal(await activePane().locator('.lc-sub-form').count(), 0);
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
  await tab('默认值与选项');
  await fieldControl('默认值类型').locator('.vxe-select').click({ force: true });
  await page.locator('.vxe-select-option', {
    hasText: defaultValueType === 'procedure' ? '存储过程' : '函数',
  }).last().click();
  if (defaultValueType === 'procedure') {
    const procedureControl = fieldControl('存储过程');
    await procedureControl.locator('.vxe-select').click({ force: true });
    await page.locator('.vxe-select--panel:visible .vxe-select-option', {
      hasText: '订单默认号',
    }).last().click();
  } else {
    await fieldControl('默认值函数').locator('textarea').fill(defaultValueScript);
  }
  const optionsCodeControl = fieldControl('关联下拉 Code');
  await optionsCodeControl.locator('.vxe-select').click({ force: true });
  const option = page.locator('.vxe-select--panel:visible .vxe-select-option', {
    hasText: optionsCode,
  }).first();
  await option.waitFor({ state: 'visible' });
  await option.click();
  await tab('事件与校验');
  await fieldControl('值更新事件').locator('textarea').fill(updateScript);
  await fieldControl('校验提示').locator('input').fill(validationMessage);
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
  assert.equal(await dialog.locator('.vxe-tabs-header--item').count(), 4);
  await dialog.locator('.vxe-tabs-header--item', { hasText: '关联资料' }).click();
  const fieldControl = (label) => dialog.locator(
    '.vxe-tabs-pane--item.is--visible .vxe-form--item',
  ).filter({
    has: page.locator('.vxe-form--item-title', { hasText: label }),
  }).first();

  const relationPanel = fieldControl('关联资料配置').locator('.lc-sub-form');
  await relationPanel.waitFor({ state: 'visible' });
  const relationControl = (label) => relationPanel.locator('.vxe-form--item').filter({
    has: page.locator('.vxe-form--item-title', { hasText: label }),
  }).first();
  const optionMatches = (text, label) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized === label ||
      normalized.startsWith(`${label} (`) ||
      normalized.endsWith(`(${label})`);
  };
  const selectOption = async (control, label) => {
    const nestedSelect = control.locator('.vxe-select');
    const select = await nestedSelect.count() ? nestedSelect.first() : control;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      await select.click({ force: true });
      const panel = page.locator('.vxe-select--panel:visible').last();
      if (await panel.isVisible().catch(() => false)) {
        const options = panel.locator('.vxe-select-option');
        const count = await options.count();
        for (let index = 0; index < count; index += 1) {
          const option = options.nth(index);
          const text = await option.innerText().catch(() => '');
          if (!optionMatches(text, label)) continue;
          try {
            await option.click({ force: true, timeout: 1_000 });
            await select.evaluate((element) => {
              const instance = element.__vueParentComponent;
              return instance?.exposed?.hidePanel?.() ?? instance?.proxy?.hidePanel?.();
            });
            await panel.waitFor({ state: 'hidden', timeout: 3_000 });
            return;
          } catch {
            // The option list can be replaced while dependent metadata settles.
          }
        }
      }
      await page.waitForTimeout(100);
    }
    throw new Error(`Select option did not become visible: ${label}`);
  };
  for (const label of [
    '业务资源',
    '值字段',
    '显示字段',
    '显示值目标字段',
    '搜索字段',
  ]) {
    assert.equal(
      await relationControl(label).locator('.vxe-select').count(),
      1,
      `${label} must use a select control.`,
    );
  }
  for (const removedLabel of [
    '来源类型',
    '实体编码',
    '表名/视图名',
    '页面编码',
    '页面数据源',
    '服务名称',
    '服务方法',
  ]) {
    assert.equal(await relationControl(removedLabel).count(), 0);
  }
  await selectOption(relationControl('显示字段'), '说明');

  const mappingRows = relationControl('字段映射').locator('.lc-array-table .vxe-body--row');
  assert.equal(await mappingRows.count(), 2);
  assert.equal(await mappingRows.first().locator('.vxe-select').count(), 2);
  await relationControl('字段映射').locator('.lc-array-table__toolbar .vxe-button', {
    hasText: '新增映射',
  }).click();
  assert.equal(await mappingRows.count(), 3);
  const newSelects = mappingRows.nth(2).locator('.vxe-select');
  await selectOption(newSelects.nth(0), '单位');
  await selectOption(newSelects.nth(1), 'relatedItemUom');

  await selectOption(relationControl('业务资源'), '客户');
  await page.waitForFunction(() => {
    const relation = document.querySelector(
      '.runtime-form-field-editor-dialog .vxe-tabs-pane--item.is--visible .lc-sub-form',
    );
    const controls = [...(relation?.querySelectorAll('.vxe-form--item') ?? [])];
    const display = controls.find((item) => item.textContent?.includes('显示字段'));
    return display?.querySelector('input')?.value === '';
  });
  assert.equal(await relationControl('显示字段').locator('input').inputValue(), '');
  assert.equal(await mappingRows.nth(2).locator('input').first().inputValue(), '');

  await selectOption(relationControl('业务资源'), '物料');
  await page.waitForFunction(() => {
    const relation = document.querySelector(
      '.runtime-form-field-editor-dialog .vxe-tabs-pane--item.is--visible .lc-sub-form',
    );
    const controls = [...(relation?.querySelectorAll('.vxe-form--item') ?? [])];
    const display = controls.find((item) => item.textContent?.includes('显示字段'));
    const select = display?.querySelector('.vxe-select');
    return Boolean(select && !select.classList.contains('is--disabled'));
  });
  await selectOption(relationControl('显示字段'), '名称');
  await selectOption(relationControl('显示字段'), '说明');
  await selectOption(mappingRows.nth(2).locator('.vxe-select').nth(0), '单位');
  await selectOption(mappingRows.nth(2).locator('.vxe-select').nth(1), 'relatedItemUom');

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
  const regularField = runtimeField(page, '姓名');
  const createLockedField = runtimeField(page, '新增禁用示例');
  const editLockedField = runtimeField(page, '编辑禁用示例');
  if (runtimeMode === 'scan') {
    for (const field of [regularField, createLockedField, editLockedField]) {
      const input = field.locator('.lc-field input').first();
      assert.equal(await input.count(), 1, 'Scan mode must keep the configured input component.');
      assert.equal(await input.isDisabled(), true, 'Scan mode must disable every input component.');
      assert.equal(
        await field.locator('.vxe-input--readonly').count(),
        0,
        'Scan mode must not replace an input with a readonly text renderer.',
      );
    }
    return;
  }
  const createLockedInput = createLockedField.locator('.lc-field input').first();
  const editLockedInput = editLockedField.locator('.lc-field input').first();
  assert.equal(await createLockedInput.isDisabled(), runtimeMode === 'add');
  assert.equal(await editLockedInput.isDisabled(), runtimeMode === 'edit');
}

async function enterRequestedMode(page, runtimeMode) {
  if (runtimeMode === 'scan') {
    await page.waitForFunction(
      () => window.__runtimeFormDesignerSaveSmoke.snapshot().runtime.status.formMode === 'scan',
    );
    return;
  }

  if (runtimeMode === 'edit') {
    await page.waitForFunction(
      () => window.__runtimeFormDesignerSaveSmoke.snapshot().runtime.status.formMode === 'scan',
    );
    const regularField = runtimeField(page, '姓名');
    const modifyButton = page.locator('.lc-node-button-group .vxe-button').filter({ hasText: '修改' }).first();
    const regularInput = regularField.locator('.lc-field input').first();
    assert.equal(await regularInput.count(), 1);
    assert.equal(await regularInput.isDisabled(), true);
    assert.equal(await modifyButton.isDisabled(), false);
    await modifyButton.click();
  }

  await page.waitForFunction(
    (mode) => window.__runtimeFormDesignerSaveSmoke.snapshot().runtime.status.formMode === mode,
    runtimeMode,
  );
}

async function verifyFieldScriptBehavior(page) {
  await page.waitForFunction(() => {
    const model = window.__runtimeFormDesignerSaveSmoke
      ?.snapshot?.()
      ?.formModels?.['runtime-edit-form'];
    return model?.generatedCode?.startsWith('AUTO-form-generatedCode-') &&
      Boolean(model?.procedureCode);
  });
  const initialDefaults = await page.evaluate(() => {
    const model = window.__runtimeFormDesignerSaveSmoke
      .snapshot()
      ?.formModels?.['runtime-edit-form'];
    return {
      generatedCode: model?.generatedCode,
      procedureCode: model?.procedureCode,
    };
  });

  await page.locator('.lc-node-button-group .vxe-button').filter({ hasText: '新增' }).first().click();
  await page.waitForFunction((previous) => {
    const model = window.__runtimeFormDesignerSaveSmoke
      .snapshot()
      ?.formModels?.['runtime-edit-form'];
    return model?.generatedCode?.startsWith('AUTO-form-generatedCode-') &&
      model.generatedCode !== previous.generatedCode &&
      Boolean(model?.procedureCode);
  }, initialDefaults);
  const createdDefaults = await page.evaluate(() => {
    const model = window.__runtimeFormDesignerSaveSmoke
      .snapshot()
      ?.formModels?.['runtime-edit-form'];
    return {
      generatedCode: model?.generatedCode,
      procedureCode: model?.procedureCode,
    };
  });
  assert.notEqual(
    createdDefaults.generatedCode,
    initialDefaults.generatedCode,
    'Clicking create must resolve a fresh function default in the complete form object.',
  );
  assert.match(
    createdDefaults.procedureCode,
    /^PROC-procedureCode-\d+$/,
    'Clicking create must resolve the procedure default in the complete form object.',
  );

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
  await waitForSmokeReady(activePage);
  const bootResult = JSON.parse(await activePage.locator('#result').textContent());
  assert.equal(bootResult.ok, true, pageErrors.join('\n'));
  await enterRequestedMode(activePage, runtimeMode);
  await verifyModeDisabledBehavior(activePage, runtimeMode);
  await verifyFieldScriptBehavior(activePage);

  await editRuntimeForm({
    page: activePage,
    currentLabel: '姓名',
    nextLabel: `姓名已更新-${pageMode}`,
    enteredValue: `保留姓名-${pageMode}`,
    expectedSaveCount: 1,
  });
  if (runtimeMode === 'edit') {
    await activePage.locator('.lc-node-button-group .vxe-button').filter({ hasText: '修改' }).first().waitFor();
  }
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
    defaultValueType: 'procedure',
    defaultValueProcedure: 'public.test_order_default',
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
  const editFormBlock = result.pageRecord.schema.blocks.find(
    (block) => block.id === 'runtime-edit-form',
  );
  const searchFormBlock = result.pageRecord.schema.blocks.find(
    (block) => block.id === 'runtime-search-form',
  );
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
    editFormBlock.schema.fields[0].label,
    `姓名已更新-${pageMode}`,
  );
  assert.equal(
    editFormBlock.schema.fields[1].optionsCode,
    'order_code',
  );
  assert.equal(editFormBlock.schema.fields[1].component, 'vxe-textarea');
  assert.equal(editFormBlock.schema.fields[1].createDisabled, true);
  assert.equal(editFormBlock.schema.fields[1].editDisabled, true);
  assert.equal(editFormBlock.schema.fields[1].defaultValueType, 'function');
  assert.match(editFormBlock.schema.fields[1].defaultValueScript, /AUTO-001/);
  assert.match(editFormBlock.schema.fields[1].updateScript, /event\.value/);
  assert.match(editFormBlock.schema.fields[1].validationScript, /startsWith/);
  assert.equal(
    editFormBlock.schema.fields[1].rules.some((rule) => rule.required),
    true,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(editFormBlock.initialValues, 'code'),
    false,
    'Function defaults must replace the previous literal initial value.',
  );
  assert.deepEqual(
    editFormBlock.schema.actions,
    [{ code: 'validate', label: '执行校验', type: 'submit' }],
  );
  assert.equal(editFormBlock.schema.fields[0].field, 'name');
  assert.equal(
    searchFormBlock.schema.fields[0].label,
    `关键字已更新-${pageMode}`,
  );
  assert.equal(
    searchFormBlock.schema.fields[0].optionsCode,
    'search_keyword',
  );
  assert.equal(searchFormBlock.schema.fields[0].createDisabled, true);
  assert.equal(searchFormBlock.schema.fields[0].editDisabled, true);
  assert.equal(
    searchFormBlock.schema.fields[0].defaultValueType,
    'procedure',
  );
  assert.equal(
    searchFormBlock.schema.fields[0].defaultValueProcedure,
    'public.test_order_default',
  );
  assert.match(
    searchFormBlock.schema.fields[0].validationScript,
    /startsWith/,
  );
  assert.equal(
    searchFormBlock.schema.fields[0].rules.some((rule) => rule.required),
    true,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      searchFormBlock.initialValues,
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
  const relatedItem = editFormBlock.schema.fields.find(
    (field) => field.field === 'relatedItem',
  );
  assert.equal(relatedItem.component, 'base-info');
  assert.equal(relatedItem.props.relateInfoConfig.entityCode, 'planning_item');
  assert.deepEqual(relatedItem.props.relateInfoConfig.displayField, ['name', 'description']);
  assert.deepEqual(relatedItem.props.relateInfoConfig.fieldMappings, [
    { sourceField: 'id', targetField: 'relatedItem' },
    { sourceField: 'name', targetField: 'relatedItemName' },
    { sourceField: 'uom', targetField: 'relatedItemUom' },
  ]);
}

async function runScanScenario() {
  const url = `http://127.0.0.1:${port}/tests/runtime-form-designer-save-browser.html?page=scan&mode=scan`;
  await activePage.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForSmokeReady(activePage);
  await enterRequestedMode(activePage, 'scan');
  await verifyModeDisabledBehavior(activePage, 'scan');
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

  await runScanScenario();
  await runScenario('plain', 'add');
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
        relationDialogHtml: document.querySelector('.runtime-form-field-editor-dialog')?.innerHTML.slice(0, 30000),
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
