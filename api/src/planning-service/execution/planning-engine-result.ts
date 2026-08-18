import type {
  EngineConstraint,
  EngineOperationPlan,
  EngineOperationPlanMaterial,
  EngineOperationPlanResource,
  EngineProblem,
  EngineResourcePlan,
  PlanningEngineMetadata,
  PlanningEngineReferenceManifest,
  PlanningEngineResult
} from './planning-execution.types';

const OPERATION_PLAN_TYPES = new Set(['STCK', 'MO', 'WO', 'PO', 'DO', 'DLVR']);
const OPERATION_PLAN_STATUSES = new Set(['proposed', 'approved', 'confirmed', 'completed', 'closed']);
const DETAIL_STATUSES = new Set(['proposed', 'confirmed', 'closed']);

export class PlanningEngineResultValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'PlanningEngineResultValidationError';
  }
}

export function validatePlanningEngineResult(value: unknown): PlanningEngineResult {
  const root = record(value, '$');
  exactKeys(root, '$', [
    'constraints',
    'engine',
    'operationPlanMaterials',
    'operationPlanResources',
    'operationPlans',
    'problems',
    'resourcePlans'
  ]);
  const operationPlans = array(root.operationPlans, '$.operationPlans')
    .map((item, index) => operationPlan(item, `$.operationPlans[${index}]`));
  unique(operationPlans.map((item) => item.reference), '$.operationPlans', 'reference');
  const references = new Set(operationPlans.map((item) => item.reference));
  for (let index = 0; index < operationPlans.length; index += 1) {
    const owner = operationPlans[index].owner;
    if (owner && !references.has(owner)) {
      invalid(`$.operationPlans[${index}].owner`, `unknown operation plan reference ${owner}`);
    }
  }

  const operationPlanMaterials = array(
    root.operationPlanMaterials,
    '$.operationPlanMaterials'
  ).map((item, index) => operationPlanMaterial(
    item,
    `$.operationPlanMaterials[${index}]`,
    references
  ));
  const operationPlanResources = array(
    root.operationPlanResources,
    '$.operationPlanResources'
  ).map((item, index) => operationPlanResource(
    item,
    `$.operationPlanResources[${index}]`,
    references
  ));
  const problems = array(root.problems, '$.problems')
    .map((item, index) => problem(item, `$.problems[${index}]`));
  const constraints = array(root.constraints, '$.constraints')
    .map((item, index) => constraint(item, `$.constraints[${index}]`));
  const resourcePlans = array(root.resourcePlans, '$.resourcePlans')
    .map((item, index) => resourcePlan(item, `$.resourcePlans[${index}]`));
  const engine = engineMetadata(root.engine, '$.engine');

  return {
    constraints,
    engine,
    operationPlanMaterials,
    operationPlanResources,
    operationPlans,
    problems,
    resourcePlans
  };
}

function engineMetadata(value: unknown, path: string): PlanningEngineMetadata {
  const metadata = record(value, path);
  const references = referenceManifest(metadata.references, `${path}.references`);
  return { ...metadata, references };
}

function referenceManifest(value: unknown, path: string): PlanningEngineReferenceManifest {
  const manifest = record(value, path);
  exactKeys(manifest, path, ['buffers', 'demands', 'operations']);
  const buffers = array(manifest.buffers, `${path}.buffers`).map((value, index) => {
    const itemPath = `${path}.buffers[${index}]`;
    const row = record(value, itemPath);
    exactKeys(row, itemPath, ['batch', 'item', 'location', 'name']);
    return {
      name: requiredString(row.name, `${itemPath}.name`),
      item: requiredString(row.item, `${itemPath}.item`),
      location: requiredString(row.location, `${itemPath}.location`),
      batch: optionalString(row.batch, `${itemPath}.batch`)
    };
  });
  unique(buffers.map((item) => item.name), `${path}.buffers`, 'name');
  const demands = stringArray(manifest.demands, `${path}.demands`);

  const operations = array(manifest.operations, `${path}.operations`).map((value, index) => {
    const itemPath = `${path}.operations[${index}]`;
    const row = record(value, itemPath);
    exactKeys(row, itemPath, ['buffers', 'hidden', 'name', 'resources', 'suboperations']);
    return {
      name: requiredString(row.name, `${itemPath}.name`),
      hidden: boolean(row.hidden, `${itemPath}.hidden`),
      buffers: stringArray(row.buffers, `${itemPath}.buffers`),
      resources: stringArray(row.resources, `${itemPath}.resources`),
      suboperations: stringArray(row.suboperations, `${itemPath}.suboperations`)
    };
  });
  unique(operations.map((item) => item.name), `${path}.operations`, 'name');
  return { buffers, demands, operations };
}

