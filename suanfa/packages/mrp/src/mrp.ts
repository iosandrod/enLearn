import { INFINITE_PAST, type EpochSeconds } from "@suanfa/kernel";
import type { Calendar } from "@suanfa/model";
import { solveManufacturingMaterialPlan as solveApsMaterialPlan } from "./aps.js";

export interface MaterialBuffer {
  readonly name: string;
  readonly item: string;
  readonly location: string;
  readonly onhand: number;
  readonly infinite?: boolean;
  readonly minimum?: number;
  readonly minimumCalendar?: Calendar;
  readonly maximum?: number;
}

export type MaterialFlowType = "start" | "end";

export interface MaterialFlow {
  readonly buffer: string;
  readonly location?: string;
  readonly quantity: number;
  readonly quantityFixed: number;
  readonly type: MaterialFlowType;
  readonly implicitType?: boolean;
  readonly alternateGroup?: string;
  readonly priority?: number;
  readonly offsetSeconds?: number;
  readonly effectiveStart?: EpochSeconds;
  readonly effectiveEnd?: EpochSeconds;
}

export interface MaterialLoad {
  readonly resource: string;
  readonly quantity: number;
  readonly skill?: string;
  readonly search?: "PRIORITY" | "MINCOST" | "MINPENALTY" | "MINCOSTPENALTY";
}

export interface MaterialResourceSkill {
  readonly skill: string;
  readonly priority: number;
}

export interface MaterialLocation {
  readonly name: string;
  readonly availability?: Calendar;
}

export interface MaterialResource {
  readonly name: string;
  readonly bucketized?: boolean;
  readonly members?: readonly string[];
  readonly skills?: readonly MaterialResourceSkill[];
  readonly maximum?: number;
  readonly maximumCalendar?: Calendar;
  readonly maxEarlySeconds?: number;
  readonly availability?: Calendar;
}

export type ManufacturingOperationType =
  | "fixed_time"
  | "time_per"
  | "routing"
  | "alternate"
  | "split"
  | "delivery";

export interface ManufacturingOperation {
  readonly name: string;
  readonly type: ManufacturingOperationType;
  readonly durationSeconds: number;
  readonly durationPerSeconds: number;
  readonly priority: number;
  readonly location?: string;
  readonly availability?: Calendar;
  readonly item?: string;
  readonly minimumQuantity?: number;
  readonly minimumQuantityCalendar?: Calendar;
  readonly maximumQuantity?: number;
  readonly multipleQuantity?: number;
  readonly pretimeSeconds?: number;
  readonly posttimeSeconds?: number;
  readonly hardPosttime?: boolean;
  readonly flows: readonly MaterialFlow[];
  readonly loads?: readonly MaterialLoad[];
  readonly subOperations: readonly ManufacturingSubOperation[];
  readonly fenceSeconds?: number;
}

export interface ManufacturingSubOperation {
  readonly operation: ManufacturingOperation;
  readonly priority: number;
  readonly effectiveStart?: EpochSeconds;
  readonly effectiveEnd?: EpochSeconds;
}

export interface ProcurementSource {
  readonly item: string;
  readonly supplier: string;
  readonly kind?: "purchase" | "transfer";
  readonly originLocation?: string;
  readonly leadTimeSeconds: number;
  readonly extraSafetyLeadTimeSeconds: number;
  readonly hardSafetyLeadTimeSeconds: number;
  readonly fenceSeconds?: number;
  readonly minimumQuantity: number;
  readonly multipleQuantity: number;
  readonly priority: number;
  readonly inherited?: boolean;
  readonly location?: string;
}

export interface MaterialDemand {
  readonly name: string;
  readonly item: string;
  readonly location: string;
  readonly due: EpochSeconds;
  readonly quantity: number;
  readonly minimumShipment: number;
  readonly priority: number;
  readonly operation?: string;
  readonly fenceSeconds?: number;
  readonly maxLatenessSeconds?: number;
}

export interface ConfirmedReceipt {
  readonly item: string;
  readonly location: string;
  readonly end: EpochSeconds;
  readonly quantity: number;
}

export interface OperationPlan {
  readonly name: string;
  readonly start: EpochSeconds;
  readonly end: EpochSeconds;
  readonly quantity: number;
  readonly confirmed?: boolean;
  readonly completed?: boolean;
  readonly consumeMaterial?: boolean;
  readonly produceMaterial?: boolean;
  readonly consumeCapacity?: boolean;
}

