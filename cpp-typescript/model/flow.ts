// <header-api-generated>
export const FlowCppModel = { bases: ["HasSource","Node","Object","Solvable"] as const, methods: ["computeFlowToOperationDate","computeOperationToFlowDate","finder","getAlternate","getBuffer","getFlowplanDateQuantity","getHidden","getItem","getLocation","getOffset","getOperation","getQuantity","getQuantityFixed","getSearch","getType","getTypeName","hasAlternates","initialize","isConsumer","isProducer","registerFields","setBuffer","setItem","setLocation","setOffset","setOperation","setQuantity","setQuantityFixed","setSearch","solve"] as const, qualifiedNames: ["Flow"] as const };

export const FlowEndCppModel = { bases: ["Flow"] as const, methods: ["computeFlowToOperationDate","computeOperationToFlowDate","getFlowplanDateQuantity","getType","solve"] as const, qualifiedNames: ["FlowEnd"] as const };

export const FlowStartCppModel = { bases: ["Flow"] as const, methods: ["computeFlowToOperationDate","computeOperationToFlowDate","getFlowplanDateQuantity","getType","solve"] as const, qualifiedNames: ["FlowStart"] as const };

export const FlowTransferBatchCppModel = { bases: ["Flow"] as const, methods: ["computeFlowToOperationDate","computeOperationToFlowDate","getFlowplanDateQuantity","getTransferBatch","getType","registerFields","setTransferBatch","solve"] as const, qualifiedNames: ["FlowTransferBatch"] as const };
// </header-api-generated>







import { Date as PlanningDate, DateRange, Duration } from "../utils/date.js";
import { AssociationEntity, DataException, Environment, HeaderModelAdapter, LogicException } from "../utils/library.js";
import { Buffer } from "./buffer.js";
import type { Item } from "./item.js";
import type { Location } from "./location.js";
import type { Operation } from "./operation.js";
import { Plan } from "./plan.js";
import { HasLevel } from "./leveled.js";

type DateInput = PlanningDate | string | number;
type DurationInput = Duration | string | number;
type FlowPlanLike = HeaderModelAdapter | Readonly<Record<string, unknown>>;

export interface FlowFinder {
  readonly operation?: Operation | null;
  readonly buffer?: Buffer | null;
  readonly effective_start?: DateInput;
  readonly effective_end?: DateInput;
  readonly priority?: number;
  readonly name?: string;
}

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function asDate(value: unknown, fallback = PlanningDate.infinitePast): PlanningDate {
  if (value instanceof PlanningDate) return new PlanningDate(value);
  return typeof value === "string" || typeof value === "number" ? new PlanningDate(value) : new PlanningDate(fallback);
}

function asDuration(value: DurationInput): Duration {
  return value instanceof Duration ? new Duration(value) : new Duration(value);
}

function dateMatches(left: PlanningDate, right: DateInput | undefined): boolean {
  return right === undefined || left.equals(asDate(right));
}

function link(source: HeaderModelAdapter, property: string, previous: HeaderModelAdapter | null, next: HeaderModelAdapter | null): void {
  if (previous === next) return;
  previous?.modelReferenceRemoved(source, property);
  next?.modelReferenceAdded(source, property);
}

function operationPlan(flowPlan: FlowPlanLike): unknown { return call(flowPlan, "getOperationPlan"); }
function operationOf(flowPlan: FlowPlanLike): Operation | null {
  return (call(flowPlan, "getOperation") ?? call(operationPlan(flowPlan), "getOperation")) as Operation | null ?? null;
}
function planDate(plan: unknown, method: string, fallback = PlanningDate.infinitePast): PlanningDate {
  return asDate(call(plan, method), fallback);
}
function bool(plan: unknown, method: string, fallback = false): boolean {
  const result = call(plan, method);
  return result === undefined ? fallback : Boolean(result);
}
function number(plan: unknown, method: string, fallback = 0): number {
  const result = call(plan, method);
  return result === undefined ? fallback : Number(result);
}

/** Material association between an operation and a buffer. */
export abstract class Flow extends AssociationEntity<Operation, Buffer> {
  static readonly cppBases: readonly string[] = ["HasSource", "Node", "Object", "Solvable"];
  static readonly cppQualifiedNames: readonly string[] = ["Flow"];
  private item: Item | null = null;
  private location: Location | null = null;
  private quantity = 0;
  private quantityFixed = 0;
  private offset = new Duration();
  private search = "PRIORITY";

