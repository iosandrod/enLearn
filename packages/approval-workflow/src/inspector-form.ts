import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode';
import type { WorkflowEdge, WorkflowNode, WorkflowNodeType } from '@enlearn/workflow-schema';

/** Canonical database codes for approval workflow inspector forms. */
export const approvalNodeFormSchemaCodeByType: Record<WorkflowNodeType, string> = {
  start: 'approval-workflow.node.start',
  end: 'approval-workflow.node.end',
  approval: 'approval-workflow.node.approval',
  sign: 'approval-workflow.node.sign',
  orSign: 'approval-workflow.node.or-sign',
  cc: 'approval-workflow.node.cc',
  condition: 'approval-workflow.node.condition',
  parallelGateway: 'approval-workflow.node.parallel-gateway',
  serviceTask: 'approval-workflow.node.service-task',
  timer: 'approval-workflow.node.timer',
  subProcess: 'approval-workflow.node.sub-process',
};

export const approvalNodeFormSchemaCodes = Object.values(approvalNodeFormSchemaCodeByType);
export const approvalEdgeFormSchemaCode = 'approval-workflow.edge';

export function getApprovalNodeFormSchemaCode(type: WorkflowNodeType) {
  return approvalNodeFormSchemaCodeByType[type];
}

export function resolveApprovalNodeFormSchema(
  node: WorkflowNode,
  schemas?: Record<string, LowCodeFormSchema>,
) {
  return schemas?.[getApprovalNodeFormSchemaCode(node.type)];
}

export function resolveApprovalEdgeFormSchema(
  _edge: WorkflowEdge,
  schemas?: Record<string, LowCodeFormSchema>,
) {
  return schemas?.[approvalEdgeFormSchemaCode];
}
