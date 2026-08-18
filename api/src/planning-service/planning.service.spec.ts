import assert from 'node:assert/strict';
import {
  PLANNING_MODEL_DEFINITIONS,
  PLANNING_MODEL_KEYS
} from './planning.models';
import {
  PLANNING_MANAGE_PERMISSION,
  PLANNING_VIEW_PERMISSION,
  planningResources
} from './planning.resources';
import { PlanningService } from './planning.service';

const resources = planningResources();
const service = new PlanningService() as unknown as {
  createItem(postData: Record<string, unknown>, context: unknown): Promise<unknown>;
  executeAction(method: string, postData: Record<string, unknown>, context: unknown): Promise<unknown>;
  buildWritePayload(
    context: Record<string, unknown>,
    action: 'create' | 'update',
    source: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
};

assert.equal(PLANNING_MODEL_DEFINITIONS.length, 45);
assert.equal(Object.keys(resources).length, 45);
assert.deepEqual(Object.keys(resources), PLANNING_MODEL_KEYS);

for (const model of PLANNING_MODEL_DEFINITIONS) {
  const resource = resources[model.key];
  assert.ok(resource, `${model.key} resource is missing`);
  assert.equal(resource.tableName, model.key);
  assert.equal(resource.primaryKey, 'id');
  assert.equal(resource.accountField, 'account_id');
  assert.equal(resource.permissions?.list, PLANNING_VIEW_PERMISSION);
  assert.equal(resource.permissions?.create, PLANNING_MANAGE_PERMISSION);
  assert.equal(resource.permissions?.update, PLANNING_MANAGE_PERMISSION);
  assert.equal(resource.permissions?.delete, PLANNING_MANAGE_PERMISSION);
  assert.deepEqual(
    resource.internalActions ?? [],
    model.access === 'view' ? ['create', 'update', 'delete'] : []
  );
  assert.ok(resource.create?.allowedFields?.length);
  assert.ok(resource.update?.allowedFields?.length);
  assert.ok(!resource.create?.allowedFields?.includes('account_id'));
  assert.ok(!resource.update?.allowedFields?.includes('account_id'));

  for (const requiredField of model.fields.filter((field) => field.required)) {
    assert.ok(resource.create?.requiredFields?.includes(requiredField.name));
  }
  for (const readOnlyField of model.fields.filter((field) => field.readOnly)) {
    assert.ok(!resource.create?.allowedFields?.includes(readOnlyField.name));
    assert.ok(!resource.update?.allowedFields?.includes(readOnlyField.name));
  }
}

assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.access === 'view').length, 9);
assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.key === 'planning_parameter').length, 1);
assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.key === 'planning_category').length, 1);
assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.key === 'planning_forecastplan').length, 1);
assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.key === 'planning_source_mapping').length, 1);
assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.key === 'planning_plan_version').length, 1);
assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.key === 'planning_demand_sync_state').length, 1);

const itemModel = PLANNING_MODEL_DEFINITIONS.find((model) => model.key === 'planning_item');
assert.equal(itemModel?.businessKey, 'name');
assert.equal(itemModel?.labelField, 'display_name');
assert.ok(resources.planning_item.create?.allowedFields?.includes('display_name'));
assert.ok(resources.planning_item.create?.requiredFields?.includes('display_name'));
assert.ok(resources.planning_item.list?.searchFields?.includes('display_name'));

assert.equal(typeof service.executeAction, 'function');

