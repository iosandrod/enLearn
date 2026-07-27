import { compileWorkflowModel } from '../compiler';
import { isBuiltInWorkflowNodeType } from '../node-registry';
import {
  WORKFLOW_SCHEMA_VERSION,
  type AssigneeStrategy,
  type ServiceTaskConfig,
  type TimerNodeConfig,
  type WorkflowCondition,
  type WorkflowModel,
  type WorkflowSchemaIssue,
  type WorkflowSchemaIssueLevel,
  type WorkflowVariableType
} from '../schema/types';
import { isRecord, normalizeWorkflowModel } from '../schema/normalize';

const variableTypes = new Set<WorkflowVariableType>([
  'string',
  'number',
  'boolean',
  'date',
  'datetime',
  'json'
]);

const conditionOperators = new Set([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains'
]);

const timerModes = new Set(['delay', 'datetime']);
const timerActions = new Set(['continue', 'autoApprove', 'autoReject', 'notifyOnly']);
const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const serviceFailureStrategies = new Set(['fail', 'markFailed', 'skip', 'manual']);
const retryBackoffStrategies = new Set(['fixed', 'exponential']);

export class WorkflowSchemaValidationError extends Error {
  issues: WorkflowSchemaIssue[];

  constructor(issues: WorkflowSchemaIssue[]) {
    super(formatWorkflowSchemaIssues(issues));
    this.name = 'WorkflowSchemaValidationError';
    this.issues = issues;
  }
}

function pushIssue(
  issues: WorkflowSchemaIssue[],
  level: WorkflowSchemaIssueLevel,
  path: string,
  message: string
) {
  issues.push({ level, path, message });
}

function validateAssigneeStrategy(
  value: unknown,
  issues: WorkflowSchemaIssue[],
  path: string
) {
  if (!isRecord(value) || typeof value.type !== 'string') {
    pushIssue(issues, 'error', path, 'Approval assignee strategy is required.');
    return;
  }

  const strategy = value as AssigneeStrategy;
  switch (strategy.type) {
    case 'users':
      if (!Array.isArray(strategy.userIds) || !strategy.userIds.length) {
        pushIssue(issues, 'error', `${path}.userIds`, 'Users assignee strategy requires user IDs.');
      }
      break;
    case 'roles':
      if (!Array.isArray(strategy.roleCodes) || !strategy.roleCodes.length) {
        pushIssue(issues, 'error', `${path}.roleCodes`, 'Roles assignee strategy requires role codes.');
      }
      break;
    case 'departments':
      if (!Array.isArray(strategy.departmentIds) || !strategy.departmentIds.length) {
        pushIssue(
          issues,
          'error',
          `${path}.departmentIds`,
          'Departments assignee strategy requires department IDs.'
        );
      }
      break;
    case 'initiatorManager':
      if (strategy.level !== undefined && (!Number.isInteger(strategy.level) || strategy.level < 1)) {
        pushIssue(issues, 'error', `${path}.level`, 'Initiator manager level must be a positive integer.');
      }
      break;
    case 'field':
      if (!strategy.field) {
        pushIssue(issues, 'error', `${path}.field`, 'Field assignee strategy requires a field.');
      }
      break;
    case 'expression':
      if (!strategy.expression) {
        pushIssue(
          issues,
          'error',
          `${path}.expression`,
          'Expression assignee strategy requires an expression.'
        );
      }
      break;
    default:
      pushIssue(issues, 'error', `${path}.type`, `Unsupported assignee strategy "${value.type}".`);
  }
}

function validateCondition(
  condition: WorkflowCondition | undefined,
  issues: WorkflowSchemaIssue[],
  path: string
) {
  if (!condition) return;

  if (condition.type === 'expression' && !condition.expression) {
    pushIssue(issues, 'error', `${path}.expression`, 'Expression condition requires an expression.');
  }

  if (condition.type === 'field') {
    if (!condition.field) {
      pushIssue(issues, 'error', `${path}.field`, 'Field condition requires a field.');
    }

    if (!condition.operator || !conditionOperators.has(condition.operator)) {
      pushIssue(issues, 'error', `${path}.operator`, 'Field condition requires a supported operator.');
    }
  }
}

