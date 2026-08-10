import {
  PLANNING_MODEL_BY_KEY,
  type PlanningFieldDefinition
} from '../planning.models';
import {
  PLANNING_INPUT_TABLES,
  type PlanningDataSnapshot,
  type PlanningInputTable,
  type PlanningPreflightIssue,
  type PlanningPreflightReport,
  type PlanningRow
} from './planning-execution.types';

const ENGINE_DATE_LIMIT = Date.parse('2030-12-31T00:00:00.000Z');
const LOCKED_OPERATIONPLAN_STATUSES = new Set(['approved', 'confirmed', 'completed']);
const INPUT_OPERATIONPLAN_TYPES = new Set(['MO', 'WO', 'PO', 'DO', 'DLVR']);
const ACTIVE_DEMAND_STATUSES = new Set(['open', 'quote']);
const CATEGORY_TARGET_BY_TABLE: Partial<Record<PlanningInputTable, string>> = {
  planning_item: 'item',
  planning_customer: 'customer',
  planning_supplier: 'supplier'
};

const COMPOSITE_KEYS: Partial<Record<PlanningInputTable, string[][]>> = {
  planning_calendarbucket: [['calendar_id', 'startdate', 'enddate', 'priority']],
  planning_itemsupplier: [['item_id', 'location_id', 'supplier_id', 'effective_start']],
  planning_itemdistribution: [['item_id', 'location_id', 'origin_id', 'effective_start']],
  planning_buffer: [['item_id', 'location_id', 'batch']],
  planning_resourceskill: [['resource_id', 'skill_id']],
  planning_setuprule: [['setupmatrix_id', 'priority']],
  planning_operationmaterial: [['operation_id', 'item_id', 'effective_start']],
  planning_operationresource: [['operation_id', 'resource_id', 'effective_start']],
  planning_suboperation: [['operation_id', 'suboperation_id', 'effective_start']],
  planning_operation_dependency: [['operation_id', 'blockedby_id']],
  planning_operationplanresource: [['resource_id', 'operationplan_id']],
  planning_bucketdetail: [['bucket_id', 'startdate']]
};

const DATE_RANGES: Partial<Record<PlanningInputTable, Array<[string, string]>>> = {
  planning_calendarbucket: [['startdate', 'enddate']],
  planning_itemsupplier: [['effective_start', 'effective_end']],
  planning_itemdistribution: [['effective_start', 'effective_end']],
  planning_resourceskill: [['effective_start', 'effective_end']],
  planning_operation: [['effective_start', 'effective_end']],
  planning_operationmaterial: [['effective_start', 'effective_end']],
  planning_operationresource: [['effective_start', 'effective_end']],
  planning_suboperation: [['effective_start', 'effective_end']],
  planning_operationplan: [['startdate', 'enddate']],
  planning_bucketdetail: [['startdate', 'enddate']]
};

const LOT_SIZE_TABLES = new Set<PlanningInputTable>([
  'planning_itemsupplier',
  'planning_itemdistribution',
  'planning_operation'
]);

export class PlanningPreflightValidator {
  validate(snapshot: PlanningDataSnapshot, checkedAt = new Date()): PlanningPreflightReport {
    const issues: PlanningPreflightIssue[] = [];
    const add = (issue: PlanningPreflightIssue) => issues.push(issue);

    validateRequiredFields(snapshot, add);
    validateBusinessKeys(snapshot, add);
    validateRelations(snapshot, add);
    validateMasterCategories(snapshot, add);
    validateFieldValues(snapshot, add);
    validateDateRanges(snapshot, add);
    validateLotSizes(snapshot, add);
    validateCycles(snapshot, add);
    validateEngineCompatibility(snapshot, add);
    validateBufferNames(snapshot, add);
    validateSuboperationDefinitions(snapshot, add);
    validateManufacturingOutputs(snapshot, add);
    validateDemandGroups(snapshot, add);
    validateDemands(snapshot, add);
    validateOperationPlans(snapshot, add);
    validateSupplyPaths(snapshot, add);
    validateDateLimit(snapshot, add);

    add({
      code: 'SCENARIO_BASELINE_INPUT',
      message: '场景当前仅作为运行和版本元数据；求解输入读取该账套的基线主数据。',
      severity: 'warning'
    });

    issues.sort(compareIssues);
    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    return {
      checkedAt: checkedAt.toISOString(),
      errors,
      issueCount: issues.length,
      ok: errors.length === 0,
      snapshotHash: snapshot.hash,
      warnings
    };
  }
}

export function preflightPlanningData(
  snapshot: PlanningDataSnapshot,
  checkedAt = new Date()
) {
  return new PlanningPreflightValidator().validate(snapshot, checkedAt);
}

type AddIssue = (issue: PlanningPreflightIssue) => void;

