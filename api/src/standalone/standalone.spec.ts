import assert from 'node:assert/strict';

import { LocalWorkflowClient } from './local-workflow-client';
import { StandaloneServiceRouter } from './standalone-service-router.service';

async function run() {
  const context = {
    accountId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002'
  };
  const domainCalls: unknown[][] = [];
  const workflowCalls: unknown[][] = [];
  const router = new StandaloneServiceRouter(
    {
      invoke: async (...args: unknown[]) => {
        domainCalls.push(args);
        return 'domain-result';
      }
    } as never,
    {
      execute: async (...args: unknown[]) => {
        workflowCalls.push(args);
        return 'workflow-result';
      }
    } as never
  );

  assert.equal(await router.invoke('admin', 'listItems', {}, context), 'domain-result');
  assert.equal(domainCalls.length, 1);
  assert.equal(workflowCalls.length, 0);

  assert.equal(await router.invoke('workflow', 'getTask', {}, context), 'workflow-result');
  assert.equal(domainCalls.length, 1);
  assert.equal(workflowCalls.length, 1);

  const requests: unknown[] = [];
  const client = new LocalWorkflowClient({
    handleRequest: async (request: unknown) => {
      requests.push(request);
      return { success: true, data: 'local-result' };
    }
  } as never);
  const request = { method: 'GET' as const, path: '/health' };
  const payload = await new Promise<unknown>((resolve, reject) => {
    client.send('workflow.request', request).subscribe({ next: resolve, error: reject });
  });

  assert.deepEqual(payload, { success: true, data: 'local-result' });
  assert.deepEqual(requests, [request]);

  console.log('standalone routing tests passed');
}

void run();
