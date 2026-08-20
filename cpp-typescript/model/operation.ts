// <header-api-generated>
export const OperationCppModel = { bases: ["HasDescription","HasLevel","HasName","Plannable"] as const, methods: ["addDependency","addSubOperationPlan","calculateOperationTime","collectCalendars","createOperationPlan","deleteOperationPlans","findFlow","findFromName","findLoad","getAvailable","getBatchWindow","getBlockedbyIterator","getBlockingIterator","getCost","getDecoupledLeadTime","getDecoupledLeadTimePython","getDependencies","getEffective","getEffectiveEnd","getEffectiveStart","getFence","getFencePython","getFirstOpPlan","getFlowIterator","getFlows","getHidden","getItem","getLastOpPlan","getLoadIterator","getLoads","getLocation","getMTO","getMaxEarly","getNoLocationCalendar","getOperationPlans","getOrderType","getOwner","getPostTime","getPriority","getSearch","getSizeMaximum","getSizeMinimum","getSizeMinimumCalendar","getSizeMultiple","getSubOperationIterator","getSubOperations","hasSubOperations","initialize","registerFields","removeDependency","setAvailable","setBatchWindow","setCost","setEffective","setEffectiveEnd","setEffectiveStart","setFence","setFencePython","setHidden","setItem","setLocation","setNoLocationCalendar","setOperationPlanParameters","setOperationPlanQuantity","setPostTime","setPriority","setSearch","setSizeMaximum","setSizeMinimum","setSizeMinimumCalendar","setSizeMultiple","solve","updateMTO","updateProblems"] as const, qualifiedNames: ["Operation"] as const };

export const OperationAlternateCppModel = { bases: ["Operation"] as const, methods: ["addSubOperationPlan","getDecoupledLeadTime","getMaxEarly","getOrderType","getSize","getSubOperations","getType","hasSubOperations","initialize","registerFields","setOperationPlanParameters","solve"] as const, qualifiedNames: ["OperationAlternate"] as const };

export const OperationDeliveryCppModel = { bases: ["OperationFixedTime"] as const, methods: ["getBuffer","getOrderType","getType","initialize","registerFields","setBuffer"] as const, qualifiedNames: ["OperationDelivery"] as const };

export const OperationFixedTimeCppModel = { bases: ["Operation"] as const, methods: ["getDecoupledLeadTime","getDuration","getType","initialize","registerFields","setDuration","setOperationPlanParameters","solve"] as const, qualifiedNames: ["OperationFixedTime"] as const };

export const OperationInventoryCppModel = { bases: ["OperationFixedTime"] as const, methods: ["getBuffer","getOrderType","getType","initialize","registerFields"] as const, qualifiedNames: ["OperationInventory"] as const };

export const OperationRoutingCppModel = { bases: ["Operation"] as const, methods: ["addSubOperationPlan","getDecoupledLeadTime","getHardPostTime","getMaxEarly","getSize","getSubOperations","getType","hasSubOperations","initialize","registerFields","setHardPostTime","setOperationPlanParameters","setOperationPlanQuantity","solve","useDependencies"] as const, qualifiedNames: ["OperationRouting"] as const };

export const OperationSplitCppModel = { bases: ["Operation"] as const, methods: ["addSubOperationPlan","getDecoupledLeadTime","getMaxEarly","getSize","getSubOperations","getType","hasSubOperations","initialize","registerFields","setOperationPlanParameters","solve"] as const, qualifiedNames: ["OperationSplit"] as const };

export const OperationTimePerCppModel = { bases: ["Operation"] as const, methods: ["getDecoupledLeadTime","getDuration","getDurationPer","getType","initialize","registerFields","setDuration","setDurationPer","setOperationPlanParameters","solve"] as const, qualifiedNames: ["OperationTimePer"] as const };
// </header-api-generated>










import { Date as PlanningDate, DateRange, Duration } from "../utils/date.js";
import { DataException, Environment, HeaderModelAdapter, LogicException, ModelEntity } from "../utils/library.js";
import type { Buffer } from "./buffer.js";
import type { Calendar } from "./calendar.js";
import type { Item } from "./item.js";
import type { Location } from "./location.js";
import type { Resource } from "./resource.js";
import type { SetupEvent, SetupMatrixRule } from "./setupmatrix.js";
import { OperationPlan } from "./operationplan.js";
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
import { updateOperationProblems } from "./problems_operationplan.js";

type DurationInput = Duration | number | string;
type DateInput = PlanningDate | number | string;
type DurationSink = { value?: Duration } | Duration[] | null;

const ROUNDING_ERROR = 0.000001;

export interface OperationSetupInfo {
  readonly resource: Resource | null;
  readonly rule: SetupMatrixRule | null;
  readonly setup: string;
  readonly previousEvent: SetupEvent | null;
}

function asDate(value: DateInput): PlanningDate {
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
}