function validateRequiredFields(snapshot: PlanningDataSnapshot, add: AddIssue) {
  for (const table of PLANNING_INPUT_TABLES) {
    const model = PLANNING_MODEL_BY_KEY.get(table);
    if (!model) continue;
    const required = model.fields.filter((field) => field.required);
    for (const row of snapshot.rows[table]) {
      for (const field of required) {
        if (isMissing(row[field.name])) {
          add(rowIssue(
            'REQUIRED_FIELD_MISSING',
            `必填字段 ${field.name} 不能为空。`,
            table,
            row,
            field.name
          ));
        }
      }
    }
  }
}

function validateBusinessKeys(snapshot: PlanningDataSnapshot, add: AddIssue) {
  for (const table of PLANNING_INPUT_TABLES) {
    const model = PLANNING_MODEL_BY_KEY.get(table);
    const keySets = [
      ...(model?.businessKey && model.businessKeyUnique !== false ? [[model.businessKey]] : []),
      ...(table === 'planning_category' ? [['target_type', 'code']] : []),
      ...(COMPOSITE_KEYS[table] ?? [])
    ];
    for (const fields of keySets) {
      const seen = new Map<string, PlanningRow>();
      for (const row of snapshot.rows[table]) {
        if (fields.some((field) => isMissing(row[field]))) continue;
        const key = fields.map((field) => stableKey(row[field])).join('\u0000');
        const previous = seen.get(key);
        if (previous) {
          add(rowIssue(
            'DUPLICATE_BUSINESS_KEY',
            `账套内业务键 ${fields.join(', ')} 重复，首次记录为 ${previous.id}。`,
            table,
            row,
            fields.join(',')
          ));
        } else {
          seen.set(key, row);
        }
      }
    }
  }
}

function validateRelations(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const ids = new Map<PlanningInputTable, Set<string>>(
    PLANNING_INPUT_TABLES.map((table) => [
      table,
      new Set(snapshot.rows[table].map((row) => row.id))
    ])
  );
  const inputTables = new Set<string>(PLANNING_INPUT_TABLES);

  for (const table of PLANNING_INPUT_TABLES) {
    const model = PLANNING_MODEL_BY_KEY.get(table);
    if (!model) continue;
    for (const field of model.fields) {
      if (field.kind !== 'relation' || !field.relation || !inputTables.has(field.relation)) {
        continue;
      }
      const target = field.relation as PlanningInputTable;
      for (const row of snapshot.rows[table]) {
        const value = optionalString(row[field.name]);
        if (value && !ids.get(target)?.has(value)) {
          add(rowIssue(
            'REFERENCE_NOT_FOUND',
            `引用 ${field.name}=${value} 在 ${target} 中不存在。`,
            table,
            row,
            field.name
          ));
        }
      }
    }
  }
}

function validateMasterCategories(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const categories = new Map(snapshot.rows.planning_category.map((row) => [row.id, row]));
  for (const category of snapshot.rows.planning_category) {
    const parentId = optionalString(category.parent_id);
    if (!parentId) continue;
    const parent = categories.get(parentId);
    if (!parent) continue;
    if (optionalString(parent.target_type) !== optionalString(category.target_type)) {
      add(rowIssue(
        'CATEGORY_PARENT_TARGET_MISMATCH',
        `类别 ${category.id} 与上级类别 ${parentId} 的对象类型不一致。`,
        'planning_category',
        category,
        'parent_id'
      ));
    }
  }
  for (const [table, expectedTarget] of Object.entries(CATEGORY_TARGET_BY_TABLE) as Array<[
    PlanningInputTable,
    string
  ]>) {
    for (const row of snapshot.rows[table]) {
      const categoryId = optionalString(row.category_id);
      if (!categoryId) continue;
      const category = categories.get(categoryId);
      if (!category) continue;
      if (optionalString(category.target_type) !== expectedTarget) {
        add(rowIssue(
          'CATEGORY_TARGET_MISMATCH',
          `类别 ${categoryId} 不能分配给 ${table}。`,
          table,
          row,
          'category_id'
        ));
      }
      if (optionalString(category.status) !== 'active') {
        add(rowIssue(
          'CATEGORY_INACTIVE',
          `类别 ${categoryId} 已停用，不能用于排产主数据。`,
          table,
          row,
          'category_id'
        ));
      }
    }
  }

  validateDirectedCycles(
    'planning_category',
    snapshot.rows.planning_category,
    (row) => optionalString(row.parent_id),
    'CATEGORY_HIERARCHY_CYCLE',
    add
  );
}

function validateFieldValues(snapshot: PlanningDataSnapshot, add: AddIssue) {
  for (const table of PLANNING_INPUT_TABLES) {
    const model = PLANNING_MODEL_BY_KEY.get(table);
    if (!model) continue;
    for (const row of snapshot.rows[table]) {
      for (const field of model.fields) {
        validateFieldValue(table, row, field, add);
      }
    }
  }
}

