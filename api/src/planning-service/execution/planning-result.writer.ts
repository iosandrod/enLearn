import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  PlanningEngineResult,
  PlanningNameEntity,
  PlanningNameIndex,
  PlanningReferenceIndex,
  PlanningRunOutput,
  PlanningResultSummary
} from './planning-execution.types';
import {
  PlanningCanceledError,
  PlanningResultValidationError
} from './planning-execution.types';
import { lockPlanningRunState } from './planning-run.repository';

type DatabaseRow = Record<string, unknown>;

export class PlanningResultWriter {
  constructor(private readonly pool: Pool) {}

  async complete(options: {
    accountId: string;
    names: PlanningNameIndex;
    output: Omit<PlanningRunOutput, keyof PlanningResultSummary>;
    planVersionId: string;
    references: PlanningReferenceIndex;
    result: PlanningEngineResult;
    runId: string;
  }): Promise<PlanningRunOutput> {
    let rows: ReturnType<typeof mapResultRows>;
    try {
      rows = mapResultRows(options);
    } catch (error) {
      if (error instanceof PlanningResultValidationError) throw error;
      throw new PlanningResultValidationError(
        error instanceof Error ? error.message : String(error),
        error
      );
    }
    const summary = resultSummary(options.result);
    const output: PlanningRunOutput = { ...options.output, ...summary };
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const state = await lockPlanningRunState(
        client,
        options.accountId,
        options.runId,
        options.planVersionId
      );
      if (state.runStatus === 'canceled' || state.versionStatus === 'canceled') {
        throw new PlanningCanceledError();
      }
      if (state.runStatus === 'succeeded') {
        await client.query('commit');
        return state.output ?? output;
      }
      if (state.runStatus === 'failed') {
        throw new Error('Failed planning run cannot accept results.');
      }
      if (!['draft', 'running'].includes(state.versionStatus)) {
        throw new Error(
          `Plan version ${options.planVersionId} is immutable (${state.versionStatus}).`
        );
      }

      await deletePreviousResults(client, options.accountId, options.planVersionId);
      await insertRows(client, 'planning_operationplan', rows.operationPlans);
      await insertRows(client, 'planning_operationplanmaterial', rows.operationPlanMaterials);
      await insertRows(client, 'planning_operationplanresource', rows.operationPlanResources);
      await insertRows(client, 'planning_problem', rows.problems);
      await insertRows(client, 'planning_constraint', rows.constraints);
      await insertRows(client, 'planning_resourceplan', rows.resourcePlans);
      await client.query(`select set_config('planning.system_version_write', 'on', true)`);
      const versionUpdate = await client.query(
        `update public.planning_plan_version
         set status = 'completed', completed_at = timezone('utc', now()),
             parameters = $3::jsonb, input_snapshot = $4::jsonb,
             result_summary = $5::jsonb, updated_at = timezone('utc', now())
         where account_id = $1 and id = $2 and status in ('draft', 'running')`,
        [
          options.accountId,
          options.planVersionId,
          JSON.stringify(output.parameters),
          JSON.stringify(output.inputSnapshot),
          JSON.stringify(summary)
        ]
      );
      if (!versionUpdate.rowCount) throw new PlanningCanceledError();
      const runUpdate = await client.query(
        `update public.planning_run
         set status = 'succeeded', progress = 100, message = '排产完成',
             output = $3::jsonb, finished = timezone('utc', now()), processid = null,
             updated_at = timezone('utc', now())
         where account_id = $1 and id = $2 and status in ('queued', 'running')`,
        [options.accountId, options.runId, JSON.stringify(output)]
      );
      if (!runUpdate.rowCount) throw new PlanningCanceledError();
      await client.query('commit');
      return output;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function mapResultRows(options: {
  accountId: string;
  names: PlanningNameIndex;
  references: PlanningReferenceIndex;
  planVersionId: string;
  result: PlanningEngineResult;
  runId: string;
}) {
  const operationPlanIds = new Map(
    options.result.operationPlans.map((row) => [row.reference, randomUUID()])
  );
  const engineReferences = validateEngineReferences(options);
  const common = {
    account_id: options.accountId,
    plan_version_id: options.planVersionId
  };
  const planCommon = { ...common, source: 'frepple' };
  const operationPlans = options.result.operationPlans.map((row) => ({
    id: operationPlanIds.get(row.reference),
    ...planCommon,
    reference: row.reference,
    status: row.status ?? 'proposed',
    type: row.type,
    quantity: row.quantity,
    quantity_completed: row.quantityCompleted,
    color: row.color,
    startdate: row.start,
    enddate: row.end,
    remark: row.remark,
    criticality: row.criticality,
    delay: secondsInterval(row.delay),
    plan: row.plan ?? {},
    operation_id: mappedName(options.names, 'operation', row.operation, 'operation'),
    owner_id: mappedOperationPlan(operationPlanIds, row.owner, 'owner'),
    batch: row.batch,
    item_id: mappedName(options.names, 'item', row.item, 'item'),
    origin_id: mappedName(options.names, 'location', row.origin, 'origin'),
    destination_id: mappedName(options.names, 'location', row.destination, 'destination'),
    supplier_id: mappedName(options.names, 'supplier', row.supplier, 'supplier'),
    location_id: mappedName(options.names, 'location', row.location, 'location'),
    demand_id: mappedName(options.names, 'demand', row.demand, 'demand'),
    due: row.due,
    name: row.name
  }));
  const operationPlanMaterials = options.result.operationPlanMaterials.map((row) => ({
    id: randomUUID(),
    ...planCommon,
    operationplan_id: mappedOperationPlan(
      operationPlanIds,
      row.operationPlanReference,
      'operationPlanReference',
      true
    ),
    item_id: mappedName(options.names, 'item', row.item, 'item', true),
    location_id: mappedName(options.names, 'location', row.location, 'location', true),
    quantity: row.quantity,
    flowdate: row.date,
    onhand: row.onhand,
    minimum: row.minimum,
    periodofcover: row.periodOfCover,
    status: row.status ?? 'proposed'
  }));
  const operationPlanResources = options.result.operationPlanResources.map((row) => ({
    id: randomUUID(),
    ...planCommon,
    operationplan_id: mappedOperationPlan(
      operationPlanIds,
      row.operationPlanReference,
      'operationPlanReference',
      true
    ),
    resource_id: mappedName(options.names, 'resource', row.resource, 'resource', true),
    quantity: row.quantity,
    setup: row.setup,
    status: row.status ?? 'proposed'
  }));
  const problems = options.result.problems.map((row, index) => {
    validateDiagnosticOwner(
      options,
      engineReferences,
      operationPlanIds,
      row.entity,
      row.owner,
      `problems[${index}].owner`
    );
    return {
      id: randomUUID(),
      ...common,
      run_id: options.runId,
      entity: row.entity,
      owner: row.owner,
      name: row.name,
      description: row.description,
      startdate: row.start,
      enddate: row.end
    };
  });
  const constraints = options.result.constraints.map((row, index) => {
    if (row.forecast) {
      throw new Error(`Unknown or unsupported forecast result reference: ${row.forecast}.`);
    }
    validateDiagnosticOwner(
      options,
      engineReferences,
      operationPlanIds,
      row.entity,
      row.owner,
      `constraints[${index}].owner`
    );
    return {
      id: randomUUID(),
      ...common,
      run_id: options.runId,
      demand_id: mappedName(options.names, 'demand', row.demand, 'demand'),
      forecast_id: null,
      item_id: mappedName(options.names, 'item', row.item, 'item'),
      entity: row.entity,
      owner: row.owner,
      name: row.name,
      description: row.description,
      startdate: row.start,
      enddate: row.end
    };
  });
  const resourcePlans = options.result.resourcePlans.map((row) => ({
    id: randomUUID(),
    ...common,
    run_id: options.runId,
    resource_id: mappedName(options.names, 'resource', row.resource, 'resource', true),
    startdate: row.start,
    available: row.available,
    unavailable: row.unavailable,
    setup: row.setup,
    load: row.load,
    free: row.free,
    load_confirmed: row.loadConfirmed
  }));
  return {
    constraints,
    operationPlanMaterials,
    operationPlanResources,
    operationPlans,
    problems,
    resourcePlans
  };
}

function validateDiagnosticOwner(
  options: {
    names: PlanningNameIndex;
    references: PlanningReferenceIndex;
  },
  engineReferences: ValidatedEngineReferences,
  operationPlanIds: Map<string, string>,
  entityValue: string,
  owner: string,
  field: string
) {
  const entity = entityValue.trim().toLowerCase();
  if (entity === 'demand') {
    if (!engineReferences.demands.has(owner)) {
      throw new Error(`Unknown demand result reference in ${field}: ${owner}.`);
    }
    return;
  }
  if (entity === 'capacity' || entity === 'resource') {
    mappedName(options.names, 'resource', owner, field, true);
    return;
  }
  if (entity === 'operation') {
    if (!engineReferences.operations.has(owner)) {
      throw new Error(`Unknown operation result reference in ${field}: ${owner}.`);
    }
    validateOperationProvenance(owner, engineReferences, new Set(), field);
    return;
  }
  if (entity === 'material' || entity === 'buffer') {
    if (!engineReferences.buffers.has(owner)) {
      throw new Error(`Unknown buffer result reference in ${field}: ${owner}.`);
    }
    return;
  }
  if (entity === 'operationplan') {
    mappedOperationPlan(operationPlanIds, owner, field, true);
    return;
  }
  throw new Error(`Unsupported diagnostic entity in ${field}: ${entityValue}.`);
}

type ValidatedEngineReferences = {
  buffers: Set<string>;
  demands: Set<string>;
  operations: Map<string, {
    buffers: string[];
    hidden: boolean;
    resources: string[];
    suboperations: string[];
  }>;
};

function validateEngineReferences(options: {
  names: PlanningNameIndex;
  references: PlanningReferenceIndex;
  result: PlanningEngineResult;
}): ValidatedEngineReferences {
  const manifest = options.result.engine.references;
  const buffers = new Set<string>();
  for (const [index, buffer] of manifest.buffers.entries()) {
    mappedName(options.names, 'item', buffer.item, `engine.references.buffers[${index}].item`, true);
    mappedName(
      options.names,
      'location',
      buffer.location,
      `engine.references.buffers[${index}].location`,
      true
    );
    const expectedName = buffer.batch
      ? `${buffer.item} @ ${buffer.batch} @ ${buffer.location}`
      : `${buffer.item} @ ${buffer.location}`;
    if (buffer.name !== expectedName) {
      throw new Error(
        `Engine buffer ${buffer.name} does not match its business reference ${expectedName}.`
      );
    }
    buffers.add(buffer.name);
  }

  const demands = new Set(manifest.demands);
  for (const expected of options.references.demands) {
    if (!demands.has(expected)) {
      throw new Error(`frePPLe engine reference manifest omitted input demand: ${expected}.`);
    }
  }
  for (const demand of demands) {
    if (!options.references.demands.has(demand)) {
      throw new Error(`frePPLe engine reference manifest contains unknown demand: ${demand}.`);
    }
  }
  for (const expected of options.references.buffers) {
    if (!buffers.has(expected)) {
      throw new Error(`frePPLe engine reference manifest omitted input buffer: ${expected}.`);
    }
  }

  const operations = new Map(manifest.operations.map((operation) => [operation.name, operation]));
  for (const expected of options.references.operations) {
    const operation = operations.get(expected);
    if (!operation || operation.hidden) {
      throw new Error(`frePPLe engine reference manifest omitted input operation: ${expected}.`);
    }
  }
  for (const [name, operation] of operations) {
    if (!operation.hidden && !options.references.operations.has(name)) {
      throw new Error(`frePPLe engine reference manifest contains unknown non-hidden operation: ${name}.`);
    }
    for (const buffer of operation.buffers) {
      if (!buffers.has(buffer)) {
        throw new Error(`Operation ${name} references unknown engine buffer ${buffer}.`);
      }
    }
    for (const resource of operation.resources) {
      mappedName(options.names, 'resource', resource, `engine operation ${name} resource`, true);
    }
    for (const suboperation of operation.suboperations) {
      if (!operations.has(suboperation)) {
        throw new Error(`Operation ${name} references unknown engine suboperation ${suboperation}.`);
      }
    }
  }
  return { buffers, demands, operations };
}

function validateOperationProvenance(
  name: string,
  references: ValidatedEngineReferences,
  visiting: Set<string>,
  field: string
): void {
  const operation = references.operations.get(name);
  if (!operation) throw new Error(`Unknown operation result reference in ${field}: ${name}.`);
  if (!operation.hidden || operation.buffers.length || operation.resources.length) return;
  if (visiting.has(name)) {
    throw new Error(`Cyclic hidden operation reference in ${field}: ${name}.`);
  }
  if (!operation.suboperations.length) {
    throw new Error(`Hidden operation result reference has no business provenance in ${field}: ${name}.`);
  }
  const next = new Set(visiting);
  next.add(name);
  for (const child of operation.suboperations) {
    validateOperationProvenance(child, references, next, field);
  }
}

async function deletePreviousResults(
  client: PoolClient,
  accountId: string,
  planVersionId: string
) {
  for (const table of [
    'planning_operationplanmaterial',
    'planning_operationplanresource',
    'planning_problem',
    'planning_constraint',
    'planning_resourceplan',
    'planning_operationplan'
  ]) {
    await client.query(
      `delete from public.${table} where account_id = $1 and plan_version_id = $2`,
      [accountId, planVersionId]
    );
  }
}

async function insertRows(client: PoolClient, table: string, rows: DatabaseRow[]) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  for (let offset = 0; offset < rows.length; offset += 250) {
    const chunk = rows.slice(offset, offset + 250);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => `(${columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    }).join(', ')})`);
    await client.query(
      `insert into public.${table} (${columns.map(quoteIdentifier).join(', ')}) values ${tuples.join(', ')}`,
      values
    );
  }
}

