import { readFile } from 'node:fs/promises';
import { resolve4 } from 'node:dns/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PLANNING_STRUCTURE_PAGES_MIGRATION_FILE } from './generate-planning-structure-pages-migration';

interface InstalledStructurePages {
  page_count: string;
  route_count: string;
  version_count: string;
}

interface ConnectionCandidate {
  connectionString: string;
  endpoint: string;
  servername?: string;
}

async function getConnectionCandidates(value: string): Promise<ConnectionCandidate[]> {
  try {
    const url = new URL(normalizePostgresConnectionString(value));
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    const hostname = url.hostname;
    const addresses = [...new Set(await resolve4(hostname))];

    return addresses.map((address) => {
      const candidate = new URL(url);
      candidate.hostname = address;
      return {
        connectionString: candidate.toString(),
        endpoint: address,
        servername: hostname
      };
    });
  } catch {
    return [{
      connectionString: normalizePostgresConnectionString(value),
      endpoint: 'configured-host'
    }];
  }
}

function isConnectionError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';
  const message = error instanceof Error ? error.message : String(error);
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code)
    || /connection|socket|timeout|terminated|server closed/i.test(message);
}

async function applyMigration(
  candidate: ConnectionCandidate,
  migration: string
): Promise<InstalledStructurePages> {
  const client = new Client({
    connectionString: candidate.connectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: {
      rejectUnauthorized: false,
      ...(candidate.servername ? { servername: candidate.servername } : {})
    }
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query(migration);
    const result = await client.query<InstalledStructurePages>(`
      select
        (select count(*)::text from public.lowcode_pages
         where code in ('planning_routing_view', 'planning_bom_view')
           and status = 'published') as page_count,
        (select count(*)::text
         from public.admin_routes route
         join public.admin_routes parent on parent.id = route.parent_id
         where route.code in ('planning-routing-view', 'planning-bom-view')
           and route.status = 'active'
           and parent.code = 'planning-1') as route_count,
        (select count(*)::text
         from public.lowcode_page_versions version
         join public.lowcode_pages page on page.id = version.page_id
         where page.code in ('planning_routing_view', 'planning_bom_view')
           and version.version = page.version
           and version.schema = page.schema) as version_count
    `);
    return result.rows[0];
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const env = getEnv();
  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(
    resolve(repoRoot, PLANNING_STRUCTURE_PAGES_MIGRATION_FILE),
    'utf8'
  );
  const candidates = await getConnectionCandidates(connectionString);
  let installed: InstalledStructurePages | undefined;
  let lastError: unknown;

  for (const [index, candidate] of candidates.entries()) {
    try {
      installed = await applyMigration(candidate, migration);
      break;
    } catch (error) {
      lastError = error;
      if (!isConnectionError(error) || index === candidates.length - 1) throw error;
      console.warn(JSON.stringify({
        endpoint: candidate.endpoint,
        retrying: true,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  if (!installed) throw lastError ?? new Error('No database connection candidates were available.');
  if (
    installed.page_count !== '2' ||
    installed.route_count !== '2' ||
    installed.version_count !== '2'
  ) {
    throw new Error(`Planning structure page verification failed: ${JSON.stringify(installed)}`);
  }
  console.log(JSON.stringify({ ...installed, applied: true }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
