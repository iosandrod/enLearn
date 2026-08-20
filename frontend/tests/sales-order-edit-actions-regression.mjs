import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL(
    '../../supabase/migrations/20260813121000_sales_order_incremental_detail_save.sql',
    import.meta.url,
  ),
  'utf8',
);
const originalMigration = await readFile(
  new URL(
    '../../supabase/migrations/20260812120000_sales_order_edit_save_details.sql',
    import.meta.url,
  ),
  'utf8',
);
const quantityValidationMigration = await readFile(
  new URL(
    '../../supabase/migrations/20260820103000_sales_order_ordered_qty_validation.sql',
    import.meta.url,
  ),
  'utf8',
);
const quantityFieldBindingMigration = await readFile(
  new URL(
    '../../supabase/migrations/20260820110000_sales_order_ordered_qty_field_binding.sql',
    import.meta.url,
  ),
  'utf8',
);

function extractScript(variableName, source = migration) {
  const match = source.match(
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
  const changes = {
    created: [{
      id: 'new-local-1',
      _X_ROW_KEY: 'vxe-created-row',
      __rowStatus: 'created',
      line_no: '2',
      item_code: 'ITEM-NEW',
      item_name: 'New item',
      ordered_qty: '1',
      unit_price: '5',
      metadata: {},
    }],
    updated: [{
      ...rows[0],
      _X_ROW_KEY: 'vxe-updated-row',
      __rowState: 'updated',
      item_name: 'Updated item',
    }],
    deleted: [{ id: 'line-deleted', item_code: 'OLD' }],
  };

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
      if (options.node === 'sales-order-lines-grid' && options.method === 'getChanges') {
        return structuredClone(changes);
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
const addDetailScript = extractScript('v_add_detail_script', originalMigration);
const deleteDetailScript = extractScript('v_delete_detail_script', originalMigration);

function applyOrderedQuantityValidation(script) {
  const currentIdMarker = '  const currentId = String(form.id || this.route.query.id || "").trim();';
  const detailsMarker = '  data.__details = [currentId';
  assert.ok(script.includes(currentIdMarker));
  assert.ok(script.includes(detailsMarker));
  const validationDeclaration = `  const validateOrderedQuantities = (details) => {
    for (const [index, detail] of details.entries()) {
      const quantity = Number(detail.ordered_qty);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
        return index + 1;
      }
    }
    return 0;
  };

`;
  const validationCall = `  const quantityRows = currentId
    ? [...created, ...updated]
    : created;
  const invalidQuantityRow = validateOrderedQuantities(quantityRows);
  if (invalidQuantityRow) {
    await this.$message.warning(\`第 \${invalidQuantityRow} 条明细的订购数量必须大于 0 且不能大于 1000\`);
    return false;
  }

`;
  return script
    .replace(
      currentIdMarker,
      `${validationDeclaration}${currentIdMarker}`,
    )
    .replace(detailsMarker, `${validationCall}${detailsMarker}`);
}

const quantityValidatedSaveScript = applyOrderedQuantityValidation(saveScript);

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
      'action:sales-order-lines-grid.getChanges',
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
    mode: 'changes',
    foreignKey: 'order_id',
    inheritFields: ['account_id'],
    created: [{
      line_no: 2,
      item_code: 'ITEM-NEW',
      item_name: 'New item',
      ordered_qty: 1,
      unit_price: 5,
      metadata: {},
    }],
    updated: [{
      id: 'line-1',
      line_no: 1,
      item_code: 'ITEM-001',
      item_name: 'Updated item',
      ordered_qty: 2,
      unit_price: 10.5,
      need_date: null,
      metadata: {},
    }],
    deleted: ['line-deleted'],
  });
}