function operationPlan(value: unknown, path: string): EngineOperationPlan {
  const row = record(value, path);
  exactKeys(row, path, [
    'batch', 'color', 'criticality', 'delay', 'demand', 'destination', 'due', 'end',
    'item', 'location', 'name', 'operation', 'owner', 'plan', 'quantity',
    'quantityCompleted', 'reference', 'remark', 'start', 'status', 'supplier', 'type',
    'origin'
  ]);
  const type = requiredString(row.type, `${path}.type`);
  enumeration(type, OPERATION_PLAN_TYPES, `${path}.type`);
  const status = optionalString(row.status, `${path}.status`);
  if (status) enumeration(status, OPERATION_PLAN_STATUSES, `${path}.status`);
  return {
    reference: requiredString(row.reference, `${path}.reference`),
    type: type as EngineOperationPlan['type'],
    quantity: finite(row.quantity, `${path}.quantity`),
    quantityCompleted: optionalFinite(row.quantityCompleted, `${path}.quantityCompleted`),
    status,
    start: optionalDate(row.start, `${path}.start`),
    end: optionalDate(row.end, `${path}.end`),
    due: optionalDate(row.due, `${path}.due`),
    operation: optionalString(row.operation, `${path}.operation`),
    owner: optionalString(row.owner, `${path}.owner`),
    item: optionalString(row.item, `${path}.item`),
    origin: optionalString(row.origin, `${path}.origin`),
    destination: optionalString(row.destination, `${path}.destination`),
    supplier: optionalString(row.supplier, `${path}.supplier`),
    location: optionalString(row.location, `${path}.location`),
    demand: optionalString(row.demand, `${path}.demand`),
    name: optionalString(row.name, `${path}.name`),
    batch: optionalString(row.batch, `${path}.batch`),
    remark: optionalString(row.remark, `${path}.remark`),
    color: optionalFinite(row.color, `${path}.color`),
    criticality: optionalFinite(row.criticality, `${path}.criticality`),
    delay: optionalFinite(row.delay, `${path}.delay`),
    plan: row.plan === undefined || row.plan === null ? undefined : record(row.plan, `${path}.plan`)
  };
}

function operationPlanMaterial(
  value: unknown,
  path: string,
  references: Set<string>
): EngineOperationPlanMaterial {
  const row = record(value, path);
  exactKeys(row, path, [
    'date', 'item', 'location', 'minimum', 'onhand', 'operationPlanReference',
    'periodOfCover', 'quantity', 'status'
  ]);
  const reference = knownReference(row.operationPlanReference, `${path}.operationPlanReference`, references);
  const status = optionalString(row.status, `${path}.status`);
  if (status) enumeration(status, DETAIL_STATUSES, `${path}.status`);
  return {
    operationPlanReference: reference,
    item: requiredString(row.item, `${path}.item`),
    location: requiredString(row.location, `${path}.location`),
    quantity: finite(row.quantity, `${path}.quantity`),
    date: requiredDate(row.date, `${path}.date`),
    onhand: optionalFinite(row.onhand, `${path}.onhand`),
    minimum: optionalFinite(row.minimum, `${path}.minimum`),
    periodOfCover: optionalFinite(row.periodOfCover, `${path}.periodOfCover`),
    status
  };
}

function operationPlanResource(
  value: unknown,
  path: string,
  references: Set<string>
): EngineOperationPlanResource {
  const row = record(value, path);
  exactKeys(row, path, [
    'operationPlanReference', 'quantity', 'resource', 'setup', 'status'
  ]);
  const status = optionalString(row.status, `${path}.status`);
  if (status) enumeration(status, DETAIL_STATUSES, `${path}.status`);
  return {
    operationPlanReference: knownReference(
      row.operationPlanReference,
      `${path}.operationPlanReference`,
      references
    ),
    resource: requiredString(row.resource, `${path}.resource`),
    quantity: finite(row.quantity, `${path}.quantity`),
    setup: optionalString(row.setup, `${path}.setup`),
    status
  };
}

