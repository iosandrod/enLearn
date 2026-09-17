import {
  type PlanningDataSnapshot,
  type PlanningInputTable,
  type PlanningPreflightIssue,
  type PlanningRow
} from './planning-execution.types';

export type PlanningAcquisitionMethod =
  | 'inventory'
  | 'manufacturing'
  | 'purchasing'
  | 'distribution';

export type PlanningMaterialReadinessIssue = PlanningPreflightIssue & {
  acquisitionMethod?: PlanningAcquisitionMethod;
  itemId: string;
  itemName?: string;
  locationId?: string;
};

export type PlanningMaterialReadiness = {
  acquisitionMethods: PlanningAcquisitionMethod[];
  configuredAcquisitionMethods: PlanningAcquisitionMethod[];
  demandIds: string[];
  demandLocationIds: string[];
  hasManufacturingRoute: boolean;
  hasProductionOperation: boolean;
  hasValidOutputFlow: boolean;
  itemCode?: string;
  itemId: string;
  itemName?: string;
  issues: PlanningMaterialReadinessIssue[];
  ready: boolean;
};

export type PlanningMaterialReadinessReport = {
  checkedAt: string;
  errorCount: number;
  issueCount: number;
  issues: PlanningMaterialReadinessIssue[];
  itemCount: number;
  itemIds: string[];
  materials: PlanningMaterialReadiness[];
  ready: boolean;
  snapshotHash: string;
  warningCount: number;
};

const ACTIVE_DEMAND_STATUSES = new Set(['open', 'quote']);
const COMPOSITE_OPERATION_TYPES = new Set(['routing', 'alternate', 'split']);
const METHOD_ORDER: PlanningAcquisitionMethod[] = [
  'inventory',
  'manufacturing',
  'purchasing',
  'distribution'
];

export function validatePlanningMaterialReadiness(
  snapshot: PlanningDataSnapshot,
  requestedItemIds: readonly string[] = [],
  checkedAt = new Date()
): PlanningMaterialReadinessReport {
  const activeDemands = snapshot.rows.planning_demand.filter(isActiveDemand);
  const itemIds = uniqueStrings(requestedItemIds.length
    ? requestedItemIds
    : activeDemands.map((row) => optionalString(row.item_id)));
  const items = new Map(snapshot.rows.planning_item.map((row) => [row.id, row]));
  const materials = itemIds.map((itemId) => validateMaterial(
    snapshot,
    itemId,
    items.get(itemId),
    activeDemands.filter((row) => optionalString(row.item_id) === itemId)
  ));
  const issues = materials.flatMap((material) => material.issues);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  return {
    checkedAt: checkedAt.toISOString(),
    errorCount,
    issueCount: issues.length,
    issues,
    itemCount: materials.length,
    itemIds,
    materials,
    ready: materials.length > 0 && materials.every((material) => material.ready),
    snapshotHash: snapshot.hash,
    warningCount
  };
}

function validateMaterial(
  snapshot: PlanningDataSnapshot,
  itemId: string,
  item: PlanningRow | undefined,
  demands: PlanningRow[]
): PlanningMaterialReadiness {
  const itemCode = optionalString(item?.name);
  const itemName = optionalString(item?.display_name) ?? itemCode;
  const issues: PlanningMaterialReadinessIssue[] = [];
  const add = (
    issue: Omit<PlanningMaterialReadinessIssue, 'itemId' | 'itemName'>
  ) => issues.push({ ...issue, itemId, ...(itemName ? { itemName } : {}) });

  if (!item) {
    add({
      code: 'MATERIAL_NOT_FOUND',
      message: `物料 ${itemId} 不存在或不属于当前账套。`,
      path: 'item_id',
      recordId: itemId,
      severity: 'error',
      table: 'planning_item'
    });
    return materialResult(itemId, undefined, undefined, demands, [], [], issues, false, false, false);
  }

  const demandLocationIds = uniqueStrings(demands.map((row) => optionalString(row.location_id)));
  if (!demands.length) {
    add({
      code: 'MATERIAL_HAS_NO_ACTIVE_DEMAND',
      message: `${itemName ?? itemId}: 当前没有数量大于 0 的开放或报价需求。`,
      path: 'status,quantity',
      recordId: itemId,
      severity: 'warning',
      table: 'planning_item'
    });
  }

  const context = buildContext(snapshot);
  const configuredMethods = new Set<PlanningAcquisitionMethod>();
  const usableMethods = new Set<PlanningAcquisitionMethod>();
  let hasManufacturingRoute = false;
  let hasProductionOperation = false;
  let hasValidOutputFlow = false;

  for (const locationId of demandLocationIds) {
    const result = inspectSupplyAtLocation(context, itemId, locationId, new Set());
    for (const method of result.configuredMethods) configuredMethods.add(method);
    for (const method of result.usableMethods) usableMethods.add(method);
    hasManufacturingRoute ||= result.hasManufacturingRoute;
    hasProductionOperation ||= result.hasProductionOperation;
    hasValidOutputFlow ||= result.hasValidOutputFlow;
    for (const issue of result.issues) add(issue);
    if (!result.usableMethods.size) {
      const demand = demands.find((row) => optionalString(row.location_id) === locationId);
      add({
        code: 'MATERIAL_NO_USABLE_ACQUISITION_METHOD',
        locationId,
        message: `${itemName ?? itemId}: 需求地点 ${locationLabel(context, locationId)} 没有完整可用的库存、制造、采购或配送获取路径。`,
        path: 'item_id,location_id',
        recordId: demand?.id ?? itemId,
        severity: 'error',
        table: demand ? 'planning_demand' : 'planning_item'
      });
    }
  }

  const uniqueIssues = deduplicateIssues(issues);
  return materialResult(
    itemId,
    itemCode,
    itemName,
    demands,
    sortMethods(usableMethods),
    sortMethods(configuredMethods),
    uniqueIssues,
    hasManufacturingRoute,
    hasProductionOperation,
    hasValidOutputFlow
  );
}

