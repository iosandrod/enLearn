import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { createSupabaseClient } from '../src/common/utils/supabase';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

type JsonRecord = Record<string, unknown>;

function directProjectConnectionString(value: string) {
  try {
    const url = new URL(normalizePostgresConnectionString(value));
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    url.searchParams.delete('pgbouncer');
    return url.toString();
  } catch {
    return normalizePostgresConnectionString(value);
  }
}

async function main() {
  const env = getEnv();
  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const client = new Client({
    connectionString: directProjectConnectionString(connectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  const supabase = createSupabaseClient('admin');
  const parentTable = `rpc_parent_${Date.now()}`;
  const childTable = `rpc_child_${Date.now()}`;
  const hookFunction = `rpc_hook_${Date.now()}`;
  const firstId = randomUUID();
  const secondId = randomUUID();
  const thirdId = randomUUID();
  const quote = (value: string) => `"${value}"`;

  await client.connect();
  try {
    await client.query(`
      create table public.${quote(parentTable)} (
        id uuid primary key,
        name text not null,
        status text not null default 'draft',
        linked_id uuid,
        business_on date,
        amount numeric,
        note text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table public.${quote(childTable)} (
        id uuid primary key default gen_random_uuid(),
        parent_id uuid not null references public.${quote(parentTable)}(id) on delete cascade,
        line_no integer not null check (line_no > 0),
        label text not null,
        delivery_on date,
        created_at timestamptz not null default now()
      );
      grant select, insert, update, delete on public.${quote(parentTable)} to service_role;
      grant select, insert, update, delete on public.${quote(childTable)} to service_role;
      create function public.${quote(hookFunction)}(payload jsonb, args jsonb, context jsonb)
      returns jsonb language sql security invoker set search_path = pg_catalog
      as $$ select payload || jsonb_build_object(
        'status', coalesce(args->>'status', 'hooked')
      ) || case when args ? 'forbidden_field'
        then jsonb_build_object('forbidden_field', args->'forbidden_field')
        else '{}'::jsonb
      end $$;
      grant execute on function public.${quote(hookFunction)}(jsonb, jsonb, jsonb) to service_role;
    `);

    const resources = {
      [parentTable]: {
        table_name: parentTable,
        primary_key: 'id',
        hooks: {
          beforeCreate: [{ function: hookFunction, args: { status: 'created-by-hook' } }],
          beforeUpdate: [{ function: hookFunction, args: { status: 'updated-by-hook' } }]
        },
        create: {
          allowed_fields: [
            'id', 'name', 'status', 'linked_id', 'business_on', 'amount', 'note',
            'created_at', 'updated_at'
          ],
          hook_input_fields: [],
          required_fields: ['id', 'name']
        },
        update: {
          allowed_fields: [
            'name', 'status', 'linked_id', 'business_on', 'amount', 'note', 'updated_at'
          ],
          hook_input_fields: [],
          required_fields: []
        }
      },
      [childTable]: {
        table_name: childTable,
        primary_key: 'id',
        hooks: {},
        create: {
          allowed_fields: ['parent_id', 'line_no', 'label', 'delivery_on', 'created_at'],
          hook_input_fields: [],
          required_fields: ['parent_id', 'line_no', 'label']
        },
        update: null
      }
    };
    const config = {
      resource_name: parentTable,
      resources,
      detail_relations: {
        [childTable]: {
          resource: childTable,
          foreign_key: 'parent_id',
          parent_key: 'id',
          inherit_fields: [],
          update_mode: 'replace'
        }
      },
      after_save_relations: {
        [parentTable]: {
          resource: parentTable,
          actions: ['update'],
          allowed_fields: ['linked_id'],
          allowed_where_fields: ['id']
        }
      }
    };
    const configHash = 'service-role-smoke-config';
    const registeredConfig = { ...config, config_hash: configHash };
    const rejectedRegistration = await supabase.rpc('register_dynamic_crud_resource', {
      p_resource_name: parentTable,
      p_table_name: parentTable,
      p_config_hash: configHash,
      p_config: { ...registeredConfig, resource_name: childTable }
    });
    assert.ok(rejectedRegistration.error);
    const register = await supabase.rpc('register_dynamic_crud_resource', {
      p_resource_name: parentTable,
      p_table_name: parentTable,
      p_config_hash: configHash,
      p_config: registeredConfig
    });
    if (register.error) throw new Error(JSON.stringify(register.error, null, 2));

    const create = await supabase.rpc('execute_dynamic_crud', {
      p_action: 'create',
      p_table_name: parentTable,
      p_config: config,
      p_operation: {
        items: [{
          data: {
            id: firstId,
            name: 'first',
            business_on: '',
            amount: '',
            note: '',
          },
          details: [{
            resource: childTable,
            rows: [{ line_no: 1, label: 'line-one', delivery_on: '' }]
          }]
        }],
        after_save: [{
          action: 'update',
          resource: parentTable,
          data: { linked_id: { $ref: 'saved.id' } },
          where: { id: { $ref: 'saved.id' } },
          expect: 1
        }]
      },
      p_account_id: null
    });
    if (create.error) throw new Error(JSON.stringify(create.error, null, 2));
    assert.equal((create.data as JsonRecord).status, 'created-by-hook');

    const created = await client.query(
      `select p.*, count(c.id)::int as child_count
         from public.${quote(parentTable)} p
         left join public.${quote(childTable)} c on c.parent_id = p.id
        where p.id = $1 group by p.id`,
      [firstId]
    );
    assert.equal(created.rows[0].linked_id, firstId);
    assert.equal(created.rows[0].business_on, null);
    assert.equal(created.rows[0].amount, null);
    assert.equal(created.rows[0].note, '');
    assert.equal(created.rows[0].child_count, 1);
    const createdChild = await client.query(
      `select delivery_on from public.${quote(childTable)} where parent_id = $1`,
      [firstId]
    );
    assert.equal(createdChild.rows[0].delivery_on, null);

    const update = await supabase.rpc('execute_dynamic_crud', {
      p_action: 'update',
      p_table_name: parentTable,
      p_config: config,
      p_operation: {
        data: { name: 'updated', business_on: '', amount: '', note: '' },
        selector: { id: firstId, ids: [], filters: {} },
        details: [{
          resource: childTable,
          mode: 'replace',
          rows: [
            { line_no: 1, label: 'replacement-one' },
            { line_no: 2, label: 'replacement-two' }
          ]
        }],
        after_save: [],
        return_single: true
      },
      p_account_id: null
    });
    if (update.error) throw new Error(JSON.stringify(update.error, null, 2));
    assert.equal((update.data as JsonRecord).status, 'updated-by-hook');

    const updated = await client.query(
      `select p.*, count(c.id)::int as child_count
         from public.${quote(parentTable)} p
         left join public.${quote(childTable)} c on c.parent_id = p.id
        where p.id = $1 group by p.id`,
      [firstId]
    );
    assert.equal(updated.rows[0].name, 'updated');
    assert.equal(updated.rows[0].child_count, 2);

    const failed = await supabase.rpc('execute_dynamic_crud', {
      p_action: 'create',
      p_table_name: parentTable,
      p_config: config,
      p_operation: {
        items: [{
          data: { id: secondId, name: 'must-rollback' },
          details: [{ resource: childTable, rows: [{ line_no: 0, label: 'invalid' }] }]
        }],
        after_save: []
      },
      p_account_id: null
    });
    assert.ok(failed.error);
    const rollback = await client.query(
      `select count(*)::int as count from public.${quote(parentTable)} where id = $1`,
      [secondId]
    );
    assert.equal(rollback.rows[0].count, 0);

    const rejectedHookFieldConfig = structuredClone(config);
    const rejectedHookParent = rejectedHookFieldConfig.resources[parentTable];
    rejectedHookParent.hooks.beforeCreate = [{
      function: hookFunction,
      args: { status: 'created-by-hook', forbidden_field: 'must-not-write' }
    }];
    rejectedHookParent.create.allowed_fields = rejectedHookParent.create.allowed_fields.filter(
      (field: string) => field !== 'status'
    );
    const rejectedHookField = await supabase.rpc('execute_dynamic_crud', {
      p_action: 'create',
      p_table_name: parentTable,
      p_config: rejectedHookFieldConfig,
      p_operation: {
        items: [{ data: { id: thirdId, name: 'blocked-hook-field' }, details: [] }],
        after_save: []
      },
      p_account_id: null
    });
    // Service-role callers may supply config directly, but hook output is still
    // passed through the resource allowed-field boundary before SQL execution.
    if (rejectedHookField.error) throw new Error(JSON.stringify(rejectedHookField.error, null, 2));
    const hookFieldRow = await client.query(
      `select * from public.${quote(parentTable)} where id = $1`,
      [thirdId]
    );
    assert.equal(hookFieldRow.rows[0].status, 'draft');
    await client.query(`delete from public.${quote(parentTable)} where id = $1`, [thirdId]);

    const rejectedAfterSaveField = await supabase.rpc('execute_dynamic_crud', {
      p_action: 'create',
      p_table_name: parentTable,
      p_config: config,
      p_operation: {
        items: [{ data: { id: thirdId, name: 'blocked-after-save' }, details: [] }],
        after_save: [{
          action: 'update',
          resource: parentTable,
          data: { status: 'not-allowed-by-relation' },
          where: { id: { $ref: 'saved.id' } },
          expect: 1
        }]
      },
      p_account_id: null
    });
    assert.ok(rejectedAfterSaveField.error);
    assert.match(rejectedAfterSaveField.error.message, /afterSave data field status is not allowed/i);
    const rejectedAfterSaveRollback = await client.query(
      `select count(*)::int as count from public.${quote(parentTable)} where id = $1`,
      [thirdId]
    );
    assert.equal(rejectedAfterSaveRollback.rows[0].count, 0);

    const forgedDetailConfig = structuredClone(config);
    forgedDetailConfig.detail_relations[childTable].foreign_key = 'id';
    const rejectedDetailConfig = await supabase.rpc('execute_dynamic_crud', {
      p_action: 'create',
      p_table_name: parentTable,
      p_config: forgedDetailConfig,
      p_operation: {
        items: [{
          data: { id: thirdId, name: 'blocked-detail-config' },
          details: [{
            resource: childTable,
            foreign_key: 'parent_id',
            rows: [{ line_no: 1, label: 'must-not-insert' }]
          }]
        }],
        after_save: []
      },
      p_account_id: null
    });
    assert.ok(rejectedDetailConfig.error);
    assert.match(rejectedDetailConfig.error.message, /foreignKey does not match/i);
    const rejectedDetailRollback = await client.query(
      `select count(*)::int as count from public.${quote(parentTable)} where id = $1`,
      [thirdId]
    );
    assert.equal(rejectedDetailRollback.rows[0].count, 0);

    const registry = await client.query<{ config_hash: string }>(
      `select config_hash
       from public.dynamic_crud_resource_registry
       where resource_name = $1`,
      [parentTable]
    );
    assert.equal(registry.rows[0]?.config_hash, configHash);

    const lowcodeHook = await client.query<{ payload: JsonRecord }>(
      `select public.dynamic_crud_normalize_lowcode_page(
         $1::jsonb,
         '{}'::jsonb,
         '{"action":"create"}'::jsonb
       ) as payload`,
      [JSON.stringify({ schema: { pageType: 'edit' } })]
    );
    assert.equal(lowcodeHook.rows[0]?.payload.page_type, 'edit');

    const chatHook = await client.query<{ payload: JsonRecord }>(
      `select public.dynamic_crud_normalize_chat_message(
         $1::jsonb,
         '{}'::jsonb,
         $2::jsonb
       ) as payload`,
      [
        JSON.stringify({ content: 'hello' }),
        JSON.stringify({ input: { messageType: 'file', attachmentIds: ['file-1'] } })
      ]
    );
    assert.equal(chatHook.rows[0]?.payload.message_type, 'file');
    assert.deepEqual(chatHook.rows[0]?.payload.attachment_ids, ['file-1']);

    const notificationHook = await client.query<{ payload: JsonRecord }>(
      `select public.dynamic_crud_normalize_notification_message_update(
         '{}'::jsonb,
         '{}'::jsonb,
         '{"input":{"archive":true}}'::jsonb
       ) as payload`
    );
    assert.ok(notificationHook.rows[0]?.payload.read_at);
    assert.ok(notificationHook.rows[0]?.payload.archived_at);
    console.log('Dynamic CRUD RPC smoke test passed.');
  } finally {
    await client.query(`
      delete from public.dynamic_crud_resource_registry where resource_name = '${parentTable}';
      drop table if exists public.${quote(childTable)} cascade;
      drop table if exists public.${quote(parentTable)} cascade;
      drop function if exists public.${quote(hookFunction)}(jsonb, jsonb, jsonb);
    `).catch(() => undefined);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
