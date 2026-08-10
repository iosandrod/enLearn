import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const client = new Client({
    connectionString: normalizePostgresConnectionString(env.DIRECT_URL ?? env.DATABASE_URL!),
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  await client.connect();
  const result = await client.query(`
    select pid, usename, state, wait_event_type, wait_event, query_start,
           now() - query_start age, left(query, 300) query
    from pg_stat_activity
    where datname = current_database()
      and (query ilike '%electronics-demo%' or query ilike '%pg_advisory%' or query ilike '%planning_item%')
    order by query_start
  `);
  console.log(JSON.stringify(result.rows, null, 2));
  if (process.argv.includes('--terminate-stale-demo')) {
    const terminated = await client.query(`
      select pid, pg_terminate_backend(pid) as terminated
      from pg_stat_activity
      where pid <> pg_backend_pid()
        and datname = current_database()
        and state = 'idle in transaction'
        and query_start < now() - interval '2 minutes'
        and query ilike '%planning_item%'
    `);
    console.log(JSON.stringify({ terminated: terminated.rows }, null, 2));
  }
  await client.end();
}

void main();