type ValidationContext = ReturnType<typeof buildContext>;
type LocationInspection = {
  configuredMethods: Set<PlanningAcquisitionMethod>;
  hasManufacturingRoute: boolean;
  hasProductionOperation: boolean;
  hasValidOutputFlow: boolean;
  issues: Array<Omit<PlanningMaterialReadinessIssue, 'itemId' | 'itemName'>>;
  usableMethods: Set<PlanningAcquisitionMethod>;
};

function buildContext(snapshot: PlanningDataSnapshot) {
  const current = planningCurrentDate(snapshot);
  return {
    buffers: snapshot.rows.planning_buffer,
    current,
    distributions: snapshot.rows.planning_itemdistribution,
    flows: snapshot.rows.planning_operationmaterial,
    items: new Map(snapshot.rows.planning_item.map((row) => [row.id, row])),
    locations: new Map(snapshot.rows.planning_location.map((row) => [row.id, row])),
    operationResources: snapshot.rows.planning_operationresource,
    operations: snapshot.rows.planning_operation,
    resources: new Map(snapshot.rows.planning_resource.map((row) => [row.id, row])),
    suboperations: snapshot.rows.planning_suboperation,
    suppliers: new Map(snapshot.rows.planning_supplier.map((row) => [row.id, row])),
    supplyRules: snapshot.rows.planning_itemsupplier
  };
}

