import assert from 'node:assert/strict';

import { getPostgresPool } from '../src/common/utils/database';
import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

const apiUrl = (process.env.API_URL ?? 'http://localhost:3002').replace(/\/$/, '');
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `sales-transaction-${runId}@example.test`;
const password = `SalesTx-${runId}-A9!`;
const failedDocNo = `SO-ROLLBACK-${runId}`;
const successDocNo = `SO-SUCCESS-${runId}`;

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

async function postJson(path: string, body: JsonRecord, accessToken?: string) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  return { response, payload };
}

function buildLines(failThirdLine: boolean, itemPrefix = 'ITEM') {
  return [
    {
      line_no: 1,
      item_code: `${itemPrefix}-001`,
      item_name: 'English Starter Pack',
      uom_code: 'SET',
      uom_name: 'Set',
      ordered_qty: 2,
      open_qty: 2,
      unit_price: 100,
      tax_rate: 13,
      tax_exclusive_amount: 200,
      tax_amount: 26,
      tax_inclusive_amount: 226
    },
    {
      line_no: 2,
      item_code: `${itemPrefix}-002`,
      item_name: 'Speaking Practice Card',
      uom_code: 'BOX',
      uom_name: 'Box',
      ordered_qty: 1,
      open_qty: 1,
      unit_price: 300,
      tax_rate: 13,
      tax_exclusive_amount: 300,
      tax_amount: 39,
      tax_inclusive_amount: 339
    },
    {
      line_no: failThirdLine ? 0 : 3,
      item_code: `${itemPrefix}-003`,
      item_name: 'Listening Course License',
      uom_code: 'EA',
      uom_name: 'Each',
      ordered_qty: 5,
      open_qty: 5,
      unit_price: 60,
      tax_rate: 13,
      tax_exclusive_amount: 300,
      tax_amount: 39,
      tax_inclusive_amount: 339
    }
  ];
}

function buildFrontendRequest(
  accountId: string,
  docNo: string,
  failThirdLine: boolean
): JsonRecord {
  return {
    serviceName: 'admin',
    serviceMethod: 'createItem',
    postData: {
      resource: 'salesOrders',
      data: {
        account_id: accountId,
        doc_no: docNo,
        doc_date: new Date().toISOString().slice(0, 10),
        customer_code: 'CUST-001',
        customer_name: 'Transaction Demo Customer',
        currency_code: 'CNY',
        total_qty: 8,
        tax_exclusive_amount: 800,
        tax_amount: 104,
        tax_inclusive_amount: 904,
        total_amount: 904,
        remark: failThirdLine
          ? 'The third detail violates line_no > 0 and must roll back.'
          : 'One sales order with three detail rows.',
        __details: [
          {
            resource: 'salesOrderLines',
            foreignKey: 'order_id',
            inheritFields: ['account_id'],
            rows: buildLines(failThirdLine)
          }
        ]
      }
    }
  };
}

function buildUpdateRequest(orderId: string, failThirdLine: boolean): JsonRecord {
  return {
    serviceName: 'admin',
    serviceMethod: 'updateItem',
    postData: {
      resource: 'salesOrders',
      id: orderId,
      data: {
        total_qty: 6,
        remark: failThirdLine
          ? 'This parent update must be rolled back.'
          : 'Parent and three replacement details committed.',
        __details: [
          {
            resource: 'salesOrderLines',
            mode: 'replace',
            foreignKey: 'order_id',
            inheritFields: ['account_id'],
            rows: buildLines(failThirdLine, 'UPDATED-ITEM')
          }
        ]
      }
    }
  };
}

async function readOrderCounts(docNo: string) {
  const result = await getPostgresPool().query<{
    order_count: number;
    line_count: number;
  }>(
    `
      select
        count(distinct orders.id)::int as order_count,
        count(lines.id)::int as line_count
      from public.sales_orders orders
      left join public.sales_order_lines lines on lines.order_id = orders.id
      where orders.doc_no = $1
    `,
    [docNo]
  );
  return result.rows[0];
}

async function readOrderState(docNo: string) {
  const orderResult = await getPostgresPool().query<{
    id: string;
    remark: string | null;
    total_qty: string;
    updated_at: Date;
  }>(
    `
      select id, remark, total_qty, updated_at
      from public.sales_orders
      where doc_no = $1
    `,
    [docNo]
  );
  const order = orderResult.rows[0];
  assert.ok(order, `Sales order ${docNo} must exist.`);

  const linesResult = await getPostgresPool().query<{
    id: string;
    line_no: number;
    item_code: string;
  }>(
    `
      select lines.id, lines.line_no, lines.item_code
      from public.sales_order_lines lines
      where lines.order_id = $1
      order by lines.line_no
    `,
    [order.id]
  );

  return {
    id: order.id,
    remark: order.remark,
    totalQty: Number(order.total_qty),
    updatedAt: order.updated_at.toISOString(),
    lines: linesResult.rows
  };
}

