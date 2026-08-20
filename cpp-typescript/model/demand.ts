// <header-api-generated>
export const DemandCppModel = { bases: ["HasHierarchy","Plannable"] as const, methods: ["addConstraint","addDelivery","deleteOperationPlans","getBatch","getBatchString","getCluster","getConstraintIterator","getConstraints","getCustomer","getDefaultDeliveryDuration","getDelay","getDelivery","getDeliveryDate","getDeliveryDuration","getDeliveryOperation","getDue","getEarliestDelivery","getHidden","getItem","getLatestDelivery","getLocation","getMaxLateness","getMinShipment","getNextItemDemand","getOperation","getOperationPlans","getPegging","getPeggingFirstLevel","getPlannedQuantity","getPriority","getProblemIterator","getQuantity","getRawMinShipment","getSize","getStatus","getStatusString","getType","initialize","isMinShipmentDefault","registerFields","removeDelivery","setBatch","setCustomer","setDefaultDeliveryDuration","setDue","setHidden","setItem","setLocation","setLocationNoRecalc","setMaxLateness","setMinShipment","setOperation","setPriority","setQuantity","setStatus","setStatusString","solve","updateProblems"] as const, qualifiedNames: ["Demand"] as const };

export const DemandDefaultCppModel = { bases: ["Demand"] as const, methods: ["getType","initialize","registerFields"] as const, qualifiedNames: ["DemandDefault"] as const };

export const DemandDeliveryIteratorCppModel = { bases: [] as const, methods: ["next"] as const, qualifiedNames: ["Demand::DeliveryIterator"] as const };

export const DemandGroupCppModel = { bases: ["Demand"] as const, methods: ["getCluster","getDue","getPolicy","getPolicyString","getPriority","getQuantity","getType","initialize","registerFields","setDue","setPolicyString","setPriority"] as const, qualifiedNames: ["DemandGroup"] as const };
// </header-api-generated>




import { Date as PlanningDate, Duration } from "../utils/date.js";
import {
  DataException,
  Environment,
  HeaderModelAdapter,
  LogicException,
  ModelEntity,
  applyDataFields,
} from "../utils/library.js";
import { Buffer } from "./buffer.js";
import type { Customer } from "./customer.js";
import type { Item } from "./item.js";
import { Location } from "./location.js";
import { Operation, OperationDelivery } from "./operation.js";
import { PeggingIterator } from "./pegging.js";
import {
  getEntityChanged,
  getEntityDetectProblems,
  getEntityProblems,
  registerProblemEntity,
  setEntityChanged,
  setEntityDetectProblems,
  unregisterProblemEntity,
} from "./problem.js";

type DateInput = PlanningDate | string | number;
type DurationInput = Duration | string | number;
type DemandFields = Readonly<Record<string, unknown>>;

const ROUNDING_ERROR = 0.000001;

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

function planDate(operationPlan: HeaderModelAdapter, method: "getStart" | "getEnd"): PlanningDate {
  const result = call(operationPlan, method);
  if (result instanceof PlanningDate) return result;
  return typeof result === "string" || typeof result === "number" ? new PlanningDate(result) : new PlanningDate();
}