function inspectSupplyAtLocation(
  context: ValidationContext,
  itemId: string,
  locationId: string,
  visiting: Set<string>
): LocationInspection {
  const key = `${itemId}\u0000${locationId}`;
  if (visiting.has(key)) return emptyInspection();
  const nextVisiting = new Set(visiting);
  nextVisiting.add(key);
  const result = emptyInspection();

  const matchingBuffers = context.buffers.filter((row) =>
    optionalString(row.item_id) === itemId && optionalString(row.location_id) === locationId
  );
  if (matchingBuffers.length) result.configuredMethods.add('inventory');
  if (matchingBuffers.some((row) =>
    (optionalFinite(row.onhand) ?? 0) > 0 || optionalString(row.type) === 'infinite'
  )) result.usableMethods.add('inventory');

  const purchaseRules = context.supplyRules.filter((row) =>
    optionalString(row.item_id) === itemId &&
    (!optionalString(row.location_id) || optionalString(row.location_id) === locationId) &&
    isEnabledAndEffective(row, context.current)
  );
  if (purchaseRules.length) result.configuredMethods.add('purchasing');
  for (const rule of purchaseRules) {
    const supplierId = optionalString(rule.supplier_id);
    const resourceId = optionalString(rule.resource_id);
    if (!supplierId || !context.suppliers.has(supplierId)) {
      result.issues.push(issueForRule(
        'PURCHASE_SUPPLIER_NOT_FOUND',
        '采购规则没有关联有效供应商。',
        'planning_itemsupplier',
        rule,
        locationId,
        'supplier_id',
        'purchasing'
      ));
      continue;
    }
    if (resourceId && !context.resources.has(resourceId)) {
      result.issues.push(issueForRule(
        'PURCHASE_RESOURCE_NOT_FOUND',
        '采购规则关联的资源不存在。',
        'planning_itemsupplier',
        rule,
        locationId,
        'resource_id',
        'purchasing'
      ));
      continue;
    }
    result.usableMethods.add('purchasing');
  }

  const manufacturing = inspectManufacturing(context, itemId, locationId);
  mergeInspection(result, manufacturing);

  const distributions = context.distributions.filter((row) =>
    optionalString(row.item_id) === itemId &&
    optionalString(row.location_id) === locationId &&
    isEnabledAndEffective(row, context.current)
  );
  if (distributions.length) result.configuredMethods.add('distribution');
  for (const rule of distributions) {
    const originId = optionalString(rule.origin_id);
    const resourceId = optionalString(rule.resource_id);
    if (!originId || !context.locations.has(originId)) {
      result.issues.push(issueForRule(
        'DISTRIBUTION_ORIGIN_NOT_FOUND',
        '配送规则没有关联有效来源地点。',
        'planning_itemdistribution',
        rule,
        locationId,
        'origin_id',
        'distribution'
      ));
      continue;
    }
    if (resourceId && !context.resources.has(resourceId)) {
      result.issues.push(issueForRule(
        'DISTRIBUTION_RESOURCE_NOT_FOUND',
        '配送规则关联的资源不存在。',
        'planning_itemdistribution',
        rule,
        locationId,
        'resource_id',
        'distribution'
      ));
      continue;
    }
    const origin = inspectSupplyAtLocation(context, itemId, originId, nextVisiting);
    for (const method of origin.configuredMethods) result.configuredMethods.add(method);
    result.hasManufacturingRoute ||= origin.hasManufacturingRoute;
    result.hasProductionOperation ||= origin.hasProductionOperation;
    result.hasValidOutputFlow ||= origin.hasValidOutputFlow;
    if (origin.usableMethods.size) {
      result.usableMethods.add('distribution');
    } else {
      result.issues.push(issueForRule(
        'DISTRIBUTION_ORIGIN_HAS_NO_SUPPLY',
        `配送来源地点 ${locationLabel(context, originId)} 没有可用供给路径。`,
        'planning_itemdistribution',
        rule,
        locationId,
        'origin_id',
        'distribution'
      ));
    }
  }

  return result;
}

