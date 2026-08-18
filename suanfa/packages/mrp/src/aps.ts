import {
  INFINITE_FUTURE,
  INFINITE_PAST,
  startOfUtcDay,
  type EpochSeconds
  ,
  utcDayOfWeek
} from "@suanfa/kernel";
import type { Calendar } from "@suanfa/model";

import type {
  DemandPlan,
  ManufacturingOperation,
  ManufacturingSubOperation,
  MaterialBuffer,
  MaterialDemand,
  MaterialFlow,
  MaterialPlan,
  MaterialPlanEvent,
  MaterialPlanInput,
  OperationPlan,
  PurchasePlan,
  ProcurementSource,
  ResourcePlanEvent
} from "./mrp.js";

interface MutableEvent {
  readonly date: EpochSeconds;
  readonly sequence: number;
  readonly kind: "receipt" | "demand";
  readonly confirmed?: boolean;
  readonly originalDue?: EpochSeconds;
  readonly priority?: number;
  quantity: number;
}

interface BufferState {
  readonly buffer: MaterialBuffer;
  readonly events: MutableEvent[];
}

interface MutableResourceEvent {
  readonly date: EpochSeconds;
  readonly quantity: number;
  readonly sequence: number;
}

interface ResourceState {
  readonly name: string;
  readonly events: MutableResourceEvent[];
}

interface Schedule {
  readonly start: EpochSeconds;
  readonly end: EpochSeconds;
  readonly inputsSatisfied?: boolean;
}

interface CapacityChunk {
  readonly schedule: Schedule;
  readonly quantity: number;
}

interface SupplyResult {
  readonly date: EpochSeconds;
  readonly quantity: number;
  readonly allocations?: readonly SupplyAllocation[];
  readonly operationEnd?: EpochSeconds;
}

interface SupplyAllocation {
  readonly date: EpochSeconds;
  readonly quantity: number;
}

interface FlowSupplyResult {
  readonly flow: MaterialFlow;
  readonly supplyDate: EpochSeconds;
  readonly shortage?: number;
}

interface SplitChildPlan {
  readonly child: ManufacturingSubOperation;
  readonly quantity: number;
  readonly schedule: Schedule;
}

interface SolverContext {
  readonly input: MaterialPlanInput;
  readonly states: Map<string, BufferState>;
  readonly operations: Map<string, ManufacturingOperation>;
  readonly producers: Map<string, ManufacturingOperation>;
  readonly producerCandidates: Map<string, ManufacturingOperation[]>;
  readonly operationPlans: OperationPlan[];
  readonly demandPlans: DemandPlan[];
  readonly purchases: PurchasePlan[];
  readonly plannedPurchases: Map<string, MutableEvent>;
  readonly resourceStates: Map<string, ResourceState>;
  sequence: number;
  readonly activeOperations: Set<string>;
}

interface PlanningSnapshot {
  readonly stateEvents: readonly {
    readonly state: BufferState;
    readonly length: number;
    readonly quantities: readonly [MutableEvent, number][];
  }[];
  readonly operationPlans: readonly OperationPlan[];
  readonly demandPlansLength: number;
  readonly purchases: readonly PurchasePlan[];
  readonly plannedPurchases: readonly [string, MutableEvent, number][];
  readonly resourceEvents: readonly {
    readonly state: ResourceState;
    readonly length: number;
  }[];
  readonly sequence: number;
}

const EPSILON = 1e-9;
const DEFAULT_MINIMUM_DELAY_SECONDS = 3_600;

export function solveManufacturingMaterialPlan(
  input: MaterialPlanInput
): MaterialPlan {
  const context = createContext(input);
  loadConfirmedReceipts(context);
  loadConfirmedOperationPlans(context);
  replenishStaticBuffers(context);

  for (const demand of demandsForPlan(input)) {
    if (demand.operation) {
      solveDeliveryDemand(context, demand);
    } else {
      solveDirectDemand(context, demand);
    }
  }

  const events = [...context.states.values()].flatMap((state) =>
    materialEvents(state, input.current)
  ).sort(compareMaterialEvents);
  return {
    events,
    purchases: context.purchases,
    operationPlans: context.operationPlans,
    demandPlans: context.demandPlans,
    resourceEvents: [...context.resourceStates.values()]
      .flatMap(resourceEvents)
      .sort(compareResourceEvents)
  };
}

function createContext(input: MaterialPlanInput): SolverContext {
  const states = new Map<string, BufferState>();
  for (const buffer of input.buffers) {
    states.set(bufferKey(buffer.name), {
      buffer,
      events: buffer.onhand === 0
        ? []
        : [{
            date: INFINITE_PAST,
            quantity: buffer.onhand,
            sequence: 0,
            kind: "receipt"
          }]
    });
  }

  const operations = new Map(
    (input.operations ?? []).map((operation) => [operation.name, operation])
  );
  for (const operation of input.operations ?? []) {
    for (const flow of operation.flows) {
      if (!states.has(bufferKey(flow.buffer))) {
        const identity = inferredBufferIdentity(flow.buffer);
        states.set(bufferKey(flow.buffer), {
          buffer: {
            name: flow.buffer,
            item: identity.item,
            location: identity.location,
            onhand: 0
          },
          events: []
        });
      }
    }
  }

  const producers = new Map<string, ManufacturingOperation>();
  const producerCandidates = new Map<string, ManufacturingOperation[]>();
  const nestedOperationNames = new Set<string>();
  for (const operation of input.operations ?? []) {
    collectNestedOperationNames(operation, nestedOperationNames);
  }
  for (const operation of input.operations ?? []) {
    if (nestedOperationNames.has(operation.name)) {
      continue;
    }
    if (operation.priority <= EPSILON) {
      continue;
    }
    for (const flow of operation.flows) {
      if (positiveFlowQuantity(flow) > EPSILON) {
        registerProducerCandidate(
          producerCandidates,
          flow.buffer,
          operation
        );
        const current = producers.get(bufferKey(flow.buffer));
        if (!current || operation.priority < current.priority) {
          producers.set(bufferKey(flow.buffer), operation);
        }
      }
    }
    for (const subOperation of operation.subOperations) {
      registerProducerFlows(
        producers,
        subOperation.operation,
        operation,
        producerCandidates
      );
    }
  }

  return {
    input,
    states,
    operations,
    producers,
    producerCandidates,
    operationPlans: [],
    demandPlans: [],
    purchases: [...(input.confirmedPurchases ?? [])],
    plannedPurchases: new Map(),
    resourceStates: new Map(
      (input.resources ?? []).map((resource) => [
        resource.name,
        { name: resource.name, events: [] }
      ])
    ),
    sequence: 1,
    activeOperations: new Set()
  };
}

function collectNestedOperationNames(
  operation: ManufacturingOperation,
  names: Set<string>
): void {
  for (const subOperation of operation.subOperations) {
    names.add(subOperation.operation.name);
    collectNestedOperationNames(subOperation.operation, names);
  }
}

function registerProducerFlows(
  producers: Map<string, ManufacturingOperation>,
  operation: ManufacturingOperation,
  producer: ManufacturingOperation = operation,
  producerCandidates?: Map<string, ManufacturingOperation[]>
): void {
  if (producer.priority <= EPSILON) {
    return;
  }
  for (const flow of operation.flows) {
    if (positiveFlowQuantity(flow) <= EPSILON) {
      continue;
    }
    registerProducerCandidate(
      producerCandidates,
      flow.buffer,
      producer
    );
    const current = producers.get(bufferKey(flow.buffer));
    if (!current || producer.priority < current.priority) {
      producers.set(bufferKey(flow.buffer), producer);
    }
  }
  for (const subOperation of operation.subOperations) {
    registerProducerFlows(
      producers,
      subOperation.operation,
      producer,
      producerCandidates
    );
  }
}

function registerProducerCandidate(
  candidates: Map<string, ManufacturingOperation[]> | undefined,
  bufferName: string,
  operation: ManufacturingOperation
): void {
  if (!candidates) {
    return;
  }
  const key = bufferKey(bufferName);
  const current = candidates.get(key) ?? [];
  if (!current.some((candidate) => candidate.name === operation.name)) {
    current.push(operation);
    current.sort(
      (left, right) =>
        left.priority - right.priority ||
        left.name.localeCompare(right.name)
    );
    candidates.set(key, current);
  }
}

function loadConfirmedReceipts(context: SolverContext): void {
  for (const receipt of context.input.confirmedReceipts) {
    const state = findState(context, receipt.item, receipt.location);
    if (!state) {
      continue;
    }
    addEvent(
      context,
      state,
      receipt.end,
      receipt.quantity,
      "receipt",
      undefined,
      true
    );
  }
}

function loadConfirmedOperationPlans(context: SolverContext): void {
  for (const operationPlan of context.input.operationPlans ?? []) {
    const operation = context.operations.get(operationPlan.operation);
    if (!operation) {
      continue;
    }
    const schedule = {
      start: operationPlan.start,
      end: operationPlan.end
    } satisfies Schedule;
    addOperationPlan(
      context,
      operation,
      schedule,
      operationPlan.quantity,
      operationPlan.confirmed === true,
      true,
      operationPlan.completed === true
    );
  }
}

function replenishStaticBuffers(context: SolverContext): void {
  const demandsByBuffer = new Set(
    context.input.demands
      .filter((demand) => !demand.operation)
      .map((demand) => bufferKeyForDemand(context, demand))
  );
  const useAutofence = (context.input.autofenceSeconds ?? 0) > 0;
  for (const state of context.states.values()) {
    const maximum = state.buffer.maximum;
    const minimum = state.buffer.minimum;
    const producer = context.producers.get(bufferKey(state.buffer.name));
    if (
      maximum === undefined ||
      minimum === undefined ||
      producer === undefined ||
      (!useAutofence && demandsByBuffer.has(bufferKey(state.buffer.name))) ||
      (
        useAutofence &&
        (context.input.mode ?? "constrained") === "unconstrained" &&
        demandsByBuffer.has(bufferKey(state.buffer.name))
      ) ||
      balanceAt(state, context.input.current) >= minimum
    ) {
      continue;
    }
    const date = staticReplenishmentDate(context, state, producer);
    const quantity = Math.max(0, maximum - balanceAt(state, date));
    if (quantity <= EPSILON) {
      continue;
    }
    createSupply(context, state.buffer.name, quantity, date, false);
  }
}

function staticReplenishmentDate(
  context: SolverContext,
  state: BufferState,
  producer: ManufacturingOperation
): EpochSeconds {
  if ((context.input.autofenceSeconds ?? 0) > 0) {
    const confirmed = state.events
      .filter((event) => event.date > context.input.current)
      .sort((left, right) => left.date - right.date)[0];
    if (confirmed) {
      return confirmed.date;
    }
  }
  return operationEnd(
    context,
    producer,
    context.input.mode === "unconstrained"
      ? context.input.current
      : context.input.current
  );
}

function solveDirectDemand(
  context: SolverContext,
  demand: MaterialDemand
): void {
  const bufferName = bufferKeyForDemand(context, demand);
  const state = context.states.get(bufferKey(bufferName));
  if (!state) {
    return;
  }
  const required = Math.max(demand.quantity, demand.minimumShipment);
  const dueBalance = balanceAt(state, demand.due);
  const producer = context.producers.get(bufferKey(bufferName));
  const source = matchingSource(context.input.sources, demand);

  if (producer) {
    solveManufacturingDirectDemand(
      context,
      state,
      demand,
      required,
      dueBalance
    );
    return;
  }

  if (source) {
    solvePurchaseDemand(
      context,
      state,
      demand,
      required,
      dueBalance,
      source
    );
    return;
  }

  if (context.input.mode === "constrained") {
    solveStaticConstrainedDemand(context, state, demand, required);
    return;
  }

  if (dueBalance + EPSILON >= required || context.input.mode === "unconstrained") {
    addDemandEvent(context, state, demand.due, -required, demand.due);
    addDemandPlan(context, demand, demand.due, required);
  }
}

function solveStaticConstrainedDemand(
  context: SolverContext,
  state: BufferState,
  demand: MaterialDemand,
  required: number
): void {
  const receipts = state.events
    .filter((event) => event.kind === "receipt" && event.quantity > EPSILON)
    .map((event) => ({
      date: event.date,
      quantity: event.quantity,
      remaining: event.quantity
    }))
    .sort((left, right) => left.date - right.date);

  // Higher-priority demands reserve the latest available receipt first. This
  // leaves earlier stock available for lower-priority demands with earlier due
  // dates, matching the constrained MRP allocation semantics.
  const existingDemands = state.events
    .filter(
      (event) =>
        event.kind === "demand" &&
        event.priority !== undefined &&
        event.priority <= demand.priority &&
        -event.quantity > EPSILON
    )
    .sort(
      (left, right) =>
        (left.priority ?? Number.POSITIVE_INFINITY) -
          (right.priority ?? Number.POSITIVE_INFINITY) ||
        (left.originalDue ?? left.date) - (right.originalDue ?? right.date) ||
        left.date - right.date ||
        left.sequence - right.sequence
    );

  for (const existing of existingDemands) {
    reserveReceiptQuantity(
      receipts,
      -existing.quantity,
      existing.date,
      "latest"
    );
  }

  const allocations: SupplyAllocation[] = [];
  let remaining = required;
  remaining -= allocateReceiptQuantity(
    receipts,
    remaining,
    demand.due,
    "earliest",
    allocations,
    undefined,
    demand.due
  );
  if (remaining > EPSILON) {
    remaining -= allocateReceiptQuantity(
      receipts,
      remaining,
      Number.POSITIVE_INFINITY as EpochSeconds,
      "earliest",
      allocations,
      demand.due
    );
  }

  const allocationsByDate = new Map<EpochSeconds, number>();
  for (const allocation of allocations) {
    allocationsByDate.set(
      allocation.date,
      (allocationsByDate.get(allocation.date) ?? 0) + allocation.quantity
    );
  }
  for (const [allocationDate, allocationQuantity] of allocationsByDate) {
    addDemandEvent(
      context,
      state,
      allocationDate,
      -allocationQuantity,
      demand.due,
      demand.priority
    );
    addDemandPlan(context, demand, allocationDate, allocationQuantity);
  }
}

function reserveReceiptQuantity(
  receipts: Array<{ date: EpochSeconds; quantity: number; remaining: number }>,
  quantity: number,
  latestDate: EpochSeconds,
  direction: "earliest" | "latest"
): number {
  return allocateReceiptQuantity(
    receipts,
    quantity,
    latestDate,
    direction,
    undefined
  );
}

function allocateReceiptQuantity(
  receipts: Array<{ date: EpochSeconds; quantity: number; remaining: number }>,
  quantity: number,
  limitDate: EpochSeconds,
  direction: "earliest" | "latest",
  allocations?: SupplyAllocation[],
  minimumDate?: EpochSeconds,
  allocationDate?: EpochSeconds
): number {
  let remaining = quantity;
  const candidates = receipts
    .filter(
      (receipt) =>
        receipt.remaining > EPSILON &&
        receipt.date <= limitDate &&
        (minimumDate === undefined || receipt.date > minimumDate)
    )
    .sort((left, right) =>
      direction === "earliest"
        ? left.date - right.date
        : right.date - left.date
    );
  for (const receipt of candidates) {
    if (remaining <= EPSILON) {
      break;
    }
    const amount = Math.min(remaining, receipt.remaining);
    receipt.remaining -= amount;
    remaining -= amount;
    if (allocations !== undefined) {
      allocations.push({
        date: allocationDate ??
          (receipt.date === INFINITE_PAST
            ? (minimumDate ?? limitDate) as EpochSeconds
            : Math.max(receipt.date, minimumDate ?? receipt.date) as EpochSeconds),
        quantity: amount
      });
    }
  }
  return quantity - remaining;
}

