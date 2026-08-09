import type { Pool, PoolClient } from 'pg';

export const PLANNING_INPUT_TABLES = [
  'planning_parameter',
  'planning_calendar',
  'planning_calendarbucket',
  'planning_location',
  'planning_customer',
  'planning_item',
  'planning_supplier',
  'planning_itemsupplier',
  'planning_itemdistribution',
  'planning_buffer',
  'planning_setupmatrix',
  'planning_setuprule',
  'planning_resource',
  'planning_skill',
  'planning_resourceskill',
  'planning_operation',
  'planning_operationmaterial',
  'planning_operationresource',
  'planning_suboperation',
  'planning_operation_dependency',
  'planning_demand',
  'planning_operationplan',
  'planning_operationplanresource',
  'planning_operationplanmaterial',
  'planning_bucket',
  'planning_bucketdetail'
] as const;

export type PlanningInputTable = typeof PLANNING_INPUT_TABLES[number];
export type PlanningRow = Record<string, unknown> & {
  account_id: string;
  id: string;
};

export type PlanningDataSnapshot = {
  accountId: string;
  counts: Record<PlanningInputTable, number>;
  hash: string;
  loadedAt: string;
  rows: Record<PlanningInputTable, PlanningRow[]>;
};

export type PlanningIssueSeverity = 'error' | 'warning';

export type PlanningPreflightIssue = {
  code: string;
  message: string;
  path?: string;
  recordId?: string;
  severity: PlanningIssueSeverity;
  table?: PlanningInputTable;
};

export type PlanningPreflightReport = {
  checkedAt: string;
  errors: PlanningPreflightIssue[];
  issueCount: number;
  ok: boolean;
  snapshotHash: string;
  warnings: PlanningPreflightIssue[];
};

export type PlanningSolverParameters = {
  administrativeLeadtime: number;
  algorithm: string;
  autoFence: number;
  constraints: number;
  currentDate: string;
  individualPoolResources: boolean;
  iterationMax: number;
  lazyDelay: number;
  logLevel: number;
  minimumDelay: number;
  moveApprovedEarly: number;
  planType: number;
  resourceIterationMax: number;
  rotateResources: boolean;
};

export type FreppleReference = { name: string };
export type FreppleObject = Record<string, unknown>;

export type FreppleInputModel = {
  buffers: FreppleObject[];
  calendars: FreppleObject[];
  current: string;
  customers: FreppleObject[];
  demands: FreppleObject[];
  itemdistributions: FreppleObject[];
  items: FreppleObject[];
  itemsuppliers: FreppleObject[];
  locations: FreppleObject[];
  operationplans: FreppleObject[];
  operations: FreppleObject[];
  resources: FreppleObject[];
  resourceskills: FreppleObject[];
  setupmatrices: FreppleObject[];
  skills: FreppleObject[];
  suppliers: FreppleObject[];
  individualPoolResources?: boolean;
  moveApprovedEarly?: number;
  suppressFlowplanCreation?: boolean;
};

export type PlanningEngineRequest = {
  bucketDates: string[];
  bucketizedResources: Array<{
    calendar: 'day' | 'week' | 'month';
    resource: string;
  }>;
  model: FreppleInputModel;
  parameters: PlanningSolverParameters;
};

export const PLANNING_NAME_ENTITIES = [
  'customer',
  'demand',
  'item',
  'location',
  'operation',
  'resource',
  'supplier'
] as const;

export type PlanningNameEntity = typeof PLANNING_NAME_ENTITIES[number];

export type PlanningNameIndex = Record<PlanningNameEntity, {
  idByName: Map<string, string>;
  nameById: Map<string, string>;
}>;

export type PlanningReferenceIndex = {
  buffers: Set<string>;
  demands: Set<string>;
  operations: Set<string>;
};

export type PlanningEngineInput = {
  names: PlanningNameIndex;
  references: PlanningReferenceIndex;
  request: PlanningEngineRequest;
};

