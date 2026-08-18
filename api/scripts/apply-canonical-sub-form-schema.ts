import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260809180000_canonical_sub_form_schema.sql',
);

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

const auditSql = `
  with recursive roots(source, value) as (
    select 'lowcode_pages', schema from public.lowcode_pages
    union all
    select 'lowcode_form_definitions', schema from public.lowcode_form_definitions
  ), walk(source, value) as (
    select source, value from roots
    union all
    select walk.source, child.value
    from walk
    cross join lateral (
      select value
      from jsonb_array_elements(
        case when jsonb_typeof(walk.value) = 'array' then walk.value else '[]'::jsonb end
      )
      union all
      select value
      from jsonb_each(
        case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
      )
    ) as child
  )
  select
    source,
    count(*) filter (where value ->> 'component' = 'lc-sub-form')::integer as subforms,
    count(*) filter (
      where value ->> 'component' = 'lc-sub-form'
        and jsonb_typeof(value -> 'props') = 'object'
        and value -> 'props' ?| array['fields', 'columns', 'layout', 'actions']
    )::integer as legacy,
    count(*) filter (
      where value ->> 'component' = 'lc-sub-form'
        and not (
          jsonb_typeof(value -> 'props' -> 'schema') is not distinct from 'object'
          and jsonb_typeof(value -> 'props' -> 'schema' -> 'fields') is not distinct from 'array'
          and jsonb_typeof(value -> 'props' -> 'schema' -> 'actions') is not distinct from 'array'
        )
    )::integer as invalid
  from walk
  group by source
  order by source
`;

const legacyFixture = {
  fields: [
    {
      field: 'outer',
      label: 'Outer',
      component: 'lc-sub-form',
      props: {
        columns: 2,
        layout: [],
        actions: [],
        schema: { title: 'Preserved' },
        fields: [
          {
            field: 'inner',
            label: 'Inner',
            component: 'lc-sub-form',
            props: {
              fields: [{ field: 'name', label: 'Name', component: 'vxe-input' }],
            },
          },
        ],
      },
    },
  ],
  actions: [],
};

async function verifyLegacyFixture(client: Client) {
  const fixtureId = '00000000-0000-0000-0000-000000000001';
  await client.query(
    `insert into public.lowcode_form_definitions (id, code, name, schema, enabled)
     values ($1, 'canonical-sub-form-fixture', 'Canonical sub-form fixture', $2::jsonb, false)`,
    [fixtureId, JSON.stringify(legacyFixture)],
  );
  await client.query(await readFile(migrationPath, 'utf8'));
  const { rows } = await client.query<{
    legacy: number;
    invalid: number;
    preserved_title: string | null;
    outer_columns: number | null;
  }>(`
    with recursive walk(value) as (
      select schema
      from public.lowcode_form_definitions
      where id = $1
      union all
      select child.value
      from walk
      cross join lateral (
        select value from jsonb_array_elements(
          case when jsonb_typeof(walk.value) = 'array' then walk.value else '[]'::jsonb end
        )
        union all
        select value from jsonb_each(
          case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
        )
      ) as child
    )
    select
      count(*) filter (
        where value ->> 'component' = 'lc-sub-form'
          and value -> 'props' ?| array['fields', 'columns', 'layout', 'actions']
      )::integer as legacy,
      count(*) filter (
        where value ->> 'component' = 'lc-sub-form'
          and not (
            jsonb_typeof(value -> 'props' -> 'schema') is not distinct from 'object'
            and jsonb_typeof(value -> 'props' -> 'schema' -> 'fields') is not distinct from 'array'
            and jsonb_typeof(value -> 'props' -> 'schema' -> 'actions') is not distinct from 'array'
          )
      )::integer as invalid,
      (
        select schema #>> '{fields,0,props,schema,title}'
        from public.lowcode_form_definitions
        where id = $1
      ) as preserved_title,
      (
        select (schema #>> '{fields,0,props,schema,columns}')::integer
        from public.lowcode_form_definitions
        where id = $1
      ) as outer_columns
    from walk
  `, [fixtureId]);
  const fixture = rows[0];
  if (
    fixture?.legacy !== 0 ||
    fixture.invalid !== 0 ||
    fixture.preserved_title !== 'Preserved' ||
    fixture.outer_columns !== 2
  ) {
    throw new Error(`Legacy fixture conversion failed: ${JSON.stringify(fixture)}`);
  }
}

async function main() {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    const before = (await client.query(auditSql)).rows;
    await client.query('begin');
    await verifyLegacyFixture(client);
    await client.query('rollback');
    await client.query('begin');
    await client.query(await readFile(migrationPath, 'utf8'));
    const after = (await client.query(auditSql)).rows;
    if (after.some((row) => row.legacy !== 0 || row.invalid !== 0)) {
      throw new Error(`Canonical sub-form verification failed: ${JSON.stringify(after)}`);
    }
    await client.query('commit');
    console.log(JSON.stringify({ before, after }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
