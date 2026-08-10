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

function testCalendarClockFieldsUseSeconds() {
  const data = snapshot({
    planning_calendar: [row('calendar', { name: 'Work calendar' })],
    planning_calendarbucket: [row('calendar-bucket', {
      calendar_id: 'calendar', value: 1, monday: true,
      starttime: '08:00:00', endtime: '16:59:59'
    })]
  });
  const input = buildFreppleInput(data, parameters);
  const buckets = input.request.model.calendars[0]?.buckets as Array<Record<string, unknown>>;
  const bucket = buckets?.[0];
  assert.equal(bucket?.starttime, 8 * 3_600);
  assert.equal(bucket?.endtime, 17 * 3_600);
}

function testDurationFieldsUseNumericSeconds() {
  const data = snapshot({
    planning_calendar: [row('calendar', { name: 'Work calendar' })],
    planning_location: [
      row('plant', { name: 'Plant' }),
      row('origin', { name: 'Origin' })
    ],
    planning_item: [
      row('finished', { name: 'Finished item' }),
      row('component', { name: 'Component' })
    ],
    planning_supplier: [row('supplier', { name: 'Supplier' })],
    planning_setupmatrix: [row('matrix', { name: 'Setup matrix' })],
    planning_setuprule: [row('rule', {
      setupmatrix_id: 'matrix', priority: 1, duration: 900
    })],
    planning_resource: [row('resource', {
      name: 'Line', maxearly: 1_800, setupmatrix_id: 'matrix'
    })],
    planning_operation: [
      row('blocked-by', { name: 'Previous step', type: 'fixed_time', duration: 30 }),
      row('make', {
        name: 'Make item', type: 'time_per', item_id: 'finished', location_id: 'plant',
        available_id: 'calendar', fence: 60, posttime: 120, duration: 300,
        duration_per: 12.5, batchwindow: 600
      })
    ],
    planning_operationmaterial: [
      row('input', {
        operation_id: 'make', item_id: 'component', location_id: 'plant',
        quantity: -1, type: 'start', offset: -45
      }),
      row('output', {
        operation_id: 'make', item_id: 'finished', location_id: 'plant',
        quantity: 1, type: 'end'
      })
    ],
    planning_operation_dependency: [row('dependency', {
      operation_id: 'make', blockedby_id: 'blocked-by', safety_leadtime: 3_600,
      hard_safety_leadtime: 7_200
    })],
    planning_itemsupplier: [row('supply', {
      supplier_id: 'supplier', item_id: 'component', location_id: 'origin',
      leadtime: 86_400, extra_safety_leadtime: 1_800,
      hard_safety_leadtime: 3_600, batchwindow: 43_200, fence: 7_200
    })],
    planning_itemdistribution: [row('distribution', {
      item_id: 'component', origin_id: 'origin', location_id: 'plant',
      leadtime: 14_400, batchwindow: 28_800, fence: 900
    })],
    planning_demand: [row('demand', {
      name: 'Demand', item_id: 'finished', location_id: 'plant',
      due: '2026-08-10T00:00:00.000Z', quantity: 1, maxlateness: 2_592_000
    })]
  });

  const model = buildFreppleInput(data, parameters).request.model;
  const operation = model.operations.find((candidate) => candidate.name === 'Make item')!;
  const flow = (operation.flows as Array<Record<string, unknown>>)[0];
  const dependency = (operation.dependencies as Array<Record<string, unknown>>)[0];
  const setupRule = (model.setupmatrices[0].rules as Array<Record<string, unknown>>)[0];

  assert.deepEqual({
    batchwindow: operation.batchwindow,
    duration: operation.duration,
    durationPer: operation.duration_per,
    fence: operation.fence,
    posttime: operation.posttime
  }, {
    batchwindow: 600,
    duration: 300,
    durationPer: 12.5,
    fence: 60,
    posttime: 120
  });
  assert.equal(flow.offset, -45);
  assert.equal(dependency.safety_leadtime, 3_600);
  assert.equal(dependency.hard_safety_leadtime, 7_200);
  assert.equal(setupRule.duration, 900);
  assert.equal(model.resources[0].maxearly, 1_800);
  assert.deepEqual({
    batchwindow: model.itemsuppliers[0].batchwindow,
    extra: model.itemsuppliers[0].extra_safety_leadtime,
    fence: model.itemsuppliers[0].fence,
    hard: model.itemsuppliers[0].hard_safety_leadtime,
    leadtime: model.itemsuppliers[0].leadtime
  }, {
    batchwindow: 43_200,
    extra: 1_800,
    fence: 7_200,
    hard: 3_600,
    leadtime: 86_400
  });
  assert.deepEqual({
    batchwindow: model.itemdistributions[0].batchwindow,
    fence: model.itemdistributions[0].fence,
    leadtime: model.itemdistributions[0].leadtime
  }, {
    batchwindow: 28_800,
    fence: 900,
    leadtime: 14_400
  });
  assert.equal(model.demands[0].maxlateness, 2_592_000);
  assert.equal(JSON.stringify(model).includes('PT'), false);
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

function testManufacturingOutputValidation() {
  const invalid = snapshot({
    planning_location: [row('location', { name: 'Plant' })],
    planning_item: [row('finished', { name: 'Finished item', type: 'make to stock' })],
    planning_operation: [row('route', {
      name: 'Finished route',
      type: 'routing',
      item_id: 'finished',
      location_id: 'location'
    })]
  });
  assert.ok(preflightPlanningData(invalid).errors.some(
    (issue) => issue.code === 'OPERATION_OUTPUT_MISSING' && issue.recordId === 'route'
  ));

  const missingInputBuffer = snapshot({
    planning_location: invalid.rows.planning_location,
    planning_item: [
      ...invalid.rows.planning_item,
      row('component', { name: 'Component', type: 'make to stock' })
    ],
    planning_operation: [row('make', {
      name: 'Make finished item',
      type: 'time_per',
      item_id: 'finished',
      location_id: 'location'
    })],
    planning_operationmaterial: [
      row('component-input', {
        operation_id: 'make', item_id: 'component', location_id: 'location',
        quantity: -1, type: 'start'
      }),
      row('finished-output', {
        operation_id: 'make', item_id: 'finished', location_id: 'location',
        quantity: 1, type: 'end'
      })
    ]
  });
  assert.ok(preflightPlanningData(missingInputBuffer).errors.some(
    (issue) => issue.code === 'OPERATION_INPUT_BUFFER_MISSING' &&
      issue.recordId === 'component-input'
  ));

  const routingStepWithoutOutput = snapshot({
    planning_location: invalid.rows.planning_location,
    planning_item: invalid.rows.planning_item,
    planning_operation: [
      row('route-with-output', {
        name: 'Route', type: 'routing', item_id: 'finished', location_id: 'location'
      }),
      row('intermediate-step', {
        name: 'Intermediate step', type: 'fixed_time', item_id: 'finished',
        location_id: 'location', owner_id: 'route-with-output'
      }),
      row('output-step', {
        name: 'Output step', type: 'fixed_time', item_id: 'finished',
        location_id: 'location', owner_id: 'route-with-output'
      })
    ],
    planning_operationmaterial: [row('route-output', {
      operation_id: 'output-step', item_id: 'finished', location_id: 'location',
      quantity: 1, type: 'end'
    })]
  });
  assert.ok(!preflightPlanningData(routingStepWithoutOutput).errors.some(
    (issue) => issue.code === 'OPERATION_OUTPUT_MISSING' && issue.recordId === 'intermediate-step'
  ));

  const valid = snapshot({
    planning_location: invalid.rows.planning_location,
    planning_item: invalid.rows.planning_item,
    planning_operation: [
      invalid.rows.planning_operation[0],
      row('last-step', {
        name: 'Last step',
        type: 'fixed_time',
        owner_id: 'route',
        location_id: 'location'
      })
    ],
    planning_operationmaterial: [row('finished-output', {
      operation_id: 'last-step',
      item_id: 'finished',
      location_id: 'location',
      quantity: 1,
      type: 'end'
    })]
  });
  assert.ok(!preflightPlanningData(valid).errors.some(
    (issue) => issue.code === 'OPERATION_OUTPUT_MISSING'
  ));
}

function testDemandBatchRequiresMtoItem() {
  const data = snapshot({
    planning_location: [row('location', { name: 'Plant' })],
    planning_customer: [row('customer', { name: 'Customer' })],
    planning_item: [row('finished', { name: 'Finished item', type: 'make to stock' })],
    planning_demand: [row('demand', {
      name: 'D-1', customer_id: 'customer', item_id: 'finished', location_id: 'location',
      due: '2026-08-10T00:00:00.000Z', status: 'open', quantity: 1, batch: 'PROJECT-1'
    })]
  });
  assert.ok(preflightPlanningData(data).errors.some(
    (issue) => issue.code === 'DEMAND_BATCH_REQUIRES_MTO_ITEM'
  ));
}

function testRoutingStepItemsAreNotIndependentReplenishments() {
  const data = snapshot({
    planning_location: [row('location', { name: 'Plant' })],
    planning_item: [row('finished', { name: 'Finished item', type: 'make to stock' })],
    planning_operation: [
      row('route', {
        name: 'Finished route', type: 'routing', item_id: 'finished', location_id: 'location'
      }),
      row('step', {
        name: 'Packing step', type: 'time_per', item_id: 'finished', location_id: 'location',
        owner_id: 'route', duration: 60, duration_per: 10
      })
    ],
    planning_suboperation: [row('route-step', {
      operation_id: 'route', suboperation_id: 'step', priority: 10
    })],
    planning_operationmaterial: [row('finished-output', {
      operation_id: 'step', item_id: 'finished', location_id: 'location',
      quantity: 1, type: 'end'
    })]
  });
  const input = buildFreppleInput(data, parameters);
  const route = input.request.model.operations.find((operation) => operation.name === 'Finished route');
  const step = input.request.model.operations.find((operation) => operation.name === 'Packing step');
  assert.deepEqual(route?.item, { name: 'Finished item' });
  assert.equal(step?.item, undefined);
}

function testMasterCategoryCompatibility() {
  const data = snapshot({
    planning_category: [
      row('item-root', {
        target_type: 'item', code: 'RAW', name: '原材料', status: 'active'
      }),
      row('item-child', {
        target_type: 'item', code: 'RAW_PCB', name: 'PCB 电路板',
        parent_id: 'item-root', status: 'active'
      }),
      row('item-leaf', {
        target_type: 'item', code: 'RAW_PCB_CONTROL', name: '控制板',
        parent_id: 'item-child', status: 'active'
      }),
      row('customer-category', {
        target_type: 'customer', code: 'DOMESTIC', name: '国内客户', status: 'inactive'
      })
    ],
    planning_item: [row('pcb', {
      name: 'RM-PCB-CTRL-100', category_id: 'item-leaf',
      category: '旧分类', subcategory: '旧子分类'
    })],
    planning_customer: [row('customer', {
      name: 'Customer', category_id: 'customer-category'
    })]
  });

  const item = buildFreppleInput(data, parameters).request.model.items[0];
  assert.equal(item.category, '原材料');
  assert.equal(item.subcategory, '控制板');
  assert.ok(preflightPlanningData(data).errors.some(
    (issue) => issue.code === 'CATEGORY_INACTIVE' && issue.recordId === 'customer'
  ));

  data.rows.planning_item[0].category_id = 'customer-category';
  assert.ok(preflightPlanningData(data).errors.some(
    (issue) => issue.code === 'CATEGORY_TARGET_MISMATCH' && issue.recordId === 'pcb'
  ));

  data.rows.planning_item[0].category_id = null;
  const legacyItem = buildFreppleInput(data, parameters).request.model.items[0];
  assert.equal(legacyItem.category, '旧分类');
  assert.equal(legacyItem.subcategory, '旧子分类');
}

testBuilderContracts();
testCalendarClockFieldsUseSeconds();
testDurationFieldsUseNumericSeconds();
testPreflightCompatibilityContracts();
testMtoBufferNamesAndCollisions();
testManufacturingOutputValidation();
testDemandBatchRequiresMtoItem();
testRoutingStepItemsAreNotIndependentReplenishments();
testMasterCategoryCompatibility();
console.log('frePPLe input builder and preflight tests passed');
