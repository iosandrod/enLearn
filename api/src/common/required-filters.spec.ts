import assert from 'node:assert/strict';

import {
  BaseService,
  type ListFilterCondition,
  type ListFilterGroup,
  type ResourceConfigMap,
} from './base.service';
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

class PagedResourceTestService extends BaseService {
  selectOptions: unknown;
  selectedRange: [number, number] | null = null;

  protected override resources(): ResourceConfigMap {
    return {
      test_rows: {
        tableName: 'test_rows',
        list: { defaultSorts: [{ field: 'id', direction: 'asc' }] }
      }
    };
  }

  protected override async createCrudClient() {
    const service = this;
    const query = {
      select(_columns: string, options?: unknown) {
        service.selectOptions = options;
        return this;
      },
      order() {
        return this;
      },
      range(from: number, to: number) {
        service.selectedRange = [from, to];
        return this;
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({
          data: [{ id: 'row-3' }, { id: 'row-4' }],
          error: null,
          count: 7
        }).then(resolve);
      }
    };

    return { from: () => query } as never;
  }

  protected override async tryReadCurrentUser() {
    return undefined;
  }
}

class FilterGroupTestService extends BaseService {
  compile(filters: ListFilterCondition | ListFilterGroup) {
    return this.compileListFilterExpression(filters);
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
      filters: {
        logic: 'and',
        conditions: [{ field: 'id', value: '', required: true }],
      },
    }, context),
    [],
  );
  assert.equal(service.calls, 0, 'required flags on tree conditions must be enforced');

  assert.deepEqual(
    await service.execute('listItems', {
      resource: 'test_rows',
      filters: {
        logic: 'or',
        conditions: [
          { field: 'id', value: '' },
          { field: 'id', value: '{{ forms.search.id }}' }
        ]
      },
      requiredFilters: ['id']
    }, context),
    []
  );
  assert.equal(service.calls, 0, 'unresolved tree-filter values must not reach the database');

  const filterGroupService = new FilterGroupTestService();
  assert.equal(
    filterGroupService.compile({
      logic: 'or',
      conditions: [
        { field: 'status', value: 'active' },
        {
          logic: 'and',
          conditions: [
            { field: 'priority', value: 'high' },
            { field: 'owner_id', value: '{{ forms.search.ownerId }}' }
          ]
        }
      ]
    }),
    'or(status.eq."active",and(priority.eq."high",owner_id.eq."{{ forms.search.ownerId }}"))'
  );

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

  const pagedService = new PagedResourceTestService();
  assert.deepEqual(
    await pagedService.execute('listItems', {
      resource: 'test_rows',
      responseMode: 'page',
      page: 2,
      pageSize: 2
    }, context),
    {
      rows: [{ id: 'row-3' }, { id: 'row-4' }],
      total: 7,
      page: 2,
      pageSize: 2
    }
  );
  assert.deepEqual(pagedService.selectOptions, { count: 'exact' });
  assert.deepEqual(pagedService.selectedRange, [2, 3]);

  console.log('required list filter tests passed');
}

void main();
