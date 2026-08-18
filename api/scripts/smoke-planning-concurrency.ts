import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, Pool, type PoolClient } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import {
  PLANNING_INPUT_TABLES,
  PLANNING_NAME_ENTITIES,
  PlanningCanceledError,
  type PlanningEngineResult,
  type PlanningNameIndex,
  type PlanningReferenceIndex,
  type PlanningRunOutput
} from '../src/planning-service/execution/planning-execution.types';
import { PlanningResultWriter } from '../src/planning-service/execution/planning-result.writer';
import { PlanningRunRepository } from '../src/planning-service/execution/planning-run.repository';

const RACE_ROUNDS = 18;
const CURRENT_DATE = '2026-08-09T00:00:00.000Z';

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

function emptyNames(): PlanningNameIndex {
  return Object.fromEntries(PLANNING_NAME_ENTITIES.map((entity) => [
    entity,
    { idByName: new Map<string, string>(), nameById: new Map<string, string>() }
  ])) as PlanningNameIndex;
}

function emptyReferences(): PlanningReferenceIndex {
  return { buffers: new Set(), demands: new Set(), operations: new Set() };
}

function engineResult(reference: string): PlanningEngineResult {
  return {
    constraints: [],
    engine: {
      bridge: 'planning-concurrency-smoke',
      references: { buffers: [], demands: [], operations: [] }
    },
    operationPlanMaterials: [],
    operationPlanResources: [],
    operationPlans: [{
      quantity: 1,
      reference,
      status: 'proposed',
      type: 'STCK'
    }],
    problems: [],
    resourcePlans: []
  };
}

