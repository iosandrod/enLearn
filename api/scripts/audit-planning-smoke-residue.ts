import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

function directProjectConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
  if (match && url.hostname.includes('.pooler.supabase.com')) {
    url.hostname = `db.${match[1]}.supabase.co`;
    url.port = '5432';
    url.username = 'postgres';
  }
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const client = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    const calendars = await client.query(`
      select id, account_id, name, description, created_at, updated_at
      from public.planning_calendar
      where name like '同名日历%'
      order by created_at, id
    `);
    const accounts = await client.query(`
      select id, primary_owner_user_id, name, slug, code, status, created_at, updated_at
      from basejump.accounts
      where slug = 'planning-smoke-account'
         or code = 'PLNSMOKE'
         or name = 'Planning smoke account'
      order by created_at, id
    `);

    console.log(JSON.stringify({
      calendar_count: calendars.rowCount ?? calendars.rows.length,
      calendars: calendars.rows,
      account_count: accounts.rowCount ?? accounts.rows.length,
      accounts: accounts.rows
    }, null, 2));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
