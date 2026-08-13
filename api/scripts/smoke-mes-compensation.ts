import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = env.DATABASE_URL ?? env.DIRECT_URL;
if (!rawConnectionString) throw new Error('DATABASE_URL or DIRECT_URL is required.');

function requestHash(marker: string) {
  return marker.repeat(64).slice(0, 64);
}

async function expectDatabaseError(
  client: Client,
  operation: () => Promise<unknown>,
  pattern: RegExp
) {
  const savepoint = `mes_comp_${randomUUID().replace(/-/g, '')}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await assert.rejects(operation, pattern);
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
}

async function selectActor(client: Client) {
  const { rows } = await client.query<{ account_id: string; user_id: string }>(`
    select membership.account_id, membership.user_id
    from basejump.account_user membership
    join public.users users on users.id = membership.user_id
    order by (users.role = 'admin') desc, membership.created_at
    limit 1
  `);
  if (!rows[0]) throw new Error('MES compensation smoke test requires one account member.');
  return { accountId: rows[0].account_id, userId: rows[0].user_id };
}

async function setActor(client: Client, userId: string) {
  await client.query(
    `select set_config('request.jwt.claim.sub', $1, true),
            set_config('request.jwt.claim.role', 'authenticated', true)`,
    [userId]
  );
}

async function insertFixture(
  client: Client,
  actor: { accountId: string; userId: string }
) {
  const suffix = randomUUID().slice(0, 8);
  const locationId = randomUUID();
  const outputItemId = randomUUID();
  const componentItemId = randomUUID();
  const routeId = randomUUID();
  const stepOneId = randomUUID();
  const stepTwoId = randomUUID();
  const materialId = randomUUID();
  const scenarioId = randomUUID();
  const versionId = randomUUID();
  const operationPlanId = randomUUID();

  await client.query(
    `insert into public.planning_location (id, account_id, name)
     values ($1, $2, $3)`,
    [locationId, actor.accountId, `MES Compensation Location ${suffix}`]
  );
  await client.query(
    `insert into public.planning_item (id, account_id, name, display_name, uom)
     values ($1, $2, $3, $3, 'EA'), ($4, $2, $5, $5, 'EA')`,
    [outputItemId, actor.accountId, `MES Compensation Output ${suffix}`,
      componentItemId, `MES Compensation Component ${suffix}`]
  );
  await client.query(
    `insert into public.planning_operation
       (id, account_id, name, type, location_id, priority)
     values
       ($1, $2, $3, 'routing', $4, 1),
       ($5, $2, $6, 'fixed_time', $4, 1),
       ($7, $2, $8, 'fixed_time', $4, 2)`,
    [routeId, actor.accountId, `MES Compensation Route ${suffix}`, locationId,
      stepOneId, `MES Compensation Step 1 ${suffix}`,
      stepTwoId, `MES Compensation Step 2 ${suffix}`]
  );
  await client.query(
    `insert into public.planning_suboperation
       (account_id, operation_id, suboperation_id, priority)
     values ($1, $2, $3, 1), ($1, $2, $4, 2)`,
    [actor.accountId, routeId, stepOneId, stepTwoId]
  );
  await client.query(
    `insert into public.planning_operationmaterial
       (id, account_id, operation_id, item_id, location_id, quantity)
     values ($1, $2, $3, $4, $5, -2)`,
    [materialId, actor.accountId, stepOneId, componentItemId, locationId]
  );
  await client.query(
    `insert into public.planning_scenario (id, account_id, name)
     values ($1, $2, $3)`,
    [scenarioId, actor.accountId, `MES Compensation Scenario ${suffix}`]
  );
  await client.query(`select set_config('planning.system_version_write', 'on', true)`);
  await client.query(
    `insert into public.planning_plan_version
       (id, account_id, code, name, scenario_id, status, completed_at)
     values ($1, $2, $3, $4, $5, 'completed', timezone('utc'::text, now()))`,
    [versionId, actor.accountId, `MES-COMP-${suffix}`,
      `MES Compensation Version ${suffix}`, scenarioId]
  );
  await client.query(`select set_config('planning.system_version_write', '', true)`);
  await client.query(
    `insert into public.planning_operationplan
       (id, account_id, reference, status, type, quantity, operation_id,
        item_id, location_id, plan_version_id, startdate, enddate)
     values ($1, $2, $3, 'proposed', 'MO', 10, $4, $5, $6, $7,
       timezone('utc'::text, now()), timezone('utc'::text, now()) + interval '1 day')`,
    [operationPlanId, actor.accountId, `MES-COMP-OP-${suffix}`, routeId,
      outputItemId, locationId, versionId]
  );
  await client.query(
    `select public.planning_publish_plan_version($1, $2)`,
    [actor.accountId, versionId]
  );

  const release = await client.query<{ result: Record<string, any> }>(
    `select public.mes_release_work_order($1, $2, $3, $4, $5, null, 10) as result`,
    [actor.accountId, operationPlanId, randomUUID(), requestHash('a'), actor.userId]
  );
  const workOrderId = String(release.rows[0].result.workOrder.id);
  const operations = await client.query<{ id: string; row_version: string }>(
    `select id, row_version::text
     from public.mes_work_order_operation
     where account_id = $1 and work_order_id = $2
     order by sequence_no`,
    [actor.accountId, workOrderId]
  );
  const component = await client.query<{ id: string }>(
    `select id from public.mes_work_order_component
     where account_id = $1 and work_order_id = $2 and requirement_type = 'consume'`,
    [actor.accountId, workOrderId]
  );

  return {
    accountId: actor.accountId,
    userId: actor.userId,
    workOrderId,
    firstOperationId: operations.rows[0].id,
    secondOperationId: operations.rows[1].id,
    componentId: component.rows[0].id
  };
}

async function executeFlow(
  client: Client,
  fixture: Awaited<ReturnType<typeof insertFixture>>
) {
  const start = await client.query<{ result: Record<string, any> }>(
    `select public.mes_start_operation($1, $2, 0, $3, $4, $5) as result`,
    [fixture.accountId, fixture.firstOperationId, randomUUID(), requestHash('b'), fixture.userId]
  );
  let version = Number(start.rows[0].result.operation.row_version);

  const pauseCommandId = randomUUID();
  const pause = await client.query<{ result: Record<string, any> }>(
    `select public.mes_pause_operation($1, $2, $3, 'maintenance', $4, $5, $6) as result`,
    [fixture.accountId, fixture.firstOperationId, version, pauseCommandId,
      requestHash('c'), fixture.userId]
  );
  assert.equal(pause.rows[0].result.operation.status, 'paused');
  assert.equal(pause.rows[0].result.workOrder.status, 'paused');
  version = Number(pause.rows[0].result.operation.row_version);

  const pauseReplay = await client.query<{ result: Record<string, any> }>(
    `select public.mes_pause_operation($1, $2, $3, 'maintenance', $4, $5, $6) as result`,
    [fixture.accountId, fixture.firstOperationId, version - 1, pauseCommandId,
      requestHash('c'), fixture.userId]
  );
  assert.equal(pauseReplay.rows[0].result.operation.status, 'paused');

  await expectDatabaseError(
    client,
    () => client.query(
      `select public.mes_pause_operation($1, $2, $3, 'different-reason', $4, $5, $6) as result`,
      [fixture.accountId, fixture.firstOperationId, version - 1, pauseCommandId,
        requestHash('8'), fixture.userId]
    ),
    /reused with different data/
  );

  const resume = await client.query<{ result: Record<string, any> }>(
    `select public.mes_resume_operation($1, $2, $3, 'maintenance-complete', $4, $5, $6) as result`,
    [fixture.accountId, fixture.firstOperationId, version, randomUUID(),
      requestHash('d'), fixture.userId]
  );
  assert.equal(resume.rows[0].result.operation.status, 'in_progress');
  version = Number(resume.rows[0].result.operation.row_version);

  const issue = await client.query<{ result: Record<string, any> }>(
    `select public.mes_issue_material(
       $1, $2, $3, 20, 'LOT-COMP', null, $4, $5, $6
     ) as result`,
    [fixture.accountId, fixture.componentId, version, randomUUID(),
      requestHash('e'), fixture.userId]
  );
  const issueTransactionId = String(issue.rows[0].result.transaction.id);
  version = Number(issue.rows[0].result.operation.row_version);

  await expectDatabaseError(
    client,
    () => client.query(
      `select public.mes_return_material(
         $1, $2, $3, 21, 'LOT-COMP', null, 'too-much', $4, $5, $6
       ) as result`,
      [fixture.accountId, fixture.componentId, version, randomUUID(),
        requestHash('9'), fixture.userId]
    ),
    /exceeds the net issued quantity/
  );

  const materialReturn = await client.query<{ result: Record<string, any> }>(
    `select public.mes_return_material(
       $1, $2, $3, 4, 'LOT-COMP', null, 'excess', $4, $5, $6
     ) as result`,
    [fixture.accountId, fixture.componentId, version, randomUUID(),
      requestHash('f'), fixture.userId]
  );
  assert.equal(Number(materialReturn.rows[0].result.component.returned_quantity), 4);
  const returnTransactionId = String(materialReturn.rows[0].result.transaction.id);
  version = Number(materialReturn.rows[0].result.operation.row_version);

  const reverseReturn = await client.query<{ result: Record<string, any> }>(
    `select public.mes_reverse_material(
       $1, $2, $3, 'return-entered-by-mistake', $4, $5, $6
     ) as result`,
    [fixture.accountId, returnTransactionId, version, randomUUID(),
      requestHash('1'), fixture.userId]
  );
  assert.equal(Number(reverseReturn.rows[0].result.component.returned_quantity), 0);
  assert.equal(Number(reverseReturn.rows[0].result.transaction.quantity), 4);
  version = Number(reverseReturn.rows[0].result.operation.row_version);

  const reverseIssue = await client.query<{ result: Record<string, any> }>(
    `select public.mes_reverse_material(
       $1, $2, $3, 'wrong-lot', $4, $5, $6
     ) as result`,
    [fixture.accountId, issueTransactionId, version, randomUUID(),
      requestHash('2'), fixture.userId]
  );
  assert.equal(Number(reverseIssue.rows[0].result.component.issued_quantity), 0);
  version = Number(reverseIssue.rows[0].result.operation.row_version);

  await expectDatabaseError(
    client,
    () => client.query(
      `select public.mes_reverse_material(
         $1, $2, $3, 'duplicate', $4, $5, $6
       ) as result`,
      [fixture.accountId, issueTransactionId, version, randomUUID(),
        requestHash('3'), fixture.userId]
    ),
    /already been reversed/
  );

  const report = await client.query<{ result: Record<string, any> }>(
    `select public.mes_report_production($1, $2, $3, 6, 1, $4, $5, $6) as result`,
    [fixture.accountId, fixture.firstOperationId, version, randomUUID(),
      requestHash('4'), fixture.userId]
  );
  const reportTransactionId = String(report.rows[0].result.transaction.id);
  version = Number(report.rows[0].result.operation.row_version);

  const complete = await client.query<{ result: Record<string, any> }>(
    `select public.mes_complete_operation($1, $2, $3, $4, $5, $6) as result`,
    [fixture.accountId, fixture.firstOperationId, version, randomUUID(),
      requestHash('5'), fixture.userId]
  );
  assert.equal(complete.rows[0].result.operation.status, 'completed');
  assert.equal(complete.rows[0].result.nextOperation.status, 'ready');
  version = Number(complete.rows[0].result.operation.row_version);

  const downstreamSavepoint = `mes_downstream_${randomUUID().replace(/-/g, '')}`;
  await client.query(`savepoint ${downstreamSavepoint}`);
  try {
    const downstreamStart = await client.query<{ result: Record<string, any> }>(
      `select public.mes_start_operation($1, $2, $3, $4, $5, $6) as result`,
      [fixture.accountId, fixture.secondOperationId,
        Number(complete.rows[0].result.nextOperation.row_version), randomUUID(),
        requestHash('a'), fixture.userId]
    );
    await client.query(
      `select public.mes_report_production($1, $2, $3, 1, 0, $4, $5, $6) as result`,
      [fixture.accountId, fixture.secondOperationId,
        Number(downstreamStart.rows[0].result.operation.row_version), randomUUID(),
        requestHash('b'), fixture.userId]
    );
    await expectDatabaseError(
      client,
      () => client.query(
        `select public.mes_reverse_production(
           $1, $2, $3, 'upstream-change', $4, $5, $6
         ) as result`,
        [fixture.accountId, reportTransactionId, version, randomUUID(),
          requestHash('c'), fixture.userId]
      ),
      /Downstream execution facts must be compensated in reverse sequence first/
    );
  } finally {
    await client.query(`rollback to savepoint ${downstreamSavepoint}`);
    await client.query(`release savepoint ${downstreamSavepoint}`);
  }

  const reverseReport = await client.query<{ result: Record<string, any> }>(
    `select public.mes_reverse_production(
       $1, $2, $3, 'wrong-quantity', $4, $5, $6
     ) as result`,
    [fixture.accountId, reportTransactionId, version, randomUUID(),
      requestHash('6'), fixture.userId]
  );
  assert.equal(reverseReport.rows[0].result.operation.status, 'ready');
  assert.equal(Number(reverseReport.rows[0].result.operation.good_quantity), 0);
  assert.equal(Number(reverseReport.rows[0].result.operation.scrap_quantity), 0);
  assert.equal(Number(reverseReport.rows[0].result.transaction.good_quantity), -6);
  assert.equal(reverseReport.rows[0].result.downstreamResetCount, 1);

  const downstream = await client.query<{ status: string }>(
    `select status from public.mes_work_order_operation
     where account_id = $1 and id = $2`,
    [fixture.accountId, fixture.secondOperationId]
  );
  assert.equal(downstream.rows[0].status, 'pending');

  await expectDatabaseError(
    client,
    () => client.query(
      `select public.mes_reverse_production(
         $1, $2, $3, 'duplicate', $4, $5, $6
       ) as result`,
      [fixture.accountId, reportTransactionId,
        Number(reverseReport.rows[0].result.operation.row_version), randomUUID(),
        requestHash('7'), fixture.userId]
    ),
    /already been reversed/
  );

  const counts = await client.query<{
    compensation_commands: string;
    compensation_events: string;
    material_reversals: string;
    production_reversals: string;
  }>(
    `select
       (select count(*)::text from public.mes_command_log
        where account_id = $1 and command_type in (
          'PauseOperation', 'ResumeOperation', 'ReturnMaterial',
          'ReverseMaterial', 'ReverseProduction'
        ) and aggregate_id in (
          select operation.id from public.mes_work_order_operation operation
          where operation.account_id = $1 and operation.work_order_id = $2::uuid
          union all
          select component.id from public.mes_work_order_component component
          where component.account_id = $1 and component.work_order_id = $2::uuid
          union all
          select transaction.id from public.mes_production_transaction transaction
          where transaction.account_id = $1 and transaction.work_order_id = $2::uuid
          union all
          select transaction.id from public.mes_material_transaction transaction
          where transaction.account_id = $1 and transaction.work_order_id = $2::uuid
        )) as compensation_commands,
       (select count(*)::text from public.mes_outbox_event
        where account_id = $1
          and payload->>'workOrderId' = $2::uuid::text
          and event_type in (
            'mes.operation.paused', 'mes.operation.resumed',
            'mes.material.returned', 'mes.material.reversed',
            'mes.production.reversed'
          )) as compensation_events,
       (select count(*)::text from public.mes_material_transaction
        where account_id = $1 and work_order_id = $2::uuid
          and transaction_type = 'reverse') as material_reversals,
       (select count(*)::text from public.mes_production_transaction
        where account_id = $1 and work_order_id = $2::uuid
          and transaction_type = 'reverse') as production_reversals`,
    [fixture.accountId, fixture.workOrderId]
  );
  assert.equal(counts.rows[0].compensation_commands, '6');
  assert.equal(counts.rows[0].compensation_events, '6');
  assert.equal(counts.rows[0].material_reversals, '2');
  assert.equal(counts.rows[0].production_reversals, '1');
}

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  await client.connect();
  try {
    await client.query('begin');
    const actor = await selectActor(client);
    await setActor(client, actor.userId);
    const fixture = await insertFixture(client, actor);
    await executeFlow(client, fixture);
    await client.query('rollback');
    console.log(JSON.stringify({ smoke: 'passed', compensation: true, rolledBack: true }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