{
  const { context, calls } = createSaveContext();
  context.executeAction = async (options) => {
    calls.push({ type: 'action', options: structuredClone(options) });
    if (options.node === 'sales-order-edit-form' && options.method === 'validate') return true;
    if (options.node === 'sales-order-lines-grid' && options.method === 'validate') return true;
    if (options.node === 'sales-order-edit-form' && options.method === 'getData') {
      return { id: 'order-1', doc_no: 'SO-001' };
    }
    if (options.node === 'sales-order-lines-grid' && options.method === 'getChanges') {
      return { created: [], updated: [], deleted: [] };
    }
    if (options.node === 'sales-order-lines-grid' && options.method === 'loadData') return [];
    throw new Error(`Unexpected action ${options.node}.${options.method}`);
  };
  await executeScript(saveScript, context);
  const request = calls.find((call) => call.type === 'http').options;
  assert.deepEqual(request.body.data.__details[0].created, []);
  assert.deepEqual(request.body.data.__details[0].updated, []);
  assert.deepEqual(request.body.data.__details[0].deleted, []);
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
  context.grids['sales-order-lines-grid'] = {};
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
  const request = calls.find((call) => call.type === 'http').options;
  assert.deepEqual(request.body.data.__details[0], {
    resource: 'sales_order_lines',
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

for (const invalidQuantity of [0, -1, 1000.01, 'not-a-number']) {
  const { context, calls } = createSaveContext({ creating: true });
  context.grids['sales-order-lines-grid'].rows[0].ordered_qty = invalidQuantity;
  assert.equal(await executeScript(quantityValidatedSaveScript, context), false);
  assert.deepEqual(
    calls.map((call) => call.type),
    ['action', 'action', 'action', 'message.warning'],
    `Ordered quantity ${String(invalidQuantity)} must stop before HTTP execution.`,
  );
  assert.match(calls.at(-1).message, /第 1 条明细的订购数量必须大于 0 且不能大于 1000/);
}

{
  const { context, calls } = createSaveContext({ creating: true });
  context.grids['sales-order-lines-grid'].rows[0].ordered_qty = 1000;
  assert.equal((await executeScript(quantityValidatedSaveScript, context)).id, 'order-created');
  assert.equal(calls.some((call) => call.type === 'http'), true);
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

assert.match(originalMigration, /'serviceMethod', 'saveItem'/);
assert.match(originalMigration, /'resource', 'sales_orders'/);
assert.match(
  originalMigration,
  /'\{dataSources,salesOrder,autoLoad\}'[\s\S]*?'true'::jsonb/,
  'The edit page must load the existing header before validation and save.',
);
assert.match(originalMigration, /'keepSource', true/);
assert.match(originalMigration, /'editConfig'[\s\S]*?'mode', 'row'[\s\S]*?'trigger', 'click'/);
assert.match(originalMigration, /'editRules'[\s\S]*?'item_code'[\s\S]*?'item_name'[\s\S]*?'ordered_qty'/);
assert.match(originalMigration, /'name', 'VxeNumberInput'/);
assert.match(originalMigration, /'name', 'VxeDatePicker'/);
assert.match(originalMigration, /where entry\.action ->> 'code' = 'addDetail'/);
assert.match(originalMigration, /where entry\.action ->> 'code' = 'deleteDetail'/);
assert.match(migration, /where entry\.action ->> 'code' = 'save'/);
assert.match(migration, /jsonb_build_object\('script', v_save_script\)/);
assert.match(migration, /mode: "changes"/);
assert.match(quantityValidationMigration, /quantity <= 0 \|\| quantity > 1000/);
assert.match(quantityValidationMigration, /第 \$\{invalidQuantityRow\} 条明细的订购数量必须大于 0 且不能大于 1000/);
assert.match(
  quantityFieldBindingMigration,
  /'lowcodeField'[\s\S]*?'validationMessage'[\s\S]*?'validationScript', v_validation_script/,
  'The ordered quantity field must persist its validation function in low-code field metadata.',
);
assert.match(
  quantityFieldBindingMigration,
  /Number\(event\.value\)[\s\S]*?quantity > 0 && quantity <= 1000/,
  'The bound field validator must accept only quantities in the range (0, 1000].',
);
assert.match(
  quantityFieldBindingMigration,
  /'max', 1000/,
  'The ordered quantity number input must expose the upper bound.',
);
assert.doesNotMatch(
  originalMigration,
  /method: "getChanges"/,
  'The already-shipped migration must remain immutable; incremental save is a forward migration.',
);

console.log('Sales-order edit save/detail action regression tests passed.');
