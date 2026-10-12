import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import type { CrudContext, ResourceConfigMap } from './base.service';

const USER_ID = '00000000-0000-4000-8000-000000000111';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000222';
const FAILURE_MESSAGE = '保存失败：未返回保存记录，请检查记录是否存在及是否具有写入权限。';

function isSaveFailure(error: unknown) {
  return error instanceof ConflictException && error.getStatus() === 409 && error.message === FAILURE_MESSAGE;
}

async function main() {
  const originalFetch = globalThis.fetch;
  const envKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  process.env.SUPABASE_URL = 'https://save-result.test';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  let claimState = 'claimed';
  let completed = 0;
  let released = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, 'save-result.test', 'tests must never contact the real database');
    const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json({ id: USER_ID, aud: 'authenticated' });
    if (url.pathname.endsWith('/rpc/get_accounts')) {
      return json([{ account_id: ACCOUNT_ID, account_role: 'owner', status: 'active' }]);
    }
    if (url.pathname.endsWith('/rpc/claim_service_request_idempotency')) return json({ state: claimState, response: null });
    if (url.pathname.endsWith('/rpc/complete_service_request_idempotency')) { completed += 1; return json(null); }
    if (url.pathname.endsWith('/rpc/release_service_request_idempotency')) { released += 1; return json(null); }
    throw new Error(`Unexpected mock request: ${url.pathname}`);
  };
  try {
    const { BaseService } = await import('./base.service');
    const { ServiceGatewayController } = await import('../gateway/service-gateway.controller');
    const { clearServiceIdempotencyCache } = await import('./request-idempotency');

    class SaveService extends BaseService {
      rpcResult: unknown = null;
      clearResultInHook = false;
      errorHookCalls = 0;
      protected override resources(): ResourceConfigMap {
        return {
          test_rows: {
            tableName: 'test_rows', clientMode: 'user',
            create: { allowedFields: ['name'], timestamp: false },
            update: { allowedFields: ['name'], timestamp: false },
          },
        };
      }
      protected override async createCrudClient() {
        return { rpc: async () => ({ data: this.rpcResult, error: null }) } as never;
      }
      protected override async tryReadCurrentUser() { return { id: USER_ID } as never; }
      protected override async inspectTableHasUserIdColumn() { return false; }
      protected override hooks() {
        return { test_rows: {
          afterAction: (ctx: CrudContext) => { if (this.clearResultInHook) ctx.result = null; },
          onError: () => { this.errorHookCalls += 1; },
        } };
      }
    }

    const service = new SaveService();
    const context = { serviceName: 'admin', accountId: ACCOUNT_ID };
    for (const result of [null, undefined, [], [null]]) {
      service.rpcResult = result;
      for (const postData of [
        { tableName: 'test_rows', data: { name: 'new' } },
        { tableName: 'public.test_rows', id: 'row-1', data: { name: 'updated' } },
      ]) {
        await assert.rejects(service.execute('saveItem', postData, context), isSaveFailure);
      }
    }
    assert.equal(service.errorHookCalls, 8, 'empty saves must enter the normal failure hook');
    const saved = { id: 'row-1', name: 'saved' };
    service.rpcResult = saved;
    assert.deepEqual(await service.execute('saveItem', {
      resource: 'test_rows', id: 'row-1', data: { name: 'saved' },
    }, context), saved);
    service.clearResultInHook = true;
    await assert.rejects(service.execute('saveItem', {
      resource: 'test_rows', id: 'row-1', data: { name: 'saved' },
    }, context), isSaveFailure, 'after hooks must not turn a save into a successful null response');

    let routedResult: unknown = null;
    let routerCalls = 0;
    const controller = new ServiceGatewayController({
      async invoke() { routerCalls += 1; return routedResult; },
    } as never);
    const body = { serviceName: 'admin', serviceMethod: 'saveItem', postData: { tableName: 'print_templates', id: 'row-1' } };
    const logger = (controller as unknown as { logger: { warn: (message: string) => void; log: (message: string) => void } }).logger;
    const warnings: string[] = [];
    const successes: string[] = [];
    logger.warn = (message) => { warnings.push(message); };
    logger.log = (message) => { successes.push(message); };
    for (const result of [null, undefined, [], [null]]) {
      routedResult = result;
      await assert.rejects(controller.service(body, 'Bearer test', undefined, ACCOUNT_ID), isSaveFailure);
    }
    assert.equal(successes.length, 0);
    assert.ok(warnings.every((warning) => warning.includes(FAILURE_MESSAGE)));

    await assert.rejects(controller.service(body, 'Bearer test', 'save-null-retry', ACCOUNT_ID), isSaveFailure);
    assert.equal(completed, 0, 'failed saves must not be persisted as successful idempotency responses');
    assert.equal(released, 1);
    routedResult = saved;
    assert.deepEqual((await controller.service(body, 'Bearer test', 'save-null-retry', ACCOUNT_ID)).data, saved);
    assert.equal(completed, 1, 'a failed save must remain retryable with the same request id');

    clearServiceIdempotencyCache();
    claimState = 'completed';
    const callsBeforeReplay = routerCalls;
    await assert.rejects(controller.service(body, 'Bearer test', 'old-null-result', ACCOUNT_ID), isSaveFailure);
    assert.equal(routerCalls, callsBeforeReplay, 'old cached null responses must be rejected without repeating writes');
    console.log('Empty save result, error logging, and idempotency regression tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
