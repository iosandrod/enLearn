import { readFile } from "node:fs/promises";

import { XMLParser } from "fast-xml-parser";

import {
  INFINITE_PAST,
  parseDate,
  parseDuration
} from "@suanfa/kernel";

import {
  Calendar,
  type CalendarBucketInput
} from "@suanfa/model";

import {
  solveMaterialPlan,
  type ConfirmedReceipt,
  type ManufacturingOperation,
  type ManufacturingOperationType,
  type ManufacturingSubOperation,
  type MaterialBuffer,
  type MaterialDemand,
  type MaterialFlow,
  type MaterialLoad,
  type MaterialLocation,
  type MaterialPlan,
  type MaterialPlanEvent,
  type MaterialPlanInput,
  type MaterialResource,
  type OperationPlanInput,
  type ProcurementSource,
  type PurchasePlan,
  type ResourcePlanEvent
} from "./mrp.js";

type XmlRecord = Record<string, unknown>;

export async function loadMaterialFixture(path: string): Promise<MaterialPlanInput> {
  return parseMaterialFixture(await readFile(path, "utf8"));
}

export function parseMaterialFixture(xml: string): MaterialPlanInput {
  const plan = planRecord(xml);
  const buffers = parseBuffers(plan);
  const locations = parseLocations(plan);
  const resources = parseResources(plan);
  const operations = parseOperations(plan, buffers, resources.loadsByOperation);
  const demands = parseDemands(plan);
  const sources = parseSources(plan);
  const confirmed = parseConfirmedReceipts(plan, sources);
  const operationPlans = parseOperationPlans(plan, operations);
  return {
    current: parseDate(requiredText(plan.current, "plan current")),
    buffers: ensureDemandBuffers(buffers, demands),
    sources,
    demands,
    confirmedReceipts: confirmed.receipts,
    confirmedPurchases: confirmed.purchases,
    ...(locations.length > 0 ? { locations } : {}),
    ...(resources.resources.length > 0 ? { resources: resources.resources } : {}),
    ...(operations.length > 0 ? { operations } : {}),
    ...(operationPlans.length > 0 ? { operationPlans } : {})
  };
}

function parseLocations(plan: XmlRecord): readonly MaterialLocation[] {
  return sectionRecords(plan, "locations", "location").map((location) => {
    const name = requiredName(location, "location");
    const availability = parseCalendar(
      asRecord(location.available),
      `${name} availability`
    );
    return {
      name,
      ...(availability === undefined ? {} : { availability })
    };
  });
}

export async function compareMaterialFixture(
  plan: MaterialPlan,
  expectedPath: string
): Promise<readonly string[]> {
  return compareMaterialOutput(plan, await readFile(expectedPath, "utf8"));
}

export function compareMaterialOutput(
  plan: MaterialPlan,
  expectedOutput: string
): readonly string[] {
  const lines = expectedOutput.split(/\r?\n/);
  const expected = lines.flatMap(parseExpectedEvent);
  const expectedDemands = lines.flatMap(parseExpectedDemand);
  const expectedOperations = lines.flatMap(parseExpectedOperation);
  const expectedResources = lines.flatMap(parseExpectedResource);
  const hasExpectedDemands = lines.some(
    (line) => line.split("\t")[0] === "DEMAND"
  );
  const hasExpectedOperations = lines.some(
    (line) => line.split("\t")[0] === "OPERATION"
  );
  const hasExpectedResources = lines.some(
    (line) => line.split("\t")[0] === "RESOURCE"
  );
  const expectedPurchases = expectedOperations.filter((operation) =>
    operation.name.startsWith("Purchase ")
  );
  const expectedOperationPlans = expectedOperations.filter(
    (operation) => !operation.name.startsWith("Purchase ")
  );
  const actual = plan.events;
  const differences: string[] = [];
  if (actual.length !== expected.length) {
    differences.push(
      `Expected ${expected.length} material events, got ${actual.length}`
    );
  }
  const count = Math.min(actual.length, expected.length);
  for (let index = 0; index < count; index += 1) {
    const actualEvent = actual[index];
    const expectedEvent = expected[index];
    if (!actualEvent || !expectedEvent) {
      continue;
    }
    compareEvent(index, actualEvent, expectedEvent, differences);
  }
  if (hasExpectedDemands) {
    compareDemands(
      plan.demandPlans ?? [],
      expectedDemands,
      differences
    );
  }
  if (hasExpectedOperations) {
    compareOperationPlans(
      plan.operationPlans ?? [],
      expectedOperationPlans,
      differences
    );
    comparePurchases(plan.purchases, expectedPurchases, differences);
  }
  if (hasExpectedResources) {
    compareResourceEvents(plan.resourceEvents ?? [], expectedResources, differences);
  }
  return differences;
}

export function solveMaterialFixture(input: MaterialPlanInput): MaterialPlan {
  return solveMaterialPlan(input);
}

function parseBuffers(plan: XmlRecord): readonly MaterialBuffer[] {
  return sectionRecords(plan, "buffers", "buffer").map((buffer) => {
    const minimum = optionalNumber(buffer.minimum);
    const maximum = optionalNumber(buffer.maximum);
    return {
      name: requiredName(buffer, "buffer"),
      item: requiredEntityName(buffer.item, "buffer item"),
      location: entityName(buffer.location) ?? "",
      onhand: optionalNumber(buffer.onhand) ??
        optionalNumber(buffer["@_onhand"]) ??
        0,
      ...(minimum === undefined ? {} : { minimum }),
      ...(maximum === undefined ? {} : { maximum })
    };
  });
}