function validateTimerConfig(value: unknown, issues: WorkflowSchemaIssue[], path: string) {
  const config = isRecord(value) ? (value as TimerNodeConfig) : {};
  const mode = typeof config.mode === 'string' ? config.mode : config.datetime ? 'datetime' : 'delay';

  if (!timerModes.has(mode)) {
    pushIssue(issues, 'error', `${path}.mode`, 'Timer mode must be delay or datetime.');
  }

  if (config.action !== undefined && !timerActions.has(config.action)) {
    pushIssue(issues, 'error', `${path}.action`, 'Timer action is invalid.');
  }

  if (config.timezone !== undefined && !config.timezone.trim()) {
    pushIssue(issues, 'error', `${path}.timezone`, 'Timer timezone cannot be empty.');
  }

  if (mode === 'datetime') {
    if (!config.datetime) {
      pushIssue(issues, 'error', `${path}.datetime`, 'Datetime timer requires datetime.');
    } else if (Number.isNaN(new Date(config.datetime).getTime())) {
      pushIssue(issues, 'error', `${path}.datetime`, 'Timer datetime is invalid.');
    }
    return;
  }

  if (config.duration !== undefined && !isIsoDuration(config.duration)) {
    pushIssue(issues, 'error', `${path}.duration`, 'Timer duration must be an ISO-8601 duration like PT2H.');
  }

  if (
    config.delaySeconds !== undefined &&
    (!Number.isFinite(config.delaySeconds) || config.delaySeconds < 0)
  ) {
    pushIssue(issues, 'error', `${path}.delaySeconds`, 'Timer delaySeconds must be zero or positive.');
  }
}

function validateServiceTaskConfig(value: unknown, issues: WorkflowSchemaIssue[], path: string) {
  const config = isRecord(value) ? (value as ServiceTaskConfig) : {};
  const hasInternalService = Boolean(config.serviceName?.trim() && config.serviceMethod?.trim());
  const hasWebhook = Boolean(config.url?.trim());

  if (!hasInternalService && !hasWebhook) {
    pushIssue(issues, 'error', path, 'Service task requires serviceName/serviceMethod or url.');
  }

  if (hasWebhook && config.method !== undefined && !httpMethods.has(config.method)) {
    pushIssue(issues, 'error', `${path}.method`, 'Service task method is invalid.');
  }

  if (
    config.timeoutSeconds !== undefined &&
    (!Number.isInteger(config.timeoutSeconds) || config.timeoutSeconds < 1)
  ) {
    pushIssue(issues, 'error', `${path}.timeoutSeconds`, 'Service task timeoutSeconds must be a positive integer.');
  }

  if (config.failureStrategy !== undefined && !serviceFailureStrategies.has(config.failureStrategy)) {
    pushIssue(issues, 'error', `${path}.failureStrategy`, 'Service task failureStrategy is invalid.');
  }

  if (config.retry !== undefined) {
    if (!isRecord(config.retry)) {
      pushIssue(issues, 'error', `${path}.retry`, 'Service task retry must be an object.');
      return;
    }

    if (
      config.retry.maxAttempts !== undefined &&
      (!Number.isInteger(config.retry.maxAttempts) || config.retry.maxAttempts < 0)
    ) {
      pushIssue(issues, 'error', `${path}.retry.maxAttempts`, 'Retry maxAttempts must be zero or positive.');
    }

    if (config.retry.backoff !== undefined && !retryBackoffStrategies.has(config.retry.backoff)) {
      pushIssue(issues, 'error', `${path}.retry.backoff`, 'Retry backoff must be fixed or exponential.');
    }
  }
}

function validateVariables(model: WorkflowModel, issues: WorkflowSchemaIssue[]) {
  const variableKeys = new Set<string>();

  (model.variables ?? []).forEach((variable, index) => {
    const path = `variables.${index}`;

    if (!variable.key) {
      pushIssue(issues, 'error', `${path}.key`, 'Variable key is required.');
    } else if (variableKeys.has(variable.key)) {
      pushIssue(issues, 'error', `${path}.key`, `Duplicate variable key "${variable.key}".`);
    } else {
      variableKeys.add(variable.key);
    }

    if (!variableTypes.has(variable.type)) {
      pushIssue(issues, 'error', `${path}.type`, `Unsupported variable type "${variable.type}".`);
    }

    if (variable.source === 'document' && !variable.path) {
      pushIssue(issues, 'warning', `${path}.path`, 'Document variable should define a document path.');
    }
  });
}

