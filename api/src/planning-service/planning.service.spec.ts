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

assert.equal(PLANNING_MODEL_DEFINITIONS.length, 41);
assert.equal(Object.keys(resources).length, 41);
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

assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.access === 'view').length, 8);
assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.key === 'planning_parameter').length, 1);
assert.equal(PLANNING_MODEL_DEFINITIONS.filter((model) => model.key === 'planning_forecastplan').length, 1);

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

void testPlanningPayloadNormalization().then(() => {
  console.log('planning service configuration tests passed');
});
