import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20261011150000_print_designer_bi_chart_form.sql';
const FORM_CODE = 'print-designer.property.bi-chart';

function parseEnvFile(path: string) {
  if (!existsSync(path)) return {} as Record<string, string>;
  return readFileSync(path, 'utf8').split(/\r?\n/).reduce<Record<string, string>>((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return env;
    const separator = trimmed.indexOf('=');
    if (separator < 0) return env;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = value;
    return env;
  }, {});
}

function requestedEnvFile() {
  const index = process.argv.findIndex((arg) => arg === '--env-file');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const repoRoot = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const env = { ...getEnv(), ...parseEnvFile(resolve(repoRoot, requestedEnvFile() ?? '.env.remote')) };
  const connectionStrings = [env.DIRECT_URL, env.DATABASE_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (!connectionStrings.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  let client: Client | undefined;
  let connectionError: unknown;
  for (const raw of connectionStrings) {
    const url = new URL(normalizePostgresConnectionString(raw));
    const sslDisabled = !url.searchParams.get('sslmode') || url.searchParams.get('sslmode') === 'disable'
      || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    const candidate = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 30_000,
      ssl: sslDisabled ? false : { rejectUnauthorized: false },
    });
    candidate.on('error', () => undefined);
    try {
      await candidate.connect();
      client = candidate;
      break;
    } catch (error) {
      connectionError = error;
      await candidate.end().catch(() => undefined);
    }
  }
  if (!client) throw connectionError;

  try {
    await client.query(migration);
    const result = await client.query<{ code: string; enabled: boolean; fields: string[]; tabs: string[] }>(`
      select code, enabled,
        array(select field->>'field' from jsonb_array_elements(schema->'fields') field) as fields,
        array(select tab->>'label' from jsonb_array_elements(schema->'layout'->0->'tabs') tab) as tabs
      from public.lowcode_form_definitions
      where code = $1
    `, [FORM_CODE]);
    const row = result.rows[0];
    const requiredFields = ['chartType', 'title', 'chartColor', 'background', 'showLegend', 'showTooltip', 'dataJson', 'optionJson', 'w', 'h'];
    const requiredTabs = ['基本属性', '数据配置', '样式属性', '高级属性'];
    if (!row?.enabled || !requiredFields.every((field) => row.fields.includes(field)) || !requiredTabs.every((tab) => row.tabs.includes(tab))) {
      throw new Error(`BI chart property form verification failed: ${JSON.stringify(row)}`);
    }
    console.log(JSON.stringify({ applied: true, code: row.code, enabled: row.enabled, fieldCount: row.fields.length, tabs: row.tabs }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
