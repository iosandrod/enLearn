import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { executeLowCodeRemoteRuntime } from '../src/lowcode-service/lowcode-runtime.executor';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL
  ?? env.DIRECT_URL
  ?? process.env.DATABASE_URL
  ?? env.DATABASE_URL;
if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const runtimeRoot = resolve(repoRoot, 'packages/lowcode-framework/src/runtime');

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const files = await listFiles(runtimeRoot);
  const readStats = async (path: string) => {
    const source = await readFile(path, 'utf8');
    const lines = source.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    return { path: relative(repoRoot, path), lines: lines.length, nonBlank: lines.filter((line) => line.trim()).length };
  };
  const fileStats = await Promise.all(files.map(readStats));
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    application_name: 'lowcode-runtime-audit',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query(`
      select
        (select count(*)::int from public.lowcode_page_runtime) as runtime_total,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'page_function' and execution_mode = 'script' and is_system) as remote_page_functions,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'page_function' and execution_mode = 'native' and is_system) as native_page_functions,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'button_rule' and is_system) as button_rules,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'directive' and is_system) as directives,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'capability' and is_system) as capabilities,
        (select count(*)::int from public.lowcode_node_actions where enabled and is_system) as node_actions,
        (select count(*)::int from pg_stat_activity where application_name like '%lowcode-page-runtime%') as migration_sessions
    `);
    const { rows: remoteRows } = await client.query<{
      runtime_key: string;
      page_type: 'list' | 'edit' | 'detail' | 'custom' | null;
      source_code: string;
      runtime_spec: Record<string, unknown>;
      capabilities: string[];
    }>(`
      select runtime_key, page_type, source_code, runtime_spec, capabilities
      from public.lowcode_page_runtime
      where function_type = 'page_function'
        and is_system
        and execution_mode = 'script'
        and enabled
        and status = 'published'
      order by runtime_key
    `);
    const remoteScriptFailures: Array<{ runtimeKey: string; error: string }> = [];
    for (const runtime of remoteRows) {
      try {
        await executeLowCodeRemoteRuntime({
          sourceCode: runtime.source_code,
          args: {},
          snapshot: {
            page: { code: 'audit', pageType: runtime.page_type ?? 'custom', mode: runtime.page_type === 'edit' ? 'edit' : undefined },
            route: {}, data: {}, forms: {}, searches: {}, grids: {},
            event: {
              selectedRows: [{ id: 'audit-row', status: 'draft' }],
              formRecords: [{ id: 'audit-row', status: 'open' }],
            },
            runtimeSpec: runtime.runtime_spec,
          },
          allowedEffects: runtime.capabilities,
        });
      } catch (error) {
        remoteScriptFailures.push({
          runtimeKey: runtime.runtime_key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const totals = fileStats.reduce((result, item) => ({
      files: result.files + 1,
      lines: result.lines + item.lines,
      nonBlank: result.nonBlank + item.nonBlank,
    }), { files: 0, lines: 0, nonBlank: 0 });
    const result = {
      directory: totals,
      target: {
        publicRuntimeMaxLines: 5000,
        publicRuntimeWithinTarget: totals.lines <= 5000,
      },
      database: {
        ...rows[0],
        remote_script_execution_count: remoteRows.length,
        remote_script_execution_failures: remoteScriptFailures,
      },
      largestFiles: fileStats.sort((a, b) => b.lines - a.lines).slice(0, 12),
    };
    console.log(JSON.stringify(result, null, 2));
    if (remoteScriptFailures.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
