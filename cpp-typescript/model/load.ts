// <header-api-generated>
export const LoadCppModel = { bases: ["HasSource","Node","Object","Solvable"] as const, methods: ["findPreferredResource","finder","getAlternate","getHidden","getHiddenLoad","getLoadplanDate","getLoadplanQuantity","getOperation","getOperationPlanDate","getQuantity","getQuantityFixed","getResource","getSearch","getSetup","getSetupString","getSkill","getType","hasAlternates","initialize","registerFields","setHidden","setOperation","setQuantity","setQuantityFixed","setResource","setSearch","setSetupString","setSkill","solve"] as const, qualifiedNames: ["Load"] as const };

export const LoadBucketizedFromEndCppModel = { bases: ["Load"] as const, methods: ["getLoadplanDate","getOffset","getOperationPlanDate","getType","initialize","registerFields","setOffset","setResource","solve"] as const, qualifiedNames: ["LoadBucketizedFromEnd"] as const };

export const LoadBucketizedFromStartCppModel = { bases: ["Load"] as const, methods: ["getLoadplanDate","getOffset","getOperationPlanDate","getType","initialize","registerFields","setOffset","setResource","solve"] as const, qualifiedNames: ["LoadBucketizedFromStart"] as const };

export const LoadBucketizedPercentageCppModel = { bases: ["Load"] as const, methods: ["getLoadplanDate","getOffset","getOperationPlanDate","getType","initialize","registerFields","setOffset","setResource","solve"] as const, qualifiedNames: ["LoadBucketizedPercentage"] as const };

export const LoadDefaultCppModel = { bases: ["Load"] as const, methods: ["getType","solve"] as const, qualifiedNames: ["LoadDefault"] as const };
// </header-api-generated>









import { Date as PlanningDate, DateRange, Duration } from "../utils/date.js";
import { AssociationEntity, Environment, HeaderModelAdapter, LogicException } from "../utils/library.js";
import type { Operation } from "./operation.js";
import { Plan } from "./plan.js";
import { Resource, ResourceBuckets } from "./resource.js";
import type { ResourceSkill } from "./resourceskill.js";
import type { Skill } from "./skill.js";
import { HasLevel } from "./leveled.js";

type DateInput = PlanningDate | string | number;
type DurationInput = Duration | string | number;
type LoadPlanLike = HeaderModelAdapter | Readonly<Record<string, unknown>>;

export interface LoadFinder {
  readonly operation?: Operation | null;
  readonly resource?: Resource | null;
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

function bool(target: unknown, method: string, fallback = false): boolean {
  const value = call(target, method);
  return value === undefined || value === null ? fallback : Boolean(value);
}

function number(target: unknown, method: string, fallback = 0): number {
  const value = call(target, method);
  return value === undefined || value === null ? fallback : Number(value);
}

function dateMatches(left: PlanningDate, right: DateInput | undefined): boolean {
  return right === undefined || left.equals(asDate(right));
}

function operationPlanOf(loadPlan: LoadPlanLike): unknown {
  return call(loadPlan, "getOperationPlan");
}

function operationOf(loadPlan: LoadPlanLike): Operation | null {
  return (call(loadPlan, "getOperation") ?? call(operationPlanOf(loadPlan), "getOperation")) as Operation | null ?? null;
}

function resourceOf(loadPlan: LoadPlanLike): Resource | null {
  return call(loadPlan, "getResource") as Resource | null ?? null;
}

function planDates(loadPlan: LoadPlanLike): DateRange {
  const plan = operationPlanOf(loadPlan);
  const dates = call(plan, "getDates");
  if (dates instanceof DateRange) return new DateRange(dates.getStart(), dates.getEnd());
  return new DateRange(asDate(call(plan, "getStart")), asDate(call(plan, "getEnd"), PlanningDate.infiniteFuture));
}

function stateDate(state: unknown, property: "start" | "end", fallback: PlanningDate): PlanningDate {
  if (state && typeof state === "object") {
    const direct = Reflect.get(state, property);
    if (direct !== undefined) return asDate(direct, fallback);
    const getter = call(state, property === "start" ? "getStart" : "getEnd");
    if (getter !== undefined) return asDate(getter, fallback);
  }
  return new PlanningDate(fallback);
}

function setPlanParameters(loadPlan: LoadPlanLike, start: PlanningDate, end: PlanningDate, preferEnd: boolean): unknown {
  const plan = operationPlanOf(loadPlan);
  const quantity = number(plan, "getQuantity");
  return call(plan, "setOperationPlanParameters", quantity, start, end, preferEnd, false)
    ?? call(operationOf(loadPlan), "setOperationPlanParameters", plan, quantity, start, end, preferEnd, false);
}

function iterable(value: unknown): readonly unknown[] {
  return value && typeof value === "object" && typeof Reflect.get(value, Symbol.iterator) === "function"
    ? [...value as Iterable<unknown>] : [];
}

/** Capacity association between an operation and a resource. */
export class Load extends AssociationEntity<Operation, Resource> {
  static readonly cppBases: readonly string[] = ["HasSource", "Node", "Object", "Solvable"];
  static readonly cppQualifiedNames: readonly string[] = ["Load"];
  private quantity = 1;
  private quantityFixed = 0;
  private setup = "";
  private skill: Skill | null = null;
  private search = "MINPENALTY";
  private hidden = false;