function parseOperations(
  plan: XmlRecord,
  buffers: readonly MaterialBuffer[],
  loadsByOperation: ReadonlyMap<string, readonly MaterialLoad[]>
): readonly ManufacturingOperation[] {
  const operations = new Map<string, ManufacturingOperation>();
  const flowsByOperation = new Map<string, XmlRecord[]>();
  for (const flow of sectionRecords(plan, "flows", "flow")) {
    const operation = entityName(flow.operation);
    if (!operation) {
      continue;
    }
    const flows = flowsByOperation.get(operation) ?? [];
    flows.push(flow);
    flowsByOperation.set(operation, flows);
  }
  const add = (raw: XmlRecord, fallback?: Partial<ManufacturingOperation>): void => {
    const operation = parseOperation(
      raw,
      buffers,
      fallback,
      flowsByOperation,
      loadsByOperation
    );
    const existing = operations.get(operation.name);
    if (!existing || operation.flows.length > existing.flows.length) {
      operations.set(operation.name, operation);
    }
    for (const subOperation of operation.subOperations) {
      addOperationTree(operations, subOperation.operation);
    }
  };

  for (const raw of sectionRecords(plan, "operations", "operation")) {
    add(raw);
  }
  for (const buffer of sectionRecords(plan, "buffers", "buffer")) {
    const producing = asRecord(buffer.producing);
    if (producing) {
      const item = entityName(buffer.item);
      add(producing, {
        ...(item === undefined ? {} : { item }),
        location: entityName(buffer.location) ?? ""
      });
    }
  }
  for (const rawDemand of sectionRecords(plan, "demands", "demand")) {
    const operation = asRecord(rawDemand.operation);
    if (operation) {
      add(operation);
    }
  }
  // Some fixtures define supplying operations only on their flow records.
  // Keep their priority (notably priority=0, which disables auto supply) so
  // confirmed operation plans can still be applied to the matching flows.
  for (const flows of flowsByOperation.values()) {
    for (const flow of flows) {
      const operation = asRecord(flow.operation);
      const name = entityName(flow.operation);
      if (name && !operations.has(name)) {
        add(operation ?? { name });
      }
    }
  }
  const normalized = [...operations.values()].map((operation) =>
    normalizeOperationTree(operation, operations)
  );
  return normalized.sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

function addOperationTree(
  operations: Map<string, ManufacturingOperation>,
  operation: ManufacturingOperation
): void {
  const existing = operations.get(operation.name);
  if (!existing || operation.flows.length > existing.flows.length) {
    operations.set(operation.name, operation);
  }
  for (const subOperation of operation.subOperations) {
    addOperationTree(operations, subOperation.operation);
  }
}

function normalizeOperationTree(
  operation: ManufacturingOperation,
  operations: ReadonlyMap<string, ManufacturingOperation>,
  stack: ReadonlySet<string> = new Set(),
  cache = new Map<string, ManufacturingOperation>()
): ManufacturingOperation {
  const cached = cache.get(operation.name);
  if (cached) {
    return cached;
  }
  const canonical = operations.get(operation.name) ?? operation;
  if (stack.has(canonical.name)) {
    return canonical;
  }
  const nextStack = new Set(stack);
  nextStack.add(canonical.name);
  const subOperations = canonical.subOperations.map((subOperation) => ({
    ...subOperation,
    operation: normalizeOperationTree(
      subOperation.operation,
      operations,
      nextStack,
      cache
    )
  }));
  const normalized = subOperations.every(
    (subOperation, index) =>
      subOperation.operation === canonical.subOperations[index]?.operation
  )
    ? canonical
    : {
        ...canonical,
        subOperations
      };
  cache.set(canonical.name, normalized);
  return normalized;
}

function parseOperation(
  raw: XmlRecord,
  buffers: readonly MaterialBuffer[],
  fallback: Partial<ManufacturingOperation> = {},
  flowsByOperation: ReadonlyMap<string, readonly XmlRecord[]> = new Map(),
  loadsByOperation: ReadonlyMap<string, readonly MaterialLoad[]> = new Map()
): ManufacturingOperation {
  const name = requiredName(raw, "operation");
  const type = parseOperationType(
    optionalText(raw["@_xsi:type"]) ?? optionalText(raw.type)
  );
  const durationSeconds = optionalDuration(
    raw.duration ?? raw["@_duration"]
  );
  const durationPerSeconds = optionalDuration(
    raw.duration_per ?? raw["@_duration_per"]
  );
  const operationLocation = fallback.location ?? entityName(raw.location) ?? "";
  const flows = uniqueFlows([
    ...(flowsByOperation.get(name) ?? []).map((flow) =>
      parseFlow(flow, buffers, operationLocation)
    ),
    ...sectionChildren(raw, "flows", "flow").map((flow) =>
      parseFlow(flow, buffers, operationLocation)
    )
  ]);
  const subOperations = sectionChildren(raw, "suboperations", "suboperation").map(
    (subOperation) => {
      const operationRecord = asRecord(subOperation.operation);
      if (!operationRecord) {
        throw new Error(`Operation ${name} has an invalid suboperation`);
      }
      return {
        operation: parseOperation(
          operationRecord,
          buffers,
          fallback,
          flowsByOperation,
          loadsByOperation
        ),
        priority: optionalNumber(subOperation.priority) ?? 1,
        ...(optionalText(subOperation.effective_start) === undefined
          ? {}
          : {
              effectiveStart: parseDate(
                optionalText(subOperation.effective_start)!
              )
            }),
        ...(optionalText(subOperation.effective_end) === undefined
          ? {}
          : {
              effectiveEnd: parseDate(
                optionalText(subOperation.effective_end)!
              )
            })
      } satisfies ManufacturingSubOperation;
    }
  );
  const priority = optionalNumber(raw.priority) ?? 1;
  const fenceSeconds = optionalDuration(raw.fence);
  const location = fallback.location ?? entityName(raw.location);
  const item = fallback.item ?? entityName(raw.item);
  const minimumQuantity = optionalNumber(
    raw.size_minimum ?? raw["@_size_minimum"]
  );
  const maximumQuantity = optionalNumber(
    raw.size_maximum ?? raw["@_size_maximum"]
  );
  const multipleQuantity = optionalNumber(
    raw.size_multiple ?? raw["@_size_multiple"]
  );
  const loads = loadsByOperation.get(name);
  return {
    name,
    type,
    durationSeconds: durationSeconds ?? 0,
    durationPerSeconds: durationPerSeconds ?? 0,
    priority,
    ...(location === undefined ? {} : { location }),
    ...(item === undefined ? {} : { item }),
    ...(minimumQuantity === undefined ? {} : { minimumQuantity }),
    ...(maximumQuantity === undefined ? {} : { maximumQuantity }),
    ...(multipleQuantity === undefined ? {} : { multipleQuantity }),
    flows,
    ...(loads === undefined ? {} : { loads }),
    subOperations,
    ...(fenceSeconds === undefined ? {} : { fenceSeconds })
  };
}

function uniqueFlows(flows: readonly MaterialFlow[]): readonly MaterialFlow[] {
  const unique = new Map<string, MaterialFlow>();
  for (const flow of flows) {
    const key = [
      flow.buffer,
      flow.quantity,
      flow.quantityFixed,
      flow.type,
      flow.offsetSeconds ?? "",
      flow.effectiveStart ?? "",
      flow.effectiveEnd ?? ""
    ].join("\u0000");
    unique.set(key, flow);
  }
  return [...unique.values()];
}

function parseResources(plan: XmlRecord): {
  readonly resources: readonly MaterialResource[];
  readonly loadsByOperation: ReadonlyMap<string, readonly MaterialLoad[]>;
} {
  const resources = new Map<string, MaterialResource>();
  const loadsByOperation = new Map<string, MaterialLoad[]>();
  const addResource = (resource: XmlRecord): string => {
    const name = requiredName(resource, "resource");
    const maximum =
      optionalNumber(resource.maximum) ??
      optionalNumber(resource["@_maximum"]) ??
      maximumCalendarValue(resource);
    const maxEarly = optionalDuration(
      resource.maxearly ?? resource["@_maxearly"]
    );
    const availability = parseCalendar(
      asRecord(resource.available),
      `${name} availability`
    );
    const existing = resources.get(name);
    if (
      !existing ||
      (existing.maximum === undefined && maximum !== undefined) ||
      (existing.maxEarlySeconds === undefined && maxEarly !== undefined) ||
      (existing.availability === undefined && availability !== undefined)
    ) {
      resources.set(name, {
        name,
        ...(maximum === undefined ? {} : { maximum }),
        ...(maxEarly === undefined ? {} : { maxEarlySeconds: maxEarly }),
        ...(availability === undefined ? {} : { availability })
      });
    }
    return name;
  };
  const addLoad = (operation: string, resource: string, quantity: number): void => {
    const loads = loadsByOperation.get(operation) ?? [];
    if (!loads.some((load) => load.resource === resource && load.quantity === quantity)) {
      loads.push({ resource, quantity });
      loadsByOperation.set(operation, loads);
    }
  };
  const visitOperation = (operation: XmlRecord): void => {
    const operationName = entityName(operation);
    if (!operationName) {
      return;
    }
    for (const load of sectionChildren(operation, "loads", "load")) {
      const resource = asRecord(load.resource);
      if (!resource) {
        continue;
      }
      const resourceName = addResource(resource);
      addLoad(
        operationName,
        resourceName,
        optionalNumber(load.quantity) ??
          optionalNumber(load["@_quantity"]) ??
          1
      );
    }
    for (const subOperation of sectionChildren(operation, "suboperations", "suboperation")) {
      const child = asRecord(subOperation.operation);
      if (child) {
        visitOperation(child);
      }
    }
  };

  for (const resource of sectionRecords(plan, "resources", "resource")) {
    const name = addResource(resource);
    for (const load of sectionChildren(resource, "loads", "load")) {
      const operation = entityName(load.operation);
      if (operation) {
        addLoad(
          operation,
          name,
          optionalNumber(load.quantity) ??
            optionalNumber(load["@_quantity"]) ??
            1
        );
      }
    }
  }
  for (const operation of sectionRecords(plan, "operations", "operation")) {
    visitOperation(operation);
  }
  for (const buffer of sectionRecords(plan, "buffers", "buffer")) {
    const producing = asRecord(buffer.producing);
    if (producing) {
      visitOperation(producing);
    }
  }
  for (const demand of sectionRecords(plan, "demands", "demand")) {
    const operation = asRecord(demand.operation);
    if (operation) {
      visitOperation(operation);
    }
  }
  return {
    resources: [...resources.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    loadsByOperation
  };
}

function parseCalendar(
  raw: XmlRecord | undefined,
  fallbackName: string
): Calendar | undefined {
  if (!raw) {
    return undefined;
  }
  const defaultValue = optionalNumber(raw.default) ??
    optionalNumber(raw["@_default"]) ??
    0;
  const buckets: CalendarBucketInput[] = [];
  for (const bucket of sectionChildren(raw, "buckets", "bucket")) {
    const startText = optionalText(bucket.start) ??
      optionalText(bucket["@_start"]);
    const endText = optionalText(bucket.end) ??
      optionalText(bucket["@_end"]);
    const startTimeText = optionalText(bucket.starttime) ??
      optionalText(bucket["@_starttime"]);
    const endTimeText = optionalText(bucket.endtime) ??
      optionalText(bucket["@_endtime"]);
    const start = startText ? parseDate(startText) : INFINITE_PAST;
    const end = endText ? parseDate(endText) : undefined;
    const startTime = startTimeText
      ? parseDuration(startTimeText)
      : undefined;
    const endTime = endTimeText
      ? parseDuration(endTimeText)
      : undefined;
    const value = optionalNumber(bucket.value) ??
      optionalNumber(bucket["@_value"]) ??
      defaultValue;
    const days = optionalNumber(bucket.days) ??
      optionalNumber(bucket["@_days"]);
    buckets.push({
      start,
      ...(end === undefined ? {} : { end }),
      value,
      ...(days === undefined ? {} : { days }),
      ...(startTime === undefined ? {} : { startTime }),
      ...(endTime === undefined ? {} : { endTime })
    });
  }
  const name = optionalText(raw["@_name"]) ??
    optionalText(raw.name) ??
    fallbackName;
  return new Calendar(name, defaultValue, buckets);
}

function maximumCalendarValue(resource: XmlRecord): number | undefined {
  const calendar = asRecord(resource.maximum_calendar);
  if (!calendar) {
    return undefined;
  }
  const bucket = sectionChildren(calendar, "buckets", "bucket")[0];
  return bucket
    ? optionalNumber(bucket.value) ?? optionalNumber(bucket["@_value"])
    : undefined;
}

function parseOperationType(value: string | undefined): ManufacturingOperationType {
  switch (value) {
    case "operation_time_per":
      return "time_per";
    case "operation_routing":
      return "routing";
    case "operation_alternate":
      return "alternate";
    case "operation_split":
      return "split";
    case "operation_fixed_time":
    default:
      return "fixed_time";
  }
}

function parseFlow(
  raw: XmlRecord,
  buffers: readonly MaterialBuffer[],
  operationLocation: string
): MaterialFlow {
  const explicitBuffer = entityName(raw.buffer);
  const item = entityName(raw.item);
  const buffer = explicitBuffer ??
    findBufferName(buffers, item, operationLocation) ??
    inferredBufferName(item, operationLocation);
  if (!buffer) {
    throw new Error("Flow has no buffer reference");
  }
  const type = optionalText(raw["@_xsi:type"]) === "flow_start"
    ? "start"
    : "end";
  const offsetSeconds = optionalDuration(raw.offset);
  const effectiveStart = optionalText(raw.effective_start);
  const effectiveEnd = optionalText(raw.effective_end);
  return {
    buffer,
    quantity: optionalNumber(raw.quantity) ?? 0,
    quantityFixed: optionalNumber(raw.quantity_fixed) ?? 0,
    type,
    ...(offsetSeconds === undefined ? {} : { offsetSeconds }),
    ...(effectiveStart ? { effectiveStart: parseDate(effectiveStart) } : {}),
    ...(effectiveEnd ? { effectiveEnd: parseDate(effectiveEnd) } : {})
  };
}

function findBufferName(
  buffers: readonly MaterialBuffer[],
  item: string | undefined,
  location: string
): string | undefined {
  if (!item) {
    return undefined;
  }
  return buffers.find(
    (buffer) =>
      buffer.item === item &&
      (buffer.location === location || buffer.location === "")
  )?.name;
}

function inferredBufferName(
  item: string | undefined,
  location: string
): string | undefined {
  if (!item) {
    return undefined;
  }
  return location ? `${item} @ ${location}` : item;
}

function parseSources(plan: XmlRecord): readonly ProcurementSource[] {
  const directSources: ProcurementSource[] = [];
  for (const supplier of sectionRecords(plan, "suppliers", "supplier")) {
    const supplierName = requiredName(supplier, "supplier");
    for (const source of records(asRecord(supplier.itemsuppliers)?.itemsupplier)) {
      directSources.push(parseSource(source, supplierName));
    }
  }
  const children = new Map<string, Set<string>>();
  for (const item of records(asRecord(plan.items)?.item)) {
    const itemName = requiredName(item, "item");
    const owner = entityName(item.owner);
    if (owner) {
      linkItem(children, owner, itemName);
    }
    for (const member of records(asRecord(item.members)?.item)) {
      linkItem(children, itemName, requiredName(member, "item member"));
    }
    for (const source of records(asRecord(item.itemsuppliers)?.itemsupplier)) {
      directSources.push(
        parseSource(
          source,
          requiredEntityName(source.supplier, "supplier"),
          itemName
        )
      );
    }
  }

  const sources = [...directSources];
  for (const source of directSources) {
    for (const item of descendantItems(children, source.item)) {
      sources.push({ ...source, item, inherited: true });
    }
  }
  return uniqueSources(sources);
}

function parseSource(
  source: XmlRecord,
  supplier: string,
  item = requiredEntityName(source.item, "supplier item")
): ProcurementSource {
  const location = entityName(source.location);
  return {
    item,
    supplier,
    leadTimeSeconds: optionalDuration(source.leadtime) ?? 0,
    extraSafetyLeadTimeSeconds: optionalDuration(source.extra_safety_leadtime) ?? 0,
    hardSafetyLeadTimeSeconds: optionalDuration(source.hard_safety_leadtime) ?? 0,
    minimumQuantity: optionalNumber(source.size_minimum) ?? 0,
    multipleQuantity: optionalNumber(source.size_multiple) ?? 0,
    priority: optionalNumber(source.priority) ?? 1,
    ...(location === undefined ? {} : { location })
  };
}

function linkItem(
  children: Map<string, Set<string>>,
  parent: string,
  child: string
): void {
  const entries = children.get(parent) ?? new Set<string>();
  entries.add(child);
  children.set(parent, entries);
}

function descendantItems(
  children: ReadonlyMap<string, ReadonlySet<string>>,
  root: string
): readonly string[] {
  const descendants: string[] = [];
  const pending = [...(children.get(root) ?? [])].sort().reverse();
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item) {
      continue;
    }
    descendants.push(item);
    const nested = [...(children.get(item) ?? [])].sort().reverse();
    pending.push(...nested);
  }
  return descendants;
}