function asDuration(value: DurationInput): Duration {
  return value instanceof Duration ? new Duration(value) : new Duration(value);
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

function setDurationSink(sink: DurationSink | undefined, value: Duration): void {
  if (!sink) return;
  if (Array.isArray(sink)) sink[0] = new Duration(value);
  else sink.value = new Duration(value);
}

function operationPlanState(operationPlan: unknown, quantity: number, start: PlanningDate, end: PlanningDate): Record<string, unknown> {
  return { operationPlan, quantity, start: new PlanningDate(start), end: new PlanningDate(end) };
}

/** Ordering used by the native intrusive OperationPlan list. */
export function compareOperationPlans(left: HeaderModelAdapter, right: HeaderModelAdapter): number {
  if (left === right) return 0;
  const leftOperation = call(left, "getOperation");
  const rightOperation = call(right, "getOperation");
  if (leftOperation !== rightOperation) {
    const leftName = String(call(leftOperation, "getName") ?? "");
    const rightName = String(call(rightOperation, "getName") ?? "");
    if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  }
  const leftSetupEnd = call(left, "getSetupEnd");
  const rightSetupEnd = call(right, "getSetupEnd");
  if (leftSetupEnd instanceof PlanningDate && rightSetupEnd instanceof PlanningDate) {
    const comparison = leftSetupEnd.compare(rightSetupEnd);
    if (comparison) return comparison;
  }
  const quantity = Number(call(right, "getQuantity") ?? 0) - Number(call(left, "getQuantity") ?? 0);
  if (Math.abs(quantity) > ROUNDING_ERROR) return quantity;
  const leftActivated = Boolean(call(left, "getActivated"));
  const rightActivated = Boolean(call(right, "getActivated"));
  if (leftActivated !== rightActivated) return leftActivated ? -1 : 1;
  const leftEnd = call(left, "getEnd");
  const rightEnd = call(right, "getEnd");
  if (leftEnd instanceof PlanningDate && rightEnd instanceof PlanningDate) {
    const comparison = leftEnd.compare(rightEnd);
    if (comparison) return comparison;
  }
  const leftReference = String(Reflect.get(left, "reference") ?? "");
  const rightReference = String(Reflect.get(right, "reference") ?? "");
  const generated = Boolean(Reflect.get(left, "generatedReference")) && Boolean(Reflect.get(right, "generatedReference"));
  if (!generated && leftReference !== rightReference) return leftReference < rightReference ? -1 : 1;
  return Number(Reflect.get(left, "comparisonSequence") ?? 0) - Number(Reflect.get(right, "comparisonSequence") ?? 0);
}

/** Semantic port of the common operation model and its calendar arithmetic. */
export class Operation extends ModelEntity<Operation> {
  static readonly cppBases: readonly string[] = ["HasDescription", "HasLevel", "HasName", "Plannable"];
  static readonly cppQualifiedNames: readonly string[] = ["Operation"];
  static override modelFamily = "Operation";
  private location: Location | null = null;
  private item: Item | null = null;
  private available: Calendar | null = null;
  private sizeMinimumCalendar: Calendar | null = null;
  private postTime = new Duration();
  private cost = 0;
  private fence = new Duration();
  private batchWindow = new Duration();
  private sizeMinimum = 1;
  private sizeMultiple = 0;
  private sizeMaximum = Number.MAX_VALUE;
  private priority = 1;
  private effectivity = new DateRange();
  private search = "PRIORITY";
  private noLocationCalendar = false;
  private mto = false;
  private readonly operationPlans: HeaderModelAdapter[] = [];
  private readonly subOperations: HeaderModelAdapter[] = [];
  private readonly dependencies: HeaderModelAdapter[] = [];
  private cluster = 0;
  private level = 0;

  constructor(nameOrFields?: string | Readonly<Record<string, unknown>>) {
    super(nameOrFields);
    registerProblemEntity(this);
    HasLevel.triggerLazyRecomputation();
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static findFromName(name: string): Operation | undefined { return Operation.find(name); }
  override getType(): string { return "operation"; }
  getOrderType(): string { return "MO"; }
  getLocation(): Location | null { return this.location; }
  setLocation(value: Location | null): void {
    link(this, "Location", this.location as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.location = value;
  }
  getItem(): Item | null { return this.item; }
  setItem(value: Item | null): void {
    link(this, "Item", this.item as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.item = value;
    this.updateMTO();
  }
  getAvailable(): Calendar | null { return this.available; }
  setAvailable(value: Calendar | null): void {
    link(this, "Available", this.available as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.available = value;
  }
  getSizeMinimumCalendar(): Calendar | undefined { return this.sizeMinimumCalendar ?? undefined; }
  setSizeMinimumCalendar(value: Calendar | null): void {
    link(this, "SizeMinimumCalendar", this.sizeMinimumCalendar as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.sizeMinimumCalendar = value;
  }
  getPostTime(): Duration { return new Duration(this.postTime); }
  setPostTime(value: DurationInput): void {
    const next = asDuration(value);
    if (next.seconds < 0) Environment.log("Warning: No negative post-operation time allowed");
    else this.postTime = next;
  }
  getCost(): number { return this.cost; }
  setCost(value: number): void { this.cost = Math.max(Number(value), 0); }
  getFence(): Duration { return new Duration(this.fence); }
  setFence(value: DurationInput | PlanningDate): void {
    if (value instanceof PlanningDate) {
      const current = PlanningDate.now();
      const actual: Duration[] = [];
      this.calculateOperationTime(null, current, value, actual, true);
      this.fence = actual[0] ?? new Duration();
    } else this.fence = asDuration(value);
  }
  setFencePython(value: DateInput): void { this.setFence(asDate(value)); }
  getFencePython(): PlanningDate { return this.calculateOperationTime(null, PlanningDate.now(), this.fence, true, null, true).getEnd(); }
  getBatchWindow(): Duration { return new Duration(this.batchWindow); }
  setBatchWindow(value: DurationInput): void { this.batchWindow = asDuration(value); }
  getSizeMinimum(): number { return this.sizeMinimum; }
  setSizeMinimum(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: Operation can't have a negative minimum size");
    else this.sizeMinimum = Number(value);
  }
  getSizeMultiple(): number { return this.sizeMultiple; }
  setSizeMultiple(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: Operation can't have a negative multiple size");
    else this.sizeMultiple = Number(value);
  }
  getSizeMaximum(): number { return this.sizeMaximum; }
  setSizeMaximum(value: number): void {
    const next = Number(value);
    if (next < this.sizeMinimum) Environment.log("Warning: Operation maximum size must be higher than the minimum size");
    else if (next <= 0) Environment.log("Warning: Operation maximum size must be positive");
    else this.sizeMaximum = next;
  }
  getPriority(): number { return this.priority; }
  setPriority(value: number): void { this.priority = Math.trunc(Number(value)); }
  getEffective(): DateRange { return new DateRange(this.effectivity.getStart(), this.effectivity.getEnd()); }
  getEffectiveStart(): PlanningDate { return this.effectivity.getStart(); }
  getEffectiveEnd(): PlanningDate { return this.effectivity.getEnd(); }
  setEffective(value: DateRange): void { this.effectivity = new DateRange(value.getStart(), value.getEnd()); }
  setEffectiveStart(value: DateInput): void { this.effectivity.setStart(asDate(value)); }
  setEffectiveEnd(value: DateInput): void { this.effectivity.setEnd(asDate(value)); }
  getSearch(): string { return this.search; }
  setSearch(value: string): void {
    const next = String(value).toUpperCase().replaceAll("-", "").replaceAll("_", "");
    const modes: Readonly<Record<string, string>> = {
      PRIORITY: "PRIORITY", MINCOST: "MINCOST", MINPENALTY: "MINPENALTY", MINCOSTPENALTY: "MINCOSTPENALTY",
    };
    const mode = modes[next];
    if (!mode) throw new LogicException("Invalid search mode");
    this.search = mode;
  }
  getNoLocationCalendar(): boolean { return this.noLocationCalendar; }
  setNoLocationCalendar(value: boolean): void { this.noLocationCalendar = Boolean(value); }
  getMTO(): boolean { return this.mto; }
  getCluster(): number { HasLevel.getNumberOfClusters(); return this.cluster; }
  getLevel(): number { HasLevel.getNumberOfLevels(); return this.level; }
  setCluster(value: number): void { this.cluster = Math.trunc(Number(value)); }
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
  override setOwner(owner: Operation | null): void {
    super.setOwner(owner);
    HasLevel.triggerLazyRecomputation();
  }
  updateMTO(): void {
    const type = this.item?.constructor.name ?? "";
    this.mto = type === "ItemMTO" || this.getFlows().some((flow) => Boolean(call(call(flow, "getBuffer"), "getBatch")));
  }
  getFlows(): HeaderModelAdapter[] { return this.referencedBy("Operation").filter((entry) => entry.constructor.name.startsWith("Flow")); }
  getFlowIterator(): IterableIterator<HeaderModelAdapter> { return this.getFlows().values(); }
  getLoads(): HeaderModelAdapter[] { return this.referencedBy("Operation").filter((entry) => entry.constructor.name.startsWith("Load")); }
  getLoadIterator(): IterableIterator<HeaderModelAdapter> { return this.getLoads().values(); }
  getOperationPlans(): IterableIterator<HeaderModelAdapter> {
    return [...this.operationPlans].sort(compareOperationPlans).values();
  }
  getFirstOpPlan(): HeaderModelAdapter | null { return this.getOperationPlans().next().value ?? null; }
  getLastOpPlan(): HeaderModelAdapter | null { return [...this.getOperationPlans()].at(-1) ?? null; }
  attachOperationPlan(value: HeaderModelAdapter): void { if (!this.operationPlans.includes(value)) this.operationPlans.push(value); }
  detachOperationPlan(value: HeaderModelAdapter): void {
    const index = this.operationPlans.indexOf(value);
    if (index >= 0) this.operationPlans.splice(index, 1);
  }
  getSubOperations(): HeaderModelAdapter[] { return [...this.subOperations]; }
  getSubOperationIterator(): IterableIterator<HeaderModelAdapter> { return this.getSubOperations().values(); }
  hasSubOperations(): boolean { return this.subOperations.length > 0; }
  attachSubOperation(value: HeaderModelAdapter): void { if (!this.subOperations.includes(value)) this.subOperations.push(value); }
  sortSubOperations(): void {
    this.subOperations.sort((first, second) => Number(call(first, "getPriority") ?? 1) - Number(call(second, "getPriority") ?? 1));
  }
  detachSubOperation(value: HeaderModelAdapter): void {
    const index = this.subOperations.indexOf(value);
    if (index >= 0) this.subOperations.splice(index, 1);
  }
  getDependencies(): readonly HeaderModelAdapter[] { return this.dependencies; }
  addDependency(value: HeaderModelAdapter): void {
    if (this.dependencies.includes(value)) return;
    const operation = call(value, "getOperation");
    const blockedBy = call(value, "getBlockedBy");
    if (operation && blockedBy) {
      const duplicate = this.dependencies.find((entry) => entry !== value &&
        call(entry, "getOperation") === operation && call(entry, "getBlockedBy") === blockedBy);
      if (duplicate) throw new LogicException(`Duplicate dependency between '${String(call(operation, "getName") ?? "")}' and '${String(call(blockedBy, "getName") ?? "")}'`);
    }
    this.dependencies.push(value);
  }
  removeDependency(value: HeaderModelAdapter): void {
    const index = this.dependencies.indexOf(value);
    if (index >= 0) this.dependencies.splice(index, 1);
  }
  getBlockingIterator(): IterableIterator<HeaderModelAdapter> {
    return this.dependencies.filter((entry) => call(entry, "getBlockedBy") === this).values();
  }
  getBlockedbyIterator(): IterableIterator<HeaderModelAdapter> {
    return this.dependencies.filter((entry) => call(entry, "getOperation") === this).values();
  }
  findFlow(buffer: Buffer, date: DateInput = PlanningDate.infinitePast): HeaderModelAdapter | null {
    const requested = asDate(date);
    for (const flow of this.getFlows()) {
      const effective = call(flow, "getEffective");
      if (effective instanceof DateRange && !effective.within(requested)) continue;
      const flowBuffer = call(flow, "getBuffer");
      if (flowBuffer === buffer) return flow;
      const flowItem = call(flow, "getItem");
      if (!flowBuffer && flowItem === call(buffer, "getItem") && this.location === call(buffer, "getLocation")) return flow;
      if (flowBuffer && call(buffer, "getBatch") && flowItem === call(buffer, "getItem") &&
          call(flowBuffer, "getLocation") === call(buffer, "getLocation") && !call(flowBuffer, "getBatch")) return flow;
    }
    return null;
  }
  findLoad(resource: Resource, date: DateInput = PlanningDate.infinitePast): HeaderModelAdapter | null {
    const requested = asDate(date);
    return this.getLoads().find((load) => {
      const effective = call(load, "getEffective");
      return call(load, "getResource") === resource && (!(effective instanceof DateRange) || effective.within(requested));
    }) ?? null;
  }
  getMaxEarly(): Duration {
    let seconds = Duration.MAX.seconds;
    for (const load of this.getLoads()) {
      const resource = call(load, "getResource");
      const candidate = call(resource, "getMaxEarly");
      if (candidate instanceof Duration) seconds = Math.min(seconds, candidate.seconds);
    }
    return new Duration(seconds);
  }
  getDecoupledLeadTime(_quantity = 0, date: DateInput = PlanningDate.infinitePast): readonly [Duration, PlanningDate] {
    return [new Duration(), asDate(date)];
  }
  getDecoupledLeadTimePython(quantity = 0, date: DateInput = PlanningDate.infinitePast): readonly [Duration, PlanningDate] {
    return this.getDecoupledLeadTime(quantity, date);
  }
  private collectCalendarModels(operationPlan: unknown, considerResources: boolean): Calendar[] {
    const calendars: Calendar[] = [];
    const append = (candidate: unknown): void => {
      if (candidate && typeof candidate === "object" && !calendars.includes(candidate as Calendar)) calendars.push(candidate as Calendar);
    };
    append(this.available);
    if (!this.noLocationCalendar) append(call(this.location, "getAvailable"));
    if (!considerResources) return calendars;
    const plans = call(operationPlan, "getLoadPlans");
    const usingLoadPlans = Boolean(plans && typeof (plans as Iterable<unknown>)[Symbol.iterator] === "function");
    const sources = usingLoadPlans ? plans as Iterable<unknown> : this.getLoads();
    for (const source of sources) {
      if (usingLoadPlans && Number(call(source, "getQuantity") ?? 0) > 0) continue;
      const resource = call(source, "getResource");
      append(call(resource, "getAvailable"));
      if (!this.noLocationCalendar) append(call(call(resource, "getLocation"), "getAvailable"));
      if (calendars.length > 9) throw new LogicException(`Excessive number of calendars on operation '${this.getName()}'`);
    }
    return calendars;
  }
  collectCalendars(_target: unknown[], _start: DateInput, operationPlan: unknown = null, _forward = true, considerResources = true): number {
    return this.collectCalendarModels(operationPlan, considerResources).length;
  }
  private calendarBoundaries(calendars: readonly Calendar[], start: PlanningDate, end: PlanningDate): number[] {
    const low = Math.min(start.getTicks(), end.getTicks());
    const high = Math.max(start.getTicks(), end.getTicks());
    const values = new Set<number>([low, high]);
    for (const calendar of calendars) {
      const events = call(calendar, "eventSnapshot", start);
      if (!Array.isArray(events)) continue;
      for (const event of events) {
        if (!Array.isArray(event) || !(event[0] instanceof PlanningDate)) continue;
        const ticks = event[0].getTicks();
        if (ticks > low && ticks < high) values.add(ticks);
      }
    }
    return [...values].sort((left, right) => left - right);
  }
  private calendarsAvailable(calendars: readonly Calendar[], ticks: number): boolean {
    const date = new PlanningDate(ticks);
    return calendars.every((calendar) => Number(call(calendar, "getValue", date, true) ?? 0) !== 0);
  }
  calculateOperationTime(operationPlan: unknown, start: DateInput, endOrDuration: DateInput | Duration, forwardOrActual: boolean | DurationSink = true,
    actualOrConsider: DurationSink | boolean = null, considerResources = true): DateRange {
    const begin = asDate(start);
    const calendars = this.collectCalendarModels(operationPlan, typeof actualOrConsider === "boolean" ? actualOrConsider : considerResources);
    if (!(endOrDuration instanceof Duration)) {
      const end = asDate(endOrDuration);
      const low = begin.compare(end) <= 0 ? begin : end;
      const high = begin.compare(end) <= 0 ? end : begin;
      if (!calendars.length) {
        setDurationSink(typeof forwardOrActual === "boolean" ? null : forwardOrActual, high.subtract(low));
        return new DateRange(low, high);
      }
      const boundaries = this.calendarBoundaries(calendars, low, high);
      let actual = 0;
      let first: number | null = null;
      let last: number | null = null;
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const left = boundaries[index];
        const right = boundaries[index + 1];
        if (left === undefined || right === undefined || !this.calendarsAvailable(calendars, left)) continue;
        first ??= left;
        last = right;
        actual += right - left;
      }
      const sink = typeof forwardOrActual === "boolean" ? null : forwardOrActual;
      setDurationSink(sink, new Duration(actual));
      return new DateRange(new PlanningDate(first ?? low), new PlanningDate(last ?? low));
    }
    let seconds = endOrDuration.seconds;
    let forward = typeof forwardOrActual === "boolean" ? forwardOrActual : true;
    const sink = typeof actualOrConsider === "boolean" ? null : actualOrConsider;
    if (seconds < 0) { seconds = -seconds; forward = !forward; }
    if (!calendars.length) {
      const other = forward ? begin.add(new Duration(seconds)) : begin.subtract(new Duration(seconds));
      setDurationSink(sink, new Duration(seconds));
      return forward ? new DateRange(begin, other) : new DateRange(other, begin);
    }
    const limit = forward ? PlanningDate.infiniteFuture : PlanningDate.infinitePast;
    const boundaries = this.calendarBoundaries(calendars, begin, limit);
    if (!forward) boundaries.reverse();
    let remaining = seconds;
    let first: number | null = null;
    let last: number | null = null;
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const current = boundaries[index];
      const next = boundaries[index + 1];
      if (current === undefined || next === undefined) continue;
      const sample = forward ? current : Math.max(next, PlanningDate.infinitePast.getTicks());
      if (!this.calendarsAvailable(calendars, sample)) continue;
      const span = Math.abs(next - current);
      first ??= current;
      if (remaining <= span) {
        last = forward ? current + remaining : current - remaining;
        remaining = 0;
        break;
      }
      remaining -= span;
      last = next;
    }
    const consumed = seconds - remaining;
    setDurationSink(sink, new Duration(consumed));
    const anchor = first ?? begin.getTicks();
    const finish = last ?? anchor;
    return forward ? new DateRange(new PlanningDate(anchor), new PlanningDate(finish)) : new DateRange(new PlanningDate(finish), new PlanningDate(anchor));
  }
  calculateSetup(operationPlan: unknown, setupEnd: DateInput, setupEvent: SetupEvent | null = null): OperationSetupInfo {
    const empty: OperationSetupInfo = { resource: null, rule: null, setup: "", previousEvent: null };
    const loads = this.getLoads();
    if (!operationPlan || !loads.length || Number(call(operationPlan, "getQuantity") ?? 0) === 0 ||
      Boolean(call(operationPlan, "getNoSetup"))) return empty;

    const loadPlansValue = call(operationPlan, "getLoadPlans");
    const loadPlans = loadPlansValue && typeof (loadPlansValue as Iterable<unknown>)[Symbol.iterator] === "function"
      ? [...loadPlansValue as Iterable<unknown>] : [];
    let found = false;
    const calculate = (resourceValue: unknown, loadValue: unknown, useEventBefore: boolean): OperationSetupInfo | null => {
      const resource = resourceValue as Resource | null;
      const setup = String(call(loadValue, "getSetup") ?? "");
      const matrix = call(resource, "getSetupMatrix") as { calculateSetup(oldSetup: string, newSetup: string, resource: Resource): SetupMatrixRule | null } | undefined;
      if (!resource || !setup || !matrix) return null;
      if (found) throw new DataException("Only a single resource with a setup matrix is allowed per operation");
      found = true;
      if (Boolean(call(resource, "getFrozenSetups"))) {
        const current = call(operationPlan, "getSetupEvent") as SetupEvent | null;
        return current ? { resource, rule: call(current, "getRule") as SetupMatrixRule | null, setup, previousEvent: null } : empty;
      }
      const previous = (useEventBefore && setupEvent
        ? call(setupEvent, "getSetupBefore")
        : call(resource, "getSetupAt", asDate(setupEnd), operationPlan)) as SetupEvent | null;
      const rule = matrix.calculateSetup(String(call(previous, "getSetup") ?? ""), setup, resource);
      return { resource, rule, setup, previousEvent: previous };
    };

    if (!loadPlans.length) {
      for (const load of loads) {
        const result = calculate(call(load, "getResource"), load, true);
        if (result) return result;
      }
    } else {
      for (const loadPlan of loadPlans) {
        if (Number(call(loadPlan, "getQuantity") ?? 0) < 0) continue;
        const load = call(loadPlan, "getLoad");
        if (!load) continue;
        const result = calculate(call(loadPlan, "getResource"), load, false);
        if (result) return result;
      }
    }
    return empty;
  }
  setOperationPlanQuantity(operationPlan: unknown, quantity: number, roundDown = true, update = true, execute = true,
    end: DateInput = PlanningDate.infinitePast): number {
    if (!operationPlan) throw new LogicException("Missing operationplan");
    let result = Number(quantity);
    if (result < 0) throw new DataException("Operationplans can't have negative quantities");

    const owner = call(operationPlan, "getOwner");
    const ownerOperation = call(owner, "getOperation");
    const ownerType = String(call(ownerOperation, "getType") ?? "");
    const proposed = Boolean(call(operationPlan, "getProposed"));
    const approved = Boolean(call(operationPlan, "getApproved"));
    const routingOwnerIsMutable = ownerType === "operation_routing"
      && (Boolean(call(owner, "getProposed")) || Boolean(call(owner, "getApproved")));

    if (!proposed && !approved && !routingOwnerIsMutable) {
      if (execute) {
        call(operationPlan, "setQuantityRaw", result);
        if (update) call(operationPlan, "update");
      }
      return result;
    }

    // Ordinary routing children inherit their owner's quantity. Alternate and
    // split children are the C++ exceptions and retain their own lot sizing.
    if (owner && ownerType !== "operation_alternate" && ownerType !== "operation_split") {
      return Number(call(owner, "setQuantity", result, roundDown, update, execute, asDate(end)) ?? result);
    }

    if (String(call(operationPlan, "getOperation") ? call(call(operationPlan, "getOperation"), "getType") : this.getType())
      === "operation_split") {
      if (execute) {
        call(operationPlan, "setQuantityRaw", result);
        if (update) call(operationPlan, "update");
      }
      return result;
    }

    const current = Number(call(operationPlan, "getQuantity") ?? 0);
    if (Math.abs(result - current) >= ROUNDING_ERROR / 100) {
      const requestedEnd = asDate(end);
      const minimumDate = requestedEnd.isInitialized()
        ? requestedEnd : (call(operationPlan, "getEnd") as PlanningDate | undefined) ?? PlanningDate.infinitePast;
      const variableMinimum = this.sizeMinimumCalendar
        ? Number(call(this.sizeMinimumCalendar, "getValue", minimumDate) ?? 0) : 0;
      const currentMinimum = Math.max(this.sizeMinimum, variableMinimum);

      if (result !== 0 && currentMinimum > 0 && result <= currentMinimum - ROUNDING_ERROR
        && currentMinimum <= this.sizeMaximum) {
        result = roundDown ? 0 : currentMinimum;
      }
      if (result !== 0 && result >= this.sizeMaximum) {
        roundDown = true;
        result = this.sizeMaximum;
      }
      if (result !== 0 && this.sizeMultiple > 0) {
        const multiples = Math.floor(result / this.sizeMultiple + (roundDown ? 0 : 0.99999999));
        let rounded = multiples * this.sizeMultiple;
        if (rounded < currentMinimum && currentMinimum <= this.sizeMaximum) {
          rounded = roundDown ? 0 : rounded + this.sizeMultiple;
        } else if (rounded > this.sizeMaximum) {
          rounded -= this.sizeMultiple;
          if (rounded < ROUNDING_ERROR) rounded = this.sizeMultiple;
        }
        result = rounded;
      }
      if (!execute) return result;
      call(operationPlan, "setQuantityRaw", result);
    } else if (!execute) {
      return current;
    }

    if (owner && ownerType === "operation_alternate") {
      call(owner, "setQuantityRaw", result);
      if (update) call(owner, "resizeFlowLoadPlans");
    }

    const children = call(operationPlan, "getSubOperationPlans");
    if (children && typeof (children as Iterable<unknown>)[Symbol.iterator] === "function") {
      for (const child of children as Iterable<unknown>) {
        if (Boolean(call(child, "getConfirmed"))) continue;
        const childOperation = call(child, "getOperation");
        const resizeDuration = String(call(childOperation, "getType") ?? "") === "operation_time_per"
          && Math.abs(Number(call(child, "getQuantity") ?? 0) - result) > ROUNDING_ERROR;
        call(child, "setQuantityRaw", result);
        if (resizeDuration) {
          call(child, "setOperationPlanParameters", result, PlanningDate.infinitePast,
            call(child, "getEnd"), true, true, true);
        }
        if (update) call(child, "resizeFlowLoadPlans");
      }
    }
    if (update) call(operationPlan, "update");
    return Number(call(operationPlan, "getQuantity") ?? result);
  }
  setOperationPlanParameters(operationPlan: unknown, quantity: number, start: DateInput, end: DateInput, preferEnd = true,
    execute = true, roundDown = true): Record<string, unknown> {
    const q = this.setOperationPlanQuantity(operationPlan, quantity, roundDown, false, false, start);
    let s = asDate(start);
    let e = asDate(end);
    // The C++ base class is abstract. The instantiable TypeScript adapter keeps
    // the current duration when a generic consumer moves only one endpoint.
    const currentStart = call(operationPlan, "getStart");
    const currentEnd = call(operationPlan, "getEnd");
    const currentDuration = currentStart instanceof PlanningDate && currentEnd instanceof PlanningDate
      ? currentEnd.subtract(currentStart) : new Duration();
    if (!s.isInitialized()) s = e.isInitialized() ? e.subtract(currentDuration)
      : currentStart instanceof PlanningDate ? new PlanningDate(currentStart) : new PlanningDate(e);
    if (!e.isInitialized()) e = s.isInitialized() ? s.add(currentDuration)
      : currentEnd instanceof PlanningDate ? new PlanningDate(currentEnd) : new PlanningDate(s);
    if (execute) {
      call(operationPlan, "setStartEndAndQuantity", s, e, q);
      call(operationPlan, "setQuantityRaw", q);
    }
    return operationPlanState(operationPlan, q, s, e);
  }
  createOperationPlan(quantity: number, start: DateInput, end: DateInput, batch = "", demand: unknown = null, owner: unknown = null,
    makeFlowsLoads = true, roundDown = true, reference = "", quantityCompleted = 0, status = "", assignedResources?: readonly Resource[]): HeaderModelAdapter {
    const plan = new OperationPlan(this);
    if (batch) plan.setBatch(batch);
    if (reference) plan.setReference(reference);
    if (quantityCompleted) plan.setQuantityCompletedRaw(quantityCompleted);
    if (demand) plan.setDemand(demand as never);
    if (owner) plan.setOwner(owner as OperationPlan, true);
    this.setOperationPlanParameters(plan, quantity, start, end, true, true, roundDown);
    if (status === "confirmed" && asDate(start).isInitialized() && asDate(end).isInitialized()) {
      plan.setStartEndAndQuantity(start, end, quantity);
    }
    if (status) call(plan, "setStatus", status);
    if (makeFlowsLoads || assignedResources?.length) {
      call(plan, "createFlowLoads", assignedResources);
      // Resource assignment can change the duration through its efficiency.
      // Match Operation::createOperationPlan by sizing the plan a second time
      // after the loadplans have selected their resources.
      if (status !== "confirmed") {
        this.setOperationPlanParameters(plan, quantity, start, end, true, true, roundDown);
      }
    }
    call(plan, "update");
    return plan;
  }
  deleteOperationPlans(deleteLocked = false, deleteDeliveries = true): void {
    OperationPlan.deleteOperationPlans(this, deleteLocked, deleteDeliveries);
  }
  addSubOperationPlan(owner: unknown, child: unknown, _fast = true): void {
    call(owner, "attachSubOperationPlan", child, "single");
  }
  solve(solver: unknown, payload?: unknown): unknown { return call(solver, "solve", this, payload); }
  getChanged(): boolean { return getEntityChanged(this); }
  setChanged(value = true): void { setEntityChanged(this, value); }
  getDetectProblems(): boolean { return getEntityDetectProblems(this); }
  setDetectProblems(value: boolean): void { setEntityDetectProblems(this, value); }
  getProblems(): import("./problem.js").Problem[] { return getEntityProblems(this); }
  updateProblems(): void { updateOperationProblems(this); }

  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Location" || property === "Item") this.dispose();
    else if (property === "Available") this.setAvailable(null);
    else if (property === "SizeMinimumCalendar") this.setSizeMinimumCalendar(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  protected override disposeReferences(): void {
    unregisterProblemEntity(this);
    HasLevel.triggerLazyRecomputation();
    this.deleteOperationPlans(true, true);
    for (const flow of [...this.getFlows()]) flow.dispose();
    for (const load of [...this.getLoads()]) load.dispose();
    for (const dependency of [...this.dependencies]) dependency.dispose();
    this.setLocation(null);
    this.setItem(null);
    this.setAvailable(null);
    this.setSizeMinimumCalendar(null);
  }
}

export class OperationFixedTime extends Operation {
  static override readonly cppBases: readonly string[] = ["Operation"];
  static override readonly cppQualifiedNames: readonly string[] = ["OperationFixedTime"];
  private duration = new Duration();
  static override initialize(): number { return 0; }
  override getType(): string { return "operation_fixed_time"; }
  getDuration(): Duration { return new Duration(this.duration); }
  setDuration(value: DurationInput): void {
    const next = asDuration(value);
    if (next.seconds < 0) Environment.log("Warning: Operation duration must be positive");
    else this.duration = next;
  }
  override getDecoupledLeadTime(_quantity = 0, date: DateInput = PlanningDate.infinitePast): readonly [Duration, PlanningDate] {
    return [new Duration(this.duration), asDate(date).subtract(this.duration)];
  }
  override setOperationPlanParameters(operationPlan: unknown, quantity: number, start: DateInput, end: DateInput,
    preferEnd = true, execute = true, roundDown = true, later = false): Record<string, unknown> {
    if (!operationPlan || quantity < 0) throw new LogicException("Incorrect parameters for fixedtime operationplan");
    if (Boolean(call(operationPlan, "getConfirmed")) && !Boolean(call(operationPlan, "getForcedUpdate"))) {
      return operationPlanState(operationPlan, Number(call(operationPlan, "getQuantity") ?? quantity),
        call(operationPlan, "getStart") as PlanningDate, call(operationPlan, "getEnd") as PlanningDate);
    }
    const q = this.setOperationPlanQuantity(operationPlan, quantity, roundDown, false, false, start);
    let s = asDate(start);
    let e = asDate(end);
    const hasStart = s.isInitialized();
    const hasEnd = e.isInitialized();
    const forward = hasStart && (!hasEnd || !preferEnd);
    const efficiency = Number(call(operationPlan, "getEfficiency", hasStart ? s : e) ?? 1);
    const productionWanted = efficiency > 0 ? new Duration(this.duration.seconds / efficiency) : new Duration(Number.MAX_SAFE_INTEGER);
    const productionActual: DurationSink = {};
    const setupActual: DurationSink = {};
    let productionDates: DateRange;
    let setupDates: DateRange;
    let setupInfo: OperationSetupInfo;

    if (forward) {
      setupInfo = this.calculateSetup(operationPlan, s, call(operationPlan, "getSetupEvent") as SetupEvent | null);
      const setupOverride = call(operationPlan, "getSetupOverride") as Duration | undefined;
      const setupWanted = setupOverride instanceof Duration && setupOverride.seconds >= 0
        ? setupOverride
        : new Duration(Number(call(operationPlan, "getQuantityCompleted") ?? 0) ? 0 : (setupInfo.rule?.getDuration().seconds ?? 0) / efficiency);
      if (setupInfo.resource || setupWanted.seconds >= 0 && setupOverride instanceof Duration && setupOverride.seconds >= 0) {
        setupDates = this.calculateOperationTime(operationPlan, s, setupWanted, true, setupActual);
        if ((setupActual.value?.seconds ?? setupWanted.seconds) === setupWanted.seconds) {
          productionDates = this.calculateOperationTime(operationPlan, setupDates.getEnd(), productionWanted, true, productionActual);
        } else {
          productionDates = new DateRange(setupDates.getEnd(), setupDates.getEnd());
          productionActual.value = new Duration();
        }
      } else {
        productionDates = this.calculateOperationTime(operationPlan, s, productionWanted, true, productionActual);
        setupDates = new DateRange(productionDates.getStart(), productionDates.getStart());
        setupActual.value = new Duration();
      }
    } else {
      productionDates = this.calculateOperationTime(operationPlan, e, productionWanted, false, productionActual);
      if (later && productionDates.getEnd().compare(e) < 0) {
        const nextAvailable = this.calculateOperationTime(operationPlan, e, new Duration(1), true);
        productionDates = this.calculateOperationTime(operationPlan, nextAvailable.getEnd(), productionWanted, false, productionActual);
      }
      setupInfo = this.calculateSetup(operationPlan, productionDates.getStart());
      const setupOverride = call(operationPlan, "getSetupOverride") as Duration | undefined;
      const hasOverride = setupOverride instanceof Duration && setupOverride.seconds >= 0;
      const setupWanted = hasOverride ? setupOverride
        : new Duration(Number(call(operationPlan, "getQuantityCompleted") ?? 0) ? 0 : (setupInfo.rule?.getDuration().seconds ?? 0) / efficiency);
      setupDates = setupInfo.rule || hasOverride
        ? this.calculateOperationTime(operationPlan, productionDates.getStart(), setupWanted, false, setupActual)
        : new DateRange(productionDates.getStart(), productionDates.getStart());
      if (!setupInfo.rule && !hasOverride) setupActual.value = new Duration();
    }
    s = setupDates.getStart();
    e = productionDates.getEnd();
    const productionComplete = (productionActual.value?.seconds ?? productionWanted.seconds) === productionWanted.seconds;
    const setupOverride = call(operationPlan, "getSetupOverride") as Duration | undefined;
    const setupRequired = Boolean(setupInfo.rule)
      || setupOverride instanceof Duration && setupOverride.seconds >= 0;
    const expectedSetup = setupRequired
      ? (setupOverride instanceof Duration && setupOverride.seconds >= 0
        ? setupOverride.seconds
        : new Duration(Number(call(operationPlan, "getQuantityCompleted") ?? 0)
          ? 0 : (setupInfo.rule?.getDuration().seconds ?? 0) / efficiency).seconds)
      : 0;
    const setupComplete = !setupRequired || (setupActual.value?.seconds ?? expectedSetup) === expectedSetup;
    if (!productionComplete || !setupComplete) {
      if (!execute) return operationPlanState(operationPlan, 0, s, e);
      call(operationPlan, "setQuantity", 0);
    }
    if (execute) {
      if (setupInfo.resource) call(operationPlan, "setSetupEvent", setupInfo.resource, setupDates.getEnd(), setupInfo.setup, setupInfo.rule);
      else call(operationPlan, "clearSetupEvent");
      const appliedQuantity = productionComplete && setupComplete ? q : 0;
      call(operationPlan, "setQuantityRaw", appliedQuantity);
      // Fixed-time C++ sets the rounded quantity first and then changes only
      // the dates. setStartEndAndQuantity would also copy a split child's
      // quantity to its owner, collapsing the parent's total split quantity.
      call(operationPlan, "setStartAndEnd", productionDates.getStart(), productionDates.getEnd());
      // The dates above already include the efficiency-adjusted setup duration.
      // C++ doesn't call updateSetupTime here: doing so would apply the raw rule
      // duration again and shift the operation start while keeping setup end fixed.
      s = call(operationPlan, "getStart") as PlanningDate;
      e = call(operationPlan, "getEnd") as PlanningDate;
    }
    return operationPlanState(operationPlan, productionComplete && setupComplete ? q : 0, s, e);
  }
}

export class OperationTimePer extends Operation {
  static override readonly cppBases: readonly string[] = ["Operation"];
  static override readonly cppQualifiedNames: readonly string[] = ["OperationTimePer"];
  private duration = new Duration();
  private durationPer = new Duration();
  static override initialize(): number { return 0; }
  override getType(): string { return "operation_time_per"; }
  getDuration(): Duration { return new Duration(this.duration); }
  setDuration(value: DurationInput): void { const next = asDuration(value); if (next.seconds >= 0) this.duration = next; }
  getDurationPer(): Duration { return new Duration(this.durationPer); }
  setDurationPer(value: DurationInput): void { const next = asDuration(value); if (next.seconds >= 0) this.durationPer = next; }
  override getDecoupledLeadTime(quantity = 0, date: DateInput = PlanningDate.infinitePast): readonly [Duration, PlanningDate] {
    const total = new Duration(this.duration.seconds + this.durationPer.seconds * Math.max(quantity, 0));
    return [total, asDate(date).subtract(total)];
  }
  override setOperationPlanParameters(operationPlan: unknown, quantity: number, start: DateInput, end: DateInput,
    preferEnd = true, execute = true, roundDown = true): Record<string, unknown> {
    if (!operationPlan || quantity < 0) throw new LogicException("Incorrect parameters for time-per operationplan");
    if (Boolean(call(operationPlan, "getConfirmed"))
      && !Number(call(operationPlan, "getQuantityCompleted") ?? 0)
      && !Boolean(call(operationPlan, "getForcedUpdate"))) {
      return operationPlanState(operationPlan, Number(call(operationPlan, "getQuantity") ?? quantity),
        call(operationPlan, "getStart") as PlanningDate, call(operationPlan, "getEnd") as PlanningDate);
    }
    const q = this.setOperationPlanQuantity(operationPlan, quantity, roundDown, false, false, start);
    const efficiency = Number(call(operationPlan, "getEfficiency", asDate(start).isInitialized() ? asDate(start) : asDate(end)) ?? 1);
    let wantedSeconds = efficiency > 0
      ? (this.duration.seconds + this.durationPer.seconds * q) / efficiency
      : Number.MAX_SAFE_INTEGER;
    const completed = Number(call(operationPlan, "getQuantityCompleted") ?? 0);
    const currentQuantity = Number(call(operationPlan, "getQuantity") ?? q);
    if (completed && currentQuantity) {
      const remaining = Number(call(operationPlan, "getQuantityRemaining") ?? Math.max(currentQuantity - completed, 0));
      wantedSeconds *= remaining / currentQuantity;
    }
    const wanted = new Duration(wantedSeconds);
    let s = asDate(start); let e = asDate(end);
    if (e.isInitialized() && (preferEnd || !s.isInitialized())) s = this.calculateOperationTime(operationPlan, e, wanted, false).getStart();
    else if (s.isInitialized()) e = this.calculateOperationTime(operationPlan, s, wanted, true).getEnd();
    if (execute) { call(operationPlan, "setStartEndAndQuantity", s, e, q); call(operationPlan, "setQuantityRaw", q); }
    return operationPlanState(operationPlan, q, s, e);
  }
}

class OperationComposite extends Operation {
  override hasSubOperations(): boolean { return true; }
  override getMaxEarly(): Duration {
    let result = super.getMaxEarly().seconds;
    for (const association of this.getSubOperations()) {
      const priority = Number(call(association, "getPriority") ?? 1);
      if (this instanceof OperationRouting || priority !== 0) {
        const candidate = call(call(association, "getOperation"), "getMaxEarly");
        if (candidate instanceof Duration) result = Math.min(result, candidate.seconds);
      }
    }
    return new Duration(result);
  }
  override getDecoupledLeadTime(quantity = 0, date: DateInput = PlanningDate.infinitePast): readonly [Duration, PlanningDate] {
    let total = 0;
    let earliest = asDate(date);
    for (const association of this.getSubOperations()) {
      const result = call(call(association, "getOperation"), "getDecoupledLeadTime", quantity, earliest);
      if (Array.isArray(result) && result[0] instanceof Duration && result[1] instanceof PlanningDate) {
        total += result[0].seconds;
        earliest = result[1];
      }
    }
    return [new Duration(total), earliest];
  }
}

export class OperationRouting extends OperationComposite {
  static override readonly cppBases: readonly string[] = ["Operation"];
  static override readonly cppQualifiedNames: readonly string[] = ["OperationRouting"];
  private hardPostTime = false;
  static override initialize(): number { return 0; }
  override getType(): string { return "operation_routing"; }
  getHardPostTime(): boolean { return this.hardPostTime; }
  setHardPostTime(value: boolean): void { this.hardPostTime = Boolean(value); }
  useDependencies(): boolean { return this.getDependencies().length > 0; }
  override addSubOperationPlan(owner: unknown, child: unknown, fast = true): void {
    call(owner, "attachSubOperationPlan", child, fast ? "prepend" : "append");
  }
  override setOperationPlanParameters(operationPlan: unknown, quantity: number, start: DateInput, end: DateInput,
    preferEnd = true, execute = true, roundDown = true): Record<string, unknown> {
    if (!operationPlan || quantity < 0) throw new LogicException("Incorrect parameters for routing operationplan");
    const children = call(operationPlan, "getSubOperationPlans");
    const childPlans = children && typeof (children as Iterable<unknown>)[Symbol.iterator] === "function"
      ? [...children as Iterable<unknown>] : [];
    if (!childPlans.length) {
      const q = this.setOperationPlanQuantity(operationPlan, quantity, roundDown, false, execute, end);
      let s = asDate(start);
      let e = asDate(end);
      if (!s.isInitialized() && e.isInitialized()) s = new PlanningDate(e);
      if (s.isInitialized() && !e.isInitialized()) e = new PlanningDate(s);
      if (execute) call(operationPlan, "setStartEndAndQuantity", s, e, q);
      return operationPlanState(operationPlan, q, s, e);
    }
    return super.setOperationPlanParameters(operationPlan, quantity, start, end, preferEnd, execute, roundDown);
  }
  override setOperationPlanQuantity(operationPlan: unknown, quantity: number, roundDown = true, update = true,
    execute = true, end: DateInput = PlanningDate.infinitePast): number {
    const result = super.setOperationPlanQuantity(operationPlan, quantity, roundDown, false, execute, end);
    if (!execute) return result;
    const children = call(operationPlan, "getSubOperationPlans");
    if (children && typeof (children as Iterable<unknown>)[Symbol.iterator] === "function") {
      for (const child of children as Iterable<unknown>) {
        call(child, "setQuantityRaw", result);
        if (update) call(child, "resizeFlowLoadPlans");
      }
    }
    if (update) call(operationPlan, "resizeFlowLoadPlans");
    return result;
  }
}

export class OperationSplit extends OperationComposite {
  static override readonly cppBases: readonly string[] = ["Operation"];
  static override readonly cppQualifiedNames: readonly string[] = ["OperationSplit"];
  static override initialize(): number { return 0; }
  override getType(): string { return "operation_split"; }
  override setOperationPlanParameters(operationPlan: unknown, quantity: number, start: DateInput, end: DateInput,
    _preferEnd = true, execute = true, roundDown = true): Record<string, unknown> {
    if (!operationPlan || quantity < 0) throw new LogicException("Incorrect parameters for split operationplan");
    if (Boolean(call(operationPlan, "getConfirmed"))) {
      return operationPlanState(operationPlan, Number(call(operationPlan, "getQuantity") ?? quantity),
        call(operationPlan, "getStart") as PlanningDate, call(operationPlan, "getEnd") as PlanningDate);
    }
    const s = asDate(start);
    const e = asDate(end);
    if (execute) {
      const q = Number(call(operationPlan, "setQuantity", quantity, roundDown, false) ?? quantity);
      call(operationPlan, "clearSetupEvent");
      call(operationPlan, "setStartAndEnd", s, e);
      return operationPlanState(operationPlan, q, s, e);
    }
    return operationPlanState(operationPlan, quantity, s, e);
  }
  override addSubOperationPlan(owner: unknown, child: unknown, _fast = true): void {
    const children = call(owner, "getSubOperationPlans");
    const existing = children && typeof (children as Iterable<unknown>)[Symbol.iterator] === "function"
      ? [...children as Iterable<unknown>] : [];
    if (existing.includes(child)) return;
    call(owner, "attachSubOperationPlan", child, "prepend");
  }
}

export class OperationAlternate extends OperationComposite {
  static override readonly cppBases: readonly string[] = ["Operation"];
  static override readonly cppQualifiedNames: readonly string[] = ["OperationAlternate"];
  static override initialize(): number { return 0; }
  override getType(): string { return "operation_alternate"; }
  override getOrderType(): string { return "ALT"; }
  override addSubOperationPlan(owner: unknown, child: unknown, _fast = true): void {
    const children = call(owner, "getSubOperationPlans");
    const existing = children && typeof (children as Iterable<unknown>)[Symbol.iterator] === "function"
      ? [...children as Iterable<unknown>] : [];
    for (const previous of existing) {
      if (previous === child) return;
      call(owner, "eraseSubOperationPlan", previous);
      call(previous, "dispose");
    }
    call(owner, "attachSubOperationPlan", child, "single");
  }
  override setOperationPlanParameters(operationPlan: unknown, quantity: number, start: DateInput, end: DateInput,
    preferEnd = true, execute = true, roundDown = true, later = false): Record<string, unknown> {
    if (!operationPlan || quantity < 0) throw new LogicException("Incorrect parameters for alternate operationplan");
    if (Boolean(call(operationPlan, "getConfirmed"))) {
      return operationPlanState(operationPlan, Number(call(operationPlan, "getQuantity") ?? quantity),
        call(operationPlan, "getStart") as PlanningDate, call(operationPlan, "getEnd") as PlanningDate);
    }
    const children = call(operationPlan, "getSubOperationPlans");
    const childPlans = children && typeof (children as Iterable<unknown>)[Symbol.iterator] === "function"
      ? [...children as Iterable<unknown>] : [];
    const child = childPlans.at(-1);
    if (child) {
      return call(child, "setOperationPlanParameters", quantity, asDate(start), asDate(end),
        preferEnd, execute, roundDown, later) as Record<string, unknown>;
    }
    const q = Number(call(operationPlan, "setQuantity", quantity, roundDown, false, execute, asDate(end)) ?? quantity);
    if (execute) {
      call(operationPlan, "clearSetupEvent");
      call(operationPlan, "setStartAndEnd", asDate(start), asDate(end));
    }
    return operationPlanState(operationPlan, q, asDate(start), asDate(end));
  }
}

export class OperationDelivery extends OperationFixedTime {
  static override readonly cppBases: readonly string[] = ["OperationFixedTime"];
  static override readonly cppQualifiedNames: readonly string[] = ["OperationDelivery"];
  private buffer: Buffer | null = null;
  static override initialize(): number { return 0; }
  override getType(): string { return "operation_delivery"; }
  override getOrderType(): string { return "DLVR"; }
  getBuffer(): Buffer | null { return this.buffer; }
  setBuffer(value: Buffer | null): void {
    link(this, "Buffer", this.buffer as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.buffer = value;
  }
  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Buffer") this.setBuffer(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  protected override disposeReferences(): void { this.setBuffer(null); super.disposeReferences(); }
}

export class OperationInventory extends OperationFixedTime {
  static override readonly cppBases: readonly string[] = ["OperationFixedTime"];
  static override readonly cppQualifiedNames: readonly string[] = ["OperationInventory"];
  private buffer: Buffer | null = null;
  constructor(buffer?: Buffer | null) {
    super(buffer ? `Inventory ${buffer.getName()}` : undefined);
    this.setHidden(true);
    this.setDetectProblems(false);
    this.setSizeMinimum(0);
    if (buffer) this.setBuffer(buffer);
  }
  static override initialize(): number { return 0; }
  override getType(): string { return "operation_inventory"; }
  override getOrderType(): string { return "STCK"; }
  getBuffer(): Buffer | null { return this.buffer; }
  setBuffer(value: Buffer | null): void {
    link(this, "Buffer", this.buffer as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.buffer = value;
  }
  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Buffer") this.dispose();
    else super.modelReferenceTargetDisposed(target, property);
  }
  protected override disposeReferences(): void { this.setBuffer(null); super.disposeReferences(); }
}

















/**
 * Semantic migration unit for src/model/operation.cpp.
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
  { name: "Operation::initialize", sourceLine: 40, status: "adapted" },
  { name: "OperationFixedTime::initialize", sourceLine: 57, status: "adapted" },
  { name: "OperationTimePer::initialize", sourceLine: 76, status: "adapted" },
  { name: "OperationSplit::initialize", sourceLine: 94, status: "adapted" },
  { name: "OperationAlternate::initialize", sourceLine: 112, status: "adapted" },
  { name: "OperationRouting::initialize", sourceLine: 129, status: "adapted" },
  { name: "Operation::~Operation", sourceLine: 147, status: "adapted" },
  { name: "Problem::clearConstraints", sourceLine: 198, status: "adapted" },
  { name: "OperationRouting::~OperationRouting", sourceLine: 201, status: "adapted" },
  { name: "OperationRouting::useDependencies", sourceLine: 208, status: "adapted" },
  { name: "OperationSplit::~OperationSplit", sourceLine: 221, status: "adapted" },
  { name: "OperationAlternate::~OperationAlternate", sourceLine: 228, status: "adapted" },
  { name: "Operation::getOperationPlans", sourceLine: 235, status: "adapted" },
  { name: "Operation::getFence", sourceLine: 239, status: "adapted" },
  { name: "Operation::setFence", sourceLine: 252, status: "adapted" },
  { name: "Plan::instance", sourceLine: 254, status: "adapted" },
  { name: "Operation::setFencePython", sourceLine: 258, status: "adapted" },
  { name: "Operation::getFencePython", sourceLine: 273, status: "adapted" },
  { name: "Plan::instance", sourceLine: 278, status: "adapted" },
  { name: "Plan::instance", sourceLine: 281, status: "adapted" },
  { name: "Operation::getMaxEarly", sourceLine: 289, status: "adapted" },
  { name: "OperationAlternate::getMaxEarly", sourceLine: 297, status: "adapted" },
  { name: "OperationSplit::getMaxEarly", sourceLine: 307, status: "adapted" },
  { name: "OperationRouting::getMaxEarly", sourceLine: 317, status: "adapted" },
  { name: "Operation::createOperationPlan", sourceLine: 326, status: "adapted" },
  { name: "Operation::calculateOperationTime", sourceLine: 362, status: "adapted" },
  { name: "Operation::collectCalendars", sourceLine: 608, status: "adapted" },
  { name: "Calendar::EventIterator", sourceLine: 620, status: "adapted" },
  { name: "Calendar::EventIterator", sourceLine: 640, status: "adapted" },
  { name: "Calendar::EventIterator", sourceLine: 680, status: "adapted" },
  { name: "Operation::calculateOperationTime", sourceLine: 709, status: "adapted" },
  { name: "Operation::calculateSetup", sourceLine: 852, status: "adapted" },
  { name: "Operation::findFlow", sourceLine: 935, status: "adapted" },
  { name: "Operation::deleteOperationPlans", sourceLine: 952, status: "adapted" },
  { name: "OperationPlan::deleteOperationPlans", sourceLine: 954, status: "adapted" },
  { name: "OperationFixedTime::setOperationPlanParameters", sourceLine: 957, status: "adapted" },
  { name: "OperationFixedTime::extraInstantiate", sourceLine: 1142, status: "adapted" },
  { name: "OperationTimePer::setOperationPlanParameters", sourceLine: 1241, status: "adapted" },
  { name: "OperationRouting::setOperationPlanParameters", sourceLine: 1678, status: "adapted" },
  { name: "OperationRouting::extraInstantiate", sourceLine: 1745, status: "adapted" },
  { name: "OperationAlternate::setOperationPlanParameters", sourceLine: 1789, status: "adapted" },
  { name: "OperationAlternate::extraInstantiate", sourceLine: 1816, status: "adapted" },
  { name: "OperationSplit::setOperationPlanParameters", sourceLine: 1838, status: "adapted" },
  { name: "OperationSplit::extraInstantiate", sourceLine: 1859, status: "adapted" },
  { name: "Operation::addSubOperationPlan", sourceLine: 1902, status: "adapted" },
  { name: "OperationSplit::addSubOperationPlan", sourceLine: 1925, status: "adapted" },
  { name: "OperationAlternate::addSubOperationPlan", sourceLine: 1967, status: "adapted" },
  { name: "OperationRouting::addSubOperationPlan", sourceLine: 2013, status: "adapted" },
  { name: "Operation::setOperationPlanQuantity", sourceLine: 2134, status: "adapted" },
  { name: "OperationRouting::setOperationPlanQuantity", sourceLine: 2266, status: "adapted" },
  { name: "Operation::setItem", sourceLine: 2288, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 2318, status: "adapted" },
  { name: "OperationAlternate::getDecoupledLeadTime", sourceLine: 2321, status: "adapted" },
  { name: "OperationSplit::getDecoupledLeadTime", sourceLine: 2362, status: "adapted" },
  { name: "OperationRouting::getDecoupledLeadTime", sourceLine: 2405, status: "adapted" },
  { name: "Plan::instance", sourceLine: 2413, status: "adapted" },
  { name: "OperationFixedTime::getDecoupledLeadTime", sourceLine: 2469, status: "adapted" },
  { name: "OperationTimePer::getDecoupledLeadTime", sourceLine: 2499, status: "adapted" },
  { name: "Operation::getDecoupledLeadTimePython", sourceLine: 2529, status: "adapted" },
  { name: "Operation::findFromName", sourceLine: 2549, status: "adapted" },
  { name: "Buffer::findOrCreate", sourceLine: 2589, status: "adapted" },
  { name: "Buffer::findOrCreate", sourceLine: 2590, status: "adapted" },
  { name: "Operation::updateMTO", sourceLine: 2641, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface BufferPort {
  findOrCreate(...args: readonly PortValue[]): PortValue | void;
}

export interface CalendarPort {
  EventIterator(...args: readonly PortValue[]): PortValue | void;
}

export interface HasLevelPort {
  triggerLazyRecomputation(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPort {
  addSubOperationPlan(...args: readonly PortValue[]): PortValue | void;
  calculateOperationTime(...args: readonly PortValue[]): PortValue | void;
  calculateSetup(...args: readonly PortValue[]): PortValue | void;
  collectCalendars(...args: readonly PortValue[]): PortValue | void;
  createOperationPlan(...args: readonly PortValue[]): PortValue | void;
  deleteOperationPlans(...args: readonly PortValue[]): PortValue | void;
  disposeOperation(...args: readonly PortValue[]): PortValue | void;
  findFlow(...args: readonly PortValue[]): PortValue | void;
  findFromName(...args: readonly PortValue[]): PortValue | void;
  getDecoupledLeadTimePython(...args: readonly PortValue[]): PortValue | void;
  getFence(...args: readonly PortValue[]): PortValue | void;
  getFencePython(...args: readonly PortValue[]): PortValue | void;
  getMaxEarly(...args: readonly PortValue[]): PortValue | void;
  getOperationPlans(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setFence(...args: readonly PortValue[]): PortValue | void;
  setFencePython(...args: readonly PortValue[]): PortValue | void;
  setItem(...args: readonly PortValue[]): PortValue | void;
  setOperationPlanQuantity(...args: readonly PortValue[]): PortValue | void;
  updateMTO(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationAlternatePort {
  addSubOperationPlan(...args: readonly PortValue[]): PortValue | void;
  disposeOperationAlternate(...args: readonly PortValue[]): PortValue | void;
  extraInstantiate(...args: readonly PortValue[]): PortValue | void;
  getDecoupledLeadTime(...args: readonly PortValue[]): PortValue | void;
  getMaxEarly(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setOperationPlanParameters(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationFixedTimePort {
  extraInstantiate(...args: readonly PortValue[]): PortValue | void;
  getDecoupledLeadTime(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setOperationPlanParameters(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanPort {
  deleteOperationPlans(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationRoutingPort {
  addSubOperationPlan(...args: readonly PortValue[]): PortValue | void;
  disposeOperationRouting(...args: readonly PortValue[]): PortValue | void;
  extraInstantiate(...args: readonly PortValue[]): PortValue | void;
  getDecoupledLeadTime(...args: readonly PortValue[]): PortValue | void;
  getMaxEarly(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setOperationPlanParameters(...args: readonly PortValue[]): PortValue | void;
  setOperationPlanQuantity(...args: readonly PortValue[]): PortValue | void;
  useDependencies(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationSplitPort {
  addSubOperationPlan(...args: readonly PortValue[]): PortValue | void;
  disposeOperationSplit(...args: readonly PortValue[]): PortValue | void;
  extraInstantiate(...args: readonly PortValue[]): PortValue | void;
  getDecoupledLeadTime(...args: readonly PortValue[]): PortValue | void;
  getMaxEarly(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setOperationPlanParameters(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationTimePerPort {
  getDecoupledLeadTime(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setOperationPlanParameters(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface ProblemPort {
  clearConstraints(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/operation.cpp";
export const targetFile = "model/operation.ts";

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
  "#include <ranges>",
  "",
  "#include \"frepple/model.h\"",
  "",
  "namespace frepple {",
  "",
  "template <class Operation>",
  "Tree utils::HasName<Operation>::st;",
  "const MetaCategory* Operation::metadata;",
  "const MetaClass *OperationFixedTime::metadata, *OperationTimePer::metadata,",
  "    *OperationRouting::metadata, *OperationSplit::metadata,",
  "    *OperationAlternate::metadata;",
  "Operation::Operationlist Operation::nosubOperations;",
  "",
  "int Operation::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Operation>(",
  "      \"operation\", \"operations\", reader, finder);",
  "  registerFields<Operation>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<Operation>::getPythonType();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  return FreppleCategory<Operation>::initialize();",
  "}",
  "",
  "int OperationFixedTime::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationFixedTime>(",
  "      \"operation\", \"operation_fixed_time\", Object::create<OperationFixedTime>,",
  "      true);",
  "  registerFields<OperationFixedTime>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = PythonExtension<",
  "      FreppleClass<OperationFixedTime, Operation>>::getPythonType();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  return FreppleClass<OperationFixedTime, Operation>::initialize();",
  "}",
  "",
  "int OperationTimePer::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationTimePer>(",
  "      \"operation\", \"operation_time_per\", Object::create<OperationTimePer>);",
  "  registerFields<OperationTimePer>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = PythonExtension<",
  "      FreppleClass<OperationTimePer, Operation>>::getPythonType();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  return FreppleClass<OperationTimePer, Operation>::initialize();",
  "}",
  "",
  "int OperationSplit::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationSplit>(",
  "      \"operation\", \"operation_split\", Object::create<OperationSplit>);",
  "  registerFields<OperationSplit>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x =",
  "      PythonExtension<FreppleClass<OperationSplit, Operation>>::getPythonType();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  return FreppleClass<OperationSplit, Operation>::initialize();",
  "}",
  "",
  "int OperationAlternate::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationAlternate>(",
  "      \"operation\", \"operation_alternate\", Object::create<OperationAlternate>);",
  "  registerFields<OperationAlternate>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleClass<OperationAlternate, Operation>::getPythonType();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  return FreppleClass<OperationAlternate, Operation>::initialize();",
  "}",
  "",
  "int OperationRouting::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationRouting>(",
  "      \"operation\", \"operation_routing\", Object::create<OperationRouting>);",
  "  registerFields<OperationRouting>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = PythonExtension<",
  "      FreppleClass<OperationRouting, Operation>>::getPythonType();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  return FreppleClass<OperationRouting, Operation>::initialize();",
  "}",
  "",
  "Operation::~Operation() {",
  "  // Delete all existing operationplans (even locked ones)",
  "  deleteOperationPlans(true);",
  "",
  "  // The Flow and Load objects are automatically deleted by the destructor",
  "  // of the Association list class.",
  "",
  "  // Unlink from item",
  "  if (item) {",
  "    if (item->firstOperation == this)",
  "      // Remove from head",
  "      item->firstOperation = next;",
  "    else {",
  "      // Remove from middle",
  "      Operation* j = item->firstOperation;",
  "      while (j && j->next && j->next != this) j = j->next;",
  "      if (j && j->next == this)",
  "        j->next = next;",
  "      else",
  "        logger << \"Error: Corrupted Operation list on Item\\n\";",
  "    }",
  "  }",
  "",
  "  // Remove the reference to this operation from all demands",
  "  for (auto& l : Demand::all())",
  "    if (l.getOperation() == this) l.setOperation(nullptr);",
  "",
  "  // Remove the reference to this operation from all buffers",
  "  for (auto& m : Buffer::all())",
  "    if (m.getProducingOperation() == this) m.setProducingOperation(nullptr);",
  "",
  "  // Remove the operation from its super-operations and sub-operations",
  "  if (getOwner()) {",
  "    auto subops = getOwner()->getSubOperations();",
  "    auto i = subops.begin();",
  "    while (i != subops.end()) {",
  "      if ((*i)->getOperation() == this) {",
  "        SubOperation* tmp = *i;",
  "        // note: erase also advances the iterator",
  "        i = subops.erase(i);",
  "        delete tmp;",
  "      } else",
  "        ++i;",
  "    }",
  "  }",
  "",
  "  // Clear dependencies",
  "  while (!dependencies.empty()) delete dependencies.front();",
  "",
  "  // Problems are automatically deleted by the HasProblem class.",
  "  // Constraints need to be cleared explicitly.",
  "  Problem::clearConstraints(*this);",
  "}",
  "",
  "OperationRouting::~OperationRouting() {",
  "  // Note that we are not using a for-loop since our function is actually",
  "  // updating the list of super-operations at the same time as we move",
  "  // through it.",
  "  while (!getSubOperations().empty()) delete *getSubOperations().begin();",
  "}",
  "",
  "bool OperationRouting::useDependencies() const {",
  "  for (auto step : getSubOperations()) {",
  "    for (auto& dpd : step->getOperation()->getDependencies()) {",
  "      if ((dpd->getBlockedBy() == step->getOperation() &&",
  "           dpd->getOperation()->getOwner() == this) ||",
  "          (dpd->getOperation() == step->getOperation() &&",
  "           dpd->getBlockedBy()->getOwner() == this))",
  "        return true;",
  "    }",
  "  }",
  "  return false;",
  "}",
  "",
  "OperationSplit::~OperationSplit() {",
  "  // Note that we are not using a for-loop since our function is actually",
  "  // updating the list of super-operations at the same time as we move",
  "  // through it.",
  "  while (!getSubOperations().empty()) delete *getSubOperations().begin();",
  "}",
  "",
  "OperationAlternate::~OperationAlternate() {",
  "  // Note that we are not using a for-loop since our function is actually",
  "  // updating the list of super-operations at the same time as we move",
  "  // through it.",
  "  while (!getSubOperations().empty()) delete *getSubOperations().begin();",
  "}",
  "",
  "OperationPlan::iterator Operation::getOperationPlans() const {",
  "  return OperationPlan::iterator(this);",
  "}",
  "",
  "Date Operation::getFence(const OperationPlan* opplan) const {",
  "  if (fence > 0L)",
  "    return calculateOperationTime(opplan, Plan::instance().getCurrent(), fence,",
  "                                  true)",
  "        .getEnd();",
  "  else if (fence < 0L)",
  "    return calculateOperationTime(opplan, Plan::instance().getCurrent(), -fence,",
  "                                  false)",
  "        .getStart();",
  "  else",
  "    return Plan::instance().getCurrent();",
  "}",
  "",
  "void Operation::setFence(Date d) {",
  "  Duration tmp;",
  "  calculateOperationTime(nullptr, Plan::instance().getCurrent(), d, &tmp, true);",
  "  setFence(tmp);",
  "}",
  "",
  "PyObject* Operation::setFencePython(PyObject* self, PyObject* args) {",
  "  // Pick up the date argument",
  "  PyObject* pydate;",
  "  if (!PyArg_ParseTuple(args, \"O:setFence\", &pydate)) return nullptr;",
  "",
  "  try {",
  "    PythonData dt(pydate);",
  "    static_cast<Operation*>(self)->setFence(dt.getDate());",
  "    return Py_BuildValue(\"\");",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "PyObject* Operation::getFencePython(PyObject* self, PyObject*) {",
  "  try {",
  "    auto oper = static_cast<Operation*>(self);",
  "    auto result = oper->getFence()",
  "                      ? oper->calculateOperationTime(",
  "                                nullptr, Plan::instance().getCurrent(),",
  "                                oper->getFence(), true, nullptr, true)",
  "                            .getEnd()",
  "                      : Plan::instance().getCurrent();",
  "    return PythonData(result);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "Duration Operation::getMaxEarly() const {",
  "  Duration tmp = Duration::MAX;",
  "  for (const auto& ld : getLoads())",
  "    if (ld.getResource() && ld.getResource()->getMaxEarly() < tmp)",
  "      tmp = ld.getResource()->getMaxEarly();",
  "  return tmp;",
  "}",
  "",
  "Duration OperationAlternate::getMaxEarly() const {",
  "  Duration tmp = Operation::getMaxEarly();",
  "  for (auto& sub : getSubOperations()) {",
  "    auto t = sub->getOperation()->getMaxEarly();",
  "    // Note: skipping 0-priority",
  "    if (sub->getPriority() && t < tmp) tmp = t;",
  "  }",
  "  return tmp;",
  "}",
  "",
  "Duration OperationSplit::getMaxEarly() const {",
  "  Duration tmp = Operation::getMaxEarly();",
  "  for (auto& sub : getSubOperations()) {",
  "    auto t = sub->getOperation()->getMaxEarly();",
  "    // Note: skipping 0-priority",
  "    if (sub->getPriority() && t < tmp) tmp = t;",
  "  }",
  "  return tmp;",
  "}",
  "",
  "Duration OperationRouting::getMaxEarly() const {",
  "  Duration tmp = Operation::getMaxEarly();",
  "  for (auto& sub : getSubOperations()) {",
  "    auto t = sub->getOperation()->getMaxEarly();",
  "    if (t < tmp) tmp = t;",
  "  }",
  "  return tmp;",
  "}",
  "",
  "OperationPlan* Operation::createOperationPlan(",
  "    double q, Date s, Date e, const PooledString& batch, Demand* l,",
  "    OperationPlan* ow, bool makeflowsloads, bool roundDown, const string& ref,",
  "    double q_completed, const string& status,",
  "    const vector<Resource*>* assigned_resources) const {",
  "  auto* opplan = new OperationPlan(const_cast<Operation*>(this));",
  "  if (!batch.empty()) opplan->setBatch(batch);",
  "  if (!ref.empty()) opplan->setName(ref);",
  "  if (q_completed) opplan->setQuantityCompletedRaw(q_completed);",
  "  if (l) opplan->setDemand(l);",
  "",
  "  // Setting the owner first. Note that the order is important here!",
  "  // For alternates & routings the quantity needs to be set through the owner.",
  "  if (ow) opplan->setOwner(ow, true);",
  "",
  "  // Setting the dates and quantity",
  "  setOperationPlanParameters(opplan, q, s, e, true, true, roundDown);",
  "  if (status == \"confirmed\" && s != Date::infinitePast &&",
  "      e != Date::infinitePast)",
  "    opplan->setStartEndAndQuantity(s, e, q);",
  "",
  "  // Create the loadplans and flowplans, if allowed",
  "  if (makeflowsloads || (assigned_resources && !assigned_resources->empty())) {",
  "    opplan->createFlowLoads(assigned_resources);",
  "    // Now that we know the assigned resource the duration can change",
  "    // eg different availability or efficienicy)",
  "    if (status != \"confirmed\")",
  "      setOperationPlanParameters(opplan, q, s, e, true, true, roundDown);",
  "  }",
  "",
  "  // Update flow and loadplans, and mark for problem detection",
  "  opplan->update();",
  "",
  "  return opplan;",
  "}",
  "",
  "DateRange Operation::calculateOperationTime(",
  "    const OperationPlan* opplan, Date thedate, Duration duration, bool forward,",
  "    Duration* actualduration, bool considerResourceCalendars) const {",
  "  // Account for negative durations",
  "  if (duration < 0L) {",
  "    forward = !forward;",
  "    duration = -duration;",
  "  }",
  "",
  "  // Default actual duration",
  "  if (actualduration) *actualduration = duration;",
  "",
  "  // Collect calendars",
  "  Calendar::EventIterator cals[10];",
  "  auto numCalendars = collectCalendars(cals, thedate, opplan, forward,",
  "                                       considerResourceCalendars);",
  "",
  "  // First case: no calendars at all",
  "  if (!numCalendars)",
  "    return forward ? DateRange(thedate, thedate + duration)",
  "                   : DateRange(thedate - duration, thedate);",
  "",
  "  DateRange result;",
  "  Date curdate = thedate;",
  "  Date selected;",
  "  bool status = false;",
  "  Duration curduration = duration;",
  "  bool available;",
  "",
  "  // Second case: a single calendar only.",
  "  // We handle it seperate for performance reasons.",
  "  if (numCalendars == 1) {",
  "    while (true) {",
  "      // Find the closest event date",
  "      selected = forward ? Date::infiniteFuture : Date::infinitePast;",
  "      if ((forward && cals[0].getDate() < selected) ||",
  "          (!forward && cals[0].getDate() > selected))",
  "        selected = cals[0].getDate();",
  "",
  "      // Check whether all calendars are available at the next event date",
  "      if (forward) {",
  "        if (cals[0].getDate() == selected && cals[0].getValue() == 0)",
  "          available = false;",
  "        else if (cals[0].getDate() != selected && cals[0].getPrevValue() == 0)",
  "          available = false;",
  "        else",
  "          available = true;",
  "      } else {",
  "        if (cals[0].getCalendar()->getValue(selected, forward) == 0)",
  "          available = false;",
  "        else",
  "          available = true;",
  "      }",
  "      if (!duration) {",
  "        // A special case for 0-time operations.",
  "        if (available && forward) {",
  "          result.setEnd(curdate);",
  "          result.setStart(curdate);",
  "          return result;",
  "        } else if (!available) {",
  "          available =",
  "              (cals[0].getCalendar()->getValue(selected, !forward) != 0);",
  "          if (available) {",
  "            result.setEnd(curdate);",
  "            result.setStart(curdate);",
  "            return result;",
  "          }",
  "        }",
  "      }",
  "      curdate = selected;",
  "",
  "      if (available && !status) {",
  "        // Becoming available after unavailable period",
  "        thedate = curdate;",
  "        status = true;",
  "        if (forward && result.getStart() == Date::infinitePast)",
  "          // First available time - make operation start at this time",
  "          result.setStart(curdate);",
  "        else if (!forward && result.getEnd() == Date::infiniteFuture)",
  "          // First available time - make operation end at this time",
  "          result.setEnd(curdate);",
  "      } else if (!available && status) {",
  "        // Becoming unavailable after available period",
  "        status = false;",
  "        if (forward) {",
  "          // Forward",
  "          Duration delta = curdate - thedate;",
  "          if (delta >= curduration) {",
  "            result.setEnd(thedate + curduration);",
  "            return result;",
  "          } else",
  "            curduration -= delta;",
  "        } else {",
  "          // Backward",
  "          Duration delta = thedate - curdate;",
  "          if (delta >= curduration) {",
  "            result.setStart(thedate - curduration);",
  "            return result;",
  "          } else",
  "            curduration -= delta;",
  "        }",
  "      } else if (forward && curdate == Date::infiniteFuture) {",
  "        // End of forward iteration",
  "        if (available) {",
  "          Duration delta = curdate - thedate;",
  "          if (delta >= curduration)",
  "            result.setEnd(thedate + curduration);",
  "          else if (actualduration)",
  "            *actualduration = duration - curduration;",
  "        } else if (actualduration)",
  "          *actualduration = duration - curduration;",
  "        return result;",
  "      } else if (!forward && curdate == Date::infinitePast) {",
  "        // End of backward iteration",
  "        if (available) {",
  "          Duration delta = thedate - curdate;",
  "          if (delta >= curduration)",
  "            result.setStart(thedate - curduration);",
  "          else if (actualduration)",
  "            *actualduration = duration - curduration;",
  "        } else if (actualduration)",
  "          *actualduration = duration - curduration;",
  "        return result;",
  "      }",
  "",
  "      // Advance to the next event",
  "      if (forward) {",
  "        if (cals[0].getDate() == selected) ++cals[0];",
  "      } else {",
  "        if (cals[0].getDate() == selected) --cals[0];",
  "      }",
  "    }",
  "    return result;",
  "  }",
  "",
  "  // Third case: more than 1 calendar",
  "  while (true) {",
  "    // Find the closest event date",
  "    Date selected = forward ? Date::infiniteFuture : Date::infinitePast;",
  "    for (unsigned short t = 0; t < numCalendars; ++t) {",
  "      if ((forward && cals[t].getDate() < selected) ||",
  "          (!forward && cals[t].getDate() > selected))",
  "        selected = cals[t].getDate();",
  "    }",
  "",
  "    // Check whether all calendars are available at the next event date",
  "    available = true;",
  "    if (forward) {",
  "      for (unsigned short t = 0; t < numCalendars && available; ++t) {",
  "        if (cals[t].getDate() == selected && cals[t].getValue() == 0)",
  "          available = false;",
  "        else if (cals[t].getDate() != selected && cals[t].getPrevValue() == 0)",
  "          available = false;",
  "      }",
  "    } else {",
  "      for (unsigned short t = 0; t < numCalendars && available; ++t) {",
  "        if (cals[t].getCalendar()->getValue(selected, forward) == 0)",
  "          available = false;",
  "      }",
  "    }",
  "    if (!duration) {",
  "      // A special case for 0-time operations.",
  "      if (available && forward) {",
  "        result.setEnd(curdate);",
  "        result.setStart(curdate);",
  "        return result;",
  "      } else if (!available) {",
  "        available = true;",
  "        for (unsigned short t = 0; t < numCalendars && available; ++t)",
  "          available =",
  "              (cals[t].getCalendar()->getValue(selected, !forward) != 0);",
  "        if (available) {",
  "          result.setEnd(curdate);",
  "          result.setStart(curdate);",
  "          return result;",
  "        }",
  "      }",
  "    }",
  "    curdate = selected;",
  "",
  "    if (available && !status) {",
  "      // Becoming available after unavailable period",
  "      thedate = curdate;",
  "      status = true;",
  "      if (forward && result.getStart() == Date::infinitePast)",
  "        // First available time - make operation start at this time",
  "        result.setStart(curdate);",
  "      else if (!forward && result.getEnd() == Date::infiniteFuture)",
  "        // First available time - make operation end at this time",
  "        result.setEnd(curdate);",
  "    } else if (!available && status) {",
  "      // Becoming unavailable after available period",
  "      status = false;",
  "      if (forward) {",
  "        // Forward",
  "        Duration delta = curdate - thedate;",
  "        if (delta >= curduration) {",
  "          result.setEnd(thedate + curduration);",
  "          break;",
  "        } else",
  "          curduration -= delta;",
  "      } else {",
  "        // Backward",
  "        Duration delta = thedate - curdate;",
  "        if (delta >= curduration) {",
  "          result.setStart(thedate - curduration);",
  "          break;",
  "        } else",
  "          curduration -= delta;",
  "      }",
  "    } else if (forward && curdate == Date::infiniteFuture) {",
  "      // End of forward iteration",
  "      if (available) {",
  "        Duration delta = curdate - thedate;",
  "        if (delta >= curduration)",
  "          result.setEnd(thedate + curduration);",
  "        else if (actualduration)",
  "          *actualduration = duration - curduration;",
  "      } else if (actualduration)",
  "        *actualduration = duration - curduration;",
  "      break;",
  "    } else if (!forward && curdate == Date::infinitePast) {",
  "      // End of backward iteration",
  "      if (available) {",
  "        Duration delta = thedate - curdate;",
  "        if (delta >= curduration)",
  "          result.setStart(thedate - curduration);",
  "        else if (actualduration)",
  "          *actualduration = duration - curduration;",
  "      } else if (actualduration)",
  "        *actualduration = duration - curduration;",
  "      break;",
  "    }",
  "",
  "    // Advance to the next event",
  "    if (forward) {",
  "      for (unsigned short t = 0; t < numCalendars; ++t)",
  "        if (cals[t].getDate() == selected) ++cals[t];",
  "    } else {",
  "      for (unsigned short t = 0; t < numCalendars; ++t)",
  "        if (cals[t].getDate() == selected) --cals[t];",
  "    }",
  "  }",
  "  return result;",
  "}",
  "",
  "unsigned short Operation::collectCalendars(",
  "    Calendar::EventIterator cals[], Date start, const OperationPlan* opplan,",
  "    bool forward, bool considerResourceCalendars) const {",
  "  auto nolocationcalendar = getNoLocationCalendar();",
  "  unsigned short calcount = 0;",
  "  // a) operation",
  "  if (available)",
  "    cals[calcount++] = Calendar::EventIterator(available, start, forward);",
  "  // b) operation location",
  "  if (loc && loc->getAvailable() && getAvailable() != loc->getAvailable() &&",
  "      !nolocationcalendar)",
  "    cals[calcount++] =",
  "        Calendar::EventIterator(loc->getAvailable(), start, forward);",
  "",
  "  if (!considerResourceCalendars) return calcount;",
  "",
  "  if (opplan && opplan->getLoadPlans() != opplan->endLoadPlans()) {",
  "    // Iterate over loadplans",
  "    for (auto g = opplan->getLoadPlans(); g != opplan->endLoadPlans(); ++g) {",
  "      if (g->getQuantity() > 0) continue;",
  "      Resource* res = g->getResource();",
  "      if (res->getAvailable()) {",
  "        // c) resource",
  "        bool exists = false;",
  "        for (unsigned short t = 0; t < calcount; ++t) {",
  "          if (cals[t].getCalendar() == res->getAvailable()) {",
  "            exists = true;",
  "            break;",
  "          }",
  "        }",
  "        if (!exists) {",
  "          cals[calcount++] =",
  "              Calendar::EventIterator(res->getAvailable(), start, forward);",
  "          if (calcount > 9)",
  "            throw DataException(\"Excessive number of calendars on operation '\" +",
  "                                getName() + \"'\");",
  "        }",
  "      }",
  "      if (res->getLocation() && res->getLocation()->getAvailable() &&",
  "          !nolocationcalendar) {",
  "        bool exists = false;",
  "        for (unsigned short t = 0; t < calcount; ++t) {",
  "          // d) resource location",
  "          if (cals[t].getCalendar() == res->getLocation()->getAvailable()) {",
  "            exists = true;",
  "            break;",
  "          }",
  "        }",
  "        if (!exists) {",
  "          cals[calcount++] = Calendar::EventIterator(",
  "              res->getLocation()->getAvailable(), start, forward);",
  "          if (calcount > 9)",
  "            throw DataException(\"Excessive number of calendars on operation '\" +",
  "                                getName() + \"'\");",
  "        }",
  "      }",
  "    }",
  "  } else {",
  "    // Iterate over loads",
  "    for (const auto& g : loaddata) {",
  "      Resource* res = g.getResource();",
  "      if (res->getAvailable()) {",
  "        // c) resource",
  "        bool exists = false;",
  "        for (unsigned short t = 0; t < calcount; ++t) {",
  "          if (cals[t].getCalendar() == res->getAvailable()) {",
  "            exists = true;",
  "            break;",
  "          }",
  "        }",
  "        if (!exists) {",
  "          cals[calcount++] =",
  "              Calendar::EventIterator(res->getAvailable(), start, forward);",
  "          if (calcount > 9)",
  "            throw DataException(\"Excessive number of calendars on operation '\" +",
  "                                getName() + \"'\");",
  "        }",
  "      }",
  "      if (res->getLocation() && res->getLocation()->getAvailable() &&",
  "          !nolocationcalendar) {",
  "        bool exists = false;",
  "        for (unsigned short t = 0; t < calcount; ++t) {",
  "          // d) resource location",
  "          if (cals[t].getCalendar() == res->getLocation()->getAvailable()) {",
  "            exists = true;",
  "            break;",
  "          }",
  "        }",
  "        if (!exists) {",
  "          cals[calcount++] = Calendar::EventIterator(",
  "              res->getLocation()->getAvailable(), start, forward);",
  "          if (calcount > 9)",
  "            throw DataException(\"Excessive number of calendars on operation '\" +",
  "                                getName() + \"'\");",
  "        }",
  "      }",
  "    }",
  "  }",
  "  return calcount;",
  "}",
  "",
  "DateRange Operation::calculateOperationTime(",
  "    const OperationPlan* opplan, Date start, Date end, Duration* actualduration,",
  "    bool considerResourceCalendars) const {",
  "  // Switch start and end if required",
  "  if (end < start) {",
  "    Date tmp = start;",
  "    start = end;",
  "    end = tmp;",
  "  }",
  "",
  "  // Default actual duration",
  "  if (actualduration) *actualduration = 0L;",
  "",
  "  // Build a list of involved calendars",
  "  Calendar::EventIterator cals[10];",
  "  auto numCalendars =",
  "      collectCalendars(cals, start, opplan, considerResourceCalendars);",
  "",
  "  // First case: no calendars at all",
  "  if (!numCalendars) {",
  "    if (actualduration) *actualduration = end - start;",
  "    return DateRange(start, end);",
  "  }",
  "",
  "  DateRange result;",
  "  Date curdate = start;",
  "  Date selected;",
  "  bool status = false;",
  "  bool available;",
  "",
  "  // Second case: only a single calendar.",
  "  // We handle it seperate for performance reasons.",
  "  if (numCalendars == 1) {",
  "    while (true) {",
  "      // Find the closest event date",
  "      selected = cals[0].getDate();",
  "      curdate = selected;",
  "",
  "      // Check whether the calendar is available at the next event date",
  "      if (cals[0].getDate() == selected && cals[0].getValue() == 0)",
  "        available = false;",
  "      else if (cals[0].getDate() != selected && cals[0].getPrevValue() == 0)",
  "        available = false;",
  "      else",
  "        available = true;",
  "",
  "      if (available && !status) {",
  "        // Becoming available after unavailable period",
  "        if (curdate >= end) {",
  "          // Leaving the desired date range",
  "          result.setEnd(start);",
  "          return result;",
  "        }",
  "        start = curdate;",
  "        status = true;",
  "        if (result.getStart() == Date::infinitePast)",
  "          // First available time - make operation start at this time",
  "          result.setStart(curdate);",
  "      } else if (!available && status) {",
  "        // Becoming unavailable after available period",
  "        if (curdate >= end) {",
  "          // Leaving the desired date range",
  "          if (actualduration) *actualduration += end - start;",
  "          result.setEnd(end);",
  "          return result;",
  "        }",
  "        status = false;",
  "        if (actualduration) *actualduration += curdate - start;",
  "        start = curdate;",
  "      } else if (curdate >= end) {",
  "        // Leaving the desired date range",
  "        if (available) {",
  "          if (actualduration) *actualduration += end - start;",
  "          result.setEnd(end);",
  "          return result;",
  "        } else",
  "          result.setEnd(start);",
  "        return result;",
  "      }",
  "",
  "      // Advance to the next event",
  "      ++cals[0];",
  "    }",
  "  }",
  "",
  "  // Third case: more than 1 calendar",
  "  while (true) {",
  "    // Find the closest event date",
  "    selected = Date::infiniteFuture;",
  "    for (unsigned short t = 0; t < numCalendars; ++t) {",
  "      if (cals[t].getDate() < selected) selected = cals[t].getDate();",
  "    }",
  "    curdate = selected;",
  "",
  "    // Check whether all calendars are available at the next event date",
  "    available = true;",
  "    for (unsigned short t = 0; t < numCalendars && available; ++t) {",
  "      if (cals[t].getDate() == selected && cals[t].getValue() == 0)",
  "        available = false;",
  "      else if (cals[t].getDate() != selected && cals[t].getPrevValue() == 0)",
  "        available = false;",
  "    }",
  "",
  "    if (available && !status) {",
  "      // Becoming available after unavailable period",
  "      if (curdate >= end) {",
  "        // Leaving the desired date range",
  "        result.setEnd(start);",
  "        return result;",
  "      }",
  "      start = curdate;",
  "      status = true;",
  "      if (result.getStart() == Date::infinitePast)",
  "        // First available time - make operation start at this time",
  "        result.setStart(curdate);",
  "    } else if (!available && status) {",
  "      // Becoming unavailable after available period",
  "      if (curdate >= end) {",
  "        // Leaving the desired date range",
  "        if (actualduration) *actualduration += end - start;",
  "        result.setEnd(end);",
  "        return result;",
  "      }",
  "      status = false;",
  "      if (actualduration) *actualduration += curdate - start;",
  "      start = curdate;",
  "    } else if (curdate >= end) {",
  "      // Leaving the desired date range",
  "      if (available) {",
  "        if (actualduration) *actualduration += end - start;",
  "        result.setEnd(end);",
  "      } else",
  "        result.setEnd(start);",
  "      return result;",
  "    }",
  "",
  "    // Advance to the next event",
  "    for (unsigned short t = 0; t < numCalendars; ++t)",
  "      if (cals[t].getDate() == selected) ++cals[t];",
  "  }",
  "  return result;",
  "}",
  "",
  "Operation::SetupInfo Operation::calculateSetup(OperationPlan* opplan,",
  "                                               Date setupend,",
  "                                               SetupEvent* setupevent,",
  "                                               SetupEvent** prevevent) const {",
  "  // Shortcuts: there are no setup matrices or resources",
  "  if (SetupMatrix::empty() || getLoads().empty() || !opplan ||",
  "      !opplan->getQuantity() || opplan->getNoSetup())",
  "    return SetupInfo(nullptr, nullptr, PooledString());",
  "",
  "  // Loop over each load or loadplan and see check what setup time they need",
  "  bool firstResourceWithSetup = true;",
  "  auto ldplan = opplan->beginLoadPlans();",
  "  if (ldplan == opplan->endLoadPlans()) {",
  "    // First case: This operationplan doesn't have any loadplans yet.",
  "    for (const auto& ld : getLoads()) {",
  "      if (ld.getSetup().empty() || !ld.getResource()->getSetupMatrix())",
  "        // There is no setup on this load",
  "        continue;",
  "",
  "      // An operation can load only a single resource with a setup matrix",
  "      if (firstResourceWithSetup)",
  "        firstResourceWithSetup = false;",
  "      else",
  "        throw DataException(",
  "            \"Only a single resource with a setup matrix is allowed per \"",
  "            \"operation\");",
  "",
  "      // Calculate the setup time",
  "      SetupEvent* cursetup =",
  "          setupevent ? setupevent->getSetupBefore()",
  "                     : ld.getResource()->getSetupAt(setupend, opplan);",
  "      if (prevevent) *prevevent = cursetup;",
  "      return SetupInfo(",
  "          ld.getResource(),",
  "          ld.getResource()->getSetupMatrix()->calculateSetup(",
  "              cursetup ? cursetup->getSetup() : PooledString::emptystring,",
  "              ld.getSetup(), ld.getResource()),",
  "          ld.getSetup());",
  "    }",
  "  } else {",
  "    // Second case: This operationplan already has loadplans. Using them",
  "    // is more efficient, and some of them may already be switched to",
  "    // alternate resources.",
  "    for (; ldplan != opplan->endLoadPlans(); ++ldplan) {",
  "      if (ldplan->getQuantity() < 0 || !ldplan->getLoad() ||",
  "          ldplan->getLoad()->getSetup().empty() ||",
  "          !ldplan->getResource()->getSetupMatrix())",
  "        // Not a consuming loadplan or there is no setup on this loadplan",
  "        continue;",
  "",
  "      // An operation can load only a single resource with a setup matrix",
  "      if (firstResourceWithSetup)",
  "        firstResourceWithSetup = false;",
  "      else",
  "        throw DataException(",
  "            \"Only a single resource with a setup matrix is allowed per \"",
  "            \"operation\");",
  "",
  "      if (ldplan->getResource()->getFrozenSetups()) {",
  "        // Return the current setup event",
  "        auto ev = opplan->getSetupEvent();",
  "        if (ev)",
  "          return SetupInfo(ldplan->getResource(), ev->getRule(),",
  "                           ldplan->getLoad()->getSetup());",
  "        else",
  "          return SetupInfo(nullptr, nullptr, PooledString());",
  "      } else {",
  "        // Calculate the setup time",
  "        SetupEvent* cursetup =",
  "            ldplan->getResource()->getSetupAt(setupend, opplan);",
  "        if (prevevent) *prevevent = cursetup;",
  "        return SetupInfo(",
  "            ldplan->getResource(),",
  "            ldplan->getResource()->getSetupMatrix()->calculateSetup(",
  "                cursetup ? cursetup->getSetup() : PooledString::emptystring,",
  "                ldplan->getLoad()->getSetup(), ldplan->getResource()),",
  "            ldplan->getLoad()->getSetup());",
  "      }",
  "    }",
  "  }",
  "  return SetupInfo(nullptr, nullptr, PooledString());",
  "}",
  "",
  "Flow* Operation::findFlow(const Buffer* b, Date d) const {",
  "  for (const auto& fl : flowdata) {",
  "    if (!fl.effectivity.within(d)) continue;",
  "    if (fl.getBuffer() == b)",
  "      return const_cast<Flow*>(&fl);",
  "    else if (!fl.getBuffer() && fl.getItem() == b->getItem() &&",
  "             getLocation() == b->getLocation())",
  "      return const_cast<Flow*>(&fl);",
  "    else if (fl.getBuffer() && b->getBatch() && fl.getItem() == b->getItem() &&",
  "             fl.getBuffer()->getLocation() == b->getLocation() &&",
  "             !fl.getBuffer()->getBatch())",
  "      // Generic buffer on flow matches a MTO buffer",
  "      return const_cast<Flow*>(&fl);",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "void Operation::deleteOperationPlans(bool deleteLockedOpplans,",
  "                                     bool deleteDeliveries) {",
  "  OperationPlan::deleteOperationPlans(this, deleteLockedOpplans, deleteDeliveries );",
  "}",
  "",
  "OperationPlanState OperationFixedTime::setOperationPlanParameters(",
  "    OperationPlan* opplan, double q, Date s, Date e, bool preferEnd,",
  "    bool execute, bool roundDown, bool later) const {",
  "  // Invalid call to the function",
  "  if (!opplan || q < 0)",
  "    throw LogicException(\"Incorrect parameters for fixedtime operationplan\");",
  "",
  "  // Confirmed operationplans are untouchable",
  "  if (opplan->getConfirmed() && !opplan->getForcedUpdate())",
  "    return OperationPlanState(opplan);",
  "",
  "  // Compute the start and end date",
  "  Duration production_duration;",
  "  Duration setup_duration;",
  "  DateRange production_dates;",
  "  DateRange setup_dates;",
  "  Operation::SetupInfo setuptime_required(nullptr, nullptr, PooledString());",
  "  double efficiency = opplan->getEfficiency(s ? s : e);",
  "  bool forward;",
  "  if (e && s) {",
  "    if (preferEnd)",
  "      forward = false;",
  "    else",
  "      forward = true;",
  "  } else if (s)",
  "    forward = true;",
  "  else",
  "    forward = false;",
  "  Date d = s;",
  "",
  "  Duration production_wanted_duration =",
  "      efficiency > 0.0 ? Duration(double(duration) / efficiency)",
  "                       : Duration::MAX;",
  "  if (opplan && hasType<OperationDelivery>() && opplan->getDemand())",
  "    // Special case to have the duration of deliveries demand-dependent when",
  "    // they use the default delivery operation.",
  "    production_wanted_duration = opplan->getDemand()->getDeliveryDuration();",
  "",
  "  Duration setup_wanted_duration;",
  "  while (true) {",
  "    if (forward) {",
  "      // Compute forward from the start date",
  "      setuptime_required = calculateSetup(opplan, d, opplan->getSetupEvent());",
  "      if (get<0>(setuptime_required) || opplan->getSetupOverride() >= 0L) {",
  "        if ((get<1>(setuptime_required) && efficiency > 0.0) ||",
  "            opplan->getSetupOverride() >= 0L) {",
  "          // Apply a setup matrix rule",
  "          if (opplan->getSetupOverride() >= 0L)",
  "            setup_wanted_duration = opplan->getSetupOverride();",
  "          else",
  "            setup_wanted_duration =",
  "                opplan->getQuantityCompleted()",
  "                    ? 0.0",
  "                    : double(get<1>(setuptime_required)->getDuration()) /",
  "                          efficiency;",
  "          setup_dates = calculateOperationTime(opplan, d, setup_wanted_duration,",
  "                                               true, &setup_duration);",
  "          if (setup_duration != setup_wanted_duration)",
  "            // Damned, not enough time to setup the resource",
  "            production_dates =",
  "                DateRange(setup_dates.getEnd(), setup_dates.getEnd());",
  "          else",
  "            production_dates = calculateOperationTime(",
  "                opplan, setup_dates.getEnd(), production_wanted_duration, true,",
  "                &production_duration);",
  "        } else {",
  "          // Dummy changeover",
  "          production_dates =",
  "              calculateOperationTime(opplan, d, production_wanted_duration,",
  "                                     true, &production_duration);",
  "          setup_dates = DateRange(production_dates.getStart(),",
  "                                  production_dates.getStart());",
  "        }",
  "      } else {",
  "        // No setup required",
  "        production_dates = calculateOperationTime(",
  "            opplan, d, production_wanted_duration, true, &production_duration);",
  "        setup_dates =",
  "            DateRange(production_dates.getStart(), production_dates.getStart());",
  "      }",
  "    } else {",
  "      // Compute backward from the end date",
  "      production_dates = calculateOperationTime(",
  "          opplan, e, production_wanted_duration, false, &production_duration);",
  "      if (later && production_dates.getEnd() < e) {",
  "        auto nextok = calculateOperationTime(opplan, e, Duration(1L), true);",
  "        production_dates = calculateOperationTime(opplan, nextok.getEnd(),",
  "                                                  production_wanted_duration,",
  "                                                  false, &production_duration);",
  "      }",
  "      if (production_duration != production_wanted_duration)",
  "        // Damned, not enough time for the production",
  "        setup_dates =",
  "            DateRange(production_dates.getStart(), production_dates.getStart());",
  "      else {",
  "        setuptime_required =",
  "            calculateSetup(opplan, production_dates.getStart());",
  "        if ((get<1>(setuptime_required) && efficiency > 0.0) ||",
  "            opplan->getSetupOverride() >= 0L) {",
  "          // Apply setup matrix rule",
  "          if (opplan->getSetupOverride() >= 0L)",
  "            setup_wanted_duration = opplan->getSetupOverride();",
  "          else",
  "            setup_wanted_duration =",
  "                opplan->getQuantityCompleted()",
  "                    ? 0.0",
  "                    : double(get<1>(setuptime_required)->getDuration()) /",
  "                          efficiency;",
  "          setup_dates = calculateOperationTime(",
  "              opplan, production_dates.getStart(), setup_wanted_duration, false,",
  "              &setup_duration);",
  "        } else",
  "          // Dummy or no setup required",
  "          setup_dates = DateRange(production_dates.getStart(),",
  "                                  production_dates.getStart());",
  "      }",
  "    }",
  "",
  "    if (production_duration != production_wanted_duration ||",
  "        ((get<1>(setuptime_required) || opplan->getSetupOverride() >= 0L) &&",
  "         setup_duration != setup_wanted_duration)) {",
  "      // Not enough time found for the setup and the operation duration",
  "      if (production_dates.getStart())",
  "        logger << \"Warning: Couldn't find available time on operation '\" << this",
  "               << \"'\\n\";",
  "      if (!execute)",
  "        return OperationPlanState(production_dates, setup_dates.getEnd(), 0);",
  "      else",
  "        opplan->setQuantity(0);",
  "    } else {",
  "      if (opplan->getProposed()) {",
  "        // All quantities are valid, as long as they are above the minimum size",
  "        // and below the maximum size",
  "        if (q > 0) {",
  "          if (getSizeMinimumCalendar()) {",
  "            // Minimum size varies over time",
  "            double curmin =",
  "                getSizeMinimumCalendar()->getValue(production_dates.getEnd());",
  "            if (q < curmin) q = roundDown ? 0.0 : curmin;",
  "          }",
  "          if (q < getSizeMinimum())",
  "            // Minimum size is constant over time",
  "            q = roundDown ? 0.0 : getSizeMinimum();",
  "        }",
  "        if (q > getSizeMaximum()) q = getSizeMaximum();",
  "      }",
  "      if (fabs(q - opplan->getQuantity()) > ROUNDING_ERROR)",
  "        q = opplan->setQuantity(q, roundDown, false, execute,",
  "                                production_dates.getEnd());",
  "    }",
  "",
  "    if (!execute) {",
  "      // Simulation only",
  "      if (get<1>(setuptime_required)) {",
  "        SetupEvent tmp(&(get<0>(setuptime_required)->getLoadPlans()),",
  "                       setup_dates.getEnd(), get<2>(setuptime_required),",
  "                       get<1>(setuptime_required), nullptr, true);",
  "        return OperationPlanState(setup_dates.getStart(),",
  "                                  production_dates.getEnd(), q, &tmp);",
  "      } else",
  "        return OperationPlanState(production_dates, q);",
  "    }",
  "",
  "    // Update the operationplan",
  "    if (get<0>(setuptime_required))",
  "      opplan->setSetupEvent(get<0>(setuptime_required), setup_dates.getEnd(),",
  "                            get<2>(setuptime_required),",
  "                            get<1>(setuptime_required));",
  "    else",
  "      opplan->clearSetupEvent();",
  "    opplan->setStartAndEnd(production_dates.getStart(),",
  "                           production_dates.getEnd());",
  "",
  "    if (forward && preferEnd && opplan->getStart() < s &&",
  "        s != Date::infiniteFuture && d != Date::infiniteFuture) {",
  "      d += Duration(3600L);",
  "    } else if (!forward && !preferEnd && opplan->getStart() > s &&",
  "               s != Date::infinitePast && d != Date::infinitePast) {",
  "      d -= Duration(3600L);",
  "    } else",
  "      break;",
  "  };",
  "  return OperationPlanState(opplan);",
  "}",
  "",
  "bool OperationFixedTime::extraInstantiate(OperationPlan* o, bool, bool) {",
  "  // See if we can consolidate this operationplan with an existing one.",
  "  // Merging is possible only when all the following conditions are met:",
  "  //   - id of the new opplan is not set",
  "  //   - id of the old opplan is set",
  "  //   - it is a fixedtime operation",
  "  //   - it doesn't load any resources of type default",
  "  //   - both operationplans aren't locked",
  "  //   - both operationplans have no owner",
  "  //     or both have an owner of the same operation and is of type",
  "  //     operation_alternate",
  "  //   - start and end date of both operationplans are the same",
  "  //   - demand of both operationplans are the same",
  "  //   - maximum operation size is not exceeded",
  "  //   - alternate flowplans need to be on the same alternate",
  "  if (!o->getActivated() && o->getProposed()) {",
  "    // Verify we load no resources of type \"default\".",
  "    // It's ok to merge operationplans which load \"infinite\" or \"buckets\"",
  "    // resources.",
  "    for (const auto& i : getLoads())",
  "      if (i.getResource()->hasType<ResourceDefault>()) return true;",
  "",
  "    // Loop through candidates",
  "    OperationPlan::iterator x(this);",
  "    OperationPlan* y = nullptr;",
  "    for (; x != OperationPlan::end() && *x < *o; ++x) y = &*x;",
  "    if (y && y->getDates() == o->getDates() &&",
  "        y->getDemand() == o->getDemand() && y->getProposed() &&",
  "        y->getActivated() &&",
  "        y->getQuantity() + o->getQuantity() < getSizeMaximum()) {",
  "      if (o->getOwner()) {",
  "        // Both must have the same owner operation of type alternate",
  "        if (!y->getOwner())",
  "          return true;",
  "        else if (o->getOwner()->getOperation() != y->getOwner()->getOperation())",
  "          return true;",
  "        else if (!o->getOwner()->getOperation()->hasType<OperationAlternate>())",
  "          return true;",
  "        else if (o->getOwner()->getDemand() != y->getOwner()->getDemand())",
  "          return true;",
  "      }",
  "",
  "      // Check that the flowplans are on identical alternates and not of type",
  "      // fixed",
  "      OperationPlan::FlowPlanIterator fp1 = o->beginFlowPlans();",
  "      OperationPlan::FlowPlanIterator fp2 = y->beginFlowPlans();",
  "      if (fp1 == o->endFlowPlans() || fp2 == o->endFlowPlans())",
  "        // Operationplan without flows are already deleted. Leave them alone.",
  "        return true;",
  "      while (fp1 != o->endFlowPlans()) {",
  "        if (fp1->getBuffer() != fp2->getBuffer() ||",
  "            fp1->getFlow()->getQuantityFixed() ||",
  "            fp2->getFlow()->getQuantityFixed())",
  "          // No merge possible",
  "          return true;",
  "        ++fp1;",
  "        ++fp2;",
  "      }",
  "      // Merging with the 'next' operationplan",
  "      y->setQuantity(y->getQuantity() + o->getQuantity());",
  "      if (o->getOwner()) o->setOwner(nullptr);",
  "      return false;",
  "    }",
  "    if (x != OperationPlan::end() && x->getDates() == o->getDates() &&",
  "        x->getDemand() == o->getDemand() && x->getProposed() &&",
  "        x->getActivated() &&",
  "        x->getQuantity() + o->getQuantity() < getSizeMaximum()) {",
  "      if (o->getOwner()) {",
  "        // Both must have the same owner operation of type alternate",
  "        if (!x->getOwner())",
  "          return true;",
  "        else if (o->getOwner()->getOperation() != x->getOwner()->getOperation())",
  "          return true;",
  "        else if (!o->getOwner()->getOperation()->hasType<OperationAlternate>())",
  "          return true;",
  "      }",
  "",
  "      // Check that the flowplans are on identical alternates",
  "      OperationPlan::FlowPlanIterator fp1 = o->beginFlowPlans();",
  "      OperationPlan::FlowPlanIterator fp2 = x->beginFlowPlans();",
  "      if (fp1 == o->endFlowPlans() || fp2 == o->endFlowPlans())",
  "        // Operationplan without flows are already deleted. Leave them alone.",
  "        return true;",
  "      while (fp1 != o->endFlowPlans()) {",
  "        if (fp1->getBuffer() != fp2->getBuffer())",
  "          // Different alternates - no merge possible",
  "          return true;",
  "        ++fp1;",
  "        ++fp2;",
  "      }",
  "      // Merging with the 'previous' operationplan",
  "      x->setQuantity(x->getQuantity() + o->getQuantity());",
  "      if (o->getOwner()) o->setOwner(nullptr);",
  "      return false;",
  "    }",
  "  }",
  "  return true;",
  "}",
  "",
  "OperationPlanState OperationTimePer::setOperationPlanParameters(",
  "    OperationPlan* opplan, double q, Date s, Date e, bool preferEnd,",
  "    bool execute, bool roundDown, bool later) const {",
  "  // Invalid call to the function.",
  "  if (!opplan || q < 0)",
  "    throw LogicException(\"Incorrect parameters for timeper operationplan\");",
  "",
  "  // Confirmed operationplans are untouchable... in most cases",
  "  if (opplan->getConfirmed() && !opplan->getQuantityCompleted() &&",
  "      !opplan->getForcedUpdate())",
  "    return OperationPlanState(opplan);",
  "",
  "  if (opplan->getProposed()) {",
  "    // Proposed operationplans need to respect minimum and maximum size",
  "    if (q > 0) {",
  "      if (getSizeMinimumCalendar()) {",
  "        // Respect time varying minimum.",
  "        // This configuration is not really supported: when the size changes",
  "        // a different minimum size could be effective. The planning results",
  "        // in a constrained plan can be not optimal or incorrect.",
  "        Duration tmp1;",
  "        DateRange tmp2 = calculateOperationTime(opplan, s, e, &tmp1);",
  "        double curmin = getSizeMinimumCalendar()->getValue(tmp2.getEnd());",
  "        if (q < curmin) q = roundDown ? 0.0 : curmin;",
  "      }",
  "      if (q < getSizeMinimum())",
  "        // Respect constant minimum value",
  "        q = roundDown ? 0.0 : getSizeMinimum();",
  "    }",
  "    if (q > getSizeMaximum()) q = getSizeMaximum();",
  "  }",
  "",
  "  // The logic depends on which dates are being passed along",
  "  Duration production_duration;",
  "  Duration production_wanted_duration;",
  "  Duration setup_duration;",
  "  Duration setup_wanted_duration;",
  "  DateRange production_dates;",
  "  DateRange setup_dates;",
  "  Operation::SetupInfo setuptime_required;",
  "  double efficiency = opplan->getEfficiency(s ? s : e);",
  "  if (s && e) {",
  "    // Case 1: Both the start and end date are specified: Compute the quantity.",
  "    // Calculate the available time between those dates",
  "    setuptime_required = calculateSetup(opplan, s);",
  "    if ((get<1>(setuptime_required) && efficiency > 0.0) ||",
  "        opplan->getSetupOverride() >= 0L) {",
  "      if (opplan->getSetupOverride() >= 0L)",
  "        setup_wanted_duration = opplan->getSetupOverride();",
  "      else",
  "        setup_wanted_duration =",
  "            opplan->getQuantityCompleted()",
  "                ? 0.0",
  "                : double(get<1>(setuptime_required)->getDuration()) /",
  "                      efficiency;",
  "      setup_dates = calculateOperationTime(opplan, s, setup_wanted_duration,",
  "                                           true, &setup_duration);",
  "      if (setup_dates.getEnd() > e || setup_duration != setup_wanted_duration) {",
  "        // Damned, not enough time to setup the resource",
  "        if (!execute) return OperationPlanState(setup_dates, 0.0);",
  "        opplan->setQuantity(0, true, false, execute);",
  "        opplan->clearSetupEvent();",
  "        opplan->setStartAndEnd(setup_dates.getStart(), setup_dates.getEnd());",
  "        return OperationPlanState(opplan);",
  "      } else",
  "        // Calculate duration available for actual production",
  "        production_dates = calculateOperationTime(opplan, setup_dates.getEnd(),",
  "                                                  e, &production_duration);",
  "    } else {",
  "      // Dummy or no setup required",
  "      production_dates =",
  "          calculateOperationTime(opplan, s, e, &production_duration);",
  "      setup_dates =",
  "          DateRange(production_dates.getStart(), production_dates.getStart());",
  "    }",
  "",
  "    if (efficiency <= 0 ||",
  "        production_duration < Duration(double(duration) / efficiency)) {",
  "      // Start and end aren't far enough from each other to fit the constant",
  "      // part of the operation duration and/or the setup time.",
  "      // This is infeasible.",
  "      if (!execute) return OperationPlanState(production_dates, 0.0);",
  "      opplan->setQuantity(0, true, false, execute);",
  "      opplan->clearSetupEvent();",
  "      opplan->setStartAndEnd(production_dates.getStart(),",
  "                             production_dates.getEnd());",
  "      return OperationPlanState(opplan);",
  "    } else {",
  "      // Calculate the quantity, respecting minimum, maximum and multiple size.",
  "      if (duration_per) {",
  "        auto fitting_quantity =",
  "            (double(production_duration) - double(duration) / efficiency) /",
  "            duration_per * efficiency;",
  "        if (fitting_quantity > q - ROUNDING_ERROR)",
  "          // Provided quantity is acceptable.",
  "          q = opplan->setQuantity(q, roundDown, false, execute);",
  "        else",
  "          // Use the maximum operationplan that will fit in the window",
  "          q = opplan->setQuantity(fitting_quantity > 0 ? fitting_quantity : 0.0,",
  "                                  roundDown, false, execute);",
  "      } else",
  "        // No duration_per field given, so any quantity will go",
  "        q = opplan->setQuantity(q, roundDown, false, execute);",
  "",
  "      // Updates the dates",
  "      production_wanted_duration =",
  "          (double(duration) + duration_per * q) / efficiency;",
  "      if (preferEnd)",
  "        production_dates = calculateOperationTime(",
  "            opplan, e, production_wanted_duration, false, &production_duration);",
  "      else",
  "        production_dates = calculateOperationTime(opplan, setup_dates.getEnd(),",
  "                                                  production_wanted_duration,",
  "                                                  true, &production_duration);",
  "      if (production_dates.getStart() != setup_dates.getEnd()) {",
  "        // TODO It is even possible that the setup time is now different...",
  "        if (setup_duration)",
  "          setup_dates = calculateOperationTime(",
  "              opplan, production_dates.getStart(), setup_duration, false);",
  "        else",
  "          setup_dates = DateRange(production_dates.getStart(),",
  "                                  production_dates.getStart());",
  "      }",
  "      if (!execute) {",
  "        if (get<0>(setuptime_required)) {",
  "          SetupEvent tmp(&(get<0>(setuptime_required)->getLoadPlans()),",
  "                         setup_dates.getEnd(), get<2>(setuptime_required),",
  "                         get<1>(setuptime_required), nullptr, true);",
  "          return OperationPlanState(setup_dates.getStart(),",
  "                                    production_dates.getEnd(), q, &tmp);",
  "        } else",
  "          return OperationPlanState(production_dates, q);",
  "      }",
  "      if (get<0>(setuptime_required) || opplan->getSetupOverride() >= 0L)",
  "        opplan->setSetupEvent(get<0>(setuptime_required), setup_dates.getEnd(),",
  "                              get<2>(setuptime_required),",
  "                              get<1>(setuptime_required));",
  "      else",
  "        opplan->clearSetupEvent();",
  "      opplan->setStartAndEnd(setup_dates.getStart(), production_dates.getEnd());",
  "    }",
  "  } else if (e || !s) {",
  "    // Case 2: Only an end date is specified. Respect the quantity and",
  "    // compute the start date",
  "    // Case 4: No date was given at all. Respect the quantity and the",
  "    // existing end date of the operationplan.",
  "    q = opplan->setQuantity(q, roundDown, false, execute);",
  "    // Round and size the quantity",
  "    if (efficiency > 0) {",
  "      production_wanted_duration =",
  "          (double(duration) + duration_per * q) / efficiency;",
  "      if (opplan->getQuantityCompleted() && opplan->getQuantity())",
  "        production_wanted_duration *=",
  "            opplan->getQuantityRemaining() / opplan->getQuantity();",
  "    } else",
  "      production_wanted_duration = Duration::MAX;",
  "    production_dates = calculateOperationTime(",
  "        opplan, e, production_wanted_duration, false, &production_duration);",
  "    if (later && production_dates.getEnd() < e) {",
  "      auto nextok = calculateOperationTime(opplan, e, Duration(1L), true);",
  "      production_dates = calculateOperationTime(opplan, nextok.getEnd(),",
  "                                                production_wanted_duration,",
  "                                                false, &production_duration);",
  "    }",
  "    if (production_duration == production_wanted_duration) {",
  "      // Size is as desired",
  "      setuptime_required = calculateSetup(opplan, production_dates.getStart());",
  "      if ((get<1>(setuptime_required) && efficiency > 0.0) ||",
  "          opplan->getSetupOverride() >= 0L) {",
  "        if (opplan->getSetupOverride() >= 0L)",
  "          setup_wanted_duration = opplan->getSetupOverride();",
  "        else",
  "          setup_wanted_duration =",
  "              opplan->getQuantityCompleted()",
  "                  ? 0.0",
  "                  : double(get<1>(setuptime_required)->getDuration()) /",
  "                        efficiency;",
  "        setup_dates = calculateOperationTime(",
  "            opplan, production_dates.getStart(), setup_wanted_duration, false,",
  "            &setup_duration);",
  "        if (setup_duration != setup_wanted_duration) {",
  "          // No time to do the setup",
  "          if (!execute) return OperationPlanState(production_dates, 0.0);",
  "          opplan->setQuantity(0, true, false);",
  "          opplan->clearSetupEvent();",
  "          opplan->setStartAndEnd(Date::infinitePast, e);",
  "        }",
  "      } else",
  "        // Dummy or no setup involved",
  "        setup_dates =",
  "            DateRange(production_dates.getStart(), production_dates.getStart());",
  "      if (!execute) {",
  "        if (get<0>(setuptime_required)) {",
  "          SetupEvent tmp(&(get<0>(setuptime_required)->getLoadPlans()),",
  "                         setup_dates.getEnd(), get<2>(setuptime_required),",
  "                         get<1>(setuptime_required), nullptr, true);",
  "          return OperationPlanState(setup_dates.getStart(),",
  "                                    production_dates.getEnd(), q, &tmp);",
  "        } else",
  "          return OperationPlanState(production_dates, q);",
  "      }",
  "      if (get<0>(setuptime_required) || opplan->getSetupOverride() >= 0L)",
  "        opplan->setSetupEvent(get<0>(setuptime_required), setup_dates.getEnd(),",
  "                              get<2>(setuptime_required),",
  "                              get<1>(setuptime_required));",
  "      else",
  "        opplan->clearSetupEvent();",
  "      opplan->setStartAndEnd(setup_dates.getStart(), production_dates.getEnd());",
  "    } else if (efficiency <= 0.0 ||",
  "               (production_duration < Duration(double(duration) / efficiency) &&",
  "                !opplan->getQuantityCompleted())) {",
  "      // Not feasible",
  "      if (!execute) return OperationPlanState(production_dates, 0);",
  "      opplan->setQuantity(0, true, false);",
  "      opplan->clearSetupEvent();",
  "      opplan->setStartAndEnd(Date::infinitePast, e);",
  "    } else {",
  "      // Resize the quantity to be feasible",
  "",
  "      // Compute the required setup time",
  "      setuptime_required = calculateSetup(opplan, production_dates.getStart());",
  "      if ((get<1>(setuptime_required) && efficiency > 0.0) ||",
  "          opplan->getSetupOverride() >= 0L) {",
  "        if (opplan->getSetupOverride() >= 0L)",
  "          setup_wanted_duration = opplan->getSetupOverride();",
  "        else",
  "          setup_wanted_duration =",
  "              opplan->getQuantityCompleted()",
  "                  ? 0.0",
  "                  : double(get<1>(setuptime_required)->getDuration()) /",
  "                        efficiency;",
  "        setup_dates = calculateOperationTime(",
  "            opplan, production_dates.getStart(), setup_wanted_duration, false,",
  "            &setup_duration);",
  "        if (setup_duration != setup_wanted_duration) {",
  "          // No time to do the setup",
  "          if (!execute) return OperationPlanState(production_dates, 0.0);",
  "          opplan->setQuantity(0, true, false);",
  "          opplan->clearSetupEvent();",
  "          opplan->setStartAndEnd(e, e);",
  "        }",
  "      } else {",
  "        // Dummy or no setup involved",
  "        setup_duration = Duration(0L);",
  "        setup_dates =",
  "            DateRange(production_dates.getStart(), production_dates.getStart());",
  "      }",
  "",
  "      double max_q;",
  "      if (opplan->getQuantityCompleted() && production_wanted_duration)",
  "        max_q = opplan->getQuantityRemaining() *",
  "                (production_duration - setup_duration) /",
  "                production_wanted_duration;",
  "      else if (!duration_per || !production_wanted_duration)",
  "        max_q = q;",
  "      else",
  "        max_q = static_cast<double>(production_duration - setup_duration -",
  "                                    duration) /",
  "                duration_per;",
  "      q = opplan->setQuantity(q < max_q ? q : max_q, true, false, execute);",
  "      production_wanted_duration =",
  "          (double(duration) + duration_per * q) / efficiency;",
  "      production_dates = calculateOperationTime(",
  "          opplan, e, production_wanted_duration, false, &production_duration);",
  "      if (production_dates.getStart() != setup_dates.getEnd()) {",
  "        // TODO It is even possible that the setup time is now different...",
  "        if (setup_duration)",
  "          setup_dates = calculateOperationTime(",
  "              opplan, production_dates.getStart(), setup_duration, false);",
  "        else",
  "          setup_dates = DateRange(production_dates.getStart(),",
  "                                  production_dates.getStart());",
  "      }",
  "      if (!execute) {",
  "        if (get<0>(setuptime_required)) {",
  "          SetupEvent tmp(&(get<0>(setuptime_required)->getLoadPlans()),",
  "                         setup_dates.getEnd(), get<2>(setuptime_required),",
  "                         get<1>(setuptime_required), nullptr, true);",
  "          return OperationPlanState(setup_dates.getStart(),",
  "                                    production_dates.getEnd(), q, &tmp);",
  "        } else",
  "          return OperationPlanState(production_dates, q);",
  "      }",
  "      if (get<0>(setuptime_required) || opplan->getSetupOverride() >= 0L)",
  "        opplan->setSetupEvent(get<0>(setuptime_required), setup_dates.getEnd(),",
  "                              get<2>(setuptime_required),",
  "                              get<1>(setuptime_required));",
  "      else",
  "        opplan->clearSetupEvent();",
  "      opplan->setStartAndEnd(setup_dates.getStart(), production_dates.getEnd());",
  "    }",
  "  } else {",
  "    Date d = s;",
  "",
  "    // Case 3: Only a start date is specified. Respect the quantity and",
  "    // compute the end date",
  "    q = opplan->setQuantity(q, roundDown, false, execute);",
  "    // Round and size the quantity",
  "    if (efficiency > 0) {",
  "      production_wanted_duration =",
  "          (double(duration) + duration_per * q) / efficiency;",
  "      if (opplan->getQuantityCompleted() && opplan->getQuantity())",
  "        production_wanted_duration *=",
  "            opplan->getQuantityRemaining() / opplan->getQuantity();",
  "    } else",
  "      production_wanted_duration = Duration::MAX;",
  "    while (true) {",
  "      // Compute the setup time",
  "      setuptime_required = calculateSetup(opplan, d, nullptr);",
  "      if ((efficiency > 0 && get<0>(setuptime_required) &&",
  "           get<1>(setuptime_required)) ||",
  "          opplan->getSetupOverride() >= 0L) {",
  "        if (opplan->getSetupOverride() >= 0L)",
  "          setup_wanted_duration = opplan->getSetupOverride();",
  "        else",
  "          setup_wanted_duration =",
  "              opplan->getQuantityCompleted()",
  "                  ? 0.0",
  "                  : double(get<1>(setuptime_required)->getDuration()) /",
  "                        efficiency;",
  "        setup_dates = calculateOperationTime(opplan, d, setup_wanted_duration,",
  "                                             true, &setup_duration);",
  "        if (setup_duration != setup_wanted_duration) {",
  "          // No time to do the setup",
  "          if (!execute) return OperationPlanState(setup_dates, 0);",
  "          opplan->setQuantity(0, true, false);",
  "          opplan->clearSetupEvent();",
  "          opplan->setStartAndEnd(setup_dates.getStart(), setup_dates.getEnd());",
  "          return OperationPlanState(opplan);",
  "        }",
  "      } else",
  "        // No setup involved",
  "        setup_dates = DateRange(d, d);",
  "",
  "      Duration actual;",
  "      production_dates = calculateOperationTime(opplan, setup_dates.getEnd(),",
  "                                                production_wanted_duration,",
  "                                                true, &production_duration);",
  "      if (production_dates.getStart() != setup_dates.getEnd()) {",
  "        // If the start dates fails in an unavailable period",
  "        if (setup_dates.getStart() == setup_dates.getEnd())",
  "          setup_dates.setStart(production_dates.getStart());",
  "        setup_dates.setEnd(production_dates.getStart());",
  "      }",
  "      if (production_duration == production_wanted_duration) {",
  "        // Size is as desired",
  "        if (!execute) {",
  "          if (get<0>(setuptime_required)) {",
  "            SetupEvent tmp(&(get<0>(setuptime_required)->getLoadPlans()),",
  "                           setup_dates.getEnd(), get<2>(setuptime_required),",
  "                           get<1>(setuptime_required), nullptr, true);",
  "            return OperationPlanState(setup_dates.getStart(),",
  "                                      production_dates.getEnd(), q, &tmp);",
  "          } else",
  "            return OperationPlanState(production_dates, q);",
  "        }",
  "        if (get<0>(setuptime_required) || opplan->getSetupOverride() >= 0L)",
  "          opplan->setSetupEvent(",
  "              get<0>(setuptime_required), setup_dates.getEnd(),",
  "              get<2>(setuptime_required), get<1>(setuptime_required));",
  "        else",
  "          opplan->clearSetupEvent();",
  "        opplan->setStartAndEnd(setup_dates.getStart(),",
  "                               production_dates.getEnd());",
  "      } else if (efficiency <= 0.0 ||",
  "                 (production_duration <",
  "                      Duration(double(duration) / efficiency) &&",
  "                  !opplan->getQuantityCompleted())) {",
  "        // Not feasible",
  "        if (production_dates.getStart())",
  "          logger << \"Warning: Couldn't find available time on operation '\"",
  "                 << this << \"'\\n\";",
  "        if (!execute) return OperationPlanState(production_dates, 0.0);",
  "        opplan->setQuantity(0, true, false);",
  "        opplan->clearSetupEvent();",
  "        opplan->setStartAndEnd(d, Date::infiniteFuture);",
  "      } else {",
  "        // Resize the quantity to be feasible",
  "        if (production_dates.getStart())",
  "          logger << \"Warning: Couldn't find available time on operation '\"",
  "                 << this << \"'\\n\";",
  "        double max_q;",
  "        if (opplan->getQuantityCompleted() && production_wanted_duration)",
  "          max_q = opplan->getQuantityRemaining() * production_duration /",
  "                  production_wanted_duration;",
  "        else if (!duration_per || !production_wanted_duration)",
  "          max_q = q;",
  "        else",
  "          max_q = static_cast<double>(production_duration - duration) /",
  "                  duration_per * efficiency;",
  "        q = opplan->setQuantity(q < max_q ? q : max_q, roundDown, false,",
  "                                execute);",
  "        if (!q) {",
  "          // Not feasible",
  "          if (!execute) return OperationPlanState(production_dates, 0.0);",
  "          opplan->setQuantity(0, true, false);",
  "          opplan->clearSetupEvent();",
  "          opplan->setStartAndEnd(d, Date::infiniteFuture);",
  "        } else {",
  "          production_wanted_duration =",
  "              (double(duration) + duration_per * q) / efficiency;",
  "          production_dates = calculateOperationTime(",
  "              opplan, setup_dates.getEnd(), production_wanted_duration, true,",
  "              &production_duration);",
  "          if (!execute) {",
  "            if (get<0>(setuptime_required)) {",
  "              SetupEvent tmp(&(get<0>(setuptime_required)->getLoadPlans()),",
  "                             setup_dates.getEnd(), get<2>(setuptime_required),",
  "                             get<1>(setuptime_required), nullptr, true);",
  "              return OperationPlanState(setup_dates.getStart(),",
  "                                        production_dates.getEnd(), q, &tmp);",
  "            } else",
  "              return OperationPlanState(production_dates, q);",
  "          }",
  "          if (get<0>(setuptime_required) || opplan->getSetupOverride() >= 0L)",
  "            opplan->setSetupEvent(",
  "                get<0>(setuptime_required), setup_dates.getEnd(),",
  "                get<2>(setuptime_required), get<1>(setuptime_required));",
  "          else",
  "            opplan->clearSetupEvent();",
  "          opplan->setStartAndEnd(production_dates.getStart(),",
  "                                 production_dates.getEnd());",
  "        }",
  "      }",
  "      if (preferEnd && opplan->getStart() < s && s != Date::infiniteFuture &&",
  "          d != Date::infiniteFuture) {",
  "        d += Duration(3600L);",
  "      } else if (!preferEnd && opplan->getStart() > s &&",
  "                 s != Date::infinitePast && d != Date::infinitePast) {",
  "        d -= Duration(3600L);",
  "      } else",
  "        break;",
  "    };",
  "  }",
  "  return OperationPlanState(opplan);",
  "}",
  "",
  "OperationPlanState OperationRouting::setOperationPlanParameters(",
  "    OperationPlan* opplan, double q, Date s, Date e, bool preferEnd,",
  "    bool execute, bool roundDown, bool later) const {",
  "  // Invalid call to the function",
  "  if (!opplan || q < 0)",
  "    throw LogicException(\"Incorrect parameters for routing operationplan\");",
  "",
  "  // Confirmed operationplans are untouchable",
  "  if (opplan->getConfirmed()) return OperationPlanState(opplan);",
  "",
  "  if (!opplan->lastsubopplan)  // @todo replace with proper iterator",
  "  {",
  "    // No step operationplans to work with. Just apply the requested quantity",
  "    // and dates.",
  "    q = opplan->setQuantity(q, roundDown, false, execute, e);",
  "    if (!s && e) s = e;",
  "    if (s && !e) e = s;",
  "    if (!execute) return OperationPlanState(s, e, q);",
  "    opplan->clearSetupEvent();",
  "    opplan->setStartAndEnd(s, e);",
  "    return OperationPlanState(opplan);",
  "  }",
  "",
  "  // Behavior depends on the dates being passed.",
  "  // Move all sub-operationplans in an orderly fashion, either starting from",
  "  // the specified end date or the specified start date.",
  "  OperationPlanState x;",
  "  Date y;",
  "  bool realfirst = true;",
  "  if (useDependencies()) {",
  "    logger << \"Warning: Method not supporting operation dependencies yet.\"",
  "           << '\\n';",
  "  }",
  "  if (e) {",
  "    // Case 1: an end date is specified",
  "    for (auto i = opplan->lastsubopplan; i; i = i->prevsubopplan) {",
  "      x = i->setOperationPlanParameters(q, Date::infinitePast, e, preferEnd,",
  "                                        execute, roundDown,",
  "                                        realfirst ? later : false);",
  "      e = x.start;",
  "      if (realfirst) {",
  "        y = x.end;",
  "        realfirst = false;",
  "      }",
  "    }",
  "    return OperationPlanState(x.start, y, x.quantity);",
  "  } else if (s) {",
  "    // Case 2: a start date is specified",
  "    for (auto i = opplan->firstsubopplan; i; i = i->nextsubopplan) {",
  "      x = i->setOperationPlanParameters(q, s, Date::infinitePast, preferEnd,",
  "                                        execute, roundDown,",
  "                                        realfirst ? later : true);",
  "      s = x.end;",
  "      if (realfirst) {",
  "        y = x.start;",
  "        realfirst = false;",
  "      }",
  "    }",
  "    return OperationPlanState(y, x.end, x.quantity);",
  "  } else {",
  "    logger << \"Warning: Updating a routing operationplan without start or end \"",
  "              \"date argument\"",
  "           << '\\n';",
  "    return OperationPlanState(opplan);",
  "  }",
  "}",
  "",
  "bool OperationRouting::extraInstantiate(OperationPlan* o, bool createsubopplans,",
  "                                        bool use_start) {",
  "  // Create step suboperationplans if they don't exist yet.",
  "  if (createsubopplans && !o->lastsubopplan) {",
  "    Date d = o->getEnd();",
  "    OperationPlan* p = nullptr;",
  "    if (!use_start) {",
  "      // Using the end date",
  "      for (auto& e : std::ranges::reverse_view(getSubOperations())) {",
  "        if (p) d -= e->getOperation()->getPostTime();",
  "        p = e->getOperation()->createOperationPlan(",
  "            o->getQuantity(), Date::infinitePast, d, o->getBatch(), nullptr, o,",
  "            0, true);",
  "        d = p->getStart();",
  "        // created sub operationplan inherits from owner status",
  "        p->setStatus(o->getStatus());",
  "      }",
  "    } else {",
  "      // Using the start date when there is no end date",
  "      d = o->getStart();",
  "      // Using the current date when both the start and end date are missing",
  "      if (!d) d = Plan::instance().getCurrent();",
  "      for (auto& e : getSubOperations()) {",
  "        p = e->getOperation()->createOperationPlan(",
  "            o->getQuantity(), d, Date::infinitePast, o->getBatch(), nullptr,",
  "            nullptr, 0, true);",
  "        d = p->getEnd() + e->getOperation()->getPostTime();",
  "        p->setOwner(o);  // Required to get the correct ordering of the steps",
  "        // created sub operationplan inherits from owner status",
  "        p->setStatus(o->getStatus());",
  "      }",
  "    }",
  "  }",
  "  return true;",
  "}",
  "",
  "SearchMode decodeSearchMode(const string& c) {",
  "  if (c == \"PRIORITY\") return SearchMode::PRIORITY;",
  "  if (c == \"MINCOST\") return SearchMode::MINCOST;",
  "  if (c == \"MINPENALTY\") return SearchMode::MINPENALTY;",
  "  if (c == \"MINCOSTPENALTY\") return SearchMode::MINCOSTPENALTY;",
  "  throw DataException(\"Invalid search mode \" + c);",
  "}",
  "",
  "OperationPlanState OperationAlternate::setOperationPlanParameters(",
  "    OperationPlan* opplan, double q, Date s, Date e, bool preferEnd,",
  "    bool execute, bool roundDown, bool later) const {",
  "  // Invalid calls to this function",
  "  if (!opplan || q < 0)",
  "    throw LogicException(\"Incorrect parameters for alternate operationplan\");",
  "",
  "  // Confirmed operationplans are untouchable",
  "  if (opplan->getConfirmed()) return OperationPlanState(opplan);",
  "",
  "  OperationPlan* x = opplan->lastsubopplan;",
  "  if (!x) {",
  "    // Blindly accept the parameters if there is no suboperationplan",
  "    if (execute) {",
  "      opplan->setQuantity(q, roundDown, false);",
  "      opplan->clearSetupEvent();",
  "      opplan->setStartAndEnd(s, e);",
  "      return OperationPlanState(opplan);",
  "    } else",
  "      return OperationPlanState(",
  "          s, e, opplan->setQuantity(q, roundDown, false, false));",
  "  } else",
  "    // Pass the call to the sub-operation",
  "    return x->setOperationPlanParameters(q, s, e, preferEnd, execute, roundDown,",
  "                                         later);",
  "}",
  "",
  "bool OperationAlternate::extraInstantiate(OperationPlan* o,",
  "                                          bool createsubopplans, bool) {",
  "  // Create a suboperationplan if one doesn't exist yet.",
  "  // We use the first effective alternate by default.",
  "  if (createsubopplans && !o->lastsubopplan) {",
  "    // Find the right operation",
  "    auto altIter = getSubOperations().begin();",
  "    for (; altIter != getSubOperations().end();) {",
  "      // Filter out alternates that are not suitable",
  "      if ((*altIter)->getPriority() != 0 &&",
  "          (*altIter)->getEffective().within(o->getEnd()))",
  "        break;",
  "    }",
  "    if (altIter != getSubOperations().end())",
  "      // Create an operationplan instance",
  "      (*altIter)->getOperation()->createOperationPlan(",
  "          o->getQuantity(), o->getStart(), o->getEnd(), o->getBatch(), nullptr,",
  "          o, 0, true);",
  "  }",
  "  return true;",
  "}",
  "",
  "OperationPlanState OperationSplit::setOperationPlanParameters(",
  "    OperationPlan* opplan, double q, Date s, Date e, bool, bool execute,",
  "    bool roundDown, bool) const {",
  "  // Invalid calls to this function",
  "  if (!opplan || q < 0)",
  "    throw LogicException(\"Incorrect parameters for split operationplan\");",
  "",
  "  // Confirmed operationplans are untouchable",
  "  if (opplan->getConfirmed()) return OperationPlanState(opplan);",
  "",
  "  // Blindly accept the parameters: only sizing constraints from the child",
  "  // operations are respected.",
  "  if (execute) {",
  "    opplan->setQuantity(q, roundDown, false);",
  "    opplan->clearSetupEvent();",
  "    opplan->setStartAndEnd(s, e);",
  "    return OperationPlanState(opplan);",
  "  } else",
  "    return OperationPlanState(s, e, q);",
  "}",
  "",
  "bool OperationSplit::extraInstantiate(OperationPlan* o, bool createsubopplans,",
  "                                      bool) {",
  "  if (!createsubopplans || o->lastsubopplan)",
  "    // Suboperationplans already exist. Nothing to do here.",
  "    return true;",
  "",
  "  // Compute the sum of all effective percentages.",
  "  int sum_percent = 0;",
  "  Date enddate = o->getEnd();",
  "  for (auto& altIter : getSubOperations()) {",
  "    if (altIter->getEffective().within(enddate))",
  "      sum_percent += altIter->getPriority();",
  "  }",
  "  if (!sum_percent)",
  "    // Oops, no effective suboperations found.",
  "    // Let's not create any suboperationplans then.",
  "    return true;",
  "",
  "  // Create all child operationplans",
  "  for (auto& altIter : getSubOperations()) {",
  "    // Verify effectivity date and percentage > 0",
  "    if (!altIter->getPriority() || !altIter->getEffective().within(enddate))",
  "      continue;",
  "",
  "    // Find the first producing flow.",
  "    // In case the split suboperation produces multiple materials this code",
  "    // is not foolproof...",
  "    const Flow* f = nullptr;",
  "    for (auto fiter = altIter->getOperation()->getFlows().begin();",
  "         fiter != altIter->getOperation()->getFlows().end() && !f; ++fiter) {",
  "      if (fiter->getQuantity() > 0.0 && fiter->getEffective().within(enddate))",
  "        f = &*fiter;",
  "    }",
  "",
  "    // Create an operationplan instance",
  "    altIter->getOperation()->createOperationPlan(",
  "        o->getQuantity() * altIter->getPriority() / sum_percent /",
  "            (f ? f->getQuantity() : 1.0),",
  "        o->getStart(), enddate, o->getBatch(), nullptr, o, 0, true);",
  "  }",
  "  return true;",
  "}",
  "",
  "void Operation::addSubOperationPlan(OperationPlan* parent, OperationPlan* child,",
  "                                    bool) {",
  "  // Check",
  "  if (!parent) throw LogicException(\"Invalid parent for suboperationplan\");",
  "  if (!child) throw LogicException(\"Adding null suboperationplan\");",
  "  if (parent->firstsubopplan)",
  "    throw LogicException(\"Expected suboperationplan list to be empty\");",
  "",
  "  // Adding a suboperationplan that was already added",
  "  if (child->owner == parent) return;",
  "",
  "  // Clear the previous owner, if there is one",
  "  if (child->owner) child->owner->eraseSubOperationPlan(child);",
  "",
  "  // Set as only child operationplan",
  "  parent->firstsubopplan = child;",
  "  parent->lastsubopplan = child;",
  "  child->owner = parent;",
  "",
  "  // Update the flow and loadplans",
  "  parent->update();",
  "}",
  "",
  "void OperationSplit::addSubOperationPlan(OperationPlan* parent,",
  "                                         OperationPlan* child, bool fast) {",
  "  // Check",
  "  if (!parent) throw LogicException(\"Invalid parent for suboperationplan\");",
  "  if (!child) throw DataException(\"Adding null suboperationplan\");",
  "",
  "  // Adding a suboperationplan that was already added",
  "  if (child->owner == parent) return;",
  "",
  "  if (!fast) {",
  "    // Check whether the new alternate is a valid suboperation",
  "    bool ok = false;",
  "    const Operationlist& alts = parent->getOperation()->getSubOperations();",
  "    for (auto alt : alts)",
  "      if (alt->getOperation() == child->getOperation()) {",
  "        ok = true;",
  "        break;",
  "      }",
  "    if (!ok) throw DataException(\"Invalid split suboperationplan\");",
  "  }",
  "",
  "  // The new child operationplan is inserted as the first unlocked",
  "  // suboperationplan.",
  "  if (!parent->firstsubopplan) {",
  "    // First element",
  "    parent->firstsubopplan = child;",
  "    parent->lastsubopplan = child;",
  "  } else {",
  "    // New head",
  "    child->nextsubopplan = parent->firstsubopplan;",
  "    parent->firstsubopplan->prevsubopplan = child;",
  "    parent->firstsubopplan = child;",
  "  }",
  "",
  "  // Update the owner",
  "  if (child->owner) child->owner->eraseSubOperationPlan(child);",
  "  child->owner = parent;",
  "",
  "  // Update the flow and loadplans",
  "  parent->update();",
  "}",
  "",
  "void OperationAlternate::addSubOperationPlan(OperationPlan* parent,",
  "                                             OperationPlan* child, bool fast) {",
  "  // Check",
  "  if (!parent) throw LogicException(\"Invalid parent for suboperationplan\");",
  "  if (!child) throw DataException(\"Adding null suboperationplan\");",
  "",
  "  // Adding a suboperationplan that was already added",
  "  if (child->owner == parent) return;",
  "",
  "  if (!fast) {",
  "    // Check whether the new alternate is a valid suboperation",
  "    bool ok = false;",
  "    const Operationlist& alts = parent->getOperation()->getSubOperations();",
  "    for (auto alt : alts)",
  "      if (alt->getOperation() == child->getOperation()) {",
  "        ok = true;",
  "        break;",
  "      }",
  "    if (!ok) throw DataException(\"Invalid alternate suboperationplan\");",
  "  }",
  "",
  "  // Link in the list, keeping the right ordering",
  "  if (!parent->firstsubopplan) {",
  "    // First element",
  "    parent->firstsubopplan = child;",
  "    parent->lastsubopplan = child;",
  "  } else {",
  "    // Remove previous head alternate suboperationplan",
  "    // if (parent->firstsubopplan->getLocked())",
  "    //  throw DataException(\"Can't replace locked alternate suboperationplan\");",
  "    OperationPlan* tmp = parent->firstsubopplan;",
  "    parent->eraseSubOperationPlan(tmp);",
  "    delete tmp;",
  "    // New head",
  "    parent->firstsubopplan = child;",
  "    parent->lastsubopplan = child;",
  "  }",
  "",
  "  // Update the owner",
  "  if (child->owner) child->owner->eraseSubOperationPlan(child);",
  "  child->owner = parent;",
  "",
  "  // Update the flow and loadplans",
  "  parent->update();",
  "}",
  "",
  "void OperationRouting::addSubOperationPlan(OperationPlan* parent,",
  "                                           OperationPlan* child, bool fast) {",
  "  // Check",
  "  if (!parent) throw LogicException(\"Invalid parent for suboperationplan\");",
  "  if (!child) throw LogicException(\"Adding null suboperationplan\");",
  "",
  "  // Adding a suboperationplan that was already added",
  "  if (child->owner == parent) return;",
  "",
  "  // Link in the suoperationplan list",
  "  if (fast) {",
  "    // Method 1: Fast insertion",
  "    // The new child operationplan is inserted as the first unlocked",
  "    // suboperationplan.",
  "    // No validation of the input data is performed.",
  "    // We assume the child operationplan to be unlocked.",
  "    // No netting with locked suboperationplans.",
  "    if (!parent->firstsubopplan) {",
  "      // First element",
  "      parent->firstsubopplan = child;",
  "      parent->lastsubopplan = child;",
  "    } else {",
  "      // New head",
  "      child->nextsubopplan = parent->firstsubopplan;",
  "      parent->firstsubopplan->prevsubopplan = child;",
  "      parent->firstsubopplan = child;",
  "    }",
  "  } else {",
  "    // Method 2: full validation",
  "    // We verify that the new operationplan is a valid step in the routing.",
  "    // The child element is inserted at the right place in the list.",
  "    // Search if an existing operationplan matches",
  "    OperationPlan* subopplan = parent->firstsubopplan;",
  "    for (; subopplan; subopplan = subopplan->nextsubopplan)",
  "      if (subopplan->getOperation() == child->getOperation()) {",
  "        break;",
  "      }",
  "",
  "    // If not existing yet, find the correct position in the list",
  "    if (!subopplan) {",
  "      subopplan = parent->firstsubopplan;",
  "      for (auto& step : steps) {",
  "        if (subopplan && step->getOperation() == subopplan->getOperation())",
  "          subopplan = subopplan->nextsubopplan;",
  "        if (step->getOperation() == child->getOperation()) break;",
  "      }",
  "    }",
  "",
  "    // Remove existing suboperationplan",
  "    if (subopplan && subopplan->getOperation() == child->getOperation()) {",
  "      parent->eraseSubOperationPlan(subopplan);",
  "      OperationPlan* tmp = subopplan->nextsubopplan;",
  "      delete subopplan;",
  "      subopplan = tmp;",
  "    }",
  "",
  "    // Insert the new suboperationplan.",
  "    // The variable subopplan points to the suboperationplan before which we",
  "    // need to insert the new suboperationplan.",
  "    if (subopplan) {",
  "      // Append in middle of suboperationplan list",
  "      child->nextsubopplan = subopplan;",
  "      child->prevsubopplan = subopplan->prevsubopplan;",
  "      if (subopplan->prevsubopplan)",
  "        subopplan->prevsubopplan->nextsubopplan = child;",
  "      else",
  "        parent->firstsubopplan = child;",
  "      subopplan->prevsubopplan = child;",
  "      // Propagate backward to assure the timing of the preceding routing steps",
  "      for (auto prevstep = child; prevstep;",
  "           prevstep = prevstep->prevsubopplan) {",
  "        if (prevstep->getConfirmed())",
  "          continue;",
  "        else if (prevstep->prevsubopplan &&",
  "                 prevstep->prevsubopplan->getEnd() > prevstep->getStart())",
  "          prevstep->prevsubopplan->setEnd(prevstep->getStart());",
  "      }",
  "      // Propagate forward to assure the timing of the preceding routing steps",
  "      for (auto followingsteps = child; followingsteps;",
  "           followingsteps = followingsteps->nextsubopplan) {",
  "        if (followingsteps->getConfirmed())",
  "          continue;",
  "        else if (followingsteps->prevsubopplan &&",
  "                 followingsteps->prevsubopplan->getEnd() >",
  "                     followingsteps->getStart())",
  "          followingsteps->setStart(followingsteps->prevsubopplan->getEnd());",
  "      }",
  "    } else if (parent->lastsubopplan) {",
  "      // Append at end of suboperationplan list",
  "      child->prevsubopplan = parent->lastsubopplan;",
  "      parent->lastsubopplan->nextsubopplan = child;",
  "      parent->lastsubopplan = child;",
  "      // Propagate backward to assure the timing of the preceding routing steps",
  "      for (auto prevstep = child; prevstep;",
  "           prevstep = prevstep->prevsubopplan) {",
  "        if (prevstep->getConfirmed())",
  "          continue;",
  "        else if (prevstep->prevsubopplan &&",
  "                 prevstep->prevsubopplan->getEnd() > prevstep->getStart())",
  "          prevstep->prevsubopplan->setEnd(prevstep->getStart());",
  "      }",
  "      // Propagate forward to assure the timing of the subsequent routing steps",
  "      if (child->prevsubopplan &&",
  "          child->prevsubopplan->getEnd() > child->getStart() &&",
  "          !child->getConfirmed())",
  "        child->setStart(child->prevsubopplan->getEnd());",
  "    } else {",
  "      // First suboperationplan",
  "      parent->lastsubopplan = child;",
  "      parent->firstsubopplan = child;",
  "    }",
  "  }",
  "",
  "  // Update the owner",
  "  if (child->owner) child->owner->eraseSubOperationPlan(child);",
  "  child->owner = parent;",
  "",
  "  // Update the flow and loadplans",
  "  parent->update();",
  "}",
  "",
  "double Operation::setOperationPlanQuantity(OperationPlan* oplan, double f,",
  "                                           bool roundDown, bool upd,",
  "                                           bool execute, Date end) const {",
  "  assert(oplan);",
  "",
  "  // Invalid operationplan: the quantity must be >= 0.",
  "  if (f < 0)",
  "    throw DataException(\"Operationplans can't have negative quantities\");",
  "",
  "  // Only proposed and approved operationplans respect sizing constraints.",
  "  // Special case: a confirmed step in a approved or proposed routing",
  "  // operationplan also needs to respect the sizing constraints.",
  "  if (!oplan->getProposed() && !oplan->getApproved() &&",
  "      !(oplan->getOwner() &&",
  "        oplan->getOwner()->getOperation()->hasType<OperationRouting>() &&",
  "        (oplan->getOwner()->getProposed() ||",
  "         oplan->getOwner()->getApproved()))) {",
  "    if (execute) {",
  "      oplan->quantity = f;",
  "      if (upd) oplan->update();",
  "    }",
  "    return f;",
  "  }",
  "",
  "  // Setting a quantity is only allowed on a top operationplan.",
  "  // Two exceptions: on alternate and split operations the sizing on the",
  "  // sub-operations is respected.",
  "  if (oplan->owner && !oplan->owner->getOperation()",
  "                           ->hasType<OperationAlternate, OperationSplit>())",
  "    return oplan->owner->setQuantity(f, roundDown, upd, execute, end);",
  "",
  "  // Compute the correct size for the operationplan",
  "  if (oplan->getOperation()->hasType<OperationSplit>()) {",
  "    // A split operation doesn't respect any size constraints at the parent",
  "    // level",
  "    if (execute) {",
  "      oplan->quantity = f;",
  "      if (upd) oplan->update();",
  "    }",
  "    return f;",
  "  } else if (fabs(f - oplan->quantity) < ROUNDING_ERROR / 100) {",
  "    // No real change",
  "    if (!execute) return oplan->quantity;",
  "  } else {",
  "    // All others respect constraints",
  "    double curmin = 0.0;",
  "    if (getSizeMinimumCalendar())",
  "      // Minimum varies over time",
  "      curmin = getSizeMinimumCalendar()->getValue(end ? end : oplan->getEnd());",
  "    if (curmin < getSizeMinimum())",
  "      // Minimum is constant",
  "      curmin = getSizeMinimum();",
  "    if (f != 0.0 && curmin > 0.0 && f <= curmin - ROUNDING_ERROR &&",
  "        curmin <= getSizeMaximum()) {",
  "      if (roundDown) {",
  "        // Smaller than the minimum quantity, rounding down means... nothing",
  "        if (!execute) return 0.0;",
  "        oplan->quantity = 0.0;",
  "        // Update the flow and loadplans, and mark for problem detection",
  "        if (upd) oplan->update();",
  "        // Update the parent of an alternate operationplan",
  "        if (oplan->owner &&",
  "            oplan->owner->getOperation()->hasType<OperationAlternate>()) {",
  "          oplan->owner->quantity = 0.0;",
  "          if (upd) oplan->owner->resizeFlowLoadPlans();",
  "        }",
  "        return 0.0;",
  "      }",
  "      f = curmin;",
  "    }",
  "    if (f != 0.0 && f >= getSizeMaximum()) {",
  "      // If min and max are conflicting, we respect the maximum",
  "      roundDown = true;  // force rounddown to stay below the limit",
  "      f = getSizeMaximum();",
  "    }",
  "    if (f != 0.0 && getSizeMultiple() > 0.0) {",
  "      double mult =",
  "          floor(f / getSizeMultiple() + (roundDown ? 0.0 : 0.99999999));",
  "      double q = mult * getSizeMultiple();",
  "      if (q < curmin && curmin <= getSizeMaximum()) {",
  "        if (roundDown) {",
  "          // Smaller than the minimum quantity, rounding down means... nothing",
  "          if (!execute) return 0.0;",
  "          oplan->quantity = 0.0;",
  "          // Update the flow and loadplans, and mark for problem detection",
  "          if (upd) oplan->update();",
  "          // Update the parent of an alternate operationplan",
  "          if (oplan->owner &&",
  "              oplan->owner->getOperation()->hasType<OperationAlternate>()) {",
  "            oplan->owner->quantity = 0.0;",
  "            if (upd) oplan->owner->resizeFlowLoadPlans();",
  "          }",
  "          return 0.0;",
  "        } else",
  "          q += getSizeMultiple();",
  "      } else if (q > getSizeMaximum()) {",
  "        q -= getSizeMultiple();",
  "        if (q < ROUNDING_ERROR) q = getSizeMultiple();",
  "      }",
  "      if (!execute) return q;",
  "      oplan->quantity = q;",
  "    } else {",
  "      if (!execute) return f;",
  "      oplan->quantity = f;",
  "    }",
  "  }",
  "",
  "  // Update the parent of an alternate operationplan",
  "  if (execute && oplan->owner &&",
  "      oplan->owner->getOperation()->hasType<OperationAlternate>()) {",
  "    oplan->owner->quantity = oplan->quantity;",
  "    if (upd) oplan->owner->resizeFlowLoadPlans();",
  "  }",
  "",
  "  // Apply the same size also to its unlocked children",
  "  if (execute && oplan->firstsubopplan)",
  "    for (auto i = oplan->firstsubopplan; i; i = i->nextsubopplan)",
  "      if (!i->getConfirmed()) {",
  "        bool resize = i->getOperation()->hasType<OperationTimePer>() &&",
  "                      fabs(i->quantity - oplan->quantity) > ROUNDING_ERROR;",
  "        i->quantity = oplan->quantity;",
  "        if (resize)",
  "          i->setOperationPlanParameters(oplan->quantity, Date::infinitePast,",
  "                                        i->getEnd());",
  "        if (upd) i->resizeFlowLoadPlans();",
  "      }",
  "",
  "  // Update the flow and loadplans, and mark for problem detection",
  "  if (upd) oplan->update();",
  "  return oplan->quantity;",
  "}",
  "",
  "double OperationRouting::setOperationPlanQuantity(OperationPlan* oplan,",
  "                                                  double f, bool roundDown,",
  "                                                  bool upd, bool execute,",
  "                                                  Date end) const {",
  "  assert(oplan);",
  "  // Call the default logic, implemented on the Operation class",
  "  double newqty = Operation::setOperationPlanQuantity(oplan, f, roundDown,",
  "                                                      false, execute, end);",
  "  if (!execute) return newqty;",
  "",
  "  // Update all routing sub operationplans",
  "  for (auto i = oplan->firstsubopplan; i; i = i->nextsubopplan) {",
  "    i->quantity = newqty;",
  "    if (upd) i->resizeFlowLoadPlans();",
  "  }",
  "",
  "  // Update the flow and loadplans, and mark for problem detection",
  "  if (upd) oplan->update();",
  "",
  "  return newqty;",
  "}",
  "",
  "void Operation::setItem(Item* i) {",
  "  if (i == item) return;",
  "",
  "  // Unlink from previous item",
  "  if (item) {",
  "    if (item->firstOperation == this)",
  "      // Remove from head",
  "      item->firstOperation = next;",
  "    else {",
  "      // Remove from middle",
  "      Operation* j = item->firstOperation;",
  "      while (j && j->next && j->next != this) j = j->next;",
  "      if (j && j->next == this)",
  "        j->next = next;",
  "      else",
  "        throw LogicException(\"Corrupted Operation list on Item\");",
  "    }",
  "  }",
  "",
  "  // Update item",
  "  item = i;",
  "",
  "  // Link at the new owner.",
  "  // We insert ourself at the head of the list.",
  "  if (item) {",
  "    next = item->firstOperation;",
  "    item->firstOperation = this;",
  "  }",
  "",
  "  // Trigger level and cluster recomputation",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "pair<Duration, Date> OperationAlternate::getDecoupledLeadTime(",
  "    double qty, Date startdate) const {",
  "  Duration leadtime;",
  "  Date enddate = startdate;",
  "",
  "  // Find the preferred alternate",
  "  int curPrio = INT_MAX;",
  "  Operation* suboper = nullptr;",
  "  for (auto& sub : getSubOperations()) {",
  "    if (sub->getPriority() < curPrio && sub->getEffective().within(startdate)) {",
  "      suboper = sub->getOperation();",
  "      curPrio = sub->getPriority();",
  "    }",
  "  }",
  "",
  "  // Handle the case where no sub-operation is effective at all",
  "  if (!suboper) return make_pair(Duration(999L * 86400L), Date::infiniteFuture);",
  "",
  "  // Respect the size constraint of the child operation",
  "  double qty2 = qty;",
  "  if (qty2 < suboper->getSizeMinimum()) qty2 = suboper->getSizeMinimum();",
  "  if (suboper->getSizeMinimumCalendar()) {",
  "    double curmin = suboper->getSizeMinimumCalendar()->getValue(startdate);",
  "    if (qty2 < curmin) qty2 = curmin;",
  "  }",
  "",
  "  // Find the longest supply path for all flows on the top operation",
  "  for (const auto& fl : getFlows()) {",
  "    if (fl.getQuantity() >= 0 || fl.getBuffer()->getItem() == getItem())",
  "      continue;",
  "    auto tmp = fl.getBuffer()->getDecoupledLeadTime(qty2, startdate, false);",
  "    if (tmp.second > enddate) {",
  "      leadtime = tmp.first;",
  "      enddate = tmp.second;",
  "    }",
  "  }",
  "",
  "  // Add the suboperation's own duration",
  "  return suboper->getDecoupledLeadTime(qty2, enddate);",
  "}",
  "",
  "pair<Duration, Date> OperationSplit::getDecoupledLeadTime(",
  "    double qty, Date startdate) const {",
  "  Duration totalmax;",
  "  Date enddatemax = startdate;",
  "  for (auto& sub : getSubOperations()) {",
  "    if (!sub->getEffective().within(startdate))",
  "      // This suboperation is not effective",
  "      continue;",
  "",
  "    // Respect the size constraint of the child operation",
  "    Operation* suboper = sub->getOperation();",
  "    Duration maxSub;",
  "    Date maxSubEnd = startdate;",
  "    double qty2 = qty;",
  "    if (qty2 < suboper->getSizeMinimum()) qty2 = suboper->getSizeMinimum();",
  "    if (suboper->getSizeMinimumCalendar()) {",
  "      double curmin = suboper->getSizeMinimumCalendar()->getValue(startdate);",
  "      if (qty2 < curmin) qty2 = curmin;",
  "    }",
  "",
  "    // Find the longest supply path for all flows on the top operation",
  "    for (const auto& fl : getFlows()) {",
  "      if (fl.getQuantity() >= 0 || fl.getBuffer()->getItem() == getItem())",
  "        continue;",
  "      auto tmp = fl.getBuffer()->getDecoupledLeadTime(qty2, startdate, false);",
  "      if (tmp.second > maxSub) {",
  "        maxSub = tmp.first;",
  "        maxSubEnd = tmp.second;",
  "      }",
  "    }",
  "",
  "    // Add suboperation duration",
  "    auto tmp = suboper->getDecoupledLeadTime(qty2, maxSubEnd);",
  "",
  "    // Keep track of the longest of all suboperations",
  "    if (tmp.second > enddatemax) {",
  "      totalmax = tmp.first;",
  "      enddatemax = tmp.second;",
  "    }",
  "  }",
  "  return make_pair(totalmax, enddatemax);",
  "}",
  "",
  "pair<Duration, Date> OperationRouting::getDecoupledLeadTime(",
  "    double qty, Date startdate) const {",
  "  // TODO Code doesn't handle dependencies",
  "",
  "  // Validate the quantity",
  "  if (qty < getSizeMinimum()) qty = getSizeMinimum();",
  "  if (getSizeMinimumCalendar()) {",
  "    double curmin =",
  "        getSizeMinimumCalendar()->getValue(Plan::instance().getCurrent());",
  "    if (qty < curmin) qty = curmin;",
  "  }",
  "",
  "  // The lead time of a routing step is the sum of:",
  "  //  - Duration of any subsequent routing steps",
  "  //  - Its own duration",
  "  //  - Longest lead time of all its flows",
  "  //",
  "  // The lead time of the longest step is taken as the lead time of the",
  "  // total routing.",
  "  Duration nextStepsDuration;",
  "  Duration totalmax;",
  "  for (auto& sub : std::ranges::reverse_view(getSubOperations())) {",
  "    Duration maxSub;",
  "    Operation* suboper = sub->getOperation();",
  "",
  "    // Find the longest supply path for all flows",
  "    for (const auto& fl : suboper->getFlows()) {",
  "      if (fl.getQuantity() >= 0 || fl.getBuffer()->getItem() == getItem())",
  "        continue;",
  "      auto tmp = fl.getBuffer()->getDecoupledLeadTime(qty, startdate, false);",
  "      if (tmp.first > maxSub) maxSub = tmp.first;",
  "    }",
  "",
  "    // Add the operation's own duration to the duration of all",
  "    // routing steps",
  "    if (suboper->hasType<OperationFixedTime, OperationItemDistribution,",
  "                         OperationItemSupplier>()) {",
  "      // Fixed duration operation types",
  "      auto* op = static_cast<OperationFixedTime*>(suboper);",
  "      nextStepsDuration += op->getDuration();",
  "    } else if (suboper->hasType<OperationTimePer>()) {",
  "      // Variable duration operation types",
  "      auto* op = static_cast<OperationTimePer*>(suboper);",
  "      nextStepsDuration +=",
  "          op->getDuration() + static_cast<long>(op->getDurationPer() * qty);",
  "    } else",
  "      logger",
  "          << \"Warning: suboperation of unsupported type for routing operation '\"",
  "          << getName() << \"'\\n\";",
  "",
  "    // Take the longest of all routing steps",
  "    if (maxSub + nextStepsDuration > totalmax)",
  "      totalmax = maxSub + nextStepsDuration;",
  "  }",
  "",
  "  // Compute the end date of the lead time",
  "  Date enddate = startdate;",
  "  for (auto& sub : getSubOperations()) {",
  "    enddate = sub->getOperation()->getDecoupledLeadTime(qty, enddate).second;",
  "  }",
  "",
  "  return make_pair(totalmax, enddate);",
  "}",
  "",
  "pair<Duration, Date> OperationFixedTime::getDecoupledLeadTime(",
  "    double qty, Date startdate) const {",
  "  Duration leadtime;",
  "  Date enddate = startdate;",
  "",
  "  // Validate the quantity",
  "  if (qty < getSizeMinimum()) qty = getSizeMinimum();",
  "  if (getSizeMinimumCalendar()) {",
  "    double curmin = getSizeMinimumCalendar()->getValue(startdate);",
  "    if (qty < curmin) qty = curmin;",
  "  }",
  "",
  "  // Find the longest supply path for all flows",
  "  for (const auto& fl : getFlows()) {",
  "    if (fl.getQuantity() >= 0 || fl.getBuffer()->getItem() == getItem())",
  "      continue;",
  "    auto tmp = fl.getBuffer()->getDecoupledLeadTime(qty, startdate, false);",
  "    if (tmp.second > enddate) {",
  "      leadtime = tmp.first;",
  "      enddate = tmp.second;",
  "    }",
  "  }",
  "",
  "  // Add the operation's own duration",
  "  auto d = getDuration();",
  "  leadtime += d;",
  "  enddate = calculateOperationTime(nullptr, enddate, d, true).getEnd();",
  "  return make_pair(leadtime, enddate);",
  "}",
  "",
  "pair<Duration, Date> OperationTimePer::getDecoupledLeadTime(",
  "    double qty, Date startdate) const {",
  "  Duration leadtime;",
  "  Date enddate = startdate;",
  "",
  "  // Validate the quantity",
  "  if (qty < getSizeMinimum()) qty = getSizeMinimum();",
  "  if (getSizeMinimumCalendar()) {",
  "    double curmin = getSizeMinimumCalendar()->getValue(startdate);",
  "    if (qty < curmin) qty = curmin;",
  "  }",
  "",
  "  // Find the longest supply path for all flows",
  "  for (const auto& fl : getFlows()) {",
  "    if (fl.getQuantity() >= 0 || fl.getBuffer()->getItem() == getItem())",
  "      continue;",
  "    auto tmp = fl.getBuffer()->getDecoupledLeadTime(qty, startdate, false);",
  "    if (tmp.second > enddate) {",
  "      leadtime = tmp.first;",
  "      enddate = tmp.second;",
  "    }",
  "  }",
  "",
  "  // Add the operation's own duration",
  "  auto d = getDuration() + static_cast<long>(qty * getDurationPer());",
  "  leadtime += d;",
  "  enddate = calculateOperationTime(nullptr, enddate, d, true).getEnd();",
  "  return make_pair(leadtime, enddate);",
  "}",
  "",
  "PyObject* Operation::getDecoupledLeadTimePython(PyObject* self,",
  "                                                PyObject* args) {",
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
  "        static_cast<Operation*>(self)->getDecoupledLeadTime(qty, startdate);",
  "    return PythonData(lt.first);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "Operation* Operation::findFromName(const string& nm) {",
  "  Operation* oper = Operation::find(nm);",
  "  if (oper)",
  "    // The operation already exists",
  "    return oper;",
  "  else if (nm.substr(0, 5) == \"Ship \") {",
  "    size_t pos3 = nm.rfind(\" valid from \");",
  "    size_t pos1 = nm.rfind(\" from \", pos3);",
  "    size_t pos2 = nm.rfind(\" to \");",
  "    if (pos1 != string::npos && pos2 != string::npos) {",
  "      // Build a transfer operation: \"Ship ITEM from LOCATION to LOCATION\"",
  "      // or \"Ship ITEM from LOCATION to LOCATION valid from DATETIME\"",
  "      Date eff_start;",
  "      if (pos3 != string::npos) {",
  "        string eff_start_name = nm.substr(pos3 + 12, string::npos);",
  "        eff_start = Date(eff_start_name.c_str());",
  "      }",
  "      string item_name = nm.substr(5, pos1 - 5);",
  "      string orig_name = nm.substr(pos1 + 6, pos2 - pos1 - 6);",
  "      string dest_name = nm.substr(",
  "          pos2 + 4, pos3 == string::npos ? string::npos : pos3 - pos2 - 4);",
  "      Item* item = Item::find(item_name);",
  "      Location* origin = Location::find(orig_name);",
  "      Location* destination = Location::find(dest_name);",
  "      if (item && origin && destination) {",
  "        // Find itemdistribution",
  "        const ItemDistribution* item_dist = nullptr;",
  "        for (const auto& dist : item->getDistributions()) {",
  "          if (origin == dist.getOrigin() &&",
  "              (!dist.getDestination() ||",
  "               destination == dist.getDestination()) &&",
  "              dist.getEffectiveStart() == eff_start) {",
  "            item_dist = &dist;",
  "            break;",
  "          }",
  "        }",
  "        if (item_dist)",
  "          // Create the operation",
  "          return new OperationItemDistribution(",
  "              const_cast<ItemDistribution*>(item_dist),",
  "              Buffer::findOrCreate(item, origin),",
  "              Buffer::findOrCreate(item, destination));",
  "      }",
  "    } else {",
  "      // Build a delivery operation: \"Ship ITEM @ LOC\"",
  "      string buf_name = nm.substr(5, string::npos);",
  "      Buffer* buf = Buffer::findFromName(buf_name);",
  "      if (buf) {",
  "        // Create the operation",
  "        oper = new OperationDelivery();",
  "        oper->setName(nm);",
  "        static_cast<OperationDelivery*>(oper)->setBuffer(buf);",
  "        return oper;",
  "      }",
  "    }",
  "  } else if (nm.substr(0, 9) == \"Purchase \") {",
  "    // Build a purchasing operation: \"Purchase ITEM @ LOCATION from SUPPLIER\"",
  "    // or \"Purchase ITEM @ LOCATION from SUPPLIER valid from DATETIME\"",
  "    size_t pos2 = nm.rfind(\" valid from \");",
  "    Date eff_start;",
  "    if (pos2 != string::npos) {",
  "      string eff_start_name = nm.substr(pos2 + 12, string::npos);",
  "      eff_start = Date(eff_start_name.c_str());",
  "    }",
  "    size_t pos1 = nm.rfind(\" from \", pos2);",
  "    if (pos1 != string::npos) {",
  "      string buf_name = nm.substr(9, pos1 - 9);",
  "      string supplier_name = nm.substr(",
  "          pos1 + 6, pos2 == string::npos ? string::npos : pos2 - pos1 - 6);",
  "      Buffer* buf = Buffer::findFromName(buf_name);",
  "      Supplier* sup = Supplier::find(supplier_name);",
  "      if (buf && sup && buf->getItem() && buf->getLocation()) {",
  "        // Find itemsupplier",
  "        ItemSupplier* item_sup = nullptr;",
  "        for (auto it = buf->getItem(); it && !item_sup; it = it->getOwner()) {",
  "          Item::supplierlist::const_iterator supitem_iter =",
  "              it->getSupplierIterator();",
  "          while (ItemSupplier* i = supitem_iter.next()) {",
  "            if ((!i->getLocation() || buf->getLocation() == i->getLocation()) &&",
  "                i->getEffectiveStart() == eff_start)",
  "              item_sup = i;",
  "          }",
  "        }",
  "        if (item_sup)",
  "          // Create the operation",
  "          return new OperationItemSupplier(item_sup, buf);",
  "      }",
  "    }",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "void Operation::updateMTO() {",
  "  for (const auto& fl : getFlows()) {",
  "    auto i = fl.getItem();",
  "    if (i && i->hasType<ItemMTO>()) {",
  "      flags |= FLAGS_MTO;",
  "      return;",
  "    }",
  "  }",
  "  flags &= ~FLAGS_MTO;",
  "}",
  "",
  "}  // namespace frepple",
];
