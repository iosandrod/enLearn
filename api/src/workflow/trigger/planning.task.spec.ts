import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { PlanningEngineResultValidationError } from '../../planning-service/execution/planning-engine-result';
import {
  PlanningCanceledError,
  PlanningPreflightError,
  PlanningResultValidationError
} from '../../planning-service/execution/planning-execution.types';
import {
  isNonRetryablePlanningError,
  normalizePlanningTaskPayload,
  updateWorkflowRun
} from './planning.task';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const SCENARIO_ID = '33333333-3333-4333-8333-333333333333';

const normalized = normalizePlanningTaskPayload({
  tenantId: ACCOUNT_ID,
  runId: RUN_ID,
  planningScenarioId: SCENARIO_ID,
  planningJobType: 'supply_plan'
});
assert.equal(normalized.accountId, ACCOUNT_ID);
assert.equal(normalized.scenarioId, SCENARIO_ID);
assert.throws(
  () => normalizePlanningTaskPayload({
    accountId: ACCOUNT_ID, runId: RUN_ID, scenarioId: SCENARIO_ID, jobType: 'forecast'
  }),
  /Unsupported planning job type/
);

const preflightError = new PlanningPreflightError({
  checkedAt: new Date(0).toISOString(), errors: [], issueCount: 0,
  ok: false, snapshotHash: 'hash', warnings: []
});
for (const error of [
  new PlanningCanceledError(),
  preflightError,
  new PlanningEngineResultValidationError('$', 'invalid'),
  new PlanningResultValidationError('invalid')
]) {
  assert.equal(isNonRetryablePlanningError(error), true);
}
assert.equal(isNonRetryablePlanningError(new Error('transient network error')), false);

async function attemptProjectionTest() {
  let query: { sql: string; values: unknown[] } | undefined;
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      query = { sql, values };
      return { rows: [], rowCount: 1 };
    }
  } as unknown as Pool;
  await updateWorkflowRun(pool, normalized, 'running', undefined, undefined, 4);
  assert.ok(query?.sql.includes('attempt = greatest(attempt, $3)'));
  assert.ok(query?.sql.includes("status in ('queued', 'running')"));
  assert.equal(query?.values[2], 4);
}

void attemptProjectionTest().then(() => {
  console.log('planning Trigger.dev payload, retry, and attempt tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
