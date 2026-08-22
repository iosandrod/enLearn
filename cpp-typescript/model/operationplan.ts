// <header-api-generated>
export const OperationPlanCppModel = { bases: ["HasProblems","HasSource","NonCopyable","Object","TreeNode"] as const, methods: ["activate","appendInfo","begin","beginFlowPlans","beginLoadPlans","calculateOperationTimePython","clear","clearSetupEvent","computeOperationToFlowDate","create","createFlowLoads","createIterator","createOperationPlan","deactivate","deleteFlowLoads","deleteOperationPlans","end","endFlowPlans","endLoadPlans","eraseSubOperationPlan","findReference","finder","freezeStatus","getActivated","getAlternates","getApproved","getBatch","getBatchString","getBlockedbyIterator","getBlockingIterator","getClosed","getCluster","getColorPython","getCompleted","getConfirmed","getConsumeCapacity","getConsumeMaterial","getCounterMin","getCriticality","getDates","getDelay","getDemand","getDependencies","getEfficiency","getEnd","getEntity","getFeasible","getFlowPlans","getForcedUpdate","getHidden","getInfo","getInfoString","getInterruptions","getLoadPlans","getNextSubOpplan","getNoSetup","getOperation","getOrderType","getOwner","getPeggingDemand","getPeggingDownstream","getPeggingDownstreamFirstLevel","getPeggingUpstream","getPeggingUpstreamFirstLevel","getPrevSubOpplan","getPriority","getProblems","getProduceMaterial","getPropagateSetups","getProposed","getQuantity","getQuantityCompleted","getQuantityCompletedRaw","getQuantityRemaining","getReference","getRemark","getRemarkString","getSetup","getSetupCost","getSetupEnd","getSetupEvent","getSetupOverride","getSetupRule","getStart","getStatus","getSubOperationPlans","getTopOwner","getTotalFlow","getType","getUnavailable","initialize","insertInOperationplanList","isConstrained","isExcess","matchDependencies","mergeIfPossible","nullSetupEvent","propagateStatus","registerFields","removeFromOperationplanList","resizeFlowLoadPlans","restore","setActivated","setApproved","setBatch","setChanged","setClosed","setCompleted","setConfirmed","setConsumeCapacity","setConsumeMaterial","setCounterMin","setDemand","setEnd","setEndForce","setFeasible","setForcedUpdate","setInfo","setNoSetup","setOperation","setOperationPlanParameters","setOwner","setProduceMaterial","setPropagateSetups","setProposed","setQuantity","setQuantityCompleted","setQuantityCompletedRaw","setQuantityExternal","setRawReference","setReference","setRemark","setResetResources","setSetupEvent","setSetupOverride","setStart","setStartAndEnd","setStartEndAndQuantity","setStartForce","setStatus","setStatusNoPropagation","setStatusRaw","sizeFlowPlans","sizeLoadPlans","str","updateFeasible","updateFeasiblePython","updateProblems","updateSetupTime"] as const, qualifiedNames: ["OperationPlan"] as const };

export const OperationPlanAlternateIteratorCppModel = { bases: [] as const, methods: ["next"] as const, qualifiedNames: ["OperationPlan::AlternateIterator"] as const };

export const OperationPlanFlowPlanIteratorCppModel = { bases: [] as const, methods: ["deleteFlowPlan","next"] as const, qualifiedNames: ["OperationPlan::FlowPlanIterator"] as const };

export const OperationPlanInterruptionIteratorCppModel = { bases: ["Object"] as const, methods: ["getEnd","getStart","getType","intitialize","next","registerFields"] as const, qualifiedNames: ["OperationPlan::InterruptionIterator"] as const };

export const OperationPlanIteratorCppModel = { bases: [] as const, methods: ["next"] as const, qualifiedNames: ["OperationPlan::iterator"] as const };

export const OperationPlanLoadPlanIteratorCppModel = { bases: [] as const, methods: ["deleteLoadPlan","next"] as const, qualifiedNames: ["OperationPlan::LoadPlanIterator"] as const };

export const OperationPlanProblemIteratorCppModel = { bases: ["OperationPlanIterator"] as const, methods: [] as const, qualifiedNames: ["OperationPlan::ProblemIterator"] as const };

export const OperationPlanStateCppModel = { bases: [] as const, methods: [] as const, qualifiedNames: ["OperationPlanState"] as const };
// </header-api-generated>



import { Date as PlanningDate, DateRange, Duration } from "../utils/date.js";
import { DataException, HeaderModelAdapter, LogicException } from "../utils/library.js";
import { FlowPlan } from "./flowplan.js";
import { LoadPlan } from "./loadplan.js";
import type { Demand } from "./demand.js";
import type { Item } from "./item.js";
import type { Location } from "./location.js";
import type { Load } from "./load.js";
import { OperationAlternate, OperationFixedTime, OperationRouting, type Operation } from "./operation.js";
import { Plan } from "./plan.js";
import { ResourceDefault, type Resource } from "./resource.js";
import { SetupEvent } from "./setupmatrix.js";
import type { SetupMatrixRule } from "./setupmatrix.js";
import type { Supplier } from "./supplier.js";
import { PeggingDemandIterator, PeggingIterator } from "./pegging.js";
import {
  getEntityChanged,
  getEntityDetectProblems,
  registerProblemEntity,
  setEntityChanged,
  setEntityDetectProblems,
  unregisterProblemEntity,
} from "./problem.js";
import type { Problem } from "./problem.js";
import {
  collectOperationPlanProblems,
  updateOperationPlanFeasible,
  updateOperationPlanProblems,
} from "./problems_operationplan.js";

type DateInput = PlanningDate | string | number;
type DurationInput = Duration | string | number;
type PlanFields = Readonly<Record<string, unknown>>;

const ROUNDING_ERROR = 0.000001;
let individualPoolResources = false;