function validateFieldValue(
  table: PlanningInputTable,
  row: PlanningRow,
  field: PlanningFieldDefinition,
  add: AddIssue
) {
  const value = row[field.name];
  if (value === null || value === undefined || value === '') return;

  if (['number', 'integer', 'interval'].includes(field.kind)) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number) || (field.kind === 'integer' && !Number.isInteger(number))) {
      add(rowIssue(
        'INVALID_NUMERIC_VALUE',
        `${field.name} 必须是${field.kind === 'integer' ? '整数' : '有限数值'}。`,
        table,
        row,
        field.name
      ));
    }
  }

  if (field.options?.length && !field.options.some((option) => option.value === value)) {
    add(rowIssue(
      'UNSUPPORTED_FIELD_VALUE',
      `${field.name} 的值 ${String(value)} 不受支持。`,
      table,
      row,
      field.name
    ));
  }

  if ((field.kind === 'date' || field.kind === 'datetime') && !validDate(value)) {
    add(rowIssue(
      'INVALID_DATE_VALUE',
      `${field.name} 不是有效日期。`,
      table,
      row,
      field.name
    ));
  }
}

function validateDateRanges(snapshot: PlanningDataSnapshot, add: AddIssue) {
  for (const [table, pairs] of Object.entries(DATE_RANGES) as Array<[
    PlanningInputTable,
    Array<[string, string]>
  ]>) {
    for (const row of snapshot.rows[table]) {
      for (const [startField, endField] of pairs) {
        const start = dateValue(row[startField]);
        const end = dateValue(row[endField]);
        if (start !== undefined && end !== undefined && start > end) {
          add(rowIssue(
            'DATE_RANGE_REVERSED',
            `${startField} 不能晚于 ${endField}。`,
            table,
            row,
            `${startField},${endField}`
          ));
        }
      }
    }
  }
}

function validateLotSizes(snapshot: PlanningDataSnapshot, add: AddIssue) {
  for (const table of LOT_SIZE_TABLES) {
    for (const row of snapshot.rows[table]) {
      const minimum = optionalFinite(row.sizeminimum);
      const multiple = optionalFinite(row.sizemultiple);
      const maximum = optionalFinite(row.sizemaximum);
      if (minimum !== undefined && minimum < 0) {
        add(rowIssue('INVALID_LOT_SIZE', '最小批量不能为负数。', table, row, 'sizeminimum'));
      }
      if (multiple !== undefined && multiple < 0) {
        add(rowIssue('INVALID_LOT_SIZE', '批量倍数不能为负数。', table, row, 'sizemultiple'));
      }
      if (maximum !== undefined && maximum < 0) {
        add(rowIssue('INVALID_LOT_SIZE', '最大批量不能为负数。', table, row, 'sizemaximum'));
      }
      if (minimum !== undefined && maximum !== undefined && maximum < minimum) {
        add(rowIssue(
          'INVALID_LOT_SIZE_RANGE',
          '最大批量不能小于最小批量。',
          table,
          row,
          'sizeminimum,sizemaximum'
        ));
      }
    }
  }
}

function validateCycles(snapshot: PlanningDataSnapshot, add: AddIssue) {
  for (const table of [
    'planning_location',
    'planning_customer',
    'planning_item',
    'planning_supplier',
    'planning_resource',
    'planning_operation',
    'planning_operationplan'
  ] as const) {
    validateDirectedCycles(
      table,
      snapshot.rows[table],
      (row) => optionalString(row.owner_id),
      table === 'planning_operation'
        ? 'OPERATION_OWNER_CYCLE'
        : table === 'planning_operationplan'
          ? 'OPERATIONPLAN_OWNER_CYCLE'
          : 'HIERARCHY_CYCLE',
      add
    );
  }

  const operations = new Map(snapshot.rows.planning_operation.map((row) => [row.id, row]));
  validateEdgeCycles(
    'planning_suboperation',
    snapshot.rows.planning_suboperation,
    (row) => optionalString(row.operation_id),
    (row) => optionalString(row.suboperation_id),
    operations,
    'SUBOPERATION_CYCLE',
    add
  );
  validateEdgeCycles(
    'planning_operation_dependency',
    snapshot.rows.planning_operation_dependency,
    (row) => optionalString(row.operation_id),
    (row) => optionalString(row.blockedby_id),
    operations,
    'OPERATION_DEPENDENCY_CYCLE',
    add
  );
}