function solveManufacturingDirectDemand(
  context: SolverContext,
  state: BufferState,
  demand: MaterialDemand,
  required: number,
  dueBalance: number
): void {
  const maximum = state.buffer.maximum;
  const producer = context.producers.get(bufferKey(state.buffer.name));
  if (!producer) {
    return;
  }

  if (dueBalance + EPSILON >= required) {
    addDemandEvent(context, state, demand.due, -required, demand.due);
    addDemandPlan(context, demand, demand.due, required);
    replenishBufferAt(context, state, demand.due);
    return;
  }

  const availableNow = Math.max(0, balanceAt(state, context.input.current));
  const shortage = Math.max(0, required - availableNow);
  const mode = context.input.mode ?? "constrained";
  const fencedConfirmed = fencedConfirmedSupplyDate(
    context,
    state,
    demand.due
  );
  if (
    mode === "constrained" &&
    fencedConfirmed !== undefined &&
    availableNow > EPSILON
  ) {
    const immediate = Math.min(required, availableNow);
    addDemandEvent(context, state, demand.due, -immediate, demand.due);
    addDemandPlan(context, demand, demand.due, immediate);
    const remainder = required - immediate;
    if (remainder > EPSILON) {
      addDemandEvent(context, state, fencedConfirmed, -remainder, demand.due);
      addDemandPlan(context, demand, fencedConfirmed, remainder);
    }
    return;
  }
  if (
    mode === "unconstrained" &&
    (context.input.autofenceSeconds ?? 0) > 0
  ) {
    addDemandEvent(context, state, demand.due, -required, demand.due);
    addDemandPlan(context, demand, demand.due, required);
    replenishBufferAt(context, state, demand.due);
    return;
  }
  if (
    mode === "constrained" &&
    (context.input.autofenceSeconds ?? 0) > 0 &&
    fencedConfirmed === undefined
  ) {
    addDemandEvent(context, state, demand.due, -required, demand.due);
    addDemandPlan(context, demand, demand.due, required);
    replenishBufferAt(context, state, demand.due);
    return;
  }
  const simpleUnconstrained =
    mode === "unconstrained" && (context.input.constraints ?? 15) === 0;
  let supplyQuantity = shortage;
  if (
    maximum !== undefined &&
    mode === "constrained" &&
    fencedConfirmed !== undefined
  ) {
    supplyQuantity = manufacturingFencedQuantity(
      context,
      state,
      demand.due,
      fencedConfirmed
    );
  } else if (maximum !== undefined && simpleUnconstrained) {
    supplyQuantity = Math.max(
      shortage,
      maximum - availableNow + required
    );
  } else if (
    maximum !== undefined &&
    mode === "constrained" &&
    (context.input.autofenceSeconds ?? 0) > 0
  ) {
    supplyQuantity = Math.max(shortage, maximum + required - availableNow);
  } else if (maximum !== undefined && availableNow > 0) {
    supplyQuantity = Math.max(shortage, maximum - availableNow);
  }

  const supply = createSupply(
    context,
    state.buffer.name,
    supplyQuantity,
    demand.due,
    false
  );
  if (mode === "unconstrained") {
    addDemandEvent(
      context,
      state,
      demand.due,
      -required,
      demand.due,
      demand.priority
    );
    addDemandPlan(context, demand, demand.due, required);
    return;
  }
  if (supply.allocations !== undefined) {
    const onTimeQuantity = supply.allocations
      .filter((allocation) => allocation.date <= demand.due)
      .reduce((total, allocation) => total + allocation.quantity, 0);
    const allocatedOnTime = Math.min(required, onTimeQuantity);
    if (allocatedOnTime > EPSILON) {
      addDemandEvent(
        context,
        state,
        demand.due,
        -allocatedOnTime,
        demand.due,
        demand.priority
      );
      addDemandPlan(context, demand, demand.due, allocatedOnTime);
    }
    let remainingDemand = required - allocatedOnTime;
    for (const allocation of [...supply.allocations]
      .filter((candidate) => candidate.date > demand.due)
      .sort((left, right) => left.date - right.date)) {
      if (remainingDemand <= EPSILON) {
        break;
      }
      const lateQuantity = Math.min(remainingDemand, allocation.quantity);
      if (lateQuantity <= EPSILON) {
        continue;
      }
      addDemandEvent(
        context,
        state,
        allocation.date,
        -lateQuantity,
        demand.due,
        demand.priority
      );
      addDemandPlan(context, demand, allocation.date, lateQuantity);
      remainingDemand -= lateQuantity;
    }
    return;
  }
  const onTimeQuantity =
    mode === "constrained" && supply.date > demand.due
      ? Math.min(required, Math.max(0, balanceAt(state, demand.due)))
      : 0;
  if (onTimeQuantity > EPSILON) {
    addDemandEvent(context, state, demand.due, -onTimeQuantity, demand.due);
    addDemandPlan(context, demand, demand.due, onTimeQuantity);
  }
  const remainder = required - onTimeQuantity;
  if (remainder <= EPSILON) {
    return;
  }
  const deliveryDate = (
    mode === "constrained" ? Math.max(demand.due, supply.date) : demand.due
  ) as EpochSeconds;
  addDemandEvent(context, state, deliveryDate, -remainder, demand.due);
  addDemandPlan(context, demand, deliveryDate, remainder);
}

function solvePurchaseDemand(
  context: SolverContext,
  state: BufferState,
  demand: MaterialDemand,
  required: number,
  dueBalance: number,
  source: ProcurementSource
): void {
  if (dueBalance + EPSILON >= required) {
    addDemandEvent(context, state, demand.due, -required, demand.due);
    addDemandPlan(context, demand, demand.due, required);
    replenishBufferAt(context, state, demand.due);
    return;
  }

  const mode = context.input.mode ?? "constrained";
  const availableNow = Math.max(0, balanceAt(state, context.input.current));
  const fencedConfirmed = fencedConfirmedSupplyDate(
    context,
    state,
    demand.due
  );
  if (
    mode === "constrained" &&
    fencedConfirmed !== undefined &&
    availableNow > EPSILON
  ) {
    const immediate = Math.min(required, availableNow);
    addDemandEvent(context, state, demand.due, -immediate, demand.due);
    addDemandPlan(context, demand, demand.due, immediate);
    const remainder = required - immediate;
    if (remainder > EPSILON) {
      addDemandEvent(context, state, fencedConfirmed, -remainder, demand.due);
      addDemandPlan(context, demand, fencedConfirmed, remainder);
    }
    return;
  }
  if (
    mode === "unconstrained" &&
    (context.input.autofenceSeconds ?? 0) > 0
  ) {
    addDemandEvent(context, state, demand.due, -required, demand.due);
    addDemandPlan(context, demand, demand.due, required);
    replenishBufferAt(context, state, demand.due);
    return;
  }
  if (mode === "constrained" && availableNow > EPSILON) {
    const immediate = Math.min(required, availableNow);
    addDemandEvent(context, state, demand.due, -immediate, demand.due);
    addDemandPlan(context, demand, demand.due, immediate);
    const remainder = required - immediate;
    if (remainder <= EPSILON) {
      return;
    }
    const deliveryDate = purchaseDeliveryDate(context, demand, source);
    const quantity = purchaseQuantity(
      context,
      state,
      demand,
      remainder,
      availableNow,
      required
    );
    addPurchaseSupply(context, state, source, deliveryDate, quantity);
    addDemandEvent(context, state, deliveryDate, -remainder, demand.due);
    addDemandPlan(context, demand, deliveryDate, remainder);
    return;
  }

  const deliveryDate = purchaseDeliveryDate(context, demand, source);
  const quantity = purchaseQuantity(
    context,
    state,
    demand,
    required,
    availableNow,
    required
  );
  addPurchaseSupply(context, state, source, deliveryDate, quantity);
  const actualDate = (
    mode === "constrained"
      ? Math.max(demand.due, deliveryDate)
      : demand.due
  ) as EpochSeconds;
  addDemandEvent(context, state, actualDate, -required, demand.due);
  addDemandPlan(context, demand, actualDate, required);
}

function replenishBufferAt(
  context: SolverContext,
  state: BufferState,
  date: EpochSeconds
): void {
  const minimum = state.buffer.minimum;
  const maximum = state.buffer.maximum;
  if (
    minimum === undefined ||
    maximum === undefined ||
    maximum + EPSILON < minimum
  ) {
    return;
  }

  const balance = balanceAt(state, date);
  if (balance + EPSILON >= minimum) {
    return;
  }

  const producer = context.producers.get(bufferKey(state.buffer.name));
  const mode = context.input.mode ?? "constrained";
  const smartUnconstrained =
    mode === "unconstrained" && (context.input.constraints ?? 15) > 0;
  const confirmedAnchor = fencedConfirmedReceipt(context, state, date, true);
  if (
    producer &&
    smartUnconstrained &&
    confirmedAnchor !== undefined &&
    date < confirmedAnchor.date
  ) {
    if (date <= context.input.current) {
      return;
    }
    const demandAtDate = state.events
      .filter((event) => event.kind === "demand" && event.date === date)
      .reduce((total, event) => total + event.quantity, 0);
    const balanceBeforeDemand = balance - demandAtDate;
    const quantity =
      confirmedAnchor.quantity - minimum - balanceBeforeDemand;
    if (quantity > EPSILON) {
      createSupply(context, state.buffer.name, quantity, date, false);
    }
    return;
  }
  const fencedConfirmed = fencedConfirmedSupplyDate(context, state, date);
  if (
    fencedConfirmed !== undefined &&
    date < fencedConfirmed &&
    mode === "unconstrained"
  ) {
    return;
  }

  const target =
    producer &&
    (context.input.autofenceSeconds ?? 0) > 0 &&
    (mode === "constrained" || smartUnconstrained)
      ? minimum
      : maximum;
  const quantity = target - balance;
  if (producer) {
    createSupply(context, state.buffer.name, quantity, date, false);
    return;
  }

  const source = matchingSourceForBuffer(context.input.sources, state.buffer);
  if (!source) {
    return;
  }
  const deliveryDate = replenishmentDeliveryDate(context, date, source);
  addPurchaseSupply(
    context,
    state,
    source,
    deliveryDate,
    orderQuantity(quantity, source.minimumQuantity, source.multipleQuantity)
  );
}

function solveDeliveryDemand(
  context: SolverContext,
  demand: MaterialDemand
): void {
  const operation = demand.operation
    ? context.operations.get(demand.operation)
    : undefined;
  if (!operation) {
    const { operation: ignoredOperation, ...directDemand } = demand;
    void ignoredOperation;
    solveDirectDemand(context, directDemand);
    return;
  }
  if ((context.input.mode ?? "constrained") !== "constrained") {
    const quantity = Math.max(demand.quantity, demand.minimumShipment);
    const end = scheduleDeliveryQuantity(
      context,
      demand,
      operation,
      quantity,
      demand.due
    );
    if (end !== undefined) {
      addDemandPlan(context, demand, end, quantity);
    }
    return;
  }
  let remaining = Math.max(demand.quantity, demand.minimumShipment);
  let horizon = scheduleOperation(
    context,
    operation,
    demand.due,
    1
  ).start;
  const triedHorizons = new Set<EpochSeconds>();

  for (let batch = 0; batch < 256 && remaining > EPSILON; batch += 1) {
    if (triedHorizons.has(horizon)) {
      break;
    }
    triedHorizons.add(horizon);

    const upper = Math.min(
      remaining,
      maximumDeliveryQuantityAt(context, operation, horizon)
    );
    const planned = commitDeliveryQuantity(
      context,
      demand,
      operation,
      upper,
      horizon
    );
    if (planned !== undefined) {
      remaining -= planned.quantity;
      continue;
    }

    const next = nextConfirmedMaterialDate(context, horizon);
    if (next === undefined) {
      break;
    }
    horizon = next;
  }
}

interface DeliveryAttempt {
  readonly quantity: number;
  readonly end: EpochSeconds;
}

function commitDeliveryQuantity(
  context: SolverContext,
  demand: MaterialDemand,
  operation: ManufacturingOperation,
  upper: number,
  horizon: EpochSeconds
): DeliveryAttempt | undefined {
  if (upper <= EPSILON) {
    return undefined;
  }
  const baseSnapshot = takePlanningSnapshot(context);
  const attempt = (quantity: number): DeliveryAttempt | undefined => {
    if (quantity <= EPSILON) {
      return undefined;
    }
    const desiredEnd = deliveryEndFromHorizon(
      context,
      operation,
      horizon,
      quantity
    );
    const result = scheduleDeliveryQuantity(
      context,
      demand,
      operation,
      quantity,
      desiredEnd
    );
    return result === undefined
      ? undefined
      : { quantity, end: result };
  };

  const direct = attempt(upper);
  if (direct !== undefined) {
    addDemandPlan(context, demand, direct.end, direct.quantity);
    return direct;
  }
  restorePlanningSnapshot(context, baseSnapshot);

  let low = 0;
  let high = upper;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) / 2;
    restorePlanningSnapshot(context, baseSnapshot);
    const candidate = attempt(middle);
    if (candidate === undefined) {
      high = middle;
    } else {
      low = middle;
    }
  }
  if (low <= EPSILON) {
    restorePlanningSnapshot(context, baseSnapshot);
    return undefined;
  }
  restorePlanningSnapshot(context, baseSnapshot);
  const committed = attempt(low);
  if (committed === undefined) {
    restorePlanningSnapshot(context, baseSnapshot);
    return undefined;
  }
  addDemandPlan(context, demand, committed.end, committed.quantity);
  return committed;
}

function scheduleDeliveryQuantity(
  context: SolverContext,
  demand: MaterialDemand,
  operation: ManufacturingOperation,
  quantity: number,
  desiredEnd: EpochSeconds
): EpochSeconds | undefined {
  let end = desiredEnd;
  let start = subtractDuration(end, operationDuration(operation, quantity));
  const fence = demand.fenceSeconds ?? operation.fenceSeconds ?? 0;
  if (
    (context.input.mode ?? "constrained") === "constrained" &&
    fence > 0
  ) {
    start = Math.max(
      start,
      (context.input.current + fence) as EpochSeconds
    ) as EpochSeconds;
    end = (start + operationDuration(operation, quantity)) as EpochSeconds;
  }

  for (const flow of operation.flows) {
    if (flow.quantity >= 0 && flow.quantityFixed >= 0) {
      continue;
    }
    const flowDate = flowDateFor(context, operation, flow, start, end);
    if (!isEffective(flow, flowDate)) {
      continue;
    }
    const state = context.states.get(bufferKey(flow.buffer));
    if (!state) {
      return undefined;
    }
    const required = Math.abs(flow.quantity * quantity + flow.quantityFixed);
    const shortage = Math.max(0, required - balanceAt(state, flowDate));
    if (shortage <= EPSILON) {
      continue;
    }
    const supply = createSupply(
      context,
      flow.buffer,
      shortage,
      flowDate,
      false,
      demand.maxLatenessSeconds
    );
    if (supply.quantity + EPSILON < shortage) {
      return undefined;
    }
    if (
      (context.input.mode ?? "constrained") === "constrained" &&
      supply.date > flowDate
    ) {
      start = supply.date;
      end = (start + operationDuration(operation, quantity)) as EpochSeconds;
    }
  }

  addOperationPlan(
    context,
    operation,
    { start, end },
    quantity,
    false,
    false
  );
  return end;
}