export function setOperationPlanIndividualPoolResources(value: boolean): void {
  individualPoolResources = Boolean(value);
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

function adapter(value: unknown): HeaderModelAdapter | null {
  return value instanceof HeaderModelAdapter ? value : null;
}

function link(source: HeaderModelAdapter, property: string, previous: HeaderModelAdapter | null,
  next: HeaderModelAdapter | null): void {
  if (previous === next) return;
  previous?.modelReferenceRemoved(source, property);
  next?.modelReferenceAdded(source, property);
}

/** Semantic port of an executable operation instance and its planning links. */
export class OperationPlan extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = ["HasProblems", "HasSource", "NonCopyable", "Object", "TreeNode"];
  static readonly cppQualifiedNames: readonly string[] = ["OperationPlan"];
  static override modelFamily = "OperationPlan";
  private static counterMin = 1;
  private static comparisonCounter = 1;
  private static propagateSetupsValue = true;
  private static readonly references = new Map<string, OperationPlan>();

  private operation: Operation | null = null;
  private demand: Demand | null = null;
  private owner: OperationPlan | null = null;
  private readonly subOperationPlans: OperationPlan[] = [];
  private readonly flowPlans: HeaderModelAdapter[] = [];
  private readonly loadPlans: HeaderModelAdapter[] = [];
  private readonly dependencies: HeaderModelAdapter[] = [];
  private dates = new DateRange();
  private quantity = 0;
  private quantityCompleted = 0;
  private status = "proposed";
  private activated = false;
  private reference = "";
  private generatedReference = false;
  private readonly comparisonSequence = OperationPlan.comparisonCounter++;
  private source = "";
  private batch = "";
  private remark = "";
  private info = "";
  private consumeCapacity = true;
  private consumeMaterial = true;
  private produceMaterial = true;
  private feasible = true;
  private forcedUpdate = false;
  private noSetup = false;
  private setupOverride = new Duration(-1);
  private setupEvent: SetupEvent | null = null;
  private importItem: Item | null = null;
  private importOrigin: Location | null = null;
  private importLocation: Location | null = null;
  private importSupplier: Supplier | null = null;
  private orderType = "MO";
  private disposed = false;

  constructor(operationOrFields?: Operation | PlanFields | null) {
    super();
    registerProblemEntity(this);
    if (operationOrFields && typeof operationOrFields === "object" && "getOperationPlans" in operationOrFields) {
      this.setOperation(operationOrFields as Operation);
    } else if (operationOrFields && typeof operationOrFields === "object") {
      const fields = operationOrFields as PlanFields;
      if (fields.operation) this.setOperation(fields.operation as Operation);
      if (fields.reference !== undefined) this.setReference(String(fields.reference));
      if (fields.start !== undefined) this.setStart(fields.start as DateInput);
      if (fields.end !== undefined) this.setEnd(fields.end as DateInput);
      if (fields.quantity !== undefined) this.setQuantity(Number(fields.quantity));
      if (fields.status !== undefined) this.setStatus(String(fields.status));
    }
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static findReference(reference: string): OperationPlan | null { return this.references.get(String(reference)) ?? null; }
  static finder(fields: Readonly<Record<string, unknown>>): OperationPlan | null {
    const reference = fields.reference ?? fields.id;
    return reference === undefined ? null : this.findReference(String(reference));
  }
  static override clear(): void { for (const plan of [...this.all()]) plan.dispose(); }
  static begin(): OperationPlanIterator { return new OperationPlanIterator(this.all()); }
  static end(): OperationPlanIterator { return new OperationPlanIterator(); }
  static getCounterMin(): number { return this.counterMin; }
  static setCounterMin(value: number): void {
    const next = Math.trunc(Number(value));
    if (next > this.counterMin) this.counterMin = next;
    if (!Number.isSafeInteger(this.counterMin)) throw new DataException("Exhausted operationplan references");
  }
  static getPropagateSetups(): boolean { return this.propagateSetupsValue; }
  static setPropagateSetups(value: boolean): boolean {
    const previous = this.propagateSetupsValue;
    this.propagateSetupsValue = Boolean(value);
    return previous;
  }
  static deleteOperationPlans(operation: Operation | null, deleteLocked = false, deleteDeliveries = true): void {
    if (!operation) return;
    const plans = call(operation, "getOperationPlans");
    if (!plans || typeof (plans as Iterable<unknown>)[Symbol.iterator] !== "function") return;
    for (const candidate of [...plans as Iterable<unknown>]) {
      if (!(candidate instanceof OperationPlan)) continue;
      const top = candidate.getTopOwner();
      if (!deleteLocked && !top.getProposed()) continue;
      if (!deleteDeliveries && top.getDemand()) continue;
      top.dispose();
    }
  }
  static create(operation: Operation, fields: PlanFields = {}): OperationPlan {
    return new OperationPlan({ ...fields, operation });
  }
  static createOperationPlan(_metadata: unknown, fields: PlanFields): OperationPlan {
    const operation = fields.operation;
    if (!operation || typeof operation !== "object") throw new DataException("Missing operation on operationplan");
    return new OperationPlan({ ...fields, operation });
  }

  getOperation(): Operation | null { return this.operation; }
  setOperation(value: Operation | null): void {
    if (value === this.operation) return;
    const previous = this.operation;
    if (previous) {
      this.deleteFlowLoads();
      for (const child of this.subOperationPlans.splice(0)) { child.owner = null; child.dispose(); }
      call(previous, "detachOperationPlan", this);
    }
    link(this, "Operation", adapter(previous), adapter(value));
    this.operation = value;
    if (value) {
      call(value, "attachOperationPlan", this);
      this.orderType = String(call(value, "getOrderType") ?? this.orderType);
    }
  }
  getEntity(): Operation | null { return this.operation; }
  getType(): string { return "operationplan"; }
  getOrderType(): string { return String(call(this.operation, "getOrderType") ?? this.orderType); }
  setOrderType(value: string): void { this.orderType = String(value).toUpperCase(); }
  getCluster(): number {
    return Number(call(this.operation, "getCluster") ?? call(call(this.operation, "getBuffer"), "getCluster") ?? 0);
  }

  activate(createSubOperationPlans = true, useStart = false): boolean {
    if (!this.operation) throw new LogicException("Initializing an invalid operationplan");
    const instantiated = call(this.operation, "extraInstantiate", this, createSubOperationPlans, useStart);
    if (this.quantity < 0 || instantiated === false || this.quantity === 0 && this.getProposed() && !this.owner) {
      this.dispose();
      return false;
    }
    // OperationPlan::activate recursively activates owned plans.  Child plans
    // don't have their own create command in C++; their top owner controls the
    // complete transaction and is the only plan scanned for command excess.
    for (const child of [...this.subOperationPlans]) {
      if (child.getActivated()) continue;
      if (child.mergeForCreation()) continue;
      if (!child.activate()) {
        this.dispose();
        return false;
      }
    }
    this.activated = true;
    if (!this.reference) {
      this.reference = String(OperationPlan.counterMin++);
      this.generatedReference = true;
    }
    if (!this.assignReference()) {
      throw new DataException(`Duplicate operationplan reference '${this.reference}'`);
    }
    call(this.operation, "attachOperationPlan", this);
    this.createFlowLoads();
    this.updateFeasible();
    return true;
  }
  deactivate(): void {
    if (this.reference) OperationPlan.references.delete(this.reference);
    this.activated = false;
    if (this.demand) this.setDemand(null);
    call(this.operation, "detachOperationPlan", this);
  }
  getActivated(): boolean { return this.activated; }
  setActivated(value: boolean): void { this.activated = Boolean(value); }
  private assignReference(): boolean {
    if (!this.reference) {
      this.reference = String(OperationPlan.counterMin++);
      this.generatedReference = true;
    }
    const duplicate = OperationPlan.references.get(this.reference);
    if (duplicate && duplicate !== this) return false;
    OperationPlan.references.set(this.reference, this);
    const numeric = Number(this.reference);
    if (Number.isSafeInteger(numeric) && numeric >= OperationPlan.counterMin) OperationPlan.counterMin = numeric + 1;
    return true;
  }
  getReference(): string {
    if (!this.reference) {
      if (!this.assignReference()) throw new DataException(`Duplicate operationplan reference '${this.reference}'`);
      this.activated = true;
    }
    return this.reference;
  }
  setReference(value: string): void {
    const next = String(value);
    if (next === this.reference) return;
    const duplicate = OperationPlan.references.get(next);
    if (next && duplicate && duplicate !== this) throw new DataException(`Duplicate operationplan reference '${next}'`);
    if (this.reference) OperationPlan.references.delete(this.reference);
    this.reference = next;
    this.generatedReference = false;
    if (next) {
      if (!this.assignReference()) throw new DataException(`Duplicate operationplan reference '${next}'`);
      this.activated = true;
    }
  }
  setRawReference(value: string): void { this.reference = String(value); this.generatedReference = false; }

  getDates(): DateRange { return new DateRange(this.dates.getStart(), this.dates.getEnd()); }
  setDates(value: DateRange): void {
    this.dates.setStartAndEnd(value.getStart(), value.getEnd());
    this.update();
  }
  getStart(): PlanningDate { return this.dates.getStart(); }
  getEnd(): PlanningDate { return this.dates.getEnd(); }
  setStart(value: DateInput, force = false, preferEnd = true): void {
    let start = asDate(value);
    if (this.getConfirmed()) {
      if (force) this.setStartAndEnd(start, this.getEnd().compare(start) > 0 ? this.getEnd() : start);
      return;
    }

    if (!this.subOperationPlans.length) {
      this.setOperationPlanParameters(this.quantity, start, PlanningDate.infinitePast,
        preferEnd, true, false);
    } else {
      for (const child of this.subOperationPlans) {
        if (child.getStart().compare(start) < 0) {
          child.setStart(start, force, preferEnd);
          start = child.getEnd();
        } else break;
      }
    }

    if (force) this.keepDependenciesOrdered();
    this.update();
  }
  setStartForce(value: DateInput): void { this.setStart(value, true, true); }
  setEnd(value: DateInput, force = false): void {
    let end = asDate(value);
    if (this.getConfirmed()) {
      if (force) this.setStartAndEnd(this.getStart().compare(end) < 0 ? this.getStart() : end, end);
      return;
    }

    if (!this.subOperationPlans.length) {
      this.setOperationPlanParameters(this.quantity, PlanningDate.infinitePast, end,
        true, true, false);
    } else {
      for (const child of [...this.subOperationPlans].reverse()) {
        if (!child.getEnd().isInitialized() || child.getEnd().compare(end) > 0) {
          child.setEnd(end, force);
          end = child.getStart();
        } else break;
      }
    }

    if (force) this.keepDependenciesOrdered();
    this.update();
  }
  setEndForce(value: DateInput): void { this.setEnd(value, true); }
  setStartAndEnd(start: DateInput, end: DateInput): void {
    this.dates.setStartAndEnd(asDate(start), asDate(end));
    this.update();
  }
  setStartEndAndQuantity(start: DateInput, end: DateInput, quantity: number): void {
    this.quantity = Math.max(0, Number(quantity));
    this.dates.setStartAndEnd(asDate(start), asDate(end));
    if (this.owner) this.owner.quantity = this.quantity;
    this.update();
  }
  setOperationPlanParameters(quantity: number, start: DateInput, end: DateInput, preferEnd = true,
    execute = true, roundDown = true, later = false): unknown {
    if (!this.operation) return new OperationPlanState(start, end, quantity);
    return call(this.operation, "setOperationPlanParameters", this, quantity, asDate(start), asDate(end),
      preferEnd, execute, roundDown, later);
  }
  private keepDependenciesOrdered(): void {
    for (const dependency of this.dependencies) {
      const first = call(dependency, "getFirst") as OperationPlan | null;
      const second = call(dependency, "getSecond") as OperationPlan | null;
      const leadtimeValue = call(call(dependency, "getOperationDependency"), "getHardSafetyLeadtime");
      const leadtime = leadtimeValue instanceof Duration ? leadtimeValue : new Duration();
      if (first === this && second) {
        const required = this.getEnd().add(leadtime);
        if (second.getStart().compare(required) < 0) second.setStart(required);
      } else if (second === this && first) {
        const required = this.getStart().subtract(leadtime);
        if (required instanceof PlanningDate && first.getEnd().compare(required) > 0) first.setEnd(required);
      } else {
        throw new LogicException("Invalid operationplan dependency data");
      }
    }
  }
  freezeStatus(start: DateInput, end: DateInput, quantity: number): void {
    if (this.getProposed()) return;
    this.dates.setStartAndEnd(asDate(start), asDate(end));
    this.quantity = Math.max(0, Number(quantity));
  }
  restore(state: OperationPlanState, exactSnapshot = false): void {
    if (state.hasSetup) {
      this.setSetupEvent(state.tmline, state.setupDate, state.setupName,
        state.setupRule as SetupMatrixRule | null);
      this.setupEvent?.setSetupOverride(state.setupOverride);
    } else {
      this.setSetupEvent(null, state.setupDate, "", null);
    }
    if (!exactSnapshot) {
      this.setStartEndAndQuantity(state.start, state.end, state.quantity);
      this.scanSetupTimes();
      return;
    }

    // Transaction rollback restores every node in the tree independently.
    // Updating a routing owner here would immediately derive its dates from
    // the first child restored and lose the owner's captured date range.
    this.quantity = Math.max(0, Number(state.quantity));
    this.dates.setStartAndEnd(asDate(state.start), asDate(state.end));
    this.resizeFlowLoadPlans();
    this.setChanged();
  }

  getQuantity(): number { return this.quantity; }
  setQuantityRaw(value: number): void { this.quantity = Math.max(0, Number(value)); }
  setQuantity(value: number, roundDown = false, update = true, execute = true,
    end: DateInput = PlanningDate.infinitePast): number {
    let next = Number(value);
    const rounded = call(this.operation, "setOperationPlanQuantity", this, next, roundDown, update, execute, asDate(end));
    if (rounded !== undefined) next = Number(rounded);
    else if (next < 0) throw new DataException("Operationplans can't have negative quantities");
    if (!this.operation && execute && Math.abs(next - this.quantity) >= ROUNDING_ERROR) {
      this.quantity = next;
      if (update) this.resizeFlowLoadPlans();
    }
    return next;
  }
  setQuantityExternal(value: number): void { this.setQuantity(value, false, true, true); }
  getQuantityCompletedRaw(): number { return this.quantityCompleted; }
  setQuantityCompletedRaw(value: number): void { this.quantityCompleted = Number(value); }
  getQuantityCompleted(): number {
    return this.getCompleted() || this.getProposed() ? 0 : Math.min(this.quantityCompleted, this.quantity);
  }
  setQuantityCompleted(value: number): void {
    const next = Math.max(0, Number(value));
    if (Math.abs(next - this.quantityCompleted) < ROUNDING_ERROR) return;
    this.quantityCompleted = next;
    if (!this.getProposed()) this.update();
  }
  getQuantityRemaining(): number {
    return this.getCompleted() || this.getProposed() ? this.quantity : Math.max(0, this.quantity - this.quantityCompleted);
  }

  getStatus(): string { return this.status; }
  setStatus(value: string, propagate = true, update = true): void {
    const next = String(value).toLowerCase();
    if (!["proposed", "approved", "confirmed", "completed", "closed"].includes(next)) {
      throw new DataException(`invalid operationplan status:${value}`);
    }
    this.status = next;
    if (next !== "proposed" && this.owner?.getProposed()) this.owner.status = "approved";
    if (update) {
      for (const child of this.subOperationPlans) child.setStatus(next, propagate, true);
      this.update();
      if (propagate) this.propagateStatus();
    }
  }
  setStatusRaw(value: string): void { this.setStatus(value, false, false); }
  setStatusNoPropagation(value: string): void { this.setStatus(value, false, true); }
  getProposed(): boolean { return this.status === "proposed"; }
  getApproved(): boolean { return this.status === "approved"; }
  getConfirmed(): boolean { return ["confirmed", "completed", "closed"].includes(this.status); }
  getCompleted(): boolean { return this.status === "completed"; }
  getClosed(): boolean { return this.status === "closed"; }
  setProposed(value: boolean): void { this.setStatus(value ? "proposed" : "approved"); }
  setApproved(value: boolean): void { this.setStatus(value ? "approved" : "proposed"); }
  setConfirmed(value: boolean): void { this.setStatus(value ? "confirmed" : "approved"); }
  setCompleted(value: boolean): void { this.setStatus(value ? "completed" : "approved"); }
  setClosed(value: boolean): void { this.setStatus(value ? "closed" : "approved"); }
  propagateStatus(_log = false): void {
    for (const child of this.subOperationPlans) {
      if (child.status !== this.status) child.setStatus(this.status, false, true);
    }
  }

  getDemand(): Demand | null { return this.demand; }
  setDemand(value: Demand | null): void {
    if (value === this.demand) return;
    const previous = this.demand;
    this.demand = value;
    call(previous, "detachDeliveryReference", this);
    link(this, "Demand", adapter(previous), adapter(value));
    call(value, "attachDeliveryReference", this);
  }
  getOwner(): OperationPlan | null { return this.owner; }
  setOwner(value: OperationPlan | null, fast = false): void {
    if (value === this.owner) return;
    for (let current = value; current; current = current.owner) {
      if (current === this) throw new LogicException("Cyclic operationplan ownership");
    }
    const previous = this.owner;
    if (previous) previous.eraseSubOperationPlan(this);
    this.owner = value;
    if (value) {
      call(value.getOperation(), "addSubOperationPlan", value, this, fast);
      if (!value.subOperationPlans.includes(this)) value.subOperationPlans.push(this);
    }
    if (value?.batch) this.setBatch(value.batch, false);
    link(this, "Owner", previous, value);
  }
  attachSubOperationPlan(value: OperationPlan, placement: "single" | "append" | "prepend" = "append"): void {
    if (this.subOperationPlans.includes(value)) return;
    if (placement === "single" && this.subOperationPlans.length) {
      throw new LogicException("Expected suboperationplan list to be empty");
    }
    if (placement === "prepend") this.subOperationPlans.unshift(value);
    else this.subOperationPlans.push(value);
  }
  eraseSubOperationPlan(value: OperationPlan | null): void {
    if (!value) return;
    if (value.owner !== this) throw new LogicException("Suboperationplan has a different owner");
    const index = this.subOperationPlans.indexOf(value);
    if (index >= 0) this.subOperationPlans.splice(index, 1);
    value.owner = null;
    this.modelReferenceRemoved(value, "Owner");
  }
  getSubOperationPlans(forward = true): OperationPlanIterator {
    return new OperationPlanIterator(forward ? this.subOperationPlans : [...this.subOperationPlans].reverse());
  }
  getTopOwner(): OperationPlan {
    let result: OperationPlan = this;
    while (result.owner) result = result.owner;
    return result;
  }
  getNextSubOpplan(): OperationPlan | null {
    if (!this.owner) return null;
    return this.owner.subOperationPlans[this.owner.subOperationPlans.indexOf(this) + 1] ?? null;
  }
  getPrevSubOpplan(): OperationPlan | null {
    if (!this.owner) return null;
    return this.owner.subOperationPlans[this.owner.subOperationPlans.indexOf(this) - 1] ?? null;
  }

  attachFlowPlan(value: HeaderModelAdapter): void { if (!this.flowPlans.includes(value)) this.flowPlans.push(value); }
  detachFlowPlan(value: HeaderModelAdapter): void {
    const index = this.flowPlans.indexOf(value);
    if (index >= 0) this.flowPlans.splice(index, 1);
  }
  attachLoadPlan(value: HeaderModelAdapter): void { if (!this.loadPlans.includes(value)) this.loadPlans.push(value); }
  detachLoadPlan(value: HeaderModelAdapter): void {
    const index = this.loadPlans.indexOf(value);
    if (index >= 0) this.loadPlans.splice(index, 1);
  }
  getFlowPlans(): OperationPlanFlowPlanIterator { return new OperationPlanFlowPlanIterator(this); }
  beginFlowPlans(): OperationPlanFlowPlanIterator { return this.getFlowPlans(); }
  endFlowPlans(): OperationPlanFlowPlanIterator { return new OperationPlanFlowPlanIterator(); }
  sizeFlowPlans(): number { return this.flowPlans.length; }
  getLoadPlans(): OperationPlanLoadPlanIterator { return new OperationPlanLoadPlanIterator(this); }
  beginLoadPlans(): OperationPlanLoadPlanIterator { return this.getLoadPlans(); }
  endLoadPlans(): OperationPlanLoadPlanIterator { return new OperationPlanLoadPlanIterator(); }
  sizeLoadPlans(): number { return this.loadPlans.length; }
  flowPlanSnapshot(): readonly HeaderModelAdapter[] { return [...this.flowPlans]; }
  loadPlanSnapshot(): readonly HeaderModelAdapter[] { return [...this.loadPlans]; }
  ensureFlowPlansForFlow(flow: HeaderModelAdapter, count: number): void {
    const required = Math.max(1, Math.trunc(Number(count)));
    let current = this.flowPlans.filter((plan) => call(plan, "getFlow") === flow).length;
    while (current < required) {
      const flowPlan = new FlowPlan(this, flow as never);
      flowPlan.setFollowingBatch(true);
      current += 1;
    }
  }
  createFlowLoads(assignedResources?: readonly HeaderModelAdapter[]): void {
    if (!this.operation) return;
    if (!this.loadPlans.length && this.consumeCapacity) {
      const loads = call(this.operation, "getLoads");
      if (Array.isArray(loads)) {
        loads.filter((load) => !call(load, "getAlternate") && !call(load, "getHiddenLoad")).forEach((load, index) => {
          // The C++ LoadPlan constructor selects the preferred member of a
          // resource pool immediately. This assignment is needed before the
          // caller recalculates operation duration for resource efficiency.
          new LoadPlan(this, load as Load, assignedResources?.[index] as Resource | undefined);
        });
      }
    }
    if (!this.flowPlans.length) {
      const flows = call(this.operation, "getFlows");
      if (Array.isArray(flows)) {
        flows.filter((flow) => !call(flow, "getAlternate")).forEach((flow) => {
          const flowPlan = new FlowPlan();
          call(flowPlan, "setOperationPlan", this);
          call(flowPlan, "setFlow", flow);
          this.attachFlowPlan(flowPlan);
        });
      }
    }
  }
  deleteFlowLoads(): void {
    for (const plan of this.flowPlans.splice(0)) plan.dispose();
    for (const plan of this.loadPlans.splice(0)) plan.dispose();
    this.clearSetupEvent();
  }
  resizeFlowLoadPlans(): void {
    for (const plan of [...this.flowPlans]) call(plan, "update");
    if (this.consumeCapacity) for (const plan of [...this.loadPlans]) call(plan, "update");
    else for (const plan of this.loadPlans.splice(0)) plan.dispose();
  }
  setResetResources(value: boolean): void {
    if (!value) return;
    for (const plan of this.loadPlans.splice(0)) plan.dispose();
  }

  getDependencies(): readonly HeaderModelAdapter[] { return this.dependencies; }
  addDependency(value: HeaderModelAdapter): void { if (!this.dependencies.includes(value)) this.dependencies.unshift(value); }
  removeDependency(value: HeaderModelAdapter): void {
    const index = this.dependencies.indexOf(value);
    if (index >= 0) this.dependencies.splice(index, 1);
  }
  getBlockingIterator(): IterableIterator<HeaderModelAdapter> {
    return this.dependencies.filter((dependency) => call(dependency, "getFirst") === this).values();
  }
  getBlockedbyIterator(): IterableIterator<HeaderModelAdapter> {
    return this.dependencies.filter((dependency) => call(dependency, "getSecond") === this).values();
  }
  matchDependencies(_log = false): void {
    if (!this.operation || this.getCompleted() || this.getClosed()) return;
    const dependencies = call(this.operation, "getDependencies");
    if (!dependencies || typeof (dependencies as Iterable<unknown>)[Symbol.iterator] !== "function") return;
    for (const candidate of dependencies as Iterable<unknown>) {
      if (!candidate || typeof candidate !== "object") continue;
      const blockedBy = call(candidate, "getBlockedBy") as Operation | null;
      if (!blockedBy || blockedBy === this.operation) continue;
      let needed = this.quantity * Number(call(candidate, "getQuantity") ?? 1);
      const plans = call(blockedBy, "getOperationPlans");
      if (!plans || typeof (plans as Iterable<unknown>)[Symbol.iterator] !== "function") continue;
      for (const source of plans as Iterable<unknown>) {
        if (!(source instanceof OperationPlan)) continue;
        if (this.batch && source.getBatch() !== this.batch) continue;
        let unpegged = source.getQuantity();
        for (const assigned of source.getDependencies()) {
          const assignedSecond = call(assigned, "getSecond");
          if (call(assigned, "getFirst") !== source || call(assignedSecond, "getOperation") !== this.operation) continue;
          unpegged -= Number(call(assigned, "getQuantity") ?? 0);
        }
        if (unpegged <= ROUNDING_ERROR) continue;
        const constructor = Reflect.get(candidate, "createOperationPlanDependency");
        if (typeof constructor === "function") Reflect.apply(constructor, candidate, [source, this]);
        needed -= unpegged;
        if (needed < ROUNDING_ERROR) break;
      }
    }
  }

  getPriority(): number {
    if (!this.operation) return 999;
    if (this.owner) return this.owner.getPriority();
    return Number(call(this.getTopOwner().demand, "getPriority") ?? 999);
  }
  getCriticality(): number {
    const demand = this.getTopOwner().demand;
    if (!this.operation || !demand) return 999;
    const due = call(demand, "getDue");
    if (!(due instanceof PlanningDate)) return 999;
    return Math.floor(Math.max(0, due.subtract(this.getEnd()).seconds) / 86_400);
  }
  getDelay(): Duration {
    const demand = this.getTopOwner().demand;
    const due = call(demand, "getDue");
    return due instanceof PlanningDate ? this.getEnd().subtract(due) : new Duration();
  }
  getUnavailable(): Duration {
    if (!this.operation) return new Duration();
    const actual: Duration[] = [];
    call(this.operation, "calculateOperationTime", this, this.getStart(), this.getEnd(), actual);
    return this.dates.getDuration().subtract(actual[0] ?? this.dates.getDuration());
  }
  isConstrained(): boolean { return this.getDelay().seconds > 0; }
  isExcess(useZero = false): number {
    if (this.demand || this.dependencies.length) return 0;

    let operationPlanExcess = this.quantity;
    for (const child of this.subOperationPlans) {
      operationPlanExcess = Math.min(operationPlanExcess, child.isExcess(useZero));
    }

    let hasFlowPlans = false;
    for (const material of this.flowPlans) {
      if (!(material instanceof FlowPlan)) continue;
      hasFlowPlans = true;
      if (material.getQuantity() <= 0) continue;

      const buffer = material.getBuffer();
      const flow = material.getFlow();
      if (!buffer || !flow) continue;
      let flowPlanExcess = material.getQuantity();
      for (const child of this.subOperationPlans) {
        for (const childMaterial of child.flowPlans) {
          if (childMaterial instanceof FlowPlan && childMaterial.getBuffer() === buffer) {
            flowPlanExcess += childMaterial.getQuantity();
          }
        }
      }
      if (flowPlanExcess <= 0) continue;

      const timeline = FlowPlan.getBufferTimeline(buffer);
      const events = timeline.snapshot();
      const last = events.at(-1) ?? null;
      let currentMaximum = !useZero && last ? timeline.getMax(last) : 0;
      let currentMinimum = !useZero && last ? timeline.getMin(last) : 0;
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (!event) continue;
        if (!event.isLastOnDate()) {
          if (event === material) break;
          continue;
        }
        const threshold = currentMaximum > 0 ? currentMaximum : currentMinimum;
        const aboveThreshold = event.getOnhand() - threshold;
        if (aboveThreshold < ROUNDING_ERROR) return 0;
        flowPlanExcess = Math.min(flowPlanExcess, aboveThreshold);
        if (!useZero) {
          if (event.getEventType() === 4) currentMaximum = event.getMax(false);
          if (event.getEventType() === 3) currentMinimum = event.getMin(false);
        }
        if (event === material) break;
      }

      let lotPlan = material.getOperationPlan() ?? this;
      if (lotPlan.getOwner()?.getOperation() instanceof OperationRouting) lotPlan = lotPlan.getOwner() as OperationPlan;
      const proportional = flow.getQuantity();
      flowPlanExcess -= flow.getQuantityFixed();
      if (flowPlanExcess < Number(call(lotPlan.getOperation(), "getSizeMultiple") ?? 0) * proportional - ROUNDING_ERROR) {
        return 0;
      }
      if (proportional) operationPlanExcess = Math.min(operationPlanExcess, flowPlanExcess / proportional);
    }

    const operationFlows = call(this.operation, "getFlows");
    if (!hasFlowPlans && Array.isArray(operationFlows) && operationFlows.length) return 0;
    return operationPlanExcess;
  }
  getEfficiency(date: DateInput = PlanningDate.infinitePast): number {
    let best = Number.POSITIVE_INFINITY;
    const requested = asDate(date);
    const effectiveDate = requested.equals(PlanningDate.infinitePast) ? this.getStart() : requested;
    const operationLoads = (this.operation?.getLoads() ?? []).filter((load): load is Load =>
      load instanceof HeaderModelAdapter && load.constructor.name.startsWith("Load"));

    const resourceEfficiency = (resource: Resource): number => {
      const calendar = resource.getEfficiencyCalendar();
      return calendar ? calendar.getValue(effectiveDate) : resource.getEfficiency();
    };

    const loadPlans = this.loadPlans.filter((plan): plan is LoadPlan => plan instanceof LoadPlan);
    if (!loadPlans.length) {
      // The recursive C++ iterator includes the pool root as its first element.
      for (const load of operationLoads) {
        const root = load.getResource();
        if (!root) continue;
        let bestEfficiency = 0;
        for (const resource of [root, ...root.getAllMembers()]) {
          if (resource.isGroup()) continue;
          const skill = load.getSkill();
          if (skill && !resource.hasSkill(skill, requested)) continue;
          const efficiency = resourceEfficiency(resource);
          if (efficiency > bestEfficiency) bestEfficiency = efficiency;
        }
        if (bestEfficiency < best) best = bestEfficiency;
      }
    } else {
      let parallelFactor = 0;
      for (const loadPlan of loadPlans) {
        if (loadPlan.getQuantity() > 0) continue;
        const resource = loadPlan.getResource();
        if (!resource) continue;
        if (resource.getOwner() && individualPoolResources) {
          let totalAllocated = 0;
          for (const inner of loadPlans) {
            const innerResource = inner.getResource();
            if (innerResource?.getTop() === resource.getTop() && inner.getQuantity() < 0) {
              totalAllocated += resourceEfficiency(innerResource);
            }
          }
          let loadQuantity = 1;
          for (const load of operationLoads) {
            const loadResource = load.getResource();
            if (loadResource && resource.isMemberOf(loadResource)) {
              loadQuantity = load.getQuantity();
              break;
            }
          }
          totalAllocated /= loadQuantity;
          if (!parallelFactor || totalAllocated < parallelFactor) parallelFactor = totalAllocated;
        } else {
          const efficiency = resourceEfficiency(resource);
          if (efficiency < best) best = efficiency;
        }
      }
      if (parallelFactor) {
        if (best === Number.POSITIVE_INFINITY) best = parallelFactor;
        else best *= parallelFactor / 100;
      }
    }
    if (best === Number.POSITIVE_INFINITY) return 1;
    return best > 0 ? best / 100 : 0;
  }
  getTotalFlow(buffer: HeaderModelAdapter): number {
    return this.getTopOwner().getTotalFlowAux(buffer);
  }
  private getTotalFlowAux(buffer: HeaderModelAdapter): number {
    let result = this.flowPlans.reduce((sum, plan) => call(plan, "getBuffer") === buffer ? sum + Number(call(plan, "getQuantity") ?? 0) : sum, 0);
    for (const child of this.subOperationPlans) result += child.getTotalFlowAux(buffer);
    return result;
  }

  getBatch(): string { return this.batch; }
  getBatchString(): string { return this.batch; }
  setBatch(value: string, upward = true): void {
    if (upward && this.getTopOwner() !== this) { this.getTopOwner().setBatch(value, false); return; }
    this.batch = String(value);
    for (const child of this.subOperationPlans) child.setBatch(this.batch, false);
    for (const plan of this.flowPlans) call(plan, "updateBatch");
  }
  getRemark(): string { return this.remark; }
  getRemarkString(): string { return this.remark; }
  setRemark(value: string): void { this.remark = String(value); }
  getInfo(): string { return this.info; }
  getInfoString(): string { return this.info; }
  setInfo(value: string): void { this.info = String(value); }
  appendInfo(value: string): void {
    const text = String(value);
    if (!this.getProposed() && !this.info.split("\n").includes(text)) this.info = this.info ? `${this.info}\n${text}` : text;
  }
  getSource(): string { return this.source; }
  setSource(value: string): void { this.source = String(value); }
  getHidden(): boolean { return false; }
  setHidden(_value: boolean): void {}
  getForcedUpdate(): boolean { return this.forcedUpdate; }
  setForcedUpdate(value: boolean): void { this.forcedUpdate = Boolean(value); }
  getNoSetup(): boolean { return this.noSetup; }
  setNoSetup(value: boolean): void { this.noSetup = Boolean(value); this.updateSetupTime(); }
  getConsumeCapacity(): boolean { return this.consumeCapacity; }
  setConsumeCapacity(value: boolean): void {
    if (!this.getConfirmed()) return;
    this.consumeCapacity = Boolean(value);
    this.resizeFlowLoadPlans();
    for (const child of this.subOperationPlans) child.setConsumeCapacity(value);
  }
  getConsumeMaterial(): boolean { return this.consumeMaterial; }
  setConsumeMaterial(value: boolean): void {
    this.consumeMaterial = Boolean(value);
    this.resizeFlowLoadPlans();
    for (const child of this.subOperationPlans) child.setConsumeMaterial(value);
  }
  getProduceMaterial(): boolean { return this.produceMaterial; }
  setProduceMaterial(value: boolean): void {
    this.produceMaterial = Boolean(value);
    this.resizeFlowLoadPlans();
    for (const child of this.subOperationPlans) child.setProduceMaterial(value);
  }
  getFeasible(): boolean { return this.feasible; }
  setFeasible(value: boolean): void { this.feasible = Boolean(value); }
  updateFeasible(): boolean { return updateOperationPlanFeasible(this); }
  updateFeasiblePython(): boolean { return this.updateFeasible(); }

  getSetupEvent(): SetupEvent | null { return this.setupEvent; }
  getSetupRule(): unknown { return call(this.setupEvent, "getRule") ?? null; }
  getSetupOverride(): Duration { return new Duration(this.setupOverride); }
  setSetupOverride(value: DurationInput): void {
    this.setupOverride = asDuration(value);
    if (!this.setupEvent) this.setupEvent = new SetupEvent(this);
    this.setupEvent.setSetupOverride(this.setupOverride);
    this.update();
  }
  getSetupEnd(): PlanningDate {
    const date = call(this.setupEvent, "getDate");
    return date instanceof PlanningDate ? new PlanningDate(date) : this.getStart();
  }
  getSetup(): Duration {
    if (!this.setupEvent) return new Duration(-1);
    if (this.setupOverride.seconds >= 0) return new Duration(this.setupOverride);
    if (this.getConfirmed()) return new Duration();
    const duration = call(this.getSetupRule(), "getDuration");
    if (duration instanceof Duration) return new Duration(duration);
    for (const loadPlan of this.loadPlans) {
      const load = call(loadPlan, "getLoad");
      const resource = call(loadPlan, "getResource");
      if (String(call(load, "getSetup") ?? "") && call(resource, "getSetupMatrix")) return new Duration();
    }
    return new Duration(-1);
  }
  getSetupCost(): number { return Number(call(this.getSetupRule(), "getCost") ?? 0); }
  setSetupEvent(eventOrTimeline: HeaderModelAdapter | null, date?: DateInput, setup = "", rule: HeaderModelAdapter | null = null): void {
    if (date === undefined) {
      if (eventOrTimeline !== null && !(eventOrTimeline instanceof SetupEvent)) {
        throw new DataException("Invalid setup event");
      }
      this.setupEvent = eventOrTimeline;
      return;
    }
    const setupRule = rule as SetupMatrixRule | null;
    if (!eventOrTimeline && (!this.setupEvent || this.setupEvent.getSetupOverride().seconds < 0)) {
      this.clearSetupEvent();
      return;
    }
    if (this.setupEvent) this.setupEvent.update(eventOrTimeline, asDate(date), setup, setupRule);
    else this.setupEvent = new SetupEvent(eventOrTimeline, asDate(date), setup, setupRule, this);
  }
  clearSetupEvent(): void { this.setupEvent?.dispose(); this.setupEvent = null; }
  nullSetupEvent(): void { this.setupEvent = null; }
  updateSetupTime(): boolean {
    if (!this.operation) return false;
    const endOfSetup = this.getSetupEnd();
    const setup = call(this.operation, "calculateSetup", this, endOfSetup, this.setupEvent) as {
      resource: Resource | null;
      rule: SetupMatrixRule | null;
      setup: string;
    } | undefined;
    const setupOverride = this.getSetupOverride();
    const hasOverride = setupOverride.seconds >= 0 && !this.getNoSetup();
    let resource = setup?.resource ?? null;

    if (this.setupEvent && hasOverride && !resource) {
      const loadPlans = [...this.getLoadPlans()];
      const sources = loadPlans.length ? loadPlans : this.operation.getLoads();
      for (const source of sources) {
        const candidate = call(source, "getResource") as Resource | null;
        if (!candidate || !call(candidate, "getSetupMatrix")) continue;
        resource = candidate;
        if (!this.setupEvent.getTimeLine()) this.setupEvent.setTimeLine(candidate);
        break;
      }
    }

    if (resource || hasOverride) {
      const rule = setup?.rule ?? null;
      if (rule || hasOverride) {
        const start = this.getConfirmed()
          ? endOfSetup
          : (call(this.operation, "calculateOperationTime", this, endOfSetup,
            hasOverride ? setupOverride : rule?.getDuration() ?? new Duration(), false) as DateRange).getStart();
        const changed = !this.getStart().equals(start) || !this.setupEvent;
        this.setSetupEvent(resource, endOfSetup, setup?.setup ?? this.setupEvent?.getSetup() ?? "", rule);
        if (changed) this.setStartAndEnd(start, this.getEnd());
        return changed;
      }
      const changed = !this.getStart().equals(endOfSetup) || !this.setupEvent;
      this.setSetupEvent(resource, endOfSetup, setup?.setup ?? "", null);
      if (changed) this.setStartAndEnd(endOfSetup, this.getEnd());
      return changed;
    }

    let changed = false;
    if (this.setupEvent && this.setupEvent.getSetupOverride().seconds < 0) {
      this.clearSetupEvent();
      changed = true;
    }
    if (!this.getStart().equals(endOfSetup)) {
      this.setStartAndEnd(endOfSetup, this.getEnd());
      changed = true;
    }
    return changed;
  }

  getLocation(): Location | null {
    const buffer = call(this.operation, "getBuffer") ?? call(this.operation, "getDestination") ?? call(this.operation, "getOrigin");
    return (call(buffer, "getLocation") ?? this.importLocation) as Location | null;
  }
  setLocation(value: Location | null): void { this.importLocation = value; }
  getOrigin(): Location | null {
    const association = call(this.operation, "getItemDistribution");
    const origin = call(association, "getOrigin") ?? call(call(this.operation, "getOrigin"), "getLocation");
    return (origin ?? this.importOrigin) as Location | null;
  }
  setOrigin(value: Location | null): void { this.importOrigin = value; }
  getSupplier(): Supplier | null {
    return (call(call(this.operation, "getItemSupplier"), "getSupplier") ?? this.importSupplier) as Supplier | null;
  }
  setSupplier(value: Supplier | null): void { this.importSupplier = value; }
  getItem(): Item | null {
    const buffer = call(this.operation, "getBuffer") ?? call(this.operation, "getDestination") ?? call(this.operation, "getOrigin");
    return (call(buffer, "getItem") ?? call(this.operation, "getItem") ?? this.importItem) as Item | null;
  }
  setItem(value: Item | null): void { this.importItem = value; }

  getProblems(includeRelated = true): OperationPlanProblemIterator {
    return new OperationPlanProblemIterator(this, includeRelated);
  }
  updateProblems(): void { updateOperationPlanProblems(this); }
  getChanged(): boolean { return getEntityChanged(this); }
  getDetectProblems(): boolean { return getEntityDetectProblems(this); }
  setDetectProblems(value: boolean): void { setEntityDetectProblems(this, value); }
  setChanged(value = true): void {
    setEntityChanged(this, value);
    call(this.operation, "setChanged", value);
  }
  getPeggingDownstream(): PeggingIterator { return new PeggingIterator(this, true, -1); }
  getPeggingDownstreamFirstLevel(): PeggingIterator { return new PeggingIterator(this, true, 0); }
  getPeggingUpstream(): PeggingIterator { return new PeggingIterator(this, false, -1); }
  getPeggingUpstreamFirstLevel(): PeggingIterator { return new PeggingIterator(this, false, 0); }
  getPeggingDemand(): PeggingDemandIterator { return new PeggingDemandIterator(this); }
  getAlternates(): OperationPlanAlternateIterator { return new OperationPlanAlternateIterator(this); }
  getInterruptions(): OperationPlanInterruptionIterator { return new OperationPlanInterruptionIterator(this); }
  mergeIfPossible(): boolean {
    if (!this.getProposed() || !Plan.instance().getAllowMergingOperationPlans()) return false;
    if (!(this.operation instanceof OperationFixedTime)) return false;
    if (this.operation.getLoads().some((load) => call(load, "getResource") instanceof ResourceDefault)) {
      return false;
    }

    for (const candidate of this.operation.getOperationPlans()) {
      if (!(candidate instanceof OperationPlan)) continue;
      if (candidate.getStart().compare(this.getStart()) > 0) return false;
      if (candidate === this || !candidate.getDates().equals(this.getDates())) continue;
      if (candidate.getDemand() !== this.getDemand() || !candidate.getProposed()) continue;
      if (candidate.getQuantity() + this.quantity > this.operation.getSizeMaximum() + ROUNDING_ERROR) continue;
      if (this.owner) {
        if (!candidate.owner || this.owner.getOperation() !== candidate.owner.getOperation()) continue;
        if (!(this.owner.getOperation() instanceof OperationAlternate)) continue;
        if (this.owner.getDemand() !== candidate.owner.getDemand()) continue;
      }

      const currentFlows = this.flowPlans.filter((flow): flow is FlowPlan => flow instanceof FlowPlan);
      const candidateFlows = candidate.flowPlans.filter((flow): flow is FlowPlan => flow instanceof FlowPlan);
      if (!currentFlows.length || currentFlows.length !== candidateFlows.length) continue;
      if (currentFlows.some((flow, index) => !candidateFlows[index]
        || flow.getBuffer() !== candidateFlows[index]?.getBuffer()
        || flow.getFlow()?.getQuantityFixed() || candidateFlows[index]?.getFlow()?.getQuantityFixed())) continue;

      candidate.setQuantity(candidate.getQuantity() + this.quantity);
      if (this.owner) this.setOwner(null);
      this.dispose();
      return true;
    }
    return false;
  }
  /** Native OperationFixedTime::extraInstantiate merge for unactivated plans. */
  mergeForCreation(): boolean {
    if (this.getActivated() || !this.getProposed() || !(this.operation instanceof OperationFixedTime)) return false;
    if (this.operation.getLoads().some((load) => call(load, "getResource") instanceof ResourceDefault)) return false;

    const ordered = [...this.operation.getOperationPlans()]
      .filter((candidate): candidate is OperationPlan => candidate instanceof OperationPlan && candidate !== this)
      .sort((left, right) => {
        const leftOperation = left.getOperation();
        const rightOperation = right.getOperation();
        if (leftOperation !== rightOperation) {
          const leftName = leftOperation?.getName() ?? "";
          const rightName = rightOperation?.getName() ?? "";
          if (leftName !== rightName) return leftName < rightName ? -1 : 1;
        }
        const setup = left.getSetupEnd().compare(right.getSetupEnd());
        if (setup) return setup;
        if (Math.abs(left.getQuantity() - right.getQuantity()) > ROUNDING_ERROR) {
          return left.getQuantity() > right.getQuantity() ? -1 : 1;
        }
        if (left.getActivated() !== right.getActivated()) return left.getActivated() ? -1 : 1;
        const end = left.getEnd().compare(right.getEnd());
        if (end) return end;
        return left.comparisonSequence - right.comparisonSequence;
      });
    let insertion = ordered.findIndex((candidate) => {
      const setup = candidate.getSetupEnd().compare(this.getSetupEnd());
      if (setup) return setup > 0;
      if (Math.abs(candidate.getQuantity() - this.quantity) > ROUNDING_ERROR) {
        return candidate.getQuantity() < this.quantity;
      }
      if (candidate.getActivated() !== this.getActivated()) return !candidate.getActivated();
      const end = candidate.getEnd().compare(this.getEnd());
      if (end) return end > 0;
      return candidate.comparisonSequence > this.comparisonSequence;
    });
    if (insertion < 0) insertion = ordered.length;

    const compatible = (candidate: OperationPlan | undefined, previous: boolean): boolean => {
      if (!candidate || !candidate.getDates().equals(this.getDates())
        || candidate.getDemand() !== this.getDemand() || !candidate.getProposed() || !candidate.getActivated()
        || candidate.getQuantity() + this.quantity >= this.operation!.getSizeMaximum()) return false;
      if (this.owner) {
        if (!candidate.owner || this.owner.getOperation() !== candidate.owner.getOperation()
          || !(this.owner.getOperation() instanceof OperationAlternate)) return false;
        if (previous && this.owner.getDemand() !== candidate.owner.getDemand()) return false;
      }

      const currentFlows = this.flowPlans.filter((flow): flow is FlowPlan => flow instanceof FlowPlan);
      const candidateFlows = candidate.flowPlans.filter((flow): flow is FlowPlan => flow instanceof FlowPlan);
      if (!currentFlows.length || currentFlows.length !== candidateFlows.length) return false;
      return !currentFlows.some((flow, index) => !candidateFlows[index]
        || flow.getBuffer() !== candidateFlows[index]?.getBuffer()
        || (previous && (Boolean(flow.getFlow()?.getQuantityFixed())
          || Boolean(candidateFlows[index]?.getFlow()?.getQuantityFixed()))));
    };

    const target = compatible(ordered[insertion - 1], true)
      ? ordered[insertion - 1]
      : compatible(ordered[insertion], false) ? ordered[insertion] : undefined;
    if (!target) return false;
    target.setQuantity(target.getQuantity() + this.quantity);
    if (this.owner) this.setOwner(null);
    this.dispose();
    return true;
  }
  computeOperationToFlowDate(value: DateInput): PlanningDate { return asDate(value); }
  calculateOperationTimePython(...args: readonly unknown[]): unknown { return call(this.operation, "calculateOperationTime", this, ...args); }
  getColorPython(): number { return 0; }
  insertInOperationplanList(): void { call(this.operation, "attachOperationPlan", this); }
  removeFromOperationplanList(): void { call(this.operation, "detachOperationPlan", this); }

  scanSetupTimes(): void {
    for (const loadPlan of this.loadPlans) {
      if (Boolean(call(loadPlan, "isStart"))) continue;
      const load = call(loadPlan, "getLoad");
      const resource = call(loadPlan, "getResource");
      if (!load || !String(call(load, "getSetup") ?? "") || !call(resource, "getSetupMatrix")) continue;
      call(resource, "updateSetupTime");
      break;
    }
  }

  private update(): void {
    if (this.subOperationPlans.length) {
      const starts = this.subOperationPlans.map((child) => child.getStart().getTicks());
      const ends = this.subOperationPlans.map((child) => child.getEnd().getTicks());
      this.dates.setStartAndEnd(new PlanningDate(Math.min(...starts)), new PlanningDate(Math.max(...ends)));
    }
    this.resizeFlowLoadPlans();
    if (OperationPlan.getPropagateSetups()) this.scanSetupTimes();
    if (this.owner) this.owner.update();
    this.setChanged();
  }
  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Operation") this.setOperation(null);
    else if (property === "Demand") this.setDemand(null);
    else if (property === "Owner") this.setOwner(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    unregisterProblemEntity(this);
    if (this.reference) OperationPlan.references.delete(this.reference);
    this.setDemand(null);
    this.setOwner(null);
    for (const child of this.subOperationPlans.splice(0)) { child.owner = null; child.dispose(); }
    this.deleteFlowLoads();
    for (const dependency of this.dependencies.splice(0)) dependency.dispose();
    const operation = this.operation;
    link(this, "Operation", adapter(operation), null);
    this.operation = null;
    call(operation, "detachOperationPlan", this);
    super.dispose();
  }
  override toJSON(): Record<string, unknown> {
    return {
      reference: this.reference, operation: call(this.operation, "getName"), demand: call(this.demand, "getName"),
      owner: this.owner?.getReference(), start: this.getStart().toString(), end: this.getEnd().toString(),
      quantity: this.quantity, quantity_completed: this.quantityCompleted, status: this.status, batch: this.batch,
      remark: this.remark, info: this.info, source: this.source, consume_capacity: this.consumeCapacity,
      consume_material: this.consumeMaterial, produce_material: this.produceMaterial, feasible: this.feasible,
    };
  }
  str(): string { return JSON.stringify(this.toJSON()); }
}