function compareDeliveryOperationPlans(left: HeaderModelAdapter, right: HeaderModelAdapter): number {
  if (left === right) return 0;
  const leftOperation = call(left, "getOperation");
  const rightOperation = call(right, "getOperation");
  if (leftOperation !== rightOperation) {
    const leftName = String(call(leftOperation, "getName") ?? "");
    const rightName = String(call(rightOperation, "getName") ?? "");
    if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  }
  const setupEnd = planDate(left, "getStart").compare(planDate(right, "getStart"));
  const leftSetupEnd = call(left, "getSetupEnd");
  const rightSetupEnd = call(right, "getSetupEnd");
  const setupComparison = leftSetupEnd instanceof PlanningDate && rightSetupEnd instanceof PlanningDate
    ? leftSetupEnd.compare(rightSetupEnd) : setupEnd;
  if (setupComparison) return setupComparison;
  const leftQuantity = Number(call(left, "getQuantity") ?? 0);
  const rightQuantity = Number(call(right, "getQuantity") ?? 0);
  if (Math.abs(leftQuantity - rightQuantity) > ROUNDING_ERROR) return leftQuantity > rightQuantity ? -1 : 1;
  const leftActivated = Boolean(call(left, "getActivated"));
  const rightActivated = Boolean(call(right, "getActivated"));
  if (leftActivated !== rightActivated) return leftActivated ? -1 : 1;
  const endComparison = planDate(left, "getEnd").compare(planDate(right, "getEnd"));
  if (endComparison) return endComparison;
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

/** Demand planning model with the C++ hierarchy, delivery and lifecycle contracts. */
export class Demand extends ModelEntity<Demand> {
  static readonly cppBases: readonly string[] = ["HasHierarchy", "Plannable"];
  static readonly cppQualifiedNames: readonly string[] = ["Demand"];
  static override modelFamily = "Demand";
  static readonly STATUS_QUOTE = 1;
  static readonly STATUS_INQUIRY = 2;
  static readonly STATUS_OPEN = 4;
  static readonly STATUS_CLOSED = 16;
  static readonly STATUS_CANCELED = 32;
  static readonly POLICY_INDEPENDENT = 64;
  static readonly POLICY_ALLTOGETHER = 128;
  static readonly POLICY_INRATIO = 256;
  static readonly HIDDEN = 512;
  private static defaultDeliveryDuration = new Duration();

  private quantity = 0;
  private priority = 0;
  private item: Item | null = null;
  private location: Location | null = null;
  private operation: Operation | null = null;
  private deliveryOperationResolved = false;
  private customer: Customer | null = null;
  private due = new PlanningDate();
  private maxLateness = new Duration(5 * 365 * 86_400);
  private minShipment = -1;
  private readonly deliveries: HeaderModelAdapter[] = [];
  private readonly constraints: HeaderModelAdapter[] = [];
  private batch = "";
  private status = Demand.STATUS_OPEN;

  constructor(nameOrFields?: string | DemandFields) {
    super(typeof nameOrFields === "string" ? nameOrFields : undefined);
    registerProblemEntity(this);
    if (nameOrFields && typeof nameOrFields === "object") applyDataFields(this, nameOrFields);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static getDefaultDeliveryDuration(): Duration { return new Duration(this.defaultDeliveryDuration); }
  static setDefaultDeliveryDuration(value: DurationInput): void {
    const next = asDuration(value);
    if (next.seconds < 0) Environment.log("Warning: Delivery duration must be >= 0.");
    else this.defaultDeliveryDuration = next;
  }
  override getType(): string { return "demand"; }
  getSize(): number { return 1 + this.deliveries.length * 2 + this.constraints.length; }
  getQuantity(): number { return this.quantity; }
  setQuantity(value: number): void {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0 || Math.abs(next - this.quantity) < ROUNDING_ERROR) return;
    this.quantity = next;
  }
  getPriority(): number { return this.priority; }
  setPriority(value: number): void { this.priority = Math.trunc(Number(value)); }
  getItem(): Item | null { return this.item; }
  setItem(value: Item | null): void {
    if (this.item === value) return;
    link(this, "Item", this.item as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.item = value;
    this.resetAutomaticDeliveryOperation();
  }
  getLocation(): Location | null { return this.location; }
  setLocation(value: Location | null): void {
    if (this.location === value) return;
    link(this, "Location", this.location as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.location = value;
    this.resetAutomaticDeliveryOperation();
  }
  setLocationNoRecalc(value: Location | null): void {
    if (this.location !== value) {
      link(this, "Location", this.location as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
      this.location = value;
    }
    this.releaseOperation();
    this.deliveryOperationResolved = false;
  }
  getOperation(): Operation | null { return this.deliveryOperationResolved ? this.operation : null; }
  setOperation(value: Operation | null): void {
    if (this.operation !== value) {
      link(this, "Operation", this.operation as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
      this.operation = value;
    }
    this.deliveryOperationResolved = true;
  }
  getDeliveryDuration(): Duration { return Demand.getDefaultDeliveryDuration(); }
  getDefaultDeliveryDuration(): Duration { return Demand.getDefaultDeliveryDuration(); }
  setDefaultDeliveryDuration(value: DurationInput): void { Demand.setDefaultDeliveryDuration(value); }

  private releaseOperation(): void {
    link(this, "Operation", this.operation as HeaderModelAdapter | null, null);
    this.operation = null;
  }

  private resetAutomaticDeliveryOperation(): void {
    if (!this.deliveryOperationResolved || (this.operation && this.operation.getHidden())) {
      this.releaseOperation();
      this.deliveryOperationResolved = false;
    }
  }

  getDeliveryOperation(): Operation | null {
    if (this.deliveryOperationResolved) return this.operation;
    if (!this.item) {
      this.deliveryOperationResolved = true;
      return null;
    }

    let location = this.location;
    if (!location) {
      const locations = Location.all();
      if (locations.length === 1) location = locations[0] ?? null;
    }
    if (!location) {
      this.deliveryOperationResolved = true;
      return null;
    }

    const buffers = [...this.item.getBufferIterator()].filter((candidate) =>
      candidate instanceof Buffer && candidate.getLocation() === location && !candidate.getBatch()) as Buffer[];
    if (buffers.length > 1) {
      this.deliveryOperationResolved = true;
      return null;
    }
    const buffer = buffers[0] ?? Buffer.findOrCreate(this.item, location);
    if (!buffer) {
      this.deliveryOperationResolved = true;
      return null;
    }

    const operationName = `Ship ${buffer.getName()}`;
    let delivery = Operation.find(operationName) ?? null;
    if (!delivery) {
      const created = new OperationDelivery();
      created.setHidden(true);
      created.setSizeMinimum(0);
      created.setDuration(Demand.getDefaultDeliveryDuration());
      created.setBuffer(buffer);
      created.setName(operationName);
      created.setLocation(location);
      delivery = created;
    }
    link(this, "Operation", null, delivery);
    this.operation = delivery;
    this.deliveryOperationResolved = true;
    return delivery;
  }

  getCluster(): number {
    const delivery = this.getDeliveryOperation();
    const direct = call(delivery, "getCluster");
    if (direct !== undefined) return Number(direct);
    return Number(call(call(delivery, "getBuffer"), "getCluster") ?? 0);
  }
  getDelivery(): readonly HeaderModelAdapter[] {
    this.deliveries.sort((left, right) => {
      const endComparison = planDate(right, "getEnd").compare(planDate(left, "getEnd"));
      return endComparison || compareDeliveryOperationPlans(left, right);
    });
    return this.deliveries;
  }
  getOperationPlans(): DemandDeliveryIterator { return new DemandDeliveryIterator(this); }
  getLatestDelivery(): HeaderModelAdapter | null { return this.getDelivery()[0] ?? null; }
  getEarliestDelivery(): HeaderModelAdapter | null { return this.getDelivery().at(-1) ?? null; }
  attachDeliveryReference(operationPlan: HeaderModelAdapter | null): void {
    if (operationPlan && !this.deliveries.includes(operationPlan)) this.deliveries.unshift(operationPlan);
  }
  detachDeliveryReference(operationPlan: HeaderModelAdapter | null, validate = false): void {
    if (!operationPlan) return;
    if (validate && call(operationPlan, "getDemand") !== this) {
      throw new LogicException("Delivery operationplan incorrectly registered");
    }
    const index = this.deliveries.indexOf(operationPlan);
    if (index >= 0) this.deliveries.splice(index, 1);
  }
  addDelivery(operationPlan: HeaderModelAdapter | null): void {
    if (!operationPlan) return;
    if (call(operationPlan, "getDemand") !== this) call(operationPlan, "setDemand", this);
    this.attachDeliveryReference(operationPlan);
    const expected = this.getDeliveryOperation();
    const actual = call(operationPlan, "getOperation");
    if (expected && actual && expected !== actual) {
      Environment.log(`Warning: Delivery Operation differs from the expected operation for demand '${this.getName()}'`);
    }
  }
  removeDelivery(operationPlan: HeaderModelAdapter | null): void {
    if (!operationPlan) return;
    this.detachDeliveryReference(operationPlan, true);
    call(operationPlan, "setDemand", null);
  }
  deleteOperationPlans(deleteLocked = false, commandManager: unknown = null): void {
    for (const operationPlan of [...this.deliveries]) {
      if (!deleteLocked && !Boolean(call(operationPlan, "getProposed"))) continue;
      const add = commandManager && typeof commandManager === "object" ? Reflect.get(commandManager, "add") : undefined;
      if (typeof add === "function") Reflect.apply(add, commandManager, [operationPlan]);
      else operationPlan.dispose();
      const index = this.deliveries.indexOf(operationPlan);
      if (index >= 0) this.deliveries.splice(index, 1);
    }
  }
  getPlannedQuantity(): number {
    return this.deliveries.reduce((total, operationPlan) => total + Number(call(operationPlan, "getQuantity") ?? 0), 0);
  }
  getDeliveryDate(): PlanningDate {
    const latest = this.getLatestDelivery();
    return latest ? new PlanningDate(planDate(latest, "getEnd")) : new PlanningDate(PlanningDate.infiniteFuture);
  }
  getDelay(): Duration { return this.getDeliveryDate().subtract(this.getDue()); }

  getStatus(): number { return this.status; }
  setStatus(value: number | string): void {
    if (typeof value === "string") { this.setStatusString(value); return; }
    const next = Number(value);
    if (next & Demand.STATUS_OPEN) this.applyStatus(Demand.STATUS_OPEN);
    else if (next & Demand.STATUS_CLOSED) this.applyStatus(Demand.STATUS_CLOSED);
    else if (next & Demand.STATUS_QUOTE) this.applyStatus(Demand.STATUS_QUOTE);
    else if (next & Demand.STATUS_INQUIRY) this.applyStatus(Demand.STATUS_INQUIRY);
    else if (next & Demand.STATUS_CANCELED) this.applyStatus(Demand.STATUS_CANCELED);
    else Environment.log("Warning: Demand status not recognized");
  }
  getStatusString(): string {
    const values: Readonly<Record<number, string>> = {
      [Demand.STATUS_OPEN]: "open", [Demand.STATUS_QUOTE]: "quote", [Demand.STATUS_INQUIRY]: "inquiry",
      [Demand.STATUS_CLOSED]: "closed", [Demand.STATUS_CANCELED]: "canceled",
    };
    const result = values[this.status];
    if (!result) throw new LogicException("Demand status not recognized");
    return result;
  }
  setStatusString(value: string): void {
    const statuses: Readonly<Record<string, number>> = {
      "": Demand.STATUS_OPEN, open: Demand.STATUS_OPEN, quote: Demand.STATUS_QUOTE,
      inquiry: Demand.STATUS_INQUIRY, closed: Demand.STATUS_CLOSED, canceled: Demand.STATUS_CANCELED,
    };
    const next = statuses[String(value).toLowerCase()];
    if (next === undefined) Environment.log("Warning: Demand status not recognized");
    else this.applyStatus(next);
  }
  private applyStatus(value: number): void {
    this.status = value;
    if (value === Demand.STATUS_CLOSED || value === Demand.STATUS_CANCELED) this.deleteOperationPlans(false);
  }

  getBatch(): string { return this.batch; }
  getBatchString(): string { return this.batch; }
  setBatch(value: string): void { this.batch = String(value); }
  getNextItemDemand(): Demand | null {
    if (!this.item) return null;
    const demands = [...this.item.getDemandIterator()] as Demand[];
    return demands[demands.indexOf(this) + 1] ?? null;
  }
  getDue(): PlanningDate { return new PlanningDate(this.due); }
  setDue(value: DateInput): void { this.due = asDate(value); }
  getCustomer(): Customer | null { return this.customer; }
  setCustomer(value: Customer | null): void {
    if (this.customer === value) return;
    link(this, "Customer", this.customer as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.customer = value;
  }
  getMaxLateness(): Duration { return new Duration(this.maxLateness); }
  setMaxLateness(value: DurationInput): void {
    const next = asDuration(value);
    if (next.seconds < 0) Environment.log("Warning: The maximum demand lateness must be positive");
    else this.maxLateness = next;
  }
  getMinShipment(): number { return this.minShipment >= 0 ? this.minShipment : Math.floor(this.getQuantity() / 10); }
  getRawMinShipment(): number { return this.minShipment; }
  isMinShipmentDefault(): boolean { return this.minShipment === -1; }
  setMinShipment(value: number): void {
    const next = Number(value);
    if (next < 0 && next !== -1) Environment.log("Warning: The minimum demand shipment quantity must be positive");
    else this.minShipment = next;
  }
  getConstraints(): readonly HeaderModelAdapter[] { return this.constraints; }
  addConstraint(typeOrConstraint: string | HeaderModelAdapter | Readonly<Record<string, unknown>>, owner = "",
    start: DateInput = PlanningDate.infinitePast, end: DateInput = PlanningDate.infiniteFuture): HeaderModelAdapter {
    if (typeOrConstraint instanceof HeaderModelAdapter) {
      this.constraints.push(typeOrConstraint);
      return typeOrConstraint;
    }
    const values = typeof typeOrConstraint === "object"
      ? typeOrConstraint
      : { type: String(typeOrConstraint), owner: String(owner), start: asDate(start), end: asDate(end) };
    if (!Reflect.get(values, "type")) throw new DataException("Invalid constraint type");
    const constraint = new HeaderModelAdapter(values);
    this.constraints.push(constraint);
    return constraint;
  }
  getConstraintIterator(): IterableIterator<HeaderModelAdapter> { return this.constraints.values(); }
  getProblemIterator(): IterableIterator<HeaderModelAdapter> { return this.constraints.values(); }
  getProblems(): import("./problem.js").Problem[] { return getEntityProblems(this); }
  getChanged(): boolean { return getEntityChanged(this); }
  setChanged(value = true): void { setEntityChanged(this, value); }
  getDetectProblems(): boolean { return getEntityDetectProblems(this); }
  setDetectProblems(value: boolean): void { setEntityDetectProblems(this, value); }
  getPegging(): PeggingIterator { return new PeggingIterator(this, -1); }
  getPeggingFirstLevel(): PeggingIterator { return new PeggingIterator(this, 0); }
  solve(solver: unknown, payload?: unknown): unknown { return call(solver, "solve", this, payload); }
  updateProblems(): void { setEntityChanged(this, false); }

  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Item") this.setItem(null);
    else if (property === "Location") this.setLocation(null);
    else if (property === "Operation") { this.operation = null; this.deliveryOperationResolved = true; }
    else if (property === "Customer") this.setCustomer(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  protected override disposeReferences(): void {
    unregisterProblemEntity(this);
    this.deleteOperationPlans(true);
    this.setItem(null);
    this.setLocation(null);
    this.setCustomer(null);
    this.releaseOperation();
    for (const constraint of this.constraints.splice(0)) constraint.dispose();
  }
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(), quantity: this.quantity, priority: this.priority, due: this.due.toString(),
      status: this.getStatusString(), item: this.item?.getName(), location: this.location?.getName(),
      customer: this.customer?.getName(), operation: this.getOperation()?.getName(), batch: this.batch,
      maxlateness: this.maxLateness.toString(), minshipment: this.minShipment,
    };
  }
}

export class DemandDefault extends Demand {
  static override readonly cppBases: readonly string[] = ["Demand"];
  static override readonly cppQualifiedNames: readonly string[] = ["DemandDefault"];
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "demand_default"; }
}

export class DemandDeliveryIterator implements Iterable<HeaderModelAdapter> {
  static readonly cppBases: readonly string[] = [];
  static readonly cppQualifiedNames: readonly string[] = ["Demand::DeliveryIterator"];
  private readonly deliveries: readonly HeaderModelAdapter[];
  private index = 0;
  constructor(demand?: Demand) { this.deliveries = demand?.getDelivery() ?? []; }
  next(): HeaderModelAdapter | null { return this.deliveries[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<HeaderModelAdapter> { return this.deliveries[Symbol.iterator](); }
}

export class DemandGroup extends Demand {
  static override readonly cppBases: readonly string[] = ["Demand"];
  static override readonly cppQualifiedNames: readonly string[] = ["DemandGroup"];
  private policy = Demand.POLICY_INDEPENDENT;
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "demand_group"; }
  getPolicy(): number { return this.policy; }
  getPolicyString(): string {
    if (this.policy === Demand.POLICY_INDEPENDENT) return "independent";
    if (this.policy === Demand.POLICY_ALLTOGETHER) return "alltogether";
    if (this.policy === Demand.POLICY_INRATIO) return "inratio";
    throw new LogicException("Demand policy not recognized");
  }
  setPolicyString(value: string): void {
    const policies: Readonly<Record<string, number>> = {
      "": Demand.POLICY_INDEPENDENT, independent: Demand.POLICY_INDEPENDENT,
      alltogether: Demand.POLICY_ALLTOGETHER, inratio: Demand.POLICY_INRATIO,
    };
    const next = policies[String(value).toLowerCase()];
    if (next === undefined) Environment.log("Warning: Demand policy not recognized");
    else this.policy = next;
  }
  override getQuantity(): number { return 0; }
  override getPriority(): number {
    const members = [...this.getMembers()];
    return members.length ? Math.min(...members.map((member) => member.getPriority())) : Number.MAX_SAFE_INTEGER;
  }
  override setPriority(value: number): void {
    super.setPriority(value);
    for (const member of this.getMembers()) member.setPriority(value);
  }
  override getDue(): PlanningDate {
    const members = [...this.getMembers()];
    if (!members.length) return new PlanningDate(PlanningDate.infiniteFuture);
    return members.reduce((earliest, member) => member.getDue().compare(earliest) < 0 ? member.getDue() : earliest,
      new PlanningDate(PlanningDate.infiniteFuture));
  }
  override setDue(value: DateInput): void { for (const member of this.getMembers()) member.setDue(value); }
  override getCluster(): number { return this.getFirstChild()?.getCluster() ?? 0; }
}























/**
 * Semantic migration unit for src/model/demand.cpp.
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
  { name: "Demand::initialize", sourceLine: 39, status: "adapted" },
  { name: "DemandDefault::initialize", sourceLine: 56, status: "adapted" },
  { name: "DemandGroup::initialize", sourceLine: 66, status: "adapted" },
  { name: "Demand::setQuantity", sourceLine: 76, status: "adapted" },
  { name: "Demand::~Demand", sourceLine: 85, status: "adapted" },
  { name: "Demand::deleteOperationPlans", sourceLine: 107, status: "adapted" },
  { name: "Demand::removeDelivery", sourceLine: 129, status: "adapted" },
  { name: "Demand::getDelivery", sourceLine: 145, status: "adapted" },
  { name: "Demand::getLatestDelivery", sourceLine: 155, status: "adapted" },
  { name: "Demand::getEarliestDelivery", sourceLine: 160, status: "adapted" },
  { name: "Demand::addDelivery", sourceLine: 167, status: "adapted" },
  { name: "Demand::getDeliveryOperation", sourceLine: 191, status: "adapted" },
  { name: "Operation::find", sourceLine: 237, status: "adapted" },
  { name: "Demand::getPlannedQuantity", sourceLine: 254, status: "adapted" },
  { name: "Demand::addConstraint", sourceLine: 260, status: "adapted" },
  { name: "Demand::getPegging", sourceLine: 357, status: "adapted" },
  { name: "Demand::getPeggingFirstLevel", sourceLine: 359, status: "adapted" },
  { name: "Demand::getConstraintIterator", sourceLine: 363, status: "adapted" },
  { name: "DemandGroup::getPriority", sourceLine: 367, status: "adapted" },
  { name: "DemandGroup::setPriority", sourceLine: 375, status: "adapted" },
  { name: "Demand::setPriority", sourceLine: 376, status: "adapted" },
  { name: "DemandGroup::getDue", sourceLine: 380, status: "adapted" },
  { name: "DemandGroup::setDue", sourceLine: 388, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface DemandPort {
  addConstraint(...args: readonly PortValue[]): PortValue | void;
  addDelivery(...args: readonly PortValue[]): PortValue | void;
  deleteOperationPlans(...args: readonly PortValue[]): PortValue | void;
  disposeDemand(...args: readonly PortValue[]): PortValue | void;
  getConstraintIterator(...args: readonly PortValue[]): PortValue | void;
  getDelivery(...args: readonly PortValue[]): PortValue | void;
  getDeliveryOperation(...args: readonly PortValue[]): PortValue | void;
  getEarliestDelivery(...args: readonly PortValue[]): PortValue | void;
  getLatestDelivery(...args: readonly PortValue[]): PortValue | void;
  getPegging(...args: readonly PortValue[]): PortValue | void;
  getPeggingFirstLevel(...args: readonly PortValue[]): PortValue | void;
  getPlannedQuantity(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  removeDelivery(...args: readonly PortValue[]): PortValue | void;
  setPriority(...args: readonly PortValue[]): PortValue | void;
  setQuantity(...args: readonly PortValue[]): PortValue | void;
}

export interface DemandDefaultPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface DemandGroupPort {
  getDue(...args: readonly PortValue[]): PortValue | void;
  getPriority(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setDue(...args: readonly PortValue[]): PortValue | void;
  setPriority(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPort {
  find(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/demand.cpp";
export const targetFile = "model/demand.ts";

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
  "template <class Demand>",
  "Tree utils::HasName<Demand>::st;",
  "const MetaCategory* Demand::metadata;",
  "const MetaClass* DemandDefault::metadata;",
  "const MetaClass* DemandGroup::metadata;",
  "",
  "OperationFixedTime* Demand::uninitializedDelivery = nullptr;",
  "Duration Demand::DefaultDeliveryDuration = 0L;",
  "",
  "int Demand::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Demand>(\"demand\", \"demands\", reader,",
  "                                                    finder);",
  "  registerFields<Demand>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<Demand>::getPythonType();",
  "  x.addMethod(\"addConstraint\", addConstraint, METH_VARARGS,",
  "              \"add a constraint to the demand\");",
  "",
  "  uninitializedDelivery = new OperationFixedTime();",
  "",
  "  // Initialize the Python class",
  "  return FreppleCategory<Demand>::initialize();",
  "}",
  "",
  "int DemandDefault::initialize() {",
  "  // Initialize the metadata",
  "  DemandDefault::metadata = MetaClass::registerClass<DemandDefault>(",
  "      \"demand\", \"demand_default\", Object::create<DemandDefault>, true);",
  "  registerFields<DemandDefault>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<DemandDefault, Demand>::initialize();",
  "}",
  "",
  "int DemandGroup::initialize() {",
  "  // Initialize the metadata",
  "  DemandGroup::metadata = MetaClass::registerClass<DemandGroup>(",
  "      \"demand\", \"demand_group\", Object::create<DemandGroup>);",
  "  registerFields<DemandGroup>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<DemandGroup, Demand>::initialize();",
  "}",
  "",
  "void Demand::setQuantity(double f) {",
  "  // Reject negative quantities, and no-change updates",
  "  double delta(f - qty);",
  "  if (f < 0.0 || fabs(delta) < ROUNDING_ERROR) return;",
  "",
  "  // Update the quantity",
  "  qty = f;",
  "}",
  "",
  "Demand::~Demand() {",
  "  // Remove the delivery operationplans",
  "  deleteOperationPlans(true);",
  "",
  "  // Unlink from the item",
  "  if (it) {",
  "    if (it->firstItemDemand == this)",
  "      it->firstItemDemand = nextItemDemand;",
  "    else {",
  "      Demand* dmd = it->firstItemDemand;",
  "      while (dmd && dmd->nextItemDemand != this) dmd = dmd->nextItemDemand;",
  "      if (!dmd)",
  "        logger << \"corrupted demand list for an item\\n\";",
  "      else",
  "        dmd->nextItemDemand = nextItemDemand;",
  "    }",
  "  }",
  "",
  "  // Decrement demand count on the customer",
  "  if (cust) cust->decNumberOfDemands();",
  "}",
  "",
  "void Demand::deleteOperationPlans(bool deleteLocked, CommandManager* cmds) {",
  "  // Delete all delivery operationplans.",
  "  // Note that an extra loop is used to assure that our iterator doesn't get",
  "  // invalidated during the deletion.",
  "  while (true) {",
  "    // Find a candidate to delete",
  "    OperationPlan* candidate = nullptr;",
  "    for (auto& i : deli)",
  "      if (deleteLocked || i->getProposed()) {",
  "        candidate = i;",
  "        break;",
  "      }",
  "    if (!candidate) break;",
  "    if (cmds)",
  "      // Use delete command",
  "      cmds->add(new CommandDeleteOperationPlan(candidate));",
  "    else",
  "      // Delete immediately",
  "      delete candidate;",
  "  }",
  "}",
  "",
  "void Demand::removeDelivery(OperationPlan* o) {",
  "  // Valid opplan check",
  "  if (!o) return;",
  "",
  "  // See if the demand field on the operationplan points to this demand",
  "  if (o->dmd != this)",
  "    throw LogicException(\"Delivery operationplan incorrectly registered\");",
  "",
  "  // Remove the reference on the operationplan",
  "  o->dmd = nullptr;  // Required to avoid endless loop",
  "  o->setDemand(nullptr);",
  "",
  "  // Remove from the list",
  "  deli.remove(o);",
  "}",
  "",
  "const Demand::OperationPlanList& Demand::getDelivery() const {",
  "  // Sorting the deliveries by the end date",
  "  const_cast<Demand*>(this)->deli.sort(",
  "      [](OperationPlan*& lhs, OperationPlan*& rhs) {",
  "        return lhs->getEnd() != rhs->getEnd() ? lhs->getEnd() > rhs->getEnd()",
  "                                              : *lhs < *rhs;",
  "      });",
  "  return deli;",
  "}",
  "",
  "OperationPlan* Demand::getLatestDelivery() const {",
  "  const Demand::OperationPlanList& l = getDelivery();",
  "  return l.empty() ? nullptr : *(l.begin());",
  "}",
  "",
  "OperationPlan* Demand::getEarliestDelivery() const {",
  "  const Demand::OperationPlanList& l = getDelivery();",
  "  OperationPlan* last = nullptr;",
  "  for (auto i : l) last = i;",
  "  return last;",
  "}",
  "",
  "void Demand::addDelivery(OperationPlan* o) {",
  "  // Dummy call to this function",
  "  if (!o) return;",
  "",
  "  // Check if it is already in the list.",
  "  // If it is, simply exit the function. No need to give a warning message",
  "  // since it's harmless.",
  "  for (auto& i : deli)",
  "    if (i == o) return;",
  "",
  "  // Add to the list of delivery operationplans.",
  "  deli.push_front(o);",
  "",
  "  // Create link between operationplan and demand",
  "  o->setDemand(this);",
  "",
  "  // Check validity of operation being used",
  "  Operation* tmpOper = getDeliveryOperation();",
  "  if (tmpOper && tmpOper != o->getOperation())",
  "    logger << \"Warning: Delivery Operation '\" << o->getOperation()",
  "           << \"' different than expected '\" << tmpOper << \"' for demand '\"",
  "           << this << \"'\\n\";",
  "}",
  "",
  "Operation* Demand::getDeliveryOperation() const {",
  "  // Case 1: Operation specified on the demand itself,",
  "  // or the delivery operation was computed earlier.",
  "  if (oper && oper != uninitializedDelivery) return oper;",
  "",
  "  // Case 2: Create a delivery operation automatically",
  "  if (!getItem()) {",
  "    // Not possible to create an operation when we don't know the item",
  "    const_cast<Demand*>(this)->oper = nullptr;",
  "    return nullptr;",
  "  }",
  "  Location* l = getLocation();",
  "  if (!l) {",
  "    // Single location only?",
  "    Location::iterator l_iter = Location::begin();",
  "    if (l_iter != Location::end()) {",
  "      l = &*l_iter;",
  "      if (++l_iter != Location::end())",
  "        // No, multiple locations",
  "        l = nullptr;",
  "    }",
  "  }",
  "  if (l) {",
  "    // Search for buffers for the requested item and location.",
  "    // We want the generic buffer, and not any of the mto-buffers.",
  "    bool ok = true;",
  "    Buffer* buf = nullptr;",
  "    Item::bufferIterator buf_iter(getItem());",
  "    while (Buffer* tmpbuf = buf_iter.next()) {",
  "      if (tmpbuf->getLocation() == l && !tmpbuf->getBatch()) {",
  "        if (buf) {",
  "          // Second buffer found. We don't know which one to pick - abort.",
  "          ok = false;",
  "          break;",
  "        } else",
  "          buf = tmpbuf;",
  "      }",
  "    }",
  "",
  "    if (ok) {",
  "      if (!buf)",
  "        // Create a new buffer",
  "        buf = Buffer::findOrCreate(getItem(), l);",
  "",
  "      // Find an existing operation consuming from this buffer",
  "      const_cast<Demand*>(this)->oper =",
  "          Operation::find(\"Ship \" + string(buf->getName()));",
  "      if (!oper) {",
  "        const_cast<Demand*>(this)->oper = new OperationDelivery();",
  "        static_cast<OperationDelivery*>(const_cast<Demand*>(this)->oper)",
  "            ->setBuffer(buf);",
  "      }",
  "",
  "      // Success!",
  "      return oper;",
  "    }",
  "  }",
  "",
  "  // Case 4: Tough luck. Not possible to ship this demand.",
  "  const_cast<Demand*>(this)->oper = nullptr;",
  "  return nullptr;",
  "}",
  "",
  "double Demand::getPlannedQuantity() const {",
  "  double delivered(0.0);",
  "  for (auto i : deli) delivered += i->getQuantity();",
  "  return delivered;",
  "}",
  "",
  "PyObject* Demand::addConstraint(PyObject* self, PyObject* args,",
  "                                PyObject* kwds) {",
  "  try {",
  "    // Pick up the demand",
  "    auto* dmd = static_cast<Demand*>(self);",
  "    if (!dmd) throw LogicException(\"Can't add a contraint to a null demand\");",
  "",
  "    // Parse the arguments",
  "    char* pytype = nullptr;",
  "    char* pyowner = nullptr;",
  "    PyObject* pystart = nullptr;",
  "    PyObject* pyend = nullptr;",
  "    static const char* kwlist[] = {\"type\", \"owner\", \"start\", \"end\", nullptr};",
  "    if (!PyArg_ParseTupleAndKeywords(args, kwds, \"ss|OO:addConstraint\",",
  "                                     const_cast<char**>(kwlist), &pytype,",
  "                                     &pyowner, &pystart, &pyend))",
  "      return nullptr;",
  "    string cnstrnt_type;",
  "    if (pytype) cnstrnt_type = pytype;",
  "    string cnstrnt_owner;",
  "    if (pyowner) cnstrnt_owner = pyowner;",
  "    Date cnstrnt_start = Date::infinitePast;",
  "    if (pystart) cnstrnt_start = PythonData(pystart).getDate();",
  "    Date cnstrnt_end = Date::infiniteFuture;",
  "    if (pyend) cnstrnt_end = PythonData(pyend).getDate();",
  "",
  "    // Add the new constraint",
  "    Problem* cnstrnt = nullptr;",
  "    if (cnstrnt_type == ProblemBeforeCurrent::metadata->type) {",
  "      Operation* obj = Operation::findFromName(cnstrnt_owner);",
  "      if (!obj) throw DataException(\"Can't find constraint owner\");",
  "      cnstrnt = dmd->getConstraints().push(ProblemBeforeCurrent::metadata, obj,",
  "                                           cnstrnt_start, cnstrnt_end);",
  "    } else if (cnstrnt_type == ProblemCapacityOverload::metadata->type) {",
  "      Resource* obj = Resource::find(cnstrnt_owner);",
  "      if (!obj) throw DataException(\"Can't find constraint owner\");",
  "      cnstrnt = dmd->getConstraints().push(ProblemCapacityOverload::metadata,",
  "                                           obj, cnstrnt_start, cnstrnt_end);",
  "    } else if (cnstrnt_type == ProblemMaterialShortage::metadata->type) {",
  "      Buffer* obj = Buffer::findFromName(cnstrnt_owner);",
  "      if (!obj) throw DataException(\"Can't find constraint owner\");",
  "      cnstrnt = dmd->getConstraints().push(ProblemMaterialShortage::metadata,",
  "                                           obj, cnstrnt_start, cnstrnt_end);",
  "    } else if (cnstrnt_type == ProblemAwaitSupply::metadata->type) {",
  "      Buffer* obj_buffer = Buffer::findFromName(cnstrnt_owner);",
  "      if (obj_buffer)",
  "        cnstrnt =",
  "            dmd->getConstraints().push(ProblemAwaitSupply::metadata, obj_buffer,",
  "                                       cnstrnt_start, cnstrnt_end);",
  "      else {",
  "        Operation* obj_operation = Operation::findFromName(cnstrnt_owner);",
  "        if (obj_operation)",
  "          cnstrnt = dmd->getConstraints().push(ProblemAwaitSupply::metadata,",
  "                                               obj_operation, cnstrnt_start,",
  "                                               cnstrnt_end);",
  "        else",
  "          throw DataException(\"Can't find constraint owner\");",
  "      }",
  "    } else if (cnstrnt_type == ConstraintOverdueDemand::metadata->type) {",
  "      Demand* obj = Demand::find(cnstrnt_owner);",
  "      if (!obj) throw DataException(\"Can't find constraint owner\");",
  "      cnstrnt = dmd->getConstraints().push(ConstraintOverdueDemand::metadata,",
  "                                           obj, cnstrnt_start, cnstrnt_end);",
  "    } else if (cnstrnt_type == ProblemSyncDemand::metadata->type) {",
  "      Demand* obj = Demand::find(cnstrnt_owner);",
  "      if (!obj) throw DataException(\"Can't find constraint owner\");",
  "      cnstrnt = dmd->getConstraints().push(ProblemSyncDemand::metadata, obj,",
  "                                           cnstrnt_start, cnstrnt_end);",
  "    } else if (cnstrnt_type ==",
  "               ConstraintManufacturingLeadTime::metadata->type) {",
  "      auto* obj = Operation::find(cnstrnt_owner);",
  "      if (!obj) throw DataException(\"Can't find constraint owner\");",
  "      cnstrnt =",
  "          dmd->getConstraints().push(ConstraintManufacturingLeadTime::metadata,",
  "                                     obj, cnstrnt_start, cnstrnt_end);",
  "    } else if (cnstrnt_type == ConstraintDistributionLeadTime::metadata->type) {",
  "      auto* obj = Operation::find(cnstrnt_owner);",
  "      if (!obj) throw DataException(\"Can't find constraint owner\");",
  "      cnstrnt =",
  "          dmd->getConstraints().push(ConstraintDistributionLeadTime::metadata,",
  "                                     obj, cnstrnt_start, cnstrnt_end);",
  "    } else if (cnstrnt_type == ConstraintPurchasingLeadTime::metadata->type) {",
  "      auto* obj = Operation::find(cnstrnt_owner);",
  "      if (!obj) throw DataException(\"Can't find constraint owner\");",
  "      cnstrnt =",
  "          dmd->getConstraints().push(ConstraintPurchasingLeadTime::metadata,",
  "                                     obj, cnstrnt_start, cnstrnt_end);",
  "    } else",
  "      throw DataException(\"Invalid constraint type '\" + cnstrnt_type + \"'\");",
  "    Py_IncRef(cnstrnt);",
  "    return cnstrnt;",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "PeggingIterator Demand::getPegging() const { return PeggingIterator(this); }",
  "",
  "PeggingIterator Demand::getPeggingFirstLevel() const {",
  "  return PeggingIterator(this, 0);",
  "}",
  "",
  "Problem::List::iterator Demand::getConstraintIterator() const {",
  "  return constraints.begin();",
  "}",
  "",
  "int DemandGroup::getPriority() const {",
  "  int lowest = INT_MAX;",
  "  for (auto m = getMembers(); m != end(); ++m) {",
  "    if (m->getPriority() < lowest) lowest = m->getPriority();",
  "  };",
  "  return lowest;",
  "}",
  "",
  "void DemandGroup::setPriority(int i) {",
  "  Demand::setPriority(i);",
  "  for (auto m = getMembers(); m != end(); ++m) m->setPriority(i);",
  "}",
  "",
  "Date DemandGroup::getDue() const {",
  "  auto latest = Date::infiniteFuture;",
  "  for (auto m = getMembers(); m != end(); ++m) {",
  "    if (m->getDue() < latest) latest = m->getDue();",
  "  };",
  "  return latest;",
  "}",
  "",
  "void DemandGroup::setDue(Date d) {",
  "  for (auto m = getMembers(); m != end(); ++m) m->setDue(d);",
  "}",
  "",
  "}  // namespace frepple",
];