function uniqueSources(
  sources: readonly ProcurementSource[]
): readonly ProcurementSource[] {
  const unique = new Map<string, ProcurementSource>();
  for (const source of sources) {
    const key = [
      source.item,
      source.supplier,
      source.location ?? "",
      source.leadTimeSeconds,
      source.extraSafetyLeadTimeSeconds,
      source.hardSafetyLeadTimeSeconds,
      source.minimumQuantity,
      source.multipleQuantity,
      source.priority,
      Boolean(source.inherited)
    ].join("\u0000");
    unique.set(key, source);
  }
  return [...unique.values()];
}

function parseDemands(plan: XmlRecord): readonly MaterialDemand[] {
  return sectionRecords(plan, "demands", "demand").flatMap((demand) => {
    if (demand["@_xsi:type"] === "demand_forecast" || optionalText(demand.status) === "closed") {
      return [];
    }
    const item = entityName(demand.item);
    const location = entityName(demand.location) ?? "";
    const due = optionalText(demand.due);
    const quantity = optionalNumber(demand.quantity);
    if (!item || !due || quantity === undefined) {
      return [];
    }
    const maxLatenessSeconds = optionalDuration(demand.maxlateness);
    return [{
      name: requiredName(demand, "demand"),
      item,
      location,
      due: parseDate(due),
      quantity,
      minimumShipment: optionalNumber(demand.minshipment) ?? quantity,
      priority: optionalNumber(demand.priority) ?? 0,
      ...parseDemandOperation(demand),
      ...(maxLatenessSeconds === undefined ? {} : { maxLatenessSeconds })
    }];
  });
}

