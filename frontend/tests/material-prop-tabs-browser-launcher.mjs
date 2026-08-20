import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.MATERIAL_PROP_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const artifactDir = join(workspaceDir, 'artifacts');
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
const definitionRequests = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
});
page.on('response', (response) => {
  if (response.request().method() !== 'POST' || !response.url().includes('/api/service')) return;
  const postData = response.request().postDataJSON();
  if (
    postData?.serviceName === 'lowcode' &&
    postData?.serviceMethod === 'listItems' &&
    postData?.postData?.resource === 'lowcode_form_definitions' &&
    typeof postData?.postData?.filters?.code === 'string' &&
    postData.postData.filters.code.startsWith('material-prop.')
  ) {
    definitionRequests.push({
      status: response.status(),
      code: postData.postData.filters.code,
      enabled: postData.postData.filters.enabled,
      limit: postData.postData.limit,
    });
  }
});

async function waitForDesigner() {
  await page.goto(
    `${baseUrl}/dashboard/low-code/designer/admin-system-options-edit`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForTimeout(800);
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Designer redirected to sign in.');
  await page.getByText('下拉数据编辑', { exact: true }).first().waitFor({ state: 'visible' });
  await page.locator('.material-prop-form').waitFor({ state: 'visible' });
  await page.locator('.material-prop-form .lc-form-tabs').waitFor({ state: 'visible' });
}

function innerTab(label) {
  return page.locator('.material-prop-form .lc-form-tabs .vxe-tabs-header--item').filter({
    hasText: label,
  });
}

async function selectTreeNode(text, componentKey) {
  const rows = page.locator('.left-aside .layer-row--block');
  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    if (!await row.isVisible()) continue;
    const strong = (await row.locator('strong').first().textContent())?.trim();
    const small = (await row.locator('small').first().textContent())?.trim();
    if (strong !== text || (componentKey && small !== componentKey)) continue;
    await row.evaluate((element) => element.click());
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

async function verifyTabs(expectedLabels) {
  const labels = await page
    .locator('.material-prop-form .lc-form-tabs .vxe-tabs-header--item-name')
    .allTextContents();
  for (const label of expectedLabels) {
    assert.ok(labels.some((value) => value.trim() === label), `missing inner tab ${label}`);
  }
  const metrics = await page.locator('.material-prop-form .lc-form-tabs').evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    const panel = element.closest('[class*="panelBody"]')?.getBoundingClientRect();
    return {
      left: rectangle.left,
      right: rectangle.right,
      panelLeft: panel?.left ?? 0,
      panelRight: panel?.right ?? window.innerWidth,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(metrics.left >= metrics.panelLeft - 1);
  assert.ok(metrics.right <= metrics.panelRight + 1);
  assert.ok(metrics.right <= metrics.viewportWidth);
}

async function verifyStandaloneArrayTableTab(label) {
  await innerTab(label).click();
  const activePane = page.locator(
    '.material-prop-form .lc-form-tabs > .vxe-tabs > .vxe-tabs-pane--wrapper ' +
    '.vxe-tabs-pane--item.is--visible',
  );
  await activePane.locator('.lc-array-table').first().waitFor({ state: 'visible' });
  assert.equal(
    await activePane.locator('.lc-form-item').count(),
    1,
    `${label} should contain only its table input field.`,
  );
}

try {
  await mkdir(artifactDir, { recursive: true });
  await waitForDesigner();

  const selectedForm =
    await selectTreeNode('数据源信息', 'form') ||
    await selectTreeNode('普通表单', 'form');
  assert.ok(selectedForm, 'Could not select the form block in the layer tree.');
  await page.waitForFunction(
    () => document.querySelector('.material-prop-form')?.textContent?.includes('结构'),
  );
  assert.ok(
    definitionRequests.some(
      (entry) =>
        entry.status === 200 &&
        entry.code === 'material-prop.form' &&
        entry.enabled === true &&
        entry.limit === 1,
    ),
    'Designer did not query the selected form material property definition by exact code.',
  );
  await verifyTabs(['基础', '数据', '结构', '按钮', '行为']);
  await innerTab('结构').click();
  await page.getByText('表单字段', { exact: true }).last().waitFor({ state: 'visible' });
  const formFieldsTable = page.locator(
    '.material-prop-form [data-lc-field="fields"] .lc-array-table',
  );
  await formFieldsTable.waitFor({ state: 'visible' });
  await formFieldsTable
    .locator('.vxe-table--header-wrapper')
    .first()
    .waitFor({ state: 'visible' });
  const formFieldsTableBox = await formFieldsTable
    .locator('.lc-array-table__grid')
    .boundingBox();
  assert.ok(
    formFieldsTableBox && formFieldsTableBox.height > 100,
    'The form fields table should have a visible, usable height inside the structure tab.',
  );
  await page.screenshot({
    path: join(artifactDir, 'material-prop-tabs-form.png'),
    fullPage: true,
  });

  const selectedGrid =
    await selectTreeNode('字典明细', 'lowcode-grid') ||
    await selectTreeNode('数据表格', 'lowcode-grid');
  assert.ok(selectedGrid, 'Could not select the grid block in the layer tree.');
  await verifyTabs(['基础', '数据', '列', '显示', '交互']);
  await innerTab('交互').click();
  await page.getByText('VxeGrid 事件', { exact: true }).last().waitFor({ state: 'visible' });
  await page.screenshot({
    path: join(artifactDir, 'material-prop-tabs-grid.png'),
    fullPage: true,
  });

  const selectedInput =
    await selectTreeNode('Input', 'input') ||
    await selectTreeNode('input', 'input');
  assert.ok(selectedInput, 'Could not select an input block in the layer tree.');
  await verifyTabs(['基础', '校验', '显示', '图标', '高级']);
  await innerTab('校验').click();
  await page.getByText('是否显示表单必填星号', { exact: true }).last().waitFor({ state: 'visible' });
  await page.screenshot({
    path: join(artifactDir, 'material-prop-tabs-input.png'),
    fullPage: true,
  });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    definitionRequests,
    screenshots: [
      'artifacts/material-prop-tabs-form.png',
      'artifacts/material-prop-tabs-grid.png',
      'artifacts/material-prop-tabs-input.png',
    ],
  }));
} finally {
  await context.close();
  await browser.close();
}
