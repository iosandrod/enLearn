import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

const frontendUrl = (process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const browserExecutable = process.env.SALES_ORDER_UI_BROWSER ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `sales-detail-ui-${runId}@example.test`;
const password = `SalesDetailUi-${runId}-A9!`;
const docNo = `SO-DETAIL-UI-${runId}`;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(readMessage).filter(Boolean).join(' ');
  if (!isRecord(value)) return '';
  return [value.message, value.error, value.statusMessage]
    .map(readMessage)
    .filter(Boolean)
    .join(' ');
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
    throw new Error(readMessage(payload) || `${response.status} ${response.statusText}`);
  }
  return payload;
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
  throw lastError ?? new Error(`Timed out waiting for ${url}.`);
}

function servicePayload(request: { method(): string; postDataJSON(): unknown; url(): string }) {
  if (request.method() !== 'POST' || !request.url().includes('/api/service')) return null;
  try {
    const payload = request.postDataJSON();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function runtimeChanges(page: any) {
  return page.locator('.lowcode-runtime-page').first().evaluate((element: HTMLElement) => {
    type Runtime = {
      getGridChanges(blockId: string): {
        created: JsonRecord[];
        updated: JsonRecord[];
        deleted: JsonRecord[];
      };
    };
    type Component = {
      exposed?: { getSnapshot?: () => unknown };
      parent?: Component;
      setupState?: { runtime?: Runtime };
    };
    let instance = (element as HTMLElement & { __vueParentComponent?: Component })
      .__vueParentComponent;
    while (instance && typeof instance.exposed?.getSnapshot !== 'function') {
      instance = instance.parent;
    }
    const runtime = instance?.setupState?.runtime;
    if (!runtime) throw new Error('Low-code page runtime is unavailable.');
    return runtime.getGridChanges('sales-order-lines-grid');
  });
}

async function applyUiChanges(page: any) {
  return page.locator('.lowcode-runtime-page').first().evaluate((element: HTMLElement) => {
    type Runtime = {
      state: {
        sources: Record<string, unknown>;
        status: { formMode: string };
      };
      setSource(key: string, value: unknown): void;
      getGridChanges(blockId: string): {
        created: Record<string, unknown>[];
        updated: Record<string, unknown>[];
        deleted: Record<string, unknown>[];
      };
    };
    type Component = {
      exposed?: { getSnapshot?: () => unknown };
      parent?: Component;
      setupState?: { runtime?: Runtime };
    };
    let instance = (element as HTMLElement & { __vueParentComponent?: Component })
      .__vueParentComponent;
    while (instance && typeof instance.exposed?.getSnapshot !== 'function') {
      instance = instance.parent;
    }
    const runtime = instance?.setupState?.runtime;
    if (!runtime) throw new Error('Low-code page runtime is unavailable.');

    const source = runtime.state.sources.salesOrderLines;
    const rows = Array.isArray(source)
      ? source
      : source && typeof source === 'object' && Array.isArray((source as { rows?: unknown }).rows)
        ? (source as { rows: Record<string, unknown>[] }).rows
        : [];
    if (rows.length < 3) throw new Error('Sales-order detail rows were not loaded.');

    runtime.state.status.formMode = 'edit';
    rows[0].item_name = 'Updated existing row';
    rows[0]._X_ROW_KEY = 'existing-vxe-key';
    rows[0].__rowState = 'updated';

    const keptNewRow = {
      id: 'new-ui-keep',
      _X_ROW_KEY: 'new-vxe-key',
      __rowStatus: 'created',
      line_no: 4,
      item_code: 'UI-ITEM-4',
      item_name: 'Created row',
      ordered_qty: 1,
      open_qty: 1,
      unit_price: 40,
      tax_rate: 13,
    };
    runtime.setSource(
      'salesOrderLines',
      source && typeof source === 'object' && !Array.isArray(source)
        ? { ...source, rows: [...rows, keptNewRow] }
        : [...rows, keptNewRow],
    );
    keptNewRow.item_name = 'Created row edited';
    const rowsWithDeletedDraft = [...rows, keptNewRow, {
      id: 'new-ui-drop',
      line_no: 5,
      item_code: 'UI-ITEM-5',
      item_name: 'Created then deleted',
      ordered_qty: 1,
    }];
    runtime.setSource(
      'salesOrderLines',
      source && typeof source === 'object' && !Array.isArray(source)
        ? { ...source, rows: rowsWithDeletedDraft }
        : rowsWithDeletedDraft,
    );
    const finalRows = [...rows.slice(0, 2), keptNewRow];
    runtime.setSource(
      'salesOrderLines',
      source && typeof source === 'object' && !Array.isArray(source)
        ? { ...source, rows: finalRows }
        : finalRows,
    );

    return runtime.getGridChanges('sales-order-lines-grid');
  });
}

async function main() {
  await waitForUrl(frontendUrl);
  await waitForUrl(`${apiUrl}/api/auth/account-options?login=admin`);

  const admin = createSupabaseClient('admin');
  let userId = '';
  let orderId = '';
  let browser: { close(): Promise<void> } | undefined;

  try {
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createdUser.error || !createdUser.data.user) {
      throw createdUser.error ?? new Error('Could not create the UI smoke-test user.');
    }
    userId = createdUser.data.user.id;

    const accessResult = await admin.rpc('prepare_api_smoke_test_access', {
      p_user_id: userId,
      p_permission_code: 'sales.orders.manage',
    });
    if (accessResult.error) throw accessResult.error;
    const access = isRecord(accessResult.data) ? accessResult.data : {};
    const accountId = typeof access.account_id === 'string' ? access.account_id : '';
    assert.ok(accountId, 'The UI smoke-test user must have an account.');

    const auth = await readJson(await fetch(`${apiUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, accountId }),
    }));
    assert.ok(isRecord(auth));
    const session = isRecord(auth.session) ? auth.session : {};
    const accessToken = String(session.access_token ?? '');
    const refreshToken = String(session.refresh_token ?? '');
    assert.ok(accessToken, 'Sign-in must return an access token.');

    const createResult = await readJson(await fetch(`${apiUrl}/api/service`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'x-account-id': accountId,
      },
      body: JSON.stringify({
        serviceName: 'admin',
        serviceMethod: 'createItem',
        postData: {
          resource: 'sales_orders',
          data: {
            account_id: accountId,
            doc_no: docNo,
            doc_type_code: 'STD-SO',
            doc_type_name: 'Standard sales order',
            doc_date: '2026-08-13',
            business_date: '2026-08-13',
            status: 'draft',
            org_code: '001',
            org_name: 'Default organization',
            currency_code: 'CNY',
            exchange_rate: 1,
            customer_code: 'CUST-UI',
            customer_name: 'UI customer',
            __details: [{
              resource: 'sales_order_lines',
              foreignKey: 'order_id',
              inheritFields: ['account_id'],
              rows: [
                {
                  line_no: 1,
                  item_code: 'UI-ITEM-1',
                  item_name: 'Original first row',
                  ordered_qty: 2,
                  open_qty: 2,
                  unit_price: 10,
                  tax_rate: 13,
                },
                {
                  line_no: 2,
                  item_code: 'UI-ITEM-2',
                  item_name: 'Untouched second row',
                  ordered_qty: 3,
                  open_qty: 3,
                  unit_price: 20,
                  tax_rate: 13,
                },
                {
                  line_no: 3,
                  item_code: 'UI-ITEM-3',
                  item_name: 'Deleted third row',
                  ordered_qty: 4,
                  open_qty: 4,
                  unit_price: 30,
                  tax_rate: 13,
                },
              ],
            }],
          },
        },
      }),
    }));
    const createEnvelope = isRecord(createResult) ? createResult : {};
    const createdOrder = isRecord(createEnvelope.data) ? createEnvelope.data : {};
    orderId = String(createdOrder.id ?? '');
    assert.ok(orderId, 'The UI fixture order must have an id.');

    const require = createRequire(import.meta.url);
    const { chromium } = require(resolve(
      process.cwd(),
      '../mobile-app/node_modules/playwright-core',
    ));
    browser = await chromium.launch({
      executablePath: existsSync(browserExecutable) ? browserExecutable : undefined,
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addInitScript(
      ({ token, refresh, account }: Record<string, string>) => {
        window.localStorage.setItem('enlearn_access_token', token);
        window.localStorage.setItem('enlearn_refresh_token', refresh);
        window.localStorage.setItem('enlearn_active_account_id', account);
        window.sessionStorage.setItem('enlearn_dev_auto_login_disabled', '1');
      },
      { token: accessToken, refresh: refreshToken, account: accountId },
    );

    const page = await context.newPage();
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error: Error) => runtimeErrors.push(error.message));
    await page.goto(`${frontendUrl}/dashboard/sales/orders/edit?id=${orderId}`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.locator('.lowcode-runtime-page').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.lc-grid .vxe-body--row').length >= 3,
      undefined,
      { timeout: 30_000 },
    );

    assert.deepEqual(await runtimeChanges(page), {
      created: [],
      updated: [],
      deleted: [],
    });
    const beforeSave = await applyUiChanges(page);
    assert.deepEqual(beforeSave.created.map((row: JsonRecord) => row.item_code), ['UI-ITEM-4']);
    assert.deepEqual(beforeSave.updated.map((row: JsonRecord) => row.item_code), ['UI-ITEM-1']);
    assert.deepEqual(beforeSave.deleted.map((row: JsonRecord) => row.item_code), ['UI-ITEM-3']);

    const saveResponsePromise = page.waitForResponse((response: any) => {
      const payload = servicePayload(response.request());
      const postData = isRecord(payload?.postData) ? payload.postData : {};
      return payload?.serviceName === 'admin' &&
        payload.serviceMethod === 'saveItem' &&
        postData.id === orderId;
    }, { timeout: 30_000 });

    await page.locator('.lc-node-button-group .vxe-button', {
      hasText: '\u4fdd\u5b58',
    }).first().click();
    const saveResponse = await saveResponsePromise;
    assert.ok(saveResponse.ok(), `Sales-order save failed with HTTP ${saveResponse.status()}.`);

    const saveRequest = saveResponse.request();
    const payload = servicePayload(saveRequest);
    const postData = isRecord(payload?.postData) ? payload.postData : {};
    const data = isRecord(postData.data) ? postData.data : {};
    const details = Array.isArray(data.__details) ? data.__details : [];
    const detail = isRecord(details[0]) ? details[0] : {};
    const created = Array.isArray(detail.created) ? detail.created.filter(isRecord) : [];
    const updated = Array.isArray(detail.updated) ? detail.updated.filter(isRecord) : [];
    const deleted = Array.isArray(detail.deleted) ? detail.deleted : [];
    assert.equal(detail.mode, 'changes');
    assert.deepEqual(created.map((row) => row.item_code), ['UI-ITEM-4']);
    assert.deepEqual(updated.map((row) => row.item_code), ['UI-ITEM-1']);
    assert.equal(deleted.length, 1);
    assert.equal(created[0].id, undefined);
    assert.equal(created[0]._X_ROW_KEY, undefined);
    assert.equal(created[0].__rowStatus, undefined);
    assert.equal(updated[0]._X_ROW_KEY, undefined);
    assert.equal(updated[0].__rowState, undefined);

    await page.waitForFunction(() => {
      const element = document.querySelector('.lowcode-runtime-page') as (
        HTMLElement & { __vueParentComponent?: any }
      ) | null;
      let instance = element?.__vueParentComponent;
      while (instance && typeof instance.exposed?.getSnapshot !== 'function') {
        instance = instance.parent;
      }
      const runtime = instance?.setupState?.runtime;
      if (!runtime) return false;
      const changes = runtime.getGridChanges('sales-order-lines-grid');
      const rows = runtime.state.sources.salesOrderLines;
      return Array.isArray(rows) &&
        rows.length === 3 &&
        rows.some((row: Record<string, unknown>) => row.item_code === 'UI-ITEM-4') &&
        changes.created.length === 0 &&
        changes.updated.length === 0 &&
        changes.deleted.length === 0;
    }, undefined, { timeout: 30_000 });

    const changesAfterSave = await runtimeChanges(page);
    assert.deepEqual(changesAfterSave, {
      created: [],
      updated: [],
      deleted: [],
    });

    const { data: savedLines, error: savedLinesError } = await admin
      .from('sales_order_lines')
      .select('id, line_no, item_code, item_name')
      .eq('order_id', orderId)
      .order('line_no');
    if (savedLinesError) throw savedLinesError;
    assert.deepEqual(
      (savedLines ?? []).map((row) => row.item_code),
      ['UI-ITEM-1', 'UI-ITEM-2', 'UI-ITEM-4'],
    );
    assert.equal(savedLines?.[0]?.item_name, 'Updated existing row');
    assert.deepEqual(runtimeErrors, []);

    await context.close();
    console.log(JSON.stringify({
      ok: true,
      payload: {
        created: created.length,
        updated: updated.length,
        deleted: deleted.length,
      },
      changesAfterSave,
    }));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (orderId) {
      const cleanup = await admin.from('sales_orders').delete().eq('id', orderId);
      if (cleanup.error) {
        console.error(`Could not delete UI fixture order ${orderId}: ${cleanup.error.message}`);
        process.exitCode = 1;
      }
    }
    if (userId) {
      const cleanup = await admin.auth.admin.deleteUser(userId).catch((error: unknown) => ({
        data: { user: null },
        error: error instanceof Error ? error : new Error(String(error)),
      }));
      if (cleanup.error) {
        console.error(`Could not delete UI fixture user ${userId}: ${cleanup.error.message}`);
        process.exitCode = 1;
      }
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
