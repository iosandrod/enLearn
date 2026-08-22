import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { validatePlanningEngineResult } from './planning-engine-result';
import {
  PlanningCanceledError,
  type FreppleInputModel,
  type FreppleObject,
  type PlanningEngine,
  type PlanningEngineCapabilities,
  type PlanningEngineRequest,
  type PlanningEngineResult
} from './planning-execution.types';

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1_000;
const DEFAULT_MAX_LOG_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_LOG_LINES = 100_000;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024 * 1024;

export type CppTypescriptPlanningEngineOptions = {
  maxLogBytes?: number;
  maxLogLines?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  workerPath: string;
  workingDirectory: string;
};

export class CppTypescriptPlanningEngine implements PlanningEngine {
  readonly mode = 'cpp-typescript' as const;
  private readonly maxLogBytes: number;
  private readonly maxLogLines: number;
  private readonly maxResponseBytes: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: CppTypescriptPlanningEngineOptions) {
    this.maxLogBytes = positiveInteger(options.maxLogBytes, DEFAULT_MAX_LOG_BYTES);
    this.maxLogLines = positiveInteger(options.maxLogLines, DEFAULT_MAX_LOG_LINES);
    this.maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  }

  async solve(
    request: PlanningEngineRequest,
    options: {
      onLog?: (line: string) => void;
      onProcess?: (processId: number) => Promise<void> | void;
      signal?: AbortSignal;
    } = {}
  ): Promise<PlanningEngineResult> {
    if (options.signal?.aborted) throw new PlanningCanceledError();
    const directory = await mkdtemp(join(tmpdir(), 'enlearn-cpp-typescript-'));
    const modelPath = join(directory, 'model.json');
    const outputPath = join(directory, 'result.json');
    try {
      await writeFile(
        modelPath,
        JSON.stringify(toCppTypescriptModel(request.model, request.parameters)),
        'utf8'
      );
      await this.runWorker(modelPath, outputPath, options);
      const outputStats = await stat(outputPath).catch(() => undefined);
      if (!outputStats) throw new Error('cpp-typescript worker did not produce a result file.');
      if (outputStats.size > this.maxResponseBytes) {
        throw new Error(`cpp-typescript result exceeds ${this.maxResponseBytes} bytes.`);
      }
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(outputPath, 'utf8'));
      } catch (error) {
        throw new Error(`cpp-typescript worker returned invalid JSON: ${errorMessage(error)}`);
      }
      return validatePlanningEngineResult(toPlanningEngineResult(raw));
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async runWorker(
    modelPath: string,
    outputPath: string,
    options: {
      onLog?: (line: string) => void;
      onProcess?: (processId: number) => Promise<void> | void;
      signal?: AbortSignal;
    }
  ) {
    const child = spawn(
      process.execPath,
      [this.options.workerPath, modelPath, outputPath],
      {
        cwd: this.options.workingDirectory,
        env: childEnvironment(),
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }
    );
    const exitPromise = waitForExit(child);
    const logs = new BoundedLogCollector(
      this.maxLogBytes,
      this.maxLogLines,
      options.onLog
    );
    child.stdout?.on('data', (chunk: Buffer) => logs.add(chunk));
    child.stderr?.on('data', (chunk: Buffer) => logs.add(chunk));

    let timedOut = false;
    let canceled = false;
    let termination: Promise<void> | undefined;
    const terminate = () => termination ??= terminateProcessTree(child);
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminate();
    }, this.timeoutMs);
    timeout.unref?.();
    const abort = () => {
      canceled = true;
      void terminate();
    };
    options.signal?.addEventListener('abort', abort, { once: true });

    try {
      if (!child.pid) throw new Error('Unable to start cpp-typescript worker.');
      await options.onProcess?.(child.pid);
      const exit = await exitPromise;
      await termination;
      if (canceled || options.signal?.aborted) throw new PlanningCanceledError();
      if (timedOut) throw new Error(`cpp-typescript worker timed out after ${this.timeoutMs} ms.`);
      if (exit.error) throw exit.error;
      if (exit.code !== 0) {
        const detail = logs.tailText().trim();
        throw new Error(
          `cpp-typescript worker exited with code ${String(exit.code)}${detail ? `: ${detail}` : '.'}`
        );
      }
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) await terminate();
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      logs.end();
    }
  }
}