function deliveryEndFromHorizon(
  context: SolverContext,
  operation: ManufacturingOperation,
  horizon: EpochSeconds,
  quantity: number
): EpochSeconds {
  return scheduleFromStart(
    context,
    operation,
    horizon,
    operationDuration(operation, quantity)
  ).end;
}

function maximumDeliveryQuantityAt(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds
): number {
  let maximum = Number.POSITIVE_INFINITY;
  for (const flow of operation.flows) {
    if (flow.quantity >= 0 && flow.quantityFixed >= 0) {
      continue;
    }
    const available = maximumBufferSupplyAt(
      context,
      flow.buffer,
      date,
      new Set()
    );
    const fixed = Math.max(0, -flow.quantityFixed);
    if (flow.quantity < -EPSILON) {
      maximum = Math.min(
        maximum,
        Math.max(0, (available - fixed) / -flow.quantity)
      );
    } else if (available + EPSILON < fixed) {
      return 0;
    }
  }
  return Number.isFinite(maximum) ? Math.max(0, maximum) : Number.POSITIVE_INFINITY;
}

function maximumBufferSupplyAt(
  context: SolverContext,
  bufferName: string,
  date: EpochSeconds,
  visiting: Set<string>
): number {
  const key = bufferKey(bufferName);
  const state = context.states.get(key);
  if (!state || visiting.has(key)) {
    return state ? Math.max(0, balanceAt(state, date)) : 0;
  }
  const available = Math.max(0, balanceAt(state, date));
  const producer = context.producers.get(key);
  if (!producer) {
    return available;
  }
  const nextVisiting = new Set(visiting);
  nextVisiting.add(key);
  const producerQuantity = maximumProducerQuantityAt(
    context,
    producer,
    date,
    nextVisiting
  );
  const output = producer.type === "routing" || producer.type === "alternate"
    ? routedOutputQuantity(producer, bufferName)
    : outputQuantity(producer, bufferName, date);
  return available + producerQuantity * output.variable + output.fixed;
}

function maximumProducerQuantityAt(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds,
  visiting: Set<string>
): number {
  if (operation.type === "alternate") {
    return operation.subOperations.reduce(
      (total, child) => total + maximumProducerQuantityAt(
        context,
        child.operation,
        date,
        visiting
      ),
      0
    );
  }
  if (operation.type === "routing") {
    return operation.subOperations.reduce(
      (minimum, child) => Math.min(
        minimum,
        maximumProducerQuantityAt(context, child.operation, date, visiting)
      ),
      Number.POSITIVE_INFINITY
    );
  }
  let maximum = Number.POSITIVE_INFINITY;
  for (const flow of operation.flows) {
    if (flow.quantity >= 0 && flow.quantityFixed >= 0) {
      continue;
    }
    const available = maximumBufferSupplyAt(
      context,
      flow.buffer,
      date,
      visiting
    );
    const fixed = Math.max(0, -flow.quantityFixed);
    if (flow.quantity < -EPSILON) {
      maximum = Math.min(
        maximum,
        Math.max(0, (available - fixed) / -flow.quantity)
      );
    } else if (available + EPSILON < fixed) {
      return 0;
    }
  }
  const lotMaximum = operation.maximumQuantity;
  const bounded = Math.min(
    Number.isFinite(maximum) ? maximum : Number.POSITIVE_INFINITY,
    lotMaximum !== undefined && lotMaximum > EPSILON
      ? lotMaximum
      : Number.POSITIVE_INFINITY
  );
  const multiple = operation.multipleQuantity ?? 0;
  return multiple > EPSILON
    ? Math.floor(bounded / multiple + EPSILON) * multiple
    : bounded;
}

function nextConfirmedMaterialDate(
  context: SolverContext,
  date: EpochSeconds
): EpochSeconds | undefined {
  return [...context.states.values()]
    .flatMap((state) => state.events)
    .filter(
      (event) =>
        event.confirmed === true &&
        event.kind === "receipt" &&
        event.date > date &&
        event.date < INFINITE_FUTURE &&
        event.quantity > EPSILON
    )
    .map((event) => event.date)
    .sort((left, right) => left - right)[0];
}

function createSupply(
  context: SolverContext,
  bufferName: string,
  quantity: number,
  desiredEnd: EpochSeconds,
  confirmed: boolean,
  maxLatenessSeconds?: number
): SupplyResult {
  if (quantity <= EPSILON) {
    return { date: desiredEnd, quantity: 0 };
  }
  const key = bufferKey(bufferName);
  const state = context.states.get(key);
  if (!state) {
    return { date: desiredEnd, quantity: 0 };
  }
  if (
    (context.input.mode ?? "constrained") === "constrained"
  ) {
    const confirmedDate = confirmedSupplyDate(state, desiredEnd, quantity);
    if (confirmedDate !== undefined) {
      return { date: confirmedDate, quantity };
    }
  }
  const producer = context.producers.get(key);
  if (!producer) {
    const source = matchingSourceForBuffer(
      context.input.sources,
      state.buffer
    );
    if (!source) {
      return { date: desiredEnd, quantity: 0 };
    }
    const deliveryDate = purchaseDeliveryDateForDate(
      context,
      desiredEnd,
      source
    );
    const purchaseQuantity = orderQuantity(
      quantity,
      source.minimumQuantity,
      source.multipleQuantity
    );
    addPurchaseSupply(
      context,
      state,
      source,
      deliveryDate,
      purchaseQuantity
    );
    return { date: deliveryDate, quantity: purchaseQuantity };
  }
  if (context.activeOperations.has(`${producer.name}\u0000${key}`)) {
    return { date: desiredEnd, quantity: 0 };
  }

  const candidates = context.producerCandidates.get(key) ?? [producer];
  if (candidates.length > 1) {
    return createAlternativeSupply(
      context,
      candidates,
      bufferName,
      quantity,
      desiredEnd,
      confirmed,
      maxLatenessSeconds
    );
  }

  return createSupplyFromProducer(
    context,
    producer,
    bufferName,
    quantity,
    desiredEnd,
    confirmed,
    maxLatenessSeconds
  );
}

function createAlternativeSupply(
  context: SolverContext,
  candidates: readonly ManufacturingOperation[],
  bufferName: string,
  quantity: number,
  desiredEnd: EpochSeconds,
  confirmed: boolean,
  maxLatenessSeconds?: number
): SupplyResult {
  let remaining = quantity;
  let produced = 0;
  let lastDate = desiredEnd;
  let notBefore: EpochSeconds | undefined;
  const allocations: SupplyAllocation[] = [];

  for (const candidate of candidates) {
    if (remaining <= EPSILON) {
      break;
    }
    const result = createSupplyFromProducer(
      context,
      candidate,
      bufferName,
      remaining,
      desiredEnd,
      confirmed,
      maxLatenessSeconds,
      notBefore,
      true
    );
    if (result.quantity <= EPSILON) {
      continue;
    }
    produced += result.quantity;
    remaining = Math.max(0, quantity - produced);
    lastDate = Math.max(lastDate, result.date) as EpochSeconds;
    allocations.push(...supplyResultAllocations(result));
    if (result.operationEnd !== undefined) {
      notBefore = notBefore === undefined
        ? result.operationEnd
        : Math.max(notBefore, result.operationEnd) as EpochSeconds;
    }
  }

  return {
    date: produced > EPSILON ? lastDate : desiredEnd,
    quantity: produced,
    ...(allocations.length === 0 ? {} : { allocations })
  };
}

function supplyResultAllocations(
  result: SupplyResult
): readonly SupplyAllocation[] {
  return result.allocations ?? (
    result.quantity > EPSILON
      ? [{ date: result.date, quantity: result.quantity }]
      : []
  );
}

function createSupplyFromProducer(
  context: SolverContext,
  selected: ManufacturingOperation,
  bufferName: string,
  quantity: number,
  desiredEnd: EpochSeconds,
  confirmed: boolean,
  maxLatenessSeconds?: number,
  notBefore?: EpochSeconds,
  alternativeCandidate = false,
  suppressLotSizing = false,
  deferInputSupply = false
): SupplyResult {
  const key = bufferKey(bufferName);
  if (selected.type === "routing" || selected.type === "alternate") {
    return createRoutedSupply(
      context,
      selected,
      bufferName,
      quantity,
      desiredEnd,
      notBefore
    );
  }

  if (selected.type === "split") {
    return createSplitSupply(
      context,
      selected,
      bufferName,
      quantity,
      desiredEnd,
      confirmed,
      maxLatenessSeconds,
      notBefore
    );
  }

  const effectivitySplit = createEffectivitySplitSupply(
    context,
    selected,
    bufferName,
    quantity,
    desiredEnd,
    confirmed
  );
  if (effectivitySplit !== undefined) {
    return effectivitySplit;
  }

  const unconstrainedAlternative =
    alternativeCandidate &&
    (context.input.mode ?? "constrained") === "unconstrained";
  const initialSchedule = scheduleForOutputDate(
    context,
    selected,
    bufferName,
    desiredEnd,
    1
  );
  const outputSchedule = unconstrainedAlternative
    ? scheduleOperation(context, selected, desiredEnd, 1)
    : initialSchedule;
  const initialOutput = outputQuantity(
    selected,
    bufferName,
    outputDate(context, selected, bufferName, outputSchedule)
  );
  if (initialOutput.variable > EPSILON) {
    const planQuantity = Math.max(
      0,
      (quantity - initialOutput.fixed) / initialOutput.variable
    );
    if (planQuantity <= EPSILON) {
      return {
        date: desiredEnd,
        quantity: initialOutput.fixed,
        operationEnd: initialSchedule.end
      };
    }
    const lotQuantities = suppressLotSizing
      ? [planQuantity]
      : splitLotQuantities(selected, planQuantity);
    if (
      lotQuantities.length > 1 ||
      Math.abs((lotQuantities[0] ?? planQuantity) - planQuantity) > EPSILON
    ) {
      return createLotSizedSupply(
        context,
        selected,
        bufferName,
        lotQuantities,
        desiredEnd,
        confirmed,
        maxLatenessSeconds,
        notBefore,
        alternativeCandidate,
        true
      );
    }
    if (canSplitForResourceCapacity(context, selected)) {
      context.activeOperations.add(`${selected.name}\u0000${key}`);
      const supply = createCapacityConstrainedSupply(
        context,
        selected,
        bufferName,
        planQuantity,
        desiredEnd,
        confirmed,
        notBefore,
        alternativeCandidate
      );
      context.activeOperations.delete(`${selected.name}\u0000${key}`);
      return supply;
    }
    let schedule = unconstrainedAlternative
      ? scheduleOperation(context, selected, desiredEnd, planQuantity)
      : scheduleForOutputDate(
          context,
          selected,
          bufferName,
          desiredEnd,
          planQuantity
        );
    schedule = scheduleAtOrAfter(
      context,
      selected,
      schedule,
      planQuantity,
      notBefore
    );
    context.activeOperations.add(`${selected.name}\u0000${key}`);
    if (!deferInputSupply) {
      schedule = scheduleWithInputs(
        context,
        selected,
        schedule,
        planQuantity
      );
      if (!schedule.inputsSatisfied) {
        context.activeOperations.delete(`${selected.name}\u0000${key}`);
        return { date: desiredEnd, quantity: 0 };
      }
    }
    if (canScheduleFixedResourceCapacity(context, selected, true)) {
      const capacitySchedule = scheduleFixedResourceCapacity(
        context,
        selected,
        schedule,
        desiredEnd,
        maxLatenessSeconds
      );
      if (!capacitySchedule) {
        context.activeOperations.delete(`${selected.name}\u0000${key}`);
        return { date: desiredEnd, quantity: 0 };
      }
      schedule = capacitySchedule;
    }
    addOperationPlan(
      context,
      selected,
      schedule,
      planQuantity,
      confirmed,
      false
    );
    context.activeOperations.delete(`${selected.name}\u0000${key}`);
    const output = outputQuantity(
      selected,
      bufferName,
      outputDate(context, selected, bufferName, schedule)
    );
    return {
      date: outputDate(context, selected, bufferName, schedule),
      quantity: output.variable * planQuantity + output.fixed,
      operationEnd: schedule.end
    };
  }

  if (initialOutput.fixed <= EPSILON) {
    return { date: desiredEnd, quantity: 0 };
  }
  const planCount = Math.ceil(
    quantity / initialOutput.fixed - EPSILON
  );
  let schedule = scheduleForOutputDate(
    context,
    selected,
    bufferName,
    desiredEnd,
    1
  );
  schedule = scheduleAtOrAfter(
    context,
    selected,
    schedule,
    1,
    notBefore
  );
  context.activeOperations.add(`${selected.name}\u0000${key}`);
  schedule = scheduleWithInputs(context, selected, schedule, 1);
  if (!schedule.inputsSatisfied) {
    context.activeOperations.delete(`${selected.name}\u0000${key}`);
    return { date: desiredEnd, quantity: 0 };
  }
  const output = outputQuantity(
    selected,
    bufferName,
    outputDate(context, selected, bufferName, schedule)
  );
  for (let index = 0; index < planCount; index += 1) {
    addOperationPlan(
      context,
      selected,
      schedule,
      1,
      confirmed,
      false
    );
  }
  context.activeOperations.delete(`${selected.name}\u0000${key}`);
  return {
    date: outputDate(context, selected, bufferName, schedule),
    quantity: planCount * (output.fixed + output.variable),
    operationEnd: schedule.end
  };
}

function splitLotQuantities(
  operation: ManufacturingOperation,
  requested: number
): readonly number[] {
  if (requested <= EPSILON) {
    return [];
  }
  const minimum = Math.max(0, operation.minimumQuantity ?? 0);
  const maximum = Math.max(0, operation.maximumQuantity ?? 0);
  const multiple = Math.max(0, operation.multipleQuantity ?? 0);
  const roundLot = (quantity: number): number => multiple > EPSILON
    ? Math.ceil(quantity / multiple - EPSILON) * multiple
    : quantity;
  if (maximum <= EPSILON) {
    return [Math.max(minimum, roundLot(requested))];
  }

  const lots: number[] = [];
  let remaining = requested;
  while (remaining > EPSILON) {
    const lot = Math.max(minimum, roundLot(Math.min(remaining, maximum)));
    lots.push(lot);
    remaining -= lot;
  }
  return lots;
}

function createLotSizedSupply(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string,
  lotQuantities: readonly number[],
  desiredEnd: EpochSeconds,
  confirmed: boolean,
  maxLatenessSeconds?: number,
  notBefore?: EpochSeconds,
  alternativeCandidate = false,
  deferInputSupply = false
): SupplyResult {
  const operationPlanStart = context.operationPlans.length;
  let quantity = 0;
  let date = desiredEnd;
  let operationEnd = desiredEnd;
  const allocations: SupplyAllocation[] = [];
  for (const lotQuantity of lotQuantities) {
    const result = createSupplyFromProducer(
      context,
      operation,
      bufferName,
      lotQuantity,
      desiredEnd,
      confirmed,
      maxLatenessSeconds,
      notBefore,
      alternativeCandidate,
      true,
      deferInputSupply
    );
    quantity += result.quantity;
    date = Math.max(date, result.date) as EpochSeconds;
    operationEnd = Math.max(operationEnd, result.operationEnd ?? desiredEnd) as EpochSeconds;
    allocations.push(...supplyResultAllocations(result));
  }
  if (deferInputSupply) {
    reconcileBatchInputShortages(
      context,
      operation,
      context.operationPlans.slice(operationPlanStart)
    );
  }
  return {
    date,
    quantity,
    ...(allocations.length === 0 ? {} : { allocations }),
    operationEnd
  };
}

