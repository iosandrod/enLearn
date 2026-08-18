import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

function stableJson(value: unknown) {
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || Array.isArray(nested) || typeof nested !== 'object') return nested;
    return Object.fromEntries(
      Object.entries(nested as JsonRecord).sort(([left], [right]) => left.localeCompare(right))
    );
  });
}

function withHash(config: JsonRecord) {
  return {
    ...config,
    config_hash: createHash('sha256').update(stableJson(config)).digest('hex')
  };
}

async function register(admin: ReturnType<typeof createSupabaseClient>, config: JsonRecord) {
  const resourceName = String(config.resource_name);
  const resources = config.resources as Record<string, JsonRecord>;
  const tableName = String(resources[resourceName].table_name);
  const { error } = await admin.rpc('register_dynamic_crud_resource', {
    p_resource_name: resourceName,
    p_table_name: tableName,
    p_config_hash: config.config_hash,
    p_config: config
  });
  if (error) throw error;
}

async function execute(
  client: ReturnType<typeof createSupabaseClient>,
  action: 'create' | 'delete',
  tableName: string,
  config: JsonRecord,
  operation: JsonRecord
) {
  const result = await client.rpc('execute_dynamic_crud', {
    p_action: action,
    p_table_name: tableName,
    p_config: config,
    p_operation: operation,
    p_account_id: null
  });
  if (result.error) throw result.error;
  return result.data as JsonRecord;
}