function validateEngineCompatibility(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const bucketNames = new Set(snapshot.rows.planning_bucket.map((row) => optionalString(row.name)));
  for (const row of snapshot.rows.planning_resource) {
    const type = optionalString(row.type);
    if (!type?.startsWith('buckets_')) continue;
    const calendarName = type.slice('buckets_'.length);
    if (!bucketNames.has(calendarName)) {
      add(rowIssue(
        'RESOURCE_BUCKET_CALENDAR_NOT_FOUND',
        `分桶资源类型 ${type} 需要名称为 ${calendarName} 的时间桶。`,
        'planning_resource',
        row,
        'type'
      ));
    }
  }

  const locationsByName = new Map(
    snapshot.rows.planning_location
      .map((row) => [optionalString(row.name), row] as const)
      .filter((entry): entry is [string, PlanningRow] => Boolean(entry[0]))
  );
  for (const row of snapshot.rows.planning_supplier) {
    const name = optionalString(row.name);
    if (name && locationsByName.has(name)) {
      add(rowIssue(
        'SUPPLIER_LOCATION_NAME_CONFLICT',
        `供应商名称 ${name} 与真实地点重名，frePPLe 会把同名地点解释为供应商可用日历载体。`,
        'planning_supplier',
        row,
        'name'
      ));
    }
  }

  const itemTypes = new Map(
    snapshot.rows.planning_item.map((row) => [row.id, optionalString(row.type) ?? 'make to stock'])
  );
  for (const row of snapshot.rows.planning_buffer) {
    const minInterval = optionalFinite(row.min_interval);
    if (minInterval !== undefined && minInterval !== 0) {
      add(rowIssue(
        'UNSUPPORTED_BUFFER_MIN_INTERVAL',
        '当前 frePPLe 核心不支持 buffer.min_interval，不能在保持语义的前提下装载非零值。',
        'planning_buffer',
        row,
        'min_interval'
      ));
    }
    if (optionalString(row.batch) && itemTypes.get(optionalString(row.item_id) ?? '') !== 'make to order') {
      add(rowIssue(
        'BUFFER_BATCH_REQUIRES_MTO_ITEM',
        'A buffer batch is only supported for an item with type make to order.',
        'planning_buffer',
        row,
        'batch'
      ));
    }
  }
}

function validateBufferNames(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const items = new Map(snapshot.rows.planning_item.map((row) => [row.id, row]));
  const locations = new Map(snapshot.rows.planning_location.map((row) => [row.id, row]));
  const operations = new Map(snapshot.rows.planning_operation.map((row) => [row.id, row]));
  const seen = new Map<string, {
    row: PlanningRow;
    signature: string;
    table: PlanningInputTable;
  }>();
  const reported = new Set<string>();

  const register = (
    table: PlanningInputTable,
    row: PlanningRow,
    itemValue: unknown,
    locationValue: unknown,
    batchValue?: unknown
  ) => {
    const itemId = optionalString(itemValue);
    const locationId = optionalString(locationValue);
    const item = itemId ? items.get(itemId) : undefined;
    const location = locationId ? locations.get(locationId) : undefined;
    const itemName = optionalString(item?.name);
    const locationName = optionalString(location?.name);
    if (!itemId || !locationId || !itemName || !locationName) return;
    const batch = optionalString(item?.type) === 'make to order'
      ? optionalString(batchValue)
      : undefined;
    const name = batch
      ? `${itemName} @ ${batch} @ ${locationName}`
      : `${itemName} @ ${locationName}`;
    const signature = `${itemId}\u0000${batch ?? ''}\u0000${locationId}`;
    const previous = seen.get(name);
    if (!previous) {
      seen.set(name, { row, signature, table });
      return;
    }
    if (previous.signature === signature || reported.has(name)) return;
    reported.add(name);
    add(rowIssue(
      'BUFFER_NAME_COLLISION',
      `frePPLe buffer name ${name} maps to multiple item, batch, and location combinations; the engine can rename one with a * suffix.`,
      table,
      row,
      'item_id,location_id,batch'
    ));
  };

  for (const row of snapshot.rows.planning_buffer) {
    register('planning_buffer', row, row.item_id, row.location_id, row.batch);
  }
  for (const row of snapshot.rows.planning_operationmaterial) {
    const operation = operations.get(optionalString(row.operation_id) ?? '');
    register(
      'planning_operationmaterial',
      row,
      row.item_id,
      row.location_id ?? operation?.location_id
    );
  }
  for (const row of snapshot.rows.planning_demand) {
    register('planning_demand', row, row.item_id, row.location_id);
    if (optionalString(row.batch)) {
      register('planning_demand', row, row.item_id, row.location_id, row.batch);
    }
  }
  for (const row of snapshot.rows.planning_itemsupplier) {
    if (optionalString(row.location_id)) {
      register('planning_itemsupplier', row, row.item_id, row.location_id);
    }
  }
  for (const row of snapshot.rows.planning_itemdistribution) {
    register('planning_itemdistribution', row, row.item_id, row.origin_id);
    register('planning_itemdistribution', row, row.item_id, row.location_id);
  }
  for (const row of selectedOperationPlans(snapshot.rows.planning_operationplan)) {
    register(
      'planning_operationplan',
      row,
      row.item_id,
      row.location_id ?? row.destination_id,
      row.batch
    );
    register('planning_operationplan', row, row.item_id, row.origin_id, row.batch);
  }
}

