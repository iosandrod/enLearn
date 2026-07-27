import {
  TRIGGER_WORKFLOW_SCHEMA_VERSION,
  type TriggerWorkflowEdge,
  type TriggerWorkflowKind,
  type TriggerWorkflowModel,
  type TriggerWorkflowNode
} from './types';

export function normalizeTriggerWorkflow(value: unknown): TriggerWorkflowModel {
  const record = isRecord(value) ? value : {};
  const kind = readKind(record.kind);
  const nodes = Array.isArray(record.nodes)
    ? record.nodes.filter(isRecord).map((node, index) => normalizeNode(node, index))
    : [];
  const edges = Array.isArray(record.edges)
    ? record.edges.filter(isRecord).map((edge, index) => normalizeEdge(edge, index))
    : [];

  return {
    schemaVersion:
      typeof record.schemaVersion === 'number'
        ? record.schemaVersion
        : TRIGGER_WORKFLOW_SCHEMA_VERSION,
    ...(readString(record.id) ? { id: readString(record.id) } : {}),
    code: readString(record.code, `${kind}_workflow`),
    name: readString(record.name, defaultWorkflowName(kind)),
    ...(readString(record.description) ? { description: readString(record.description) } : {}),
    kind,
    ...(isRecord(record.triggerDev) ? { triggerDev: record.triggerDev } : {}),
    nodes,
    edges,
    ...(Array.isArray(record.variables) ? { variables: record.variables as TriggerWorkflowModel['variables'] } : {}),
    ...(isRecord(record.settings) ? { settings: record.settings } : {})
  };
}

export function cloneTriggerWorkflow(model: TriggerWorkflowModel) {
  return normalizeTriggerWorkflow(JSON.parse(JSON.stringify(model)) as unknown);
}

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNode(node: Record<string, any>, index: number): TriggerWorkflowNode {
  const type = readString(node.type, 'task');
  return {
    id: readString(node.id, `${type}_${index + 1}`),
    type,
    name: readString(node.name, type),
    ...(readString(node.description) ? { description: readString(node.description) } : {}),
    ...(isRecord(node.position) &&
    typeof node.position.x === 'number' &&
    typeof node.position.y === 'number'
      ? {
          position: {
            x: node.position.x,
            y: node.position.y
          }
        }
      : {}),
    ...(isRecord(node.config) ? { config: node.config } : {})
  };
}

function normalizeEdge(edge: Record<string, any>, index: number): TriggerWorkflowEdge {
  return {
    id: readString(edge.id, `edge_${index + 1}`),
    source: readString(edge.source),
    target: readString(edge.target),
    ...(readString(edge.name) ? { name: readString(edge.name) } : {}),
    ...(isRecord(edge.condition) ? { condition: edge.condition as TriggerWorkflowEdge['condition'] } : {})
  };
}

function readKind(value: unknown): TriggerWorkflowKind {
  return value === 'approval' || value === 'dataSync' || value === 'aiAgent' || value === 'custom'
    ? value
    : 'custom';
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function defaultWorkflowName(kind: TriggerWorkflowKind) {
  if (kind === 'approval') return 'Approval workflow';
  if (kind === 'dataSync') return 'Data sync workflow';
  if (kind === 'aiAgent') return 'AI agent workflow';
  return 'Trigger workflow';
}

