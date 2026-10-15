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
const requests = [];
const failures = [];
page.on('pageerror', error => failures.push(error.message));
page.on('request', request => {
  if (request.method() === 'POST' && request.url().endsWith(':3302/preview')) {
    requests.push({ body: request.postDataJSON(), headers: request.headers() });
  }
});

try {
  await page.goto(`${baseUrl}/tests/print-material-column-selection-browser.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('.designer-side-tab').filter({ hasText: '工具' }).click();
  const button = page.getByRole('button', { name: '远程预览', exact: true });
  await button.waitFor({ state: 'visible', timeout: 60_000 });
  await page.evaluate(async sourceRoot => {
    const designer = document.querySelector('.app-shell').__vueParentComponent.exposed;
    const editor = designer.getEditor();
    const { getEditorPrintDataSource } = await import(`${sourceRoot}/editor/workspaceDataSource.ts`);
    getEditorPrintDataSource(editor).value = { type: 'inline', rows: [
      { title: 'REMOTE-FIRST', amount: 12.5 }, { title: 'REMOTE-SECOND', amount: 23.5 },
    ] };
    designer.applyWorkspaceTemplateConfig({ pageSizeMm: { w: 80, h: 50 },
      previewSettings: { mode: 'data', detailField: '$header' } });
    editor.createShape({ id: 'shape:remote-preview', type: 'vue-text', x: 10, y: 10,
      props: { text: '{{title}} / {{amount | fixed:2}}', w: 260, h: 40, autoSize: false } });
    const revoke = URL.revokeObjectURL.bind(URL);
    window.revokedPreviewUrls = [];
    URL.revokeObjectURL = url => { window.revokedPreviewUrls.push(url); revoke(url); };
  }, sourceRoot);

  const responsePromise = page.waitForResponse(response => response.request().method() === 'POST'
    && response.url().endsWith(':3302/preview') && response.status() === 200);
  await button.click();
  const modal = page.locator('.remote-print-preview-modal');
  const image = modal.locator('.remote-preview-body img');
  const response = await responsePromise;
  assert.equal(response.headers()['content-type'], 'image/png');
  await image.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('.remote-preview-body img')?.naturalWidth > 0);
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
  assert.deepEqual(await image.evaluate(async img => [...new Uint8Array(
    await (await fetch(img.src)).arrayBuffer()).subarray(0, 8)]), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(requests.length, 2);
  for (const [index, { body, headers }] of requests.entries()) {
    assert.equal(headers.authorization, undefined);
    assert.deepEqual(body.page, { widthMm: 80, heightMm: 50 });
    assert.equal(body.context.dataSource.rows.length, 2);
    assert.equal(body.context.page.content.shapes[0].props.text, '{{title}} / {{amount | fixed:2}}');
    assert.ok(body.html.includes(index ? 'REMOTE-SECOND' : 'REMOTE-FIRST'));
    assert.ok(body.html.includes(index ? '23.50' : '12.50'));
    assert.ok(!body.html.includes('{{title}}'));
  }
  const firstUrl = await image.getAttribute('src');
  await modal.getByRole('button', { name: '下一页', exact: true }).click();
  const secondUrl = await image.getAttribute('src');
  assert.notEqual(firstUrl, secondUrl);
  assert.equal(await modal.getByRole('link', { name: '下载当前页' }).getAttribute('href'), secondUrl);
  assert.equal(await page.evaluate(() => document.querySelector('.app-shell').__vueParentComponent.exposed
    .getEditor().getShape('shape:remote-preview').props.text), '{{title}} / {{amount | fixed:2}}');
  await modal.getByRole('button', { name: '关闭', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  assert.ok(await page.evaluate(urls => urls.every(url => window.revokedPreviewUrls.includes(url)), [firstUrl, secondUrl]));

  // Errors remain actionable and a retry can use the real renderer again.
  await page.route('**:3302/preview', route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: '测试服务繁忙' }) }));
  await button.click();
  await modal.getByRole('alert').getByText('测试服务繁忙').waitFor({ state: 'visible' });
  await page.unroute('**:3302/preview');
  await modal.getByRole('button', { name: '重试', exact: true }).click();
  await image.waitFor({ state: 'visible', timeout: 60_000 });
  await modal.getByRole('button', { name: '关闭', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });

  // Closing an unfinished preview cancels it and unblocks both local actions and a later preview.
  let markPending;
  const pendingRoutes = [];
  const pending = new Promise(resolve => { markPending = resolve; });
  await page.route('**:3302/preview', route => { pendingRoutes.push(route); markPending(); });
  await button.click();
  await pending;
  assert.equal(await button.isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '打印预览', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('.designer-tool-view--tools').getByRole('button', { name: '打印', exact: true }).isDisabled(), true);
  await modal.getByRole('button', { name: '关闭', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.querySelector('button[aria-label="远程预览"]').disabled);
  await Promise.all(pendingRoutes.map(route => route.abort().catch(() => {})));
  await page.unroute('**:3302/preview');
  assert.deepEqual(failures, []);
  console.log('Remote print preview browser integration passed (real PNG, bindings, payload, pagination, cleanup and retry).');
} finally {
  await browser.close();
}