export interface DemandPlan {
  readonly name: string;
  readonly date: EpochSeconds;
  readonly quantity: number;
  readonly originalDue?: EpochSeconds;
}

export interface MaterialPlanInput {
  readonly current: EpochSeconds;
  readonly mode?: MaterialPlanningMode;
  readonly buffers: readonly MaterialBuffer[];
  readonly sources: readonly ProcurementSource[];
  readonly demands: readonly MaterialDemand[];
  readonly confirmedReceipts: readonly ConfirmedReceipt[];
  readonly confirmedPurchases?: readonly PurchasePlan[];
  readonly locations?: readonly MaterialLocation[];
  readonly resources?: readonly MaterialResource[];
  readonly operations?: readonly ManufacturingOperation[];
  readonly operationPlans?: readonly OperationPlanInput[];
  readonly constraints?: number;
  readonly autofenceSeconds?: number;
}

export interface OperationPlanInput extends OperationPlan {
  readonly operation: string;
  readonly flowQuantities?: readonly OperationFlowQuantity[];
  readonly resourceLoads?: readonly OperationResourceLoad[];
}

export interface OperationFlowQuantity {
  readonly buffer: string;
  readonly quantity: number;
  readonly date?: EpochSeconds;
}

export interface OperationResourceLoad {
  readonly resource: string;
  readonly quantity: number;
}

export interface MaterialPlanEvent {
  readonly buffer: string;
  readonly item?: string;
  readonly date: EpochSeconds;
  readonly quantity: number;
  readonly onhand: number;
  readonly periodOfCover: number;
}

export interface ResourcePlanEvent {
  readonly resource: string;
  readonly date: EpochSeconds;
  readonly quantity: number;
  readonly load: number;
}

export type MaterialPlanningMode = "constrained" | "unconstrained";

export interface PurchasePlan {
  readonly name: string;
  readonly item: string;
  readonly location: string;
  readonly supplier: string;
  readonly start: EpochSeconds;
  readonly end: EpochSeconds;
  readonly quantity: number;
  readonly confirmed?: boolean;
}

export interface MaterialPlan {
  readonly events: readonly MaterialPlanEvent[];
  readonly purchases: readonly PurchasePlan[];
  readonly operationPlans?: readonly OperationPlan[];
  readonly demandPlans?: readonly DemandPlan[];
  readonly resourceEvents?: readonly ResourcePlanEvent[];
}

interface MutableEvent {
  readonly date: EpochSeconds;
  quantity: number;
  readonly sequence: number;
  readonly kind: "receipt" | "demand";
  readonly originalDue?: EpochSeconds;
}

interface BufferState {
  readonly buffer: MaterialBuffer;
  readonly events: MutableEvent[];
}

