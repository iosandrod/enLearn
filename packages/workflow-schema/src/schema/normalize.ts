import {
  WORKFLOW_SCHEMA_VERSION,
  type WorkflowCondition,
  type WorkflowEdge,
  type WorkflowModel,
  type WorkflowModelStatus,
  type WorkflowNode,
  type WorkflowPosition,
  type WorkflowSettings,
  type WorkflowVariable,
  type WorkflowVariableType
} from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function readSchemaVersion(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : WORKFLOW_SCHEMA_VERSION;
}

function normalizePosition(value: unknown): WorkflowPosition | undefined {
  if (!isRecord(value)) return undefined;

  const x = readNumber(value.x);
  const y = readNumber(value.y);
  return x === undefined || y === undefined ? undefined : { x, y };
}

function normalizeCondition(value: unknown): WorkflowCondition | undefined {
  if (!isRecord(value)) return undefined;

  const type =
    value.type === 'always' || value.type === 'expression' || value.type === 'field'
      ? value.type
      : undefined;
  if (!type) return undefined;

  return {
    type,
    ...(typeof value.expression === 'string' ? { expression: value.expression.trim() } : {}),
    ...(typeof value.field === 'string' ? { field: value.field.trim() } : {}),
    ...(typeof value.operator === 'string' ? { operator: value.operator as WorkflowCondition['operator'] } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'value') ? { value: value.value } : {})
  };
}

function normalizeNode(value: unknown): WorkflowNode | undefined {
  if (!isRecord(value)) return undefined;

  const id = readString(value.id);
  const type = readString(value.type);
  const name = readString(value.name, type || id);
  const description = readString(value.description);
  const position = normalizePosition(value.position);

  return {
    id,
    type,
    name,
    ...(description ? { description } : {}),
    ...(position ? { position } : {}),
    ...(isRecord(value.config) ? { config: { ...value.config } } : {})
  };
}

function normalizeEdge(value: unknown): WorkflowEdge | undefined {
  if (!isRecord(value)) return undefined;

  const id = readString(value.id);
  const source = readString(value.source);
  const target = readString(value.target);
  const name = readString(value.name);
  const priority = readNumber(value.priority);
  const condition = normalizeCondition(value.condition);

  return {
    id,
    source,
    target,
    ...(name ? { name } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(condition ? { condition } : {})
  };
}

function normalizeVariable(value: unknown): WorkflowVariable | undefined {
  if (!isRecord(value)) return undefined;

  const key = readString(value.key);
  const label = readString(value.label);
  const type = readString(value.type, 'string') as WorkflowVariableType;
  const source =
    value.source === 'document' || value.source === 'system' || value.source === 'manual'
      ? value.source
      : undefined;
  const path = readString(value.path);
  const required = readBoolean(value.required);

  return {
    key,
    ...(label ? { label } : {}),
    type,
    ...(source ? { source } : {}),
    ...(path ? { path } : {}),
    ...(required !== undefined ? { required } : {})
  };
}

function normalizeSettings(value: unknown): WorkflowSettings {
  const settings = isRecord(value) ? value : {};

  return {
    allowCancel: settings.allowCancel !== false,
    allowWithdraw: settings.allowWithdraw !== false,
    duplicateSubmitPolicy:
      settings.duplicateSubmitPolicy === 'reuseRunning' ||
      settings.duplicateSubmitPolicy === 'newInstance'
        ? settings.duplicateSubmitPolicy
        : 'reject',
    historyLevel: settings.historyLevel === 'basic' ? 'basic' : 'full'
  };
}

function normalizeStatus(value: unknown): WorkflowModelStatus {
  return value === 'published' || value === 'archived' || value === 'disabled'
    ? value
    : 'draft';
}

export function normalizeWorkflowModel(value: unknown): WorkflowModel {
  const source = isRecord(value) ? value : {};
  const id = readString(source.id);
  const description = readString(source.description);
  const tenantId = readString(source.tenantId);
  const documentType = readString(source.documentType);

  const nodes = Array.isArray(source.nodes)
    ? source.nodes.map(normalizeNode).filter((node): node is WorkflowNode => Boolean(node))
    : [];
  const edges = Array.isArray(source.edges)
    ? source.edges.map(normalizeEdge).filter((edge): edge is WorkflowEdge => Boolean(edge))
    : [];
  const variables = Array.isArray(source.variables)
    ? source.variables
        .map(normalizeVariable)
        .filter((variable): variable is WorkflowVariable => Boolean(variable))
    : [];

  return {
    schemaVersion: readSchemaVersion(source.schemaVersion),
    ...(id ? { id } : {}),
    code: readString(source.code),
    name: readString(source.name),
    ...(description ? { description } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(documentType ? { documentType } : {}),
    status: normalizeStatus(source.status),
    nodes,
    edges,
    ...(variables.length ? { variables } : {}),
    settings: normalizeSettings(source.settings)
  };
}