async function testPlanningPayloadNormalization() {
  const calendarBucketPayload = await service.buildWritePayload({
    resourceName: 'planning_calendarbucket',
    resource: resources.planning_calendarbucket,
    data: {},
    context: { accountId: '11111111-1111-1111-1111-111111111111' }
  }, 'create', {
    calendar_id: '22222222-2222-2222-2222-222222222222',
    value: 1,
    priority: '',
    startdate: '',
    source: ''
  });
  assert.equal(calendarBucketPayload.priority, null);
  assert.equal(calendarBucketPayload.startdate, null);
  assert.equal(calendarBucketPayload.source, '');

  const locationPayload = await service.buildWritePayload({
    resourceName: 'planning_location',
    resource: resources.planning_location,
    data: {},
    context: { accountId: '11111111-1111-1111-1111-111111111111' }
  }, 'create', {
    name: 'Plant',
    owner_id: '',
    available_id: ''
  });
  assert.equal(locationPayload.owner_id, null);
  assert.equal(locationPayload.available_id, null);

  let capturedPayload: Record<string, unknown> | undefined;
  const executableService = new PlanningService() as unknown as {
    createItem(postData: Record<string, unknown>, context: unknown): Promise<unknown>;
    createCrudContext: (...args: unknown[]) => Promise<Record<string, unknown>>;
    assertPermission: (...args: unknown[]) => Promise<void>;
    callDynamicCrudRpc: (
      context: Record<string, unknown>,
      action: string,
      operation: Record<string, unknown>
    ) => Promise<unknown>;
  };
  executableService.createCrudContext = async () => ({
    action: 'create',
    serviceName: 'planning',
    resourceName: 'planning_location',
    resource: resources.planning_location,
    input: {
      resource: 'planning_location',
      data: { name: 'Plant', owner_id: '', available_id: '' }
    },
    data: { name: 'Plant', owner_id: '', available_id: '' },
    context: { accountId: '11111111-1111-1111-1111-111111111111' },
    client: {},
    user: undefined,
    filters: undefined,
    id: undefined,
    ids: [],
    meta: {}
  });
  executableService.assertPermission = async () => undefined;
  executableService.callDynamicCrudRpc = async (_context, _action, operation) => {
    capturedPayload = (operation.items as Array<{ data: Record<string, unknown> }>)[0].data;
    return capturedPayload;
  };
  await executableService.createItem({
    resource: 'planning_location',
    data: { name: 'Plant', owner_id: '', available_id: '' }
  }, {});
  assert.equal(capturedPayload?.owner_id, null);
  assert.equal(capturedPayload?.available_id, null);
}

async function testConsoleOptionBoundary() {
  let capturedLimit = 0;
  const rows = Array.from({ length: 1005 }, (_, index) => ({
    id: `item-${index}`,
    name: `ITEM-${String(index).padStart(4, '0')}`,
    display_name: `Item ${String(index).padStart(4, '0')}`
  }));
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    limit(value: number) {
      capturedLimit = value;
      return Promise.resolve({ data: rows.slice(0, value), error: null });
    }
  };
  const optionService = new PlanningService() as unknown as {
    executeAction(method: string, postData: Record<string, unknown>, context: unknown): Promise<unknown>;
    authorizeConsoleRead(context: unknown): Promise<{ client: { from(table: string): typeof query } }>;
    accountValue(context: unknown, field: string): string;
  };
  optionService.authorizeConsoleRead = async () => ({ client: { from: () => query } });
  optionService.accountValue = () => 'account-1';
  const options = await optionService.executeAction(
    'getPlanningConsoleOptions',
    { optionType: 'item' },
    { accountId: 'account-1' }
  );
  assert.equal(capturedLimit, 1000);
  assert.ok(Array.isArray(options));
  assert.equal(options.length, 1000, 'Planning console options must cap results at 1000 rows.');
  assert.deepEqual(options[0], { id: 'item-0', label: 'Item 0000' });
}

async function testConsoleReadRequiresTheExactInternalCapability() {
  const capabilityService = new PlanningService() as unknown as {
    authorizeConsoleRead(context: unknown): Promise<unknown>;
  };
  await assert.rejects(
    () => capabilityService.authorizeConsoleRead({
      accountId: 'account-1',
      internal: {
        principal: 'trigger-workflow',
        capability: 'planning.listInventoryBuffers'
      }
    }),
    /planning\.getPlanningConsoleOptions/
  );
}

