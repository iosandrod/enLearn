import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const connection = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connection) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const url = new URL(normalizePostgresConnectionString(connection));
  const client = new Client({
    connectionString: url.toString(), connectionTimeoutMillis: 30_000,
    ssl: ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const users = await client.query('select id from auth.users order by created_at limit 2');
    const pages = await client.query("select code from public.lowcode_pages where page_type = 'list' limit 1");
    assert.equal(users.rows.length, 2, 'Two existing users are required for RLS checks.');
    assert.ok(pages.rows.length, 'A list page is required.');
    const [owner, other] = users.rows.map((row) => row.id);
    const pageCode = pages.rows[0].code;
    const prefix = `search-model-test-${randomUUID()}`;
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [owner]);
    const first = await client.query(`
      insert into public.admin_search_models (page_code, name, query_values, active)
      values ($1, $2, $3, true) returning id, user_id
    `, [pageCode, `${prefix}-first`, { forms: { query: { name: '生产' } } }]);
    assert.equal(first.rows[0].user_id, owner);
    const second = await client.query(`
      insert into public.admin_search_models (page_code, name, query_values, active)
      values ($1, $2, $3, true) returning id
    `, [pageCode, `${prefix}-second`, { forms: { query: { name: '采购' } } }]);
    assert.notEqual(first.rows[0].id, second.rows[0].id, 'Creating a scheme must insert a new row.');
    const active = await client.query('select id from public.admin_search_models where page_code = $1 and active', [pageCode]);
    assert.deepEqual(active.rows.map((row) => row.id), [second.rows[0].id]);

    await client.query('select public.save_admin_search_model($1, $2, $3, null)', [
      pageCode, { forms: { query: { name: '切换' } } }, first.rows[0].id,
    ]);
    const switched = await client.query('select id, query_values from public.admin_search_models where page_code = $1 and active', [pageCode]);
    assert.equal(switched.rows[0].id, first.rows[0].id);
    assert.deepEqual(switched.rows[0].query_values.forms.query, { name: '切换' });

    await client.query('savepoint duplicate_name');
    await assert.rejects(client.query(`
      insert into public.admin_search_models (page_code, name, active) values ($1, $2, true)
    `, [pageCode, `${prefix}-first`]), (error: unknown) => (error as { code?: string }).code === '23505');
    await client.query('rollback to savepoint duplicate_name');

    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [other]);
    const hidden = await client.query('select id from public.admin_search_models where id = any($1::uuid[])', [
      [first.rows[0].id, second.rows[0].id],
    ]);
    assert.equal(hidden.rows.length, 0, 'Another user must not read the owner schemes.');
    const denied = await client.query("update public.admin_search_models set name = 'not-allowed' where id = $1 returning id", [first.rows[0].id]);
    assert.equal(denied.rows.length, 0, 'Another user must not modify the owner schemes.');
    console.log('Database scheme creation, activation, duplicate-name, JSON persistence, and user isolation passed (rolled back).');
  } finally {
    await client.query('rollback');
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
