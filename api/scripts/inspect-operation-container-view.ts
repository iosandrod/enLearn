import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const raw = env.DATABASE_URL;
if (!raw) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const client = new Client({ connectionString: normalizePostgresConnectionString(raw), ssl: { rejectUnauthorized: false } });
async function main() {
  await client.connect();
  try {
    const columns = await client.query(`
    select ordinal_position, column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'planning_operation_container'
    order by ordinal_position
  `);
    const definition = await client.query(`
    select definition from pg_views
    where schemaname = 'public' and viewname = 'planning_operation_container'
  `);
    console.log(JSON.stringify({ columns: columns.rows, definition: definition.rows }, null, 2));
  } finally {
    await client.end();
  }
}

void main();
