import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PLANNING_CONSOLE_RESTORED_SCHEMA } from '../src/planning-service/planning-console-restored.schema';
import { assertValidLowCodePageSchema, normalizeLowCodePageSchema } from '../src/lowcode-service/lowcode.schema';

const PLANNING_CONSOLE_PAGE_CODE = 'planning_console';
const PLANNING_CONSOLE_ROUTE = '/dashboard/advanced/planning-console';

async function main() {
  const env = getEnv();
  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const schema = normalizeLowCodePageSchema(PLANNING_CONSOLE_RESTORED_SCHEMA);
  assertValidLowCodePageSchema(schema);
  const client = new Client({
    connectionString: normalizePostgresConnectionString(connectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('begin');
    const result = await client.query<{ id: string; version: number }>(
      `
        update public.lowcode_pages
        set route = $1,
            schema = $2::jsonb,
            version = case when schema is distinct from $2::jsonb then version + 1 else version end,
            published_at = case when schema is distinct from $2::jsonb then timezone('utc'::text, now()) else published_at end,
            updated_at = case when schema is distinct from $2::jsonb then timezone('utc'::text, now()) else updated_at end
        where code = $3
        returning id, version
      `,
      [PLANNING_CONSOLE_ROUTE, JSON.stringify(schema), PLANNING_CONSOLE_PAGE_CODE]
    );
    if (result.rowCount !== 1) throw new Error('The planning console page was not found.');
    const page = result.rows[0];
    await client.query(
      `
        insert into public.lowcode_page_versions (page_id, version, schema, published_at)
        select id, version, schema, published_at
        from public.lowcode_pages
        where id = $1
        on conflict (page_id, version) do update set
          schema = excluded.schema,
          published_at = excluded.published_at
      `,
      [page.id]
    );
    await client.query("select pg_notify('pgrst', 'reload schema')");
    const check = await client.query<{ version: number; table_type: string | null }>(`
      select page.version,
             block->>'tableType' as table_type
      from public.lowcode_pages page
      cross join lateral jsonb_path_query(
        page.schema,
        'strict $.** ? (@.id == "planning_console_demands_grid")'
      ) as block
      where page.code = $1
    `, [PLANNING_CONSOLE_PAGE_CODE]);
    await client.query('commit');
    console.log(JSON.stringify({
      code: PLANNING_CONSOLE_PAGE_CODE,
      version: check.rows[0]?.version ?? page.version,
      demandsTableType: check.rows[0]?.table_type,
      restored: true
    }));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
