import assert from 'node:assert/strict';
import type { DatabaseService } from '../common/database.service';
import type { DefinitionService } from '../definition/definition.service';
import type { TriggerCredentialsService } from '../trigger/trigger-credentials.service';
import { ApprovalConsoleService } from './approval-console.service';
import type { RuntimeService } from './runtime.service';

async function main() {
  await testConsoleListIsTenantScopedAndAggregated();
  await testConsoleDetailBuildsNodeStatesAndTriggerRun();
  console.log('workflow-api approval console tests passed');
}

async function testConsoleListIsTenantScopedAndAggregated() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const database = {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes('count(*) over()')) {
        return {
          rows: [{
            id: 'instance-1',
            definition_id: 'definition-1',
            definition_version: 2,
            definition_code: 'purchase',
            definition_name: '采购审批',
            business_key: 'purchase-1',
            document_type: 'purchase',
            document_id: 'PO-1',
            title: '采购审批 PO-1',
            status: 'running',
            initiator_id: 'user-1',
            trigger_run_id: 'run-1',
            started_at: new Date('2026-08-05T00:00:00.000Z'),
            ended_at: null,
            initiator_name: '张三',
            initiator_nickname: null,
            initiator_email: 'zhangsan@example.test',
            node_count: 3,
            completed_node_count: 1,
            current_node_names: ['部门审批'],
            task_count: 1,
            active_task_count: 1,
            total_count: 1
          }]
        };
      }
      if (text.includes('group by status')) {
        return { rows: [{ status: 'running', count: 1 }] };
      }
      return {
        rows: [{ id: 'definition-1', code: 'purchase', name: '采购审批', version: 2, status: 'active' }]
      };
    }
  } as unknown as DatabaseService;

  const service = createService({ database });
  const result = await service.listInstances('tenant-1', {
    status: 'running',
    search: '采购',
    limit: 25
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].definitionName, '采购审批');
  assert.equal(result.rows[0].completedNodeCount, 1);
  assert.equal(result.summary.running, 1);
  assert.equal(result.summary.total, 1);
  assert.equal(calls[0].values[0], 'tenant-1');
  assert.match(calls[0].text, /instances\.account_id = \$1/);
}

async function testConsoleDetailBuildsNodeStatesAndTriggerRun() {
  const runtimeService = {
    getInstance: async () => ({
      id: 'instance-1',
      tenantId: 'tenant-1',
      definitionId: 'definition-1',
      definitionVersion: 1,
      businessKey: 'business-1',
      title: '测试审批',
      status: 'running',
      initiatorId: 'user-1',
      triggerRunId: 'run-1',
      triggerTaskId: 'workflow.instance.run',
      startedAt: '2026-08-05T00:00:00.000Z',
      variables: [],
      comments: [],
      ccItems: [],
      nodeInstances: [
        {
          id: 'node-instance-start',
          processInstanceId: 'instance-1',
          nodeId: 'start',
          nodeType: 'start',
          name: '开始',
          status: 'completed',
          startedAt: '2026-08-05T00:00:00.000Z',
          endedAt: '2026-08-05T00:00:01.000Z'
        },
        {
          id: 'node-instance-approval',
          processInstanceId: 'instance-1',
          nodeId: 'approval',
          nodeType: 'approval',
          name: '部门审批',
          status: 'waiting',
          startedAt: '2026-08-05T00:00:01.000Z'
        }
      ],
      tasks: [
        {
          id: 'task-1',
          tenantId: 'tenant-1',
          processInstanceId: 'instance-1',
          nodeInstanceId: 'node-instance-approval',
          nodeId: 'approval',
          title: '部门审批',
          status: 'pending',
          assigneeId: 'user-2',
          createdAt: '2026-08-05T00:00:01.000Z'
        }
      ]
    }),
    getTimeline: async () => []
  } as unknown as RuntimeService;
  const definitionService = {
    getDefinition: async () => ({
      id: 'definition-1',
      code: 'test',
      name: '测试审批',
      version: 1,
      status: 'active',
      publishedAt: '2026-08-05T00:00:00.000Z',
      schema: {
        schemaVersion: 1,
        code: 'test',
        name: '测试审批',
        nodes: [
          { id: 'start', type: 'start', name: '开始' },
          { id: 'approval', type: 'approval', name: '部门审批' },
          { id: 'end', type: 'end', name: '结束' }
        ],
        edges: []
      }
    })
  } as unknown as DefinitionService;
  const database = {
    query: async (text: string) => {
      if (text.includes('wf_task_candidate')) return { rows: [] };
      return {
        rows: [
          { id: 'user-1', full_name: '发起人', nickname: null, email: 'owner@example.test' },
          { id: 'user-2', full_name: '审批人', nickname: null, email: 'approver@example.test' }
        ]
      };
    }
  } as unknown as DatabaseService;
  const triggerCredentials = {
    getCredentials: async () => ({ environmentId: 'environment-1' }),
    getRun: async () => ({
      id: 'run-1',
      status: 'WAITING',
      taskIdentifier: 'workflow.instance.run',
      tags: [],
      isQueued: false,
      isExecuting: false,
      isWaiting: true,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:01.000Z'
    })
  } as unknown as TriggerCredentialsService;

  const service = createService({
    database,
    runtimeService,
    definitionService,
    triggerCredentials
  });
  const detail = await service.getInstanceDetail('instance-1', 'tenant-1');

  assert.deepEqual(
    detail.nodeStates.map((node) => [node.nodeId, node.status]),
    [['start', 'completed'], ['approval', 'waiting'], ['end', 'pending']]
  );
  assert.equal(detail.nodeStates[1].activeTaskCount, 1);
  assert.equal(detail.instance.definitionName, '测试审批');
  assert.equal(detail.instance.initiatorName, '发起人');
  assert.equal(detail.instance.initiatorEmail, 'owner@example.test');
  assert.equal(detail.users[1].email, 'approver@example.test');
  assert.equal(detail.triggerRun?.status, 'WAITING');
}

function createService(overrides: {
  database?: DatabaseService;
  runtimeService?: RuntimeService;
  definitionService?: DefinitionService;
  triggerCredentials?: TriggerCredentialsService;
}) {
  return new ApprovalConsoleService(
    overrides.database ?? ({} as DatabaseService),
    overrides.runtimeService ?? ({} as RuntimeService),
    overrides.definitionService ?? ({} as DefinitionService),
    overrides.triggerCredentials ?? ({} as TriggerCredentialsService)
  );
}

void main();
