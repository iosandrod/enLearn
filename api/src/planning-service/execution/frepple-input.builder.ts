import type {
  FreppleInputModel,
  FreppleObject,
  FreppleReference,
  PlanningDataSnapshot,
  PlanningEngineInput,
  PlanningNameEntity,
  PlanningNameIndex,
  PlanningReferenceIndex,
  PlanningRow,
  PlanningSolverParameters
} from './planning-execution.types';

const OPERATION_TYPES: Record<string, string> = {
  alternate: 'operation_alternate',
  fixed_time: 'operation_fixed_time',
  routing: 'operation_routing',
  split: 'operation_split',
  time_per: 'operation_time_per'
};

const RESOURCE_TYPES: Record<string, string> = {
  buckets: 'resource_buckets',
  buckets_day: 'resource_buckets',
  buckets_month: 'resource_buckets',
  buckets_week: 'resource_buckets',
  default: 'resource_default',
  infinite: 'resource_infinite'
};

const FLOW_TYPES: Record<string, string> = {
  end: 'flow_end',
  start: 'flow_start',
  transfer_batch: 'flow_transfer_batch'
};

const LOCKED_STATUSES = new Set(['approved', 'confirmed', 'completed']);

export class FreppleInputBuilder {
  build(
    snapshot: PlanningDataSnapshot,
    parameters: PlanningSolverParameters
  ): PlanningEngineInput {
    const lookup = new SnapshotLookup(snapshot);
    const categories = new CategoryLookup(snapshot.rows.planning_category);
    const operationMaterials = groupBy(snapshot.rows.planning_operationmaterial, 'operation_id');
    const operationResources = groupBy(snapshot.rows.planning_operationresource, 'operation_id');
    const explicitSuboperations = groupBy(snapshot.rows.planning_suboperation, 'operation_id');
    const dependencies = groupBy(snapshot.rows.planning_operation_dependency, 'operation_id');
    const calendarBuckets = groupBy(snapshot.rows.planning_calendarbucket, 'calendar_id');
    const bucketDetails = groupBy(snapshot.rows.planning_bucketdetail, 'bucket_id');
    const setupRules = groupBy(snapshot.rows.planning_setuprule, 'setupmatrix_id');
    const operationPlanResources = groupBy(
      snapshot.rows.planning_operationplanresource,
      'operationplan_id'
    );
    const operationPlanMaterials = groupBy(
      snapshot.rows.planning_operationplanmaterial,
      'operationplan_id'
    );
    const childOperations = groupBy(snapshot.rows.planning_operation, 'owner_id');
    const childOperationIds = new Set([
      ...snapshot.rows.planning_suboperation.map((row) => stringValue(row.suboperation_id)),
      ...snapshot.rows.planning_operation
        .filter((row) => Boolean(stringValue(row.owner_id)))
        .map((row) => row.id)
    ].filter((value): value is string => Boolean(value)));

    const calendars = [
      ...snapshot.rows.planning_calendar.map((row) => compact({
        name: requiredString(row.name, 'planning_calendar.name'),
        default: numberValue(row.defaultvalue),
        source: stringValue(row.source),
        buckets: (calendarBuckets.get(row.id) ?? []).map(calendarBucket)
      })),
      ...snapshot.rows.planning_bucket.map((row) => compact({
        name: requiredString(row.name, 'planning_bucket.name'),
        default: 0,
        hidden: true,
        source: 'planning_bucket',
        buckets: (bucketDetails.get(row.id) ?? []).map((detail) => compact({
          name: stringValue(detail.name)?.toLowerCase(),
          start: dateValue(detail.startdate),
          end: dateValue(detail.enddate),
          priority: 10,
          value: 0,
          days: 127,
          starttime: duration(0),
          endtime: duration(86_400),
          source: stringValue(detail.source) ?? 'planning_bucketdetail'
        }))
      }))
    ];

    const operations = snapshot.rows.planning_operation.map((row) => {
      const operationId = row.id;
      const suboperations = mergeSuboperations(
        explicitSuboperations.get(operationId) ?? [],
        childOperations.get(operationId) ?? [],
        lookup
      );
      return compact({
        type: OPERATION_TYPES[stringValue(row.type) ?? 'fixed_time'],
        name: requiredString(row.name, 'planning_operation.name'),
        description: stringValue(row.description),
        category: stringValue(row.category),
        subcategory: stringValue(row.subcategory),
        // A routing parent is the replenishment operation for its item. Its
        // child steps may contain material flows, but must not be registered
        // as independent replenishment alternatives for the same item.
        item: childOperationIds.has(operationId) ? undefined : lookup.ref('item', row.item_id),
        location: lookup.ref('location', row.location_id),
        priority: numberValue(row.priority),
        effective_start: dateValue(row.effective_start),
        effective_end: engineEndDate(row.effective_end),
        fence: duration(row.fence),
        posttime: duration(row.posttime),
        size_minimum: numberValue(row.sizeminimum),
        size_multiple: numberValue(row.sizemultiple),
        size_maximum: numberValue(row.sizemaximum),
        cost: numberValue(row.cost),
        duration: duration(row.duration),
        duration_per: duration(row.duration_per),
        search: stringValue(row.search),
        available: lookup.ref('calendar', row.available_id),
        batchwindow: duration(row.batchwindow),
        source: stringValue(row.source),
        flows: (operationMaterials.get(operationId) ?? []).map((flow) => compact({
          type: FLOW_TYPES[stringValue(flow.type) ?? 'start'],
          item: lookup.ref('item', flow.item_id),
          location: lookup.ref('location', flow.location_id),
          quantity: numberValue(flow.quantity),
          quantity_fixed: numberValue(flow.quantity_fixed),
          effective_start: dateValue(flow.effective_start),
          effective_end: engineEndDate(flow.effective_end),
          name: stringValue(flow.name),
          priority: numberValue(flow.priority),
          search: stringValue(flow.search),
          transferbatch: stringValue(flow.type) === 'transfer_batch'
            ? numberValue(flow.transferbatch)
            : undefined,
          offset: stringValue(flow.type) === 'transfer_batch'
            ? undefined
            : duration(flow.offset),
          source: stringValue(flow.source)
        })),
        loads: (operationResources.get(operationId) ?? []).map((load) => compact({
          resource: lookup.ref('resource', load.resource_id),
          skill: lookup.ref('skill', load.skill_id),
          quantity: numberValue(load.quantity),
          quantity_fixed: numberValue(load.quantity_fixed),
          effective_start: dateValue(load.effective_start),
          effective_end: engineEndDate(load.effective_end),
          name: stringValue(load.name),
          priority: numberValue(load.priority),
          setup: stringValue(load.setup),
          search: stringValue(load.search),
          source: stringValue(load.source)
        })),
        suboperations: suboperations.length ? suboperations : undefined,
        dependencies: (dependencies.get(operationId) ?? []).map((dependency) => compact({
          blockedby: lookup.ref('operation', dependency.blockedby_id),
          quantity: numberValue(dependency.quantity),
          safety_leadtime: duration(dependency.safety_leadtime),
          hard_safety_leadtime: duration(dependency.hard_safety_leadtime),
          source: stringValue(dependency.source)
        }))
      });
    });

    const operationPlans = selectLockedOperationPlans(snapshot.rows.planning_operationplan)
      .map((row) => compact({
        reference: requiredString(row.reference, 'planning_operationplan.reference'),
        ordertype: stringValue(row.type),
        operation: ['MO', 'WO'].includes(stringValue(row.type) ?? '')
          ? lookup.ref('operation', row.operation_id)
          : undefined,
        item: lookup.ref('item', row.item_id),
        location: operationPlanLocation(row, lookup),
        origin: lookup.ref('location', row.origin_id),
        supplier: lookup.ref('supplier', row.supplier_id),
        demand: lookup.ref('demand', row.demand_id),
        owner: operationPlanOwner(row, snapshot.rows.planning_operationplan),
        quantity: numberValue(row.quantity),
        quantity_completed: numberValue(row.quantity_completed),
        start: dateValue(row.startdate),
        end: dateValue(row.enddate),
        statusNoPropagation: stringValue(row.status),
        create: true,
        batch: stringValue(row.batch),
        remark: stringValue(row.remark),
        source: stringValue(row.source),
        resources: (operationPlanResources.get(row.id) ?? [])
          .map((resource) => lookup.name('resource', resource.resource_id)),
        flowplans: LOCKED_STATUSES.has(stringValue(row.status) ?? '')
          ? (operationPlanMaterials.get(row.id) ?? []).map((flowplan) => compact({
              item: lookup.ref('item', flowplan.item_id),
              quantity: numberValue(flowplan.quantity),
              status: normalizeInputFlowplanStatus(flowplan.status)
            }))
          : undefined
      }));

    const model: FreppleInputModel = {
      current: parameters.currentDate,
      individualPoolResources: parameters.individualPoolResources,
      moveApprovedEarly: parameters.moveApprovedEarly,
      suppressFlowplanCreation: operationPlans.length > 0,
      calendars,
      locations: [
        ...snapshot.rows.planning_location.map((row) => hierarchy(row, lookup, 'location', {
          available: lookup.ref('calendar', row.available_id)
        })),
        ...supplierCalendarLocations(snapshot.rows.planning_supplier, lookup)
      ],
      customers: snapshot.rows.planning_customer.map((row) => hierarchy(
        row,
        lookup,
        'customer',
        categories.freppleFields(row, 'customer')
      )),
      suppliers: snapshot.rows.planning_supplier.map((row) => hierarchy(
        row,
        lookup,
        'supplier',
        categories.freppleFields(row, 'supplier')
      )),
      items: snapshot.rows.planning_item.map((row) => hierarchy(row, lookup, 'item', {
        ...categories.freppleFields(row, 'item'),
        type: stringValue(row.type) === 'make to order' ? 'item_mto' : 'item_mts',
        cost: numberValue(row.cost),
        weight: numberValue(row.weight),
        volume: numberValue(row.volume),
        uom: stringValue(row.uom)
      })),
      setupmatrices: snapshot.rows.planning_setupmatrix.map((row) => compact({
        name: requiredString(row.name, 'planning_setupmatrix.name'),
        source: stringValue(row.source),
        rules: (setupRules.get(row.id) ?? []).map((rule) => compact({
          priority: numberValue(rule.priority),
          fromsetup: stringValue(rule.fromsetup),
          tosetup: stringValue(rule.tosetup),
          duration: duration(rule.duration),
          cost: numberValue(rule.cost),
          resource: lookup.ref('resource', rule.resource_id),
          source: stringValue(rule.source)
        }))
      })),
      resources: snapshot.rows.planning_resource.map((row) => compact({
        ...hierarchy(row, lookup, 'resource'),
        type: RESOURCE_TYPES[stringValue(row.type) ?? 'default'],
        constrained: booleanValue(row.constrained),
        maximum: numberValue(row.maximum),
        maximum_calendar: lookup.ref('calendar', row.maximum_calendar_id),
        available: lookup.ref('calendar', row.available_id),
        location: lookup.ref('location', row.location_id),
        cost: numberValue(row.cost),
        maxearly: duration(row.maxearly),
        setupmatrix: lookup.ref('setupmatrix', row.setupmatrix_id),
        setup: stringValue(row.setup),
        efficiency: numberValue(row.efficiency),
        efficiency_calendar: lookup.ref('calendar', row.efficiency_calendar_id)
      })),
      skills: snapshot.rows.planning_skill.map((row) => compact({
        name: requiredString(row.name, 'planning_skill.name'),
        source: stringValue(row.source)
      })),
      resourceskills: snapshot.rows.planning_resourceskill.map((row) => compact({
        resource: lookup.ref('resource', row.resource_id),
        skill: lookup.ref('skill', row.skill_id),
        priority: numberValue(row.priority),
        effective_start: dateValue(row.effective_start),
        effective_end: engineEndDate(row.effective_end),
        source: stringValue(row.source)
      })),
      operations,
      itemsuppliers: snapshot.rows.planning_itemsupplier.map((row) => compact({
        supplier: lookup.ref('supplier', row.supplier_id),
        item: lookup.ref('item', row.item_id),
        location: lookup.ref('location', row.location_id),
        leadtime: duration(row.leadtime),
        extra_safety_leadtime: duration(row.extra_safety_leadtime),
        hard_safety_leadtime: duration(row.hard_safety_leadtime),
        size_minimum: numberValue(row.sizeminimum),
        size_multiple: numberValue(row.sizemultiple),
        size_maximum: numberValue(row.sizemaximum),
        batchwindow: duration(row.batchwindow),
        cost: numberValue(row.cost),
        priority: numberValue(row.priority),
        effective_start: dateValue(row.effective_start),
        effective_end: engineEndDate(row.effective_end),
        resource: lookup.ref('resource', row.resource_id),
        resource_qty: numberValue(row.resource_qty),
        fence: duration(row.fence),
        source: stringValue(row.source)
      })),
      itemdistributions: snapshot.rows.planning_itemdistribution.map((row) => compact({
        item: lookup.ref('item', row.item_id),
        origin: lookup.ref('location', row.origin_id),
        destination: lookup.ref('location', row.location_id),
        leadtime: duration(row.leadtime),
        size_minimum: numberValue(row.sizeminimum),
        size_multiple: numberValue(row.sizemultiple),
        size_maximum: numberValue(row.sizemaximum),
        batchwindow: duration(row.batchwindow),
        cost: numberValue(row.cost),
        priority: numberValue(row.priority),
        effective_start: dateValue(row.effective_start),
        effective_end: engineEndDate(row.effective_end),
        resource: lookup.ref('resource', row.resource_id),
        resource_qty: numberValue(row.resource_qty),
        fence: duration(row.fence),
        source: stringValue(row.source)
      })),
      buffers: snapshot.rows.planning_buffer.map((row) => compact({
        type: stringValue(row.type) === 'infinite' ? 'buffer_infinite' : 'buffer_default',
        name: bufferName(row, lookup),
        description: stringValue(row.description),
        category: stringValue(row.category),
        subcategory: stringValue(row.subcategory),
        item: lookup.ref('item', row.item_id),
        location: lookup.ref('location', row.location_id),
        batch: lookup.bufferBatch(row.item_id, row.batch),
        onhand: Math.max(numberValue(row.onhand) ?? 0, 0),
        minimum: numberValue(row.minimum),
        minimum_calendar: lookup.ref('calendar', row.minimum_calendar_id),
        maximum: numberValue(row.maximum),
        maximum_calendar: lookup.ref('calendar', row.maximum_calendar_id),
        source: stringValue(row.source)
      })),
      demands: buildDemands(snapshot.rows.planning_demand, lookup),
      operationplans: operationPlans
    };

    return {
      names: lookup.resultNames(),
      references: buildResultReferences(snapshot, lookup),
      request: {
        bucketDates: [...new Set(snapshot.rows.planning_bucketdetail
          .map((row) => dateValue(row.startdate))
          .filter((value): value is string => Boolean(value)))].sort(),
        bucketizedResources: snapshot.rows.planning_resource.flatMap((row) => {
          const type = stringValue(row.type);
          if (type !== 'buckets_day' && type !== 'buckets_week' && type !== 'buckets_month') {
            return [];
          }
          return [{
            calendar: type.slice('buckets_'.length) as 'day' | 'week' | 'month',
            resource: requiredString(row.name, 'planning_resource.name')
          }];
        }),
        model,
        parameters
      }
    };
  }
}

