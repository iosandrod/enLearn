import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const { default: playwright } = await import(pathToFileURL(join(workspaceDir, 'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js')).href);
const browser = await playwright.chromium.launch({
  executablePath: process.env.PRINT_DESIGNER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const baseUrl = process.env.PRINT_DESIGNER_TEST_SERVER_URL || 'http://localhost:3301';

async function dropAt(path, point) {
  const screen = await page.evaluate((point) => {
    const result = window.dragTestEditor.pageToScreen(point);
    return { x: result.x, y: result.y };
  }, point);
  const source = page.locator(`[data-source-field="${path}"]`);
  await source.scrollIntoViewIfNeeded();
  const sourceBounds = await source.boundingBox();
  await page.mouse.move(sourceBounds.x + sourceBounds.width / 2, sourceBounds.y + sourceBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBounds.x + sourceBounds.width / 2 + 10, sourceBounds.y + sourceBounds.height / 2, { steps: 5 });
  await page.mouse.move(screen.x, screen.y, { steps: 10 });
  await page.mouse.move(screen.x + 1, screen.y + 1);
  await page.mouse.up();
}

try {
  await page.goto(`${baseUrl}/tests/print-data-source-drag-browser.html`);
  await page.locator('[data-source-field="name"]').waitFor();
  await page.evaluate(() => {
    window.dragTestDesigner.applyWorkspaceTemplateConfig({ pageSizeMm: { w: 200, h: 200 } });
    window.dragTestEditor.setCamera({ x: 300, y: 10, z: 1 });
    window.dragTestEditor.clearHistory();
  });
  const panel = await page.locator('.data-source-tree-panel').boundingBox();
  const canvas = await page.locator('.vue-canvas').boundingBox();
  const tools = await page.locator('.designer-side-panel').boundingBox();
  assert.ok(Math.abs(canvas.x - tools.x - tools.width) < 1, 'field tree must not take any canvas width');
  assert.ok(Math.abs(panel.x - canvas.x - 35) < 1 && Math.abs(panel.y - canvas.y - 190) < 1, 'field tree must float at the marked position inside the canvas');
  assert.ok(Math.abs(panel.width - 240) < 1 && Math.abs(panel.height - 330) < 1);
  assert.equal(await page.locator('.designer-stage > .data-source-tree-panel').count(), 1);
  assert.equal(await page.locator('.data-source-tree-panel').evaluate((node) => getComputedStyle(node).position), 'absolute');
  assert.equal(await page.locator('.designer-side-panel .data-source-tree-panel').count(), 0);
  await dropAt('name', { x: 260, y: 90 });
  let shapes = await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted());
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].type, 'vue-text');
  assert.equal(shapes[0].props.text, '{{name}}');
  assert.ok(Math.abs(shapes[0].x - 260) < 2 && Math.abs(shapes[0].y - 90) < 2, 'drop coordinates must follow the camera');
  await page.evaluate(() => window.dragTestEditor.undo());
  assert.equal(await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted().length), 0);
  await page.evaluate(() => {
    const editor = window.dragTestEditor;
    editor.createShapes([
      { id: 'shape:text', type: 'vue-text', x: 40, y: 80, props: { text: '姓名：', w: 180, h: 44, autoSize: false } },
      { id: 'shape:rich', type: 'vue-rich-text', x: 40, y: 170, props: { content: '<p><strong>原文</strong></p>', w: 240, h: 70 } },
      { id: 'shape:qr', type: 'vue-qr', x: 350, y: 80, props: { text: 'QR-', w: 100, h: 100 } },
      { id: 'shape:barcode', type: 'vue-barcode', x: 350, y: 250, props: { text: 'BAR-', w: 180, h: 90 } },
    ]);
    editor.clearHistory();
  });
  for (const [id, point, property, expected] of [
    ['shape:text', { x: 80, y: 95 }, 'text', '姓名：{{name}}'],
    ['shape:rich', { x: 90, y: 195 }, 'content', '<p><strong>原文</strong>{{name}}</p>'],
    ['shape:qr', { x: 400, y: 120 }, 'text', 'QR-{{name}}'],
    ['shape:barcode', { x: 400, y: 280 }, 'text', 'BAR-{{name}}'],
  ]) {
    await dropAt('name', point);
    assert.equal(await page.evaluate(({ id, property }) => window.dragTestEditor.getShape(id).props[property], { id, property }), expected);
    assert.equal(await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted().length), 4, `${id} must be updated without creating a node`);
  }
  await page.evaluate(() => window.dragTestEditor.undo());
  assert.equal(await page.evaluate(() => window.dragTestEditor.getShape('shape:barcode').props.text), 'BAR-');
  await dropAt('items.code', { x: 80, y: 95 });
  assert.equal(await page.evaluate(() => window.dragTestEditor.getShape('shape:text').props.text), '姓名：{{name}}{{items.code}}');
  await page.evaluate(() => window.dragTestEditor.updateShape({ id: 'shape:qr', type: 'vue-qr', isLocked: true }));
  await dropAt('name', { x: 400, y: 120 });
  assert.equal(await page.evaluate(() => window.dragTestEditor.getShape('shape:qr').props.text), 'QR-{{name}}');
  assert.equal(await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted().length), 4);
  // Zoom and overlapping nodes must still choose the node actually under the drop.
  await page.evaluate(() => {
    window.dragTestEditor.createShape({ id: 'shape:overlay', type: 'vue-text', x: 350, y: 250, props: { text: '上层', w: 180, h: 90, autoSize: false } });
    window.dragTestEditor.setCamera({ x: 300, y: 5, z: 0.8 });
  });
  await dropAt('name', { x: 400, y: 280 });
  assert.equal(await page.evaluate(() => window.dragTestEditor.getShape('shape:overlay').props.text), '上层{{name}}');
  assert.equal(await page.evaluate(() => window.dragTestEditor.getShape('shape:barcode').props.text), 'BAR-');
  await dropAt('name', { x: 680, y: 690 });
  shapes = await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted());
  const created = shapes.at(-1);
  assert.equal(created.props.text, '{{name}}');
  assert.ok(created.x + created.props.w <= 200 * 96 / 25.4 + 0.1, 'new text must stay within paper bounds');
  const count = shapes.length;
  await page.evaluate(() => {
    window.dragTestEditor.createShape({ id: 'shape:image', type: 'vue-image', x: 40, y: 350, props: { w: 100, h: 100 } });
  });
  await dropAt('name', { x: 80, y: 400 });
  assert.equal(await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted().length), count + 1, 'unsupported nodes must not create extra text');
  await dropAt('name', { x: 850, y: 400 });
  assert.equal(await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted().length), count + 1, 'drops outside paper must not create text');
  await page.evaluate(() => window.dragTestEditor.updateInstanceState({ isReadonly: true }));
  await dropAt('name', { x: 600, y: 500 });
  assert.equal(await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted().length), count + 1, 'read-only mode must not change the document');
  await page.evaluate(() => window.dragTestEditor.updateInstanceState({ isReadonly: false }));
  await page.evaluate(() => window.setDragTestSource({ type: 'inline', rows: [], headerFields: [{ field: 'newField', label: '新字段' }] }));
  await page.locator('[data-source-field="newField"]').waitFor();
  assert.equal(await page.locator('[data-source-field="name"]').count(), 0);
  await page.locator('.data-source-tree-panel__toggle').click();
  assert.equal(await page.locator('.data-source-tree-panel__body').count(), 0);
  await page.locator('.data-source-tree-panel__toggle').click();
  await page.evaluate(() => window.dragTestDesigner.setDesignerMode('bi'));
  assert.equal(await page.locator('.data-source-tree-panel').count(), 0);
  await page.evaluate(() => window.dragTestDesigner.setDesignerMode('print'));
  await page.setViewportSize({ width: 442, height: 828 });
  const mobilePanel = page.locator('.data-source-tree-panel');
  await mobilePanel.waitFor({ state: 'hidden' });
  await page.locator('.data-source-tree-mobile-toggle').click();
  await mobilePanel.waitFor({ state: 'visible' });
  await page.waitForFunction(() => Math.abs(document.querySelector('.data-source-tree-panel').getBoundingClientRect().x) < 1, null, { timeout: 10_000, polling: 100 });
  const mobilePanelBox = await mobilePanel.boundingBox();
  const mobileCanvasBox = await page.locator('.vue-canvas').boundingBox();
  assert.equal(Math.round(mobilePanelBox.width), 320);
  assert.ok(Math.abs(mobilePanelBox.height - mobileCanvasBox.height) < 1, 'mobile drawer must occupy the canvas height');
  assert.equal(await mobilePanel.getAttribute('aria-modal'), 'true');
  assert.ok(await page.locator('.data-source-tree-panel__row').first().evaluate((node) => node.getBoundingClientRect().height >= 44));
  await page.locator('.data-source-tree-panel__close').click();
  await mobilePanel.waitFor({ state: 'hidden' });
  await page.locator('.data-source-tree-mobile-toggle').click();
  await page.keyboard.press('Escape');
  await mobilePanel.waitFor({ state: 'hidden' });
  await page.locator('.data-source-tree-mobile-toggle').click();
  await page.locator('.data-source-tree-mobile-backdrop').click({ position: { x: 410, y: 300 } });
  await mobilePanel.waitFor({ state: 'hidden' });
  await page.locator('.data-source-tree-mobile-toggle').click();
  await page.locator('.data-source-tree-panel__configure').click();
  await mobilePanel.waitFor({ state: 'hidden' });
  await page.locator('.designer-data-source-drawer.is-open').waitFor({ state: 'visible' });
  await page.locator('.designer-data-source-drawer__close').click();
  await page.locator('.designer-mobile-panel-toggle').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('.designer-side-panel').getBoundingClientRect().bottom - innerHeight) < 1, null, { timeout: 10_000, polling: 100 });
  const toolPanelBox = await page.locator('.designer-side-panel').boundingBox();
  assert.equal(Math.round(toolPanelBox.height), 280);
  assert.equal(await page.locator('.designer-mobile-backdrop').count(), 0);
  await page.evaluate(() => {
    const editor = window.dragTestEditor;
    editor.setCamera({ x: 0, y: 0, z: 1 });
    editor.selectNone();
    editor.createShape({ id: 'shape:mobile-tool-target', type: 'vue-text', x: 140, y: 120, props: { text: '手机操作', w: 100, h: 44, autoSize: false } });
  });
  const touchPoint = await page.evaluate(() => {
    const point = window.dragTestEditor.pageToScreen({ x: 180, y: 140 });
    return { x: point.x, y: point.y };
  });
  assert.ok(touchPoint.y < toolPanelBox.y, 'test target must be in the exposed canvas');
  assert.equal(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.vue-canvas')), touchPoint), true);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const finger = { ...touchPoint, id: 1, radiusX: 2, radiusY: 2, force: 1 };
  await touch('touchStart', [finger]);
  await touch('touchEnd', []);
  assert.ok(await page.evaluate(() => window.dragTestEditor.getSelectedShapeIds().includes('shape:mobile-tool-target')), 'opening tools must still allow touch selection on the canvas');
  await touch('touchStart', [finger]);
  await touch('touchMove', [{ ...finger, x: finger.x + 30, y: finger.y + 25 }]);
  await touch('touchEnd', []);
  const moved = await page.evaluate(() => window.dragTestEditor.getShape('shape:mobile-tool-target'));
  assert.ok(moved.x > 150 && moved.y > 125, 'opening tools must still allow moving shapes by touch');
  assert.equal(await page.locator('.editor-host').evaluate((node) => node.classList.contains('is-mobile-panel-open')), true);
  await cdp.detach();
  const foldButtonBox = await page.locator('.designer-mobile-panel-toggle').boundingBox();
  assert.ok(foldButtonBox.y + foldButtonBox.height <= toolPanelBox.y, 'fold button must not cover panel contents');
  await page.locator('.designer-side-tab').filter({ hasText: '组件' }).click();
  await page.locator('.designer-side-tabs').evaluate((node) => { node.scrollLeft = 0; });
  await page.locator('.designer-side-tab').filter({ hasText: '工具' }).click();
  await page.locator('.data-source-tree-mobile-toggle').click();
  assert.equal(await page.locator('.editor-host').evaluate((node) => node.classList.contains('is-mobile-panel-open')), false);
  await page.locator('[data-source-field="newField"]').waitFor({ state: 'visible' });
  const mobileShapeCount = await page.evaluate(() => {
    window.dragTestEditor.setCamera({ x: 0, y: 0, z: 1 });
    return window.dragTestEditor.getCurrentPageShapesSorted().length;
  });
  await dropAt('newField', { x: 360, y: 500 });
  await mobilePanel.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.dragTestEditor.getCurrentPageShapesSorted().length), mobileShapeCount + 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => window.setDragTestSource({ type: 'inline', rows: [], headerFields: Array.from({ length: 80 }, (_, index) => ({ field: `field${index}`, label: `字段${index}` })) }));
  await page.locator('.data-source-tree-mobile-toggle').click();
  await page.locator('[data-source-field="field79"]').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.data-source-tree-panel__body').evaluate((node) => node.scrollHeight > node.clientHeight && node.scrollTop > 0), 'long field trees must scroll inside the drawer');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await page.locator('.data-source-tree-panel__close').click();
  await mobilePanel.waitFor({ state: 'hidden' });
  await page.locator('.designer-mobile-panel-toggle').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('.designer-side-panel').getBoundingClientRect().bottom - innerHeight) < 1, null, { timeout: 10_000, polling: 100 });
  assert.ok((await page.locator('.designer-side-panel').boundingBox()).height <= 568 * 0.34 + 1, 'small phones must retain at least two-thirds of the viewport for the canvas');
  assert.equal(await page.evaluate(() => Boolean(document.elementFromPoint(160, 120)?.closest('.vue-canvas'))), true);
  await page.locator('.designer-mobile-panel-toggle').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mobilePanel.waitFor({ state: 'visible' });
  assert.equal(await page.locator('.data-source-tree-mobile-toggle').count(), 0);
  assert.equal(await mobilePanel.evaluate((node) => node.inert), false);
  assert.deepEqual(errors, []);
  console.log('Print designer browser regression passed (data source drag, mobile drawers, compact tool panel, touch selection and movement with tools open, narrow screens).');
} finally {
  await browser.close();
}
