import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.BUTTON_SCRIPT_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
const formDefinitionResponses = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
});
page.on('response', async (response) => {
  if (response.request().method() !== 'POST' || !response.url().includes('/api/service')) return;
  const postData = response.request().postDataJSON();
  if (postData?.postData?.resource !== 'lowcode_form_definitions') return;
  formDefinitionResponses.push({
    status: response.status(),
    codes: postData.postData.filters?.code,
  });
});

async function open(path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  assert.notEqual(new URL(page.url()).pathname, '/signin', `${path} redirected to sign in.`);
  const text = await page.locator('body').innerText();
  assert.doesNotMatch(text, /lowcode_form_definitions.*schema cache/i);
  assert.doesNotMatch(text, /低代码表单定义“.*”不存在或已停用/);
}

try {
  await open('/dashboard/account');
  await page.getByText('Personal Information', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Full Name', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Email', { exact: true }).last().waitFor({ state: 'visible' });

  await open('/dashboard/settings');
  await page.getByText('Everything', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Theme', { exact: true }).waitFor({ state: 'visible' });

  await open('/dashboard/low-code');
  await page.locator('.vxe-form--item-title-label').filter({ hasText: /^Page Code$/ }).waitFor({ state: 'visible' });
  await page.locator('.vxe-form--item-title-label').filter({ hasText: /^Schema JSON$/ }).waitFor({ state: 'visible' });

  await open('/dashboard/entity-design');
  await page.getByText(/实体列表 \(\d+\)/).first().waitFor({ state: 'visible' });
  await page.getByText(/字段列表 \(\d+\)/).first().waitFor({ state: 'visible' });

  assert.ok(formDefinitionResponses.length >= 4, 'Expected database form-definition requests.');
  assert.ok(formDefinitionResponses.every((entry) => entry.status === 200));
  assert.ok(
    formDefinitionResponses.some(
      (entry) => Array.isArray(entry.codes) &&
        entry.codes.includes('entity-design-load-physical-tables')
    ),
    'The entity designer must request the load-physical-tables form definition.'
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    pages: ['account', 'settings', 'low-code', 'entity-design'],
    formDefinitionRequests: formDefinitionResponses,
  }));
} finally {
  await context.close();
  await browser.close();
}
