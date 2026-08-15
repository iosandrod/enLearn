import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { getEnv } from '../../common/utils/env';
import {
  TRIGGER_TASK_CATALOG,
  TRIGGER_WORKFLOW_REGISTERED_TASK_IDS
} from './trigger-task-catalog';
import {
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS,
  TRIGGER_WORKFLOW_RUNNER_TASK_ID
} from './trigger-workflow.types';

const DEFAULT_ALLOWED_RPC_NAMES = [
  'get_dynamic_crud_resource_hash',
  'planning_publish_plan_version'
] as const;

const REGISTERED_WORKFLOW_QUEUES = new Set(
  TRIGGER_TASK_CATALOG.flatMap((item) => item.queueNames ?? [])
);
const WORKFLOW_HTTP_DNS_CACHE_TTL_MS = 60_000;
const workflowHttpDnsCache = new Map<
  string,
  { expiresAt: number; addresses: Array<{ address: string; family: number }> }
>();

type WorkflowHostLookup = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<Array<{ address: string; family: number }>>;

export function resolveWorkflowHttpUrl(
  value: string,
  allowedOriginsOverride?: readonly string[]
) {
  const env = getEnv();
  const apiBaseUrl = String(
    env.WORKFLOW_INTERNAL_API_URL ?? env.API_BASE_URL ?? 'http://127.0.0.1:3002/api'
  ).trim();
  let url: URL;
  try {
    url = new URL(value, apiBaseUrl);
  } catch {
    throw new Error('Workflow HTTP URL is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Workflow HTTP requests require an HTTP(S) URL without embedded credentials.');
  }

  const allowedOrigins = new Set(
    (allowedOriginsOverride ?? [
      new URL(apiBaseUrl).origin,
      ...readCsv(env.WORKFLOW_HTTP_ALLOWED_ORIGINS)
    ]).map(normalizeOrigin)
  );
  if (!allowedOrigins.has(url.origin)) {
    throw new Error(`Workflow HTTP origin is not allowed: ${url.origin}.`);
  }
  return url;
}

export async function assertWorkflowHttpTarget(
  url: URL,
  lookupHost: WorkflowHostLookup = lookup
) {
  const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return;
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupWorkflowHost(hostname, lookupHost);
  if (!addresses.length) {
    throw new Error(`Workflow HTTP host did not resolve: ${hostname}.`);
  }
  const blocked = addresses.find(({ address }) => isDisallowedWorkflowAddress(address));
  if (blocked) {
    throw new Error(`Workflow HTTP host resolves to a private or reserved address: ${blocked.address}.`);
  }
}

async function lookupWorkflowHost(hostname: string, lookupHost: WorkflowHostLookup) {
  if (lookupHost === lookup) {
    const cached = workflowHttpDnsCache.get(hostname);
    if (cached && cached.expiresAt > Date.now()) return cached.addresses;
  }
  const addresses = await lookupHost(hostname, { all: true, verbatim: true });
  if (lookupHost === lookup) {
    workflowHttpDnsCache.set(hostname, {
      expiresAt: Date.now() + WORKFLOW_HTTP_DNS_CACHE_TTL_MS,
      addresses
    });
  }
  return addresses;
}

export function resolveAllowedWorkflowRpcName(
  value: string,
  schemaValue = 'public',
  allowedNamesOverride?: readonly string[]
) {
  const parts = value.trim().split('.');
  if (parts.length > 2 || parts.some((part) => !isIdentifier(part))) {
    throw new Error('Workflow RPC name must be a valid SQL identifier.');
  }
  const schema = parts.length === 2 ? parts[0] : schemaValue.trim() || 'public';
  const name = parts.length === 2 ? parts[1] : parts[0];
  if (schema !== 'public') {
    throw new Error('Only public Supabase RPC procedures are supported by workflow adapters.');
  }

  const env = getEnv();
  const allowedNames = new Set(
    allowedNamesOverride ?? [
      ...DEFAULT_ALLOWED_RPC_NAMES,
      ...readCsv(env.WORKFLOW_RPC_ALLOWED_FUNCTIONS)
    ]
  );
  if (!allowedNames.has(name)) {
    throw new Error(`Workflow RPC is not allowed: public.${name}.`);
  }
  return name;
}

