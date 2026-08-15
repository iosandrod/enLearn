import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
const baseUrl = (process.env.TRIGGER_WORKFLOW_TEST_SERVER_URL || 'http://localhost:3000')
  .replace(/\/$/, '');
const apiUrl = (process.env.TRIGGER_WORKFLOW_TEST_API_URL || 'http://127.0.0.1:3002')
  .replace(/\/$/, '');
const accountId = process.env.TRIGGER_WORKFLOW_TEST_ACCOUNT_ID ||
  '00000000-0000-4000-8000-000000000001';
const timeoutMs = Number(process.env.TRIGGER_WORKFLOW_TOAST_TIMEOUT_MS || 90_000);
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const workflowCode = `typed_frontend_toast_${suffix}`;
const workflowName = `类型化前端指令测试 ${suffix}`;
const toastMessage = `节点函数动态消息 ${suffix}`;
const screenshotPath = join(workspaceDir, 'artifacts', 'trigger-workflow-toast-e2e.png');
const failureScreenshotPath = join(
  workspaceDir,
  'artifacts',
  'trigger-workflow-toast-e2e-failure.png',
);

await mkdir(join(workspaceDir, 'artifacts'), { recursive: true });
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
let browser;
let context;
let page;
let auth;
let modelId = '';
let jobId = '';
let completedRunId = '';
const pageErrors = [];
const consoleErrors = [];

function readEnvelopeData(value) {
  return value && typeof value === 'object' && 'data' in value ? value.data : value;
}

async function workflowServiceRequest(serviceMethod, postData) {
  const response = await page.request.post(`${apiUrl}/api/service`, {
    headers: {
      Authorization: `Bearer ${auth.session.access_token}`,
      'X-Account-Id': accountId,
      'X-Request-Id': `trigger-workflow-toast-${randomUUID()}`,
    },
    data: { serviceName: 'workflow', serviceMethod, postData },
  });
  assert.equal(response.ok(), true, await response.text());
  return readEnvelopeData(await response.json());
}

