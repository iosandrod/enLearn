import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL(
    '../../supabase/migrations/20260812120000_sales_order_edit_save_details.sql',
    import.meta.url,
  ),
  'utf8',
);

function extractScript(variableName) {
  const match = migration.match(
    new RegExp(`${variableName}\\s+text\\s*:=\\s*\\$script\\$([\\s\\S]*?)\\$script\\$;`),
  );
  assert.ok(match, `Migration must define ${variableName}.`);
  return match[1];
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function executeScript(script, context) {
  const execute = new AsyncFunction(
    `"use strict";\n${script}\nreturn typeof main === "function" ? main.call(this) : undefined;`,
  );
  return execute.call(context);
}

function createSaveContext({ formValid = true, detailValid = true, creating = false } = {}) {
  const calls = [];
  const form = {
    id: creating ? '' : 'order-1',
    doc_no: 'SO-001',
    doc_date: '2026-08-12',
    business_date: '',
    customer_code: 'CUST-001',
    total_qty: 2,
    metadata: { source: 'test' },
    account_id: 'must-not-leak',
    unexpected_header: 'must-not-leak',
  };
  const rows = [
    {
      id: 'line-1',
      order_id: 'order-1',
      account_id: 'account-1',
      line_no: '1',
      item_code: 'ITEM-001',
      item_name: 'Test item',
      ordered_qty: '2',
      unit_price: '10.5',
      need_date: '',
      metadata: {},
      created_at: 'must-not-leak',
      unexpected_detail: 'must-not-leak',
    },
  ];

  const context = {
    page: { route: '/dashboard/sales/orders/edit' },
    route: {
      query: creating ? { from: 'list' } : { id: 'order-1' },
    },
    grids: {
      'sales-order-lines-grid': { rows },
    },
    data: {
      salesOrderLines: rows,
    },
    async executeAction(options) {
      calls.push({ type: 'action', options: structuredClone(options) });
      if (options.node === 'sales-order-edit-form' && options.method === 'validate') {
        return formValid;
      }
      if (options.node === 'sales-order-lines-grid' && options.method === 'validate') {
        return detailValid;
      }
      if (options.node === 'sales-order-edit-form' && options.method === 'getData') {
        return structuredClone(form);
      }
      if (options.node === 'sales-order-lines-grid' && options.method === 'loadData') {
        return rows;
      }
      throw new Error(`Unexpected action ${options.node}.${options.method}`);
    },
    async executeHttp(options) {
      calls.push({ type: 'http', options: structuredClone(options) });
      return { id: creating ? 'order-created' : 'order-1', doc_no: form.doc_no };
    },
    $message: {
      async success(message) {
        calls.push({ type: 'message.success', message });
      },
      async warning(message) {
        calls.push({ type: 'message.warning', message });
      },
    },
    $source: {
      async refresh(sourceKey) {
        calls.push({ type: 'source.refresh', sourceKey });
      },
    },
    $router: {
      async push(target) {
        calls.push({ type: 'router.push', target: structuredClone(target) });
      },
    },
  };

  return { context, calls };
}

const saveScript = extractScript('v_save_script');
const addDetailScript = extractScript('v_add_detail_script');
const deleteDetailScript = extractScript('v_delete_detail_script');

{
  const { context, calls } = createSaveContext();
  const result = await executeScript(saveScript, context);
  assert.equal(result.id, 'order-1');

  assert.deepEqual(
    calls.map((call) => call.type === 'action'
      ? `${call.type}:${call.options.node}.${call.options.method}`
      : call.type),
    [
      'action:sales-order-edit-form.validate',
      'action:sales-order-lines-grid.validate',
      'action:sales-order-edit-form.getData',
      'http',
      'message.success',
      'source.refresh',
      'action:sales-order-lines-grid.loadData',
    ],
    'Save must validate both editors before constructing and sending the request.',
  );

  const request = calls.find((call) => call.type === 'http').options;
  assert.equal(request.api, 'saveSalesOrder');
  assert.equal(request.body.id, 'order-1');
  assert.deepEqual(
    Object.keys(request.body.data).sort(),
    [
      '__details',
      'business_date',
      'customer_code',
      'doc_date',
      'doc_no',
      'metadata',
      'total_qty',
    ],
    'Only API-owned header fields may be sent.',
  );
  assert.equal(request.body.data.business_date, null);
  assert.deepEqual(request.body.data.__details[0], {
    resource: 'sales_order_lines',
    mode: 'replace',
    foreignKey: 'order_id',
    inheritFields: ['account_id'],
    rows: [{
      line_no: 1,
      item_code: 'ITEM-001',
      item_name: 'Test item',
      ordered_qty: 2,
      unit_price: 10.5,
      need_date: null,
      metadata: {},
    }],
  });
}

{
  const { context, calls } = createSaveContext();
  context.grids['sales-order-lines-grid'] = {};
  await executeScript(saveScript, context);
  const request = calls.find((call) => call.type === 'http').options;
  assert.equal(
    request.body.data.__details[0].rows.length,
    1,
    'Save must fall back to source rows while the grid runtime snapshot is unavailable.',
  );
}

{
  const { context, calls } = createSaveContext({ formValid: false });
  assert.equal(await executeScript(saveScript, context), false);
  assert.deepEqual(
    calls.map((call) => call.type),
    ['action', 'message.warning'],
    'An invalid header must stop before detail validation and HTTP execution.',
  );
}

{
  const { context, calls } = createSaveContext({ detailValid: false });
  assert.equal(await executeScript(saveScript, context), false);
  assert.deepEqual(
    calls.map((call) => call.type),
    ['action', 'action', 'message.warning'],
    'Invalid detail rows must stop before data generation and HTTP execution.',
  );
}

{
  const { context, calls } = createSaveContext({ creating: true });
  const result = await executeScript(saveScript, context);
  assert.equal(result.id, 'order-created');
  assert.deepEqual(
    calls.find((call) => call.type === 'router.push').target,
    {
      path: '/dashboard/sales/orders/edit',
      query: { from: 'list', id: 'order-created' },
    },
    'A newly created order must switch the editor to its persisted id.',
  );
  assert.equal(calls.some((call) => call.type === 'source.refresh'), false);
}

{
  const calls = [];
  const context = {
    grids: {
      'sales-order-lines-grid': {
        rows: [{ line_no: 1 }, { line_no: 4 }],
      },
    },
    data: { salesOrderLines: [] },
    async executeAction(options) {
      calls.push(structuredClone(options));
      return options.data;
    },
  };
  const row = await executeScript(addDetailScript, context);
  assert.equal(calls[0].method, 'addRow');
  assert.equal(row.line_no, 5);
  assert.match(row.id, /^new-\d+-3$/);
  assert.equal(row.status, 'open');
  assert.equal(row.ordered_qty, 0);
  assert.deepEqual(row.metadata, {});
}

{
  const calls = [];
  const context = {
    grids: { 'sales-order-lines-grid': {} },
    data: { salesOrderLines: [{ line_no: 2 }, { line_no: 7 }] },
    async executeAction(options) {
      calls.push(structuredClone(options));
      return options.data;
    },
  };
  const row = await executeScript(addDetailScript, context);
  assert.equal(row.line_no, 8);
  assert.equal(calls[0].method, 'addRow');
}

{
  const messages = [];
  const context = {
    async executeAction(options) {
      assert.equal(options.method, 'deleteCurrentRow');
      return null;
    },
    $message: {
      async warning(message) {
        messages.push(message);
      },
    },
  };
  assert.equal(await executeScript(deleteDetailScript, context), null);
  assert.equal(messages.length, 1, 'Delete must tell the user when no detail row is selected.');

  context.executeAction = async () => ({ id: 'line-1' });
  assert.deepEqual(
    await executeScript(deleteDetailScript, context),
    { id: 'line-1' },
    'Delete must return the locally removed row so the action is observable.',
  );
}

assert.match(migration, /'serviceMethod', 'saveItem'/);
assert.match(migration, /'resource', 'sales_orders'/);
assert.match(
  migration,
  /'\{dataSources,salesOrder,autoLoad\}'[\s\S]*?'true'::jsonb/,
  'The edit page must load the existing header before validation and save.',
);
assert.match(migration, /'keepSource', true/);
assert.match(migration, /'editConfig'[\s\S]*?'mode', 'row'[\s\S]*?'trigger', 'click'/);
assert.match(migration, /'editRules'[\s\S]*?'item_code'[\s\S]*?'item_name'[\s\S]*?'ordered_qty'/);
assert.match(migration, /'name', 'VxeNumberInput'/);
assert.match(migration, /'name', 'VxeDatePicker'/);
assert.match(migration, /where entry\.action ->> 'code' = 'addDetail'/);
assert.match(migration, /where entry\.action ->> 'code' = 'deleteDetail'/);

console.log('Sales-order edit save/detail action regression tests passed.');