function mappedName(
  names: PlanningNameIndex,
  entity: PlanningNameEntity,
  value: string | null | undefined,
  field: string,
  required = false
) {
  if (!value) {
    if (required) throw new Error(`Missing required ${field} result reference.`);
    return null;
  }
  const id = names[entity].idByName.get(value);
  if (!id) throw new Error(`Unknown ${entity} result reference in ${field}: ${value}.`);
  return id;
}

function mappedOperationPlan(
  ids: Map<string, string>,
  value: string | null | undefined,
  field: string,
  required = false
) {
  if (!value) {
    if (required) throw new Error(`Missing required ${field} result reference.`);
    return null;
  }
  const id = ids.get(value);
  if (!id) throw new Error(`Unknown operation plan result reference in ${field}: ${value}.`);
  return id;
}

function secondsInterval(value: number | null | undefined) {
  return value === null || value === undefined ? null : `${value} seconds`;
}

function quoteIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

export function resultSummary(result: PlanningEngineResult): PlanningResultSummary {
  return {
    constraintCount: result.constraints.length,
    operationPlanCount: result.operationPlans.length,
    operationPlanMaterialCount: result.operationPlanMaterials.length,
    operationPlanResourceCount: result.operationPlanResources.length,
    problemCount: result.problems.length,
    resourcePlanCount: result.resourcePlans.length
  };
}
