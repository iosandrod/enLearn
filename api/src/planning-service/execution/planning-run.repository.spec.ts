import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import {
  PlanningCanceledError,
  PlanningResultValidationError,
  type PlanningEngineResult,
  type PlanningNameEntity,
  type PlanningNameIndex,
  type PlanningReferenceIndex
} from './planning-execution.types';
import { PlanningResultWriter } from './planning-result.writer';
import { PlanningRunRepository } from './planning-run.repository';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';

function index(entries: Record<string, string>): { idByName: Map<string, string>; nameById: Map<string, string> } {
  return {
    idByName: new Map(Object.entries(entries)),
    nameById: new Map(Object.entries(entries).map(([name, id]) => [id, name]))
  };
}

const names = Object.fromEntries(([
  'customer', 'demand', 'item', 'location', 'operation', 'resource', 'supplier'
] as PlanningNameEntity[]).map((entity) => [entity, index(
  entity === 'demand' ? { 'Demand 1': 'demand-id' } :
    entity === 'item' ? { Item: 'item-id' } :
      entity === 'location' ? { Plant: 'location-id' } :
        entity === 'operation' ? { 'Make item': 'operation-id' } :
          entity === 'resource' ? { Line: 'resource-id' } : {}
)])) as PlanningNameIndex;

const references: PlanningReferenceIndex = {
  buffers: new Set(['Item @ Plant']),
  demands: new Set(['Demand 1']),
  operations: new Set(['Make item'])
};

function engineResult(): PlanningEngineResult {
  return {
    operationPlans: [{
      reference: 'OP-1', type: 'MO', status: 'proposed', quantity: 1,
      operation: 'Make item', item: 'Item', location: 'Plant', demand: 'Demand 1',
      start: '2026-08-09T00:00:00.000Z', end: '2026-08-10T00:00:00.000Z'
    }],
    operationPlanMaterials: [{
      operationPlanReference: 'OP-1', item: 'Item', location: 'Plant', quantity: 1,
      date: '2026-08-10T00:00:00.000Z', status: 'proposed'
    }],
    operationPlanResources: [{
      operationPlanReference: 'OP-1', resource: 'Line', quantity: 1, status: 'proposed'
    }],
    problems: [],
    constraints: [{
      demand: 'Demand 1', item: 'Item', entity: 'demand', owner: 'Demand 1',
      name: 'late', description: 'late demand',
      start: '2026-08-09T00:00:00.000Z', end: '2026-08-10T00:00:00.000Z'
    }],
    resourcePlans: [],
    engine: {
      bridge: 'test',
      references: {
        buffers: [{ name: 'Item @ Plant', item: 'Item', location: 'Plant' }],
        demands: ['Demand 1'],
        operations: [{
          name: 'Make item', hidden: false, buffers: ['Item @ Plant'],
          resources: ['Line'], suboperations: []
        }]
      }
    }
  };
}

const baseOutput = {
  inputSnapshot: { counts: {} as never, hash: 'hash', loadedAt: '2026-08-09T00:00:00.000Z' },
  parameters: {} as never,
  preflight: {
    checkedAt: '2026-08-09T00:00:00.000Z', errors: [], issueCount: 0,
    ok: true, snapshotHash: 'hash', warnings: []
  }
};

function complete(writer: PlanningResultWriter, result: PlanningEngineResult) {
  return writer.complete({
    accountId: ACCOUNT_ID,
    names,
    output: baseOutput,
    planVersionId: VERSION_ID,
    references,
    result,
    runId: RUN_ID
  });
}

async function validationHappensBeforeConnection() {
  let connections = 0;
  const pool = { connect: async () => { connections += 1; throw new Error('must not connect'); } };
  const result = engineResult();
  result.engine.references.operations.push({
    name: 'Injected operation', hidden: false, buffers: [], resources: [], suboperations: []
  });
  await assert.rejects(
    complete(new PlanningResultWriter(pool as unknown as Pool), result),
    PlanningResultValidationError
  );
  assert.equal(connections, 0);
}

async function unknownBusinessReferencesFailBeforeConnection() {
  const cases: Array<[string, (result: PlanningEngineResult) => void]> = [
    ['buffer', (result) => {
      result.engine.references.buffers[0] = {
        name: 'Unknown @ Plant', item: 'Unknown', location: 'Plant'
      };
    }],
    ['demand', (result) => {
      result.engine.references.demands.push('Unknown demand');
    }],
    ['resource', (result) => {
      result.engine.references.operations[0].resources.push('Unknown resource');
    }],
    ['operation', (result) => {
      result.engine.references.operations.push({
        name: 'Injected operation', hidden: false, buffers: [], resources: [], suboperations: []
      });
    }],
    ['detail resource', (result) => {
      result.operationPlanResources[0].resource = 'Unknown resource';
    }]
  ];
  for (const [label, mutate] of cases) {
    let connections = 0;
    const pool = { connect: async () => { connections += 1; throw new Error('must not connect'); } };
    const result = engineResult();
    mutate(result);
    await assert.rejects(
      complete(new PlanningResultWriter(pool as unknown as Pool), result),
      PlanningResultValidationError,
      label
    );
    assert.equal(connections, 0, label);
  }
}

async function transactionRollsBackOnInsertFailure() {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('from public.planning_run')) {
        return { rows: [{ status: 'running', output: null }] };
      }
      if (sql.includes('from public.planning_plan_version')) {
        return { rows: [{ id: VERSION_ID, status: 'running' }] };
      }
      if (sql.includes('insert into public.planning_constraint')) {
        throw new Error('simulated constraint insert failure');
      }
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined
  };
  const pool = { connect: async () => client };
  await assert.rejects(
    complete(new PlanningResultWriter(pool as unknown as Pool), engineResult()),
    /simulated constraint insert failure/
  );
  assert.ok(queries.includes('rollback'));
  assert.ok(!queries.includes('commit'));
  assert.ok(!queries.some((sql) => sql.includes("set status = 'succeeded'")));
}

async function canceledStateCannotBeRevived() {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('from public.planning_run')) {
        return { rows: [{ status: 'canceled', output: null }] };
      }
      if (sql.includes('from public.planning_plan_version')) {
        return { rows: [{ id: VERSION_ID, status: 'canceled' }] };
      }
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined
  };
  const pool = { connect: async () => client } as unknown as Pool;
  await assert.rejects(complete(new PlanningResultWriter(pool), engineResult()), PlanningCanceledError);
  assert.ok(!queries.some((sql) => sql.includes('delete from public.planning_operationplan')));
  assert.ok(queries.includes('rollback'));

  queries.length = 0;
  await new PlanningRunRepository(pool).finishFailed(
    ACCOUNT_ID, RUN_ID, VERSION_ID, 'late worker failure'
  );
  assert.ok(queries.includes('commit'));
  assert.ok(!queries.some((sql) => sql.includes('set status = $3')));
}

async function main() {
  await validationHappensBeforeConnection();
  await unknownBusinessReferencesFailBeforeConnection();
  await transactionRollsBackOnInsertFailure();
  await canceledStateCannotBeRevived();
  console.log('planning writer transaction and terminal-state tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