function buildResultReferences(
  snapshot: PlanningDataSnapshot,
  lookup: SnapshotLookup
): PlanningReferenceIndex {
  const buffers = new Set(
    snapshot.rows.planning_buffer.map((row) => bufferName(row, lookup))
  );

  return {
    buffers,
    demands: new Set(snapshot.rows.planning_demand.flatMap((row) => [
      requiredString(row.name, 'planning_demand.name'),
      stringValue(row.owner)
    ].filter((value): value is string => Boolean(value)))),
    operations: new Set(snapshot.rows.planning_operation.map((row) =>
      requiredString(row.name, 'planning_operation.name')
    ))
  };
}

export function buildFreppleInput(
  snapshot: PlanningDataSnapshot,
  parameters: PlanningSolverParameters
) {
  return new FreppleInputBuilder().build(snapshot, parameters);
}

class SnapshotLookup {
  private readonly maps = new Map<string, { idByName: Map<string, string>; nameById: Map<string, string> }>();
  private readonly itemTypes = new Map<string, string>();

  constructor(snapshot: PlanningDataSnapshot) {
    for (const [entity, table] of Object.entries({
      calendar: 'planning_calendar',
      customer: 'planning_customer',
      demand: 'planning_demand',
      item: 'planning_item',
      location: 'planning_location',
      operation: 'planning_operation',
      resource: 'planning_resource',
      setupmatrix: 'planning_setupmatrix',
      skill: 'planning_skill',
      supplier: 'planning_supplier'
    }) as Array<[string, keyof PlanningDataSnapshot['rows']]>) {
      const idByName = new Map<string, string>();
      const nameById = new Map<string, string>();
      for (const row of snapshot.rows[table]) {
        const name = requiredString(row.name, `${table}.name`);
        idByName.set(name, row.id);
        nameById.set(row.id, name);
      }
      this.maps.set(entity, { idByName, nameById });
    }
    const bucketNames = new Map(
      snapshot.rows.planning_bucket.map((row) => [row.id, requiredString(row.name, 'planning_bucket.name')])
    );
    const calendar = this.maps.get('calendar')!;
    for (const [id, name] of bucketNames) {
      calendar.idByName.set(name, id);
      calendar.nameById.set(id, name);
    }
    for (const row of snapshot.rows.planning_item) {
      this.itemTypes.set(row.id, stringValue(row.type) ?? 'make to stock');
    }
  }

