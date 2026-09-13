import type {
  WorkflowCondition,
  WorkflowEdge,
  WorkflowModel,
  WorkflowNode
} from './schema/types';

/** The execution model shared by approval and trigger workflows. */
export type CanonicalNodeType =
  | 'start'
  | 'end'
  | 'humanTask'
  | 'condition'
  | 'parallelFork'
  | 'parallelJoin'
  | 'serviceTask'
  | 'timer'
  | 'cc'
  | 'subProcess'
  | 'task'
  | 'dataConnector'
  | 'agent';

export type HumanCompletionPolicy =
  | { type: 'any' }
  | { type: 'all' }
  | { type: 'ratio'; ratio: number };

export type CanonicalNode = {
  id: string;
  type: CanonicalNodeType;
  name: string;
  sourceType: string;
  config: Record<string, unknown>;
  human?: {
    completion: HumanCompletionPolicy;
    assigneeStrategy?: Record<string, unknown>;
  };
};

export type CanonicalEdge = {
  id: string;
  source: string;
  target: string;
  priority?: number;
  condition?: WorkflowCondition | Record<string, unknown>;
};

export type CanonicalWorkflow = {
  schemaVersion: 1;
  id: string;
  code: string;
  name: string;
  entryNodeId: string;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  metadata?: Record<string, unknown>;
};

export type WorkflowNodeCapability = {
  type: CanonicalNodeType;
  sourceTypes: string[];
  schema: true;
  validator: true;
  compiler: true;
  strategy: string;
  adapter: string;
  projection: true;
  uiEditor: true;
  supportsWait: boolean;
  supportsFork: boolean;
  supportsJoin: boolean;
};

const capability = (
  type: CanonicalNodeType,
  sourceTypes: string[],
  strategy: string,
  adapter: string,
  supportsWait: boolean,
  supportsFork: boolean,
  supportsJoin: boolean
): WorkflowNodeCapability => ({ type, sourceTypes, schema: true, validator: true, compiler: true, strategy, adapter, projection: true, uiEditor: true, supportsWait, supportsFork, supportsJoin });

export const canonicalWorkflowCapabilities: WorkflowNodeCapability[] = [
  capability('start', ['start', 'schedule', 'webhook'], 'StartNodeStrategy', 'none', false, false, false),
  capability('end', ['end'], 'EndNodeStrategy', 'none', false, false, false),
  capability('humanTask', ['approval', 'sign', 'orSign', 'manualApproval', 'humanReview'], 'HumanTaskStrategy', 'waitpoint', true, false, false),
  capability('condition', ['condition'], 'ConditionStrategy', 'expression', false, false, false),
  capability('parallelFork', ['parallelGateway', 'parallel'], 'ParallelForkStrategy', 'scheduler', false, true, false),
  capability('parallelJoin', ['parallelJoin'], 'ParallelJoinStrategy', 'scheduler', false, false, true),
  capability('serviceTask', ['serviceTask', 'task', 'triggerAndWait'], 'ServiceTaskStrategy', 'task', true, false, false),
  capability('task', ['task', 'triggerAndWait', 'batchTrigger', 'tool', 'transform', 'memory'], 'TaskStrategy', 'task', true, false, false),
  capability('timer', ['timer', 'wait', 'schedule'], 'TimerStrategy', 'timer', true, false, false),
  capability('cc', ['cc'], 'CcStrategy', 'notification', false, false, false),
  capability('subProcess', ['subProcess'], 'SubProcessStrategy', 'workflow', true, false, false),
  capability('dataConnector', ['dataSource', 'dataSink'], 'DataConnectorStrategy', 'task', true, false, false),
  capability('agent', ['agent'], 'AgentStrategy', 'task', true, false, false)
];

export function capabilityForCanonicalType(type: CanonicalNodeType) {
  return canonicalWorkflowCapabilities.find((capability) => capability.type === type);
}

export function assertCanonicalWorkflowCapabilities(workflow: CanonicalWorkflow) {
  const issues: string[] = [];
  for (const node of workflow.nodes) {
    const capability = capabilityForCanonicalType(node.type);
    if (!capability) issues.push(`Node ${node.id} has no registered capability.`);
    if (capability && (!capability.schema || !capability.validator || !capability.compiler || !capability.strategy || !capability.adapter || !capability.projection || !capability.uiEditor)) {
      issues.push(`Node ${node.id} has an incomplete design-to-execution capability.`);
    }
    if (capability && !capability.sourceTypes.includes(node.sourceType)) {
      issues.push(`Node ${node.id} source type ${node.sourceType} is not registered for ${node.type}.`);
    }
    if (!node.id.trim()) issues.push('Canonical nodes require a non-empty id.');
  }
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push(`Edge ${edge.id} references an unknown node.`);
    }
  }
  if (!nodeIds.has(workflow.entryNodeId)) issues.push('Canonical workflow entry node is missing.');
  if (issues.length) throw new Error(`Canonical workflow capability validation failed: ${issues.join(' ')}`);
  return workflow;
}

