import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const migrationPaths = [
  '20260806120000_dynamic_crud_rpc.sql',
  '20260806130000_workflow_publish_rpc.sql',
  '20260806140000_workflow_job_rpc.sql',
  '20260806150000_workflow_runtime_rpc.sql',
  '20260806160000_workflow_approval_console_rpc.sql',
  '20260806170000_notification_delivery_rpc.sql',
  '20260806180000_lowcode_table_metadata_rpc.sql',
  '20260806190000_workflow_definition_command_rpc.sql',
  '20260806200000_notification_api_rpc.sql',
  '20260806210000_lowcode_generated_page_rpc.sql',
  '20260806220000_test_access_rpc.sql'
].map((name) => resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  name
));

function normalizeConnection(value: string) {
  const normalized = normalizePostgresConnectionString(value);
  try {
    const url = new URL(normalized);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return normalized;
  }
}

function connectionCandidates(value: string) {
  const normalized = normalizeConnection(value);
  try {
    const base = new URL(normalized);
    const candidates: string[] = [];
    if (base.hostname.includes('.pooler.supabase.com')) {
      const session = new URL(base);
      session.port = '5432';
      session.searchParams.delete('pgbouncer');
      candidates.push(session.toString());
    }
    candidates.push(base.toString());
    return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
  } catch {
    return [normalized];
  }
}

async function applyMigration(connectionString: string, sql: string) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  await client.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  for (const migrationPath of migrationPaths) {
    const sql = await readFile(migrationPath, 'utf8');
    let lastError: unknown;
    let applied = false;
    for (let attempt = 1; attempt <= 5 && !applied; attempt += 1) {
      for (const connectionString of connectionCandidates(rawConnectionString)) {
        try {
          await applyMigration(connectionString, sql);
          applied = true;
          break;
        } catch (error) {
          lastError = error;
          const code = (error as NodeJS.ErrnoException | undefined)?.code;
          if (!['ECONNRESET', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03'].includes(code ?? '')) {
            throw error;
          }
        }
      }
      if (!applied && attempt < 5) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1_000));
      }
    }
    if (!applied) throw lastError;
    console.log(`${migrationPath} applied`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