  name(entity: string, value: unknown) {
    const id = stringValue(value);
    if (!id) return undefined;
    const name = this.maps.get(entity)?.nameById.get(id);
    if (!name) throw new Error(`Unknown ${entity} id ${id} while building frePPLe input.`);
    return name;
  }

  ref(entity: string, value: unknown): FreppleReference | undefined {
    const name = this.name(entity, value);
    return name ? { name } : undefined;
  }

  bufferBatch(itemValue: unknown, batchValue: unknown) {
    const itemId = stringValue(itemValue);
    if (!itemId || this.itemTypes.get(itemId) !== 'make to order') return undefined;
    return stringValue(batchValue);
  }

  bufferName(itemValue: unknown, locationValue: unknown, batchValue?: unknown) {
    const item = this.name('item', itemValue);
    const location = this.name('location', locationValue);
    if (!item || !location) throw new Error('A frePPLe buffer requires an item and location.');
    const batch = this.bufferBatch(itemValue, batchValue);
    return batch ? `${item} @ ${batch} @ ${location}` : `${item} @ ${location}`;
  }

  resultNames(): PlanningNameIndex {
    return Object.fromEntries(
      (['customer', 'demand', 'item', 'location', 'operation', 'resource', 'supplier'] as PlanningNameEntity[])
        .map((entity) => [entity, this.maps.get(entity)!])
    ) as PlanningNameIndex;
  }
}

