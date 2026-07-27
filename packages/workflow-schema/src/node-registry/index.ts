import type { WorkflowNodeType } from '../schema/types';

export type WorkflowNodeDefinition = {
  type: WorkflowNodeType;
  label: string;
  category: 'event' | 'task' | 'gateway' | 'notification';
  allowIncoming: boolean;
  allowOutgoing: boolean;
  minOutgoing?: number;
  maxOutgoing?: number;
};

export const builtInWorkflowNodeDefinitions: WorkflowNodeDefinition[] = [
  {
    type: 'start',
    label: '开始',
    category: 'event',
    allowIncoming: false,
    allowOutgoing: true,
    minOutgoing: 1,
    maxOutgoing: 1
  },
  {
    type: 'approval',
    label: '审批',
    category: 'task',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 1,
    maxOutgoing: 1
  },
  {
    type: 'sign',
    label: '会签',
    category: 'task',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 1,
    maxOutgoing: 1
  },
  {
    type: 'orSign',
    label: '或签',
    category: 'task',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 1,
    maxOutgoing: 1
  },
  {
    type: 'condition',
    label: '条件',
    category: 'gateway',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 2
  },
  {
    type: 'cc',
    label: '抄送',
    category: 'notification',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 1,
    maxOutgoing: 1
  },
  {
    type: 'parallelGateway',
    label: '并行网关',
    category: 'gateway',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 2
  },
  {
    type: 'serviceTask',
    label: '服务节点',
    category: 'task',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 1,
    maxOutgoing: 1
  },
  {
    type: 'timer',
    label: '定时节点',
    category: 'event',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 1,
    maxOutgoing: 1
  },
  {
    type: 'subProcess',
    label: '子流程',
    category: 'task',
    allowIncoming: true,
    allowOutgoing: true,
    minOutgoing: 1,
    maxOutgoing: 1
  },
  {
    type: 'end',
    label: '结束',
    category: 'event',
    allowIncoming: true,
    allowOutgoing: false,
    maxOutgoing: 0
  }
];

export const builtInWorkflowNodeTypeSet = new Set(
  builtInWorkflowNodeDefinitions.map((definition) => definition.type)
);

export function getBuiltInWorkflowNodeDefinition(type: WorkflowNodeType) {
  return builtInWorkflowNodeDefinitions.find((definition) => definition.type === type);
}

export function isBuiltInWorkflowNodeType(type: WorkflowNodeType) {
  return builtInWorkflowNodeTypeSet.has(type);
}