function parseConfirmedReceipts(
  plan: XmlRecord,
  sources: readonly ProcurementSource[]
): {
  readonly receipts: readonly ConfirmedReceipt[];
  readonly purchases: readonly PurchasePlan[];
} {
  const receipts: ConfirmedReceipt[] = [];
  const purchases: PurchasePlan[] = [];
  for (const operationPlan of sectionRecords(plan, "operationplans", "operationplan")) {
    const orderType = optionalText(operationPlan["@_ordertype"]) ?? optionalText(operationPlan.ordertype);
    if (orderType !== "PO") {
      continue;
    }
    const item = entityName(operationPlan.item);
    const location = entityName(operationPlan.location);
    const end = optionalText(operationPlan.end) ?? optionalText(operationPlan["@_end"]);
    const quantity = optionalNumber(operationPlan.quantity) ?? optionalNumber(operationPlan["@_quantity"]);
    if (!item || !location || !end || quantity === undefined) {
      continue;
    }
    const endDate = parseDate(end);
    receipts.push({ item, location, end: endDate, quantity });
    const explicitSupplier = entityName(operationPlan.supplier);
    const source = matchingSourceForPurchase(
      sources,
      item,
      location,
      explicitSupplier
    );
    const supplier = explicitSupplier ?? source?.supplier;
    if (!supplier) {
      continue;
    }
    const status =
      optionalText(operationPlan.status) ??
      optionalText(operationPlan["@_status"]);
    const suppliedStart = optionalText(operationPlan.start) ?? optionalText(operationPlan["@_start"]);
    const startDate = suppliedStart
      ? parseDate(suppliedStart)
      : source
        ? (
          endDate -
          source.leadTimeSeconds -
          source.hardSafetyLeadTimeSeconds
        ) as ReturnType<typeof parseDate>
        : endDate;
    purchases.push({
      name: `Purchase ${item} @ ${location} from ${supplier}`,
      item,
      location,
      supplier,
      start: Math.min(startDate, endDate) as ReturnType<typeof parseDate>,
      end: endDate,
      quantity,
      ...(status === "confirmed"
        ? { confirmed: true }
        : {})
    });
  }
  return { receipts, purchases };
}

