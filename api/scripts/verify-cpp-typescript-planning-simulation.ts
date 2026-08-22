import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { buildFreppleInput } from '../src/planning-service/execution/frepple-input.builder';
import {
  CppTypescriptPlanningEngine,
  resolveCppTypescriptRoot,
  resolveCppTypescriptWorker
} from '../src/planning-service/execution/cpp-typescript-planning-engine';
import { PlanningDataLoader } from '../src/planning-service/execution/planning-data-loader';
import { preflightPlanningData } from '../src/planning-service/execution/planning-preflight';
import { resolvePlanningParameters } from '../src/planning-service/execution/planning-parameters';
import { validatePlanningEngineResult } from '../src/planning-service/execution/planning-engine-result';
import { resultSummary } from '../src/planning-service/execution/planning-result.writer';
import type {
  FreppleInputModel,
  FreppleObject,
  PlanningDataSnapshot,
  PlanningEngineRequest,
  PlanningEngineResult,
  PlanningRow
} from '../src/planning-service/execution/planning-execution.types';

const DEFAULT_ACCOUNT_CODE = '001';
const DEFAULT_CURRENT_DATE = '2026-08-10T00:00:00.000Z';
const DEFAULT_DEMAND_COUNT = 20;
const SIMULATION_SOURCE = 'cpp-typescript-demand-simulation';

type Args = {
  accountCode?: string;
  accountId?: string;
  count: number;
  currentDate: string;
  timeoutMs?: number;
};

type AccountSelection = {
  code: string | null;
  id: string;
  name: string | null;
};