function problem(
  value: unknown,
  path: string,
  allowedKeys = ['description', 'end', 'entity', 'name', 'owner', 'start']
): EngineProblem {
  const row = record(value, path);
  exactKeys(row, path, allowedKeys);
  return {
    entity: requiredString(row.entity, `${path}.entity`),
    name: requiredString(row.name, `${path}.name`),
    owner: requiredString(row.owner, `${path}.owner`),
    description: requiredString(row.description, `${path}.description`),
    start: requiredDate(row.start, `${path}.start`),
    end: requiredDate(row.end, `${path}.end`)
  };
}

function constraint(value: unknown, path: string): EngineConstraint {
  const row = record(value, path);
  const allowedKeys = [
    'demand', 'description', 'end', 'entity', 'forecast', 'item', 'name', 'owner', 'start'
  ];
  return {
    ...problem(row, path, allowedKeys),
    demand: optionalString(row.demand, `${path}.demand`),
    forecast: optionalString(row.forecast, `${path}.forecast`),
    item: optionalString(row.item, `${path}.item`)
  };
}

function resourcePlan(value: unknown, path: string): EngineResourcePlan {
  const row = record(value, path);
  exactKeys(row, path, [
    'available', 'free', 'load', 'loadConfirmed', 'resource', 'setup', 'start',
    'unavailable'
  ]);
  return {
    resource: requiredString(row.resource, `${path}.resource`),
    start: requiredDate(row.start, `${path}.start`),
    available: optionalFinite(row.available, `${path}.available`),
    unavailable: optionalFinite(row.unavailable, `${path}.unavailable`),
    setup: optionalFinite(row.setup, `${path}.setup`),
    load: optionalFinite(row.load, `${path}.load`),
    free: optionalFinite(row.free, `${path}.free`),
    loadConfirmed: optionalFinite(row.loadConfirmed, `${path}.loadConfirmed`)
  };
}

function knownReference(value: unknown, path: string, references: Set<string>) {
  const reference = requiredString(value, path);
  if (!references.has(reference)) invalid(path, `unknown operation plan reference ${reference}`);
  return reference;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected an object');
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, 'expected an array');
  return value;
}

function exactKeys(row: Record<string, unknown>, path: string, allowed: string[]) {
  const expected = new Set(allowed);
  for (const key of Object.keys(row)) {
    if (!expected.has(key)) invalid(`${path}.${key}`, 'unknown field');
  }
}

function requiredString(value: unknown, path: string) {
  if (typeof value !== 'string' || !value.trim()) invalid(path, 'expected a non-empty string');
  return value.trim();
}

function optionalString(value: unknown, path: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') invalid(path, 'expected a string or null');
  return value.trim() || null;
}

function finite(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path, 'expected a finite number');
  return value;
}

function optionalFinite(value: unknown, path: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return finite(value, path);
}

function boolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') invalid(path, 'expected a boolean');
  return value;
}

function stringArray(value: unknown, path: string) {
  const values = array(value, path).map((item, index) => requiredString(item, `${path}[${index}]`));
  unique(values, path, 'value');
  return values;
}

function requiredDate(value: unknown, path: string) {
  const text = requiredString(value, path);
  if (!isOffsetDateTime(text)) {
    invalid(path, 'expected an RFC3339 date-time with an explicit UTC offset');
  }
  return text;
}

function optionalDate(value: unknown, path: string): string | null | undefined {
  const text = optionalString(value, path);
  if (text && !isOffsetDateTime(text)) {
    invalid(path, 'expected an RFC3339 date-time with an explicit UTC offset or null');
  }
  return text;
}

function isOffsetDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function enumeration(value: string, allowed: Set<string>, path: string) {
  if (!allowed.has(value)) invalid(path, `unsupported value ${value}`);
}

function unique(values: string[], path: string, field: string) {
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    if (seen.has(values[index])) invalid(`${path}[${index}].${field}`, `duplicate value ${values[index]}`);
    seen.add(values[index]);
  }
}

function invalid(path: string, message: string): never {
  throw new PlanningEngineResultValidationError(path, message);
}