function inspectManufacturing(
  context: ValidationContext,
  itemId: string,
  locationId: string
): LocationInspection {
  const result = emptyInspection();
  const effectiveFlows = context.flows.filter((row) => isEffective(row, context.current));
  const operations = new Map(context.operations.map((row) => [row.id, row]));
  const candidates = context.operations.filter((operation) => {
    if (!isEnabledAndEffective(operation, context.current)) return false;
    const operationId = operation.id;
    const operationLocation = optionalString(operation.location_id);
    const outputFlows = effectiveFlows.filter((flow) =>
      optionalString(flow.operation_id) === operationId &&
      optionalString(flow.item_id) === itemId &&
      (optionalFinite(flow.quantity) ?? 0) > 0
    );
    const producesItem = optionalString(operation.item_id) === itemId || outputFlows.length > 0;
    const producesAtLocation = outputFlows.some((flow) =>
      (optionalString(flow.location_id) ?? operationLocation) === locationId
    );
    return producesItem && (producesAtLocation || operationLocation === locationId);
  });
  if (!candidates.length) return result;

  result.configuredMethods.add('manufacturing');
  result.hasProductionOperation = true;
  for (const operation of candidates) {
    const operationType = optionalString(operation.type) ?? 'fixed_time';
    const childIds = operationChildIds(context, operation.id);
    const activeChildIds = childIds.filter((id) => {
      const child = operations.get(id);
      return child && isEnabledAndEffective(child, context.current);
    });
    if (operationType === 'routing') result.hasManufacturingRoute = true;
    let candidateValid = true;

    if (COMPOSITE_OPERATION_TYPES.has(operationType) && !activeChildIds.length) {
      result.issues.push(issueForRule(
        'MANUFACTURING_ROUTE_HAS_NO_OPERATION',
        `制造路线 ${rowLabel(operation)} 没有有效生产工序。`,
        'planning_operation',
        operation,
        locationId,
        'owner_id,type',
        'manufacturing'
      ));
      candidateValid = false;
    }

    const participatingIds = new Set([operation.id, ...activeChildIds]);
    const outputFlows = effectiveFlows.filter((flow) =>
      participatingIds.has(optionalString(flow.operation_id) ?? '') &&
      optionalString(flow.item_id) === itemId &&
      (optionalFinite(flow.quantity) ?? 0) > 0 &&
      (optionalString(flow.location_id) ?? optionalString(operations.get(optionalString(flow.operation_id) ?? '')?.location_id)) === locationId
    );
    if (!outputFlows.length) {
      result.issues.push(issueForRule(
        'MANUFACTURING_OUTPUT_MISSING',
        `制造工艺 ${rowLabel(operation)} 没有当前地点有效的正数量产出流。`,
        'planning_operation',
        operation,
        locationId,
        'item_id',
        'manufacturing'
      ));
      candidateValid = false;
    } else {
      result.hasValidOutputFlow = true;
    }

    const leafOperationIds = activeChildIds.length ? activeChildIds : [operation.id];
    for (const operationId of leafOperationIds) {
      const process = operations.get(operationId);
      if (!process) continue;
      const processLocationId = optionalString(process.location_id);
      if (!processLocationId || !context.locations.has(processLocationId)) {
        result.issues.push(issueForRule(
          'MANUFACTURING_LOCATION_NOT_FOUND',
          `生产工序 ${rowLabel(process)} 没有关联有效地点。`,
          'planning_operation',
          process,
          locationId,
          'location_id',
          'manufacturing'
        ));
        candidateValid = false;
      }

      const processResources = context.operationResources.filter((row) =>
        optionalString(row.operation_id) === operationId &&
        isEnabledAndEffective(row, context.current)
      );
      if (!processResources.length) {
        result.issues.push({
          ...issueForRule(
            'MANUFACTURING_RESOURCE_NOT_CONFIGURED',
            `生产工序 ${rowLabel(process)} 未配置资源，将按无限产能参与排产。`,
            'planning_operation',
            process,
            locationId,
            'resource_id',
            'manufacturing'
          ),
          severity: 'warning'
        });
      }
      for (const load of processResources) {
        const resourceId = optionalString(load.resource_id);
        if (!resourceId || !context.resources.has(resourceId)) {
          result.issues.push(issueForRule(
            'MANUFACTURING_RESOURCE_NOT_FOUND',
            `生产工序 ${rowLabel(process)} 关联的资源不存在。`,
            'planning_operationresource',
            load,
            locationId,
            'resource_id',
            'manufacturing'
          ));
          candidateValid = false;
        }
      }

      for (const flow of effectiveFlows.filter((row) =>
        optionalString(row.operation_id) === operationId &&
        (optionalFinite(row.quantity) ?? 0) < 0
      )) {
        const inputItemId = optionalString(flow.item_id);
        const inputLocationId = optionalString(flow.location_id) ?? processLocationId;
        if (!inputItemId || !context.items.has(inputItemId)) {
          result.issues.push(issueForRule(
            'MANUFACTURING_INPUT_ITEM_NOT_FOUND',
            `生产工序 ${rowLabel(process)} 的投入物料不存在。`,
            'planning_operationmaterial',
            flow,
            locationId,
            'item_id',
            'manufacturing'
          ));
          candidateValid = false;
          continue;
        }
        if (!inputLocationId || !context.locations.has(inputLocationId)) {
          result.issues.push(issueForRule(
            'MANUFACTURING_INPUT_LOCATION_NOT_FOUND',
            `生产工序 ${rowLabel(process)} 的投入物料没有有效地点。`,
            'planning_operationmaterial',
            flow,
            locationId,
            'location_id',
            'manufacturing'
          ));
          candidateValid = false;
          continue;
        }
        const hasBuffer = context.buffers.some((buffer) =>
          optionalString(buffer.item_id) === inputItemId &&
          optionalString(buffer.location_id) === inputLocationId
        );
        if (!hasBuffer) {
          result.issues.push(issueForRule(
            'MANUFACTURING_INPUT_BUFFER_MISSING',
            `生产工序 ${rowLabel(process)} 的投入物料在工序地点没有库存缓冲。`,
            'planning_operationmaterial',
            flow,
            locationId,
            'item_id,location_id',
            'manufacturing'
          ));
          candidateValid = false;
        }
      }
    }

    if (candidateValid) result.usableMethods.add('manufacturing');
  }
  return result;
}