export function resolveCppTypescriptRoot(configured?: string) {
  const candidates = [
    configured?.trim(),
    resolve(process.cwd(), 'cpp-typescript'),
    resolve(process.cwd(), '../cpp-typescript'),
    resolve(__dirname, '../../../../cpp-typescript'),
    resolve(__dirname, '../../../cpp-typescript')
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find((candidate) => existsSync(join(candidate, 'dist')));
  if (!found) throw new Error('cpp-typescript dist directory was not found.');
  return found;
}

export function resolveCppTypescriptWorker(configured: string | undefined, root: string) {
  const candidates = [
    configured?.trim(),
    join(root, 'scripts', 'planning-worker.mjs')
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find(existsSync);
  if (!found) throw new Error('cpp-typescript planning worker was not found.');
  return found;
}

export function getCppTypescriptCapabilities(
  configuredRoot?: string,
  configuredWorker?: string
): PlanningEngineCapabilities {
  let root: string;
  try {
    root = resolveCppTypescriptRoot(configuredRoot);
  } catch (error) {
    return {
      available: false,
      mode: 'cpp-typescript',
      reason: errorMessage(error)
    };
  }
  let workerPath: string;
  try {
    workerPath = resolveCppTypescriptWorker(configuredWorker, root);
  } catch (error) {
    return {
      available: false,
      mode: 'cpp-typescript',
      reason: errorMessage(error)
    };
  }
  return {
    available: true,
    executable: process.execPath,
    mode: 'cpp-typescript',
    bridgePath: workerPath,
    endpoint: root
  };
}

export function toCppTypescriptModel(
  source: FreppleInputModel,
  parameters: PlanningEngineRequest['parameters']
) {
  const operations = source.operations.map((operation) => ({
    name: stringRef(operation.name),
    type: operationType(operation.type),
    item: stringRef(operation.item),
    location: stringRef(operation.location),
    available: stringRef(operation.available),
    priority: numberValue(operation.priority),
    effectiveStart: stringValue(operation.effective_start),
    effectiveEnd: stringValue(operation.effective_end),
    fence: numberValue(operation.fence),
    posttime: numberValue(operation.posttime),
    hardPosttime: booleanValue(operation.hard_posttime),
    batchWindow: numberValue(operation.batchwindow),
    sizeMinimum: numberValue(operation.size_minimum),
    sizeMinimumCalendar: stringRef(operation.size_minimum_calendar),
    sizeMultiple: numberValue(operation.size_multiple),
    sizeMaximum: numberValue(operation.size_maximum),
    cost: numberValue(operation.cost),
    duration: numberValue(operation.duration),
    durationPer: numberValue(operation.duration_per),
    search: stringValue(operation.search),
    suboperations: records(operation.suboperations).map((row) => ({
      operation: stringRef(row.operation),
      priority: numberValue(row.priority),
      effectiveStart: stringValue(row.effective_start),
      effectiveEnd: stringValue(row.effective_end)
    })),
    dependencies: records(operation.dependencies).map((row) => ({
      operation: stringRef(row.blockedby),
      quantity: numberValue(row.quantity),
      safetyLeadtime: numberValue(row.safety_leadtime),
      hardSafetyLeadtime: numberValue(row.hard_safety_leadtime)
    }))
  }));

  const flows = source.operations.flatMap((operation) =>
    records(operation.flows).map((flow) => ({
      type: flowType(flow.type),
      operation: stringRef(operation.name),
      buffer: bufferName(flow.item, flow.location),
      quantity: numberValue(flow.quantity),
      quantityFixed: numberValue(flow.quantity_fixed),
      priority: numberValue(flow.priority),
      transferBatch: numberValue(flow.transferbatch),
      offset: numberValue(flow.offset),
      name: stringValue(flow.name),
      search: stringValue(flow.search),
      effectiveStart: stringValue(flow.effective_start),
      effectiveEnd: stringValue(flow.effective_end)
    }))
  );

  const loads = source.operations.flatMap((operation) =>
    records(operation.loads).map((load) => ({
      type: loadType(load.type),
      operation: stringRef(operation.name),
      resource: stringRef(load.resource),
      skill: stringRef(load.skill),
      quantity: numberValue(load.quantity),
      quantityFixed: numberValue(load.quantity_fixed),
      priority: numberValue(load.priority),
      setup: stringValue(load.setup),
      name: stringValue(load.name),
      search: stringValue(load.search),
      offset: numberValue(load.offset),
      effectiveStart: stringValue(load.effective_start),
      effectiveEnd: stringValue(load.effective_end)
    }))
  );

  const demandGroups = source.demands
    .filter((demand) => demand.type === 'demand_group')
    .map((group) => ({
      name: stringRef(group.name),
      policy: stringValue(group.policy) ?? 'independent',
      status: numberValue(group.status)
    }));

  const demands = source.demands
    .filter((demand) => demand.type !== 'demand_group')
    .map((demand) => ({
      name: stringRef(demand.name),
      item: stringRef(demand.item),
      operation: stringRef(demand.operation),
      location: stringRef(demand.location),
      due: stringValue(demand.due),
      quantity: numberValue(demand.quantity) ?? 0,
      priority: numberValue(demand.priority) ?? 1,
      group: stringRef((demand.owner as FreppleObject | undefined)?.name),
      status: stringValue(demand.status),
      maxLateness: numberValue(demand.maxlateness),
      minShipment: numberValue(demand.minshipment),
      batch: stringValue(demand.batch)
    }));

  const operationPlans = source.operationplans.map((plan) => ({
    reference: stringRef(plan.reference),
    orderType: stringValue(plan.ordertype ?? plan.type),
    operation: stringRef(plan.operation),
    item: stringRef(plan.item),
    location: stringRef(plan.location),
    origin: stringRef(plan.origin),
    destination: stringRef(plan.destination),
    supplier: stringRef(plan.supplier),
    demand: stringRef(plan.demand),
    quantity: numberValue(plan.quantity) ?? 0,
    quantityCompleted: numberValue(plan.quantity_completed),
    start: stringValue(plan.start),
    end: stringValue(plan.end),
    owner: stringRef((plan.owner as FreppleObject | undefined)?.reference),
    status: stringValue(plan.statusNoPropagation),
    batch: stringValue(plan.batch),
    remark: stringValue(plan.remark),
    assignedResources: stringList(plan.resources)
  }));

  return {
    current: source.current,
    plan: {
      autoFence: parameters.autoFence
    },
    calendars: source.calendars.map((calendar) => ({
      name: stringRef(calendar.name),
      default: numberValue(calendar.default),
      buckets: records(calendar.buckets).map((bucket) => ({
        start: stringValue(bucket.start),
        end: stringValue(bucket.end),
        value: numberValue(bucket.value),
        priority: numberValue(bucket.priority),
        days: numberValue(bucket.days),
        startTime: numberValue(bucket.starttime),
        endTime: numberValue(bucket.endtime)
      }))
    })),
    locations: source.locations.map((location) => ({
      name: stringRef(location.name),
      owner: stringRef(location.owner),
      available: stringRef(location.available)
    })),
    suppliers: source.suppliers.map((supplier) => ({
      name: stringRef(supplier.name),
      owner: stringRef(supplier.owner)
    })),
    items: source.items.map((item) => ({
      name: stringRef(item.name),
      owner: stringRef(item.owner),
      type: item.type === 'item_mto' ? 'mto' : 'mts',
      cost: numberValue(item.cost)
    })),
    operations,
    resources: source.resources.map((resource) => ({
      name: stringRef(resource.name),
      type: resourceType(resource.type),
      owner: stringRef(resource.owner),
      maximum: numberValue(resource.maximum) ?? 1,
      maxearly: numberValue(resource.maxearly),
      maximumCalendar: stringRef(resource.maximum_calendar),
      available: stringRef(resource.available),
      location: stringRef(resource.location),
      cost: numberValue(resource.cost),
      efficiency: numberValue(resource.efficiency),
      setupMatrix: stringRef(resource.setupmatrix),
      setup: stringValue(resource.setup)
    })),
    skills: source.skills.map((skill) => ({ name: stringRef(skill.name) })),
    resourceSkills: source.resourceskills.map((skill) => ({
      resource: stringRef(skill.resource),
      skill: stringRef(skill.skill),
      priority: numberValue(skill.priority),
      effectiveStart: stringValue(skill.effective_start),
      effectiveEnd: stringValue(skill.effective_end)
    })),
    setupMatrices: source.setupmatrices.map((matrix) => ({
      name: stringRef(matrix.name),
      rules: records(matrix.rules).map((rule) => ({
        from: stringValue(rule.fromsetup),
        to: stringValue(rule.tosetup),
        duration: numberValue(rule.duration),
        cost: numberValue(rule.cost),
        priority: numberValue(rule.priority) ?? 1
      }))
    })),
    itemSuppliers: source.itemsuppliers.map((row) => ({
      supplier: stringRef(row.supplier),
      item: stringRef(row.item),
      location: stringRef(row.location),
      leadtime: numberValue(row.leadtime),
      hardSafetyLeadtime: numberValue(row.hard_safety_leadtime),
      extraSafetyLeadtime: numberValue(row.extra_safety_leadtime),
      sizeMinimum: numberValue(row.size_minimum),
      sizeMultiple: numberValue(row.size_multiple),
      sizeMaximum: numberValue(row.size_maximum),
      batchWindow: numberValue(row.batchwindow),
      fence: numberValue(row.fence),
      cost: numberValue(row.cost),
      priority: numberValue(row.priority),
      resource: stringRef(row.resource),
      resourceQuantity: numberValue(row.resource_qty),
      effectiveStart: stringValue(row.effective_start),
      effectiveEnd: stringValue(row.effective_end)
    })),
    itemDistributions: source.itemdistributions.map((row) => ({
      item: stringRef(row.item),
      origin: stringRef(row.origin),
      destination: stringRef(row.destination),
      leadtime: numberValue(row.leadtime),
      sizeMinimum: numberValue(row.size_minimum),
      sizeMultiple: numberValue(row.size_multiple),
      sizeMaximum: numberValue(row.size_maximum),
      batchWindow: numberValue(row.batchwindow),
      fence: numberValue(row.fence),
      cost: numberValue(row.cost),
      priority: numberValue(row.priority),
      resource: stringRef(row.resource),
      resourceQuantity: numberValue(row.resource_qty),
      effectiveStart: stringValue(row.effective_start),
      effectiveEnd: stringValue(row.effective_end)
    })),
    buffers: source.buffers.map((buffer) => ({
      name: stringRef(buffer.name),
      item: stringRef(buffer.item),
      location: stringRef(buffer.location),
      batch: stringValue(buffer.batch),
      onhand: numberValue(buffer.onhand) ?? 0,
      minimum: numberValue(buffer.minimum),
      minimumCalendar: stringRef(buffer.minimum_calendar),
      maximum: numberValue(buffer.maximum),
      maximumCalendar: stringRef(buffer.maximum_calendar)
    })),
    flows,
    loads,
    dependencies: operations.flatMap((operation) =>
      operation.dependencies.map((dependency) => ({
        operation: operation.name,
        blockedBy: dependency.operation,
        quantity: dependency.quantity,
        safetyLeadtime: dependency.safetyLeadtime,
        hardSafetyLeadtime: dependency.hardSafetyLeadtime
      }))
    ),
    demands,
    demandGroups,
    operationPlans,
    solver: {
      constraints: parameters.constraints,
      plantype: parameters.planType,
      lazyDelay: parameters.lazyDelay,
      minimumDelay: parameters.minimumDelay,
      administrativeLeadTime: parameters.administrativeLeadtime,
      rotateResources: parameters.rotateResources,
      algorithm: parameters.algorithm,
      iterationMax: parameters.iterationMax,
      resourceIterationMax: parameters.resourceIterationMax,
      moveApprovedEarly: parameters.moveApprovedEarly,
      erasePreviousFirst: true
    }
  };
}

function toPlanningEngineResult(value: unknown): unknown {
  const root = record(value);
  const sourceEngine = root.engine === undefined ? {} : record(root.engine);
  const referenceManifest = record(root.references ?? sourceEngine.references);
  const operationPlans = records(root.operationPlans).map((row) => ({
    reference: stringValue(row.reference) ?? requiredValue(row.reference, 'operationPlans.reference'),
    type: normalizeOperationPlanType(row.orderType ?? row.type),
    quantity: numberValue(row.quantity) ?? 0,
    quantityCompleted: numberValue(row.quantityCompleted),
    status: normalizeStatus(row.status),
    start: stringValue(row.start),
    end: stringValue(row.end),
    due: stringValue(row.due),
    operation: stringValue(row.operation),
    owner: stringValue(row.ownerReference ?? row.owner),
    item: stringValue(row.item),
    origin: stringValue(row.origin),
    destination: stringValue(row.destination),
    supplier: stringValue(row.supplier),
    location: stringValue(row.location),
    demand: stringValue(row.demand),
    name: stringValue(row.name),
    batch: stringValue(row.batch),
    remark: stringValue(row.remark),
    color: numberValue(row.color),
    criticality: numberValue(row.criticality),
    delay: numberValue(row.delay),
    plan: record(row.plan)
  }));
  const operationPlanReferences = new Set(operationPlans.map((row) => row.reference));
  return {
    operationPlans,
    operationPlanMaterials: records(root.operationPlanMaterials ?? root.inventoryProfiles).flatMap((row) => {
      const reference = stringValue(row.operationPlanReference ?? row.operationPlanRef);
      if (!reference || !operationPlanReferences.has(reference) ||
          !stringValue(row.item) || !stringValue(row.location)) return [];
      return [{
        operationPlanReference: reference,
        item: stringValue(row.item),
        location: stringValue(row.location),
        date: stringValue(row.date) ?? requiredValue(row.date, 'operationPlanMaterials.date'),
        quantity: numberValue(row.quantity) ?? 0,
        onhand: numberValue(row.onhand),
        minimum: numberValue(row.minimum),
        periodOfCover: numberValue(row.periodOfCover),
        status: normalizeDetailStatus(row.status)
      }];
    }),
    operationPlanResources: records(root.operationPlanResources).flatMap((row) => {
      const reference = stringValue(row.operationPlanReference);
      if (!reference || !operationPlanReferences.has(reference) || !stringValue(row.resource)) return [];
      return [{
        operationPlanReference: reference,
        resource: stringValue(row.resource),
        quantity: numberValue(row.quantity) ?? 1,
        setup: stringValue(row.setup),
        status: normalizeDetailStatus(row.status)
      }];
    }),
    problems: records(root.problems).map((row) => ({
      entity: stringValue(row.entity) ?? 'operationplan',
      owner: stringValue(row.ownerReference ?? row.owner) ?? requiredValue(row.owner, 'problems.owner'),
      name: stringValue(row.name) ?? 'planning_problem',
      description: stringValue(row.description) ?? 'cpp-typescript planning problem',
      start: stringValue(row.start) ?? requiredValue(row.start, 'problems.start'),
      end: stringValue(row.end) ?? requiredValue(row.end, 'problems.end')
    })),
    constraints: records(root.constraints).map((row) => ({
      entity: stringValue(row.entity) ?? 'demand',
      owner: stringValue(row.owner) ?? requiredValue(row.owner, 'constraints.owner'),
      name: stringValue(row.name) ?? 'planning_constraint',
      description: stringValue(row.description) ?? 'cpp-typescript planning constraint',
      start: stringValue(row.start) ?? requiredValue(row.start, 'constraints.start'),
      end: stringValue(row.end) ?? requiredValue(row.end, 'constraints.end'),
      demand: stringValue(row.demand),
      forecast: stringValue(row.forecast),
      item: stringValue(row.item)
    })),
    resourcePlans: records(root.resourcePlans).map((row) => ({
      resource: stringValue(row.resource) ?? requiredValue(row.resource, 'resourcePlans.resource'),
      start: stringValue(row.start) ?? requiredValue(row.start, 'resourcePlans.start'),
      available: numberValue(row.available),
      unavailable: numberValue(row.unavailable),
      setup: numberValue(row.setup),
      load: numberValue(row.load),
      free: numberValue(row.free),
      loadConfirmed: numberValue(row.loadConfirmed)
    })),
    engine: {
      ...sourceEngine,
      mode: 'cpp-typescript',
      algorithm: 'cpp-typescript',
      references: {
        buffers: records(referenceManifest.buffers).map((row) => ({
          name: stringValue(row.name) ?? requiredValue(row.name, 'references.buffers.name'),
          item: stringValue(row.item) ?? requiredValue(row.item, 'references.buffers.item'),
          location: stringValue(row.location) ?? requiredValue(row.location, 'references.buffers.location'),
          batch: stringValue(row.batch)
        })),
        demands: strings(referenceManifest.demands),
        operations: records(referenceManifest.operations).map((row) => ({
          name: stringValue(row.name) ?? requiredValue(row.name, 'references.operations.name'),
          hidden: Boolean(row.hidden),
          buffers: strings(row.buffers),
          resources: strings(row.resources),
          suboperations: strings(row.suboperations)
        }))
      }
    }
  };
}

function operationType(value: unknown) {
  const type = stringValue(value);
  return type === 'operation_routing' ? 'routing'
    : type === 'operation_alternate' ? 'alternate'
      : type === 'operation_split' ? 'split'
        : type === 'operation_time_per' ? 'time_per' : 'fixed_time';
}

function resourceType(value: unknown) {
  const type = stringValue(value);
  return type === 'resource_buckets' ? 'buckets'
    : type === 'resource_infinite' ? 'infinite' : 'default';
}

function flowType(value: unknown) {
  const type = stringValue(value);
  return type === 'flow_end' ? 'end'
    : type === 'flow_transfer_batch' ? 'transfer_batch' : 'start';
}

function loadType(value: unknown) {
  const type = stringValue(value);
  return type === 'load_bucketized_percentage' ? 'bucketized_percentage'
    : type === 'load_bucketized_from_start' ? 'bucketized_from_start'
      : type === 'load_bucketized_from_end' ? 'bucketized_from_end' : 'default';
}

function normalizeOperationPlanType(value: unknown): 'STCK' | 'MO' | 'WO' | 'PO' | 'DO' | 'DLVR' {
  const type = stringValue(value);
  return type === 'STCK' || type === 'MO' || type === 'WO' || type === 'PO' ||
      type === 'DO' || type === 'DLVR' ? type : 'MO';
}

function normalizeStatus(value: unknown) {
  const status = stringValue(value);
  return status === 'proposed' || status === 'approved' || status === 'confirmed' ||
      status === 'completed' || status === 'closed' ? status : 'proposed';
}

function normalizeDetailStatus(value: unknown) {
  const status = stringValue(value);
  return status === 'confirmed' || status === 'closed' ? status : 'proposed';
}

function bufferName(item: unknown, location: unknown) {
  const itemName = stringRef(item);
  const locationName = stringRef(location);
  if (!itemName || !locationName) throw new Error('cpp-typescript flow requires item and location.');
  return `${itemName} @ ${locationName}`;
}

function records(value: unknown): FreppleObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is FreppleObject => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringRef(item))
    .filter((item): item is string => Boolean(item));
}