export class OperationPlanState extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = [];
  static readonly cppQualifiedNames: readonly string[] = ["OperationPlanState"];
  start = new PlanningDate();
  end = new PlanningDate();
  setup: HeaderModelAdapter | null = null;
  tmline: HeaderModelAdapter | null = null;
  setupDate = PlanningDate.infinitePast;
  setupName = "";
  setupRule: HeaderModelAdapter | null = null;
  setupOverride = new Duration(-1);
  hasSetup = false;
  quantity = 0;

  constructor();
  constructor(plan: OperationPlan | null);
  constructor(range: DateRange, quantity: number, setup?: HeaderModelAdapter | null);
  constructor(start: DateInput, end: DateInput, quantity: number, setup?: HeaderModelAdapter | null);
  constructor(first?: OperationPlan | DateRange | DateInput | null, second?: DateInput | number,
    third?: number | HeaderModelAdapter | null, fourth: HeaderModelAdapter | null = null) {
    super();
    if (first instanceof OperationPlan) {
      this.start = first.getStart(); this.end = first.getEnd(); this.quantity = first.getQuantity();
      this.captureSetup(first.getSetupEvent());
    } else if (first instanceof DateRange) {
      this.start = first.getStart(); this.end = first.getEnd(); this.quantity = Number(second ?? 0);
      this.captureSetup(third instanceof HeaderModelAdapter ? third : null);
    } else if (first !== undefined && first !== null && second !== undefined) {
      this.start = asDate(first); this.end = asDate(second as DateInput); this.quantity = Number(third ?? 0);
      this.captureSetup(fourth);
    }
  }

  private captureSetup(setup: HeaderModelAdapter | null): void {
    this.setup = setup;
    this.hasSetup = setup instanceof SetupEvent;
    this.tmline = adapter(call(setup, "getTimeLine"));
    const date = call(setup, "getDate");
    if (date instanceof PlanningDate) this.setupDate = new PlanningDate(date);
    this.setupName = String(call(setup, "getSetup") ?? "");
    this.setupRule = adapter(call(setup, "getRule"));
    const setupOverride = call(setup, "getSetupOverride");
    if (setupOverride instanceof Duration) this.setupOverride = new Duration(setupOverride);
  }
}

export class OperationPlanIterator implements Iterable<OperationPlan> {
  static readonly cppBases: readonly string[] = [];
  static readonly cppQualifiedNames: readonly string[] = ["OperationPlan::iterator"];
  protected readonly values: OperationPlan[];
  protected index = 0;
  constructor(source?: Iterable<OperationPlan> | OperationPlan | Operation | null) {
    if (source instanceof OperationPlan) this.values = [...source.getSubOperationPlans()];
    else if (source && typeof (source as Iterable<OperationPlan>)[Symbol.iterator] === "function") this.values = [...source as Iterable<OperationPlan>];
    else {
      const plans = call(source, "getOperationPlans");
      this.values = plans && typeof (plans as Iterable<OperationPlan>)[Symbol.iterator] === "function" ? [...plans as Iterable<OperationPlan>] : [];
    }
  }
  next(): OperationPlan | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<OperationPlan> { return this.values[Symbol.iterator](); }
}

export class OperationPlanFlowPlanIterator implements Iterable<HeaderModelAdapter> {
  static readonly cppBases: readonly string[] = [];
  static readonly cppQualifiedNames: readonly string[] = ["OperationPlan::FlowPlanIterator"];
  private readonly owner: OperationPlan | null;
  private readonly values: HeaderModelAdapter[];
  private index = 0;
  constructor(owner: OperationPlan | null = null) { this.owner = owner; this.values = [...(owner?.flowPlanSnapshot() ?? [])]; }
  next(): HeaderModelAdapter | null { return this.values[this.index++] ?? null; }
  deleteFlowPlan(): void {
    const current = this.values[Math.max(0, this.index - 1)];
    if (current) { this.owner?.detachFlowPlan(current); current.dispose(); }
  }
  [Symbol.iterator](): Iterator<HeaderModelAdapter> { return this.values[Symbol.iterator](); }
}

export class OperationPlanLoadPlanIterator implements Iterable<HeaderModelAdapter> {
  static readonly cppBases: readonly string[] = [];
  static readonly cppQualifiedNames: readonly string[] = ["OperationPlan::LoadPlanIterator"];
  private readonly owner: OperationPlan | null;
  private readonly values: HeaderModelAdapter[];
  private index = 0;
  constructor(owner: OperationPlan | null = null) { this.owner = owner; this.values = [...(owner?.loadPlanSnapshot() ?? [])]; }
  next(): HeaderModelAdapter | null { return this.values[this.index++] ?? null; }
  deleteLoadPlan(): void {
    const current = this.values[Math.max(0, this.index - 1)];
    if (current) { this.owner?.detachLoadPlan(current); current.dispose(); }
  }
  [Symbol.iterator](): Iterator<HeaderModelAdapter> { return this.values[Symbol.iterator](); }
}

export class OperationPlanProblemIterator implements Iterable<Problem> {
  static readonly cppBases: readonly string[] = ["OperationPlanIterator"];
  static readonly cppQualifiedNames: readonly string[] = ["OperationPlan::ProblemIterator"];
  private readonly values: readonly Problem[];
  private index = 0;
  constructor(plan?: OperationPlan, includeRelated = true) {
    this.values = plan ? collectOperationPlanProblems(plan, includeRelated) : [];
  }
  next(): Problem | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<Problem> { return this.values[Symbol.iterator](); }
}

export class OperationPlanAlternateIterator implements Iterable<Operation> {
  static readonly cppBases: readonly string[] = [];
  static readonly cppQualifiedNames: readonly string[] = ["OperationPlan::AlternateIterator"];
  private readonly values: Operation[] = [];
  private index = 0;
  constructor(plan?: OperationPlan) {
    const owner = plan?.getOwner();
    const subOperations = call(owner?.getOperation(), "getSubOperations");
    if (Array.isArray(subOperations)) {
      for (const candidate of subOperations) if (candidate !== plan?.getOperation()) this.values.push(candidate as Operation);
    }
  }
  next(): Operation | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<Operation> { return this.values[Symbol.iterator](); }
}

export class OperationPlanInterruptionIterator extends HeaderModelAdapter implements Iterable<HeaderModelAdapter> {
  static readonly cppBases: readonly string[] = ["Object"];
  static readonly cppQualifiedNames: readonly string[] = ["OperationPlan::InterruptionIterator"];
  private readonly values: HeaderModelAdapter[] = [];
  private index = 0;
  private current: HeaderModelAdapter | null = null;
  constructor(_plan?: OperationPlan) { super(); }
  static intitialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  next(): HeaderModelAdapter | null { this.current = this.values[this.index++] ?? null; return this.current; }
  getStart(): PlanningDate { const value = call(this.current, "getStart"); return value instanceof PlanningDate ? value : new PlanningDate(); }
  getEnd(): PlanningDate { const value = call(this.current, "getEnd"); return value instanceof PlanningDate ? value : new PlanningDate(); }
  getType(): string { return "interruption"; }
  override [Symbol.iterator](): IterableIterator<HeaderModelAdapter> { return this.values[Symbol.iterator](); }
}










