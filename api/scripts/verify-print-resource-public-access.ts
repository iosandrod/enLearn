import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

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
  const root = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const migration = await readFile(resolve(root, 'supabase/migrations/20261013010000_resource_access_level.sql'), 'utf8');
  const body = migration.replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
  try {
    if (process.argv.includes('--inspect')) {
      const templates = await client.query(`select access_level, status, count(*)::integer count
        from print_templates group by access_level,status order by access_level,status`);
      const columns = await client.query(`select table_name,column_name from information_schema.columns
        where table_schema='public' and column_name in ('visibility','access_level')
        and table_name in ('print_templates','print_expressions','print_datasource_script','lowcode_form_definitions')
        order by table_name,column_name`);
      const metadata = await client.query(`select service_name,resource_name,config->'publicRead' public_read
        from service_resource_metadata where config->>'accessLevelRead'='true' order by service_name,resource_name`);
      console.log(JSON.stringify({ templates: templates.rows, columns: columns.rows, metadata: metadata.rows }, null, 2));
      return;
    }
    await client.query('begin');
    await client.query(body);
    await client.query(body);
    const users = (await client.query('select id from auth.users order by id limit 2')).rows;
    assert.equal(users.length, 2, 'Two local users are required to verify ownership isolation.');
    const owner = users[0].id as string;
    const stranger = users[1].id as string;
    const ids = {
      free: randomUUID(), ownedFree: randomUUID(), pro: randomUUID(), enterprise: randomUUID(),
      ownedPro: randomUUID(), disabled: randomUUID(),
    };
    for (const [id, level, user, status] of [
      [ids.free, 'free', null, 'active'],
      [ids.ownedFree, 'free', owner, 'active'],
      [ids.pro, 'pro', null, 'active'],
      [ids.enterprise, 'enterprise', null, 'active'],
      [ids.ownedPro, 'pro', owner, 'active'],
      [ids.disabled, 'free', null, 'draft'],
    ]) {
      await client.query(`insert into print_templates(id,name,content,access_level,user_id,status)
        values ($1,'access-level-test','{}',$2,$3,$4)`, [id, level, user, status]);
    }

    const genericTable = `access_level_test_${randomUUID().replaceAll('-', '')}`;
    await client.query(`create table public.${genericTable} (id text primary key, user_id uuid, enabled boolean default true)`);
    await client.query(`create policy legacy_broad_read on public.${genericTable} for select to anon using (true)`);
    await client.query(`alter table public.${genericTable} add column access_level text default 'free'`);
    await client.query(`insert into public.${genericTable}(id,user_id,access_level,enabled) values
      ('free',$1,'free',true),('paid',null,'pro',true),('disabled',null,'free',false),('unknown',null,null,true)`, [owner]);
    const createdTable = `access_level_created_${randomUUID().replaceAll('-', '')}`;
    await client.query(`create table public.${createdTable} (id text primary key, access_level text)`);
    await client.query(`insert into public.${createdTable} values ('free','free'),('paid','enterprise')`);

    const scriptId = randomUUID();
    const formId = randomUUID();
    await client.query(`insert into print_datasource_script(id,code,name,script,schema,access_level,user_id)
      values ($1,$2,'access-level-test','async function main() { return []; }','{}','free',$3)`,
      [scriptId, `test.${scriptId}`, owner]);
    await client.query(`insert into lowcode_form_definitions(id,code,name,schema,access_level,user_id)
      select $1,$2,'access-level-test',schema,'free',$3 from lowcode_form_definitions order by id limit 1`,
      [formId, `print-designer.datasource.test-${formId}`, owner]);

    async function asRole(role: 'anon' | 'authenticated', user?: string) {
      await client.query('reset role');
      await client.query(`select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)`,
        [user ?? '', JSON.stringify({ sub: user, role })]);
      await client.query(`set local role ${role}`);
    }
    async function visibleTemplates() {
      return (await client.query('select id from print_templates where id=any($1::uuid[]) order by id', [Object.values(ids)]))
        .rows.map((row) => row.id as string);
    }
    await asRole('anon');
    assert.deepEqual(await visibleTemplates(), [ids.free, ids.ownedFree].sort());
    assert.deepEqual((await client.query(`select id from public.${genericTable} order by id`)).rows, [{ id: 'free' }],
      'ADD access_level must automatically enforce free-only access despite a legacy broad policy');
    assert.deepEqual((await client.query(`select id from public.${createdTable} order by id`)).rows, [{ id: 'free' }],
      'CREATE TABLE with access_level must automatically install the same policies');
    assert.equal((await client.query('select id,code,schema from print_datasource_script where id=$1', [scriptId])).rowCount, 1);
    assert.equal((await client.query('select id,schema from lowcode_form_definitions where id=$1', [formId])).rowCount, 1);
    await client.query('savepoint forbidden_script');
    await assert.rejects(client.query('select script,datasource_code from print_datasource_script where id=$1', [scriptId]), /permission denied/);
    await client.query('rollback to savepoint forbidden_script');
    await client.query('savepoint forbidden_write');
    await assert.rejects(client.query(`insert into public.${createdTable} values ('guest-write','free')`), /permission denied|row-level security/);
    await client.query('rollback to savepoint forbidden_write');

    await asRole('authenticated', stranger);
    assert.deepEqual(await visibleTemplates(), [ids.free, ids.ownedFree].sort(),
      'free is shared regardless of ownership, paid personal resources stay isolated');
    await asRole('authenticated', owner);
    assert.deepEqual(await visibleTemplates(), [ids.free, ids.ownedFree, ids.ownedPro].sort());
    assert.equal((await client.query("update print_templates set name='owned edit' where id=$1", [ids.ownedPro])).rowCount, 1);
    assert.equal((await client.query("update print_templates set name='shared edit' where id=$1", [ids.free])).rowCount, 0);
    await client.query('savepoint forbidden_transfer');
    await assert.rejects(client.query('update print_templates set user_id=$1 where id=$2', [stranger, ids.ownedPro]), /row-level security/);
    await client.query('rollback to savepoint forbidden_transfer');

    await client.query('reset role');
    const roleId = randomUUID();
    await client.query(`insert into admin_roles(id,code,name,status) values ($1,$2,'test pro','active')`, [roleId, `test-pro-${roleId}`]);
    await client.query(`insert into admin_role_permissions(role_id,permission_id)
      select $1,id from admin_permissions where code='print.resources.pro'`, [roleId]);
    await client.query('insert into admin_user_roles(user_id,role_id,account_id) values ($1,$2,null)', [owner, roleId]);
    await asRole('authenticated', owner);
    assert.ok((await visibleTemplates()).includes(ids.pro));
    assert.ok(!(await visibleTemplates()).includes(ids.enterprise));
    await client.query('reset role');
    await client.query(`insert into admin_role_permissions(role_id,permission_id)
      select $1,id from admin_permissions where code='print.resources.enterprise'`, [roleId]);
    await asRole('authenticated', owner);
    assert.ok((await visibleTemplates()).includes(ids.enterprise));
    await client.query('reset role');
    assert.equal((await client.query(`select count(*)::integer count from information_schema.columns
      where table_schema='public' and column_name='visibility' and table_name in
      ('print_templates','print_expressions','print_datasource_script','lowcode_form_definitions')`)).rows[0].count, 0);
    const metadata = (await client.query(`select config from service_resource_metadata
      where resource_name='print_templates' and service_name='admin'`)).rows[0].config;
    assert.equal(metadata.accessLevelRead, true);
    assert.equal(JSON.stringify(metadata).includes('visibility'), false);
    assert.equal(metadata.publicRead.filters.access_level, 'free');
    await client.query('rollback');
    console.log('Unified access_level API metadata and PostgreSQL RLS tests passed; fixtures rolled back.');
    if (process.argv.includes('--apply')) {
      await client.query(migration);
      console.log('Unified access_level migration applied to the configured local database.');
    }
  } finally {
    await client.query('reset role').catch(() => undefined);
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
