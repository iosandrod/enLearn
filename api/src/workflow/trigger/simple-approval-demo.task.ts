import { task, wait } from '@trigger.dev/sdk';

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
    const result = await wait.forToken<SimpleApprovalDecision>(payload.waitpointTokenId);
    if (!result.ok) throw result.error;

    const decision = result.output;
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