function matchingSourceForPurchase(
  sources: readonly ProcurementSource[],
  item: string,
  location: string,
  supplier?: string
): ProcurementSource | undefined {
  return [...sources]
    .filter(
      (source) =>
        source.item === item &&
        (supplier === undefined || source.supplier === supplier) &&
        (source.location === undefined || source.location === location)
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        Number(Boolean(left.inherited)) - Number(Boolean(right.inherited)) ||
        left.leadTimeSeconds - right.leadTimeSeconds ||
        left.supplier.localeCompare(right.supplier)
    )[0];
}

function parseDemandOperation(
  demand: XmlRecord
): Pick<MaterialDemand, "operation" | "fenceSeconds"> | Record<never, never> {
  const operation = asRecord(demand.operation);
  if (!operation) {
    return {};
  }
  const name = entityName(operation);
  const fence = optionalText(operation.fence);
  return {
    ...(name ? { operation: name } : {}),
    ...(fence ? { fenceSeconds: parseDuration(fence) } : {})
  };
}

function parseOperationPlans(
  plan: XmlRecord,
  operations: readonly ManufacturingOperation[]
): readonly OperationPlanInput[] {
  const operationMap = new Map(
    operations.map((operation) => [operation.name, operation])
  );
  return sectionRecords(plan, "operationplans", "operationplan").flatMap(
    (operationPlan) => {
      const operation = entityName(operationPlan.operation);
      const end = optionalText(operationPlan.end) ?? optionalText(operationPlan["@_end"]);
      const start = optionalText(operationPlan.start) ?? optionalText(operationPlan["@_start"]);
      const quantity =
        optionalNumber(operationPlan.quantity) ??
        optionalNumber(operationPlan["@_quantity"]);
      if (!operation || (!start && !end) || quantity === undefined) {
        return [];
      }
      const operationDefinition = operationMap.get(operation);
      const duration = operationDefinition
        ? operationDuration(operationDefinition, quantity)
        : 0;
      const startDate = start
        ? parseDate(start)
        : (parseDate(end!) - duration) as ReturnType<typeof parseDate>;
      const endDate = end
        ? parseDate(end)
        : (startDate + duration) as ReturnType<typeof parseDate>;
      const status =
        optionalText(operationPlan.status) ??
        optionalText(operationPlan["@_status"]);
      return [{
        name:
          optionalText(operationPlan["@_id"]) ??
          optionalText(operationPlan.id) ??
          operation,
        operation,
        start: startDate,
        end: endDate,
        quantity,
        ...(status === "confirmed"
          ? { confirmed: true }
          : {}),
        ...(status === "completed"
          ? { completed: true }
          : {})
      }];
    }
  );
}

