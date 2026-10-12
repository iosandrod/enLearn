import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const { default: { chromium } } = await import(pathToFileURL(resolve(root, 'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js')).href);
const browser = await chromium.launch({ executablePath: process.env.PRINT_DESIGNER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3301';
const sourceRoot = `/@fs/${root.replaceAll('\\', '/')}/packages/tldraw-vue/src`;
try {
  await page.goto(`${baseUrl}/print-designer`, { waitUntil: 'domcontentloaded' });
  const tab = page.locator('.designer-side-tab').filter({ hasText: '预览设置' });
  await tab.waitFor({ state: 'visible', timeout: 60_000 });
  await tab.click();
  const panel = page.locator('.preview-settings-panel');
  await panel.locator('.lc-form').waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal(await panel.getByText('请先在当前画布添加物料表格组件。', { exact: true }).isVisible(), true);

  const counts = await page.evaluate(async sourceRoot => {
    const designer = document.querySelector('.app-shell').__vueParentComponent.exposed;
    const editor = designer.getEditor();
    const { createVueMaterialShapePartials, VUE_MATERIAL_SECTION_DEFINITIONS } = await import(`${sourceRoot}/editor/extensions/material/vueMaterialShape.ts`);
    const { PrintRenderer } = await import(`${sourceRoot}/print/renderer.ts`);
    for (const [id, x, h] of [['shape:preview-small', 0, 180], ['shape:preview-large', 360, 600]]) {
      editor.createShapes(createVueMaterialShapePartials({
        id, rect: { x, y: 0, w: 320, h },
        sectionIds: VUE_MATERIAL_SECTION_DEFINITIONS.map((_, index) => `${id}-section-${index}`),
      }));
      editor.updateShape({ id, type: 'vue-material', props: {
        name: id === 'shape:preview-small' ? '分页表格 A' : '分页表格 B',
        dataSourceField: 'items', columns: [{ field: 'sku', title: '物料' }],
      } });
    }
    const items = Array.from({ length: 30 }, (_, i) => ({ sku: `SKU-${i}` }));
    const source = {
      type: 'inline', formCode: '', detailField: 'items',
      detailTables: [
        { id: 'a', field: 'items', label: '明细源 A', columns: [{ field: 'sku', title: '物料' }] },
        { id: 'b', field: 'otherItems', label: '明细源 B', columns: [{ field: 'sku', title: '物料' }] },
      ],
      rows: [{ customer: '测试客户', items, otherItems: [{ sku: 'B-1' }, { sku: 'B-2' }] }],
    };
    designer.applyWorkspaceTemplateConfig({ ...designer.getWorkspaceTemplateConfig(), printDataSource: source });
    const config = {
      data: source.rows, dataSource: source,
      template: { materialGrids: {
        'shape:preview-small': { data: items, columns: [{ field: 'sku', title: '物料' }] },
        'shape:preview-large': { data: items, columns: [{ field: 'sku', title: '物料' }] },
      } },
      page: { widthMm: 210, heightMm: 297 }, printer: { type: 'browser' },
    };
    const renderer = new PrintRenderer(editor);
    const small = renderer.createRenderJobs({ ...config, previewSettings: { mode: 'component', materialId: 'shape:preview-small' } });
    const large = renderer.createRenderJobs({ ...config, previewSettings: { mode: 'component', materialId: 'shape:preview-large' } });
    const data = renderer.createRenderJobs({ ...config, previewSettings: { mode: 'data', detailField: 'otherItems' } });
    let missingComponentError = '';
    try { renderer.createRenderJobs({ ...config, previewSettings: { mode: 'component', materialId: 'shape:missing' } }); }
    catch (error) { missingComponentError = error.message; }
    return { small: small.length, large: large.length, data: data.map(job => job.row), missingComponentError };
  }, sourceRoot);
  assert.ok(counts.small > counts.large, JSON.stringify(counts));
  assert.equal(counts.data.length, 2);
  assert.equal(counts.data[0].sku, 'B-1');
  assert.equal(counts.data[1].customer, '测试客户');
  assert.match(counts.missingComponentError, /重新选择/);

  await tab.click();
  await panel.locator('[data-lc-field="mode"] input').click();
  await page.locator('.vxe-select-option').filter({ hasText: '数据模式' }).click();
  await panel.locator('[data-lc-field="detailField"] .vxe-select').waitFor({ state: 'visible' });
  assert.equal(await panel.locator('[data-lc-field="materialId"]').isVisible(), false);
  await panel.locator('[data-lc-field="detailField"] input').click();
  const detailOption = page.locator('.vxe-select--panel:visible').last().locator('.vxe-select-option').last();
  const selectedDetailLabel = (await detailOption.textContent()).trim();
  await detailOption.click();
  const saved = await page.evaluate(async () => {
    const designer = document.querySelector('.app-shell').__vueParentComponent.exposed;
    const info = await designer.getTemplateInfo();
    return { workspace: info.workspace, content: info.content, dirty: window.__ENLEARN_PRINT_TEMPLATE_INFO__?.dirty };
  });
  assert.equal(saved.workspace.previewSettings.mode, 'data');
  assert.equal(await page.evaluate(materialId => {
    const editor = document.querySelector('.app-shell').__vueParentComponent.exposed.getEditor();
    return editor.getShape(materialId)?.type === 'vue-material';
  }, saved.workspace.previewSettings.materialId), true);
  assert.ok(saved.workspace.previewSettings.detailField);
  assert.deepEqual(saved.content.workspace.previewSettings, saved.workspace.previewSettings);
  assert.equal(saved.dirty, true);

  // The actual toolbar must forward the settings into PrintManager.
  const toolbarSettings = await page.evaluate(async sourceRoot => {
    const designer = document.querySelector('.app-shell').__vueParentComponent.exposed;
    const { PrintManager } = await import(`${sourceRoot}/print/index.ts`);
    const original = PrintManager.prototype.renderPages;
    let settings;
    PrintManager.prototype.renderPages = async config => { settings = config.previewSettings; return []; };
    try { await designer.previewPrint(); } finally { PrintManager.prototype.renderPages = original; }
    return settings;
  }, sourceRoot);
  assert.deepEqual(toolbarSettings, saved.workspace.previewSettings);
  const closePreviewButton = page.locator('.print-preview-modal .vxe-modal--close-btn');
  if (await closePreviewButton.count()) await closePreviewButton.click();
  else await page.locator('.print-preview-modal').evaluate(element => element.querySelector('button')?.click());
  await page.locator('.print-preview-modal').waitFor({ state: 'hidden' });

  await page.evaluate(() => {
    const designer = document.querySelector('.app-shell').__vueParentComponent.exposed;
    const config = designer.getWorkspaceTemplateConfig();
    designer.applyWorkspaceTemplateConfig({ ...config, previewSettings: { mode: 'component', materialId: 'shape:preview-large', detailField: 'otherItems' } });
  });
  await tab.click();
  await panel.locator('[data-lc-field="materialId"] .vxe-select').waitFor({ state: 'visible' });
  assert.equal(await panel.locator('[data-lc-field="detailField"]').isVisible(), false);
  await page.evaluate(workspace => document.querySelector('.app-shell').__vueParentComponent.exposed.applyWorkspaceTemplateConfig(workspace), saved.workspace);
  await panel.locator('[data-lc-field="detailField"] .vxe-select').waitFor({ state: 'visible' });
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: resolve(root, 'artifacts/print-preview-settings-data.png') });

  await page.evaluate(() => document.querySelector('.app-shell').__vueParentComponent.exposed.resetWorkspaceTemplateConfig());
  assert.equal(await page.evaluate(() => document.querySelector('.app-shell').__vueParentComponent.exposed.getWorkspaceTemplateConfig().previewSettings), undefined);
  console.log(JSON.stringify({ ok: true, componentPages: { small: counts.small, large: counts.large }, dataPages: counts.data.length, selectedDetailLabel, toolbarSettings, persistence: true, reset: true }));
} finally {
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: resolve(root, 'artifacts/print-preview-settings-last.png') });
  await browser.close();
}
