import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import {
  assertTransactionActive,
  unwrapMigrationTransaction
} from './planning-migration-transaction';

const MIGRATION_FILES = [
  'supabase/migrations/20260807140000_planning_service.sql',
  'supabase/migrations/20260808150000_planning_diagnostic_tables.sql',
  'supabase/migrations/20260808160000_planning_extended_models.sql',
  'supabase/migrations/20260808170000_planning_execution_runtime.sql',
  'supabase/migrations/20260810110000_unify_sales_order_status.sql'
];

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

let expectedFailureCounter = 0;

async function assertTerminalResultMutationRejected(
  client: Client,
  label: string,
  mutation: () => Promise<unknown>
) {
  expectedFailureCounter += 1;
  const savepoint = `planning_terminal_result_guard_${expectedFailureCounter}`;
  await client.query(`savepoint ${savepoint}`);
  await assert.rejects(mutation, /Terminal plan results are immutable/, label);
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = (await Promise.all(
    MIGRATION_FILES.map(async (file) => unwrapMigrationTransaction(
      await readFile(resolve(repoRoot, file), 'utf8')
    ))
  )).join('\n\n');
  const client = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('begin');
    if (process.env.PLANNING_SMOKE_SKIP_MIGRATION !== '1') await client.query(migration);
    await assertTransactionActive(client);
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

    const item = await client.query<{ id: string }>(`
      insert into public.planning_item (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `sync-item-${suffix}`]);
    const customer = await client.query<{ id: string }>(`
      insert into public.planning_customer (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `sync-customer-${suffix}`]);
    const location = await client.query<{ id: string }>(`
      insert into public.planning_location (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `sync-location-${suffix}`]);
    const resource = await client.query<{ id: string }>(`
      insert into public.planning_resource (account_id, name, location_id)
      values ($1, $2, $3) returning id
    `, [accountId, `sync-resource-${suffix}`, location.rows[0].id]);
    const guardResource = await client.query<{ id: string }>(`
      insert into public.planning_resource (account_id, name, location_id)
      values ($1, $2, $3) returning id
    `, [accountId, `guard-resource-${suffix}`, location.rows[0].id]);

    const order = await client.query<{ id: string }>(`
      insert into public.sales_orders (
        account_id, doc_no, status, customer_code, customer_name
      ) values ($1, $2, 'approved', $3, $4)
      returning id
    `, [accountId, `SO-${suffix}`, `CUS-${suffix}`, `Sync customer ${suffix}`]);
    const line = await client.query<{ id: string }>(`
      insert into public.sales_order_lines (
        account_id, order_id, line_no, status, item_code, item_name,
        ordered_qty, open_qty, need_date, warehouse_code
      ) values ($1, $2, 10, 'open', $3, $4, 5, 5, '2026-09-01', $5)
      returning id
    `, [accountId, order.rows[0].id, `ITEM-${suffix}`, `Sync item ${suffix}`, `WH-${suffix}`]);

    const pendingSync = await client.query<{ status: string }>(`
      select status from public.planning_demand_sync_state
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(pendingSync.rows[0]?.status, 'error');

    await client.query(`
      insert into public.planning_source_mapping (
        account_id, source_system, entity_type, source_key, item_id, status
      ) values ($1, 'enlearn', 'item', $2, $3, 'active')
    `, [accountId, `ITEM-${suffix}`, item.rows[0].id]);
    await client.query(`
      insert into public.planning_source_mapping (
        account_id, source_system, entity_type, source_key, customer_id, status
      ) values ($1, 'enlearn', 'customer', $2, $3, 'active')
    `, [accountId, `CUS-${suffix}`, customer.rows[0].id]);
    await client.query(`
      insert into public.planning_source_mapping (
        account_id, source_system, entity_type, source_key, location_id, status
      ) values ($1, 'enlearn', 'location', $2, $3, 'active')
    `, [accountId, `WH-${suffix}`, location.rows[0].id]);

    const resync = await client.query<{ result: { synced: number; errors: number } }>(`
      select public.planning_resync_sales_orders($1, array[$2]::uuid[]) as result
    `, [accountId, line.rows[0].id]);
    assert.equal(resync.rows[0].result.synced, 1);
    assert.equal(resync.rows[0].result.errors, 0);

    const demand = await client.query<{ source_line_id: string; quantity: string; status: string }>(`
      select source_line_id, quantity::text, status from public.planning_demand
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(demand.rows[0]?.source_line_id, line.rows[0].id);
    assert.equal(demand.rows[0]?.quantity, '5.00000000');
    assert.equal(demand.rows[0]?.status, 'open');

    await client.query(`
      update public.sales_order_lines
      set open_qty = 3, need_date = '2026-09-05'
      where id = $1 and account_id = $2
    `, [line.rows[0].id, accountId]);
    const updatedDemand = await client.query<{ quantity: string; due: string }>(`
      select quantity::text, due::date::text from public.planning_demand
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(updatedDemand.rows[0]?.quantity, '3.00000000');
    assert.equal(updatedDemand.rows[0]?.due, '2026-09-05');

    await client.query(`update public.sales_order_lines set open_qty = 0 where id = $1`, [line.rows[0].id]);
    const zeroDemand = await client.query<{ quantity: string; status: string; sync_status: string }>(`
      select quantity::text, status, sync_status from public.planning_demand
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(zeroDemand.rows[0]?.quantity, '0.00000000');
    assert.equal(zeroDemand.rows[0]?.status, 'closed');
    assert.equal(zeroDemand.rows[0]?.sync_status, 'ignored');

    await client.query(`update public.sales_order_lines set open_qty = 2 where id = $1`, [line.rows[0].id]);
    const reopenedDemand = await client.query<{ quantity: string; status: string; sync_status: string }>(`
      select quantity::text, status, sync_status from public.planning_demand
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(reopenedDemand.rows[0]?.quantity, '2.00000000');
    assert.equal(reopenedDemand.rows[0]?.status, 'open');
    assert.equal(reopenedDemand.rows[0]?.sync_status, 'synced');

    await client.query(`update public.sales_orders set status = 'closed' where id = $1`, [order.rows[0].id]);
    const closedByHeader = await client.query<{ status: string; sync_status: string }>(`
      select status, sync_status from public.planning_demand
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(closedByHeader.rows[0]?.status, 'closed');
    assert.equal(closedByHeader.rows[0]?.sync_status, 'ignored');
    await client.query(`update public.sales_orders set status = 'approved' where id = $1`, [order.rows[0].id]);

    await client.query(`update public.sales_orders set status = 'on_hold' where id = $1`, [order.rows[0].id]);
    const heldDemand = await client.query<{ status: string; sync_status: string }>(`
      select status, sync_status from public.planning_demand
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(heldDemand.rows[0]?.status, 'closed');
    assert.equal(heldDemand.rows[0]?.sync_status, 'ignored');
    await client.query(`update public.sales_orders set status = 'approved' where id = $1`, [order.rows[0].id]);

    await client.query(`update public.sales_orders set status = 'draft' where id = $1`, [order.rows[0].id]);
    const unapprovedDemand = await client.query<{ status: string; sync_status: string }>(`
      select status, sync_status from public.planning_demand
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(unapprovedDemand.rows[0]?.status, 'closed');
    assert.equal(unapprovedDemand.rows[0]?.sync_status, 'pending');
    await client.query(`update public.sales_orders set status = 'approved' where id = $1`, [order.rows[0].id]);

    await client.query('delete from public.sales_order_lines where id = $1', [line.rows[0].id]);
    const deletedLineDemand = await client.query<{ quantity: string; status: string; sync_status: string }>(`
      select quantity::text, status, sync_status from public.planning_demand
      where account_id = $1 and source_line_id = $2
    `, [accountId, line.rows[0].id]);
    assert.equal(deletedLineDemand.rows[0]?.quantity, '0.00000000');
    assert.equal(deletedLineDemand.rows[0]?.status, 'canceled');
    assert.equal(deletedLineDemand.rows[0]?.sync_status, 'ignored');

    const scenario = await client.query<{ id: string }>(`
      insert into public.planning_scenario (account_id, name, description, status)
      values ($1, $2, 'extended smoke scenario', 'free')
      returning id
    `, [accountId, `smoke-scenario-${suffix}`]);
    const scenarioId = scenario.rows[0].id;

    const version = await client.query<{ id: string; version_no: number; status: string }>(`
      insert into public.planning_plan_version (
        account_id, code, name, scenario_id, parameters, input_snapshot
      ) values ($1, $2, 'extended smoke version', $3, '{}', '{}')
      returning id, version_no, status
    `, [accountId, `smoke-plan-${suffix}`, scenarioId]);
    assert.ok(version.rows[0].version_no >= 1);
    assert.equal(version.rows[0].status, 'draft');

    await client.query(`
      select public.planning_finish_plan_version($1, $2, 'completed', '{"ok":true}'::jsonb)
    `, [accountId, version.rows[0].id]);

    const published = await client.query<{ status: string; is_current: boolean; published_at: string | null }>(`
      select (published).status, (published).is_current, (published).published_at::text
      from (select public.planning_publish_plan_version($1, $2) published) result
    `, [accountId, version.rows[0].id]);
    assert.equal(published.rows[0].status, 'published');
    assert.equal(published.rows[0].is_current, true);
    assert.ok(published.rows[0].published_at);

    const secondVersion = await client.query<{ id: string; version_no: number }>(`
      insert into public.planning_plan_version (account_id, code, name, scenario_id)
      values ($1, $2, 'extended smoke version 2', $3)
      returning id, version_no
    `, [accountId, `smoke-plan-2-${suffix}`, scenarioId]);
    assert.equal(secondVersion.rows[0].version_no, version.rows[0].version_no + 1);
    await client.query(`
      select public.planning_finish_plan_version($1, $2, 'completed', '{}'::jsonb)
    `, [accountId, secondVersion.rows[0].id]);
    await client.query(`select public.planning_publish_plan_version($1, $2)`, [accountId, secondVersion.rows[0].id]);
    const versionStates = await client.query<{ id: string; status: string; is_current: boolean }>(`
      select id, status, is_current from public.planning_plan_version
      where account_id = $1 and id = any($2::uuid[])
      order by version_no
    `, [accountId, [version.rows[0].id, secondVersion.rows[0].id]]);
    assert.deepEqual(versionStates.rows.map((row) => [row.status, row.is_current]), [
      ['superseded', false],
      ['published', true]
    ]);

    await client.query('savepoint planning_published_result_guard');
    await assert.rejects(client.query(`
      insert into public.planning_operationplan (
        account_id, reference, type, quantity, plan_version_id
      ) values ($1, $2, 'MO', 1, $3)
    `, [accountId, `published-result-${suffix}`, secondVersion.rows[0].id]));
    await client.query('rollback to savepoint planning_published_result_guard');
    await client.query('release savepoint planning_published_result_guard');

    const thirdVersion = await client.query<{ id: string }>(`
      insert into public.planning_plan_version (account_id, code, name, scenario_id)
      values ($1, $2, 'extended smoke version 3', $3) returning id
    `, [accountId, `smoke-plan-3-${suffix}`, scenarioId]);
    const fourthVersion = await client.query<{ id: string }>(`
      insert into public.planning_plan_version (account_id, code, name, scenario_id)
      values ($1, $2, 'extended smoke version 4', $3) returning id
    `, [accountId, `smoke-plan-4-${suffix}`, scenarioId]);
    await client.query(`
      insert into public.planning_operationplan (account_id, reference, type, quantity, plan_version_id)
      values ($1, $2, 'MO', 1, $3), ($1, $2, 'MO', 1, $4)
    `, [accountId, `version-ref-${suffix}`, thirdVersion.rows[0].id, fourthVersion.rows[0].id]);
    await client.query(`
      insert into public.planning_resourceplan (account_id, plan_version_id, resource_id, startdate, available)
      values ($1, $2, $3, '2026-10-01T00:00:00Z', 8), ($1, $4, $3, '2026-10-01T00:00:00Z', 8)
    `, [accountId, thirdVersion.rows[0].id, resource.rows[0].id, fourthVersion.rows[0].id]);
    await client.query(`select public.planning_finish_plan_version($1, $2, 'completed', '{}'::jsonb)`, [accountId, thirdVersion.rows[0].id]);
    await client.query('savepoint planning_publish_guard');
    await assert.rejects(
      client.query(`update public.planning_plan_version set status = 'published' where id = $1`, [thirdVersion.rows[0].id])
    );
    await client.query('rollback to savepoint planning_publish_guard');
    await client.query('release savepoint planning_publish_guard');

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
    assert.equal(planningRun.rows[0].progress, 5);

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

    const manualScenario = await client.query<{ id: string }>(`
      insert into public.planning_scenario (account_id, name, description, status)
      values ($1, $2, 'runtime contract smoke scenario', 'free')
      returning id
    `, [accountId, `runtime-scenario-${suffix}`]);
    const createdRun = await client.query<{
      result: { run: { id: string; status: string }; version: { id: string; status: string } };
    }>(`
      select public.planning_create_supply_run(
        $1, $2, $3, '{"jobType":"supply_plan","overrides":{}}'::jsonb, null, 'supply_plan'
      ) as result
    `, [accountId, manualScenario.rows[0].id, `Runtime smoke ${suffix}`]);
    const manualRunId = createdRun.rows[0].result.run.id;
    const manualVersionId = createdRun.rows[0].result.version.id;
    assert.equal(createdRun.rows[0].result.run.status, 'queued');
    assert.equal(createdRun.rows[0].result.version.status, 'draft');

    const projected = await client.query<{ trigger_run_id: string }>(`
      select (public.planning_project_trigger_run($1, $2, $3)).trigger_run_id
    `, [accountId, manualRunId, `manual-trigger-${suffix}`]);
    assert.equal(projected.rows[0].trigger_run_id, `manual-trigger-${suffix}`);

    const guardedOperationPlan = await client.query<{ id: string }>(`
      insert into public.planning_operationplan (
        account_id, reference, type, status, quantity, plan_version_id
      ) values ($1, $2, 'MO', 'proposed', 1, $3)
      returning id
    `, [accountId, `guard-operationplan-${suffix}`, manualVersionId]);
    const guardedMaterial = await client.query<{ id: string }>(`
      insert into public.planning_operationplanmaterial (
        account_id, item_id, location_id, operationplan_id, quantity, flowdate,
        status, plan_version_id
      ) values ($1, $2, $3, $4, 1, '2026-10-01T00:00:00Z', 'proposed', $5)
      returning id
    `, [
      accountId,
      item.rows[0].id,
      location.rows[0].id,
      guardedOperationPlan.rows[0].id,
      manualVersionId
    ]);
    const guardedLoad = await client.query<{ id: string }>(`
      insert into public.planning_operationplanresource (
        account_id, resource_id, operationplan_id, quantity, status, plan_version_id
      ) values ($1, $2, $3, 1, 'proposed', $4)
      returning id
    `, [accountId, resource.rows[0].id, guardedOperationPlan.rows[0].id, manualVersionId]);
    const guardedProblem = await client.query<{ id: string }>(`
      insert into public.planning_problem (
        account_id, run_id, plan_version_id, entity, owner, name, description,
        startdate, enddate
      ) values (
        $1, $2, $3, 'material', $4, 'shortage', 'guard seed',
        '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'
      ) returning id
    `, [accountId, manualRunId, manualVersionId, `sync-item-${suffix} @ sync-location-${suffix}`]);
    const guardedConstraint = await client.query<{ id: string }>(`
      insert into public.planning_constraint (
        account_id, run_id, plan_version_id, item_id, entity, owner, name,
        description, startdate, enddate
      ) values (
        $1, $2, $3, $4, 'material', $5, 'shortage', 'guard seed',
        '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'
      ) returning id
    `, [
      accountId,
      manualRunId,
      manualVersionId,
      item.rows[0].id,
      `sync-item-${suffix} @ sync-location-${suffix}`
    ]);
    const guardedResourcePlan = await client.query<{ id: string }>(`
      insert into public.planning_resourceplan (
        account_id, run_id, plan_version_id, resource_id, startdate, available
      ) values ($1, $2, $3, $4, '2026-10-01T00:00:00Z', 8)
      returning id
    `, [accountId, manualRunId, manualVersionId, resource.rows[0].id]);

    const canceled = await client.query<{
      result: { run: { status: string }; version: { status: string } };
    }>(`
      select public.planning_cancel_supply_run($1, $2) as result
    `, [accountId, manualRunId]);
    assert.equal(canceled.rows[0].result.run.status, 'canceled');
    assert.equal(canceled.rows[0].result.version.status, 'canceled');

    const canceledInsertMutations: Array<[string, () => Promise<unknown>]> = [
      ['operation plan insert', () => client.query(`
        insert into public.planning_operationplan (
          account_id, reference, type, quantity, plan_version_id
        ) values ($1, $2, 'MO', 1, $3)
      `, [accountId, `guard-insert-${suffix}`, manualVersionId])],
      ['operation plan material insert through protected parent', () => client.query(`
        insert into public.planning_operationplanmaterial (
          account_id, item_id, location_id, operationplan_id, quantity, flowdate
        ) values ($1, $2, $3, $4, 2, '2026-10-03T00:00:00Z')
      `, [accountId, item.rows[0].id, location.rows[0].id, guardedOperationPlan.rows[0].id])],
      ['operation plan resource insert through protected parent', () => client.query(`
        insert into public.planning_operationplanresource (
          account_id, resource_id, operationplan_id, quantity
        ) values ($1, $2, $3, 2)
      `, [accountId, guardResource.rows[0].id, guardedOperationPlan.rows[0].id])],
      ['problem insert', () => client.query(`
        insert into public.planning_problem (
          account_id, run_id, plan_version_id, entity, owner, name, description,
          startdate, enddate
        ) values (
          $1, $2, $3, 'material', 'guard owner', 'shortage', 'guard insert',
          '2026-10-03T00:00:00Z', '2026-10-04T00:00:00Z'
        )
      `, [accountId, manualRunId, manualVersionId])],
      ['constraint insert', () => client.query(`
        insert into public.planning_constraint (
          account_id, run_id, plan_version_id, entity, owner, name, description,
          startdate, enddate
        ) values (
          $1, $2, $3, 'material', 'guard owner', 'shortage', 'guard insert',
          '2026-10-03T00:00:00Z', '2026-10-04T00:00:00Z'
        )
      `, [accountId, manualRunId, manualVersionId])],
      ['resource plan insert', () => client.query(`
        insert into public.planning_resourceplan (
          account_id, run_id, plan_version_id, resource_id, startdate, available
        ) values ($1, $2, $3, $4, '2026-10-03T00:00:00Z', 8)
      `, [accountId, manualRunId, manualVersionId, resource.rows[0].id])]
    ];
    for (const [label, mutation] of canceledInsertMutations) {
      await assertTerminalResultMutationRejected(client, label, mutation);
    }

    const canceledUpdateMutations: Array<[string, () => Promise<unknown>]> = [
      ['operation plan update', () => client.query(
        `update public.planning_operationplan set quantity = 2 where id = $1`,
        [guardedOperationPlan.rows[0].id]
      )],
      ['operation plan material update', () => client.query(
        `update public.planning_operationplanmaterial set quantity = 2 where id = $1`,
        [guardedMaterial.rows[0].id]
      )],
      ['operation plan resource update', () => client.query(
        `update public.planning_operationplanresource set quantity = 2 where id = $1`,
        [guardedLoad.rows[0].id]
      )],
      ['problem update', () => client.query(
        `update public.planning_problem set description = 'guard update' where id = $1`,
        [guardedProblem.rows[0].id]
      )],
      ['constraint update', () => client.query(
        `update public.planning_constraint set description = 'guard update' where id = $1`,
        [guardedConstraint.rows[0].id]
      )],
      ['resource plan update', () => client.query(
        `update public.planning_resourceplan set available = 7 where id = $1`,
        [guardedResourcePlan.rows[0].id]
      )]
    ];
    for (const [label, mutation] of canceledUpdateMutations) {
      await assertTerminalResultMutationRejected(client, label, mutation);
    }

    const canceledDeleteMutations: Array<[string, () => Promise<unknown>]> = [
      ['operation plan material delete', () => client.query(
        `delete from public.planning_operationplanmaterial where id = $1`,
        [guardedMaterial.rows[0].id]
      )],
      ['operation plan resource delete', () => client.query(
        `delete from public.planning_operationplanresource where id = $1`,
        [guardedLoad.rows[0].id]
      )],
      ['problem delete', () => client.query(
        `delete from public.planning_problem where id = $1`,
        [guardedProblem.rows[0].id]
      )],
      ['constraint delete', () => client.query(
        `delete from public.planning_constraint where id = $1`,
        [guardedConstraint.rows[0].id]
      )],
      ['resource plan delete', () => client.query(
        `delete from public.planning_resourceplan where id = $1`,
        [guardedResourcePlan.rows[0].id]
      )],
      ['operation plan delete', () => client.query(
        `delete from public.planning_operationplan where id = $1`,
        [guardedOperationPlan.rows[0].id]
      )]
    ];
    for (const [label, mutation] of canceledDeleteMutations) {
      await assertTerminalResultMutationRejected(client, label, mutation);
    }

    await client.query('savepoint planning_canceled_version_guard');
    await assert.rejects(
      client.query(`update public.planning_plan_version set name = 'revived' where id = $1`, [manualVersionId]),
      /Canceled plan versions are immutable/
    );
    await client.query('rollback to savepoint planning_canceled_version_guard');
    await client.query('release savepoint planning_canceled_version_guard');

    const failedAfterCancel = await client.query<{
      result: { run: { status: string }; version: { status: string } };
    }>(`
      select public.planning_fail_supply_run($1, $2, 'late worker failure') as result
    `, [accountId, manualRunId]);
    assert.equal(failedAfterCancel.rows[0].result.run.status, 'canceled');
    assert.equal(failedAfterCancel.rows[0].result.version.status, 'canceled');

    const ignoredRevival = await client.query<{ status: string }>(`
      update public.planning_run set status = 'running'
      where account_id = $1 and id = $2 returning status
    `, [accountId, manualRunId]);
    assert.equal(ignoredRevival.rows[0]?.status, 'canceled');

    const detail = await client.query<{
      result: {
        counts: Record<string, number>;
        run: { id: string; status: string };
        version: { id: string; status: string };
      };
    }>(`
      select public.planning_get_run_detail($1, $2) as result
    `, [accountId, manualRunId]);
    assert.equal(detail.rows[0].result.run.status, 'canceled');
    assert.equal(detail.rows[0].result.version.id, manualVersionId);
    assert.deepEqual(Object.values(detail.rows[0].result.counts), [1, 1, 1, 1, 1, 1]);

    const readOnlyPages = await client.query<{ count: string }>(`
      select count(*)::text
      from public.lowcode_pages
      where code in (
        'planning_problem-list', 'planning_constraint-list', 'planning_resourceplan-list',
        'planning_run-list', 'planning_archive_manager-list', 'planning_archived_buffer-list',
        'planning_archived_demand-list', 'planning_archived_operationplan-list',
        'planning_demand_sync_state-list'
      )
        and not (schema::text like '%"code":"create"%')
    `);
    assert.equal(readOnlyPages.rows[0].count, '9');

    await client.query('rollback');
    console.log(JSON.stringify({
      seeded_parameters: Number(defaults.rows[0].parameters),
      seeded_measures: Number(defaults.rows[0].measures),
      baseline_scenario: 'verified',
      plan_version_publish: 'verified',
      sales_order_demand_sync: 'verified',
      workflow_schedule_bridge: 'verified',
      workflow_run_bridge: 'verified',
      runtime_cancel_guard: 'verified',
      canceled_result_guards: '18 mutations rejected',
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