export type EngineOperationPlan = {
  batch?: string | null;
  color?: number | null;
  criticality?: number | null;
  delay?: number | null;
  demand?: string | null;
  destination?: string | null;
  due?: string | null;
  end?: string | null;
  item?: string | null;
  location?: string | null;
  name?: string | null;
  operation?: string | null;
  origin?: string | null;
  owner?: string | null;
  plan?: Record<string, unknown>;
  quantity: number;
  quantityCompleted?: number | null;
  reference: string;
  remark?: string | null;
  start?: string | null;
  status?: string | null;
  supplier?: string | null;
  type: 'STCK' | 'MO' | 'WO' | 'PO' | 'DO' | 'DLVR';
};

export type EngineOperationPlanMaterial = {
  date: string;
  item: string;
  location: string;
  minimum?: number | null;
  onhand?: number | null;
  operationPlanReference: string;
  periodOfCover?: number | null;
  quantity: number;
  status?: string | null;
};

export type EngineOperationPlanResource = {
  operationPlanReference: string;
  quantity: number;
  resource: string;
  setup?: string | null;
  status?: string | null;
};

export type EngineProblem = {
  description: string;
  end: string;
  entity: string;
  name: string;
  owner: string;
  start: string;
};

export type EngineConstraint = EngineProblem & {
  demand?: string | null;
  forecast?: string | null;
  item?: string | null;
};

export type EngineResourcePlan = {
  available?: number | null;
  free?: number | null;
  load?: number | null;
  loadConfirmed?: number | null;
  resource: string;
  setup?: number | null;
  start: string;
  unavailable?: number | null;
};

export type EngineBufferReference = {
  batch?: string | null;
  item: string;
  location: string;
  name: string;
};

export type EngineOperationReference = {
  buffers: string[];
  hidden: boolean;
  name: string;
  resources: string[];
  suboperations: string[];
};

export type PlanningEngineReferenceManifest = {
  buffers: EngineBufferReference[];
  demands: string[];
  operations: EngineOperationReference[];
};

export type PlanningEngineMetadata = Record<string, unknown> & {
  references: PlanningEngineReferenceManifest;
};

export type PlanningEngineResult = {
  constraints: EngineConstraint[];
  engine: PlanningEngineMetadata;
  operationPlanMaterials: EngineOperationPlanMaterial[];
  operationPlanResources: EngineOperationPlanResource[];
  operationPlans: EngineOperationPlan[];
  problems: EngineProblem[];
  resourcePlans: EngineResourcePlan[];
};

export type PlanningResultSummary = {
  constraintCount: number;
  operationPlanCount: number;
  operationPlanMaterialCount: number;
  operationPlanResourceCount: number;
  problemCount: number;
  resourcePlanCount: number;
};

export type PlanningProgressUpdate = {
  logfile?: string | null;
  message: string;
  processId?: number | null;
  progress: number;
};

export type PlanningRunRequest = {
  accountId: string;
  onProgress?: (update: PlanningProgressUpdate) => Promise<void> | void;
  overrides?: Record<string, unknown>;
  planVersionId?: string;
  runId: string;
  scenarioId: string;
  signal?: AbortSignal;
};

export type PlanningRunOutput = PlanningResultSummary & {
  inputSnapshot: {
    counts: Record<PlanningInputTable, number>;
    hash: string;
    loadedAt: string;
  };
  parameters: PlanningSolverParameters;
  preflight: PlanningPreflightReport;
};

export interface PlanningEngine {
  readonly mode: 'http' | 'process';
  solve(
    request: PlanningEngineRequest,
    options?: {
      onLog?: (line: string) => void;
      onProcess?: (processId: number) => Promise<void> | void;
      signal?: AbortSignal;
    }
  ): Promise<PlanningEngineResult>;
}

export type PlanningEngineCapabilities = {
  available: boolean;
  bridgePath?: string;
  endpoint?: string;
  executable?: string;
  mode: 'http' | 'process';
  reason?: string;
};

export type PlanningDatabase = Pool | PoolClient;

export class PlanningPreflightError extends Error {
  constructor(readonly report: PlanningPreflightReport) {
    super(`Planning preflight failed with ${report.errors.length} error(s).`);
    this.name = 'PlanningPreflightError';
  }
}

export class PlanningCanceledError extends Error {
  constructor(message = 'Planning run was canceled.') {
    super(message);
    this.name = 'PlanningCanceledError';
  }
}

export class PlanningResultValidationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PlanningResultValidationError';
  }
}

export function isPlanningCanceled(error: unknown) {
  return error instanceof PlanningCanceledError ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'PlanningCanceledError'));
}
