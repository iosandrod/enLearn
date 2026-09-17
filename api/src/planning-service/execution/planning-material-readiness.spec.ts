import assert from 'node:assert/strict';
import {
  PLANNING_INPUT_TABLES,
  type PlanningDataSnapshot,
  type PlanningInputTable,
  type PlanningRow
} from './planning-execution.types';
import { validatePlanningMaterialReadiness } from './planning-material-readiness';

const accountId = '11111111-1111-4111-8111-111111111111';
const loadedAt = '2026-09-17T00:00:00.000Z';

function snapshot(rows: Partial<Record<PlanningInputTable, PlanningRow[]>>): PlanningDataSnapshot {
  const allRows = Object.fromEntries(PLANNING_INPUT_TABLES.map((table) => [table, rows[table] ?? []])) as Record<PlanningInputTable, PlanningRow[]>;
  return {
    accountId,
    counts: Object.fromEntries(PLANNING_INPUT_TABLES.map((table) => [table, allRows[table].length])) as Record<PlanningInputTable, number>,
    hash: 'test-hash',
    loadedAt,
    rows: allRows
  };
}

function row(id: string, values: Record<string, unknown> = {}): PlanningRow {
  return { account_id: accountId, id, ...values };
}

function baseDemand(itemId: string, locationId = 'location-1') {
  return row('demand-1', {
    customer_id: 'customer-1',
    due: '2026-09-20T00:00:00.000Z',
    item_id: itemId,
    location_id: locationId,
    name: '需求-1',
    priority: 10,
    quantity: 10,
    status: 'open'
  });
}

function baseRows(
  itemId: string,
  locationId = 'location-1'
): Partial<Record<PlanningInputTable, PlanningRow[]>> {
  return {
    planning_item: [row(itemId, { display_name: '测试物料', name: 'ITEM-001', type: 'make to stock' })],
    planning_location: [row(locationId, { name: locationId })],
    planning_demand: [baseDemand(itemId, locationId)]
  };
}

async function testPurchasePath() {
  const rows = baseRows('item-1');
  rows.planning_supplier = [row('supplier-1', { name: '供应商-1' })];
  rows.planning_itemsupplier = [row('item-supplier-1', {
    effective_end: '2030-12-31T00:00:00.000Z',
    effective_start: '1971-01-01T00:00:00.000Z',
    item_id: 'item-1',
    location_id: 'location-1',
    priority: 1,
    supplier_id: 'supplier-1'
  })];
  const result = validatePlanningMaterialReadiness(snapshot(rows), ['item-1']);
  assert.equal(result.ready, true);
  assert.deepEqual(result.materials[0]?.acquisitionMethods, ['purchasing']);
}

async function testManufacturingPathRequiresOutputAndInputBuffer() {
  const rows = baseRows('item-1');
  rows.planning_operation = [
    row('route-1', { item_id: 'item-1', location_id: 'location-1', name: '总装路线', priority: 1, type: 'routing' }),
    row('step-1', { item_id: 'item-1', location_id: 'location-1', name: '总装', owner_id: 'route-1', priority: 1, type: 'fixed_time' })
  ];
  rows.planning_operationmaterial = [
    row('flow-out', { item_id: 'item-1', location_id: 'location-1', operation_id: 'step-1', quantity: 1 }),
    row('flow-in', { item_id: 'raw-1', location_id: 'location-1', operation_id: 'step-1', quantity: -1 })
  ];
  rows.planning_resource = [row('resource-1', { name: '装配线' })];
  rows.planning_operationresource = [row('load-1', { operation_id: 'step-1', priority: 1, resource_id: 'resource-1' })];
  rows.planning_item = [
    ...(rows.planning_item ?? []),
    row('raw-1', { display_name: '原料', name: 'RAW-001' })
  ];
  rows.planning_buffer = [row('buffer-raw', { item_id: 'raw-1', location_id: 'location-1', onhand: 5, type: 'default' })];

  const result = validatePlanningMaterialReadiness(snapshot(rows), ['item-1']);
  assert.equal(result.ready, true);
  assert.deepEqual(result.materials[0]?.acquisitionMethods, ['manufacturing']);
  assert.equal(result.materials[0]?.hasManufacturingRoute, true);
  assert.equal(result.materials[0]?.hasValidOutputFlow, true);

  rows.planning_buffer = [row('buffer-raw', {
    item_id: 'raw-1',
    location_id: 'location-1',
    onhand: 0,
    type: 'default'
  })];
  const missingInputSupply = validatePlanningMaterialReadiness(snapshot(rows), ['item-1']);
  assert.equal(missingInputSupply.ready, false);
  assert.ok(missingInputSupply.issues.some((issue) =>
    issue.code === 'MANUFACTURING_INPUT_HAS_NO_SUPPLY'
  ));

  rows.planning_buffer = [];
  const missingBuffer = validatePlanningMaterialReadiness(snapshot(rows), ['item-1']);
  assert.equal(missingBuffer.ready, false);
  assert.ok(missingBuffer.issues.some((issue) => issue.code === 'MANUFACTURING_INPUT_BUFFER_MISSING'));
}

