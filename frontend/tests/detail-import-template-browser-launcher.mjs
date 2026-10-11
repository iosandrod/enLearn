import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../api/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3301').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/tests/detail-import-template-browser.html`);
  await page.locator('#open-dialog').click();
  const picker = page.locator('.detail-import-template-picker');
  await picker.waitFor();
  assert.equal(await picker.getByRole('radio').count(), 4);
  assert.equal(await picker.getByRole('radio', { name: /仅 field 行/ }).getAttribute('aria-checked'), 'true');
  const sheets = picker.locator('.detail-import-template-picker__sheet');
  assert.equal(await sheets.count(), 4);
  assert.deepEqual(await sheets.first().locator('.detail-import-template-picker__column-headings b').allTextContents(), ['A', 'B', 'C']);
  assert.deepEqual(await sheets.first().locator('.detail-import-template-picker__row').evaluateAll(rows =>
    rows.map(row => ({ kind: [...row.classList].find(name => name.startsWith('is-')), cells: [...row.querySelectorAll('b')].map(cell => cell.textContent) }))), [
    { kind: 'is-field', cells: ['sku', 'productName', 'qty'] },
    { kind: 'is-data', cells: ['SKU-001', '测试商品 A', '10'] },
    { kind: 'is-data', cells: ['SKU-002', '测试商品 B', '20'] },
  ]);

  await picker.getByRole('radio', { name: /field \+ title 行/ }).click();
  assert.equal(await picker.getByRole('radio', { name: /field \+ title 行/ }).getAttribute('aria-checked'), 'true');
  await page.getByRole('button', { name: '开始导入', exact: true }).click();
  await page.waitForFunction(() => window.dialogResult);
  assert.deepEqual(await page.evaluate(() => ({
    hasFieldRow: window.dialogResult.values.hasFieldRow,
    hasChineseRow: window.dialogResult.values.hasChineseRow,
    sheetName: window.dialogResult.values.sheetName,
    mode: window.dialogResult.values.mode,
  })), { hasFieldRow: true, hasChineseRow: true, sheetName: '', mode: 'append' });
  assert.deepEqual(errors, []);
  console.log('Detail import template dialog browser test passed.');
} finally {
  await browser.close();
}
