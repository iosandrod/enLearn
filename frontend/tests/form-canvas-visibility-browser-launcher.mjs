import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const playwrightModule = await import(pathToFileURL(join(root,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js')).href);
const baseUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:3301';
const browser = await playwrightModule.default.chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/tests/form-canvas-visibility-browser.html`);
  await page.waitForFunction(() => Boolean(window.formCanvasFixture));
  for (const key of ['form', 'lowcode-search-form']) {
    const section = page.locator(`#${key}`);
    await section.getByText('当前表单为空', { exact: true }).waitFor({ state: 'visible' });
    const bounds = await section.boundingBox();
    assert.ok(bounds.height >= 112, `${key} collapsed: ${JSON.stringify(bounds)}`);
  }
  assert.equal(await page.evaluate(() => Object.keys(window.formCanvasFixture.refs).length), 2);
  await page.evaluate(() => window.formCanvasFixture.addFields());
  for (const key of ['form', 'lowcode-search-form']) {
    const section = page.locator(`#${key}`);
    await section.locator('input[placeholder="请输入名称"]').waitFor({ state: 'visible' });
    assert.equal(await section.getByText('当前表单为空', { exact: true }).count(), 0);
    assert.ok((await section.boundingBox()).height >= 112);
  }
  assert.deepEqual(errors, []);
  console.log('Form canvas visibility browser regression passed (empty, populated, refs).');
} finally {
  await browser.close();
}
