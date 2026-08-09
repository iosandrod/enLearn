import assert from 'node:assert/strict';
import { buildFreppleInput } from './frepple-input.builder';
import { preflightPlanningData } from './planning-preflight';
import {
  PLANNING_INPUT_TABLES,
  type PlanningDataSnapshot,
  type PlanningInputTable,
  type PlanningRow,
  type PlanningSolverParameters
} from './planning-execution.types';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

function row(id: string, values: Record<string, unknown>): PlanningRow {
  return { id, account_id: ACCOUNT_ID, ...values };
}

function snapshot(
  additions: Partial<Record<PlanningInputTable, PlanningRow[]>> = {}
): PlanningDataSnapshot {
  const rows = Object.fromEntries(
    PLANNING_INPUT_TABLES.map((table) => [table, additions[table] ?? []])
  ) as Record<PlanningInputTable, PlanningRow[]>;
  return {
    accountId: ACCOUNT_ID,
    counts: Object.fromEntries(
      PLANNING_INPUT_TABLES.map((table) => [table, rows[table].length])
    ) as Record<PlanningInputTable, number>,
    hash: 'snapshot-hash',
    loadedAt: '2026-08-09T00:00:00.000Z',
    rows
  };
}

const parameters: PlanningSolverParameters = {
  administrativeLeadtime: 0,
  algorithm: 'heuristic',
  autoFence: 0,
  constraints: 52,
  currentDate: '2026-08-09T00:00:00.000Z',
  individualPoolResources: false,
  iterationMax: 0,
  lazyDelay: 86_400,
  logLevel: 0,
  minimumDelay: 3_600,
  moveApprovedEarly: 0,
  planType: 1,
  resourceIterationMax: 500,
  rotateResources: true
};

function testBuilderContracts() {
  const data = snapshot({
    planning_calendar: [row('cal-capacity', { name: 'capacity' })],
    planning_bucket: [row('bucket-day', { name: 'day' })],
    planning_location: [row('location', { name: 'Plant' })],
    planning_supplier: [row('supplier', {
      name: 'Supplier A',
      available_id: 'cal-capacity'
    })],
    planning_resource: [row('resource', {
      name: 'Line 1',
      type: 'buckets_day',
      maximum_calendar_id: 'cal-capacity'
    })],
    planning_operationplan: [
      row('child', {
        reference: 'CHILD',
        type: 'PO',
        status: 'confirmed',
        owner_id: 'parent',
        item_id: null,
        location_id: 'location',
        supplier_id: 'supplier',
        quantity: 1
      }),
      row('parent', {
        reference: 'PARENT',
        type: 'PO',
        status: 'proposed',
        item_id: null,
        location_id: 'location',
        supplier_id: 'supplier',
        quantity: 1
      })
    ],
    planning_operationplanmaterial: [row('child-material', {
      operationplan_id: 'child',
      item_id: null,
      quantity: 1,
      status: 'closed'
    })]
  });

  const input = buildFreppleInput(data, parameters);
  const resource = input.request.model.resources[0];
  assert.deepEqual(resource.maximum_calendar, { name: 'capacity' });
  assert.deepEqual(input.request.bucketizedResources, [{
    calendar: 'day',
    resource: 'Line 1'
  }]);
  assert.deepEqual(
    input.request.model.locations.find((location) => location.name === 'Supplier A'),
    {
      name: 'Supplier A',
      available: { name: 'capacity' },
      source: 'planning_supplier.available_id'
    }
  );
  assert.deepEqual(
    input.request.model.operationplans.map((operationPlan) => operationPlan.reference),
    ['PARENT', 'CHILD']
  );
  assert.equal(
    (input.request.model.operationplans[1].flowplans as Array<Record<string, unknown>>)[0].status,
    'confirmed'
  );
}

function testPreflightCompatibilityContracts() {
  const data = snapshot({
    planning_location: [row('location', { name: 'Supplier A' })],
    planning_supplier: [row('supplier', { name: 'Supplier A' })],
    planning_resource: [row('resource', { name: 'Line 1', type: 'buckets_week' })],
    planning_buffer: [row('buffer', {
      item_id: 'missing-item',
      location_id: 'location',
      min_interval: 60
    })]
  });
  const codes = new Set(preflightPlanningData(data).errors.map((issue) => issue.code));
  assert.ok(codes.has('RESOURCE_BUCKET_CALENDAR_NOT_FOUND'));
  assert.ok(codes.has('SUPPLIER_LOCATION_NAME_CONFLICT'));
  assert.ok(codes.has('UNSUPPORTED_BUFFER_MIN_INTERVAL'));
}

function testMtoBufferNamesAndCollisions() {
  const data = snapshot({
    planning_location: [row('location', { name: 'Plant' })],
    planning_item: [
      row('mts', { name: 'Stock item', type: 'make to stock' }),
      row('mto', { name: 'Order item', type: 'make to order' })
    ],
    planning_buffer: [
      row('mts-buffer', {
        item_id: 'mts', location_id: 'location', batch: 'ignored', onhand: 1
      }),
      row('mto-buffer', {
        item_id: 'mto', location_id: 'location', batch: 'ORDER-1', onhand: 1
      })
    ]
  });
  const input = buildFreppleInput(data, parameters);
  assert.deepEqual(
    input.request.model.buffers.map((buffer) => [buffer.name, buffer.batch]),
    [
      ['Stock item @ Plant', undefined],
      ['Order item @ ORDER-1 @ Plant', 'ORDER-1']
    ]
  );
  assert.ok(preflightPlanningData(data).errors.some(
    (issue) => issue.code === 'BUFFER_BATCH_REQUIRES_MTO_ITEM'
  ));

  const collision = snapshot({
    planning_location: [row('location', { name: 'Plant' })],
    planning_item: [
      row('first', { name: 'A @ B', type: 'make to stock' }),
      row('second', { name: 'A', type: 'make to order' })
    ],
    planning_buffer: [
      row('first-buffer', { item_id: 'first', location_id: 'location' }),
      row('second-buffer', {
        item_id: 'second', location_id: 'location', batch: 'B'
      })
    ]
  });
  assert.ok(preflightPlanningData(collision).errors.some(
    (issue) => issue.code === 'BUFFER_NAME_COLLISION'
  ));
}

testBuilderContracts();
testPreflightCompatibilityContracts();
testMtoBufferNamesAndCollisions();
console.log('frePPLe input builder and preflight tests passed');
