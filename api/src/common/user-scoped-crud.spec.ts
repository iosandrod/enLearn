import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AdminService } from '../admin-service/admin.service';
import {
  BaseService,
  type CrudContext,
  type ResourceConfigMap,
} from './base.service';
import type { ServiceContext } from './interfaces/service-executor';

const USER_ID = '00000000-0000-4000-8000-000000000111';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000222';

type QueryCall = [string, ...unknown[]];

function createListClient(calls: QueryCall[]) {
  const query = {
    select(...args: unknown[]) {
      calls.push(['select', ...args]);
      return this;
    },
    or(...args: unknown[]) {
      calls.push(['or', ...args]);
      return this;
    },
    is(...args: unknown[]) {
      calls.push(['is', ...args]);
      return this;
    },
    eq(...args: unknown[]) {
      calls.push(['eq', ...args]);
      return this;
    },
    order(...args: unknown[]) {
      calls.push(['order', ...args]);
      return this;
    },
    range(...args: unknown[]) {
      calls.push(['range', ...args]);
      return this;
    },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
    },
  };

  return { from: () => query };
}

class UserScopedService extends BaseService {
  readonly queryCalls: QueryCall[] = [];
  inspectionCount = 0;
  hasUserIdColumn = true;
  ownerField?: string;
  preparedCreate?: Record<string, unknown>;
  preparedUpdate?: Record<string, unknown>;
  dynamicConfig?: Record<string, unknown>;

  protected override resources(): ResourceConfigMap {
    return {
      user_scoped_rows: {
        tableName: 'user_scoped_rows',
        clientMode: 'admin',
        ownerField: this.ownerField,
        create: { allowedFields: ['name'], timestamp: false },
        update: { allowedFields: ['name', 'user_id'], timestamp: false },
      },
    };
  }

  protected override async createCrudClient(): Promise<SupabaseClient> {
    return createListClient(this.queryCalls) as never;
  }

  protected override async tryReadCurrentUser(context: ServiceContext) {
    return context.userId ? { id: context.userId } as never : undefined;
  }

  protected override async inspectTableHasUserIdColumn() {
    this.inspectionCount += 1;
    return this.hasUserIdColumn;
  }

  protected override async assertPermission() {
    return undefined;
  }

  protected override async callDynamicCrudRpc(
    ctx: CrudContext,
    action: 'create' | 'update' | 'delete',
    operation: Record<string, unknown>,
  ) {
    this.dynamicConfig = this.buildDynamicCrudConfig(ctx);
    if (action === 'create') this.preparedCreate = operation;
    if (action === 'update') this.preparedUpdate = operation;
    return operation;
  }
}

class PostgrestUserScopedService extends UserScopedService {
  urls: URL[] = [];

  protected override async createCrudClient() {
    return createClient('https://example.test', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          this.urls.push(new URL(String(input)));
          return new Response('[]', {
            headers: { 'content-type': 'application/json', 'content-range': '0-0/0' },
          });
        },
      },
    });
  }
}

function readFirstItemData(operation?: Record<string, unknown>) {
  const items = operation?.items as Array<{ data: Record<string, unknown> }> | undefined;
  return items?.[0]?.data;
}

class GenericAdminService extends AdminService {
  inserted?: Record<string, unknown>;
  updated?: Record<string, unknown>;

  protected override async resolveGenericTableColumns() {
    return new Set(['id', 'name', 'user_id']);
  }

  protected override async resolveCurrentUserId() {
    return USER_ID;
  }

  protected override async createCrudClient() {
    const service = this;
    const makeWriteQuery = (data: Record<string, unknown>) => ({
      eq() {
        return this;
      },
      select() {
        return this;
      },
      async maybeSingle() {
        return { data: { id: 'row-1', ...data }, error: null };
      },
    });
    return {
      from() {
        return {
          insert(data: Record<string, unknown>) {
            service.inserted = data;
            return makeWriteQuery(data);
          },
          update(data: Record<string, unknown>) {
            service.updated = data;
            return makeWriteQuery(data);
          },
        };
      },
    } as never;
  }

  saveForTest(postData: Record<string, unknown>) {
    return this.saveGenericTableItem(
      'generic_rows',
      postData,
      { authorization: 'Bearer test', userId: USER_ID },
    );
  }
}