export function solveMaterialPlan(input: MaterialPlanInput): MaterialPlan {
  if (input.operations && input.operations.length > 0) {
    return solveApsMaterialPlan(input);
  }

  const states = new Map<string, BufferState>();
  const plannedSupplies = new Map<string, {
    readonly event: MutableEvent;
    readonly purchaseIndex: number;
  }>();
  const mode = input.mode ?? "constrained";
  let sequence = 1;
  for (const buffer of input.buffers) {
    const state: BufferState = { buffer, events: [] };
    states.set(bufferKey(buffer.item, buffer.location), state);
    if (buffer.onhand !== 0) {
      state.events.push({
        date: INFINITE_PAST,
        quantity: buffer.onhand,
        sequence: sequence++,
        kind: "receipt"
      });
    }
  }

  for (const receipt of input.confirmedReceipts) {
    const state = states.get(bufferKey(receipt.item, receipt.location));
    if (state) {
      state.events.push({
        date: receipt.end,
        quantity: receipt.quantity,
        sequence: sequence++,
        kind: "receipt"
      });
    }
  }

  const purchases: PurchasePlan[] = [...(input.confirmedPurchases ?? [])];
  const demandPlans: DemandPlan[] = [];
  for (const demand of sortedDemands(input.demands)) {
    const state = states.get(bufferKey(demand.item, demand.location));
    if (!state) {
      continue;
    }
    const targetDate = mode === "constrained" && demand.due < input.current
      ? input.current
      : demand.due;
    let requiredQuantity = Math.max(demand.quantity, demand.minimumShipment);
    let deliveryDate = targetDate;
    let demandDate = targetDate;
    let available = onhandAt(state.events, targetDate);
    if (available + 1e-9 >= requiredQuantity) {
      addDemandEvent(state, demandPlans, demand, demandDate, requiredQuantity, () => sequence++);
      continue;
    }
    const source = matchingSource(
      input.sources,
      demand.item,
      demand.location,
      mode,
      input.current,
      targetDate
    );
    if (
      mode === "constrained" &&
      demand.due >= input.current &&
      (!source || !sourceCanMeetTarget(source, input.current, targetDate))
    ) {
      const immediateQuantity = Math.min(requiredQuantity, Math.max(available, 0));
      if (immediateQuantity > 0) {
        addDemandEvent(
          state,
          demandPlans,
          demand,
          demand.due,
          immediateQuantity,
          () => sequence++
        );
        requiredQuantity -= immediateQuantity;
        available = onhandAt(state.events, targetDate);
      }
    }
    if (available + 1e-9 < requiredQuantity) {
      if (!source) {
        if (mode === "constrained") {
          continue;
        }
        addDemandEvent(state, demandPlans, demand, demandDate, requiredQuantity, () => sequence++);
        continue;
      }
      if (mode === "constrained") {
        deliveryDate = Math.max(
          targetDate - source.extraSafetyLeadTimeSeconds,
          input.current +
            source.leadTimeSeconds +
            source.hardSafetyLeadTimeSeconds
        ) as EpochSeconds;
        demandDate = deliveryDate > demand.due ? deliveryDate : demand.due;
        available = onhandAt(state.events, deliveryDate);
      } else {
        deliveryDate = (demand.due - source.extraSafetyLeadTimeSeconds) as EpochSeconds;
        demandDate = demand.due;
        available = onhandAt(state.events, demandDate);
      }
      const purchaseQuantity = orderQuantity(
        requiredQuantity - available,
        source.minimumQuantity,
        source.multipleQuantity
      );
      addPlannedSupply(
        plannedSupplies,
        purchases,
        state,
        source,
        deliveryDate,
        purchaseQuantity,
        () => sequence++
      );
    }
    addDemandEvent(state, demandPlans, demand, demandDate, requiredQuantity, () => sequence++);
  }

  const events = [...states.values()].flatMap((state) =>
    materialEvents(state, input.current)
  );
  return { events, purchases, demandPlans };
}

function addDemandEvent(
  state: BufferState,
  demandPlans: DemandPlan[],
  demand: MaterialDemand,
  date: EpochSeconds,
  quantity: number,
  nextSequence: () => number
): void {
  const originalDue = date > demand.due ? demand.due : undefined;
  state.events.push({
    date,
    quantity: -quantity,
    sequence: nextSequence(),
    kind: "demand",
    ...(originalDue === undefined ? {} : { originalDue })
  });
  demandPlans.push({
    name: demand.name,
    date,
    quantity,
    ...(originalDue === undefined ? {} : { originalDue })
  });
}

function materialEvents(
  state: BufferState,
  current: EpochSeconds
): readonly MaterialPlanEvent[] {
  const ordered = sortEvents(state.events);
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

  let projectedOnhand = onhand;
  for (let cursor = index + 1; cursor < events.length; cursor += 1) {
    const candidate = events[cursor];
    if (!candidate || candidate.kind !== "demand") {
      continue;
    }
    projectedOnhand += candidate.quantity;
    if (projectedOnhand <= 1e-9) {
      return candidate.date - event.date;
    }
  }
  return 999 * 86_400;
}

function onhandAt(events: readonly MutableEvent[], date: EpochSeconds): number {
  return sortEvents(events)
    .filter((event) => event.date <= date)
    .reduce((sum, event) => sum + event.quantity, 0);
}