function hierarchy(
  row: PlanningRow,
  lookup: SnapshotLookup,
  entity: 'customer' | 'item' | 'location' | 'resource' | 'supplier',
  fields: FreppleObject = {}
) {
  return compact({
    name: requiredString(row.name, `planning_${entity}.name`),
    owner: lookup.ref(entity, row.owner_id),
    description: stringValue(row.description),
    category: stringValue(row.category),
    subcategory: stringValue(row.subcategory),
    source: stringValue(row.source),
    ...fields
  });
}

class CategoryLookup {
  private readonly byId: Map<string, PlanningRow>;

  constructor(rows: PlanningRow[]) {
    this.byId = new Map(rows.map((row) => [row.id, row]));
  }

  freppleFields(row: PlanningRow, targetType: 'item' | 'customer' | 'supplier') {
    const selected = this.byId.get(stringValue(row.category_id) ?? '');
    if (!selected || stringValue(selected.target_type) !== targetType) {
      return {
        category: stringValue(row.category),
        subcategory: stringValue(row.subcategory)
      };
    }
    let root = selected;
    const visited = new Set([selected.id]);
    while (true) {
      const parentId = stringValue(root.parent_id);
      if (!parentId || visited.has(parentId)) break;
      const parent = this.byId.get(parentId);
      if (!parent || stringValue(parent.target_type) !== targetType) break;
      visited.add(parentId);
      root = parent;
    }
    return {
      category: stringValue(root.name),
      subcategory: root.id === selected.id ? undefined : stringValue(selected.name)
    };
  }
}

