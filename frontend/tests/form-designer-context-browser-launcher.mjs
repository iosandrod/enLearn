import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const configuredUrl = process.env.FORM_DESIGNER_TEST_SERVER_URL?.replace(/\/$/, '');
const port = configuredUrl ? Number(new URL(configuredUrl).port) : await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() => resolve(address.port));
  });
});
const baseUrl = configuredUrl ?? `http://127.0.0.1:${port}`;
const server = configuredUrl ? null : spawn(process.execPath, [
  process.platform === 'win32'
    ? 'C:/Program Files/nodejs/node_modules/pnpm/bin/pnpm.cjs'
    : 'pnpm',
  'exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], { cwd: frontendDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
let serverOutput = '';
server?.stdout.on('data', (chunk) => { serverOutput += chunk; });
server?.stderr.on('data', (chunk) => { serverOutput += chunk; });
let browser;
try {
  const deadline = Date.now() + 20_000;
  while (true) {
    try { if ((await fetch(baseUrl)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error(`Vite failed to start: ${serverOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const playwrightPath = join(workspaceDir, 'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js');
  const { default: playwright } = await import(pathToFileURL(playwrightPath).href);
  browser = await playwright.chromium.launch({
    executablePath: process.env.RUNTIME_FORM_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/tests/form-designer-context-browser.html`, { waitUntil: 'networkidle' });
  await page.locator('.form-designer-dialog .outline-panel').waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => window.__contextCheck()), {
    sameKey: true,
    receivedContext: true,
    isolatedNestedContext: true,
  });

  const firstDesigner = page.locator('.form-designer-dialog').first();
  assert.equal(await firstDesigner.locator('.left-aside__tabs button', { hasText: '基本组件' }).count(), 0);
  await firstDesigner.locator('.left-aside__tabs button', { hasText: '表单组件' }).click();
  await firstDesigner.locator('[data-material-card]').first().click();
  await firstDesigner.locator('.left-aside__tabs button', { hasText: '图层' }).click();
  await page.waitForFunction(() => document.querySelector('.outline-panel__header')?.textContent?.includes('1 个节点'));

  await page.evaluate(() => window.__openDesigner('第二个表单'));
  await page.waitForFunction(() => document.querySelectorAll('.form-designer-dialog').length === 2);
  await page.waitForFunction(() => [...document.querySelectorAll('.outline-panel__header')].at(-1)?.textContent?.includes('0 个节点'));
  assert.match(await firstDesigner.locator('.outline-panel__header').innerText(), /1 个节点/);
  assert.deepEqual([...errors, ...(await page.evaluate(() => window.__errors))], []);
  console.log('Form designer context survives module reloads and isolates nested designers.');
} finally {
  await browser?.close();
  if (server?.pid) {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      await new Promise((resolve) => killer.once('exit', resolve));
    } else {
      process.kill(-server.pid, 'SIGTERM');
    }
  }
}
