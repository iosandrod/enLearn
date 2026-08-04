import playwright from '../node_modules/.pnpm/playwright@1.57.0/node_modules/playwright/index.js';

const { chromium } = playwright;

const BASE_URL = 'http://localhost:3000';
const SHARED_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_ID = '90f8c866-56d2-4a0d-aa8c-e50534a97ebd';
const EXPECTED_APPROVERS = [
  '389388b0-d188-4a7a-adfb-9a3dc1d9c0b0',
  'f49d9e82-0102-463b-8747-46a9b29c3fc1',
  '5efcd1fd-5448-4f7b-9b75-9b60fbcf1c08'
];

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});
const page = await browser.newPage({ viewport: { width: 1720, height: 1040 } });
const errors = [];
const workflowResponses = [];

page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
});
page.on('requestfailed', (request) => {
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
});
page.on('response', async (response) => {
  const request = response.request();
  if (response.status() >= 400) {
    errors.push(`${response.status()} ${request.method()} ${response.url()}`);
  }
  if (request.method() !== 'POST' || !response.url().endsWith('/api/service')) return;
  try {
    const requestBody = request.postDataJSON();
    if (requestBody?.serviceName !== 'workflow') return;
    workflowResponses.push({
      method: requestBody.serviceMethod,
      status: response.status(),
      body: await response.json()
    });
  } catch {
    // Response capture is diagnostic only.
  }
});

async function waitForApp() {
  await page.waitForSelector('.admin-account-switcher__trigger', { timeout: 40_000 });
  await page.waitForTimeout(2_000);
}

async function ensureSharedAccount() {
  const currentAccountId = await page.evaluate(() => localStorage.getItem('enlearn_active_account_id'));
  const currentAccountCode = (await page.locator('.admin-account-switcher__code').textContent())?.trim();
  if (currentAccountId === SHARED_ACCOUNT_ID && currentAccountCode === '001') return;

  await page.locator('.admin-account-switcher__trigger').click();
  const buttons = page.locator('.admin-account-switcher__list button');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if ((await button.innerText()).includes('001')) {
      const switchResponsePromise = page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/auth/select-account')
      , { timeout: 30_000 });
      await button.click();
      const switchResponse = await switchResponsePromise;
      if (!switchResponse.ok()) {
        throw new Error(`Account switch failed (${switchResponse.status()}): ${await switchResponse.text()}`);
      }
      await page.waitForURL('**/dashboard', { timeout: 30_000 });
      await page.waitForFunction(({ accountId, accountCode }) =>
        localStorage.getItem('enlearn_active_account_id') === accountId &&
        document.querySelector('.admin-account-switcher__code')?.textContent?.trim() === accountCode
      , { accountId: SHARED_ACCOUNT_ID, accountCode: '001' }, { timeout: 30_000 });
      return;
    }
  }
  throw new Error('Shared manufacturing account 001 was not available.');
}