function calendarBucket(row: PlanningRow) {
  return compact({
    start: dateValue(row.startdate),
    end: engineEndDate(row.enddate),
    priority: numberValue(row.priority),
    value: numberValue(row.value),
    days: calendarDays(row),
    // frePPLe's JSON reader expects calendar clock fields as raw seconds. Its
    // generic duration reader treats ISO strings such as "PT8H" as atol("PT8H") = 0.
    starttime: timeSeconds(row.starttime),
    endtime: Math.min(timeSeconds(row.endtime, 86_399) + 1, 86_400),
    source: stringValue(row.source)
  });
}

function calendarDays(row: PlanningRow) {
  return [
    ['sunday', 1],
    ['monday', 2],
    ['tuesday', 4],
    ['wednesday', 8],
    ['thursday', 16],
    ['friday', 32],
    ['saturday', 64]
  ].reduce((sum, [field, bit]) => sum + (booleanValue(row[String(field)]) ? Number(bit) : 0), 0);
}

function mergeSuboperations(
  explicitRows: PlanningRow[],
  ownedRows: PlanningRow[],
  lookup: SnapshotLookup
) {
  const seen = new Set<string>();
  const result: FreppleObject[] = [];
  for (const row of explicitRows) {
    const id = requiredString(row.suboperation_id, 'planning_suboperation.suboperation_id');
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(compact({
      operation: lookup.ref('operation', id),
      priority: numberValue(row.priority),
      effective_start: dateValue(row.effective_start),
      effective_end: engineEndDate(row.effective_end),
      source: stringValue(row.source)
    }));
  }
  for (const row of ownedRows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(compact({
      operation: lookup.ref('operation', row.id),
      priority: numberValue(row.priority),
      effective_start: dateValue(row.effective_start),
      effective_end: engineEndDate(row.effective_end),
      source: stringValue(row.source)
    }));
  }
  return result;
}

