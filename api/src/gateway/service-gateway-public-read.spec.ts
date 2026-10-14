import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';

import { ServiceGatewayController } from './service-gateway.controller';

async function main() {
  const invocations: Array<Record<string, unknown>> = [];
  const controller = new ServiceGatewayController({
    async invoke(
      serviceName: string,
      serviceMethod: string,
      postData: Record<string, unknown>,
      context: Record<string, unknown>,
    ) {
      invocations.push({ serviceName, serviceMethod, postData, context });
      return [];
    },
  } as never);

  const response = await controller.service({
    serviceName: 'admin',
    serviceMethod: 'listItems',
    postData: { resource: 'print_templates' },
  });

  assert.deepEqual(response.data, []);
  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0].context, {
    authorization: undefined,
    requestId: undefined,
    serviceName: 'admin',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(invocations[0].context, 'accountId'), false);

  const tablePostData = {
    tableName: 'public.print_templates',
    limit: 1000,
    sorts: [{ field: 'updated_at', direction: 'desc' }],
    pageSize: 5,
    responseMode: 'page',
    page: 1,
    offset: 0,
  };
  await controller.service({
    serviceName: 'admin',
    serviceMethod: 'listItems',
    postData: tablePostData,
  });
  assert.equal(invocations.length, 2);
  assert.deepEqual(invocations[1].postData, tablePostData);
  assert.deepEqual(invocations[1].context, invocations[0].context);

  await controller.service({
    serviceName: 'print', serviceMethod: 'listItems', postData: tablePostData,
  });
  assert.deepEqual(invocations[2].context, {
    authorization: undefined, requestId: undefined, serviceName: 'print',
  });

  await assert.rejects(
    controller.service({
      serviceName: 'admin',
      serviceMethod: 'saveItem',
      postData: { resource: 'print_templates', data: {} },
    }),
    (error: unknown) => error instanceof UnauthorizedException && error.message === '未登录',
  );

  const submission = { formCode: 'print-designer.feedback', data: { title: '反馈' } };
  await controller.service({ serviceName: 'lowcode', serviceMethod: 'submitForm', postData: submission });
  assert.deepEqual(invocations.at(-1), {
    serviceName: 'lowcode', serviceMethod: 'submitForm', postData: submission,
    context: { authorization: undefined, requestId: undefined, serviceName: 'lowcode' },
  });
  await controller.service(
    { serviceName: 'lowcode', serviceMethod: 'submitForm', postData: submission },
    'Bearer authenticated-feedback',
  );
  assert.deepEqual(invocations.at(-1)?.context, {
    authorization: 'Bearer authenticated-feedback', requestId: undefined, serviceName: 'lowcode',
  });
  // Default form authentication remains enforced by the submitForm RPC.
  // Other lowcode writes must still require an active account at the gateway.
  await assert.rejects(
    controller.service({ serviceName: 'lowcode', serviceMethod: 'saveItem', postData: {} }),
    (error: unknown) => error instanceof UnauthorizedException,
  );

  console.log('Service gateway public reads and form submission routing tests passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
