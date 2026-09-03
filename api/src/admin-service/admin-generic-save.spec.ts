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

  console.log('Admin generic saveItem test passed.');
}

void main();
