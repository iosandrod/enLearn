import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.TRIGGER_WORKFLOW_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const baseUrl = (process.env.TRIGGER_WORKFLOW_TEST_SERVER_URL || 'http://127.0.0.1:3000')
  .replace(/\/$/, '');
const accountId = process.env.TRIGGER_WORKFLOW_TEST_ACCOUNT_ID ||
  '00000000-0000-4000-8000-000000000001';
const screenshotPath = join(workspaceDir, 'artifacts', 'trigger-workflow-persistence-e2e.png');
const failureScreenshotPath = join(
  workspaceDir,
  'artifacts',
  'trigger-workflow-persistence-e2e-failure.png',
);

await mkdir(join(workspaceDir, 'artifacts'), { recursive: true });
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
let browser;
let context;
let page;
const pageErrors = [];
const consoleErrors = [];
const workflowCalls = [];

function readEnvelopeData(value) {
  return value && typeof value === 'object' && 'data' in value ? value.data : value;
}

async function workflowServiceRequest(auth, serviceMethod, postData) {
  const response = await page.request.post(`${baseUrl}/api/service`, {
    headers: {
      Authorization: `Bearer ${auth.session.access_token}`,
      'X-Account-Id': accountId,
      'X-Request-Id': `trigger-workflow-e2e-${crypto.randomUUID()}`,
    },
    data: { serviceName: 'workflow', serviceMethod, postData },
  });
  assert.equal(response.ok(), true, await response.text());
  return readEnvelopeData(await response.json());
}

async function databaseServiceRequest(auth, serviceName, serviceMethod, postData) {
  const response = await page.request.post(`${baseUrl}/api/service`, {
    headers: {
      Authorization: `Bearer ${auth.session.access_token}`,
      'X-Account-Id': accountId,
      'X-Request-Id': `trigger-workflow-e2e-${crypto.randomUUID()}`,
    },
    data: { serviceName, serviceMethod, postData },
  });
  assert.equal(response.ok(), true, await response.text());
  return readEnvelopeData(await response.json());
}

async function waitForWorkflowCall(serviceMethod, afterCount = 0) {
  await page.waitForFunction(
    ({ method, count }) => {
      const calls = globalThis.__triggerWorkflowPersistenceCalls ?? [];
      return calls.slice(count).some(
        (call) => call?.serviceName === 'workflow' && call?.serviceMethod === method,
      );
    },
    { method: serviceMethod, count: afterCount },
    { timeout: 15_000 },
  );
}

async function waitForModelByCode(auth, code) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const models = await workflowServiceRequest(auth, 'listItems', {
      itemType: 'models',
      filters: { code },
      limit: 5,
    });
    if (models.length) return models;
    await page.waitForTimeout(200);
  }
  return [];
}

