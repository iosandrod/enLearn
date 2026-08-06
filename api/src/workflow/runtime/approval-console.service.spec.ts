import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkflowSupabaseService } from '../common/workflow-supabase.service';
import type { DefinitionService } from '../definition/definition.service';
import type { TriggerCredentialsService } from '../trigger/trigger-credentials.service';
import { ApprovalConsoleService } from './approval-console.service';
import type { RuntimeService } from './runtime.service';

async function main() {
  await testConsoleListIsTenantScopedAndAggregated();
  await testConsoleDetailBuildsNodeStatesAndTriggerRun();
  console.log('workflow-api approval console Supabase RPC tests passed');
}

async function testConsoleListIsTenantScopedAndAggregated() {
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
  const service = createService({
    rpc: async (action, payload) => {
      calls.push({ action, payload });
      return {
        rows: [{
          id: 'instance-1',
          definition_id: 'definition-1',
          definition_version: 2,
          definition_code: 'purchase',
          definition_name: 'Purchase approval',
          business_key: 'purchase-1',
          document_type: 'purchase',
          document_id: 'PO-1',
          title: 'Purchase approval PO-1',
          status: 'running',
          initiator_id: 'user-1',
          trigger_run_id: 'run-1',
          started_at: '2026-08-05T00:00:00.000Z',
          ended_at: null,
          initiator_name: 'Zhang San',
          initiator_nickname: null,
          initiator_email: 'zhangsan@example.test',
          node_count: 3,
          completed_node_count: 1,
          current_node_names: ['Department approval'],
          task_count: 1,
          active_task_count: 1
        }],
        total: 1,
        limit: 25,
        offset: 0,
        summary: {
          total: 1,
          running: 1,
          approved: 0,
          rejected: 0,
          canceled: 0,
          terminated: 0,
          failed: 0
        },
        definitions: [{
          id: 'definition-1',
          code: 'purchase',
          name: 'Purchase approval',
          version: 2,
          status: 'active'
        }]
      };
    }
  });
  const result = await service.listInstances('tenant-1', {
    status: 'running',
    search: 'Purchase',
    limit: 25
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].definitionName, 'Purchase approval');
  assert.equal(result.rows[0].completedNodeCount, 1);
  assert.equal(result.summary.running, 1);
  assert.equal(result.summary.total, 1);
  assert.equal(calls[0].action, 'list');
  assert.equal(calls[0].payload.account_id, 'tenant-1');
  assert.equal(calls[0].payload.search, 'Purchase');
}

async function testConsoleDetailBuildsNodeStatesAndTriggerRun() {
  const runtimeService = {
    getInstance: async () => ({
      id: 'instance-1',
      tenantId: 'tenant-1',
      definitionId: 'definition-1',
      definitionVersion: 1,
      businessKey: 'business-1',
      title: 'Test approval',
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
          name: 'Start',
          status: 'completed',
          startedAt: '2026-08-05T00:00:00.000Z',
          endedAt: '2026-08-05T00:00:01.000Z'
        },
        {
          id: 'node-instance-approval',
          processInstanceId: 'instance-1',
          nodeId: 'approval',
          nodeType: 'approval',
          name: 'Department approval',
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
          title: 'Department approval',
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
      name: 'Test approval',
      version: 1,
      status: 'active',
      publishedAt: '2026-08-05T00:00:00.000Z',
      schema: {
        schemaVersion: 1,
        code: 'test',
        name: 'Test approval',
        nodes: [
          { id: 'start', type: 'start', name: 'Start' },
          { id: 'approval', type: 'approval', name: 'Department approval' },
          { id: 'end', type: 'end', name: 'End' }
        ],
        edges: []
      }
    })
  } as unknown as DefinitionService;
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
    runtimeService,
    definitionService,
    triggerCredentials,
    rpc: async () => ({
      candidates: [],
      users: [
        { id: 'user-1', name: 'Requester', email: 'owner@example.test' },
        { id: 'user-2', name: 'Approver', email: 'approver@example.test' }
      ]
    })
  });
  const detail = await service.getInstanceDetail('instance-1', 'tenant-1');

  assert.deepEqual(
    detail.nodeStates.map((node) => [node.nodeId, node.status]),
    [['start', 'completed'], ['approval', 'waiting'], ['end', 'pending']]
  );
  assert.equal(detail.nodeStates[1].activeTaskCount, 1);
  assert.equal(detail.instance.definitionName, 'Test approval');
  assert.equal(detail.instance.initiatorName, 'Requester');
  assert.equal(detail.instance.initiatorEmail, 'owner@example.test');
  assert.equal(detail.users[1].email, 'approver@example.test');
  assert.equal(detail.triggerRun?.status, 'WAITING');
}

type RpcHandler = (
  action: string,
  payload: Record<string, unknown>
) => Promise<unknown>;

function createService(overrides: {
  rpc?: RpcHandler;
  runtimeService?: RuntimeService;
  definitionService?: DefinitionService;
  triggerCredentials?: TriggerCredentialsService;
}) {
  const client = {
    rpc: async (
      functionName: string,
      args: { p_action: string; p_payload: Record<string, unknown> }
    ) => {
      assert.equal(functionName, 'workflow_approval_console_command');
      return {
        data: await (overrides.rpc ?? (async () => ({})))(args.p_action, args.p_payload),
        error: null
      };
    }
  } as unknown as SupabaseClient;
  const persistence = { isConfigured: true, client } as WorkflowSupabaseService;
  return new ApprovalConsoleService(
    persistence,
    overrides.runtimeService ?? ({} as RuntimeService),
    overrides.definitionService ?? ({} as DefinitionService),
    overrides.triggerCredentials ?? ({} as TriggerCredentialsService)
  );
}

void main();
