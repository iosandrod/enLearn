import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.AI_ASSISTANT_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js'
);
const baseUrl = (process.env.AI_ASSISTANT_TEST_SERVER_URL || 'http://127.0.0.1:3410')
  .replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';
const prompt = '添加一个测试按钮，功能是编辑当前行，跳转到编辑页面';
const screenshotPath = join(workspaceDir, 'artifacts', 'ai-sales-order-test-button-proposal.png');

await mkdir(join(workspaceDir, 'artifacts'), { recursive: true });
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
let browser;
let context;
let page;
const pageErrors = [];
const consoleErrors = [];
const applyRequests = [];
const savePageRequests = [];

function readEnvelopeData(value) {
  return value && typeof value === 'object' && 'data' in value ? value.data : value;
}

function findButtonAction(schema, blockId, code) {
  const visit = (blocks) => {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      if (!block || typeof block !== 'object') continue;
      if (block.id === blockId) {
        return (Array.isArray(block.actions) ? block.actions : []).find(
          (action) => action?.code === code
        );
      }
      const nested = visit(block.blocks);
      if (nested) return nested;
      for (const tab of Array.isArray(block.tabs) ? block.tabs : []) {
        const tabResult = visit(tab?.blocks);
        if (tabResult) return tabResult;
      }
    }
  };
  return visit(schema?.blocks);
}

async function serviceRequest(auth, serviceName, serviceMethod, postData) {
  const response = await page.request.post(`${baseUrl}/api/service`, {
    headers: {
      Authorization: `Bearer ${auth.session.access_token}`,
      'X-Account-Id': accountId,
      'X-Request-Id': `ai-sales-order-${crypto.randomUUID()}`
    },
    data: { serviceName, serviceMethod, postData }
  });
  assert.equal(response.ok(), true, await response.text());
  return readEnvelopeData(await response.json());
}

async function openAssistant() {
  await page.locator('.ai-assistant-button').click();
  await page.locator('.ai-assistant-drawer').waitFor({ state: 'visible' });
}

async function sendPrompt(text) {
  await page.locator('.ai-prompt-composer textarea').fill(text);
  await page.locator('.ai-prompt-composer__send').click();
  await page.waitForFunction(() => {
    const send = document.querySelector('.ai-prompt-composer__send');
    return Boolean(send) && !document.querySelector('.ai-prompt-composer__cancel');
  }, undefined, { timeout: 30_000 });
}