export function compileApprovalWorkflow(model: WorkflowModel): CanonicalWorkflow {
  const nodes = model.nodes.map((node) => compileApprovalNode(node));
  const canonical: CanonicalWorkflow = {
    schemaVersion: 1,
    id: model.id ?? model.code,
    code: model.code,
    name: model.name,
    entryNodeId: nodes.find((node) => node.type === 'start')?.id ?? '',
    nodes,
    edges: model.edges.map((edge) => compileApprovalEdge(edge))
  };
  return assertCanonicalWorkflowCapabilities(canonical);
}

/** Accepts either the approval model or the trigger-editor model without exposing two runtime contracts. */
export function compileCanonicalWorkflow(input: Record<string, unknown>): CanonicalWorkflow {
  if (typeof input.kind === 'string') return compileTriggerLikeWorkflow(input);
  return compileApprovalWorkflow(input as unknown as WorkflowModel);
}

function compileTriggerLikeWorkflow(input: Record<string, unknown>): CanonicalWorkflow {
  const rawNodes = Array.isArray(input.nodes) ? input.nodes.filter(isRecord) : [];
  const rawEdges = Array.isArray(input.edges) ? input.edges.filter(isRecord) : [];
  const nodes: CanonicalNode[] = rawNodes.map((raw) => {
    const sourceType = typeof raw.type === 'string' ? raw.type : 'task';
    const rawConfig = isRecord(raw.config) ? raw.config : {};
    const { task: _task, metadata: _metadata, ...semanticConfig } = rawConfig;
    const node: WorkflowNode = {
      id: typeof raw.id === 'string' ? raw.id : '',
      type: sourceType as WorkflowNode['type'],
      name: typeof raw.name === 'string' ? raw.name : sourceType,
      config: semanticConfig
    };
    if (sourceType === 'manualApproval' || sourceType === 'humanReview') {
      const compiled = humanNode(node, 'any');
      return {
        ...compiled,
        config: { ...(node.config ?? {}), __sourceType: sourceType },
      };
    }
    const typeMap: Record<string, CanonicalNodeType> = {
      start: 'start', schedule: 'start', webhook: 'start', end: 'end', condition: 'condition',
      parallel: 'parallelFork', parallelJoin: 'parallelJoin', task: 'task', triggerAndWait: 'task', batchTrigger: 'task',
      wait: 'timer', dataSource: 'dataConnector', dataSink: 'dataConnector', agent: 'agent',
      tool: 'task', transform: 'task', memory: 'task'
    };
    return {
      ...baseNode(node, typeMap[sourceType] ?? 'task'),
      config: { ...(node.config ?? {}), __sourceType: sourceType }
    };
  });
  const workflow: CanonicalWorkflow = {
    schemaVersion: 1,
    id: typeof input.id === 'string' ? input.id : String(input.code ?? 'workflow'),
    code: String(input.code ?? 'workflow'),
    name: String(input.name ?? input.code ?? 'Workflow'),
    entryNodeId: nodes.find((node) => node.type === 'start')?.id ?? '',
    nodes,
    edges: rawEdges.map((edge, index) => ({
      id: typeof edge.id === 'string' ? edge.id : `edge_${index}`,
      source: String(edge.source ?? ''),
      target: String(edge.target ?? ''),
      ...(isRecord(edge.condition) ? { condition: edge.condition } : {})
    })),
    metadata: { sourceKind: input.kind }
  };
  return assertCanonicalWorkflowCapabilities(workflow);
}

function compileApprovalNode(node: WorkflowNode): CanonicalNode {
  const config = node.config ?? {};
  switch (node.type) {
    case 'approval':
      return humanNode(node, 'any');
    case 'sign':
      return humanNode(node, 'all');
    case 'orSign':
      return humanNode(node, 'any');
    case 'parallelGateway':
      return { ...baseNode(node, 'parallelFork'), config };
    default:
      return { ...baseNode(node, node.type === 'serviceTask' ? 'serviceTask' : node.type as CanonicalNodeType), config };
  }
}

function humanNode(node: WorkflowNode, completion: 'any' | 'all'): CanonicalNode {
  const config = node.config ?? {};
  const approval = isRecord(config.approval) ? config.approval : {};
  const rawCompletion = config.completionStrategy ?? approval.completionStrategy;
  const passRatio = config.passRatio ?? approval.passRatio;
  const policy: HumanCompletionPolicy = rawCompletion === 'ratio'
    ? { type: 'ratio', ratio: Number(passRatio ?? 1) }
    : rawCompletion === 'all' || completion === 'all'
      ? { type: 'all' }
      : { type: 'any' };
  return {
    ...baseNode(node, 'humanTask'),
    config,
    human: {
      completion: policy,
      ...(isRecord(config.assigneeStrategy) ? { assigneeStrategy: config.assigneeStrategy } : {})
    }
  };
}

function baseNode(node: WorkflowNode, type: CanonicalNodeType): CanonicalNode {
  return { id: node.id, type, sourceType: node.type, name: node.name, config: node.config ?? {} };
}

function compileApprovalEdge(edge: WorkflowEdge): CanonicalEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.priority !== undefined ? { priority: edge.priority } : {}),
    ...(edge.condition ? { condition: edge.condition } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