function reconcileBatchInputShortages(
  context: SolverContext,
  operation: ManufacturingOperation,
  plans: readonly OperationPlan[]
): void {
  const inputFlows = operation.flows.filter(
    (flow) => flow.quantity < 0 || flow.quantityFixed < 0
  );
  if (inputFlows.length === 0 || plans.length === 0) {
    return;
  }

  const requirementsByBuffer = new Map<string, EpochSeconds[]>();
  for (const plan of plans) {
    for (const flow of inputFlows) {
      const date = flowDateFor(
        context,
        operation,
        flow,
        plan.start,
        plan.end
      );
      if (!isEffective(flow, date)) {
        continue;
      }
      const key = bufferKey(flow.buffer);
      const dates = requirementsByBuffer.get(key) ?? [];
      dates.push(date);
      requirementsByBuffer.set(key, dates);
    }
  }

  for (const [buffer, dates] of requirementsByBuffer) {
    const state = context.states.get(buffer);
    if (!state) {
      continue;
    }
    for (const date of [...new Set(dates)].sort((left, right) => left - right)) {
      const shortage = Math.max(0, -balanceAt(state, date));
      if (shortage <= EPSILON) {
        continue;
      }
      createSupply(context, buffer, shortage, date, false);
    }
  }
}

function createSplitSupply(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string,
  quantity: number,
  desiredEnd: EpochSeconds,
  confirmed: boolean,
  maxLatenessSeconds?: number,
  notBefore?: EpochSeconds,
  suppressBatchSplit = false
): SupplyResult {
  const topFlow = outputQuantity(operation, bufferName, desiredEnd);
  const topFlowQuantity = topFlow.variable;
  const effectiveChildren = operation.subOperations.filter(
    (child) =>
      child.priority > EPSILON &&
      isSubOperationEffective(child, desiredEnd)
  );
  const mode = context.input.mode ?? "constrained";
  const reversePlanning = mode === "constrained" &&
    effectiveChildren.some(
      (child) =>
        child.effectiveStart !== undefined ||
        child.effectiveEnd !== undefined ||
        (child.operation.minimumQuantity ?? 0) > EPSILON ||
        (child.operation.maximumQuantity ?? 0) > EPSILON ||
        (child.operation.multipleQuantity ?? 0) > EPSILON
    );
  const planningChildren = mode === "constrained"
    ? reversePlanning
      ? [...effectiveChildren].reverse()
      : [...effectiveChildren]
    : [...effectiveChildren].reverse();
  const lotSizedChildren = mode === "constrained" &&
    effectiveChildren.some(
      (child) =>
        (child.operation.minimumQuantity ?? 0) > EPSILON ||
        (child.operation.maximumQuantity ?? 0) > EPSILON ||
        (child.operation.multipleQuantity ?? 0) > EPSILON
    );
  const sumPriority = effectiveChildren.reduce(
    (total, child) => total + child.priority,
    0
  );
  if (sumPriority <= EPSILON || quantity <= EPSILON) {
    return { date: desiredEnd, quantity: 0 };
  }

  const lastPlanningChild = planningChildren[planningChildren.length - 1];
  const canSplitIntoBatches =
    !suppressBatchSplit &&
    reversePlanning &&
    lotSizedChildren &&
    lastPlanningChild !== undefined;

  const lastChildPlannedIn = (batchQuantity: number): boolean => {
    const snapshot = takePlanningSnapshot(context);
    const result = createSplitSupply(
      context,
      operation,
      bufferName,
      batchQuantity,
      desiredEnd,
      confirmed,
      maxLatenessSeconds,
      notBefore,
      true
    );
    void result;
    const planned = context.operationPlans
      .slice(snapshot.operationPlans.length)
      .some((plan) => plan.name === lastPlanningChild?.operation.name);
    restorePlanningSnapshot(context, snapshot);
    return planned;
  };

  if (canSplitIntoBatches && quantity > 1 + EPSILON) {
    const fullQuantityPlanned = lastChildPlannedIn(quantity);
    if (fullQuantityPlanned) {
      let low = 0;
      let high = Math.floor(quantity);
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (mid <= low) {
          break;
        }
        if (lastChildPlannedIn(mid)) {
          high = mid;
        } else {
          low = mid;
        }
      }
      if (low > EPSILON && low + EPSILON < quantity) {
        const first = createSplitSupply(
          context,
          operation,
          bufferName,
          low,
          desiredEnd,
          confirmed,
          maxLatenessSeconds,
          notBefore,
          true
        );
        const remainder = Math.max(0, quantity - first.quantity);
        if (remainder > EPSILON) {
          const second = createSplitSupply(
            context,
            operation,
            bufferName,
            remainder,
            desiredEnd,
            confirmed,
            maxLatenessSeconds,
            notBefore,
            true
          );
          const allocations = [
            ...supplyResultAllocations(first),
            ...supplyResultAllocations(second)
          ];
          const produced = first.quantity + second.quantity;
          return {
            date: allocations.length === 0
              ? desiredEnd
              : Math.max(
                  ...allocations.map((allocation) => allocation.date)
                ) as EpochSeconds,
            quantity: produced,
            ...(allocations.length === 0 ? {} : { allocations }),
            operationEnd: Math.max(
              first.operationEnd ?? desiredEnd,
              second.operationEnd ?? desiredEnd
            ) as EpochSeconds
          };
        }
        return first;
      }
    }
  }

  const operationKey = `${operation.name}\u0000${bufferKey(bufferName)}`;
  context.activeOperations.add(operationKey);
  try {
    let loopQuantity = quantity;
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      if (loopQuantity <= EPSILON) {
        return { date: desiredEnd, quantity: 0 };
      }
      const snapshot = takePlanningSnapshot(context);
      const plannedChildren: SplitChildPlan[] = [];
      let plannedQuantity = 0;
      let plannedPriority = 0;
      let ownerEnd = desiredEnd;
      let retry = false;
      let failed = false;

      for (let childIndex = 0; childIndex < planningChildren.length; childIndex += 1) {
        const child = planningChildren[childIndex];
        if (!child) {
          continue;
        }
        const flow = outputQuantity(
          child.operation,
          bufferName,
          desiredEnd
        );
        const flowPer = flow.variable + topFlowQuantity;
        if (flowPer <= EPSILON) {
          failed = true;
          break;
        }
        const remainingPriority = sumPriority - plannedPriority;
        const asked = remainingPriority <= EPSILON
          ? 0
          : (loopQuantity - plannedQuantity) *
            child.priority /
            remainingPriority /
            flowPer;
        if (asked <= EPSILON) {
          continue;
        }

        const childEnd = mode === "constrained"
          ? reversePlanning
            ? splitChildDesiredEnd(
                context,
                effectiveChildren,
                child,
                plannedChildren,
                ownerEnd
              )
            : childIndex === 0
              ? desiredEnd
              : ownerEnd
          : splitInitialChildEnd(
              context,
              effectiveChildren,
              effectiveChildren.indexOf(child),
              desiredEnd
            );
        const childPlan = planSplitChild(
          context,
          child,
          bufferName,
          asked,
          childEnd,
          confirmed,
          maxLatenessSeconds,
          notBefore,
          true
        );
        if (
          childPlan.quantity <= EPSILON ||
          childPlan.schedule === undefined
        ) {
          failed = true;
          break;
        }
        if (childPlan.quantity <= asked - EPSILON) {
          loopQuantity *= childPlan.quantity / asked;
          retry = true;
          break;
        }
        plannedChildren.push(childPlan);
        plannedQuantity += childPlan.quantity * flowPer;
        plannedPriority += child.priority;
        ownerEnd = Math.max(ownerEnd, childPlan.schedule.end) as EpochSeconds;
      }

      if (failed) {
        restorePlanningSnapshot(context, snapshot);
        return { date: desiredEnd, quantity: 0 };
      }
      if (retry) {
        restorePlanningSnapshot(context, snapshot);
        continue;
      }

      const parentQuantity = topFlowQuantity > EPSILON
        ? loopQuantity / topFlowQuantity
        : loopQuantity;
      const parentSchedule = splitParentSchedule(
        context,
        operation,
        bufferName,
        desiredEnd,
        parentQuantity,
        plannedChildren
      );
      addOperationPlan(
        context,
        operation,
        parentSchedule,
        parentQuantity,
        confirmed,
        false
      );

      const allocations = splitFlowQuantity(
        context,
        operation,
        bufferName,
        parentSchedule,
        parentQuantity,
        plannedChildren
      );
      const produced = allocations.reduce(
        (total, allocation) => total + allocation.quantity,
        0
      );
      return {
        date: allocations.length === 0
          ? desiredEnd
          : Math.max(
              ...allocations.map((allocation) => allocation.date)
            ) as EpochSeconds,
        quantity: produced > EPSILON ? produced : loopQuantity,
        operationEnd: parentSchedule.end
      };
    }
  } finally {
    context.activeOperations.delete(operationKey);
  }

  return { date: desiredEnd, quantity: 0 };
}

function splitChildDesiredEnd(
  context: SolverContext,
  children: readonly ManufacturingSubOperation[],
  child: ManufacturingSubOperation,
  plannedChildren: readonly SplitChildPlan[],
  desiredEnd: EpochSeconds
): EpochSeconds {
  if ((context.input.mode ?? "constrained") !== "constrained") {
    return desiredEnd;
  }
  const childIndex = children.indexOf(child);
  if (childIndex < 0) {
    return desiredEnd;
  }
  let end = desiredEnd;
  for (const planned of plannedChildren) {
    const plannedIndex = children.indexOf(planned.child);
    if (
      plannedIndex <= childIndex ||
      !shareFiniteResource(context, child.operation, planned.child.operation)
    ) {
      continue;
    }
    end = Math.min(end, planned.schedule.start) as EpochSeconds;
  }
  return end;
}

function planSplitChild(
  context: SolverContext,
  child: ManufacturingSubOperation,
  bufferName: string,
  asked: number,
  desiredEnd: EpochSeconds,
  confirmed: boolean,
  maxLatenessSeconds?: number,
  notBefore?: EpochSeconds,
  preferLaterResourceCapacity = false
): SplitChildPlan | {
  readonly quantity: number;
  readonly schedule?: undefined;
} {
  const quantity = sizedOperationQuantity(child.operation, asked);
  if (quantity <= EPSILON) {
    return { quantity: 0 };
  }

  let schedule = scheduleForOutputDate(
    context,
    child.operation,
    bufferName,
    desiredEnd,
    quantity
  );
  schedule = scheduleAtOrAfter(
    context,
    child.operation,
    schedule,
    quantity,
    notBefore
  );
  const operationKey = `${child.operation.name}\u0000${bufferKey(bufferName)}`;
  if (context.activeOperations.has(operationKey)) {
    return { quantity: 0 };
  }

  const baseSnapshot = takePlanningSnapshot(context);
  context.activeOperations.add(operationKey);
  try {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      restorePlanningSnapshot(context, baseSnapshot);
      let nextSchedule = scheduleWithInputs(
        context,
        child.operation,
        schedule,
        quantity
      );
      if (canScheduleFixedResourceCapacity(context, child.operation, true)) {
        const capacitySchedule = scheduleFixedResourceCapacity(
          context,
          child.operation,
          nextSchedule,
          desiredEnd,
          maxLatenessSeconds,
          preferLaterResourceCapacity
        );
        if (!capacitySchedule) {
          restorePlanningSnapshot(context, baseSnapshot);
          return { quantity: 0 };
        }
        nextSchedule = capacitySchedule;
      }
      if (
        nextSchedule.start === schedule.start &&
        nextSchedule.end === schedule.end
      ) {
        addOperationPlan(
          context,
          child.operation,
          nextSchedule,
          quantity,
          confirmed,
          false
        );
        return {
          child,
          quantity,
          schedule: nextSchedule
        };
      }
      schedule = nextSchedule;
    }
    restorePlanningSnapshot(context, baseSnapshot);
    return { quantity: 0 };
  } finally {
    context.activeOperations.delete(operationKey);
  }
}

function splitInitialChildEnd(
  context: SolverContext,
  children: readonly ManufacturingSubOperation[],
  childIndex: number,
  desiredEnd: EpochSeconds
): EpochSeconds {
  if ((context.input.mode ?? "constrained") !== "unconstrained") {
    return desiredEnd;
  }
  const first = children[childIndex];
  if (!first) {
    return desiredEnd;
  }
  let end = desiredEnd;
  for (const child of children.slice(childIndex + 1)) {
    if (!shareFiniteResource(context, first.operation, child.operation)) {
      continue;
    }
    end = Math.min(
      end,
      (desiredEnd - operationDuration(child.operation, 1)) as EpochSeconds
    ) as EpochSeconds;
  }
  return end;
}

function shareFiniteResource(
  context: SolverContext,
  left: ManufacturingOperation,
  right: ManufacturingOperation
): boolean {
  const rightResources = new Set(
    (right.loads ?? [])
      .filter((load) => finiteResourceMaximum(context, load.resource) !== undefined)
      .map((load) => load.resource)
  );
  return (left.loads ?? []).some(
    (load) =>
      finiteResourceMaximum(context, load.resource) !== undefined &&
      rightResources.has(load.resource)
  );
}

function splitParentSchedule(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string,
  desiredEnd: EpochSeconds,
  quantity: number,
  children: readonly SplitChildPlan[]
): Schedule {
  let start = children[0]?.schedule.start ?? desiredEnd;
  let end = desiredEnd;
  for (const child of children) {
    start = Math.min(start, child.schedule.start) as EpochSeconds;
    end = Math.max(end, child.schedule.end) as EpochSeconds;
  }
  const output = operation.flows.find(
    (flow) =>
      flow.buffer === bufferName &&
      positiveFlowQuantity(flow) > EPSILON
  );
  if (output) {
    const outputEnd = operationEndForFlowDate(
      context,
      operation,
      output,
      desiredEnd,
      operationDuration(operation, quantity)
    );
    end = Math.max(end, outputEnd) as EpochSeconds;
    if (output.type === "end") {
      start = Math.min(
        start,
        (end - operationDuration(operation, quantity)) as EpochSeconds
      ) as EpochSeconds;
    }
  }
  return { start, end };
}

function splitFlowQuantity(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string,
  parentSchedule: Schedule,
  parentQuantity: number,
  children: readonly SplitChildPlan[]
): readonly SupplyAllocation[] {
  const allocations: SupplyAllocation[] = [];
  const parentOutput = outputQuantity(
    operation,
    bufferName,
    outputDate(context, operation, bufferName, parentSchedule)
  );
  const parentProduced = parentOutput.variable * parentQuantity +
    parentOutput.fixed;
  if (parentProduced > EPSILON) {
    allocations.push({
      date: outputDate(context, operation, bufferName, parentSchedule),
      quantity: parentProduced
    });
  }
  for (const child of children) {
    const output = outputQuantity(
      child.child.operation,
      bufferName,
      outputDate(
        context,
        child.child.operation,
        bufferName,
        child.schedule
      )
    );
    const produced = output.variable * child.quantity + output.fixed;
    if (produced > EPSILON) {
      allocations.push({
        date: outputDate(
          context,
          child.child.operation,
          bufferName,
          child.schedule
        ),
        quantity: produced
      });
    }
  }
  return allocations;
}

function isSubOperationEffective(
  subOperation: ManufacturingSubOperation,
  date: EpochSeconds
): boolean {
  return (
    (subOperation.effectiveStart === undefined ||
      date >= subOperation.effectiveStart) &&
    (subOperation.effectiveEnd === undefined ||
      date < subOperation.effectiveEnd)
  );
}