async function main() {
  const args = readArgs();
  const env = getEnv();
  const pool = createScriptPool(env);
  try {
    const account = await resolveAccount(pool, args);
    const snapshot = await loadSnapshotWithRetry(pool, account.id);
    const compatibility = addMissingOperationInputBuffers(snapshot);
    const simulated = simulateDemandSnapshot(
      compatibility.snapshot,
      args.count,
      args.currentDate
    );
    const preflight = preflightPlanningData(simulated.snapshot);
    if (!preflight.ok) {
      console.error(JSON.stringify({
        account,
        compatibilityBuffersAdded: compatibility.addedBuffers.length,
        loadedCounts: snapshot.counts,
        preflight: {
          errors: preflight.errors.slice(0, 20),
          errorCount: preflight.errors.length,
          warningCount: preflight.warnings.length
        },
        simulatedDemandCount: simulated.demands.length,
        status: 'preflight_failed'
      }, null, 2));
      process.exitCode = 1;
      return;
    }

    const parameters = resolvePlanningParameters(simulated.snapshot, {
      currentdate: args.currentDate
    });
    const input = buildFreppleInput(simulated.snapshot, parameters);
    const root = resolveCppTypescriptRoot(env.PLANNING_CPP_TYPESCRIPT_ROOT);
    const workerPath = resolveCppTypescriptWorker(env.PLANNING_CPP_TYPESCRIPT_WORKER, root);
    const logs: string[] = [];
    const solved = await solveCppTypescript(input.request, {
      logs,
      root,
      timeoutMs: args.timeoutMs,
      workerPath
    });
    const result = solved.result;
    const summary = resultSummary(result);
    const simulatedDemandNames = new Set(simulated.demands.map((row) => stringValue(row.name)));
    const plansForSimulatedDemands = result.operationPlans.filter((row) =>
      row.demand && simulatedDemandNames.has(row.demand)
    );
    const scheduledPlans = result.operationPlans.filter((row) => row.start && row.end);
    const plansByType = result.operationPlans.reduce<Record<string, number>>((counts, row) => {
      counts[row.type] = (counts[row.type] ?? 0) + 1;
      return counts;
    }, {});

    assert.ok(
      summary.operationPlanCount > 0,
      'cpp-typescript did not return any operation plans.'
    );
    assert.ok(
      scheduledPlans.length > 0,
      'cpp-typescript did not return any dated operation plans.'
    );
    if (!plansForSimulatedDemands.length) {
      console.error(JSON.stringify({
        diagnostic: 'no plans were tied to simulated demand names',
        operationPlans: result.operationPlans.slice(0, 20).map((row) => ({
          demand: row.demand,
          end: row.end,
          item: row.item,
          operation: row.operation,
          quantity: row.quantity,
          reference: row.reference,
          start: row.start,
          type: row.type
        })),
        simulatedDemands: simulated.demands.map((row) => ({
          due: row.due,
          itemId: row.item_id,
          locationId: row.location_id,
          name: row.name,
          operationId: row.operation_id,
          quantity: row.quantity
        })),
        summary
      }, null, 2));
    }
    assert.ok(
      plansForSimulatedDemands.length > 0,
      'cpp-typescript did not create plans tied to the simulated demands.'
    );

    console.log(JSON.stringify({
      account,
      cppTypescript: {
        executable: process.execPath,
        invocation: solved.invocation,
        root,
        workerPath
      },
      input: {
        bucketDates: input.request.bucketDates.length,
        bucketizedResources: input.request.bucketizedResources.length,
        compatibilityBuffersAdded: compatibility.addedBuffers.length,
        compatibilityBuffers: compatibility.addedBuffers.slice(0, 10).map((row) => ({
          id: row.id,
          itemId: row.item_id,
          locationId: row.location_id
        })),
        loadedCounts: snapshot.counts,
        simulatedDemandCount: simulated.demands.length,
        simulatedDemands: simulated.demands.slice(0, 5).map((row) => ({
          due: row.due,
          itemId: row.item_id,
          locationId: row.location_id,
          name: row.name,
          priority: row.priority,
          quantity: row.quantity
        })),
        snapshotHash: simulated.snapshot.hash
      },
      output: {
        ...summary,
        plansByType,
        plansForSimulatedDemands: plansForSimulatedDemands.length,
        scheduledPlans: scheduledPlans.length,
        sampleOperationPlans: result.operationPlans.slice(0, 10).map((row) => ({
          demand: row.demand,
          end: row.end,
          item: row.item,
          operation: row.operation,
          quantity: row.quantity,
          reference: row.reference,
          start: row.start,
          type: row.type
        }))
      },
      preflight: {
        errorCount: preflight.errors.length,
        warningCount: preflight.warnings.length,
        warnings: preflight.warnings.slice(0, 10)
      },
      status: 'scheduled'
    }, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function loadSnapshotWithRetry(pool: Pool, accountId: string, attempts = 4) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await new PlanningDataLoader(pool).load(accountId);
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === attempts) throw error;
      await delay(attempt * 500);
    }
  }
  throw lastError;
}