  constructor();
  constructor(operation: Operation | null, resource: Resource | null, quantity: number, effective?: DateRange);
  constructor(operation?: Operation | null, resource?: Resource | null, quantity = 1, effective?: DateRange) {
    super();
    this.setOperation(operation ?? null);
    this.setResource(resource ?? null);
    this.setQuantity(quantity);
    if (effective) this.setEffective(effective);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static finder(fields: LoadFinder): Load | null {
    if (!fields.operation || !fields.resource) return null;
    for (const candidate of fields.operation.getLoads()) {
      if (!(candidate instanceof Load) || candidate.getResource() !== fields.resource) continue;
      if (!dateMatches(candidate.getEffectiveStart(), fields.effective_start)) continue;
      if (!dateMatches(candidate.getEffectiveEnd(), fields.effective_end)) continue;
      if (fields.priority !== undefined && candidate.getPriority() !== Math.trunc(Number(fields.priority))) continue;
      if (fields.name !== undefined && candidate.getName() !== fields.name) continue;
      return candidate;
    }
    return null;
  }
  finder(fields: LoadFinder): Load | null { return Load.finder(fields); }
  getType(): string { return "load"; }
  getOperation(): Operation | null { return this.getPtrA(); }
  setOperation(value: Operation | null): void {
    if (!value) return;
    if (this.setup && !this.validSetupOwner(value)) {
      Environment.log("Warning: Only a single load of an operation can specify a setup");
      return;
    }
    this.assignPtrA(value, "Operation");
    HasLevel.triggerLazyRecomputation();
  }
  getResource(): Resource | null { return this.getPtrB(); }
  setResource(value: Resource | null): void { this.assignPtrB(value, "Resource"); HasLevel.triggerLazyRecomputation(); }
  getQuantity(): number { return this.quantity; }
  setQuantity(value: number): void {
    const next = Number(value);
    if (next < 0) Environment.log("Warning: OperationResource quantity can't be negative");
    else this.quantity = next;
  }
  getQuantityFixed(): number { return this.quantityFixed; }
  setQuantityFixed(value: number): void {
    const next = Number(value);
    if (next < 0) Environment.log("Warning: OperationResource quantity_fixed can't be negative");
    else this.quantityFixed = next;
  }
  getAlternate(): Load | null {
    const operation = this.getOperation();
    if (!operation || !this.getName()) return null;
    let firstZero: Load | null = null;
    for (const candidate of operation.getLoads()) {
      if (!(candidate instanceof Load) || candidate.getName() !== this.getName()) continue;
      if (candidate.getPriority()) return candidate === this ? null : candidate;
      firstZero ??= candidate;
    }
    return firstZero === this ? null : firstZero;
  }
  hasAlternates(): boolean {
    const operation = this.getOperation();
    return Boolean(operation && this.getName() && operation.getLoads().some((candidate) =>
      candidate instanceof Load && candidate !== this && candidate.getName() === this.getName()));
  }
  getSetup(): string { return this.setup; }
  getSetupString(): string { return this.setup; }
  setSetupString(value: string): void {
    const next = String(value);
    if (next && this.getOperation() && !this.validSetupOwner(this.getOperation()!)) {
      Environment.log("Warning: Only a single load of an operation can specify a setup");
      return;
    }
    this.setup = next;
  }
  getSkill(): Skill | null { return this.skill; }
  setSkill(value: Skill | null): void {
    if (this.skill === value) return;
    this.skill?.modelReferenceRemoved(this, "Skill");
    this.skill = value;
    value?.modelReferenceAdded(this, "Skill");
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
  override getHidden(): boolean {
    return this.hidden || Boolean(this.getResource()?.getHidden()) || Boolean(this.getOperation()?.getHidden());
  }
  getHiddenLoad(): boolean { return this.hidden; }
  override setHidden(value: boolean): void { this.hidden = Boolean(value); }
  getLoadplanDate(loadPlan: LoadPlanLike): PlanningDate {
    const dates = planDates(loadPlan);
    if (bool(loadPlan, "isStart")) {
      return dates.getStart().compare(this.getEffectiveStart()) > 0 ? dates.getStart() : this.getEffectiveStart();
    }
    return dates.getEnd().compare(this.getEffectiveEnd()) < 0 ? dates.getEnd() : this.getEffectiveEnd();
  }
  getOperationPlanDate(loadPlan: LoadPlanLike, value: DateInput, start = true): PlanningDate {
    const date = asDate(value);
    if (start) {
      if (bool(loadPlan, "isStart")) return date;
      const state = setPlanParameters(loadPlan, PlanningDate.infinitePast, date, true);
      return stateDate(state, "start", date);
    }
    if (!bool(loadPlan, "isStart")) return date;
    const state = setPlanParameters(loadPlan, date, PlanningDate.infinitePast, false);
    return stateDate(state, "end", date);
  }
  getLoadplanQuantity(loadPlan: LoadPlanLike): number {
    const plan = operationPlanOf(loadPlan);
    if ((!bool(plan, "getProposed") && !bool(plan, "getConsumeCapacity", true)) || !number(plan, "getQuantity") ||
        bool(plan, "getClosed") || bool(plan, "getCompleted")) return 0;
    if (bool(loadPlan, "getConfirmed")) return number(loadPlan, "getQuantity");
    const dates = planDates(loadPlan);
    if (dates.overlap(this.getEffective()).isZero() &&
        (!dates.getDuration().isZero() || !this.getEffective().within(dates.getStart()))) return 0;
    const resource = resourceOf(loadPlan);
    if (resource instanceof ResourceBuckets) {
      const calendar = resource.getEfficiencyCalendar();
      const efficiency = (calendar ? calendar.getValue(asDate(call(loadPlan, "getDate"))) : resource.getEfficiency()) / 100;
      if (efficiency <= 0) return Number.MIN_VALUE;
      let result = -(this.quantityFixed + this.quantity * number(plan, "getQuantity")) / efficiency;
      if (number(plan, "getQuantity") && number(plan, "getQuantityCompleted")) {
        result *= number(plan, "getQuantityRemaining") / number(plan, "getQuantity");
      }
      return result;
    }
    const load = call(loadPlan, "getLoad") as Load | null ?? this;
    if (load.getResource()?.isGroup() && load.getQuantity() > 1 && Plan.instance().getIndividualPoolResources()) {
      return bool(loadPlan, "isStart") ? 1 : -1;
    }
    if (resource?.getToolPerPiece()) {
      return (bool(loadPlan, "isStart") ? this.quantity : -this.quantity) * number(plan, "getQuantity");
    }
    return bool(loadPlan, "isStart") ? this.quantity : -this.quantity;
  }
  findPreferredResource(dateValue: DateInput, operationPlan: unknown): Resource | null {
    const resource = this.getResource();
    if (!resource || !resource.isGroup()) return resource;
    const date = asDate(dateValue);
    let best: Resource | null = null;
    let backup: Resource | null = null;
    let bestUtilization = Number.POSITIVE_INFINITY;
    let bestEfficiency = 0;
    let bestPriority = Number.POSITIVE_INFINITY;
    for (const candidate of resource.getAllMembers()) {
      if (candidate.isGroup()) continue;
      backup ??= candidate;
      const skillSink: { value?: ResourceSkill | null } = {};
      if (this.skill && !candidate.hasSkill(this.skill, date, date, skillSink)) continue;
      if (this.quantity > 1 && Plan.instance().getIndividualPoolResources() &&
          iterable(call(operationPlan, "getLoadPlans")).some((plan) => call(plan, "getResource") === candidate)) {
        backup = candidate;
        continue;
      }
      const utilization = bool(operationPlan, "getConfirmed") || bool(operationPlan, "getApproved")
        ? candidate.getUtilization(asDate(call(operationPlan, "getStart"), date).subtract(new Duration(3 * 86_400)) as PlanningDate,
          asDate(call(operationPlan, "getEnd"), date).add(new Duration(3 * 86_400)))
        : Number.POSITIVE_INFINITY;
      const efficiency = candidate.getEfficiencyCalendar()?.getValue(date) ?? candidate.getEfficiency();
      const skillPriority = skillSink.value?.getPriority() ?? Number.POSITIVE_INFINITY;
      if (utilization < bestUtilization || (utilization === bestUtilization && efficiency > bestEfficiency) ||
          (utilization === bestUtilization && Math.abs(efficiency - bestEfficiency) < 1e-9 && skillPriority < bestPriority)) {
        best = candidate;
        bestUtilization = utilization;
        bestEfficiency = efficiency;
        bestPriority = skillPriority;
      }
    }
    return best ?? backup;
  }
  solve(solver: unknown, payload: unknown = null): unknown { return call(solver, "solve", this, payload); }

  protected validBucketResource(value: Resource | null, type: string): value is ResourceBuckets | null {
    if (value && !(value instanceof ResourceBuckets)) {
      Environment.log(`Warning: ${type} can only be associated with ResourceBuckets`);
      return false;
    }
    return true;
  }
  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Skill") this.skill = null;
    else super.modelReferenceTargetDisposed(target, property);
  }
  override dispose(): void {
    this.disposeLoadPlans();
    this.setSkill(null);
    super.dispose();
  }

  private validSetupOwner(operation: Operation): boolean {
    return operation.getLoads().every((candidate) => !(candidate instanceof Load) || candidate === this ||
      !candidate.getSetupString() || candidate.getName() === this.getName());
  }
  private disposeLoadPlans(): void {
    const operation = this.getOperation();
    if (!operation || !this.getResource()) return;
    for (const plan of operation.getOperationPlans()) {
      for (const loadPlan of iterable(call(plan, "getLoadPlans"))) {
        if (call(loadPlan, "getLoad") === this && loadPlan instanceof HeaderModelAdapter) loadPlan.dispose();
      }
    }
  }
}

export class LoadDefault extends Load {
  static override readonly cppBases: readonly string[] = ["Load"];
  static override readonly cppQualifiedNames: readonly string[] = ["LoadDefault"];
  override getType(): string { return "load"; }
  override solve(solver: unknown, payload: unknown = null): unknown { return call(solver, "solve", this, payload); }
}

abstract class LoadBucketizedDuration extends Load {
  private offset = new Duration();
  getOffset(): Duration { return new Duration(this.offset); }
  setOffset(value: DurationInput): void {
    const next = asDuration(value);
    if (next.seconds < 0) Environment.log("Warning: Load offset must be positive");
    else this.offset = next;
  }
  override setResource(value: Resource | null): void {
    if (this.validBucketResource(value, this.constructor.name)) super.setResource(value);
  }
}

export class LoadBucketizedFromStart extends LoadBucketizedDuration {
  static override readonly cppBases: readonly string[] = ["Load"];
  static override readonly cppQualifiedNames: readonly string[] = ["LoadBucketizedFromStart"];
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "load_bucketized_from_start"; }
  override getLoadplanDate(loadPlan: LoadPlanLike): PlanningDate {
    const dates = planDates(loadPlan);
    if (this.getOffset().isZero()) return dates.getStart();
    const calculated = operationOf(loadPlan)?.calculateOperationTime(operationPlanOf(loadPlan), dates.getStart(), this.getOffset(), true);
    const date = calculated?.getEnd() ?? dates.getStart();
    return date.compare(dates.getEnd()) > 0 ? dates.getEnd() : date;
  }
  override getOperationPlanDate(loadPlan: LoadPlanLike, value: DateInput, start = true): PlanningDate {
    const date = asDate(value);
    const calculated = operationOf(loadPlan)?.calculateOperationTime(operationPlanOf(loadPlan), date, this.getOffset(), false);
    const state = setPlanParameters(loadPlan, calculated?.getStart() ?? date, PlanningDate.infinitePast, true);
    if (stateDate(state, "end", date).compare(date) >= 0) return stateDate(state, start ? "start" : "end", date);
    if (!start) return date;
    return stateDate(setPlanParameters(loadPlan, PlanningDate.infinitePast, date, true), "start", date);
  }
  override solve(solver: unknown, payload: unknown = null): unknown { return call(solver, "solve", this, payload); }
}

export class LoadBucketizedFromEnd extends LoadBucketizedDuration {
  static override readonly cppBases: readonly string[] = ["Load"];
  static override readonly cppQualifiedNames: readonly string[] = ["LoadBucketizedFromEnd"];
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "load_bucketized_from_end"; }
  override getLoadplanDate(loadPlan: LoadPlanLike): PlanningDate {
    const dates = planDates(loadPlan);
    if (this.getOffset().isZero()) return dates.getEnd();
    const calculated = operationOf(loadPlan)?.calculateOperationTime(operationPlanOf(loadPlan), dates.getEnd(), this.getOffset(), false);
    const date = calculated?.getStart() ?? dates.getEnd();
    return date.compare(dates.getStart()) > 0 ? date : dates.getStart();
  }
  override getOperationPlanDate(loadPlan: LoadPlanLike, value: DateInput, start = true): PlanningDate {
    const date = asDate(value);
    const calculated = operationOf(loadPlan)?.calculateOperationTime(operationPlanOf(loadPlan), date, this.getOffset(), true);
    const state = setPlanParameters(loadPlan, PlanningDate.infinitePast, calculated?.getEnd() ?? date, true);
    if (stateDate(state, "start", date).compare(date) <= 0) return stateDate(state, start ? "start" : "end", date);
    if (start) return date;
    return stateDate(setPlanParameters(loadPlan, date, PlanningDate.infinitePast, false), "end", date);
  }
  override solve(solver: unknown, payload: unknown = null): unknown { return call(solver, "solve", this, payload); }
}