function buildDemands(rows: PlanningRow[], lookup: SnapshotLookup) {
  const demandNames = new Set(rows.map((row) => requiredString(row.name, 'planning_demand.name')));
  const groups = new Map<string, string>();
  for (const row of rows) {
    const owner = stringValue(row.owner);
    if (owner && !demandNames.has(owner)) groups.set(owner, stringValue(row.policy) ?? 'independent');
  }
  return [
    ...[...groups].map(([name, policy]) => compact({
      type: 'demand_group',
      name,
      policy
    })),
    ...rows.map((row) => compact({
      name: requiredString(row.name, 'planning_demand.name'),
      owner: stringValue(row.owner) ? { name: stringValue(row.owner)! } : undefined,
      description: stringValue(row.description),
      category: stringValue(row.category),
      subcategory: stringValue(row.subcategory),
      customer: lookup.ref('customer', row.customer_id),
      item: lookup.ref('item', row.item_id),
      location: lookup.ref('location', row.location_id),
      operation: lookup.ref('operation', row.operation_id),
      due: dateValue(row.due),
      status: stringValue(row.status),
      quantity: numberValue(row.quantity),
      priority: numberValue(row.priority),
      minshipment: numberValue(row.minshipment),
      maxlateness: duration(row.maxlateness),
      batch: stringValue(row.batch),
      source: stringValue(row.source)
    }))
  ];
}

