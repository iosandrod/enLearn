import assert from 'node:assert/strict';

import { BaseService, type ResourceConfigMap } from './base.service';
import type { ServiceContext } from './interfaces/service-executor';

class RequiredFilterTestService extends BaseService {
  calls = 0;

  protected override resources(): ResourceConfigMap {
    return {
      test_rows: {
        tableName: 'test_rows',
        list: { defaultSorts: [{ field: 'id', direction: 'asc' }] }
      }
    };
  }

  protected override async runCrud(...args: Parameters<BaseService['runCrud']>) {
    this.calls += 1;
    return super.runCrud(...args);
  }
}

async function main() {
  const service = new RequiredFilterTestService();
  const context = {} as ServiceContext;

  assert.deepEqual(
    await service.execute('listItems', {
      resource: 'test_rows',
      filters: { id: '' },
      requiredFilters: ['id']
    }, context),
    []
  );
  assert.equal(service.calls, 0, 'missing required filters must not reach the database');

  for (const unresolved of ['__none__', '{{ route.query.id }}']) {
    assert.deepEqual(
      await service.execute('listItems', {
        resource: 'test_rows',
        filters: { id: unresolved },
        requiredFilters: ['id']
      }, context),
      []
    );
  }
  assert.equal(service.calls, 0, 'placeholder required filters must not reach the database');

  assert.deepEqual(
    await service.execute('listItems', {
      resource: 'test_rows',
      filters: { id: { op: 'in', value: ['__none__'] } },
      requiredFilters: ['id']
    }, context),
    []
  );
  assert.equal(service.calls, 0, 'placeholder filter operands must not reach the database');

  assert.deepEqual(
    await service.execute('listItems', {
      resource: 'test_rows',
      filters: {},
      required_filters: ['id'],
      responseMode: 'page',
      page: 2,
      pageSize: 25
    }, context),
    { rows: [], total: 0, page: 2, pageSize: 25 }
  );
  assert.equal(service.calls, 0, 'paged missing filters must not reach the database');

  console.log('required list filter tests passed');
}

void main();