  constructor();
  constructor(operation: Operation | null, buffer: Buffer | null, quantity: number, recomputeLevels?: boolean);
  constructor(operation: Operation | null, buffer: Buffer | null, quantity: number, effective: DateRange, recomputeLevels?: boolean);
  constructor(operation?: Operation | null, buffer?: Buffer | null, quantity = 0, effectiveOrRecompute: DateRange | boolean = true, _recomputeLevels = true) {
    super();
    this.quantity = Number(quantity);
    this.setBuffer(buffer ?? null);
    this.setOperation(operation ?? null);
    if (effectiveOrRecompute instanceof DateRange) this.setEffective(effectiveOrRecompute);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static finder(fields: FlowFinder): Flow | null {
    if (!fields.operation || !fields.buffer) return null;
    for (const flow of fields.operation.getFlows()) {
      if (!(flow instanceof Flow) || flow.getBuffer() !== fields.buffer) continue;
      if (!dateMatches(flow.getEffectiveStart(), fields.effective_start)) continue;
      if (!dateMatches(flow.getEffectiveEnd(), fields.effective_end)) continue;
      if (fields.priority !== undefined && flow.getPriority() !== Math.trunc(fields.priority)) continue;
      if (fields.name !== undefined && flow.getName() !== fields.name) continue;
      return flow;
    }
    return null;
  }
  finder(fields: FlowFinder): Flow | null { return Flow.finder(fields); }
  getOperation(): Operation | null { return this.getPtrA(); }
  setOperation(value: Operation | null): void {
    this.assignPtrA(value, "Operation");
    value?.updateMTO();
    HasLevel.triggerLazyRecomputation();
  }
  getBuffer(): Buffer {
    const current = this.getPtrB();
    if (current) return current;
    const operationLocation = this.getOperation()?.getLocation() ?? null;
    if (this.item && (this.location || operationLocation)) {
      const created = Buffer.findOrCreate(this.item, this.location ?? operationLocation);
      if (created) this.assignPtrB(created, "Buffer");
    }
    const result = this.getPtrB();
    if (!result) throw new DataException("Flow doesn't have a buffer");
    return result;
  }
  setBuffer(value: Buffer | null): void { this.assignPtrB(value, "Buffer"); HasLevel.triggerLazyRecomputation(); }
  getItem(): Item | null { return this.getPtrB()?.getItem() ?? this.item; }
  setItem(value: Item | null): void {
    if (this.getPtrB() && this.getPtrB()?.getItem() !== value) throw new DataException("Invalid update of operationmaterial");
    link(this, "Item", this.item, value);
    this.item = value;
  }
  getLocation(): Location | null { return this.location; }
  setLocation(value: Location | null): void {
    link(this, "Location", this.location, value);
    this.location = value;
  }
  isConsumer(): boolean { return this.quantity < 0 || this.quantityFixed < 0; }
  isProducer(): boolean { return this.quantity > 0 || this.quantityFixed > 0 || (this.quantity === 0 && this.quantityFixed === 0); }
  getQuantity(): number { return this.quantity; }
  setQuantity(value: number): void {
    const next = Number(value);
    if ((next > 0 && this.quantityFixed < 0) || (next < 0 && this.quantityFixed > 0)) {
      Environment.log("Warning: Quantity and quantity_fixed must have equal sign");
      return;
    }
    this.quantity = next;
  }
  getQuantityFixed(): number { return this.quantityFixed; }
  setQuantityFixed(value: number): void {
    const next = Number(value);
    if ((this.quantity > 0 && next < 0) || (this.quantity < 0 && next > 0)) {
      Environment.log("Warning: Quantity and quantity_fixed must have equal sign");
      return;
    }
    this.quantityFixed = next;
  }
  getOffset(): Duration { return new Duration(this.offset); }
  setOffset(value: DurationInput): void { this.offset = asDuration(value); }
  getAlternate(): Flow | null {
    const operation = this.getOperation();
    if (!this.getName() || !operation) return null;
    for (const candidate of operation.getFlows()) {
      if (!(candidate instanceof Flow)) continue;
      if (candidate === this && this.getPriority() !== 0) return null;
      if (candidate.getName() === this.getName() && candidate.getPriority() !== 0) return candidate;
    }
    return null;
  }
  hasAlternates(): boolean {
    const operation = this.getOperation();
    return Boolean(this.getName() && operation?.getFlows().some((candidate) =>
      candidate instanceof Flow && candidate !== this && candidate.getName() === this.getName() && candidate.getPriority() !== 0));
  }
  getSearch(): string { return this.search; }
  setSearch(value: string): void {
    const normalized = String(value).toUpperCase().replaceAll("-", "").replaceAll("_", "");
    const modes: Readonly<Record<string, string>> = {
      PRIORITY: "PRIORITY", MINCOST: "MINCOST", MINPENALTY: "MINPENALTY", MINCOSTPENALTY: "MINCOSTPENALTY",
    };
    const mode = modes[normalized];
    if (!mode) throw new LogicException("Invalid search mode");
    this.search = mode;
  }
  override getHidden(): boolean { return this.getBuffer().getHidden() || Boolean(this.getOperation()?.getHidden()); }
  override setHidden(_value: boolean): void {}
  getTypeName(): string { return this.getType(); }
  abstract getType(): string;
  abstract getFlowplanDateQuantity(flowPlan: FlowPlanLike): readonly [PlanningDate, number];
  abstract computeFlowToOperationDate(operationPlan: unknown, date: DateInput): PlanningDate;
  abstract computeOperationToFlowDate(operationPlan: unknown, date: DateInput): PlanningDate;
  solve(solver: unknown, payload?: unknown): unknown { return call(solver, "solve", this, payload); }

  protected quantityAt(flowPlan: FlowPlanLike, date: PlanningDate): number {
    const plan = operationPlan(flowPlan);
    const operation = operationOf(flowPlan);
    const correction = operation?.getType() === "operation_fixed_time" && operation.getName().startsWith("Correction for ");
    let adjustedDate = date;
    if (bool(plan, "getConfirmed") && !bool(plan, "getCompleted") && adjustedDate.compare(Plan.instance().getCurrent()) < 0 &&
        operation?.getType() !== "operation_inventory" && !correction) adjustedDate = Plan.instance().getCurrent().add(new Duration(1));
    if (this.isConsumer() && !bool(plan, "getConsumeMaterial", true)) return 0;
    if (this.isProducer() && !bool(plan, "getProduceMaterial", true)) return 0;
    const confirmedQuantity = call(flowPlan, "getConfirmed");
    if (confirmedQuantity !== undefined && Boolean(confirmedQuantity)) return number(flowPlan, "getQuantity");
    const quantity = number(plan, "getQuantity");
    if (!quantity || !this.getEffective().within(planDate(plan, "getEnd", adjustedDate))) return 0;
    const result = this.quantityFixed + quantity * this.quantity;
    if (number(plan, "getQuantityCompleted") && (this.isConsumer() || !Plan.instance().getWipProduceFullQuantity())) {
      return result * number(plan, "getQuantityRemaining") / quantity;
    }
    return result;
  }

  protected disposeFlowPlans(): void {
    const operation = this.getOperation();
    if (!operation || !this.getPtrB()) return;
    for (const plan of operation.getOperationPlans()) {
      const plans = call(plan, "getFlowPlans");
      if (!plans || typeof (plans as Iterable<unknown>)[Symbol.iterator] !== "function") continue;
      for (const flowPlan of [...plans as Iterable<HeaderModelAdapter>]) if (call(flowPlan, "getFlow") === this) flowPlan.dispose();
    }
  }
  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Item") { this.item = null; }
    else if (property === "Location") { this.location = null; }
    else super.modelReferenceTargetDisposed(target, property);
  }
  override dispose(): void {
    this.disposeFlowPlans();
    link(this, "Item", this.item, null);
    link(this, "Location", this.location, null);
    this.item = null;
    this.location = null;
    super.dispose();
  }
}