function sizedOperationQuantity(
  operation: ManufacturingOperation,
  requested: number
): number {
  if (requested <= EPSILON) {
    return 0;
  }
  let quantity = Math.max(requested, operation.minimumQuantity ?? 0);
  const multiple = operation.multipleQuantity ?? 0;
  if (multiple > EPSILON) {
    quantity = Math.ceil(quantity / multiple - EPSILON) * multiple;
  }
  if (
    operation.maximumQuantity !== undefined &&
    operation.maximumQuantity > EPSILON
  ) {
    quantity = Math.min(quantity, operation.maximumQuantity);
  }
  return quantity;
}

function createEffectivitySplitSupply(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string,
  quantity: number,
  desiredEnd: EpochSeconds,
  confirmed: boolean
): SupplyResult | undefined {
  const inputFlows = operation.flows.filter(
    (flow) => flow.quantity < -EPSILON || flow.quantityFixed < -EPSILON
  );
  const output = outputQuantity(operation, bufferName);
  if (
    context.input.mode !== "constrained" ||
    inputFlows.length < 2 ||
    !inputFlows.some(
      (flow) =>
        flow.effectiveStart !== undefined ||
        flow.effectiveEnd !== undefined
    ) ||
    inputFlows.some(
      (flow) =>
        flow.quantityFixed !== 0 ||
        flow.quantity >= -EPSILON ||
        flow.type !== "start"
    ) ||
    output.variable <= EPSILON ||
    output.fixed > EPSILON ||
    operation.durationPerSeconds > EPSILON
  ) {
    return undefined;
  }

  const baseSchedule = scheduleForOutputDate(
    context,
    operation,
    bufferName,
    desiredEnd,
    1
  );
  const duration = operationDuration(operation, 1);
  const allocations: SupplyAllocation[] = [];
  let remaining = quantity;
  const orderedFlows = [...inputFlows].sort(
    (left, right) =>
      (left.effectiveStart ?? INFINITE_PAST) -
        (right.effectiveStart ?? INFINITE_PAST) ||
      (left.effectiveEnd ?? Number.POSITIVE_INFINITY) -
        (right.effectiveEnd ?? Number.POSITIVE_INFINITY)
  );

  for (const flow of orderedFlows) {
    if (remaining <= EPSILON) {
      break;
    }
    const state = context.states.get(bufferKey(flow.buffer));
    if (!state) {
      continue;
    }
    const availabilityDate = flow.effectiveEnd !== undefined
      ? (flow.effectiveEnd - 1) as EpochSeconds
      : flow.effectiveStart ?? baseSchedule.start;
    const available = Math.max(0, balanceAt(state, availabilityDate));
    const capacity = available / Math.abs(flow.quantity);
    const segmentQuantity = Math.min(remaining, capacity);
    if (segmentQuantity <= EPSILON) {
      continue;
    }

    const segmentStart = flow.effectiveStart === undefined
      ? baseSchedule.start
      : Math.max(baseSchedule.start, flow.effectiveStart) as EpochSeconds;
    const segmentEnd = (segmentStart + duration) as EpochSeconds;
    const schedule = {
      start: segmentStart,
      end: segmentEnd
    } satisfies Schedule;
    const flowDate = flowDateFor(
      context,
      operation,
      flow,
      schedule.start,
      schedule.end
    );
    if (!isEffective(flow, flowDate)) {
      continue;
    }
    const segmentOutput = outputQuantity(
      operation,
      bufferName,
      outputDate(context, operation, bufferName, schedule)
    );
    if (segmentOutput.variable <= EPSILON) {
      continue;
    }
    const planQuantity = segmentQuantity / segmentOutput.variable;
    addOperationPlan(
      context,
      operation,
      schedule,
      planQuantity,
      confirmed,
      false
    );
    const produced = segmentOutput.variable * planQuantity +
      segmentOutput.fixed;
    allocations.push({
      date: outputDate(context, operation, bufferName, schedule),
      quantity: produced
    });
    remaining -= produced;
  }

  return allocations.length === 0
    ? undefined
    : {
        date: allocations[allocations.length - 1]?.date ?? desiredEnd,
        quantity: quantity - remaining,
        allocations
      };
}

function canSplitForResourceCapacity(
  context: SolverContext,
  operation: ManufacturingOperation
): boolean {
  if (
    (context.input.mode ?? "constrained") !== "constrained" ||
    (context.input.constraints ?? 15) === 0 ||
    operation.type !== "time_per" ||
    operation.durationSeconds > EPSILON ||
    operation.durationPerSeconds <= EPSILON
  ) {
    return false;
  }
  return (operation.loads ?? []).some((load) =>
    finiteResourceMaximum(context, load.resource) !== undefined
  );
}

function canScheduleFixedResourceCapacity(
  context: SolverContext,
  operation: ManufacturingOperation,
  allowInputFlows = false
): boolean {
  if (
    (context.input.constraints ?? 15) === 0 ||
    operation.type !== "fixed_time" ||
    operation.durationSeconds <= EPSILON ||
    operation.durationPerSeconds > EPSILON ||
    (!allowInputFlows && operation.flows.some(
      (flow) => flow.quantity < 0 || flow.quantityFixed < 0
    ))
  ) {
    return false;
  }
  return (operation.loads ?? []).some((load) =>
    finiteResourceMaximum(context, load.resource) !== undefined
  );
}

function scheduleFixedResourceCapacity(
  context: SolverContext,
  operation: ManufacturingOperation,
  initial: Schedule,
  desiredEnd: EpochSeconds,
  maxLatenessSeconds: number | undefined,
  preferLater = false
): Schedule | undefined {
  const duration = initial.end - initial.start;
  const earliestEnd = earliestCapacityEnd(context, operation, desiredEnd);
  const constrained = (context.input.mode ?? "constrained") === "constrained";
  let end = initial.end;
  if (!preferLater) {
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const start = (end - duration) as EpochSeconds;
      if ((constrained && start < context.input.current) || end < earliestEnd) {
        break;
      }
      const schedule = { start, end } satisfies Schedule;
      const conflict = firstResourceCapacityConflict(
        context,
        operation,
        schedule
      );
      if (conflict === undefined) {
        return schedule;
      }
      if (
        isSoftUnconstrainedResourcePlan(
          context,
          operation,
          maxLatenessSeconds
        )
      ) {
        if (conflict !== schedule.start) {
          return schedule;
        }
        const overload = resourceOverloadAt(
          context,
          operation,
          schedule.start
        );
        if (
          overload &&
          overload.currentLoad > overload.maximum + EPSILON &&
          schedule.start >= earliestEnd
        ) {
          return {
            start: (schedule.start - duration) as EpochSeconds,
            end: schedule.start
          };
        }
        if (
          overload &&
          hasResourceStartEvent(context, operation, schedule.start)
        ) {
          const delayedStart = (
            schedule.start + DEFAULT_MINIMUM_DELAY_SECONDS
          ) as EpochSeconds;
          return {
            start: delayedStart,
            end: (delayedStart + duration) as EpochSeconds
          };
        }
        return schedule;
      }
      end = conflict;
    }
  }

  const latestEnd = maxLatenessSeconds === undefined
    ? undefined
    : (desiredEnd + maxLatenessSeconds) as EpochSeconds;
  let start = initial.start;
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const end = (start + duration) as EpochSeconds;
    if (latestEnd !== undefined && end > latestEnd) {
      return undefined;
    }
    const schedule = { start, end } satisfies Schedule;
    const conflict = firstResourceCapacityConflict(
      context,
      operation,
      schedule
    );
    if (conflict === undefined) {
      return schedule;
    }
    if (resourceCapacityAvailable(context, operation, conflict)) {
      start = conflict;
      continue;
    }
    const next = nextResourceChange(context, operation, conflict);
    if (next === undefined) {
      return undefined;
    }
    start = next;
  }
  return undefined;
}

function isSoftUnconstrainedResourcePlan(
  context: SolverContext,
  operation: ManufacturingOperation,
  maxLatenessSeconds: number | undefined
): boolean {
  if (
    (context.input.mode ?? "constrained") !== "unconstrained" ||
    (context.input.constraints ?? 15) === 0 ||
    maxLatenessSeconds !== undefined
  ) {
    return false;
  }
  const finiteResources = (operation.loads ?? [])
    .map((load) => materialResource(context, load.resource))
    .filter(
      (resource): resource is NonNullable<typeof resource> =>
        resource?.maximum !== undefined
    );
  return (
    finiteResources.length > 0 &&
    finiteResources.every((resource) => resource.maxEarlySeconds === undefined)
  );
}

function resourceOverloadAt(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds
): {
  readonly currentLoad: number;
  readonly maximum: number;
} | undefined {
  for (const load of operation.loads ?? []) {
    const maximum = finiteResourceMaximum(context, load.resource);
    const state = context.resourceStates.get(load.resource);
    if (maximum === undefined || !state) {
      continue;
    }
    const currentLoad = resourceLoadAt(state, date);
    if (currentLoad + load.quantity > maximum + EPSILON) {
      return { currentLoad, maximum };
    }
  }
  return undefined;
}

function hasResourceStartEvent(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds
): boolean {
  return (operation.loads ?? []).some((load) => {
    const state = context.resourceStates.get(load.resource);
    return state?.events.some(
      (event) => event.date === date && event.quantity > EPSILON
    ) ?? false;
  });
}

function earliestCapacityEnd(
  context: SolverContext,
  operation: ManufacturingOperation,
  desiredEnd: EpochSeconds
): EpochSeconds {
  let earliest = (context.input.mode ?? "constrained") === "constrained"
    ? context.input.current
    : INFINITE_PAST;
  for (const load of operation.loads ?? []) {
    const maxEarly = materialResource(
      context,
      load.resource
    )?.maxEarlySeconds;
    if (maxEarly !== undefined) {
      earliest = Math.max(earliest, desiredEnd - maxEarly) as EpochSeconds;
    }
  }
  return earliest;
}

function firstResourceCapacityConflict(
  context: SolverContext,
  operation: ManufacturingOperation,
  schedule: Schedule
): EpochSeconds | undefined {
  if (!resourceCapacityAvailable(context, operation, schedule.start)) {
    return schedule.start;
  }
  let conflict: EpochSeconds | undefined;
  for (const load of operation.loads ?? []) {
    const maximum = finiteResourceMaximum(context, load.resource);
    const state = context.resourceStates.get(load.resource);
    if (maximum === undefined || !state) {
      continue;
    }
    for (const date of sortedResourceChangeDates(state, schedule.start)) {
      if (date >= schedule.end) {
        break;
      }
      if (resourceLoadAt(state, date) + load.quantity > maximum + EPSILON) {
        conflict = conflict === undefined
          ? date
          : Math.min(conflict, date) as EpochSeconds;
        break;
      }
    }
  }
  return conflict;
}

function createCapacityConstrainedSupply(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string,
  quantity: number,
  desiredEnd: EpochSeconds,
  confirmed: boolean,
  notBefore?: EpochSeconds,
  alternativeCandidate = false
): SupplyResult {
  const initialQuantity = alternativeCandidate ? 1 : quantity;
  const initial = scheduleForOutputDate(
    context,
    operation,
    bufferName,
    desiredEnd,
    initialQuantity
  );
  const alternativeHorizonEnd = alternativeCandidate
    ? (initial.end + operation.durationPerSeconds) as EpochSeconds
    : undefined;
  let earliest = notBefore === undefined
    ? initial.start
    : Math.max(initial.start, notBefore) as EpochSeconds;
  let remaining = quantity;
  let latestSchedule: Schedule | undefined;
  const allocations: SupplyAllocation[] = [];

  for (let attempt = 0; remaining > EPSILON && attempt < 10_000; attempt += 1) {
    const chunk = findCapacityChunk(
      context,
      operation,
      earliest,
      initial.end,
      remaining,
      alternativeHorizonEnd
    );
    if (!chunk) {
      break;
    }
    const supplies = ensureFlowSupply(
      context,
      operation,
      chunk.schedule,
      chunk.quantity
    );
    let requiredStart = chunk.schedule.start;
    for (const supply of supplies) {
      if (supply.flow.type === "start") {
        requiredStart = Math.max(
          requiredStart,
          supply.supplyDate
        ) as EpochSeconds;
      }
    }
    if (requiredStart > chunk.schedule.start) {
      earliest = requiredStart;
      continue;
    }

    addOperationPlan(
      context,
      operation,
      chunk.schedule,
      chunk.quantity,
      confirmed,
      false
    );
    remaining -= chunk.quantity;
    earliest = chunk.schedule.start;
    latestSchedule = chunk.schedule;

    const chunkOutputDate = outputDate(
      context,
      operation,
      bufferName,
      chunk.schedule
    );
    allocations.push({
      date: chunkOutputDate,
      quantity: chunk.quantity * outputQuantity(
        operation,
        bufferName,
        chunkOutputDate
      ).variable
    });
    if (chunkOutputDate > desiredEnd) {
      break;
    }
  }

  const output = outputQuantity(
    operation,
    bufferName,
    latestSchedule
      ? outputDate(context, operation, bufferName, latestSchedule)
      : desiredEnd
  );
  return {
    date: latestSchedule
      ? outputDate(context, operation, bufferName, latestSchedule)
      : desiredEnd,
    quantity: (quantity - Math.max(remaining, 0)) * output.variable +
      (remaining <= EPSILON ? output.fixed : 0),
    ...(allocations.length === 0 ? {} : { allocations }),
    ...(latestSchedule === undefined
      ? {}
      : { operationEnd: latestSchedule.end })
  };
}

function findCapacityChunk(
  context: SolverContext,
  operation: ManufacturingOperation,
  notBefore: EpochSeconds,
  preferredEnd: EpochSeconds,
  remaining: number,
  maximumEnd?: EpochSeconds
): CapacityChunk | undefined {
  const start = findEarliestCapacityStart(context, operation, notBefore);
  if (start === undefined) {
    return undefined;
  }
  const capacityEnd = capacityWindowEnd(context, operation, start);
  const targetEnd = start < preferredEnd
    ? Math.min(capacityEnd, preferredEnd) as EpochSeconds
    : Math.min(capacityEnd, maximumEnd ?? capacityEnd) as EpochSeconds;
  const quantityCapacity = availableResourceQuantity(
    context,
    operation,
    start
  );
  if (
    operation.type !== "time_per" &&
    quantityCapacity <= EPSILON
  ) {
    return undefined;
  }
  const duration = Math.min(
    remaining * operation.durationPerSeconds,
    targetEnd - start
  );
  if (duration <= EPSILON) {
    return undefined;
  }
  return {
    schedule: {
      start,
      end: (start + duration) as EpochSeconds
    },
    quantity: duration / operation.durationPerSeconds
  };
}

function findEarliestCapacityStart(
  context: SolverContext,
  operation: ManufacturingOperation,
  notBefore: EpochSeconds
): EpochSeconds | undefined {
  let date = notBefore;
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    if (resourceCapacityAvailable(context, operation, date)) {
      return date;
    }
    const next = nextResourceChange(context, operation, date);
    if (next === undefined) {
      return undefined;
    }
    date = next;
  }
  return undefined;
}

function capacityWindowEnd(
  context: SolverContext,
  operation: ManufacturingOperation,
  start: EpochSeconds
): EpochSeconds {
  let end: EpochSeconds | undefined;
  for (const load of operation.loads ?? []) {
    const maximum = finiteResourceMaximum(context, load.resource);
    const state = context.resourceStates.get(load.resource);
    if (maximum === undefined || !state) {
      continue;
    }
    for (const date of sortedResourceChangeDates(state, start)) {
      if (resourceLoadAt(state, date) + load.quantity > maximum + EPSILON) {
        end = end === undefined ? date : Math.min(end, date) as EpochSeconds;
        break;
      }
    }
  }
  return end ?? (
    start + operation.durationPerSeconds * Number.MAX_SAFE_INTEGER
  ) as EpochSeconds;
}

