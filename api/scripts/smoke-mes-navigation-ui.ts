import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Client } from 'pg';

import { createSupabaseClient } from '../src/common/utils/supabase';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

type JsonRecord = Record<string, unknown>;

const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const REQUIRE_MES_GATEWAY = ['1', 'true', 'required'].includes(
  String(process.env.MES_REQUIRE_REDIS_GATEWAY ?? '').trim().toLowerCase()
);
const BROWSER_EXECUTABLE = process.env.MES_UI_BROWSER
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const MENU_TITLE = '生产管理';
const PAGE_TITLES = ['计划释放', '生产执行工作台', '生产事务', '物料追溯'];

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response) {
  const text = await response.text();
  let payload: unknown = {};
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

async function waitForUrl(url: string) {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const runId = randomUUID().slice(0, 8);
  const email = `mes-navigation-${runId}@example.test`;
  const password = `Mes-Navigation-${runId}-A9!`;
  const admin = createSupabaseClient('admin');
  const env = getEnv();
  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const database = new Client({
    connectionString: directProjectConnectionString(connectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  database.on('error', () => undefined);
  await database.connect();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'MES navigation smoke' }
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? 'Could not create MES navigation test user.');
  }
  const userId = created.data.user.id;
  let browser: { close(): Promise<void> } | undefined;

  try {
    await database.query(
      `insert into basejump.account_user (account_id, user_id, account_role)
       values ($1, $2, 'member')`,
      [ACCOUNT_ID, userId]
    );
    await database.query(
      `insert into public.admin_user_roles (account_id, user_id, role_id)
       select $1, $2, role.id from public.admin_roles role where role.code = 'system_admin'`,
      [ACCOUNT_ID, userId]
    );

    await waitForUrl(`${FRONTEND_URL}/signin`);
    await waitForUrl(`${API_URL}/api/auth/account-options?login=${encodeURIComponent(email)}`);
    const auth = await readJson(await fetch(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, accountId: ACCOUNT_ID })
    }));
    assert.ok(isRecord(auth));
    const session = isRecord(auth.session) ? auth.session : {};
    const token = String(session.access_token ?? '');
    const refreshToken = String(session.refresh_token ?? '');
    assert.ok(token);
    assert.ok(Array.isArray(auth.permissions));
    assert.ok(auth.permissions.includes('mes.execution.view'));
    assert.ok(auth.permissions.includes('mes.execution.manage'));

    const routes = await readJson(await fetch(`${API_URL}/api/service`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-account-id': ACCOUNT_ID,
        'x-request-id': `mes-nav-${runId}`
      },
      body: JSON.stringify({
        serviceName: 'admin',
        serviceMethod: 'listNavigationRoutes',
        postData: {}
      })
    }));
    const routeRows = isRecord(routes) && Array.isArray(routes.data) ? routes.data : routes;
    assert.ok(Array.isArray(routeRows));
    const routeCodes = new Set(routeRows.map((row) => isRecord(row) ? row.code : ''));
    for (const code of [
      'production-root', 'production-release', 'production-execution',
      'production-ledger', 'production-material-ledger'
    ]) assert.ok(routeCodes.has(code), `${code} must be authorized`);

    let mesGatewayVerified = false;
    if (REQUIRE_MES_GATEWAY) {
      const capabilities = await readJson(await fetch(`${API_URL}/api/service`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-account-id': ACCOUNT_ID,
          'x-request-id': `mes-capabilities-${runId}`
        },
        body: JSON.stringify({
          serviceName: 'mes',
          serviceMethod: 'getCapabilities',
          postData: {}
        })
      }));
      const capabilityData = isRecord(capabilities) && isRecord(capabilities.data)
        ? capabilities.data
        : capabilities;
      assert.ok(isRecord(capabilityData));
      assert.equal(capabilityData.canView, true);
      assert.equal(capabilityData.commandModel, 'versioned-idempotent');
      mesGatewayVerified = true;
    }

    const require = createRequire(import.meta.url);
    const { chromium } = require(resolve(
      process.cwd().toLowerCase().endsWith('api') ? process.cwd() : resolve(process.cwd(), 'api'),
      '../mobile-app/node_modules/playwright-core'
    ));
    browser = await chromium.launch({
      executablePath: existsSync(BROWSER_EXECUTABLE) ? BROWSER_EXECUTABLE : undefined,
      headless: true
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ accessToken, refresh, accountId }) => {
      window.localStorage.setItem('enlearn_access_token', accessToken);
      window.localStorage.setItem('enlearn_refresh_token', refresh);
      window.localStorage.setItem('enlearn_active_account_id', accountId);
      window.sessionStorage.setItem('enlearn_dev_auto_login_disabled', '1');
    }, { accessToken: token, refresh: refreshToken, accountId: ACCOUNT_ID });
    const page = await context.newPage();
    const runtimeErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/api/')) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(`${FRONTEND_URL}/dashboard/production/release`, { waitUntil: 'networkidle' });
    const productionMenu = page.getByText(MENU_TITLE, { exact: true }).first();
    await productionMenu.waitFor({ state: 'visible' });
    const executionMenu = page.getByRole('link', {
      name: '生产执行工作台',
      exact: true
    });
    if (!await executionMenu.isVisible()) await productionMenu.click();
    for (const title of PAGE_TITLES) {
      await page.getByText(title, { exact: true }).first().waitFor({ state: 'visible' });
    }
    await executionMenu.click();
    await page.waitForURL(/\/dashboard\/production\/execution/);
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(failedResponses, []);
    await context.close();

    console.log(JSON.stringify({
      menu: MENU_TITLE,
      pages: PAGE_TITLES,
      authorizedRoutes: 5,
      mesGatewayVerified,
      browserVerified: true
    }));
  } finally {
    await browser?.close().catch(() => undefined);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    await database.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
