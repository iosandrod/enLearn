import assert from 'node:assert/strict';
import { compileTriggerWorkflow } from '../src/compiler/trigger';
import { createTriggerWorkflowTaskExamples } from '../src/examples/task-examples';
import { assertValidTriggerWorkflow } from '../src/schema/validate';

const examples = createTriggerWorkflowTaskExamples();

assert.equal(examples.length, 6);
assert.equal(new Set(examples.map((example) => example.code)).size, examples.length);

const expectedTaskTypes = new Set([
  'frontendCommand',
  'backendCommand',
  'storedProcedure',
  'registeredTask'
]);
const actualTaskTypes = new Set<string>();

for (const example of examples) {
  assert.doesNotThrow(() => assertValidTriggerWorkflow(example), `${example.code} should be valid`);
  assert.equal(
    example.nodes.filter((node) => ['start', 'schedule', 'webhook'].includes(node.type)).length,
    1,
    `${example.code} should have exactly one entry node`
  );
  assert.equal(
    example.nodes.some((node) => node.type === 'schedule'),
    false,
    `${example.code} should demonstrate a non-scheduled workflow`
  );

  for (const operation of compileTriggerWorkflow(example).operations) {
    if (operation.task?.type) actualTaskTypes.add(operation.task.type);
  }
}

assert.deepEqual(actualTaskTypes, expectedTaskTypes);

const registered = examples.find(
  (example) => example.code === 'example_registered_notification_dispatch'
);
assert.ok(registered);
assert.deepEqual(compileTriggerWorkflow(registered).taskIds, ['notification.dispatch']);

const storedProcedure = examples.find(
  (example) => example.code === 'example_stored_procedure_publish_plan'
);
assert.equal(
  storedProcedure?.nodes.find((node) => node.type === 'task')?.config?.task?.procedureName,
  'planning_publish_plan_version'
);

const supabaseRpc = examples.find(
  (example) => example.code === 'example_backend_supabase_inventory_query'
);
const supabaseFunction = supabaseRpc?.nodes.find(
  (node) => node.type === 'task'
)?.config?.task?.backendFunction ?? '';
assert.match(supabaseFunction, /context\.supabase\.rpc/);
assert.doesNotMatch(supabaseFunction, /context\.supabase\.from/);

for (const example of examples) {
  for (const node of example.nodes) {
    assert.equal(
      node.config?.task?.queue?.name,
      undefined,
      `${example.code} must not reference a queue that is absent from the worker manifest`
    );
  }
}

console.log('trigger-workflow-editor task example tests passed');