function matchingSource(
  sources: readonly ProcurementSource[],
  item: string,
  location: string,
  mode: MaterialPlanningMode,
  current: EpochSeconds,
  target: EpochSeconds
): ProcurementSource | undefined {
  const candidates = [...sources]
    .filter(
      (source) =>
        source.item === item &&
        (source.location === undefined || source.location === location)
    );
  if (mode === "unconstrained") {
    return candidates.sort((left, right) => compareSources(left, right, mode))[0];
  }
  const onTime = candidates.filter(
    (source) => sourceCanMeetTarget(source, current, target)
  );
  if (onTime.length > 0) {
    return onTime.sort(comparePreferredSources)[0];
  }
  return candidates.sort((left, right) => compareSources(left, right, mode))[0];
}

function sourceCanMeetTarget(
  source: ProcurementSource,
  current: EpochSeconds,
  target: EpochSeconds
): boolean {
  return (
    current + source.leadTimeSeconds + source.hardSafetyLeadTimeSeconds <=
    target - source.extraSafetyLeadTimeSeconds
  );
}

function compareSources(
  left: ProcurementSource,
  right: ProcurementSource,
  mode: MaterialPlanningMode
): number {
  if (mode === "constrained") {
    const leftDelay = left.leadTimeSeconds + left.hardSafetyLeadTimeSeconds;
    const rightDelay = right.leadTimeSeconds + right.hardSafetyLeadTimeSeconds;
    if (leftDelay !== rightDelay) {
      return leftDelay - rightDelay;
    }
  }
  return comparePreferredSources(left, right);
}

function comparePreferredSources(
  left: ProcurementSource,
  right: ProcurementSource
): number {
  return (
    left.priority - right.priority ||
    Number(Boolean(left.inherited)) - Number(Boolean(right.inherited)) ||
    left.leadTimeSeconds - right.leadTimeSeconds ||
    left.supplier.localeCompare(right.supplier)
  );
}

function addPlannedSupply(
  plannedSupplies: Map<string, { readonly event: MutableEvent; readonly purchaseIndex: number }>,
  purchases: PurchasePlan[],
  state: BufferState,
  source: ProcurementSource,
  deliveryDate: EpochSeconds,
  quantity: number,
  nextSequence: () => number
): void {
  const key = [
    state.buffer.item,
    state.buffer.location,
    source.supplier,
    source.leadTimeSeconds,
    source.hardSafetyLeadTimeSeconds,
    deliveryDate
  ].join("\u0000");
  const existing = plannedSupplies.get(key);
  if (existing) {
    existing.event.quantity += quantity;
    const purchase = purchases[existing.purchaseIndex];
    if (purchase) {
      purchases[existing.purchaseIndex] = {
        ...purchase,
        quantity: purchase.quantity + quantity
      };
    }
    return;
  }
  const event: MutableEvent = {
    date: deliveryDate,
    quantity,
    sequence: nextSequence(),
    kind: "receipt"
  };
  state.events.push(event);
  purchases.push({
    name: `Purchase ${state.buffer.item} @ ${state.buffer.location} from ${source.supplier}`,
    item: state.buffer.item,
    location: state.buffer.location,
    supplier: source.supplier,
    start: (
      deliveryDate -
      source.hardSafetyLeadTimeSeconds -
      source.leadTimeSeconds
    ) as EpochSeconds,
    end: (deliveryDate - source.hardSafetyLeadTimeSeconds) as EpochSeconds,
    quantity
  });
  plannedSupplies.set(key, { event, purchaseIndex: purchases.length - 1 });
}

function orderQuantity(
  shortage: number,
  minimumQuantity: number,
  multipleQuantity: number
): number {
  const requested = Math.max(shortage, minimumQuantity);
  if (multipleQuantity <= 0) {
    return requested;
  }
  return Math.ceil(requested / multipleQuantity) * multipleQuantity;
}

function sortedDemands(demands: readonly MaterialDemand[]): readonly MaterialDemand[] {
  return [...demands].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.due - right.due ||
      left.name.localeCompare(right.name)
  );
}

function sortEvents(events: readonly MutableEvent[]): readonly MutableEvent[] {
  return [...events].sort(
    (left, right) =>
      left.date - right.date ||
      eventKindOrder(left.kind) - eventKindOrder(right.kind) ||
      left.sequence - right.sequence
  );
}

function eventKindOrder(kind: MutableEvent["kind"]): number {
  return kind === "receipt" ? 0 : 1;
}

function bufferKey(item: string, location: string): string {
  return `${item}\u0000${location}`;
}