async function main() {
  const context: ServiceContext = {
    authorization: 'Bearer test',
    userId: USER_ID,
  };
  const service = new UserScopedService();

  await service.execute('listItems', { resource: 'user_scoped_rows' }, context);
  assert.deepEqual(
    service.queryCalls.find(([name]) => name === 'or'),
    ['or', `user_id.eq.\"${USER_ID}\",user_id.is.null`],
  );
  assert.equal(
    service.queryCalls.some(([name, field]) => name === 'eq' && field === 'user_id'),
    false,
    'public user_id=NULL rows must not be removed by an owner-only filter',
  );

  await service.execute('createItem', {
    resource: 'user_scoped_rows',
    data: { name: 'owned', user_id: OTHER_USER_ID },
  }, context);
  assert.equal(readFirstItemData(service.preparedCreate)?.user_id, USER_ID);
  const serialized = (service.dynamicConfig?.resources as Record<string, {
    create: { allowed_fields: string[]; managed_fields: string[]; input_allowed_fields: string[] };
  }>).user_scoped_rows.create;
  assert.ok(serialized.allowed_fields.includes('user_id'), 'RPC must retain the injected user ID');
  assert.ok(serialized.managed_fields.includes('user_id'));
  assert.deepEqual(serialized.input_allowed_fields, ['name']);
  assert.equal(service.inspectionCount, 1, 'reuse the physical-column cache across CRUD calls');

  await service.execute('updateItem', {
    resource: 'user_scoped_rows',
    id: 'row-1',
    data: { name: 'updated', user_id: OTHER_USER_ID },
  }, context);
  assert.equal((service.preparedUpdate?.data as Record<string, unknown>).user_id, OTHER_USER_ID);

  const anonymousService = new UserScopedService();
  await anonymousService.execute('listItems', { resource: 'user_scoped_rows' }, {});
  assert.deepEqual(
    anonymousService.queryCalls.find(([name]) => name === 'is'),
    ['is', 'user_id', null],
  );
  await assert.rejects(
    anonymousService.execute('createItem', {
      resource: 'user_scoped_rows',
      data: { name: 'cannot create public', user_id: null },
    }, {}),
    /Authenticated user is required/,
  );

  const ownedService = new UserScopedService();
  ownedService.ownerField = 'user_id';
  await ownedService.execute('listItems', { resource: 'user_scoped_rows' }, context);
  assert.equal(ownedService.queryCalls.some(([name]) => name === 'eq'), false);

  const noColumnService = new UserScopedService();
  noColumnService.hasUserIdColumn = false;
  await noColumnService.execute('createItem', {
    resource: 'user_scoped_rows', data: { name: 'plain row' },
  }, {});
  assert.equal(
    Object.prototype.hasOwnProperty.call(readFirstItemData(noColumnService.preparedCreate), 'user_id'),
    false,
  );
  await noColumnService.execute('listItems', { resource: 'user_scoped_rows' }, {});
  assert.equal(noColumnService.queryCalls.some(([name]) => ['is', 'or'].includes(name)), false);

  const postgrestService = new PostgrestUserScopedService();
  const scope = `(user_id.eq.\"${USER_ID}\",user_id.is.null)`;
  await postgrestService.execute('listItems', {
    resource: 'user_scoped_rows',
    filters: { logic: 'or', conditions: [{ field: 'user_id', value: OTHER_USER_ID }] },
    responseMode: 'page', page: 2, pageSize: 10,
  }, context);
  assert.deepEqual(postgrestService.urls[0].searchParams.getAll('or'), [
    scope, `(user_id.eq.\"${OTHER_USER_ID}\")`,
  ], 'caller OR filters must be ANDed with the mandatory scope, not replace it');
  assert.equal(postgrestService.urls[0].searchParams.get('offset'), '10');
  assert.equal(postgrestService.urls[0].searchParams.get('limit'), '10');

  await postgrestService.execute('listItems', {
    tableName: 'unregistered_rows', clientMode: 'admin',
    search: 'other', searchFields: ['name'],
  }, context);
  assert.equal(postgrestService.urls[1].searchParams.getAll('or')[0], scope);
  assert.equal(postgrestService.urls[1].searchParams.getAll('or').length, 2);

  const generic = new GenericAdminService();
  await generic.saveForTest({ data: { name: 'created', user_id: OTHER_USER_ID } });
  assert.equal(generic.inserted?.user_id, USER_ID);

  await generic.saveForTest({ id: 'row-1', data: { name: 'updated', user_id: OTHER_USER_ID } });
  assert.equal(generic.updated?.user_id, OTHER_USER_ID);

  console.log('User-scoped CRUD tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
