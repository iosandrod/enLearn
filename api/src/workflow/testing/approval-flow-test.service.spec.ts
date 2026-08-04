import { strict as assert } from 'node:assert';
import type { DefinitionService } from '../definition/definition.service';
import type { RuntimeService } from '../runtime/runtime.service';
import { ApprovalFlowTestService } from './approval-flow-test.service';

const tenantId = '00000000-0000-4000-8000-000000000001';
const userId = '90f8c866-56d2-4a0d-aa8c-e50534a97ebd';

async function main() {
  let getInstanceCalls = 0;
  let startedDefinitionId = '';

  const definitionService = {
    saveModel: async () => ({ id: 'model-1' }),
    publishModel: async () => ({ definition: { id: 'definition-1' } })
  } as unknown as DefinitionService;
  const runtimeService = {
    startInstance: async (input: { definitionId: string }) => {
      startedDefinitionId = input.definitionId;
      return {
        id: 'instance-1',
        tenantId,
        definitionId: input.definitionId,
        definitionVersion: 1,
        businessKey: 'approval-test',
        title: 'Approval test',
        status: 'running' as const,
        triggerRunId: 'run-1',
        startedAt: new Date().toISOString(),
        variables: [],
        comments: [],
        ccItems: [],
        nodeInstances: [],
        tasks: []
      };
    },
    getInstance: async () => {
      getInstanceCalls += 1;
      throw new Error('runOneClick must not poll inside the HTTP request');
    },
    getTimeline: async () => []
  } as unknown as RuntimeService;

  const service = new ApprovalFlowTestService(definitionService, runtimeService);
  const result = await service.runOneClick(
    {
      approverIds: [userId]
    },
    { tenantId, userId }
  );

  assert.equal(startedDefinitionId, 'definition-1');
  assert.equal(getInstanceCalls, 0);
  assert.equal(result.started, true);
  assert.equal(result.instanceId, 'instance-1');
  assert.equal(result.instanceStatus, 'running');
  assert.deepEqual(result.pendingTasks, []);
  assert.deepEqual(result.finalTasks, []);

  console.log('workflow approval one-click async launch tests passed');
}

void main();