try {
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true
  });
  context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('request', (request) => {
    if (/\/api\/ai\/proposals\/[^/]+\/apply$/.test(request.url())) {
      applyRequests.push(request.url());
    }
    if (request.url().endsWith('/api/service') && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (
        body?.serviceName === 'lowcode' &&
        body?.serviceMethod === 'saveItem' &&
        body?.postData?.resource === 'lowcode_pages'
      ) {
        savePageRequests.push(body);
      }
    }
  });

  const authResponse = await page.request.post(`${baseUrl}/api/auth/signin`, {
    data: { email: 'admin', password: '123456', accountId }
  });
  assert.equal(authResponse.ok(), true, await authResponse.text());
  const auth = await authResponse.json();
  const baselinePage = await serviceRequest(auth, 'lowcode', 'getRuntimePage', {
    code: 'sales-orders'
  });
  assert.equal(baselinePage.code, 'sales-orders');
  assert.equal(baselinePage.page_type, 'list');
  const baselineVersion = baselinePage.version;
  const baselineSchema = JSON.stringify(baselinePage.schema);

  await page.goto(`${baseUrl}/signin`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ accessToken, refreshToken, selectedAccountId }) => {
    localStorage.setItem('enlearn_access_token', accessToken);
    localStorage.setItem('enlearn_refresh_token', refreshToken);
    localStorage.setItem('enlearn_active_account_id', selectedAccountId);
  }, {
    accessToken: auth.session.access_token,
    refreshToken: auth.session.refresh_token,
    selectedAccountId: accountId
  });

  await page.goto(`${baseUrl}/dashboard/sales/orders`, { waitUntil: 'domcontentloaded' });
  await page.locator('.lowcode-runtime-page').waitFor({ state: 'visible', timeout: 30_000 });
  await openAssistant();
  await page.getByText('销售订单', { exact: true }).last().waitFor({ state: 'visible' });
  await page.locator('.ai-prompt-composer__modes button', { hasText: '按钮' }).click();
  await sendPrompt(prompt);

  const card = page.locator('.ai-proposal-card').last();
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await card.innerText(), /新增“测试”按钮/);
  assert.match(await card.innerText(), /按钮：测试/);
  assert.match(await card.innerText(), /等待确认/);
  assert.equal(await card.locator('.ai-proposal-card__validation .is-error').count(), 0);

  const trace = page.locator('.ai-tool-trace').last();
  await trace.locator('summary').click();
  const traceText = await trace.innerText();
  assert.match(traceText, /proposal\.create_button/);
  assert.match(traceText, /"builtinKey": "record\.edit"/);
  assert.match(traceText, /"label": "测试"/);
  assert.match(traceText, /"code": "custom-record-edit"/);

  await card.locator('button[aria-label="查看结构化差异"]').click();
  const cardText = await card.innerText();
  assert.match(cardText, /"blockId": "sales-order-actions"/);
  assert.match(cardText, /"code": "custom-record-edit"/);
  assert.match(cardText, /"label": "测试"/);
  assert.match(cardText, /name: \\"edit\\"/);

  const proposalId = await card.evaluate((element) => {
    const vue = element.__vueParentComponent;
    return vue?.props?.proposal?.id ?? '';
  });
  assert.ok(proposalId, 'The rendered proposal must expose its server id.');

  await page.screenshot({ path: screenshotPath, fullPage: true });

  await card.locator('footer button').click();
  const dialog = page.locator('.ai-approval-dialog');
  await dialog.waitFor({ state: 'visible' });
  assert.match(await dialog.innerText(), /这是全局页面变更/);
  assert.equal(await dialog.locator('.is-primary').isDisabled(), true);
  await dialog.locator('.is-secondary').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.match(await card.innerText(), /已拒绝/);

  assert.deepEqual(applyRequests, []);
  assert.deepEqual(savePageRequests, []);
  const currentPage = await serviceRequest(auth, 'lowcode', 'getRuntimePage', {
    code: 'sales-orders'
  });
  assert.equal(currentPage.version, baselineVersion);
  assert.equal(JSON.stringify(currentPage.schema), baselineSchema);
  assert.equal(
    findButtonAction(currentPage.schema, 'sales-order-actions', 'custom-record-edit'),
    undefined
  );

  const listEditFunction = await import(
    pathToFileURL(join(
      workspaceDir,
      'packages/lowcode-framework/src/runtime/page-function/index.ts'
    )).href
  );
  const navigationCalls = [];
  await listEditFunction.resolveBuiltinLowCodePageFunction('list', 'edit').execute({
    pageType: 'list',
    args: {},
    getSelectedRows: () => [{ id: 'sales-order-row-1' }],
    getFormRecords: () => [],
    navigateToEdit: async (row) => navigationCalls.push(
      `/dashboard/sales/orders/edit?id=${row.id}&fromPage=sales-orders`
    ),
    updateRecords: async () => [],
    invokeService: async () => ({}),
    prepareForms: async () => undefined,
    patchForms: async () => undefined,
    submitForms: async () => true,
    getMode: () => 'scan',
    setMode: async () => undefined,
    refresh: async () => undefined,
    print: async () => undefined,
    exit: async () => undefined,
    notify() {}
  });
  assert.deepEqual(navigationCalls, [
    '/dashboard/sales/orders/edit?id=sales-order-row-1&fromPage=sales-orders'
  ]);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    proposalId,
    operation: {
      type: 'upsertButtonAction',
      blockId: 'sales-order-actions',
      code: 'custom-record-edit',
      label: '测试',
      builtinKey: 'record.edit'
    },
    status: 'rejected',
    pageVersion: baselineVersion,
    applied: false,
    navigation: navigationCalls[0],
    screenshotPath
  }));
} catch (error) {
  const debug = page
    ? await page.evaluate(() => ({
        url: location.href,
        text: document.body.innerText.slice(0, 8000)
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n` +
    `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`
  );
} finally {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
}
