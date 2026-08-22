// <header-api-generated>
import { Date as PlanningDate, Duration } from "../utils/date.js";
import { DataException, HeaderModelAdapter, LogicException } from "../utils/library.js";
import { Buffer, BufferInfinite } from "./buffer.js";
import { FlowEnd, FlowStart, type Flow } from "./flow.js";
import type { Item } from "./item.js";
import type { Operation } from "./operation.js";
import type { OperationPlan } from "./operationplan.js";

type DateInput = PlanningDate | string | number;

const ROUNDING_ERROR = 0.000001;

function asDate(value: DateInput): PlanningDate {
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
}

function invoke(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function link(source: HeaderModelAdapter, property: string, previous: HeaderModelAdapter | null,
  next: HeaderModelAdapter | null): void {
  if (previous === next) return;
  previous?.modelReferenceRemoved(source, property);
  next?.modelReferenceAdded(source, property);
}

function compareOperationPlans(left: HeaderModelAdapter | null, right: HeaderModelAdapter | null): number {
  if (left === right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  const leftOperation = invoke(left, "getOperation");
  const rightOperation = invoke(right, "getOperation");
  if (leftOperation !== rightOperation) {
    const leftName = String(invoke(leftOperation, "getName") ?? "");
    const rightName = String(invoke(rightOperation, "getName") ?? "");
    if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  }
  const leftSetupEnd = invoke(left, "getSetupEnd");
  const rightSetupEnd = invoke(right, "getSetupEnd");
  if (leftSetupEnd instanceof PlanningDate && rightSetupEnd instanceof PlanningDate) {
    const comparison = leftSetupEnd.compare(rightSetupEnd);
    if (comparison) return comparison;
  }
  const leftQuantity = Number(invoke(left, "getQuantity") ?? 0);
  const rightQuantity = Number(invoke(right, "getQuantity") ?? 0);
  if (Math.abs(leftQuantity - rightQuantity) > ROUNDING_ERROR) return leftQuantity > rightQuantity ? -1 : 1;
  const leftActivated = Boolean(invoke(left, "getActivated"));
  const rightActivated = Boolean(invoke(right, "getActivated"));
  if (leftActivated !== rightActivated) return leftActivated ? -1 : 1;
  const leftEnd = invoke(left, "getEnd");
  const rightEnd = invoke(right, "getEnd");
  if (leftEnd instanceof PlanningDate && rightEnd instanceof PlanningDate) {
    const comparison = leftEnd.compare(rightEnd);
    if (comparison) return comparison;
  }
  const leftReference = String(Reflect.get(left, "reference") ?? "");
  const rightReference = String(Reflect.get(right, "reference") ?? "");
  const leftReferenceIsGenerated = Boolean(Reflect.get(left, "generatedReference"));
  const rightReferenceIsGenerated = Boolean(Reflect.get(right, "generatedReference"));
  if ((!leftReferenceIsGenerated || !rightReferenceIsGenerated) && leftReference !== rightReference) {
    return leftReference < rightReference ? -1 : 1;
  }
  const leftSequence = Number(Reflect.get(left, "comparisonSequence") ?? 0);
  const rightSequence = Number(Reflect.get(right, "comparisonSequence") ?? 0);
  return leftSequence - rightSequence;
}

/** Base node shared by material and capacity timelines. */
export abstract class TimeLineEvent extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = ["NonCopyable", "Object"] as const;
  static readonly cppQualifiedNames: readonly string[] = ["TimeLine::Event"] as const;
  private timeline: TimeLine<TimeLineEvent> | null = null;
  private date = new PlanningDate(PlanningDate.infinitePast);
  private quantity = 0;
  private onhand = 0;
  private cumulativeProduced = 0;
  private sequence = 0;

  constructor(quantity = 0, date: DateInput = PlanningDate.infinitePast) {
    super();
    this.quantity = Number(quantity);
    this.date = asDate(date);
  }

  abstract getEventType(): number;
  getOperationPlan(): HeaderModelAdapter | null { return null; }
  getQuantity(): number { return this.quantity; }
  getOnhand(): number { return this.onhand; }
  getCumulativeProduced(): number { return this.cumulativeProduced; }
  getCumulativeConsumed(): number { return this.cumulativeProduced - this.onhand; }
  getDate(): PlanningDate { return new PlanningDate(this.date); }
  getTimeLine(): TimeLine<TimeLineEvent> | null { return this.timeline; }
  isFirstOnDate(): boolean {
    const previous = this.timeline?.previous(this) ?? null;
    return !previous || !previous.getDate().equals(this.date);
  }
  isLastOnDate(): boolean {
    const next = this.timeline?.next(this) ?? null;
    return !next || !next.getDate().equals(this.date);
  }
  isOnlyEventOnDate(): boolean { return this.isFirstOnDate() && this.isLastOnDate(); }
  getOnhandBeforeDate(): number {
    if (!this.timeline) return 0;
    let current: TimeLineEvent | null = this;
    while (current?.getDate().equals(this.date)) current = this.timeline.previous(current);
    return current?.getOnhand() ?? 0;
  }
  getOnhandAfterDate(): number {
    if (!this.timeline) return this.onhand;
    let current: TimeLineEvent = this;
    let next = this.timeline.next(current);
    while (next?.getDate().equals(this.date)) { current = next; next = this.timeline.next(current); }
    return current.getOnhand();
  }
  getMin(inclusive = true): number { return this.timeline?.getMin(this, inclusive) ?? 0; }
  getMax(inclusive = true): number { return this.timeline?.getMax(this, inclusive) ?? 0; }
  getAvailable(): number {
    if (!this.timeline) return this.getOnhandAfterDate();
    let best = this.getOnhandAfterDate();
    for (const event of this.timeline.snapshotFrom(this)) {
      if (event.isLastOnDate() && event.getOnhand() < best) best = event.getOnhand();
      if (best < ROUNDING_ERROR) return 0;
    }
    return best;
  }

  /** Internal hooks used by TimeLine and resource timeline adapters. */
  setTimelineState(onhand: number, cumulativeProduced: number): void {
    this.onhand = Number(onhand);
    this.cumulativeProduced = Number(cumulativeProduced);
  }
  setTimelineDate(value: DateInput): void { this.date = asDate(value); }
  setTimelineQuantity(value: number): void { this.quantity = Number(value); }
  setTimelineOwner(value: TimeLine<TimeLineEvent> | null): void { this.timeline = value; }
  setTimelineSequence(value: number): void { this.sequence = value; }
  getTimelineSequence(): number { return this.sequence; }
}

export class TimeLineEventChangeOnhand extends TimeLineEvent {
  static override readonly cppBases: readonly string[] = ["TimeLineEvent"] as const;
  static override readonly cppQualifiedNames: readonly string[] = ["TimeLine::EventChangeOnhand"] as const;
  override getEventType(): number { return 1; }
}

export class TimeLineEventSetOnhand extends TimeLineEvent {
  static override readonly cppBases: readonly string[] = ["TimeLineEvent"] as const;
  static override readonly cppQualifiedNames: readonly string[] = ["TimeLine::EventSetOnhand"] as const;
  private value: number;
  constructor(date: DateInput = PlanningDate.infinitePast, quantity = 0, timeline?: TimeLine<TimeLineEvent>) {
    super(0, date);
    this.value = Number(quantity);
    timeline?.insert(this);
  }
  override getEventType(): number { return 2; }
  getSetOnhand(): number { return this.value; }
  setOnhand(value: number): void { this.value = Number(value); this.getTimeLine()?.update(this, this.getDate()); }
}

export class TimeLineEventMinQuantity extends TimeLineEvent {
  static override readonly cppBases: readonly string[] = ["TimeLineEvent"] as const;
  static override readonly cppQualifiedNames: readonly string[] = ["TimeLine::EventMinQuantity"] as const;
  private value: number;
  constructor(date: DateInput = PlanningDate.infinitePast, timeline?: TimeLine<TimeLineEvent>, value = 0) {
    super(0, date);
    this.value = Number(value);
    timeline?.insert(this);
  }
  override getEventType(): number { return 3; }
  override getMin(inclusive = true): number {
    return inclusive ? this.value : this.getTimeLine()?.getMin(this, false) ?? 0;
  }
  setMin(value: number): void { this.value = Number(value); this.getTimeLine()?.update(this, this.getDate()); }
}

export class TimeLineEventMaxQuantity extends TimeLineEvent {
  static override readonly cppBases: readonly string[] = ["TimeLineEvent"] as const;
  static override readonly cppQualifiedNames: readonly string[] = ["TimeLine::EventMaxQuantity"] as const;
  private value: number;
  constructor(date: DateInput = PlanningDate.infinitePast, timeline?: TimeLine<TimeLineEvent>, value = 0) {
    super(0, date);
    this.value = Number(value);
    timeline?.insert(this);
  }
  override getEventType(): number { return 4; }
  override getMax(inclusive = true): number {
    return inclusive ? this.value : this.getTimeLine()?.getMax(this, false) ?? 0;
  }
  setMax(value: number): void { this.value = Number(value); this.getTimeLine()?.update(this, this.getDate()); }
}

/**
 * Stable sorted event list. The C++ implementation updates a linked list in
 * place; the TypeScript adaptation recomputes cached balances after mutation.
 * The observable ordering and balance semantics are the same.
 */
export class TimeLine<T extends TimeLineEvent = TimeLineEvent> extends HeaderModelAdapter implements Iterable<T> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["TimeLine"] as const;
  private readonly events: T[] = [];
  private sequence = 1;
  private mutationDepth = 0;
  private recomputePending = false;

  size(): number { return this.events.length; }
  empty(): boolean { return this.events.length === 0; }
  begin(event?: T | null): TimeLineIterator<T> { return new TimeLineIterator(this, event ?? null); }
  rbegin(event?: T | null): TimeLineIterator<T> { return new TimeLineIterator(this, event ?? null, true); }
  end(): TimeLineIterator<T> { return new TimeLineIterator(this, null, false, true); }
  override [Symbol.iterator](): Iterator<T> { return this.events.values(); }
  snapshot(): readonly T[] { return [...this.events]; }
  snapshotFrom(event: TimeLineEvent): readonly T[] {
    const index = this.events.indexOf(event as T);
    return index < 0 ? [] : this.events.slice(index);
  }
  previous(event: TimeLineEvent): T | null {
    const index = this.events.indexOf(event as T);
    return index > 0 ? this.events[index - 1] ?? null : null;
  }
  next(event: TimeLineEvent): T | null {
    const index = this.events.indexOf(event as T);
    return index >= 0 ? this.events[index + 1] ?? null : null;
  }
  indexOf(event: TimeLineEvent): number { return this.events.indexOf(event as T); }
  at(index: number): T | null { return this.events[index] ?? null; }

  batch<TResult>(callback: () => TResult): TResult {
    this.mutationDepth += 1;
    try {
      return callback();
    } finally {
      this.mutationDepth -= 1;
      if (this.mutationDepth === 0 && this.recomputePending) {
        this.recomputePending = false;
        this.recompute();
      }
    }
  }

  insert(event: T, quantity?: number, date?: DateInput): void {
    const previous = event.getTimeLine();
    if (previous && previous !== this) previous.erase(event);
    if (quantity !== undefined) event.setTimelineQuantity(quantity);
    if (date !== undefined) event.setTimelineDate(date);
    if (!this.events.includes(event)) {
      event.setTimelineSequence(this.sequence++);
      this.events.push(event);
    }
    event.setTimelineOwner(this as unknown as TimeLine<TimeLineEvent>);
    this.requestRecompute();
  }
  erase(event: TimeLineEvent): void {
    const index = this.events.indexOf(event as T);
    if (index < 0) return;
    this.events.splice(index, 1);
    event.setTimelineOwner(null);
    event.setTimelineState(0, 0);
    this.requestRecompute();
  }
  update(event: T, quantityOrDate: number | DateInput, date?: DateInput): void {
    if (!this.events.includes(event)) {
      if (date !== undefined) this.insert(event, Number(quantityOrDate), date);
      else this.insert(event, undefined, quantityOrDate as DateInput);
      return;
    }
    if (date !== undefined) {
      event.setTimelineQuantity(Number(quantityOrDate));
      event.setTimelineDate(date);
    } else event.setTimelineDate(quantityOrDate as DateInput);
    this.requestRecompute();
  }
  getEvent(dateValue: DateInput, inclusive = true): T | null {
    const date = asDate(dateValue);
    let result: T | null = null;
    for (const event of this.events) {
      const comparison = event.getDate().compare(date);
      if ((inclusive && comparison > 0) || (!inclusive && comparison >= 0)) break;
      result = event;
    }
    return result;
  }
  getMin(dateOrEvent: DateInput | TimeLineEvent, inclusive = true): number {
    const event = this.getMinEvent(dateOrEvent, inclusive);
    return event?.getMin() ?? 0;
  }
  getMax(dateOrEvent: DateInput | TimeLineEvent, inclusive = true): number {
    const event = this.getMaxEvent(dateOrEvent, inclusive);
    return event?.getMax() ?? 0;
  }
  getMinEvent(dateOrEvent: DateInput | TimeLineEvent, inclusive = true): TimeLineEventMinQuantity | null {
    const date = dateOrEvent instanceof TimeLineEvent ? dateOrEvent.getDate() : asDate(dateOrEvent);
    let result: TimeLineEventMinQuantity | null = null;
    for (const event of this.events) {
      if (!(event instanceof TimeLineEventMinQuantity)) continue;
      const comparison = event.getDate().compare(date);
      if (comparison < 0 || (inclusive && comparison === 0)) result = event;
      else if (comparison > 0 || !inclusive) break;
    }
    return result;
  }
  getMaxEvent(dateOrEvent: DateInput | TimeLineEvent, inclusive = true): TimeLineEventMaxQuantity | null {
    const date = dateOrEvent instanceof TimeLineEvent ? dateOrEvent.getDate() : asDate(dateOrEvent);
    let result: TimeLineEventMaxQuantity | null = null;
    for (const event of this.events) {
      if (!(event instanceof TimeLineEventMaxQuantity)) continue;
      const comparison = event.getDate().compare(date);
      if (comparison < 0 || (inclusive && comparison === 0)) result = event;
      else if (comparison > 0 || !inclusive) break;
    }
    return result;
  }
  getExcess(current: TimeLineEvent | null, considerMinimum = true): number {
    if (!current) return 0;
    const start = this.indexOf(current);
    if (start < 0) return 0;
    let excess = Number.POSITIVE_INFINITY;
    let minimum = considerMinimum ? Math.max(current.getMin(), 0) : 0;
    let maximum = considerMinimum ? Math.max(current.getMax(), 0) : 0;
    for (const event of this.events.slice(start)) {
      if (considerMinimum && event.getEventType() === 3) minimum = Math.max(event.getMin(), 0);
      if (considerMinimum && event.getEventType() === 4) maximum = Math.max(event.getMax(), 0);
      if (event.isLastOnDate()) excess = Math.min(excess, event.getOnhand() - Math.max(minimum, maximum));
    }
    return Number.isFinite(excess) ? excess : 0;
  }
  getFlow(start: TimeLineEvent, endOrPeriod: TimeLineEvent | Duration, consumed: boolean): number {
    const startIndex = this.indexOf(start);
    if (startIndex < 0) return 0;
    const endDate = endOrPeriod instanceof Duration ? start.getDate().add(endOrPeriod) : null;
    let total = 0;
    for (let index = startIndex; index < this.events.length; index += 1) {
      const event = this.events[index];
      if (!event || event === endOrPeriod || (endDate && event.getDate().compare(endDate) > 0)) break;
      const quantity = event.getQuantity();
      if (consumed && quantity < 0) total -= quantity;
      else if (!consumed && quantity > 0) total += quantity;
    }
    return total;
  }
  hasTimeVaryingMinimum(): boolean {
    return this.events.filter((event) => event instanceof TimeLineEventMinQuantity).length > 1;
  }
  check(): boolean {
    const before = this.events.map((event) => [event, event.getOnhand(), event.getCumulativeProduced()] as const);
    this.recompute();
    return before.every(([event, onhand, produced]) =>
      Math.abs(event.getOnhand() - onhand) < ROUNDING_ERROR &&
      Math.abs(event.getCumulativeProduced() - produced) < ROUNDING_ERROR);
  }

  private requestRecompute(): void {
    if (this.mutationDepth > 0) this.recomputePending = true;
    else this.recompute();
  }

  private recompute(): void {
    this.events.sort((left, right) => this.compare(left, right));
    let onhand = 0;
    let produced = 0;
    for (const event of this.events) {
      if (event instanceof TimeLineEventSetOnhand) onhand = event.getSetOnhand();
      else onhand += event.getQuantity();
      if (event.getQuantity() > 0) produced += event.getQuantity();
      event.setTimelineState(onhand, produced);
    }
  }
  private compare(left: T, right: T): number {
    const date = left.getDate().compare(right.getDate());
    if (date) return date;
    const leftType = left.getEventType();
    const rightType = right.getEventType();
    if (leftType === 5 || rightType === 5) {
      if (leftType !== rightType) return rightType - leftType;
      const operationPlan = compareOperationPlans(left.getOperationPlan(), right.getOperationPlan());
      if (operationPlan) return operationPlan;
    } else if (leftType !== rightType) return rightType - leftType;
    const quantity = right.getQuantity() - left.getQuantity();
    if (Math.abs(quantity) > ROUNDING_ERROR) return quantity;
    const operationPlan = compareOperationPlans(left.getOperationPlan(), right.getOperationPlan());
    if (operationPlan) return operationPlan;
    return left.getTimelineSequence() - right.getTimelineSequence();
  }
}