function selectedOperationPlans(rows: PlanningRow[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const selected = new Set(rows
    .filter((row) => LOCKED_OPERATIONPLAN_STATUSES.has(optionalString(row.status) ?? ''))
    .map((row) => row.id));
  for (const id of [...selected]) {
    let owner = optionalString(byId.get(id)?.owner_id);
    while (owner && byId.has(owner) && !selected.has(owner)) {
      selected.add(owner);
      owner = optionalString(byId.get(owner)?.owner_id);
    }
  }
  return rows.filter((row) => selected.has(row.id));
}

function validateSuboperationDefinitions(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const operations = new Map(snapshot.rows.planning_operation.map((row) => [row.id, row]));
  const explicitByChild = groupRows(snapshot.rows.planning_suboperation, 'suboperation_id');
  for (const [childId, rows] of explicitByChild) {
    const child = operations.get(childId);
    const ownerId = optionalString(child?.owner_id);
    if (!child || !ownerId) continue;
    for (const row of rows) {
      const explicitOwner = optionalString(row.operation_id);
      if (explicitOwner !== ownerId ||
        !sameOptionalNumber(row.priority, child.priority) ||
        !sameOptionalDate(row.effective_start, child.effective_start) ||
        !sameOptionalDate(row.effective_end, child.effective_end)) {
        add(rowIssue(
          'SUBOPERATION_DEFINITION_CONFLICT',
          '显式子工序定义与子工序自身的 owner_id、priority 或生效日期不一致。',
          'planning_suboperation',
          row,
          'operation_id,priority,effective_start,effective_end'
        ));
      }
    }
  }
}

function validateManufacturingOutputs(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const current = currentDate(snapshot);
  const operations = new Map(snapshot.rows.planning_operation.map((row) => [row.id, row]));
  const childrenByOwner = groupRows(snapshot.rows.planning_operation, 'owner_id');
  const explicitChildrenByOwner = groupRows(snapshot.rows.planning_suboperation, 'operation_id');
  const positiveFlowsByOperation = new Map<string, PlanningRow[]>();
  for (const flow of snapshot.rows.planning_operationmaterial) {
    if (!isEffective(flow, current) || (optionalFinite(flow.quantity) ?? 0) <= 0) continue;
    const operationId = optionalString(flow.operation_id);
    if (operationId) {
      positiveFlowsByOperation.set(operationId, [
        ...(positiveFlowsByOperation.get(operationId) ?? []),
        flow
      ]);
    }
  }

  const routeProducesItem = (route: PlanningRow, itemId: string) => {
    if ((positiveFlowsByOperation.get(route.id) ?? [])
      .some((flow) => optionalString(flow.item_id) === itemId)) return true;
    const childIds = new Set([
      ...(childrenByOwner.get(route.id) ?? []).map((row) => row.id),
      ...(explicitChildrenByOwner.get(route.id) ?? [])
        .map((row) => optionalString(row.suboperation_id))
        .filter((id): id is string => Boolean(id))
    ]);
    return [...childIds].some((childId) => (positiveFlowsByOperation.get(childId) ?? [])
      .some((flow) => optionalString(flow.item_id) === itemId));
  };

  for (const operation of operations.values()) {
    const itemId = optionalString(operation.item_id);
    if (!itemId || !isEffective(operation, current) || optionalFinite(operation.priority) === 0) {
      continue;
    }
    const type = optionalString(operation.type) ?? 'fixed_time';
    if (optionalString(operation.owner_id)) continue;
    const producesItem = type === 'routing'
      ? routeProducesItem(operation, itemId)
      : (positiveFlowsByOperation.get(operation.id) ?? [])
        .some((flow) => optionalString(flow.item_id) === itemId);
    if (!producesItem) {
      add(rowIssue(
        'OPERATION_OUTPUT_MISSING',
        '生产工艺没有任何有效的正数量产出流，frePPLe 无法用它补充关联物料。',
        'planning_operation',
        operation,
        'item_id'
      ));
    }
  }

  for (const flow of snapshot.rows.planning_operationmaterial) {
    if (!isEffective(flow, current) || (optionalFinite(flow.quantity) ?? 0) >= 0) continue;
    const itemId = optionalString(flow.item_id);
    const operation = operations.get(optionalString(flow.operation_id) ?? '');
    const locationId = optionalString(flow.location_id) || optionalString(operation?.location_id);
    if (!itemId || !locationId) continue;
    const hasBuffer = snapshot.rows.planning_buffer.some((buffer) =>
      optionalString(buffer.item_id) === itemId &&
      optionalString(buffer.location_id) === locationId
    );
    if (!hasBuffer) {
      add(rowIssue(
        'OPERATION_INPUT_BUFFER_MISSING',
        '工序投入物料在工序地点没有显式缓冲记录；frePPLe 会创建隐式零库存缓冲，结果可能与主数据库存脱节。',
        'planning_operationmaterial',
        flow,
        'item_id,location_id'
      ));
    }
  }
}

function validateDemandGroups(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const demandNames = new Set(
    snapshot.rows.planning_demand
      .map((row) => optionalString(row.name))
      .filter((name): name is string => Boolean(name))
  );
  const policies = new Map<string, string>();
  for (const row of snapshot.rows.planning_demand) {
    const owner = optionalString(row.owner);
    if (!owner) continue;
    if (demandNames.has(owner)) {
      add(rowIssue(
        'DEMAND_GROUP_NAME_CONFLICT',
        `上级需求组 ${owner} 与真实需求名称冲突。`,
        'planning_demand',
        row,
        'owner'
      ));
      continue;
    }
    const policy = optionalString(row.policy) ?? 'independent';
    const existing = policies.get(owner);
    if (existing && existing !== policy) {
      add(rowIssue(
        'DEMAND_GROUP_POLICY_CONFLICT',
        `需求组 ${owner} 同时使用了 ${existing} 和 ${policy} 策略。`,
        'planning_demand',
        row,
        'policy'
      ));
    } else {
      policies.set(owner, policy);
    }
  }
}

function validateDirectedCycles(
  table: PlanningInputTable,
  rows: PlanningRow[],
  parent: (row: PlanningRow) => string | undefined,
  code: string,
  add: AddIssue
) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const edges = new Map<string, string[]>();
  for (const row of rows) {
    const owner = parent(row);
    if (owner && byId.has(owner)) edges.set(row.id, [owner]);
  }
  reportCycles(table, edges, byId, code, add);
}

