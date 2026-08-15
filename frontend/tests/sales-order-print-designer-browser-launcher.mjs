import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.SALES_ORDER_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';
const artifactPath = join(workspaceDir, 'artifacts', 'sales-order-print-designer-dialog.png');
const playwrightModule = await import(pathToFileURL(playwrightPath).href);

await mkdir(join(workspaceDir, 'artifacts'), { recursive: true });
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
    consoleErrors.push(message.text());
  }
});

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

  await page.goto(`${baseUrl}/dashboard/sales/orders`, { waitUntil: 'domcontentloaded' });
  const runtimePage = page.locator('.lowcode-runtime-page');
  await runtimePage.waitFor({ state: 'visible', timeout: 30_000 });

  const printButton = runtimePage.locator('button[name="print"]');
  await printButton.waitFor({ state: 'visible', timeout: 30_000 });
  await printButton.click();

  const dialog = page.locator('.print-designer-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });
  await dialog.locator('.print-designer-page').waitFor({ state: 'visible', timeout: 30_000 });
  await dialog.locator('.print-canvas-shell .app-shell').waitFor({ state: 'visible', timeout: 30_000 });

  assert.equal(await dialog.getByRole('button', { name: '加载模板', exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('button', { name: '新建模板', exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('button', { name: '保存模板', exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('button', { name: '另存模板', exact: true }).count(), 1);
  assert.equal(await dialog.locator('.lc-global-dialog__body > .print-designer-page').count(), 1);

  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const canvas = element.querySelector('.print-canvas-shell')?.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      canvasWidth: Math.round(canvas?.width ?? 0),
      canvasHeight: Math.round(canvas?.height ?? 0),
    };
  });
  assert.ok(geometry.width >= 1400, JSON.stringify(geometry));
  assert.ok(geometry.height >= 850, JSON.stringify(geometry));
  assert.ok(geometry.canvasWidth >= 1300, JSON.stringify(geometry));
  assert.ok(geometry.canvasHeight >= 700, JSON.stringify(geometry));

  await page.screenshot({ path: artifactPath, fullPage: true });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ ok: true, geometry, artifactPath }));
} finally {
  await context.close();
  await browser.close();
}
