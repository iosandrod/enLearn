import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { InternalServiceController } from './internal-service.controller';

const previousKey = process.env.WORKFLOW_INTERNAL_KEY;
process.env.WORKFLOW_INTERNAL_KEY = 'test-workflow-internal-key';

void main().finally(() => {
  if (previousKey === undefined) delete process.env.WORKFLOW_INTERNAL_KEY;
  else process.env.WORKFLOW_INTERNAL_KEY = previousKey;
});

async function main() {
  await testAllowedCapabilityReceivesTrustedContext();
  await testUnknownMethodIsRejectedBeforeRouting();
  await testBroadCrudAndCallerSuppliedInternalContextAreRejected();
  console.log('workflow internal service capability tests passed');
}

async function testAllowedCapabilityReceivesTrustedContext() {
  let invocation: Record<string, unknown> | undefined;
  const controller = createController(async (
    serviceName,
    serviceMethod,
    postData,
    context
  ) => {
    invocation = { serviceName, serviceMethod, postData, context };
    return [{ id: 'scenario-1', label: 'Scenario 1' }];
  });

  const result = await controller.service({
    serviceName: 'planning',
    serviceMethod: 'getPlanningConsoleOptions',
    postData: { optionType: 'scenario' },
    context: {
      accountId: 'account-1',
      userId: 'user-1',
      requestId: 'request-1',
      authorization: 'caller-controlled',
      internal: { principal: 'caller-controlled', capability: 'admin.anything' }
    }
  }, 'test-workflow-internal-key');

  assert.deepEqual(result.data, [{ id: 'scenario-1', label: 'Scenario 1' }]);
  assert.deepEqual(invocation, {
    serviceName: 'planning',
    serviceMethod: 'getPlanningConsoleOptions',
    postData: { optionType: 'scenario' },
    context: {
      accountId: 'account-1',
      userId: 'user-1',
      requestId: 'request-1',
      internal: {
        principal: 'trigger-workflow',
        capability: 'planning.getPlanningConsoleOptions'
      }
    }
  });
}

async function testUnknownMethodIsRejectedBeforeRouting() {
  let routed = false;
  const controller = createController(async () => {
    routed = true;
    return null;
  });
  await assert.rejects(
    () => controller.service({
      serviceName: 'planning',
      serviceMethod: 'runSupplyPlan',
      postData: {},
      context: { accountId: 'account-1' }
    }, 'test-workflow-internal-key'),
    (error: unknown) => error instanceof ForbiddenException &&
      /capability is not allowed/.test(error.message)
  );
  assert.equal(routed, false);
}

async function testBroadCrudAndCallerSuppliedInternalContextAreRejected() {
  const controller = createController(async () => null);
  await assert.rejects(
    () => controller.service({
      serviceName: 'planning',
      serviceMethod: 'listInventoryBuffers',
      postData: { resource: 'planning_buffer' },
      context: {
        accountId: 'account-1',
        internal: { principal: 'trigger-workflow', capability: 'planning.listInventoryBuffers' }
      }
    }, 'test-workflow-internal-key'),
    /does not accept field: resource/
  );
}

function createController(
  invoke: (
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
    context: Record<string, unknown>
  ) => Promise<unknown>
) {
  return new InternalServiceController({ invoke } as never);
}
