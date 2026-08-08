import assert from 'node:assert/strict';
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
    await client.query('begin');
    const account = await client.query<{ id: string }>(`
      select id from basejump.accounts where status = 'active' order by created_at, id limit 1
    `);
    const accountId = account.rows[0]?.id;
    assert.ok(accountId, 'An active account set is required.');
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const defaults = await client.query<{ parameters: string; measures: string; baseline: string }>(`
      select
        (select count(*)::text from public.planning_parameter where account_id = $1 and source = 'frepple-default') parameters,
        (select count(*)::text from public.planning_measure where account_id = $1 and source = 'frepple-default') measures,
        (select count(*)::text from public.planning_scenario where account_id = $1 and name = 'baseline') baseline
    `, [accountId]);
    assert.ok(Number(defaults.rows[0]?.parameters) >= 19);
    assert.ok(Number(defaults.rows[0]?.measures) >= 10);
    assert.equal(defaults.rows[0]?.baseline, '1');

    const scenario = await client.query<{ id: string }>(`
      insert into public.planning_scenario (account_id, name, description, status)
      values ($1, $2, 'extended smoke scenario', 'free')
      returning id
    `, [accountId, `smoke-scenario-${suffix}`]);
    const scenarioId = scenario.rows[0].id;

    const schedule = await client.query<{ id: string }>(`
      insert into public.planning_schedule (
        account_id, name, job_type, scenario_id, timezone, cron_expr, enabled, data, trigger_task_id
      ) values ($1, $2, 'supply_plan', $3, 'Asia/Shanghai', '0 2 * * *', true, '{"constraint":52}', 'planning.run')
      returning id
    `, [accountId, `smoke-schedule-${suffix}`, scenarioId]);
    const scheduleId = schedule.rows[0].id;

    const workflowJob = await client.query<{ id: string; payload: Record<string, unknown>; status: string }>(`
      select id, payload, status from public.wf_job
      where account_id = $1 and code = $2
    `, [accountId, `planning.${scheduleId}`]);
    assert.equal(workflowJob.rowCount, 1);
    assert.equal(workflowJob.rows[0].status, 'enabled');
    assert.equal(workflowJob.rows[0].payload.planningScheduleId, scheduleId);

    const workflowRun = await client.query<{ id: string }>(`
      insert into public.wf_job_run (account_id, job_id, trigger_run_id, status, attempt, input, started_at)
      values ($1, $2, $3, 'running', 1, '{"source":"extended-smoke"}', timezone('utc'::text, now()))
      returning id
    `, [accountId, workflowJob.rows[0].id, `smoke-trigger-${suffix}`]);

    const planningRun = await client.query<{ scenario_id: string; workflow_job_id: string; status: string; progress: number }>(`
      select scenario_id, workflow_job_id, status, progress from public.planning_run
      where id = $1 and account_id = $2
    `, [workflowRun.rows[0].id, accountId]);
    assert.equal(planningRun.rowCount, 1);
    assert.equal(planningRun.rows[0].scenario_id, scenarioId);
    assert.equal(planningRun.rows[0].workflow_job_id, scheduleId);
    assert.equal(planningRun.rows[0].status, 'running');
    assert.equal(planningRun.rows[0].progress, 50);

    await client.query(`
      update public.wf_job_run
      set status = 'succeeded', finished_at = timezone('utc'::text, now()), output = '{"ok":true}'
      where id = $1
    `, [workflowRun.rows[0].id]);
    const completed = await client.query<{ status: string; progress: number; finished: string | null }>(`
      select status, progress, finished::text from public.planning_run where id = $1
    `, [workflowRun.rows[0].id]);
    assert.equal(completed.rows[0].status, 'succeeded');
    assert.equal(completed.rows[0].progress, 100);
    assert.ok(completed.rows[0].finished);

    const readOnlyPages = await client.query<{ count: string }>(`
      select count(*)::text
      from public.lowcode_pages
      where code in (
        'planning_problem-list', 'planning_constraint-list', 'planning_resourceplan-list',
        'planning_run-list', 'planning_archive_manager-list', 'planning_archived_buffer-list',
        'planning_archived_demand-list', 'planning_archived_operationplan-list'
      )
        and not (schema::text like '%"code":"create"%')
    `);
    assert.equal(readOnlyPages.rows[0].count, '8');

    await client.query('rollback');
    console.log(JSON.stringify({
      seeded_parameters: Number(defaults.rows[0].parameters),
      seeded_measures: Number(defaults.rows[0].measures),
      baseline_scenario: 'verified',
      workflow_schedule_bridge: 'verified',
      workflow_run_bridge: 'verified',
      generated_output_pages: 'read-only',
      transaction: 'verified rollback'
    }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
