import { task, wait } from '@trigger.dev/sdk';

// trigger.config.ts 会扫描当前目录，开发环境或部署后的 Trigger.dev Worker
// 会使用下面这个固定 ID 注册任务。
export const SIMPLE_APPROVAL_DEMO_TASK_ID = 'simple-approval-demo';

export type SimpleApprovalDemoPayload = {
  approvalId: string;
  applicant: string;
  amount: number;
  title: string;
  waitpointTokenId: string;
};

export type SimpleApprovalDecision = {
  action: 'approve' | 'reject';
  approver: string;
  comment: string;
  decidedAt: string;
};

export const simpleApprovalDemoTask = task({
  id: SIMPLE_APPROVAL_DEMO_TASK_ID,
  run: async (payload: SimpleApprovalDemoPayload) => {
    // 这是由 Trigger.dev 管理的持久化等待：引擎会暂停当前任务，
    // 等其他进程完成令牌后再恢复执行，整个过程不依赖业务数据表。
    const result = await wait.forToken<SimpleApprovalDecision>(payload.waitpointTokenId);
    if (!result.ok) throw result.error;

    const decision = result.output;

    // 这里返回的对象会成为本次 Trigger.dev 运行记录中可查看的最终输出。
    return {
      approvalId: payload.approvalId,
      applicant: payload.applicant,
      amount: payload.amount,
      title: payload.title,
      status: decision.action === 'approve' ? 'approved' : 'rejected',
      decision
    };
  }
});
