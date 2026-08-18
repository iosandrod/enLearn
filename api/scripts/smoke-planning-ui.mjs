import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = new URL('../..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');
const artifactsDir = join(repoRoot, 'artifacts');
const browserExecutable = process.env.PLANNING_UI_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  repoRoot,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const frontendUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const apiUrl = (process.env.API_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
const accountId = process.env.PLANNING_UI_ACCOUNT_ID || '00000000-0000-4000-8000-000000000001';
const adminEmail = process.env.PLANNING_UI_EMAIL || 'admin';
const adminPassword = process.env.PLANNING_UI_PASSWORD || '123456';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const calendarName = `UI日历-${suffix}`;
const calendarNameUpdated = `${calendarName}-已编辑`;
const locationName = `UI地点-${suffix}`;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapServicePayload(payload) {
  return isRecord(payload) && 'success' in payload && 'data' in payload ? payload.data : payload;
}

async function readJson(response) {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function signIn() {
  return readJson(await fetch(`${apiUrl}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, accountId }),
  }));
}

async function serviceRequest(accessToken, serviceName, serviceMethod, postData) {
  return unwrapServicePayload(await readJson(await fetch(`${apiUrl}/api/service`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-account-id': accountId,
    },
    body: JSON.stringify({ serviceName, serviceMethod, postData }),
  })));
}

async function waitForUrl(url, timeoutMs = 30_000) {
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function installSession(context, authPayload) {
  const accessToken = authPayload?.session?.access_token;
  const refreshToken = authPayload?.session?.refresh_token;
  assert.ok(accessToken, 'The administrator access token is missing.');
  await context.addInitScript(({ accessToken: token, refreshToken: refresh, accountId: activeAccountId }) => {
    window.localStorage.setItem('enlearn_access_token', token);
    if (refresh) window.localStorage.setItem('enlearn_refresh_token', refresh);
    window.localStorage.setItem('enlearn_active_account_id', activeAccountId);
    window.sessionStorage.setItem('enlearn_dev_auto_login_disabled', '1');
  }, { accessToken, refreshToken, accountId });
  return accessToken;
}

async function waitForDashboard(page) {
  await page.locator('.admin-shell').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => undefined);
}

function fieldInput(page, fieldName) {
  return page.locator(`#${fieldName}`).locator('input, textarea').first();
}

async function fillField(page, fieldName, value) {
  const input = fieldInput(page, fieldName);
  await input.waitFor({ state: 'visible' });
  await input.fill(String(value));
}

async function readField(page, fieldName) {
  const input = fieldInput(page, fieldName);
  await input.waitFor({ state: 'visible' });
  return input.inputValue();
}

async function waitForFieldValue(page, fieldName, expected) {
  await page.waitForFunction(({ fieldName: name, expected: value }) => {
    const root = document.getElementById(name);
    const input = root?.matches('input, textarea') ? root : root?.querySelector('input, textarea');
    return input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
      ? input.value === value
      : false;
  }, { fieldName, expected }, { timeout: 30_000 });
}

async function selectOption(page, fieldName, label) {
  const select = page.locator(`#${fieldName}`).first();
  await select.waitFor({ state: 'visible' });
  await select.click();
  const option = page.locator('.vxe-select--panel:visible .vxe-select-option', { hasText: label }).first();
  await option.waitFor({ state: 'visible' });
  await option.click();
}

async function clearSelect(page, fieldName) {
  const select = page.locator(`#${fieldName}`).first();
  await select.waitFor({ state: 'visible' });
  await select.hover();
  const clear = select.locator('.vxe-input--clear-icon').first();
  if (await clear.count()) {
    await clear.click();
  } else {
    await select.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
  }
  await page.waitForFunction((name) => {
    const root = document.getElementById(name);
    const input = root?.querySelector('input');
    return input instanceof HTMLInputElement && input.value === '';
  }, fieldName, { timeout: 10_000 });
}

async function clickButton(page, label) {
  const button = page.locator('.lc-node-button-group .vxe-button', { hasText: label }).first();
  await button.waitFor({ state: 'visible' });
  await button.click();
}

async function waitForMessage(page, text) {
  await page.locator('.lc-help', { hasText: text }).waitFor({ state: 'visible', timeout: 30_000 });
}

async function findRows(accessToken, resource, filters) {
  const rows = await serviceRequest(accessToken, 'planning', 'listItems', {
    resource,
    filters,
    limit: 20,
  });
  return Array.isArray(rows) ? rows : Array.isArray(rows?.rows) ? rows.rows : [];
}

async function deleteRows(accessToken, resource, rows) {
  for (const row of rows) {
    if (!row?.id) continue;
    await serviceRequest(accessToken, 'planning', 'deleteItem', { resource, id: row.id });
  }
}

await mkdir(artifactsDir, { recursive: true });
assert.ok(existsSync(browserExecutable), `Browser executable not found: ${browserExecutable}`);
await Promise.all([
  waitForUrl(frontendUrl),
  waitForUrl(`${apiUrl}/api/health`).catch(() => waitForUrl(`${apiUrl}/api/auth/account-options?login=admin`)),
]);

const authPayload = await signIn();
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const accessToken = await installSession(context, authPayload);
const page = await context.newPage();
const pageErrors = [];
const failedResponses = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400 && response.url().includes('/api/')) {
    failedResponses.push(`${response.status()} ${response.url()}`);
  }
});

let calendarId = '';
let locationId = '';
try {
  await page.goto(`${frontendUrl}/dashboard/planning/calendar`, { waitUntil: 'domcontentloaded' });
  try {
    await waitForDashboard(page);
  } catch (error) {
    const debug = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      body: document.body.innerText.slice(0, 5000),
      localStorage: Object.fromEntries(Object.entries(window.localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(window.sessionStorage)),
    }));
    await page.screenshot({ path: join(artifactsDir, 'planning-ui-startup-failure.png'), fullPage: true });
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${pageErrors.join('\n')}`);
  }
  await page.locator('.lc-grid .vxe-table--header').getByText('名称', { exact: true })
    .first().waitFor({ state: 'visible' });
  await page.locator('.admin-menu').getByText('排产管理', { exact: true }).waitFor({ state: 'visible' });
  const expectedMenuGroups = [
    '基础数据', '采购配送', '产能工艺', '需求计划', '计划结果', '计划配置', '预测管理',
    '诊断分析', '执行管理', '场景管理', '时间维度', '扩展属性', '历史归档',
  ];
  assert.deepEqual(
    await Promise.all(expectedMenuGroups.map(async (label) =>
      page.locator('.admin-menu').getByText(label, { exact: true }).first().isVisible()
    )),
    expectedMenuGroups.map(() => true),
  );
  await page.screenshot({ path: join(artifactsDir, 'planning-menu-e2e-final.png'), fullPage: true });
  await page.screenshot({ path: join(artifactsDir, 'planning-calendar-list-e2e-final.png'), fullPage: true });

  await clickButton(page, '新增');
  await page.waitForURL(/\/dashboard\/planning\/calendar\/edit(?:\?|$)/);
  await fieldInput(page, 'name').waitFor({ state: 'visible' });
  await fillField(page, 'name', calendarName);
  await fillField(page, 'description', '由浏览器 UI E2E 创建');
  await fillField(page, 'category', 'UI验收');
  await fillField(page, 'defaultvalue', '12.5');
  await page.screenshot({ path: join(artifactsDir, 'planning-calendar-edit-create.png'), fullPage: true });
  await clickButton(page, '保存');
  await page.waitForURL(/\/dashboard\/planning\/calendar\/edit\?id=/);
  await waitForMessage(page, '日历已保存');
  calendarId = new URL(page.url()).searchParams.get('id') || '';
  assert.ok(calendarId, 'Calendar save did not navigate to the persisted id.');
  await waitForFieldValue(page, 'name', calendarName);
  assert.equal(await readField(page, 'name'), calendarName);

  await fillField(page, 'name', calendarNameUpdated);
  await fillField(page, 'description', '由浏览器 UI E2E 编辑');
  await fillField(page, 'defaultvalue', '');
  await clickButton(page, '保存');
  await page.waitForFunction((expectedName) => {
    const message = [...document.querySelectorAll('.lc-help')]
      .find((node) => node.textContent?.includes('日历已保存'));
    const root = document.getElementById('name');
    const input = root?.matches('input, textarea') ? root : root?.querySelector('input, textarea');
    return Boolean(message) && input instanceof HTMLInputElement && input.value === expectedName;
  }, calendarNameUpdated, { timeout: 30_000 });
  let editedCalendar;
  await assert.doesNotReject(async () => {
    const deadline = Date.now() + 30_000;
    do {
      editedCalendar = (await findRows(accessToken, 'planning_calendar', { id: calendarId }))[0];
      if (editedCalendar?.name === calendarNameUpdated) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    throw new Error(`Calendar update was not observable: ${JSON.stringify(editedCalendar)}`);
  });
  assert.equal(editedCalendar?.name, calendarNameUpdated);
  assert.equal(editedCalendar?.description, '由浏览器 UI E2E 编辑');
  assert.equal(editedCalendar?.defaultvalue, null, 'Clearing a nullable number in the UI must persist null.');

  await clickButton(page, '返回列表');
  await page.waitForURL(/\/dashboard\/planning\/calendar(?:\?|$)/);
  await clickButton(page, '刷新');
  await page.locator('.vxe-body--row', { hasText: calendarNameUpdated }).first()
    .waitFor({ state: 'visible' });
  const visibleCalendarRows = page.locator('.vxe-body--row:visible', { hasText: calendarNameUpdated });
  const matchingCalendarId = await visibleCalendarRows.first().evaluate((row) =>
    row.getAttribute('rowid') || row.getAttribute('data-rowid') || ''
  );
  const editButtons = page.locator('.vxe-table--fixed-right-wrapper .vxe-body--row:visible .vxe-button', {
    hasText: '编辑',
  });
  const editButton = matchingCalendarId
    ? page.locator(`.vxe-table--fixed-right-wrapper .vxe-body--row[rowid="${matchingCalendarId}"] .vxe-button`, {
        hasText: '编辑',
      })
    : editButtons.last();
  await editButton.click();
  await page.waitForURL(new RegExp(`/dashboard/planning/calendar/edit\\?.*id=${calendarId}`));
  await waitForDashboard(page);
  await waitForFieldValue(page, 'name', calendarNameUpdated);
  assert.equal(await readField(page, 'name'), calendarNameUpdated);
  await page.screenshot({ path: join(artifactsDir, 'planning-calendar-edit-e2e-final.png'), fullPage: true });

  await page.goto(`${frontendUrl}/dashboard/planning/location/edit`, { waitUntil: 'domcontentloaded' });
  await waitForDashboard(page);
  await fieldInput(page, 'name').waitFor({ state: 'visible' });
  await fillField(page, 'name', locationName);
  await fillField(page, 'description', '地点与日历关系 UI 验收');
  await selectOption(page, 'available_id', calendarNameUpdated);
  await page.screenshot({ path: join(artifactsDir, 'planning-location-relation-selected.png'), fullPage: true });
  await clickButton(page, '保存');
  await page.waitForURL(/\/dashboard\/planning\/location\/edit\?id=/);
  await waitForMessage(page, '地点已保存');
  locationId = new URL(page.url()).searchParams.get('id') || '';
  assert.ok(locationId, 'Location save did not navigate to the persisted id.');
  let location = (await findRows(accessToken, 'planning_location', { id: locationId }))[0];
  assert.equal(location?.available_id, calendarId);
  assert.equal(location?.available_id_label, calendarNameUpdated);

  await clearSelect(page, 'available_id');
  await clickButton(page, '保存');
  await page.waitForTimeout(500);
  const relationDeadline = Date.now() + 30_000;
  do {
    location = (await findRows(accessToken, 'planning_location', { id: locationId }))[0];
    if (location?.available_id === null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < relationDeadline);
  assert.equal(location?.available_id, null, 'Clearing a nullable relation in the UI must persist null.');

  await clickButton(page, '返回列表');
  await page.waitForURL(/\/dashboard\/planning\/location(?:\?|$)/);
  await page.locator('.vxe-body--row:visible', { hasText: locationName }).first()
    .waitFor({ state: 'visible' });
  await page.locator('.vxe-table--fixed-right-wrapper .vxe-body--row:visible .vxe-button', {
    hasText: '删除',
  }).last().click();
  await waitForMessage(page, 'Deleted');
  assert.equal((await findRows(accessToken, 'planning_location', { id: locationId })).length, 0);
  locationId = '';

  await page.goto(`${frontendUrl}/dashboard/planning/calendar`, { waitUntil: 'domcontentloaded' });
  await waitForDashboard(page);
  await page.locator('.vxe-body--row:visible', { hasText: calendarNameUpdated }).first()
    .waitFor({ state: 'visible' });
  await page.locator('.vxe-table--fixed-right-wrapper .vxe-body--row:visible .vxe-button', {
    hasText: '删除',
  }).last().click();
  await waitForMessage(page, 'Deleted');
  assert.equal((await findRows(accessToken, 'planning_calendar', { id: calendarId })).length, 0);
  calendarId = '';

  assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('\n')}`);
  assert.deepEqual(failedResponses, [], `Failed API responses: ${failedResponses.join('\n')}`);
  console.log(JSON.stringify({
    menu_groups: 13,
    calendar_ui_create: 'verified',
    calendar_ui_edit: 'verified',
    nullable_number_to_null: 'verified',
    linked_edit_navigation: 'verified',
    relation_dropdown: 'verified',
    relation_label: 'verified',
    nullable_relation_to_null: 'verified',
    location_ui_delete: 'verified',
    calendar_ui_delete: 'verified',
    page_errors: 0,
    failed_api_responses: 0,
  }, null, 2));
} finally {
  const locations = await findRows(accessToken, 'planning_location', { name: locationName }).catch(() => []);
  await deleteRows(accessToken, 'planning_location', locations).catch(() => undefined);
  const calendars = [
    ...(await findRows(accessToken, 'planning_calendar', { name: calendarName }).catch(() => [])),
    ...(await findRows(accessToken, 'planning_calendar', { name: calendarNameUpdated }).catch(() => [])),
  ];
  await deleteRows(accessToken, 'planning_calendar', calendars).catch(() => undefined);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}
