import assert from 'node:assert/strict';
import { resolve, join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const playwrightModule = await import(pathToFileURL(join(root,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js')).href);
const baseUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:3302';
const browser = await playwrightModule.default.chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/tests/search-query-logic-browser.html`);

  async function openQueryTab() {
    await page.getByRole('button', { name: '添加输入框', exact: true }).waitFor({ state: 'visible' });
    const openPanel = page.getByRole('button', { name: '打开属性面板', exact: true });
    if (await openPanel.count()) await openPanel.click();
    await page.getByText('查询逻辑', { exact: true }).click();
  }

  await page.getByRole('button', { name: '打开查询表单', exact: true }).click();
  await openQueryTab();
  const table = page.getByRole('table', { name: '查询逻辑', exact: true });
  await table.waitFor({ state: 'visible' });
  assert.equal(await table.locator('tbody tr').count(), 3);

  await page.getByLabel('keyword 查询字段', { exact: true }).fill('name');
  await page.getByLabel('keyword 运算符', { exact: true }).selectOption('like');
  await page.getByLabel('status 结合逻辑', { exact: true }).selectOption('or');
  await page.getByLabel('age 运算符', { exact: true }).selectOption('gte');
  await page.getByRole('button', { name: '确定', exact: true }).press('Enter');
  const saved = JSON.parse(await page.locator('#result').innerText());
  assert.deepEqual(saved.map(({ field, logic, op }) => ({ field, logic, op })), [
    { field: 'name', logic: 'and', op: 'like' },
    { field: 'status', logic: 'or', op: 'eq' },
    { field: 'age', logic: 'and', op: 'gte' },
  ]);

  await page.getByRole('button', { name: '重新打开已保存表单', exact: true }).click();
  await openQueryTab();
  assert.equal(await page.getByLabel('keyword 查询字段', { exact: true }).inputValue(), 'name');
  assert.equal(await page.getByLabel('status 结合逻辑', { exact: true }).inputValue(), 'or');
  assert.equal(await page.getByLabel('age 运算符', { exact: true }).inputValue(), 'gte');
  if (process.env.SCREENSHOT_PATH) {
    await mkdir(dirname(process.env.SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: process.env.SCREENSHOT_PATH });
  }

  await page.getByRole('button', { name: '添加输入框', exact: true }).click();
  await page.getByText('查询逻辑', { exact: true }).click();
  await page.getByLabel('field_4 查询字段', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '确定', exact: true }).press('Enter');
  assert.equal(JSON.parse(await page.locator('#result').innerText()).length, 4);

  await page.getByRole('button', { name: '打开编辑表单', exact: true }).click();
  await page.getByRole('button', { name: '添加输入框', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.getByText('查询逻辑', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Search query logic browser regression passed (visibility, edit, save, reopen).');
} finally {
  await browser.close();
}