export class FlowStart extends Flow {
  static override readonly cppBases: readonly string[] = ["Flow"];
  static override readonly cppQualifiedNames: readonly string[] = ["FlowStart"];
  override getType(): string { return "flow_start"; }
  override getFlowplanDateQuantity(flowPlan: FlowPlanLike): readonly [PlanningDate, number] {
    const plan = operationPlan(flowPlan);
    let date = planDate(plan, "getSetupEnd", planDate(plan, "getStart"));
    if (!this.getOffset().isZero() && !bool(plan, "getCompleted")) {
      const range = this.getOperation()?.calculateOperationTime(plan, date, this.getOffset(), true, null, this.getOffset().seconds > 0);
      if (range) date = this.getOffset().seconds > 0 ? range.getEnd() : range.getStart();
    }
    return [date, this.quantityAt(flowPlan, date)];
  }
  override computeFlowToOperationDate(plan: unknown, value: DateInput): PlanningDate {
    const date = asDate(value);
    if (this.getOffset().isZero() || bool(plan, "getCompleted")) return date;
    const range = this.getOperation()?.calculateOperationTime(plan, date, this.getOffset(), false, null, this.getOffset().seconds > 0);
    return range ? (this.getOffset().seconds > 0 ? range.getStart() : range.getEnd()) : date;
  }
  override computeOperationToFlowDate(plan: unknown, value: DateInput): PlanningDate {
    const date = asDate(value);
    if (this.getOffset().isZero() || bool(plan, "getCompleted")) return date;
    const range = this.getOperation()?.calculateOperationTime(plan, date, this.getOffset(), true, null, this.getOffset().seconds > 0);
    return range ? (this.getOffset().seconds > 0 ? range.getEnd() : range.getStart()) : date;
  }
}

export class FlowEnd extends Flow {
  static override readonly cppBases: readonly string[] = ["Flow"];
  static override readonly cppQualifiedNames: readonly string[] = ["FlowEnd"];
  override getType(): string { return "flow_end"; }
  override getFlowplanDateQuantity(flowPlan: FlowPlanLike): readonly [PlanningDate, number] {
    const plan = operationPlan(flowPlan);
    let date = planDate(plan, "getEnd");
    if (!this.getOffset().isZero() && !bool(plan, "getCompleted")) {
      const range = this.getOperation()?.calculateOperationTime(plan, date, this.getOffset(), true, null, this.getOffset().seconds < 0);
      if (range) date = this.getOffset().seconds > 0 ? range.getEnd() : range.getStart();
    }
    return [date, this.quantityAt(flowPlan, date)];
  }
  override computeFlowToOperationDate(plan: unknown, value: DateInput): PlanningDate {
    const date = asDate(value);
    if (this.getOffset().isZero() || bool(plan, "getCompleted")) return date;
    const range = this.getOperation()?.calculateOperationTime(plan, date, this.getOffset(), false, null, this.getOffset().seconds < 0);
    return range ? (this.getOffset().seconds > 0 ? range.getStart() : range.getEnd()) : date;
  }
  override computeOperationToFlowDate(plan: unknown, value: DateInput): PlanningDate {
    const date = asDate(value);
    if (this.getOffset().isZero() || bool(plan, "getCompleted")) return date;
    const range = this.getOperation()?.calculateOperationTime(plan, date, this.getOffset(), true, null, this.getOffset().seconds < 0);
    return range ? (this.getOffset().seconds > 0 ? range.getEnd() : range.getStart()) : date;
  }
}

