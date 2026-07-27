import { strict as assert } from 'node:assert';
import {
  assertValidWorkflowModel,
  prepareWorkflowModel,
  validateWorkflowModel
} from './validate';
import type { WorkflowModel } from '../schema/types';

function createSimpleWorkflow(overrides: Partial<WorkflowModel> = {}): WorkflowModel {
  return {
    schemaVersion: 1,
    code: 'expense_approval',
    name: 'Expense Approval',
    nodes: [
      { id: 'start', type: 'start', name: 'Start' },
      {
        id: 'manager_approval',
        type: 'approval',
        name: 'Manager Approval',
        config: {
          assigneeStrategy: {
            type: 'initiatorManager',
            level: 1
          }
        }
      },
      { id: 'end', type: 'end', name: 'End' }
    ],
    edges: [
      { id: 'edge_start_manager', source: 'start', target: 'manager_approval' },
      { id: 'edge_manager_end', source: 'manager_approval', target: 'end' }
    ],
    ...overrides
  };
}

function hasMessage(issues: ReturnType<typeof validateWorkflowModel>, keyword: string) {
  return issues.some((issue) => issue.message.includes(keyword));
}

assert.doesNotThrow(() => assertValidWorkflowModel(createSimpleWorkflow()));

const normalized = prepareWorkflowModel({
  code: 'simple',
  name: 'Simple',
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'approval',
      type: 'approval',
      name: 'Approval',
      config: { assigneeStrategy: { type: 'users', userIds: ['u1'] } }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'approval' },
    { id: 'e2', source: 'approval', target: 'end' }
  ]
});
assert.equal(normalized.schemaVersion, 1);
assert.equal(normalized.settings?.duplicateSubmitPolicy, 'reject');

const missingStart = createSimpleWorkflow({
  nodes: createSimpleWorkflow().nodes.filter((node) => node.type !== 'start')
});
assert.ok(hasMessage(validateWorkflowModel(missingStart), 'exactly one start node'));

const missingEnd = createSimpleWorkflow({
  nodes: createSimpleWorkflow().nodes.filter((node) => node.type !== 'end')
});
assert.ok(hasMessage(validateWorkflowModel(missingEnd), 'at least one end node'));

const danglingEdge = createSimpleWorkflow({
  edges: [
    { id: 'edge_start_manager', source: 'start', target: 'manager_approval' },
    { id: 'edge_manager_missing', source: 'manager_approval', target: 'missing' }
  ]
});
assert.ok(hasMessage(validateWorkflowModel(danglingEdge), 'does not exist'));

const duplicateNodes = createSimpleWorkflow({
  nodes: [
    ...createSimpleWorkflow().nodes,
    { id: 'manager_approval', type: 'approval', name: 'Duplicate Manager' }
  ]
});
assert.ok(hasMessage(validateWorkflowModel(duplicateNodes), 'Duplicate node ID'));

const missingAssignee = createSimpleWorkflow({
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    { id: 'approval', type: 'approval', name: 'Approval' },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'approval' },
    { id: 'e2', source: 'approval', target: 'end' }
  ]
});
assert.ok(hasMessage(validateWorkflowModel(missingAssignee), 'assignee strategy'));

const conditionWorkflow = createSimpleWorkflow({
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    { id: 'amount_condition', type: 'condition', name: 'Amount Condition' },
    {
      id: 'manager_approval',
      type: 'approval',
      name: 'Manager Approval',
      config: { assigneeStrategy: { type: 'roles', roleCodes: ['manager'] } }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'amount_condition' },
    {
      id: 'e2',
      source: 'amount_condition',
      target: 'manager_approval',
      condition: { type: 'field', field: 'amount', operator: 'gte', value: 1000 }
    },
    {
      id: 'e3',
      source: 'amount_condition',
      target: 'end',
      condition: { type: 'always' }
    },
    { id: 'e4', source: 'manager_approval', target: 'end' }
  ]
});
assert.doesNotThrow(() => assertValidWorkflowModel(conditionWorkflow));

const advancedWorkflow = createSimpleWorkflow({
  code: 'advanced_approval',
  name: 'Advanced Approval',
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'sign',
      type: 'sign',
      name: 'Countersign',
      config: {
        assigneeStrategy: { type: 'users', userIds: ['u1', 'u2'] },
        completionStrategy: 'all'
      }
    },
    {
      id: 'service',
      type: 'serviceTask',
      name: 'Sync Document',
      config: {
        serviceName: 'document',
        serviceMethod: 'markApproved'
      }
    },
    {
      id: 'timer',
      type: 'timer',
      name: 'Delay Notice',
      config: {
        delaySeconds: 0
      }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'sign' },
    { id: 'e2', source: 'sign', target: 'service' },
    { id: 'e3', source: 'service', target: 'timer' },
    { id: 'e4', source: 'timer', target: 'end' }
  ]
});
assert.doesNotThrow(() => assertValidWorkflowModel(advancedWorkflow));

const datetimeTimerWorkflow = createSimpleWorkflow({
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'timer',
      type: 'timer',
      name: 'Delay Until Date',
      config: {
        mode: 'datetime',
        datetime: '2026-07-27T10:00:00+08:00',
        action: 'continue'
      }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'timer' },
    { id: 'e2', source: 'timer', target: 'end' }
  ]
});
assert.doesNotThrow(() => assertValidWorkflowModel(datetimeTimerWorkflow));

const invalidTimerWorkflow = createSimpleWorkflow({
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'timer',
      type: 'timer',
      name: 'Invalid Timer',
      config: {
        mode: 'delay',
        duration: 'two-hours'
      }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'timer' },
    { id: 'e2', source: 'timer', target: 'end' }
  ]
});
assert.ok(hasMessage(validateWorkflowModel(invalidTimerWorkflow), 'ISO-8601'));

const invalidServiceTaskWorkflow = createSimpleWorkflow({
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'service',
      type: 'serviceTask',
      name: 'Invalid Service',
      config: {
        timeoutSeconds: 0,
        retry: {
          maxAttempts: -1
        }
      }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'service' },
    { id: 'e2', source: 'service', target: 'end' }
  ]
});
assert.ok(hasMessage(validateWorkflowModel(invalidServiceTaskWorkflow), 'requires serviceName/serviceMethod or url'));
assert.ok(hasMessage(validateWorkflowModel(invalidServiceTaskWorkflow), 'timeoutSeconds'));
assert.ok(hasMessage(validateWorkflowModel(invalidServiceTaskWorkflow), 'maxAttempts'));

const invalidRatioSignWorkflow = createSimpleWorkflow({
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'sign',
      type: 'sign',
      name: 'Countersign',
      config: {
        assigneeStrategy: { type: 'users', userIds: ['u1', 'u2'] },
        completionStrategy: 'ratio',
        passRatio: 2
      }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'sign' },
    { id: 'e2', source: 'sign', target: 'end' }
  ]
});
assert.ok(hasMessage(validateWorkflowModel(invalidRatioSignWorkflow), 'passRatio'));

console.log('workflow-schema validator tests passed');
