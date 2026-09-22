import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.PRINT_ACCOUNT_SETTING_BROWSER
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = (process.argv[2] || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';
const screenshotDir = join(workspaceDir, '.codex-screenshots');
const playwrightModule = await import(pathToFileURL(playwrightPath).href);

await mkdir(screenshotDir, { recursive: true });

const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

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

  await page.goto(`${baseUrl}/print-account-setting`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '账号设置', exact: true }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await page.locator('[data-lc-field="fullName"] input').waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await page.locator('[data-lc-field="email"] input').waitFor({
    state: 'visible',
    timeout: 30_000,
  });

  assert.equal(
    await page.locator('.print-app-context strong').innerText(),
    '账号设置',
  );
  assert.equal(await page.getByRole('button', { name: '保存设置' }).isVisible(), true);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'The desktop account setting page must not overflow horizontally.',
  );
  await page.screenshot({
    path: join(screenshotDir, 'print-account-setting-desktop.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'The mobile account setting page must not overflow horizontally.',
  );
  await page.screenshot({
    path: join(screenshotDir, 'print-account-setting-mobile.png'),
    fullPage: true,
  });

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    ok: true,
    route: page.url(),
    screenshots: [
      'print-account-setting-desktop.png',
      'print-account-setting-mobile.png',
    ],
  }));
} finally {
  await context.close();
  await browser.close();
}