try {
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  page = await context.newPage();
  await page.exposeFunction('__recordTriggerWorkflowPersistenceCall', (call) => {
    workflowCalls.push(call);
  });
  await page.addInitScript(() => {
    globalThis.__triggerWorkflowPersistenceCalls = [];
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/api/service') && init?.method === 'POST') {
        try {
          const call = JSON.parse(String(init.body ?? '{}'));
          globalThis.__triggerWorkflowPersistenceCalls.push(call);
          globalThis.__recordTriggerWorkflowPersistenceCall(call);
        } catch {
          // Leave malformed or non-JSON requests to the real fetch implementation.
        }
      }
      return originalFetch(input, init);
    };
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });

  const authResponse = await page.request.post(`${baseUrl}/api/auth/signin`, {
    data: {
      email: process.env.TRIGGER_WORKFLOW_TEST_USER || 'admin',
      password: process.env.TRIGGER_WORKFLOW_TEST_PASSWORD || '123456',
      accountId,
    },
  });
  assert.equal(authResponse.ok(), true, await authResponse.text());
  const auth = await authResponse.json();
  const pickerPages = await databaseServiceRequest(auth, 'lowcode', 'listItems', {
    tableName: 'lowcode_pages',
    filters: { code: 'trigger-workflow-models' },
    limit: 1,
  });
  assert.equal(pickerPages.length, 1, 'Apply the Trigger workflow picker migration first.');

  await page.goto(`${baseUrl}/signin`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ accessToken, refreshToken, selectedAccountId }) => {
    localStorage.setItem('enlearn_access_token', accessToken);
    localStorage.setItem('enlearn_refresh_token', refreshToken);
    localStorage.setItem('enlearn_active_account_id', selectedAccountId);
    localStorage.removeItem(`enlearn.trigger-workflow-editor.${selectedAccountId}`);
  }, {
    accessToken: auth.session.access_token,
    refreshToken: auth.session.refresh_token,
    selectedAccountId: accountId,
  });

  await page.goto(`${baseUrl}/dashboard/trigger-workflow/designer`, {
    waitUntil: 'domcontentloaded',
  });
  const fileActions = page.locator('.trigger-editor__file-actions');
  await fileActions.waitFor({ state: 'visible', timeout: 30_000 });
  const buttons = fileActions.locator('button');
  assert.deepEqual(
    (await buttons.allTextContents()).map((label) => label.trim()),
    ['新建流程', '保存流程', '加载流程'],
  );

  await buttons.nth(0).click();
  const newWorkflowDialog = page.locator('.vxe-modal--wrapper:visible').filter({
    hasText: '当前未保存的修改将被清除',
  }).last();
  await newWorkflowDialog.waitFor({ state: 'visible', timeout: 10_000 });
  assert.match(await newWorkflowDialog.innerText(), /当前未保存的修改将被清除/);
  await newWorkflowDialog.locator('button').last().click();
  await page.waitForTimeout(300);

  const localStorageKey = `enlearn.trigger-workflow-editor.${accountId}`;
  const newWorkflow = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    localStorageKey,
  );
  assert.equal(newWorkflow.nodes.length, 2);
  assert.equal(newWorkflow.edges.length, 1);
  assert.deepEqual(newWorkflow.edges[0], {
    id: 'edge_start_end',
    source: 'start',
    target: 'end',
  });

  let callCount = workflowCalls.length;
  await buttons.nth(1).click();
  await waitForWorkflowCall('saveModel', callCount);
  const createdModels = await waitForModelByCode(auth, newWorkflow.code);
  assert.equal(createdModels.length, 1);
  const savedModel = createdModels[0];
  assert.equal(savedModel.documentType, 'trigger-workflow');

  callCount = workflowCalls.length;
  await buttons.nth(1).click();
  await waitForWorkflowCall('updateModel', callCount);
  const updateCall = workflowCalls.findLast(
    (call) => call.serviceName === 'workflow' && call.serviceMethod === 'updateModel',
  );
  assert.equal(updateCall.postData.modelId, savedModel.id);
  const updatedModels = await workflowServiceRequest(auth, 'listItems', {
    itemType: 'models',
    filters: { code: newWorkflow.code },
    limit: 5,
  });
  assert.equal(updatedModels.length, 1);
  assert.equal(updatedModels[0].id, savedModel.id);

  await buttons.nth(2).click();
  const loadDialog = page.locator('.vxe-modal--wrapper.lowcode-reference-dialog:visible').last();
  await loadDialog.waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await loadDialog.innerText(), /加载流程/);
  const targetRow = loadDialog.locator('.vxe-body--row').filter({
    hasText: newWorkflow.code,
  }).first();
  await targetRow.waitFor({ state: 'visible', timeout: 15_000 });
  await targetRow.click();

  callCount = workflowCalls.length;
  await loadDialog.locator('button').last().click();
  await loadDialog.waitFor({ state: 'hidden', timeout: 15_000 });
  await waitForWorkflowCall('getModel', callCount);
  await page.waitForTimeout(300);
  const loadedWorkflow = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    localStorageKey,
  );
  assert.equal(loadedWorkflow.id, savedModel.id);
  assert.equal(loadedWorkflow.code, newWorkflow.code);
  assert.equal(loadedWorkflow.nodes.length, 2);
  assert.equal(loadedWorkflow.edges.length, 1);

  await workflowServiceRequest(auth, 'deleteItem', {
    resource: 'wf_model',
    id: savedModel.id,
  });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Trigger workflow persistence browser integration passed.');
} catch (error) {
  if (page) {
    await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await context?.close();
  await browser?.close();
}
