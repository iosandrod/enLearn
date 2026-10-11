import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../api/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3301').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/tests/bi-designer-browser.html`);
  await page.waitForFunction(() => window.biDesigner?.getEditor());
  await page.getByRole('button', { name: 'BI 设计', exact: true }).click();
  assert.equal(await page.locator('.echarts-palette .component-palette-button').count(), 7);

  // Exercise the existing pointer drag implementation, after switching from print to BI.
  const source = await page.getByRole('button', { name: '柱状图', exact: true }).boundingBox();
  const target = await page.locator('.workspace-page').boundingBox();
  assert.ok(source && target);
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.locator('.vue-echarts-shape__chart svg').waitFor();

  await page.locator('.designer-side-tab').filter({ has: page.locator('span', { hasText: /^组件$/ }) }).click();
  assert.ok(await page.getByRole('button', { name: '表格', exact: true }).isVisible(), 'BI retains print components');
  await page.locator('.designer-side-tab').filter({ has: page.locator('span', { hasText: /^属性$/ }) }).click();
  for (const tab of ['基本属性', '数据配置', '样式属性', '高级属性']) {
    await page.getByText(tab, { exact: true }).waitFor();
  }
  const titleInput = page.locator('[data-lc-field="title"] input');
  await titleInput.waitFor();
  await titleInput.fill('销售趋势');
  await titleInput.blur();
  await page.waitForFunction(() => window.biDesigner.getEditor().getCurrentPageShapesSorted().some(shape => shape.type === 'bi-chart' && shape.props.title === '销售趋势'));
  await page.getByText('数据配置', { exact: true }).click();
  await page.locator('[data-lc-field="dataJson"]').waitFor();
  await page.locator('[data-lc-field="optionJson"]').waitFor();

  const result = await page.evaluate(async () => {
    const designer = window.biDesigner;
    const editor = designer.getEditor();
    const chart = editor.getCurrentPageShapesSorted().find(shape => shape.type === 'bi-chart');
    editor.markHistoryStoppingPoint('chart edit');
    editor.updateShape({ id: chart.id, type: 'bi-chart', x: chart.x + 10, props: { chartType: 'doughnut', w: 280, h: 200 } });
    editor.undo();
    const undone = editor.getShape(chart.id);
    editor.redo();
    const info = await designer.getTemplateInfo();
    const content = info.pages[0].content;
    editor.deleteShapes(editor.getCurrentPageShapesSorted().map(shape => shape.id));
    editor.putContentOntoCurrentPage(JSON.parse(JSON.stringify(content)), { select: true });
    designer.applyWorkspaceTemplateConfig(JSON.parse(JSON.stringify(info.workspace)));
    const restored = editor.getCurrentPageShapesSorted().find(shape => shape.type === 'bi-chart');
    const svg = await editor.getSvgElement([restored.id], { background: false, padding: 0 });
    const image = await editor.toImageDataUrl([restored.id], { format: 'png', background: false, padding: 0, pixelRatio: 1 });
    const raster = new Image();
    raster.src = image.url;
    await raster.decode();
    const canvas = document.createElement('canvas');
    canvas.width = raster.naturalWidth;
    canvas.height = raster.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(raster, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let coloredPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 128 && pixels[i + 2] > 100 && pixels[i] < 150) coloredPixels++;
    }
    const idsBeforeCopy = editor.getCurrentPageShapesSorted().length;
    editor.duplicateShapes([restored.id]);
    const copied = editor.getCurrentPageShapesSorted().length === idsBeforeCopy + 1;
    const mode = designer.getDesignerMode();
    designer.setDesignerMode('print');
    const chartRetained = editor.getCurrentPageShapesSorted().some(shape => shape.type === 'bi-chart');
    return { mode, chartRetained, copied, undoneType: undone.props.chartType, title: restored.props.title, type: restored.props.chartType, width: restored.props.w, coloredPixels, hasSvgImage: Boolean(svg.svg.querySelector('image')) };
  });
  assert.equal(result.mode, 'bi');
  assert.equal(result.undoneType, 'bar');
  assert.equal(result.type, 'doughnut');
  assert.equal(result.title, '销售趋势');
  assert.equal(result.width, 280);
  assert.equal(result.chartRetained, true);
  assert.equal(result.copied, true);
  assert.equal(result.hasSvgImage, true);
  assert.ok(result.coloredPixels > 100, 'PNG export must contain rendered chart pixels');
  assert.equal(await page.locator('.echarts-palette').isVisible(), false);
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'BI 设计', exact: true }).click();
  const artifacts = new URL('../../artifacts/', import.meta.url);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('bi-designer.png', artifacts)) });
  console.log(JSON.stringify({ ok: true, ...result }));
} finally {
  await browser.close();
}
