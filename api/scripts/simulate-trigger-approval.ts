import { randomUUID } from 'node:crypto';
import { runs, tasks, wait } from '@trigger.dev/sdk';
import { TriggerCredentialsService } from '../src/workflow/trigger/trigger-credentials.service';
import {
  SIMPLE_APPROVAL_DEMO_TASK_ID,
  simpleApprovalDemoTask,
  type SimpleApprovalDecision
} from '../src/workflow/trigger/simple-approval-demo.task';

const POLL_INTERVAL_MS = 500;
const WAITING_TIMEOUT_MS = 30_000;
const COMPLETION_TIMEOUT_MS = 30_000;
const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'EXPIRED',
  'TIMED_OUT'
]);

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const credentials = new TriggerCredentialsService();

  try {
    const trigger = await credentials.configureSdk();
    const approvalId = randomUUID();
    const action = process.argv.includes('--reject') ? 'reject' : 'approve';
    const idempotencyKey = `simple-approval:${approvalId}`;

    console.log(`[1/4] Connected to Trigger.dev at ${trigger.apiUrl}.`);

    const token = await wait.createToken({
      idempotencyKey: `${idempotencyKey}:waitpoint`,
      timeout: '5m',
      tags: ['simple-approval-demo', `approval:${approvalId}`]
    });

    const run = await tasks.trigger<typeof simpleApprovalDemoTask>(
      SIMPLE_APPROVAL_DEMO_TASK_ID,
      {
        approvalId,
        applicant: 'Alice',
        amount: 1280,
        title: 'Purchase request for office equipment',
        waitpointTokenId: token.id
      },
      {
        idempotencyKey: `${idempotencyKey}:run`,
        tags: ['simple-approval-demo', `approval:${approvalId}`]
      }
    );

    console.log(`[2/4] Triggered run ${run.id}; waiting for its approval waitpoint.`);
    await waitForTokenStatus(token.id, 'WAITING', WAITING_TIMEOUT_MS);

    const decision: SimpleApprovalDecision = {
      action,
      approver: 'Demo Manager',
      comment: action === 'approve' ? 'Approved by the demo script.' : 'Rejected by the demo script.',
      decidedAt: new Date().toISOString()
    };

    console.log(`[3/4] Approval waitpoint is active; submitting decision "${action}".`);
    await wait.completeToken(token.id, decision);

    const completedRun = await waitForRunStatus(run.id, 'COMPLETED', COMPLETION_TIMEOUT_MS);
    const completedToken = await wait.retrieveToken<SimpleApprovalDecision>(token.id);

    console.log('[4/4] Trigger.dev resumed and completed the approval run.');
    console.log(
      JSON.stringify(
        {
          passed: true,
          engine: 'Trigger.dev',
          taskId: SIMPLE_APPROVAL_DEMO_TASK_ID,
          runId: completedRun.id,
          runStatus: completedRun.status,
          waitpointTokenId: token.id,
          waitpointStatus: completedToken.status,
          decision: completedToken.output,
          output: completedRun.output
        },
        null,
        2
      )
    );
  } finally {
    await credentials.onModuleDestroy();
  }
}

async function waitForRunStatus(runId: string, expectedStatus: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = await runs.retrieve(runId);

  while (snapshot.status !== expectedStatus && Date.now() < deadline) {
    if (TERMINAL_STATUSES.has(snapshot.status)) {
      throw new Error(
        `Trigger.dev run ${runId} ended as ${snapshot.status} before reaching ${expectedStatus}: ${
          snapshot.error?.message ?? 'no error details'
        }`
      );
    }

    await delay(POLL_INTERVAL_MS);
    snapshot = await runs.retrieve(runId);
  }

  if (snapshot.status !== expectedStatus) {
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for Trigger.dev run ${runId} to reach ${expectedStatus}; current status is ${snapshot.status}. Make sure the Trigger.dev worker is running.`
    );
  }

  return snapshot;
}

async function waitForTokenStatus(tokenId: string, expectedStatus: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let token = await wait.retrieveToken<SimpleApprovalDecision>(tokenId);

  while (token.status !== expectedStatus && Date.now() < deadline) {
    if (token.status === 'COMPLETED' || token.status === 'TIMED_OUT') {
      throw new Error(
        `Trigger.dev waitpoint ${tokenId} ended as ${token.status} before reaching ${expectedStatus}.`
      );
    }

    await delay(POLL_INTERVAL_MS);
    token = await wait.retrieveToken<SimpleApprovalDecision>(tokenId);
  }

  if (token.status !== expectedStatus) {
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for Trigger.dev waitpoint ${tokenId} to reach ${expectedStatus}; current status is ${token.status}. Make sure the Trigger.dev worker is running.`
    );
  }

  return token;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