export class TimeLineConst_iterator<T extends TimeLineEvent = TimeLineEvent> extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = [] as const;
  static readonly cppQualifiedNames: readonly string[] = ["TimeLine::const_iterator"] as const;
  protected readonly values: readonly T[];
  protected index: number;
  protected readonly direction: 1 | -1;
  constructor(timeline?: TimeLine<T>, event: T | null = null, reverse = false, atEnd = false) {
    super();
    this.values = timeline?.snapshot() ?? [];
    this.direction = reverse ? -1 : 1;
    if (atEnd) this.index = reverse ? -1 : this.values.length;
    else if (event) this.index = Math.max(0, this.values.indexOf(event));
    else this.index = reverse ? this.values.length - 1 : 0;
  }
  next(): T | null {
    while (this.index >= 0 && this.index < this.values.length) {
      const value = this.values[this.index] ?? null;
      this.index += this.direction;
      if (value?.getEventType() === 1) return value;
    }
    return null;
  }
  nextEvent(): T | null {
    const value = this.values[this.index] ?? null;
    this.index += this.direction;
    return value;
  }
}

export class TimeLineIterator<T extends TimeLineEvent = TimeLineEvent> extends TimeLineConst_iterator<T> {
  static override readonly cppBases: readonly string[] = ["TimeLineConst_iterator"] as const;
  static override readonly cppQualifiedNames: readonly string[] = ["TimeLine::iterator"] as const;
}

