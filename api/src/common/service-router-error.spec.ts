import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { of } from 'rxjs';
import { ServiceRouterService } from '../gateway/service-router.service';

const domainClient = {
  send: () => of({
    success: false,
    error: {
      message: 'Cross-account access denied.',
      statusCode: 403
    }
  })
};
const workflowService = {
  execute: async () => undefined
};
const router = new ServiceRouterService(
  domainClient as never,
  workflowService as never
);

async function main() {
  await assert.rejects(
    () => router.invoke('chat', 'sendMessage', {}, {}),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 403);
      assert.equal(error.message, 'Cross-account access denied.');
      return true;
    }
  );

  console.log('service router error propagation tests passed');
}

void main();