export class LoadBucketizedPercentage extends Load {
  static override readonly cppBases: readonly string[] = ["Load"];
  static override readonly cppQualifiedNames: readonly string[] = ["LoadBucketizedPercentage"];
  private offset = 0;
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "load_bucketized_percentage"; }
  override setResource(value: Resource | null): void {
    if (this.validBucketResource(value, "LoadBucketizedPercentage")) super.setResource(value);
  }
  getOffset(): number { return this.offset; }
  setOffset(value: number): void {
    const next = Number(value);
    if (next < 0 || next > 100) Environment.log("Warning: Load offset must be between 0 and 100");
    else this.offset = next;
  }
  override getLoadplanDate(loadPlan: LoadPlanLike): PlanningDate {
    const dates = planDates(loadPlan);
    if (this.offset === 0) return dates.getStart();
    if (this.offset === 100) return dates.getEnd();
    const duration = new Duration(Math.trunc(dates.getDuration().seconds * this.offset / 100));
    return operationOf(loadPlan)?.calculateOperationTime(operationPlanOf(loadPlan), dates.getStart(), duration, true).getEnd()
      ?? dates.getStart().add(duration);
  }
  override getOperationPlanDate(loadPlan: LoadPlanLike, value: DateInput, start = true): PlanningDate {
    const date = asDate(value);
    const dates = planDates(loadPlan);
    const actual: Duration[] = [];
    operationOf(loadPlan)?.calculateOperationTime(operationPlanOf(loadPlan), dates.getStart(), dates.getEnd(), actual);
    const total = actual[0] ?? dates.getDuration();
    const percentage = start ? this.offset : 100 - this.offset;
    const duration = new Duration(Math.trunc(total.seconds * percentage / 100));
    const calculated = operationOf(loadPlan)?.calculateOperationTime(operationPlanOf(loadPlan), date, duration, !start);
    return start ? calculated?.getStart() ?? date.subtract(duration) as PlanningDate : calculated?.getEnd() ?? date.add(duration);
  }
  override solve(solver: unknown, payload: unknown = null): unknown { return call(solver, "solve", this, payload); }
}






















