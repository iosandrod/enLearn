import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.PRINT_TEMPLATE_PICKER_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';
const playwrightModule = await import(pathToFileURL(playwrightPath).href);

const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
const page = await context.newPage();
const pageErrors = [];
const serviceRequests = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if ((message.type() === 'error' || message.type() === 'warning') && !message.text().includes('Failed to load resource')) {
    pageErrors.push(message.text());
  }
});
page.on('request', (request) => {
  if (!request.url().endsWith('/api/service') || request.method() !== 'POST') return;
  try {
    const body = request.postDataJSON();
    serviceRequests.push({ body, at: Date.now() });
  } catch {
    // Ignore non-JSON service requests; the application uses JSON for this endpoint.
  }
});

function isPageDefinitionRequest(entry, code) {
  const body = entry.body;
  return body?.serviceName === 'lowcode' &&
    body?.serviceMethod === 'listItems' &&
    body?.postData?.tableName === 'lowcode_pages' &&
    body?.postData?.filters?.code === code;
}

function isTemplateListRequest(entry) {
  const body = entry.body;
  return body?.serviceMethod === 'listItems' &&
    (body?.postData?.tableName === 'print_templates' ||
      body?.postData?.tableName === 'public.print_templates');
}

try {
  const authResponse = await page.request.post(`${baseUrl}/api/auth/signin`, {
    data: { email: 'admin', password: '123456', accountId },
  });
  assert.equal(authResponse.ok(), true, await authResponse.text());
  const auth = await authResponse.json();

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
  const loadButton = page.locator('button').filter({ hasText: '加载模板' }).first();
  await loadButton.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1_000);

  const requestsBeforeClick = serviceRequests.length;
  const pageDefinitionRequestsBeforeClick = serviceRequests.filter((entry) =>
    isPageDefinitionRequest(entry, 'print-templates'),
  ).length;

  await loadButton.click();

  const dialog = page.locator('.lowcode-reference-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });
  await dialog.getByText('加载打印模板', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await dialog.locator('.vxe-body--row').first().waitFor({ state: 'visible', timeout: 30_000 });

  const requestsAfterClick = serviceRequests.slice(requestsBeforeClick);
  const pageDefinitionRequestsAfterClick = requestsAfterClick.filter((entry) =>
    isPageDefinitionRequest(entry, 'print-templates'),
  );
  const templateListRequestsAfterClick = requestsAfterClick.filter(isTemplateListRequest);

  assert.equal(
    pageDefinitionRequestsAfterClick.length,
    0,
    `Clicking load template refetched print-templates page definition. Before: ${JSON.stringify(serviceRequests.slice(0, requestsBeforeClick))}. After: ${JSON.stringify(requestsAfterClick)}. Console: ${JSON.stringify(pageErrors)}`,
  );
  assert.ok(
    templateListRequestsAfterClick.length > 0,
    `Clicking load template did not request print_templates data. Requests: ${JSON.stringify(requestsAfterClick)}`,
  );
  assert.ok(pageDefinitionRequestsBeforeClick >= 1, 'Initial page load should fetch print-templates before the click.');

  console.log(JSON.stringify({
    ok: true,
    dialogVisible: true,
    requestsBeforeClick,
    pageDefinitionRequestsBeforeClick,
    pageDefinitionRequestsAfterClick: pageDefinitionRequestsAfterClick.length,
    templateListRequestsAfterClick: templateListRequestsAfterClick.length,
  }));
} finally {
  await context.close();
  await browser.close();
}