async function testDistributionPath() {
  const rows = baseRows('item-1');
  rows.planning_buffer = [row('buffer-origin', { item_id: 'item-1', location_id: 'origin-1', onhand: 3, type: 'default' })];
  rows.planning_location = [row('location-1', { name: '目的地' }), row('origin-1', { name: '来源地' })];
  rows.planning_itemdistribution = [row('distribution-1', {
    effective_end: '2030-12-31T00:00:00.000Z',
    effective_start: '1971-01-01T00:00:00.000Z',
    item_id: 'item-1',
    location_id: 'location-1',
    origin_id: 'origin-1',
    priority: 1
  })];
  const result = validatePlanningMaterialReadiness(snapshot(rows), ['item-1']);
  assert.equal(result.ready, true);
  assert.deepEqual(result.materials[0]?.acquisitionMethods, ['distribution']);
}

async function testNoSupplyAndUnknownItem() {
  const noSupply = validatePlanningMaterialReadiness(snapshot(baseRows('item-1')), ['item-1']);
  assert.equal(noSupply.ready, false);
  assert.ok(noSupply.issues.some((issue) => issue.code === 'MATERIAL_NO_USABLE_ACQUISITION_METHOD'));

  const unknown = validatePlanningMaterialReadiness(snapshot(baseRows('item-1')), ['missing-item']);
  assert.equal(unknown.ready, false);
  assert.equal(unknown.issues[0]?.code, 'MATERIAL_NOT_FOUND');
}

async function testManufacturingMissingOutputAndOptionalResource() {
  const rows = baseRows('item-1');
  rows.planning_operation = [row('operation-1', {
    item_id: 'item-1',
    location_id: 'location-1',
    name: '装配',
    priority: 1,
    type: 'fixed_time'
  })];
  const missingOutput = validatePlanningMaterialReadiness(snapshot(rows), ['item-1']);
  assert.equal(missingOutput.ready, false);
  assert.ok(missingOutput.issues.some((issue) => issue.code === 'MANUFACTURING_OUTPUT_MISSING'));

  rows.planning_operationmaterial = [row('flow-out', {
    item_id: 'item-1',
    location_id: 'location-1',
    operation_id: 'operation-1',
    quantity: 1
  })];
  const optionalResource = validatePlanningMaterialReadiness(snapshot(rows), ['item-1']);
  assert.equal(optionalResource.ready, true);
  assert.ok(optionalResource.issues.some((issue) =>
    issue.code === 'MANUFACTURING_RESOURCE_NOT_CONFIGURED' && issue.severity === 'warning'
  ));
}

async function testPurchaseSupplierMustExist() {
  const rows = baseRows('item-1');
  rows.planning_itemsupplier = [row('item-supplier-1', {
    item_id: 'item-1',
    location_id: 'location-1',
    priority: 1,
    supplier_id: 'missing-supplier'
  })];
  const result = validatePlanningMaterialReadiness(snapshot(rows), ['item-1']);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((issue) => issue.code === 'PURCHASE_SUPPLIER_NOT_FOUND'));
}

void Promise.all([
  testPurchasePath(),
  testManufacturingPathRequiresOutputAndInputBuffer(),
  testDistributionPath(),
  testNoSupplyAndUnknownItem(),
  testManufacturingMissingOutputAndOptionalResource(),
  testPurchaseSupplierMustExist()
]).then(() => console.log('planning material readiness tests passed'));