try {
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });

  const authResponse = await signIn();
  assert.equal(authResponse.ok(), true, await authResponse.text());
  auth = await authResponse.json();

  const initialModel = createWorkflowModel();
  const savedModel = await workflowServiceRequest('saveModel', {
    code: workflowCode,
    name: workflowName,
    documentType: 'trigger-workflow',
    schema: initialModel,
  });
  modelId = savedModel.id;
  const model = { ...initialModel, id: modelId };
  const localStorageKey = `enlearn.trigger-workflow-editor.${accountId}`;

  await page.goto(`${baseUrl}/signin`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ accessToken, refreshToken, selectedAccountId, storageKey, value }) => {
    localStorage.setItem('enlearn_access_token', accessToken);
    localStorage.setItem('enlearn_refresh_token', refreshToken);
    localStorage.setItem('enlearn_active_account_id', selectedAccountId);
    localStorage.setItem(storageKey, JSON.stringify(value));
  }, {
    accessToken: auth.session.access_token,
    refreshToken: auth.session.refresh_token,
    selectedAccountId: accountId,
    storageKey: localStorageKey,
    value: model,
  });

  await page.goto(`${baseUrl}/dashboard/trigger-workflow/designer`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('.trigger-editor').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1_000);

  const enableButton = page.locator('.trigger-editor__actions button').filter({
    hasText: '启用',
  });
  const runButton = page.locator('.trigger-editor__actions button').filter({
    hasText: '运行',
  });
  await enableButton.click();
  await page.locator('.vxe-modal--wrapper.type--message.status--success')
    .filter({ hasText: '已编译为作业并启用' })
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent?.trim() === '运行');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 30_000 });

  const jobs = await workflowServiceRequest('listItems', { itemType: 'jobs' });
  const job = jobs.find((item) => item.code === workflowCode);
  assert.ok(job, 'Enabling the editor model must create its workflow Job.');
  jobId = job.id;
  assert.equal(job.triggerTaskId, 'workflow.trigger-workflow.run');
  const operation = job.payload.triggerWorkflow.executionPlan.operations.find(
    (item) => item.nodeId === 'show_message',
  );
  assert.equal(operation.adapter.type, 'frontendCommand');
  assert.equal(operation.adapter.executorTaskId, 'workflow.adapter.frontend-command');
  assert.match(operation.adapter.functionSource, new RegExp(suffix));

  await runButton.click();
  const toast = page.locator('.vxe-modal--wrapper.type--message.status--success')
    .filter({ hasText: toastMessage });
  await toast.waitFor({ state: 'visible', timeout: timeoutMs });

  const run = await waitForTerminalRun(jobId);
  completedRunId = run.id;
  assert.equal(run.status, 'succeeded', run.errorMessage || 'Workflow run failed.');
  const taskOutput = run.output.operationOutputs.show_message;
  assert.equal(taskOutput.handledBy, 'workflow.adapter.frontend-command');
  assert.equal(taskOutput.command.code, 'message.show');
  assert.equal(taskOutput.command.params.message, toastMessage);
  assert.equal(taskOutput.command.source.taskId, 'workflow.adapter.frontend-command');
  assert.equal(run.output.handledBy, 'workflow.trigger-workflow.run');

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    workflowCode,
    jobId,
    runId: completedRunId,
    toastMessage,
  }));
} catch (error) {
  if (jobId && auth) {
    try {
      const runs = await workflowServiceRequest('listItems', {
        itemType: 'jobRuns',
        jobId,
        limit: 5,
      });
      console.error(JSON.stringify({
        pageErrors,
        consoleErrors,
        latestRun: runs[0] ?? null,
      }, null, 2));
    } catch (debugError) {
      console.error(`Failed to collect workflow debug info: ${debugError.message}`);
    }
  }
  if (page) {
    await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  if (page && auth) {
    await cleanup().catch((error) => {
      console.warn(`Trigger workflow toast cleanup failed: ${error.message}`);
    });
  }
  await context?.close();
  await browser?.close();
}

function createWorkflowModel() {
  return {
    schemaVersion: 1,
    code: workflowCode,
    name: workflowName,
    kind: 'custom',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '手动触发',
        position: { x: 380, y: 40 },
      },
      {
        id: 'show_message',
        type: 'task',
        name: '发送动态前端消息',
        position: { x: 380, y: 220 },
        config: {
          task: {
            type: 'frontendCommand',
            frontendFunction: `async () => ({
              code: 'message.show',
              params: {
                message: '${toastMessage}',
                type: 'success',
                duration: 15000
              }
            })`,
            input: {},
            outputPath: 'taskOutputs.frontendMessage',
            failureStrategy: 'failWorkflow',
            timeoutSeconds: 30,
          },
        },
      },
      {
        id: 'end',
        type: 'end',
        name: '执行完成',
        position: { x: 380, y: 400 },
      },
    ],
    edges: [
      { id: 'edge_start_message', source: 'start', target: 'show_message' },
      { id: 'edge_message_end', source: 'show_message', target: 'end' },
    ],
  };
}

async function waitForTerminalRun(targetJobId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const runs = await workflowServiceRequest('listItems', {
      itemType: 'jobRuns',
      jobId: targetJobId,
      limit: 10,
    });
    const run = runs.find((item) => ['succeeded', 'failed', 'canceled'].includes(item.status));
    if (run) return run;
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for workflow Job ${targetJobId}.`);
}

async function cleanup() {
  if (jobId) {
    const runs = await workflowServiceRequest('listItems', {
      itemType: 'jobRuns',
      jobId,
      limit: 50,
    });
    for (const run of runs) {
      if (!['succeeded', 'failed', 'canceled'].includes(run.status)) continue;
      await workflowServiceRequest('deleteItem', { resource: 'wf_job_run', id: run.id });
    }
    await workflowServiceRequest('deleteJob', { jobId });
  }
  if (modelId) {
    await workflowServiceRequest('deleteItem', { resource: 'wf_model', id: modelId });
  }
}

async function signIn() {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await page.request.post(`${apiUrl}/api/auth/signin`, {
      data: {
        email: process.env.TRIGGER_WORKFLOW_TEST_USER || 'admin',
        password: process.env.TRIGGER_WORKFLOW_TEST_PASSWORD || '123456',
        accountId,
      },
    });
    if (response.ok()) return response;
    if (attempt < 2) await page.waitForTimeout(250 * (attempt + 1));
  }
  return response;
}
