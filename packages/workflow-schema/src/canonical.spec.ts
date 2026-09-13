import assert from 'node:assert/strict';
import {
  assertCanonicalWorkflowCapabilities,
  compileCanonicalWorkflow,
  compileApprovalWorkflow
} from './canonical';

const approval = compileApprovalWorkflow({
  schemaVersion: 1,
  code: 'canonical-approval',
  name: 'Canonical approval',
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    { id: 'sign', type: 'sign', name: 'Sign', config: { assigneeStrategy: { type: 'users', userIds: ['u1', 'u2'] } } },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'sign' },
    { id: 'e2', source: 'sign', target: 'end' }
  ]
});
assert.equal(approval.nodes.find((node) => node.id === 'sign')?.type, 'humanTask');
assert.deepEqual(approval.nodes.find((node) => node.id === 'sign')?.human?.completion, { type: 'all' });

const trigger = compileCanonicalWorkflow({
  schemaVersion: 1,
  code: 'canonical-trigger',
  name: 'Canonical trigger',
  kind: 'custom',
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    { id: 'task', type: 'task', name: 'Task' },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'task' },
    { id: 'e2', source: 'task', target: 'end' }
  ]
});
assert.equal(trigger.nodes.find((node) => node.id === 'task')?.type, 'task');
assert.doesNotThrow(() => assertCanonicalWorkflowCapabilities(trigger));

const triggerHuman = compileCanonicalWorkflow({
  schemaVersion: 1,
  code: 'trigger-human',
  name: 'Trigger human',
  kind: 'approval',
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'review',
      type: 'humanReview',
      name: 'Review',
      config: { completionStrategy: 'ratio', passRatio: 0.6 }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'review' },
    { id: 'e2', source: 'review', target: 'end' }
  ]
});
assert.deepEqual(
  triggerHuman.nodes.find((node) => node.id === 'review')?.human?.completion,
  { type: 'ratio', ratio: 0.6 }
);

console.log('canonical workflow compiler tests passed');
