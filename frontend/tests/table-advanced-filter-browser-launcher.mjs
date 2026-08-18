import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.TABLE_ADVANCED_FILTER_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const screenshotDir = process.env.TABLE_ADVANCED_FILTER_SCREENSHOT_DIR;

async function captureScreenshot(name) {
  if (!screenshotDir || !page) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForUrl(url, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

const port = await freePort();
const server = spawn(
  process.execPath,
  [
    process.platform === 'win32'
      ? 'C:\\Program Files\\nodejs\\node_modules\\pnpm\\bin\\pnpm.cjs'
      : 'pnpm',
    'exec',
    'vite',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  {
    cwd: frontendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  },
);
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

let browser;
let context;
let page;
const pageErrors = [];
const consoleErrors = [];

async function headerCell(label) {
  const cell = page.locator('.vxe-header--column:visible').filter({
    has: page.locator('.vxe-cell--title', { hasText: label }),
  }).first();
  await cell.waitFor({ state: 'visible' });
  return cell;
}

async function openFilter(label) {
  const cell = await headerCell(label);
  await cell.locator('.vxe-cell--filter').click();
  const panel = page.locator('.vxe-advanced-filter:visible').last();
  await panel.waitFor({ state: 'visible' });
  return panel;
}

async function visibleRowTexts() {
  return page.evaluate(() => (
    window.__advancedFilterSmoke.gridRef.value.getTableData().visibleData
      .map((row) => Object.values(row).join(''))
  ));
}

async function applyValue(label, valueLabel) {
  const panel = await openFilter(label);
  await panel.locator('[data-testid="advanced-filter-select-all"]').click();
  await panel.locator('.vxe-advanced-filter__check-row', { hasText: valueLabel }).click();
  await panel.locator('[data-testid="advanced-filter-apply"]').click();
  await panel.waitFor({ state: 'hidden' });
}

async function clearFilter(label) {
  const panel = await openFilter(label);
  await panel.locator('[data-testid="advanced-filter-reset"]').click();
  await panel.waitFor({ state: 'hidden' });
}

try {
  await waitForUrl(`http://127.0.0.1:${port}`);
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(
    `http://127.0.0.1:${port}/tests/table-advanced-filter-browser.html`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 30_000 },
  );

  assert.equal(await (await headerCell('序号')).locator('.vxe-cell--filter').count(), 0);
  assert.equal(await (await headerCell('操作')).locator('.vxe-cell--filter').count(), 0);
  assert.equal(await (await headerCell('名称')).locator('.vxe-cell--filter').count(), 1);
  assert.equal(await (await headerCell('分数')).locator('.vxe-cell--filter').count(), 1);

  await page.waitForFunction(() => (
    window.__advancedFilterSmoke.fallbackTableRef.value
      ?.getColumnByField('fallbackName')?.filterRender?.name === 'EnAdvancedFilter'
  ), undefined, { timeout: 30_000 }).catch(async (error) => {
    const fallbackDebug = await page.evaluate(() => {
      const table = window.__advancedFilterSmoke.fallbackTableRef.value;
      return {
        columns: table?.getFullColumns?.().map((column) => ({
          field: column.field,
          type: column.type,
          title: column.title,
          filters: column.filters,
          filterRender: column.filterRender,
        })),
        hasOpenAdvancedFilter: typeof table?.openAdvancedFilter,
        params: table?.props?.params,
      };
    });
    throw new Error(`${error.message}\n${JSON.stringify(fallbackDebug)}`);
  });
  const fallbackState = await page.evaluate(() => {
    const table = window.__advancedFilterSmoke.fallbackTableRef.value;
    return {
      seqRenderer: table.getFullColumns().find((column) => column.type === 'seq')?.filterRender?.name,
      nameRenderer: table.getColumnByField('fallbackName')?.filterRender?.name,
      amountType: table.getColumnByField('amount')?.filterRender?.props?.dataType,
      actionRenderer: table.getFullColumns().find((column) => column.title === '原生操作')?.filterRender?.name,
    };
  });
  assert.deepEqual(fallbackState, {
    seqRenderer: undefined,
    nameRenderer: 'EnAdvancedFilter',
    amountType: 'number',
    actionRenderer: undefined,
  });

  await page.evaluate(() => (
    window.__advancedFilterSmoke.fallbackTableRef.value.openAdvancedFilter('fallbackName')
  ));
  let fallbackPanel = page.locator('.vxe-advanced-filter:visible').last();
  await fallbackPanel.waitFor({ state: 'visible' });
  assert.equal(await fallbackPanel.locator('.vxe-advanced-filter__check-row').count(), 4);
  await fallbackPanel.locator('[data-testid="advanced-filter-select-all"]').click();
  await fallbackPanel.locator('.vxe-advanced-filter__check-row', { hasText: 'Beta' }).click();
  await fallbackPanel.locator('[data-testid="advanced-filter-apply"]').click();
  await page.waitForFunction(() => (
    window.__advancedFilterSmoke.fallbackTableRef.value.getTableData().visibleData.length === 1
  ));
  assert.equal(await page.evaluate(() => (
    window.__advancedFilterSmoke.fallbackTableRef.value.getTableData().visibleData.length
  )), 1);
  await page.evaluate(() => (
    window.__advancedFilterSmoke.fallbackTableRef.value.clearAdvancedFilter('fallbackName')
  ));
  await page.waitForFunction(() => (
    window.__advancedFilterSmoke.fallbackTableRef.value.getTableData().visibleData.length === 3
  ));
  assert.equal(await page.evaluate(() => (
    window.__advancedFilterSmoke.fallbackTableRef.value.getTableData().visibleData.length
  )), 3);

  let panel = await openFilter('名称');
  assert.equal(await panel.locator('.vxe-advanced-filter__check-row').count(), 6);
  await panel.locator('[data-testid="advanced-filter-search"]').fill('使用');
  assert.equal(await panel.locator('.vxe-advanced-filter__check-row').count(), 2);
  await panel.locator('[data-testid="advanced-filter-search"]').fill('');
  await panel.locator('[data-testid="advanced-filter-condition-menu"]').hover();
  const operatorMenu = page.locator('.vxe-advanced-filter__operator-submenu:visible');
  await operatorMenu.waitFor({ state: 'visible' });
  assert.equal(await operatorMenu.locator('.vxe-advanced-filter__menu-row').count() >= 7, true);
  await captureScreenshot('advanced-filter-text-menu-desktop.png');
  await panel.locator('[data-testid="advanced-filter-freeze-menu"]').hover();
  const freezeMenu = page.locator('.vxe-advanced-filter__freeze-submenu:visible');
  await freezeMenu.waitFor({ state: 'visible' });
  assert.equal(await freezeMenu.locator('.vxe-advanced-filter__menu-row').count(), 3);
  await captureScreenshot('advanced-filter-freeze-menu-desktop.png');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__advancedFilterSmoke.gridRef.value.closeFilter());

  await applyValue('名称', '使用说明');
  let rows = await visibleRowTexts();
  assert.equal(rows.length, 2);
  assert.equal(rows.every((text) => text.includes('使用说明')), true);

  panel = await openFilter('名称');
  assert.equal(
    await panel.locator('.vxe-advanced-filter__check-row').filter({ hasText: '使用说明' })
      .locator('.is--checked').count(),
    1,
  );
  await page.evaluate(() => window.__advancedFilterSmoke.gridRef.value.closeFilter());

  await clearFilter('名称');
  assert.equal((await visibleRowTexts()).length, 9);

  panel = await openFilter('名称');
  await panel.locator('[data-testid="advanced-filter-condition-menu"]').hover();
  await page.locator('[data-testid="advanced-filter-operator-contains"]:visible').click();
  const dialog = page.locator('.vxe-advanced-filter__dialog:visible');
  await dialog.waitFor({ state: 'visible' });
  await dialog.locator('[data-testid="advanced-filter-condition-1"]').fill('使用');
  await dialog.locator('[data-testid="advanced-filter-custom-confirm"]').click();
  await dialog.waitFor({ state: 'hidden' });
  const textConditionList = panel.locator('[data-testid="advanced-filter-condition-list"]');
  assert.equal(await textConditionList.isVisible(), true);
  assert.equal(
    (await textConditionList.locator('[data-testid="advanced-filter-condition-item"]').innerText())
      .includes('包含 使用'),
    true,
  );
  assert.equal(await panel.locator('[data-testid="advanced-filter-select-all"]').isDisabled(), true);
  assert.equal(
    await panel.locator('.vxe-advanced-filter__check-row[data-value-key]').first().isDisabled(),
    true,
  );
  await panel.locator('[data-testid="advanced-filter-apply"]').click();
  rows = await visibleRowTexts();
  assert.equal(rows.length, 2);
  assert.equal(rows.every((text) => text.includes('使用说明')), true);

  panel = await openFilter('名称');
  assert.equal(await panel.locator('[data-testid="advanced-filter-condition-list"]').isVisible(), true);
  await panel.locator('[data-testid="advanced-filter-remove-condition"]').click();
  assert.equal(await panel.locator('[data-testid="advanced-filter-condition-list"]').count(), 0);
  assert.equal(await panel.locator('[data-testid="advanced-filter-select-all"]').isEnabled(), true);
  await panel.locator('[data-testid="advanced-filter-apply"]').click();
  assert.equal((await visibleRowTexts()).length, 9);

  await clearFilter('名称');
  panel = await openFilter('分数');
  const numberMenuTrigger = panel.locator('[data-testid="advanced-filter-condition-menu"]');
  const numberOperatorMenu = page.locator('.vxe-advanced-filter__operator-submenu:visible');
  await numberMenuTrigger.hover();
  await numberOperatorMenu.waitFor({ state: 'visible' });
  await panel.locator('[data-testid="advanced-filter-search"]').hover();
  await numberOperatorMenu.waitFor({ state: 'hidden' });
  await numberMenuTrigger.hover();
  await numberOperatorMenu.waitFor({ state: 'visible' });
  await page.locator('[data-testid="advanced-filter-custom"]:visible').click();
  const numberDialog = page.locator('.vxe-advanced-filter__dialog:visible');
  await numberDialog.waitFor({ state: 'visible' });
  const operator = numberDialog.locator('.vxe-advanced-filter__condition-operator').first();
  await operator.selectOption('gte');
  await numberDialog.locator('[data-testid="advanced-filter-condition-1"]').fill('80');
  await numberDialog.locator('[data-testid="advanced-filter-custom-confirm"]').click();
  const numberConditionList = panel.locator('[data-testid="advanced-filter-condition-list"]');
  assert.equal(await numberConditionList.isVisible(), true);
  assert.equal(
    (await numberConditionList.locator('[data-testid="advanced-filter-condition-item"]').innerText())
      .includes('大于或等于 80'),
    true,
  );
  assert.equal(await panel.locator('[data-testid="advanced-filter-select-all"]').isDisabled(), true);
  await panel.locator('[data-testid="advanced-filter-apply"]').click();
  rows = await visibleRowTexts();
  assert.equal(rows.length, 5);

  await applyValue('性别', 'Man');
  rows = await visibleRowTexts();
  assert.equal(rows.length, 3);
  assert.equal(rows.every((text) => text.includes('Man')), true);

  await clearFilter('性别');
  await clearFilter('分数');

  panel = await openFilter('入职日期');
  await panel.locator('[data-testid="advanced-filter-condition-menu"]').hover();
  await page.locator('[data-testid="advanced-filter-operator-gte"]:visible').click();
  const dateDialog = page.locator('.vxe-advanced-filter__dialog:visible');
  await dateDialog.locator('[data-testid="advanced-filter-condition-1"]').fill('2026-08-07');
  await dateDialog.locator('[data-testid="advanced-filter-custom-confirm"]').click();
  await panel.locator('[data-testid="advanced-filter-apply"]').click();
  assert.equal((await visibleRowTexts()).length, 3);
  await clearFilter('入职日期');

  panel = await openFilter('分数');
  await panel.locator('[data-testid="advanced-filter-sort-asc"]').click();
  rows = await visibleRowTexts();
  assert.equal(rows[0].includes('61'), true);
  panel = await openFilter('分数');
  await panel.locator('[data-testid="advanced-filter-sort-desc"]').click();
  rows = await visibleRowTexts();
  assert.equal(rows[0].includes('100'), true);
  panel = await openFilter('分数');
  assert.equal(await panel.locator('[data-testid="advanced-filter-clear-sort"]').isEnabled(), true);
  await panel.locator('[data-testid="advanced-filter-clear-sort"]').click();

  panel = await openFilter('名称');
  await panel.locator('[data-testid="advanced-filter-freeze-menu"]').hover();
  await page.locator('[data-testid="advanced-filter-freeze-left"]:visible').click();
  assert.equal(
    await page.evaluate(() => window.__advancedFilterSmoke.gridRef.value.getColumnByField('name').fixed),
    'left',
  );
  panel = await openFilter('名称');
  await panel.locator('[data-testid="advanced-filter-freeze-menu"]').hover();
  await page.locator('[data-testid="advanced-filter-unfreeze"]:visible').click();
  assert.equal(
    await page.evaluate(() => window.__advancedFilterSmoke.gridRef.value.getColumnByField('name').fixed || ''),
    '',
  );

  await page.locator('#add-row').click();
  panel = await openFilter('名称');
  assert.equal(
    await panel.locator('.vxe-advanced-filter__check-row', { hasText: '新增候选值' }).count(),
    1,
  );
  await page.evaluate(() => window.__advancedFilterSmoke.gridRef.value.closeFilter());

  const stateResult = await page.evaluate(async () => {
    const grid = window.__advancedFilterSmoke.gridRef.value;
    const field = grid.getFullColumns().find((column) => column.title === '年龄')?.field;
    await grid.setAdvancedFilterState(field, {
      version: 1,
      dataType: 'number',
      selectedKeys: null,
      logic: 'and',
      conditions: [{ operator: 'gte', value: 30 }],
    });
    const active = grid.isAdvancedFilterActive(field);
    const state = grid.getAdvancedFilterState(field);
    await grid.clearAdvancedFilter(field);
    return { active, state, field };
  });
  assert.equal(stateResult.active, true, JSON.stringify(stateResult));
  assert.equal(stateResult.state.conditions[0].operator, 'gte');

  await page.setViewportSize({ width: 390, height: 844 });
  panel = await openFilter('名称');
  const panelBox = await panel.boundingBox();
  assert.ok(panelBox);
  assert.equal(panelBox.x >= 0, true);
  assert.equal(panelBox.x + panelBox.width <= 390, true);
  await panel.locator('[data-testid="advanced-filter-condition-menu"]').hover();
  const mobileMenu = page.locator('.vxe-advanced-filter__operator-submenu:visible');
  await mobileMenu.waitFor({ state: 'visible' });
  const mobileBox = await mobileMenu.boundingBox();
  assert.ok(mobileBox);
  assert.equal(mobileBox.x >= 0, true);
  assert.equal(mobileBox.x + mobileBox.width <= 390, true);
  await captureScreenshot('advanced-filter-text-menu-mobile.png');

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  await context.close();
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });
  await page.goto(
    `http://127.0.0.1:${port}/tests/table-advanced-filter-browser.html`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 30_000 },
  );
  const touchHeader = await headerCell('名称');
  await touchHeader.locator('.vxe-cell--filter').tap();
  const touchPanel = page.locator('.vxe-advanced-filter:visible').last();
  await touchPanel.waitFor({ state: 'visible' });
  await touchPanel.locator('[data-testid="advanced-filter-condition-menu"]').tap();
  const touchMenu = page.locator('.vxe-advanced-filter__operator-submenu:visible');
  await touchMenu.waitFor({ state: 'visible' });
  const touchMenuBox = await touchMenu.boundingBox();
  assert.ok(touchMenuBox);
  assert.equal(touchMenuBox.x >= 0, true);
  assert.equal(touchMenuBox.x + touchMenuBox.width <= 390, true);
  await page.locator('[data-testid="advanced-filter-operator-contains"]:visible').tap();
  const touchDialog = page.locator('.vxe-advanced-filter__dialog:visible');
  await touchDialog.waitFor({ state: 'visible' });
  await touchDialog.locator('[data-testid="advanced-filter-condition-1"]').fill('使用');
  await touchDialog.locator('[data-testid="advanced-filter-custom-confirm"]').tap();
  await touchPanel.locator('[data-testid="advanced-filter-apply"]').tap();
  assert.equal((await visibleRowTexts()).length, 2);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('Table advanced filter browser integration passed.');
} catch (error) {
  const debug = page
    ? await page.evaluate(() => ({
        text: document.body.innerText.slice(0, 8000),
        panel: document.querySelector('.vxe-advanced-filter')?.outerHTML.slice(0, 12000),
        visibleRows: [...document.querySelectorAll('.vxe-table--main-wrapper .vxe-body--row')]
          .filter((row) => getComputedStyle(row).display !== 'none')
          .map((row) => row.textContent),
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n` +
    `${JSON.stringify(debug)}\n${pageErrors.join('\n')}\n${consoleErrors.join('\n')}\n` +
    serverOutput.slice(-12000),
  );
} finally {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (process.platform === 'win32' && server.pid) {
    const killer = spawn(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', `taskkill /pid ${server.pid} /t /f >nul 2>nul`],
      { windowsHide: true, stdio: 'ignore' },
    );
    await new Promise((resolve) => killer.once('exit', resolve));
  } else if (server.pid) {
    process.kill(-server.pid, 'SIGTERM');
  }
}
