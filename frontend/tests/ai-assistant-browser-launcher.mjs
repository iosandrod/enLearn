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
const baseUrl = (process.env.AI_ASSISTANT_TEST_SERVER_URL || 'http://127.0.0.1:3310')
  .replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';
const artifactsDir = join(workspaceDir, 'artifacts');

await mkdir(artifactsDir, { recursive: true });
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
let browser;
let context;
let page;
const pageErrors = [];
const consoleErrors = [];

async function openAssistant() {
  const button = page.locator('.ai-assistant-button');
  await button.waitFor({ state: 'visible', timeout: 30_000 });
  await button.click();
  await page.locator('.ai-assistant-drawer').waitFor({ state: 'visible' });
}

async function closeAssistant() {
  await page.locator('.ai-assistant-drawer__header button[aria-label="关闭"]').click();
  await page.locator('.ai-assistant-drawer').waitFor({ state: 'hidden' });
}

async function waitForDrawerGeometry(locator, expectedWidth, expectedTop = undefined) {
  await locator.waitFor({ state: 'visible' });
  await page.waitForFunction(
    ({ expectedWidth: width, expectedTop: top }) => {
      const element = document.querySelector('.ai-assistant-drawer');
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.width - width) < 1 &&
        Math.abs(document.documentElement.clientWidth - rect.right) < 1 &&
        (top === undefined || Math.abs(rect.top - top) < 1);
    },
    { expectedWidth, expectedTop },
    { timeout: 5_000 }
  );
}

async function sendPrompt(text) {
  const composer = page.locator('.ai-prompt-composer textarea');
  await composer.fill(text);
  await page.locator('.ai-prompt-composer__send').click();
  await page.waitForFunction(() => {
    const button = document.querySelector('.ai-prompt-composer__send');
    return Boolean(button) && !document.querySelector('.ai-prompt-composer__cancel');
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

  const authResponse = await page.request.post(`${baseUrl}/api/auth/signin`, {
    data: { email: 'admin', password: '123456', accountId }
  });
  assert.equal(authResponse.ok(), true);
  const auth = await authResponse.json();
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

  await page.goto(`${baseUrl}/dashboard/sales/orders/edit`, { waitUntil: 'domcontentloaded' });
  await page.locator('.lowcode-runtime-page').waitFor({ state: 'visible', timeout: 30_000 });
  await openAssistant();
  await page.getByText('销售订单编辑', { exact: true }).last().waitFor({ state: 'visible' });
  await waitForDrawerGeometry(page.locator('.ai-assistant-drawer'), 480);

  const desktopGeometry = await page.locator('.ai-assistant-drawer').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      right: Math.round(document.documentElement.clientWidth - rect.right)
    };
  });
  assert.equal(desktopGeometry.width, 480);
  assert.equal(desktopGeometry.right, 0);
  assert.equal(await page.locator('.ai-prompt-composer__modes button').count(), 5);
  assert.equal(await page.locator('.ai-context-bar__sample').count(), 1);

  await sendPrompt('请解释当前页面的结构和主要操作');
  assert.ok(await page.locator('.ai-message.is-user').count() >= 1);
  assert.ok(await page.locator('.ai-message.is-assistant').count() >= 1);
  assert.ok(await page.locator('.ai-tool-trace').count() >= 1);

  await page.screenshot({
    path: join(artifactsDir, 'ai-assistant-desktop.png'),
    fullPage: true
  });

  await page.locator('.ai-assistant-drawer__header button[aria-label="新对话"]').click();
  await page.locator('.ai-prompt-composer__modes button', { hasText: '按钮' }).click();
  await sendPrompt('添加刷新按钮');
  await page.locator('.ai-proposal-card').waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await page.locator('.ai-proposal-card').innerText(), /等待确认/);
  assert.equal(await page.locator('.ai-proposal-card__validation .is-error').count(), 0);
  await page.locator('.ai-proposal-card footer button').click();
  const dialog = page.locator('.ai-approval-dialog');
  await dialog.waitFor({ state: 'visible' });
  assert.match(await dialog.innerText(), /全局页面变更/);
  assert.equal(await dialog.locator('.is-primary').isDisabled(), true);
  await dialog.locator('input[type="checkbox"]').check();
  assert.equal(await dialog.locator('.is-primary').isDisabled(), false);
  await dialog.locator('.is-secondary').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.match(await page.locator('.ai-proposal-card').innerText(), /已拒绝/);

  await closeAssistant();
  await page.keyboard.press('Control+k');
  await page.locator('.ai-assistant-drawer').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('.ai-assistant-drawer').waitFor({ state: 'hidden' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Control+k');
  const mobileDrawer = page.locator('.ai-assistant-drawer');
  await waitForDrawerGeometry(mobileDrawer, 390, 0);
  const mobileGeometry = await mobileDrawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  assert.deepEqual(mobileGeometry, { width: 390, height: 844, top: 0, overflow: 0 });
  await page.screenshot({
    path: join(artifactsDir, 'ai-assistant-mobile.png'),
    fullPage: true
  });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('AI assistant browser integration passed');
} catch (error) {
  const debug = page
    ? await page.evaluate(() => ({
        url: location.href,
        text: document.body.innerText.slice(0, 6000),
        htmlWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
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
