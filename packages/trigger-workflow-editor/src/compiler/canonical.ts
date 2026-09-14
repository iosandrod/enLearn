import {
  assertCanonicalWorkflowCapabilities,
  type CanonicalEdge,
  type CanonicalNode,
  type CanonicalWorkflow,
  type HumanCompletionPolicy
} from '@enlearn/workflow-schema';
import { assertValidTriggerWorkflow } from '../schema/validate';
import type { TriggerWorkflowModel, TriggerWorkflowNode } from '../schema/types';

/** Compiles the trigger editor model to the same IR consumed by the runtime kernel. */
export function compileTriggerWorkflowCanonical(model: TriggerWorkflowModel): CanonicalWorkflow {
  assertValidTriggerWorkflow(model);
  const nodes = model.nodes.map(compileNode);
  const configuredEntryId = model.settings?.entryNodeId;
  const entry = nodes.find((node) => node.id === configuredEntryId && isEntryNode(node))
    ?? nodes.find(isEntryNode);
  const workflow: CanonicalWorkflow = {
    schemaVersion: 1,
    id: model.id ?? model.code,
    code: model.code,
    name: model.name,
    entryNodeId: entry?.id ?? '',
    nodes,
    edges: model.edges.map((edge): CanonicalEdge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.condition ? { condition: edge.condition } : {})
    })),
    metadata: { sourceKind: model.kind }
  };
  return assertCanonicalWorkflowCapabilities(workflow);
}

function isEntryNode(node: { sourceType: string }) {
  return node.sourceType === 'start' || node.sourceType === 'schedule' || node.sourceType === 'webhook';
}

function compileNode(node: TriggerWorkflowNode): CanonicalNode {
  // Canonical IR carries workflow semantics, never executable function source
  // or adapter credentials. Those remain in the execution adapter envelope.
  const { task: _task, metadata: _metadata, ...semanticConfig } = node.config ?? {};
  const config = semanticConfig as Record<string, unknown>;
  const base = {
    id: node.id,
    name: node.name,
    sourceType: node.type,
    config: config as Record<string, unknown>
  };
  switch (node.type) {
    case 'manualApproval':
    case 'humanReview': {
      const approval = (config.approval && typeof config.approval === 'object' && !Array.isArray(config.approval))
        ? config.approval as Record<string, any>
        : {};
      const completionType = approval.completionStrategy;
      const completion: HumanCompletionPolicy = completionType === 'ratio'
        ? { type: 'ratio', ratio: Number(approval.passRatio ?? 1) }
        : completionType === 'all'
          ? { type: 'all' }
          : { type: 'any' };
      return { ...base, type: 'humanTask', human: { completion, assigneeStrategy: { type: approval.assigneeType ?? 'user', ids: approval.assigneeIds ?? [] } } };
    }
    case 'parallel':
      return { ...base, type: 'parallelFork' };
    case 'parallelJoin':
      return { ...base, type: 'parallelJoin' };
    case 'condition':
      return { ...base, type: 'condition' };
    case 'triggerAndWait':
    case 'batchTrigger':
    case 'task':
    case 'tool':
    case 'transform':
    case 'memory':
      return { ...base, type: 'task' };
    case 'dataSource':
    case 'dataSink':
      return { ...base, type: 'dataConnector' };
    case 'agent':
      return { ...base, type: 'agent' };
    case 'wait':
      return { ...base, type: 'timer' };
    case 'start':
    case 'schedule':
    case 'webhook':
      return { ...base, type: 'start' };
    case 'end':
      return { ...base, type: 'end' };
    default:
      return { ...base, type: 'task' };
  }
}
