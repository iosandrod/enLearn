import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(workspaceDir, 'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js');
const browserExecutable = process.env.PRINT_DESIGNER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3301').replace(/\/$/, '');
const apiBaseUrl = (process.env.API_URL || 'http://localhost:3300/api').replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({ executablePath: browserExecutable, headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
const page = await context.newPage();
const requests = [];
const pageErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') pageErrors.push(message.text());
});
page.on('request', (request) => {
  if (!request.url().endsWith('/api/service') || request.method() !== 'POST') return;
  try {
    const body = request.postDataJSON();
    if (body?.serviceName === 'lowcode') requests.push(body);
  } catch { /* The service endpoint uses JSON; ignore anything else. */ }
});

try {
  let authResponse;
  let authText = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    authResponse = await fetch(`${apiBaseUrl}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin', password: '123456', accountId }),
    });
    authText = await authResponse.text();
    if (authResponse.ok) break;
  }
  assert.equal(authResponse?.ok, true, authText);
  const auth = JSON.parse(authText);
  await page.goto(`${baseUrl}/signin`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ accessToken, refreshToken, selectedAccountId }) => {
    localStorage.setItem('enlearn_access_token', accessToken);
    localStorage.setItem('enlearn_refresh_token', refreshToken);
    localStorage.setItem('enlearn_active_account_id', selectedAccountId);
  }, {
    accessToken: auth.session.access_token,
    refreshToken: auth.session.refresh_token,
    selectedAccountId: accountId,
  });

  await page.goto(`${baseUrl}/print-designer`, { waitUntil: 'domcontentloaded' });
  await page.locator('#print-designer-header-actions').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2_000);

  const loadButton = page.locator('button').filter({ hasText: '加载模板' }).first();
  await loadButton.click();
  const loadDialog = page.locator('.lowcode-reference-dialog');
  await loadDialog.getByText('加载打印模板', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.keyboard.press('Escape');
  await loadDialog.waitFor({ state: 'hidden', timeout: 10_000 });

  const saveButton = page.locator('button').filter({ hasText: '保存模板' }).first();
  await saveButton.click();
  await page.locator('.lowcode-reference-dialog').getByText('保存打印模板', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });

  const definitionRequests = requests.filter((request) => {
    const table = request.postData?.resource ?? request.postData?.tableName;
    return table === 'lowcode_pages' || table === 'lowcode_form_definitions' ||
      request.serviceMethod === 'getPrintDesignerResources';
  });
  console.log(JSON.stringify(definitionRequests, null, 2));
  assert.equal(definitionRequests.length, 1, `Expected one bundled definition request, received ${definitionRequests.length}.`);
  assert.equal(definitionRequests[0].serviceMethod, 'getPrintDesignerResources');
  assert.deepEqual(pageErrors, []);
} finally {
  await context.close();
  await browser.close();
}
