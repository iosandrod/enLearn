import { randomUUID } from 'node:crypto';
import { runs, tasks, wait } from '@trigger.dev/sdk';
import { TriggerCredentialsService } from '../src/workflow/trigger/trigger-credentials.service';
import {
  SIMPLE_APPROVAL_DEMO_TASK_ID,
  simpleApprovalDemoTask,
  type SimpleApprovalDecision
} from '../src/workflow/trigger/simple-approval-demo.task';

// 这个示例不读写业务表，审批数据只保存在当前脚本内存中。
// Trigger.dev 仍会在自身基础设施中持久化运行记录和等待点，因此确实经过了流程引擎。
const POLL_INTERVAL_MS = 500;
const WAITING_TIMEOUT_MS = 30_000;
const COMPLETION_TIMEOUT_MS = 30_000;

// 如果任务已经进入终态，就立即停止轮询，因为它不可能再到达预期状态。
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
    // 获取当前项目的动态凭据，并用它们初始化 Trigger.dev SDK。
    const trigger = await credentials.configureSdk();
    const approvalId = randomUUID();

    // 默认模拟审批通过；传入 --reject 时模拟驳回。
    const action = process.argv.includes('--reject') ? 'reject' : 'approve';
    const idempotencyKey = `simple-approval:${approvalId}`;

    console.log(`[1/4] Connected to Trigger.dev at ${trigger.apiUrl}.`);

    // 先创建人工等待点，再把令牌放进任务参数中。
    // Trigger.dev Worker 执行任务后会暂停在这个等待点上。
    const token = await wait.createToken({
      idempotencyKey: `${idempotencyKey}:waitpoint`,
      timeout: '5m',
      tags: ['simple-approval-demo', `approval:${approvalId}`]
    });

    // 将任务提交给 Trigger.dev。当前脚本不会直接调用 simpleApprovalDemoTask.run，
    // 真正的任务逻辑由已注册的 Trigger.dev Worker 执行。
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

    // 等到 Worker 真正执行到 wait.forToken() 后再提交审批结果。
    // 这一步可以证明任务已经被 Trigger.dev 引擎接收并执行。
    await waitForTokenStatus(token.id, 'WAITING', WAITING_TIMEOUT_MS);

    // 在真实系统中，这个审批决定通常来自审批接口或 Webhook 回调。
    const decision: SimpleApprovalDecision = {
      action,
      approver: 'Demo Manager',
      comment: action === 'approve' ? 'Approved by the demo script.' : 'Rejected by the demo script.',
      decidedAt: new Date().toISOString()
    };

    console.log(`[3/4] Approval waitpoint is active; submitting decision "${action}".`);

    // 完成等待点令牌，Trigger.dev 随后会恢复之前暂停的任务。
    await wait.completeToken(token.id, decision);

    // 同时检查任务运行状态和等待点状态。
    // completeToken 请求成功只代表审批结果已提交，不代表任务一定执行完毕。
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
    // TriggerCredentialsService 内部维护了一个用于查询动态凭据的 PostgreSQL 连接池，
    // 因此即使示例执行失败，也必须在 finally 中关闭它。
    await credentials.onModuleDestroy();
  }
}

// 轮询 Trigger.dev 运行状态，等待 Worker 从暂停状态恢复并执行完成。
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

// 直接轮询等待点状态。Trigger.dev v4 中，已经暂停的任务可能仍短暂显示为 EXECUTING，
// 而等待点进入 WAITING 更能准确说明任务正在等待人工审批。
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
