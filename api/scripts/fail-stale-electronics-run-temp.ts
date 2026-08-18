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
  try {
    const rows = await client.query(`
      select id
      from planning_run
      where account_id = '00000000-0000-4000-8000-000000000001'
        and status in ('queued', 'running')
        and name like '电子制造演示%'
    `);
    for (const row of rows.rows) {
      await client.query(
        `select planning_fail_supply_run($1, $2, $3)`,
        [
          '00000000-0000-4000-8000-000000000001',
          row.id,
          '电子制造演示排产预检失败，已清理运行状态。'
        ]
      );
    }
    console.log(JSON.stringify({ failed: rows.rowCount }));
  } finally {
    await client.end();
  }
}

void main();