async function openDesigner() {
  await page.evaluate(() => {
    history.pushState({}, '', '/dashboard/workflow/designer');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForURL('**/dashboard/workflow/designer', { timeout: 40_000 });
  await page.waitForSelector('.workflow-designer-page__toolbar', { timeout: 40_000 });
  await page.waitForSelector('.admin-user-switcher__trigger', { timeout: 40_000 });
  await page.waitForTimeout(5_000);
}

async function readUserOptions() {
  const trigger = page.locator('.admin-user-switcher__trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await page.waitForSelector('#approval-test-user-menu [role="option"]', { timeout: 30_000 });
  return page.locator('#approval-test-user-menu [role="option"]').evaluateAll((buttons) =>
    buttons.map((button) => ({
      text: button.innerText.trim(),
      id: button.__vueParentComponent?.props?.user?.id ?? ''
    }))
  );
}

async function selectUserById(userId) {
  const trigger = page.locator('.admin-user-switcher__trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const options = page.locator('#approval-test-user-menu [role="option"]');
  await options.first().waitFor({ state: 'visible', timeout: 30_000 });
  const users = await page.evaluate(() => {
    const state = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
    return state ? null : null;
  });
  void users;

  const targetIndex = await options.evaluateAll((buttons, id) => {
    const savedUsers = JSON.parse(document.documentElement.dataset.approvalUsers ?? '[]');
    const target = savedUsers.find((item) => item.id === id);
    if (!target) return -1;
    return buttons.findIndex((button) => button.innerText.includes(target.email || target.name));
  }, userId);
  if (targetIndex < 0) throw new Error(`Test user ${userId} was not found in the switcher.`);
  await options.nth(targetIndex).click();
  await page.waitForTimeout(1_500);
}

async function captureUsersFromApi() {
  const users = await page.evaluate(async () => {
    const token = localStorage.getItem('enlearn_access_token');
    const accountId = localStorage.getItem('enlearn_active_account_id');
    if (!token || !accountId) {
      throw new Error('Approval test API context is missing an access token or account ID.');
    }
    const response = await fetch('/api/service', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Account-Id': accountId
      },
      body: JSON.stringify({
        serviceName: 'admin',
        serviceMethod: 'listApprovalTestUsers',
        postData: {}
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`listApprovalTestUsers failed (${response.status}): ${JSON.stringify(payload)}`);
    }
    if (!Array.isArray(payload.data)) {
      throw new Error(`listApprovalTestUsers returned invalid data: ${JSON.stringify(payload)}`);
    }
    return payload.data;
  });
  await page.evaluate((value) => {
    document.documentElement.dataset.approvalUsers = JSON.stringify(value);
  }, users);
  return users;
}

async function waitForUserOptions(expectedIds) {
  const trigger = page.locator('.admin-user-switcher__trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const options = page.locator('#approval-test-user-menu [role="option"]');
  await options.first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction((ids) => {
    const users = JSON.parse(document.documentElement.dataset.approvalUsers ?? '[]');
    const labels = [...document.querySelectorAll('#approval-test-user-menu [role="option"]')]
      .map((option) => option.textContent ?? '');
    return ids.every((id) => {
      const user = users.find((item) => item.id === id);
      return Boolean(user) && labels.some((label) => label.includes(user.email || user.name));
    });
  }, expectedIds, { timeout: 30_000 });
}

async function bellState() {
  const badge = page.locator('.notification-bell__badge');
  return {
    visible: await badge.isVisible().catch(() => false),
    text: (await badge.textContent().catch(() => ''))?.trim() ?? ''
  };
}

async function waitForUnreadBadge() {
  await page.locator('.notification-bell__badge').waitFor({ state: 'visible', timeout: 40_000 });
  await page.waitForFunction(() => {
    const text = document.querySelector('.notification-bell__badge')?.textContent?.trim() ?? '';
    return Number.parseInt(text, 10) >= 1;
  }, undefined, { timeout: 40_000 });
  return bellState();
}

async function openNewestApprovalMessage() {
  await page.locator('.notification-bell__button').click();
  await page.waitForSelector('.notification-bell__panel', { timeout: 20_000 });
  const items = page.locator('.notification-bell__item');
  await items.first().waitFor({ state: 'visible', timeout: 30_000 });
  const labels = await items.allTextContents();
  const targetIndex = labels.findIndex((label) => label.includes('审批'));
  if (targetIndex < 0) throw new Error(`No approval notification was found: ${labels.join(' | ')}`);
  await items.nth(targetIndex).click();
  await page.waitForURL('**/dashboard/workflow/tasks/**', { timeout: 30_000 });
  await page.waitForSelector('.workflow-task-page__button--primary', { timeout: 30_000 });
  await page.waitForTimeout(1_000);
  return { labels, url: page.url() };
}

async function approveCurrentTask(step) {
  const taskId = page.url().split('/').at(-1);
  await page.screenshot({ path: `artifacts/approval-retest-step-${step}-task.png`, fullPage: true });
  await page.locator('.workflow-task-page__button--primary').click();
  await page.waitForFunction(() => {
    const message = document.querySelector('.workflow-task-page__message--success');
    return Boolean(message?.textContent?.trim());
  }, undefined, { timeout: 40_000 });
  await page.waitForTimeout(2_000);
  const body = await page.locator('.workflow-task-page').innerText();
  await page.screenshot({ path: `artifacts/approval-retest-step-${step}-approved.png`, fullPage: true });
  const response = [...workflowResponses].reverse().find((item) => item.method === 'approveTask');
  return { taskId, body, response: response?.body?.data ?? response?.body };
}

try {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await waitForApp();
  await ensureSharedAccount();
  await openDesigner();

  const users = await captureUsersFromApi();
  await page.locator('.admin-user-switcher__trigger').click();
  await page.locator('#approval-test-user-menu button[aria-label]').click();
  await page.locator('.admin-user-switcher__notice').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  await waitForUserOptions([ADMIN_ID, ...EXPECTED_APPROVERS]);
  const userIds = users.map((user) => user.id);
  for (const id of [ADMIN_ID, ...EXPECTED_APPROVERS]) {
    if (!userIds.includes(id)) throw new Error(`Required approval user ${id} is missing.`);
  }
  await selectUserById(ADMIN_ID);
  await page.waitForTimeout(1_000);

  const testResponsePromise = page.waitForResponse(async (response) => {
    if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
    try {
      const body = response.request().postDataJSON();
      return body?.serviceName === 'workflow' && body?.serviceMethod === 'runApprovalFlowTest';
    } catch {
      return false;
    }
  }, { timeout: 120_000 });
  await page.getByRole('button', { name: '一键测试', exact: true }).click();
  const testResponse = await testResponsePromise;
  const testPayload = await testResponse.json();
  if (!testResponse.ok()) throw new Error(`One-click test failed: ${JSON.stringify(testPayload)}`);
  const testResult = testPayload.data;
  const instanceId = testResult.instanceId;
  if (testResult.testData?.tenantId !== SHARED_ACCOUNT_ID) {
    throw new Error(`Unexpected tenant ${testResult.testData?.tenantId}.`);
  }
  if (testResult.nextTask?.assigneeId !== EXPECTED_APPROVERS[0]) {
    throw new Error(`Unexpected first approver ${testResult.nextTask?.assigneeId}.`);
  }
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: 'artifacts/approval-retest-new-oneclick.png', fullPage: true });

  const steps = [];
  let latestInstance = testResult;
  for (let index = 0; index < EXPECTED_APPROVERS.length; index += 1) {
    const expectedUserId = EXPECTED_APPROVERS[index];
    await selectUserById(expectedUserId);
    const badge = await waitForUnreadBadge();
    if (!badge.visible || Number.parseInt(badge.text, 10) < 1) {
      throw new Error(`Approval user ${expectedUserId} has no unread red badge.`);
    }
    await page.screenshot({ path: `artifacts/approval-retest-step-${index + 1}-badge.png`, fullPage: true });
    const notification = await openNewestApprovalMessage();
    const approval = await approveCurrentTask(index + 1);
    latestInstance = approval.response;
    steps.push({ expectedUserId, badge, notification, ...approval });

    if (index < EXPECTED_APPROVERS.length - 1) {
      await page.waitForTimeout(2_000);
    }
  }

  const finalInstance = await page.evaluate(async ({ instanceId, userId }) => {
    const token = localStorage.getItem('enlearn_access_token');
    const accountId = localStorage.getItem('enlearn_active_account_id');
    if (!token || !accountId) {
      throw new Error('Approval instance API context is missing an access token or account ID.');
    }
    const response = await fetch('/api/service', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Account-Id': accountId
      },
      body: JSON.stringify({
        serviceName: 'workflow',
        serviceMethod: 'getInstance',
        postData: { instanceId, userId }
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`getInstance failed (${response.status}): ${JSON.stringify(payload)}`);
    }
    return payload.data;
  }, { instanceId, userId: EXPECTED_APPROVERS.at(-1) });

  const completedTasks = finalInstance.tasks?.filter((task) => task.status === 'completed') ?? [];
  if (finalInstance.status !== 'approved') {
    throw new Error(`Final instance status is ${finalInstance.status}, expected approved.`);
  }
  if (completedTasks.length !== EXPECTED_APPROVERS.length) {
    throw new Error(`Expected ${EXPECTED_APPROVERS.length} completed tasks, got ${completedTasks.length}.`);
  }
  await page.screenshot({ path: 'artifacts/approval-retest-complete.png', fullPage: true });

  console.log(JSON.stringify({
    passed: true,
    instanceId,
    tenantId: testResult.testData.tenantId,
    userOrder: EXPECTED_APPROVERS,
    steps: steps.map((step) => ({
      userId: step.expectedUserId,
      badge: step.badge,
      taskId: step.taskId,
      pageUrl: step.notification.url,
      statusAfterApproval: step.response?.status
    })),
    finalStatus: finalInstance.status,
    completedTasks: completedTasks.map((task) => ({
      id: task.id,
      assigneeId: task.assigneeId,
      status: task.status,
      completedAt: task.completedAt
    })),
    latestInstanceStatus: latestInstance?.status,
    consoleAndNetworkErrors: errors
  }, null, 2));
} finally {
  await browser.close();
}