function createScriptPool(env: Record<string, string>) {
  const configured = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!configured?.trim()) throw new Error('DATABASE_URL or DIRECT_URL is required.');
  const pool = new Pool({
    connectionString: normalizePostgresConnectionString(configured),
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 4,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('connect', (client) => client.on('error', () => undefined));
  pool.on('error', () => undefined);
  return pool;
}

async function solveCppTypescript(
  request: PlanningEngineRequest,
  options: {
    logs: string[];
    root: string;
    timeoutMs?: number;
    workerPath: string;
  }
): Promise<{
  invocation: Record<string, unknown>;
  result: PlanningEngineResult;
}> {
  const engine = new CppTypescriptPlanningEngine({
    timeoutMs: options.timeoutMs,
    workerPath: options.workerPath,
    workingDirectory: options.root
  });
  try {
    const result = await engine.solve(request, {
      onLog: (line) => {
        if (options.logs.length < 50) options.logs.push(line);
      }
    });
    return {
      invocation: { mode: 'child-process' },
      result
    };
  } catch (error) {
    if (!isSpawnPermissionError(error)) throw error;
    const result = await solveCppTypescriptInProcess(request, options);
    return {
      invocation: {
        fallbackReason: error instanceof Error ? error.message : String(error),
        mode: 'in-process'
      },
      result
    };
  }
}

async function solveCppTypescriptInProcess(
  request: PlanningEngineRequest,
  options: {
    root: string;
    timeoutMs?: number;
  }
) {
  const directory = await mkdtemp(join(tmpdir(), 'enlearn-cpp-typescript-inline-'));
  const modelPath = join(directory, 'model.json');
  const outputPath = join(directory, 'result.json');
  try {
    await writeFile(
      modelPath,
      JSON.stringify(toCppTypescriptModel(request.model, request.parameters)),
      'utf8'
    );
    const modulePath = pathToFileURL(join(options.root, 'scripts', 'compare-scheduling.mjs')).href;
    const worker = await nativeImport(modulePath) as {
      typescriptWorker?: (
        modelPath: string,
        resultPath: string,
        outputMode?: string
      ) => Promise<void>;
    };
    if (typeof worker.typescriptWorker !== 'function') {
      throw new Error('cpp-typescript compare-scheduling worker export was not found.');
    }
    const run = worker.typescriptWorker(modelPath, outputPath, 'planning');
    if (options.timeoutMs) await withTimeout(run, options.timeoutMs);
    else await run;
    return validatePlanningEngineResult(JSON.parse(await readFile(outputPath, 'utf8')));
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function toCppTypescriptModel(
  source: FreppleInputModel,
  parameters: PlanningEngineRequest['parameters']
) {
  const operations = source.operations.map((operation) => ({
    name: stringRef(operation.name),
    type: operationType(operation.type),
    item: stringRef(operation.item),
    location: stringRef(operation.location),
    available: stringRef(operation.available),
    posttime: finiteValue(operation.posttime),
    hardPosttime: booleanValue(operation.hard_posttime),
    batchWindow: finiteValue(operation.batchwindow),
    sizeMinimum: finiteValue(operation.size_minimum),
    sizeMultiple: finiteValue(operation.size_multiple),
    sizeMaximum: finiteValue(operation.size_maximum),
    cost: finiteValue(operation.cost),
    duration: finiteValue(operation.duration),
    durationPer: finiteValue(operation.duration_per),
    search: stringValue(operation.search),
    suboperations: records(operation.suboperations).map((row) => ({
      operation: stringRef(row.operation),
      priority: finiteValue(row.priority),
      effectiveStart: stringValue(row.effective_start),
      effectiveEnd: stringValue(row.effective_end)
    })),
    dependencies: records(operation.dependencies).map((row) => ({
      operation: stringRef(row.blockedby),
      quantity: finiteValue(row.quantity),
      safetyLeadtime: finiteValue(row.safety_leadtime),
      hardSafetyLeadtime: finiteValue(row.hard_safety_leadtime)
    }))
  }));

  const flows = source.operations.flatMap((operation) =>
    records(operation.flows).map((flow) => ({
      type: flowType(flow.type),
      operation: stringRef(operation.name),
      buffer: flowBufferName(flow.item, flow.location),
      quantity: finiteValue(flow.quantity),
      quantityFixed: finiteValue(flow.quantity_fixed),
      priority: finiteValue(flow.priority),
      transferBatch: finiteValue(flow.transferbatch),
      name: stringValue(flow.name)
    }))
  );

  const loads = source.operations.flatMap((operation) =>
    records(operation.loads).map((load) => ({
      operation: stringRef(operation.name),
      resource: stringRef(load.resource),
      skill: stringRef(load.skill),
      quantity: finiteValue(load.quantity),
      priority: finiteValue(load.priority),
      setup: stringValue(load.setup),
      name: stringValue(load.name),
      search: stringValue(load.search)
    }))
  );

  const demandGroups = source.demands
    .filter((demand) => demand.type === 'demand_group')
    .map((group) => ({
      name: stringRef(group.name),
      policy: stringValue(group.policy) ?? 'independent',
      status: finiteValue(group.status)
    }));

  const demands = source.demands
    .filter((demand) => demand.type !== 'demand_group')
    .map((demand) => ({
      name: stringRef(demand.name),
      item: stringRef(demand.item),
      operation: stringRef(demand.operation),
      location: stringRef(demand.location),
      due: stringValue(demand.due),
      quantity: finiteValue(demand.quantity) ?? 0,
      priority: finiteValue(demand.priority) ?? 1,
      group: stringRef((demand.owner as FreppleObject | undefined)?.name),
      status: stringValue(demand.status),
      maxLateness: finiteValue(demand.maxlateness),
      minShipment: finiteValue(demand.minshipment),
      batch: stringValue(demand.batch)
    }));

  const operationPlans = source.operationplans.map((plan) => ({
    reference: stringRef(plan.reference),
    operation: stringRef(plan.operation),
    quantity: finiteValue(plan.quantity) ?? 0,
    quantityCompleted: finiteValue(plan.quantity_completed),
    start: stringValue(plan.start),
    end: stringValue(plan.end),
    owner: stringRef((plan.owner as FreppleObject | undefined)?.reference),
    status: stringValue(plan.statusNoPropagation),
    batch: stringValue(plan.batch),
    assignedResources: records(plan.resources).map((resource) => stringRef(resource.name))
  })).filter((plan) => Boolean(plan.operation));

  return {
    current: source.current,
    plan: {
      autoFence: parameters.autoFence
    },
    calendars: source.calendars.map((calendar) => ({
      name: stringRef(calendar.name),
      default: finiteValue(calendar.default),
      buckets: records(calendar.buckets).map((bucket) => ({
        start: stringValue(bucket.start),
        end: stringValue(bucket.end),
        value: finiteValue(bucket.value),
        priority: finiteValue(bucket.priority),
        days: finiteValue(bucket.days),
        startTime: finiteValue(bucket.starttime),
        endTime: finiteValue(bucket.endtime)
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
      cost: finiteValue(item.cost)
    })),
    operations,
    resources: source.resources.map((resource) => ({
      name: stringRef(resource.name),
      type: resourceType(resource.type),
      owner: stringRef(resource.owner),
      maximum: finiteValue(resource.maximum) ?? 1,
      maxearly: finiteValue(resource.maxearly),
      maximumCalendar: stringRef(resource.maximum_calendar),
      available: stringRef(resource.available),
      location: stringRef(resource.location),
      cost: finiteValue(resource.cost),
      efficiency: finiteValue(resource.efficiency),
      setupMatrix: stringRef(resource.setupmatrix),
      setup: stringValue(resource.setup)
    })),
    skills: source.skills.map((skill) => ({ name: stringRef(skill.name) })),
    resourceSkills: source.resourceskills.map((skill) => ({
      resource: stringRef(skill.resource),
      skill: stringRef(skill.skill),
      priority: finiteValue(skill.priority)
    })),
    setupMatrices: source.setupmatrices.map((matrix) => ({
      name: stringRef(matrix.name),
      rules: records(matrix.rules).map((rule) => ({
        from: stringValue(rule.fromsetup),
        to: stringValue(rule.tosetup),
        duration: finiteValue(rule.duration),
        cost: finiteValue(rule.cost),
        priority: finiteValue(rule.priority) ?? 1
      }))
    })),
    itemSuppliers: source.itemsuppliers.map((row) => ({
      supplier: stringRef(row.supplier),
      item: stringRef(row.item),
      location: stringRef(row.location),
      leadtime: finiteValue(row.leadtime),
      hardSafetyLeadtime: finiteValue(row.hard_safety_leadtime),
      extraSafetyLeadtime: finiteValue(row.extra_safety_leadtime),
      sizeMinimum: finiteValue(row.size_minimum),
      sizeMultiple: finiteValue(row.size_multiple),
      sizeMaximum: finiteValue(row.size_maximum),
      cost: finiteValue(row.cost),
      priority: finiteValue(row.priority)
    })),
    itemDistributions: source.itemdistributions.map((row) => ({
      item: stringRef(row.item),
      origin: stringRef(row.origin),
      destination: stringRef(row.destination),
      leadtime: finiteValue(row.leadtime),
      sizeMinimum: finiteValue(row.size_minimum),
      sizeMultiple: finiteValue(row.size_multiple),
      sizeMaximum: finiteValue(row.size_maximum),
      cost: finiteValue(row.cost),
      priority: finiteValue(row.priority),
      resource: stringRef(row.resource)
    })),
    buffers: source.buffers.map((buffer) => ({
      name: stringRef(buffer.name),
      item: stringRef(buffer.item),
      location: stringRef(buffer.location),
      batch: stringValue(buffer.batch),
      onhand: finiteValue(buffer.onhand) ?? 0,
      minimum: finiteValue(buffer.minimum),
      maximum: finiteValue(buffer.maximum)
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
      erasePreviousFirst: true
    }
  };
}

function addMissingOperationInputBuffers(snapshot: PlanningDataSnapshot) {
  const operations = new Map(snapshot.rows.planning_operation.map((row) => [row.id, row]));
  const itemTypes = new Map(snapshot.rows.planning_item.map((row) => [
    row.id,
    stringValue(row.type) ?? 'make to stock'
  ]));
  const existing = new Set(snapshot.rows.planning_buffer.map((row) =>
    bufferKey(row.item_id, row.location_id, row.batch, itemTypes)
  ));
  const addedBuffers: PlanningRow[] = [];

  for (const flow of snapshot.rows.planning_operationmaterial) {
    if ((finiteValue(flow.quantity) ?? 0) >= 0) continue;
    const itemId = stringValue(flow.item_id);
    const operation = operations.get(stringValue(flow.operation_id) ?? '');
    const locationId = stringValue(flow.location_id) ?? stringValue(operation?.location_id);
    if (!itemId || !locationId) continue;
    const key = bufferKey(itemId, locationId, '', itemTypes);
    if (existing.has(key)) continue;
    existing.add(key);
    addedBuffers.push({
      account_id: snapshot.accountId,
      batch: '',
      category: 'simulation compatibility',
      id: randomUUID(),
      item_id: itemId,
      location_id: locationId,
      maximum: 0,
      minimum: 0,
      onhand: 0,
      source: `${SIMULATION_SOURCE}:compat-buffer`,
      subcategory: 'operation input buffer',
      type: 'default',
      updated_at: new Date().toISOString()
    });
  }

  if (!addedBuffers.length) return { addedBuffers, snapshot };
  const rows = {
    ...snapshot.rows,
    planning_buffer: [...snapshot.rows.planning_buffer, ...addedBuffers]
  };
  const counts = {
    ...snapshot.counts,
    planning_buffer: rows.planning_buffer.length
  };
  return {
    addedBuffers,
    snapshot: {
      ...snapshot,
      counts,
      hash: createHash('sha256').update(stableStringify(rows)).digest('hex'),
      rows
    }
  };
}

async function resolveAccount(pool: Pool, args: Args): Promise<AccountSelection> {
  if (args.accountId) {
    const result = await pool.query<AccountSelection>(
      `select id::text, code, name
       from basejump.accounts
       where id = $1 and personal_account = false and status = 'active'`,
      [args.accountId]
    );
    const account = result.rows[0];
    if (!account) throw new Error(`No active business account found for id ${args.accountId}.`);
    return account;
  }

  const accountCode = args.accountCode ?? DEFAULT_ACCOUNT_CODE;
  const byCode = await pool.query<AccountSelection>(
    `select id::text, code, name
     from basejump.accounts
     where code = $1 and personal_account = false and status = 'active'
     order by name
     limit 1`,
    [accountCode]
  );
  if (byCode.rows[0]) return byCode.rows[0];

  const fallback = await pool.query<AccountSelection>(
    `select a.id::text, a.code, a.name
     from basejump.accounts a
     where a.personal_account = false and a.status = 'active'
     order by
       (select count(*) from public.planning_operation o where o.account_id = a.id) desc,
       (select count(*) from public.planning_item i where i.account_id = a.id) desc,
       coalesce(a.code, ''),
       a.name
     limit 1`
  );
  const account = fallback.rows[0];
  if (!account) throw new Error('No active business account was found.');
  return account;
}

function simulateDemandSnapshot(
  snapshot: PlanningDataSnapshot,
  count: number,
  currentDate: string
) {
  const templates = demandTemplates(snapshot);
  const demands = Array.from({ length: count }, (_, index) =>
    simulatedDemand(snapshot.accountId, templates[index % templates.length], index, currentDate)
  );
  const retainedDemandIds = new Set(snapshot.rows.planning_operationplan
    .map((row) => stringValue(row.demand_id))
    .filter((value): value is string => Boolean(value)));
  const retainedDemands = snapshot.rows.planning_demand.filter((row) =>
    retainedDemandIds.has(row.id)
  );
  const rows = {
    ...snapshot.rows,
    planning_demand: [...retainedDemands, ...demands]
  };
  const counts = {
    ...snapshot.counts,
    planning_demand: rows.planning_demand.length
  };
  const simulatedSnapshot = {
    ...snapshot,
    counts,
    hash: createHash('sha256').update(stableStringify(rows)).digest('hex'),
    rows
  };
  return { demands, snapshot: simulatedSnapshot };
}

function demandTemplates(snapshot: PlanningDataSnapshot) {
  const existing = snapshot.rows.planning_demand.filter((row) =>
    stringValue(row.customer_id) &&
    stringValue(row.item_id) &&
    stringValue(row.location_id) &&
    stringValue(row.due) &&
    finiteValue(row.quantity) !== undefined &&
    !['closed', 'canceled'].includes(stringValue(row.status) ?? '')
  ).map((row) => ({
    ...row,
    operation_id: stringValue(row.operation_id) ?? findDemandOperation(snapshot, row)?.id
  }));
  if (existing.length) return existing;

  const customer = snapshot.rows.planning_customer[0];
  if (!customer) throw new Error('At least one planning customer is required to simulate demands.');
  const operation = snapshot.rows.planning_operation.find((row) =>
    stringValue(row.item_id) && stringValue(row.location_id)
  );
  if (!operation) {
    throw new Error('At least one operation with item_id and location_id is required to simulate demands.');
  }
  return [{
    account_id: snapshot.accountId,
    customer_id: customer.id,
    due: DEFAULT_CURRENT_DATE,
    id: randomUUID(),
    item_id: operation.item_id,
    location_id: operation.location_id,
    name: 'SIM-CPP-TS-TEMPLATE',
    operation_id: operation.id,
    priority: 10,
    quantity: 1,
    status: 'open',
    updated_at: new Date().toISOString()
  } satisfies PlanningRow];
}

function findDemandOperation(snapshot: PlanningDataSnapshot, demand: PlanningRow) {
  const itemId = stringValue(demand.item_id);
  const locationId = stringValue(demand.location_id);
  if (!itemId) return undefined;
  return snapshot.rows.planning_operation.find((row) =>
    !stringValue(row.owner_id) &&
    stringValue(row.item_id) === itemId &&
    stringValue(row.location_id) === locationId
  ) ?? snapshot.rows.planning_operation.find((row) =>
    !stringValue(row.owner_id) &&
    stringValue(row.item_id) === itemId
  );
}

function simulatedDemand(
  accountId: string,
  template: PlanningRow,
  index: number,
  currentDate: string
): PlanningRow {
  const sequence = index + 1;
  const due = new Date(Date.parse(currentDate) + (3 + index) * 86_400_000).toISOString();
  const templateQuantity = finiteValue(template.quantity) ?? 10;
  const quantity = Math.max(10, Math.round(templateQuantity * (0.6 + (sequence % 5) * 0.25)));
  return {
    ...template,
    account_id: accountId,
    batch: null,
    delay: null,
    deliverydate: null,
    due,
    id: randomUUID(),
    maxlateness: finiteValue(template.maxlateness) ?? 30 * 86_400,
    name: `SIM-CPP-TS-DEMAND-${String(sequence).padStart(2, '0')}`,
    operation_id: null,
    owner: 'SIM-CPP-TS-DEMAND-GROUP',
    plan: {},
    plannedquantity: null,
    policy: 'independent',
    priority: sequence,
    quantity,
    source: SIMULATION_SOURCE,
    source_doc_no: `SIM-CPP-TS-${String(sequence).padStart(2, '0')}`,
    source_key: `cpp-typescript-demand-simulation:${sequence}`,
    source_line_id: null,
    source_line_no: '10',
    source_order_id: null,
    source_system: 'enlearn',
    source_type: 'manual',
    source_updated_at: new Date().toISOString(),
    status: 'open',
    sync_message: null,
    sync_status: 'manual',
    updated_at: new Date().toISOString()
  };
}

function readArgs(): Args {
  const args = process.argv.slice(2);
  const read = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const value = args[index + 1]?.trim();
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
    return value;
  };
  return {
    accountCode: read('--account-code'),
    accountId: read('--account-id'),
    count: positiveInteger(read('--count'), DEFAULT_DEMAND_COUNT, '--count'),
    currentDate: dateArgument(read('--current-date') ?? DEFAULT_CURRENT_DATE, '--current-date'),
    timeoutMs: optionalPositiveInteger(read('--timeout-ms'), '--timeout-ms')
  };
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function optionalPositiveInteger(value: string | undefined, name: string) {
  if (value === undefined) return undefined;
  return positiveInteger(value, 1, name);
}

function dateArgument(value: string, name: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} must be a valid date-time.`);
  return date.toISOString();
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteValue(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return undefined;
}

function records(value: unknown): FreppleObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is FreppleObject =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
      )
    : [];
}

function stringRef(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return stringValue((value as FreppleObject).name);
  }
  return undefined;
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

function flowBufferName(item: unknown, location: unknown) {
  const itemName = stringRef(item);
  const locationName = stringRef(location);
  if (!itemName || !locationName) throw new Error('cpp-typescript flow requires item and location.');
  return `${itemName} @ ${locationName}`;
}

function bufferKey(
  itemValue: unknown,
  locationValue: unknown,
  batchValue: unknown,
  itemTypes: Map<string, string>
) {
  const itemId = stringValue(itemValue) ?? '';
  const locationId = stringValue(locationValue) ?? '';
  const batch = itemTypes.get(itemId) === 'make to order'
    ? stringValue(batchValue) ?? ''
    : '';
  return `${itemId}\u0000${locationId}\u0000${batch}`;
}

function isSpawnPermissionError(error: unknown) {
  return error instanceof Error &&
    ('code' in error ? String((error as { code?: unknown }).code) === 'EPERM' : /spawn EPERM/i.test(error.message));
}

function nativeImport(specifier: string): Promise<unknown> {
  const importer = new Function('specifier', 'return import(specifier)');
  return importer(specifier) as Promise<unknown>;
}

function isTransientDatabaseError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const message = error instanceof Error ? error.message : String(error);
  return [
    'ECONNRESET', 'ETIMEDOUT', 'EPIPE', '08000', '08003', '08006',
    '57P01', '57P02', '57P03'
  ].includes(code) || /connection (?:ended|terminated)|read ECONNRESET|socket hang up/i.test(message);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`cpp-typescript in-process worker timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    timeout.unref?.();
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