/** Planned material movement tied to one flow and one operation plan. */
export class FlowPlan extends TimeLineEventChangeOnhand {
  static override readonly cppBases = ["EventChangeOnhand"] as const;
  static override readonly cppQualifiedNames = ["FlowPlan"] as const;
  static override modelFamily = "FlowPlan";
  private static readonly timelines = new WeakMap<Buffer, TimeLine<TimeLineEvent>>();
  private flow: Flow | null = null;
  private operationPlan: OperationPlan | null = null;
  private buffer: Buffer | null = null;
  private confirmed = false;
  private closed = false;
  private followingBatch = false;
  private disposed = false;

  constructor(operationPlan?: OperationPlan | null, flow?: Flow | null, date?: DateInput, quantity?: number) {
    super(quantity ?? 0, date ?? PlanningDate.infinitePast);
    if (operationPlan) this.setOperationPlan(operationPlan);
    if (flow) this.assignFlow(flow, date, quantity);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static getBufferTimeline(buffer: Buffer): TimeLine<TimeLineEvent> {
    let result = this.timelines.get(buffer);
    if (!result) {
      result = new TimeLine<TimeLineEvent>();
      this.timelines.set(buffer, result);
    }
    return result;
  }
  getType(): string { return "flowplan"; }
  getFlow(): Flow | null { return this.flow; }
  getBuffer(): Buffer | null { return this.buffer; }
  getOperation(): Operation | null { return this.flow?.getOperation() ?? null; }
  getItem(): Item | null { return this.buffer?.getItem() ?? null; }
  override getOperationPlan(): OperationPlan | null { return this.operationPlan; }
  override getTimeLine(): TimeLine<TimeLineEvent> | null {
    return (this.buffer ? FlowPlan.timelines.get(this.buffer) : null) as TimeLine<TimeLineEvent> | null;
  }
  isFollowingBatch(): boolean { return this.followingBatch; }
  setFollowingBatch(value: boolean): void { this.followingBatch = Boolean(value); }
  getHidden(): boolean { return this.flow?.getHidden() ?? false; }

  setOperationPlan(value: OperationPlan | null): void {
    if (value === this.operationPlan) return;
    if (this.operationPlan && value) throw new LogicException("Can't change the operationplan of a flowplan");
    const previous = this.operationPlan;
    invoke(previous, "detachFlowPlan", this);
    link(this, "OperationPlan", previous as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.operationPlan = value;
    invoke(value, "attachFlowPlan", this);
    if (value && this.flow) this.update();
  }
  setFlow(value: Flow | null): void {
    if (!value) throw new DataException("Can't switch to nullptr flow");
    this.assignFlow(value);
  }
  private assignFlow(value: Flow, explicitDate?: DateInput, explicitQuantity?: number): void {
    if (value === this.flow && explicitDate === undefined && explicitQuantity === undefined) return;
    const previous = this.flow;
    if (previous && previous.getOperation() !== value.getOperation()) {
      throw new DataException("Only switching to a flow on the same operation is allowed");
    }
    if (previous && previous.getType() !== value.getType()) {
      throw new DataException("Flowplans can only switch to flows of the same type");
    }
    const oldBuffer = this.buffer;
    oldBuffer?.setChanged();
    this.detachTimeline();
    link(this, "Flow", previous as HeaderModelAdapter | null, value as HeaderModelAdapter);
    this.flow = value;
    const modeled = value.getBuffer();
    const item = modeled.getItem();
    const batch = this.operationPlan?.getBatch() ?? oldBuffer?.getBatch() ?? "";
    this.buffer = item?.constructor.name === "ItemMTO" && batch
      ? Buffer.findOrCreate(item, modeled.getLocation(), batch) ?? modeled : modeled;
    link(this, "Buffer", oldBuffer, this.buffer);
    this.buffer.setChanged();
    value.getOperation()?.setChanged();
    const calculated = explicitDate === undefined || explicitQuantity === undefined
      ? value.getFlowplanDateQuantity(this) : null;
    const date = explicitDate ?? calculated?.[0] ?? PlanningDate.infinitePast;
    const quantity = explicitQuantity ?? calculated?.[1] ?? 0;
    this.bufferTimeline().insert(this, quantity, date);
  }
  setBuffer(value: Buffer | null): void {
    if (!value) throw new DataException("Can't switch to nullptr buffer");
    if (!this.buffer) throw new DataException("Can't switch from nullptr buffer");
    if (value === this.buffer) return;
    if (value.getItem() !== this.buffer.getItem() || value.getLocation() !== this.buffer.getLocation()) {
      throw new DataException("Flowplans can only switch to buffers with the same item and location");
    }
    const previous = this.buffer;
    previous.setChanged();
    this.detachTimeline();
    link(this, "Buffer", previous, value);
    this.buffer = value;
    value.setChanged();
    this.bufferTimeline().insert(this, this.getQuantity(), this.getDate());
  }
  setItem(value: Item | null): void {
    if (!value) throw new DataException("Can't switch to nullptr item");
    if (this.flow?.getBuffer().getItem() === value) return;
    throw new DataException("Item can be set only once on a flowplan");
  }
  computeFlowToOperationDate(value: DateInput): PlanningDate {
    return this.flow?.computeFlowToOperationDate(this.operationPlan, value) ?? asDate(value);
  }
  computeOperationToFlowDate(value: DateInput): PlanningDate {
    return this.flow?.computeOperationToFlowDate(this.operationPlan, value) ?? asDate(value);
  }
  update(): void {
    if (!this.flow || !this.buffer || !this.operationPlan) return;
    const [date, quantity] = this.flow.getFlowplanDateQuantity(this);
    this.bufferTimeline().update(this, quantity, date);
    this.buffer.setChanged();
    this.flow.getOperation()?.setChanged();
  }
  updateBatch(): void {
    if (!this.flow) return;
    const modeled = this.flow.getBuffer();
    const batch = this.operationPlan?.getBatch() ?? "";
    const next = modeled.getItem()?.constructor.name === "ItemMTO" && batch
      ? Buffer.findOrCreate(modeled.getItem() ?? null, modeled.getLocation(), batch) ?? modeled : modeled;
    if (next !== this.buffer) this.setBuffer(next);
  }
  setQuantityRaw(value: number): void {
    if (this.buffer) {
      this.bufferTimeline().update(this, Number(value), this.getDate());
      this.buffer.setChanged();
      this.flow?.getOperation()?.setChanged();
    }
  }
  setQuantity(value: number, roundDown = false, _update = true, execute = true, mode = 2): readonly [number, number] {
    const quantity = Number(value);
    if (this.confirmed || this.closed) {
      if (execute) this.setQuantityRaw(quantity);
      return [quantity, this.operationPlan?.getQuantity() ?? 0];
    }
    if (!this.flow || !this.operationPlan) return [0, 0];

    const operationPlanQuantity = (state: unknown): number => {
      if (state && typeof state === "object") {
        const result = Reflect.get(state, "quantity");
        if (result !== undefined) return Number(result);
      }
      return this.operationPlan?.getQuantity() ?? 0;
    };
    const setParameters = (operationQuantity: number): number => {
      let state: unknown;
      if (mode === 2 || (mode === 0 && this.flow instanceof FlowEnd)) {
        state = this.operationPlan?.setOperationPlanParameters(
          operationQuantity,
          PlanningDate.infinitePast,
          mode === 2 || this.flow instanceof FlowStart
            ? this.operationPlan.getEnd()
            : this.computeFlowToOperationDate(this.getDate()),
          true,
          execute,
          roundDown,
        );
      } else if (mode === 1 || (mode === 0 && this.flow instanceof FlowStart)) {
        state = this.operationPlan?.setOperationPlanParameters(
          operationQuantity,
          mode === 1 || this.flow instanceof FlowEnd
            ? this.operationPlan.getStart()
            : this.computeFlowToOperationDate(this.getDate()),
          PlanningDate.infinitePast,
          false,
          execute,
          roundDown,
        );
      } else {
        throw new LogicException("Unreachable code reached");
      }
      return operationPlanQuantity(state);
    };

    if (!this.flow.getEffective().within(this.getDate())) {
      if (execute) setParameters(0);
      return [0, 0];
    }

    const fixed = this.flow.getQuantityFixed();
    const proportional = this.flow.getQuantity();
    const belowFixed = Math.abs(fixed) > 0
      && Math.abs(quantity) < Math.abs(fixed) + ROUNDING_ERROR;
    let actual = this.operationPlan.getQuantity();
    if (Math.abs(proportional) < ROUNDING_ERROR || belowFixed) {
      if (belowFixed && actual !== 0) actual = setParameters(0);
      else if (!belowFixed && actual === 0) actual = setParameters(0.001);
    } else {
      actual = setParameters((quantity - fixed) / proportional);
    }

    if (execute) {
      const owner = this.operationPlan.getOwner();
      if (owner) {
        for (const sibling of owner.getSubOperationPlans()) {
          if (sibling !== this.operationPlan) invoke(sibling, "update");
        }
      }
    }
    return actual ? [actual * proportional + fixed, actual] : [0, 0];
  }
  setQuantityAPI(value: number): void { this.setQuantity(value, false, true, true); }
  setDate(value: DateInput): void {
    if (!this.confirmed && !this.closed) throw new DataException("Cannot change a date of a proposed FlowPlan");
    if (this.buffer) this.bufferTimeline().update(this, this.getQuantity(), value);
  }
  getStatus(): string { return this.closed ? "closed" : this.confirmed ? "confirmed" : "proposed"; }
  setStatus(value: string): void {
    const status = String(value).toLowerCase();
    if (status === "confirmed") this.setConfirmed(true);
    else if (status === "proposed") this.setProposed(true);
    else if (status === "closed") this.setClosed(true);
    else throw new DataException(`invalid operationplanmaterial status:${value}`);
  }
  getProposed(): boolean { return !this.confirmed && !this.closed; }
  setProposed(value: boolean): void { this.confirmed = !value; this.closed = false; }
  getConfirmed(): boolean { return this.confirmed; }
  setConfirmed(value: boolean): void {
    if (value && this.operationPlan?.getProposed()) {
      throw new DataException("OperationPlanMaterial locked while OperationPlan is not");
    }
    this.confirmed = Boolean(value);
    if (value) this.closed = false;
  }
  getClosed(): boolean { return this.closed; }
  setClosed(value: boolean): void { this.closed = Boolean(value); if (value) this.confirmed = false; }
  getFeasible(): boolean {
    if (!this.buffer || this.buffer instanceof BufferInfinite) return true;
    const events = this.bufferTimeline().snapshotFrom(this);
    return !events.some((event) => event.isLastOnDate() && event.getOnhand() < -ROUNDING_ERROR);
  }
  getPeriodOfCover(): Duration {
    if (!this.buffer) return new Duration();
    const events = this.bufferTimeline().snapshot();
    const start = events.indexOf(this);
    if (start < 0) return new Duration();
    let remaining = this.getOnhand();
    if (remaining > 0) {
      for (const event of events.slice(start + 1)) {
        if (event.getQuantity() >= 0) continue;
        remaining += event.getQuantity();
        if (remaining < ROUNDING_ERROR) return event.getDate().subtract(this.getDate());
      }
    } else {
      const consumer = events.slice(start + 1).find((event) => event.getQuantity() < 0);
      if (consumer) {
        const delay = invoke(consumer.getOperationPlan(), "getDelay");
        const seconds = consumer.getDate().subtract(this.getDate()).seconds - (delay instanceof Duration ? delay.seconds : 0);
        return new Duration(Math.max(0, seconds));
      }
    }
    return new Duration(999 * 86_400);
  }
  private bufferTimeline(): TimeLine<TimeLineEvent> {
    if (!this.buffer) throw new LogicException("FlowPlan doesn't have a buffer");
    return FlowPlan.getBufferTimeline(this.buffer);
  }
  private detachTimeline(): void {
    const timeline = this.buffer ? FlowPlan.timelines.get(this.buffer) : null;
    timeline?.erase(this);
  }
  override modelReferenceTargetDisposed(_target: HeaderModelAdapter, property: string): void {
    if (["Flow", "Buffer", "OperationPlan"].includes(property)) this.dispose();
    else super.modelReferenceTargetDisposed(_target, property);
  }
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachTimeline();
    const operationPlan = this.operationPlan;
    const flow = this.flow;
    const buffer = this.buffer;
    buffer?.setChanged();
    flow?.getOperation()?.setChanged();
    this.operationPlan = null;
    this.flow = null;
    this.buffer = null;
    invoke(operationPlan, "detachFlowPlan", this);
    link(this, "OperationPlan", operationPlan as HeaderModelAdapter | null, null);
    link(this, "Flow", flow as HeaderModelAdapter | null, null);
    link(this, "Buffer", buffer, null);
    super.dispose();
  }
}

export class FlowPlanIterator extends HeaderModelAdapter {
  static readonly cppBases = ["PythonExtension"] as const;
  static readonly cppQualifiedNames = ["FlowPlanIterator"] as const;
  private readonly values: FlowPlan[];
  private index = 0;
  constructor(source?: Buffer | OperationPlan | Iterable<FlowPlan> | null) {
    super();
    const plans = source && typeof (source as Iterable<FlowPlan>)[Symbol.iterator] === "function"
      ? source as Iterable<FlowPlan> : invoke(source, "getFlowPlans");
    this.values = plans && typeof (plans as Iterable<FlowPlan>)[Symbol.iterator] === "function"
      ? [...plans as Iterable<FlowPlan>] : [];
  }
  static override initialize(): number { return 0; }
  next(): FlowPlan | null {
    while (this.index < this.values.length) {
      const value = this.values[this.index++];
      if (value && value.getQuantity() !== 0) return value;
    }
    return null;
  }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/flowplan.cpp.
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
  { name: "FlowPlan::initialize", sourceLine: 32, status: "adapted" },
  { name: "FlowPlan::FlowPlan", sourceLine: 50, status: "adapted" },
  { name: "FlowPlan::FlowPlan", sourceLine: 87, status: "adapted" },
  { name: "FlowPlan::getStatus", sourceLine: 124, status: "adapted" },
  { name: "FlowPlan::setStatus", sourceLine: 131, status: "adapted" },
  { name: "FlowPlan::update", sourceLine: 143, status: "adapted" },
  { name: "FlowPlan::updateBatch", sourceLine: 154, status: "adapted" },
  { name: "FlowPlan::setBuffer", sourceLine: 172, status: "adapted" },
  { name: "FlowPlan::setFlow", sourceLine: 210, status: "adapted" },
  { name: "FlowPlan::setItem", sourceLine: 273, status: "adapted" },
  { name: "FlowPlan::setQuantityRaw", sourceLine: 290, status: "adapted" },
  { name: "FlowPlan::setQuantity", sourceLine: 294, status: "adapted" },
  { name: "FlowPlanIterator::initialize", sourceLine: 414, status: "adapted" },
  { name: "FlowPlanIterator::iternext", sourceLine: 423, status: "adapted" },
  { name: "FlowPlan::reader", sourceLine: 444, status: "adapted" },
  { name: "FlowPlan::create", sourceLine: 516, status: "adapted" },
  { name: "FlowPlan::getPeriodOfCover", sourceLine: 555, status: "adapted" },
  { name: "FlowPlan::getFeasible", sourceLine: 614, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface FlowPlanPort {
  FlowPlan(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  getFeasible(...args: readonly PortValue[]): PortValue | void;
  getPeriodOfCover(...args: readonly PortValue[]): PortValue | void;
  getStatus(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  reader(...args: readonly PortValue[]): PortValue | void;
  setBuffer(...args: readonly PortValue[]): PortValue | void;
  setFlow(...args: readonly PortValue[]): PortValue | void;
  setItem(...args: readonly PortValue[]): PortValue | void;
  setQuantity(...args: readonly PortValue[]): PortValue | void;
  setQuantityRaw(...args: readonly PortValue[]): PortValue | void;
  setStatus(...args: readonly PortValue[]): PortValue | void;
  update(...args: readonly PortValue[]): PortValue | void;
  updateBatch(...args: readonly PortValue[]): PortValue | void;
}

export interface FlowPlanIteratorPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
  iternext(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/flowplan.cpp";
export const targetFile = "model/flowplan.ts";

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
  "namespace frepple {",
  "",
  "const MetaClass* FlowPlan::metadata;",
  "const MetaCategory* FlowPlan::metacategory;",
  "",
  "int FlowPlan::initialize() {",
  "  // Initialize the metadata",
  "  metacategory =",
  "      MetaCategory::registerCategory<FlowPlan>(\"flowplan\", \"flowplans\", reader);",
  "  metadata = MetaClass::registerClass<FlowPlan>(\"flowplan\", \"flowplan\", true);",
  "  registerFields<FlowPlan>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python type",
  "  auto& x = FreppleCategory<FlowPlan>::getPythonType();",
  "  x.setName(\"flowplan\");",
  "  x.setDoc(\"frePPLe flowplan\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "FlowPlan::FlowPlan(OperationPlan* opplan, const Flow* f)",
  "    : fl(const_cast<Flow*>(f)), oper(opplan) {",
  "  assert(opplan && f);",
  "",
  "  // Initialize the Python type",
  "  initType(metadata);",
  "",
  "  // Link the flowplan to the operationplan",
  "  if (opplan->firstflowplan) {",
  "    // Append to the end",
  "    FlowPlan* c = opplan->firstflowplan;",
  "    while (c->nextFlowPlan) c = c->nextFlowPlan;",
  "    c->nextFlowPlan = this;",
  "  } else",
  "    // First in the list",
  "    opplan->firstflowplan = this;",
  "",
  "  // Find the buffer",
  "  if (fl->getBuffer() && fl->getBuffer()->getItem() &&",
  "      fl->getBuffer()->getItem()->hasType<ItemMTO>()) {",
  "    buf = Buffer::findOrCreate(fl->getBuffer()->getItem(),",
  "                               fl->getBuffer()->getLocation(),",
  "                               opplan->getBatch());",
  "  } else",
  "    buf = fl->getBuffer();",
  "  assert(buf);",
  "",
  "  // Compute the flowplan quantity",
  "  auto fl_info = fl->getFlowplanDateQuantity(this);",
  "  buf->flowplans.insert(this, fl_info.second, fl_info.first);",
  "",
  "  // Mark the operation and buffer as having changed. This will trigger the",
  "  // recomputation of their problems",
  "  buf->setChanged();",
  "  fl->getOperation()->setChanged();",
  "}",
  "",
  "FlowPlan::FlowPlan(OperationPlan* opplan, const Flow* f, Date d, double q)",
  "    : fl(const_cast<Flow*>(f)), oper(opplan) {",
  "  assert(opplan && f);",
  "",
  "  // Initialize the Python type",
  "  initType(metadata);",
  "",
  "  // Link the flowplan to the operationplan",
  "  if (opplan->firstflowplan) {",
  "    // Append to the end",
  "    FlowPlan* c = opplan->firstflowplan;",
  "    while (c->nextFlowPlan) c = c->nextFlowPlan;",
  "    c->nextFlowPlan = this;",
  "  } else",
  "    // First in the list",
  "    opplan->firstflowplan = this;",
  "",
  "  // Find the buffer",
  "  if (fl->getBuffer() && fl->getBuffer()->getItem() &&",
  "      fl->getBuffer()->getItem()->hasType<ItemMTO>()) {",
  "    if (fl->getBuffer()->getItem()->hasType<ItemMTO>() && opplan->getBatch())",
  "      buf = Buffer::findOrCreate(fl->getBuffer()->getItem(),",
  "                                 fl->getBuffer()->getLocation(),",
  "                                 opplan->getBatch());",
  "  } else",
  "    buf = fl->getBuffer();",
  "  assert(buf);",
  "",
  "  // Compute the flowplan quantity",
  "  buf->flowplans.insert(this, q, d);",
  "",
  "  // Mark the operation and buffer as having changed. This will trigger the",
  "  // recomputation of their problems",
  "  buf->setChanged();",
  "  fl->getOperation()->setChanged();",
  "}",
  "",
  "string FlowPlan::getStatus() const {",
  "  if (flags & STATUS_CONFIRMED)",
  "    return \"confirmed\";",
  "  else",
  "    return \"proposed\";",
  "}",
  "",
  "void FlowPlan::setStatus(const string& s) {",
  "  if (getOperationPlan()->getProposed() && s == \"confirmed\")",
  "    throw DataException(",
  "        \"OperationPlanMaterial locked while OperationPlan is not\");",
  "  if (s == \"confirmed\")",
  "    flags |= STATUS_CONFIRMED;",
  "  else if (s == \"proposed\")",
  "    flags &= ~STATUS_CONFIRMED;",
  "  else",
  "    throw DataException(\"invalid operationplanmaterial status:\" + s);",
  "}",
  "",
  "void FlowPlan::update() {",
  "  // Update the timeline data structure",
  "  auto fl_info = fl->getFlowplanDateQuantity(this);",
  "  buf->flowplans.update(this, fl_info.second, fl_info.first);",
  "",
  "  // Mark the operation and buffer as having changed. This will trigger the",
  "  // recomputation of their problems",
  "  buf->setChanged();",
  "  fl->getOperation()->setChanged();",
  "}",
  "",
  "void FlowPlan::updateBatch() {",
  "  // Remove from the old buffer, if there is one",
  "  if (buf) {",
  "    buf->flowplans.erase(this);",
  "    buf->setChanged();",
  "  }",
  "",
  "  // Insert in the new buffer",
  "  PooledString batch = getOperationPlan()->getBatch();",
  "  if (fl->getBuffer()->getItem()->hasType<ItemMTO>() && batch)",
  "    buf = Buffer::findOrCreate(fl->getBuffer()->getItem(),",
  "                               fl->getBuffer()->getLocation(), batch);",
  "  else",
  "    buf = fl->getBuffer();",
  "  buf->flowplans.insert(this, getQuantity(), getDate());",
  "  buf->setChanged();",
  "}",
  "",
  "void FlowPlan::setBuffer(Buffer* newbuf) {",
  "  if (newbuf == buf) return;",
  "",
  "  if (!newbuf) throw DataException(\"Can't switch to nullptr buffer\");",
  "  if (!buf) throw DataException(\"Can't switch from nullptr buffer\");",
  "  if (newbuf->getItem() != buf->getItem() ||",
  "      newbuf->getLocation() != buf->getLocation())",
  "    throw DataException(",
  "        \"Flowplans can only switch to buffers with the same item and location\");",
  "",
  "  if (fl && fl->hasType<FlowTransferBatch>()) {",
  "    // Switch all flowplans of the same transfer batch",
  "    auto oldbuf = buf;",
  "    for (auto flpln = getOperationPlan()->beginFlowPlans();",
  "         flpln != getOperationPlan()->endFlowPlans(); ++flpln) {",
  "      if (flpln->buf != oldbuf) continue;",
  "",
  "      // Remove from the old buffer",
  "      flpln->buf->flowplans.erase(&*flpln);",
  "",
  "      // Insert in the new buffer",
  "      flpln->buf = newbuf;",
  "      flpln->buf->flowplans.insert(&*flpln, flpln->getQuantity(),",
  "                                   flpln->getDate());",
  "    }",
  "    oldbuf->setChanged();",
  "  } else {",
  "    // Remove from the old buffer",
  "    buf->flowplans.erase(this);",
  "    buf->setChanged();",
  "",
  "    // Insert in the new buffer",
  "    buf = newbuf;",
  "    buf->flowplans.insert(this, getQuantity(), getDate());",
  "  }",
  "  buf->setChanged();",
  "}",
  "",
  "void FlowPlan::setFlow(Flow* newfl) {",
  "  // No change",
  "  if (newfl == fl) return;",
  "",
  "  // Verify the data",
  "  if (!newfl) throw DataException(\"Can't switch to nullptr flow\");",
  "  if (newfl->getType() != fl->getType())",
  "    throw DataException(\"Flowplans can only switch to flows of the same type\");",
  "",
  "  PooledString batch;",
  "  if (buf) batch = buf->getBatch();",
  "  if (!newfl->hasType<FlowTransferBatch>() || !fl) {",
  "    // Remove from the old buffer, if there is one",
  "    if (fl) {",
  "      if (fl->getOperation() != newfl->getOperation())",
  "        throw DataException(",
  "            \"Only switching to a flow on the same operation is allowed\");",
  "      if (buf) {",
  "        buf->flowplans.erase(this);",
  "        buf->setChanged();",
  "      }",
  "    }",
  "",
  "    // Insert in the new buffer",
  "    fl = newfl;",
  "    auto fl_info = fl->getFlowplanDateQuantity(this);",
  "    if (fl->getBuffer()->getItem()->hasType<ItemMTO>() && !batch.empty())",
  "      buf = Buffer::findOrCreate(fl->getBuffer()->getItem(),",
  "                                 fl->getBuffer()->getLocation(), batch);",
  "    else",
  "      buf = fl->getBuffer();",
  "    buf->flowplans.insert(this, fl_info.second, fl_info.first);",
  "    buf->setChanged();",
  "    fl->getOperation()->setChanged();",
  "  } else {",
  "    // Switch all flowplans of the same transfer batch",
  "    auto oldFlow = fl;",
  "    if (oldFlow->getOperation() != newfl->getOperation())",
  "      throw DataException(",
  "          \"Only switching to a flow on the same operation is allowed\");",
  "    if (fl->getBuffer()->getItem()->hasType<ItemMTO>() && !batch.empty())",
  "      buf = Buffer::findOrCreate(fl->getBuffer()->getItem(),",
  "                                 fl->getBuffer()->getLocation(), batch);",
  "    else",
  "      buf = fl->getBuffer();",
  "    for (auto flpln = getOperationPlan()->beginFlowPlans();",
  "         flpln != getOperationPlan()->endFlowPlans(); ++flpln) {",
  "      if (flpln->getFlow() != oldFlow) continue;",
  "",
  "      // Remove from the old buffer",
  "      flpln->buf->flowplans.erase(&*flpln);",
  "      flpln->buf->setChanged();",
  "",
  "      // Insert in the new buffer",
  "      flpln->fl = newfl;",
  "      auto fl_info = flpln->fl->getFlowplanDateQuantity(&*flpln);",
  "      buf->flowplans.insert(&*flpln, fl_info.second, fl_info.first);",
  "      buf->setChanged();",
  "      flpln->fl->getOperation()->setChanged();",
  "    }",
  "  }",
  "}",
  "",
  "void FlowPlan::setItem(Item* newItem) {",
  "  // Verify the data",
  "  if (!newItem) throw DataException(\"Can't switch to nullptr flow\");",
  "",
  "  if (fl && fl->getBuffer()) {",
  "    if (newItem == fl->getBuffer()->getItem())",
  "      // No change",
  "      return;",
  "    else",
  "      // Already set",
  "      throw DataException(\"Item can be set only once on a flowplan\");",
  "  }",
  "",
  "  // We are not expecting to use this method in this way...",
  "  throw LogicException(\"Not implemented\");",
  "}",
  "",
  "void FlowPlan::setQuantityRaw(double q) {",
  "  if (buf) buf->flowplans.update(this, q, getDate());",
  "}",
  "",
  "pair<double, double> FlowPlan::setQuantity(double quantity, bool rounddown,",
  "                                           bool, bool execute, short mode) {",
  "  // TODO argument \"update\" isn't used",
  "  if (getConfirmed()) {",
  "    // Confirmed flowplans take any quantity, regardless of the",
  "    // quantity of the owning operationplan.",
  "    if (execute) {",
  "      // Update the timeline data structure",
  "      buf->flowplans.update(this, quantity, getDate());",
  "",
  "      // Mark the operation and buffer as having changed. This will trigger the",
  "      // recomputation of their problems",
  "      buf->setChanged();",
  "      fl->getOperation()->setChanged();",
  "    }",
  "    return make_pair(quantity, oper->getQuantity());",
  "  }",
  "",
  "  if (!getFlow()->getEffective().within(getDate())) {",
  "    if (execute) {",
  "      if (mode == 2 || (mode == 0 && getFlow()->hasType<FlowEnd>())) {",
  "        oper->setOperationPlanParameters(",
  "            0.0, Date::infinitePast, computeFlowToOperationDate(oper->getEnd()),",
  "            true, execute, rounddown);",
  "      } else if (mode == 1 || (mode == 0 && getFlow()->hasType<FlowStart>())) {",
  "        oper->setOperationPlanParameters(",
  "            0.0,",
  "            (mode == 1 && getFlow()->hasType<FlowEnd>())",
  "                ? oper->getStart()",
  "                : computeFlowToOperationDate(oper->getStart()),",
  "            Date::infinitePast, false, execute, rounddown);",
  "      }",
  "    }",
  "    return make_pair(0.0, 0.0);",
  "  }",
  "",
  "  double opplan_quantity;",
  "  bool less_than_fixed_qty =",
  "      fabs(getFlow()->getQuantityFixed()) &&",
  "      fabs(quantity) < fabs(getFlow()->getQuantityFixed()) + ROUNDING_ERROR;",
  "  if (getFlow()->getQuantity() == 0.0 || less_than_fixed_qty) {",
  "    // Fixed quantity flows only allow resizing to 0",
  "    if (less_than_fixed_qty && oper->getQuantity() != 0.0) {",
  "      if (mode == 2 || (mode == 0 && getFlow()->hasType<FlowEnd>()))",
  "        opplan_quantity = oper->setOperationPlanParameters(",
  "                                  0.0, Date::infinitePast,",
  "                                  computeFlowToOperationDate(oper->getEnd()),",
  "                                  true, execute, rounddown)",
  "                              .quantity;",
  "      else if (mode == 1 || (mode == 0 && getFlow()->hasType<FlowStart>()))",
  "        opplan_quantity =",
  "            oper->setOperationPlanParameters(",
  "                    0.0,",
  "                    (mode == 1 && getFlow()->hasType<FlowEnd>())",
  "                        ? oper->getStart()",
  "                        : computeFlowToOperationDate(oper->getStart()),",
  "                    Date::infinitePast, false, execute, rounddown)",
  "                .quantity;",
  "      else",
  "        throw LogicException(\"Unreachable code reached\");",
  "    } else if (!less_than_fixed_qty && oper->getQuantity() == 0.0) {",
  "      if (mode == 2 || (mode == 0 && getFlow()->hasType<FlowEnd>()))",
  "        opplan_quantity = oper->setOperationPlanParameters(",
  "                                  0.001, Date::infinitePast,",
  "                                  computeFlowToOperationDate(oper->getEnd()),",
  "                                  true, execute, rounddown)",
  "                              .quantity;",
  "      else if (mode == 1 || (mode == 0 && getFlow()->hasType<FlowStart>()))",
  "        opplan_quantity =",
  "            oper->setOperationPlanParameters(",
  "                    0.001,",
  "                    (mode == 1 && getFlow()->hasType<FlowEnd>())",
  "                        ? oper->getStart()",
  "                        : computeFlowToOperationDate(oper->getStart()),",
  "                    Date::infinitePast, false, execute, rounddown)",
  "                .quantity;",
  "      else",
  "        throw LogicException(\"Unreachable code reached\");",
  "    }",
  "  } else {",
  "    // Proportional or transfer batch flows",
  "    // For transfer batch flowplans the argument quantity is expected to be the",
  "    // total quantity of all batches.",
  "    if (mode == 2 || (mode == 0 && getFlow()->hasType<FlowEnd>()))",
  "      opplan_quantity = oper->setOperationPlanParameters(",
  "                                (quantity - getFlow()->getQuantityFixed()) /",
  "                                    getFlow()->getQuantity(),",
  "                                Date::infinitePast,",
  "                                (mode == 2 || getFlow()->hasType<FlowStart>())",
  "                                    ? oper->getEnd()",
  "                                    : computeFlowToOperationDate(getDate()),",
  "                                true, execute, rounddown)",
  "                            .quantity;",
  "    else if (mode == 1 || (mode == 0 && getFlow()->hasType<FlowStart>()))",
  "      opplan_quantity = oper->setOperationPlanParameters(",
  "                                (quantity - getFlow()->getQuantityFixed()) /",
  "                                    getFlow()->getQuantity(),",
  "                                (mode == 1 || getFlow()->hasType<FlowEnd>())",
  "                                    ? oper->getStart()",
  "                                    : computeFlowToOperationDate(getDate()),",
  "                                Date::infinitePast, false, execute, rounddown)",
  "                            .quantity;",
  "    else",
  "      throw LogicException(\"Unreachable code reached\");",
  "  }",
  "",
  "  if (execute && oper->getOwner()) {",
  "    // Update all sibling operationplans",
  "    for (auto i = oper->getOwner()->firstsubopplan; i; i = i->nextsubopplan)",
  "      if (i != oper) i->update();",
  "  }",
  "",
  "  if (opplan_quantity)",
  "    return make_pair(opplan_quantity * getFlow()->getQuantity() +",
  "                         getFlow()->getQuantityFixed(),",
  "                     opplan_quantity);",
  "  else",
  "    return make_pair(0.0, 0.0);",
  "}",
  "",
  "int FlowPlanIterator::initialize() {",
  "  // Initialize the type",
  "  auto& x = PythonExtension<FlowPlanIterator>::getPythonType();",
  "  x.setName(\"flowplanIterator\");",
  "  x.setDoc(\"frePPLe iterator for flowplan\");",
  "  x.supportiter();",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* FlowPlanIterator::iternext() {",
  "  FlowPlan* fl;",
  "  if (buffer_or_opplan) {",
  "    // Skip uninteresting entries",
  "    while (*bufiter != buf->getFlowPlans().end() &&",
  "           (*bufiter)->getQuantity() == 0.0)",
  "      ++(*bufiter);",
  "    if (*bufiter == buf->getFlowPlans().end()) return nullptr;",
  "    fl = const_cast<FlowPlan*>(static_cast<const FlowPlan*>(&*((*bufiter)++)));",
  "  } else {",
  "    // Skip uninteresting entries",
  "    while (*opplaniter != opplan->endFlowPlans() &&",
  "           (*opplaniter)->getQuantity() == 0.0)",
  "      ++(*opplaniter);",
  "    if (*opplaniter == opplan->endFlowPlans()) return nullptr;",
  "    fl = static_cast<FlowPlan*>(&*((*opplaniter)++));",
  "  }",
  "  Py_INCREF(fl);",
  "  return const_cast<FlowPlan*>(fl);",
  "}",
  "",
  "Object* FlowPlan::reader(const MetaClass*, const DataValueDict& in,",
  "                         CommandManager*) {",
  "  // Pick up the operationplan attribute. An error is reported if it's missing.",
  "  const DataValue* opplanElement = in.get(Tags::operationplan);",
  "  if (!opplanElement) throw DataException(\"Missing operationplan field\");",
  "  Object* opplanobject = opplanElement->getObject();",
  "  if (!opplanobject || !opplanobject->hasType<OperationPlan>())",
  "    throw DataException(\"Invalid operationplan field\");",
  "  auto* opplan = static_cast<OperationPlan*>(opplanobject);",
  "",
  "  // Pick up the item.",
  "  const DataValue* itemElement = in.get(Tags::item);",
  "  if (!itemElement) throw DataException(\"Item must be provided\");",
  "  Object* itemobject = itemElement->getObject();",
  "  if (!itemobject || itemobject->getType().category != Item::metadata)",
  "    throw DataException(\"Invalid item field\");",
  "  Item* itm = static_cast<Item*>(itemobject);",
  "",
  "  // Find the flow for this item on the operationplan.",
  "  // If multiple exist, we pick up the first one.",
  "  // TODO detect situations where the flowplan is on an alternate material",
  "  auto flplniter = opplan->getFlowPlans();",
  "  FlowPlan* flpln;",
  "  while ((flpln = flplniter.next())) {",
  "    if (flpln->getItem() == itm) return flpln;",
  "  }",
  "  OperationPlan* correctowner = nullptr;",
  "  Flow* correctflow = nullptr;",
  "  for (auto& f : opplan->getOperation()->getFlows()) {",
  "    if (f.getItem() == itm) {",
  "      correctowner = opplan;",
  "      correctflow = const_cast<Flow*>(&f);",
  "      break;",
  "    }",
  "  }",
  "  auto subopplans = opplan->getSubOperationPlans();",
  "  OperationPlan* firstChildOpplan = nullptr;",
  "  while (auto subopplan = subopplans.next()) {",
  "    if (!firstChildOpplan) firstChildOpplan = subopplan;",
  "    auto subflplniter = subopplan->getFlowPlans();",
  "    FlowPlan* subflpln;",
  "    while ((subflpln = subflplniter.next())) {",
  "      if (subflpln->getItem() == itm) return subflpln;",
  "    }",
  "    if (!correctowner)",
  "      for (auto& f : subopplan->getOperation()->getFlows()) {",
  "        if (f.getItem() == itm) {",
  "          correctowner = subopplan;",
  "          correctflow = const_cast<Flow*>(&f);",
  "          break;",
  "        }",
  "      }",
  "  }",
  "",
  "  // No existing flowplans is found, create a new one.",
  "  // TODO code assumes consuming flowplans",
  "  if (correctowner) opplan = correctowner;",
  "  if (!correctowner && firstChildOpplan) opplan = firstChildOpplan;",
  "  auto loc = opplan->getLocation();",
  "  if (!loc) {",
  "    loc = opplan->getOperation()->getLocation();",
  "    if (!loc) return nullptr;",
  "  }",
  "  auto buf = Buffer::findOrCreate(itm, loc, opplan->getBatch());",
  "  if (!correctflow) {",
  "    correctflow = new FlowStart(opplan->getOperation(), buf, -1);",
  "    correctflow->setHidden(true);",
  "    correctflow->setEffectiveEnd(Date::infinitePast);",
  "  }",
  "  return new FlowPlan(opplan, correctflow);",
  "}",
  "",
  "PyObject* FlowPlan::create(PyTypeObject*, PyObject* , PyObject* kwds) {",
  "  try {",
  "    // Find or create the C++ object",
  "    PythonDataValueDict atts(kwds);",
  "    Object* x = reader(FlowPlan::metadata, atts, nullptr);",
  "    if (!x) {",
  "      Py_INCREF(Py_None);",
  "      return Py_None;",
  "    }",
  "    Py_INCREF(x);",
  "",
  "    // Iterate over extra keywords, and set attributes.",
  "    if (x) {",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        if (!attr.isA(Tags::operationplan) && !attr.isA(Tags::item)) {",
  "          const MetaFieldBase* fmeta = x->getType().findField(attr.getHash());",
  "          if (!fmeta && x->getType().category)",
  "            fmeta = x->getType().category->findField(attr.getHash());",
  "          if (fmeta)",
  "            // Update the attribute",
  "            fmeta->setField(x, field);",
  "          else",
  "            x->setProperty(attr.getName(), value);",
  "        }",
  "      };",
  "    }",
  "    return x;",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "Duration FlowPlan::getPeriodOfCover() const {",
  "  // Case 1: If the backlog is more than the onhand => period of cover is 0",
  "  // We consider the initial stock - all confirmed consumptions - all overdue",
  "  // demand",
  "  double left_for_consumption = getBuffer()->getOnHand();",
  "  auto fpiter = getBuffer()->getFlowPlans().begin(this);",
  "  fpiter++;",
  "  bool found = false;",
  "  while (fpiter != getBuffer()->getFlowPlans().end()) {",
  "    // subtract deliveries",
  "    if (fpiter->getQuantity() < 0.0 && fpiter->getDate() >= getDate() &&",
  "        fpiter->getOperationPlan()",
  "            ->getOperation()",
  "            ->hasType<OperationDelivery>() &&",
  "        fpiter->getOperationPlan()->getDemand()->getDue() < getDate()) {",
  "      left_for_consumption += fpiter->getQuantity();",
  "      found = true;",
  "    }",
  "    // add confirmed/completed/approved replenishments",
  "    if (fpiter->getQuantity() > 0.0 &&",
  "        fpiter->getDate() <= getDate() + Duration(1L) &&",
  "        (fpiter->getOperationPlan()->getStatus() == \"approved\" ||",
  "         fpiter->getOperationPlan()->getStatus() == \"confirmed\" ||",
  "         fpiter->getOperationPlan()->getStatus() == \"completed\"))",
  "      left_for_consumption += fpiter->getQuantity();",
  "    ++fpiter;",
  "  }",
  "  if (found && left_for_consumption < ROUNDING_ERROR) return Duration(0L);",
  "",
  "  // Case 2: Regular case",
  "  left_for_consumption = getOnhand();",
  "  if (left_for_consumption > 0) {",
  "    auto fpiter2 = getBuffer()->getFlowPlans().begin(this);",
  "    ++fpiter2;",
  "    while (fpiter2 != getBuffer()->getFlowPlans().end()) {",
  "      if (fpiter2->getQuantity() < 0.0) {",
  "        left_for_consumption += fpiter2->getQuantity();",
  "        if (left_for_consumption < ROUNDING_ERROR)",
  "          return fpiter2->getDate() - getDate();",
  "      }",
  "      ++fpiter2;",
  "    }",
  "  } else {",
  "    // Case 3:",
  "    // On hand is 0 so we display the next consumer's date",
  "    auto fpiter2 = getBuffer()->getFlowPlans().begin(this);",
  "    ++fpiter2;",
  "    while (fpiter2 != getBuffer()->getFlowPlans().end()) {",
  "      if (fpiter2->getQuantity() < 0.0) {",
  "        return max(0L, fpiter2->getDate() - getDate() -",
  "                           fpiter2->getOperationPlan()->getDelay());",
  "      }",
  "      ++fpiter2;",
  "    }",
  "  }",
  "",
  "  return Duration(999L * 86400L);",
  "}",
  "",
  "bool FlowPlan::getFeasible() const {",
  "  if (getBuffer()->hasType<BufferInfinite>()) return true;",
  "  auto flplaniter = getBuffer()->getFlowPlans();",
  "  for (auto cur = flplaniter.begin(this); cur != flplaniter.end(); ++cur) {",
  "    if (cur->getOnhand() < -ROUNDING_ERROR && cur->isLastOnDate())",
  "      // Material shortage",
  "      return false;",
  "  }",
  "  return true;",
  "}",
  "",
  "}  // namespace frepple",
];
