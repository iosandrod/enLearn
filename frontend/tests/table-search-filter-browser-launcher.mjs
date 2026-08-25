import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.TABLE_SEARCH_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:3000';
const artifactDir = join(workspaceDir, 'artifacts', 'table-search-filter');
const screenshotPath = join(artifactDir, 'filtered-highlight.png');
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
    consoleErrors.push(message.text());
  }
});

function visibleRows(gridId = 'table-search-grid') {
  const className = {
    'table-search-grid': '.search-smoke-grid--local',
    'table-search-remote-grid': '.search-smoke-grid--remote',
    'table-search-delayed-grid': '.search-smoke-grid--delayed',
  }[gridId];
  return page.locator(`${className} .vxe-body--row:visible`);
}

try {
  await mkdir(artifactDir, { recursive: true });
  await page.goto(
    `${baseUrl}/tests/table-search-filter-browser.html`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(() => Boolean(window.__tableSearchSmoke.gridRef.value));

  await page.evaluate(async () => {
    const grid = window.__tableSearchSmoke.gridRef.value;
    await grid.setFilter('code', [{ label: '规划页面', value: 'planning', checked: true }], true);
  });
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.gridRef.value.getTableData().visibleData.length === 3
  ));

  await page.evaluate(() => window.__tableSearchSmoke.gridRef.value.openTableSearchPanel());
  const panel = page.locator('.vxe-table-search-panel:visible');
  await panel.waitFor({ state: 'visible' });
  const position = await panel.evaluate((element) => {
    const grid = element.closest('.vxe-grid');
    const toolbar = grid?.querySelector('.vxe-grid--toolbar-wrapper');
    const panelRect = element.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    return {
      parentIsGrid: element.parentElement === grid,
      hasToolbar: Boolean(toolbar),
      topOffset: gridRect ? panelRect.top - gridRect.top : Number.NaN,
      rightOffset: gridRect ? gridRect.right - panelRect.right : Number.NaN,
    };
  });
  assert.equal(position.parentIsGrid, true);
  assert.equal(position.hasToolbar, true);
  assert.ok(Math.abs(position.topOffset - 8) < 1);
  assert.ok(Math.abs(position.rightOffset - 10) < 1);
  const input = panel.locator('[data-role="find-input"]');
  await input.fill('工序');
  await page.waitForFunction(() => (
    document.querySelector('.vxe-table-search-panel__status')?.textContent === '1/2'
  ));
  assert.equal(await visibleRows().count(), 3);
  assert.equal(await page.locator('.vxe-table-search-panel__highlight').count(), 2);

  const filter = panel.locator('[data-testid="table-search-filter"]');
  await filter.click();
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.gridRef.value.getTableData().visibleData.length === 2
  ));
  assert.equal(await visibleRows().count(), 2);
  assert.equal(await page.locator('.vxe-table-search-panel__highlight').count(), 2);
  assert.equal(await filter.getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await input.fill('供应');
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.gridRef.value.getTableData().visibleData.length === 1
  ));
  assert.equal(await visibleRows().count(), 1);
  assert.equal((await visibleRows().first().textContent()).includes('供应商'), true);
  assert.equal(await page.locator('.vxe-table-search-panel__highlight').count(), 1);

  await filter.click();
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.gridRef.value.getTableData().visibleData.length === 3
  ));
  assert.equal(await visibleRows().count(), 3);
  assert.equal(await filter.getAttribute('aria-pressed'), 'false');
  assert.equal(
    await page.evaluate(() => window.__tableSearchSmoke.gridRef.value.getCheckedFilters().length),
    1,
  );

  await filter.click();
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.gridRef.value.getTableData().visibleData.length === 1
  ));
  await panel.locator('.vxe-table-search-panel__close-button').click();
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.gridRef.value.getTableData().visibleData.length === 3
  ));
  assert.equal(await panel.isHidden(), true);
  assert.equal(await page.locator('.vxe-table-search-panel__highlight').count(), 0);

  await page.evaluate(() => window.__tableSearchSmoke.remoteGridRef.value.openTableSearchPanel());
  const remotePanel = page.locator('.search-smoke-grid--remote .vxe-table-search-panel:visible');
  await remotePanel.locator('[data-role="find-input"]').fill('工序');
  await page.waitForFunction(() => (
    document.querySelector('.search-smoke-grid--remote .vxe-table-search-panel__status')
      ?.textContent === '1/2'
  ));
  await remotePanel.locator('[data-testid="table-search-filter"]').click();
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.remoteGridRef.value.getTableData().visibleData.length === 2
  ));
  assert.equal(await visibleRows('table-search-remote-grid').count(), 2);
  await remotePanel.locator('.vxe-table-search-panel__close-button').click();
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.remoteGridRef.value.getTableData().visibleData.length === 4
  ));

  await page.evaluate(() => window.__tableSearchSmoke.delayedGridRef.value.openTableSearchPanel());
  const delayedPanel = page.locator('.search-smoke-grid--delayed .vxe-table-search-panel:visible');
  await delayedPanel.locator('[data-role="find-input"]').fill('工序');
  await page.waitForFunction(() => (
    document.querySelector('.search-smoke-grid--delayed .vxe-table-search-panel__status')
      ?.textContent === '无结果'
  ));
  await page.evaluate(async () => {
    window.__tableSearchSmoke.delayedRows.value = window.__tableSearchSmoke.rows;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await page.waitForFunction(() => (
    document.querySelector('.search-smoke-grid--delayed .vxe-table-search-panel__status')
      ?.textContent === '1/2'
  ));
  assert.equal(await page.locator('.search-smoke-grid--delayed .vxe-table-search-panel__highlight').count(), 2);
  const delayedFilter = delayedPanel.locator('[data-testid="table-search-filter"]');
  await delayedFilter.click();
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.delayedGridRef.value.getTableData().visibleData.length === 2
  ));
  assert.equal(await visibleRows('table-search-delayed-grid').count(), 2);
  await delayedPanel.locator('.vxe-table-search-panel__close-button').click();
  await page.waitForFunction(() => (
    window.__tableSearchSmoke.delayedGridRef.value.getTableData().visibleData.length === 4
  ));

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ ok: true, screenshot: screenshotPath }));
} finally {
  await context.close();
  await browser.close();
}
