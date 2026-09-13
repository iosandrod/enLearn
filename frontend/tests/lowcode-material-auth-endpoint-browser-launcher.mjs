import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.LOWCODE_MATERIAL_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:3301').replace(/\/$/, '');
const playwrightModule = await import(pathToFileURL(playwrightPath).href);

const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();
const dedicatedMaterialRequests = [];
const gatewayMaterialRequests = [];

page.on('request', (request) => {
  const url = new URL(request.url());
  if (url.pathname.endsWith('/api/auth/lowcode-materials')) {
    dedicatedMaterialRequests.push(request.url());
  }
  if (!url.pathname.endsWith('/api/service')) return;

  try {
    const body = request.postDataJSON();
    if (body?.postData?.resource === 'lowcode_materials') {
      gatewayMaterialRequests.push(body);
    }
  } catch {
    // Non-JSON service requests are unrelated to the material catalog.
  }
});

try {
  await page.goto(`${baseUrl}/signin`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.__LOWCODE_MATERIAL_CATALOG__?.getState?.().ready === true,
    undefined,
    { timeout: 30_000 },
  );

  const catalog = await page.evaluate(() => window.__LOWCODE_MATERIAL_CATALOG__?.getState?.());
  const loginBackgrounds = await page.evaluate(() => {
    const workspace = document.querySelector('.erp-signin__workspace');
    const form = document.querySelector('.erp-login-panel .lc-form');
    return {
      workspace: workspace ? getComputedStyle(workspace).backgroundColor : '',
      form: form ? getComputedStyle(form).backgroundColor : '',
    };
  });
  assert.equal(new URL(page.url()).pathname, '/signin');
  assert.ok((catalog?.rows?.length ?? 0) > 0, 'The public material catalog must load on sign-in.');
  assert.ok(dedicatedMaterialRequests.length > 0, 'The Auth material endpoint must be requested.');
  assert.deepEqual(gatewayMaterialRequests, [], 'Sign-in must not load materials through /api/service.');
  assert.equal(
    loginBackgrounds.form,
    loginBackgrounds.workspace,
    'The sign-in form background must match the sign-in workspace.',
  );
} finally {
  await browser.close();
}

console.log('Low-code material Auth endpoint browser test passed.');
