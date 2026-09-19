import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260919140000_print_designer_property_forms.sql';
const EXPECTED_FORM_COUNT = 15;
const LOCAL_API_BASE_URL = 'http://127.0.0.1:5174/api';

type PropertyFormDefinition = {
  code: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  enabled: boolean;
};

async function main() {
  const env = getEnv();
  const rawConnectionStrings = [
    env.DIRECT_URL,
    process.env.DIRECT_URL,
    env.DATABASE_URL,
    process.env.DATABASE_URL,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (!rawConnectionStrings.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  try {
    await applyThroughPostgres(rawConnectionStrings, migration);
  } catch (error) {
    console.warn(`PostgreSQL direct connection failed; using the local service API: ${errorMessage(error)}`);
    await applyThroughServiceApi(parseDefinitions(migration));
  }
}

async function applyThroughPostgres(rawConnectionStrings: string[], migration: string) {
  const client = await connect(rawConnectionStrings);
  try {
    await client.query(migration);
    const result = await client.query<{
      form_count: number;
      tabbed_form_count: number;
    }>(`
      select
        count(*)::integer as form_count,
        count(*) filter (
          where jsonb_path_exists(schema, '$.layout[*].tabs[*] ? (@.label == "基本属性")')
            and jsonb_path_exists(schema, '$.layout[*].tabs[*] ? (@.label == "高级属性")')
        )::integer as tabbed_form_count
      from public.lowcode_form_definitions
      where code like 'print-designer.property.%'
        and enabled = true
    `);
    assertInstalled(result.rows[0]);
  } finally {
    await client.end();
  }
}

function parseDefinitions(migration: string): PropertyFormDefinition[] {
  const commonMatch = migration.match(/select\s+'([^']+)'::jsonb\s+as fields/);
  if (!commonMatch) throw new Error('Could not read common property fields from the migration.');
  const commonFields = JSON.parse(commonMatch[1]) as unknown[];
  const tuplePattern = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(true|false)\s*,\s*'([^']*)'::jsonb\s*,\s*'([^']*)'::jsonb\s*\)/g;
  const definitions: PropertyFormDefinition[] = [];

  for (const match of migration.matchAll(tuplePattern)) {
    const [, code, name, description, title, includeCommon, rawFields, rawTabs] = match;
    if (!code.startsWith('print-designer.property.')) continue;
    const fields = JSON.parse(rawFields) as unknown[];
    const tabs = JSON.parse(rawTabs) as Array<{ key: string; label: string; fields: string[] }>;
    definitions.push({
      code,
      name,
      description,
      enabled: true,
      schema: {
        title,
        columns: 1,
        fields: includeCommon === 'true' ? [...commonFields, ...fields] : fields,
        layout: [{
          kind: 'tabs',
          defaultKey: tabs[0]?.key ?? 'basic',
          tabs: tabs.map((tab) => ({
            key: tab.key,
            label: tab.label,
            blocks: tab.fields.map((field) => ({ kind: 'field', field })),
          })),
        }],
        actions: [],
      },
    });
  }

  if (definitions.length !== EXPECTED_FORM_COUNT) {
    throw new Error(`Expected ${EXPECTED_FORM_COUNT} property definitions, parsed ${definitions.length}.`);
  }
  return definitions;
}

async function applyThroughServiceApi(definitions: PropertyFormDefinition[]) {
  const authResponse = await fetch(`${LOCAL_API_BASE_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '1151685410@qq.com', password: '123456' }),
  });
  if (!authResponse.ok) throw new Error(`Local API sign-in failed (${authResponse.status}).`);
  const auth = await authResponse.json() as {
    session?: { access_token?: string };
    accounts?: Array<{ account_id?: string }>;
  };
  const token = auth.session?.access_token;
  if (!token) throw new Error('Local API sign-in returned no access token.');
  const accountId = auth.accounts?.[0]?.account_id;

  async function invoke(serviceMethod: string, postData: Record<string, unknown>) {
    const response = await fetch(`${LOCAL_API_BASE_URL}/service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': `print-property-forms-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...(accountId ? { 'X-Account-Id': accountId } : {}),
      },
      body: JSON.stringify({ serviceName: 'lowcode', serviceMethod, postData }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`lowcode.${serviceMethod} failed (${response.status}): ${text}`);
    const payload = JSON.parse(text) as { data?: unknown };
    return payload.data ?? payload;
  }

  for (const definition of definitions) {
    const existing = await invoke('listItems', {
      resource: 'lowcode_form_definitions',
      filters: { code: definition.code },
      limit: 1,
    }) as Array<{ id?: string }>;
    const id = Array.isArray(existing) ? existing[0]?.id : undefined;
    await invoke(id ? 'updateItem' : 'createItem', {
      resource: 'lowcode_form_definitions',
      ...(id ? { id } : {}),
      data: id
        ? {
            name: definition.name,
            description: definition.description,
            schema: definition.schema,
            enabled: true,
          }
        : definition,
    });
  }

  const installed = await Promise.all(definitions.map(async (definition) => {
    const rows = await invoke('listItems', {
      resource: 'lowcode_form_definitions',
      filters: { code: definition.code, enabled: true },
      limit: 1,
    }) as Array<{ schema?: { layout?: Array<{ tabs?: Array<{ label?: string }> }> } }>;
    const labels = rows[0]?.schema?.layout?.[0]?.tabs?.map((tab) => tab.label) ?? [];
    return rows.length === 1 && labels.includes('基本属性') && labels.includes('高级属性');
  }));
  assertInstalled({
    form_count: installed.filter(Boolean).length,
    tabbed_form_count: installed.filter(Boolean).length,
  });
}

function assertInstalled(installed: { form_count: number; tabbed_form_count: number } | undefined) {
  if (
    !installed ||
    installed.form_count !== EXPECTED_FORM_COUNT ||
    installed.tabbed_form_count !== EXPECTED_FORM_COUNT
  ) {
    throw new Error(`Print designer property forms were not installed correctly: ${JSON.stringify(installed)}.`);
  }
  console.log(JSON.stringify({ ...installed, applied: true }));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function connect(rawConnectionStrings: string[]) {
  let connectionError: unknown;

  for (const rawConnectionString of rawConnectionStrings) {
    const url = new URL(normalizePostgresConnectionString(rawConnectionString));
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    const client = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 30_000,
      keepAlive: true,
      ssl: { rejectUnauthorized: false },
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