async function main() {
  const admin = createSupabaseClient('admin');
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const hardCode = `rpc-delete-hard-${suffix}`;
  const softPath = `rpc-delete-soft-${suffix}`;

  const hardBase = {
    resource_name: 'admin_permissions',
    resources: {
      admin_permissions: {
        code: 'admin_permissions',
        table_name: 'admin_permissions',
        primary_key: 'id',
        owner_field: null,
        account_field: null,
        client_mode: 'admin',
        hooks: {},
        create: {
          allowed_fields: ['code', 'name', 'resource_type', 'action_code', 'status', 'sort_order'],
          input_allowed_fields: ['code', 'name', 'resource_type', 'action_code', 'status', 'sort_order'],
          managed_fields: [],
          hook_input_fields: [],
          required_fields: ['code', 'name'],
          timestamp: false
        },
        update: null,
        delete: {
          allowed_fields: [],
          input_allowed_fields: [],
          managed_fields: [],
          hook_input_fields: [],
          required_fields: [],
          timestamp: false,
          soft_delete: false,
          deleted_at_field: 'deleted_at',
          status_field: null,
          deleted_status: null,
          deleted_by_field: null
        }
      }
    },
    detail_relations: {},
    after_save_relations: {}
  };
  const hardConfig = withHash(hardBase);

    const softBase = {
    resource_name: 'file_folders',
    resources: {
      file_folders: {
        code: 'file_folders',
        table_name: 'file_folders',
        primary_key: 'id',
        owner_field: 'owner_id',
        account_field: null,
        client_mode: 'admin',
        hooks: {},
        create: null,
        update: null,
        delete: {
          allowed_fields: ['deleted_at'],
          input_allowed_fields: [],
          managed_fields: [],
          hook_input_fields: [],
          required_fields: [],
          timestamp: false,
          soft_delete: true,
          deleted_at_field: 'deleted_at',
          status_field: null,
          deleted_status: null,
          deleted_by_field: null
        }
      }
    },
    detail_relations: {},
    after_save_relations: {}
  };
    const softConfig = withHash(softBase);
  const accountSoftBase = {
    resource_name: 'sales_orders',
    resources: {
      sales_orders: {
        code: 'sales_orders',
        table_name: 'sales_orders',
        primary_key: 'id',
        owner_field: null,
        account_field: 'account_id',
        client_mode: 'admin',
        hooks: {},
        create: null,
        update: null,
        delete: {
          allowed_fields: [],
          input_allowed_fields: [],
          managed_fields: [],
          hook_input_fields: [],
          required_fields: [],
          timestamp: false,
          soft_delete: false,
          deleted_at_field: 'deleted_at',
          status_field: null,
          deleted_status: null,
          deleted_by_field: null
        }
      }
    },
    detail_relations: {},
    after_save_relations: {}
  };
  const accountSoftConfig = withHash(accountSoftBase);
  let hardId = '';
  let softId = '';
  let accountOrderId = '';

  try {
    await register(admin, hardConfig);
    const hardCreated = await execute(admin, 'create', 'admin_permissions', hardConfig, {
      items: [{
        data: {
          code: hardCode,
          name: 'RPC hard delete smoke',
          resource_type: 'action',
          action_code: 'test',
          status: 'active',
          sort_order: 9999
        },
        details: []
      }],
      after_save: [],
      hook_input: {}
    });
    hardId = String(hardCreated.id ?? '');
    assert.ok(hardId);
    const hardDeleted = await execute(admin, 'delete', 'admin_permissions', hardConfig, {
      selector: { id: hardId, ids: [], filters: {} },
      return_single: true,
      hook_input: {}
    });
    assert.equal(hardDeleted.id, hardId);
    const hardRead = await admin
      .from('admin_permissions')
      .select('id')
      .eq('id', hardId)
      .maybeSingle();
    if (hardRead.error) throw hardRead.error;
    assert.equal(hardRead.data, null);
    hardId = '';

    const user = await admin.auth.admin.createUser({
      email: `rpc-delete-${suffix}@example.test`,
      password: `RpcDelete-${suffix}-A9!`,
      email_confirm: true
    });
    if (user.error || !user.data.user) throw user.error;
    const ownerId = user.data.user.id;
    const inserted = await admin
      .from('file_folders')
      .insert({
        owner_id: ownerId,
        bucket: 'uploads',
        name: softPath,
        path: softPath,
        metadata: {}
      })
      .select('id')
      .single();
    if (inserted.error) throw inserted.error;
    softId = String(inserted.data.id);
    await register(admin, softConfig);
    const softDeleted = await execute(admin, 'delete', 'file_folders', softConfig, {
      selector: { id: softId, ids: [], filters: {} },
      return_single: true,
      hook_input: {}
    });
    assert.equal(softDeleted.id, softId);
    assert.ok(softDeleted.deleted_at);
    const softRead = await admin
      .from('file_folders')
      .select('deleted_at')
      .eq('id', softId)
      .single();
    if (softRead.error) throw softRead.error;
    assert.ok(softRead.data.deleted_at);
    await admin.auth.admin.deleteUser(ownerId);

    const accountId = '00000000-0000-4000-8000-000000000001';
    const accountOrder = await admin
      .from('sales_orders')
      .insert({
        account_id: accountId,
        doc_no: `SO-DELETE-${suffix}`,
        doc_date: new Date().toISOString().slice(0, 10),
        customer_code: 'RPC-DELETE',
        customer_name: 'RPC delete smoke'
      })
      .select('id')
      .single();
    if (accountOrder.error) throw accountOrder.error;
    accountOrderId = String(accountOrder.data.id);
    await register(admin, accountSoftConfig);
    const accountDeleted = await admin.rpc('execute_dynamic_crud', {
      p_action: 'delete',
      p_table_name: 'sales_orders',
      p_config: accountSoftConfig,
      p_operation: {
        selector: { id: accountOrderId, ids: [], filters: {} },
        return_single: true,
        hook_input: {}
      },
      p_account_id: accountId
    });
    if (accountDeleted.error) throw accountDeleted.error;
    assert.equal((accountDeleted.data as JsonRecord).id, accountOrderId);
    accountOrderId = '';

    console.log('Dynamic CRUD hard/soft delete smoke test passed.');
  } finally {
    if (hardId) await admin.from('admin_permissions').delete().eq('id', hardId);
    if (softId) await admin.from('file_folders').delete().eq('id', softId);
    if (accountOrderId) await admin.from('sales_orders').delete().eq('id', accountOrderId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