function validateEdgeCycles(
  table: PlanningInputTable,
  rows: PlanningRow[],
  from: (row: PlanningRow) => string | undefined,
  to: (row: PlanningRow) => string | undefined,
  nodes: Map<string, PlanningRow>,
  code: string,
  add: AddIssue
) {
  const edges = new Map<string, string[]>();
  const edgeRows = new Map<string, PlanningRow>();
  for (const row of rows) {
    const source = from(row);
    const target = to(row);
    if (!source || !target || !nodes.has(source) || !nodes.has(target)) continue;
    edges.set(source, [...(edges.get(source) ?? []), target]);
    edgeRows.set(`${source}\u0000${target}`, row);
  }
  reportCycles(table, edges, nodes, code, add, edgeRows);
}

function reportCycles(
  table: PlanningInputTable,
  edges: Map<string, string[]>,
  nodes: Map<string, PlanningRow>,
  code: string,
  add: AddIssue,
  edgeRows?: Map<string, PlanningRow>
) {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();

  const visit = (node: string) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (state.get(next) === 1) {
        const cycle = stack.slice(stack.indexOf(next)).concat(next);
        const signature = [...new Set(cycle)].sort().join('|');
        if (!reported.has(signature)) {
          reported.add(signature);
          const issueRow = edgeRows?.get(`${node}\u0000${next}`) ??
            nodes.get(node) ?? { id: node, account_id: '' };
          add(rowIssue(
            code,
            `检测到循环引用：${cycle.map((id) => recordLabel(nodes.get(id), id)).join(' -> ')}。`,
            table,
            issueRow
          ));
        }
      } else if (!state.get(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, 2);
  };

  for (const node of nodes.keys()) {
    if (!state.get(node)) visit(node);
  }
}

function validateDemands(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const itemTypes = new Map(
    snapshot.rows.planning_item.map((row) => [row.id, optionalString(row.type) ?? 'make to stock'])
  );
  for (const row of snapshot.rows.planning_demand) {
    const status = optionalString(row.status) ?? 'open';
    if (!ACTIVE_DEMAND_STATUSES.has(status)) continue;
    const quantity = optionalFinite(row.quantity);
    if (quantity === undefined || quantity <= 0) {
      add(rowIssue(
        'INVALID_ACTIVE_DEMAND_QUANTITY',
        '开放需求的数量必须大于 0。',
        'planning_demand',
        row,
        'quantity'
      ));
    }
    if (!validDate(row.due)) {
      add(rowIssue(
        'INVALID_ACTIVE_DEMAND_DUE',
        '开放需求必须有有效交期。',
        'planning_demand',
        row,
        'due'
      ));
    }
    const itemId = optionalString(row.item_id);
    if (optionalString(row.batch) && itemTypes.get(itemId ?? '') !== 'make to order') {
      add(rowIssue(
        'DEMAND_BATCH_REQUIRES_MTO_ITEM',
        '按批次追踪的需求只能用于 make to order 物料；make to stock 需求批次会创建无法由普通库存和工艺补充的独立缓冲。',
        'planning_demand',
        row,
        'batch'
      ));
    }
  }
}