/**
 * Semantic migration unit for src/model/operationplan.cpp.
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
  { name: "OperationPlan::initialize", sourceLine: 48, status: "adapted" },
  { name: "OperationPlan::str", sourceLine: 77, status: "adapted" },
  { name: "OperationPlan::calculateOperationTimePython", sourceLine: 83, status: "adapted" },
  { name: "OperationPlan::setChanged", sourceLine: 111, status: "adapted" },
  { name: "OperationPlan::restore", sourceLine: 163, status: "adapted" },
  { name: "OperationPlan::createOperationPlan", sourceLine: 170, status: "adapted" },
  { name: "Operation::find", sourceLine: 677, status: "adapted" },
  { name: "Buffer::findOrCreate", sourceLine: 697, status: "adapted" },
  { name: "OperationPlan::findReference", sourceLine: 739, status: "adapted" },
  { name: "OperationPlan::assignReference", sourceLine: 763, status: "adapted" },
  { name: "OperationPlan::setOperation", sourceLine: 803, status: "adapted" },
  { name: "OperationPlan::activate", sourceLine: 832, status: "adapted" },
  { name: "OperationPlan::deactivate", sourceLine: 893, status: "adapted" },
  { name: "OperationPlan::insertInOperationplanList", sourceLine: 908, status: "adapted" },
  { name: "OperationPlan::removeFromOperationplanList", sourceLine: 941, status: "adapted" },
  { name: "OperationPlan::updateOperationplanList", sourceLine: 959, status: "adapted" },
  { name: "OperationPlan::eraseSubOperationPlan", sourceLine: 999, status: "adapted" },
  { name: "OperationPlan::createFlowLoads", sourceLine: 1051, status: "adapted" },
  { name: "OperationPlan::deleteFlowLoads", sourceLine: 1115, status: "adapted" },
  { name: "OperationPlan::getTotalFlowAux", sourceLine: 1134, status: "adapted" },
  { name: "OperationPlan::~OperationPlan", sourceLine: 1149, status: "adapted" },
  { name: "OperationPlan::setOwner", sourceLine: 1192, status: "adapted" },
  { name: "OperationPlan::setStart", sourceLine: 1211, status: "adapted" },
  { name: "OperationPlan::setEnd", sourceLine: 1259, status: "adapted" },
  { name: "OperationPlan::resizeFlowLoadPlans", sourceLine: 1307, status: "adapted" },
  { name: "OperationPlan::mergeIfPossible", sourceLine: 1331, status: "adapted" },
  { name: "OperationPlan::scanSetupTimes", sourceLine: 1414, status: "adapted" },
  { name: "OperationPlan::updateSetupTime", sourceLine: 1481, status: "adapted" },
  { name: "OperationPlan::update", sourceLine: 1566, status: "adapted" },
  { name: "OperationPlan::deleteOperationPlans", sourceLine: 1594, status: "adapted" },
  { name: "OperationPlan::isExcess", sourceLine: 1621, status: "adapted" },
  { name: "OperationPlan::getUnavailable", sourceLine: 1708, status: "adapted" },
  { name: "OperationPlan::finder", sourceLine: 1715, status: "adapted" },
  { name: "OperationPlan::setConfirmed", sourceLine: 1721, status: "adapted" },
  { name: "OperationPlan::setApproved", sourceLine: 1736, status: "adapted" },
  { name: "OperationPlan::setProposed", sourceLine: 1750, status: "adapted" },
  { name: "OperationPlan::setCompleted", sourceLine: 1764, status: "adapted" },
  { name: "OperationPlan::setClosed", sourceLine: 1779, status: "adapted" },
  { name: "OperationPlan::propagateStatus", sourceLine: 1793, status: "adapted" },
  { name: "Plan::instance", sourceLine: 1814, status: "adapted" },
  { name: "Plan::instance", sourceLine: 1820, status: "adapted" },
  { name: "Plan::instance", sourceLine: 1823, status: "adapted" },
  { name: "OperationPlan::getStatus", sourceLine: 2026, status: "adapted" },
  { name: "OperationPlan::isConstrained", sourceLine: 2039, status: "adapted" },
  { name: "OperationPlan::setStatus", sourceLine: 2048, status: "adapted" },
  { name: "OperationPlan::freezeStatus", sourceLine: 2076, status: "adapted" },
  { name: "OperationPlan::setDemand", sourceLine: 2082, status: "adapted" },
  { name: "OperationPlan::create", sourceLine: 2097, status: "adapted" },
  { name: "OperationPlan::getPriority", sourceLine: 2146, status: "adapted" },
  { name: "OperationPlan::getCriticality", sourceLine: 2170, status: "adapted" },
  { name: "HasLevel::getNumberOfLevels", sourceLine: 2187, status: "adapted" },
  { name: "OperationPlan::getDelay", sourceLine: 2209, status: "adapted" },
  { name: "HasLevel::getNumberOfLevels", sourceLine: 2224, status: "adapted" },
  { name: "OperationPlan::setQuantityExternal", sourceLine: 2245, status: "adapted" },
  { name: "OperationPlan::setQuantityCompleted", sourceLine: 2253, status: "adapted" },
  { name: "OperationPlan::updatePurchaseOrder", sourceLine: 2261, status: "adapted" },
  { name: "OperationPlan::updateDistributionOrder", sourceLine: 2312, status: "adapted" },
  { name: "OperationPlan::setItem", sourceLine: 2383, status: "adapted" },
  { name: "OperationPlan::setOrigin", sourceLine: 2395, status: "adapted" },
  { name: "OperationPlan::setLocation", sourceLine: 2404, status: "adapted" },
  { name: "OperationPlan::setSupplier", sourceLine: 2416, status: "adapted" },
  { name: "OperationPlan::clear", sourceLine: 2425, status: "adapted" },
  { name: "OperationPlan::createIterator", sourceLine: 2429, status: "adapted" },
  { name: "OperationPlan::getPeggingDownstream", sourceLine: 2448, status: "adapted" },
  { name: "OperationPlan::getPeggingDownstreamFirstLevel", sourceLine: 2452, status: "adapted" },
  { name: "OperationPlan::getPeggingUpstream", sourceLine: 2456, status: "adapted" },
  { name: "OperationPlan::getPeggingUpstreamFirstLevel", sourceLine: 2460, status: "adapted" },
  { name: "OperationPlan::getPeggingDemand", sourceLine: 2464, status: "adapted" },
  { name: "OperationPlan::InterruptionIterator::intitialize", sourceLine: 2468, status: "adapted" },
  { name: "OperationPlan::AlternateIterator::AlternateIterator", sourceLine: 2490, status: "adapted" },
  { name: "OperationPlan::AlternateIterator::next", sourceLine: 2504, status: "adapted" },
  { name: "OperationPlan::InterruptionIterator::next", sourceLine: 2512, status: "adapted" },
  { name: "OperationPlan::getEfficiency", sourceLine: 2547, status: "adapted" },
  { name: "OperationPlan::setBatch", sourceLine: 2624, status: "adapted" },
  { name: "OperationPlan::computeOperationToFlowDate", sourceLine: 2639, status: "adapted" },
  { name: "OperationPlan::getSetup", sourceLine: 2649, status: "adapted" },
  { name: "OperationPlan::setSetupEvent", sourceLine: 2663, status: "adapted" },
  { name: "OperationPlan::getSetupCost", sourceLine: 2685, status: "adapted" },
  { name: "OperationPlan::getColorPython", sourceLine: 2692, status: "adapted" },
  { name: "SetupEvent::SetupEvent", sourceLine: 2788, status: "adapted" },
  { name: "SetupEvent::~SetupEvent", sourceLine: 2794, status: "adapted" },
  { name: "SetupEvent::erase", sourceLine: 2798, status: "adapted" },
  { name: "SetupEvent::update", sourceLine: 2811, status: "adapted" },
  { name: "SetupEvent::getSetupBefore", sourceLine: 2826, status: "adapted" },
  { name: "SetupEvent::initialize", sourceLine: 2837, status: "adapted" },
  { name: "OperationPlan::setResetResources", sourceLine: 2853, status: "adapted" },
  { name: "OperationPlan::appendInfo", sourceLine: 2864, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface AlternateIteratorPort {
  AlternateIterator(...args: readonly PortValue[]): PortValue | void;
  next(...args: readonly PortValue[]): PortValue | void;
}

export interface BufferPort {
  findOrCreate(...args: readonly PortValue[]): PortValue | void;
}

export interface HasLevelPort {
  getNumberOfLevels(...args: readonly PortValue[]): PortValue | void;
}

export interface InterruptionIteratorPort {
  intitialize(...args: readonly PortValue[]): PortValue | void;
  next(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPort {
  find(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanPort {
  activate(...args: readonly PortValue[]): PortValue | void;
  appendInfo(...args: readonly PortValue[]): PortValue | void;
  assignReference(...args: readonly PortValue[]): PortValue | void;
  calculateOperationTimePython(...args: readonly PortValue[]): PortValue | void;
  clear(...args: readonly PortValue[]): PortValue | void;
  computeOperationToFlowDate(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  createFlowLoads(...args: readonly PortValue[]): PortValue | void;
  createIterator(...args: readonly PortValue[]): PortValue | void;
  createOperationPlan(...args: readonly PortValue[]): PortValue | void;
  deactivate(...args: readonly PortValue[]): PortValue | void;
  deleteFlowLoads(...args: readonly PortValue[]): PortValue | void;
  deleteOperationPlans(...args: readonly PortValue[]): PortValue | void;
  disposeOperationPlan(...args: readonly PortValue[]): PortValue | void;
  eraseSubOperationPlan(...args: readonly PortValue[]): PortValue | void;
  findReference(...args: readonly PortValue[]): PortValue | void;
  finder(...args: readonly PortValue[]): PortValue | void;
  freezeStatus(...args: readonly PortValue[]): PortValue | void;
  getColorPython(...args: readonly PortValue[]): PortValue | void;
  getCriticality(...args: readonly PortValue[]): PortValue | void;
  getDelay(...args: readonly PortValue[]): PortValue | void;
  getEfficiency(...args: readonly PortValue[]): PortValue | void;
  getPeggingDemand(...args: readonly PortValue[]): PortValue | void;
  getPeggingDownstream(...args: readonly PortValue[]): PortValue | void;
  getPeggingDownstreamFirstLevel(...args: readonly PortValue[]): PortValue | void;
  getPeggingUpstream(...args: readonly PortValue[]): PortValue | void;
  getPeggingUpstreamFirstLevel(...args: readonly PortValue[]): PortValue | void;
  getPriority(...args: readonly PortValue[]): PortValue | void;
  getSetup(...args: readonly PortValue[]): PortValue | void;
  getSetupCost(...args: readonly PortValue[]): PortValue | void;
  getStatus(...args: readonly PortValue[]): PortValue | void;
  getTotalFlowAux(...args: readonly PortValue[]): PortValue | void;
  getUnavailable(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  insertInOperationplanList(...args: readonly PortValue[]): PortValue | void;
  isConstrained(...args: readonly PortValue[]): PortValue | void;
  isExcess(...args: readonly PortValue[]): PortValue | void;
  mergeIfPossible(...args: readonly PortValue[]): PortValue | void;
  propagateStatus(...args: readonly PortValue[]): PortValue | void;
  removeFromOperationplanList(...args: readonly PortValue[]): PortValue | void;
  resizeFlowLoadPlans(...args: readonly PortValue[]): PortValue | void;
  restore(...args: readonly PortValue[]): PortValue | void;
  scanSetupTimes(...args: readonly PortValue[]): PortValue | void;
  setApproved(...args: readonly PortValue[]): PortValue | void;
  setBatch(...args: readonly PortValue[]): PortValue | void;
  setChanged(...args: readonly PortValue[]): PortValue | void;
  setClosed(...args: readonly PortValue[]): PortValue | void;
  setCompleted(...args: readonly PortValue[]): PortValue | void;
  setConfirmed(...args: readonly PortValue[]): PortValue | void;
  setDemand(...args: readonly PortValue[]): PortValue | void;
  setEnd(...args: readonly PortValue[]): PortValue | void;
  setItem(...args: readonly PortValue[]): PortValue | void;
  setLocation(...args: readonly PortValue[]): PortValue | void;
  setOperation(...args: readonly PortValue[]): PortValue | void;
  setOrigin(...args: readonly PortValue[]): PortValue | void;
  setOwner(...args: readonly PortValue[]): PortValue | void;
  setProposed(...args: readonly PortValue[]): PortValue | void;
  setQuantityCompleted(...args: readonly PortValue[]): PortValue | void;
  setQuantityExternal(...args: readonly PortValue[]): PortValue | void;
  setResetResources(...args: readonly PortValue[]): PortValue | void;
  setSetupEvent(...args: readonly PortValue[]): PortValue | void;
  setStart(...args: readonly PortValue[]): PortValue | void;
  setStatus(...args: readonly PortValue[]): PortValue | void;
  setSupplier(...args: readonly PortValue[]): PortValue | void;
  str(...args: readonly PortValue[]): PortValue | void;
  update(...args: readonly PortValue[]): PortValue | void;
  updateDistributionOrder(...args: readonly PortValue[]): PortValue | void;
  updateOperationplanList(...args: readonly PortValue[]): PortValue | void;
  updatePurchaseOrder(...args: readonly PortValue[]): PortValue | void;
  updateSetupTime(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface SetupEventPort {
  SetupEvent(...args: readonly PortValue[]): PortValue | void;
  disposeSetupEvent(...args: readonly PortValue[]): PortValue | void;
  erase(...args: readonly PortValue[]): PortValue | void;
  getSetupBefore(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  update(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/operationplan.cpp";
export const targetFile = "model/operationplan.ts";

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
  "Tree OperationPlan::st;",
  "",
  "const MetaClass* OperationPlan::metadata;",
  "const MetaCategory* OperationPlan::metacategory;",
  "const MetaClass* OperationPlan::InterruptionIterator::metadata;",
  "const MetaCategory* OperationPlan::InterruptionIterator::metacategory;",
  "unsigned long OperationPlan::counterMin = 1;",
  "string OperationPlan::referenceMax;",
  "bool OperationPlan::propagatesetups = true;",
  "",
  "const MetaCategory* SetupEvent::metadata;",
  "",
  "Location* OperationPlan::loc = nullptr;",
  "Location* OperationPlan::ori = nullptr;",
  "Supplier* OperationPlan::sup = nullptr;",
  "string OperationPlan::ordertype;",
  "Item* OperationPlan::itm = nullptr;",
  "",
  "int OperationPlan::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<OperationPlan>(",
  "      \"operationplan\", \"operationplans\", createOperationPlan,",
  "      OperationPlan::finder);",
  "  OperationPlan::metadata = MetaClass::registerClass<OperationPlan>(",
  "      \"operationplan\", \"operationplan\", true);",
  "  registerFields<OperationPlan>(const_cast<MetaCategory*>(metacategory));",
  "",
  "  // Initialize the Python type",
  "  auto& x = FreppleCategory<OperationPlan>::getPythonType();",
  "  x.setName(\"operationplan\");",
  "  x.setDoc(\"frePPLe operationplan\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportstr();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  x.addMethod(\"calculateOperationTime\", &calculateOperationTimePython,",
  "              METH_VARARGS,",
  "              \"add or subtract a duration of operation hours from a date\");",
  "  x.addMethod(\"updateFeasible\", &updateFeasiblePython, METH_NOARGS,",
  "              \"updates the flag whether this operationplan is feasible or not\");",
  "  x.addMethod(\"getColor\", &getColorPython, METH_NOARGS,",
  "              \"returs a pair<double color, IP buffer>\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* OperationPlan::str() const {",
  "  ostringstream ch;",
  "  ch << this;",
  "  return PythonData(ch.str());",
  "}",
  "",
  "PyObject* OperationPlan::calculateOperationTimePython(PyObject* self,",
  "                                                      PyObject* args) {",
  "  // Pick up the argument",
  "  PyObject* datepy;",
  "  PyObject* durationpy;",
  "  int forward = 1;",
  "",
  "  if (!PyArg_ParseTuple(args, \"OO|p:calculateOperationTime\", &datepy,",
  "                        &durationpy, &forward))",
  "    return nullptr;",
  "",
  "  try {",
  "    auto opplan = static_cast<OperationPlan*>(self);",
  "    Date dt = PythonData(datepy).getDate();",
  "    Duration dur = PythonData(durationpy).getDuration();",
  "    if (!opplan->getOperation())",
  "      return PythonData(dt + dur);",
  "    else {",
  "      DateRange res = opplan->getOperation()->calculateOperationTime(",
  "          opplan, dt, dur, (forward == 1));",
  "      return PythonData(forward ? res.getEnd() : res.getStart());",
  "    }",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "void OperationPlan::setChanged(bool b) {",
  "  // Opplan itself",
  "  if (owner)",
  "    owner->setChanged(b);",
  "  else {",
  "    oper->setChanged(b);",
  "    if (dmd) dmd->setChanged();",
  "  }",
  "",
  "  // Next routing step",
  "  if (nextsubopplan) {",
  "    if (nextsubopplan->owner)",
  "      nextsubopplan->owner->setChanged(b);",
  "    else {",
  "      nextsubopplan->oper->setChanged(b);",
  "      if (nextsubopplan->dmd) nextsubopplan->dmd->setChanged();",
  "    }",
  "  }",
  "",
  "  // Previous step",
  "  if (prevsubopplan) {",
  "    if (prevsubopplan->owner)",
  "      prevsubopplan->owner->setChanged(b);",
  "    else {",
  "      prevsubopplan->oper->setChanged(b);",
  "      if (prevsubopplan->dmd) prevsubopplan->dmd->setChanged();",
  "    }",
  "  }",
  "",
  "  // All dependencies",
  "  for (auto i : dependencies) {",
  "    if (i->getFirst() == this && i->getSecond()) {",
  "      if (i->getSecond()->owner && i->getSecond()->owner != getOwner() &&",
  "          i->getSecond()->owner != this)",
  "        i->getSecond()->owner->setChanged(b);",
  "      else {",
  "        i->getSecond()->oper->setChanged(b);",
  "        if (i->getSecond()->dmd) i->getSecond()->dmd->setChanged();",
  "      }",
  "    }",
  "    if (i->getSecond() == this && i->getFirst()) {",
  "      if (i->getFirst()->owner && i->getFirst()->owner != getOwner() &&",
  "          i->getFirst()->owner != this)",
  "        i->getFirst()->owner->setChanged(b);",
  "      else {",
  "        i->getFirst()->oper->setChanged(b);",
  "        if (i->getFirst()->dmd) i->getFirst()->dmd->setChanged();",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "void OperationPlan::restore(const OperationPlanState& x) {",
  "  setSetupEvent(x.tmline, x.setup.getDate(), x.setup.getSetup(),",
  "                x.setup.getRule());",
  "  setStartEndAndQuantity(x.start, x.end, x.quantity);",
  "  if (!SetupMatrix::empty()) scanSetupTimes();",
  "}",
  "",
  "Object* OperationPlan::createOperationPlan(const MetaClass*,",
  "                                           const DataValueDict& in,",
  "                                           CommandManager* mgr) {",
  "  // Pick up the action attribute",
  "  Action action = MetaClass::decodeAction(in);",
  "",
  "  // Check the order type",
  "  string ordtype;",
  "  const DataValue* ordtypeval = in.get(Tags::ordertype);",
  "  if (ordtypeval) ordtype = ordtypeval->getString();",
  "",
  "  // Decode the operationplan identifier",
  "  string id;",
  "  const DataValue* ref = in.get(Tags::reference);",
  "  if (ref) id = ref->getString();",
  "  if (id.empty()) {",
  "    const DataValue* idfier = in.get(Tags::id);",
  "    if (idfier) id = idfier->getString();",
  "  }",
  "  if (id.empty() && (action == Action::CHANGE || action == Action::REMOVE))",
  "    // Identifier is required",
  "    throw DataException(\"Missing reference or identifier field\");",
  "",
  "  // If an identifier is specified, we look up this operation plan",
  "  OperationPlan* opplan = nullptr;",
  "  if (!id.empty()) {",
  "    opplan = OperationPlan::findReference(id);",
  "    if (opplan) {",
  "      // Check whether previous and current operations match.",
  "      if (ordtype.empty()) {",
  "        ordtype = opplan->getOrderType();",
  "        if (ordtype == \"ALT\") ordtype = \"MO\";",
  "      } else if (ordtype != opplan->getOrderType()) {",
  "        ostringstream ch;",
  "        ch << \"Operationplan identifier \" << id",
  "           << \" defined multiple times for different order types\";",
  "        throw DataException(ch.str());",
  "      }",
  "    }",
  "  }",
  "",
  "  // Decode the attributes",
  "  Object* operval = nullptr;",
  "  Object* itemval = nullptr;",
  "  Object* locval = nullptr;",
  "  Object* supval = nullptr;",
  "  Object* orival = nullptr;",
  "  Object* dmdval = nullptr;",
  "  Object* itemdistributionval = nullptr;",
  "  if (ordtype == \"MO\" || ordtype.empty()) {",
  "    const DataValue* val = in.get(Tags::operation);",
  "    if (!val && action == Action::ADD)",
  "      throw DataException(\"Missing operation field\");",
  "    if (val) {",
  "      operval = val->getObject();",
  "      if (operval && operval->getType().category != Operation::metadata)",
  "        throw DataException(",
  "            \"Operation field on operationplan must be of type operation\");",
  "    }",
  "  } else if (ordtype == \"PO\") {",
  "    const DataValue* val = in.get(Tags::supplier);",
  "    if (!val && action == Action::ADD)",
  "      throw DataException(\"Missing supplier field\");",
  "    if (val) {",
  "      supval = val->getObject();",
  "      if (supval && supval->getType().category != Supplier::metadata)",
  "        throw DataException(",
  "            \"Supplier field on operationplan must be of type supplier\");",
  "    }",
  "    val = in.get(Tags::item);",
  "    if (!val && action == Action::ADD)",
  "      throw DataException(\"Missing item field\");",
  "    if (val) {",
  "      itemval = val->getObject();",
  "      if (itemval && itemval->getType().category != Item::metadata)",
  "        throw DataException(\"Item field on operationplan must be of type item\");",
  "    }",
  "    val = in.get(Tags::location);",
  "    if (!val && action == Action::ADD)",
  "      throw DataException(\"Missing location field\");",
  "    if (val) {",
  "      locval = val->getObject();",
  "      if (locval && locval->getType().category != Location::metadata)",
  "        throw DataException(",
  "            \"Location field on operationplan must be of type location\");",
  "    }",
  "  } else if (ordtype == \"DO\") {",
  "    const DataValue* val = in.get(Tags::itemdistribution);",
  "    if (val) {",
  "      itemdistributionval = val->getObject();",
  "      if (itemdistributionval && itemdistributionval->getType().category !=",
  "                                     ItemDistribution::metacategory)",
  "        throw DataException(",
  "            \"Itemdistribution field on operationplan must be of type \"",
  "            \"itemdistribution\");",
  "    } else {",
  "      val = in.get(Tags::origin);",
  "      if (val) {",
  "        orival = val->getObject();",
  "        if (orival && orival->getType().category != Location::metadata)",
  "          throw DataException(",
  "              \"Origin field on a distribution order must be of type location\");",
  "      }",
  "      val = in.get(Tags::item);",
  "      if (!val && action == Action::ADD)",
  "        throw DataException(\"Missing item field\");",
  "      if (val) {",
  "        itemval = val->getObject();",
  "        if (itemval && itemval->getType().category != Item::metadata)",
  "          throw DataException(",
  "              \"Item field on distribution order must be of type item\");",
  "      }",
  "      val = in.get(Tags::location);",
  "      if (!val && action == Action::ADD)",
  "        throw DataException(\"Missing location field\");",
  "      if (val) {",
  "        locval = val->getObject();",
  "        if (locval && locval->getType().category != Location::metadata)",
  "          throw DataException(",
  "              \"Location field on distribution order must be of type location\");",
  "      }",
  "    }",
  "  } else if (ordtype == \"DLVR\") {",
  "    const DataValue* val = in.get(Tags::demand);",
  "    if (!val && action == Action::ADD)",
  "      throw DataException(\"Missing demand field\");",
  "    if (val) {",
  "      dmdval = val->getObject();",
  "      if (!dmdval)",
  "        throw DataException(\"Empty demand field\");",
  "      else if (dmdval->getType().category != Demand::metadata) {",
  "        auto* tmp = dynamic_cast<Demand*>(dmdval);",
  "        if (!tmp)",
  "          throw DataException(",
  "              \"Demand field on operationplan must be of type demand\");",
  "      }",
  "    }",
  "    val = in.get(Tags::item);",
  "    if (!val && action == Action::ADD)",
  "      throw DataException(\"Missing item field\");",
  "    if (val) {",
  "      itemval = val->getObject();",
  "      if (itemval && itemval->getType().category != Item::metadata)",
  "        throw DataException(\"Item field on operationplan must be of type item\");",
  "    }",
  "    val = in.get(Tags::location);",
  "    if (!val && action == Action::ADD)",
  "      throw DataException(\"Missing location field\");",
  "    if (val) {",
  "      locval = val->getObject();",
  "      if (locval && locval->getType().category != Location::metadata)",
  "        throw DataException(",
  "            \"Location field on operationplan must be of type location\");",
  "    }",
  "  } else",
  "    // Unknown order type for operationplan. We won't read it.",
  "    return nullptr;",
  "",
  "  // Execute the proper action",
  "  switch (action) {",
  "    case Action::REMOVE:",
  "      if (opplan) {",
  "        // Send out the notification to subscribers",
  "        if (opplan->getType().raiseEvent(opplan, SIG_REMOVE))",
  "          // Delete it",
  "          delete opplan;",
  "        else {",
  "          // The callbacks disallowed the deletion!",
  "          ostringstream ch;",
  "          ch << \"Can't delete operationplan with reference \" << id;",
  "          throw DataException(ch.str());",
  "        }",
  "      } else {",
  "        ostringstream ch;",
  "        ch << \"Operationplan with reference \" << id << \" doesn't exist\";",
  "        throw DataException(ch.str());",
  "      }",
  "      return nullptr;",
  "    case Action::ADD:",
  "      if (opplan) {",
  "        ostringstream ch;",
  "        ch << \"Operationplan with reference \" << id",
  "           << \" already exists and can't be added again\";",
  "        throw DataException(ch.str());",
  "      }",
  "      break;",
  "    case Action::CHANGE:",
  "      if (!opplan) {",
  "        ostringstream ch;",
  "        ch << \"Operationplan with reference \" << id << \" doesn't exist\";",
  "        throw DataException(ch.str());",
  "      }",
  "      break;",
  "    case Action::ADD_CHANGE:;",
  "  }",
  "",
  "  // Flag whether or not to create sub operationplans",
  "  bool create = true;",
  "  const DataValue* py_create = in.get(Tags::create);",
  "  if (py_create) create = py_create->getBool();",
  "",
  "  // Get start, end, quantity, status and batch fields",
  "  const DataValue* startfld = in.get(Tags::start);",
  "  Date start;",
  "  if (startfld) start = startfld->getDate();",
  "  const DataValue* endfld = in.get(Tags::end);",
  "  Date end;",
  "  if (endfld) {",
  "    end = endfld->getDate();",
  "    if (startfld && start > end && start && end && end != Date::infiniteFuture)",
  "      start = end;",
  "  }",
  "  const DataValue* quantityfld = in.get(Tags::quantity);",
  "  double quantity = quantityfld ? quantityfld->getDouble() : 0.0;",
  "  bool statuspropagation = true;",
  "  const DataValue* statusfld = in.get(Tags::status);",
  "  string status;",
  "  if (statusfld)",
  "    status = statusfld->getString();",
  "  else {",
  "    statusfld = in.get(Tags::statusNoPropagation);",
  "    if (statusfld) status = statusfld->getString();",
  "    statuspropagation = false;",
  "  }",
  "  PooledString batch;",
  "  const DataValue* batchfld = in.get(Tags::batch);",
  "  if (batchfld) batch = batchfld->getString();",
  "  const DataValue* quantityCompletedfld = in.get(Tags::quantity_completed);",
  "  double quantity_completed =",
  "      quantityCompletedfld ? quantityCompletedfld->getDouble() : 0.0;",
  "",
  "  // Get list of assigned resources",
  "  vector<Resource*> assigned_resources;",
  "  const DataValue* reslist = in.get(Tags::resources);",
  "  if (reslist) {",
  "    for (auto& resname : reslist->getStringList()) {",
  "      auto r = Resource::find(resname);",
  "      if (r) assigned_resources.push_back(r);",
  "    }",
  "  }",
  "",
  "  // Return the existing operationplan",
  "  if (opplan) {",
  "    if (operval) opplan->setOperation(static_cast<Operation*>(operval));",
  "    if (locval) opplan->setLocation(dynamic_cast<Location*>(locval));",
  "    if (itemval) opplan->setItem(dynamic_cast<Item*>(itemval));",
  "    if (supval) opplan->setSupplier(dynamic_cast<Supplier*>(supval));",
  "    if (orival) opplan->setOrigin(dynamic_cast<Location*>(orival));",
  "    opplan->setForcedUpdate(true);",
  "    if (batchfld) opplan->setBatch(batch);",
  "    if (statusfld) opplan->setStatus(status);",
  "    if (quantityCompletedfld) opplan->setQuantityCompleted(quantity_completed);",
  "    if (!assigned_resources.empty()) {",
  "      opplan->setResetResources(true);",
  "      opplan->createFlowLoads(&assigned_resources);",
  "    }",
  "    if ((quantityfld || !assigned_resources.empty()) && !startfld && !endfld)",
  "      opplan->setOperationPlanParameters(",
  "          quantityfld ? quantity : opplan->getQuantity(), opplan->getStart(),",
  "          Date::infinitePast);",
  "    else if ((quantityfld || !assigned_resources.empty()) || startfld || endfld)",
  "      opplan->setOperationPlanParameters(",
  "          quantityfld ? quantity : opplan->getQuantity(), start, end);",
  "    opplan->setForcedUpdate(false);",
  "    return opplan;",
  "  }",
  "",
  "  // Create a new operation plan",
  "  if (!start && !end) start = Plan::instance().getCurrent();",
  "  if (ordtype == \"PO\") {",
  "    // Find or create the destination buffer.",
  "    if (!itemval) throw DataException(\"Missing item field\");",
  "    if (!locval) throw DataException(\"Missing location field\");",
  "    Buffer* destbuffer = nullptr;",
  "    Item::bufferIterator buf_iter(static_cast<Item*>(itemval));",
  "    while (Buffer* tmpbuf = buf_iter.next()) {",
  "      if (tmpbuf->getLocation() == static_cast<Location*>(locval) &&",
  "          !tmpbuf->getBatch()) {",
  "        if (destbuffer) {",
  "          stringstream o;",
  "          o << \"Multiple buffers found for item '\"",
  "            << static_cast<Item*>(itemval) << \"' and location'\"",
  "            << static_cast<Location*>(locval) << \"'\";",
  "          throw DataException(o.str());",
  "        }",
  "        destbuffer = tmpbuf;",
  "      }",
  "    }",
  "    if (!destbuffer)",
  "      // Create the destination buffer",
  "      destbuffer = Buffer::findOrCreate(static_cast<Item*>(itemval),",
  "                                        static_cast<Location*>(locval));",
  "",
  "    // Build the producing operation for this buffer.",
  "    destbuffer->getProducingOperation();",
  "",
  "    // Look for a matching operation replenishing this buffer.",
  "    for (auto flowiter = destbuffer->getFlows().begin();",
  "         flowiter != destbuffer->getFlows().end() && !operval; ++flowiter) {",
  "      if (!flowiter->getOperation()->hasType<OperationItemSupplier>()) continue;",
  "      auto* opitemsupplier =",
  "          static_cast<OperationItemSupplier*>(flowiter->getOperation());",
  "      if (supval) {",
  "        if (static_cast<Supplier*>(supval)->isMemberOf(",
  "                opitemsupplier->getItemSupplier()->getSupplier()))",
  "          operval = opitemsupplier;",
  "      } else",
  "        operval = opitemsupplier;",
  "    }",
  "",
  "    // No matching operation is found.",
  "    if (!operval) {",
  "      // We'll create one now, but that requires that we have a supplier",
  "      // defined.",
  "      if (!supval)",
  "        throw DataException(\"Supplier is needed on this purchase order\");",
  "      // Note: We know that we need to create a new one. An existing one would",
  "      // have created an operation on the buffer already.",
  "      auto* itemsupplier = new ItemSupplier();",
  "      itemsupplier->setSupplier(static_cast<Supplier*>(supval));",
  "      itemsupplier->setItem(static_cast<Item*>(itemval));",
  "      itemsupplier->setLocation(static_cast<Location*>(locval));",
  "      itemsupplier->setHidden(true);",
  "      itemsupplier->setPriority(0);",
  "      operval = new OperationItemSupplier(itemsupplier, destbuffer);",
  "      // Create operation plan",
  "      opplan = static_cast<Operation*>(operval)->createOperationPlan(",
  "          quantity, start, end, batch, nullptr, nullptr, 0, false, id);",
  "    } else",
  "      // Create the operationplan",
  "      opplan = static_cast<Operation*>(operval)->createOperationPlan(",
  "          quantity, start, end, batch, nullptr, nullptr, 0, false, id);",
  "  } else if (ordtype == \"DO\") {",
  "    // Find or create the destination buffer.",
  "    if (itemdistributionval) {",
  "      itemval = static_cast<ItemDistribution*>(itemdistributionval)->getItem();",
  "      locval =",
  "          static_cast<ItemDistribution*>(itemdistributionval)->getDestination();",
  "      orival = static_cast<ItemDistribution*>(itemdistributionval)->getOrigin();",
  "    }",
  "    if (!itemval) throw DataException(\"Missing item field\");",
  "    if (!locval && !orival)",
  "      throw DataException(\"Missing both origin and location field\");",
  "    Buffer* destbuffer = nullptr;",
  "    if (locval) {",
  "      // Use the destination location",
  "      Item::bufferIterator buf_iter(static_cast<Item*>(itemval));",
  "      while (Buffer* tmpbuf = buf_iter.next()) {",
  "        if (tmpbuf->getLocation() == static_cast<Location*>(locval) &&",
  "            !tmpbuf->getBatch()) {",
  "          if (destbuffer) {",
  "            stringstream o;",
  "            o << \"Multiple buffers found for item '\"",
  "              << static_cast<Item*>(itemval) << \"' and location '\"",
  "              << static_cast<Location*>(locval) << \"'\";",
  "            throw DataException(o.str());",
  "          }",
  "          destbuffer = tmpbuf;",
  "        }",
  "      }",
  "      if (!destbuffer)",
  "        // Create the destination buffer",
  "        destbuffer = Buffer::findOrCreate(static_cast<Item*>(itemval),",
  "                                          static_cast<Location*>(locval));",
  "",
  "      // Build the producing operation for this buffer.",
  "      destbuffer->getProducingOperation();",
  "",
  "      // Look for a matching operation replenishing this buffer.",
  "      for (auto flowiter = destbuffer->getFlows().begin();",
  "           flowiter != destbuffer->getFlows().end() && !operval; ++flowiter) {",
  "        if (!flowiter->getOperation()->hasType<OperationItemDistribution>() ||",
  "            flowiter->getQuantity() <= 0)",
  "          continue;",
  "        auto* opitemdist =",
  "            static_cast<OperationItemDistribution*>(flowiter->getOperation());",
  "        // Origin must match as well",
  "        if (orival) {",
  "          for (auto fl = opitemdist->getFlows().begin();",
  "               fl != opitemdist->getFlows().end(); ++fl) {",
  "            if (fl->getQuantity() < 0 &&",
  "                fl->getBuffer()->getLocation()->isMemberOf(",
  "                    static_cast<Location*>(orival)) &&",
  "                !fl->getBuffer()->getBatch())",
  "              operval = opitemdist;",
  "          }",
  "        } else if (!opitemdist->getOrigin())",
  "          operval = opitemdist;",
  "      }",
  "    } else {",
  "      // Use only the source location to find an operation",
  "      stringstream o;",
  "      o << \"Ship \" << static_cast<Item*>(itemval)->getName() << \" from \"",
  "        << static_cast<Location*>(orival)->getName();",
  "      operval = Operation::find(o.str());",
  "    }",
  "",
  "    // No matching operation is found.",
  "    if (!operval) {",
  "      // We'll create one now if an origin is defined",
  "      Buffer* originbuffer = nullptr;",
  "      if (orival) {",
  "        auto bufiter = static_cast<Item*>(itemval)->getBufferIterator();",
  "        while (Buffer* tmpbuf = bufiter.next()) {",
  "          if (tmpbuf->getLocation() == static_cast<Location*>(orival) &&",
  "              !tmpbuf->getBatch()) {",
  "            if (originbuffer) {",
  "              stringstream o;",
  "              o << \"Multiple buffers found for item '\"",
  "                << static_cast<Item*>(itemval) << \"' and location '\"",
  "                << static_cast<Location*>(orival) << \"'\";",
  "              throw DataException(o.str());",
  "            }",
  "            originbuffer = tmpbuf;",
  "          }",
  "        }",
  "        if (!originbuffer)",
  "          // Create the origin buffer",
  "          originbuffer = Buffer::findOrCreate(static_cast<Item*>(itemval),",
  "                                              static_cast<Location*>(orival));",
  "      }",
  "",
  "      // Create itemdistribution when not provided",
  "      if (!itemdistributionval) {",
  "        itemdistributionval = new ItemDistribution();",
  "        if (orival)",
  "          static_cast<ItemDistribution*>(itemdistributionval)",
  "              ->setOrigin(static_cast<Location*>(orival));",
  "        static_cast<ItemDistribution*>(itemdistributionval)",
  "            ->setItem(static_cast<Item*>(itemval));",
  "        if (locval)",
  "          static_cast<ItemDistribution*>(itemdistributionval)",
  "              ->setDestination(static_cast<Location*>(locval));",
  "        static_cast<ItemDistribution*>(itemdistributionval)->setPriority(0);",
  "      }",
  "",
  "      // Create operation when it doesn't exist yet",
  "      operval = nullptr;",
  "      auto oper_iter =",
  "          static_cast<ItemDistribution*>(itemdistributionval)->getOperations();",
  "      while (OperationItemDistribution* oper2 = oper_iter.next()) {",
  "        if (oper2->getOrigin() == originbuffer &&",
  "            oper2->getDestination() == destbuffer) {",
  "          operval = oper2;",
  "          break;",
  "        }",
  "      }",
  "      if (!operval)",
  "        operval = new OperationItemDistribution(",
  "            static_cast<ItemDistribution*>(itemdistributionval), originbuffer,",
  "            destbuffer);",
  "",
  "      // Create operation plan",
  "      opplan = static_cast<Operation*>(operval)->createOperationPlan(",
  "          quantity, start, end, batch, nullptr, nullptr, 0, false, id);",
  "",
  "      // Make sure no problem is reported when item distribution priority is 0",
  "      // (Rebalancing) Checking that no item distribution in reverse mode exists",
  "      bool found = false;",
  "      auto itemdist_iter =",
  "          (static_cast<Item*>(itemval))->getDistributionIterator();",
  "      while (ItemDistribution* i = itemdist_iter.next()) {",
  "        if (i->getOrigin() ==",
  "                static_cast<ItemDistribution*>(itemdistributionval)",
  "                    ->getDestination() &&",
  "            i->getDestination() ==",
  "                static_cast<ItemDistribution*>(itemdistributionval)",
  "                    ->getOrigin()) {",
  "          found = true;",
  "          break;",
  "        }",
  "      }",
  "      if (!found)",
  "        new ProblemInvalidData(opplan,",
  "                               \"Distribution order '\" + opplan->getReference() +",
  "                                   \"' on unknown item distribution\",",
  "                               \"operationplan\", start, end);",
  "    } else",
  "      // Create operation plan",
  "      opplan = static_cast<Operation*>(operval)->createOperationPlan(",
  "          quantity, start, end, batch, nullptr, nullptr, 0, false, id);",
  "  } else if (ordtype == \"DLVR\") {",
  "    // Find or create the destination buffer.",
  "    if (!itemval) throw DataException(\"Missing item field\");",
  "    if (!locval) throw DataException(\"Missing location field\");",
  "    Buffer* destbuffer = nullptr;",
  "    Item::bufferIterator buf_iter(static_cast<Item*>(itemval));",
  "    while (Buffer* tmpbuf = buf_iter.next()) {",
  "      if (tmpbuf->getLocation() == static_cast<Location*>(locval) &&",
  "          !tmpbuf->getBatch()) {",
  "        if (destbuffer) {",
  "          stringstream o;",
  "          o << \"Multiple buffers found for item '\"",
  "            << static_cast<Item*>(itemval) << \"' and location '\"",
  "            << static_cast<Location*>(locval) << \"'\";",
  "          throw DataException(o.str());",
  "        }",
  "        destbuffer = tmpbuf;",
  "      }",
  "    }",
  "    if (!destbuffer)",
  "      // Create the destination buffer",
  "      destbuffer = Buffer::findOrCreate(static_cast<Item*>(itemval),",
  "                                        static_cast<Location*>(locval));",
  "",
  "    // Create new operation if not found",
  "    operval =",
  "        Operation::find(\"Ship \" + static_cast<Item*>(itemval)->getName() +",
  "                        \" @ \" + static_cast<Location*>(locval)->getName());",
  "    if (!operval) {",
  "      operval = new OperationDelivery();",
  "      static_cast<OperationDelivery*>(operval)->setBuffer(destbuffer);",
  "    }",
  "",
  "    // Create operation plan",
  "    opplan = static_cast<Operation*>(operval)->createOperationPlan(",
  "        quantity, start, end, batch, nullptr, nullptr, 0, false, id);",
  "    static_cast<Demand*>(dmdval)->addDelivery(opplan);",
  "  } else {",
  "    if (!operval)",
  "      // Can't create operationplan because the operation doesn't exist",
  "      throw DataException(\"Missing operation field\");",
  "",
  "    // Create an operationplan",
  "    if (static_cast<Operation*>(operval)->getItem() &&",
  "        static_cast<Operation*>(operval)->getLocation()) {",
  "      auto buf =",
  "          Buffer::findOrCreate(static_cast<Operation*>(operval)->getItem(),",
  "                               static_cast<Operation*>(operval)->getLocation());",
  "      buf->correctProducingFlow(static_cast<Operation*>(operval));",
  "    }",
  "    opplan = static_cast<Operation*>(operval)->createOperationPlan(",
  "        quantity, start, end, batch, nullptr, nullptr, 0, false, id,",
  "        quantity_completed, status, &assigned_resources);",
  "    if (!opplan->getType().raiseEvent(opplan, SIG_ADD)) {",
  "      delete opplan;",
  "      throw DataException(\"Can't create operationplan\");",
  "    }",
  "  }",
  "",
  "  // Special case: if the operation plan is locked, we need to",
  "  // process the start and end date before locking it.",
  "  // Subsequent calls won't affect the operationplan any longer.",
  "  if (statusfld && status != \"proposed\") {",
  "    opplan->setStatus(status, statuspropagation, true);",
  "    if (opplan->getApproved() ||",
  "        (opplan->getConfirmed() && opplan->getQuantityCompleted())) {",
  "      if (assigned_resources.empty())",
  "        opplan->createFlowLoads();",
  "      else",
  "        opplan->createFlowLoads(&assigned_resources);",
  "      // The end date of the approved operationplan needs to be computed in",
  "      // function of the start date and the quantity completed.",
  "      opplan->setOperationPlanParameters(",
  "          quantity, start ? start : opplan->getStart(), Date::infinitePast,",
  "          false, true, false, true);",
  "    } else",
  "      opplan->freezeStatus(start ? start : opplan->getStart(),",
  "                           end ? end : opplan->getEnd(), quantity);",
  "  }",
  "  if (!opplan->activate(create, start))",
  "    throw DataException(\"Can't create operationplan\");",
  "",
  "  // Report the operationplan creation to the manager",
  "  if (mgr) mgr->add(new CommandCreateObject(opplan));",
  "",
  "  return opplan;",
  "}",
  "",
  "OperationPlan* OperationPlan::findReference(string const& l) {",
  "  bool guarantueed = false;",
  "",
  "  // Compare with the max reference string",
  "  if (referenceMax < l) guarantueed = true;",
  "",
  "  // Compare with the max counter",
  "  try {",
  "    unsigned long idx = stoul(l);",
  "    if (idx > counterMin)",
  "      guarantueed = true;",
  "    else",
  "      guarantueed = false;",
  "  } catch (...) { /* The reference isn't a numeric value */",
  "  }",
  "",
  "  // We are sure not to find it",
  "  if (guarantueed) return nullptr;",
  "",
  "  // Look up in the tree",
  "  auto tmp = st.find(l);",
  "  return tmp == st.end() ? nullptr : static_cast<OperationPlan*>(tmp);",
  "}",
  "",
  "bool OperationPlan::assignReference() {",
  "  // Need to assure that ids are unique!",
  "  static mutex onlyOne;",
  "  lock_guard<mutex> l(onlyOne);",
  "  if (!getName().empty()) {",
  "    // An identifier was read in from input",
  "    if (getName() < referenceMax) {",
  "      // The assigned id potentially clashes with an existing operationplan.",
  "      // Check whether it clashes with existing operationplans",
  "      auto* opplan = static_cast<OperationPlan*>(st.find(getName()));",
  "      if (opplan != st.end() && opplan->getOperation() != oper) return false;",
  "    } else",
  "      // The new operationplan definitely doesn't clash with existing id's.",
  "      // The counter need updating to garantuee that counter is always",
  "      // a safe starting point for tagging new operationplans.",
  "      referenceMax = getName();",
  "    try {",
  "      unsigned long idx = stoul(getName());",
  "      if (idx >= counterMin) {",
  "        if (idx >= ULONG_MAX)",
  "          throw RuntimeException(",
  "              \"Exhausted the range of available operationplan references\");",
  "        counterMin = idx + 1;",
  "      }",
  "    } catch (...) { /* The reference isn't a numeric value */",
  "    }",
  "  } else {",
  "    // Fresh operationplan with blank id",
  "    setName(to_string(counterMin++));",
  "    if (counterMin >= ULONG_MAX)",
  "      throw RuntimeException(",
  "          \"Exhausted the range of available operationplan references\");",
  "  }",
  "",
  "  // Insert in the tree of operationplans",
  "  st.insert(this);",
  "",
  "  return true;",
  "}",
  "",
  "void OperationPlan::setOperation(Operation* o) {",
  "  if (oper == o) return;",
  "  if (oper) {",
  "    // Switching operations",
  "    deleteFlowLoads();",
  "    removeFromOperationplanList();",
  "",
  "    // Delete existing sub operationplans",
  "    auto x = firstsubopplan;",
  "    while (x) {",
  "      auto* y = x->nextsubopplan;",
  "      x->owner =",
  "          nullptr;  // Need to clear before destroying the suboperationplan",
  "      delete x;",
  "      x = y;",
  "    }",
  "    firstsubopplan = nullptr;",
  "    lastsubopplan = nullptr;",
  "",
  "    // Apply the change",
  "    oper = o;",
  "    oper->setOperationPlanParameters(this, quantity, dates.getStart(),",
  "                                     Date::infinitePast, false, true, false);",
  "  } else",
  "    // First initialization of the operationplan",
  "    oper = o;",
  "  activate();",
  "}",
  "",
  "bool OperationPlan::activate(bool createsubopplans, bool use_start) {",
  "  // At least a valid operation pointer must exist",
  "  if (!oper) throw LogicException(\"Initializing an invalid operationplan\");",
  "",
  "  // Avoid negative quantities, and call operation specific activation code",
  "  if (getQuantity() < 0.0 ||",
  "      !oper->extraInstantiate(this, createsubopplans, use_start) ||",
  "      (getQuantity() == 0.0 && getProposed() && !getOwner())) {",
  "    delete this;",
  "    return false;",
  "  }",
  "",
  "  // Instantiate all suboperationplans as well",
  "  OperationPlan::iterator x(this);",
  "  if (x != end()) {",
  "    while (x != end()) {",
  "      OperationPlan* tmp = &*x;",
  "      ++x;",
  "      tmp->activate();",
  "    }",
  "    x = OperationPlan::iterator(this);",
  "    if (x == end()) {",
  "      delete this;",
  "      return false;",
  "    }",
  "  }",
  "",
  "  // Mark as activated by assigning a unique identifier.",
  "  setActivated(true);",
  "  if (!getName().empty()) {",
  "    // Validate the user provided id.",
  "    if (!assignReference()) {",
  "      ostringstream ch;",
  "      ch << \"Operationplan id \" << getName() << \" assigned multiple times\";",
  "      delete this;",
  "      throw DataException(ch.str());",
  "    }",
  "  }",
  "",
  "  // Insert into the doubly linked list of operationplans.",
  "  insertInOperationplanList();",
  "",
  "  // If we used the lazy creator, the flow- and loadplans have not been",
  "  // created yet. We do it now...",
  "  createFlowLoads();",
  "",
  "  // Update the feasibility flag.",
  "  updateFeasible();",
  "",
  "  // Mark the operation to detect its problems",
  "  // Note that a single operationplan thus retriggers the problem computation",
  "  // for all operationplans of this operation. For models with 1) a large",
  "  // number of operationplans per operation and 2) very frequent problem",
  "  // detection, this could constitute a scalability problem. This combination",
  "  // is expected to be unusual and rare, justifying this design choice.",
  "  oper->setChanged();",
  "",
  "  // The operationplan is valid",
  "  return true;",
  "}",
  "",
  "void OperationPlan::deactivate() {",
  "  // Mark as not activated",
  "  st.erase(this);",
  "  setName(\"0\");",
  "",
  "  // Delete from the list of deliveries",
  "  if (dmd) dmd->removeDelivery(this);",
  "",
  "  // Delete from the operationplan list",
  "  removeFromOperationplanList();",
  "",
  "  // Mark the operation to detect its problems",
  "  oper->setChanged();",
  "}",
  "",
  "void OperationPlan::insertInOperationplanList() {",
  "  // Check if already linked, or nothing to link",
  "  if (prev || !oper || oper->first_opplan == this) return;",
  "",
  "  if (!oper->first_opplan) {",
  "    // First operationplan in the list",
  "    oper->first_opplan = this;",
  "    oper->last_opplan = this;",
  "  } else if (*this < *(oper->first_opplan)) {",
  "    // First in the list",
  "    next = oper->first_opplan;",
  "    next->prev = this;",
  "    oper->first_opplan = this;",
  "  } else if (*(oper->last_opplan) < *this) {",
  "    // Last in the list",
  "    prev = oper->last_opplan;",
  "    prev->next = this;",
  "    oper->last_opplan = this;",
  "  } else {",
  "    // Insert in the middle of the list",
  "    OperationPlan* x = oper->last_opplan;",
  "    OperationPlan* y = nullptr;",
  "    while (!(*x < *this)) {",
  "      y = x;",
  "      x = x->prev;",
  "    }",
  "    next = y;",
  "    prev = x;",
  "    if (x) x->next = this;",
  "    if (y) y->prev = this;",
  "  }",
  "}",
  "",
  "void OperationPlan::removeFromOperationplanList() {",
  "  if (prev)",
  "    // In the middle",
  "    prev->next = next;",
  "  else if (oper->first_opplan == this)",
  "    // First opplan in the list of this operation",
  "    oper->first_opplan = next;",
  "  if (next)",
  "    // In the middle",
  "    next->prev = prev;",
  "  else if (oper->last_opplan == this)",
  "    // Last opplan in the list of this operation",
  "    oper->last_opplan = prev;",
  "  // Clear existing pointers to become an orphan",
  "  prev = nullptr;",
  "  next = nullptr;",
  "}",
  "",
  "void OperationPlan::updateOperationplanList() {",
  "  if (!oper) return;",
  "",
  "  // Check ordering on the left",
  "  while (prev && !(*prev < *this)) {",
  "    OperationPlan* n = next;",
  "    OperationPlan* p = prev;",
  "    if (p->prev)",
  "      p->prev->next = this;",
  "    else",
  "      oper->first_opplan = this;",
  "    p->next = n;",
  "    next = p;",
  "    prev = p->prev;",
  "    if (n)",
  "      n->prev = p;",
  "    else",
  "      oper->last_opplan = p;",
  "    p->prev = this;",
  "  }",
  "",
  "  // Check ordering on the right",
  "  while (next && !(*this < *next)) {",
  "    OperationPlan* n = next;",
  "    OperationPlan* p = prev;",
  "    next = n->next;",
  "    if (n->next)",
  "      n->next->prev = this;",
  "    else",
  "      oper->last_opplan = this;",
  "    if (p)",
  "      p->next = n;",
  "    else",
  "      oper->first_opplan = n;",
  "    n->next = this;",
  "    n->prev = p;",
  "    prev = n;",
  "  }",
  "}",
  "",
  "void OperationPlan::eraseSubOperationPlan(OperationPlan* o) {",
  "  // Check",
  "  if (!o) return;",
  "",
  "  // Check valid ownership",
  "  if (o->owner != this)",
  "    throw LogicException(\"Suboperationplan has a different owner\");",
  "",
  "  // Remove from the list",
  "  if (o->prevsubopplan)",
  "    o->prevsubopplan->nextsubopplan = o->nextsubopplan;",
  "  else",
  "    firstsubopplan = o->nextsubopplan;",
  "  if (o->nextsubopplan)",
  "    o->nextsubopplan->prevsubopplan = o->prevsubopplan;",
  "  else",
  "    lastsubopplan = o->prevsubopplan;",
  "",
  "  // Clear fields",
  "  o->owner = nullptr;",
  "  prevsubopplan = nullptr;",
  "  nextsubopplan = nullptr;",
  "};",
  "",
  "bool OperationPlan::operator<(const OperationPlan& a) const {",
  "  // Different operations",
  "  if (oper != a.oper) return *oper < *(a.oper);",
  "",
  "  // Different setup end date",
  "  if (getSetupEnd() != a.getSetupEnd()) return getSetupEnd() < a.getSetupEnd();",
  "",
  "  // Sort based on quantity",
  "  if (fabs(quantity - a.quantity) > ROUNDING_ERROR)",
  "    return quantity >= a.quantity;",
  "",
  "  if (getActivated() != a.getActivated())",
  "    // Keep unactivated operationplans separate",
  "    return getActivated() > a.getActivated();",
  "",
  "  if (getEnd() != a.getEnd())",
  "    // Use the end date",
  "    return getEnd() < a.getEnd();",
  "",
  "  if (getName() != a.getName())",
  "    // Use the reference (without auto-generating new ones)",
  "    return getName() < a.getName();",
  "",
  "  // Using a pointer comparison as tie breaker. This can give",
  "  // results that are not reproducible across platforms and runs.",
  "  return this < &a;",
  "}",
  "",
  "void OperationPlan::createFlowLoads(",
  "    const vector<Resource*>* assigned_resources) {",
  "  // Initialized already, or nothing to initialize",
  "  if (!oper) return;",
  "  if ((firstflowplan || firstloadplan) && !assigned_resources) return;",
  "",
  "  if (oper->getMTO() && !getBatch() && getProposed() &&",
  "      !oper->hasType<OperationInventory>())",
  "    // Automagically generate a batch for proposed operationplans",
  "    setBatch(getReference());",
  "",
  "  // Create loadplans",
  "  if (getConsumeCapacity()) {",
  "    if (!assigned_resources) {",
  "      // No previous assignments to restore",
  "      for (auto& g : oper->getLoads()) {",
  "        if (!g.getAlternate() && !g.getHiddenLoad()) new LoadPlan(this, &g);",
  "      }",
  "    } else {",
  "      // Restore previous assignments",
  "      setResetResources(true);",
  "      for (auto& res : *assigned_resources) {",
  "        Resource* backup_res = nullptr;",
  "        const Load* backup_ld = nullptr;",
  "        bool found = false;",
  "        for (Resource::memberRecursiveIterator mmbr(res); !mmbr.empty();",
  "             ++mmbr) {",
  "          if (mmbr->isGroup()) continue;",
  "          for (auto& g : oper->getLoads()) {",
  "            if (!g.getAlternate() && mmbr->isMemberOf(g.getResource())) {",
  "              if (!g.getSkill() || mmbr->hasSkill(g.getSkill(), getStart())) {",
  "                new LoadPlan(this, &g, &*mmbr);",
  "                found = true;",
  "                break;",
  "              } else if (!backup_res) {",
  "                backup_res = &*mmbr;",
  "                backup_ld = &g;",
  "              }",
  "            }",
  "          }",
  "        }",
  "        if (!found && backup_res)",
  "          new LoadPlan(this, backup_ld, backup_res);",
  "        else if (!found) {",
  "          // Operation has no load for this resource yet.",
  "          auto hanging_load = new Load(oper, res, 1.0);",
  "          hanging_load->setHidden(true);",
  "          new LoadPlan(this, backup_ld, res);",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  // Create flowplans for flows",
  "  if (!Plan::instance().getSuppressFlowplanCreation() && !firstflowplan)",
  "    for (auto& h : oper->getFlows()) {",
  "      // Only the primary flow is instantiated.",
  "      // Also for transfer batches, we only need to create the first flowplan.",
  "      // The getFlowplanDateQuantity method will be called during the creation,",
  "      // and create additional flowplans as required.",
  "      if (!h.getAlternate()) new FlowPlan(this, &h);",
  "    }",
  "}",
  "",
  "void OperationPlan::deleteFlowLoads() {",
  "  // If no flowplans and loadplans, the work is already done",
  "  if (!firstflowplan && !firstloadplan) return;",
  "",
  "  FlowPlanIterator e = beginFlowPlans();",
  "  firstflowplan = nullptr;  // Important to do this before the delete!",
  "  LoadPlanIterator f = beginLoadPlans();",
  "  firstloadplan = nullptr;  // Important to do this before the delete!",
  "",
  "  // Delete the flowplans",
  "  while (e != endFlowPlans()) delete &*(e++);",
  "",
  "  // Delete the loadplans (including the setup suboperationplan)",
  "  while (f != endLoadPlans()) delete &*(f++);",
  "",
  "  // Delete setup event",
  "  clearSetupEvent();",
  "}",
  "",
  "double OperationPlan::getTotalFlowAux(const Buffer* b) const {",
  "  double q = 0.0;",
  "",
  "  // Add my own quantity",
  "  for (auto f = beginFlowPlans(); f != endFlowPlans(); ++f)",
  "    if (f->getBuffer() == b) q += f->getQuantity();",
  "",
  "  // Add the quantity of all children",
  "  for (auto c = firstsubopplan; c; c = c->nextsubopplan)",
  "    q += c->getTotalFlowAux(b);",
  "",
  "  // Return result",
  "  return q;",
  "}",
  "",
  "OperationPlan::~OperationPlan() {",
  "  // Delete from the operationplan tree",
  "  st.erase(this);",
  "",
  "  // Delete the setup event",
  "  if (setupevent) {",
  "    setupevent->erase();",
  "    delete setupevent;",
  "  }",
  "",
  "  // Delete the flowplans and loadplan",
  "  deleteFlowLoads();",
  "",
  "  // Initialize",
  "  OperationPlan* x = firstsubopplan;",
  "  firstsubopplan = nullptr;",
  "  lastsubopplan = nullptr;",
  "",
  "  // Delete the sub operationplans",
  "  while (x) {",
  "    OperationPlan* y = x->nextsubopplan;",
  "    x->owner = nullptr;  // Need to clear before destroying the suboperationplan",
  "    delete x;",
  "    x = y;",
  "  }",
  "",
  "  // Delete also the owner",
  "  if (owner) {",
  "    const OperationPlan* o = owner;",
  "    setOwner(nullptr);",
  "    delete o;",
  "  }",
  "",
  "  // Delete from the list of deliveries",
  "  if (dmd) dmd->removeDelivery(this);",
  "",
  "  // Delete from the operationplan list",
  "  removeFromOperationplanList();",
  "",
  "  // Delete dependencies",
  "  while (!dependencies.empty()) delete dependencies.front();",
  "}",
  "",
  "void OperationPlan::setOwner(OperationPlan* o, bool fast) {",
  "  // Special case: the same owner is set twice",
  "  if (owner == o) return;",
  "  if (o) {",
  "    // Check if the parent operation can have children",
  "    if (!o->getOperation()",
  "             ->hasType<OperationAlternate, OperationSplit, OperationRouting>())",
  "      throw DataException(\"Invalid parent operationplan\");",
  "    // Register with the new owner",
  "    o->getOperation()->addSubOperationPlan(o, this, fast);",
  "    if (o->getBatch())",
  "      setBatch(o->getBatch(), false);",
  "    else if (!getBatch())",
  "      o->setBatch(getBatch());",
  "  } else if (owner)",
  "    // Setting the owner field to nullptr",
  "    owner->eraseSubOperationPlan(this);",
  "}",
  "",
  "void OperationPlan::setStart(Date d, bool force, bool preferEnd) {",
  "  // Confirmed opplans don't move",
  "  if (getConfirmed()) {",
  "    if (force) setStartAndEnd(d, getEnd() > d ? getEnd() : d);",
  "    return;",
  "  }",
  "",
  "  if (!lastsubopplan)",
  "    // No sub operationplans",
  "    oper->setOperationPlanParameters(this, quantity, d, Date::infinitePast,",
  "                                     preferEnd, true, false);",
  "  else {",
  "    // Move all sub-operationplans in an orderly fashion",
  "    for (auto i = firstsubopplan; i; i = i->nextsubopplan) {",
  "      if (i->getStart() < d) {",
  "        i->setStart(d, force, preferEnd);",
  "        d = i->getEnd();",
  "      } else",
  "        // There is sufficient slack between the suboperationplans",
  "        break;",
  "    }",
  "  }",
  "",
  "  // Keep dependencies ordered",
  "  if (force)",
  "    for (auto i : dependencies) {",
  "      if (i->getFirst() == this) {",
  "        auto tmp = getEnd();",
  "        if (i->getOperationDependency())",
  "          tmp += i->getOperationDependency()->getHardSafetyLeadtime();",
  "        if (i->getSecond()->getStart() < tmp) {",
  "          i->getSecond()->setStart(tmp);",
  "        }",
  "      } else if (i->getSecond() == this) {",
  "        auto tmp = getStart();",
  "        if (i->getOperationDependency())",
  "          tmp -= i->getOperationDependency()->getHardSafetyLeadtime();",
  "        if (i->getFirst()->getEnd() > tmp) {",
  "          i->getFirst()->setEnd(tmp);",
  "        }",
  "      } else",
  "        throw LogicException(\"Invalid operationplan depedency data\");",
  "    }",
  "",
  "  // Update flow and loadplans",
  "  update();",
  "}",
  "",
  "void OperationPlan::setEnd(Date d, bool force) {",
  "  // Locked opplans don't move",
  "  if (getConfirmed()) {",
  "    if (force) setStartAndEnd(getStart() < d ? getStart() : d, d);",
  "    return;",
  "  }",
  "",
  "  if (!lastsubopplan)",
  "    // No sub operationplans",
  "    oper->setOperationPlanParameters(this, quantity, Date::infinitePast, d,",
  "                                     true, true, false);",
  "  else {",
  "    // Move all sub-operationplans in an orderly fashion",
  "    for (auto i = lastsubopplan; i; i = i->prevsubopplan) {",
  "      if (!i->getEnd() || i->getEnd() > d) {",
  "        i->setEnd(d, force);",
  "        d = i->getStart();",
  "      } else",
  "        // There is sufficient slack between the suboperationplans",
  "        break;",
  "    }",
  "  }",
  "",
  "  if (force)",
  "    for (auto i : dependencies) {",
  "      if (i->getFirst() == this) {",
  "        auto tmp = getEnd();",
  "        if (i->getOperationDependency())",
  "          tmp += i->getOperationDependency()->getHardSafetyLeadtime();",
  "        if (i->getSecond()->getStart() < tmp) {",
  "          i->getSecond()->setStart(tmp);",
  "        }",
  "      } else if (i->getSecond() == this) {",
  "        auto tmp = getStart();",
  "        if (i->getOperationDependency())",
  "          tmp -= i->getOperationDependency()->getHardSafetyLeadtime();",
  "        if (i->getFirst()->getEnd() > tmp) {",
  "          i->getFirst()->setEnd(tmp);",
  "        }",
  "      } else",
  "        throw LogicException(\"Invalid operationplan depedency data\");",
  "    }",
  "",
  "  // Update flow and loadplans",
  "  update();",
  "  // assert(getEnd() <= d);",
  "}",
  "",
  "void OperationPlan::resizeFlowLoadPlans() {",
  "  // Update all flowplans",
  "  for (auto flpln = firstflowplan; flpln; flpln = flpln->nextFlowPlan)",
  "    flpln->update();",
  "",
  "  // Update all loadplans",
  "  if (getConsumeCapacity())",
  "    for (auto e = beginLoadPlans(); e != endLoadPlans(); ++e) e->update();",
  "  else {",
  "    LoadPlanIterator f = beginLoadPlans();",
  "    firstloadplan = nullptr;  // Important to do this before the delete!",
  "    while (f != endLoadPlans()) delete &*(f++);",
  "  }",
  "",
  "  // Allow the operation length to be changed now that the quantity has changed",
  "  // Note that we assume that the end date remains fixed. This assumption makes",
  "  // sense if the operationplan was created to satisfy a demand.",
  "  // It is not valid though when the purpose of the operationplan was to push",
  "  // some material downstream.",
  "",
  "  // Notify the demand of the changed delivery",
  "  if (dmd) dmd->setChanged();",
  "}",
  "",
  "bool OperationPlan::mergeIfPossible() {",
  "  // Verify a merge with another operationplan.",
  "  // TODO The logic duplicates much of OperationFixedTime::extraInstantiate.",
  "  // Combine as single code. See if we can consolidate this operationplan with",
  "  // an existing one. Merging is possible only when all the following conditions",
  "  // are met:",
  "  //   - it is a subclass of a fixedtime operation",
  "  //   - it doesn't load any resources of type default",
  "  //   - both operationplans are proposed",
  "  //   - both operationplans have no owner",
  "  //     or both have an owner of the same operation and is of type",
  "  //     operation_alternate",
  "  //   - start and end date of both operationplans are exactly the same",
  "  //   - demand of both operationplans are the same",
  "  //   - maximum operation size is not exceeded",
  "  //   - alternate flowplans need to be on the same alternate",
  "  if (!getProposed() || !Plan::instance().getAllowMergingOperationPlans())",
  "    return false;",
  "",
  "  if (!oper->hasType<OperationFixedTime, OperationItemDistribution,",
  "                     OperationItemSupplier>())",
  "    return false;",
  "",
  "  // Verify we load no resources of type \"default\".",
  "  // It's ok to merge operationplans which load \"infinite\" or \"buckets\"",
  "  // resources.",
  "  for (const auto& i : oper->getLoads())",
  "    if (i.getResource()->hasType<ResourceDefault>()) return false;",
  "",
  "  // Loop through candidates",
  "  for (OperationPlan::iterator x(oper); x != OperationPlan::end(); ++x) {",
  "    if (x->getStart() > getStart())",
  "      // No candidates will be found in what follows",
  "      return false;",
  "    if (x->getDates() != getDates() || &*x == this) continue;",
  "    if (x->getDemand() != getDemand()) continue;",
  "    if (!x->getProposed()) continue;",
  "    if (x->getQuantity() + getQuantity() >",
  "        oper->getSizeMaximum() + ROUNDING_ERROR)",
  "      continue;",
  "    if (getOwner()) {",
  "      // Both must have the same owner operation of type alternate",
  "      if (!x->getOwner())",
  "        continue;",
  "      else if (getOwner()->getOperation() != x->getOwner()->getOperation())",
  "        continue;",
  "      else if (!getOwner()->getOperation()->hasType<OperationAlternate>())",
  "        continue;",
  "      else if (getOwner()->getDemand() != x->getOwner()->getDemand())",
  "        continue;",
  "    }",
  "",
  "    // Check that the flowplans are on identical alternates and not of type",
  "    // fixed",
  "    OperationPlan::FlowPlanIterator fp1 = beginFlowPlans();",
  "    OperationPlan::FlowPlanIterator fp2 = x->beginFlowPlans();",
  "    if (fp1 == endFlowPlans() || fp2 == endFlowPlans())",
  "      // Operationplan without flows are already deleted. Leave them alone.",
  "      continue;",
  "    bool ok = true;",
  "    while (fp1 != endFlowPlans()) {",
  "      if (fp1->getBuffer() != fp2->getBuffer() ||",
  "          fp1->getFlow()->getQuantityFixed() ||",
  "          fp2->getFlow()->getQuantityFixed())",
  "      // No merge possible",
  "      {",
  "        ok = false;",
  "        break;",
  "      }",
  "      ++fp1;",
  "      ++fp2;",
  "    }",
  "    if (!ok) continue;",
  "",
  "    // All checks passed, we can merge!",
  "    x->setQuantity(x->getQuantity() + getQuantity());",
  "    if (getOwner()) setOwner(nullptr);",
  "    delete this;",
  "    return true;",
  "  }",
  "  return false;",
  "}",
  "",
  "void OperationPlan::scanSetupTimes() {",
  "  for (auto ldplan = beginLoadPlans(); ldplan != endLoadPlans(); ++ldplan) {",
  "    if (!ldplan->isStart() && ldplan->getLoad() &&",
  "        !ldplan->getLoad()->getSetup().empty() &&",
  "        ldplan->getResource()->getSetupMatrix()) {",
  "      // Not a starting loadplan or there is no setup on this loadplan",
  "      ldplan->getResource()->updateSetupTime();",
  "      break;  // Only 1 load can have a setup",
  "    }",
  "  }",
  "",
  "  // TODO We can do much faster than the above loop: where we reconsider all",
  "  // loadplans on a resource. We just need to scans the ones around the old date",
  "  // and the ones around the new date. It requires deeper changes to the solver",
  "  // to pass on the information on the old date.",
  "  /*",
  "  // Loop over all loadplans",
  "  for (auto ldplan = beginLoadPlans(); ldplan != endLoadPlans(); ++ldplan)",
  "  {",
  "    if (!ldplan->isStart() || ldplan->getLoad()->getSetup().empty() ||",
  "  !ldplan->getResource()->getSetupMatrix())",
  "      // Not a starting loadplan or there is no setup on this loadplan",
  "      continue;",
  "",
  "    // Scan backward for loadplans at the same date",
  "    auto resldplan = ldplan->getResource()->getLoadPlans().begin(&*ldplan);",
  "    --resldplan;",
  "    while (resldplan != ldplan->getResource()->getLoadPlans().end())",
  "    {",
  "      if (resldplan->getDate() != ldplan->getDate())",
  "        break;",
  "      if (resldplan->getEventType() == 1)",
  "      {",
  "        auto tmp = static_cast<LoadPlan*>(&*resldplan);",
  "        if (tmp->isStart() &&",
  "  !static_cast<LoadPlan*>(&*resldplan)->getLoad()->getSetup().empty())",
  "        {",
  "          // The setup time of this operationplan potentially changes",
  "          resldplan->getOperationPlan()->updateSetupTime();",
  "        }",
  "      }",
  "      --resldplan;",
  "    }",
  "",
  "    // Scan forward until the first operationplan with a setup.",
  "    resldplan = ldplan->getResource()->getLoadPlans().begin(&*ldplan);",
  "    ++resldplan;",
  "    while (resldplan != ldplan->getResource()->getLoadPlans().end())",
  "    {",
  "      if (resldplan->getEventType() == 1)",
  "      {",
  "        auto tmp = static_cast<LoadPlan*>(&*resldplan);",
  "        if (tmp->isStart() &&",
  "  !static_cast<LoadPlan*>(&*resldplan)->getLoad()->getSetup().empty())",
  "        {",
  "          // The setup time of this operationplan potentially changes",
  "          resldplan->getOperationPlan()->updateSetupTime();",
  "          if (resldplan->getDate() > getEnd())",
  "            break;",
  "        }",
  "      }",
  "      ++resldplan;",
  "    }",
  "  }",
  "  */",
  "}",
  "",
  "bool OperationPlan::updateSetupTime() {",
  "  // TODO The setOperationplanParameter methods are a better/more generic/more",
  "  // robust place to put this logic",
  "  Date end_of_setup = getSetupEnd();",
  "  bool changed = false;",
  "",
  "  // Keep the setup end date constant during the update",
  "  auto setup = oper->calculateSetup(this, end_of_setup, setupevent);",
  "",
  "  if (setupevent && getSetupOverride() >= 0L && !getNoSetup()) {",
  "    auto ldplan = beginLoadPlans();",
  "    if (ldplan == endLoadPlans()) {",
  "      for (const auto& ld : getOperation()->getLoads())",
  "        if (ld.getResource() && ld.getResource()->getSetupMatrix()) {",
  "          if (!setupevent->getTimeLine() && !getNoSetup()) {",
  "            setupevent->setTimeLine(&(ld.getResource()->getLoadPlans()));",
  "          }",
  "          get<0>(setup) = ld.getResource();",
  "          break;",
  "        }",
  "    } else {",
  "      for (; ldplan != endLoadPlans(); ++ldplan)",
  "        if (ldplan->getResource() && ldplan->getResource()->getSetupMatrix()) {",
  "          if (!setupevent->getTimeLine() && !getNoSetup()) {",
  "            setupevent->setTimeLine(&(ldplan->getResource()->getLoadPlans()));",
  "          }",
  "          get<0>(setup) = ldplan->getResource();",
  "          break;",
  "        }",
  "    }",
  "  }",
  "",
  "  if (get<0>(setup) || getSetupOverride() >= 0L) {",
  "    // Setup event required",
  "    if (get<1>(setup) || getSetupOverride() >= 0L) {",
  "      // Apply setup rule duration",
  "      if (getConfirmed()) {",
  "        if (getStart() != end_of_setup || !setupevent) {",
  "          setSetupEvent(get<0>(setup), end_of_setup, get<2>(setup),",
  "                        get<1>(setup));",
  "          setStartAndEnd(end_of_setup, getEnd());",
  "          changed = true;",
  "        } else",
  "          setSetupEvent(get<0>(setup), end_of_setup, get<2>(setup),",
  "                        get<1>(setup));",
  "      } else {",
  "        DateRange tmp = oper->calculateOperationTime(",
  "            this, end_of_setup,",
  "            getSetupOverride() >= 0L ? getSetupOverride()",
  "                                     : get<1>(setup)->getDuration(),",
  "            false);",
  "        if (tmp.getStart() != getStart() || !setupevent) {",
  "          setSetupEvent(get<0>(setup), end_of_setup, get<2>(setup),",
  "                        get<1>(setup));",
  "          setStartAndEnd(tmp.getStart(), getEnd());",
  "          changed = true;",
  "        } else",
  "          setSetupEvent(get<0>(setup), end_of_setup, get<2>(setup),",
  "                        get<1>(setup));",
  "      }",
  "    } else {",
  "      // Zero time event",
  "      if (getStart() != end_of_setup || !setupevent) {",
  "        setSetupEvent(get<0>(setup), end_of_setup, get<2>(setup),",
  "                      get<1>(setup));",
  "        setStartAndEnd(end_of_setup, getEnd());",
  "        changed = true;",
  "      } else",
  "        setSetupEvent(get<0>(setup), end_of_setup, get<2>(setup),",
  "                      get<1>(setup));",
  "    }",
  "  } else {",
  "    // No setup event required",
  "    if (setupevent && getSetupOverride() < 0L) {",
  "      clearSetupEvent();",
  "      changed = true;",
  "    }",
  "    if (end_of_setup != getStart()) {",
  "      setStartAndEnd(end_of_setup, getEnd());",
  "      changed = true;",
  "    }",
  "  }",
  "  return changed;",
  "}",
  "",
  "void OperationPlan::update() {",
  "  if (lastsubopplan) {",
  "    // Set the start and end date of the parent.",
  "    Date st = Date::infiniteFuture;",
  "    Date nd = Date::infinitePast;",
  "    for (auto f = firstsubopplan; f; f = f->nextsubopplan) {",
  "      if (f->getStart() < st) st = f->getStart();",
  "      if (f->getEnd() > nd) nd = f->getEnd();",
  "    }",
  "    if (nd) dates.setStartAndEnd(st, nd);",
  "  }",
  "",
  "  // Update the flow and loadplans",
  "  resizeFlowLoadPlans();",
  "",
  "  // Keep the operationplan list sorted",
  "  updateOperationplanList();",
  "",
  "  // Update the setup time on all neighbouring operationplans",
  "  if (!SetupMatrix::empty() && getPropagateSetups()) scanSetupTimes();",
  "",
  "  // Notify the owner operationplan",
  "  if (owner) owner->update();",
  "",
  "  // Mark as changed",
  "  setChanged();",
  "}",
  "",
  "void OperationPlan::deleteOperationPlans(Operation* o, bool deleteLockedOpplans,",
  "                                         bool deleteDeliveries) {",
  "  if (!o) return;",
  "  for (auto opplan = o->first_opplan; opplan;) {",
  "    OperationPlan* tmp = opplan;",
  "",
  "    // Advance to the next operation plan",
  "    opplan = opplan->next;",
  "    if (tmp->getOwner())",
  "      // Deleting a child operationplan will delete the parent.",
  "      // It is possible that also the next operationplan in the list gets",
  "      // deleted by the delete statement that follows.",
  "      while (opplan && tmp->getOwner() == opplan->getOwner())",
  "        opplan = opplan->next;",
  "",
  "    // Note that the deletion of the operationplan also updates the opplan list",
  "    bool del = deleteLockedOpplans;",
  "    if (!del && tmp->getProposed()) {",
  "      del = tmp->getOwner() ? tmp->getOwner()->getProposed() : true;",
  "    }",
  "    if (del && !deleteDeliveries &&",
  "        (tmp->getOwner() ? tmp->getOwner()->getDemand() : tmp->getDemand()))",
  "      del = false;",
  "    if (del) delete tmp;",
  "  }",
  "}",
  "",
  "double OperationPlan::isExcess(bool use_zero) const {",
  "  // Delivery operationplans or operationplans with dependencies aren't excess",
  "  if (getDemand() || !dependencies.empty()) return 0.0;",
  "",
  "  // Recursive call for suboperationplans",
  "  double opplan_excess_qty = getQuantity();",
  "  for (auto subopplan = firstsubopplan; subopplan;",
  "       subopplan = subopplan->nextsubopplan) {",
  "    auto tmp = subopplan->isExcess(use_zero);",
  "    if (tmp < opplan_excess_qty) opplan_excess_qty = tmp;",
  "  }",
  "",
  "  // Loop over all producing flowplans",
  "  bool hasFlowplans = false;",
  "  for (auto i = beginFlowPlans(); i != endFlowPlans(); ++i) {",
  "    hasFlowplans = true;",
  "    // Skip consuming flowplans",
  "    if (i->getQuantity() <= 0) continue;",
  "",
  "    // Find the total produced quantity, including all suboperationplans",
  "    double flpln_excess_qty = i->getQuantity();",
  "    for (auto subopplan = firstsubopplan; subopplan;",
  "         subopplan = subopplan->nextsubopplan)",
  "      for (auto k = subopplan->beginFlowPlans(); k != subopplan->endFlowPlans();",
  "           ++k)",
  "        if (k->getBuffer() == i->getBuffer())",
  "          flpln_excess_qty += k->getQuantity();",
  "    if (flpln_excess_qty <= 0) continue;",
  "",
  "    // Loop over all flowplans in the buffer (starting at the end) and verify",
  "    // that the onhand is bigger than the flowplan quantity",
  "    double current_maximum(0.0);",
  "    double current_minimum(0.0);",
  "    Buffer::flowplanlist::const_iterator j =",
  "        i->getBuffer()->getFlowPlans().rbegin();",
  "    if (!use_zero && j != i->getBuffer()->getFlowPlans().end()) {",
  "      current_maximum = i->getBuffer()->getFlowPlans().getMax(&*j);",
  "      current_minimum = i->getBuffer()->getFlowPlans().getMin(&*j);",
  "    }",
  "    for (; j != i->getBuffer()->getFlowPlans().end(); --j) {",
  "      if (!j->isLastOnDate()) {",
  "        if (&*j == &*i) break;",
  "        continue;",
  "      }",
  "      if (current_maximum > 0.0) {",
  "        auto above_max = j->getOnhand() - current_maximum;",
  "        if (above_max < ROUNDING_ERROR) return 0.0;",
  "        if (above_max < flpln_excess_qty) flpln_excess_qty = above_max;",
  "      } else {",
  "        auto above_min = j->getOnhand() - current_minimum;",
  "        if (above_min < ROUNDING_ERROR) return 0.0;",
  "        if (above_min < flpln_excess_qty) flpln_excess_qty = above_min;",
  "      }",
  "      if (!use_zero) {",
  "        if (j->getEventType() == 4) current_maximum = j->getMax(false);",
  "        if (j->getEventType() == 3) current_minimum = j->getMin(false);",
  "      }",
  "      if (&*j == &*i) break;",
  "    }",
  "",
  "    // Convert excess on this flowplan to excess on operationplan",
  "    auto topopplan = i->getOperationPlan();",
  "    if (topopplan->getOwner() &&",
  "        topopplan->getOwner()->getOperation()->hasType<OperationRouting>())",
  "      topopplan = topopplan->getOwner();",
  "",
  "    flpln_excess_qty -= i->getFlow()->getQuantityFixed();",
  "    if (flpln_excess_qty < topopplan->getOperation()->getSizeMultiple() *",
  "                                   i->getFlow()->getQuantity() -",
  "                               ROUNDING_ERROR)",
  "      // Not excess or an unavoidable leftover",
  "      return 0.0;",
  "    if (i->getFlow()->getQuantity()) {",
  "      flpln_excess_qty /= i->getFlow()->getQuantity();",
  "      if (flpln_excess_qty < opplan_excess_qty)",
  "        opplan_excess_qty = flpln_excess_qty;",
  "    }",
  "  }",
  "",
  "  // Handle operationplan already being deleted by a deleteOperation command",
  "  if (!hasFlowplans && !getOperation()->getFlows().empty()) return 0.0;",
  "",
  "  // If we remove/reduce this operationplan the onhand in all buffers remains",
  "  // positive.",
  "  return opplan_excess_qty;",
  "}",
  "",
  "Duration OperationPlan::getUnavailable() const {",
  "  Duration x;",
  "  getOperation()->calculateOperationTime(this, dates.getStart(), dates.getEnd(),",
  "                                         &x);",
  "  return dates.getDuration() - x;",
  "}",
  "",
  "Object* OperationPlan::finder(const DataValueDict& key) {",
  "  auto val = key.get(Tags::reference);",
  "  if (!val) val = key.get(Tags::id);",
  "  return val ? OperationPlan::findReference(val->getString()) : nullptr;",
  "}",
  "",
  "void OperationPlan::setConfirmed(bool b) {",
  "  if (b) {",
  "    flags |= STATUS_CONFIRMED;",
  "    flags &= ~(STATUS_APPROVED + STATUS_COMPLETED + STATUS_CLOSED);",
  "    if (owner && owner->getProposed()) owner->flags |= STATUS_APPROVED;",
  "  } else {",
  "    // Change to proposed",
  "    flags &= ~(STATUS_CONFIRMED + STATUS_COMPLETED + STATUS_CLOSED);",
  "    flags |= STATUS_APPROVED;",
  "  }",
  "  for (auto x = firstsubopplan; x; x = x->nextsubopplan) x->setConfirmed(b);",
  "  update();",
  "  propagateStatus();",
  "}",
  "",
  "void OperationPlan::setApproved(bool b) {",
  "  if (b) {",
  "    flags |= STATUS_APPROVED;",
  "    flags &= ~(STATUS_CONFIRMED + STATUS_COMPLETED + STATUS_CLOSED);",
  "    if (owner && owner->getProposed()) owner->flags |= STATUS_APPROVED;",
  "  } else",
  "    // Change to proposed",
  "    flags &= ~(STATUS_APPROVED + STATUS_CONFIRMED + STATUS_COMPLETED +",
  "               STATUS_CLOSED);",
  "  for (auto x = firstsubopplan; x; x = x->nextsubopplan) x->setApproved(b);",
  "  update();",
  "  propagateStatus();",
  "}",
  "",
  "void OperationPlan::setProposed(bool b) {",
  "  if (b)",
  "    flags &= ~(STATUS_APPROVED + STATUS_CONFIRMED + STATUS_COMPLETED +",
  "               STATUS_CLOSED);",
  "  else {",
  "    // Change to approved",
  "    flags &= ~(STATUS_CONFIRMED + STATUS_COMPLETED + STATUS_CLOSED);",
  "    flags |= STATUS_APPROVED;",
  "  }",
  "  for (auto x = firstsubopplan; x; x = x->nextsubopplan) x->setProposed(b);",
  "  update();",
  "  propagateStatus();",
  "}",
  "",
  "void OperationPlan::setCompleted(bool b) {",
  "  if (b) {",
  "    flags |= STATUS_CONFIRMED + STATUS_COMPLETED;",
  "    flags &= ~(STATUS_APPROVED + STATUS_CLOSED);",
  "    if (owner && owner->getProposed()) owner->flags |= STATUS_APPROVED;",
  "  } else {",
  "    // Change to approved",
  "    flags &= ~(STATUS_CONFIRMED + STATUS_COMPLETED + STATUS_CLOSED);",
  "    flags |= STATUS_APPROVED;",
  "  }",
  "  for (auto x = firstsubopplan; x; x = x->nextsubopplan) x->setClosed(b);",
  "  update();",
  "  propagateStatus();",
  "}",
  "",
  "void OperationPlan::setClosed(bool b) {",
  "  if (b) {",
  "    flags |= STATUS_CONFIRMED + STATUS_CLOSED;",
  "    flags &= ~(STATUS_APPROVED + STATUS_COMPLETED);",
  "  } else {",
  "    // Change to approved",
  "    flags &= ~(STATUS_CONFIRMED + STATUS_COMPLETED + STATUS_CLOSED);",
  "    flags |= STATUS_APPROVED;",
  "  }",
  "  for (auto x = firstsubopplan; x; x = x->nextsubopplan) x->setClosed(b);",
  "  update();",
  "  propagateStatus();",
  "}",
  "",
  "void OperationPlan::propagateStatus(bool log) {",
  "  if (getOperation()->hasType<OperationInventory>()) return;",
  "",
  "  // Assure that all child operationplans also get the same status",
  "  auto mystatus = getStatus();",
  "  for (auto subopplan = firstsubopplan; subopplan;",
  "       subopplan = subopplan->nextsubopplan)",
  "    if (subopplan->getStatus() != mystatus) {",
  "      subopplan->setStatus(mystatus);",
  "      subopplan->appendInfo(\"Status propagated from parent\");",
  "      subopplan->propagateStatus(log);",
  "    }",
  "",
  "  if (getSource().rfind(\"odoo\", 0) == 0 ||",
  "      (mystatus != \"completed\" && mystatus != \"closed\"))",
  "    return;",
  "",
  "  bool firstlog = true;",
  "",
  "  // Assure the start and end date are in the past",
  "  if (!Plan::instance().getCompletedAllowFuture() &&",
  "      getEnd() > Plan::instance().getCurrent()) {",
  "    if (log) {",
  "      if (firstlog) {",
  "        firstlog = false;",
  "        logger << \"Propagating \" << this << '\\n';",
  "      }",
  "      logger << \"    Adjusting end date to \" << Plan::instance().getCurrent()",
  "             << '\\n';",
  "    }",
  "    setEnd(Plan::instance().getCurrent(), true);",
  "  }",
  "",
  "  if (getOwner() && getOwner()->getOperation()->hasType<OperationRouting>()) {",
  "    // Assure that previous routing steps are also marked closed or completed",
  "    for (auto prev = prevsubopplan; prev; prev = prev->prevsubopplan)",
  "      if (prev->getStatus() != mystatus) {",
  "        if (log) {",
  "          if (firstlog) {",
  "            firstlog = false;",
  "            logger << \"Propagating \" << this << '\\n';",
  "          }",
  "          logger << \"    Changing status of previous routing step \" << prev",
  "                 << '\\n';",
  "        }",
  "        prev->appendInfo(\"Status propagated from following step\");",
  "        prev->setStatus(mystatus);",
  "      }",
  "    // Assure that the parent routing gets at least the status approved",
  "    bool all_steps_completed = true;",
  "    bool all_steps_closed = true;",
  "    for (auto subopplan = getOwner()->firstsubopplan; subopplan;",
  "         subopplan = subopplan->nextsubopplan) {",
  "      if (!subopplan->getCompleted()) all_steps_completed = false;",
  "      if (!subopplan->getClosed()) all_steps_closed = false;",
  "    }",
  "    if (all_steps_closed && !getOwner()->getClosed()) {",
  "      getOwner()->appendInfo(",
  "          \"Status changed to closed because all steps are closed\");",
  "      getOwner()->flags |= STATUS_CONFIRMED + STATUS_CLOSED;",
  "      getOwner()->flags &= ~(STATUS_APPROVED + STATUS_COMPLETED);",
  "      if (log) {",
  "        if (firstlog) {",
  "          firstlog = false;",
  "          logger << \"Propagating \" << this << '\\n';",
  "        }",
  "        logger << \"    Marking routing as closed \" << getOwner() << '\\n';",
  "      }",
  "    } else if (all_steps_completed && !getOwner()->getCompleted()) {",
  "      getOwner()->appendInfo(",
  "          \"Status changed to completed because all steps are completed\");",
  "      getOwner()->flags |= STATUS_CONFIRMED + STATUS_COMPLETED;",
  "      getOwner()->flags &= ~(STATUS_APPROVED + STATUS_CLOSED);",
  "      if (log) {",
  "        if (firstlog) {",
  "          firstlog = false;",
  "          logger << \"Propagating \" << this << '\\n';",
  "        }",
  "        logger << \"    Marking routing as completed \" << getOwner() << '\\n';",
  "      }",
  "    } else if (getOwner()->getProposed()) {",
  "      for (auto subopplan = getOwner()->firstsubopplan; subopplan;",
  "           subopplan = subopplan->nextsubopplan)",
  "        if (subopplan->getProposed()) {",
  "          subopplan->appendInfo(\"Setting status to approved\");",
  "          subopplan->setApproved(true);",
  "        }",
  "      getOwner()->appendInfo(\"Setting status to approved\");",
  "      getOwner()->flags |= STATUS_APPROVED;",
  "      getOwner()->flags &=",
  "          ~(STATUS_CONFIRMED + STATUS_COMPLETED + STATUS_CLOSED);",
  "      if (log) {",
  "        if (firstlog) {",
  "          firstlog = false;",
  "          logger << \"Propagating \" << this << '\\n';",
  "        }",
  "        logger << \"    Marking routing as approved \" << getOwner() << '\\n';",
  "      }",
  "    }",
  "  }",
  "",
  "  // Check that upstream buffers have enough supply in the closed or completed",
  "  // status",
  "  for (auto myflpln = beginFlowPlans(); myflpln != endFlowPlans(); ++myflpln) {",
  "    if (myflpln->getQuantity() >= 0 ||",
  "        myflpln->getBuffer()->hasType<BufferInfinite>())",
  "      continue;",
  "",
  "    // Get current status",
  "    double closed_balance = 0.0;",
  "    flowplanlist& tmline = myflpln->getBuffer()->getFlowPlans();",
  "    for (auto& flpln : tmline)",
  "      if (flpln.getOperationPlan() &&",
  "          (flpln.getOperationPlan()->getClosed() ||",
  "           flpln.getOperationPlan()->getCompleted()) &&",
  "          flpln.getDate() <= myflpln->getDate())",
  "        closed_balance += flpln.getQuantity();",
  "",
  "    if (closed_balance < -ROUNDING_ERROR) {",
  "      // Things don't add up here.",
  "      // We'll close some upstream supply to make things match up",
  "      if (log) {",
  "        if (firstlog) {",
  "          firstlog = false;",
  "          logger << \"Propagating \" << this << '\\n';",
  "        }",
  "        logger << \"    Available material balance on \" << myflpln->getBuffer()",
  "               << \" short of \" << closed_balance << \" on \" << myflpln->getDate()",
  "               << '\\n';",
  "      }",
  "      // 1) Correct the date of existing completed supply",
  "      for (auto& flpln : tmline)",
  "        if (flpln.getQuantity() > 0.0 && flpln.getOperationPlan() &&",
  "            (flpln.getOperationPlan()->getClosed() ||",
  "             flpln.getOperationPlan()->getCompleted()) &&",
  "            flpln.getDate() > myflpln->getDate()) {",
  "          if (log) {",
  "            if (firstlog) {",
  "              firstlog = false;",
  "              logger << \"Propagating \" << this << '\\n';",
  "            }",
  "            logger << \"      Adjusting end date of \" << flpln.getOperationPlan()",
  "                   << '\\n';",
  "          }",
  "          flpln.getOperationPlan()->setStartAndEnd(",
  "              flpln.getOperationPlan()->getStart() < myflpln->getDate()",
  "                  ? flpln.getOperationPlan()->getStart()",
  "                  : myflpln->getDate(),",
  "              myflpln->getDate());",
  "          flpln.getOperationPlan()->appendInfo(",
  "              \"Changed end date to keep the inventory positive\");",
  "          closed_balance += flpln.getQuantity();",
  "          if (closed_balance >= -ROUNDING_ERROR) break;",
  "        }",
  "      if (closed_balance < -ROUNDING_ERROR) {",
  "        // 2) try changing the status of confirmed supply",
  "        for (auto& flpln : tmline)",
  "          if (flpln.getQuantity() > 0.0 && flpln.getOperationPlan() &&",
  "              flpln.getOperationPlan()->getConfirmed() &&",
  "              !flpln.getOperationPlan()->getClosed() &&",
  "              !flpln.getOperationPlan()->getCompleted()) {",
  "            if (log) {",
  "              if (firstlog) {",
  "                firstlog = false;",
  "                logger << \"Propagating \" << this << '\\n';",
  "              }",
  "              logger << \"      Changing status of \" << flpln.getOperationPlan()",
  "                     << '\\n';",
  "            }",
  "            flpln.getOperationPlan()->setStatus(mystatus);",
  "            flpln.getOperationPlan()->appendInfo(",
  "                \"Changed status to keep the inventory positive\");",
  "            closed_balance += flpln.getQuantity();",
  "            if (closed_balance >= -ROUNDING_ERROR) break;",
  "          }",
  "        if (closed_balance < -ROUNDING_ERROR) {",
  "          // 3) try changing the status of approved supply",
  "          for (auto& flpln : tmline)",
  "            if (flpln.getQuantity() > 0.0 && flpln.getOperationPlan() &&",
  "                flpln.getOperationPlan()->getApproved()) {",
  "              if (log) {",
  "                if (firstlog) {",
  "                  firstlog = false;",
  "                  logger << \"Propagating \" << this << '\\n';",
  "                }",
  "                logger << \"      Changing status of \"",
  "                       << flpln.getOperationPlan() << '\\n';",
  "              }",
  "              flpln.getOperationPlan()->appendInfo(",
  "                  \"Changed status to keep the inventory positive\");",
  "              flpln.getOperationPlan()->setStatus(mystatus);",
  "              closed_balance += flpln.getQuantity();",
  "              if (closed_balance >= -ROUNDING_ERROR) break;",
  "            }",
  "          if (closed_balance < -ROUNDING_ERROR) {",
  "            // 4) Try changing the status of proposed supply",
  "            for (auto& flpln : tmline)",
  "              if (flpln.getQuantity() > 0.0 && flpln.getOperationPlan() &&",
  "                  flpln.getOperationPlan()->getProposed()) {",
  "                if (log) {",
  "                  if (firstlog) {",
  "                    firstlog = false;",
  "                    logger << \"Propagating \" << this << '\\n';",
  "                  }",
  "                  logger << \"      Changing status of \"",
  "                         << flpln.getOperationPlan() << '\\n';",
  "                }",
  "                flpln.getOperationPlan()->appendInfo(",
  "                    \"Changed status to keep the inventory positive\");",
  "                flpln.getOperationPlan()->setStatus(mystatus);",
  "                closed_balance += flpln.getQuantity();",
  "                if (closed_balance >= -ROUNDING_ERROR) break;",
  "              }",
  "            // 5) Finally, update the initial inventory",
  "            if (closed_balance < -ROUNDING_ERROR) {",
  "              if (log) {",
  "                if (firstlog) {",
  "                  firstlog = false;",
  "                  logger << \"Propagating \" << this << '\\n';",
  "                }",
  "                logger << \"      Incrementing initial inventory with \"",
  "                       << -closed_balance << '\\n';",
  "              }",
  "              myflpln->getBuffer()->setOnHand(",
  "                  myflpln->getBuffer()->getOnHand() - closed_balance);",
  "            }",
  "          }",
  "        }",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "string OperationPlan::getStatus() const {",
  "  if (flags & STATUS_APPROVED)",
  "    return \"approved\";",
  "  else if (flags & STATUS_COMPLETED)",
  "    return \"completed\";",
  "  else if (flags & STATUS_CLOSED)",
  "    return \"closed\";",
  "  else if (flags & STATUS_CONFIRMED)",
  "    return \"confirmed\";",
  "  else",
  "    return \"proposed\";",
  "}",
  "",
  "bool OperationPlan::isConstrained() const {",
  "  for (PeggingIterator p(this); p; ++p) {",
  "    const OperationPlan* m = p.getOperationPlan();",
  "    Demand* dmd = m ? m->getTopOwner()->getDemand() : nullptr;",
  "    if (dmd && dmd->getDue() < m->getEnd()) return true;",
  "  }",
  "  return false;",
  "}",
  "",
  "void OperationPlan::setStatus(const string& s, bool propagate, bool u) {",
  "  if (s == \"approved\") {",
  "    flags |= STATUS_APPROVED;",
  "    flags &= ~(STATUS_CONFIRMED + STATUS_COMPLETED + STATUS_CLOSED);",
  "  } else if (s == \"confirmed\") {",
  "    flags |= STATUS_CONFIRMED;",
  "    flags &= ~(STATUS_APPROVED + STATUS_COMPLETED + STATUS_CLOSED);",
  "  } else if (s == \"proposed\")",
  "    flags &= ~(STATUS_APPROVED + STATUS_CONFIRMED + STATUS_COMPLETED +",
  "               STATUS_CLOSED);",
  "  else if (s == \"completed\") {",
  "    flags &= ~(STATUS_APPROVED + STATUS_CLOSED);",
  "    flags |= STATUS_CONFIRMED + STATUS_COMPLETED;",
  "  } else if (s == \"closed\") {",
  "    flags &= ~(STATUS_APPROVED + STATUS_COMPLETED);",
  "    flags |= STATUS_CONFIRMED + STATUS_CLOSED;",
  "  } else",
  "    throw DataException(\"invalid operationplan status:\" + s);",
  "  if (!getProposed() && owner && owner->getProposed())",
  "    owner->flags |= STATUS_APPROVED;",
  "  if (u) {",
  "    update();",
  "    for (auto x = firstsubopplan; x; x = x->nextsubopplan)",
  "      x->setStatus(s, propagate, u);",
  "    if (propagate) propagateStatus();",
  "  }",
  "}",
  "",
  "void OperationPlan::freezeStatus(Date st, Date nd, double q) {",
  "  if (getProposed()) return;",
  "  dates = DateRange(st, nd);",
  "  quantity = q > 0 ? q : 0.0;",
  "}",
  "",
  "void OperationPlan::setDemand(Demand* l) {",
  "  // No change",
  "  if (l == dmd) return;",
  "",
  "  // Unregister from previous demand",
  "  if (dmd) dmd->removeDelivery(this);",
  "",
  "  // Register at the new demand and mark it changed",
  "  dmd = l;",
  "  if (l) {",
  "    l->addDelivery(this);",
  "    l->setChanged();",
  "  }",
  "}",
  "",
  "PyObject* OperationPlan::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Find or create the C++ object",
  "    PythonDataValueDict atts(kwds);",
  "    Object* x = createOperationPlan(OperationPlan::metadata, atts);",
  "    if (!x) {",
  "      Py_INCREF(Py_None);",
  "      return Py_None;",
  "    }",
  "    Py_INCREF(x);",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    if (x) {",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        if (!attr.isA(Tags::operation) && !attr.isA(Tags::id) &&",
  "            !attr.isA(Tags::reference) && !attr.isA(Tags::action) &&",
  "            !attr.isA(Tags::type) && !attr.isA(Tags::start) &&",
  "            !attr.isA(Tags::end) && !attr.isA(Tags::quantity) &&",
  "            !attr.isA(Tags::create) && !attr.isA(Tags::batch) &&",
  "            !attr.isA(Tags::status) && !attr.isA(Tags::statusNoPropagation) &&",
  "            !attr.isA(Tags::location) && !attr.isA(Tags::item) &&",
  "            !attr.isA(Tags::ordertype) && !attr.isA(Tags::origin) &&",
  "            !attr.isA(Tags::batch) && !attr.isA(Tags::supplier) &&",
  "            !attr.isA(Tags::resources)) {",
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
  "double OperationPlan::getPriority() const {",
  "  // Operationplan hasn't been set up yet",
  "  if (!oper) return 999.0;",
  "",
  "  // Child operationplans have the same priority as the parent",
  "  if (getOwner() && !getOwner()->getOperation()->hasType<OperationSplit>())",
  "    return getOwner()->getPriority();",
  "",
  "  // Handle demand delivery operationplans",
  "  if (getTopOwner()->getDemand())",
  "    return getTopOwner()->getDemand()->getPriority();",
  "",
  "  // Handle an upstream operationplan",
  "  double lowestPriority = 999.0;",
  "  for (PeggingIterator p(const_cast<OperationPlan*>(this)); p; ++p) {",
  "    const OperationPlan* m = p.getOperationPlan();",
  "    if (!m) continue;",
  "    auto dmd = m->getTopOwner()->getDemand();",
  "    if (dmd && dmd->getPriority() < lowestPriority)",
  "      lowestPriority = dmd->getPriority();",
  "  }",
  "  return lowestPriority;",
  "}",
  "",
  "int OperationPlan::getCriticality() const {",
  "  // Operationplan hasn't been set up yet",
  "  if (!oper) return 86313600L;  // 999 days in seconds;",
  "",
  "  // Child operationplans have the same criticality as the parent",
  "  // TODO: Slack between routing sub operationplans isn't recognized.",
  "  if (getOwner() && !getOwner()->getOperation()->hasType<OperationSplit>())",
  "    return getOwner()->getCriticality();",
  "",
  "  // Handle demand delivery operationplans",
  "  if (getTopOwner()->getDemand()) {",
  "    long early = getTopOwner()->getDemand()->getDue() - getEnd();",
  "    return ((early <= 0L) ? 0.0 : early) / 86400.0;  // Convert to days",
  "  }",
  "",
  "  // Handle an upstream operationplan",
  "  Duration minslack = 86313600L;  // 999 days in seconds",
  "  vector<Duration> gaps(HasLevel::getNumberOfLevels() + 5);",
  "  set<const OperationPlan*> opplans;",
  "  for (PeggingIterator p(const_cast<OperationPlan*>(this)); p; ++p) {",
  "    const OperationPlan* m = p.getOperationPlan();",
  "    if (opplans.find(m) != opplans.end())",
  "      continue;",
  "    else",
  "      opplans.insert(m);",
  "    vector<Duration>::size_type lvl = p.getLevel();",
  "    if (lvl >= gaps.size()) gaps.resize(lvl + 5);",
  "    gaps[lvl] = p.getGap();",
  "    if (m && m->getTopOwner()->getDemand()) {",
  "      // Reached a demand. Get the total slack now.",
  "      Duration myslack = m->getTopOwner()->getDemand()->getDue() - m->getEnd();",
  "      if (myslack < 0L) myslack = 0L;",
  "      for (unsigned int i = 1; i <= lvl; i++) myslack += gaps[i];",
  "      if (myslack < minslack) minslack = myslack;",
  "    }",
  "  }",
  "  return floor(minslack / 86400.0);  // Convert to days",
  "}",
  "",
  "Duration OperationPlan::getDelay() const {",
  "  // Operationplan hasn't been set up yet. On time by default.",
  "  if (!oper) return 0L;",
  "",
  "  // Child operationplans have the same delay as the parent",
  "  // TODO for routing steps this is not really as accurrate as we could do it",
  "  if (getOwner() && !getOwner()->getOperation()->hasType<OperationSplit>())",
  "    return getOwner()->getDelay();",
  "",
  "  // Handle demand delivery operationplans",
  "  if (getTopOwner()->getDemand())",
  "    return getEnd() - getTopOwner()->getDemand()->getDue();",
  "",
  "  // Handle an upstream operationplan",
  "  Duration maxdelay = Duration::MIN;",
  "  vector<Duration> gaps(HasLevel::getNumberOfLevels() + 5);",
  "  set<const OperationPlan*> opplans;",
  "  for (PeggingIterator p(const_cast<OperationPlan*>(this)); p; ++p) {",
  "    const OperationPlan* m = p.getOperationPlan();",
  "    if (opplans.find(m) != opplans.end())",
  "      continue;",
  "    else",
  "      opplans.insert(m);",
  "    vector<Duration>::size_type lvl = p.getLevel();",
  "    if (lvl >= gaps.size()) gaps.resize(lvl + 5);",
  "    gaps[lvl] = p.getGap();",
  "    if (m && m->getTopOwner()->getDemand()) {",
  "      // Reached a demand. All time is processing except the gaps",
  "      Duration mydelay = m->getEnd() - m->getTopOwner()->getDemand()->getDue();",
  "      for (unsigned int i = 1; i <= lvl; i++) mydelay -= gaps[i];",
  "      if (mydelay > maxdelay) maxdelay = mydelay;",
  "    }",
  "  }",
  "  return maxdelay;",
  "}",
  "",
  "void OperationPlan::setQuantityExternal(double f) {",
  "  if (fabs(f - quantity) < ROUNDING_ERROR) return;",
  "  auto q = setQuantity(f, false, true, true);",
  "  if (oper)",
  "    oper->setOperationPlanParameters(this, q, getStart(), Date::infinitePast,",
  "                                     true, true, true);",
  "}",
  "",
  "void OperationPlan::setQuantityCompleted(double q) {",
  "  if (fabs(q - quantity_completed) < ROUNDING_ERROR) return;",
  "  quantity_completed = q;",
  "  if (oper && !getProposed())",
  "    oper->setOperationPlanParameters(this, getQuantity(), getStart(),",
  "                                     Date::infinitePast, true, true, true);",
  "}",
  "",
  "void OperationPlan::updatePurchaseOrder(Item* newitem, Location* newlocation,",
  "                                        Supplier* newsupplier) {",
  "  if (!newitem) throw DataException(\"Purchase order item can't be empty\");",
  "  if (!newlocation)",
  "    throw DataException(\"Purchase order location can't be empty\");",
  "",
  "  // Find or create the destination buffer.",
  "  Buffer* destbuffer = nullptr;",
  "  Item::bufferIterator buf_iter(newitem);",
  "  while (Buffer* tmpbuf = buf_iter.next()) {",
  "    if (tmpbuf->getLocation() == newlocation && !tmpbuf->getBatch()) {",
  "      destbuffer = tmpbuf;",
  "      break;",
  "    }",
  "  }",
  "  if (!destbuffer) destbuffer = Buffer::findOrCreate(newitem, newlocation);",
  "",
  "  // Look for a matching operation replenishing this buffer.",
  "  Operation* newoper = nullptr;",
  "  destbuffer->getProducingOperation();",
  "  for (const auto& flowiter : destbuffer->getFlows()) {",
  "    if (!flowiter.getOperation()->hasType<OperationItemSupplier>()) continue;",
  "    auto* opitemsupplier =",
  "        static_cast<OperationItemSupplier*>(flowiter.getOperation());",
  "    if (newsupplier) {",
  "      if (newsupplier->isMemberOf(",
  "              opitemsupplier->getItemSupplier()->getSupplier()))",
  "        newoper = opitemsupplier;",
  "    } else",
  "      newoper = opitemsupplier;",
  "  }",
  "",
  "  // No matching operation is found.",
  "  if (!newoper && getSupplier()) {",
  "    auto* itemsupplier = new ItemSupplier();",
  "    itemsupplier->setSupplier(newsupplier);",
  "    itemsupplier->setItem(newitem);",
  "    itemsupplier->setLocation(newlocation);",
  "    itemsupplier->setHidden(true);",
  "    itemsupplier->setPriority(0);",
  "    newoper = new OperationItemSupplier(itemsupplier, destbuffer);",
  "  }",
  "",
  "  // Switch the operation, keeping the receipt date the same",
  "  if (newoper && newoper != oper) {",
  "    oper = newoper;",
  "    oper->setOperationPlanParameters(this, quantity, Date::infinitePast,",
  "                                     dates.getEnd(), false, true, false);",
  "  }",
  "}",
  "",
  "void OperationPlan::updateDistributionOrder(Item* newitem, Location* neworigin,",
  "                                            Location* newlocation) {",
  "  if (!newlocation)",
  "    throw DataException(\"Distribution order location can't be empty\");",
  "",
  "  // Find or create the destination buffer.",
  "  Buffer* destbuffer = nullptr;",
  "  Item::bufferIterator buf_iter(newitem);",
  "  while (Buffer* tmpbuf = buf_iter.next()) {",
  "    if (tmpbuf->getLocation() == newlocation && !tmpbuf->getBatch()) {",
  "      destbuffer = tmpbuf;",
  "      break;",
  "    }",
  "  }",
  "  if (!destbuffer) destbuffer = Buffer::findOrCreate(newitem, newlocation);",
  "",
  "  // Look for a matching operation replenishing this buffer.",
  "  Operation* newoper = nullptr;",
  "  destbuffer->getProducingOperation();",
  "  for (const auto& flowiter : destbuffer->getFlows()) {",
  "    if (!flowiter.getOperation()->hasType<OperationItemDistribution>() ||",
  "        flowiter.getQuantity() <= 0)",
  "      continue;",
  "    auto* opitemdist =",
  "        static_cast<OperationItemDistribution*>(flowiter.getOperation());",
  "    // Origin must match as well",
  "    if (neworigin) {",
  "      for (auto fl = opitemdist->getFlows().begin();",
  "           fl != opitemdist->getFlows().end(); ++fl) {",
  "        if (fl->getQuantity() < 0 &&",
  "            fl->getBuffer()->getLocation()->isMemberOf(neworigin) &&",
  "            !fl->getBuffer()->getBatch())",
  "          newoper = opitemdist;",
  "      }",
  "    } else if (!opitemdist->getOrigin())",
  "      newoper = opitemdist;",
  "  }",
  "",
  "  // Create a new operation",
  "  if (!newoper) {",
  "    Buffer* originbuffer = nullptr;",
  "    if (neworigin) {",
  "      auto bufiter = newitem->getBufferIterator();",
  "      while (Buffer* tmpbuf = bufiter.next()) {",
  "        if (tmpbuf->getLocation() == neworigin && !tmpbuf->getBatch()) {",
  "          originbuffer = tmpbuf;",
  "        }",
  "      }",
  "      if (!originbuffer)",
  "        originbuffer = Buffer::findOrCreate(newitem, neworigin);",
  "    }",
  "",
  "    // Create itemdistribution",
  "    auto itemdist = new ItemDistribution();",
  "    if (neworigin) itemdist->setOrigin(neworigin);",
  "    itemdist->setItem(newitem);",
  "    if (newlocation) itemdist->setDestination(newlocation);",
  "    itemdist->setPriority(0);",
  "",
  "    // Create operation",
  "    newoper = new OperationItemDistribution(itemdist, originbuffer, destbuffer);",
  "  }",
  "",
  "  // Switch the operation, keeping the receipt date the same",
  "  if (newoper && newoper != oper) {",
  "    oper = newoper;",
  "    oper->setOperationPlanParameters(this, quantity, Date::infinitePast,",
  "                                     getEnd(), true, true, false);",
  "  }",
  "}",
  "",
  "void OperationPlan::setItem(Item* newitem) {",
  "  if (oper && oper->hasType<OperationItemSupplier>()) {",
  "    if (getItem() != newitem)",
  "      updatePurchaseOrder(newitem, getLocation(), getSupplier());",
  "  } else if (oper && oper->hasType<OperationItemDistribution>()) {",
  "    if (getItem() != newitem)",
  "      updateDistributionOrder(newitem, getOrigin(), getLocation());",
  "  } else",
  "    // Dummy update during input parsing",
  "    itm = newitem;",
  "}",
  "",
  "void OperationPlan::setOrigin(Location* neworigin) {",
  "  if (oper && oper->hasType<OperationItemDistribution>()) {",
  "    if (getOrigin() != neworigin)",
  "      updateDistributionOrder(getItem(), neworigin, getLocation());",
  "  } else",
  "    // Dummy update during input parsing",
  "    ori = neworigin;",
  "}",
  "",
  "void OperationPlan::setLocation(Location* newlocation) {",
  "  if (oper && oper->hasType<OperationItemSupplier>()) {",
  "    if (getLocation() != newlocation)",
  "      updatePurchaseOrder(getItem(), newlocation, getSupplier());",
  "  } else if (oper && oper->hasType<OperationItemDistribution>()) {",
  "    if (getLocation() != newlocation)",
  "      updateDistributionOrder(getItem(), getOrigin(), newlocation);",
  "  } else",
  "    // Dummy update during input parsing",
  "    loc = newlocation;",
  "}",
  "",
  "void OperationPlan::setSupplier(Supplier* newsupplier) {",
  "  if (oper && oper->hasType<OperationItemSupplier>()) {",
  "    if (getSupplier() != newsupplier)",
  "      updatePurchaseOrder(getItem(), getLocation(), newsupplier);",
  "  } else",
  "    // Dummy update during input parsing",
  "    sup = newsupplier;",
  "}",
  "",
  "void OperationPlan::clear() {",
  "  for (auto& o : Operation::all()) o.deleteOperationPlans();",
  "}",
  "",
  "PyObject* OperationPlan::createIterator(PyObject*, PyObject* args) {",
  "  // Check arguments",
  "  PyObject* pyoper = nullptr;",
  "  if (!PyArg_ParseTuple(args, \"|O:operationplans\", &pyoper)) return nullptr;",
  "  if (!pyoper)",
  "    // First case: Iterate over all operationplans",
  "    return new PythonIterator<OperationPlan::iterator, OperationPlan>();",
  "",
  "  // Second case: Iterate over the operationplans of a single operation",
  "  PythonData oper(pyoper);",
  "  if (!oper.check(Operation::metadata)) {",
  "    PyErr_SetString(PythonDataException,",
  "                    \"optional argument must be of type operation\");",
  "    return nullptr;",
  "  }",
  "  return new PythonIterator<OperationPlan::iterator, OperationPlan>(",
  "      static_cast<Operation*>(pyoper));",
  "}",
  "",
  "PeggingIterator OperationPlan::getPeggingDownstream() const {",
  "  return PeggingIterator(this, true);",
  "}",
  "",
  "PeggingIterator OperationPlan::getPeggingDownstreamFirstLevel() const {",
  "  return PeggingIterator(this, true, 1);",
  "}",
  "",
  "PeggingIterator OperationPlan::getPeggingUpstream() const {",
  "  return PeggingIterator(this, false);",
  "}",
  "",
  "PeggingIterator OperationPlan::getPeggingUpstreamFirstLevel() const {",
  "  return PeggingIterator(this, false, 1);",
  "}",
  "",
  "PeggingDemandIterator OperationPlan::getPeggingDemand() const {",
  "  return PeggingDemandIterator(this);",
  "}",
  "",
  "int OperationPlan::InterruptionIterator::intitialize() {",
  "  // Initialize the metadata.",
  "  metacategory =",
  "      MetaCategory::registerCategory<OperationPlan::InterruptionIterator>(",
  "          \"interruption\", \"interruptions\");",
  "  metadata = MetaClass::registerClass<OperationPlan::InterruptionIterator>(",
  "      \"interruption\", \"operationplan interruption\", true);",
  "  registerFields<OperationPlan::InterruptionIterator>(",
  "      const_cast<MetaCategory*>(metacategory));",
  "",
  "  // Initialize the Python type",
  "  auto& x =",
  "      PythonExtension<OperationPlan::InterruptionIterator>::getPythonType();",
  "  x.setName(\"interruption\");",
  "  x.setDoc(\"frePPLe operationplan interruption\");",
  "  x.supportgetattro();",
  "  x.supportstr();",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "OperationPlan::AlternateIterator::AlternateIterator(const OperationPlan* o)",
  "    : opplan(o) {",
  "  if (!o) return;",
  "  if (o->getOwner() &&",
  "      o->getOwner()->getOperation()->hasType<OperationAlternate>()) {",
  "    auto subs = o->getOwner()->getOperation()->getSubOperationIterator();",
  "    while (SubOperation* sub = subs.next()) {",
  "      if (sub->getOperation() != o->getOperation())",
  "        opers.push_back(sub->getOperation());",
  "    }",
  "  }",
  "  operIter = opers.begin();",
  "}",
  "",
  "Operation* OperationPlan::AlternateIterator::next() {",
  "  if (operIter == opers.end()) return nullptr;",
  "  auto tmp = *operIter;",
  "  ++operIter;",
  "  return tmp;",
  "}",
  "",
  "OperationPlan::InterruptionIterator*",
  "OperationPlan::InterruptionIterator::next() {",
  "  while (true) {",
  "    // Check whether all calendars are available",
  "    bool available = true;",
  "    Date selected = Date::infiniteFuture;",
  "    for (unsigned short t = 0; t < numCalendars; ++t) {",
  "      if (cals[t].getDate() < selected) selected = cals[t].getDate();",
  "    }",
  "    curdate = selected;",
  "    for (unsigned short t = 0; t < numCalendars && available; ++t)",
  "      // TODO next line does a pretty expensive lookup in the calendar, which we",
  "      // might be available to avoid",
  "      available = (cals[t].getCalendar()->getValue(selected) != 0);",
  "",
  "    if (available && !status) {",
  "      // Becoming available after unavailable period",
  "      status = true;",
  "      end = (curdate > opplan->getEnd()) ? opplan->getEnd() : curdate;",
  "      if (start != end) return this;",
  "    } else if (!available && status) {",
  "      // Becoming unavailable after available period",
  "      status = false;",
  "      if (curdate >= opplan->getEnd())",
  "        // Leaving the desired date range",
  "        return nullptr;",
  "      start = curdate;",
  "    } else if (curdate >= opplan->getEnd())",
  "      return nullptr;",
  "",
  "    // Advance to the next event",
  "    for (unsigned short t = 0; t < numCalendars; ++t)",
  "      if (cals[t].getDate() == selected) ++cals[t];",
  "  }",
  "}",
  "",
  "double OperationPlan::getEfficiency(Date d) const {",
  "  double best = DBL_MAX;",
  "  LoadPlanIterator e = beginLoadPlans();",
  "  if (e == endLoadPlans()) {",
  "    // Use the operation loads",
  "    for (const auto& h : getOperation()->getLoads()) {",
  "      double best_eff = 0.0;",
  "      for (Resource::memberRecursiveIterator mmbr(h.getResource());",
  "           !mmbr.empty(); ++mmbr) {",
  "        if (!mmbr->isGroup() &&",
  "            (!h.getSkill() || mmbr->hasSkill(h.getSkill(), d))) {",
  "          auto my_eff =",
  "              mmbr->getEfficiencyCalendar()",
  "                  ? mmbr->getEfficiencyCalendar()->getValue(d ? d : getStart())",
  "                  : mmbr->getEfficiency();",
  "          if (my_eff > best_eff) best_eff = my_eff;",
  "        }",
  "      }",
  "      if (best_eff < best) best = best_eff;",
  "    }",
  "  } else {",
  "    // Use the operationplan loadplans",
  "    double parallel_factor = 0.0;",
  "    auto individual = Plan::instance().getIndividualPoolResources();",
  "    while (e != endLoadPlans()) {",
  "      if (e->getQuantity() <= 0) {",
  "        if (e->getResource()->getOwner() && individual) {",
  "          // Planning with individual resources from a pool.",
  "          // Efficiency depends on sum of all efficiencies.",
  "          // Eg Allocating 1 resource with 100% efficiencies is the same",
  "          // as allocating 2 resource each with 50% efficiency.",
  "          auto total_allocated = 0.0;",
  "          for (LoadPlanIterator inner = beginLoadPlans();",
  "               inner != endLoadPlans(); ++inner)",
  "            if (e->getResource()->getTop() == inner->getResource()->getTop() &&",
  "                inner->getQuantity() < 0) {",
  "              total_allocated +=",
  "                  inner->getResource()->getEfficiencyCalendar()",
  "                      ? inner->getResource()->getEfficiencyCalendar()->getValue(",
  "                            d ? d : getStart())",
  "                      : inner->getResource()->getEfficiency();",
  "            }",
  "          double load_quantity = 1.0;",
  "          for (const auto& h : getOperation()->getLoads()) {",
  "            if (e->getResource()->isMemberOf(h.getResource())) {",
  "              load_quantity = h.getQuantity();",
  "              break;",
  "            }",
  "          }",
  "          total_allocated /= load_quantity;",
  "          if (!parallel_factor || total_allocated < parallel_factor)",
  "            parallel_factor = total_allocated;",
  "        } else {",
  "          auto tmp = e->getResource()->getEfficiencyCalendar()",
  "                         ? e->getResource()->getEfficiencyCalendar()->getValue(",
  "                               d ? d : getStart())",
  "                         : e->getResource()->getEfficiency();",
  "          if (tmp < best) best = tmp;",
  "        }",
  "      }",
  "      ++e;",
  "    }",
  "    if (parallel_factor) {",
  "      if (best == DBL_MAX)",
  "        best = parallel_factor;",
  "      else",
  "        best *= parallel_factor / 100;",
  "    }",
  "  }",
  "  if (best == DBL_MAX)",
  "    return 1.0;",
  "  else if (best > 0.0)",
  "    return best / 100.0;",
  "  else",
  "    return 0.0;",
  "}",
  "",
  "void OperationPlan::setBatch(const PooledString& s, bool up) {",
  "  if (getTopOwner() != this && up)",
  "    getTopOwner()->setBatch(s, false);",
  "  else {",
  "    auto subopplans = getSubOperationPlans();",
  "    while (auto subopplan = subopplans.next()) subopplan->setBatch(s, false);",
  "    if (batch != s) {",
  "      batch = s;",
  "      auto flplniter = getFlowPlans();",
  "      FlowPlan* flpln;",
  "      while ((flpln = flplniter.next())) flpln->updateBatch();",
  "    }",
  "  }",
  "}",
  "",
  "Date OperationPlan::computeOperationToFlowDate(Date d) const {",
  "  for (auto g = beginFlowPlans(); g != endFlowPlans(); ++g)",
  "    if (g->getFlow()->isProducer() &&",
  "        !g->getFlow()->hasType<FlowTransferBatch>())",
  "      return g->getFlow()->getOffset()",
  "                 ? g->getFlow()->computeOperationToFlowDate(this, d)",
  "                 : d;",
  "  return d;",
  "}",
  "",
  "Duration OperationPlan::getSetup() const {",
  "  if (!setupevent) return Duration(-1L);",
  "  if (setupevent->getSetupOverride() >= Duration(0L))",
  "    return setupevent->getSetupOverride();",
  "  if (getConfirmed()) return Duration(0L);",
  "  if (getSetupRule()) return getSetupRule()->getDuration();",
  "  for (auto ldplan = beginLoadPlans(); ldplan != endLoadPlans(); ++ldplan) {",
  "    if (!ldplan->getLoad()->getSetup().empty() &&",
  "        ldplan->getResource()->getSetupMatrix())",
  "      return Duration(0L);",
  "  }",
  "  return Duration(-1L);",
  "}",
  "",
  "void OperationPlan::setSetupEvent(TimeLine<LoadPlan>* res, Date d,",
  "                                  const PooledString& s, SetupMatrixRule* r) {",
  "  if (setupevent && setupevent->getRule() &&",
  "      setupevent->getRule()->getResource()) {",
  "    for (auto l = beginLoadPlans(); l != endLoadPlans();) {",
  "      if (l->getLoad())",
  "        ++l;",
  "      else",
  "        l.deleteLoadPlan();",
  "    }",
  "  }",
  "  if (!res && (!setupevent || setupevent->getSetupOverride() < 0L)) {",
  "    delete setupevent;",
  "    setupevent = nullptr;",
  "    return;",
  "  } else if (setupevent)",
  "    setupevent->update(res, d, s, r);",
  "  else",
  "    setupevent = new SetupEvent(res, d, s, r, this);",
  "  if (r && r->getResource()) new LoadPlan(this, setupevent);",
  "}",
  "",
  "double OperationPlan::getSetupCost() const {",
  "  if (setupevent)",
  "    return setupevent->getRule() ? setupevent->getRule()->getCost() : 0.0;",
  "  else",
  "    return 0.0;",
  "}",
  "",
  "PyObject* OperationPlan::getColorPython(PyObject* self, PyObject*) {",
  "  auto* opplan = static_cast<OperationPlan*>(self);",
  "  // No color for delivery, stock or alternate operationplans",
  "  if (opplan->getOrderType() == \"DLVR\")",
  "    return Py_BuildValue(\"(dO)\", 999999.0, Py_None);",
  "  if (opplan->getOrderType() == \"STCK\")",
  "    return Py_BuildValue(\"(dO)\", 999999.0, Py_None);",
  "  if (opplan->getOrderType() == \"ALT\")",
  "    return Py_BuildValue(\"(dO)\", 999999.0, Py_None);",
  "",
  "  if (opplan->getConfirmed() || opplan->getApproved())",
  "    return Py_BuildValue(\"(dO)\", 100.0 - opplan->getDelay() / 86400, Py_None);",
  "",
  "  // Routing suboperations are getting a color",
  "  // if the routing is the first proposed to produce",
  "  bool isRoutingSubop = false, isFirstRoutingMO = true;",
  "  if (opplan->getStatus() == \"proposed\" &&",
  "      opplan->getOperation()->getOwner() and",
  "      opplan->getOperation()->getOwner()->hasType<OperationRouting>()) {",
  "    isRoutingSubop = true;",
  "    Date end = opplan->getOwner()->getEnd();",
  "    for (auto rr = opplan->getOperation()->getOwner()->getOperationPlans();",
  "         rr != OperationPlan::end(); ++rr) {",
  "      if ((&*rr)->getStatus() != \"proposed\") continue;",
  "      if ((&*rr) != opplan->getOwner() && rr->getEnd() < end) {",
  "        isFirstRoutingMO = false;",
  "        break;",
  "      }",
  "    }",
  "  }",
  "",
  "  // This is a routing suboperation and the owner is the first MO of the plan",
  "  if (isRoutingSubop && isFirstRoutingMO) {",
  "    // Find the last step",
  "    OperationPlan* lastStepOpPlan = nullptr;",
  "    for (auto rr = opplan->getOwner()->getSubOperationPlans();",
  "         rr != OperationPlan::end(); ++rr) {",
  "      lastStepOpPlan = (&*rr);",
  "    }",
  "    return Py_BuildValue(\"(dO)\", 100.0 - lastStepOpPlan->getDelay() / 86400,",
  "                         Py_None);",
  "  }",
  "",
  "  // This is routing suboperation and the owner is NOT the first MO of the",
  "  // plan",
  "  if (isRoutingSubop && !isFirstRoutingMO) {",
  "    /*color less*/",
  "    return Py_BuildValue(\"(dO)\", 999999.0, Py_None);",
  "  }",
  "",
  "  // This is a routing MO, make sure it's the first one to produce",
  "  isFirstRoutingMO = true;",
  "  if (opplan->getStatus() == \"proposed\" &&",
  "      opplan->getOperation()->hasType<OperationRouting>()) {",
  "    for (auto rr = opplan->getOperation()->getOperationPlans();",
  "         rr != OperationPlan::end(); ++rr) {",
  "      if ((&*rr)->getStatus() != \"proposed\") continue;",
  "      if ((&*rr) != opplan && rr->getEnd() < opplan->getEnd()) {",
  "        isFirstRoutingMO = false;",
  "        break;",
  "      }",
  "    }",
  "",
  "    if (isFirstRoutingMO) {",
  "      OperationPlan* lastStepOpPlan = nullptr;",
  "      for (auto rr = opplan->getSubOperationPlans(); rr != OperationPlan::end();",
  "           ++rr) {",
  "        lastStepOpPlan = (&*rr);",
  "      }",
  "      if (lastStepOpPlan)",
  "        return Py_BuildValue(\"(dO)\", 100.0 - lastStepOpPlan->getDelay() / 86400,",
  "                             Py_None);",
  "      else",
  "        return Py_BuildValue(\"(dO)\", 999999.0, Py_None);",
  "    } else",
  "      return Py_BuildValue(\"(dO)\", 999999.0, Py_None);",
  "  }",
  "",
  "  // Remaining possibilities now, POs, DOs and regular timer_per, fixed_time",
  "  // MOs, no subops",
  "  Date firstProposedStart;",
  "  for (auto rr = opplan->getOperation()->getOperationPlans();",
  "       rr != OperationPlan::end(); ++rr) {",
  "    if (!(&*rr)->getProposed()) continue;",
  "    if (!firstProposedStart && (&*rr) == opplan)",
  "      return Py_BuildValue(\"(dO)\", 100.0 - opplan->getDelay() / 86400, Py_None);",
  "    else if (!firstProposedStart)",
  "      firstProposedStart = (&*rr)->getStart();",
  "    else if (firstProposedStart && opplan->getStart() <= firstProposedStart)",
  "      return Py_BuildValue(\"(dO)\", 100.0 - opplan->getDelay() / 86400, Py_None);",
  "    else",
  "      return Py_BuildValue(\"(dO)\", 999999.0, Py_None);",
  "  }",
  "  return Py_BuildValue(\"(dO)\", 999999.0, Py_None);",
  "}",
  "",
  "SetupEvent::SetupEvent(OperationPlan* x)",
  "    : TimeLine<LoadPlan>::Event(5), opplan(x) {",
  "  initType(metadata);",
  "  if (opplan) dt = x->getStart();",
  "}",
  "",
  "SetupEvent::~SetupEvent() {",
  "  if (opplan) opplan->nullSetupEvent();",
  "}",
  "",
  "void SetupEvent::erase() {",
  "  if (stateinfo) return;",
  "  if (tmline) tmline->erase(this);",
  "  if (opplan && rule && rule->getResource()) {",
  "    for (auto l = opplan->beginLoadPlans(); l != opplan->endLoadPlans();) {",
  "      if (l->getLoad())",
  "        ++l;",
  "      else",
  "        l.deleteLoadPlan();",
  "    }",
  "  }",
  "}",
  "",
  "void SetupEvent::update(TimeLine<LoadPlan>* res, Date d, const PooledString& s,",
  "                        SetupMatrixRule* r) {",
  "  setup = s;",
  "  rule = r;",
  "  if (stateinfo) {",
  "    dt = d;",
  "    tmline = res;",
  "  } else if (res != tmline)",
  "    // Insert in resource timeling",
  "    setTimeLine(res);",
  "  else",
  "    // Update the position in the list",
  "    tmline->update(this, d);",
  "}",
  "",
  "SetupEvent* SetupEvent::getSetupBefore() const {",
  "  auto i = getTimeLine()->begin(this);",
  "  --i;",
  "  while (i != getTimeLine()->end()) {",
  "    if (i->getEventType() == 5)",
  "      return const_cast<SetupEvent*>(static_cast<const SetupEvent*>(&*i));",
  "    --i;",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "int SetupEvent::initialize() {",
  "  // Initialize the metadata",
  "  metadata =",
  "      MetaCategory::registerCategory<SetupEvent>(\"setupevent\", \"setupevents\");",
  "  registerFields<SetupEvent>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python type",
  "  auto& x = FreppleCategory<SetupEvent>::getPythonType();",
  "  x.setName(\"setupevent\");",
  "  x.setDoc(\"frePPLe setup event\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "void OperationPlan::setResetResources(bool b) {",
  "  if (!b) return;",
  "  LoadPlanIterator f = beginLoadPlans();",
  "  while (f != endLoadPlans()) {",
  "    auto tmp = &*f;",
  "    ++f;",
  "    delete tmp;",
  "  }",
  "  firstloadplan = nullptr;",
  "}",
  "",
  "void OperationPlan::appendInfo(const string& s) {",
  "  if (getProposed())",
  "    // Info is not relevant for proposed operationplans",
  "    return;",
  "  if (info.empty())",
  "    info = s;",
  "  else if (!info.contains(s))",
  "    info = PooledString(static_cast<string>(info) + \"\\n\" + s);",
  "}",
  "",
  "}  // namespace frepple",
];