function record(value: unknown): FreppleObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as FreppleObject
    : {};
}

function stringRef(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return stringValue((value as FreppleObject).name);
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return undefined;
}

function requiredValue(value: unknown, field: string): string {
  const result = stringValue(value);
  if (!result) throw new Error(`Missing ${field}.`);
  return result;
}

function childEnvironment() {
  const blocked = /^(DATABASE_URL|DIRECT_URL|PG[A-Z_]*|SUPABASE_[A-Z_]*|NEXT_PUBLIC_SUPABASE_[A-Z_]*|REDIS_[A-Z_]*|TRIGGER_[A-Z_]*)$/;
  return Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => value !== undefined && !blocked.test(key))
  ) as NodeJS.ProcessEnv;
}

class BoundedLogCollector {
  private bytes = 0;
  private lines = 0;
  private partial = '';
  private readonly tail: string[] = [];
  private truncated = false;

  constructor(
    private readonly maxBytes: number,
    private readonly maxLines: number,
    private readonly onLog?: (line: string) => void
  ) {}

  add(chunk: Buffer) {
    if (this.truncated) return;
    this.bytes += chunk.byteLength;
    if (this.bytes > this.maxBytes) {
      this.truncate();
      return;
    }
    const text = this.partial + chunk.toString('utf8');
    const parts = text.split(/\r?\n/);
    this.partial = parts.pop() ?? '';
    for (const line of parts) {
      if (this.lines >= this.maxLines) {
        this.truncate();
        return;
      }
      this.emit(line);
    }
  }

  end() {
    if (this.partial && !this.truncated && this.lines < this.maxLines) this.emit(this.partial);
    this.partial = '';
  }

  tailText() {
    return this.tail.join('\n').slice(-32_768);
  }

  private emit(line: string) {
    this.lines += 1;
    this.tail.push(line);
    while (this.tail.join('\n').length > 32_768 && this.tail.length > 1) this.tail.shift();
    this.onLog?.(line);
  }

  private truncate() {
    this.truncated = true;
    this.partial = '';
    this.emit(`[planning-engine] log truncated at ${this.maxBytes} bytes or ${this.maxLines} lines`);
  }
}

function waitForExit(child: ChildProcess) {
  return new Promise<{ code: number | null; error?: Error; signal: NodeJS.Signals | null }>((resolveExit) => {
    let spawnError: Error | undefined;
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (code, signal) => resolveExit({ code, error: spawnError, signal }));
  });
}

async function terminateProcessTree(child: ChildProcess) {
  const pid = child.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolveTermination) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
      killer.once('close', () => resolveTermination());
      killer.once('error', () => {
        child.kill('SIGKILL');
        resolveTermination();
      });
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