function resourceCapacityAvailable(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds,
  quantity = 1
): boolean {
  return (operation.loads ?? []).every((load) => {
    const maximum = finiteResourceMaximum(context, load.resource);
    const state = context.resourceStates.get(load.resource);
    return (
      maximum === undefined ||
      state === undefined ||
      resourceLoadAt(state, date) +
          scaledLoadQuantity(operation, load.quantity, quantity) <=
        maximum + EPSILON
    );
  });
}

function availableResourceQuantity(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds
): number {
  let available = Number.POSITIVE_INFINITY;
  for (const load of operation.loads ?? []) {
    const maximum = finiteResourceMaximum(context, load.resource);
    const state = context.resourceStates.get(load.resource);
    if (
      maximum === undefined ||
      state === undefined ||
      load.quantity <= EPSILON
    ) {
      continue;
    }
    available = Math.min(
      available,
      Math.max(0, maximum - resourceLoadAt(state, date)) /
        scaledLoadQuantity(operation, load.quantity, 1)
    );
  }
  return available;
}

function scaledLoadQuantity(
  operation: ManufacturingOperation,
  quantity: number,
  planQuantity: number
): number {
  void operation;
  void planQuantity;
  return quantity;
}

function nextResourceChange(
  context: SolverContext,
  operation: ManufacturingOperation,
  after: EpochSeconds
): EpochSeconds | undefined {
  let next: EpochSeconds | undefined;
  for (const load of operation.loads ?? []) {
    const state = context.resourceStates.get(load.resource);
    if (!state || finiteResourceMaximum(context, load.resource) === undefined) {
      continue;
    }
    for (const event of state.events) {
      if (event.date <= after) {
        continue;
      }
      next = next === undefined ? event.date : Math.min(next, event.date) as EpochSeconds;
    }
  }
  return next;
}

function sortedResourceChangeDates(
  state: ResourceState,
  after: EpochSeconds
): readonly EpochSeconds[] {
  return [...new Set(
    state.events
      .map((event) => event.date)
      .filter((date) => date > after)
  )].sort((left, right) => left - right) as readonly EpochSeconds[];
}

function resourceLoadAt(state: ResourceState, date: EpochSeconds): number {
  return state.events.reduce(
    (load, event) => event.date <= date ? load + event.quantity : load,
    0
  );
}

function finiteResourceMaximum(
  context: SolverContext,
  resourceName: string
): number | undefined {
  return materialResource(context, resourceName)?.maximum;
}

function materialResource(
  context: SolverContext,
  resourceName: string
) {
  return context.input.resources?.find(
    (resource) => resource.name === resourceName
  );
}

function createRoutedSupply(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string,
  quantity: number,
  desiredEnd: EpochSeconds,
  notBefore?: EpochSeconds
): SupplyResult {
  const children = operation.type === "alternate"
    ? [chooseAlternate(operation)]
    : [...operation.subOperations].sort(
        (left, right) => left.priority - right.priority
      );
  const directOutput = outputQuantity(operation, bufferName);
  const routedOutput = directOutput.variable > EPSILON || directOutput.fixed > EPSILON
    ? directOutput
    : children.reduce(
        (total, child) => {
          const output = routedOutputQuantity(child.operation, bufferName);
          return {
            variable: total.variable + output.variable,
            fixed: total.fixed + output.fixed
          };
        },
        { variable: 0, fixed: 0 }
      );
  const fixedOutput = routedOutput.fixed;
  const variableOutput = routedOutput.variable;
  const planCount = variableOutput > EPSILON
    ? 1
    : Math.max(1, Math.ceil(quantity / Math.max(fixedOutput, EPSILON) - EPSILON));
  const planQuantity = variableOutput > EPSILON
    ? quantity / variableOutput
    : 1;
  const schedule = routeSchedule(
    context,
    operation,
    children,
    desiredEnd,
    planQuantity,
    notBefore
  );
  context.activeOperations.add(`${operation.name}\u0000${bufferName}`);
  const routed = scheduleRoutedOperations(
    context,
    children,
    schedule,
    planQuantity
  );
  context.activeOperations.delete(`${operation.name}\u0000${bufferName}`);
  for (let index = 0; index < planCount; index += 1) {
    addOperationPlan(
      context,
      operation,
      routed.parent,
      planQuantity,
      false,
      false
    );
    addScheduledRoutedOperationPlans(
      context,
      routed.children,
      planQuantity
    );
  }
  return {
    date: routedOutputDate(
      context,
      children,
      routed.parent,
      bufferName,
      planQuantity
    ),
    quantity:
      variableOutput > EPSILON
        ? quantity + fixedOutput
        : planCount * fixedOutput,
    operationEnd: routed.parent.end
  };
}

interface RoutedSchedule {
  readonly parent: Schedule;
  readonly children: readonly {
    readonly operation: ManufacturingOperation;
    readonly schedule: Schedule;
  }[];
}

function scheduleRoutedOperations(
  context: SolverContext,
  children: readonly ManufacturingSubOperation[],
  schedule: Schedule,
  quantity: number
): RoutedSchedule {
  let cursor = schedule.start;
  const childSchedules: {
    readonly operation: ManufacturingOperation;
    readonly schedule: Schedule;
  }[] = [];
  for (const child of children) {
    if (!child) {
      continue;
    }
    const duration = operationDuration(child.operation, quantity);
    let childSchedule = scheduleFromStart(
      context,
      child.operation,
      cursor,
      duration
    );
    childSchedule = scheduleWithInputs(
      context,
      child.operation,
      childSchedule,
      quantity
    );
    childSchedules.push({
      operation: child.operation,
      schedule: childSchedule
    });
    cursor = childSchedule.end;
  }
  return {
    parent: childSchedules.length === 0
      ? schedule
      : {
          start: childSchedules[0]?.schedule.start ?? schedule.start,
          end: cursor
        },
    children: childSchedules
  };
}

function addScheduledRoutedOperationPlans(
  context: SolverContext,
  children: readonly {
    readonly operation: ManufacturingOperation;
    readonly schedule: Schedule;
  }[],
  quantity: number
): void {
  for (const child of children) {
    addOperationPlan(
      context,
      child.operation,
      child.schedule,
      quantity,
      false,
      false
    );
    if (
      child.operation.type === "routing" ||
      child.operation.type === "alternate"
    ) {
      const nestedChildren = child.operation.type === "alternate"
        ? [chooseAlternate(child.operation)]
        : [...child.operation.subOperations].sort(
            (left, right) => left.priority - right.priority
          );
      const nested = scheduleRoutedOperations(
        context,
        nestedChildren,
        child.schedule,
        quantity
      );
      addScheduledRoutedOperationPlans(
        context,
        nested.children,
        quantity
      );
    }
  }
}

function addOperationPlan(
  context: SolverContext,
  operation: ManufacturingOperation,
  schedule: Schedule,
  quantity: number,
  confirmed: boolean,
  isConfirmedInput: boolean,
  completed = false
): void {
  const hasFixedFlow = operation.flows.some(
    (flow) => Math.abs(flow.quantityFixed) > EPSILON
  );
  const mergeable = (operation.maximumQuantity ?? 0) <= EPSILON &&
    !hasFixedFlow && operation.flows.some(
      (flow) => flow.quantity > EPSILON
    );
  const existingIndex = mergeable
    ? context.operationPlans.findIndex(
        (plan) =>
          plan.name === operation.name &&
          plan.start === schedule.start &&
          plan.end === schedule.end &&
          Boolean(plan.confirmed) === confirmed
      )
    : -1;
  const existing = existingIndex >= 0
    ? context.operationPlans[existingIndex]
    : undefined;
  const merged = existing !== undefined && existingIndex >= 0;
  if (existing && existingIndex >= 0) {
    context.operationPlans[existingIndex] = {
      ...existing,
      quantity: existing.quantity + quantity,
      ...(completed ? { completed: true } : {})
    };
  } else {
    context.operationPlans.push({
      name: operation.name,
      start: schedule.start,
      end: schedule.end,
      quantity,
      ...(confirmed ? { confirmed: true } : {}),
      ...(completed ? { completed: true } : {})
    });
    applyOperationLoads(context, operation, schedule, quantity);
  }
  if (isConfirmedInput) {
    applyOperationFlows(
      context,
      operation,
      schedule,
      quantity,
      true,
      merged,
      completed
    );
    return;
  }
  if (operation.type !== "routing" && operation.type !== "alternate") {
    applyOperationFlows(context, operation, schedule, quantity, false, merged);
  } else {
    // Parent routing plans carry timing; the child plans carry the flows.
  }
}

function applyOperationLoads(
  context: SolverContext,
  operation: ManufacturingOperation,
  schedule: Schedule,
  quantity: number
): void {
  for (const load of operation.loads ?? []) {
    const state = context.resourceStates.get(load.resource);
    if (!state) {
      continue;
    }
    state.events.push({
      date: schedule.start,
      quantity: scaledLoadQuantity(operation, load.quantity, quantity),
      sequence: context.sequence++
    });
    state.events.push({
      date: schedule.end,
      quantity: -scaledLoadQuantity(operation, load.quantity, quantity),
      sequence: context.sequence++
    });
  }
}

function applyOperationFlows(
  context: SolverContext,
  operation: ManufacturingOperation,
  schedule: Schedule,
  quantity: number,
  confirmed: boolean,
  mergeReceipts: boolean,
  completed = false
): void {
  for (const flow of operation.flows) {
    const date = flowDateFor(
      context,
      operation,
      flow,
      schedule.start,
      schedule.end,
      completed
    );
    if (!isEffective(flow, date)) {
      continue;
    }
    const flowQuantity = flow.quantity * quantity + flow.quantityFixed;
    if (Math.abs(flowQuantity) <= EPSILON) {
      continue;
    }
    const state = context.states.get(bufferKey(flow.buffer));
    if (!state) {
      continue;
    }
    addEvent(
      context,
      state,
      date,
      flowQuantity,
      flowQuantity > 0 ? "receipt" : "demand",
      undefined,
      confirmed,
      mergeReceipts
    );
  }
}

function scheduleOperation(
  context: SolverContext,
  operation: ManufacturingOperation,
  desiredEnd: EpochSeconds,
  quantity: number
): Schedule {
  const duration = operationDuration(operation, quantity);
  const constrained = (context.input.mode ?? "constrained") === "constrained";
  if (!operationUsesWorkingCalendar(context, operation)) {
    const minimumEnd = constrained
      ? (context.input.current + duration) as EpochSeconds
      : desiredEnd;
    const end = Math.max(desiredEnd, minimumEnd) as EpochSeconds;
    return {
      start: (end - duration) as EpochSeconds,
      end
    };
  }
  const minimumEnd = constrained
    ? advanceWorkingTime(context, operation, context.input.current, duration)
    : desiredEnd;
  let end = Math.max(desiredEnd, minimumEnd) as EpochSeconds;
  if (!isWorkingAt(context, operation, end, false)) {
    end = previousWorkingBoundary(context, operation, end);
  }
  return {
    start: subtractWorkingTime(context, operation, end, duration),
    end
  };
}

function scheduleFromStart(
  context: SolverContext,
  operation: ManufacturingOperation,
  requestedStart: EpochSeconds,
  duration: number
): Schedule {
  if (!operationUsesWorkingCalendar(context, operation)) {
    return {
      start: requestedStart,
      end: (requestedStart + duration) as EpochSeconds
    };
  }
  let start = requestedStart;
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    if (isWorkingAt(context, operation, start, true)) {
      return {
        start,
        end: advanceWorkingTime(context, operation, start, duration)
      };
    }
    const next = nextWorkingBoundary(context, operation, start);
    if (next >= INFINITE_FUTURE) {
      return {
        start: INFINITE_FUTURE,
        end: INFINITE_FUTURE
      };
    }
    start = next;
  }
  return {
    start,
    end: advanceWorkingTime(context, operation, start, duration)
  };
}

function scheduleAtOrAfter(
  context: SolverContext,
  operation: ManufacturingOperation,
  schedule: Schedule,
  quantity: number,
  notBefore?: EpochSeconds
): Schedule {
  if (notBefore === undefined || schedule.start >= notBefore) {
    return schedule;
  }
  return scheduleFromStart(
    context,
    operation,
    notBefore,
    operationDuration(operation, quantity)
  );
}

function operationUsesWorkingCalendar(
  context: SolverContext,
  operation: ManufacturingOperation
): boolean {
  return workingCalendars(context, operation).length > 0;
}

function workingCalendars(
  context: SolverContext,
  operation: ManufacturingOperation
): readonly Calendar[] {
  const calendars: Calendar[] = [];
  const location = context.input.locations?.find(
    (candidate) => candidate.name === operation.location
  );
  if (location?.availability) {
    calendars.push(location.availability);
  }
  for (const load of operation.loads ?? []) {
    const resource = materialResource(context, load.resource);
    if (resource?.availability && !calendars.includes(resource.availability)) {
      calendars.push(resource.availability);
    }
  }
  return calendars;
}

function flowCalendars(
  context: SolverContext,
  operation: ManufacturingOperation,
  flow: MaterialFlow
): readonly Calendar[] {
  const offset = flow.offsetSeconds ?? 0;
  const considerResourceCalendars =
    (flow.type === "start" && offset > EPSILON) ||
    (flow.type === "end" && offset < -EPSILON);
  if (considerResourceCalendars) {
    return workingCalendars(context, operation);
  }
  const location = context.input.locations?.find(
    (candidate) => candidate.name === operation.location
  );
  return location?.availability === undefined
    ? []
    : [location.availability];
}

function isWorkingAt(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds,
  forward: boolean,
  calendars = workingCalendars(context, operation)
): boolean {
  return calendars.every(
    (calendar) => calendar.valueAt(date, forward) > EPSILON
  );
}

function advanceWorkingTime(
  context: SolverContext,
  operation: ManufacturingOperation,
  start: EpochSeconds,
  duration: number,
  calendars = workingCalendars(context, operation)
): EpochSeconds {
  if (duration <= EPSILON || calendars.length === 0) {
    return start;
  }
  let cursor = start;
  let remaining = duration;
  for (let attempt = 0; attempt < 100_000 && remaining > EPSILON; attempt += 1) {
    if (!isWorkingAt(context, operation, cursor, true, calendars)) {
      const next = nextWorkingBoundary(
        context,
        operation,
        cursor,
        calendars
      );
      if (next >= INFINITE_FUTURE) {
        return INFINITE_FUTURE;
      }
      cursor = next;
      continue;
    }
    const next = nextWorkingBoundary(
      context,
      operation,
      cursor,
      calendars
    );
    const span = next - cursor;
    if (span <= EPSILON) {
      cursor = (cursor + 1) as EpochSeconds;
      continue;
    }
    if (span + EPSILON >= remaining) {
      return (cursor + remaining) as EpochSeconds;
    }
    remaining -= span;
    cursor = next;
  }
  return cursor;
}

function subtractWorkingTime(
  context: SolverContext,
  operation: ManufacturingOperation,
  end: EpochSeconds,
  duration: number,
  calendars = workingCalendars(context, operation)
): EpochSeconds {
  if (duration <= EPSILON || calendars.length === 0) {
    return (end - duration) as EpochSeconds;
  }
  let cursor = end;
  let remaining = duration;
  for (let attempt = 0; attempt < 100_000 && remaining > EPSILON; attempt += 1) {
    if (!isWorkingAt(context, operation, cursor, false, calendars)) {
      const previous = previousWorkingBoundary(
        context,
        operation,
        cursor,
        calendars
      );
      if (previous <= INFINITE_PAST) {
        return INFINITE_PAST;
      }
      cursor = previous;
      continue;
    }
    const previous = previousWorkingBoundary(
      context,
      operation,
      cursor,
      calendars
    );
    const span = cursor - previous;
    if (span <= EPSILON) {
      cursor = (cursor - 1) as EpochSeconds;
      continue;
    }
    if (span + EPSILON >= remaining) {
      return (cursor - remaining) as EpochSeconds;
    }
    remaining -= span;
    cursor = previous;
  }
  return cursor;
}