export function assertWorkflowRegisteredTaskId(value: string) {
  if (!TRIGGER_WORKFLOW_REGISTERED_TASK_IDS.includes(
    value as (typeof TRIGGER_WORKFLOW_REGISTERED_TASK_IDS)[number]
  )) {
    throw new Error(
      `Trigger.dev task "${value}" is not registered for workflow-node execution.`
    );
  }
  return value;
}

export function assertTriggerWorkflowJobPayload(
  triggerTaskId: string,
  payload: Record<string, unknown>
) {
  const definition = readRecord(payload.triggerWorkflow);
  const usesTriggerWorkflowRunner = triggerTaskId === TRIGGER_WORKFLOW_RUNNER_TASK_ID;
  if (!definition && !usesTriggerWorkflowRunner) return;
  if (!definition || !usesTriggerWorkflowRunner) {
    throw new Error(
      `Typed Trigger workflows must use ${TRIGGER_WORKFLOW_RUNNER_TASK_ID} with a triggerWorkflow definition.`
    );
  }
  if (definition.version !== 1) {
    throw new Error('Unsupported triggerWorkflow definition version.');
  }
  const executionPlan = readRecord(definition.executionPlan);
  if (!executionPlan || !Array.isArray(executionPlan.operations)) {
    throw new Error('triggerWorkflow.executionPlan.operations must be an array.');
  }

  const modelId = readRequiredString(definition.modelId, 'triggerWorkflow modelId');
  const modelCode = readRequiredString(definition.modelCode, 'triggerWorkflow modelCode');
  const planSignature = readRequiredString(
    definition.planSignature,
    'triggerWorkflow planSignature'
  );
  if (!/^fnv1a-[0-9a-f]{8}$/.test(planSignature)) {
    throw new Error('triggerWorkflow.planSignature is invalid.');
  }
  if (readRequiredString(executionPlan.workflowId, 'executionPlan workflowId') !== modelId) {
    throw new Error('triggerWorkflow modelId does not match executionPlan.workflowId.');
  }
  if (readRequiredString(executionPlan.workflowCode, 'executionPlan workflowCode') !== modelCode) {
    throw new Error('triggerWorkflow modelCode does not match executionPlan.workflowCode.');
  }
  const entryNodeId = readRequiredString(
    executionPlan.entryNodeId,
    'executionPlan entryNodeId'
  );
  const nodeIds = new Set<string>();
  const operations: Array<Record<string, unknown>> = [];

  for (const rawOperation of executionPlan.operations) {
    const operation = readRecord(rawOperation);
    if (!operation) throw new Error('triggerWorkflow operations must be objects.');
    const nodeId = readRequiredString(operation.nodeId, 'operation nodeId');
    readRequiredString(operation.id, `${nodeId} operation id`);
    if (nodeIds.has(nodeId)) {
      throw new Error(`Trigger workflow contains a duplicate operation nodeId: ${nodeId}.`);
    }
    nodeIds.add(nodeId);
    operations.push(operation);
  }
  if (!nodeIds.has(entryNodeId)) {
    throw new Error(`Trigger workflow entry operation was not found: ${entryNodeId}.`);
  }

  for (const operation of operations) {
    const type = readRequiredString(operation.type, 'operation type');
    if (!SUPPORTED_WORKFLOW_OPERATION_TYPES.has(type)) {
      throw new Error(`Unsupported Trigger workflow operation type: ${type}.`);
    }
    const next = operation.next;
    if (!Array.isArray(next) || !next.every((value) => typeof value === 'string')) {
      throw new Error('Trigger workflow operation next must be an array of node IDs.');
    }
    const missingTarget = next.find((nodeId) => !nodeIds.has(nodeId));
    if (missingTarget) {
      throw new Error(`Trigger workflow operation target was not found: ${missingTarget}.`);
    }
    const adapter = readRecord(operation?.adapter);
    if (!adapter) {
      if (type === 'task.trigger' || type === 'task.triggerAndWait') {
        throw new Error('Trigger workflow task operation requires an adapter.');
      }
      continue;
    }
    if (type !== 'task.trigger' && type !== 'task.triggerAndWait') {
      throw new Error(`Trigger workflow operation ${type} cannot contain an adapter.`);
    }
    const adapterType = readString(adapter.type);
    const executorTaskId = readString(adapter.executorTaskId);
    switch (adapterType) {
      case 'frontendCommand':
      case 'backendCommand': {
        if (executorTaskId !== TRIGGER_WORKFLOW_ADAPTER_TASK_IDS[adapterType]) {
          throw new Error(`Workflow ${adapterType} adapter has an invalid executor Task ID.`);
        }
        if (!readString(adapter.functionSource)) {
          throw new Error(`Workflow ${adapterType} adapter requires functionSource.`);
        }
        break;
      }
      case 'storedProcedure':
        if (executorTaskId !== TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure) {
          throw new Error('Workflow storedProcedure adapter has an invalid executor Task ID.');
        }
        resolveAllowedWorkflowRpcName(
          readRequiredString(adapter.procedureName, 'storedProcedure procedureName'),
          readString(adapter.procedureSchema) || 'public'
        );
        break;
      case 'registeredTask':
        assertWorkflowRegisteredTaskId(executorTaskId);
        break;
      default:
        throw new Error(`Unsupported Trigger workflow adapter type: ${adapterType || '(empty)'}.`);
    }

    const queue = readRecord(adapter.queue);
    const queueName = readString(queue?.name);
    if (queueName && !REGISTERED_WORKFLOW_QUEUES.has(queueName)) {
      throw new Error(`Trigger.dev queue "${queueName}" is not registered by the workflow worker.`);
    }
  }

  const expectedSignature = getTriggerWorkflowExecutionPlanSignature(executionPlan);
  if (planSignature !== expectedSignature) {
    throw new Error('triggerWorkflow.planSignature does not match executionPlan.');
  }
}