export class FlowTransferBatch extends Flow {
  static override readonly cppBases: readonly string[] = ["Flow"];
  static override readonly cppQualifiedNames: readonly string[] = ["FlowTransferBatch"];
  private transferBatch = 0;
  static override registerFields(): number { return 0; }
  override getType(): string { return "flow_transfer_batch"; }
  getTransferBatch(): number { return this.transferBatch; }
  setTransferBatch(value: number): void {
    const next = Number(value);
    if (next < 0) Environment.log("Warning: Transfer batch size must be greater than or equal to 0");
    else this.transferBatch = next;
  }
  override getFlowplanDateQuantity(flowPlan: FlowPlanLike): readonly [PlanningDate, number] {
    const plan = operationPlan(flowPlan);
    const setupEnd = planDate(plan, "getSetupEnd", planDate(plan, "getStart"));
    const end = planDate(plan, "getEnd");
    if (!this.transferBatch || setupEnd.equals(end)) {
      const date = this.isConsumer() ? setupEnd : end;
      return [date, this.quantityAt(flowPlan, date)];
    }
    let total = this.quantityAt(flowPlan, end);
    let batchQuantity = this.transferBatch;
    let batches = Math.ceil(Math.abs(total) / batchQuantity) || 1;
    if (batches > 50) { batches = 50; batchQuantity = Math.abs(total) / 50; }
    const values = call(plan, "getFlowPlans");
    const matching = values && typeof (values as Iterable<unknown>)[Symbol.iterator] === "function"
      ? [...values as Iterable<FlowPlanLike>].filter((candidate) => call(candidate, "getFlow") === this) : [flowPlan];
    const count = Math.max(0, matching.indexOf(flowPlan));
    if (count === 0) call(plan, "ensureFlowPlansForFlow", this, batches);
    const actual: Duration[] = [];
    const operation = this.getOperation();
    const effective = operation?.calculateOperationTime(plan, setupEnd, end, actual);
    const operationDate = effective?.getStart() ?? setupEnd;
    const duration = Math.trunc((actual[0]?.seconds ?? end.getTicks() - setupEnd.getTicks()) / batches);
    if (this.getQuantity() > 0 || this.getQuantityFixed() > 0) {
      const date = operation?.calculateOperationTime(plan, operationDate, new Duration(duration * (count + 1)), true).getEnd() ?? end;
      total = Math.max(0, total - count * batchQuantity);
      return [date, Math.min(batchQuantity, total)];
    }
    const date = operation?.calculateOperationTime(plan, operationDate, new Duration(duration * count), true).getEnd() ?? setupEnd;
    total = Math.min(0, total + count * batchQuantity);
    return [date, Math.max(-batchQuantity, total)];
  }
  override computeFlowToOperationDate(_plan: unknown, value: DateInput): PlanningDate { return asDate(value); }
  override computeOperationToFlowDate(_plan: unknown, value: DateInput): PlanningDate { return asDate(value); }
}




















