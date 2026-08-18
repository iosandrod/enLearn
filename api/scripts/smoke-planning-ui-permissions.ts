import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { createSupabaseClient } from '../src/common/utils/supabase';

type BrowserContext = {
  addInitScript: (fn: (...args: any[]) => unknown, arg: unknown) => Promise<void>;
  newPage: () => Promise<any>;
  close: () => Promise<void>;
};

const frontendUrl = (process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const accountId = process.env.PLANNING_UI_ACCOUNT_ID ?? '00000000-0000-4000-8000-000000000001';
const browserExecutable = process.env.PLANNING_UI_BROWSER ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function directProjectConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
  if (match && url.hostname.includes('.pooler.supabase.com')) {
    url.hostname = `db.${match[1]}.supabase.co`;
    url.port = '5432';
    url.username = 'postgres';
  }
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function waitForUrl(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function readJson(response: Response) {
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function signIn(email: string, password: string) {
  return readJson(await fetch(`${apiUrl}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, accountId }),
  }));
}

async function prepareContext(browser: any, authPayload: any): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const accessToken = authPayload?.session?.access_token;
  const refreshToken = authPayload?.session?.refresh_token;
  assert.ok(accessToken, 'A test-user access token is required.');
  await context.addInitScript(
    ({ token, refresh, activeAccountId }: Record<string, string>) => {
      window.localStorage.setItem('enlearn_access_token', token);
      if (refresh) window.localStorage.setItem('enlearn_refresh_token', refresh);
      window.localStorage.setItem('enlearn_active_account_id', activeAccountId);
      window.sessionStorage.setItem('enlearn_dev_auto_login_disabled', '1');
    },
    { token: accessToken, refresh: refreshToken, activeAccountId: accountId },
  );
  return context;
}

async function waitForPage(page: any) {
  await page.locator('.admin-shell').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.lc-page-loading-overlay').waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => undefined);
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  if (!existsSync(browserExecutable)) throw new Error(`Browser executable not found: ${browserExecutable}`);

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const artifactsDir = resolve(repoRoot, 'artifacts');
  const playwrightPath = resolve(
    repoRoot,
    'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
  );
  await mkdir(artifactsDir, { recursive: true });
  await Promise.all([
    waitForUrl(frontendUrl),
    waitForUrl(`${apiUrl}/api/auth/account-options?login=admin`),
  ]);

  const postgres = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false },
  });
  const admin = createSupabaseClient('admin');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Planning-UI-${suffix}-A9!`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  let browser: any;

  await postgres.connect();
  try {
    const permission = await postgres.query<{ id: string }>(`
      select id from public.admin_permissions
      where code = 'planning.models.view' and status = 'active'
    `);
    const viewPermissionId = permission.rows[0]?.id;
    assert.ok(viewPermissionId, 'planning.models.view is required.');

    const role = await postgres.query<{ id: string }>(`
      insert into public.admin_roles (code, name, status, sort_order, is_system)
      values ($1, 'Planning UI viewer smoke', 'active', 9998, false)
      returning id
    `, [`planning_ui_viewer_${suffix}`]);
    const viewerRoleId = role.rows[0]?.id;
    assert.ok(viewerRoleId);
    createdRoleIds.push(viewerRoleId);
    await postgres.query(`
      insert into public.admin_role_permissions (role_id, permission_id)
      values ($1, $2)
    `, [viewerRoleId, viewPermissionId]);

    async function createUser(kind: 'viewer' | 'none') {
      const email = `planning-ui-${kind}-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) throw created.error;
      const userId = created.data.user.id;
      createdUserIds.push(userId);
      await postgres.query(`
        insert into basejump.account_user (account_id, user_id, account_role)
        values ($1, $2, 'member'::basejump.account_role)
      `, [accountId, userId]);
      if (kind === 'viewer') {
        await postgres.query(`
          insert into public.admin_user_roles (user_id, role_id, account_id)
          values ($1, $2, $3)
        `, [userId, viewerRoleId, accountId]);
      }
      return { email, auth: await signIn(email, password) };
    }

    const viewer = await createUser('viewer');
    const denied = await createUser('none');
    const playwrightModule = await import(pathToFileURL(playwrightPath).href);
    browser = await playwrightModule.default.chromium.launch({
      executablePath: browserExecutable,
      headless: true,
    });

    const viewerContext = await prepareContext(browser, viewer.auth);
    try {
      const page = await viewerContext.newPage();
      const pageErrors: string[] = [];
      const failedApiResponses: string[] = [];
      page.on('pageerror', (error: Error) => pageErrors.push(error.message));
      page.on('response', (response: any) => {
        if (response.status() >= 400 && response.url().includes('/api/')) {
          failedApiResponses.push(`${response.status()} ${response.url()}`);
        }
      });
      await page.goto(`${frontendUrl}/dashboard/planning/calendar`, { waitUntil: 'domcontentloaded' });
      await waitForPage(page);
      await page.locator('.admin-menu').getByText('排产管理', { exact: true })
        .waitFor({ state: 'visible' });
      await page.locator('.lc-grid .vxe-table--header').getByText('名称', { exact: true })
        .first().waitFor({ state: 'visible' });
      const toolbarText = await page.locator('.lc-node-button-group').first().innerText();
      assert.match(toolbarText, /刷新/);
      assert.doesNotMatch(toolbarText, /新增/);
      assert.equal(await page.locator('.vxe-table--fixed-right-wrapper .vxe-button', { hasText: '编辑' }).count(), 0);
      assert.equal(await page.locator('.vxe-table--fixed-right-wrapper .vxe-button', { hasText: '删除' }).count(), 0);
      await page.screenshot({ path: resolve(artifactsDir, 'planning-viewer-readonly.png'), fullPage: true });
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(failedApiResponses, []);
    } finally {
      await viewerContext.close();
    }

    const deniedContext = await prepareContext(browser, denied.auth);
    try {
      const page = await deniedContext.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error: Error) => pageErrors.push(error.message));
      await page.goto(`${frontendUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
      await waitForPage(page);
      assert.equal(await page.locator('.admin-menu').getByText('排产管理', { exact: true }).count(), 0);
      const advancedTrigger = page.locator('.admin-tool-launcher__trigger', { hasText: '高级功能' }).first();
      if (await advancedTrigger.count()) {
        await advancedTrigger.click();
        assert.equal(
          await page.locator('.admin-tool-panel__item', { hasText: '排产控制台' }).count(),
          0,
          'A user without planning permissions must not see the planning console in Advanced tools.',
        );
        await advancedTrigger.click();
      }
      await page.screenshot({ path: resolve(artifactsDir, 'planning-no-permission-menu.png'), fullPage: true });

      const deniedResponse = page.waitForResponse(async (response: any) => {
        if (!response.url().endsWith('/api/service') || response.request().method() !== 'POST') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.serviceName === 'lowcode' && body?.serviceMethod === 'listItems' &&
            body?.postData?.tableName === 'lowcode_pages' &&
            body?.postData?.filters?.route === '/dashboard/planning/calendar';
        } catch {
          return false;
        }
      }, { timeout: 30_000 });
      await page.goto(`${frontendUrl}/dashboard/planning/calendar`, { waitUntil: 'domcontentloaded' });
      const response = await deniedResponse;
      assert.equal(response.status(), 403);
      await waitForPage(page);
      await page.getByText('Page not available', { exact: true }).waitFor({ state: 'visible' });
      assert.match(
        await page.locator('.admin-main').innerText(),
        /The requested page is not available in your navigation/,
      );
      await page.screenshot({ path: resolve(artifactsDir, 'planning-no-permission-denied.png'), fullPage: true });

      const consoleDeniedResponse = page.waitForResponse(async (consoleResponse: any) => {
        if (!consoleResponse.url().endsWith('/api/service') || consoleResponse.request().method() !== 'POST') return false;
        try {
          const body = consoleResponse.request().postDataJSON();
          return body?.serviceName === 'lowcode' && body?.serviceMethod === 'listItems' &&
            body?.postData?.tableName === 'lowcode_pages' &&
            body?.postData?.filters?.route === '/dashboard/advanced/planning-console';
        } catch {
          return false;
        }
      }, { timeout: 30_000 });
      await page.goto(`${frontendUrl}/dashboard/advanced/planning-console`, { waitUntil: 'domcontentloaded' });
      const consoleResponse = await consoleDeniedResponse;
      assert.equal(consoleResponse.status(), 403);
      await waitForPage(page);
      await page.getByText('Page not available', { exact: true }).waitFor({ state: 'visible' });
      assert.deepEqual(pageErrors, []);
    } finally {
      await deniedContext.close();
    }

    console.log(JSON.stringify({
      viewer_planning_menu: 'visible',
      viewer_create_button: 'hidden',
      viewer_edit_action: 'hidden',
      viewer_delete_action: 'hidden',
      no_permission_planning_menu: 'hidden',
      no_permission_direct_page_status: 403,
      no_permission_console_tool: 'hidden',
      no_permission_console_status: 403,
      screenshots: 3,
      cleanup: 'verified',
    }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    if (createdRoleIds.length) {
      await postgres.query('delete from public.admin_roles where id = any($1::uuid[])', [createdRoleIds])
        .catch(() => undefined);
    }
    await postgres.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