export function getTriggerWorkflowExecutionPlanSignature(executionPlan: unknown) {
  return hashText(stableStringify(executionPlan));
}

const SUPPORTED_WORKFLOW_OPERATION_TYPES = new Set([
  'entry',
  'schedule',
  'webhook',
  'task.trigger',
  'task.triggerAndWait',
  'wait.for',
  'wait.until',
  'condition',
  'complete'
]);

export function getWorkflowCapabilityTimeoutMs(adapterTimeoutSeconds?: number) {
  const configured = Number(getEnv().WORKFLOW_CAPABILITY_TIMEOUT_MS ?? 30_000);
  const policyTimeout = Number.isFinite(configured) && configured > 0
    ? Math.min(Math.floor(configured), 120_000)
    : 30_000;
  const adapterTimeout = Number.isFinite(adapterTimeoutSeconds) && Number(adapterTimeoutSeconds) > 0
    ? Math.floor(Number(adapterTimeoutSeconds) * 1000)
    : policyTimeout;
  return Math.max(1, Math.min(policyTimeout, adapterTimeout));
}

export function getWorkflowHttpMaxResponseBytes() {
  const configured = Number(getEnv().WORKFLOW_HTTP_MAX_RESPONSE_BYTES ?? 1_048_576);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 10 * 1024 * 1024)
    : 1_048_576;
}

export function getWorkflowInternalKey() {
  const value = String(getEnv().WORKFLOW_INTERNAL_KEY ?? '').trim();
  if (!value) {
    throw new Error('WORKFLOW_INTERNAL_KEY is required for workflow internal service calls.');
  }
  return value;
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    return url.origin;
  } catch {
    throw new Error(`Invalid workflow HTTP allowed origin: ${value}.`);
  }
}

function stripIpv6Brackets(value: string) {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

function isDisallowedWorkflowAddress(value: string) {
  const address = stripIpv6Brackets(value).toLowerCase();
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }
  if (isIP(address) === 6) {
    if (address === '::' || address === '::1') return true;
    if (/^::ffff:(?:0*:)*\d+\.\d+\.\d+\.\d+$/.test(address)) {
      return isDisallowedWorkflowAddress(address.slice(address.lastIndexOf(':') + 1));
    }
    return (
      /^f[cd][0-9a-f]{2}:/.test(address) ||
      /^fe[89ab][0-9a-f]:/.test(address) ||
      /^ff[0-9a-f]{2}:/.test(address)
    );
  }
  return true;
}

function readCsv(value: unknown) {
  return typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
}

function isIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readRequiredString(value: unknown, name: string) {
  const result = readString(value);
  if (!result) throw new Error(`Workflow adapter requires ${name}.`);
  return result;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item ?? null)).join(',')}]`;
  }
  const record = readRecord(value);
  if (record) {
    const fields = Object.keys(record)
      .filter((field) => record[field] !== undefined)
      .sort();
    return `{${fields
      .map((field) => `${JSON.stringify(field)}:${stableStringify(record[field])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
