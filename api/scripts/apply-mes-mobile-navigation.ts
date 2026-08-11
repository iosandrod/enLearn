import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const configured = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
if (!configured) throw new Error('DIRECT_URL or DATABASE_URL is required.');

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(configured),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  await client.connect();
  try {
    await client.query(`
      update public.admin_routes
      set metadata = coalesce(metadata, '{}'::jsonb)
            || '{"mobileNavigation":"container"}'::jsonb,
          updated_at = timezone('utc'::text, now())
      where code = 'business-root'
        and coalesce(metadata->>'mobileNavigation', '') <> 'container'
    `);
    const result = await client.query<{
      business_root_mobile_navigation: string;
      mes_routes: string;
    }>(`
      select
        (select metadata->>'mobileNavigation'
         from public.admin_routes where code = 'business-root')
          as business_root_mobile_navigation,
        (select count(*)::text from public.admin_routes
         where code in (
           'production-root', 'production-release', 'production-execution',
           'production-ledger', 'production-material-ledger'
         )) as mes_routes
    `);
    console.log(JSON.stringify({ ...result.rows[0], applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
