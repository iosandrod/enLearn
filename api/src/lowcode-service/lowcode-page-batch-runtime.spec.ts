import assert from 'node:assert/strict';
import { LowCodeService } from './lowcode.service';

async function testBatchRuntimePageLookup() {
  const service = new LowCodeService() as unknown as {
    listItems: (postData: Record<string, unknown>, context: unknown) => Promise<unknown>;
    isRuntimePageBatchRequest: (postData: Record<string, unknown>) => boolean;
    getRuntimePagesByCodes: (codes: string[], context: unknown) => Promise<unknown>;
    getRuntimePage: (lookup: Record<string, unknown>, context: unknown) => Promise<unknown>;
  };
  const request = {
    tableName: 'lowcode_pages',
    filters: { code: ['print-designer', 'print-templates', 'print-templates-edit'] },
    includeData: true,
    limit: 3,
  };
  const context = { serviceName: 'lowcode' };
  const expected = request.filters.code.map((code) => ({
    code, runtime_functions: [{ function_name: 'refresh', enabled: true }],
  }));
  service.getRuntimePagesByCodes = async (codes, receivedContext) => {
    assert.deepEqual(codes, request.filters.code);
    assert.equal(receivedContext, context);
    return expected;
  };
  assert.deepEqual(await service.listItems(request, context), expected);
  for (const overrides of [
    { resource: 'lowcode_pages' },
    { filters: { code: request.filters.code, status: 'draft' } },
    { filters: { code: [] } },
    { limit: 1 },
    { offset: 1 },
    { page: 2 },
    { withCount: true },
  ]) {
    assert.equal(service.isRuntimePageBatchRequest({ ...request, ...overrides }), false);
  }
  service.getRuntimePage = async (lookup) => {
    assert.equal(lookup.code, 'print-templates');
    return expected[1];
  };
  assert.deepEqual(await service.listItems({
    tableName: 'lowcode_pages', filters: { code: 'print-templates' }, limit: 1,
  }, context), [expected[1]], 'Single-page lookups must retain runtime preparation.');
}

void testBatchRuntimePageLookup()
  .then(() => console.log('low-code batch runtime page lookup tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
