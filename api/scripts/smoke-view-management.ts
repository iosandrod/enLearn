import { Client } from 'pg';
import {
  getEnv,
  normalizePostgresConnectionString
} from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

function directProjectConnectionString(value: string) {
  try {
    const url = new URL(normalizePostgresConnectionString(value));
    const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
    if (match && url.hostname.includes('.pooler.supabase.com')) {
      url.hostname = `db.${match[1]}.supabase.co`;
      url.port = '5432';
      url.username = 'postgres';
    }
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return normalizePostgresConnectionString(value);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectDatabaseError(
  client: Client,
  savepoint: string,
  operation: () => Promise<unknown>,
  expectedCode: string
) {
  await client.query(`savepoint ${savepoint}`);
  try {
    await operation();
    throw new Error(`Expected PostgreSQL error ${expectedCode}.`);
  } catch (error) {
    const code = (error as { code?: string }).code;
    await client.query(`rollback to savepoint ${savepoint}`);
    if (code !== expectedCode) throw error;
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const code = `view_smoke_${suffix}`;
  const viewName = `view_smoke_${suffix}`;
  const dependentName = `view_smoke_dependency_${suffix}`;
  const client = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    const adminResult = await client.query<{ id: string }>(`
      select users.id::text
      from public.users users
      where users.role = 'admin'
      union
      select user_roles.user_id::text
      from public.admin_user_roles user_roles
      join public.admin_roles roles on roles.id = user_roles.role_id
      join public.admin_role_permissions role_permissions
        on role_permissions.role_id = roles.id
      join public.admin_permissions permissions
        on permissions.id = role_permissions.permission_id
      where user_roles.account_id is null
        and roles.status = 'active'
        and permissions.status = 'active'
        and permissions.code = 'entity.views.manage'
      limit 1
    `);
    const userId = adminResult.rows[0]?.id;
    assert(userId, 'No user has entity.views.manage permission.');

    await client.query('begin');
    await client.query(`select pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await client.query('set local role authenticated');

    const definitionSql = 'select 1::integer as id, current_date as business_date';
    const validation = await client.query<{ result: { valid?: boolean } }>(
      `select public.entity_design_validate_view($1::jsonb) as result`,
      [JSON.stringify({ definition_sql: definitionSql })]
    );
    assert(validation.rows[0]?.result.valid === true, 'Valid SELECT was not accepted.');

    await expectDatabaseError(
      client,
      'invalid_definition',
      () => client.query(
        `select public.entity_design_validate_view($1::jsonb)`,
        [JSON.stringify({ definition_sql: 'delete from public.users' })]
      ),
      '22023'
    );

    const saved = await client.query<{ result: { id?: string; status?: string } }>(
      `select public.entity_design_save_view($1::jsonb) as result`,
      [JSON.stringify({
        code,
        schema_name: 'public',
        view_name: viewName,
        title: 'View management smoke test',
        description: 'Rolled back after verification.',
        definition_sql: definitionSql,
        metadata: { smoke_test: true }
      })]
    );
    const viewId = saved.rows[0]?.result.id;
    assert(viewId, 'Saving a draft did not return an id.');
    assert(saved.rows[0]?.result.status === 'draft', 'A new managed view must start as draft.');

    const published = await client.query<{ result: { status?: string } }>(
      `select public.entity_design_publish_view($1::jsonb) as result`,
      [JSON.stringify({ id: viewId })]
    );
    assert(published.rows[0]?.result.status === 'published', 'Publishing did not update status.');

    const physical = await client.query<{
      relation_name: string | null;
      security_invoker: boolean;
      row_count: string;
    }>(`
      select
        pg_catalog.to_regclass(pg_catalog.format('public.%I', $1::text))::text as relation_name,
        coalesce('security_invoker=true' = any(relation.reloptions), false) as security_invoker,
        (select count(*)::text from public.entity_design_views where id = $2::uuid) as row_count
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = $1::text
        and relation.relkind = 'v'
    `, [viewName, viewId]);
    assert(physical.rows[0]?.relation_name === viewName, 'Published PostgreSQL view is missing.');
    assert(physical.rows[0]?.security_invoker, 'Published view is not security_invoker.');
    assert(physical.rows[0]?.row_count === '1', 'Managed view metadata is missing.');

    const columns = await client.query<{ result: Array<{ column_name?: string }> }>(
      `select public.entity_design_list_view_columns($1::jsonb) as result`,
      [JSON.stringify({ id: viewId })]
    );
    assert(
      columns.rows[0]?.result.map((column) => column.column_name).join(',') === 'id,business_date',
      'Published view columns were not returned in ordinal order.'
    );

    await client.query('reset role');
    await client.query(
      `create view public.${dependentName} as select * from public.${viewName}`
    );
    await client.query('set local role authenticated');
    await expectDatabaseError(
      client,
      'restrict_dependency',
      () => client.query(
        `select public.entity_design_archive_view($1::jsonb)`,
        [JSON.stringify({ id: viewId })]
      ),
      '2BP01'
    );

    await client.query('reset role');
    await client.query(`drop view public.${dependentName}`);
    await client.query('set local role authenticated');

    const archived = await client.query<{ result: { status?: string } }>(
      `select public.entity_design_archive_view($1::jsonb) as result`,
      [JSON.stringify({ id: viewId })]
    );
    assert(archived.rows[0]?.result.status === 'archived', 'Archiving did not update status.');

    const deleted = await client.query<{ result: { deleted?: boolean } }>(
      `select public.entity_design_delete_view($1::jsonb) as result`,
      [JSON.stringify({ id: viewId })]
    );
    assert(deleted.rows[0]?.result.deleted === true, 'Deleting metadata did not succeed.');

    const finalState = await client.query<{ metadata_count: string; relation_name: string | null }>(`
      select
        (select count(*)::text from public.entity_design_views where id = $1::uuid) as metadata_count,
        pg_catalog.to_regclass(pg_catalog.format('public.%I', $2::text))::text as relation_name
    `, [viewId, viewName]);
    assert(finalState.rows[0]?.metadata_count === '0', 'Deleted metadata still exists.');
    assert(finalState.rows[0]?.relation_name === null, 'Archived physical view still exists.');

    await client.query('rollback');
    console.log(JSON.stringify({
      validated: true,
      published: true,
      columns: ['id', 'business_date'],
      restrictDependency: true,
      archived: true,
      deleted: true,
      rolledBack: true
    }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
