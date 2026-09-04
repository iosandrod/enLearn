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
const baseUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';
const playwrightModule = await import(pathToFileURL(playwrightPath).href);

const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const vueFlowWarnings = [];
const failedRequests = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
    consoleErrors.push(message.text());
  }
  if (message.text().includes('[Vue Flow]')) {
    vueFlowWarnings.push(message.text());
  }
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
});

try {
  const authResponse = await page.request.post(`${baseUrl}/api/auth/signin`, {
    data: { email: 'admin', password: '123456', accountId },
  });
  assert.equal(authResponse.ok(), true, await authResponse.text());
  const auth = await authResponse.json();
  // The signin endpoint may abort its response after issuing the session;
  // only runtime navigation requests are part of this regression assertion.
  failedRequests.length = 0;

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

  await page.goto(`${baseUrl}/dashboard/sales/orders/edit`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.__LOWCODE_MATERIAL_CATALOG__?.getState?.().ready === true,
    undefined,
    { timeout: 30_000 },
  );

  const result = await page.evaluate(() => {
    const bridge = window.__LOWCODE_MATERIAL_CATALOG__;
    const state = bridge?.getState?.();
    const scopedRows = (state?.rows ?? []).filter((row) => /<style[^>]*scoped/i.test(row.source_text));
    const styleIds = new Set(
      [...document.querySelectorAll('style[data-lowcode-material-style]')]
        .map((style) => style.getAttribute('data-lowcode-material-style')),
    );
    const scopedChecks = scopedRows.map((row) => {
      const hash = row.source_hash.slice(0, 12);
      const style = document.querySelector(`style[data-lowcode-material-style="${row.source_hash}"]`);
      return {
        code: row.code,
        hasStyleTag: styleIds.has(row.source_hash),
        hasScopeSelector: style?.textContent?.includes(`data-v-lc-${hash}`) ?? false,
      };
    });
    return {
      ready: state?.ready,
      rows: state?.rows?.length ?? 0,
      compiled: state?.compiled ?? 0,
      errors: state?.errors ?? [],
      scopedChecks,
      formTabs: document.querySelectorAll('.lc-form-tabs').length,
      fields: document.querySelectorAll('.lc-field').length,
      tables: document.querySelectorAll('table').length,
    };
  });

  assert.equal(result.ready, true);
  assert.equal(result.rows, 35);
  assert.equal(result.compiled, 35);
  assert.deepEqual(result.errors, []);
  assert.ok(result.formTabs >= 1, 'Sales-order edit page must render its form tabs.');
  assert.ok(result.fields >= 14, 'Sales-order edit page must render dynamic form fields.');
  assert.ok(result.tables >= 4, 'Sales-order edit page must render detail tables.');
  assert.ok(result.scopedChecks.length > 0, 'At least one database SFC must exercise scoped CSS.');
  assert.ok(result.scopedChecks.every((check) => check.hasStyleTag && check.hasScopeSelector), JSON.stringify(result.scopedChecks));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(vueFlowWarnings, []);
  assert.deepEqual(
    failedRequests.filter((request) => !request.includes('/api/auth/signin')),
    [],
  );

  // The planning flow is a database-backed SFC with a fragment root and an
  // external Vue Flow edge component.  Exercise the real browser layout so a
  // zero-height canvas or an unregistered edge type cannot regress silently.
  await page.goto(`${baseUrl}/dashboard/advanced/planning-console`, { waitUntil: 'networkidle' });
  await page.locator('.vxe-tabs-header--item').filter({ hasText: '工艺路线' }).click();
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('.lc-planning-flow__canvas');
      return Boolean(canvas && canvas.getBoundingClientRect().height > 0 &&
        document.querySelectorAll('.vue-flow__node').length > 0);
    },
    undefined,
    { timeout: 30_000 },
  );
  const planning = await page.evaluate(() => {
    const flow = document.querySelector('.lc-planning-flow');
    const canvas = document.querySelector('.lc-planning-flow__canvas');
    return {
      flowHeight: flow?.getBoundingClientRect().height ?? 0,
      canvasHeight: canvas?.getBoundingClientRect().height ?? 0,
      nodes: document.querySelectorAll('.vue-flow__node').length,
      edges: document.querySelectorAll('.vue-flow__edge').length,
      hasScopeAttribute: flow
        ? [...flow.attributes].some((attribute) => attribute.name.startsWith('data-v-lc-'))
        : false,
    };
  });
  assert.ok(planning.flowHeight >= 500, JSON.stringify(planning));
  assert.ok(planning.canvasHeight >= 300, JSON.stringify(planning));
  assert.ok(planning.nodes >= 3, JSON.stringify(planning));
  assert.ok(planning.edges >= 2, JSON.stringify(planning));
  assert.equal(planning.hasScopeAttribute, true, JSON.stringify(planning));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(vueFlowWarnings, []);
  assert.deepEqual(
    failedRequests.filter((request) => !request.includes('/api/auth/signin')),
    [],
  );

  await page.goto(`${baseUrl}/dashboard/planning/route-designer`, { waitUntil: 'networkidle' });
  const routePicker = page.locator('input[placeholder="请选择工艺路线"]');
  await routePicker.click();
  await page.locator('.vxe-select-option').filter({ hasText: 'RT-PCBA-100' }).click();
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('.lc-planning-flow__canvas');
      return Boolean(canvas && canvas.getBoundingClientRect().height > 0 &&
        document.querySelectorAll('.vue-flow__node').length > 0);
    },
    undefined,
    { timeout: 30_000 },
  );
  const routeDesigner = await page.evaluate(() => {
    const flow = document.querySelector('.lc-planning-flow');
    const canvas = document.querySelector('.lc-planning-flow__canvas');
    return {
      flowHeight: flow?.getBoundingClientRect().height ?? 0,
      canvasHeight: canvas?.getBoundingClientRect().height ?? 0,
      nodes: document.querySelectorAll('.vue-flow__node').length,
      edges: document.querySelectorAll('.vue-flow__edge').length,
      selectedRoute: document.body.innerText.includes('OP-PCBA-010-PRINT'),
    };
  });
  assert.ok(routeDesigner.flowHeight >= 500, JSON.stringify(routeDesigner));
  assert.ok(routeDesigner.canvasHeight >= 300, JSON.stringify(routeDesigner));
  assert.ok(routeDesigner.nodes >= 3, JSON.stringify(routeDesigner));
  assert.ok(routeDesigner.edges >= 2, JSON.stringify(routeDesigner));
  assert.equal(routeDesigner.selectedRoute, true, JSON.stringify(routeDesigner));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(vueFlowWarnings, []);
  assert.deepEqual(
    failedRequests.filter((request) => !request.includes('/api/auth/signin')),
    [],
  );

  console.log(JSON.stringify({
    ok: true,
    rows: result.rows,
    compiled: result.compiled,
    formTabs: result.formTabs,
    fields: result.fields,
    tables: result.tables,
    planningFlow: planning,
    routeDesignerFlow: routeDesigner,
    scopedMaterials: result.scopedChecks.map((check) => check.code),
  }));
} finally {
  await context.close();
  await browser.close();
}