/**
 * Semantic migration unit for src/model/flow.cpp.
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
  { name: "Flow::initialize", sourceLine: 34, status: "adapted" },
  { name: "Flow::~Flow", sourceLine: 76, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 78, status: "adapted" },
  { name: "Flow::create", sourceLine: 99, status: "adapted" },
  { name: "Flow::finder", sourceLine: 201, status: "adapted" },
  { name: "FlowStart::getFlowplanDateQuantity", sourceLine: 238, status: "adapted" },
  { name: "Plan::instance", sourceLine: 254, status: "adapted" },
  { name: "FlowEnd::getFlowplanDateQuantity", sourceLine: 279, status: "adapted" },
  { name: "Plan::instance", sourceLine: 293, status: "adapted" },
  { name: "FlowTransferBatch::getFlowplanDateQuantity", sourceLine: 318, status: "adapted" },
  { name: "Plan::instance", sourceLine: 332, status: "adapted" },
  { name: "FlowEnd::computeFlowToOperationDate", sourceLine: 450, status: "adapted" },
  { name: "FlowEnd::computeOperationToFlowDate", sourceLine: 457, status: "adapted" },
  { name: "FlowStart::computeFlowToOperationDate", sourceLine: 464, status: "adapted" },
  { name: "FlowStart::computeOperationToFlowDate", sourceLine: 472, status: "adapted" },
  { name: "FlowTransferBatch::computeFlowToOperationDate", sourceLine: 480, status: "adapted" },
  { name: "FlowTransferBatch::computeOperationToFlowDate", sourceLine: 485, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface FlowPort {
  create(...args: readonly PortValue[]): PortValue | void;
  disposeFlow(...args: readonly PortValue[]): PortValue | void;
  finder(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface FlowEndPort {
  computeFlowToOperationDate(...args: readonly PortValue[]): PortValue | void;
  computeOperationToFlowDate(...args: readonly PortValue[]): PortValue | void;
  getFlowplanDateQuantity(...args: readonly PortValue[]): PortValue | void;
}

export interface FlowStartPort {
  computeFlowToOperationDate(...args: readonly PortValue[]): PortValue | void;
  computeOperationToFlowDate(...args: readonly PortValue[]): PortValue | void;
  getFlowplanDateQuantity(...args: readonly PortValue[]): PortValue | void;
}

export interface FlowTransferBatchPort {
  computeFlowToOperationDate(...args: readonly PortValue[]): PortValue | void;
  computeOperationToFlowDate(...args: readonly PortValue[]): PortValue | void;
  getFlowplanDateQuantity(...args: readonly PortValue[]): PortValue | void;
}

export interface HasLevelPort {
  triggerLazyRecomputation(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/flow.cpp";
export const targetFile = "model/flow.ts";

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
  "const MetaCategory* Flow::metadata;",
  "const MetaClass* FlowStart::metadata;",
  "const MetaClass* FlowEnd::metadata;",
  "const MetaClass* FlowTransferBatch::metadata;",
  "",
  "int Flow::initialize() {",
  "  // Initialize the metadata",
  "  int ok = 0;",
  "  metadata = MetaCategory::registerCategory<Flow>(",
  "      \"flow\", \"flows\", Association<Operation, Buffer, Flow>::reader, finder);",
  "  registerFields<Flow>(const_cast<MetaCategory*>(metadata));",
  "  FlowStart::metadata = MetaClass::registerClass<FlowStart>(",
  "      \"flow\", \"flow_start\", Object::create<FlowStart>, true);",
  "  FlowEnd::metadata = MetaClass::registerClass<FlowEnd>(",
  "      \"flow\", \"flow_end\", Object::create<FlowEnd>);",
  "  FlowTransferBatch::metadata = MetaClass::registerClass<FlowTransferBatch>(",
  "      \"flow\", \"flow_transfer_batch\", Object::create<FlowTransferBatch>);",
  "  FlowTransferBatch::registerFields<FlowTransferBatch>(",
  "      const_cast<MetaClass*>(FlowTransferBatch::metadata));",
  "",
  "  // Initialize the FlowTransferBatch type",
  "  auto& t = FreppleClass<FlowTransferBatch, Flow>::getPythonType();",
  "  t.setName(FlowTransferBatch::metadata->type);",
  "  t.setDoc(\"frePPLe \" + FlowTransferBatch::metadata->type);",
  "  t.supportgetattro();",
  "  t.supportsetattro();",
  "  t.supportstr();",
  "  t.supportcompare();",
  "  t.supportcreate(FlowTransferBatch::create);",
  "  t.setBase(Flow::metadata->pythonClass);",
  "  t.addMethod(\"toXML\", FlowTransferBatch::toXML, METH_VARARGS,",
  "              \"return a XML representation\");",
  "  FlowTransferBatch::metadata->setPythonClass(t);",
  "  ok += t.typeReady();",
  "",
  "  // Initialize the Flow type",
  "  auto& x = FreppleCategory<Flow>::getPythonType();",
  "  x.setName(\"flow\");",
  "  x.setDoc(\"frePPLe flow\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  metadata->setPythonClass(x);",
  "  return ok + x.typeReady();",
  "}",
  "",
  "Flow::~Flow() {",
  "  // Set a flag to make sure the level computation is triggered again",
  "  HasLevel::triggerLazyRecomputation();",
  "",
  "  // Delete existing flowplans",
  "  if (getOperation() && getBuffer()) {",
  "    // Loop over operationplans",
  "    for (OperationPlan::iterator i(getOperation()); i != OperationPlan::end();",
  "         ++i)",
  "      // Loop over flowplans",
  "      for (auto j = i->beginFlowPlans(); j != i->endFlowPlans();) {",
  "        if (j->getFlow() == this)",
  "          j.deleteFlowPlan();",
  "        else",
  "          ++j;",
  "      }",
  "  }",
  "",
  "  // Delete the flow from the operation and the buffer",
  "  if (getOperation()) getOperation()->flowdata.erase(this);",
  "  if (getBuffer()) getBuffer()->flows.erase(this);",
  "}",
  "",
  "PyObject* Flow::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Pick up the operation",
  "    PyObject* oper = PyDict_GetItemString(kwds, \"operation\");",
  "    if (!oper) throw DataException(\"missing operation on Flow\");",
  "    if (!PyObject_TypeCheck(oper, Operation::metadata->pythonClass))",
  "      throw DataException(\"flow operation must be of type operation\");",
  "    else if (!static_cast<Operation*>(oper)->getLocation())",
  "      throw DataException(\"operation location is unspecified\");",
  "",
  "    // Pick up the item",
  "    PyObject* item = PyDict_GetItemString(kwds, \"item\");",
  "    if (!item) throw DataException(\"missing item on Flow\");",
  "    if (!PyObject_TypeCheck(item, Item::metadata->pythonClass))",
  "      throw DataException(\"flow item must be of type item\");",
  "",
  "    // Pick up the optional location",
  "    PyObject* location = PyDict_GetItemString(kwds, \"location\");",
  "    if (location == Py_None)",
  "      location = nullptr;",
  "    else if (location &&",
  "             !PyObject_TypeCheck(location, Location::metadata->pythonClass))",
  "      throw DataException(\"flow location must be of type location\");",
  "",
  "    // Pick up the quantity",
  "    PyObject* q1 = PyDict_GetItemString(kwds, \"quantity\");",
  "    double q2 = q1 ? PythonData(q1).getDouble() : 1.0;",
  "",
  "    // Pick up the effectivity dates",
  "    DateRange eff;",
  "    PyObject* eff_start = PyDict_GetItemString(kwds, \"effective_start\");",
  "    if (eff_start) {",
  "      PythonData d(eff_start);",
  "      eff.setStart(d.getDate());",
  "    }",
  "    PyObject* eff_end = PyDict_GetItemString(kwds, \"effective_end\");",
  "    if (eff_end) {",
  "      PythonData d(eff_end);",
  "      eff.setEnd(d.getDate());",
  "    }",
  "",
  "    // Find or create a buffer for the item at the operation location",
  "    Buffer* buf = Buffer::findOrCreate(",
  "        static_cast<Item*>(item),",
  "        location ? static_cast<Location*>(location)",
  "                 : static_cast<Operation*>(oper)->getLocation());",
  "",
  "    // Pick up the type and create the flow",
  "    Flow* l;",
  "    PyObject* t = PyDict_GetItemString(kwds, \"type\");",
  "    if (t) {",
  "      PythonData d(t);",
  "      if (d.getString() == \"flow_end\")",
  "        l = new FlowEnd(static_cast<Operation*>(oper),",
  "                        static_cast<Buffer*>(buf), q2);",
  "      else if (d.getString() == \"flow_transfer_batch\")",
  "        l = new FlowTransferBatch(static_cast<Operation*>(oper),",
  "                                  static_cast<Buffer*>(buf), q2);",
  "      else",
  "        l = new FlowStart(static_cast<Operation*>(oper),",
  "                          static_cast<Buffer*>(buf), q2);",
  "    } else",
  "      l = new FlowStart(static_cast<Operation*>(oper),",
  "                        static_cast<Buffer*>(buf), q2);",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    if (l) {",
  "      l->setEffective(eff);",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        if (!attr.isA(Tags::effective_end) &&",
  "            !attr.isA(Tags::effective_start) && !attr.isA(Tags::operation) &&",
  "            !attr.isA(Tags::item) && !attr.isA(Tags::location) &&",
  "            !attr.isA(Tags::quantity) && !attr.isA(Tags::type) &&",
  "            !attr.isA(Tags::action)) {",
  "          const MetaFieldBase* fmeta = l->getType().findField(attr.getHash());",
  "          if (!fmeta && l->getType().category)",
  "            fmeta = l->getType().category->findField(attr.getHash());",
  "          if (fmeta)",
  "            // Update the attribute",
  "            fmeta->setField(l, field);",
  "          else",
  "            l->setProperty(attr.getName(), value);",
  "        }",
  "      };",
  "    }",
  "",
  "    // Return the object",
  "    Py_INCREF(l);",
  "    return static_cast<PyObject*>(l);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "Object* Flow::finder(const DataValueDict& d) {",
  "  // Check operation",
  "  const DataValue* tmp = d.get(Tags::operation);",
  "  if (!tmp) return nullptr;",
  "  auto* oper = static_cast<Operation*>(tmp->getObject());",
  "",
  "  // Check buffer field",
  "  tmp = d.get(Tags::buffer);",
  "  if (!tmp) return nullptr;",
  "  auto* buf = static_cast<Buffer*>(tmp->getObject());",
  "",
  "  // Walk over all flows of the operation, and return",
  "  // the first one with matching",
  "  const DataValue* hasEffectiveStart = d.get(Tags::effective_start);",
  "  Date effective_start;",
  "  if (hasEffectiveStart) effective_start = hasEffectiveStart->getDate();",
  "  const DataValue* hasEffectiveEnd = d.get(Tags::effective_end);",
  "  Date effective_end;",
  "  if (hasEffectiveEnd) effective_end = hasEffectiveEnd->getDate();",
  "  const DataValue* hasPriority = d.get(Tags::priority);",
  "  int priority = 1;",
  "  if (hasPriority) priority = hasPriority->getInt();",
  "  const DataValue* hasName = d.get(Tags::name);",
  "  string name;",
  "  if (hasName) name = hasName->getString();",
  "  for (const auto& fl : oper->getFlows()) {",
  "    if (fl.getBuffer() != buf) continue;",
  "    if (hasEffectiveStart && fl.getEffectiveStart() != effective_start)",
  "      continue;",
  "    if (hasEffectiveEnd && fl.getEffectiveEnd() != effective_end) continue;",
  "    if (hasPriority && fl.getPriority() != priority) continue;",
  "    if (hasName && fl.getName() != name) continue;",
  "    return const_cast<Flow*>(&fl);",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "pair<Date, double> FlowStart::getFlowplanDateQuantity(",
  "    const FlowPlan* fl) const {",
  "  auto offset = fl->getFlow()->getOffset();",
  "  auto dt = fl->getOperationPlan()->getSetupEnd();",
  "  if (offset && !fl->getOperationPlan()->getCompleted()) {",
  "    DateRange d = getOperation()->calculateOperationTime(",
  "        fl->getOperationPlan(), dt, offset, true, nullptr, offset > 0L);",
  "    dt = offset > 0L ? d.getEnd() : d.getStart();",
  "  }",
  "  auto* oper = fl->getOperation();",
  "  const bool is_correction_fixedtime =",
  "      oper->hasType<OperationFixedTime>() &&",
  "      oper->getName().starts_with(\"Correction for \");",
  "",
  "  if (fl->getOperationPlan()->getConfirmed() &&",
  "      !fl->getOperationPlan()->getCompleted() &&",
  "      dt < Plan::instance().getCurrent() &&",
  "      !oper->hasType<OperationInventory>() && !is_correction_fixedtime)",
  "    // Confirmed material production and consumption is always in the future",
  "    dt = Plan::instance().getCurrent() + Duration(1L);",
  "  if (isConsumer() && !fl->getOperationPlan()->getConsumeMaterial())",
  "    return make_pair(dt, 0.0);",
  "  else if (isProducer() && !fl->getOperationPlan()->getProduceMaterial())",
  "    return make_pair(dt, 0.0);",
  "  else if (fl->getConfirmed())",
  "    return make_pair(dt, fl->getQuantity());",
  "  else if (!getEffective().within(fl->getOperationPlan()->getEnd()) ||",
  "           !fl->getOperationPlan()->getQuantity())",
  "    return make_pair(dt, 0.0);",
  "  else {",
  "    auto q = getQuantityFixed() +",
  "             fl->getOperationPlan()->getQuantity() * getQuantity();",
  "    if (fl->getOperationPlan()->getQuantityCompleted() &&",
  "        (isConsumer() || !Plan::instance().getWipProduceFullQuantity()))",
  "      return make_pair(dt, q * fl->getOperationPlan()->getQuantityRemaining() /",
  "                               fl->getOperationPlan()->getQuantity());",
  "    else",
  "      return make_pair(dt, q);",
  "  }",
  "}",
  "",
  "pair<Date, double> FlowEnd::getFlowplanDateQuantity(const FlowPlan* fl) const {",
  "  auto offset = fl->getFlow()->getOffset();",
  "  auto dt = fl->getOperationPlan()->getEnd();",
  "  if (offset && !fl->getOperationPlan()->getCompleted()) {",
  "    DateRange d = getOperation()->calculateOperationTime(",
  "        fl->getOperationPlan(), dt, offset, true, nullptr, offset < 0L);",
  "    dt = offset > 0L ? d.getEnd() : d.getStart();",
  "  }",
  "  auto* oper = fl->getOperation();",
  "  const bool is_correction_fixedtime =",
  "      oper->hasType<OperationFixedTime>() &&",
  "      oper->getName().starts_with(\"Correction for \");",
  "  if (fl->getOperationPlan()->getConfirmed() &&",
  "      !fl->getOperationPlan()->getCompleted() &&",
  "      dt < Plan::instance().getCurrent() &&",
  "      !oper->hasType<OperationInventory>() && !is_correction_fixedtime)",
  "    // Confirmed material production and consumption is always in the future",
  "    dt = Plan::instance().getCurrent() + Duration(1L);",
  "  if (isConsumer() && !fl->getOperationPlan()->getConsumeMaterial())",
  "    return make_pair(dt, 0.0);",
  "  else if (isProducer() && !fl->getOperationPlan()->getProduceMaterial())",
  "    return make_pair(dt, 0.0);",
  "  else if (fl->getConfirmed())",
  "    return make_pair(dt, fl->getQuantity());",
  "  else if (!fl->getOperationPlan()->getQuantity() ||",
  "           !getEffective().within(fl->getOperationPlan()->getEnd()))",
  "    return make_pair(dt, 0.0);",
  "  else {",
  "    auto q = getQuantityFixed() +",
  "             fl->getOperationPlan()->getQuantity() * getQuantity();",
  "    if (fl->getOperationPlan()->getQuantityCompleted() &&",
  "        (isConsumer() || !Plan::instance().getWipProduceFullQuantity()))",
  "      return make_pair(dt, q * fl->getOperationPlan()->getQuantityRemaining() /",
  "                               fl->getOperationPlan()->getQuantity());",
  "    else",
  "      return make_pair(dt, q);",
  "  }",
  "}",
  "",
  "pair<Date, double> FlowTransferBatch::getFlowplanDateQuantity(",
  "    const FlowPlan* fl) const {",
  "  double batch_quantity = getTransferBatch();",
  "  if (!batch_quantity || fl->getOperationPlan()->getSetupEnd() ==",
  "                             fl->getOperationPlan()->getEnd()) {",
  "    // Default to a simple flowplan at the start or end",
  "    auto dt = isConsumer() ? fl->getOperationPlan()->getSetupEnd()",
  "                           : fl->getOperationPlan()->getEnd();",
  "    auto* oper = fl->getOperation();",
  "    const bool is_correction_fixedtime =",
  "        oper->hasType<OperationFixedTime>() &&",
  "        oper->getName().starts_with(\"Correction for \");",
  "    if (fl->getOperationPlan()->getConfirmed() &&",
  "        !fl->getOperationPlan()->getCompleted() &&",
  "        dt < Plan::instance().getCurrent() &&",
  "        !oper->hasType<OperationInventory>() && !is_correction_fixedtime)",
  "      // Confirmed material production and consumption is always in the future",
  "      dt = Plan::instance().getCurrent() + Duration(1L);",
  "    if (isConsumer() && !fl->getOperationPlan()->getConsumeMaterial())",
  "      return make_pair(dt, 0.0);",
  "    else if (isProducer() && !fl->getOperationPlan()->getProduceMaterial())",
  "      return make_pair(dt, 0.0);",
  "    else if (!getEffective().within(fl->getOperationPlan()->getEnd()) ||",
  "             !fl->getOperationPlan()->getQuantity())",
  "      return make_pair(dt, 0.0);",
  "    else {",
  "      auto q = getQuantityFixed() +",
  "               fl->getOperationPlan()->getQuantity() * getQuantity();",
  "      if (fl->getOperationPlan()->getQuantityCompleted() &&",
  "          (isConsumer() || !Plan::instance().getWipProduceFullQuantity()))",
  "        return make_pair(dt,",
  "                         q * fl->getOperationPlan()->getQuantityRemaining() /",
  "                             fl->getOperationPlan()->getQuantity());",
  "      else",
  "        return make_pair(dt, q);",
  "    }",
  "  }",
  "",
  "  // Compute the number of batches",
  "  double total_quantity = getQuantityFixed() +",
  "                          fl->getOperationPlan()->getQuantity() * getQuantity();",
  "  if (isConsumer() && !fl->getOperationPlan()->getConsumeMaterial())",
  "    total_quantity = 0.0;",
  "  else if (isProducer() && !fl->getOperationPlan()->getProduceMaterial())",
  "    total_quantity = 0.0;",
  "  else if (fl->getOperationPlan()->getQuantity() &&",
  "           fl->getOperationPlan()->getQuantityCompleted() &&",
  "           (isConsumer() || !Plan::instance().getWipProduceFullQuantity()))",
  "    total_quantity *= fl->getOperationPlan()->getQuantityRemaining() /",
  "                      fl->getOperationPlan()->getQuantity();",
  "  double batches = ceil((getQuantity() > 0 ? total_quantity : -total_quantity) /",
  "                        getTransferBatch());",
  "  if (!batches)",
  "    batches = 1;",
  "  else if (batches > 50) {",
  "    // Put a limit to the number of batches",
  "    batches = 50;",
  "    batch_quantity =",
  "        (getQuantity() > 0 ? total_quantity : -total_quantity) / 50;",
  "  }",
  "",
  "  // Count the index of this batch",
  "  bool found = false;",
  "  long count = 0;",
  "  long totalcount = 0;",
  "  FlowPlan* cur_flpln = fl->getOperationPlan()->firstflowplan;",
  "  FlowPlan* prev_flpln = nullptr;",
  "  while (cur_flpln) {",
  "    if (cur_flpln == fl) found = true;",
  "    if (cur_flpln->getFlow() == fl->getFlow()) {",
  "      ++totalcount;",
  "      if (totalcount > batches && !count) {",
  "        if (cur_flpln->oper->firstflowplan == cur_flpln)",
  "          cur_flpln->oper->firstflowplan = cur_flpln->nextFlowPlan;",
  "        else",
  "          prev_flpln->nextFlowPlan = cur_flpln->nextFlowPlan;",
  "        auto almost_dead = cur_flpln;",
  "        cur_flpln = cur_flpln->nextFlowPlan;",
  "        delete almost_dead;",
  "        continue;",
  "      }",
  "      if (!found) ++count;",
  "    }",
  "    prev_flpln = cur_flpln;",
  "    cur_flpln = cur_flpln->nextFlowPlan;",
  "  }",
  "",
  "  Duration op_delta;",
  "  Date op_date =",
  "      fl->getOperation()",
  "          ->calculateOperationTime(fl->getOperationPlan(),",
  "                                   fl->getOperationPlan()->getSetupEnd(),",
  "                                   fl->getOperationPlan()->getEnd(), &op_delta)",
  "          .getStart();",
  "",
  "  if (!count) {",
  "    // The first flowplan in the list will always be there, even when the",
  "    // quantity becomes 0. It is responsible for creating extra flowplans when",
  "    // required.",
  "    while (totalcount < batches) {",
  "      auto newflowplan = new FlowPlan(fl->getOperationPlan(), this);",
  "      newflowplan->setFollowingBatch(true);",
  "      ++totalcount;",
  "    }",
  "  }",
  "",
  "  if (getQuantity() > 0 || getQuantityFixed() > 0) {",
  "    // Producing a batch",
  "    op_delta =",
  "        static_cast<long>(op_delta) / static_cast<long>(batches) * (count + 1);",
  "    total_quantity -= count * batch_quantity;",
  "    if (total_quantity < 0.0) total_quantity = 0.0;",
  "    return make_pair(",
  "        fl->getOperation()",
  "            ->calculateOperationTime(fl->getOperationPlan(), op_date, op_delta,",
  "                                     true)",
  "            .getEnd(),",
  "        total_quantity > batch_quantity ? batch_quantity : total_quantity);",
  "  } else {",
  "    // Consuming a batch",
  "    op_delta = static_cast<long>(op_delta) / static_cast<long>(batches) * count;",
  "    total_quantity += count * getTransferBatch();",
  "    if (total_quantity > 0.0) total_quantity = 0.0;",
  "    return make_pair(",
  "        fl->getOperation()",
  "            ->calculateOperationTime(fl->getOperationPlan(), op_date, op_delta,",
  "                                     true)",
  "            .getEnd(),",
  "        total_quantity < -batch_quantity ? -batch_quantity : total_quantity);",
  "  }",
  "}",
  "",
  "Date FlowEnd::computeFlowToOperationDate(const OperationPlan* opplan, Date d) {",
  "  if (!getOffset() || (opplan && opplan->getCompleted())) return d;",
  "  DateRange dr = getOperation()->calculateOperationTime(",
  "      opplan, d, getOffset(), false, nullptr, getOffset() < 0L);",
  "  return getOffset() > 0L ? dr.getStart() : dr.getEnd();",
  "}",
  "",
  "Date FlowEnd::computeOperationToFlowDate(const OperationPlan* opplan, Date d) {",
  "  if (!getOffset() || (opplan && opplan->getCompleted())) return d;",
  "  DateRange dr = getOperation()->calculateOperationTime(",
  "      opplan, d, getOffset(), true, nullptr, getOffset() < 0L);",
  "  return getOffset() > 0L ? dr.getEnd() : dr.getStart();",
  "}",
  "",
  "Date FlowStart::computeFlowToOperationDate(const OperationPlan* opplan,",
  "                                           Date d) {",
  "  if (!getOffset() || (opplan && opplan->getCompleted())) return d;",
  "  DateRange dr = getOperation()->calculateOperationTime(",
  "      opplan, d, getOffset(), false, nullptr, getOffset() > 0L);",
  "  return getOffset() > 0L ? dr.getStart() : dr.getEnd();",
  "}",
  "",
  "Date FlowStart::computeOperationToFlowDate(const OperationPlan* opplan,",
  "                                           Date d) {",
  "  if (!getOffset() || (opplan && opplan->getCompleted())) return d;",
  "  DateRange dr = getOperation()->calculateOperationTime(",
  "      opplan, d, getOffset(), true, nullptr, getOffset() > 0L);",
  "  return getOffset() > 0L ? dr.getEnd() : dr.getStart();",
  "}",
  "",
  "Date FlowTransferBatch::computeFlowToOperationDate(const OperationPlan*,",
  "                                                   Date d) {",
  "  return d;",
  "}",
  "",
  "Date FlowTransferBatch::computeOperationToFlowDate(const OperationPlan*,",
  "                                                   Date d) {",
  "  return d;",
  "}",
  "",
  "}  // namespace frepple",
];