async function testCategoryRelationOptions() {
  const calls: Array<[string, unknown]> = [];
  const rows = [
    { id: 'root', name: '原材料', parent_id: null },
    { id: 'child', name: 'PCB 电路板', parent_id: 'root' }
  ];
  const query = {
    select() { return query; },
    eq(field: string, value: unknown) { calls.push([field, value]); return query; },
    neq(field: string, value: unknown) { calls.push([`neq:${field}`, value]); return query; },
    order() { return query; },
    limit() { return Promise.resolve({ data: rows, error: null }); }
  };
  const optionService = new PlanningService() as unknown as {
    executeAction(method: string, postData: Record<string, unknown>, context: unknown): Promise<unknown>;
    createCrudContext: (...args: unknown[]) => Promise<Record<string, unknown>>;
    assertPermission: (...args: unknown[]) => Promise<void>;
    accountValue(context: unknown, field: string): string;
  };
  optionService.createCrudContext = async () => ({
    client: { from: () => query },
    config: resources.planning_category,
    name: 'planning_category'
  });
  optionService.assertPermission = async () => undefined;
  optionService.accountValue = () => 'account-1';

  const options = await optionService.executeAction('listRelationOptions', {
    resource: 'planning_category',
    labelField: 'name',
    filters: { target_type: 'item', status: 'active' },
    excludeId: 'current-category',
    tree: true
  }, { accountId: 'account-1' }) as Array<Record<string, unknown>>;
  assert.ok(calls.some(([field, value]) => field === 'target_type' && value === 'item'));
  assert.ok(calls.some(([field, value]) => field === 'status' && value === 'active'));
  assert.ok(calls.some(([field, value]) => field === 'neq:id' && value === 'current-category'));
  assert.deepEqual(options, [{
    id: 'root',
    label: '原材料',
    children: [{ id: 'child', label: 'PCB 电路板' }]
  }]);

  const itemRows = [
    { id: 'item-1', name: 'ITEM-001', display_name: '独立物料名称', parent_id: null },
    { id: 'item-2', name: 'ITEM-002', display_name: null, parent_id: null }
  ];
  const itemQuery = {
    select() { return itemQuery; },
    eq() { return itemQuery; },
    neq() { return itemQuery; },
    order() { return itemQuery; },
    limit() { return Promise.resolve({ data: itemRows, error: null }); }
  };
  optionService.createCrudContext = async () => ({
    client: { from: () => itemQuery },
    config: resources.planning_item,
    name: 'planning_item'
  });
  const itemOptions = await optionService.executeAction('listRelationOptions', {
    resource: 'planning_item'
  }, { accountId: 'account-1' });
  assert.deepEqual(itemOptions, [
    { id: 'item-1', label: '独立物料名称' },
    { id: 'item-2', label: 'ITEM-002' }
  ]);
}

async function testCategoryDeleteRejectsChildren() {
  const deleteService = new PlanningService() as unknown as {
    execute(method: string, postData: Record<string, unknown>, context: unknown): Promise<unknown>;
    createCrudContext: (...args: unknown[]) => Promise<Record<string, unknown>>;
    assertPermission: (...args: unknown[]) => Promise<void>;
    accountValue(context: unknown, field: string): string;
  };
  const childQuery = {
    select() { return childQuery; },
    eq() { return childQuery; },
    then(resolve: (value: unknown) => void) {
      resolve({ count: 1, error: null });
    }
  };
  deleteService.createCrudContext = async () => ({
    action: 'delete',
    serviceName: 'planning',
    resourceName: 'planning_category',
    resource: resources.planning_category,
    input: { resource: 'planning_category', id: 'parent-category' },
    data: {},
    context: { accountId: 'account-1' },
    client: { from: () => childQuery },
    id: 'parent-category',
    ids: ['parent-category'],
    meta: {}
  });
  deleteService.assertPermission = async () => undefined;
  deleteService.accountValue = () => 'account-1';

  await assert.rejects(
    () => deleteService.execute(
      'deleteItem',
      { resource: 'planning_category', id: 'parent-category' },
      { accountId: 'account-1' }
    ),
    /存在子类别，不能删除/
  );
}

void Promise.all([
  testPlanningPayloadNormalization(),
  testConsoleOptionBoundary(),
  testConsoleReadRequiresTheExactInternalCapability(),
  testCategoryRelationOptions(),
  testCategoryDeleteRejectsChildren()
]).then(() => {
  console.log('planning service configuration tests passed');
});
