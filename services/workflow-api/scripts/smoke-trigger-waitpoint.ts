import { randomUUID } from 'node:crypto';
import { runs, tasks, wait } from '@trigger.dev/sdk';
import { getWorkflowEnv } from '../src/common/env';
import { TRIGGER_WAITPOINT_DIAGNOSTIC_TASK_ID } from '../src/trigger/waitpoint-diagnostic.task';

getWorkflowEnv();

void main();

async function main() {
  const testId = `waitpoint-smoke-${randomUUID()}`;
  const token = await wait.createToken({
    idempotencyKey: testId,
    tags: ['diagnostic', 'waitpoint-smoke', testId]
  });

  const run = await tasks.trigger(
    TRIGGER_WAITPOINT_DIAGNOSTIC_TASK_ID,
    { tokenId: token.id, testId },
    { idempotencyKey: testId }
  );

  await delay(1_000);
  await wait.completeToken(token.id, { approved: true, testId });

  const deadline = Date.now() + 15_000;
  let snapshot = await runs.retrieve(run.id);
  while (!isTerminal(snapshot.status) && Date.now() < deadline) {
    await delay(1_000);
    snapshot = await runs.retrieve(run.id);
  }

  const retrievedToken = await wait.retrieveToken<{ approved: boolean; testId: string }>(token.id);
  const result = {
    testId,
    runId: run.id,
    runStatus: snapshot.status,
    tokenId: token.id,
    tokenStatus: retrievedToken.status,
    tokenOutput: retrievedToken.output,
    passed: snapshot.status === 'COMPLETED' && retrievedToken.status === 'COMPLETED'
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    process.exitCode = 1;
  }
}

function isTerminal(status: string) {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELED' || status === 'CRASHED';
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