function ensureDemandBuffers(
  buffers: readonly MaterialBuffer[],
  demands: readonly MaterialDemand[]
): readonly MaterialBuffer[] {
  const known = new Set(buffers.map((buffer) => `${buffer.item}\u0000${buffer.location}`));
  const synthetic: MaterialBuffer[] = [];
  for (const demand of demands) {
    const key = `${demand.item}\u0000${demand.location}`;
    if (known.has(key)) {
      continue;
    }
    known.add(key);
    synthetic.push({
      name: `${demand.item} @ ${demand.location}`,
      item: demand.item,
      location: demand.location,
      onhand: 0
    });
  }
  return [...buffers, ...synthetic];
}

function parseExpectedEvent(line: string): readonly MaterialPlanEvent[] {
  const columns = line.split("\t");
  if (columns[0] === "" && columns.length === 6) {
    const item = columns[1];
    const date = columns[2];
    const quantity = columns[3];
    const onhand = columns[4];
    const periodOfCover = columns[5];
    if (
      item === undefined ||
      date === undefined ||
      quantity === undefined ||
      onhand === undefined ||
      periodOfCover === undefined
    ) {
      return [];
    }
    return [{
      buffer: item,
      date: parseDate(date.replace(" ", "T")),
      quantity: Number(quantity),
      onhand: Number(onhand),
      periodOfCover: Number(periodOfCover)
    }];
  }
  if (columns[0] !== "BUFFER" || columns.length !== 5) {
    return [];
  }
  const buffer = columns[1];
  const date = columns[2];
  const quantity = columns[3];
  const onhand = columns[4];
  if (
    buffer === undefined ||
    date === undefined ||
    quantity === undefined ||
    onhand === undefined
  ) {
    return [];
  }
  return [{
    buffer,
    date: parseDate(date),
    quantity: Number(quantity),
    onhand: Number(onhand),
    periodOfCover: 0
  }];
}

function compareEvent(
  index: number,
  actual: MaterialPlanEvent,
  expected: MaterialPlanEvent,
  differences: string[]
): void {
  if (actual.buffer !== expected.buffer && actual.item !== expected.buffer) {
    differences.push(`Event ${index}: expected buffer ${expected.buffer}, got ${actual.buffer}`);
  }
  if (actual.date !== expected.date) {
    differences.push(`Event ${index}: expected date ${expected.date}, got ${actual.date}`);
  }
  for (const field of ["quantity", "onhand"] as const) {
    if (Math.abs(actual[field] - expected[field]) > 1e-9) {
      differences.push(
        `Event ${index} ${field}: expected ${expected[field]}, got ${actual[field]}`
      );
    }
  }
  if (
    expected.periodOfCover !== 0 &&
    Math.abs(actual.periodOfCover - expected.periodOfCover) > 1e-9
  ) {
    differences.push(
      `Event ${index} periodOfCover: expected ${expected.periodOfCover}, got ${actual.periodOfCover}`
    );
  }
}

