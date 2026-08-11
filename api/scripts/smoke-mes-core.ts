import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = env.DATABASE_URL ?? env.DIRECT_URL;
if (!rawConnectionString) throw new Error('DATABASE_URL or DIRECT_URL is required.');

type SmokeContext = {
  accountId: string;
  componentId: string;
  operationId: string;
  operationPlanId: string;
  userId: string;
  workOrderId: string;
};

function requestHash() {
  return 'a'.repeat(64);
}

async function expectDatabaseError(
  client: Client,
  operation: () => Promise<unknown>,
  pattern: RegExp
) {
  const savepoint = `mes_smoke_${randomUUID().replace(/-/g, '')}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await assert.rejects(operation, pattern);
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
}

async function selectActor(client: Client) {
  const { rows } = await client.query<{
    account_id: string;
    user_id: string;
  }>(`
    select membership.account_id, membership.user_id
    from basejump.account_user membership
    join public.users users on users.id = membership.user_id
    order by (users.role = 'admin') desc, membership.created_at
    limit 1
  `);
  if (!rows[0]) throw new Error('MES smoke test requires one account member.');
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
): Promise<SmokeContext> {
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
    [locationId, actor.accountId, `MES Smoke Location ${suffix}`]
  );
  await client.query(
    `insert into public.planning_item (id, account_id, name, uom)
       values ($1, $2, $3, 'EA'), ($4, $2, $5, 'EA')`,
    [
      outputItemId,
      actor.accountId,
      `MES Smoke Output ${suffix}`,
      componentItemId,
      `MES Smoke Component ${suffix}`
    ]
  );
  await client.query(
    `insert into public.planning_operation
       (id, account_id, name, type, location_id, priority)
     values
       ($1, $2, $3, 'routing', $4, 1),
       ($5, $2, $6, 'fixed_time', $4, 1),
       ($7, $2, $8, 'fixed_time', $4, 2)`,
    [
      routeId,
      actor.accountId,
      `MES Smoke Route ${suffix}`,
      locationId,
      stepOneId,
      `MES Smoke Step 1 ${suffix}`,
      stepTwoId,
      `MES Smoke Step 2 ${suffix}`
    ]
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
    [scenarioId, actor.accountId, `MES Smoke Scenario ${suffix}`]
  );
  await client.query(`select set_config('planning.system_version_write', 'on', true)`);
  await client.query(
    `insert into public.planning_plan_version
       (id, account_id, code, name, scenario_id, status, completed_at)
     values ($1, $2, $3, $4, $5, 'completed', timezone('utc'::text, now()))`,
    [
      versionId,
      actor.accountId,
      `MES-SMOKE-${suffix}`,
      `MES Smoke Version ${suffix}`,
      scenarioId
    ]
  );
  await client.query(`select set_config('planning.system_version_write', '', true)`);
  await client.query(
    `insert into public.planning_operationplan
       (id, account_id, reference, status, type, quantity, operation_id,
        item_id, location_id, plan_version_id, startdate, enddate)
     values
       ($1, $2, $3, 'proposed', 'MO', 10, $4, $5, $6, $7,
        timezone('utc'::text, now()), timezone('utc'::text, now()) + interval '1 day')`,
    [
      operationPlanId,
      actor.accountId,
      `MES-SMOKE-OP-${suffix}`,
      routeId,
      outputItemId,
      locationId,
      versionId
    ]
  );
  await client.query(
    `select public.planning_publish_plan_version($1, $2)`,
    [actor.accountId, versionId]
  );

  const releaseCommandId = randomUUID();
  const { rows: releaseRows } = await client.query<{ result: Record<string, any> }>(
    `select public.mes_release_work_order(
       $1, $2, $3, $4, $5, null, 10, 'smoke-device', 1, null
     ) as result`,
    [actor.accountId, operationPlanId, releaseCommandId, requestHash(), actor.userId]
  );
  const release = releaseRows[0].result;
  const workOrderId = String(release.workOrder.id);
  assert.equal(release.operationCount, 2);
  assert.equal(release.workOrder.planned_quantity, 10);

  const { rows: replayRows } = await client.query<{ result: Record<string, any> }>(
    `select public.mes_release_work_order(
       $1, $2, $3, $4, $5, null, 10, 'smoke-device', 1, null
     ) as result`,
    [actor.accountId, operationPlanId, releaseCommandId, requestHash(), actor.userId]
  );
  assert.equal(replayRows[0].result.workOrder.id, workOrderId);

  await expectDatabaseError(
    client,
    () => client.query(
      `select public.mes_release_work_order(
         $1, $2, $3, $4, $5, null, 9, 'smoke-device', 1, null
       ) as result`,
      [actor.accountId, operationPlanId, releaseCommandId, 'b'.repeat(64), actor.userId]
    ),
    /reused with different data/
  );

  await expectDatabaseError(
    client,
    () => client.query(
      `select public.mes_release_work_order(
         $1, $2, $3, $4, $5, null, 1, 'smoke-device', 99, null
       ) as result`,
      [actor.accountId, operationPlanId, randomUUID(), requestHash(), actor.userId]
    ),
    /remaining planning quantity/
  );

  const { rows: operations } = await client.query<{
    id: string;
    row_version: string;
    sequence_no: number;
    status: string;
  }>(
    `select id, row_version::text, sequence_no, status
     from public.mes_work_order_operation
     where account_id = $1 and work_order_id = $2
     order by sequence_no`,
    [actor.accountId, workOrderId]
  );
  assert.deepEqual(operations.map((row) => row.status), ['ready', 'pending']);

  const { rows: components } = await client.query<{ id: string }>(
    `select id from public.mes_work_order_component
     where account_id = $1 and work_order_id = $2 and requirement_type = 'consume'`,
    [actor.accountId, workOrderId]
  );
  assert.equal(components.length, 1);

  return {
    accountId: actor.accountId,
    componentId: components[0].id,
    operationId: operations[0].id,
    operationPlanId,
    userId: actor.userId,
    workOrderId
  };
}

async function executeFlow(client: Client, context: SmokeContext) {
  const start = await client.query<{ result: Record<string, any> }>(
    `select public.mes_start_operation($1, $2, 0, $3, $4, $5) as result`,
    [context.accountId, context.operationId, randomUUID(), requestHash(), context.userId]
  );
  assert.equal(start.rows[0].result.operation.status, 'in_progress');
  let version = Number(start.rows[0].result.operation.row_version);

  await expectDatabaseError(
    client,
    () => client.query(
      `select public.mes_report_production($1, $2, 0, 1, 0, $3, $4, $5) as result`,
      [context.accountId, context.operationId, randomUUID(), requestHash(), context.userId]
    ),
    /version conflict/
  );

  const issue = await client.query<{ result: Record<string, any> }>(
    `select public.mes_issue_material(
       $1, $2, $3, 20, 'LOT-SMOKE', null, $4, $5, $6,
       'smoke-device', 2, null, '{"source":"smoke"}'::jsonb
     ) as result`,
    [
      context.accountId,
      context.componentId,
      version,
      randomUUID(),
      requestHash(),
      context.userId
    ]
  );
  assert.equal(issue.rows[0].result.component.issued_quantity, 20);
  version = Number(issue.rows[0].result.operation.row_version);

  const report = await client.query<{ result: Record<string, any> }>(
    `select public.mes_report_production(
       $1, $2, $3, 9, 1, $4, $5, $6,
       'smoke-device', 3, null, '{"shift":"A"}'::jsonb
     ) as result`,
    [context.accountId, context.operationId, version, randomUUID(), requestHash(), context.userId]
  );
  assert.equal(report.rows[0].result.operation.good_quantity, 9);
  version = Number(report.rows[0].result.operation.row_version);

  const complete = await client.query<{ result: Record<string, any> }>(
    `select public.mes_complete_operation($1, $2, $3, $4, $5, $6) as result`,
    [context.accountId, context.operationId, version, randomUUID(), requestHash(), context.userId]
  );
  assert.equal(complete.rows[0].result.operation.status, 'completed');
  assert.equal(complete.rows[0].result.nextOperation.status, 'ready');

  const secondOperation = complete.rows[0].result.nextOperation;
  const secondStart = await client.query<{ result: Record<string, any> }>(
    `select public.mes_start_operation($1, $2, $3, $4, $5, $6) as result`,
    [
      context.accountId,
      secondOperation.id,
      Number(secondOperation.row_version),
      randomUUID(),
      requestHash(),
      context.userId
    ]
  );
  const secondReport = await client.query<{ result: Record<string, any> }>(
    `select public.mes_report_production($1, $2, $3, 9, 1, $4, $5, $6) as result`,
    [
      context.accountId,
      secondOperation.id,
      Number(secondStart.rows[0].result.operation.row_version),
      randomUUID(),
      requestHash(),
      context.userId
    ]
  );
  const final = await client.query<{ result: Record<string, any> }>(
    `select public.mes_complete_operation($1, $2, $3, $4, $5, $6) as result`,
    [
      context.accountId,
      secondOperation.id,
      Number(secondReport.rows[0].result.operation.row_version),
      randomUUID(),
      requestHash(),
      context.userId
    ]
  );
  assert.equal(final.rows[0].result.workOrder.status, 'completed');
  assert.equal(final.rows[0].result.workOrder.good_quantity, 9);
  assert.equal(final.rows[0].result.workOrder.scrap_quantity, 1);

  const { rows: counts } = await client.query<{
    commands: string;
    events: string;
    material_transactions: string;
    production_transactions: string;
  }>(
    `select
       (select count(*)::text from public.mes_command_log command
        where command.account_id = $1 and (
          command.aggregate_id in ($2::uuid, $3::uuid)
          or command.aggregate_id in (
            select operation.id from public.mes_work_order_operation operation
            where operation.account_id = $1 and operation.work_order_id = $4
          )
        )) as commands,
       (select count(*)::text from public.mes_outbox_event
        where account_id = $1 and payload->>'workOrderId' = $4::text) as events,
       (select count(*)::text from public.mes_material_transaction
        where account_id = $1 and work_order_id = $4) as material_transactions,
       (select count(*)::text from public.mes_production_transaction
        where account_id = $1 and work_order_id = $4) as production_transactions`,
    [context.accountId, context.operationPlanId, context.componentId, context.workOrderId]
  );
  assert.equal(counts[0].commands, '8');
  assert.equal(counts[0].events, '9');
  assert.equal(counts[0].material_transactions, '1');
  assert.equal(counts[0].production_transactions, '2');

  await expectDatabaseError(
    client,
    () => client.query(
      `update public.mes_production_transaction
       set metadata = '{"mutated":true}'::jsonb
       where account_id = $1 and work_order_id = $2`,
      [context.accountId, context.workOrderId]
    ),
    /immutable/
  );
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
    const context = await insertFixture(client, actor);
    await executeFlow(client, context);
    await client.query('rollback');
    console.log(JSON.stringify({ smoke: 'passed', rolledBack: true }));
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