function selectLockedOperationPlans(rows: PlanningRow[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const selected = new Set(rows
    .filter((row) => LOCKED_STATUSES.has(stringValue(row.status) ?? ''))
    .map((row) => row.id));
  for (const id of [...selected]) {
    let owner = stringValue(byId.get(id)?.owner_id);
    while (owner && byId.has(owner) && !selected.has(owner)) {
      selected.add(owner);
      owner = stringValue(byId.get(owner)?.owner_id);
    }
  }
  const result: PlanningRow[] = [];
  const emitted = new Set<string>();
  const visiting = new Set<string>();
  const emit = (row: PlanningRow) => {
    if (emitted.has(row.id)) return;
    if (visiting.has(row.id)) {
      throw new Error(`Operationplan owner cycle detected at ${row.id}.`);
    }
    visiting.add(row.id);
    const ownerId = stringValue(row.owner_id);
    const owner = ownerId ? byId.get(ownerId) : undefined;
    if (owner && selected.has(owner.id)) emit(owner);
    visiting.delete(row.id);
    emitted.add(row.id);
    result.push(row);
  };
  for (const row of rows) {
    if (selected.has(row.id)) emit(row);
  }
  return result;
}

function operationPlanOwner(row: PlanningRow, rows: PlanningRow[]) {
  const ownerId = stringValue(row.owner_id);
  if (!ownerId) return undefined;
  const owner = rows.find((candidate) => candidate.id === ownerId);
  const reference = stringValue(owner?.reference);
  if (!reference) throw new Error(`Unknown operationplan owner ${ownerId}.`);
  return { reference };
}

function operationPlanLocation(row: PlanningRow, lookup: SnapshotLookup) {
  const type = stringValue(row.type);
  if (type === 'DO') return lookup.ref('location', row.destination_id ?? row.location_id);
  return lookup.ref('location', row.location_id);
}

function normalizeInputFlowplanStatus(value: unknown) {
  const status = stringValue(value);
  if (!status || status === 'confirmed' || status === 'closed') return 'confirmed';
  return status;
}

function bufferName(row: PlanningRow, lookup: SnapshotLookup) {
  return lookup.bufferName(row.item_id, row.location_id, row.batch);
}

function supplierCalendarLocations(rows: PlanningRow[], lookup: SnapshotLookup) {
  return rows.flatMap((row) => {
    const available = lookup.ref('calendar', row.available_id);
    if (!available) return [];
    return [compact({
      name: requiredString(row.name, 'planning_supplier.name'),
      available,
      source: 'planning_supplier.available_id'
    })];
  });
}

function groupBy(rows: PlanningRow[], field: string) {
  const result = new Map<string, PlanningRow[]>();
  for (const row of rows) {
    const key = stringValue(row[field]);
    if (!key) continue;
    result.set(key, [...(result.get(key) ?? []), row]);
  }
  return result;
}

function compact<T extends FreppleObject>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
  ) as T;
}

function requiredString(value: unknown, field: string) {
  const result = stringValue(value);
  if (!result) throw new Error(`${field} is required while building frePPLe input.`);
  return result;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric frePPLe input value: ${String(value)}`);
  return parsed;
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['true', 't', '1', 'yes', 'on'].includes(value.toLowerCase());
  return undefined;
}

function dateValue(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid frePPLe input date: ${String(value)}`);
  return date.toISOString();
}

function engineEndDate(value: unknown) {
  const date = dateValue(value);
  return date?.startsWith('2030-12-31') ? undefined : date;
}

export function duration(value: unknown) {
  // planning-data-loader normalizes PostgreSQL intervals to seconds. The
  // frePPLe JSON reader accepts numeric seconds for Duration fields, while
  // string values are parsed with atol (so ISO values such as PT8H become 0).
  return numberValue(value);
}

function timeSeconds(value: unknown, fallback = 0) {
  const text = stringValue(value);
  if (!text) return fallback;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(text);
  if (!match) throw new Error(`Invalid frePPLe input time: ${text}`);
  return Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3] ?? 0) +
    Number(`0.${match[4] ?? '0'}`);
}
