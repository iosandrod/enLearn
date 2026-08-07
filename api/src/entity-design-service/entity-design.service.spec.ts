import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { EntityDesignService } from './entity-design.service';

type RpcResult = {
  data: unknown;
  error: null | { code?: string; message: string };
};

class EntityDesignServiceHarness extends EntityDesignService {
  constructor(private readonly rpcClient: SupabaseClient) {
    super();
  }

  protected override async assertAccess(_context: ServiceContext) {
    return { client: this.rpcClient };
  }

  protected override async assertViewAccess(_context: ServiceContext) {
    return { client: this.rpcClient };
  }
}

function createHarness(result: RpcResult = { data: { ok: true }, error: null }) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return result;
    }
  } as unknown as SupabaseClient;
  return {
    calls,
    service: new EntityDesignServiceHarness(client)
  };
}

async function assertRpc(
  method: string,
  input: Record<string, unknown>,
  name: string,
  payload?: Record<string, unknown>
) {
  const { calls, service } = createHarness();
  assert.deepEqual(await service.execute(method, input, {}), { ok: true });
  assert.deepEqual(calls, [{
    name,
    args: payload === undefined ? undefined : { p_payload: payload }
  }]);
}

async function main() {
  await assertRpc('listDesign', {}, 'entity_design_list');
  await assertRpc(
    'listPhysicalTables',
    {},
    'entity_design_list_physical_tables'
  );
  await assertRpc(
    'listViews',
    {},
    'entity_design_list_views',
    { status: null, search: null }
  );
  await assertRpc(
    'listViews',
    {
      filters: { viewCode: 'sales_order_summary' },
      status: 'published',
      search: 'sales'
    },
    'entity_design_list_views',
    {
      code: 'sales_order_summary',
      status: 'published',
      search: 'sales'
    }
  );
  await assertRpc(
    'listViewColumns',
    { schema_name: 'public', view_name: 'sales_order_summary' },
    'entity_design_list_view_columns',
    { schema_name: 'public', view_name: 'sales_order_summary' }
  );
  await assertRpc(
    'validateView',
    { definition_sql: 'select id from public.sales_orders' },
    'entity_design_validate_view',
    { definition_sql: 'select id from public.sales_orders' }
  );
  await assertRpc(
    'saveView',
    {
      id: 'view-1',
      code: 'sales_order_summary',
      schemaName: 'public',
      viewName: 'sales_order_summary',
      title: 'Sales order summary',
      description: 'Published sales orders',
      definitionSql: 'select id from public.sales_orders',
      metadata: { domain: 'sales' }
    },
    'entity_design_save_view',
    {
      id: 'view-1',
      code: 'sales_order_summary',
      schema_name: 'public',
      view_name: 'sales_order_summary',
      title: 'Sales order summary',
      description: 'Published sales orders',
      definition_sql: 'select id from public.sales_orders',
      status: null,
      security_invoker: true,
      metadata: { domain: 'sales' }
    }
  );
  await assertRpc(
    'publishView',
    { viewId: 'view-1' },
    'entity_design_publish_view',
    { id: 'view-1' }
  );
  await assertRpc(
    'archiveView',
    { viewCode: 'sales_order_summary' },
    'entity_design_archive_view',
    { code: 'sales_order_summary' }
  );
  await assertRpc(
    'deleteView',
    { schemaName: 'public', viewName: 'sales_order_summary' },
    'entity_design_delete_view',
    { schema_name: 'public', view_name: 'sales_order_summary' }
  );

  const emptyCreateRoute = createHarness();
  assert.deepEqual(
    await emptyCreateRoute.service.execute(
      'listViews',
      { filters: { id: '' } },
      {}
    ),
    []
  );
  assert.deepEqual(emptyCreateRoute.calls, []);

  const emptyColumnRoute = createHarness();
  assert.deepEqual(
    await emptyColumnRoute.service.execute(
      'listViewColumns',
      { filters: { id: '' } },
      {}
    ),
    []
  );
  assert.deepEqual(emptyColumnRoute.calls, []);

  const validationHarness = createHarness().service;
  await assert.rejects(
    () => validationHarness.execute(
      'saveView',
      { code: 'bad-name', viewName: 'valid_name', title: 'Invalid' },
      {}
    ),
    BadRequestException
  );
  await assert.rejects(
    () => validationHarness.execute(
      'listViews',
      { status: 'unknown' },
      {}
    ),
    BadRequestException
  );
  await assert.rejects(
    () => validationHarness.execute(
      'deleteView',
      { viewName: 'x'.repeat(64) },
      {}
    ),
    BadRequestException
  );
  await assertRpc(
    'syncPhysicalColumns',
    { tableId: 'table-1' },
    'entity_design_sync_physical_columns',
    { table_id: 'table-1' }
  );
  await assertRpc(
    'syncPhysicalTables',
    {
      tables: [
        { schemaName: 'public', tableName: 'orders' },
        'customers'
      ]
    },
    'entity_design_sync_physical_tables',
    {
      tables: [
        { schema_name: 'public', table_name: 'orders' },
        { schema_name: 'public', table_name: 'customers' }
      ]
    }
  );
  await assertRpc(
    'saveTable',
    {
      code: 'orders',
      tableName: 'public.orders',
      title: 'Orders',
      primaryKey: 'id',
      createPhysical: true,
      positionX: 12.9,
      positionY: 33.2
    },
    'entity_design_save_table',
    {
      code: 'orders',
      schema_name: 'public',
      table_name: 'orders',
      title: 'Orders',
      description: null,
      primary_key: 'id',
      status: 'active',
      position_x: 12,
      position_y: 33,
      metadata: {},
      create_physical: true
    }
  );
  await assertRpc(
    'deleteTable',
    { tableCode: 'orders', dropPhysical: true },
    'entity_design_delete_table',
    { table_code: 'orders', drop_physical: true }
  );
  await assertRpc(
    'saveColumn',
    {
      tableId: 'table-1',
      columnName: 'total_amount',
      label: 'Total amount',
      dataType: 'numeric',
      storageKind: 'physical',
      defaultValue: '0',
      isRequired: true,
      isUnique: false,
      sortOrder: 20
    },
    'entity_design_save_column',
    {
      table_id: 'table-1',
      column_name: 'total_amount',
      label: 'Total amount',
      data_type: 'numeric',
      data_type_config: {},
      storage_kind: 'physical',
      expression: null,
      is_required: true,
      is_primary_key: false,
      is_unique: false,
      default_value: '0',
      sort_order: 20,
      status: 'active',
      metadata: {}
    }
  );
  await assertRpc(
    'deleteColumn',
    { tableName: 'orders', columnName: 'total_amount' },
    'entity_design_delete_column',
    {
      schema_name: 'public',
      table_name: 'orders',
      column_name: 'total_amount',
      drop_physical: true
    }
  );
  await assertRpc(
    'saveRelation',
    {
      sourceTableId: 'source-1',
      sourceColumnName: 'customer_id',
      targetTableId: 'target-1',
      targetColumnName: 'id',
      isEnforced: true,
      onDelete: 'cascade'
    },
    'entity_design_save_relation',
    {
      source_table: { table_id: 'source-1' },
      source_column_name: 'customer_id',
      target_table: { table_id: 'target-1' },
      target_column_name: 'id',
      relation_type: 'many_to_one',
      is_enforced: true,
      constraint_name: null,
      on_delete: 'cascade',
      metadata: {}
    }
  );

  const forbidden = createHarness({
    data: null,
    error: { code: '42501', message: 'Entity design permission required.' }
  }).service;
  await assert.rejects(
    () => forbidden.execute('listDesign', {}, {}),
    ForbiddenException
  );

  const missing = createHarness({
    data: null,
    error: { code: 'P0002', message: 'Entity design table not found.' }
  }).service;
  await assert.rejects(
    () => missing.execute('deleteTable', { tableId: 'missing' }, {}),
    NotFoundException
  );

  const invalid = createHarness({
    data: null,
    error: { code: '22023', message: 'Invalid entity design payload.' }
  }).service;
  await assert.rejects(
    () => invalid.execute('listDesign', {}, {}),
    BadRequestException
  );

  const source = readFileSync(
    resolve(__dirname, 'entity-design.service.ts'),
    'utf8'
  );
  for (const forbiddenSource of [
    'PoolClient',
    'withPostgresClient',
    'client.query(',
    'runInTransaction',
    "clientMode: 'admin'"
  ]) {
    assert.equal(
      source.includes(forbiddenSource),
      false,
      `entity-design.service.ts must not contain ${forbiddenSource}`
    );
  }

  console.log('entity design RPC service tests passed');
}

void main();
