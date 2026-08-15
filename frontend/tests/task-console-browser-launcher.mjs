import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.TASK_CONSOLE_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js'
);
const baseUrl = (process.env.TASK_CONSOLE_TEST_SERVER_URL || 'http://localhost:3000')
  .replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';

const playwrightModule = await import(pathToFileURL(playwrightPath).href);
let browser;
let context;
let page;
const pageErrors = [];
const consoleErrors = [];

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
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ accessToken, refreshToken, accountId: selectedAccountId }) => {
    localStorage.setItem('enlearn_access_token', accessToken);
    localStorage.setItem('enlearn_refresh_token', refreshToken);
    localStorage.setItem('enlearn_active_account_id', selectedAccountId);
  }, {
    accessToken: auth.session.access_token,
    refreshToken: auth.session.refresh_token,
    accountId
  });

  await page.goto(`${baseUrl}/dashboard/task/console`, { waitUntil: 'domcontentloaded' });
  await page.getByText('任务总控', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.task-console-list-item').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.task-console-detail__body').waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await page.locator('body').innerText(), /Trigger\.dev 部分状态不可用/);
  assert.match(await page.locator('body').innerText(), /workflow\.trigger-workflow\.run/);
  assert.equal(await page.locator('.task-console-metrics article').count(), 6);

  await page.screenshot({
    path: join(workspaceDir, 'artifacts/task-console-desktop.png'),
    fullPage: true
  });

  const desktopOverflow = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    topbar: document.querySelector('.admin-topbar')?.scrollWidth -
      document.querySelector('.admin-topbar')?.clientWidth,
    page: document.querySelector('.task-console-page')?.scrollWidth -
      document.querySelector('.task-console-page')?.clientWidth
  }));
  assert.equal(desktopOverflow.body, 0);
  assert.ok((desktopOverflow.topbar ?? 0) <= 1);
  assert.ok((desktopOverflow.page ?? 0) <= 1);

  await page.setViewportSize({ width: 700, height: 920 });
  await page.waitForTimeout(500);
  await page.locator('.task-console-page').waitFor({ state: 'visible' });
  const mobileWorkspaceLayout = await page.locator('.task-console-workspace').evaluate(
    (element) => ({
      display: getComputedStyle(element).display,
      flexDirection: getComputedStyle(element).flexDirection
    })
  );
  assert.deepEqual(mobileWorkspaceLayout, { display: 'flex', flexDirection: 'column' });
  const mobileOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(mobileOverflow <= 1);
  await page.screenshot({
    path: join(workspaceDir, 'artifacts/task-console-mobile.png'),
    fullPage: true
  });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('task console browser integration passed');
} catch (error) {
  const debug = page
    ? await page.evaluate(() => ({
        url: location.href,
        text: document.body.innerText.slice(0, 5000),
        htmlWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`
  );
} finally {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
}
