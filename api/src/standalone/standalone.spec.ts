import assert from 'node:assert/strict';

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

  console.log('standalone routing tests passed');
}

void run();
