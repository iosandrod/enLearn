import assert from 'node:assert/strict';
import { AdminService } from './admin.service';
import type { ServiceContext } from '../common/interfaces/service-executor';

type QueryCall = {
  operation?: 'insert' | 'update';
  payload?: Record<string, unknown>;
  field?: string;
  id?: unknown;
  tableName?: string;
  clientMode?: string;
};

class TestAdminService extends AdminService {
  readonly call: QueryCall = {};

  protected override async resolveGenericTableColumns() {
    return new Set(['id', 'code', 'title', 'page_type']);
  }

  protected override async createCrudClient(resource: {
    tableName: string;
    clientMode?: 'user' | 'admin';
  }) {
    this.call.clientMode = resource.clientMode;
    const query = {
      insert: (payload: Record<string, unknown>) => {
        this.call.operation = 'insert';
        this.call.payload = payload;
        return query;
      },
      update: (payload: Record<string, unknown>) => {
        this.call.operation = 'update';
        this.call.payload = payload;
        return query;
      },
      eq: (field: string, id: unknown) => {
        this.call.field = field;
        this.call.id = id;
        return query;
      },
      select: () => query,
      maybeSingle: async () => ({
        data: { id: this.call.id ?? 'created-id', ...this.call.payload },
        error: null,
      }),
    };
    return {
      from: (resolvedTableName: string) => {
        this.call.tableName = resolvedTableName;
        return query;
      },
    } as never;
  }
}

class TestUuidAdminService extends TestAdminService {
  protected override async resolveGenericTableColumns() {
    const columns = new Set(['id', 'name', 'owner_id', 'source_id', 'duration']) as Set<string> & {
      typedColumns?: Set<string>;
    };
    columns.typedColumns = new Set(['id', 'owner_id', 'duration']);
    return columns;
  }
}

class TestAccountAdminService extends TestAdminService {
  protected override async resolveGenericTableColumns() {
    const columns = new Set(['id', 'name', 'account_id']) as Set<string> & {
      typedColumns?: Set<string>;
    };
    columns.typedColumns = new Set(['id', 'account_id']);
    return columns;
  }
}

class TestTypeAdminService extends TestAdminService {
  protected override async resolveGenericTableColumns() {
    return new Set(['id', 'name', 'type']);
  }
}

async function main() {
  const service = new TestAdminService();
  const result = await service.execute(
    'saveItem',
    {
      tableName: 'lowcode_pages',
      id: 'page-1',
      code: 'form-definetion',
      title: '系统表单',
      page_type: 'list',
      __details: [{ resource: 'planning_suboperation', created: [], updated: [], deleted: [] }],
      nonexistent_field: 'must not reach Supabase',
    },
    {} as ServiceContext,
  );

  assert.deepEqual(service.call, {
    operation: 'update',
    payload: {
      code: 'form-definetion',
      title: '系统表单',
      page_type: 'list',
    },
    field: 'id',
    id: 'page-1',
    tableName: 'lowcode_pages',
    clientMode: undefined,
  });
  assert.deepEqual(result, {
    id: 'page-1',
    code: 'form-definetion',
    title: '系统表单',
    page_type: 'list',
  });

  const uuidService = new TestUuidAdminService();
  await uuidService.execute(
    'saveItem',
    {
      tableName: 'planning_operation',
      id: '',
      name: 'test',
      owner_id: '',
      source_id: '',
      duration: '',
      nonexistent_field: 'must not reach Supabase',
    },
    {} as ServiceContext,
  );
  assert.deepEqual(uuidService.call.payload, {
    name: 'test',
    owner_id: null,
    source_id: '',
    duration: null,
  });

  const accountService = new TestAccountAdminService();
  await accountService.execute(
    'saveItem',
    {
      tableName: 'planning_operation',
      id: '',
      name: 'account-scoped',
    },
    { accountId: 'account-1' } as ServiceContext,
  );
  assert.deepEqual(accountService.call.payload, {
    name: 'account-scoped',
    account_id: 'account-1',
  });

  const typeService = new TestTypeAdminService();
  await typeService.execute(
    'saveItem',
    {
      tableName: 'planning_operation',
      id: 'operation-1',
      name: 'route',
      type: 'routing',
    },
    {} as ServiceContext,
  );
  assert.deepEqual(typeService.call.payload, {
    name: 'route',
    type: 'routing',
  });

  console.log('Admin generic saveItem test passed.');
}

void main();