function parseExpectedDemand(line: string): readonly MaterialDemandPlan[] {
  const columns = line.split("\t");
  if (columns[0] !== "DEMAND" || columns.length < 4) {
    return [];
  }
  const name = columns[1];
  const date = columns[2];
  const quantity = columns[3];
  if (
    name === undefined ||
    date === undefined ||
    quantity === undefined
  ) {
    return [];
  }
  return [{
    name,
    date: parseDate(date),
    quantity: Number(quantity),
    ...(columns[4]?.startsWith("later than ")
      ? { originalDue: parseDate(columns[4].slice("later than ".length)) }
      : {})
  }];
}

interface MaterialDemandPlan {
  readonly name: string;
  readonly date: ReturnType<typeof parseDate>;
  readonly quantity: number;
  readonly originalDue?: ReturnType<typeof parseDate>;
}

interface ExpectedResourceEvent {
  readonly resource: string;
  readonly date: ReturnType<typeof parseDate>;
  readonly quantity: number;
  readonly load: number;
}

interface ExpectedOperationPlan {
  readonly name: string;
  readonly start: ReturnType<typeof parseDate>;
  readonly end: ReturnType<typeof parseDate>;
  readonly quantity: number;
  readonly confirmed?: boolean;
}

function parseExpectedOperation(
  line: string
): readonly ExpectedOperationPlan[] {
  const columns = line.split("\t");
  if (columns[0] !== "OPERATION" || columns.length < 5) {
    return [];
  }
  const name = columns[1];
  const start = columns[2];
  const end = columns[3];
  const quantity = columns[4];
  if (
    name === undefined ||
    start === undefined ||
    end === undefined ||
    quantity === undefined
  ) {
    return [];
  }
  return [{
    name,
    start: parseDate(start),
    end: parseDate(end),
    quantity: Number(quantity),
    ...(columns[5] === "confirmed" ? { confirmed: true } : {})
  }];
}

function parseExpectedResource(line: string): readonly ExpectedResourceEvent[] {
  const columns = line.split("\t");
  if (columns[0] !== "RESOURCE" || columns.length !== 5) {
    return [];
  }
  const resource = columns[1];
  const date = columns[2];
  const quantity = columns[3];
  const load = columns[4];
  if (
    resource === undefined ||
    date === undefined ||
    quantity === undefined ||
    load === undefined
  ) {
    return [];
  }
  return [{
    resource,
    date: parseDate(date),
    quantity: Number(quantity),
    load: Number(load)
  }];
}

function comparePurchases(
  actual: readonly PurchasePlan[],
  expected: readonly ExpectedOperationPlan[],
  differences: string[]
): void {
  const sortedActual = [...actual].sort(comparePurchase);
  const sortedExpected = [...expected].sort(comparePurchase);
  if (sortedActual.length !== sortedExpected.length) {
    differences.push(
      `Expected ${sortedExpected.length} purchases, got ${sortedActual.length}`
    );
  }
  const count = Math.min(sortedActual.length, sortedExpected.length);
  for (let index = 0; index < count; index += 1) {
    const actualPurchase = sortedActual[index];
    const expectedPurchase = sortedExpected[index];
    if (!actualPurchase || !expectedPurchase) {
      continue;
    }
    for (const field of ["name", "start", "end", "quantity", "confirmed"] as const) {
      if (actualPurchase[field] !== expectedPurchase[field]) {
        differences.push(
          `Purchase ${index} ${field}: expected ${String(expectedPurchase[field])}, got ${String(actualPurchase[field])}`
        );
      }
    }
  }
}

function compareDemands(
  actual: readonly MaterialDemandPlan[],
  expected: readonly MaterialDemandPlan[],
  differences: string[]
): void {
  const sortedActual = [...actual].sort(compareDemandPlan);
  const sortedExpected = [...expected].sort(compareDemandPlan);
  if (sortedActual.length !== sortedExpected.length) {
    differences.push(
      `Expected ${sortedExpected.length} demand plans, got ${sortedActual.length}`
    );
  }
  const count = Math.min(sortedActual.length, sortedExpected.length);
  for (let index = 0; index < count; index += 1) {
    const actualDemand = sortedActual[index];
    const expectedDemand = sortedExpected[index];
    if (!actualDemand || !expectedDemand) {
      continue;
    }
    if (actualDemand.name !== expectedDemand.name) {
      differences.push(
        `Demand ${index} name: expected ${expectedDemand.name}, got ${actualDemand.name}`
      );
    }
    if (actualDemand.date !== expectedDemand.date) {
      differences.push(
        `Demand ${index} date: expected ${expectedDemand.date}, got ${actualDemand.date}`
      );
    }
    if (Math.abs(actualDemand.quantity - expectedDemand.quantity) > 1e-9) {
      differences.push(
        `Demand ${index} quantity: expected ${expectedDemand.quantity}, got ${actualDemand.quantity}`
      );
    }
    if (actualDemand.originalDue !== expectedDemand.originalDue) {
      differences.push(
        `Demand ${index} originalDue: expected ${String(expectedDemand.originalDue)}, got ${String(actualDemand.originalDue)}`
      );
    }
  }
}