function runOutput(round: number): Omit<PlanningRunOutput,
  'constraintCount' |
  'operationPlanCount' |
  'operationPlanMaterialCount' |
  'operationPlanResourceCount' |
  'problemCount' |
  'resourcePlanCount'> {
  const counts = Object.fromEntries(PLANNING_INPUT_TABLES.map((table) => [table, 0])) as
    PlanningRunOutput['inputSnapshot']['counts'];
  return {
    inputSnapshot: {
      counts,
      hash: `concurrency-smoke-${round}`,
      loadedAt: CURRENT_DATE
    },
    parameters: {
      administrativeLeadtime: 0,
      algorithm: 'supply',
      autoFence: 0,
      constraints: 15,
      currentDate: CURRENT_DATE,
      individualPoolResources: false,
      iterationMax: -1,
      lazyDelay: 86_400,
      logLevel: 0,
      minimumDelay: 3_600,
      moveApprovedEarly: 0,
      planType: 1,
      resourceIterationMax: 500,
      rotateResources: false
    },
    preflight: {
      checkedAt: CURRENT_DATE,
      errors: [],
      issueCount: 0,
      ok: true,
      snapshotHash: `concurrency-smoke-${round}`,
      warnings: []
    }
  };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function observeRunLock(pool: Pool, onLocked: () => void) {
  return {
    connect: async () => {
      const client = await pool.connect();
      const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
      return {
        query: async (...args: unknown[]) => {
          const result = await query(...args);
          const sql = typeof args[0] === 'string' ? args[0] : '';
          if (sql.includes('from public.planning_run') && sql.includes('for update')) onLocked();
          return result;
        },
        release: client.release.bind(client)
      } as unknown as PoolClient;
    }
  } as unknown as Pool;
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const connectionString = directProjectConnectionString(rawConnectionString);
  const connectionOptions = {
    connectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  } as const;
  const admin = new Client(connectionOptions);
  const cancelClient = new Client(connectionOptions);
  const writerPool = new Pool({
    ...connectionOptions,
    idleTimeoutMillis: 30_000,
    max: 1
  });
  const accountId = randomUUID();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let accountCreated = false;
  let cancelConnected = false;
  const outcomes = { canceled: 0, succeeded: 0 };

  await admin.connect();
  try {
    const owner = await admin.query<{ id: string }>(
      'select id from auth.users order by created_at, id limit 1'
    );
    const ownerId = owner.rows[0]?.id;
    assert.ok(ownerId, 'An auth user is required to create an isolated planning smoke account.');
    await admin.query(`
      insert into basejump.accounts (
        id, primary_owner_user_id, name, slug, personal_account, code, status
      ) values ($1, $2, $3, $4, false, $5, 'active')
    `, [
      accountId,
      ownerId,
      `Planning concurrency smoke ${suffix}`,
      `planning-concurrency-smoke-${suffix}`,
      `PCON${accountId.replace(/-/g, '').slice(0, 8)}`
    ]);
    accountCreated = true;

    const scenario = await writerPool.query<{ id: string }>(`
      insert into public.planning_scenario (account_id, name, description, status)
      values ($1, $2, 'cancel versus complete concurrency smoke', 'free')
      returning id
    `, [accountId, `concurrency-scenario-${suffix}`]);
    const scenarioId = scenario.rows[0].id;

    await cancelClient.connect();
    cancelConnected = true;
    const cancelBackend = await cancelClient.query<{ pid: number }>('select pg_backend_pid() as pid');
    const writerBackend = await writerPool.query<{ pid: number }>('select pg_backend_pid() as pid');
    assert.notEqual(
      cancelBackend.rows[0].pid,
      writerBackend.rows[0].pid,
      'Cancellation and completion must use independent PostgreSQL connections.'
    );

    const repository = new PlanningRunRepository(writerPool);
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const created = await writerPool.query<{
        result: { run: { id: string }; version: { id: string } };
      }>(`
        select public.planning_create_supply_run(
          $1, $2, $3, $4::jsonb, null, 'supply_plan'
        ) as result
      `, [
        accountId,
        scenarioId,
        `Planning concurrency smoke ${round + 1}`,
        JSON.stringify({ jobType: 'supply_plan', smoke: 'planning-concurrency' })
      ]);
      const runId = created.rows[0].result.run.id;
      const planVersionId = created.rows[0].result.version.id;
      await repository.start({ accountId, planVersionId, runId });

      const cancellationWins = round % 2 === 0;
      const cancelLocked = deferred();
      const completionStarted = deferred();
      const writerLocked = deferred();
      const writer = new PlanningResultWriter(observeRunLock(writerPool, writerLocked.resolve));
      const cancellation = cancellationWins
        ? (async () => {
            await cancelClient.query('begin');
            try {
              const result = await cancelClient.query(`
                select public.planning_cancel_supply_run($1, $2) as result
              `, [accountId, runId]);
              cancelLocked.resolve();
              await completionStarted.promise;
              await delay(5);
              await cancelClient.query('commit');
              return result;
            } catch (error) {
              await cancelClient.query('rollback').catch(() => undefined);
              throw error;
            }
          })()
        : (async () => {
            await writerLocked.promise;
            return cancelClient.query(`
              select public.planning_cancel_supply_run($1, $2) as result
            `, [accountId, runId]);
          })();
      const completion = (async () => {
        if (cancellationWins) await cancelLocked.promise;
        completionStarted.resolve();
        return writer.complete({
          accountId,
          names: emptyNames(),
          output: runOutput(round),
          planVersionId,
          references: emptyReferences(),
          result: engineResult(`RACE-${round + 1}`),
          runId
        });
      })();
      const [completionResult, cancellationResult] = await Promise.allSettled([
        completion,
        cancellation
      ]);

      const persisted = await writerPool.query<{
        constraint_count: string;
        operationplan_count: string;
        operationplanmaterial_count: string;
        operationplanresource_count: string;
        problem_count: string;
        resourceplan_count: string;
        run_output: PlanningRunOutput | null;
        run_status: string;
        version_summary: Record<string, unknown>;
        version_status: string;
      }>(`
        select
          r.status as run_status,
          r.output as run_output,
          v.status as version_status,
          v.result_summary as version_summary,
          (select count(*)::text from public.planning_operationplan
            where account_id = $1 and plan_version_id = $3) as operationplan_count,
          (select count(*)::text from public.planning_operationplanmaterial
            where account_id = $1 and plan_version_id = $3) as operationplanmaterial_count,
          (select count(*)::text from public.planning_operationplanresource
            where account_id = $1 and plan_version_id = $3) as operationplanresource_count,
          (select count(*)::text from public.planning_problem
            where account_id = $1 and plan_version_id = $3) as problem_count,
          (select count(*)::text from public.planning_constraint
            where account_id = $1 and plan_version_id = $3) as constraint_count,
          (select count(*)::text from public.planning_resourceplan
            where account_id = $1 and plan_version_id = $3) as resourceplan_count
        from public.planning_run r
        join public.planning_plan_version v
          on v.account_id = r.account_id and v.run_id = r.id
        where r.account_id = $1 and r.id = $2 and v.id = $3
      `, [accountId, runId, planVersionId]);
      const state = persisted.rows[0];
      assert.ok(state, `Race round ${round + 1} lost its run or version row.`);
      const pair = `${state.run_status}/${state.version_status}`;
      assert.ok(
        pair === 'canceled/canceled' || pair === 'succeeded/completed',
        `Race round ${round + 1} produced a torn terminal state: ${pair}.`
      );

      const resultCounts = [
        state.operationplan_count,
        state.operationplanmaterial_count,
        state.operationplanresource_count,
        state.problem_count,
        state.constraint_count,
        state.resourceplan_count
      ].map(Number);
      if (pair === 'canceled/canceled') {
        outcomes.canceled += 1;
        assert.equal(cancellationResult.status, 'fulfilled');
        assert.equal(completionResult.status, 'rejected');
        assert.ok(completionResult.reason instanceof PlanningCanceledError);
        assert.deepEqual(resultCounts, [0, 0, 0, 0, 0, 0]);
        assert.equal(state.run_output, null);

        await assert.rejects(
          writer.complete({
            accountId,
            names: emptyNames(),
            output: runOutput(round),
            planVersionId,
            references: emptyReferences(),
            result: engineResult(`LATE-${round + 1}`),
            runId
          }),
          PlanningCanceledError
        );
      } else {
        outcomes.succeeded += 1;
        assert.equal(completionResult.status, 'fulfilled');
        assert.equal(cancellationResult.status, 'rejected');
        assert.deepEqual(resultCounts, [1, 0, 0, 0, 0, 0]);
        assert.equal(state.run_output?.operationPlanCount, 1);
        assert.equal(Number(state.version_summary.operationPlanCount), 1);

        await assert.rejects(
          cancelClient.query(`
            select public.planning_cancel_supply_run($1, $2) as result
          `, [accountId, runId]),
          (error: NodeJS.ErrnoException) => error.code === '23514'
        );
      }

      const terminalState = await writerPool.query<{ run_status: string; version_status: string }>(`
        select r.status as run_status, v.status as version_status
        from public.planning_run r
        join public.planning_plan_version v
          on v.account_id = r.account_id and v.run_id = r.id
        where r.account_id = $1 and r.id = $2 and v.id = $3
      `, [accountId, runId, planVersionId]);
      assert.equal(
        `${terminalState.rows[0].run_status}/${terminalState.rows[0].version_status}`,
        pair,
        `A late contender revived race round ${round + 1}.`
      );
    }
  } finally {
    await writerPool.end().catch(() => undefined);
    if (cancelConnected) await cancelClient.end().catch(() => undefined);
    if (accountCreated) {
      await admin.query('delete from basejump.accounts where id = $1', [accountId]);
      const residue = await admin.query<{ count: string }>(`
        select count(*)::text as count from basejump.accounts where id = $1
      `, [accountId]);
      assert.equal(residue.rows[0]?.count, '0', 'The isolated concurrency account was not removed.');
    }
    await admin.end();
  }

  assert.equal(outcomes.canceled + outcomes.succeeded, RACE_ROUNDS);
  console.log(JSON.stringify({
    rounds: RACE_ROUNDS,
    outcomes,
    invariant: 'canceled/canceled or succeeded/completed',
    cleanup: 'verified isolated account cascade'
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