async function main() {
  const pool = getPostgresPool();
  const supabaseAdmin = createSupabaseClient('admin');
  let userId = '';

  const tableCheck = await pool.query<{
    orders_table: string | null;
    lines_table: string | null;
  }>(
    `select
      to_regclass('public.sales_orders')::text as orders_table,
      to_regclass('public.sales_order_lines')::text as lines_table`
  );
  assert.equal(tableCheck.rows[0]?.orders_table, 'sales_orders');
  assert.equal(tableCheck.rows[0]?.lines_table, 'sales_order_lines');

  try {
    const { data: createdUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? 'Could not create the smoke-test user.');
    }
    userId = createdUser.user.id;

    await pool.query(
      `
        insert into public.admin_user_roles (user_id, role_id)
        select $1, roles.id
        from public.admin_roles roles
        where roles.code = 'system_admin'
        on conflict (user_id, role_id) do nothing
      `,
      [userId]
    );

    const permissionCheck = await pool.query<{ permission_count: number }>(
      `
        select count(1)::int as permission_count
        from public.admin_user_roles user_roles
        join public.admin_role_permissions role_permissions
          on role_permissions.role_id = user_roles.role_id
        join public.admin_permissions permissions
          on permissions.id = role_permissions.permission_id
        where user_roles.user_id = $1
          and permissions.code = 'sales.orders.manage'
      `,
      [userId]
    );
    assert.equal(permissionCheck.rows[0]?.permission_count, 1);

    const accountCheck = await pool.query<{ account_id: string }>(
      `
        select account_id
        from basejump.account_user
        where user_id = $1
        order by created_at
        limit 1
      `,
      [userId]
    );
    const accountId = accountCheck.rows[0]?.account_id;
    assert.ok(accountId, 'The smoke-test user must have a Basejump account.');

    const signIn = await postJson('/api/auth/signin', { email, password });
    if (!signIn.response.ok || !isRecord(signIn.payload)) {
      throw new Error(readMessage(signIn.payload) || 'Could not sign in the smoke-test user.');
    }
    const session = isRecord(signIn.payload.session) ? signIn.payload.session : {};
    const accessToken = typeof session.access_token === 'string' ? session.access_token : '';
    assert.ok(accessToken, 'Sign-in response must include an access token.');

    const failedRequest = buildFrontendRequest(accountId, failedDocNo, true);
    console.log('\n[frontend request: expected rollback]');
    console.log(JSON.stringify(failedRequest, null, 2));

    const failedResponse = await postJson('/api/service', failedRequest, accessToken);
    assert.equal(failedResponse.response.ok, false, 'The invalid detail request must fail.');
    const failureMessage = readMessage(failedResponse.payload);
    assert.match(failureMessage, /line_no|sales_order_lines_line_no_check/i);
    const failedCounts = await readOrderCounts(failedDocNo);
    assert.deepEqual(failedCounts, { order_count: 0, line_count: 0 });
    console.log('[rollback verified]', JSON.stringify(failedCounts));

    const successRequest = buildFrontendRequest(accountId, successDocNo, false);
    console.log('\n[frontend request: expected commit]');
    console.log(JSON.stringify(successRequest, null, 2));

    const successResponse = await postJson('/api/service', successRequest, accessToken);
    if (!successResponse.response.ok) {
      throw new Error(readMessage(successResponse.payload) || 'The valid request failed.');
    }
    assert.ok(isRecord(successResponse.payload));
    assert.equal(successResponse.payload.success, true);
    const createdOrder = isRecord(successResponse.payload.data)
      ? successResponse.payload.data
      : {};
    assert.equal(createdOrder.doc_no, successDocNo);
    const successCounts = await readOrderCounts(successDocNo);
    assert.deepEqual(successCounts, { order_count: 1, line_count: 3 });
    console.log('[commit verified]', JSON.stringify(successCounts));

    const initialState = await readOrderState(successDocNo);
    const failedUpdateRequest = buildUpdateRequest(initialState.id, true);
    console.log('\n[frontend update request: expected rollback]');
    console.log(JSON.stringify(failedUpdateRequest, null, 2));

    const failedUpdateResponse = await postJson(
      '/api/service',
      failedUpdateRequest,
      accessToken
    );
    assert.equal(
      failedUpdateResponse.response.ok,
      false,
      'The invalid replacement detail request must fail.'
    );
    assert.match(
      readMessage(failedUpdateResponse.payload),
      /line_no|sales_order_lines_line_no_check/i
    );
    const rolledBackUpdateState = await readOrderState(successDocNo);
    assert.deepEqual(rolledBackUpdateState, initialState);
    console.log(
      '[update rollback verified]',
      JSON.stringify({
        remark: rolledBackUpdateState.remark,
        lineCount: rolledBackUpdateState.lines.length,
        itemCodes: rolledBackUpdateState.lines.map((line) => line.item_code)
      })
    );

    const successfulUpdateRequest = buildUpdateRequest(initialState.id, false);
    console.log('\n[frontend update request: expected commit]');
    console.log(JSON.stringify(successfulUpdateRequest, null, 2));

    const successfulUpdateResponse = await postJson(
      '/api/service',
      successfulUpdateRequest,
      accessToken
    );
    if (!successfulUpdateResponse.response.ok) {
      throw new Error(
        readMessage(successfulUpdateResponse.payload) || 'The valid update request failed.'
      );
    }
    const updatedState = await readOrderState(successDocNo);
    assert.equal(updatedState.remark, 'Parent and three replacement details committed.');
    assert.equal(updatedState.totalQty, 6);
    assert.deepEqual(
      updatedState.lines.map((line) => line.item_code),
      ['UPDATED-ITEM-001', 'UPDATED-ITEM-002', 'UPDATED-ITEM-003']
    );
    assert.equal(updatedState.lines.length, 3);
    console.log(
      '[update commit verified]',
      JSON.stringify({
        remark: updatedState.remark,
        lineCount: updatedState.lines.length,
        itemCodes: updatedState.lines.map((line) => line.item_code)
      })
    );
    console.log('\nSales order transaction smoke test passed.');
  } finally {
    await pool.query(
      `delete from public.sales_orders where doc_no = any($1::text[])`,
      [[failedDocNo, successDocNo]]
    ).catch(() => undefined);

    if (userId) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('\nSales order transaction smoke test failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