function validateOperationPlans(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const resourcesByOperationPlan = groupRows(
    snapshot.rows.planning_operationplanresource,
    'operationplan_id'
  );
  const materialsByOperationPlan = groupRows(
    snapshot.rows.planning_operationplanmaterial,
    'operationplan_id'
  );
  const resourceIds = new Set(snapshot.rows.planning_resource.map((row) => row.id));

  for (const row of snapshot.rows.planning_operationplan) {
    const status = optionalString(row.status) ?? 'proposed';
    const type = optionalString(row.type) ?? 'MO';
    if (status === 'closed' || status === 'proposed') continue;
    if (!LOCKED_OPERATIONPLAN_STATUSES.has(status)) {
      add(rowIssue(
        'UNSUPPORTED_OPERATIONPLAN_STATUS',
        `已有计划单状态 ${status} 不能作为 supply_plan 输入。`,
        'planning_operationplan',
        row,
        'status'
      ));
      continue;
    }
    if (!INPUT_OPERATIONPLAN_TYPES.has(type)) {
      add(rowIssue(
        'UNSUPPORTED_OPERATIONPLAN_TYPE',
        `已有计划单类型 ${type} 不能作为 supply_plan 输入。`,
        'planning_operationplan',
        row,
        'type'
      ));
      continue;
    }

    const requiredByType: Record<string, string[]> = {
      MO: ['operation_id'],
      WO: ['operation_id'],
      PO: ['supplier_id', 'item_id', 'location_id'],
      DO: ['item_id', 'origin_id', 'destination_id'],
      DLVR: ['demand_id', 'item_id', 'location_id']
    };
    for (const field of requiredByType[type] ?? []) {
      if (isMissing(row[field])) {
        add(rowIssue(
          'INVALID_OPERATIONPLAN_SHAPE',
          `${type} 类型已有计划单缺少 ${field}。`,
          'planning_operationplan',
          row,
          field
        ));
      }
    }
    const quantity = optionalFinite(row.quantity);
    if (quantity === undefined || quantity < 0) {
      add(rowIssue(
        'INVALID_OPERATIONPLAN_QUANTITY',
        '已有计划单数量必须是非负有限数值。',
        'planning_operationplan',
        row,
        'quantity'
      ));
    }
    for (const field of ['startdate', 'enddate']) {
      const value = dateValue(row[field]);
      if (value !== undefined && value >= ENGINE_DATE_LIMIT) {
        add(rowIssue(
          'OPERATIONPLAN_DATE_OUT_OF_RANGE',
          `已有计划单 ${field} 必须早于 2030-12-31。`,
          'planning_operationplan',
          row,
          field
        ));
      }
    }
    for (const resourceRow of resourcesByOperationPlan.get(row.id) ?? []) {
      const resourceId = optionalString(resourceRow.resource_id);
      if (resourceId && !resourceIds.has(resourceId)) {
        add(rowIssue(
          'OPERATIONPLAN_RESOURCE_NOT_FOUND',
          `已有计划单指定的资源 ${resourceId} 不存在。`,
          'planning_operationplanresource',
          resourceRow,
          'resource_id'
        ));
      }
    }
    for (const materialRow of materialsByOperationPlan.get(row.id) ?? []) {
      const materialStatus = optionalString(materialRow.status);
      if (materialStatus === 'proposed') {
        add(rowIssue(
          'LOCKED_OPERATIONPLAN_MATERIAL_STATUS',
          'Material detail for a locked operation plan must be confirmed or closed.',
          'planning_operationplanmaterial',
          materialRow,
          'status'
        ));
      }
    }
  }
}

function validateSupplyPaths(snapshot: PlanningDataSnapshot, add: AddIssue) {
  const locations = new Map(snapshot.rows.planning_location.map((row) => [row.id, row]));
  const directSupply = new Set<string>();
  const distributionOrigins = new Map<string, Set<string>>();
  const current = currentDate(snapshot);

  for (const row of snapshot.rows.planning_buffer) {
    const item = optionalString(row.item_id);
    const location = optionalString(row.location_id);
    const onhand = optionalFinite(row.onhand) ?? 0;
    if (item && location && (onhand > 0 || row.type === 'infinite')) {
      directSupply.add(supplyKey(item, location));
    }
  }
  for (const row of snapshot.rows.planning_itemsupplier) {
    if (!isEffective(row, current) || optionalFinite(row.priority) === 0) continue;
    const item = optionalString(row.item_id);
    const location = optionalString(row.location_id);
    if (!item) continue;
    if (location) {
      directSupply.add(supplyKey(item, location));
    } else {
      for (const locationId of locations.keys()) directSupply.add(supplyKey(item, locationId));
    }
  }
  for (const row of snapshot.rows.planning_operation) {
    if (!isEffective(row, current) || optionalFinite(row.priority) === 0) continue;
    const item = optionalString(row.item_id);
    const location = optionalString(row.location_id);
    if (item && location) directSupply.add(supplyKey(item, location));
  }
  const operationLocations = new Map(
    snapshot.rows.planning_operation.map((row) => [row.id, optionalString(row.location_id)])
  );
  for (const row of snapshot.rows.planning_operationmaterial) {
    if (!isEffective(row, current) || (optionalFinite(row.quantity) ?? 0) <= 0) continue;
    const item = optionalString(row.item_id);
    const operation = optionalString(row.operation_id);
    const location = optionalString(row.location_id) || (operation ? operationLocations.get(operation) : undefined);
    if (item && location) directSupply.add(supplyKey(item, location));
  }
  for (const row of snapshot.rows.planning_itemdistribution) {
    if (!isEffective(row, current) || optionalFinite(row.priority) === 0) continue;
    const item = optionalString(row.item_id);
    const destination = optionalString(row.location_id);
    const origin = optionalString(row.origin_id);
    if (!item || !destination || !origin) continue;
    const destinationKey = supplyKey(item, destination);
    const origins = distributionOrigins.get(destinationKey) ?? new Set<string>();
    origins.add(supplyKey(item, origin));
    distributionOrigins.set(destinationKey, origins);
  }

  const canSupply = (key: string, visiting = new Set<string>()): boolean => {
    if (directSupply.has(key)) return true;
    if (visiting.has(key)) return false;
    const nextPath = new Set(visiting);
    nextPath.add(key);
    for (const origin of distributionOrigins.get(key) ?? []) {
      if (canSupply(origin, nextPath)) return true;
    }
    return false;
  };

  for (const row of snapshot.rows.planning_demand) {
    const status = optionalString(row.status) ?? 'open';
    if (!ACTIVE_DEMAND_STATUSES.has(status) || (optionalFinite(row.quantity) ?? 0) <= 0) continue;
    const item = optionalString(row.item_id);
    const location = optionalString(row.location_id);
    if (item && location && !canSupply(supplyKey(item, location))) {
      add(rowIssue(
        'NO_SUPPLY_PATH',
        '活动需求没有可用库存、生产、采购或可达配送供给路径。',
        'planning_demand',
        row,
        'item_id,location_id'
      ));
    }
  }
}

