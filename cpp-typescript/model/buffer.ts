// <header-api-generated>
export const BufferCppModel = { bases: ["HasHierarchy","HasLevel","Plannable"] as const, methods: ["availableOnhandPython","buildProducingOperation","correctProducingFlow","deleteOperationPlans","findFlow","findFromName","findOrCreate","followPegging","getAutofence","getBatch","getBatchString","getDecoupledLeadTime","getDecoupledLeadTimePython","getFlowIterator","getFlowPlanIterator","getFlowPlans","getFlows","getHidden","getIPFlag","getItem","getLocation","getMaximum","getMaximumCalendar","getMinimum","getMinimumCalendar","getNextItemBuffer","getOnHand","getProducingOperation","getTool","getType","hasConsumingFlows","initialize","inspect","inspectPython","registerFields","setAutofence","setBatch","setHidden","setIPFlag","setItem","setLocation","setMaximum","setMaximumCalendar","setMinimum","setMinimumCalendar","setOnHand","setProducingOperation","setTool","solve","updateProblems"] as const, qualifiedNames: ["Buffer"] as const };

export const BufferDefaultCppModel = { bases: ["Buffer"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["BufferDefault"] as const };

export const BufferInfiniteCppModel = { bases: ["Buffer"] as const, methods: ["getType","initialize","solve"] as const, qualifiedNames: ["BufferInfinite"] as const };
// </header-api-generated>








import { Date as PlanningDate, DateRange, Duration } from "../utils/date.js";
import { Environment, HeaderModelAdapter, ModelEntity } from "../utils/library.js";
import type { Calendar } from "./calendar.js";
import { FlowEnd } from "./flow.js";
import {
  FlowPlan,
  TimeLineEventMaxQuantity,
  TimeLineEventMinQuantity,
} from "./flowplan.js";
import type { Item } from "./item.js";
import { ItemMTO } from "./item.js";
import { OperationItemDistribution } from "./itemdistribution.js";
import { ItemSupplier, OperationItemSupplier } from "./itemsupplier.js";
import type { Location } from "./location.js";
import { Operation, OperationAlternate, OperationInventory, OperationRouting, OperationSplit } from "./operation.js";
import { OperationPlan } from "./operationplan.js";
import { Plan } from "./plan.js";
import { ProblemInvalidData } from "./problems_operationplan.js";
import { SubOperation } from "./suboperation.js";
import { HasLevel } from "./leveled.js";
import {
  getEntityChanged,
  getEntityDetectProblems,
  getEntityProblems,
  registerProblemEntity,
  setEntityChanged,
  setEntityDetectProblems,
  unregisterProblemEntity,
} from "./problem.js";
import { updateBufferProblems } from "./problems_buffer.js";

type DateInput = PlanningDate | string | number;

function asDate(value: DateInput): PlanningDate {
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
}

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function link(source: HeaderModelAdapter, property: string, previous: HeaderModelAdapter | null, next: HeaderModelAdapter | null): void {
  if (previous === next) return;
  previous?.modelReferenceRemoved(source, property);
  next?.modelReferenceAdded(source, property);
}

function eventDate(event: HeaderModelAdapter): PlanningDate {
  const value = call(event, "getDate");
  return value instanceof PlanningDate ? value : new PlanningDate(value as string | number | undefined);
}

/** Semantic material-buffer model with explicit ownership and inventory profile behavior. */
export class Buffer extends ModelEntity<Buffer> {
  static readonly cppBases: readonly string[] = ["HasHierarchy", "HasLevel", "Plannable"];
  static readonly cppQualifiedNames: readonly string[] = ["Buffer"];
  static override modelFamily = "Buffer";
  private item: Item | null = null;
  private location: Location | null = null;
  private producingOperation: Operation | null = null;
  private producingOperationInitialized = false;
  private minimum = 0;
  private maximum = 0;
  private minimumCalendar: Calendar | null = null;
  private maximumCalendar: Calendar | null = null;
  private batch = "";
  private tool = false;
  private autofence = true;
  private ipFlag = false;
  private cluster = 0;
  private level = 0;
  private readonly manualFlowPlans: HeaderModelAdapter[] = [];

  constructor(nameOrFields?: string | Readonly<Record<string, unknown>>) {
    super(nameOrFields);
    registerProblemEntity(this);
    HasLevel.triggerLazyRecomputation();
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static findFromName(name: string): Buffer | null {
    const existing = Buffer.find(name);
    if (existing) return existing;
    const parts = String(name).split(" @ ");
    if (parts.length < 2) return null;
    const item = HeaderModelAdapter.invokeStatic("Item", "find", [parts[0] ?? ""]) as Item | undefined;
    const location = HeaderModelAdapter.invokeStatic("Location", "find", [parts.at(-1) ?? ""]) as Location | undefined;
    if (!item || !location) return null;
    const result = new BufferDefault(name);
    result.setItem(item);
    result.setLocation(location);
    if (parts.length > 2) result.setBatch(parts.slice(1, -1).join(" @ "));
    return result;
  }
  static findOrCreate(item: Item | null, location: Location | null, batch = ""): Buffer | null {
    if (!item || !location) return null;
    for (const reference of item.referencedBy("Item")) {
      if (!(reference instanceof Buffer) || reference.getLocation() !== location) continue;
      if (reference.getBatch() === String(batch)) return reference;
    }
    const modeledBatch = batch && item instanceof ItemMTO ? ` @ ${batch}` : "";
    let name = `${item.getName()}${modeledBatch} @ ${location.getName()}`;
    if (!modeledBatch) while (Buffer.find(name)) name += "*";
    const result = new BufferDefault(name);
    result.setItem(item);
    result.setLocation(location);
    if (modeledBatch) {
      result.setBatch(batch);
      // C++ copies the generic MTO buffer's planning identity to every
      // batch-specific buffer. The producing operation remains discoverable
      // through the shared item/location flows, while level and cluster stay
      // identical to the generic buffer.
      const generic = [...item.referencedBy("Item")].find((reference) =>
        reference instanceof Buffer && reference.getLocation() === location && !reference.getBatch());
      if (generic instanceof Buffer) result.copyLevelAndCluster(generic);
    }
    return result;
  }
  findOrCreate(item: Item | null, location: Location | null, batch = ""): Buffer | null { return Buffer.findOrCreate(item, location, batch); }
  findFromName(name: string): Buffer | null { return Buffer.findFromName(name); }
  override getType(): string { return "buffer"; }
  getItem(): Item | undefined { return this.item ?? undefined; }
  setItem(value: Item | null, _recompute = true): void {
    link(this, "Item", this.item, value);
    this.item = value;
    if (_recompute) HasLevel.triggerLazyRecomputation();
  }
  getLocation(): Location | null { return this.location; }
  setLocation(value: Location | null, _recompute = true): void {
    link(this, "Location", this.location, value);
    this.location = value;
    if (_recompute) HasLevel.triggerLazyRecomputation();
  }
  getBatch(): string { return this.batch; }
  getBatchString(): string { return this.batch; }
  setBatch(value: string): void { this.batch = String(value); }
  getMinimum(): number { return this.minimum; }
  setMinimum(value: number): void {
    this.minimum = Number(value);
    if (this.minimumCalendar) return;
    this.setChanged();
    const timeline = FlowPlan.getBufferTimeline(this);
    const event = timeline.snapshot().find((candidate) => candidate.getEventType() === 3);
    if (event instanceof TimeLineEventMinQuantity) event.setMin(Math.max(this.minimum, 0));
    else new TimeLineEventMinQuantity(Plan.instance().getCurrent(), timeline, Math.max(this.minimum, 0));
  }
  getMaximum(): number { return this.maximum; }
  setMaximum(value: number): void {
    this.maximum = Number(value);
    if (this.maximumCalendar) return;
    this.setChanged();
    const timeline = FlowPlan.getBufferTimeline(this);
    const event = timeline.snapshot().find((candidate) => candidate.getEventType() === 4);
    if (event instanceof TimeLineEventMaxQuantity) {
      if (this.maximum > 0.000001) event.setMax(this.maximum);
      else timeline.erase(event);
    } else if (this.maximum > 0.000001) {
      new TimeLineEventMaxQuantity(Plan.instance().getCurrent(), timeline, this.maximum);
    }
  }
  getMinimumCalendar(): Calendar | undefined { return this.minimumCalendar ?? undefined; }
  setMinimumCalendar(value: Calendar | null): void {
    if (this.minimumCalendar === value) return;
    this.setChanged();
    const timeline = FlowPlan.getBufferTimeline(this);
    for (const event of timeline.snapshot()) if (event.getEventType() === 3) timeline.erase(event);
    const previous = this.minimumCalendar;
    link(this, "MinimumCalendar", this.minimumCalendar, value);
    this.minimumCalendar = value;
    if (!value) {
      this.setMinimum(this.minimum);
      return;
    }
    let current = 0;
    timeline.batch(() => {
      for (const [date, calendarValue] of value.eventSnapshot(PlanningDate.infinitePast)) {
        if (date.equals(PlanningDate.infiniteFuture)) break;
        const next = Math.max(calendarValue, 0);
        if (current === next) continue;
        current = next;
        new TimeLineEventMinQuantity(date, timeline, current);
      }
    });
    value.clearEventList();
    void previous;
  }
  getMaximumCalendar(): Calendar | undefined { return this.maximumCalendar ?? undefined; }
  setMaximumCalendar(value: Calendar | null): void {
    if (this.maximumCalendar === value) return;
    this.setChanged();
    const timeline = FlowPlan.getBufferTimeline(this);
    for (const event of timeline.snapshot()) if (event.getEventType() === 4) timeline.erase(event);
    link(this, "MaximumCalendar", this.maximumCalendar, value);
    this.maximumCalendar = value;
    if (!value) {
      this.setMaximum(this.maximum);
      return;
    }
    let current = 0;
    timeline.batch(() => {
      for (const [date, calendarValue] of value.eventSnapshot(PlanningDate.infinitePast)) {
        if (date.equals(PlanningDate.infiniteFuture)) break;
        if (current === calendarValue) continue;
        current = calendarValue;
        new TimeLineEventMaxQuantity(date, timeline, current);
      }
    });
    value.clearEventList();
  }
  getTool(): boolean { return this.tool; }
  setTool(value: boolean): void { this.tool = Boolean(value); }
  getAutofence(): boolean { return this.autofence; }
  setAutofence(value: boolean): void { this.autofence = Boolean(value); }
  getIPFlag(): boolean { return this.ipFlag; }
  setIPFlag(value: boolean): void { this.ipFlag = Boolean(value); }
  getCluster(): number { HasLevel.getNumberOfClusters(); return this.cluster; }
  setCluster(value: number): void { this.cluster = Math.trunc(Number(value)); }
  getLevel(): number { HasLevel.getNumberOfLevels(); return this.level; }
  setLevel(value: number): void { this.level = Math.trunc(Number(value)); }
  _getClusterRaw(): number { return this.cluster; }
  _getLevelRaw(): number { return this.level; }
  _setClusterRaw(value: number): void { this.cluster = Math.trunc(value); }
  _setLevelRaw(value: number): void { this.level = Math.trunc(value); }
  copyLevelAndCluster(source: { _getClusterRaw?(): number; _getLevelRaw?(): number } | null): void {
    if (!source) return;
    this.cluster = Number(source._getClusterRaw?.() ?? 0);
    this.level = Number(source._getLevelRaw?.() ?? -1);
  }
  getProducingOperation(): Operation | null {
    if (!this.producingOperationInitialized) this.buildProducingOperation();
    return this.producingOperation;
  }
  setProducingOperation(value: Operation | null): void {
    if (value && Boolean(call(value, "getHidden"))) Environment.log("Warning: avoid setting the producing operation to a hidden operation");
    link(this, "ProducingOperation", this.producingOperation, value);
    this.producingOperation = value;
    this.producingOperationInitialized = true;
  }
  buildProducingOperation(): void {
    this.producingOperationInitialized = true;
    if (this.producingOperation && !Boolean(call(this.producingOperation, "getHidden"))) return;

    const mergeReplenishment = (
      operation: Operation,
      priority: number,
      effective: DateRange,
    ): boolean => {
      const current = this.producingOperation;
      if (current === operation) return true;
      if (current instanceof OperationAlternate) {
        if (current.getSubOperations().some((association) => call(association, "getOperation") === operation)) return true;
        if (current.getSubOperations().length > 100) {
          Environment.log(`Excessive replenishments defined for '${this.getName()}'`);
          return false;
        }
        new SubOperation(operation, current, priority, effective);
        if (operation.getSearch() !== "PRIORITY") current.setSearch(operation.getSearch());
        return true;
      }
      if (current) {
        const alternate = new OperationAlternate(`Replenish ${this.getName()}`);
        alternate.setHidden(true);
        if (operation.getSearch() !== "PRIORITY") alternate.setSearch(operation.getSearch());
        new SubOperation(current, alternate);
        new SubOperation(operation, alternate, priority, effective);
        link(this, "ProducingOperation", current, alternate);
        this.producingOperation = alternate;
        return true;
      }
      if (effective.isDefault() && priority === 1 && operation.getSearch() === "PRIORITY") {
        link(this, "ProducingOperation", null, operation);
        this.producingOperation = operation;
      } else {
        const alternate = new OperationAlternate(`Replenish ${this.getName()}`);
        alternate.setHidden(true);
        if (operation.getSearch() !== "PRIORITY") alternate.setSearch(operation.getSearch());
        new SubOperation(operation, alternate, priority, effective);
        link(this, "ProducingOperation", null, alternate);
        this.producingOperation = alternate;
      }
      return true;
    };

    let item = this.item;
    while (item) {
      for (const candidate of item.getSuppliers()) {
        if (!(candidate instanceof ItemSupplier) || candidate.getPriority() === 0) continue;
        const supplierLocation = candidate.getLocation();
        if (supplierLocation && (!this.location || this.location !== supplierLocation)) continue;
        const exists = this.producingOperation instanceof OperationItemSupplier
          ? this.producingOperation.getItemSupplier() === candidate
          : this.producingOperation instanceof OperationAlternate
            && this.producingOperation.getSubOperations().some((association) => {
              const operation = call(association, "getOperation");
              return operation instanceof OperationItemSupplier && operation.getItemSupplier() === candidate;
            });
        if (exists) continue;
        if (!mergeReplenishment(
          OperationItemSupplier.findOrCreate(candidate, this),
          candidate.getPriority(),
          candidate.getEffective(),
        )) return;
      }

      for (const candidate of item.getDistributions()) {
        if (candidate.constructor.name !== "ItemDistribution" || Number(call(candidate, "getPriority") ?? 0) === 0) continue;
        const origin = call(candidate, "getOrigin") as Location | null;
        const destination = call(candidate, "getDestination") as Location | null;
        if (!origin || this.location === origin) continue;
        if (destination && (!this.location || this.location !== destination)) continue;
        const exists = this.producingOperation instanceof OperationItemDistribution
          ? this.producingOperation.getItemDistribution() === candidate
          : this.producingOperation instanceof OperationAlternate
            && this.producingOperation.getSubOperations().some((association) => {
              const operation = call(association, "getOperation");
              return operation instanceof OperationItemDistribution && operation.getItemDistribution() === candidate;
            });
        if (exists) continue;
        const originBuffer = Buffer.findOrCreate(this.item, origin, this.getBatch());
        if (!originBuffer) continue;
        if (!mergeReplenishment(
          OperationItemDistribution.findOrCreate(candidate as never, originBuffer, this),
          Number(call(candidate, "getPriority") ?? 1),
          call(candidate, "getEffective") as DateRange,
        )) return;
      }
      item = item.getOwner();
    }

    if (this.item) {
      for (const candidate of this.item.getOperationIterator()) {
        if (!(candidate instanceof Operation) || candidate.getPriority() === 0) continue;
        let operationLocation = candidate.getLocation();
        for (const flow of candidate.getFlows()) {
          if (call(flow, "getItem") === this.item && call(flow, "getLocation") && Boolean(call(flow, "isProducer"))) {
            operationLocation = call(flow, "getLocation") as Location;
            break;
          }
        }
        if (operationLocation && operationLocation !== this.location) continue;
        this.correctProducingFlow(candidate);
        if (!mergeReplenishment(candidate, candidate.getPriority(), candidate.getEffective())) return;
      }
    }

    if (!this.producingOperation) {
      const producers = this.getFlows().filter((flow) => Number(call(flow, "getQuantity") ?? 0) > 0)
        .map((flow) => call(flow, "getOperation") as Operation | null)
        .filter((operation): operation is Operation => operation instanceof Operation
          && !(operation instanceof OperationInventory) && operation.getPriority() !== 0);
      const unique = [...new Set(producers)];
      if (unique.length === 1) {
        link(this, "ProducingOperation", null, unique[0] ?? null);
        this.producingOperation = unique[0] ?? null;
      }
    }

    const invalidData = getEntityProblems(this, false)
      .find((problem) => problem instanceof ProblemInvalidData);
    if (!this.producingOperation) {
      if (!invalidData) {
        new ProblemInvalidData(
          this,
          `No replenishment defined for '${this.getName()}'`,
          "material",
          PlanningDate.infinitePast,
          PlanningDate.infiniteFuture,
        );
      }
    } else {
      invalidData?.dispose();
    }
  }
  correctProducingFlow(operation: Operation): void {
    if (operation instanceof OperationRouting || operation instanceof OperationAlternate || operation instanceof OperationSplit) {
      const parentFlow = operation.getFlows().some((flow) =>
        call(flow, "getItem") === this.item &&
        (!call(flow, "getLocation") || call(flow, "getLocation") === this.location));
      if (parentFlow) return;
    }

    if (operation instanceof OperationRouting) {
      let lastStep: Operation | null = null;
      for (const association of operation.getSubOperations()) {
        const step = call(association, "getOperation");
        if (!(step instanceof Operation)) continue;
        const matchingFlow = step.getFlows().some((flow) =>
          call(flow, "getItem") === this.item &&
          (!call(flow, "getLocation") || call(flow, "getLocation") === this.location));
        if (matchingFlow) return;
        lastStep = step;
      }
      if (lastStep) {
        this.correctProducingFlow(lastStep);
        return;
      }
    }

    if (operation instanceof OperationAlternate || operation instanceof OperationSplit) {
      for (const association of operation.getSubOperations()) {
        const child = call(association, "getOperation");
        if (child instanceof Operation) this.correctProducingFlow(child);
      }
      return;
    }

    const found = operation.getFlows().some((flow) =>
      call(flow, "getItem") === this.item &&
      (!call(flow, "getLocation") || call(flow, "getLocation") === this.location));
    if (!found) {
      const destination = this.getBatch()
        ? Buffer.findOrCreate(this.item, this.location)
        : this;
      if (destination) new FlowEnd(operation, destination, 1);
    }
  }
  getFlows(): HeaderModelAdapter[] { return this.referencedBy("Buffer").filter((entry) => entry.constructor.name.startsWith("Flow") && entry.constructor.name !== "FlowPlan"); }
  getFlowIterator(): IterableIterator<HeaderModelAdapter> { return this.getFlows().values(); }
  getFlowPlans(): HeaderModelAdapter[] {
    const referenced = this.referencedBy("Buffer").filter((entry) => entry.constructor.name === "FlowPlan");
    const timeline = [...FlowPlan.getBufferTimeline(this).snapshot()];
    const known = new Set<HeaderModelAdapter>(timeline);
    const extras = [...this.manualFlowPlans, ...referenced].filter((entry) => {
      if (known.has(entry)) return false;
      known.add(entry);
      return true;
    });
    return [...timeline, ...extras];
  }
  setFlowPlans(values: readonly HeaderModelAdapter[]): void {
    this.manualFlowPlans.length = 0;
    this.manualFlowPlans.push(...values);
  }
  getFlowPlanIterator(): IterableIterator<HeaderModelAdapter> {
    // The C++ timeline itself contains minimum, maximum and set-onhand
    // markers. Its Python FlowPlanIterator only exposes nonzero FlowPlan
    // records, which is the public buffer.flowplans contract.
    return this.getFlowPlans()
      .filter((entry): entry is FlowPlan => entry instanceof FlowPlan && Math.abs(entry.getQuantity()) > 0.000001)
      .values();
  }
  findFlow(operation: Operation, date: DateInput = PlanningDate.infinitePast): HeaderModelAdapter | null {
    return call(operation, "findFlow", this, asDate(date)) as HeaderModelAdapter | null ?? null;
  }
  hasConsumingFlows(): boolean { return this.getFlows().some((flow) => Boolean(call(flow, "isConsumer"))); }
  setOnHand(value: number): void {
    const quantity = Number(value);
    const operationName = `Inventory ${this.getName()}`;
    let operation = OperationInventory.find(operationName) as OperationInventory | undefined;
    if (!operation) {
      if (!quantity) return;
      operation = new OperationInventory(this);
      new FlowEnd(operation, this, quantity >= 0 ? 1 : -1);
    }
    const flow = operation.getFlows()[0];
    if (flow) call(flow, "setQuantity", quantity >= 0 ? 1 : -1);

    const existing = [...operation.getOperationPlans()][0];
    if (existing instanceof OperationPlan) {
      existing.setClosed(false);
      existing.setQuantity(Math.abs(quantity));
      existing.setClosed(true);
    } else {
      const operationPlan = new OperationPlan(operation);
      operationPlan.setStartEndAndQuantity(
        PlanningDate.infinitePast,
        PlanningDate.infinitePast,
        Math.abs(quantity),
      );
      operationPlan.setBatch(this.getBatch());
      operationPlan.setClosed(true);
      operationPlan.activate();
      operationPlan.setRawReference(this.getName());
    }
  }
  getOnHand(): number;
  getOnHand(date: DateInput, after?: boolean): number;
  getOnHand(start: DateInput, end: DateInput, minimum?: boolean, useSafetyStock?: boolean, includeProposedPo?: boolean): number;
  getOnHand(start?: DateInput, endOrAfter: DateInput | boolean = true, minimum = true, useSafetyStock = false, includeProposedPo = true): number {
    const events = this.getFlowPlans();
    if (start === undefined) {
      const event = events.find((candidate) => eventDate(candidate).equals(PlanningDate.infinitePast));
      return Number(call(event, "getQuantity") ?? call(event, "getOnhand") ?? 0);
    }
    if (typeof endOrAfter === "boolean") {
      const requested = asDate(start);
      let result = 0;
      for (const event of events) {
        const comparison = eventDate(event).compare(requested);
        if ((endOrAfter && comparison > 0) || (!endOrAfter && comparison >= 0)) break;
        result = Number(call(event, "getOnhand") ?? result + Number(call(event, "getQuantity") ?? 0));
      }
      return result;
    }
    let from = asDate(start); let to = asDate(endOrAfter);
    if (from.compare(to) > 0) [from, to] = [to, from];
    let onhand = this.getOnHand(from, false);
    let result = onhand;
    let safetyStock = 0;
    let proposedPurchase = 0;
    for (const event of events) {
      const date = eventDate(event);
      if (date.compare(from) < 0) continue;
      if (date.compare(to) > 0) break;
      if (Number(call(event, "getEventType") ?? 1) === 3) safetyStock = Number(call(event, "getMin") ?? 0);
      const quantity = Number(call(event, "getQuantity") ?? 0);
      onhand = Number(call(event, "getOnhand") ?? onhand + quantity);
      const plan = call(event, "getOperationPlan");
      if (quantity > 0 && Boolean(call(plan, "getProposed")) && call(call(plan, "getOperation"), "getOrderType") === "PO") proposedPurchase += quantity;
      const candidate = onhand - (useSafetyStock ? safetyStock : 0) - (includeProposedPo ? 0 : proposedPurchase);
      result = minimum ? Math.min(result, candidate) : Math.max(result, candidate);
    }
    return result;
  }
  availableOnhandPython(date: DateInput = PlanningDate.now()): number { return this.getOnHand(date, PlanningDate.infiniteFuture, true); }
  getDecoupledLeadTime(quantity = 1, start: DateInput = PlanningDate.now(), recurseIpBuffers = true): readonly [Duration, PlanningDate] {
    const date = asDate(start);
    if (!recurseIpBuffers || this instanceof BufferInfinite) return [new Duration(), date];
    const operation = this.getProducingOperation();
    if (!operation) return [new Duration(999 * 86_400), PlanningDate.infiniteFuture];
    const result = call(operation, "getDecoupledLeadTime", quantity, date);
    return Array.isArray(result) && result[0] instanceof Duration && result[1] instanceof PlanningDate
      ? [result[0], result[1]] : [new Duration(), date];
  }
  getDecoupledLeadTimePython(quantity = 1, start: DateInput = PlanningDate.now()): Duration { return this.getDecoupledLeadTime(quantity, start, true)[0]; }
  deleteOperationPlans(deleteLocked = false): void {
    for (const flow of this.getFlows()) call(call(flow, "getOperation"), "deleteOperationPlans", deleteLocked);
  }
  followPegging(iterator: unknown, flowPlan: unknown, quantity: number, offset: number, level: number): void {
    const currentPlan = call(flowPlan, "getOperationPlan");
    const currentQuantity = Number(call(flowPlan, "getQuantity") ?? 0);
    const planQuantity = Number(call(currentPlan, "getQuantity") ?? 0);
    if (!currentPlan || !planQuantity || this.tool) return;
    const maximumLevel = Number(call(iterator, "getMaxLevel") ?? -1);
    if (maximumLevel !== -1 && level > maximumLevel) return;
    if (this instanceof BufferInfinite && ((currentQuantity < 0 && !call(iterator, "isDownstream")) ||
      (currentQuantity > 0 && call(iterator, "isDownstream")))) return;

    const downstream = Boolean(call(iterator, "isDownstream"));
    const events = this.getFlowPlans();
    const scale = Math.abs(currentQuantity) / planQuantity;
    if (scale <= 0) return;
    const currentStart = currentQuantity < 0
      ? Number(call(flowPlan, "getCumulativeConsumed") ?? 0) + currentQuantity
      : Number(call(flowPlan, "getCumulativeProduced") ?? 0) - currentQuantity;
    const intervalStart = currentStart + offset * scale;
    const intervalEnd = intervalStart + quantity * scale;

    for (const event of events) {
      const eventQuantity = Number(call(event, "getQuantity") ?? 0);
      if ((!downstream && eventQuantity <= 0) || (downstream && eventQuantity >= 0)) continue;
      const eventStart = eventQuantity > 0
        ? Number(call(event, "getCumulativeProduced") ?? 0) - eventQuantity
        : Number(call(event, "getCumulativeConsumed") ?? 0) + eventQuantity;
      const eventEnd = eventQuantity > 0
        ? Number(call(event, "getCumulativeProduced") ?? 0)
        : Number(call(event, "getCumulativeConsumed") ?? 0);
      const overlapStart = Math.max(intervalStart, eventStart);
      const overlapEnd = Math.min(intervalEnd, eventEnd);
      if (overlapEnd - overlapStart <= 0.000001) continue;
      const matchedPlan = call(event, "getOperationPlan");
      if (!matchedPlan) continue;
      const top = maximumLevel > 0 ? matchedPlan : call(matchedPlan, "getTopOwner") ?? matchedPlan;
      const matchedQuantity = Number(call(top, "getQuantity") ?? 0);
      const ratio = matchedQuantity / Math.abs(eventQuantity);
      const gap = downstream
        ? eventDate(event).subtract(eventDate(flowPlan as HeaderModelAdapter))
        : eventDate(flowPlan as HeaderModelAdapter).subtract(eventDate(event));
      call(iterator, "updateStack", top, ratio * (overlapEnd - overlapStart),
        ratio * (overlapStart - eventStart), level, gap);
    }
  }
  inspect(message = "", indent = 0): string {
    return `${" ".repeat(Math.max(0, indent))}Buffer ${this.getName()}${message ? `: ${message}` : ""}`;
  }
  inspectPython(message = "", indent = 0): string { return this.inspect(message, indent); }
  solve(solver: unknown, payload?: unknown): unknown { return call(solver, "solve", this, payload); }
  getChanged(): boolean { return getEntityChanged(this); }
  setChanged(value = true): void { setEntityChanged(this, value); }
  getDetectProblems(): boolean { return getEntityDetectProblems(this); }
  setDetectProblems(value: boolean): void { setEntityDetectProblems(this, value); }
  getProblems(): import("./problem.js").Problem[] { return getEntityProblems(this); }
  updateProblems(): void { updateBufferProblems(this); }
  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Item") this.setItem(null);
    else if (property === "Location") this.dispose();
    else if (property === "ProducingOperation") { this.producingOperation = null; this.producingOperationInitialized = true; }
    else if (property === "MinimumCalendar") this.setMinimumCalendar(null);
    else if (property === "MaximumCalendar") this.setMaximumCalendar(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  protected override disposeReferences(): void {
    unregisterProblemEntity(this);
    HasLevel.triggerLazyRecomputation();
    this.deleteOperationPlans(true);
    for (const flow of [...this.getFlows()]) flow.dispose();
    this.setItem(null);
    this.setLocation(null);
    this.setProducingOperation(null);
    this.setMinimumCalendar(null);
    this.setMaximumCalendar(null);
  }
}

export class BufferDefault extends Buffer {
  static override readonly cppBases: readonly string[] = ["Buffer"];
  static override readonly cppQualifiedNames: readonly string[] = ["BufferDefault"];
  static override initialize(): number { return 0; }
  override getType(): string { return "buffer_default"; }
}

export class BufferInfinite extends Buffer {
  static override readonly cppBases: readonly string[] = ["Buffer"];
  static override readonly cppQualifiedNames: readonly string[] = ["BufferInfinite"];
  constructor(nameOrFields?: string | Readonly<Record<string, unknown>>) { super(nameOrFields); this.setProducingOperation(null); }
  static override initialize(): number { return 0; }
  override getType(): string { return "buffer_infinite"; }
  override solve(solver: unknown, payload?: unknown): unknown { return call(solver, "solve", this, payload); }
}



















/**
 * Semantic migration unit for src/model/buffer.cpp.
 * Generated once as a structural baseline and then maintained as TypeScript.
 */

export type PortScalar = string | number | boolean | bigint | null;
export type PortValue = PortScalar | object | readonly PortValue[];

export interface PortDefinition {
  readonly name: string;
  readonly sourceLine: number;
  readonly status: "adapted" | "ported";
}

export const PORT_MANIFEST = [
  { name: "Buffer::initialize", sourceLine: 37, status: "adapted" },
  { name: "BufferDefault::initialize", sourceLine: 56, status: "adapted" },
  { name: "BufferInfinite::initialize", sourceLine: 65, status: "adapted" },
  { name: "OperationInventory::initialize", sourceLine: 74, status: "adapted" },
  { name: "OperationDelivery::initialize", sourceLine: 96, status: "adapted" },
  { name: "OperationDelivery::OperationDelivery", sourceLine: 114, status: "adapted" },
  { name: "Demand::getDefaultDeliveryDuration", sourceLine: 122, status: "adapted" },
  { name: "OperationDelivery::setBuffer", sourceLine: 125, status: "adapted" },
  { name: "OperationDelivery::getBuffer", sourceLine: 142, status: "adapted" },
  { name: "Buffer::inspect", sourceLine: 147, status: "adapted" },
  { name: "Buffer::inspectPython", sourceLine: 180, status: "adapted" },
  { name: "Buffer::setItem", sourceLine: 203, status: "adapted" },
  { name: "Buffer::setOnHand", sourceLine: 232, status: "adapted" },
  { name: "OperationInventory::OperationInventory", sourceLine: 273, status: "adapted" },
  { name: "OperationInventory::getBuffer", sourceLine: 281, status: "adapted" },
  { name: "Buffer::getOnHand", sourceLine: 285, status: "adapted" },
  { name: "Buffer::getOnHand", sourceLine: 299, status: "adapted" },
  { name: "Buffer::getOnHand", sourceLine: 318, status: "adapted" },
  { name: "Buffer::setMinimum", sourceLine: 366, status: "adapted" },
  { name: "flowplanlist::EventMinQuantity", sourceLine: 390, status: "adapted" },
  { name: "Plan::instance", sourceLine: 391, status: "adapted" },
  { name: "Buffer::setMinimumCalendar", sourceLine: 395, status: "adapted" },
  { name: "flowplanlist::EventMinQuantity", sourceLine: 428, status: "adapted" },
  { name: "Buffer::setMaximum", sourceLine: 434, status: "adapted" },
  { name: "flowplanlist::EventMaxQuantity", sourceLine: 463, status: "adapted" },
  { name: "Plan::instance", sourceLine: 464, status: "adapted" },
  { name: "Buffer::setMaximumCalendar", sourceLine: 469, status: "adapted" },
  { name: "flowplanlist::EventMaxQuantity", sourceLine: 499, status: "adapted" },
  { name: "Buffer::deleteOperationPlans", sourceLine: 505, status: "adapted" },
  { name: "OperationPlan::deleteOperationPlans", sourceLine: 508, status: "adapted" },
  { name: "Buffer::~Buffer", sourceLine: 514, status: "adapted" },
  { name: "Problem::clearConstraints", sourceLine: 544, status: "adapted" },
  { name: "Buffer::followPegging", sourceLine: 547, status: "adapted" },
  { name: "Buffer::findOrCreate", sourceLine: 777, status: "adapted" },
  { name: "Buffer::findOrCreate", sourceLine: 798, status: "adapted" },
  { name: "Buffer::hasConsumingFlows", sourceLine: 833, status: "adapted" },
  { name: "Buffer::buildProducingOperation", sourceLine: 839, status: "adapted" },
  { name: "OperationItemSupplier::findOrCreate", sourceLine: 892, status: "adapted" },
  { name: "OperationItemDistribution::findOrCreate", sourceLine: 1011, status: "adapted" },
  { name: "Buffer::correctProducingFlow", sourceLine: 1228, status: "adapted" },
  { name: "Buffer::findOrCreate", sourceLine: 1294, status: "adapted" },
  { name: "Buffer::getDecoupledLeadTime", sourceLine: 1300, status: "adapted" },
  { name: "Buffer::getDecoupledLeadTimePython", sourceLine: 1316, status: "adapted" },
  { name: "Buffer::availableOnhandPython", sourceLine: 1335, status: "adapted" },
  { name: "Buffer::findFromName", sourceLine: 1355, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface BufferPort {
  availableOnhandPython(...args: readonly PortValue[]): PortValue | void;
  buildProducingOperation(...args: readonly PortValue[]): PortValue | void;
  correctProducingFlow(...args: readonly PortValue[]): PortValue | void;
  deleteOperationPlans(...args: readonly PortValue[]): PortValue | void;
  disposeBuffer(...args: readonly PortValue[]): PortValue | void;
  findFromName(...args: readonly PortValue[]): PortValue | void;
  findOrCreate(...args: readonly PortValue[]): PortValue | void;
  followPegging(...args: readonly PortValue[]): PortValue | void;
  getDecoupledLeadTime(...args: readonly PortValue[]): PortValue | void;
  getDecoupledLeadTimePython(...args: readonly PortValue[]): PortValue | void;
  getOnHand(...args: readonly PortValue[]): PortValue | void;
  hasConsumingFlows(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  inspect(...args: readonly PortValue[]): PortValue | void;
  inspectPython(...args: readonly PortValue[]): PortValue | void;
  setItem(...args: readonly PortValue[]): PortValue | void;
  setMaximum(...args: readonly PortValue[]): PortValue | void;
  setMaximumCalendar(...args: readonly PortValue[]): PortValue | void;
  setMinimum(...args: readonly PortValue[]): PortValue | void;
  setMinimumCalendar(...args: readonly PortValue[]): PortValue | void;
  setOnHand(...args: readonly PortValue[]): PortValue | void;
}

export interface BufferDefaultPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface BufferInfinitePort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface DemandPort {
  getDefaultDeliveryDuration(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationDeliveryPort {
  OperationDelivery(...args: readonly PortValue[]): PortValue | void;
  getBuffer(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setBuffer(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationInventoryPort {
  OperationInventory(...args: readonly PortValue[]): PortValue | void;
  getBuffer(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationItemDistributionPort {
  findOrCreate(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationItemSupplierPort {
  findOrCreate(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanPort {
  deleteOperationPlans(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface ProblemPort {
  clearConstraints(...args: readonly PortValue[]): PortValue | void;
}

export interface flowplanlistPort {
  EventMaxQuantity(...args: readonly PortValue[]): PortValue | void;
  EventMinQuantity(...args: readonly PortValue[]): PortValue | void;
}

export class CompatibilityAdapter {
  readonly state = new Map<string, PortValue>();

  invoke(method: string, ...args: readonly PortValue[]): PortValue | void {
    if (method.startsWith("set") && args.length > 0) {
      this.state.set(method.slice(3), args[0] ?? null);
      return;
    }
    if (method.startsWith("get")) return this.state.get(method.slice(3)) ?? null;
    if (method.startsWith("is") || method.startsWith("has")) return false;
    return args[0] ?? null;
  }
}

export const compatibilityAdapter = new CompatibilityAdapter();
export const sourceFile = "src/model/buffer.cpp";
export const targetFile = "model/buffer.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2007-2015 by frePPLe bv                                   *",
  " *                                                                         *",
  " * Permission is hereby granted, free of charge, to any person obtaining   *",
  " * a copy of this software and associated documentation files (the         *",
  " * \"Software\"), to deal in the Software without restriction, including     *",
  " * without limitation the rights to use, copy, modify, merge, publish,     *",
  " * distribute, sublicense, and/or sell copies of the Software, and to      *",
  " * permit persons to whom the Software is furnished to do so, subject to   *",
  " * the following conditions:                                               *",
  " *                                                                         *",
  " * The above copyright notice and this permission notice shall be          *",
  " * included in all copies or substantial portions of the Software.         *",
  " *                                                                         *",
  " * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,         *",
  " * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF      *",
  " * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND                   *",
  " * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE  *",
  " * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION  *",
  " * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION   *",
  " * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.         *",
  " *                                                                         *",
  " ***************************************************************************/",
  "",
  "#include \"frepple/model.h\"",
  "",
  "namespace frepple {",
  "",
  "template <class Buffer>",
  "Tree utils::HasName<Buffer>::st;",
  "const MetaCategory* Buffer::metadata;",
  "const MetaClass *BufferDefault::metadata, *BufferInfinite::metadata,",
  "    *OperationInventory::metadata, *OperationDelivery::metadata;",
  "OperationFixedTime* Buffer::uninitializedProducing = nullptr;",
  "",
  "int Buffer::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Buffer>(\"buffer\", \"buffers\", reader,",
  "                                                    finder);",
  "  registerFields<Buffer>(const_cast<MetaCategory*>(metadata));",
  "",
  "  uninitializedProducing = new OperationFixedTime();",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<Buffer>::getPythonType();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the decoupled lead time\");",
  "  x.addMethod(\"availableonhand\", &availableOnhandPython, METH_VARARGS,",
  "              \"return the available onhand at a specific date\");",
  "  x.addMethod(\"inspect\", inspectPython, METH_VARARGS,",
  "              \"debugging function to print the inventory profile\");",
  "  return FreppleCategory<Buffer>::initialize();",
  "}",
  "",
  "int BufferDefault::initialize() {",
  "  // Initialize the metadata",
  "  BufferDefault::metadata = MetaClass::registerClass<BufferDefault>(",
  "      \"buffer\", \"buffer_default\", Object::create<BufferDefault>, true);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<BufferDefault, Buffer>::initialize();",
  "}",
  "",
  "int BufferInfinite::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<BufferInfinite>(",
  "      \"buffer\", \"buffer_infinite\", Object::create<BufferInfinite>);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<BufferInfinite, Buffer>::initialize();",
  "}",
  "",
  "int OperationInventory::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationInventory>(",
  "      \"operation\", \"operation_inventory\");",
  "  registerFields<OperationInventory>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<OperationInventory>::getPythonType();",
  "  x.setName(\"operation_inventory\");",
  "  x.setDoc(\"frePPLe operation_inventory\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "int OperationDelivery::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationDelivery>(",
  "      \"operation\", \"operation_delivery\", Object::create<OperationDelivery>);",
  "  registerFields<OperationDelivery>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = PythonExtension<",
  "      FreppleClass<OperationDelivery, Operation>>::getPythonType();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  return FreppleClass<OperationDelivery, Operation>::initialize();",
  "}",
  "",
  "OperationDelivery::OperationDelivery() {",
  "  setHidden(true);",
  "  setDetectProblems(false);",
  "  // When we set the size minimum to 0 for the automatically created",
  "  // delivery operations, they will be constrained by the minimum shipment",
  "  // size specified on the demand.",
  "  setSizeMinimum(0.0);",
  "  initType(metadata);",
  "  setDuration(Demand::getDefaultDeliveryDuration());",
  "}",
  "",
  "void OperationDelivery::setBuffer(Buffer* buf) {",
  "  // Validate the input",
  "  if (getBuffer() == buf)",
  "    return;",
  "  else if (!buf)",
  "    throw DataException(\"A delivery operation can't point to a null buffer\");",
  "  else if (getBuffer())",
  "    throw DataException(\"Buffer can be set only once on a delivery operation\");",
  "",
  "  // Update the operation",
  "  setName(\"Ship \" + string(buf->getName()));",
  "  setLocation(buf->getLocation());",
  "",
  "  // Add a flow consuming from the buffer",
  "  new FlowStart(this, buf, -1);",
  "}",
  "",
  "Buffer* OperationDelivery::getBuffer() const {",
  "  auto tmp = getFlows().begin();",
  "  return tmp == getFlows().end() ? nullptr : tmp->getBuffer();",
  "}",
  "",
  "void Buffer::inspect(const string& msg, const short i) const {",
  "  indent indentstring(i);",
  "  logger << indentstring << \"  Inspecting buffer \" << getName() << \": \";",
  "  if (!msg.empty()) logger << msg;",
  "  logger << '\\n';",
  "",
  "  double curmin = 0.0;",
  "  double curmax = 0.0;",
  "  for (const auto& oo : getFlowPlans()) {",
  "    if (oo.getEventType() == 3)",
  "      curmin = oo.getMin();",
  "    else if (oo.getEventType() == 4)",
  "      curmax = oo.getMax();",
  "    logger << indentstring << \"    \" << oo.getDate()",
  "           << \" qty:\" << oo.getQuantity() << \", oh:\" << oo.getOnhand();",
  "    if (curmin) logger << \", min:\" << curmin;",
  "    if (curmax) logger << \", max:\" << curmax;",
  "    switch (oo.getEventType()) {",
  "      case 1:",
  "        logger << \", \" << oo.getOperationPlan() << '\\n';",
  "        break;",
  "      case 2:",
  "        logger << \", set onhand to \" << oo.getOnhand() << '\\n';",
  "        break;",
  "      case 3:",
  "        logger << \", update minimum to \" << oo.getMin() << '\\n';",
  "        break;",
  "      case 4:",
  "        logger << \", update maximum to \" << oo.getMax() << '\\n';",
  "    }",
  "  }",
  "}",
  "",
  "PyObject* Buffer::inspectPython(PyObject* self, PyObject* args) {",
  "  try {",
  "    // Pick up the buffer",
  "    Buffer* buf = nullptr;",
  "    PythonData c(self);",
  "    if (c.check(Buffer::metadata))",
  "      buf = static_cast<Buffer*>(self);",
  "    else",
  "      throw LogicException(\"Invalid buffer type\");",
  "",
  "    // Parse the argument",
  "    char* msg = nullptr;",
  "    if (!PyArg_ParseTuple(args, \"|s:inspect\", &msg)) return nullptr;",
  "",
  "    buf->inspect(msg ? msg : \"\");",
  "",
  "    return Py_BuildValue(\"\");",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "void Buffer::setItem(Item* i, bool recompute) {",
  "  if (it == i)",
  "    // No change",
  "    return;",
  "",
  "  // Unlink from previous item",
  "  if (it) {",
  "    if (it->firstItemBuffer == this)",
  "      it->firstItemBuffer = nextItemBuffer;",
  "    else {",
  "      Buffer* buf = it->firstItemBuffer;",
  "      while (buf && buf->nextItemBuffer != this) buf = buf->nextItemBuffer;",
  "      if (!buf) throw LogicException(\"corrupted buffer list for an item\");",
  "      buf->nextItemBuffer = nextItemBuffer;",
  "    }",
  "  }",
  "",
  "  // Link at new item",
  "  it = i;",
  "  if (it) {",
  "    nextItemBuffer = it->firstItemBuffer;",
  "    it->firstItemBuffer = this;",
  "  }",
  "",
  "  // Mark changed",
  "  setChanged();",
  "  if (recompute) HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "void Buffer::setOnHand(double f) {",
  "  // The dummy operation to model the inventory may need to be created",
  "  Operation* o = Operation::find(\"Inventory \" + string(getName()));",
  "  Flow* fl;",
  "  if (!o) {",
  "    // Stop here if the quantity is 0",
  "    if (!f) return;",
  "    // Create a fixed time operation with zero leadtime, hidden from the xml",
  "    // output, hidden for the solver, and without problem detection.",
  "    o = new OperationInventory(this);",
  "    fl = new FlowEnd(o, this, 1);",
  "  } else",
  "    // Find the flow of this operation",
  "    fl = const_cast<Flow*>(&*(o->getFlows().begin()));",
  "",
  "  // Check valid pointers",
  "  if (!fl || !o)",
  "    throw LogicException(\"Failed creating inventory operation for '\" +",
  "                         getName() + \"'\");",
  "",
  "  // Make sure the sign of the flow is correct: +1 or -1.",
  "  fl->setQuantity(f >= 0.0 ? 1.0 : -1.0);",
  "",
  "  // Create a dummy operationplan on the inventory operation",
  "  OperationPlan::iterator i(o);",
  "  if (i == OperationPlan::end()) {",
  "    // No operationplan exists yet",
  "    auto opplan = o->createOperationPlan(fabs(f), Date::infinitePast,",
  "                                         Date::infinitePast, getBatch());",
  "    opplan->setClosed(true);",
  "    opplan->activate();",
  "    opplan->setRawReference(getName());",
  "  } else {",
  "    // Update the existing operationplan",
  "    i->setClosed(false);",
  "    i->setQuantity(fabs(f));",
  "    i->setClosed(true);",
  "  }",
  "  setChanged();",
  "}",
  "",
  "OperationInventory::OperationInventory(Buffer* buf) {",
  "  setName(\"Inventory \" + string(buf->getName()));",
  "  setHidden(true);",
  "  setDetectProblems(false);",
  "  setSizeMinimum(0);",
  "  initType(metadata);",
  "}",
  "",
  "Buffer* OperationInventory::getBuffer() const {",
  "  return getFlows().begin()->getBuffer();",
  "}",
  "",
  "double Buffer::getOnHand() const {",
  "  string invop = \"Inventory \" + string(getName());",
  "  for (const auto& flowplan : flowplans) {",
  "    if (flowplan.getDate())",
  "      return 0.0;  // Inventory event is always at start of horizon",
  "    if (flowplan.getEventType() != 1) continue;",
  "    const auto* fp = static_cast<const FlowPlan*>(&flowplan);",
  "    if (fp->getFlow()->getOperation()->getName() == invop &&",
  "        fabs(fp->getQuantity()) > ROUNDING_ERROR)",
  "      return fp->getQuantity();",
  "  }",
  "  return 0.0;",
  "}",
  "",
  "double Buffer::getOnHand(Date d, bool after) const {",
  "  if (d == Date::infiniteFuture) {",
  "    auto tmp = flowplans.rbegin();",
  "    return tmp == flowplans.end() ? 0.0 : tmp->getOnhand();",
  "  }",
  "  double tmp(0.0);",
  "  for (const auto& flowplan : flowplans) {",
  "    if ((after && flowplan.getDate() > d) ||",
  "        (!after && flowplan.getDate() >= d))",
  "      // Found a flowplan with a later date.",
  "      // Return the onhand after the previous flowplan.",
  "      return tmp;",
  "    tmp = flowplan.getOnhand();",
  "  }",
  "  // Found no flowplan: either we have specified a date later than the",
  "  // last flowplan, either there are no flowplans at all.",
  "  return tmp;",
  "}",
  "",
  "double Buffer::getOnHand(Date d1, Date d2, bool min, bool use_safetystock,",
  "                         bool include_proposed_po) const {",
  "  // Swap parameters if required",
  "  if (d2 < d1) swap(d1, d2);",
  "",
  "  // Loop through all flowplans",
  "  double tmp(0.0), record(0.0), safetystock(0.0), proposed_po(0.0);",
  "  Date d, prev_Date;",
  "  for (auto oo = flowplans.begin(); true; ++oo) {",
  "    if (oo == flowplans.end() || oo->getDate() > d) {",
  "      // Date has now changed or we have arrived at the end",
  "",
  "      if (prev_Date <= d1)",
  "        // Not in active Date range: we simply follow the onhand profile",
  "        record = tmp;",
  "      else {",
  "        // In the active range: check if new record",
  "        if (prev_Date > d2) return record;",
  "        if (min) {",
  "          if (tmp < record) record = tmp;",
  "        } else {",
  "          if (tmp > record) record = tmp;",
  "        }",
  "      }",
  "",
  "      // Are we done now?",
  "      if (prev_Date > d2 || oo == flowplans.end()) return record;",
  "      d = oo->getDate();",
  "    }",
  "    // new safety stock value",
  "    if (use_safetystock && oo->getEventType() == 3) safetystock = oo->getMin();",
  "",
  "    // Proposed purchase orders special case",
  "    if (oo != flowplans.end()) {",
  "      auto opplan = oo->getOperationPlan();",
  "      if (opplan && oo->getQuantity() > 0.0 && opplan->getProposed() &&",
  "          opplan->getOperation()->hasType<OperationItemSupplier>())",
  "        proposed_po += oo->getQuantity();",
  "    }",
  "",
  "    tmp = oo->getOnhand() - (use_safetystock ? safetystock : 0);",
  "    if (!include_proposed_po) tmp -= proposed_po;",
  "    prev_Date = oo->getDate();",
  "  }",
  "  // The above for-loop controls the exit. This line of code is never reached.",
  "  throw LogicException(\"Unreachable code reached\");",
  "}",
  "",
  "void Buffer::setMinimum(double m) {",
  "  // There is already a minimum calendar.",
  "  if (min_cal) {",
  "    // We update the field, but don't use it yet.",
  "    min_val = m;",
  "    return;",
  "  }",
  "",
  "  // Mark as changed",
  "  setChanged();",
  "",
  "  // Set field",
  "  min_val = m;",
  "",
  "  // Create or update a single timeline min event",
  "  for (auto& flowplan : flowplans)",
  "    if (flowplan.getEventType() == 3) {",
  "      // Update existing event",
  "      static_cast<flowplanlist::EventMinQuantity*>(&flowplan)->setMin(",
  "          max(min_val, 0.0));",
  "      return;",
  "    }",
  "",
  "  // Create new event",
  "  auto newEvent = new flowplanlist::EventMinQuantity(",
  "      Plan::instance().getCurrent(), &flowplans, max(min_val, 0.0));",
  "  flowplans.insert(newEvent);",
  "}",
  "",
  "void Buffer::setMinimumCalendar(Calendar* cal) {",
  "  // Resetting the same calendar",
  "  if (min_cal == cal) return;",
  "",
  "  // Mark as changed",
  "  setChanged();",
  "",
  "  // Delete previous events.",
  "  for (auto oo = flowplans.begin(); oo != flowplans.end();) {",
  "    flowplanlist::Event* tmp = &*oo;",
  "    ++oo;",
  "    if (tmp->getEventType() == 3) {",
  "      flowplans.erase(tmp);",
  "      delete tmp;",
  "    }",
  "  }",
  "",
  "  // Null pointer passed. Change back to time independent min.",
  "  if (!cal) {",
  "    min_cal = nullptr;",
  "    setMinimum(min_val);",
  "    return;",
  "  }",
  "",
  "  // Create timeline structures for every event. A new entry is created only",
  "  // when the value changes.",
  "  min_cal = cal;",
  "  double curMin = 0.0;",
  "  for (Calendar::EventIterator x(min_cal); x.getDate() < Date::infiniteFuture;",
  "       ++x)",
  "    if (curMin != max(x.getValue(), 0.0)) {",
  "      curMin = max(x.getValue(), 0.0);",
  "      auto* newBucket =",
  "          new flowplanlist::EventMinQuantity(x.getDate(), &flowplans, curMin);",
  "      flowplans.insert(newBucket);",
  "    }",
  "  min_cal->clearEventList();",
  "}",
  "",
  "void Buffer::setMaximum(double m) {",
  "  // There is already a maximum calendar.",
  "  if (max_cal) {",
  "    // We update the field, but don't use it yet.",
  "    max_val = m;",
  "    return;",
  "  }",
  "",
  "  // Mark as changed",
  "  setChanged();",
  "",
  "  // Set field",
  "  max_val = m;",
  "",
  "  // Create or update a single timeline max event",
  "  for (auto oo = flowplans.begin(); oo != flowplans.end(); oo++)",
  "    if (oo->getEventType() == 4) {",
  "      if (max_val > ROUNDING_ERROR) {",
  "        // Update existing event",
  "        static_cast<flowplanlist::EventMaxQuantity*>(&*oo)->setMax(max_val);",
  "      } else {",
  "        // Delete existing event",
  "        flowplans.erase(&(*oo));",
  "        delete &(*(oo++));",
  "      }",
  "      return;",
  "    }",
  "  // Create new event",
  "  if (max_val > ROUNDING_ERROR) {",
  "    auto newEvent = new flowplanlist::EventMaxQuantity(",
  "        Plan::instance().getCurrent(), &flowplans, max_val);",
  "    flowplans.insert(newEvent);",
  "  }",
  "}",
  "",
  "void Buffer::setMaximumCalendar(Calendar* cal) {",
  "  // Resetting the same calendar",
  "  if (max_cal == cal) return;",
  "",
  "  // Mark as changed",
  "  setChanged();",
  "",
  "  // Delete previous events.",
  "  for (auto oo = flowplans.begin(); oo != flowplans.end();)",
  "    if (oo->getEventType() == 4) {",
  "      flowplans.erase(&(*oo));",
  "      delete &(*(oo++));",
  "    } else",
  "      ++oo;",
  "",
  "  // Null pointer passed. Change back to time independent max.",
  "  if (!cal) {",
  "    setMaximum(max_val);",
  "    return;",
  "  }",
  "",
  "  // Create timeline structures for every bucket. A new entry is created only",
  "  // when the value changes.",
  "  max_cal = cal;",
  "  double curMax = 0.0;",
  "  for (Calendar::EventIterator x(max_cal); x.getDate() < Date::infiniteFuture;",
  "       ++x)",
  "    if (curMax != x.getValue()) {",
  "      curMax = x.getValue();",
  "      auto* newBucket =",
  "          new flowplanlist::EventMaxQuantity(x.getDate(), &flowplans, curMax);",
  "      flowplans.insert(newBucket);",
  "    }",
  "  max_cal->clearEventList();",
  "}",
  "",
  "void Buffer::deleteOperationPlans(bool deleteLocked) {",
  "  // Delete the operationplans",
  "  for (auto& flow : flows)",
  "    OperationPlan::deleteOperationPlans(flow.getOperation(), deleteLocked);",
  "",
  "  // Mark to recompute the problems",
  "  setChanged();",
  "}",
  "",
  "Buffer::~Buffer() {",
  "  // Delete all operationplans.",
  "  // An alternative logic would be to delete only the flowplans for this",
  "  // buffer and leave the rest of the plan untouched. The currently",
  "  // implemented method is way more drastic...",
  "  deleteOperationPlans(true);",
  "",
  "  // The Flow objects are automatically deleted by the destructor of the",
  "  // Association list class.",
  "",
  "  // Unlink from the item",
  "  if (it) {",
  "    if (it->firstItemBuffer == this)",
  "      it->firstItemBuffer = nextItemBuffer;",
  "    else {",
  "      Buffer* buf = it->firstItemBuffer;",
  "      while (buf && buf->nextItemBuffer != this) buf = buf->nextItemBuffer;",
  "      if (!buf)",
  "        logger << \"Error: Corrupted buffer list for an item\\n\";",
  "      else",
  "        buf->nextItemBuffer = nextItemBuffer;",
  "    }",
  "  }",
  "",
  "  // Remove the inventory operation",
  "  Operation* invoper = Operation::find(\"Inventory \" + string(getName()));",
  "  if (invoper) delete invoper;",
  "",
  "  // Problems are automatically deleted by the HasProblem class.",
  "  // Constraints need to be cleared explicitly.",
  "  Problem::clearConstraints(*this);",
  "}",
  "",
  "void Buffer::followPegging(PeggingIterator& iter, FlowPlan* curflowplan,",
  "                           double qty, double offset, short lvl) {",
  "  if (!curflowplan->getOperationPlan()->getQuantity() ||",
  "      curflowplan->getBuffer()->getTool())",
  "    // Flowplans with quantity 0 have no pegging.",
  "    // Flowplans for buffers representing tools have no pegging either.",
  "    return;",
  "",
  "  // Did we reach the maximum depth we want to visit",
  "  if (iter.getMaxLevel() != -1 && lvl > iter.getMaxLevel()) return;",
  "",
  "  if (curflowplan->getBuffer()->hasType<BufferInfinite>() &&",
  "      ((curflowplan->getQuantity() < 0 && !iter.isDownstream()) ||",
  "       (curflowplan->getQuantity() > 0 && iter.isDownstream())))",
  "    // No pegging across infinite buffers",
  "    return;",
  "",
  "  Buffer::flowplanlist::iterator f = getFlowPlans().begin(curflowplan);",
  "  if (curflowplan->getQuantity() < -ROUNDING_ERROR && !iter.isDownstream()) {",
  "    // CASE 1:",
  "    // This is a flowplan consuming from a buffer. Navigating upstream means",
  "    // finding the flowplans producing this consumed material.",
  "    double scale = -curflowplan->getQuantity() /",
  "                   curflowplan->getOperationPlan()->getQuantity();",
  "    double startQty =",
  "        f->getCumulativeConsumed() + f->getQuantity() + offset * scale;",
  "    double endQty = startQty + qty * scale;",
  "    if (f->getCumulativeProduced() <= startQty + ROUNDING_ERROR) {",
  "      // CASE 1A: Not produced enough yet: move forward",
  "      while (f != getFlowPlans().end() &&",
  "             f->getCumulativeProduced() <= startQty)",
  "        ++f;",
  "      while (f != getFlowPlans().end() &&",
  "             ((f->getQuantity() <= 0 && f->getCumulativeProduced() < endQty) ||",
  "              (f->getQuantity() > 0 &&",
  "               f->getCumulativeProduced() - f->getQuantity() < endQty))) {",
  "        if (f->getQuantity() > ROUNDING_ERROR) {",
  "          double newqty = f->getQuantity();",
  "          double newoffset = 0.0;",
  "          if (f->getCumulativeProduced() - f->getQuantity() < startQty) {",
  "            newoffset =",
  "                startQty - (f->getCumulativeProduced() - f->getQuantity());",
  "            newqty -= newoffset;",
  "          }",
  "          if (f->getCumulativeProduced() > endQty)",
  "            newqty -= f->getCumulativeProduced() - endQty;",
  "          OperationPlan* opplan =",
  "              dynamic_cast<const FlowPlan*>(&(*f))->getOperationPlan();",
  "          OperationPlan* topopplan = opplan->getTopOwner();",
  "          if (topopplan->getOperation()->hasType<OperationSplit>() ||",
  "              (iter.getMaxLevel() > 0)) {",
  "            if (opplan->getOwner() &&",
  "                opplan->getOwner()",
  "                    ->getOperation()",
  "                    ->hasType<OperationRouting>() &&",
  "                !(iter.getMaxLevel() > 0))",
  "              topopplan = opplan->getOwner();",
  "            else",
  "              topopplan = opplan;",
  "          }",
  "          iter.updateStack(",
  "              topopplan, topopplan->getQuantity() * newqty / f->getQuantity(),",
  "              topopplan->getQuantity() * newoffset / f->getQuantity(), lvl,",
  "              curflowplan->getDate() - f->getDate());",
  "        }",
  "        ++f;",
  "      }",
  "    } else {",
  "      // CASE 1B: Produced too much already: move backward",
  "      while (f != getFlowPlans().end() &&",
  "             ((f->getQuantity() <= 0 && f->getCumulativeProduced() > endQty) ||",
  "              (f->getQuantity() > 0 &&",
  "               f->getCumulativeProduced() - f->getQuantity() > endQty)))",
  "        --f;",
  "      while (f != getFlowPlans().end() &&",
  "             f->getCumulativeProduced() > startQty) {",
  "        if (f->getQuantity() > ROUNDING_ERROR) {",
  "          double newqty = f->getQuantity();",
  "          double newoffset = 0.0;",
  "          if (f->getCumulativeProduced() - f->getQuantity() < startQty) {",
  "            newoffset =",
  "                startQty - (f->getCumulativeProduced() - f->getQuantity());",
  "            newqty -= newoffset;",
  "          }",
  "          if (f->getCumulativeProduced() > endQty)",
  "            newqty -= f->getCumulativeProduced() - endQty;",
  "          OperationPlan* opplan =",
  "              dynamic_cast<FlowPlan*>(&(*f))->getOperationPlan();",
  "          OperationPlan* topopplan = opplan->getTopOwner();",
  "          if (topopplan->getOperation()->hasType<OperationSplit>() ||",
  "              (iter.getMaxLevel() > 0)) {",
  "            if (opplan->getOwner() &&",
  "                opplan->getOwner()",
  "                    ->getOperation()",
  "                    ->hasType<OperationRouting>() &&",
  "                !(iter.getMaxLevel() > 0)) {",
  "              topopplan = opplan->getOwner();",
  "            } else",
  "              topopplan = opplan;",
  "          }",
  "          iter.updateStack(",
  "              topopplan, topopplan->getQuantity() * newqty / f->getQuantity(),",
  "              topopplan->getQuantity() * newoffset / f->getQuantity(), lvl,",
  "              curflowplan->getDate() - f->getDate());",
  "        }",
  "        --f;",
  "      }",
  "    }",
  "    return;",
  "  }",
  "",
  "  if (curflowplan->getQuantity() > ROUNDING_ERROR && iter.isDownstream()) {",
  "    // CASE 2:",
  "    // This is a flowplan producing in a buffer. Navigating downstream means",
  "    // finding the flowplans consuming this produced material.",
  "    double scale = curflowplan->getQuantity() /",
  "                   curflowplan->getOperationPlan()->getQuantity();",
  "    double startQty =",
  "        f->getCumulativeProduced() - f->getQuantity() + offset * scale;",
  "    double endQty = startQty + qty * scale;",
  "    if ((f->getQuantity() <= 0 &&",
  "         f->getCumulativeConsumed() + f->getQuantity() < endQty) ||",
  "        (f->getQuantity() > 0 && f->getCumulativeConsumed() < endQty &&",
  "         f->getQuantity() <= f->getOnhand())) {",
  "      // CASE 2A: Not consumed enough yet: move forward",
  "      while (f != getFlowPlans().end() &&",
  "             f->getCumulativeConsumed() <= startQty)",
  "        ++f;",
  "      while (f != getFlowPlans().end() &&",
  "             ((f->getQuantity() <= 0 &&",
  "               f->getCumulativeConsumed() + f->getQuantity() < endQty) ||",
  "              (f->getQuantity() > 0 && f->getCumulativeConsumed() < endQty))) {",
  "        if (f->getQuantity() < -ROUNDING_ERROR) {",
  "          double newqty = -f->getQuantity();",
  "          double newoffset = 0.0;",
  "          if (f->getCumulativeConsumed() + f->getQuantity() < startQty) {",
  "            newoffset =",
  "                startQty - (f->getCumulativeConsumed() + f->getQuantity());",
  "            newqty -= newoffset;",
  "          }",
  "          if (f->getCumulativeConsumed() > endQty)",
  "            newqty -= f->getCumulativeConsumed() - endQty;",
  "          OperationPlan* opplan =",
  "              dynamic_cast<FlowPlan*>(&(*f))->getOperationPlan();",
  "          OperationPlan* topopplan = opplan->getTopOwner();",
  "          if (topopplan->getOperation()->hasType<OperationSplit>() ||",
  "              (iter.getMaxLevel() > 0)) {",
  "            if (opplan->getOwner() && opplan->getOwner()",
  "                                          ->getOperation()",
  "                                          ->hasType<OperationRouting>()) {",
  "              for (OperationPlan::iterator j(opplan->getOwner());",
  "                   j != OperationPlan::end(); ++j) {",
  "                if (j->getReference() == opplan->getReference())",
  "                  topopplan = opplan->getOwner();",
  "                else",
  "                  topopplan = opplan;",
  "                break;",
  "              }",
  "",
  "            } else",
  "              topopplan = opplan;",
  "          }",
  "          iter.updateStack(",
  "              topopplan, -topopplan->getQuantity() * newqty / f->getQuantity(),",
  "              -topopplan->getQuantity() * newoffset / f->getQuantity(), lvl,",
  "              f->getDate() - curflowplan->getDate());",
  "        }",
  "        ++f;",
  "      }",
  "    } else {",
  "      // CASE 2B: Consumed too much already: move backward",
  "      bool skip = false;",
  "      while (f != getFlowPlans().end() &&",
  "             ((f->getQuantity() <= 0 &&",
  "               f->getCumulativeConsumed() + f->getQuantity() < endQty) ||",
  "              (f->getQuantity() > 0 && f->getCumulativeConsumed() < endQty))) {",
  "        ++f;",
  "        skip = true;",
  "        if (f == getFlowPlans().end()) {",
  "          f = getFlowPlans().rbegin();",
  "          break;",
  "        }",
  "      }",
  "      if (!skip)",
  "        while (f != getFlowPlans().end() &&",
  "               ((f->getQuantity() <= 0 &&",
  "                 f->getCumulativeConsumed() + f->getQuantity() < endQty) ||",
  "                (f->getQuantity() > 0 && f->getCumulativeConsumed() < endQty &&",
  "                 !(f->getCumulativeConsumed() >",
  "                   f->getCumulativeProduced() - f->getQuantity()))))",
  "          --f;",
  "      while (f != getFlowPlans().end() &&",
  "             f->getCumulativeConsumed() > startQty) {",
  "        if (f->getQuantity() < -ROUNDING_ERROR) {",
  "          double newqty = -f->getQuantity();",
  "          double newoffset = 0.0;",
  "          if (f->getCumulativeConsumed() + f->getQuantity() < startQty)",
  "            newqty -=",
  "                startQty - (f->getCumulativeConsumed() + f->getQuantity());",
  "          if (f->getCumulativeConsumed() > endQty)",
  "            newqty -= f->getCumulativeConsumed() - endQty;",
  "          auto opplan = dynamic_cast<FlowPlan*>(&(*f))->getOperationPlan();",
  "          OperationPlan* topopplan = opplan->getTopOwner();",
  "          if (topopplan->getOperation()->hasType<OperationSplit>() ||",
  "              (iter.getMaxLevel() > 0)) {",
  "            if (opplan->getOwner() && opplan->getOwner()",
  "                                          ->getOperation()",
  "                                          ->hasType<OperationRouting>()) {",
  "              for (OperationPlan::iterator j(opplan->getOwner());",
  "                   j != OperationPlan::end(); ++j) {",
  "                if (j->getReference() == opplan->getReference())",
  "                  topopplan = opplan->getOwner();",
  "                else",
  "                  topopplan = opplan;",
  "                break;",
  "              }",
  "            } else",
  "              topopplan = opplan;",
  "          }",
  "          iter.updateStack(",
  "              topopplan, -topopplan->getQuantity() * newqty / f->getQuantity(),",
  "              -topopplan->getQuantity() * newoffset / f->getQuantity(), lvl,",
  "              f->getDate() - curflowplan->getDate());",
  "        }",
  "        --f;",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "Buffer* Buffer::findOrCreate(Item* itm, Location* loc) {",
  "  if (!itm || !loc) return nullptr;",
  "",
  "  // Return existing buffer if it exists",
  "  Item::bufferIterator buf_iter(itm);",
  "  while (Buffer* tmpbuf = buf_iter.next()) {",
  "    if (tmpbuf->getLocation() == loc && !tmpbuf->getBatch()) return tmpbuf;",
  "  }",
  "",
  "  // Create a new buffer with a unique name",
  "  stringstream o;",
  "  o << itm->getName() << \" @ \" << loc->getName();",
  "  Buffer* b;",
  "  while ((b = find(o.str()))) o << '*';",
  "  b = new BufferDefault();",
  "  b->setItem(itm);",
  "  b->setLocation(loc);",
  "  b->setName(o.str());",
  "  return b;",
  "}",
  "",
  "Buffer* Buffer::findOrCreate(Item* itm, Location* loc,",
  "                             const PooledString& batch) {",
  "  if (!itm || !loc) return nullptr;",
  "",
  "  // Return existing buffer if it exists",
  "  Buffer* generic = nullptr;",
  "  Item::bufferIterator buf_iter(itm);",
  "  while (Buffer* tmpbuf = buf_iter.next()) {",
  "    if (tmpbuf->getLocation() == loc) {",
  "      if (tmpbuf->getBatch() == batch)",
  "        return tmpbuf;",
  "      else if (!tmpbuf->getBatch())",
  "        generic = tmpbuf;",
  "    }",
  "  }",
  "",
  "  // Create a new buffer with a unique name",
  "  stringstream o;",
  "  o << itm->getName();",
  "  if (batch && itm->hasType<ItemMTO>()) o << \" @ \" << batch;",
  "  o << \" @ \" << loc->getName();",
  "  Buffer* b = find(o.str());",
  "  if (!b) {",
  "    b = new BufferDefault();",
  "    b->setName(o.str());",
  "  }",
  "  b->setItem(itm, !batch && !itm->hasType<ItemMTO>());",
  "  b->setLocation(loc, !batch && !itm->hasType<ItemMTO>());",
  "  if (batch && itm->hasType<ItemMTO>()) {",
  "    b->setBatch(batch);",
  "    if (generic) b->copyLevelAndCluster(generic);",
  "  }",
  "  return b;",
  "}",
  "",
  "bool Buffer::hasConsumingFlows() const {",
  "  for (const auto& fl : getFlows())",
  "    if (fl.isConsumer()) return true;",
  "  return false;",
  "}",
  "",
  "void Buffer::buildProducingOperation() {",
  "  if (producing_operation && producing_operation != uninitializedProducing &&",
  "      !producing_operation->getHidden())",
  "    // Leave manually specified producing operations alone",
  "    return;",
  "",
  "  // Loop over this item and all its parent items",
  "  Item* item = getItem();",
  "  while (item) {",
  "    // Loop over all suppliers of this item+location combination",
  "    Item::supplierlist::const_iterator supitem_iter =",
  "        item->getSupplierIterator();",
  "    while (ItemSupplier* supitem = supitem_iter.next()) {",
  "      if (supitem->getPriority() == 0) continue;",
  "",
  "      // Verify whether the ItemSupplier is applicable to the buffer location",
  "      // We need to reject the following 2 mismatches:",
  "      //   - buffer location is not null, and is not the ItemSupplier location",
  "      //   - buffer location is null, and the ItemSupplier location isn't",
  "      if (supitem->getLocation()) {",
  "        if ((getLocation() && getLocation() != supitem->getLocation()) ||",
  "            !getLocation())",
  "          continue;",
  "      }",
  "",
  "      // Check if there is already a producing operation referencing this",
  "      // ItemSupplier",
  "      if (producing_operation &&",
  "          producing_operation != uninitializedProducing) {",
  "        if (producing_operation->hasType<OperationItemSupplier>()) {",
  "          auto* o = static_cast<OperationItemSupplier*>(producing_operation);",
  "          if (o->getItemSupplier() == supitem)",
  "            // Already exists",
  "            continue;",
  "        } else {",
  "          bool exists = false;",
  "          SubOperation::iterator subiter(",
  "              producing_operation->getSubOperations());",
  "          while (SubOperation* o = subiter.next())",
  "            if (o->getOperation()->hasType<OperationItemSupplier>()) {",
  "              auto* s = static_cast<OperationItemSupplier*>(o->getOperation());",
  "              if (s->getItemSupplier() == supitem) {",
  "                // Already exists",
  "                exists = true;",
  "                break;",
  "              }",
  "            }",
  "          if (exists) continue;",
  "        }",
  "      }",
  "",
  "      // New operation needs to be created",
  "      OperationItemSupplier* oper =",
  "          OperationItemSupplier::findOrCreate(supitem, this);",
  "",
  "      // Merge the new operation in an alternate operation if required",
  "      if (producing_operation &&",
  "          producing_operation != uninitializedProducing) {",
  "        // We're not the first",
  "        auto* subop = new SubOperation();",
  "        subop->setOperation(oper);",
  "        subop->setPriority(supitem->getPriority());",
  "        subop->setEffective(supitem->getEffective());",
  "        if (!producing_operation->hasType<OperationAlternate>()) {",
  "          // We are the second: create an alternate and add 2 suboperations",
  "          auto* superop = new OperationAlternate();",
  "          stringstream o;",
  "          o << \"Replenish \" << getName();",
  "          superop->setName(o.str());",
  "          superop->setHidden(true);",
  "          if (oper->getSearch() != SearchMode::PRIORITY)",
  "            superop->setSearch(oper->getSearch());",
  "          auto* subop2 = new SubOperation();",
  "          subop2->setOperation(producing_operation);",
  "          // Note that priority and effectivity are at default values.",
  "          // If not, the alternate would already have been created.",
  "          subop2->setOwner(superop);",
  "          producing_operation = superop;",
  "          subop->setOwner(producing_operation);",
  "        } else {",
  "          // We are third or later: just add a suboperation",
  "          if (producing_operation->getSubOperations().size() > 100) {",
  "            new ProblemInvalidData(",
  "                this,",
  "                string(\"Excessive replenishments defined for '\") + getName() +",
  "                    \"'\",",
  "                \"material\", Date::infinitePast, Date::infiniteFuture);",
  "            return;",
  "          } else {",
  "            subop->setOwner(producing_operation);",
  "            if (oper->getSearch() != SearchMode::PRIORITY)",
  "              producing_operation->setSearch(oper->getSearch());",
  "          }",
  "        }",
  "      } else {",
  "        // We are the first: only create an operationItemSupplier instance",
  "        if (supitem->getEffective() == DateRange() &&",
  "            supitem->getPriority() == 1 &&",
  "            oper->getSearch() == SearchMode::PRIORITY)",
  "          // Use a single operation. If an alternate is required later on",
  "          // we know it has the default priority, serach mode and effectivity.",
  "          producing_operation = oper;",
  "        else {",
  "          // Already create an alternate now",
  "          auto* superop = new OperationAlternate();",
  "          producing_operation = superop;",
  "          stringstream o;",
  "          o << \"Replenish \" << getName();",
  "          superop->setName(o.str());",
  "          superop->setHidden(true);",
  "          if (oper->getSearch() != SearchMode::PRIORITY)",
  "            superop->setSearch(oper->getSearch());",
  "          auto* subop = new SubOperation();",
  "          subop->setOperation(oper);",
  "          subop->setPriority(supitem->getPriority());",
  "          subop->setEffective(supitem->getEffective());",
  "          subop->setOwner(superop);",
  "        }",
  "      }",
  "    }  // End loop over itemsuppliers",
  "",
  "    // Loop over all item distributions to replenish this item+location",
  "    // combination",
  "    auto itemdist_iter = item->getDistributionIterator();",
  "    while (ItemDistribution* itemdist = itemdist_iter.next()) {",
  "      if (itemdist->getPriority() == 0) continue;",
  "",
  "      // Verify whether the ItemDistribution is applicable to the buffer",
  "      // location We need to reject the following 2 mismatches:",
  "      //   - buffer location is not null, and is the ItemDistribution",
  "      //   destination location",
  "      //   - buffer location is null, and the ItemDistribution destination",
  "      //   location isn't",
  "      if (getLocation() == itemdist->getOrigin()) continue;",
  "      if (itemdist->getDestination()) {",
  "        if ((getLocation() && getLocation() != itemdist->getDestination()) ||",
  "            !getLocation())",
  "          continue;",
  "      }",
  "      if (!itemdist->getOrigin()) continue;",
  "",
  "      // Check if there is already a producing operation referencing this",
  "      // ItemDistribution",
  "      if (producing_operation &&",
  "          producing_operation != uninitializedProducing) {",
  "        if (producing_operation->hasType<OperationItemDistribution>()) {",
  "          auto* o =",
  "              static_cast<OperationItemDistribution*>(producing_operation);",
  "          if (o->getItemDistribution() == itemdist)",
  "            // Already exists",
  "            continue;",
  "        } else {",
  "          bool exists = false;",
  "          SubOperation::iterator subiter(",
  "              producing_operation->getSubOperations());",
  "          while (SubOperation* o = subiter.next())",
  "            if (o->getOperation()->hasType<OperationItemDistribution>()) {",
  "              auto* s =",
  "                  static_cast<OperationItemDistribution*>(o->getOperation());",
  "              if (s->getItemDistribution() == itemdist) {",
  "                // Already exists",
  "                exists = true;",
  "                break;",
  "              }",
  "            }",
  "          if (exists) continue;",
  "        }",
  "      }",
  "",
  "      // New operation needs to be created",
  "      Buffer* originbuf = findOrCreate(getItem(), &*itemdist->getOrigin());",
  "      Operation* oper =",
  "          OperationItemDistribution::findOrCreate(itemdist, originbuf, this);",
  "",
  "      // Merge the new operation in an alternate operation if required",
  "      if (producing_operation &&",
  "          producing_operation != uninitializedProducing) {",
  "        // We're not the first",
  "        auto* subop = new SubOperation();",
  "        subop->setOperation(oper);",
  "        subop->setPriority(itemdist->getPriority());",
  "        subop->setEffective(itemdist->getEffective());",
  "        if (!producing_operation->hasType<OperationAlternate>()) {",
  "          // We are the second: create an alternate and add 2 suboperations",
  "          auto* superop = new OperationAlternate();",
  "          stringstream o;",
  "          o << \"Replenish \" << getName();",
  "          superop->setName(o.str());",
  "          superop->setHidden(true);",
  "          if (oper->getSearch() != SearchMode::PRIORITY)",
  "            superop->setSearch(oper->getSearch());",
  "          auto* subop2 = new SubOperation();",
  "          subop2->setOperation(producing_operation);",
  "          // Note that priority and effectivity are at default values.",
  "          // If not, the alternate would already have been created.",
  "          subop2->setOwner(superop);",
  "          producing_operation = superop;",
  "          subop->setOwner(producing_operation);",
  "        } else {",
  "          // We are third or later: just add a suboperation",
  "          if (producing_operation->getSubOperations().size() > 100) {",
  "            new ProblemInvalidData(",
  "                this,",
  "                string(\"Excessive replenishments defined for '\") + getName() +",
  "                    \"'\",",
  "                \"material\", Date::infinitePast, Date::infiniteFuture);",
  "            return;",
  "          } else {",
  "            subop->setOwner(producing_operation);",
  "            if (oper->getSearch() != SearchMode::PRIORITY)",
  "              producing_operation->setSearch(oper->getSearch());",
  "          }",
  "        }",
  "      } else {",
  "        // We are the first: only create an OperationItemDistribution instance",
  "        if (itemdist->getEffective() == DateRange() &&",
  "            itemdist->getPriority() == 1 &&",
  "            oper->getSearch() == SearchMode::PRIORITY)",
  "          // Use a single operation. If an alternate is required later on",
  "          // we know it has the default priority, search mode and effectivity.",
  "          producing_operation = oper;",
  "        else {",
  "          // Already create an alternate now",
  "          auto* superop = new OperationAlternate();",
  "          producing_operation = superop;",
  "          stringstream o;",
  "          o << \"Replenish \" << getName();",
  "          superop->setName(o.str());",
  "          superop->setHidden(true);",
  "          if (oper->getSearch() != SearchMode::PRIORITY)",
  "            superop->setSearch(oper->getSearch());",
  "          auto* subop = new SubOperation();",
  "          subop->setOperation(oper);",
  "          subop->setPriority(itemdist->getPriority());",
  "          subop->setEffective(itemdist->getEffective());",
  "          subop->setOwner(superop);",
  "        }",
  "      }",
  "",
  "    }  // End loop over itemdistributions",
  "",
  "    // While-loop to add suppliers defined at parent items",
  "    item = item->getOwner();",
  "  }",
  "",
  "  // Loop over all item operations to replenish this item+location combination",
  "  if (getItem()) {",
  "    Item::operationIterator itemoper_iter = getItem()->getOperationIterator();",
  "    while (Operation* itemoper = itemoper_iter.next()) {",
  "      if (itemoper->getPriority() == 0) continue;",
  "",
  "      // Verify whether the operation is applicable to the buffer",
  "      Location* l = itemoper->getLocation();",
  "      for (auto flow_iter = itemoper->getFlowIterator();",
  "           flow_iter != itemoper->getFlows().end(); ++flow_iter)",
  "        if (flow_iter->getItem() == getItem() && flow_iter->getLocation() &&",
  "            flow_iter->isProducer()) {",
  "          l = flow_iter->getLocation();",
  "          break;",
  "        }",
  "      if (l && l != getLocation()) continue;",
  "",
  "      // Make sure a producing flow record exists",
  "      correctProducingFlow(itemoper);",
  "",
  "      // Check if there is already a producing operation referencing this",
  "      // operation",
  "      if (producing_operation &&",
  "          producing_operation != uninitializedProducing) {",
  "        if (!producing_operation->hasType<OperationAlternate>()) {",
  "          if (producing_operation == itemoper)",
  "            // Already exists",
  "            continue;",
  "        } else {",
  "          SubOperation::iterator subiter(",
  "              producing_operation->getSubOperations());",
  "          while (SubOperation* o = subiter.next())",
  "            if (o->getOperation() == itemoper)",
  "              // Already exists",
  "              continue;",
  "        }",
  "      }",
  "",
  "      // Merge the new operation in an alternate operation if required",
  "      if (producing_operation &&",
  "          producing_operation != uninitializedProducing) {",
  "        // We're not the first",
  "        auto* subop = new SubOperation();",
  "        subop->setOperation(itemoper);",
  "        subop->setPriority(itemoper->getPriority());",
  "        subop->setEffective(itemoper->getEffective());",
  "        if (!producing_operation->hasType<OperationAlternate>()) {",
  "          // We are the second: create an alternate and add 2 suboperations",
  "          auto* superop = new OperationAlternate();",
  "          stringstream o;",
  "          o << \"Replenish \" << getName();",
  "          superop->setName(o.str());",
  "          superop->setHidden(true);",
  "          if (itemoper->getSearch() != SearchMode::PRIORITY)",
  "            superop->setSearch(itemoper->getSearch());",
  "          auto* subop2 = new SubOperation();",
  "          subop2->setOperation(producing_operation);",
  "          // Note that priority and effectivity are at default values.",
  "          // If not, the alternate would already have been created.",
  "          subop2->setOwner(superop);",
  "          producing_operation = superop;",
  "          subop->setOwner(producing_operation);",
  "        } else {",
  "          // We are third or later: just add a suboperation",
  "          if (producing_operation->getSubOperations().size() > 100) {",
  "            new ProblemInvalidData(",
  "                this,",
  "                string(\"Excessive replenishments defined for '\") + getName() +",
  "                    \"'\",",
  "                \"material\", Date::infinitePast, Date::infiniteFuture);",
  "            return;",
  "          } else {",
  "            subop->setOwner(producing_operation);",
  "            if (itemoper->getSearch() != SearchMode::PRIORITY)",
  "              producing_operation->setSearch(itemoper->getSearch());",
  "          }",
  "        }",
  "      } else {",
  "        // We are the first",
  "        if (itemoper->getEffective() == DateRange() &&",
  "            itemoper->getPriority() == 1 &&",
  "            (itemoper->getSearch() == SearchMode::PRIORITY ||",
  "             itemoper->hasType<OperationAlternate>()))",
  "          // Use a single operation. If an alternate is required later on",
  "          // we know it has the default priority, search mode and effectivity.",
  "          producing_operation = itemoper;",
  "        else {",
  "          // Already create an alternate now",
  "          auto* superop = new OperationAlternate();",
  "          producing_operation = superop;",
  "          stringstream o;",
  "          o << \"Replenish \" << getName();",
  "          superop->setName(o.str());",
  "          superop->setHidden(true);",
  "          if (itemoper->getSearch() != SearchMode::PRIORITY)",
  "            superop->setSearch(itemoper->getSearch());",
  "          auto* subop = new SubOperation();",
  "          subop->setOperation(itemoper);",
  "          subop->setPriority(itemoper->getPriority());",
  "          subop->setEffective(itemoper->getEffective());",
  "          subop->setOwner(superop);",
  "        }",
  "      }",
  "    }  // End loop over operations",
  "  }",
  "",
  "  // Last resort: check if there are already operations producing in this",
  "  // buffer. If there exists only 1 we use that operation. Inventory operation",
  "  // or operations with 0 priority are skipped.",
  "  if (producing_operation == uninitializedProducing) {",
  "    const Flow* found = nullptr;",
  "    for (const auto& tmp : getFlows()) {",
  "      if (tmp.getQuantity() > 0 &&",
  "          !tmp.getOperation()->hasType<OperationInventory>() &&",
  "          tmp.getOperation()->getPriority()) {",
  "        if (found) {",
  "          // Found a second operation producing this item. Abort the mission...",
  "          found = nullptr;",
  "          break;",
  "        } else",
  "          // Found a first operation producing this item",
  "          found = &tmp;",
  "      }",
  "    }",
  "    if (found) producing_operation = found->getOperation();",
  "  }",
  "",
  "  if (producing_operation == uninitializedProducing) {",
  "    // No producer could be generated. No replenishment will be possible.",
  "    new ProblemInvalidData(",
  "        this, string(\"No replenishment defined for '\") + getName() + \"'\",",
  "        \"material\", Date::infinitePast, Date::infiniteFuture);",
  "    producing_operation = nullptr;",
  "  } else {",
  "    // Remove eventual existing problem on the buffer",
  "    for (auto j = Problem::begin(this, false); j != Problem::end(); ++j) {",
  "      if (typeid(*j) == typeid(ProblemInvalidData)) {",
  "        delete &*j;",
  "        break;",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "void Buffer::correctProducingFlow(Operation* itemoper) {",
  "  // if operation is of type routing or alternate or split then look if flow",
  "  // exists at parent level",
  "  if (itemoper",
  "          ->hasType<OperationRouting, OperationAlternate, OperationSplit>()) {",
  "    // check if routing has a flow into the buffer",
  "    for (auto flow_iter = itemoper->getFlowIterator();",
  "         flow_iter != itemoper->getFlows().end(); ++flow_iter)",
  "      if (flow_iter->getItem() == getItem() &&",
  "          (!flow_iter->getLocation() ||",
  "           flow_iter->getLocation() == getLocation()))",
  "        // Flow for this item exists, nothing to do",
  "        return;",
  "  }",
  "",
  "  // Operation is of type routing, check if any step is producing into this",
  "  // buffer",
  "  if (itemoper->hasType<OperationRouting>()) {",
  "    // a first loop to look for the max priority to get the last step",
  "    auto subs = itemoper->getSubOperationIterator();",
  "    SubOperation* lastStep = nullptr;",
  "    while (SubOperation* sub = subs.next()) {",
  "      auto flow_iter = sub->getOperation()->getFlowIterator();",
  "      while (flow_iter != sub->getOperation()->getFlows().end()) {",
  "        if (flow_iter->getItem() == getItem() &&",
  "            (!flow_iter->getLocation() ||",
  "             flow_iter->getLocation() == getLocation()))",
  "          return;",
  "        ++flow_iter;",
  "      }",
  "      lastStep = sub;",
  "    }",
  "",
  "    // correct the last step",
  "    if (lastStep) {",
  "      correctProducingFlow(lastStep->getOperation());",
  "      return;",
  "    }",
  "    // else: an empty routing, where the code below will add a top-level",
  "    // producing flow",
  "  }",
  "",
  "  // if operation is of type alternate or split then apply logic to all",
  "  // suboperations (which might be a routing)",
  "  if (itemoper->hasType<OperationAlternate, OperationSplit>()) {",
  "    auto subs = itemoper->getSubOperationIterator();",
  "    while (SubOperation* sub = subs.next()) {",
  "      correctProducingFlow(sub->getOperation());",
  "    }",
  "    return;",
  "  }",
  "",
  "  // \"Regular\" case : operation is of type fixed time, time per...",
  "  auto flow_iter = itemoper->getFlowIterator();",
  "  bool foundFlow = false;",
  "  while (flow_iter != itemoper->getFlows().end()) {",
  "    if (flow_iter->getItem() == getItem() &&",
  "        (!flow_iter->getLocation() ||",
  "         flow_iter->getLocation() == getLocation())) {",
  "      foundFlow = true;",
  "      break;",
  "    }",
  "    ++flow_iter;",
  "  }",
  "  if (!foundFlow) {",
  "    if (getBatch())",
  "      new FlowEnd(itemoper, Buffer::findOrCreate(getItem(), getLocation()), 1);",
  "    else",
  "      new FlowEnd(itemoper, this, 1);",
  "  }",
  "}",
  "",
  "pair<Duration, Date> Buffer::getDecoupledLeadTime(",
  "    double qty, Date startdate, bool recurse_ip_buffers) const {",
  "  if (!recurse_ip_buffers || hasType<BufferInfinite>())",
  "    // Abort the recursion",
  "    return make_pair(Duration(0L), startdate);",
  "",
  "  Operation* oper = getProducingOperation();",
  "  if (!oper)",
  "    // Infinite lead time if no producing operation is found.",
  "    // Setting an extremely long lead time, which results in a huge",
  "    // safety stock that covers the entire horizon.",
  "    return make_pair(Duration(999L * 86400L), Date::infiniteFuture);",
  "  else",
  "    return oper->getDecoupledLeadTime(qty, startdate);",
  "}",
  "",
  "PyObject* Buffer::getDecoupledLeadTimePython(PyObject* self, PyObject* args) {",
  "  // Pick up arguments",
  "  double qty = 1.0;",
  "  PyObject* py_startdate = nullptr;",
  "  Date startdate = Plan::instance().getCurrent();",
  "  if (!PyArg_ParseTuple(args, \"|dO:decoupledLeadTime\", &qty, &py_startdate))",
  "    return nullptr;",
  "  if (py_startdate) startdate = PythonData(py_startdate).getDate();",
  "",
  "  try {",
  "    auto lt =",
  "        static_cast<Buffer*>(self)->getDecoupledLeadTime(qty, startdate, true);",
  "    return PythonData(lt.first);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "PyObject* Buffer::availableOnhandPython(PyObject* self, PyObject* args) {",
  "  PyObject* dateobj = nullptr;",
  "  if (!PyArg_ParseTuple(args, \"|O:availableonhand\", &dateobj)) return nullptr;",
  "",
  "  try {",
  "    Date refdate;",
  "    if (dateobj) {",
  "      PythonData tmp(dateobj);",
  "      refdate = tmp.getDate();",
  "    } else",
  "      refdate = Plan::instance().getCurrent();",
  "    auto available = static_cast<Buffer*>(self)->getOnHand(",
  "        refdate, Date::infiniteFuture, true);",
  "    return PythonData(available);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "Buffer* Buffer::findFromName(const string& nm) {",
  "  // Check if it exists",
  "  Buffer* buf = Buffer::find(nm);",
  "  if (buf) return buf;",
  "",
  "  size_t pos = nm.find(\" @ \");",
  "  if (pos == string::npos) return nullptr;",
  "  Item* it = Item::find(nm.substr(0, pos));",
  "  if (!it) return nullptr;",
  "  auto locstring = nm.substr(pos + 3, string::npos);",
  "  pos = locstring.find(\" @ \");",
  "  if (pos == string::npos) {",
  "    // Buffer name matches \"item @ location\"",
  "    Location* loc = Location::find(locstring);",
  "    if (!loc) return nullptr;",
  "    buf = new BufferDefault();",
  "    static_cast<BufferDefault*>(buf)->setName(nm);",
  "    static_cast<BufferDefault*>(buf)->setItem(it);",
  "    static_cast<BufferDefault*>(buf)->setLocation(loc);",
  "    return buf;",
  "  } else {",
  "    // Buffer name matches \"item @ batch @ location\"",
  "    Location* loc = Location::find(locstring.substr(pos + 3, string::npos));",
  "    if (!loc) return nullptr;",
  "    auto batch = locstring.substr(0, pos);",
  "    buf = new BufferDefault();",
  "    static_cast<BufferDefault*>(buf)->setName(nm);",
  "    static_cast<BufferDefault*>(buf)->setBatch(batch);",
  "    static_cast<BufferDefault*>(buf)->setItem(it);",
  "    static_cast<BufferDefault*>(buf)->setLocation(loc);",
  "    return buf;",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "}  // namespace frepple",
];
