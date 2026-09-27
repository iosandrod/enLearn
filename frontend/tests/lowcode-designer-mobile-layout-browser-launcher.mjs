import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.LOWCODE_DESIGNER_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const baseUrl = (process.env.LOWCODE_DESIGNER_TEST_SERVER_URL || 'http://127.0.0.1:5173')
  .replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';
const artifactsDir = join(workspaceDir, 'artifacts');

await mkdir(artifactsDir, { recursive: true });
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 442, height: 828 } });
const page = await context.newPage();

function roundedBox(box) {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

try {
  const authResponse = await page.request.post(`${baseUrl}/api/auth/signin`, {
    data: { email: 'admin', password: '123456', accountId },
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
    selectedAccountId: accountId,
  });

  await page.goto(`${baseUrl}/dashboard/low-code/designer`, { waitUntil: 'networkidle' });
  await page.locator('.visual-designer-layout.is-mobile-designer').waitFor({
    state: 'visible',
    timeout: 30_000,
  });

  const shellMenu = page.locator('#admin-mobile-navigation');
  const shellMenuState = await shellMenu.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      right: Math.round(box.right),
      visibility: style.visibility,
    };
  });
  assert.ok(shellMenuState.right <= 0, 'the application navigation must stay outside the viewport');
  assert.equal(shellMenuState.visibility, 'hidden');

  const menuToggle = page.locator('.visual-designer-drawer__toggle');
  await menuToggle.click();
  const menuPanel = page.locator('.visual-designer-drawer__panel');
  await menuPanel.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const element = document.querySelector('.visual-designer-drawer__panel');
    if (!(element instanceof HTMLElement)) return false;
    const box = element.getBoundingClientRect();
    return Math.abs(box.bottom - innerHeight) < 1 && getComputedStyle(element).visibility === 'visible';
  });
  const menuBox = roundedBox(await menuPanel.boundingBox());
  assert.equal(menuBox.x, 0);
  assert.equal(menuBox.width, 442);
  assert.equal(menuBox.y + menuBox.height, 828);
  assert.ok(menuBox.y > 300, 'the page menu must open from the bottom half of the viewport');

  await page.screenshot({
    path: join(artifactsDir, 'lowcode-designer-mobile-page-menu.png'),
  });

  await menuToggle.click();
  await page.waitForFunction(() => {
    const element = document.querySelector('.visual-designer-drawer__panel');
    return element instanceof HTMLElement && getComputedStyle(element).visibility === 'hidden';
  });
  const componentToggle = page.locator('.visual-editor-mobile-panel-toggle');
  await componentToggle.click();
  const componentPanel = page.locator('.visual-editor-sidebar');
  await page.waitForFunction(() => {
    const element = document.querySelector('.visual-editor-sidebar');
    if (!(element instanceof HTMLElement)) return false;
    const box = element.getBoundingClientRect();
    return element.classList.contains('is-mobile-open') && Math.abs(box.bottom - innerHeight) < 1;
  });
  const componentBox = roundedBox(await componentPanel.boundingBox());
  assert.equal(componentBox.x, 0);
  assert.equal(componentBox.width, 442);
  assert.equal(componentBox.y + componentBox.height, 828);
  assert.ok(componentBox.y > 300, 'the component panel must open from the bottom half of the viewport');

  const toolbarBox = roundedBox(await page.locator('.visual-editor-header').boundingBox());
  assert.ok(toolbarBox.height <= 40, 'the mobile toolbar should stay compact');

  await page.screenshot({
    path: join(artifactsDir, 'lowcode-designer-mobile-components.png'),
  });

  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    0,
  );
  console.log(JSON.stringify({ menuBox, componentBox, toolbarBox }));
} finally {
  await context.close();
  await browser.close();
}
