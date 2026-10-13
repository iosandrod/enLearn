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
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3301';
const sourceRoot = `/@fs/${root.replaceAll('\\', '/')}/packages/tldraw-vue/src`;
const shapeId = 'shape:column-selection-test';

try {
  // Use a deterministic designer fixture so background template loads cannot replace the test shapes.
  await page.goto(`${baseUrl}/tests/print-material-column-selection-browser.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('.designer-side-tab').filter({ hasText: '数据源' })
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.lowcode-form-panel')]
    .every(node => !node.__vueParentComponent.setupState.formDefinitionsLoading));
  await page.evaluate(async ({ sourceRoot, shapeId }) => {
    const editor = document.querySelector('.app-shell').__vueParentComponent.exposed.getEditor();
    const { createVueMaterialShapePartials, VUE_MATERIAL_SECTION_DEFINITIONS } =
      await import(`${sourceRoot}/editor/extensions/material/vueMaterialShape.ts`);
    editor.createShapes(createVueMaterialShapePartials({
      id: shapeId, rect: { x: 60, y: 60, w: 360, h: 400 },
      sectionIds: VUE_MATERIAL_SECTION_DEFINITIONS.map((_, index) => `${shapeId}-${index}`),
    }));
    editor.updateShape({ id: shapeId, type: 'vue-material', props: {
      dataSourceField: 'items', columns: [
        { field: 'sku', title: '物料编码', width: 120 },
        { field: 'name', title: '物料名称', width: 120 },
        { field: 'qty', title: '数量', width: 120 },
      ],
    } });
    editor.select(shapeId);
    editor.zoomToSelection({ animation: { duration: 0 } });
    window.dispatchEvent(new CustomEvent('enlearn:material-column-select', {
      detail: { materialShapeId: shapeId, field: 'sku' },
    }));
  }, { sourceRoot, shapeId });

  const title = page.locator('.lowcode-form-panel__column-form [data-lc-field="title"] input');
  await title.waitFor({ state: 'visible' });
  await title.fill('已编辑编码');
  await title.blur();
  await page.waitForFunction(shapeId => document.querySelector('.app-shell').__vueParentComponent.exposed
    .getEditor().getShape(shapeId).props.columns[0].title === '已编辑编码', shapeId);

  // Selection changes during pointerdown, before the old input's blur/update finishes.
  const afterLateUpdate = await page.evaluate(({ shapeId }) => {
    let oldForm = document.querySelector('.lowcode-form-panel__column-form .lc-form').__vueParentComponent;
    while (oldForm && oldForm.type.__name !== 'LowCodeForm') oldForm = oldForm.parent;
    if (!oldForm) throw new Error('The column editor must render LowCodeForm.');
    const oldModel = { ...oldForm.props.modelValue };
    window.dispatchEvent(new CustomEvent('enlearn:material-column-select', {
      detail: { materialShapeId: shapeId, field: 'name' },
    }));
    oldForm.emit('update:modelValue', oldModel);
    return document.querySelector('.app-shell').__vueParentComponent.exposed
      .getEditor().getShape(shapeId).props.columns.map(column => column.title);
  }, { shapeId });
  assert.deepEqual(afterLateUpdate, ['已编辑编码', '物料名称', '数量'],
    'A late update from the previous column must not overwrite the newly selected column.');
  await page.waitForFunction(() => document.querySelector('.lowcode-form-panel__column-form [data-lc-field="title"] input')
    ?.value === '物料名称');
  for (let index = 0; index < 6; index++) {
    const field = index % 2 ? 'name' : 'qty';
    const expected = field === 'name' ? '物料名称' : '数量';
    await title.focus();
    await page.locator(`[data-material-shape-id="${shapeId}"][data-material-column-field="${field}"]`).first().click();
    await page.waitForFunction(expected => document.querySelector('.lowcode-form-panel__column-form [data-lc-field="title"] input')
      ?.value === expected, expected);
  }
  const titles = await page.evaluate(shapeId => document.querySelector('.app-shell').__vueParentComponent.exposed
    .getEditor().getShape(shapeId).props.columns.map(column => column.title), shapeId);
  assert.deepEqual(titles, ['已编辑编码', '物料名称', '数量']);
  console.log('Print material column selection browser regression passed.');
} finally {
  await browser.close();
}
