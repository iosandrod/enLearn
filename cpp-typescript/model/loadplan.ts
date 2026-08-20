// <header-api-generated>
import { Date as PlanningDate } from "../utils/date.js";
import { DataException, Environment, HeaderModelAdapter, LogicException } from "../utils/library.js";
import { TimeLine, TimeLineEvent, TimeLineEventChangeOnhand } from "./flowplan.js";
import { Load } from "./load.js";
import type { Operation } from "./operation.js";
import type { OperationPlan } from "./operationplan.js";
import { Resource, ResourceBuckets, ResourceDefault, ResourceInfinite } from "./resource.js";

type DateInput = PlanningDate | string | number;

const ROUNDING_ERROR = 0.000001;

function asDate(value: unknown, fallback = PlanningDate.infinitePast): PlanningDate {
  if (value instanceof PlanningDate) return new PlanningDate(value);
  return typeof value === "string" || typeof value === "number"
    ? new PlanningDate(value) : new PlanningDate(fallback);
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

function eventType(event: HeaderModelAdapter): number { return Number(invoke(event, "getEventType") ?? 0); }
function eventQuantity(event: HeaderModelAdapter): number { return Number(invoke(event, "getQuantity") ?? 0); }
function eventOnhand(event: HeaderModelAdapter): number { return Number(invoke(event, "getOnhand") ?? 0); }
function eventDate(event: HeaderModelAdapter): PlanningDate { return asDate(invoke(event, "getDate")); }

/** Planned capacity movement tied to one load and one operation plan. */
export class LoadPlan extends TimeLineEventChangeOnhand {
  static override readonly cppBases: readonly string[] = ["EventChangeOnhand"] as const;
  static override readonly cppQualifiedNames: readonly string[] = ["LoadPlan"] as const;
  static override modelFamily = "LoadPlan";
  private static readonly timelines = new WeakMap<Resource, TimeLine<LoadPlan>>();

  private load: Load | null = null;
  private resource: Resource | null = null;
  private operationPlan: OperationPlan | null = null;
  private otherLoadPlan: LoadPlan | null = null;
  private start = true;
  private confirmed = false;
  private closed = false;
  private attached = false;
  private disposed = false;

  constructor(operationPlan?: OperationPlan | null, load?: Load | null, assignedResource?: Resource | null) {
    super();
    if (operationPlan) this.setOperationPlan(operationPlan);
    if (load) this.assignLoad(load, false);
    if (assignedResource) this.assignResource(assignedResource, false, false);
    else if (operationPlan && load) {
      const preferred = load.findPreferredResource(operationPlan.getSetupEnd(), operationPlan) ?? load.getResource();
      if (preferred) this.assignResource(preferred, false, false);
    }
    this.ensureAttached();
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static reader(_metadata: unknown, fields: Readonly<Record<string, unknown>>): LoadPlan | null {
    const operationPlan = fields.operationplan;
    const resource = fields.resource;
    if (!(operationPlan instanceof HeaderModelAdapter)) throw new DataException("Missing or invalid operationplan field");
    if (!(resource instanceof Resource)) throw new DataException("Missing or invalid resource field");
    const plans = invoke(operationPlan, "getLoadPlans");
    if (plans && typeof (plans as Iterable<unknown>)[Symbol.iterator] === "function") {
      for (const candidate of plans as Iterable<unknown>) {
        if (candidate instanceof LoadPlan && candidate.getResource()?.getTop() === resource.getTop()) return candidate;
      }
    }
    const operation = invoke(operationPlan, "getOperation");
    const loads = invoke(operation, "getLoads");
    if (!Array.isArray(loads)) throw new DataException("No load matches the resource");
    const load = loads.find((candidate) => candidate instanceof Load && candidate.getResource()?.getTop() === resource.getTop());
    if (!(load instanceof Load)) throw new DataException("No load matches the resource");
    return new LoadPlan(operationPlan as OperationPlan, load, resource);
  }

  getType(): string { return "loadplan"; }
  getLoad(): Load | null { return this.load; }
  getResource(): Resource | null { return this.resource; }
  override getOperationPlan(): OperationPlan | null { return this.operationPlan; }
  getOperation(): Operation | null { return this.operationPlan?.getOperation() ?? this.load?.getOperation() ?? null; }
  getStartDate(): PlanningDate { return this.operationPlan?.getStart() ?? PlanningDate.infinitePast; }
  getEndDate(): PlanningDate {
    if (!this.operationPlan) return PlanningDate.infiniteFuture;
    return this.load ? this.operationPlan.getEnd() : this.operationPlan.getSetupEnd();
  }
  override getTimeLine(): TimeLine<TimeLineEvent> | null {
    return (this.resource ? LoadPlan.timelines.get(this.resource) : null) as TimeLine<TimeLineEvent> | null;
  }
  getOtherLoadPlan(): LoadPlan | null { return this.otherLoadPlan; }
  isStart(): boolean { return this.start; }
  isSetupOnly(): boolean { return this.load === null; }
  getHidden(): boolean { return this.getQuantity() < 0 || Boolean(this.load?.getHidden()); }
  getSetupLoad(): string { return this.load?.getSetup() ?? ""; }
  getSetup(myselfOnly = true): string | HeaderModelAdapter | null {
    const setup = this.operationPlan?.getSetupEvent() ?? null;
    if (myselfOnly) return String(invoke(setup, "getSetup") ?? "");
    if (setup) return setup;
    const events = this.resourceSnapshot();
    const index = events.indexOf(this);
    for (let current = index - 1; current >= 0; current -= 1) {
      const event = events[current];
      if (event && eventType(event) === 5) return event;
    }
    return null;
  }

  setOperationPlan(value: OperationPlan | null): void {
    if (value === this.operationPlan) return;
    if (this.operationPlan && value) {
      Environment.log("Warning: Can't change the operationplan of a loadplan");
      return;
    }
    const previous = this.operationPlan;
    invoke(previous, "detachLoadPlan", this);
    link(this, "OperationPlan", previous as HeaderModelAdapter | null, value as HeaderModelAdapter | null);
    this.operationPlan = value;
    invoke(value, "attachLoadPlan", this);
    this.ensureAttached();
  }

  setLoad(value: Load | null): void {
    if (!value) throw new DataException("Can't switch to nullptr load");
    this.assignLoad(value, true);
  }
  private assignLoad(value: Load, moveResource: boolean): void {
    if (value === this.load) return;
    const previous = this.load;
    if (previous && previous.getOperation() !== value.getOperation()) {
      throw new DataException("Only switching to a load on the same operation is allowed");
    }
    const previousBucketized = previous?.getResource() instanceof ResourceBuckets;
    const nextBucketized = value.getResource() instanceof ResourceBuckets;
    if (previous && previousBucketized !== nextBucketized) {
      throw new DataException("Cannot switch between alternate loads from bucketized and default resources");
    }
    link(this, "Load", previous, value);
    this.load = value;
    if (this.otherLoadPlan) {
      link(this.otherLoadPlan, "Load", this.otherLoadPlan.load, value);
      this.otherLoadPlan.load = value;
    }
    if (moveResource) {
      const nextResource = value.getResource();
      if (!nextResource) throw new DataException("Load doesn't have a resource");
      this.setResource(nextResource, false, false);
    }
    this.ensureAttached();
    if (this.attached) this.updatePair();
  }

  setResource(value: Resource | null, check = true, useStart = true): void {
    if (!value) throw new DataException("Can't switch to nullptr resource");
    if (!this.load) throw new DataException("Can't switch setup resources");
    this.assignResource(value, check, useStart);
  }
  private assignResource(value: Resource, check: boolean, useStart: boolean): void {
    if (value === this.resource) return;
    if (check) this.validateResource(value);
    const pair = this.otherLoadPlan;
    const previous = this.resource;
    this.detachResource();
    if (pair) pair.detachResource();
    link(this, "Resource", previous, value);
    this.resource = value;
    if (pair) {
      link(pair, "Resource", pair.resource, value);
      pair.resource = value;
    }
    this.ensureAttached(true);
    if (pair) pair.ensureAttached(false);
    this.updatePair();
    if (this.operationPlan) {
      const setupEnd = this.operationPlan.getSetupEnd();
      const end = this.operationPlan.getEnd();
      const quantity = this.operationPlan.getQuantity();
      this.operationPlan.setStartEndAndQuantity(setupEnd, end, quantity);
      this.operationPlan.clearSetupEvent();
      if (useStart) this.operationPlan.setStart(this.operationPlan.getStart());
      else this.operationPlan.setEnd(this.operationPlan.getEnd());
    }
    previous?.updateSetupTime();
  }
  private validateResource(value: Resource): void {
    if (!this.load || !this.operationPlan) return;
    const operation = this.operationPlan.getOperation();
    const valid = operation?.getLoads().some((candidate) => candidate instanceof Load &&
      (!this.load?.getName() || candidate.getName() === this.load.getName()) &&
      candidate.getResource()?.getTop() === value.getTop());
    if (!valid) Environment.log("Warning: Resource isn't matching the resource specified on the load");
    const skill = this.load.getSkill();
    if (skill && !value.hasSkill(skill, this.getDate(), this.getDate())) {
      Environment.log("Warning: Resource misses the skill specified on the load");
    }
  }

  update(): void { this.updatePair(); }
  private updatePair(): void {
    const updates = [this, this.otherLoadPlan].filter((plan): plan is LoadPlan =>
      Boolean(plan?.attached && plan.load && plan.resource));
    const timelines = new Map<TimeLine<LoadPlan>, LoadPlan[]>();
    for (const plan of updates) {
      const timeline = plan.resourceTimeline();
      const plans = timelines.get(timeline);
      if (plans) plans.push(plan);
      else timelines.set(timeline, [plan]);
    }
    for (const [timeline, plans] of timelines) {
      timeline.batch(() => {
        for (const plan of plans) {
          if (!plan.load) continue;
          timeline.update(plan, plan.load.getLoadplanQuantity(plan), plan.load.getLoadplanDate(plan));
        }
      });
    }
    const resources = new Set(updates.map((plan) => plan.resource).filter((resource): resource is Resource => Boolean(resource)));
    for (const resource of resources) LoadPlan.recomputeResource(resource);
  }

  setQuantity(value: number): void {
    if (this.getProposed() || !this.resource) return;
    const quantity = Number(value);
    const timeline = this.resourceTimeline();
    timeline.batch(() => {
      timeline.update(this, quantity, this.getDate());
      if (this.otherLoadPlan) timeline.update(this.otherLoadPlan, -quantity, this.otherLoadPlan.getDate());
    });
    LoadPlan.recomputeResource(this.resource);
  }
  getStatus(): string { return this.closed ? "closed" : this.confirmed ? "confirmed" : "proposed"; }
  setStatus(value: string): void {
    const status = String(value).toLowerCase();
    if (status === "confirmed") this.setConfirmed(true);
    else if (status === "proposed") this.setProposed(true);
    else if (status === "closed") this.setClosed(true);
    else throw new DataException(`invalid operationplanresource status:${value}`);
  }
  getProposed(): boolean { return !this.confirmed && !this.closed; }
  setProposed(value: boolean): void { this.confirmed = !value; this.closed = false; }
  getConfirmed(): boolean { return this.confirmed; }
  setConfirmed(value: boolean): void { this.confirmed = Boolean(value); if (value) this.closed = false; }
  getClosed(): boolean { return this.closed; }
  setClosed(value: boolean): void { this.closed = Boolean(value); if (value) this.confirmed = false; }

  override getMax(inclusive = true): number {
    const events = this.resourceSnapshot();
    const ownDate = this.getDate();
    let maximum = this.resource?.getMaximum() ?? 0;
    for (const event of events) {
      const comparison = eventDate(event).compare(ownDate);
      if (comparison > 0 || (!inclusive && comparison === 0)) break;
      if (eventType(event) === 4) maximum = Number(invoke(event, "getMax") ?? eventOnhand(event));
    }
    return maximum;
  }
  getFeasible(): boolean {
    const resource = this.resource;
    if (!resource || !resource.getConstrained() || resource instanceof ResourceInfinite) return true;
    const events = this.resourceSnapshot();
    let index = events.indexOf(this);
    if (index < 0) return true;
    if (resource instanceof ResourceBuckets) {
      for (; index < events.length && eventType(events[index] as HeaderModelAdapter) !== 2; index += 1) {
        const event = events[index];
        if (event instanceof LoadPlan && event.getOnhand() < -ROUNDING_ERROR) return false;
      }
      return true;
    }
    const startPlan = this.getQuantity() > 0 ? this : this.otherLoadPlan ?? this;
    index = events.indexOf(startPlan);
    let maximum = startPlan.getMax();
    for (; index >= 0 && index < events.length; index += 1) {
      const event = events[index];
      if (!event) continue;
      if (event instanceof LoadPlan && event.getOperationPlan() === this.operationPlan && event.getQuantity() < 0) break;
      if (eventType(event) === 4) maximum = Number(invoke(event, "getMax", false) ?? eventOnhand(event));
      if (eventType(event) !== 5 && event instanceof LoadPlan && event.isLastResourceEventOnDate() &&
          event.getOnhand() > maximum + ROUNDING_ERROR) return false;
    }
    return true;
  }

  getBucketEnd(): readonly [number, PlanningDate, number] {
    if (!(this.resource instanceof ResourceBuckets)) throw new LogicException("Bucket boundaries require a bucketized resource");
    const events = this.resourceSnapshot();
    const index = events.indexOf(this);
    let availableBefore = this.getOnhand();
    for (const event of events.slice(Math.max(index, 0))) {
      if (eventType(event) === 2) return [availableBefore, eventDate(event), eventOnhand(event)];
      if (event instanceof LoadPlan) availableBefore = event.getOnhand();
    }
    return [availableBefore, PlanningDate.infiniteFuture, 0];
  }
  getBucketStart(): readonly [number, PlanningDate, number] {
    if (!(this.resource instanceof ResourceBuckets)) throw new LogicException("Bucket boundaries require a bucketized resource");
    const events = this.resourceSnapshot();
    let index = events.indexOf(this);
    let availableAfter = this.getOnhand();
    for (; index >= 0; index -= 1) {
      const event = events[index];
      if (!event) continue;
      availableAfter = eventQuantity(event);
      if (eventType(event) === 2) {
        const previous = events[index - 1];
        return [previous instanceof LoadPlan ? previous.getOnhand() : 0, eventDate(event), availableAfter];
      }
    }
    return [0, PlanningDate.infinitePast, availableAfter];
  }
  getAlternates(): LoadPlanAlternateIterator { return new LoadPlanAlternateIterator(this); }

  private ensureAttached(createPair = true): void {
    if (this.attached || !this.operationPlan || !this.load || !this.resource) return;
    this.attached = true;
    invoke(this.operationPlan, "attachLoadPlan", this);
    this.resource.attachLoadPlan(this);
    this.resourceTimeline().insert(this, this.load.getLoadplanQuantity(this), this.load.getLoadplanDate(this));
    if (createPair && this.start && !(this.resource instanceof ResourceBuckets) && !this.otherLoadPlan) this.createEndPair();
    LoadPlan.recomputeResource(this.resource);
  }
  private createEndPair(): void {
    if (!this.operationPlan || !this.load || !this.resource) return;
    const end = new LoadPlan();
    end.start = false;
    end.operationPlan = this.operationPlan;
    end.load = this.load;
    end.resource = this.resource;
    end.otherLoadPlan = this;
    this.otherLoadPlan = end;
    link(end, "OperationPlan", null, this.operationPlan as HeaderModelAdapter);
    link(end, "Load", null, this.load);
    link(end, "Resource", null, this.resource);
    end.ensureAttached(false);
  }
  private resourceTimeline(): TimeLine<LoadPlan> {
    if (!this.resource) throw new LogicException("LoadPlan doesn't have a resource");
    let timeline = LoadPlan.timelines.get(this.resource);
    if (!timeline) { timeline = new TimeLine<LoadPlan>(); LoadPlan.timelines.set(this.resource, timeline); }
    return timeline;
  }
  private resourceSnapshot(): HeaderModelAdapter[] {
    return this.resource ? [...this.resource.getLoadPlans()] : [];
  }
  private isLastResourceEventOnDate(): boolean {
    const events = this.resourceSnapshot();
    const index = events.indexOf(this);
    const next = events[index + 1];
    return !next || !eventDate(next).equals(this.getDate());
  }
  private detachResource(): void {
    if (!this.resource) return;
    LoadPlan.timelines.get(this.resource)?.erase(this);
    this.resource.detachLoadPlan(this);
    this.attached = false;
  }
  private static recomputeResource(resource: Resource): void {
    resource.recomputeTimelineBalances();
  }
  override modelReferenceTargetDisposed(_target: HeaderModelAdapter, property: string): void {
    if (["Load", "Resource", "OperationPlan"].includes(property)) this.dispose();
    else super.modelReferenceTargetDisposed(_target, property);
  }
  override dispose(): void { this.disposePair(true); }
  private disposePair(disposeOther: boolean): void {
    if (this.disposed) return;
    this.disposed = true;
    const other = this.otherLoadPlan;
    this.otherLoadPlan = null;
    if (other) other.otherLoadPlan = null;
    this.detachResource();
    const operationPlan = this.operationPlan;
    const load = this.load;
    const resource = this.resource;
    this.operationPlan = null;
    this.load = null;
    this.resource = null;
    invoke(operationPlan, "detachLoadPlan", this);
    link(this, "OperationPlan", operationPlan as HeaderModelAdapter | null, null);
    link(this, "Load", load, null);
    link(this, "Resource", resource, null);
    if (disposeOther) other?.disposePair(false);
    if (resource) LoadPlan.recomputeResource(resource);
    super.dispose();
  }
}

export class LoadPlanAlternateIterator extends HeaderModelAdapter implements Iterable<Resource> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["LoadPlan::AlternateIterator"] as const;
  private readonly resources: Resource[] = [];
  private index = 0;
  constructor(loadPlan?: LoadPlan | null) {
    super();
    const load = loadPlan?.getLoad();
    const operation = load?.getOperation();
    if (!loadPlan || !load || !operation) return;
    for (const alternate of operation.getLoads()) {
      if (!(alternate instanceof Load)) continue;
      if (load.getName() ? alternate.getName() !== load.getName() : alternate !== load) continue;
      const root = alternate.getResource();
      if (!root) continue;
      const candidates = root.isGroup() ? [...root.getAllMembers()] : [root];
      for (const resource of candidates) {
        if (resource === loadPlan.getResource() || resource.isGroup() || this.resources.includes(resource)) continue;
        const skill = alternate.getSkill();
        if (skill && !resource.hasSkill(skill, loadPlan.getDate(), loadPlan.getDate())) continue;
        const efficiency = resource.getEfficiencyCalendar()?.getValue(loadPlan.getStartDate()) ?? resource.getEfficiency();
        if (efficiency <= 0) continue;
        const assigned = [...loadPlan.getOperationPlan()!.getLoadPlans()].some((candidate) =>
          candidate instanceof LoadPlan && candidate.getResource() === resource);
        if (!assigned) this.resources.push(resource);
      }
    }
  }
  next(): Resource | null { return this.resources[this.index++] ?? null; }
  override [Symbol.iterator](): Iterator<Resource> { return this.resources.values(); }
}

export class LoadPlanIterator extends HeaderModelAdapter implements Iterable<LoadPlan> {
  static readonly cppBases = ["PythonExtension"] as const;
  static readonly cppQualifiedNames = ["LoadPlanIterator"] as const;
  private readonly values: LoadPlan[];
  private index = 0;
  constructor(source?: Resource | OperationPlan | Iterable<LoadPlan> | null) {
    super();
    const modeled = invoke(source, "getLoadPlans");
    const values = modeled && typeof (modeled as Iterable<unknown>)[Symbol.iterator] === "function"
      ? modeled as Iterable<unknown>
      : source && typeof (source as Iterable<unknown>)[Symbol.iterator] === "function"
        ? source as Iterable<unknown>
        : [];
    this.values = values && typeof (values as Iterable<unknown>)[Symbol.iterator] === "function"
      ? [...values as Iterable<unknown>].filter((value): value is LoadPlan => value instanceof LoadPlan) : [];
  }
  static override initialize(): number { return 0; }
  next(): LoadPlan | null {
    while (this.index < this.values.length) {
      const value = this.values[this.index++];
      if (value && value.getQuantity() !== 0) return value;
    }
    return null;
  }
  override [Symbol.iterator](): Iterator<LoadPlan> { return this.values.filter((value) => value.getQuantity() !== 0).values(); }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/loadplan.cpp.
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
  { name: "LoadPlan::initialize", sourceLine: 33, status: "adapted" },
  { name: "LoadPlan::LoadPlan", sourceLine: 51, status: "adapted" },
  { name: "Plan::instance", sourceLine: 90, status: "adapted" },
  { name: "LoadPlan::LoadPlan", sourceLine: 103, status: "adapted" },
  { name: "LoadPlan::LoadPlan", sourceLine: 139, status: "adapted" },
  { name: "LoadPlan::setResource", sourceLine: 170, status: "adapted" },
  { name: "LoadPlan::getStatus", sourceLine: 286, status: "adapted" },
  { name: "LoadPlan::setStatus", sourceLine: 295, status: "adapted" },
  { name: "LoadPlan::update", sourceLine: 306, status: "adapted" },
  { name: "LoadPlan::getSetup", sourceLine: 324, status: "adapted" },
  { name: "LoadPlan::~LoadPlan", sourceLine: 349, status: "adapted" },
  { name: "LoadPlan::setLoad", sourceLine: 354, status: "adapted" },
  { name: "LoadPlan::getFeasible", sourceLine: 376, status: "adapted" },
  { name: "LoadPlan::reader", sourceLine: 407, status: "adapted" },
  { name: "LoadPlan::create", sourceLine: 494, status: "adapted" },
  { name: "Load::getLoadplanQuantity", sourceLine: 533, status: "adapted" },
  { name: "Plan::instance", sourceLine: 568, status: "adapted" },
  { name: "LoadPlan::getBucketEnd", sourceLine: 580, status: "adapted" },
  { name: "LoadPlan::getBucketStart", sourceLine: 592, status: "adapted" },
  { name: "LoadPlanIterator::initialize", sourceLine: 609, status: "adapted" },
  { name: "LoadPlanIterator::iternext", sourceLine: 618, status: "adapted" },
  { name: "LoadPlan::AlternateIterator::AlternateIterator", sourceLine: 640, status: "adapted" },
  { name: "LoadPlan::AlternateIterator::next", sourceLine: 678, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface AlternateIteratorPort {
  AlternateIterator(...args: readonly PortValue[]): PortValue | void;
  next(...args: readonly PortValue[]): PortValue | void;
}

export interface LoadPort {
  getLoadplanQuantity(...args: readonly PortValue[]): PortValue | void;
}

export interface LoadPlanPort {
  LoadPlan(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  disposeLoadPlan(...args: readonly PortValue[]): PortValue | void;
  getBucketEnd(...args: readonly PortValue[]): PortValue | void;
  getBucketStart(...args: readonly PortValue[]): PortValue | void;
  getFeasible(...args: readonly PortValue[]): PortValue | void;
  getSetup(...args: readonly PortValue[]): PortValue | void;
  getStatus(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  reader(...args: readonly PortValue[]): PortValue | void;
  setLoad(...args: readonly PortValue[]): PortValue | void;
  setResource(...args: readonly PortValue[]): PortValue | void;
  setStatus(...args: readonly PortValue[]): PortValue | void;
  update(...args: readonly PortValue[]): PortValue | void;
}

export interface LoadPlanIteratorPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
  iternext(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/loadplan.cpp";
export const targetFile = "model/loadplan.ts";

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
  "const MetaCategory* LoadPlan::metacategory;",
  "const MetaClass* LoadPlan::metadata;",
  "",
  "int LoadPlan::initialize() {",
  "  // Initialize the metadata",
  "  metacategory =",
  "      MetaCategory::registerCategory<LoadPlan>(\"loadplan\", \"loadplans\", reader);",
  "  registerFields<LoadPlan>(const_cast<MetaCategory*>(metacategory));",
  "  metadata = MetaClass::registerClass<LoadPlan>(\"loadplan\", \"loadplan\", true);",
  "",
  "  // Initialize the Python type",
  "  auto& x = FreppleCategory<LoadPlan>::getPythonType();",
  "  x.setName(\"loadplan\");",
  "  x.setDoc(\"frePPLe loadplan\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "LoadPlan::LoadPlan(OperationPlan* o, const Load* r, Resource* assigned) {",
  "  // Initialize the Python type",
  "  initType(metadata);",
  "",
  "  assert(o);",
  "  ld = const_cast<Load*>(r);",
  "  oper = o;",
  "",
  "  // Update the resource field",
  "  if (assigned)",
  "    res = assigned;",
  "  else",
  "    res = r->findPreferredResource(o->getSetupEnd(), o);",
  "",
  "  // Add to the operationplan",
  "  nextLoadPlan = nullptr;",
  "  if (o->firstloadplan) {",
  "    // Append to the end",
  "    auto c = o->firstloadplan;",
  "    while (c->nextLoadPlan) c = c->nextLoadPlan;",
  "    c->nextLoadPlan = this;",
  "  } else",
  "    // First in the list",
  "    o->firstloadplan = this;",
  "",
  "  // Insert in the resource timeline",
  "  if (ld)",
  "    res->loadplans.insert(this, ld->getLoadplanQuantity(this),",
  "                          ld->getLoadplanDate(this));",
  "  else",
  "    res->loadplans.insert(this, getQuantity() ? getQuantity() : 1,",
  "                          isStart() ? o->getStart() : o->getEnd());",
  "",
  "  // For continuous resources, create a loadplan to mark",
  "  // the end of the operationplan.",
  "  if (!getResource()->hasType<ResourceBuckets>()) new LoadPlan(o, r, this);",
  "",
  "  // For pooled resource, create individual loadplans when activated",
  "  if (ld && ld->getResource()->isGroup() && ld->getQuantity() > 1.0 &&",
  "      Plan::instance().getIndividualPoolResources() && !assigned) {",
  "    for (auto tmp = ld->getQuantity(); tmp > 1.0; tmp -= 1.0) {",
  "      auto n = new LoadPlan(o, r, static_cast<LoadPlan*>(nullptr));",
  "      if (!n->getResource()->hasType<ResourceBuckets>()) new LoadPlan(o, r, n);",
  "    }",
  "  }",
  "",
  "  // Mark the operation and resource as being changed. This will trigger",
  "  // the recomputation of their problems",
  "  getResource()->setChanged();",
  "  o->getOperation()->setChanged();",
  "}",
  "",
  "LoadPlan::LoadPlan(OperationPlan* o, const Load* r, LoadPlan* lp)",
  "    : otherLoadPlan(lp) {",
  "  ld = const_cast<Load*>(r);",
  "  oper = o;",
  "  if (lp) {",
  "    flags |= TYPE_END;",
  "    lp->otherLoadPlan = this;",
  "  }",
  "",
  "  // Update the resource field",
  "  res = lp ? lp->getResource() : r->findPreferredResource(o->getSetupEnd(), o);",
  "",
  "  // Add to the operationplan",
  "  nextLoadPlan = nullptr;",
  "  if (o->firstloadplan) {",
  "    // Append to the end",
  "    auto c = o->firstloadplan;",
  "    while (c->nextLoadPlan) c = c->nextLoadPlan;",
  "    c->nextLoadPlan = this;",
  "  } else",
  "    // First in the list",
  "    o->firstloadplan = this;",
  "",
  "  // Insert in the resource timeline",
  "  if (ld)",
  "    getResource()->loadplans.insert(this, ld->getLoadplanQuantity(this),",
  "                                    ld->getLoadplanDate(this));",
  "  else if (lp)",
  "    getResource()->loadplans.insert(this, -lp->getQuantity(), o->getEnd());",
  "  else",
  "    throw LogicException(\"LoadPlan creation requires either a load or a sibling LoadPlan\");",
  "",
  "  // Initialize the Python type",
  "  initType(metadata);",
  "}",
  "",
  "LoadPlan::LoadPlan(OperationPlan* o, SetupEvent* e, bool start) : oper(o) {",
  "  assert(o && e && e->getRule() && e->getRule()->getResource());",
  "",
  "  // Initialize",
  "  initType(metadata);",
  "  res = e->getRule()->getResource();",
  "  if (!start) flags |= TYPE_END;",
  "",
  "  // Add to the operationplan",
  "  nextLoadPlan = nullptr;",
  "  if (o->firstloadplan) {",
  "    // Append to the end",
  "    auto c = o->firstloadplan;",
  "    while (c->nextLoadPlan) c = c->nextLoadPlan;",
  "    c->nextLoadPlan = this;",
  "  } else",
  "    // First in the list",
  "    o->firstloadplan = this;",
  "",
  "  // Insert in the resource timeline",
  "  getResource()->loadplans.insert(this, e->getLoadplanQuantity(this),",
  "                                  e->getLoadplanDate(this));",
  "",
  "  // For continuous resources, create a loadplan to mark the end of the setup.",
  "  if (!getResource()->hasType<ResourceBuckets>() && start)",
  "    new LoadPlan(o, e, false);",
  "",
  "  // Mark the resource as being changed.",
  "  getResource()->setChanged();",
  "}",
  "",
  "void LoadPlan::setResource(Resource* newres, bool check, bool use_start) {",
  "  // Nothing to do",
  "  if (res == newres) return;",
  "",
  "  // Validate the argument",
  "  if (!newres) throw DataException(\"Can't switch to nullptr resource\");",
  "  if (!getLoad()) throw DataException(\"Can't switch setup resources\");",
  "  if (check) {",
  "    // New resource must be a subresource of the load's resource, or have the",
  "    // load name.",
  "    bool ok = false;",
  "    for (auto lditer = getOperationPlan()->getOperation()->getLoads().begin();",
  "         lditer != getOperationPlan()->getOperation()->getLoads().end() && !ok;",
  "         ++lditer) {",
  "      if ((getLoad()->getName().empty() ||",
  "           lditer->getName() == getLoad()->getName()) &&",
  "          newres->getTop() == lditer->getResource()->getTop())",
  "        ok = true;",
  "    }",
  "    if (!ok)",
  "      logger << \"Warning: Resource isn't matching the resource specified on \"",
  "                \"the load\"",
  "             << '\\n';",
  "",
  "    // New resource must have the required skill",
  "    if (getLoad()->getSkill()) {",
  "      ok = false;",
  "      Resource::skilllist::const_iterator s = newres->getSkills();",
  "      while (ResourceSkill* rs = s.next())",
  "        if (rs->getSkill() == getLoad()->getSkill()) {",
  "          ok = true;",
  "          break;",
  "        }",
  "      if (!ok)",
  "        logger << \"Warning: Resource misses the skill specified on the load\\n\";",
  "    }",
  "  }",
  "",
  "  // Mark entities as changed",
  "  Resource* oldRes = res;",
  "  if (oper) oper->getOperation()->setChanged();",
  "  if (res && res != newres) res->setChanged();",
  "  newres->setChanged();",
  "",
  "  // Change this loadplan and its brother",
  "  LoadPlan* ldplan =",
  "      getResource()->hasType<ResourceBuckets>() ? this : getOtherLoadPlan();",
  "  while (ldplan) {",
  "    // Remove from the old resource, if there is one",
  "    if (res) {",
  "      res->loadplans.erase(ldplan);",
  "      res->setChanged();",
  "    }",
  "",
  "    // Insert in the new resource.",
  "    // This code assumes the date and quantity of the loadplan don't change",
  "    // when a new resource is assigned.",
  "    ldplan->res = newres;",
  "    newres->loadplans.insert(ldplan, getLoad()->getLoadplanQuantity(ldplan),",
  "                             getLoad()->getLoadplanDate(ldplan));",
  "",
  "    // Repeat for the brother loadplan or exit",
  "    if (ldplan != this)",
  "      ldplan = this;",
  "    else",
  "      break;",
  "  }",
  "",
  "  // Clear the setup event",
  "  oper->setStartEndAndQuantity(oper->getSetupEnd(), oper->getEnd(),",
  "                               oper->getQuantity());",
  "  oper->clearSetupEvent();",
  "",
  "  // The new resource may have a different availability calendar,",
  "  // and we need to make sure to respect it.",
  "  if (use_start)",
  "    oper->setStart(oper->getStart());",
  "  else",
  "    oper->setEnd(oper->getEnd());",
  "",
  "  // Update the setup time on the old resource",
  "  if (oldRes) oldRes->updateSetupTime();",
  "",
  "  // Change the resource",
  "  newres->setChanged();",
  "",
  "  // Switch also other steps in a routing if the use the same tool",
  "  if ((newres->getTool() || newres->getToolPerPiece()) &&",
  "      getOperationPlan()->getOwner() && getResource()->getOwner() &&",
  "      getLoad() &&",
  "      getOperationPlan()",
  "          ->getOwner()",
  "          ->getOperation()",
  "          ->hasType<OperationRouting>()) {",
  "    // Scan for other steps that use the same tool and same skill",
  "    auto routingopplan = getOperationPlan()->getOwner();",
  "    auto subopplans = routingopplan->getSubOperationPlans();",
  "    while (auto subopplan = subopplans.next()) {",
  "      if (subopplan == getOperationPlan()) continue;",
  "      auto subldplniter = subopplan->getLoadPlans();",
  "      while (auto subldpln = subldplniter.next()) {",
  "        if (subldpln->getLoad() &&",
  "            subldpln->getLoad()->getResource() == getLoad()->getResource() &&",
  "            subldpln->getLoad()->getSkill() == getLoad()->getSkill() &&",
  "            subldpln->getResource() != getResource()) {",
  "          // Switch another step to this resource",
  "          // Note that we switch only a single loadplan. The call below continue",
  "          // to deeper levels",
  "          subldpln->setResource(newres, false, use_start);",
  "          return;",
  "        }",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "string LoadPlan::getStatus() const {",
  "  if (flags & STATUS_CONFIRMED)",
  "    return \"confirmed\";",
  "  else if (flags & STATUS_CLOSED)",
  "    return \"closed\";",
  "  else",
  "    return \"proposed\";",
  "}",
  "",
  "void LoadPlan::setStatus(const string& s) {",
  "  if (s == \"confirmed\") {",
  "    setConfirmed(true);",
  "  } else if (s == \"proposed\")",
  "    setProposed(true);",
  "  else if (s == \"closed\") {",
  "    setClosed(true);",
  "  } else",
  "    throw DataException(\"invalid operationplanresource status:\" + s);",
  "}",
  "",
  "void LoadPlan::update() {",
  "  if (ld) {",
  "    // Update the timeline data structure",
  "    getResource()->getLoadPlans().update(this, ld->getLoadplanQuantity(this),",
  "                                         ld->getLoadplanDate(this));",
  "    ld->getOperation()->setChanged();",
  "  } else if (getOperationPlan()->getSetupEvent()) {",
  "    auto s = getOperationPlan()->getSetupEvent();",
  "    if (s->getRule() && s->getRule()->getResource())",
  "      // Update the setup resource timeline data",
  "      s->getRule()->getResource()->getLoadPlans().update(",
  "          this, s->getLoadplanQuantity(this), s->getLoadplanDate(this));",
  "  }",
  "",
  "  // Mark the resource as being changed.",
  "  getResource()->setChanged();",
  "}",
  "",
  "SetupEvent* LoadPlan::getSetup(bool myself_only) const {",
  "  auto opplan = getOperationPlan();",
  "  if (!getResource()->getSetupMatrix() || !opplan) return nullptr;",
  "  if (myself_only) return opplan->getSetupEvent();",
  "  Resource::loadplanlist::const_iterator tmp;",
  "  if (opplan->getSetupEvent())",
  "    // Setup event being used",
  "    tmp = opplan->getSetupEvent();",
  "  else if (isStart())",
  "    // Start loadplan",
  "    tmp = this;",
  "  else",
  "    // End loadplan",
  "    tmp = getOtherLoadPlan();",
  "  while (tmp != getResource()->getLoadPlans().end()) {",
  "    if (tmp->getEventType() == 5 &&",
  "        (tmp->getDate() < opplan->getSetupEnd() ||",
  "         (tmp->getOperationPlan() && tmp->getDate() == opplan->getSetupEnd() &&",
  "          *(tmp->getOperationPlan()) < *opplan)))",
  "      return const_cast<SetupEvent*>(static_cast<const SetupEvent*>(&*tmp));",
  "    --tmp;",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "LoadPlan::~LoadPlan() {",
  "  getResource()->setChanged();",
  "  getResource()->loadplans.erase(this);",
  "}",
  "",
  "void LoadPlan::setLoad(Load* newld) {",
  "  // No change",
  "  if (newld == ld) return;",
  "",
  "  // Verify the data",
  "  if (!newld) throw DataException(\"Can't switch to nullptr load\");",
  "  if (ld && ld->getOperation() != newld->getOperation())",
  "    throw DataException(",
  "        \"Only switching to a load on the same operation is allowed\");",
  "  if (ld && ld->getResource()->hasType<ResourceBuckets>() !=",
  "                newld->getResource()->hasType<ResourceBuckets>())",
  "    throw DataException(",
  "        \"Cannot switch between alternate loads from bucketized and default \"",
  "        \"resources\");",
  "",
  "  // Update the load and resource fields",
  "  LoadPlan* o = getOtherLoadPlan();",
  "  if (o) o->ld = newld;",
  "  ld = newld;",
  "  setResource(newld->getResource(), false, false);",
  "}",
  "",
  "bool LoadPlan::getFeasible() const {",
  "  if (!getResource()->getConstrained())",
  "    // Unconstrained resource",
  "    return true;",
  "  if (getResource()->hasType<ResourceDefault>()) {",
  "    auto ldpln = getQuantity() > 0 ? this : getOtherLoadPlan();",
  "    auto curMax = ldpln->getMax();",
  "    for (auto cur = getResource()->getLoadPlans().begin(ldpln);",
  "         cur != getResource()->getLoadPlans().end(); ++cur) {",
  "      if (cur->getOperationPlan() == getOperationPlan() &&",
  "          cur->getQuantity() < 0)",
  "        break;",
  "      if (cur->getEventType() == 4) curMax = cur->getMax(false);",
  "      if (cur->getEventType() != 5 && cur->isLastOnDate() &&",
  "          cur->getOnhand() > curMax + ROUNDING_ERROR)",
  "        // Overload on default resource",
  "        return false;",
  "    }",
  "  } else if (getResource()->hasType<ResourceBuckets>()) {",
  "    for (auto cur = getResource()->getLoadPlans().begin(this);",
  "         cur != getResource()->getLoadPlans().end() && cur->getEventType() != 2;",
  "         ++cur) {",
  "      if (cur->getOnhand() < -ROUNDING_ERROR)",
  "        // Overloaded capacity on bucketized resource",
  "        return false;",
  "    }",
  "  }",
  "  // Not overloaded",
  "  return true;",
  "}",
  "",
  "Object* LoadPlan::reader(const MetaClass*, const DataValueDict& in,",
  "                         CommandManager* mgr) {",
  "  // Pick up the operationplan attribute. An error is reported if it's missing.",
  "  const DataValue* opplanElement = in.get(Tags::operationplan);",
  "  if (!opplanElement) throw DataException(\"Missing operationplan field\");",
  "  Object* opplanobject = opplanElement->getObject();",
  "  if (!opplanobject || !opplanobject->hasType<OperationPlan>())",
  "    throw DataException(\"Invalid operationplan field\");",
  "  auto* opplan = static_cast<OperationPlan*>(opplanobject);",
  "",
  "  // Pick up the resource.",
  "  const DataValue* resourceElement = in.get(Tags::resource);",
  "  if (!resourceElement) throw DataException(\"Missing resource field\");",
  "  Object* resourceobject = resourceElement->getObject();",
  "  if (!resourceobject ||",
  "      resourceobject->getType().category != Resource::metadata)",
  "    throw DataException(\"Invalid resource field\");",
  "  auto* res = static_cast<Resource*>(resourceobject);",
  "",
  "  // Find the load on the operationplan that has the same top resource.",
  "  // If multiple exist, we pick up the first one.",
  "  // If none is found, we throw a data error.",
  "  auto ldplniter = opplan->getLoadPlans();",
  "  LoadPlan* ldpln_tmp = nullptr;",
  "  LoadPlan* ldpln = nullptr;",
  "  const Load* ld = nullptr;",
  "  auto individualresources = Plan::instance().getIndividualPoolResources();",
  "  while ((ldpln_tmp = ldplniter.next())) {",
  "    if ((individualresources && ldpln_tmp->getResource() == res) ||",
  "        (!individualresources &&",
  "         ldpln_tmp->getResource()->getTop() == res->getTop())) {",
  "      ldpln = ldpln_tmp;",
  "      break;",
  "    }",
  "  }",
  "",
  "  // Pick up the action attribute and update accordingly",
  "  const DataValue* statusElement = in.get(Tags::status);",
  "  switch (MetaClass::decodeAction(in)) {",
  "    case Action::ADD:",
  "      // Only additions are allowed",
  "      if (ldpln) {",
  "        ostringstream o;",
  "        o << \"Loadplan already exists\";",
  "        throw DataException(o.str());",
  "      }",
  "      for (auto& g : opplan->getOperation()->getLoads())",
  "        if (g.getResource()->getTop() == res->getTop()) ld = &g;",
  "      ldpln = new LoadPlan(opplan, ld, res);",
  "      if (statusElement) ldpln->setStatus(statusElement->getString());",
  "      opplan->setStart(opplan->getStart());  // Recompute duration",
  "      if (mgr) mgr->add(new CommandCreateObject(ldpln));",
  "      return ldpln;",
  "    case Action::CHANGE:",
  "      // Only changes are allowed",
  "      if (!ldpln) throw DataException(\"Loadplan not found\");",
  "      ldpln->setResource(res);",
  "      if (statusElement) ldpln->setStatus(statusElement->getString());",
  "      return ldpln;",
  "    case Action::REMOVE:",
  "      // Delete the entity",
  "      if (!ldpln)",
  "        throw DataException(\"Loadplan not found\");",
  "      else {",
  "        // Delete it",
  "        delete ldpln;",
  "        opplan->setStart(opplan->getStart());  // Recompute duration",
  "        return nullptr;",
  "      }",
  "    case Action::ADD_CHANGE:",
  "      if (!ldpln) {",
  "        // Adding a new loadplan",
  "        for (auto& g : opplan->getOperation()->getLoads())",
  "          if (g.getResource()->getTop() == res->getTop()) ld = &g;",
  "        ldpln = new LoadPlan(opplan, ld, res);",
  "        opplan->setStart(opplan->getStart());  // Recompute duration",
  "        if (mgr) mgr->add(new CommandCreateObject(ldpln));",
  "      } else",
  "        ldpln->setResource(res);",
  "      if (statusElement) ldpln->setStatus(statusElement->getString());",
  "      return ldpln;",
  "  }",
  "",
  "  // This part of the code is not expected to be reached",
  "  throw LogicException(\"Unreachable code reached\");",
  "}",
  "",
  "PyObject* LoadPlan::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Find or create the C++ object",
  "    PythonDataValueDict atts(kwds);",
  "    Object* ldpln = reader(LoadPlan::metadata, atts);",
  "    if (!ldpln) {",
  "      Py_INCREF(Py_None);",
  "      return Py_None;",
  "    }",
  "    Py_INCREF(ldpln);",
  "",
  "    // Iterate over extra keywords, and set attributes.",
  "    PyObject *key, *value;",
  "    Py_ssize_t pos = 0;",
  "    while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "      PythonData field(value);",
  "      PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "      DataKeyword attr(PyBytes_AsString(key_utf8));",
  "      Py_DECREF(key_utf8);",
  "      if (!attr.isA(Tags::operationplan) && !attr.isA(Tags::resource) &&",
  "          !attr.isA(Tags::action) && !attr.isA(Tags::status)) {",
  "        const MetaFieldBase* fmeta = ldpln->getType().findField(attr.getHash());",
  "        if (!fmeta && ldpln->getType().category)",
  "          fmeta = ldpln->getType().category->findField(attr.getHash());",
  "        if (fmeta)",
  "          // Update the attribute",
  "          fmeta->setField(ldpln, field);",
  "        else",
  "          ldpln->setProperty(attr.getName(), value);",
  "        ;",
  "      }",
  "    };",
  "    return static_cast<PyObject*>(ldpln);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "double Load::getLoadplanQuantity(const LoadPlan* lp) const {",
  "  if ((!lp->getOperationPlan()->getProposed() &&",
  "       !lp->getOperationPlan()->getConsumeCapacity()) ||",
  "      !lp->getOperationPlan()->getQuantity() ||",
  "      lp->getOperationPlan()->getClosed() ||",
  "      lp->getOperationPlan()->getCompleted())",
  "    // No capacity consumption required",
  "    return 0.0;",
  "  if (lp->getConfirmed()) return lp->getQuantity();",
  "  if (!lp->getOperationPlan()->getDates().overlap(getEffective()) &&",
  "      (lp->getOperationPlan()->getDates().getDuration() ||",
  "       !getEffective().within(lp->getOperationPlan()->getStart())))",
  "    // Load is not effective during this time.",
  "    // The extra check is required to make sure that zero duration",
  "    // operationplans operationplans don't get resized to 0",
  "    return 0.0;",
  "  if (lp->getResource()->hasType<ResourceBuckets>()) {",
  "    // Bucketized resource",
  "    auto efficiency =",
  "        (lp->getResource()->getEfficiencyCalendar()",
  "             ? lp->getResource()->getEfficiencyCalendar()->getValue(",
  "                   lp->getDate())",
  "             : lp->getResource()->getEfficiency()) /",
  "        100.0;",
  "    if (efficiency <= 0.0) return DBL_MIN;",
  "    auto q = -(getQuantityFixed() +",
  "               getQuantity() * lp->getOperationPlan()->getQuantity()) /",
  "             efficiency;",
  "    if (lp->getOperationPlan()->getQuantity() &&",
  "        lp->getOperationPlan()->getQuantityCompleted())",
  "      q *= lp->getOperationPlan()->getQuantityRemaining() /",
  "           lp->getOperationPlan()->getQuantity();",
  "    return q;",
  "  } else if (lp->getLoad()->getResource()->isGroup() &&",
  "             lp->getLoad()->getQuantity() > 1.0 &&",
  "             Plan::instance().getIndividualPoolResources())",
  "    // Continuous pooled resource with individual assignments",
  "    return lp->isStart() ? 1.0 : -1.0;",
  "  else if (lp->getResource()->getToolPerPiece())",
  "    // Tool-per-piece resource",
  "    return (lp->isStart() ? getQuantity() : -getQuantity()) *",
  "           lp->getOperationPlan()->getQuantity();",
  "  else",
  "    // Continuous resource",
  "    return (lp->isStart() ? getQuantity() : -getQuantity());",
  "}",
  "",
  "tuple<double, Date, double> LoadPlan::getBucketEnd() const {",
  "  assert(getResource()->hasType<ResourceBuckets>());",
  "  double available_before = getOnhand();",
  "  for (auto cur = res->getLoadPlans().begin(this);",
  "       cur != res->getLoadPlans().end(); ++cur) {",
  "    if (cur->getEventType() == 2)",
  "      return make_tuple(available_before, cur->getDate(), cur->getOnhand());",
  "    available_before = cur->getOnhand();",
  "  }",
  "  return make_tuple(available_before, Date::infiniteFuture, 0);",
  "}",
  "",
  "tuple<double, Date, double> LoadPlan::getBucketStart() const {",
  "  assert(getResource()->hasType<ResourceBuckets>());",
  "  double available_after = getOnhand();",
  "  for (auto cur = res->getLoadPlans().begin(this);",
  "       cur != res->getLoadPlans().end(); --cur) {",
  "    available_after = cur->getQuantity();",
  "    if (cur->getEventType() == 2) {",
  "      auto tmp = cur->getDate();",
  "      --cur;",
  "      return make_tuple(",
  "          cur != res->getLoadPlans().end() ? cur->getOnhand() : 0.0, tmp,",
  "          available_after);",
  "    }",
  "  }",
  "  return make_tuple(0.0, Date::infinitePast, available_after);",
  "}",
  "",
  "int LoadPlanIterator::initialize() {",
  "  // Initialize the type",
  "  auto& x = PythonExtension<LoadPlanIterator>::getPythonType();",
  "  x.setName(\"loadplanIterator\");",
  "  x.setDoc(\"frePPLe iterator for loadplan\");",
  "  x.supportiter();",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* LoadPlanIterator::iternext() {",
  "  LoadPlan* ld;",
  "  if (resource_or_opplan) {",
  "    // Skip zero quantity loadplans",
  "    while (*resiter != res->getLoadPlans().end() &&",
  "           (*resiter)->getQuantity() == 0.0)",
  "      ++(*resiter);",
  "    if (*resiter == res->getLoadPlans().end()) return nullptr;",
  "",
  "    // Return result",
  "    ld = const_cast<LoadPlan*>(static_cast<const LoadPlan*>(&*((*resiter)++)));",
  "  } else {",
  "    while (*opplaniter != opplan->endLoadPlans() &&",
  "           (*opplaniter)->getQuantity() == 0.0)",
  "      ++(*opplaniter);",
  "    if (*opplaniter == opplan->endLoadPlans()) return nullptr;",
  "    ld = static_cast<LoadPlan*>(&*((*opplaniter)++));",
  "  }",
  "  Py_INCREF(ld);",
  "  return const_cast<LoadPlan*>(ld);",
  "}",
  "",
  "LoadPlan::AlternateIterator::AlternateIterator(const LoadPlan* o) : ldplan(o) {",
  "  // There are 2 types of alternates:",
  "  // - loads with the same name",
  "  // - subresources of a resource group",
  "  auto l = ldplan->getLoad();",
  "  if (l) {",
  "    for (auto lditer = l->getOperation()->getLoads().begin();",
  "         lditer != l->getOperation()->getLoads().end(); ++lditer) {",
  "      if (l->getName().empty()) {",
  "        if (l != &*lditer || !l->getResource()->isGroup()) continue;",
  "      } else {",
  "        if (l->getName() != lditer->getName()) continue;",
  "      }",
  "      for (Resource::memberRecursiveIterator i(lditer->getResource());",
  "           !i.empty(); ++i) {",
  "        if (ldplan->getResource() == &*i || i->isGroup()) continue;",
  "        Skill* sk = lditer->getSkill();",
  "        if (!sk || i->hasSkill(sk, ldplan->getDate(), ldplan->getDate())) {",
  "          auto my_eff = i->getEfficiencyCalendar()",
  "                            ? i->getEfficiencyCalendar()->getValue(",
  "                                  ldplan->getOperationPlan()->getStart())",
  "                            : i->getEfficiency();",
  "          if (my_eff <= 0.0) continue;",
  "          bool already_assigned = false;",
  "          auto ldplniter = ldplan->getOperationPlan()->getLoadPlans();",
  "          while (auto checkldpln = ldplniter.next())",
  "            if (checkldpln->getResource() == &*i) {",
  "              already_assigned = true;",
  "              break;",
  "            }",
  "          if (!already_assigned) resources.push_back(&*i);",
  "        }",
  "      }",
  "    }",
  "  }",
  "  resIter = resources.begin();",
  "}",
  "",
  "Resource* LoadPlan::AlternateIterator::next() {",
  "  if (resIter == resources.end()) return nullptr;",
  "  auto tmp = *resIter;",
  "  ++resIter;",
  "  return tmp;",
  "}",
  "",
  "}  // namespace frepple",
];
