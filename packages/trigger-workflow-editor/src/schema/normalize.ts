import {
  TRIGGER_WORKFLOW_SCHEMA_VERSION,
  type TriggerWorkflowEdge,
  type TriggerWorkflowKind,
  type TriggerWorkflowModel,
  type TriggerWorkflowNode,
  type TriggerWorkflowTaskType
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
  const config = isRecord(node.config)
    ? normalizeNodeConfig(node.config, type)
    : type === 'webhook'
      ? normalizeNodeConfig({}, type)
      : undefined;
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
    ...(config ? { config } : {})
  };
}

function normalizeNodeConfig(config: Record<string, any>, nodeType: string) {
  const normalizedConfig = nodeType === 'webhook'
    ? { ...config, webhook: normalizeWebhookConfig(config.webhook) }
    : config;
  if (!isRecord(normalizedConfig.task)) return normalizedConfig;

  const explicitType = readTaskType(normalizedConfig.task.type);
  const inferredType = readString(normalizedConfig.task.frontendFunction)
    ? 'frontendCommand'
    : readString(normalizedConfig.task.backendFunction)
      ? 'backendCommand'
      : readString(normalizedConfig.task.procedureName)
        ? 'storedProcedure'
        : readString(normalizedConfig.task.id)
          ? 'registeredTask'
          : '';
  const type = explicitType || inferredType;
  if (!type) return normalizedConfig;
  return {
    ...normalizedConfig,
    task: normalizeTaskForType(normalizedConfig.task, type)
  };
}

function normalizeWebhookConfig(value: unknown) {
  const webhook = isRecord(value) ? value : {};
  const body = isRecord(webhook.body) ? webhook.body : {};
  const {
    path: _path,
    method: _method,
    secretHeader: _secretHeader,
    body: _body,
    ...rest
  } = webhook;

  return {
    ...rest,
    path: '/api/service',
    method: 'POST' as const,
    body: {
      serviceName: readString(body.serviceName),
      serviceMethod: readString(body.serviceMethod),
      postData: isRecord(body.postData) ? body.postData : {}
    }
  };
}

function normalizeTaskForType(
  task: Record<string, any>,
  type: TriggerWorkflowTaskType
) {
  const normalized: Record<string, any> & { type: TriggerWorkflowTaskType } = {
    ...task,
    type
  };
  const deleteFields = (fields: string[]) => fields.forEach((field) => delete normalized[field]);

  switch (type) {
    case 'frontendCommand':
      deleteFields(['id', 'importPath', 'backendFunction', 'procedureName', 'procedureSchema']);
      break;
    case 'backendCommand':
      deleteFields(['id', 'importPath', 'frontendFunction', 'procedureName', 'procedureSchema']);
      break;
    case 'storedProcedure':
      deleteFields(['id', 'importPath', 'frontendFunction', 'backendFunction']);
      break;
    case 'registeredTask':
      deleteFields(['frontendFunction', 'backendFunction', 'procedureName', 'procedureSchema']);
      break;
  }

  return normalized;
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

function readTaskType(value: unknown): TriggerWorkflowTaskType | '' {
  return value === 'frontendCommand' ||
    value === 'backendCommand' ||
    value === 'storedProcedure' ||
    value === 'registeredTask'
    ? value
    : '';
}

function defaultWorkflowName(kind: TriggerWorkflowKind) {
  if (kind === 'approval') return '审批工作流';
  if (kind === 'dataSync') return '数据同步工作流';
  if (kind === 'aiAgent') return 'AI 智能体工作流';
  return '触发器工作流';
}

