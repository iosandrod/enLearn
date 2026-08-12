import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

type LayoutNode = {
  kind?: string;
  field?: string;
  columns?: Array<{ blocks?: LayoutNode[] }>;
  blocks?: LayoutNode[];
};

type LayoutTab = {
  key?: string;
  label?: string;
  blocks?: LayoutNode[];
};

type TabLayout = LayoutNode & {
  defaultKey?: string;
  tabs?: LayoutTab[];
};

const env = getEnv();
const rawConnectionStrings = [env.DIRECT_URL, env.DATABASE_URL]
  .filter((value): value is string => Boolean(value?.trim()))
  .filter((value, index, values) => values.indexOf(value) === index);

if (!rawConnectionStrings.length) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260812160000_runtime_form_field_editor_tabs.sql',
);

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function connect() {
  let connectionError: unknown;

  for (const rawConnectionString of rawConnectionStrings) {
    const client = new Client({
      connectionString: connectionString(rawConnectionString),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 30_000,
      keepAlive: true,
    });
    client.on('error', () => undefined);

    try {
      await client.connect();
      return client;
    } catch (error) {
      connectionError = error;
      await client.end().catch(() => undefined);
    }
  }

  throw connectionError;
}

function collectLayoutFields(nodes: LayoutNode[] = [], fields = new Set<string>()) {
  for (const node of nodes) {
    if (node.kind === 'field' && node.field) fields.add(node.field);
    if (node.kind === 'row') {
      node.columns?.forEach((column) => collectLayoutFields(column.blocks, fields));
    }
    if (node.kind === 'stack') collectLayoutFields(node.blocks, fields);
  }
  return fields;
}

async function main() {
  const client = await connect();

  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{
      layout: TabLayout[];
      schema_fields: string[];
    }>(`
      select
        definitions.schema->'layout' as layout,
        (
          select array_agg(field_item->>'field' order by field_item->>'field')
          from jsonb_array_elements(definitions.schema->'fields') field_item
        ) as schema_fields
      from public.lowcode_form_definitions definitions
      where definitions.code = 'runtime-form-field-editor'
    `);
    const result = rows[0];
    const root = result?.layout?.[0];
    const tabKeys = root?.tabs?.map((tab) => tab.key) ?? [];
    const layoutFields = [...(root?.tabs ?? []).reduce(
      (fields, tab) => collectLayoutFields(tab.blocks, fields),
      new Set<string>(),
    )].sort();
    const expectedTabKeys = ['basic', 'relation', 'default-options', 'events-validation'];

    if (
      root?.kind !== 'tabs' ||
      root.defaultKey !== 'basic' ||
      JSON.stringify(tabKeys) !== JSON.stringify(expectedTabKeys) ||
      JSON.stringify(layoutFields) !== JSON.stringify(result?.schema_fields ?? [])
    ) {
      throw new Error(`Runtime field editor tab verification failed: ${JSON.stringify({
        tabKeys,
        layoutFields,
        schemaFields: result?.schema_fields,
      })}`);
    }

    console.log(JSON.stringify({ tabKeys, layoutFields }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
