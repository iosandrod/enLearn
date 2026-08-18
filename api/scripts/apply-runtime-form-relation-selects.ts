import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

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
  'supabase/migrations/20260812230000_runtime_form_relation_selects.sql',
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

async function main() {
  const client = await connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{ relation_fields: unknown[] }>(`
      select relation_field#>'{props,schema,fields}' as relation_fields
      from public.lowcode_form_definitions definitions,
        lateral jsonb_array_elements(definitions.schema->'fields') relation_field
      where definitions.code = 'runtime-form-field-editor'
        and relation_field->>'field' = 'relateInfoConfig'
    `);
    const relationFields = rows[0]?.relation_fields;
    if (!Array.isArray(relationFields)) {
      throw new Error('Runtime relation selector verification returned no relation schema.');
    }
    const selectableFields = new Set([
      'resource', 'valueField', 'displayField',
      'displayValueField', 'searchField',
    ]);
    const removedFields = new Set([
      'sourceType', 'entityCode', 'tableName', 'pageCode', 'sourceKey',
      'serviceName', 'serviceMethod',
    ]);
    const invalid = relationFields.filter((field) => {
      if (!field || typeof field !== 'object') return false;
      const candidate = field as Record<string, any>;
      return selectableFields.has(candidate.field) && candidate.component !== 'vxe-select';
    });
    const mappingField = relationFields.find(
      (field: any) => field?.field === 'fieldMappings',
    ) as Record<string, any> | undefined;
    const mappingColumns = mappingField?.props?.columns;
    const displayField = relationFields.find(
      (field: any) => field?.field === 'displayField',
    ) as Record<string, any> | undefined;
    if (
      invalid.length ||
      relationFields.some((field: any) => removedFields.has(field?.field)) ||
      displayField?.props?.multiple !== true ||
      !Array.isArray(mappingColumns) ||
      mappingColumns.filter((column: any) =>
        ['sourceField', 'targetField'].includes(column?.field) &&
        column?.component === 'vxe-select'
      ).length !== 2
    ) {
      throw new Error('Runtime relation selector verification failed.');
    }
    console.log(JSON.stringify({ selectableFieldCount: selectableFields.size }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