function operationChildIds(context: ValidationContext, operationId: string) {
  return uniqueStrings([
    ...context.operations
      .filter((row) => optionalString(row.owner_id) === operationId)
      .map((row) => row.id),
    ...context.suboperations
      .filter((row) => optionalString(row.operation_id) === operationId)
      .map((row) => optionalString(row.suboperation_id))
  ]);
}

function emptyInspection(): LocationInspection {
  return {
    configuredMethods: new Set(),
    hasManufacturingRoute: false,
    hasProductionOperation: false,
    hasValidOutputFlow: false,
    issues: [],
    usableMethods: new Set()
  };
}

function mergeInspection(target: LocationInspection, source: LocationInspection) {
  for (const method of source.configuredMethods) target.configuredMethods.add(method);
  for (const method of source.usableMethods) target.usableMethods.add(method);
  target.hasManufacturingRoute ||= source.hasManufacturingRoute;
  target.hasProductionOperation ||= source.hasProductionOperation;
  target.hasValidOutputFlow ||= source.hasValidOutputFlow;
  target.issues.push(...source.issues);
}

function issueForRule(
  code: string,
  message: string,
  table: PlanningInputTable,
  row: PlanningRow,
  locationId: string,
  path: string,
  acquisitionMethod: PlanningAcquisitionMethod
): Omit<PlanningMaterialReadinessIssue, 'itemId' | 'itemName'> {
  return {
    acquisitionMethod,
    code,
    locationId,
    message,
    path,
    recordId: row.id,
    severity: 'error',
    table
  };
}

function materialResult(
  itemId: string,
  itemCode: string | undefined,
  itemName: string | undefined,
  demands: PlanningRow[],
  acquisitionMethods: PlanningAcquisitionMethod[],
  configuredAcquisitionMethods: PlanningAcquisitionMethod[],
  issues: PlanningMaterialReadinessIssue[],
  hasManufacturingRoute: boolean,
  hasProductionOperation: boolean,
  hasValidOutputFlow: boolean
): PlanningMaterialReadiness {
  return {
    acquisitionMethods,
    configuredAcquisitionMethods,
    demandIds: demands.map((row) => row.id),
    demandLocationIds: uniqueStrings(demands.map((row) => optionalString(row.location_id))),
    hasManufacturingRoute,
    hasProductionOperation,
    hasValidOutputFlow,
    ...(itemCode ? { itemCode } : {}),
    itemId,
    ...(itemName ? { itemName } : {}),
    issues,
    ready: issues.every((issue) => issue.severity !== 'error') &&
      (demands.length === 0 || acquisitionMethods.length > 0)
  };
}

function isActiveDemand(row: PlanningRow) {
  const status = optionalString(row.status) ?? 'open';
  return ACTIVE_DEMAND_STATUSES.has(status) && (optionalFinite(row.quantity) ?? 0) > 0;
}

function isEnabledAndEffective(row: PlanningRow, current: number) {
  return optionalFinite(row.priority) !== 0 && isEffective(row, current);
}

function isEffective(row: PlanningRow, current: number) {
  const start = dateValue(row.effective_start);
  const end = dateValue(row.effective_end);
  return (start === undefined || start <= current) && (end === undefined || end >= current);
}

function planningCurrentDate(snapshot: PlanningDataSnapshot) {
  const parameter = snapshot.rows.planning_parameter.find((row) => row.name === 'currentdate');
  const raw = optionalString(parameter?.value);
  if (!raw || raw.toLowerCase() === 'now') return Date.parse(snapshot.loadedAt);
  return dateValue(raw) ?? Date.parse(snapshot.loadedAt);
}

function dateValue(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const result = Date.parse(String(value));
  return Number.isFinite(result) ? result : undefined;
}

function optionalFinite(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: readonly unknown[]) {
  return [...new Set(values
    .map(optionalString)
    .filter((value): value is string => Boolean(value)))];
}

function sortMethods(methods: Set<PlanningAcquisitionMethod>) {
  return METHOD_ORDER.filter((method) => methods.has(method));
}

function rowLabel(row: PlanningRow) {
  return optionalString(row.name) ?? row.id;
}

function locationLabel(context: ValidationContext, locationId: string) {
  return optionalString(context.locations.get(locationId)?.name) ?? locationId;
}

function deduplicateIssues(issues: PlanningMaterialReadinessIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [
      issue.itemId,
      issue.locationId ?? '',
      issue.code,
      issue.table ?? '',
      issue.recordId ?? '',
      issue.path ?? ''
    ].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
