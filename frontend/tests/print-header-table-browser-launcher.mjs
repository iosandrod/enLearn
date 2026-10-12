import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const { default: { chromium } } = await import(pathToFileURL(resolve(root, 'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js')).href);
const browser = await chromium.launch({ executablePath: process.env.PRINT_DESIGNER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3301';
const sourceRoot = `/@fs/${root.replaceAll('\\', '/')}/packages/tldraw-vue/src`;
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${baseUrl}/print-designer`, { waitUntil: 'domcontentloaded' });
  await page.locator('.designer-side-tab').filter({ hasText: '数据源' }).waitFor({ state: 'visible', timeout: 60_000 });
  const result = await page.evaluate(async sourceRoot => {
    const designer = document.querySelector('.app-shell').__vueParentComponent.exposed;
    const editor = designer.getEditor();
    const { createVueMaterialShapePartials, VUE_MATERIAL_SECTION_DEFINITIONS } = await import(`${sourceRoot}/editor/extensions/material/vueMaterialShape.ts`);
    const { PrintRenderer } = await import(`${sourceRoot}/print/renderer.ts`);
    const { PRINT_HEADER_PREVIEW_SOURCE } = await import(`${sourceRoot}/print/dataSource.ts`);
    const source = { type: 'inline', rows: [
      { customer: '客户 A', items: Array.from({ length: 30 }, (_, index) => ({ sku: `A-${index + 1}` })), fees: [] },
      { customer: '客户 B', items: [{ sku: 'B-1' }], fees: [{ amount: 50 }] },
    ] };
    editor.createShapes(createVueMaterialShapePartials({
      id: 'shape:header-test', rect: { x: 0, y: 0, w: 320, h: 400 },
      sectionIds: VUE_MATERIAL_SECTION_DEFINITIONS.map((_, index) => `shape:header-test-${index}`),
    }));
    editor.updateShape({ id: 'shape:header-test', type: 'vue-material', props: { dataSourceField: 'items', columns: [{ field: 'sku', title: '物料' }] } });
    const config = {
      dataSource: source, data: source.rows,
      previewSettings: { mode: 'data', detailField: PRINT_HEADER_PREVIEW_SOURCE },
      template: { materialGrids: { 'shape:header-test': { data: source.rows[0].items, columns: [{ field: 'sku', title: '物料' }] } } },
      page: { widthMm: 210, heightMm: 297 }, printer: { type: 'browser' },
    };
    const before = JSON.stringify(source);
    const jobs = new PrintRenderer(editor).createRenderJobs(config);
    if (JSON.stringify(source) !== before) throw new Error('Rendering mutated source');
    return jobs.map(job => ({ customer: job.row.customer, page: job.materialGridPageIndex, detail: job.materialGridPlan.materials[0].pages[job.materialGridPageIndex].data }));
  }, sourceRoot);
  assert.ok(result.length > 2, JSON.stringify(result));
  assert.equal(result[0].customer, '客户 A');
  assert.equal(result[0].page, 0);
  assert.ok(result.filter(page => page.customer === '客户 A').length > 1);
  assert.deepEqual(result.filter(page => page.customer === '客户 A').flatMap(page => page.detail), Array.from({ length: 30 }, (_, index) => ({ sku: `A-${index + 1}` })));
  assert.deepEqual(result.at(-1), { customer: '客户 B', page: 0, detail: [{ sku: 'B-1' }] });

  await page.locator('.designer-side-tab').filter({ hasText: '数据源' }).click();
  await page.waitForFunction(() => !document.querySelector('.data-source-panel').__vueParentComponent.setupState.definitionsLoading);
  await page.evaluate(() => {
    const state = document.querySelector('.data-source-panel').__vueParentComponent.setupState;
    const designer = document.querySelector('.app-shell').__vueParentComponent.exposed;
    const code = 'print-designer.datasource.header-fixture';
    state.activeDefinition = {
      id: 'header-fixture', code, name: '表头验证', table_name: null, enabled: true,
      schema: { fields: [{ field: 'customer', label: '客户', component: 'vxe-input' }], actions: [],
        printDetail: [{ id: 'items', field: 'items', label: '明细', columns: [{ field: 'sku', title: '物料' }] }],
      },
    };
    designer.applyWorkspaceTemplateConfig({ ...designer.getWorkspaceTemplateConfig(), printDataSource: {
      type: 'inline', formCode: code, detailField: 'items', rows: [
        { customer: '模式 A', items: [{ sku: 'A-1' }] },
        { customer: '模式 B', items: [{ sku: 'B-1' }] },
      ],
    } });
  });
  const panel = page.locator('.data-source-panel');
  await panel.getByRole('tab', { name: '表头', exact: true }).click();
  const getPanelRows = () => page.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('.app-shell').__vueParentComponent.exposed.getWorkspaceTemplateConfig().printDataSource.rows)));
  const beforeSwitch = await getPanelRows();
  await panel.getByRole('button', { name: '表格模式', exact: true }).click();
  await panel.getByText('2 条表头记录', { exact: true }).waitFor();
  await panel.getByRole('button', { name: '表单模式', exact: true }).click();
  assert.deepEqual(await getPanelRows(), beforeSwitch, 'Switching view must not mutate persisted rows');
  await page.evaluate(() => document.querySelector('.data-source-panel').__vueParentComponent.setupState.handleHeaderRowChange(1));
  await panel.locator('[data-lc-field="customer"] input').fill('模式 B 修改');
  await panel.locator('[data-lc-field="customer"] input').blur();
  await page.waitForFunction(() => document.querySelector('.app-shell').__vueParentComponent.exposed.getWorkspaceTemplateConfig().printDataSource.rows[1].customer === '模式 B 修改');
  const afterFormEdit = await getPanelRows();
  assert.deepEqual(afterFormEdit[0], beforeSwitch[0]);
  assert.deepEqual(afterFormEdit[1].items, beforeSwitch[1].items);
  await page.evaluate(() => document.querySelector('.data-source-panel').__vueParentComponent.setupState.handleDetailFormUpdate({ items: [{ sku: 'B-updated' }] }));
  const afterDetailEdit = await getPanelRows();
  assert.deepEqual(afterDetailEdit[0], beforeSwitch[0]);
  assert.deepEqual(afterDetailEdit[1].items, [{ sku: 'B-updated' }]);

  // Mount the table with the designer's registered components and dialog host.
  await page.evaluate(async sourceRoot => {
    const instance = document.querySelector('.app-shell').__vueParentComponent;
    const { createApp, h, reactive } = await import('/node_modules/.vite/deps/vue.js');
    const { default: HeaderTable } = await import(`${sourceRoot}/components/PrintDataSourceHeaderTable.vue`);
    const state = reactive({ readonly: false, rows: [
      { customer: '客户 A', enabled: true, hidden: 'keep', items: [{ sku: 'A-1' }] },
      { customer: '客户 B', enabled: false, hidden: 'keep-B', items: [{ sku: 'B-1' }, { sku: 'B-2' }] },
    ] });
    window.headerTableFixture = state;
    window.headerTableOriginal = JSON.stringify(state.rows);
    const mount = document.createElement('div');
    mount.id = 'header-table-fixture';
    mount.style.cssText = 'position:fixed;inset:50px;background:white;z-index:9000;padding:20px';
    document.body.append(mount);
    const app = createApp({ render: () => h(HeaderTable, {
      rows: state.rows, readonly: state.readonly,
      schema: { fields: [
        { field: 'customer', label: '客户', component: 'vxe-input' },
        { field: 'enabled', label: '启用', component: 'vxe-switch' },
      ], actions: [] },
      detailTables: [{ id: 'items', field: 'items', label: '订单明细', columns: [{ field: 'sku', title: '物料' }] }],
      'onUpdate:rows': rows => { state.rows = rows; },
    }) });
    Object.assign(app._context.components, instance.appContext.components);
    app._context.provides = instance.appContext.provides;
    app.mount(mount);
  }, sourceRoot);
  const table = page.locator('#header-table-fixture');
  await table.getByText('2 条表头记录', { exact: true }).waitFor();
  assert.equal(await table.getByText('订单明细', { exact: true }).isVisible(), true);
  assert.equal(await page.evaluate(() => JSON.stringify(window.headerTableFixture.rows) === window.headerTableOriginal), true);
  await table.getByRole('button', { name: '编辑', exact: true }).nth(1).click();
  const dialog = page.locator('.vxe-modal--wrapper').filter({ hasText: '编辑表头记录 · 第 2 行' });
  await dialog.locator('[data-lc-field="customer"] input').fill('客户 B 修改');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await table.getByText('客户 B 修改', { exact: true }).waitFor();
  const updated = await page.evaluate(() => JSON.parse(JSON.stringify(window.headerTableFixture.rows)));
  assert.equal(updated[0].customer, '客户 A');
  assert.equal(updated[1].hidden, 'keep-B');
  assert.deepEqual(updated[1].items.map(item => item.sku), ['B-1', 'B-2']);
  await table.getByRole('button', { name: '复制', exact: true }).nth(1).click();
  await table.getByText('3 条表头记录', { exact: true }).waitFor();
  await table.getByRole('button', { name: '删除', exact: true }).nth(2).click();
  await table.getByText('2 条表头记录', { exact: true }).waitFor();
  await page.evaluate(() => { window.headerTableFixture.readonly = true; });
  assert.equal(await table.getByRole('button', { name: '新增行', exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('Header table browser checks passed: columns, row editing, nested detail preservation, copy/delete, readonly and per-record preview.');
} finally {
  await browser.close();
}