function compareOperationPlans(
  actual: readonly ExpectedOperationPlan[],
  expected: readonly ExpectedOperationPlan[],
  differences: string[]
): void {
  const sortedActual = [...actual].sort(compareOperationPlan);
  const sortedExpected = [...expected].sort(compareOperationPlan);
  if (sortedActual.length !== sortedExpected.length) {
    differences.push(
      `Expected ${sortedExpected.length} operation plans, got ${sortedActual.length}`
    );
  }
  const count = Math.min(sortedActual.length, sortedExpected.length);
  for (let index = 0; index < count; index += 1) {
    const actualOperation = sortedActual[index];
    const expectedOperation = sortedExpected[index];
    if (!actualOperation || !expectedOperation) {
      continue;
    }
    for (const field of ["name", "start", "end", "quantity", "confirmed"] as const) {
      const quantitiesMatch =
        field === "quantity" &&
        typeof actualOperation[field] === "number" &&
        typeof expectedOperation[field] === "number" &&
        Math.abs(actualOperation[field] - expectedOperation[field]) <= 1e-3;
      if (!quantitiesMatch && actualOperation[field] !== expectedOperation[field]) {
        differences.push(
          `Operation ${index} ${field}: expected ${String(expectedOperation[field])}, got ${String(actualOperation[field])}`
        );
      }
    }
  }
}

function compareResourceEvents(
  actual: readonly ResourcePlanEvent[],
  expected: readonly ExpectedResourceEvent[],
  differences: string[]
): void {
  const sortedActual = [...actual].sort(compareResourceEvent);
  const sortedExpected = [...expected].sort(compareResourceEvent);
  if (sortedActual.length !== sortedExpected.length) {
    differences.push(
      `Expected ${sortedExpected.length} resource events, got ${sortedActual.length}`
    );
  }
  const count = Math.min(sortedActual.length, sortedExpected.length);
  for (let index = 0; index < count; index += 1) {
    const actualEvent = sortedActual[index];
    const expectedEvent = sortedExpected[index];
    if (!actualEvent || !expectedEvent) {
      continue;
    }
    for (const field of ["resource", "date", "quantity", "load"] as const) {
      if (actualEvent[field] !== expectedEvent[field]) {
        differences.push(
          `Resource ${index} ${field}: expected ${String(expectedEvent[field])}, got ${String(actualEvent[field])}`
        );
      }
    }
  }
}

function comparePurchase(
  left: ExpectedOperationPlan,
  right: ExpectedOperationPlan
): number {
  return (
    left.name.localeCompare(right.name) ||
    left.start - right.start ||
    left.end - right.end ||
    left.quantity - right.quantity ||
    Number(Boolean(left.confirmed)) - Number(Boolean(right.confirmed))
  );
}

function compareDemandPlan(
  left: MaterialDemandPlan,
  right: MaterialDemandPlan
): number {
  return (
    left.name.localeCompare(right.name) ||
    left.date - right.date ||
    left.quantity - right.quantity ||
    (left.originalDue ?? 0) - (right.originalDue ?? 0)
  );
}

function compareResourceEvent(
  left: ExpectedResourceEvent,
  right: ExpectedResourceEvent
): number {
  return (
    left.resource.localeCompare(right.resource) ||
    left.date - right.date ||
    Number(left.quantity < 0) - Number(right.quantity < 0) ||
    left.load - right.load
  );
}

function compareOperationPlan(
  left: ExpectedOperationPlan,
  right: ExpectedOperationPlan
): number {
  return (
    left.name.localeCompare(right.name) ||
    left.start - right.start ||
    left.end - right.end ||
    left.quantity - right.quantity ||
    Number(Boolean(left.confirmed)) - Number(Boolean(right.confirmed))
  );
}

function operationDuration(
  operation: ManufacturingOperation,
  quantity: number
): number {
  if (operation.type === "routing" || operation.type === "alternate") {
    const children = operation.type === "alternate"
      ? operation.subOperations.slice(0, 1)
      : operation.subOperations;
    return children.reduce(
      (total, child) => total + operationDuration(child.operation, quantity),
      0
    );
  }
  return operation.durationSeconds + operation.durationPerSeconds * quantity;
}

function planRecord(xml: string): XmlRecord {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: true,
    trimValues: true
  });
  const document = asRecord(parser.parse(stripEmbeddedPython(xml)));
  const plan = asRecord(document?.plan);
  if (!plan) {
    throw new Error("Fixture has no plan root");
  }
  return plan;
}

function sectionRecords(
  plan: XmlRecord,
  section: string,
  child: string
): readonly XmlRecord[] {
  const sections = records(plan[section]);
  return sections.flatMap((entry) => records(entry[child]));
}

function sectionChildren(
  record: XmlRecord,
  section: string,
  child: string
): readonly XmlRecord[] {
  return records(asRecord(record[section])?.[child]);
}

function asRecord(value: unknown): XmlRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlRecord)
    : undefined;
}

function records(value: unknown): readonly XmlRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const record = asRecord(entry);
      return record ? [record] : [];
    });
  }
  const record = asRecord(value);
  return record ? [record] : [];
}

function requiredName(record: XmlRecord, entity: string): string {
  return optionalText(record["@_name"]) ?? requiredText(record.name, `${entity} name`);
}

function requiredEntityName(value: unknown, entity: string): string {
  const name = entityName(value);
  if (!name) {
    throw new Error(`${entity} is missing`);
  }
  return name;
}

function entityName(value: unknown): string | undefined {
  const record = asRecord(value);
  return optionalText(record?.["@_name"]) ?? optionalText(record?.name);
}

function requiredText(value: unknown, entity: string): string {
  const text = optionalText(value);
  if (!text) {
    throw new Error(`${entity} is missing`);
  }
  return text;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RangeError(`Invalid numeric value: ${String(value)}`);
  }
  return number;
}

function optionalDuration(value: unknown): number | undefined {
  const text = optionalText(value);
  return text ? parseDuration(text) : undefined;
}

function stripEmbeddedPython(xml: string): string {
  return xml.replace(/<\?python[\s\S]*?\?>/g, "");
}
