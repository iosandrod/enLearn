import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const { default: { chromium } } = await import(pathToFileURL(resolve(root,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js')).href);
const browser = await chromium.launch({
  executablePath: process.env.PRINT_DESIGNER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
const sourceRoot = `/@fs/${root.replaceAll('\\', '/')}/packages/tldraw-vue/src`;
const shapeId = 'shape:material-columns-tab';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3301';

try {
  await page.addInitScript(() => {
    window.__printPropertySchemas = {
      'print-designer.property.vue-material': {
        fields: [{ field: 'name', label: '名称', component: 'vxe-input' }, {
          field: 'columns', label: '列属性', component: 'lc-array-table', showTitle: false,
          props: {
            height: 440, rowConfig: { keyField: '__id' },
            treeConfig: { childrenField: 'children', expandAll: true }, childAddable: true, addChildText: '新增子列',
            defaultRow: { field: 'column_{{ index }}', title: '新列', visible: true, width: 100 },
            toolbarButtons: [{ code: 'add', label: '新增列', command: 'add' }],
            columns: [
              { field: 'field', title: '字段名', minWidth: 120 },
              { field: 'title', title: '列标题', minWidth: 120 },
              { field: 'width', title: '宽度', component: 'lc-number-input', width: 100 },
            ],
          },
        }],
        layout: [{ kind: 'tabs', defaultKey: 'basic', tabs: [
          { key: 'basic', label: '基本属性', blocks: [{ kind: 'field', field: 'name' }] },
          { key: 'material-columns', label: '列属性', blocks: [{ kind: 'field', field: 'columns' }] },
        ] }], actions: [],
      },
    };
  });
  await page.goto(`${baseUrl}/tests/print-material-column-selection-browser.html`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('.designer-side-tab').filter({ hasText: '数据源' }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.lowcode-form-panel')]
    .every(node => !node.__vueParentComponent.setupState.formDefinitionsLoading));
  await page.evaluate(async ({ sourceRoot, shapeId }) => {
    const editor = document.querySelector('.app-shell').__vueParentComponent.exposed.getEditor();
    const { createVueMaterialShapePartials, VUE_MATERIAL_SECTION_DEFINITIONS } =
      await import(`${sourceRoot}/editor/extensions/material/vueMaterialShape.ts`);
    const { getEditorPrintDataSource } = await import(`${sourceRoot}/editor/workspaceDataSource.ts`);
    getEditorPrintDataSource(editor).value = {
      type: 'inline', rows: [{ items: [] }], detailField: 'items', detailColumns: [
        { field: 'sku', title: '物料编码', width: 120, props: { custom: 'preserved' } },
      ],
    };
    editor.createShapes(createVueMaterialShapePartials({
      id: shapeId, rect: { x: 60, y: 60, w: 360, h: 400 },
      sectionIds: VUE_MATERIAL_SECTION_DEFINITIONS.map((_, index) => `${shapeId}-${index}`),
    }));
    editor.updateShape({ id: shapeId, type: 'vue-material', props: { dataSourceField: 'items' } });
    editor.select(shapeId);
    editor.zoomToSelection({ animation: { duration: 0 } });
  }, { sourceRoot, shapeId });
  const panel = page.locator('.designer-tool-view--properties:visible .lowcode-form-panel');
  await panel.getByText('列属性', { exact: true }).click();
  const table = panel.locator('[data-lc-field="columns"] .lc-array-table');
  await table.waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-lc-field="columns"] input')]
    .some(input => input.value === '物料编码'));
  // Locate by live input value; VXE does not always render a value attribute.
  const titleInput = table.locator('input:not([readonly]):visible');
  const inputIndex = await titleInput.evaluateAll(inputs => inputs.findIndex(input => input.value === '物料编码'));
  assert.ok(inputIndex >= 0, 'Inherited data-source columns must appear in the subtable.');
  await titleInput.nth(inputIndex).fill('更新后的编码');
  await titleInput.nth(inputIndex).blur();
  await page.waitForFunction(shapeId => document.querySelector('.app-shell').__vueParentComponent.exposed
    .getEditor().getShape(shapeId).props.columns?.[0]?.title === '更新后的编码', shapeId);
  await table.getByRole('button', { name: '新增列', exact: true }).click();
  await page.waitForFunction(shapeId => document.querySelector('.app-shell').__vueParentComponent.exposed
    .getEditor().getShape(shapeId).props.columns?.length === 2, shapeId);
  await table.getByRole('button', { name: '新增子列', exact: true }).first().click();
  await page.waitForFunction(shapeId => document.querySelector('.app-shell').__vueParentComponent.exposed
    .getEditor().getShape(shapeId).props.columns?.[0]?.children?.length === 1, shapeId);
  const state = await page.evaluate(async ({ shapeId, sourceRoot }) => {
    const editor = document.querySelector('.app-shell').__vueParentComponent.exposed.getEditor();
    const { getEditorPrintDataSource } = await import(`${sourceRoot}/editor/workspaceDataSource.ts`);
    const shape = JSON.parse(JSON.stringify(editor.getShape(shapeId)));
    const source = getEditorPrintDataSource(editor).value;
    editor.selectNone();
    editor.select(shapeId);
    return { shape, source };
  }, { shapeId, sourceRoot });
  assert.equal(state.shape.props.columns[0].title, '更新后的编码');
  assert.equal(state.shape.props.columns[0].props.custom, 'preserved');
  assert.equal(state.shape.props.columns[0].__id, undefined);
  assert.equal(state.source.detailColumns[0].title, '物料编码', 'Editing the material must not edit the shared data source.');
  await panel.getByText('列属性', { exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-lc-field="columns"] input')]
    .some(input => input.value === '更新后的编码'));
  console.log('Material property columns subtable: inherited columns, live edits, add, nested columns and node isolation passed.');
} catch (error) {
  console.error(await page.evaluate(() => ({
    inputs: [...document.querySelectorAll('[data-lc-field="columns"] input')].map(input => input.value),
    models: [...document.querySelectorAll('.lowcode-form-panel')].map(node => node.__vueParentComponent.setupState.formModel),
  })).catch(() => null));
  throw error;
} finally {
  await browser.close();
}