function validateDateLimit(snapshot: PlanningDataSnapshot, add: AddIssue) {
  let count = 0;
  let first: { table: PlanningInputTable; row: PlanningRow; field: string } | undefined;
  for (const table of PLANNING_INPUT_TABLES) {
    const model = PLANNING_MODEL_BY_KEY.get(table);
    if (!model) continue;
    const dateFields = model.fields.filter((field) => field.kind === 'date' || field.kind === 'datetime');
    for (const row of snapshot.rows[table]) {
      for (const field of dateFields) {
        const value = dateValue(row[field.name]);
        if (
          value !== undefined &&
          value >= ENGINE_DATE_LIMIT &&
          !isLegalEngineSentinel(table, field.name, value)
        ) {
          count += 1;
          first ??= { table, row, field: field.name };
        }
      }
    }
  }
  if (count && first) {
    add({
      code: 'ENGINE_DATE_LIMIT_RISK',
      message: `${count} 个日期值达到或超过 frePPLe 的 2030-12-31 上限；首个位置为 ${first.table}.${first.field} (${first.row.id})。`,
      severity: 'warning',
      table: first.table,
      recordId: first.row.id,
      path: first.field
    });
  }
}

function isLegalEngineSentinel(table: PlanningInputTable, field: string, value: number) {
  if (value !== ENGINE_DATE_LIMIT) return false;
  return field === 'effective_end' ||
    (table === 'planning_calendarbucket' && field === 'enddate');
}

function currentDate(snapshot: PlanningDataSnapshot) {
  const parameter = snapshot.rows.planning_parameter.find((row) => row.name === 'currentdate');
  const raw = optionalString(parameter?.value);
  if (!raw || raw.toLowerCase() === 'now') return Date.parse(snapshot.loadedAt);
  return dateValue(raw) ?? Date.parse(snapshot.loadedAt);
}

function isEffective(row: PlanningRow, current: number) {
  const start = dateValue(row.effective_start);
  const end = dateValue(row.effective_end);
  return (start === undefined || start <= current) && (end === undefined || end >= current);
}

function reportLabel(row: PlanningRow) {
  return optionalString(row.name) || optionalString(row.reference) || row.id;
}

function recordLabel(row: PlanningRow | undefined, fallback: string) {
  return row ? reportLabel(row) : fallback;
}

function rowIssue(
  code: string,
  message: string,
  table: PlanningInputTable,
  row: PlanningRow,
  path?: string
): PlanningPreflightIssue {
  return {
    code,
    message: `${reportLabel(row)}: ${message}`,
    path,
    recordId: row.id,
    severity: 'error',
    table
  };
}

function compareIssues(left: PlanningPreflightIssue, right: PlanningPreflightIssue) {
  return left.severity.localeCompare(right.severity) ||
    String(left.table ?? '').localeCompare(String(right.table ?? '')) ||
    String(left.recordId ?? '').localeCompare(String(right.recordId ?? '')) ||
    left.code.localeCompare(right.code);
}

function groupRows(rows: PlanningRow[], field: string) {
  const result = new Map<string, PlanningRow[]>();
  for (const row of rows) {
    const key = optionalString(row[field]);
    if (key) result.set(key, [...(result.get(key) ?? []), row]);
  }
  return result;
}

function supplyKey(item: string, location: string) {
  return `${item}\u0000${location}`;
}

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalFinite(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sameOptionalNumber(left: unknown, right: unknown) {
  return optionalFinite(left) === optionalFinite(right);
}

function sameOptionalDate(left: unknown, right: unknown) {
  return dateValue(left) === dateValue(right);
}

function dateValue(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validDate(value: unknown) {
  return dateValue(value) !== undefined;
}

function stableKey(value: unknown) {
  if (value === null || value === undefined) return '<null>';
  return typeof value === 'string' ? value.trim() : JSON.stringify(value);
}