function shiftWorkingTime(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds,
  duration: number,
  calendars = workingCalendars(context, operation)
): EpochSeconds {
  if (duration > EPSILON) {
    return calendars.length > 0
      ? advanceWorkingTime(context, operation, date, duration, calendars)
      : (date + duration) as EpochSeconds;
  }
  if (duration < -EPSILON) {
    const amount = -duration;
    return calendars.length > 0
      ? subtractWorkingTime(context, operation, date, amount, calendars)
      : (date - amount) as EpochSeconds;
  }
  return date;
}

function shiftFlowTime(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds,
  duration: number,
  flow?: MaterialFlow
): EpochSeconds {
  if (flow === undefined) {
    return shiftWorkingTime(context, operation, date, duration);
  }
  return shiftWorkingTime(
    context,
    operation,
    date,
    duration,
    flowCalendars(context, operation, flow)
  );
}

function nextWorkingBoundary(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds,
  calendars = workingCalendars(context, operation)
): EpochSeconds {
  let next = INFINITE_FUTURE;
  for (const calendar of calendars) {
    next = Math.min(next, nextCalendarBoundary(calendar, date)) as EpochSeconds;
  }
  return next;
}

function previousWorkingBoundary(
  context: SolverContext,
  operation: ManufacturingOperation,
  date: EpochSeconds,
  calendars = workingCalendars(context, operation)
): EpochSeconds {
  let previous = INFINITE_PAST;
  for (const calendar of calendars) {
    previous = Math.max(
      previous,
      previousCalendarBoundary(calendar, date)
    ) as EpochSeconds;
  }
  return previous;
}

function nextCalendarBoundary(
  calendar: Calendar,
  date: EpochSeconds
): EpochSeconds {
  let next = INFINITE_FUTURE;
  for (const bucket of calendar.buckets) {
    if (bucket.start > date) {
      next = Math.min(next, bucket.start) as EpochSeconds;
    }
    if (bucket.end > date && bucket.end < INFINITE_FUTURE) {
      next = Math.min(next, bucket.end) as EpochSeconds;
    }
    if (bucket.isContinuous()) {
      continue;
    }
    const day = startOfUtcDay(date);
    for (let offset = 0; offset <= 7; offset += 1) {
      const candidateDay = (day + offset * 86_400) as EpochSeconds;
      if ((bucket.days & (1 << utcDayOfWeek(candidateDay))) === 0) {
        continue;
      }
      for (const time of [0, bucket.startTime, bucket.endTime, 86_400]) {
        const candidate = (candidateDay + time) as EpochSeconds;
        if (
          candidate > date &&
          candidate >= bucket.start &&
          candidate <= bucket.end &&
          candidate < INFINITE_FUTURE
        ) {
          next = Math.min(next, candidate) as EpochSeconds;
        }
      }
    }
  }
  return next;
}

function previousCalendarBoundary(
  calendar: Calendar,
  date: EpochSeconds
): EpochSeconds {
  let previous = INFINITE_PAST;
  for (const bucket of calendar.buckets) {
    if (bucket.start < date && bucket.start > INFINITE_PAST) {
      previous = Math.max(previous, bucket.start) as EpochSeconds;
    }
    if (bucket.end < date && bucket.end > INFINITE_PAST) {
      previous = Math.max(previous, bucket.end) as EpochSeconds;
    }
    if (bucket.isContinuous()) {
      continue;
    }
    const day = startOfUtcDay(date);
    for (let offset = 0; offset <= 7; offset += 1) {
      const candidateDay = (day - offset * 86_400) as EpochSeconds;
      if ((bucket.days & (1 << utcDayOfWeek(candidateDay))) === 0) {
        continue;
      }
      for (const time of [0, bucket.startTime, bucket.endTime, 86_400]) {
        const candidate = (candidateDay + time) as EpochSeconds;
        if (
          candidate < date &&
          candidate >= bucket.start &&
          candidate <= bucket.end &&
          candidate > INFINITE_PAST
        ) {
          previous = Math.max(previous, candidate) as EpochSeconds;
        }
      }
    }
  }
  return previous;
}

function routeSchedule(
  context: SolverContext,
  operation: ManufacturingOperation,
  children: readonly ManufacturingSubOperation[],
  desiredOutputDate: EpochSeconds,
  quantity: number,
  notBefore?: EpochSeconds
): Schedule {
  const duration = children.reduce(
    (total, child) => total + operationDuration(child.operation, quantity),
    0
  );
  const constrained = (context.input.mode ?? "constrained") === "constrained";
  const lastOutput = [...children]
    .reverse()
    .map((child) => findOutputFlow(child.operation))
    .find((flow) => flow !== undefined);
  const desiredEnd = lastOutput
    ? operationEndForFlowDate(
        context,
        [...children].reverse().find(
          (child) => findOutputFlow(child.operation) === lastOutput
        )?.operation ?? operation,
        lastOutput,
        desiredOutputDate,
        operationDuration(
          [...children].reverse().find(
            (child) => findOutputFlow(child.operation) === lastOutput
          )?.operation ?? operation,
          quantity
        )
      )
    : desiredOutputDate;
  const minimumEnd = constrained
    ? (context.input.current + duration) as EpochSeconds
    : desiredEnd;
  const end = Math.max(desiredEnd, minimumEnd) as EpochSeconds;
  const start = (end - duration) as EpochSeconds;
  if (notBefore !== undefined && start < notBefore) {
    return {
      start: notBefore,
      end: (notBefore + duration) as EpochSeconds
    };
  }
  return {
    start,
    end
  };
}

function routedOutputDate(
  context: SolverContext,
  children: readonly ManufacturingSubOperation[],
  schedule: Schedule,
  bufferName: string,
  quantity: number
): EpochSeconds {
  let cursor = schedule.end;
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (!child) {
      continue;
    }
    const childDuration = operationDuration(child.operation, quantity);
    const childSchedule = {
      start: (cursor - childDuration) as EpochSeconds,
      end: cursor
    } satisfies Schedule;
    const output = findOutputFlow(child.operation, bufferName);
    if (output) {
      return flowDateFor(
        context,
        child.operation,
        output,
        childSchedule.start,
        childSchedule.end
      );
    }
    cursor = childSchedule.start;
  }
  return schedule.end;
}

function routedOutputQuantity(
  operation: ManufacturingOperation,
  bufferName: string
): { readonly variable: number; readonly fixed: number } {
  const direct = outputQuantity(operation, bufferName);
  if (
    direct.variable > EPSILON ||
    direct.fixed > EPSILON ||
    operation.subOperations.length === 0
  ) {
    return direct;
  }
  return operation.subOperations.reduce(
    (total, child) => {
      const output = routedOutputQuantity(child.operation, bufferName);
      return {
        variable: total.variable + output.variable,
        fixed: total.fixed + output.fixed
      };
    },
    { variable: 0, fixed: 0 }
  );
}

function findOutputFlow(
  operation: ManufacturingOperation,
  bufferName?: string
): MaterialFlow | undefined {
  const direct = operation.flows.find(
    (flow) =>
      (bufferName === undefined || flow.buffer === bufferName) &&
      positiveFlowQuantity(flow) > EPSILON
  );
  if (direct) {
    return direct;
  }
  for (let index = operation.subOperations.length - 1; index >= 0; index -= 1) {
    const child = operation.subOperations[index];
    const nested = child
      ? findOutputFlow(child.operation, bufferName)
      : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function operationDuration(
  operation: ManufacturingOperation,
  quantity: number
): number {
  if (operation.type === "routing" || operation.type === "alternate") {
    const children = operation.type === "alternate"
      ? [chooseAlternate(operation)]
      : operation.subOperations;
    return children.reduce(
      (total, child) => total + operationDuration(child.operation, quantity),
      0
    );
  }
  return operation.durationSeconds +
    operation.durationPerSeconds * quantity;
}

function operationEnd(
  context: SolverContext,
  operation: ManufacturingOperation,
  desiredOutputDate: EpochSeconds
): EpochSeconds {
  return scheduleForOutputDate(
    context,
    operation,
    undefined,
    desiredOutputDate,
    1
  ).end;
}

function outputQuantity(
  operation: ManufacturingOperation,
  bufferName: string,
  effectiveDate?: EpochSeconds
): { readonly variable: number; readonly fixed: number } {
  return operation.flows.reduce(
    (result, flow) => {
      if (
        flow.buffer !== bufferName ||
        (flow.quantity <= 0 && flow.quantityFixed <= 0)
      ) {
        return result;
      }
      if (
        effectiveDate !== undefined &&
        !isEffective(flow, effectiveDate)
      ) {
        return result;
      }
      return {
        variable: result.variable + flow.quantity,
        fixed: result.fixed + Math.max(flow.quantityFixed, 0)
      };
    },
    { variable: 0, fixed: 0 }
  );
}

function chooseAlternate(
  operation: ManufacturingOperation
): ManufacturingSubOperation {
  const sorted = [...operation.subOperations].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.operation.name.localeCompare(right.operation.name)
  );
  const selected = sorted[0];
  if (!selected) {
    throw new Error(`Alternate operation ${operation.name} has no suboperations`);
  }
  return selected;
}

function ensureFlowSupply(
  context: SolverContext,
  operation: ManufacturingOperation,
  schedule: Schedule,
  quantity: number
): readonly FlowSupplyResult[] {
  const results: FlowSupplyResult[] = [];
  for (const flow of operation.flows) {
    if (flow.quantity >= 0 && flow.quantityFixed >= 0) {
      continue;
    }
    const date = flowDateFor(
      context,
      operation,
      flow,
      schedule.start,
      schedule.end
    );
    if (!isEffective(flow, date)) {
      continue;
    }
    const state = context.states.get(bufferKey(flow.buffer));
    if (!state) {
      continue;
    }
    const required = Math.abs(flow.quantity * quantity + flow.quantityFixed);
    const shortage = Math.max(0, required - balanceAt(state, date));
    if (shortage > EPSILON) {
      const supply = createSupply(context, flow.buffer, shortage, date, false);
      const unmet = Math.max(0, shortage - supply.quantity);
      if (unmet > EPSILON || supply.date > date) {
        results.push({
          flow,
          supplyDate: supply.date,
          ...(unmet > EPSILON ? { shortage: unmet } : {})
        });
      }
    }
  }
  return results;
}

function scheduleWithInputs(
  context: SolverContext,
  operation: ManufacturingOperation,
  initial: Schedule,
  quantity: number
): Schedule {
  const baseSnapshot = takePlanningSnapshot(context);
  let schedule = initial;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const snapshot = takePlanningSnapshot(context);
    const supplies = ensureFlowSupply(context, operation, schedule, quantity);
    if (supplies.length === 0) {
      return { ...schedule, inputsSatisfied: true };
    }
    if (supplies.some((supply) => (supply.shortage ?? 0) > EPSILON)) {
      restorePlanningSnapshot(context, snapshot);
      return { ...schedule, inputsSatisfied: false };
    }
    let requiredSchedule = schedule;
    for (const supply of supplies) {
      const candidate = scheduleForSuppliedFlow(
        context,
        operation,
        supply.flow,
        supply.supplyDate,
        quantity
      );
      if (
        candidate.start > requiredSchedule.start ||
        candidate.end > requiredSchedule.end
      ) {
        requiredSchedule = {
          start: Math.max(
            requiredSchedule.start,
            candidate.start
          ) as EpochSeconds,
          end: Math.max(
            requiredSchedule.end,
            candidate.end
          ) as EpochSeconds
        };
      }
    }
    if (
      requiredSchedule.start <= schedule.start &&
      requiredSchedule.end <= schedule.end
    ) {
      return schedule;
    }
    restorePlanningSnapshot(context, snapshot);
    schedule = scheduleOperation(
      context,
      operation,
      requiredSchedule.end,
      quantity
    );
  }
  restorePlanningSnapshot(context, baseSnapshot);
  return { ...schedule, inputsSatisfied: false };
}

function takePlanningSnapshot(context: SolverContext): PlanningSnapshot {
  return {
    stateEvents: [...context.states.values()].map((state) => ({
      state,
      length: state.events.length,
      quantities: state.events.map((event) => [event, event.quantity])
    })),
    operationPlans: [...context.operationPlans],
    demandPlansLength: context.demandPlans.length,
    purchases: [...context.purchases],
    plannedPurchases: [...context.plannedPurchases].map(
      ([key, event]) => [key, event, event.quantity]
    ),
    resourceEvents: [...context.resourceStates.values()].map((state) => ({
      state,
      length: state.events.length
    })),
    sequence: context.sequence
  };
}

function restorePlanningSnapshot(
  context: SolverContext,
  snapshot: PlanningSnapshot
): void {
  for (const entry of snapshot.stateEvents) {
    entry.state.events.splice(entry.length);
    for (const [event, quantity] of entry.quantities) {
      event.quantity = quantity;
    }
  }
  context.operationPlans.splice(
    0,
    context.operationPlans.length,
    ...snapshot.operationPlans
  );
  context.demandPlans.splice(snapshot.demandPlansLength);
  context.purchases.splice(
    0,
    context.purchases.length,
    ...snapshot.purchases
  );
  context.plannedPurchases.clear();
  for (const [key, event, quantity] of snapshot.plannedPurchases) {
    event.quantity = quantity;
    context.plannedPurchases.set(key, event);
  }
  for (const entry of snapshot.resourceEvents) {
    entry.state.events.splice(entry.length);
  }
  context.sequence = snapshot.sequence;
}

function scheduleForSuppliedFlow(
  context: SolverContext,
  operation: ManufacturingOperation,
  flow: MaterialFlow,
  supplyDate: EpochSeconds,
  quantity: number
): Schedule {
  const offset = flow.offsetSeconds ?? 0;
  if (flow.type === "end") {
    return scheduleOperation(
      context,
      operation,
      shiftFlowTime(context, operation, supplyDate, -offset, flow),
      quantity
    );
  }

  const requestedStart = shiftFlowTime(
    context,
    operation,
    supplyDate,
    -offset,
    flow
  );
  if (!operationUsesWorkingCalendar(context, operation)) {
    const start = Math.max(
      requestedStart,
      context.input.mode === "constrained"
        ? context.input.current
        : requestedStart
    ) as EpochSeconds;
    return {
      start,
      end: (start + operationDuration(operation, quantity)) as EpochSeconds
    };
  }

  let start = requestedStart;
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    if (isWorkingAt(context, operation, start, true)) {
      break;
    }
    const next = nextWorkingBoundary(context, operation, start);
    if (next >= INFINITE_FUTURE) {
      return {
        start: INFINITE_FUTURE,
        end: INFINITE_FUTURE
      };
    }
    start = next;
  }
  return {
    start,
    end: advanceWorkingTime(
      context,
      operation,
      start,
      operationDuration(operation, quantity)
    )
  };
}

function purchaseDeliveryDate(
  context: SolverContext,
  demand: MaterialDemand,
  source: ProcurementSource
): EpochSeconds {
  return purchaseDeliveryDateForDate(context, demand.due, source);
}