function collectReachableNodeIds(model: WorkflowModel, startNodeId: string) {
  const reachable = new Set<string>();
  const adjacency = new Map<string, string[]>();

  model.nodes.forEach((node) => adjacency.set(node.id, []));
  model.edges.forEach((edge) => {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  });

  const stack = [startNodeId];
  while (stack.length) {
    const nodeId = stack.pop();
    if (!nodeId || reachable.has(nodeId)) continue;

    reachable.add(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      stack.push(target);
    }
  }

  return reachable;
}

function isIsoDuration(value: string) {
  return /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.test(value);
}

export function validateWorkflowModel(model: WorkflowModel) {
  const issues: WorkflowSchemaIssue[] = [];

  if (model.schemaVersion !== WORKFLOW_SCHEMA_VERSION) {
    pushIssue(
      issues,
      'error',
      'schemaVersion',
      `Unsupported workflow schema version "${model.schemaVersion}".`
    );
  }

  if (!model.code) {
    pushIssue(issues, 'error', 'code', 'Workflow code is required.');
  }

  if (!model.name) {
    pushIssue(issues, 'error', 'name', 'Workflow name is required.');
  }

  if (!model.nodes.length) {
    pushIssue(issues, 'error', 'nodes', 'Workflow requires at least one node.');
  }

  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const startNodes = model.nodes.filter((node) => node.type === 'start');
  const endNodes = model.nodes.filter((node) => node.type === 'end');

  model.nodes.forEach((node, index) => {
    const path = `nodes.${index}`;

    if (!node.id) {
      pushIssue(issues, 'error', `${path}.id`, 'Node ID is required.');
    } else if (nodeIds.has(node.id)) {
      pushIssue(issues, 'error', `${path}.id`, `Duplicate node ID "${node.id}".`);
    } else {
      nodeIds.add(node.id);
    }

    if (!node.type) {
      pushIssue(issues, 'error', `${path}.type`, 'Node type is required.');
    } else if (!isBuiltInWorkflowNodeType(node.type)) {
      pushIssue(issues, 'error', `${path}.type`, `Unsupported node type "${node.type}".`);
    }

    if (!node.name) {
      pushIssue(issues, 'error', `${path}.name`, 'Node name is required.');
    }

    if (node.type === 'approval' || node.type === 'sign' || node.type === 'orSign') {
      const config = isRecord(node.config) ? node.config : {};
      validateAssigneeStrategy(config.assigneeStrategy, issues, `${path}.config.assigneeStrategy`);

      if (node.type === 'sign') {
        const completionStrategy = config.completionStrategy ?? 'all';
        if (
          completionStrategy !== 'all' &&
          completionStrategy !== 'any' &&
          completionStrategy !== 'ratio'
        ) {
          pushIssue(
            issues,
            'error',
            `${path}.config.completionStrategy`,
            'Sign node completion strategy must be all, any, or ratio.'
          );
        }

        if (
          completionStrategy === 'ratio' &&
          (typeof config.passRatio !== 'number' || config.passRatio <= 0 || config.passRatio > 1)
        ) {
          pushIssue(
            issues,
            'error',
            `${path}.config.passRatio`,
            'Ratio sign node requires passRatio between 0 and 1.'
          );
        }
      }
    }

    if (node.type === 'cc') {
      const config = isRecord(node.config) ? node.config : {};
      if (config.assigneeStrategy) {
        validateAssigneeStrategy(config.assigneeStrategy, issues, `${path}.config.assigneeStrategy`);
      }
    }

    if (node.type === 'timer') {
      validateTimerConfig(node.config, issues, `${path}.config`);
    }

    if (node.type === 'serviceTask') {
      validateServiceTaskConfig(node.config, issues, `${path}.config`);
    }
  });

  if (startNodes.length !== 1) {
    pushIssue(issues, 'error', 'nodes', 'Workflow must contain exactly one start node.');
  }

  if (!endNodes.length) {
    pushIssue(issues, 'error', 'nodes', 'Workflow must contain at least one end node.');
  }

  model.edges.forEach((edge, index) => {
    const path = `edges.${index}`;

    if (!edge.id) {
      pushIssue(issues, 'error', `${path}.id`, 'Edge ID is required.');
    } else if (edgeIds.has(edge.id)) {
      pushIssue(issues, 'error', `${path}.id`, `Duplicate edge ID "${edge.id}".`);
    } else {
      edgeIds.add(edge.id);
    }

    if (!edge.source) {
      pushIssue(issues, 'error', `${path}.source`, 'Edge source is required.');
    } else if (!nodeIds.has(edge.source)) {
      pushIssue(issues, 'error', `${path}.source`, `Edge source node "${edge.source}" does not exist.`);
    }

    if (!edge.target) {
      pushIssue(issues, 'error', `${path}.target`, 'Edge target is required.');
    } else if (!nodeIds.has(edge.target)) {
      pushIssue(issues, 'error', `${path}.target`, `Edge target node "${edge.target}" does not exist.`);
    }

    if (edge.source && edge.target && edge.source === edge.target) {
      pushIssue(issues, 'error', path, 'Self-loop edges are not allowed in approval workflow MVP.');
    }

    validateCondition(edge.condition, issues, `${path}.condition`);
  });

  const compiled = compileWorkflowModel(model);
  model.nodes.forEach((node, index) => {
    const incoming = compiled.incomingEdges.get(node.id) ?? [];
    const outgoing = compiled.outgoingEdges.get(node.id) ?? [];
    const path = `nodes.${index}`;

    if (node.type === 'start' && incoming.length > 0) {
      pushIssue(issues, 'error', path, 'Start node cannot have incoming edges.');
    }

    if (node.type === 'end' && outgoing.length > 0) {
      pushIssue(issues, 'error', path, 'End node cannot have outgoing edges.');
    }

    if (node.type !== 'start' && incoming.length === 0) {
      pushIssue(issues, 'error', path, 'Node requires at least one incoming edge.');
    }

    if (node.type !== 'end' && outgoing.length === 0) {
      pushIssue(issues, 'error', path, 'Node requires at least one outgoing edge.');
    }

    if (
      (node.type === 'approval' ||
        node.type === 'sign' ||
        node.type === 'orSign' ||
        node.type === 'serviceTask' ||
        node.type === 'timer' ||
        node.type === 'subProcess') &&
      outgoing.length > 1
    ) {
      pushIssue(issues, 'error', path, `${node.type} node can have only one outgoing edge.`);
    }

    if (node.type === 'cc' && outgoing.length > 1) {
      pushIssue(issues, 'error', path, 'CC node can have only one outgoing edge in MVP.');
    }

    if (node.type === 'condition') {
      if (outgoing.length < 2) {
        pushIssue(issues, 'error', path, 'Condition node requires at least two outgoing edges.');
      }

      if (!outgoing.some((edge) => edge.condition?.type === 'always')) {
        pushIssue(issues, 'error', path, 'Condition node requires one fallback edge with always condition.');
      }
    }

    if (node.type === 'parallelGateway' && outgoing.length < 2) {
      pushIssue(issues, 'error', path, 'Parallel gateway requires at least two outgoing edges.');
    }
  });

  if (startNodes.length === 1) {
    const reachableNodeIds = collectReachableNodeIds(model, startNodes[0].id);
    model.nodes.forEach((node, index) => {
      if (!reachableNodeIds.has(node.id)) {
        pushIssue(issues, 'error', `nodes.${index}`, `Node "${node.id}" is not reachable from start node.`);
      }
    });
  }

  validateVariables(model, issues);

  return issues;
}

export function assertValidWorkflowModel(model: WorkflowModel) {
  const issues = validateWorkflowModel(model);
  const errors = issues.filter((issue) => issue.level === 'error');

  if (errors.length) {
    throw new WorkflowSchemaValidationError(errors);
  }

  return issues;
}

export function prepareWorkflowModel(value: unknown) {
  const model = normalizeWorkflowModel(value);
  assertValidWorkflowModel(model);
  return model;
}

export function formatWorkflowSchemaIssue(issue: WorkflowSchemaIssue) {
  return `${issue.path}: ${issue.message}`;
}

export function formatWorkflowSchemaIssues(issues: WorkflowSchemaIssue[]) {
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  const blockingIssues = errors.length ? errors : warnings;
  const summary = errors.length
    ? `Workflow schema validation failed with ${errors.length} error(s).`
    : `Workflow schema validation produced ${warnings.length} warning(s).`;

  return [
    summary,
    ...blockingIssues.slice(0, 8).map(formatWorkflowSchemaIssue),
    ...(blockingIssues.length > 8 ? [`...and ${blockingIssues.length - 8} more.`] : [])
  ].join('\n');
}
