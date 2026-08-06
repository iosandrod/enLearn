import assert from 'node:assert/strict';

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

async function postJsonWithAccount(
  path: string,
  body: JsonRecord,
  accessToken: string,
  accountId: string
) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'x-account-id': accountId
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
      resource: 'sales_orders',
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
            resource: 'sales_order_lines',
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
      resource: 'sales_orders',
      id: orderId,
      data: {
        total_qty: 6,
        remark: failThirdLine
          ? 'This parent update must be rolled back.'
          : 'Parent and three replacement details committed.',
        __details: [
          {
            resource: 'sales_order_lines',
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
  const admin = createSupabaseClient('admin');
  const { data: orders, error: orderError } = await admin
    .from('sales_orders')
    .select('id')
    .eq('doc_no', docNo);
  if (orderError) throw new Error(orderError.message);
  const orderIds = (orders ?? []).map((order) => String(order.id));
  if (!orderIds.length) return { order_count: 0, line_count: 0 };
  const { count: lineCount, error: lineError } = await admin
    .from('sales_order_lines')
    .select('id', { count: 'exact', head: true })
    .in('order_id', orderIds);
  if (lineError) throw new Error(lineError.message);
  return { order_count: orderIds.length, line_count: lineCount ?? 0 };
}

async function readOrderState(docNo: string) {
  const admin = createSupabaseClient('admin');
  const { data: order, error: orderError } = await admin
    .from('sales_orders')
    .select('id, remark, total_qty, updated_at')
    .eq('doc_no', docNo)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  assert.ok(order, `Sales order ${docNo} must exist.`);

  const { data: lines, error: linesError } = await admin
    .from('sales_order_lines')
    .select('id, line_no, item_code')
    .eq('order_id', order.id)
    .order('line_no');
  if (linesError) throw new Error(linesError.message);

  return {
    id: order.id,
    remark: order.remark,
    totalQty: Number(order.total_qty),
    updatedAt: String(order.updated_at),
    lines: lines ?? []
  };
}

async function main() {
  const supabaseAdmin = createSupabaseClient('admin');
  let userId = '';

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

    const accessResult = await supabaseAdmin.rpc('prepare_api_smoke_test_access', {
      p_user_id: userId,
      p_permission_code: 'sales.orders.manage'
    });
    if (accessResult.error) throw new Error(accessResult.error.message);
    const access = isRecord(accessResult.data) ? accessResult.data : {};
    const accountId = typeof access.account_id === 'string' ? access.account_id : '';
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

    const failedResponse = await postJsonWithAccount('/api/service', failedRequest, accessToken, accountId);
    assert.equal(failedResponse.response.ok, false, 'The invalid detail request must fail.');
    const failureMessage = readMessage(failedResponse.payload);
    assert.match(failureMessage, /line_no|sales_order_lines_line_no_check/i);
    const failedCounts = await readOrderCounts(failedDocNo);
    assert.deepEqual(failedCounts, { order_count: 0, line_count: 0 });
    console.log('[rollback verified]', JSON.stringify(failedCounts));

    const successRequest = buildFrontendRequest(accountId, successDocNo, false);
    console.log('\n[frontend request: expected commit]');
    console.log(JSON.stringify(successRequest, null, 2));

    const successResponse = await postJsonWithAccount('/api/service', successRequest, accessToken, accountId);
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

    const failedUpdateResponse = await postJsonWithAccount(
      '/api/service',
      failedUpdateRequest,
      accessToken,
      accountId
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

    const successfulUpdateResponse = await postJsonWithAccount(
      '/api/service',
      successfulUpdateRequest,
      accessToken,
      accountId
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
    await Promise.resolve(
      supabaseAdmin
        .from('sales_orders')
        .delete()
        .in('doc_no', [failedDocNo, successDocNo])
    ).catch(() => undefined);

    if (userId) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error('\nSales order transaction smoke test failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
