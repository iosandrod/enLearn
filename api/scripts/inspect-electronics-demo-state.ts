import { Pool } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const connectionString = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!connectionString) throw new Error('DATABASE_URL or DIRECT_URL is required.');
  const pool = new Pool({
    connectionString: normalizePostgresConnectionString(connectionString),
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 2,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('error', () => undefined);
  try {
    const query = async (text: string, values: unknown[] = []) => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          return await pool.query(text, values);
        } catch (error) {
          lastError = error;
          if (attempt === 19) throw error;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 250 * (attempt + 1)));
        }
      }
      throw lastError;
    };
    const accounts = await query(`
      select id, code, name, slug, status
      from basejump.accounts
      where code = '001' or name ilike '%默认制造账套%'
      order by created_at, id
    `);
    const accountId = accounts.rows[0]?.id;
    const runs = accountId ? await query(`
      select r.id, r.name, r.status, r.progress, r.message, r.output,
             v.id as version_id, v.code as version_code, v.status as version_status,
             v.result_summary,
             (select count(*)::int from public.planning_operationplan p
                where p.account_id = r.account_id and p.plan_version_id = v.id) as operationplans,
             (select jsonb_object_agg(type, count) from (
                select type, count(*)::int as count
                from public.planning_operationplan p
                where p.account_id = r.account_id and p.plan_version_id = v.id
                group by type
             ) types) as operationplan_types,
             (select count(*)::int from public.planning_operationplanmaterial p
                where p.account_id = r.account_id and p.plan_version_id = v.id) as materials,
             (select count(*)::int from public.planning_operationplanresource p
                where p.account_id = r.account_id and p.plan_version_id = v.id) as resources,
             (select count(*)::int from public.planning_problem p
                where p.account_id = r.account_id and p.plan_version_id = v.id) as problems,
             (select count(*)::int from public.planning_constraint p
                where p.account_id = r.account_id and p.plan_version_id = v.id) as constraints
      from public.planning_run r
      join public.planning_plan_version v
        on v.account_id = r.account_id and v.run_id = r.id
      where r.account_id = $1
        and (r.arguments->>'demo' = 'electronics-demo' or r.name like '电子制造演示%')
      order by r.created_at desc
      limit 10
    `, [accountId]) : { rows: [] };
    console.log(JSON.stringify({ accounts: accounts.rows, runs: runs.rows }, null, 2));
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