function purchaseDeliveryDateForDate(
  context: SolverContext,
  target: EpochSeconds,
  source: ProcurementSource
): EpochSeconds {
  if ((context.input.mode ?? "constrained") === "unconstrained") {
    return (target - source.extraSafetyLeadTimeSeconds) as EpochSeconds;
  }
  return Math.max(
    target - source.extraSafetyLeadTimeSeconds,
    context.input.current +
      source.leadTimeSeconds +
      source.hardSafetyLeadTimeSeconds
  ) as EpochSeconds;
}

function purchaseQuantity(
  context: SolverContext,
  state: BufferState,
  demand: MaterialDemand,
  shortage: number,
  availableNow: number,
  required: number
): number {
  const maximum = state.buffer.maximum;
  const mode = context.input.mode ?? "constrained";
  if (maximum === undefined) {
    return shortage;
  }
  if (availableNow > EPSILON && mode === "constrained") {
    return Math.max(shortage, maximum - (availableNow - required));
  }
  return Math.max(shortage, maximum - availableNow + required);
}

function addPurchaseSupply(
  context: SolverContext,
  state: BufferState,
  source: ProcurementSource,
  date: EpochSeconds,
  quantity: number
): void {
  if (quantity <= EPSILON) {
    return;
  }
  const key = [
    state.buffer.name,
    source.supplier,
    date
  ].join("\u0000");
  const existing = context.plannedPurchases.get(key);
  if (existing) {
    existing.quantity += quantity;
    const index = context.purchases.findIndex(
      (purchase) =>
        purchase.name === `Purchase ${state.buffer.item} @ ${state.buffer.location} from ${source.supplier}` &&
        purchase.end === date &&
        !purchase.confirmed
    );
    if (index >= 0) {
      const current = context.purchases[index];
      if (current) {
        context.purchases[index] = {
          ...current,
          quantity: current.quantity + quantity
        };
      }
    }
    return;
  }
  const event: MutableEvent = {
    date,
    quantity,
    sequence: 0,
    kind: "receipt"
  };
  context.plannedPurchases.set(key, event);
  state.events.push(event);
  context.purchases.push({
    name: `Purchase ${state.buffer.item} @ ${state.buffer.location} from ${source.supplier}`,
    item: state.buffer.item,
    location: state.buffer.location,
    supplier: source.supplier,
    start: (
      date -
      source.hardSafetyLeadTimeSeconds -
      source.leadTimeSeconds
    ) as EpochSeconds,
    end: (date - source.hardSafetyLeadTimeSeconds) as EpochSeconds,
    quantity
  });
}

function addEvent(
  context: SolverContext,
  state: BufferState,
  date: EpochSeconds,
  quantity: number,
  kind: MutableEvent["kind"],
  originalDue?: EpochSeconds,
  confirmed = false,
  merge = true,
  priority?: number
): void {
  if (merge && kind === "receipt" && originalDue === undefined) {
    const existing = state.events.find(
      (event) =>
        event.kind === "receipt" &&
        event.date === date &&
        Boolean(event.confirmed) === confirmed
    );
    if (existing) {
      existing.quantity += quantity;
      return;
    }
  }
  state.events.push({
    date,
    quantity,
    sequence: context.sequence++,
    kind,
    ...(originalDue !== undefined ? { originalDue } : {}),
    ...(confirmed ? { confirmed: true } : {}),
    ...(priority === undefined ? {} : { priority })
  });
}

function addDemandEvent(
  context: SolverContext,
  state: BufferState,
  date: EpochSeconds,
  quantity: number,
  originalDue: EpochSeconds,
  priority?: number
): void {
  addEvent(
    context,
    state,
    date,
    quantity,
    "demand",
    date > originalDue ? originalDue : undefined,
    false,
    true,
    priority
  );
}

function addDemandPlan(
  context: SolverContext,
  demand: MaterialDemand,
  date: EpochSeconds,
  quantity: number
): void {
  if (quantity <= EPSILON) {
    return;
  }
  context.demandPlans.push({
    name: demand.name,
    date,
    quantity,
    ...(date > demand.due ? { originalDue: demand.due } : {})
  });
}

function materialEvents(
  state: BufferState,
  current: EpochSeconds
): readonly MaterialPlanEvent[] {
  const ordered = [...state.events].sort(compareEvents);
  let onhand = 0;
  return ordered.map((event, index) => {
    onhand += event.quantity;
    return {
      buffer: state.buffer.name,
      item: state.buffer.item,
      date: event.date,
      quantity: event.quantity,
      onhand,
      periodOfCover: periodOfCover(ordered, index, onhand, current)
    };
  });
}

function resourceEvents(state: ResourceState): readonly ResourcePlanEvent[] {
  const ordered = [...state.events].sort(
    (left, right) =>
      left.date - right.date ||
      Number(left.quantity < 0) - Number(right.quantity < 0) ||
      left.sequence - right.sequence
  );
  let load = 0;
  return ordered.map((event) => {
    load += event.quantity;
    return {
      resource: state.name,
      date: event.date,
      quantity: event.quantity,
      load
    };
  });
}

function periodOfCover(
  events: readonly MutableEvent[],
  index: number,
  onhand: number,
  current: EpochSeconds
): number {
  const event = events[index];
  if (!event) {
    return 999 * 86_400;
  }
  if (
    event.date >= current &&
    events.slice(index + 1).some(
      (candidate) =>
        candidate.kind === "demand" &&
        candidate.originalDue !== undefined &&
        candidate.originalDue < current
    )
  ) {
    return 0;
  }
  let projected = onhand;
  for (let cursor = index + 1; cursor < events.length; cursor += 1) {
    const candidate = events[cursor];
    if (!candidate || candidate.kind !== "demand") {
      continue;
    }
    projected += candidate.quantity;
    if (projected <= EPSILON) {
      return candidate.date - event.date;
    }
  }
  return 999 * 86_400;
}

function findState(
  context: SolverContext,
  item: string,
  location: string
): BufferState | undefined {
  return [...context.states.values()].find(
    (state) =>
      state.buffer.item === item &&
      (state.buffer.location === location || state.buffer.location === "")
  );
}

function bufferKeyForDemand(
  context: SolverContext,
  demand: MaterialDemand
): string {
  return [...context.states.values()].find(
    (state) =>
      state.buffer.item === demand.item &&
      (state.buffer.location === demand.location || state.buffer.location === "")
  )?.buffer.name ?? `${demand.item} @ ${demand.location}`;
}

function balanceAt(state: BufferState, date: EpochSeconds): number {
  return state.events.reduce(
    (total, event) => total + (event.date <= date ? event.quantity : 0),
    0
  );
}

function matchingSource(
  sources: readonly ProcurementSource[],
  demand: MaterialDemand
): ProcurementSource | undefined {
  return [...sources]
    .filter(
      (source) =>
        source.item === demand.item &&
        (source.location === undefined || source.location === demand.location)
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        Number(Boolean(left.inherited)) - Number(Boolean(right.inherited)) ||
        left.leadTimeSeconds - right.leadTimeSeconds ||
        left.supplier.localeCompare(right.supplier)
    )[0];
}

function matchingSourceForBuffer(
  sources: readonly ProcurementSource[],
  buffer: MaterialBuffer
): ProcurementSource | undefined {
  return [...sources]
    .filter(
      (source) =>
        source.item === buffer.item &&
        (source.location === undefined || source.location === buffer.location)
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        Number(Boolean(left.inherited)) - Number(Boolean(right.inherited)) ||
        left.leadTimeSeconds - right.leadTimeSeconds ||
        left.supplier.localeCompare(right.supplier)
    )[0];
}

function replenishmentDeliveryDate(
  context: SolverContext,
  requestedDate: EpochSeconds,
  source: ProcurementSource
): EpochSeconds {
  if ((context.input.mode ?? "constrained") === "unconstrained") {
    return requestedDate;
  }
  return Math.max(
    requestedDate,
    context.input.current +
      source.leadTimeSeconds +
      source.hardSafetyLeadTimeSeconds
  ) as EpochSeconds;
}

function orderQuantity(
  requested: number,
  minimumQuantity: number,
  multipleQuantity: number
): number {
  const quantity = Math.max(requested, minimumQuantity);
  if (multipleQuantity <= EPSILON) {
    return quantity;
  }
  return Math.ceil(quantity / multipleQuantity) * multipleQuantity;
}

function positiveFlowQuantity(flow: MaterialFlow): number {
  return flow.quantity > 0
    ? flow.quantity + Math.max(flow.quantityFixed, 0)
    : Math.max(flow.quantityFixed, 0);
}

function confirmedSupplyDate(
  state: BufferState,
  desiredEnd: EpochSeconds,
  quantity: number
): EpochSeconds | undefined {
  let remaining = quantity;
  const events = [...state.events]
    .filter(
      (event) =>
        event.kind === "receipt" &&
        event.confirmed === true &&
        event.date > desiredEnd &&
        event.quantity > EPSILON
    )
    .sort((left, right) => left.date - right.date);
  for (const event of events) {
    remaining -= event.quantity;
    if (remaining <= EPSILON) {
      return event.date;
    }
  }
  return undefined;
}

function fencedConfirmedSupplyDate(
  context: SolverContext,
  state: BufferState,
  requestedDate: EpochSeconds
): EpochSeconds | undefined {
  return fencedConfirmedReceipt(context, state, requestedDate)?.date;
}

function fencedConfirmedReceipt(
  context: SolverContext,
  state: BufferState,
  requestedDate: EpochSeconds,
  includeRequestedDate = false
): MutableEvent | undefined {
  const fence = context.input.autofenceSeconds ?? 0;
  if (fence <= 0) {
    return undefined;
  }
  const start = Math.max(requestedDate, context.input.current);
  const end = start + fence;
  return [...state.events]
    .filter(
      (event) =>
        event.kind === "receipt" &&
        event.confirmed === true &&
        (includeRequestedDate
          ? event.date >= requestedDate
          : event.date > requestedDate) &&
        event.date <= end &&
        event.quantity > EPSILON
    )
    .sort((left, right) => left.date - right.date)[0];
}

function manufacturingFencedQuantity(
  context: SolverContext,
  state: BufferState,
  requestedDate: EpochSeconds,
  confirmedDate: EpochSeconds
): number {
  const minimum = state.buffer.minimum ?? 0;
  const futureDemand = context.input.demands
    .filter(
      (demand) =>
        bufferKeyForDemand(context, demand) === state.buffer.name &&
        demand.due >= requestedDate &&
        demand.due < confirmedDate
    )
    .reduce(
      (total, demand) =>
        total + Math.max(demand.quantity, demand.minimumShipment),
      0
    );
  return Math.max(
    0,
    minimum + futureDemand - balanceAt(state, requestedDate)
  );
}

function flowDateFor(
  context: SolverContext,
  operation: ManufacturingOperation,
  flow: MaterialFlow,
  start: EpochSeconds,
  end: EpochSeconds,
  completed = false
): EpochSeconds {
  if (completed) {
    return flow.type === "start" ? start : end;
  }
  const anchor = flow.type === "start" ? start : end;
  return shiftFlowTime(
    context,
    operation,
    anchor,
    flow.offsetSeconds ?? 0,
    flow
  );
}

function outputDate(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string | undefined,
  schedule: Schedule
): EpochSeconds {
  const flow = operation.flows.find(
    (candidate) =>
      (bufferName === undefined || candidate.buffer === bufferName) &&
      positiveFlowQuantity(candidate) > EPSILON
  );
  return flow
    ? flowDateFor(context, operation, flow, schedule.start, schedule.end)
    : schedule.end;
}

function scheduleForOutputDate(
  context: SolverContext,
  operation: ManufacturingOperation,
  bufferName: string | undefined,
  desiredOutputDate: EpochSeconds,
  quantity: number
): Schedule {
  const duration = operationDuration(operation, quantity);
  const flow = operation.flows.find(
    (candidate) =>
      (bufferName === undefined || candidate.buffer === bufferName) &&
      positiveFlowQuantity(candidate) > EPSILON
  );
  const desiredEnd = flow
    ? operationEndForFlowDate(
        context,
        operation,
        flow,
        desiredOutputDate,
        duration
      )
    : desiredOutputDate;
  return scheduleOperation(context, operation, desiredEnd, quantity);
}

function operationEndForFlowDate(
  context: SolverContext,
  operation: ManufacturingOperation,
  flow: MaterialFlow,
  desiredFlowDate: EpochSeconds,
  duration: number
): EpochSeconds {
  const offset = flow.offsetSeconds ?? 0;
  if (flow.type === "start") {
    const start = shiftFlowTime(
      context,
      operation,
      desiredFlowDate,
      -offset,
      flow
    );
    return operationUsesWorkingCalendar(context, operation)
      ? advanceWorkingTime(context, operation, start, duration)
      : (start + duration) as EpochSeconds;
  }
  return shiftFlowTime(
    context,
    operation,
    desiredFlowDate,
    -offset,
    flow
  );
}

function isEffective(flow: MaterialFlow, date: EpochSeconds): boolean {
  return (
    (flow.effectiveStart === undefined || date >= flow.effectiveStart) &&
    (flow.effectiveEnd === undefined || date < flow.effectiveEnd)
  );
}

function subtractDuration(
  date: EpochSeconds,
  duration: number
): EpochSeconds {
  return (date - duration) as EpochSeconds;
}

function sortedDemands(
  demands: readonly MaterialDemand[]
): readonly MaterialDemand[] {
  return [...demands].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.due - right.due ||
      left.name.localeCompare(right.name)
  );
}

function demandsForPlan(
  input: MaterialPlanInput
): readonly MaterialDemand[] {
  if (!usesDefaultEarlyResourceSweep(input)) {
    return sortedDemands(input.demands);
  }
  return [...input.demands].sort(
    (left, right) =>
      left.due - right.due ||
      left.priority - right.priority ||
      left.name.localeCompare(right.name)
  );
}

function usesDefaultEarlyResourceSweep(input: MaterialPlanInput): boolean {
  if (
    input.mode !== "unconstrained" ||
    (input.constraints ?? 15) === 0 ||
    input.demands.length === 0 ||
    input.demands.some(
      (demand) =>
        !demand.operation ||
        demand.maxLatenessSeconds !== undefined
    )
  ) {
    return false;
  }
  return (input.operations ?? []).some((operation) =>
    (operation.loads ?? []).some((load) => {
      const resource = input.resources?.find(
        (candidate) => candidate.name === load.resource
      );
      return (
        resource?.maximum !== undefined &&
        resource.maxEarlySeconds === undefined
      );
    })
  );
}

function compareEvents(left: MutableEvent, right: MutableEvent): number {
  return (
    left.date - right.date ||
    right.quantity - left.quantity ||
    (left.kind === "receipt" ? 0 : 1) -
      (right.kind === "receipt" ? 0 : 1) ||
    Number(Boolean(left.confirmed)) - Number(Boolean(right.confirmed)) ||
    left.sequence - right.sequence
  );
}

function compareMaterialEvents(
  left: MaterialPlanEvent,
  right: MaterialPlanEvent
): number {
  return (
    left.buffer.localeCompare(right.buffer) ||
    left.date - right.date ||
    Number(left.quantity <= 0) - Number(right.quantity <= 0)
  );
}

function compareResourceEvents(
  left: ResourcePlanEvent,
  right: ResourcePlanEvent
): number {
  return (
    left.resource.localeCompare(right.resource) ||
    left.date - right.date ||
    Number(left.quantity < 0) - Number(right.quantity < 0)
  );
}

function bufferKey(name: string): string {
  return name;
}

function inferredBufferIdentity(
  name: string
): { readonly item: string; readonly location: string } {
  const separator = name.lastIndexOf(" @ ");
  return separator < 0
    ? { item: name, location: "" }
    : {
        item: name.slice(0, separator),
        location: name.slice(separator + 3)
      };
}