/**
 * Semantic migration unit for src/model/load.cpp.
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
  { name: "Load::initialize", sourceLine: 35, status: "adapted" },
  { name: "LoadBucketizedPercentage::initialize", sourceLine: 55, status: "adapted" },
  { name: "LoadBucketizedFromStart::initialize", sourceLine: 64, status: "adapted" },
  { name: "LoadBucketizedFromEnd::initialize", sourceLine: 73, status: "adapted" },
  { name: "Load::~Load", sourceLine: 82, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 84, status: "adapted" },
  { name: "Load::setOperation", sourceLine: 104, status: "adapted" },
  { name: "Load::setSetupString", sourceLine: 122, status: "adapted" },
  { name: "Load::create", sourceLine: 140, status: "adapted" },
  { name: "Load::finder", sourceLine: 211, status: "adapted" },
  { name: "Load::getLoadplanDate", sourceLine: 248, status: "adapted" },
  { name: "LoadBucketizedFromEnd::getLoadplanDate", sourceLine: 259, status: "adapted" },
  { name: "LoadBucketizedFromStart::getLoadplanDate", sourceLine: 270, status: "adapted" },
  { name: "LoadBucketizedPercentage::getLoadplanDate", sourceLine: 281, status: "adapted" },
  { name: "Load::getOperationPlanDate", sourceLine: 297, status: "adapted" },
  { name: "LoadBucketizedFromEnd::getOperationPlanDate", sourceLine: 322, status: "adapted" },
  { name: "LoadBucketizedFromStart::getOperationPlanDate", sourceLine: 348, status: "adapted" },
  { name: "LoadBucketizedPercentage::getOperationPlanDate", sourceLine: 373, status: "adapted" },
  { name: "Load::findPreferredResource", sourceLine: 401, status: "adapted" },
  { name: "Plan::instance", sourceLine: 424, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface HasLevelPort {
  triggerLazyRecomputation(...args: readonly PortValue[]): PortValue | void;
}

export interface LoadPort {
  create(...args: readonly PortValue[]): PortValue | void;
  disposeLoad(...args: readonly PortValue[]): PortValue | void;
  findPreferredResource(...args: readonly PortValue[]): PortValue | void;
  finder(...args: readonly PortValue[]): PortValue | void;
  getLoadplanDate(...args: readonly PortValue[]): PortValue | void;
  getOperationPlanDate(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setOperation(...args: readonly PortValue[]): PortValue | void;
  setSetupString(...args: readonly PortValue[]): PortValue | void;
}

export interface LoadBucketizedFromEndPort {
  getLoadplanDate(...args: readonly PortValue[]): PortValue | void;
  getOperationPlanDate(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface LoadBucketizedFromStartPort {
  getLoadplanDate(...args: readonly PortValue[]): PortValue | void;
  getOperationPlanDate(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface LoadBucketizedPercentagePort {
  getLoadplanDate(...args: readonly PortValue[]): PortValue | void;
  getOperationPlanDate(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/load.cpp";
export const targetFile = "model/load.ts";

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
  "const MetaCategory* Load::metadata;",
  "const MetaClass* LoadDefault::metadata;",
  "const MetaClass* LoadBucketizedPercentage::metadata;",
  "const MetaClass* LoadBucketizedFromStart::metadata;",
  "const MetaClass* LoadBucketizedFromEnd::metadata;",
  "",
  "int Load::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Load>(",
  "      \"load\", \"loads\", Association<Operation, Resource, Load>::reader, finder);",
  "  registerFields<Load>(const_cast<MetaCategory*>(metadata));",
  "  LoadDefault::metadata = MetaClass::registerClass<LoadDefault>(",
  "      \"load\", \"load\", Object::create<LoadDefault>, true);",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<Load>::getPythonType();",
  "  x.setName(\"load\");",
  "  x.setDoc(\"frePPLe load\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  Load::metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "int LoadBucketizedPercentage::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<LoadBucketizedPercentage>(",
  "      \"load\", \"load_bucketized_percentage\",",
  "      Object::create<LoadBucketizedPercentage>);",
  "  registerFields<LoadBucketizedPercentage>(const_cast<MetaClass*>(metadata));",
  "  return metadata ? 0 : 1;",
  "}",
  "",
  "int LoadBucketizedFromStart::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<LoadBucketizedFromStart>(",
  "      \"load\", \"load_bucketized_from_start\",",
  "      Object::create<LoadBucketizedFromStart>);",
  "  registerFields<LoadBucketizedFromStart>(const_cast<MetaClass*>(metadata));",
  "  return metadata ? 0 : 1;",
  "}",
  "",
  "int LoadBucketizedFromEnd::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<LoadBucketizedFromEnd>(",
  "      \"load\", \"load_bucketized_from_end\",",
  "      Object::create<LoadBucketizedFromEnd>);",
  "  registerFields<LoadBucketizedFromEnd>(const_cast<MetaClass*>(metadata));",
  "  return metadata ? 0 : 1;",
  "}",
  "",
  "Load::~Load() {",
  "  // Set a flag to make sure the level computation is triggered again",
  "  HasLevel::triggerLazyRecomputation();",
  "",
  "  // Delete existing loadplans",
  "  if (getOperation() && getResource()) {",
  "    // Loop over operationplans",
  "    for (OperationPlan::iterator i(getOperation()); i != OperationPlan::end();",
  "         ++i)",
  "      // Loop over loadplans",
  "      for (auto j = i->beginLoadPlans(); j != i->endLoadPlans();)",
  "        if (j->getLoad() == this)",
  "          j.deleteLoadPlan();",
  "        else",
  "          ++j;",
  "  }",
  "",
  "  // Delete the load from the operation and resource",
  "  if (getOperation()) getOperation()->loaddata.erase(this);",
  "  if (getResource()) getResource()->loads.erase(this);",
  "}",
  "",
  "void Load::setOperation(Operation* o) {",
  "  // Validate the input",
  "  if (!setup.empty() && o) {",
  "    // Guarantuee that only a single load has a setup.",
  "    // Alternates of that load can have a setup as well.",
  "    for (auto& i : o->loaddata)",
  "      if (&i != this && !i.setup.empty() && i.getName() != getName()) {",
  "        logger",
  "            << \"Warning: Only a single load of an operation can specify a setup\"",
  "            << '\\n';",
  "        return;",
  "      }",
  "  }",
  "",
  "  // Update the field",
  "  if (o) setPtrA(o, o->getLoads());",
  "}",
  "",
  "void Load::setSetupString(const string& n) {",
  "  // Validate the input",
  "  if (!n.empty() && getOperation()) {",
  "    // Guarantuee that only a single load has a setup.",
  "    // Alternates of that load can have a setup as well.",
  "    for (auto& i : getOperation()->loaddata)",
  "      if (&i != this && !i.setup.empty() && i.getName() != getName()) {",
  "        logger",
  "            << \"Warning:Only a single load of an operation can specify a setup\"",
  "            << '\\n';",
  "        return;",
  "      }",
  "  }",
  "",
  "  // Update the field",
  "  setup = n;",
  "}",
  "",
  "PyObject* Load::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Pick up the operation",
  "    PyObject* oper = PyDict_GetItemString(kwds, \"operation\");",
  "    if (!oper) throw DataException(\"missing operation on Load\");",
  "    if (!PyObject_TypeCheck(oper, Operation::metadata->pythonClass))",
  "      throw DataException(\"load operation must be of type operation\");",
  "",
  "    // Pick up the resource",
  "    PyObject* res = PyDict_GetItemString(kwds, \"resource\");",
  "    if (!res) throw DataException(\"missing resource on Load\");",
  "    if (!PyObject_TypeCheck(res, Resource::metadata->pythonClass))",
  "      throw DataException(\"load resource must be of type resource\");",
  "",
  "    // Pick up the quantity",
  "    PyObject* q1 = PyDict_GetItemString(kwds, \"quantity\");",
  "    double q2 = q1 ? PythonData(q1).getDouble() : 1.0;",
  "",
  "    // Pick up the effective dates",
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
  "    // Create the load",
  "    Load* l = new LoadDefault(static_cast<Operation*>(oper),",
  "                              static_cast<Resource*>(res), q2, eff);",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    if (l) {",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        if (!attr.isA(Tags::effective_end) &&",
  "            !attr.isA(Tags::effective_start) && !attr.isA(Tags::operation) &&",
  "            !attr.isA(Tags::resource) && !attr.isA(Tags::quantity) &&",
  "            !attr.isA(Tags::type) && !attr.isA(Tags::action)) {",
  "          const MetaFieldBase* fmeta = l->getType().findField(attr.getHash());",
  "          if (!fmeta && l->getType().category)",
  "            fmeta = l->getType().category->findField(attr.getHash());",
  "          if (fmeta)",
  "            // Update the attribute",
  "            fmeta->setField(l, field);",
  "          else",
  "            l->setProperty(attr.getName(), value);",
  "          ;",
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
  "Object* Load::finder(const DataValueDict& d) {",
  "  // Check operation",
  "  const DataValue* tmp = d.get(Tags::operation);",
  "  if (!tmp) return nullptr;",
  "  auto* oper = static_cast<Operation*>(tmp->getObject());",
  "",
  "  // Check resource field",
  "  tmp = d.get(Tags::resource);",
  "  if (!tmp) return nullptr;",
  "  auto* res = static_cast<Resource*>(tmp->getObject());",
  "",
  "  // Walk over all loads of the operation, and return",
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
  "  for (const auto& ld : oper->getLoads()) {",
  "    if (ld.getResource() != res) continue;",
  "    if (hasEffectiveStart && ld.getEffectiveStart() != effective_start)",
  "      continue;",
  "    if (hasEffectiveEnd && ld.getEffectiveEnd() != effective_end) continue;",
  "    if (hasPriority && ld.getPriority() != priority) continue;",
  "    if (hasName && ld.getName() != name) continue;",
  "    return const_cast<Load*>(&ld);",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "Date Load::getLoadplanDate(const LoadPlan* lp) const {",
  "  const DateRange& dr = lp->getOperationPlan()->getDates();",
  "  if (lp->isStart())",
  "    return dr.getStart() > getEffective().getStart()",
  "               ? dr.getStart()",
  "               : getEffective().getStart();",
  "  else",
  "    return dr.getEnd() < getEffective().getEnd() ? dr.getEnd()",
  "                                                 : getEffective().getEnd();",
  "}",
  "",
  "Date LoadBucketizedFromEnd::getLoadplanDate(const LoadPlan* lp) const {",
  "  const DateRange& tmp = lp->getOperationPlan()->getDates();",
  "  if (!offset)",
  "    return tmp.getEnd();",
  "  else {",
  "    DateRange d = lp->getOperation()->calculateOperationTime(",
  "        lp->getOperationPlan(), tmp.getEnd(), offset, false);",
  "    return d.getStart() > tmp.getStart() ? d.getStart() : tmp.getStart();",
  "  }",
  "}",
  "",
  "Date LoadBucketizedFromStart::getLoadplanDate(const LoadPlan* lp) const {",
  "  const DateRange& tmp = lp->getOperationPlan()->getDates();",
  "  if (!offset)",
  "    return tmp.getStart();",
  "  else {",
  "    DateRange d = lp->getOperation()->calculateOperationTime(",
  "        lp->getOperationPlan(), tmp.getStart(), offset, true);",
  "    return d.getEnd() > tmp.getEnd() ? tmp.getEnd() : d.getEnd();",
  "  }",
  "}",
  "",
  "Date LoadBucketizedPercentage::getLoadplanDate(const LoadPlan* lp) const {",
  "  const DateRange& tmp = lp->getOperationPlan()->getDates();",
  "  if (offset == 0.0)",
  "    return tmp.getStart();",
  "  else if (offset == 100.0)",
  "    return tmp.getEnd();",
  "  else {",
  "    DateRange d = lp->getOperation()->calculateOperationTime(",
  "        lp->getOperationPlan(), tmp.getStart(),",
  "        Duration(static_cast<long>(static_cast<long>(tmp.getDuration()) *",
  "                                   offset / 100.0)),",
  "        true);",
  "    return d.getEnd();",
  "  }",
  "}",
  "",
  "Date Load::getOperationPlanDate(const LoadPlan* lp, Date ldplandate,",
  "                                bool start) const {",
  "  // TODO Ignores effective range of the load",
  "  if (start) {",
  "    if (lp->isStart())",
  "      return ldplandate;",
  "    else {",
  "      OperationPlanState tmp =",
  "          lp->getOperationPlan()->setOperationPlanParameters(",
  "              lp->getOperationPlan()->getQuantity(), Date::infinitePast,",
  "              ldplandate, true, false);",
  "      return tmp.start;",
  "    }",
  "  } else {",
  "    if (lp->isStart()) {",
  "      OperationPlanState tmp =",
  "          lp->getOperationPlan()->setOperationPlanParameters(",
  "              lp->getOperationPlan()->getQuantity(), ldplandate,",
  "              Date::infinitePast, false, false);",
  "      return tmp.end;",
  "    } else",
  "      return ldplandate;",
  "  }",
  "}",
  "",
  "Date LoadBucketizedFromEnd::getOperationPlanDate(const LoadPlan* lp,",
  "                                                 Date ldplandate,",
  "                                                 bool start) const {",
  "  // TODO Ignores effective range of the load",
  "",
  "  DateRange d = lp->getOperation()->calculateOperationTime(",
  "      lp->getOperationPlan(), ldplandate, offset, true);",
  "  OperationPlanState tmp = lp->getOperationPlan()->setOperationPlanParameters(",
  "      lp->getOperationPlan()->getQuantity(), Date::infinitePast, d.getEnd(),",
  "      true, false);",
  "  if (tmp.start <= ldplandate)",
  "    // Total duration exceeds the offset",
  "    return start ? tmp.start : tmp.end;",
  "  else if (start)",
  "    // Offset is smaller than the effective duration.",
  "    // The loadplan will coincide with the operationplan start date.",
  "    return ldplandate;",
  "  else {",
  "    // Offset is smaller than the effective duration.",
  "    tmp = lp->getOperationPlan()->setOperationPlanParameters(",
  "        lp->getOperationPlan()->getQuantity(), ldplandate, Date::infinitePast,",
  "        false, false);",
  "    return tmp.end;",
  "  }",
  "}",
  "",
  "Date LoadBucketizedFromStart::getOperationPlanDate(const LoadPlan* lp,",
  "                                                   Date ldplandate,",
  "                                                   bool start) const {",
  "  // TODO Ignores effective range of the load",
  "",
  "  DateRange d = lp->getOperation()->calculateOperationTime(",
  "      lp->getOperationPlan(), ldplandate, offset, false);",
  "  OperationPlanState tmp = lp->getOperationPlan()->setOperationPlanParameters(",
  "      lp->getOperationPlan()->getQuantity(), d.getStart(), Date::infinitePast,",
  "      true, false);",
  "  if (tmp.end >= ldplandate)",
  "    // Total duration exceeds the offset",
  "    return start ? tmp.start : tmp.end;",
  "  else if (start) {",
  "    // Offset is smaller than the effective duration.",
  "    tmp = lp->getOperationPlan()->setOperationPlanParameters(",
  "        lp->getOperationPlan()->getQuantity(), Date::infinitePast, ldplandate,",
  "        true, false);",
  "    return tmp.start;",
  "  } else",
  "    // Offset is smaller than the effective duration.",
  "    // The loadplan will coincide with the operationplan end date.",
  "    return ldplandate;",
  "}",
  "",
  "Date LoadBucketizedPercentage::getOperationPlanDate(const LoadPlan* lp,",
  "                                                    Date ldplandate,",
  "                                                    bool start) const {",
  "  // TODO Ignores effective range of the load",
  "  // Measure how long the operation really takes in effective time",
  "  Duration actualduration;",
  "  const DateRange& tmp = lp->getOperationPlan()->getDates();",
  "  lp->getOperation()->calculateOperationTime(",
  "      lp->getOperationPlan(), tmp.getStart(), tmp.getEnd(), &actualduration);",
  "",
  "  // Compute offset",
  "  if (start) {",
  "    DateRange d = lp->getOperation()->calculateOperationTime(",
  "        lp->getOperationPlan(), ldplandate,",
  "        Duration(static_cast<long>(static_cast<long>(actualduration) * offset /",
  "                                   100.0)),",
  "        false);",
  "    return d.getStart();",
  "  } else {",
  "    DateRange d = lp->getOperation()->calculateOperationTime(",
  "        lp->getOperationPlan(), ldplandate,",
  "        Duration(static_cast<long>(static_cast<long>(actualduration) *",
  "                                   (100.0 - offset) / 100.0)),",
  "        true);",
  "    return d.getEnd();",
  "  }",
  "}",
  "",
  "Resource* Load::findPreferredResource(Date d, OperationPlan* opplan) const {",
  "  if (!getResource()->isGroup()) return getResource();",
  "",
  "  // The preferred resource uses the following criteria in order:",
  "  // - For approved and confirmed operationplans we choose the resource",
  "  //   with the lowest resource load to level-load the pool.",
  "  //   For proposed operationplans, we don't use the utlization.",
  "  // - Choose the most efficient resource from the group regardless of its cost.",
  "  // - Choose the resource with the lowest skill priority.",
  "  // We avoid assigning the same resource twice.",
  "  // TODO We ignore date effectivity.",
  "  Resource* best_res = nullptr;",
  "  Resource* backup_res = nullptr;",
  "  double best_utilization = DBL_MAX;",
  "  double best_eff = 0.0;",
  "  double best_priority = DBL_MAX;",
  "  for (Resource::memberRecursiveIterator mmbr(getResource()); !mmbr.empty();",
  "       ++mmbr) {",
  "    ResourceSkill* tmpRsrcSkill = nullptr;",
  "    if (mmbr->isGroup()) continue;",
  "    if (!backup_res) backup_res = &*mmbr;",
  "    if (!getSkill() || mmbr->hasSkill(getSkill(), d, d, &tmpRsrcSkill)) {",
  "      if (getQuantity() > 1.0 &&",
  "          Plan::instance().getIndividualPoolResources()) {",
  "        // Need to avoid assigning the same resource twice",
  "        bool exists = false;",
  "        for (auto g = opplan->getLoadPlans(); g != opplan->endLoadPlans();",
  "             ++g) {",
  "          if (g->getResource() == &*mmbr) {",
  "            exists = true;",
  "            break;",
  "          }",
  "        }",
  "        if (exists) {",
  "          backup_res = &*mmbr;",
  "          continue;",
  "        }",
  "      }",
  "",
  "      double my_utilization = DBL_MAX;",
  "      if (opplan->getConfirmed() || opplan->getApproved()) {",
  "        // Include utilization comparison for approved & confirmed",
  "        my_utilization = mmbr->getUtilization(",
  "            opplan->getStart() - Duration(3L * 24L * 3600L),",
  "            opplan->getEnd() + Duration(3L * 24L * 3600L));",
  "      }",
  "",
  "      // Check if better a) utilization, b) efficiency and c) priority",
  "      auto my_eff = mmbr->getEfficiencyCalendar()",
  "                        ? mmbr->getEfficiencyCalendar()->getValue(d)",
  "                        : mmbr->getEfficiency();",
  "      if (my_utilization < best_utilization ||",
  "          (my_utilization == best_utilization && my_eff > best_eff)) {",
  "        best_res = &*mmbr;",
  "        best_eff = my_eff;",
  "        best_utilization = my_utilization;",
  "        best_priority = tmpRsrcSkill ? tmpRsrcSkill->getPriority() : DBL_MAX;",
  "      } else if (my_utilization == best_utilization &&",
  "                 fabs(my_eff - best_eff) < ROUNDING_ERROR && tmpRsrcSkill &&",
  "                 tmpRsrcSkill->getPriority() < best_priority) {",
  "        best_res = &*mmbr;",
  "        best_eff = my_eff;",
  "        best_utilization = my_utilization;",
  "        best_priority = tmpRsrcSkill->getPriority();",
  "      }",
  "    }",
  "  }",
  "  return best_res ? best_res : backup_res;",
  "}",
  "",
  "}  // namespace frepple",
];
