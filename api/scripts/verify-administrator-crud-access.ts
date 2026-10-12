import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { BaseService, type ResourceConfigMap } from '../src/common/base.service';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { createSupabaseClient } from '../src/common/utils/supabase';

async function connect() {
  const env = getEnv();
  for (const value of [env.DIRECT_URL, env.DATABASE_URL]) {
    if (!value) continue;
    const url = new URL(normalizePostgresConnectionString(value));
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) continue;
    url.searchParams.delete('sslmode');
    const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10_000 });
    try { await client.connect(); return client; }
    catch { await client.end().catch(() => undefined); }
  }
  throw new Error('A configured local PostgreSQL database is required.');
}

async function main() {
  const client = await connect();
  try {
    // Validate the real PostgREST relationship used by the administrator lookup.
    const url = new URL(getEnv().SUPABASE_URL!);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    const { error } = await createSupabaseClient('admin').from('admin_user_roles')
      .select('admin_roles!inner(code,status)').is('account_id', null)
      .eq('admin_roles.code', 'admin').eq('admin_roles.status', 'active').limit(1);
    assert.equal(error, null);

    await client.query('begin');
    const users = (await client.query('select id from auth.users order by id limit 2')).rows;
    assert.equal(users.length, 2, 'Two local users are required.');
    const actor = users[0].id as string;
    const owner = users[1].id as string;
    const activeAccount = randomUUID();
    const otherAccount = randomUUID();
    const tableName = `administrator_crud_test_${randomUUID().replaceAll('-', '')}`;
    const rowId = randomUUID();
    const templateIds = [randomUUID(), randomUUID()];
    await client.query(`create table public.${tableName} (
      id uuid primary key, name text, user_id uuid, account_id uuid, updated_by uuid
    )`);
    await client.query(`alter table public.${tableName} enable row level security`);
    await client.query(`grant select,insert,update,delete on public.${tableName} to authenticated,service_role`);
    await client.query(`create policy owner_only on public.${tableName} to authenticated
      using (user_id=auth.uid()) with check (user_id=auth.uid())`);
    await client.query(`insert into public.${tableName}(id,name,user_id,account_id)
      values ($1,'other account',$2,$3)`, [rowId, owner, otherAccount]);
    for (const [index, id] of templateIds.entries()) {
      await client.query(`insert into public.print_templates(id,name,content,access_level,user_id,status)
        values ($1,'administrator-crud-test','{}','free',$2,'active')`, [id, index === 0 ? null : owner]);
    }

    class AdministratorService extends BaseService {
      protected override resources(): ResourceConfigMap {
        return {
          print_templates: {
            tableName: 'print_templates', clientMode: 'user', ownerField: 'user_id',
            update: { allowedFields: ['name'], timestamp: false },
            delete: { softDelete: false },
          },
          [tableName]: {
            tableName, clientMode: 'user', ownerField: 'user_id', accountField: 'account_id',
            update: { allowedFields: ['name'], timestamp: false, userFields: { owner: 'user_id', updatedBy: 'updated_by' } },
            delete: { softDelete: false },
          },
        };
      }
      protected override async isAdministrator() { return true; }
      protected override async tryReadCurrentUser() { return { id: actor } as never; }
      protected override async inspectTableHasUserIdColumn() { return true; }
      protected override async createCrudClient() {
        return { rpc: async (name: string, args: Record<string, unknown>) => {
          assert.equal(name, 'execute_dynamic_crud');
          await client.query('reset role');
          await client.query(`select set_config('request.jwt.claim.sub','',true),
            set_config('request.jwt.claims','{"role":"service_role"}',true)`);
          await client.query('set local role service_role');
          const result = await client.query(`select public.execute_dynamic_crud($1,$2,$3::jsonb,$4::jsonb,$5::uuid) result`, [
            args.p_action, args.p_table_name, JSON.stringify(args.p_config), JSON.stringify(args.p_operation), args.p_account_id,
          ]);
          return { data: result.rows[0].result, error: null };
        } } as never;
      }
    }
    const service = new AdministratorService();
    const context = { authorization: 'Bearer verified-administrator', accountId: activeAccount };
    for (const id of templateIds) {
      const result = await service.execute('saveItem', {
        tableName: 'public.print_templates', id, data: { name: 'administrator edited' },
      }, context) as Record<string, unknown>;
      assert.equal(result.id, id);
      assert.equal(result.name, 'administrator edited');
    }
    const result = await service.execute('saveItem', {
      tableName, id: rowId, data: { name: 'administrator cross-account edit' },
    }, context) as Record<string, unknown>;
    assert.equal(result.user_id, owner, 'editing must preserve ownership');
    assert.equal(result.account_id, otherAccount, 'editing must preserve account attribution');
    assert.equal(result.updated_by, actor, 'audit fields must identify the actual administrator');

    await client.query('reset role');
    await client.query(`select set_config('request.jwt.claim.sub',$1,true),
      set_config('request.jwt.claims',$2,true)`, [actor, JSON.stringify({ sub: actor, role: 'authenticated' })]);
    await client.query('set local role authenticated');
    assert.equal((await client.query(`update public.${tableName} set name='ordinary edit' where id=$1`, [rowId])).rowCount, 0);
    assert.equal((await client.query(`update print_templates set name='ordinary edit' where id=any($1::uuid[])`, [templateIds])).rowCount, 0);
    const deleted = await service.execute('deleteItem', { tableName, id: rowId }, context) as Record<string, unknown>;
    assert.equal(deleted.id, rowId);
    await client.query('reset role');
    assert.equal((await client.query(`select id from public.${tableName} where id=$1`, [rowId])).rowCount, 0);
    console.log('Local PostgreSQL administrator CRUD, ownership preservation, audit, and ordinary RLS tests passed; fixtures rolled back.');
  } finally {
    await client.query('reset role').catch(() => undefined);
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
