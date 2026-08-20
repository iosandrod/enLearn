// <header-api-generated>
import { HeaderModelAdapter } from "../utils/library.js";
import type { CommandManager } from "../utils/actions.js";
import type { Date as PlanningDate } from "../utils/date.js";
import {
  compileForecastExpression,
  type CompiledForecastExpression,
  type ForecastExpressionValue,
} from "./measure_compute.js";

export interface ForecastMeasureBucket {
  getMeasures(): MeasureList;
  getForecast(): ForecastMeasureOwner;
  getStart(): PlanningDate;
  getEnd(): PlanningDate;
  getValue(measure: ForecastMeasure): number;
  getValueAndFound(measure: ForecastMeasure): readonly [number, boolean];
  applyMeasureValue(measure: ForecastMeasure, value: number, manager?: CommandManager | null): void;
  markDirty(): void;
}

export interface ForecastMeasureData {
  getBuckets(): ForecastMeasureBucket[];
}

export interface ForecastMeasureOwner {
  getData(): ForecastMeasureData;
  isLeaf(): boolean;
  getPlanned(): boolean;
  getLeaves?(inclusive: boolean, measure?: ForecastMeasure): Iterable<ForecastMeasureOwner>;
}

const registeredData = new Set<ForecastMeasureData>();

export function registerForecastMeasureData(data: ForecastMeasureData): void {
  registeredData.add(data);
}

export function unregisterForecastMeasureData(data: ForecastMeasureData): void {
  registeredData.delete(data);
}

function finiteMeasureValue(value: number): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function isBucket(value: unknown): value is ForecastMeasureBucket {
  return Boolean(value && typeof value === "object" &&
    typeof Reflect.get(value, "getMeasures") === "function" &&
    typeof Reflect.get(value, "applyMeasureValue") === "function");
}

function isOwner(value: unknown): value is ForecastMeasureOwner {
  return Boolean(value && typeof value === "object" && typeof Reflect.get(value, "getData") === "function");
}

function bucketOverlaps(bucket: ForecastMeasureBucket, start?: PlanningDate, end?: PlanningDate): boolean {
  if (!start || !end) return true;
  return bucket.getStart().compare(end) < 0 && bucket.getEnd().compare(start) > 0;
}

/** Runtime forecast measure with the sparse-cube and dependency semantics of the C++ model. */
export class ForecastMeasure extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = ["HasName"] as const;
  static readonly cppQualifiedNames: readonly string[] = ["ForecastMeasure"] as const;
  private static readonly registry = new Map<string, ForecastMeasure>();

  readonly dependents: ForecastMeasureComputed[] = [];
  readonly alldependents: ForecastMeasureComputed[] = [];
  readonly assignments: ForecastMeasure[] = [];
  expressionvalue = 0;

  private nameValue = "";
  private defaultValue = 0;
  private computedValue = false;
  private aggregateValue = true;
  private temporaryValue = false;
  private discreteValue = false;
  private storedValue = true;

  constructor(name = "", defaultValue = 0, computed = false, aggregate = true,
    temporary = false, stored = true) {
    super();
    this.defaultValue = finiteMeasureValue(defaultValue);
    this.computedValue = computed;
    this.aggregateValue = aggregate;
    this.temporaryValue = temporary;
    this.storedValue = stored;
    if (name) this.setName(name);
  }

  static override find<T extends typeof HeaderModelAdapter>(this: T, name: string): InstanceType<T> | undefined {
    return ForecastMeasure.registry.get(String(name)) as InstanceType<T> | undefined;
  }
  static override all<T extends typeof HeaderModelAdapter>(this: T): InstanceType<T>[] {
    return [...ForecastMeasure.registry.values()] as InstanceType<T>[];
  }
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static resetMeasure(_mode: number, ...measures: ForecastMeasure[]): void {
    for (const data of registeredData) {
      for (const bucket of data.getBuckets()) {
        for (const measure of measures) bucket.getMeasures().erase(measure.getHashedName());
      }
    }
  }
  static aggregateMeasures(measures: readonly ForecastMeasure[] = ForecastMeasure.all()): void {
    for (const data of registeredData) {
      for (const bucket of data.getBuckets()) {
        for (const measure of measures) if (measure.isComputed()) measure.computeDependentMeasures(bucket, true);
      }
    }
  }
  static computeMeasures(measures: readonly ForecastMeasure[] = ForecastMeasure.all()): void {
    for (const data of registeredData) {
      for (const bucket of data.getBuckets()) {
        for (const measure of measures) {
          if (measure instanceof ForecastMeasureComputed) measure.computeBucket(bucket);
        }
      }
    }
  }

  aggregateMeasures(measures?: readonly ForecastMeasure[]): void { ForecastMeasure.aggregateMeasures(measures); }
  aggregateMeasuresPython(measures?: readonly ForecastMeasure[]): void { ForecastMeasure.aggregateMeasures(measures); }
  computeMeasures(measures?: readonly ForecastMeasure[]): void { ForecastMeasure.computeMeasures(measures); }
  computeMeasuresPython(measures?: readonly ForecastMeasure[]): void { ForecastMeasure.computeMeasures(measures); }
  resetMeasure(mode: number, ...measures: ForecastMeasure[]): void { ForecastMeasure.resetMeasure(mode, ...measures); }
  resetMeasuresPython(mode = 4, ...measures: ForecastMeasure[]): void {
    ForecastMeasure.resetMeasure(mode, ...(measures.length ? measures : ForecastMeasure.all()));
  }
  updatePlannedForecastPython(): void { ForecastMeasure.computeMeasures(); }

  getName(): string { return this.nameValue; }
  setName(value: string): void {
    const next = String(value);
    if (this.nameValue === next) return;
    if (next) {
      const duplicate = ForecastMeasure.registry.get(next);
      if (duplicate && duplicate !== this) throw new Error(`Forecast measure '${next}' already exists`);
    }
    if (this.nameValue) ForecastMeasure.registry.delete(this.nameValue);
    this.nameValue = next;
    if (next) ForecastMeasure.registry.set(next, this);
  }
  getHashedName(): string { return this.nameValue; }
  getDefault(): number { return this.defaultValue; }
  setDefault(value: number): void { this.defaultValue = finiteMeasureValue(value); }
  getStored(): boolean { return this.storedValue; }
  setStored(value: boolean): void { this.storedValue = Boolean(value); }
  setComputed(value: boolean): void { this.computedValue = Boolean(value); }
  isComputed(): boolean { return this.computedValue; }
  isAggregate(): boolean { return this.aggregateValue; }
  isTemporary(): boolean { return this.temporaryValue; }
  getDiscrete(): boolean { return this.discreteValue; }
  setDiscrete(value: boolean): void { this.discreteValue = Boolean(value); }
  getType(): string { return "forecastmeasure"; }
  initialize(): number { return 0; }
  registerFields(): number { return 0; }
  isLeaf(forecast: ForecastMeasureOwner | null): boolean { return Boolean(forecast?.isLeaf()); }
  getValue(bucket: ForecastMeasureBucket): number { return bucket.getValue(this); }
  getValueAndFound(bucket: ForecastMeasureBucket): readonly [number, boolean] {
    return bucket.getValueAndFound(this);
  }

  disaggregate(target: ForecastMeasureBucket | ForecastMeasureOwner, startOrValue: PlanningDate | number,
    endOrMultiply?: PlanningDate | boolean, valueOrRemainder?: number,
    multiplyOrManager: boolean | CommandManager | null = false, remainder = 0,
    manager: CommandManager | null = null): number {
    if (isBucket(target)) {
      const value = finiteMeasureValue(Number(startOrValue));
      const multiply = Boolean(endOrMultiply);
      const current = this.getValue(target);
      return this.update(target, multiply ? current * value : value + finiteMeasureValue(valueOrRemainder ?? 0),
        typeof multiplyOrManager === "object" ? multiplyOrManager : manager);
    }
    if (!isOwner(target)) return finiteMeasureValue(remainder);
    const start = typeof startOrValue === "number" ? undefined : startOrValue;
    const end = typeof endOrMultiply === "boolean" ? undefined : endOrMultiply;
    const value = finiteMeasureValue(valueOrRemainder ?? (typeof startOrValue === "number" ? startOrValue : 0));
    const multiply = typeof multiplyOrManager === "boolean" ? multiplyOrManager : false;
    const commandManager = typeof multiplyOrManager === "object" ? multiplyOrManager : manager;
    const leaves = target.getLeaves ? [...target.getLeaves(true, this)] : [target];
    const buckets = leaves.flatMap((leaf) => leaf.getData().getBuckets()).filter((bucket) => bucketOverlaps(bucket, start, end));
    if (!buckets.length) return value + remainder;
    let carry = remainder;
    const portion = multiply ? value : value / buckets.length;
    for (const bucket of buckets) carry = this.update(bucket, multiply ? this.getValue(bucket) * portion : portion + carry,
      commandManager);
    return carry;
  }

  update(bucket: ForecastMeasureBucket, value: number, manager: CommandManager | null = null): number {
    let next = finiteMeasureValue(value);
    let remainder = 0;
    if (this.discreteValue) {
      const rounded = Math.floor(next + 1e-9);
      remainder = next - rounded;
      next = rounded;
    }
    bucket.applyMeasureValue(this, next, manager);
    this.computeDependentMeasures(bucket, true);
    return remainder;
  }

  computeDependentMeasures(bucket: ForecastMeasureBucket, initialize = true): void {
    const queue = this.alldependents.length ? this.alldependents : this.dependents;
    for (const dependent of queue) dependent.computeBucket(bucket, initialize);
  }

  evalExpression(expression: string, forecast?: ForecastMeasureOwner): number {
    const compiled = compileForecastExpression(expression);
    let result = 0;
    const dataSets = forecast ? [forecast.getData()] : [...registeredData];
    for (const data of dataSets) for (const bucket of data.getBuckets()) {
      const context = ForecastMeasure.expressionContext(bucket);
      result = compiled.evaluate(context);
    }
    this.expressionvalue = result;
    return result;
  }

  protected static expressionContext(bucket: ForecastMeasureBucket,
    extra: Readonly<Record<string, ForecastExpressionValue>> = {}): Record<string, ForecastExpressionValue> {
    const context: Record<string, ForecastExpressionValue> = { ...extra };
    for (const measure of ForecastMeasure.registry.values()) context[measure.getName()] = measure.getValue(bucket);
    return context;
  }

  override dispose(): void {
    if (this.nameValue && ForecastMeasure.registry.get(this.nameValue) === this) {
      ForecastMeasure.registry.delete(this.nameValue);
    }
    super.dispose();
  }
}

export class ForecastMeasureAggregated extends ForecastMeasure {
  static override readonly cppBases: readonly string[] = ["ForecastMeasure"];
  static override readonly cppQualifiedNames: readonly string[] = ["ForecastMeasureAggregated"];
  private overrideMeasure: ForecastMeasure | null = null;
  constructor(name = "", defaultValue = 0, computed = false, overrides: ForecastMeasure | null = null) {
    super(name, defaultValue, computed, true);
    this.overrideMeasure = overrides;
  }
  override getType(): string { return "forecastmeasure_aggregated"; }
  override initialize(): number { return 0; }
  override registerFields(): number { return 0; }
  getOverrides(): ForecastMeasure | null { return this.overrideMeasure; }
  setOverrides(value: ForecastMeasure | null): void { this.overrideMeasure = value; }
}

export class ForecastMeasureAggregatedPlanned extends ForecastMeasureAggregated {
  static override readonly cppBases: readonly string[] = ["ForecastMeasureAggregated"];
  static override readonly cppQualifiedNames: readonly string[] = ["ForecastMeasureAggregatedPlanned"];
  override getType(): string { return "forecastmeasure_aggregatedplanned"; }
  override initialize(): number { return 0; }
  override isLeaf(forecast: ForecastMeasureOwner | null): boolean { return Boolean(forecast?.getPlanned()); }
}

export class ForecastMeasureComputed extends ForecastMeasureAggregated {
  static override readonly cppBases: readonly string[] = ["ForecastMeasureAggregated"];
  static override readonly cppQualifiedNames: readonly string[] = ["ForecastMeasureComputed"];
  private computeExpressionString = "";
  private updateExpressionString = "";
  private compiledCompute: CompiledForecastExpression = compileForecastExpression("0");
  private compiledUpdate: CompiledForecastExpression | null = null;

  constructor(name = "", expression = "", defaultValue = 0) {
    super(name, defaultValue, true);
    this.setComputeExpression(expression);
  }
  static compileMeasures(): void {
    const measures = ForecastMeasure.all();
    const computed = measures.filter((measure): measure is ForecastMeasureComputed =>
      measure instanceof ForecastMeasureComputed);
    for (const measure of measures) {
      measure.dependents.length = 0;
      measure.alldependents.length = 0;
      measure.assignments.length = 0;
    }
    for (const measure of computed) {
      measure.compiledCompute = compileForecastExpression(measure.computeExpressionString || "0");
      measure.compiledUpdate = measure.updateExpressionString
        ? compileForecastExpression(measure.updateExpressionString) : null;
      for (const identifier of measure.compiledCompute.identifiers) {
        const dependency = ForecastMeasure.find(identifier);
        if (dependency && !dependency.dependents.includes(measure)) dependency.dependents.push(measure);
      }
      for (const assignment of measure.compiledUpdate?.assignments ?? []) {
        const target = ForecastMeasure.find(assignment);
        if (target && !measure.assignments.includes(target)) measure.assignments.push(target);
      }
    }
    const append = (root: ForecastMeasure, current: ForecastMeasure, visiting: Set<ForecastMeasure>): void => {
      if (visiting.has(current)) throw new Error(`Circular forecast measure dependency at '${current.getName()}'`);
      visiting.add(current);
      for (const dependent of current.dependents) {
        append(root, dependent, visiting);
        if (!root.alldependents.includes(dependent)) root.alldependents.push(dependent);
      }
      visiting.delete(current);
    };
    for (const measure of measures) append(measure, measure, new Set());
    for (const measure of measures) measure.alldependents.reverse();
  }
  compileMeasures(): void { ForecastMeasureComputed.compileMeasures(); }
  compileMeasuresPython(): void { ForecastMeasureComputed.compileMeasures(); }
  getComputeExpression(): string { return this.computeExpressionString; }
  setComputeExpression(value: string): void {
    this.computeExpressionString = String(value);
    this.setComputed(Boolean(this.computeExpressionString));
    this.compiledCompute = compileForecastExpression(this.computeExpressionString || "0");
  }
  getUpdateExpression(): string { return this.updateExpressionString; }
  setUpdateExpression(value: string): void {
    this.updateExpressionString = String(value);
    this.compiledUpdate = this.updateExpressionString ? compileForecastExpression(this.updateExpressionString) : null;
  }
  compute(bucket?: ForecastMeasureBucket): number {
    if (!bucket) return this.expressionvalue;
    this.expressionvalue = this.compiledCompute.evaluate(ForecastMeasure.expressionContext(bucket));
    return this.expressionvalue;
  }
  computeBucket(bucket: ForecastMeasureBucket, _initialize = true): number {
    const value = this.compute(bucket);
    bucket.applyMeasureValue(this, value, null);
    return value;
  }
  override update(bucket: ForecastMeasureBucket, value: number, manager: CommandManager | null = null): number {
    if (!this.compiledUpdate) {
      const overrideMeasure = this.getOverrides();
      if (overrideMeasure) return overrideMeasure.update(bucket, value, manager);
      return super.update(bucket, value, manager);
    }
    const context = ForecastMeasure.expressionContext(bucket, { newvalue: finiteMeasureValue(value) });
    this.compiledUpdate.execute(context);
    for (const assignment of this.compiledUpdate.assignments) {
      const measure = ForecastMeasure.find(assignment);
      if (measure && measure !== this) measure.update(bucket, Number(context[assignment] ?? 0), manager);
    }
    this.computeBucket(bucket);
    return 0;
  }
  override getType(): string { return "forecastmeasure_computed"; }
  override initialize(): number { return 0; }
}

export class ForecastMeasureComputedPlanned extends ForecastMeasureComputed {
  static override readonly cppBases: readonly string[] = ["ForecastMeasureComputed"];
  static override readonly cppQualifiedNames: readonly string[] = ["ForecastMeasureComputedPlanned"];
  override getType(): string { return "forecastmeasure_computedplanned"; }
  override initialize(): number { return 0; }
  override isLeaf(forecast: ForecastMeasureOwner | null): boolean { return Boolean(forecast?.getPlanned()); }
}

export class ForecastMeasureLocal extends ForecastMeasure {
  static override readonly cppBases: readonly string[] = ["ForecastMeasure"];
  static override readonly cppQualifiedNames: readonly string[] = ["ForecastMeasureLocal"];
  constructor(name = "", defaultValue = 0, computed = false) { super(name, defaultValue, computed, false); }
  override getType(): string { return "forecastmeasure_local"; }
  override initialize(): number { return 0; }
  override registerFields(): number { return 0; }
  override isLeaf(forecast: ForecastMeasureOwner | null): boolean { return Boolean(forecast?.isLeaf()); }
}

export class ForecastMeasureTemp extends ForecastMeasure {
  static override readonly cppBases: readonly string[] = ["ForecastMeasure"];
  static override readonly cppQualifiedNames: readonly string[] = ["ForecastMeasureTemp"];
  constructor(base?: ForecastMeasure) {
    super(base ? `temp${base.getName()}` : "", base?.getDefault() ?? 0, false,
      base?.isAggregate() ?? true, true, false);
  }
  override disaggregate(): number { return 0; }
  override getType(): string { return "forecastmeasure_temp"; }
  override initialize(): number { return 0; }
}

export class MeasureValue extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MeasureValue"] as const;
  constructor(private readonly measure: string, private value: number) { super(); }
  getMeasure(): string { return this.measure; }
  getValue(): number { return this.value; }
  setValue(value: number): void { this.value = finiteMeasureValue(value); }
}

export class MeasureList extends HeaderModelAdapter implements Iterable<MeasureValue> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MeasureList"] as const;
  private values = new Map<string, MeasureValue>();
  begin(): IterableIterator<MeasureValue> { return this.values.values(); }
  end(): IterableIterator<MeasureValue> { return [][Symbol.iterator](); }
  erase(key: string | MeasureValue): boolean {
    return this.values.delete(typeof key === "string" ? key : key.getMeasure());
  }
  find(key: string): MeasureValue | undefined;
  find(key: string, defaultValue: number): number;
  find(key: string, defaultValue?: number): MeasureValue | number | undefined {
    const found = this.values.get(String(key));
    return defaultValue === undefined ? found : found?.getValue() ?? defaultValue;
  }
  findAndFound(key: string, defaultValue = 0): readonly [number, boolean] {
    const found = this.values.get(String(key));
    return found ? [found.getValue(), true] : [defaultValue, false];
  }
  insert(key: string, value: number, _check = true): MeasureValue {
    const name = String(key);
    let found = this.values.get(name);
    if (found) found.setValue(value);
    else {
      found = new MeasureValue(name, value);
      this.values.set(name, found);
    }
    return found;
  }
  size(): number { return this.values.size; }
  sort(): void {
    this.values = new Map([...this.values].sort(([left], [right]) => left.localeCompare(right)));
  }
  override [Symbol.iterator](): Iterator<MeasureValue> { return this.values.values(); }
  override toJSON(): Record<string, number> {
    return Object.fromEntries([...this.values].map(([name, value]) => [name, value.getValue()]));
  }
}

export class MeasureListConst_iterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MeasureList::const_iterator"] as const;
}

export class MeasureListIterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MeasureList::iterator"] as const;
}

export class MeasurePage extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MeasurePage"] as const;
  constructor(private readonly used = 0, private readonly capacity = 65_536) { super(); }
  status(): number { return this.used === 0 ? 0 : this.used >= this.capacity ? 2 : 1; }
}

export class MeasurePagePool extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MeasurePagePool"] as const;
  static readonly measurepages_default = new MeasurePagePool("default");
  static readonly measurepages_temp = new MeasurePagePool("temporary");
  constructor(private readonly name = "") { super(); }
  check(): readonly [number, number] {
    let regular = 0;
    let temporary = 0;
    for (const data of registeredData) for (const bucket of data.getBuckets()) {
      for (const value of bucket.getMeasures()) {
        if (value.getMeasure().startsWith("temp")) temporary += 1;
        else regular += 1;
      }
    }
    return [regular, temporary];
  }
  releaseEmptyPages(): void { void this.name; }
  releaseEmptyPagesPython(): readonly [number, number] { return this.check(); }
}

export class Measures {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Measures"] as const;
  static forecasttotal: ForecastMeasureComputed;
  static forecastconsumed: ForecastMeasureAggregatedPlanned;
  static forecastnet: ForecastMeasureAggregatedPlanned;
  static forecastbaseline: ForecastMeasureAggregated;
  static forecastoverride: ForecastMeasureAggregated;
  static orderstotal: ForecastMeasureAggregated;
  static ordersadjustment: ForecastMeasureAggregated;
  static ordersopen: ForecastMeasureAggregated;
  static ordersplanned: ForecastMeasureAggregated;
  static forecastplanned: ForecastMeasureAggregatedPlanned;
  static outlier: ForecastMeasureLocal;
  static nodata: ForecastMeasureLocal;
  static leaf: ForecastMeasureLocal;

  static initialize(): number {
    const existing = ForecastMeasure.find("forecasttotal");
    if (existing) { this.bindExisting(); return 0; }
    this.forecastnet = new ForecastMeasureAggregatedPlanned("forecastnet", 0);
    this.forecastconsumed = new ForecastMeasureAggregatedPlanned("forecastconsumed", 0);
    this.forecastbaseline = new ForecastMeasureAggregated("forecastbaseline", 0);
    this.forecastoverride = new ForecastMeasureAggregated("forecastoverride", -1, false, this.forecastbaseline);
    this.forecasttotal = new ForecastMeasureComputed("forecasttotal",
      "if(forecastoverride == -1, forecastbaseline, forecastoverride)");
    this.forecasttotal.setOverrides(this.forecastoverride);
    this.orderstotal = new ForecastMeasureAggregated("orderstotal", 0);
    this.ordersadjustment = new ForecastMeasureAggregated("ordersadjustment", 0);
    this.ordersopen = new ForecastMeasureAggregated("ordersopen", 0);
    this.forecastplanned = new ForecastMeasureAggregatedPlanned("forecastplanned", 0);
    this.ordersplanned = new ForecastMeasureAggregated("ordersplanned", 0);
    this.outlier = new ForecastMeasureLocal("outlier", 0); this.outlier.setStored(false);
    this.leaf = new ForecastMeasureLocal("leaf", 0); this.leaf.setStored(false);
    this.nodata = new ForecastMeasureLocal("nodata", 0);
    ForecastMeasureComputed.compileMeasures();
    return 0;
  }

  private static bindExisting(): typeof Measures {
    const requireMeasure = <T extends ForecastMeasure>(name: string): T => {
      const result = ForecastMeasure.find(name);
      if (!result) throw new Error(`Missing built-in forecast measure '${name}'`);
      return result as T;
    };
    this.forecasttotal = requireMeasure("forecasttotal");
    this.forecastconsumed = requireMeasure("forecastconsumed");
    this.forecastnet = requireMeasure("forecastnet");
    this.forecastbaseline = requireMeasure("forecastbaseline");
    this.forecastoverride = requireMeasure("forecastoverride");
    this.orderstotal = requireMeasure("orderstotal");
    this.ordersadjustment = requireMeasure("ordersadjustment");
    this.ordersopen = requireMeasure("ordersopen");
    this.ordersplanned = requireMeasure("ordersplanned");
    this.forecastplanned = requireMeasure("forecastplanned");
    this.outlier = requireMeasure("outlier");
    this.nodata = requireMeasure("nodata");
    this.leaf = requireMeasure("leaf");
    return this;
  }
}

export function initializeForecastMeasures(): typeof Measures { Measures.initialize(); return Measures; }
// </header-api-generated>


























/**
 * Semantic migration unit for src/forecast/measure.cpp.
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
  { name: "ForecastMeasureAggregated::tag_overrides", sourceLine: 39, status: "adapted" },
  { name: "MeasurePagePool::measurepages_default", sourceLine: 55, status: "adapted" },
  { name: "MeasurePagePool::measurepages_temp", sourceLine: 56, status: "adapted" },
  { name: "ForecastMeasure::initialize", sourceLine: 58, status: "adapted" },
  { name: "ForecastMeasureAggregated::initialize", sourceLine: 68, status: "adapted" },
  { name: "ForecastMeasureAggregatedPlanned::initialize", sourceLine: 78, status: "adapted" },
  { name: "ForecastMeasureLocal::initialize", sourceLine: 89, status: "adapted" },
  { name: "ForecastMeasureTemp::initialize", sourceLine: 98, status: "adapted" },
  { name: "ForecastMeasure::isLeaf", sourceLine: 107, status: "adapted" },
  { name: "ForecastMeasureAggregatedPlanned::isLeaf", sourceLine: 112, status: "adapted" },
  { name: "ForecastMeasureComputedPlanned::isLeaf", sourceLine: 117, status: "adapted" },
  { name: "ForecastMeasureLocal::isLeaf", sourceLine: 122, status: "adapted" },
  { name: "ForecastMeasure::aggregateMeasures", sourceLine: 127, status: "adapted" },
  { name: "ForecastMeasure::aggregateMeasures", sourceLine: 139, status: "adapted" },
  { name: "ForecastMeasure::computeMeasures", sourceLine: 230, status: "adapted" },
  { name: "ForecastMeasure::computeMeasures", sourceLine: 238, status: "adapted" },
  { name: "ForecastMeasure::updatePlannedForecastPython", sourceLine: 275, status: "adapted" },
  { name: "ForecastBucketData::setValue", sourceLine: 310, status: "adapted" },
  { name: "Plan::instance", sourceLine: 314, status: "adapted" },
  { name: "ForecastBucketData::propagateValue", sourceLine: 369, status: "adapted" },
  { name: "ForecastBucketData::incValue", sourceLine: 381, status: "adapted" },
  { name: "Plan::instance", sourceLine: 385, status: "adapted" },
  { name: "ForecastBucketData::removeValue", sourceLine: 435, status: "adapted" },
  { name: "ForecastMeasure::aggregateMeasuresPython", sourceLine: 457, status: "adapted" },
  { name: "ForecastMeasure::computeMeasuresPython", sourceLine: 499, status: "adapted" },
  { name: "ForecastMeasure::resetMeasuresPython", sourceLine: 539, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 552, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 553, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 554, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 555, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 557, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 558, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 559, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 561, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 562, status: "adapted" },
  { name: "ForecastMeasure::find", sourceLine: 564, status: "adapted" },
  { name: "ForecastMeasureAggregated::disaggregate", sourceLine: 574, status: "adapted" },
  { name: "ForecastMeasureAggregated::disaggregate", sourceLine: 619, status: "adapted" },
  { name: "ForecastMeasureAggregated::disaggregateOverride", sourceLine: 705, status: "adapted" },
  { name: "ForecastMeasureAggregated::disaggregateOverride", sourceLine: 818, status: "adapted" },
  { name: "ForecastMeasureLocal::disaggregate", sourceLine: 953, status: "adapted" },
  { name: "ForecastMeasureLocal::disaggregate", sourceLine: 965, status: "adapted" },
  { name: "ForecastMeasure::update", sourceLine: 985, status: "adapted" },
  { name: "ForecastMeasure::computeDependentMeasures", sourceLine: 1069, status: "adapted" },
  { name: "MeasureValue::addToFree", sourceLine: 1113, status: "adapted" },
  { name: "MeasureValue::addToFree", sourceLine: 1124, status: "adapted" },
  { name: "MeasurePage::MeasurePage", sourceLine: 1130, status: "adapted" },
  { name: "MeasurePage::status", sourceLine: 1145, status: "adapted" },
  { name: "MeasurePagePool::releaseEmptyPages", sourceLine: 1162, status: "adapted" },
  { name: "MeasureList::insert", sourceLine: 1201, status: "adapted" },
  { name: "MeasureList::erase", sourceLine: 1241, status: "adapted" },
  { name: "MeasureList::erase", sourceLine: 1260, status: "adapted" },
  { name: "MeasureList::sort", sourceLine: 1275, status: "adapted" },
  { name: "MeasureList::check", sourceLine: 1290, status: "adapted" },
  { name: "MeasurePagePool::check", sourceLine: 1309, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface ForecastBucketDataPort {
  incValue(...args: readonly PortValue[]): PortValue | void;
  propagateValue(...args: readonly PortValue[]): PortValue | void;
  removeValue(...args: readonly PortValue[]): PortValue | void;
  setValue(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasurePort {
  aggregateMeasures(...args: readonly PortValue[]): PortValue | void;
  aggregateMeasuresPython(...args: readonly PortValue[]): PortValue | void;
  computeDependentMeasures(...args: readonly PortValue[]): PortValue | void;
  computeMeasures(...args: readonly PortValue[]): PortValue | void;
  computeMeasuresPython(...args: readonly PortValue[]): PortValue | void;
  find(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  isLeaf(...args: readonly PortValue[]): PortValue | void;
  resetMeasuresPython(...args: readonly PortValue[]): PortValue | void;
  update(...args: readonly PortValue[]): PortValue | void;
  updatePlannedForecastPython(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasureAggregatedPort {
  disaggregate(...args: readonly PortValue[]): PortValue | void;
  disaggregateOverride(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  tag_overrides(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasureAggregatedPlannedPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
  isLeaf(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasureComputedPlannedPort {
  isLeaf(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasureLocalPort {
  disaggregate(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  isLeaf(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasureTempPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface MeasureListPort {
  check(...args: readonly PortValue[]): PortValue | void;
  erase(...args: readonly PortValue[]): PortValue | void;
  insert(...args: readonly PortValue[]): PortValue | void;
  sort(...args: readonly PortValue[]): PortValue | void;
}

export interface MeasurePagePort {
  MeasurePage(...args: readonly PortValue[]): PortValue | void;
  status(...args: readonly PortValue[]): PortValue | void;
}

export interface MeasurePagePoolPort {
  check(...args: readonly PortValue[]): PortValue | void;
  measurepages_default(...args: readonly PortValue[]): PortValue | void;
  measurepages_temp(...args: readonly PortValue[]): PortValue | void;
  releaseEmptyPages(...args: readonly PortValue[]): PortValue | void;
}

export interface MeasureValuePort {
  addToFree(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/forecast/measure.cpp";
export const targetFile = "forecast/measure.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2019 by frePPLe bv                                        *",
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
  "#include \"forecast.h\"",
  "",
  "namespace frepple {",
  "",
  "template <class ForecastMeasure>",
  "Tree utils::HasName<ForecastMeasure>::st;",
  "const MetaCategory* ForecastMeasure::metadata;",
  "const MetaClass* ForecastMeasureAggregated::metadata;",
  "const MetaClass* ForecastMeasureAggregatedPlanned::metadata;",
  "const MetaClass* ForecastMeasureLocal::metadata;",
  "const MetaClass* ForecastMeasureComputed::metadata;",
  "const MetaClass* ForecastMeasureComputedPlanned::metadata;",
  "const MetaClass* ForecastMeasureTemp::metadata;",
  "const Keyword ForecastMeasureAggregated::tag_overrides(\"overrides\");",
  "",
  "const ForecastMeasureComputed* Measures::forecasttotal = nullptr;",
  "const ForecastMeasureAggregatedPlanned* Measures::forecastnet = nullptr;",
  "const ForecastMeasureAggregatedPlanned* Measures::forecastconsumed = nullptr;",
  "const ForecastMeasureAggregated* Measures::forecastbaseline = nullptr;",
  "const ForecastMeasureAggregated* Measures::forecastoverride = nullptr;",
  "const ForecastMeasureAggregated* Measures::orderstotal = nullptr;",
  "const ForecastMeasureAggregated* Measures::ordersadjustment = nullptr;",
  "const ForecastMeasureAggregated* Measures::ordersopen = nullptr;",
  "const ForecastMeasureAggregatedPlanned* Measures::forecastplanned = nullptr;",
  "const ForecastMeasureAggregated* Measures::ordersplanned = nullptr;",
  "const ForecastMeasureLocal* Measures::outlier = nullptr;",
  "const ForecastMeasureLocal* Measures::nodata = nullptr;",
  "const ForecastMeasureLocal* Measures::leaf = nullptr;",
  "",
  "MeasurePagePool MeasurePagePool::measurepages_default(\"default\");",
  "MeasurePagePool MeasurePagePool::measurepages_temp(\"temp\");",
  "",
  "int ForecastMeasure::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<ForecastMeasure>(",
  "      \"measure\", \"measuress\", reader, finder);",
  "  registerFields<ForecastMeasure>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  return FreppleCategory<ForecastMeasure>::initialize();",
  "}",
  "",
  "int ForecastMeasureAggregated::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<ForecastMeasureAggregated>(",
  "      \"measure\", \"measure_aggregated\",",
  "      Object::create<ForecastMeasureAggregated>, true);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<ForecastMeasureAggregated, ForecastMeasure>::initialize();",
  "}",
  "",
  "int ForecastMeasureAggregatedPlanned::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<ForecastMeasureAggregatedPlanned>(",
  "      \"measure\", \"measure_aggregatedplanned\",",
  "      Object::create<ForecastMeasureAggregatedPlanned>);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<ForecastMeasureAggregatedPlanned,",
  "                      ForecastMeasure>::initialize();",
  "}",
  "",
  "int ForecastMeasureLocal::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<ForecastMeasureLocal>(",
  "      \"measure\", \"measure_local\", Object::create<ForecastMeasureLocal>);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<ForecastMeasureLocal, ForecastMeasure>::initialize();",
  "}",
  "",
  "int ForecastMeasureTemp::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<ForecastMeasureTemp>(",
  "      \"measure\", \"measure_temp\", Object::create<ForecastMeasureTemp>);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<ForecastMeasureTemp, ForecastMeasure>::initialize();",
  "}",
  "",
  "bool ForecastMeasure::isLeaf(const ForecastBase* f) const {",
  "  // Leaf level is the lowest forecast level by default",
  "  return f->isLeaf();",
  "}",
  "",
  "bool ForecastMeasureAggregatedPlanned::isLeaf(const ForecastBase* f) const {",
  "  // Planned measures are stored from the planned forecast upwards",
  "  return f->getPlanned();",
  "}",
  "",
  "bool ForecastMeasureComputedPlanned::isLeaf(const ForecastBase* f) const {",
  "  // Planned measures are stored from the planned forecast upwards",
  "  return f->getPlanned();",
  "}",
  "",
  "bool ForecastMeasureLocal::isLeaf(const ForecastBase*) const {",
  "  // Local measures consider all nodes as leafs",
  "  return true;",
  "}",
  "",
  "void ForecastMeasure::aggregateMeasures(bool include_planned) {",
  "  vector<ForecastMeasure*> msrs;",
  "  for (auto& msr : ForecastMeasure::all()) {",
  "    if (!msr.isAggregate()) continue;",
  "    if (include_planned ||",
  "        (msr.getName() != Measures::forecastplanned->getName() &&",
  "         msr.getName() != Measures::ordersplanned->getName()))",
  "      msrs.push_back(&msr);",
  "  }",
  "  aggregateMeasures(msrs);",
  "}",
  "",
  "void ForecastMeasure::aggregateMeasures(const vector<ForecastMeasure*>& msrs) {",
  "  // Flush dirty entries and switch to lazy mode",
  "  Cache::instance->flush();",
  "  auto prev = Cache::instance->setWriteImmediately(false);",
  "",
  "  // Activate all parent forecasts.",
  "  // Validate the planned flag while we are looping.",
  "  {",
  "    // We need to make a copy because the forecast container is",
  "    // getting updating during the loop.",
  "    vector<ForecastBase*> tmp;",
  "    for (auto fcst : Forecast::getForecasts()) tmp.push_back(fcst);",
  "    for (auto& fcst : tmp) {",
  "      auto planned = fcst->getPlanned();",
  "      for (auto p = fcst->getParents(); p; ++p) {",
  "        if (planned && p->getPlanned()) {",
  "          static_cast<Forecast*>(fcst)->setPlanned(false);",
  "          planned = false;",
  "          logger << static_cast<Forecast*>(fcst)",
  "                 << \" can't be planned because its parent is already planned\"",
  "                 << '\\n';",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  // Create temp measures",
  "  vector<pair<ForecastMeasure*, ForecastMeasureTemp*> > msrlist;",
  "  for (auto msr : msrs) {",
  "    if (!msr->isAggregate()) continue;",
  "    auto tmpmsr = new ForecastMeasureTemp(*msr);",
  "    msrlist.emplace_back(&*msr, tmpmsr);",
  "    if (msr->getDefault() == -1.0)",
  "      // Disable override aggregation logic on the temp measure",
  "      msrlist.back().second->setDefault(0.0);",
  "  }",
  "",
  "  // Propagate the leave value as a temporary measure",
  "  for (auto fcst : Forecast::getForecasts()) {",
  "    shared_ptr<ForecastData> fcstdata(nullptr);",
  "    for (auto& msr : msrlist)",
  "      if (msr.first->isLeaf(&*fcst)) {",
  "        if (!fcstdata) {",
  "          fcstdata = fcst->getData();",
  "          fcstdata->lock.lock();",
  "        }",
  "        for (auto& bckt : fcstdata->getBuckets()) {",
  "          auto val = msr.first->getValue(bckt);",
  "          if (val != msr.first->getDefault()) {",
  "            bckt.propagateValue(msr.second, val);",
  "          }",
  "        }",
  "      }",
  "    if (fcstdata) fcstdata->lock.unlock();",
  "  }",
  "",
  "  // Verify the correctness of the aggregation results",
  "  unsigned long updated = 0;",
  "  for (auto fcst : Forecast::getForecasts()) {",
  "    shared_ptr<ForecastData> fcstdata(nullptr);",
  "    for (auto& msr : msrlist)",
  "      if (!msr.first->isLeaf(&*fcst)) {",
  "        if (!fcstdata) {",
  "          fcstdata = fcst->getData();",
  "          fcstdata->lock.lock();",
  "        }",
  "        for (auto& bckt : fcstdata->getBuckets()) {",
  "          // Compare the aggregate value with the existing value",
  "          auto val = msr.second->getValueAndFound(bckt);",
  "          auto cur = msr.first->getValue(bckt);",
  "          if (fabs(cur - val.first) > ROUNDING_ERROR &&",
  "              (msr.first->getDefault() != -1.0 || val.second)) {",
  "            if (!bckt.isDirty()) ++updated;",
  "            if (Cache::instance->getLogLevel() > 2)",
  "              logger << \"Correcting \" << msr.first << \": found \" << cur",
  "                     << \" but expected \" << val.first << \" on \" << bckt << '\\n';",
  "            bckt.setValue(false, nullptr, msr.first, val.first);",
  "          }",
  "          bckt.removeValue(false, nullptr, msr.second);",
  "        }",
  "      }",
  "    if (fcstdata) fcstdata->lock.unlock();",
  "  }",
  "",
  "  // Delete temp measures",
  "  for (auto& msr : msrlist) delete msr.second;",
  "",
  "  logger << \"Corrected \" << updated << \" parent forecast buckets\\n\";",
  "  Cache::instance->setWriteImmediately(prev);",
  "}",
  "",
  "void ForecastMeasure::computeMeasures() {",
  "  vector<ForecastMeasure*> msrs;",
  "  for (auto& msr : ForecastMeasure::all()) {",
  "    if (msr.isComputed()) msrs.push_back(&msr);",
  "  }",
  "  computeMeasures(msrs);",
  "}",
  "",
  "void ForecastMeasure::computeMeasures(const vector<ForecastMeasure*>& msrs) {",
  "  // Flush dirty entries and switch to lazy mode",
  "  Cache::instance->flush();",
  "  auto prev = Cache::instance->setWriteImmediately(false);",
  "",
  "  for (auto& m : msrs) resetMeasure(ALL, m);",
  "",
  "  // Recompute all leave forecasts",
  "  for (auto fcst : Forecast::getForecasts()) {",
  "    shared_ptr<ForecastData> fcstdata(nullptr);",
  "    for (auto& msr : msrs)",
  "      if (msr->isLeaf(&*fcst) && msr->isComputed()) {",
  "        if (!fcstdata) {",
  "          fcstdata = fcst->getData();",
  "          fcstdata->lock.lock();",
  "        }",
  "        for (auto& bckt : fcstdata->getBuckets()) {",
  "          // Initialize symbol table",
  "          for (auto m = begin(); m != end(); ++m)",
  "            m->expressionvalue = bckt.getValue(*m);",
  "          ForecastMeasureComputed::cost =",
  "              bckt.getForecast()->getForecastItem()->getCost();",
  "          auto val = static_cast<ForecastMeasureComputed*>(msr)->compute();",
  "          if (val != bckt.getValue(*msr)) {",
  "            if (val == msr->getDefault())",
  "              bckt.removeValue(true, nullptr, msr);",
  "            else",
  "              bckt.setValue(true, nullptr, msr, val);",
  "          }",
  "        }",
  "      }",
  "    if (fcstdata) fcstdata->lock.unlock();",
  "  }",
  "",
  "  Cache::instance->setWriteImmediately(prev);",
  "}",
  "",
  "PyObject* ForecastMeasure::updatePlannedForecastPython(PyObject*, PyObject*) {",
  "  // Switch on lazy writes",
  "  auto prev = Cache::instance->setWriteImmediately(false);",
  "",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    // Reset to 0",
  "    resetMeasure(ALL, Measures::ordersplanned, Measures::forecastplanned);",
  "",
  "    // Set the value on all leaf nodes",
  "    for (auto fcst : Forecast::getForecasts()) {",
  "      auto fcstdata = fcst->getData();",
  "      lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "      for (auto& bckt : fcstdata->getBuckets()) {",
  "        auto tmp = bckt.getOrdersPlanned();",
  "        if (tmp != 0.0) Measures::ordersplanned->update(bckt, tmp);",
  "        tmp = bckt.getForecastPlanned();",
  "        if (tmp != 0.0) Measures::forecastplanned->update(bckt, tmp);",
  "      }",
  "    }",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    Cache::instance->setWriteImmediately(prev);",
  "    return nullptr;",
  "  }",
  "  Py_END_ALLOW_THREADS;",
  "",
  "  // Restore the previous cache policy",
  "  Cache::instance->setWriteImmediately(prev);",
  "",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "template <>",
  "void ForecastBucketData::setValue(bool propagate, CommandManager* mgr,",
  "                                  const ForecastMeasure* key, double val) {",
  "  if (!key) return;",
  "  if (key == Measures::forecastnet &&",
  "      getEnd() > Plan::instance().getFcstCurrent()) {",
  "    // This is the connection between the supply chain and the forecast",
  "    // data structures",
  "    if (getForecast()->getPlanned()) {",
  "      auto b1 = getForecastBucket();",
  "      if (val != 0.0 || b1) {",
  "        auto tmp = getOrCreateForecastBucket();",
  "        auto current_quantity = tmp->getQuantity();",
  "        if (current_quantity > val + ROUNDING_ERROR)",
  "          tmp->reduceDeliveries(current_quantity - val, mgr);",
  "        tmp->setQuantity(val);",
  "      }",
  "    } else {",
  "      auto b1 = getForecastBucket();",
  "      if (b1) b1->setQuantity(0.0);",
  "    }",
  "  }",
  "",
  "  auto t = measures.find(key->getHashedName());",
  "  if (!t) {",
  "    if (val != key->getDefault()) {",
  "      // New non-empty key",
  "      measures.insert(key->getHashedName(), val, false);",
  "      if (propagate && key->isAggregate()) {",
  "        auto index = getIndex();",
  "        for (auto p = getForecast()->getParents(); p; ++p) {",
  "          auto parentfcstdata = p->getData();",
  "          lock_guard<recursive_mutex> exclusive(parentfcstdata->lock);",
  "          parentfcstdata->getBuckets()[index].incValue(false, mgr, key, val);",
  "        }",
  "      }",
  "      if (!key->isTemporary()) markDirty();",
  "    }",
  "  } else {",
  "    auto delta = val - t->getValue();",
  "    if (fabs(delta) > ROUNDING_ERROR || key->getDefault() != 0.0) {",
  "      if (val != key->getDefault())",
  "        // Updating an existing key",
  "        t->setValue(val);",
  "      else",
  "        // Existing key becomes equal to default and is removed",
  "        measures.erase(t);",
  "      if (propagate && key->isAggregate()) {",
  "        auto index = getIndex();",
  "        for (auto p = getForecast()->getParents(); p; ++p) {",
  "          auto parentfcstdata = p->getData();",
  "          lock_guard<recursive_mutex> exclusive(parentfcstdata->lock);",
  "          parentfcstdata->getBuckets()[index].incValue(false, mgr, key, delta);",
  "        }",
  "      }",
  "      if (!key->isTemporary()) markDirty();",
  "    }",
  "  }",
  "}",
  "",
  "void ForecastBucketData::propagateValue(const ForecastMeasure* key,",
  "                                        double val) {",
  "  if (!key || !key->isAggregate() || val == 0.0) return;",
  "  auto index = getIndex();",
  "  for (auto p = getForecast()->getParents(); p; ++p) {",
  "    auto parentfcstdata = p->getData();",
  "    lock_guard<recursive_mutex> exclusive(parentfcstdata->lock);",
  "    parentfcstdata->getBuckets()[index].incValue(false, nullptr, key, val);",
  "  }",
  "}",
  "",
  "template <>",
  "void ForecastBucketData::incValue(bool propagate, CommandManager* mgr,",
  "                                  const ForecastMeasure* key, double val) {",
  "  if (!key || ((val == 0.0) && (key->getDefault() == 0.0))) return;",
  "  if (key == Measures::forecastnet &&",
  "      getEnd() > Plan::instance().getFcstCurrent()) {",
  "    // This is the connection between the supply chain and the forecast",
  "    // data structures",
  "    if (getForecast()->getPlanned()) {",
  "      auto b1 = getForecastBucket();",
  "      if (((b1 ? b1->getQuantity() + val : val) != 0.0) || b1) {",
  "        auto tmp = getOrCreateForecastBucket();",
  "        tmp->setQuantity(tmp->getQuantity() + val);",
  "      }",
  "    } else {",
  "      auto b1 = getForecastBucket();",
  "      if (b1) b1->setQuantity(0.0);",
  "    }",
  "  }",
  "",
  "  // Increment locally",
  "  auto t = measures.find(key->getHashedName());",
  "  if (!t) {",
  "    // Inserting a new key",
  "    if (val != key->getDefault())",
  "      // New non-empty key",
  "      measures.insert(key->getHashedName(), val, false);",
  "  } else {",
  "    auto tmp = t->getValue() + val;",
  "    if (key->getDefault() == -1.0 && fabs(tmp) < ROUNDING_ERROR)",
  "      // Special case for override measures",
  "      validateOverride(key);",
  "    else if (fabs(tmp - key->getDefault()) > ROUNDING_ERROR)",
  "      // Updating an existing key",
  "      t->setValue(tmp);",
  "    else",
  "      // Existing key becomes equal to default and is removed",
  "      measures.erase(t);",
  "  }",
  "",
  "  // Increment parents",
  "  if (key->isAggregate() && propagate) {",
  "    auto index = getIndex();",
  "    for (auto p = getForecast()->getParents(); p; ++p) {",
  "      auto parentfcstdata = p->getData();",
  "      lock_guard<recursive_mutex> exclusive(parentfcstdata->lock);",
  "      parentfcstdata->getBuckets()[index].incValue(false, mgr, key, val);",
  "    }",
  "  }",
  "",
  "  // Mark dirty",
  "  if (!key->isTemporary()) markDirty();",
  "}",
  "",
  "template <>",
  "void ForecastBucketData::removeValue(bool propagate, CommandManager* mgr,",
  "                                     const ForecastMeasure* key) {",
  "  if (!key) return;",
  "  auto t = measures.find(key->getHashedName());",
  "  if (!t) return;",
  "  auto val = t->getValue();",
  "  measures.erase(t);",
  "",
  "  if (key->isLeaf(getForecast())) {",
  "    key->computeDependentMeasures(*this);",
  "    if (propagate) {",
  "      auto index = getIndex();",
  "      for (auto p = getForecast()->getParents(); p; ++p) {",
  "        auto pdata = p->getData();",
  "        lock_guard<recursive_mutex> exclusive(pdata->lock);",
  "        pdata->getBuckets()[index].incValue(false, mgr, key, -val);",
  "      }",
  "    }",
  "  }",
  "  if (!key->isTemporary()) markDirty();",
  "}",
  "",
  "PyObject* ForecastMeasure::aggregateMeasuresPython(PyObject*, PyObject* args,",
  "                                                   PyObject* kwargs) {",
  "  static const char* kwlist[] = {\"includeplanned\", \"measures\", nullptr};",
  "  int include_planned = 0;",
  "  PyObject* py_msrs = nullptr;",
  "  if (!PyArg_ParseTupleAndKeywords(args, kwargs, \"|pO:aggregateMeasures\",",
  "                                   const_cast<char**>(kwlist), &include_planned,",
  "                                   &py_msrs))",
  "    return nullptr;",
  "",
  "  vector<ForecastMeasure*> msrs;",
  "  if (py_msrs) {",
  "    PyObject* py_iter = PyObject_GetIter(py_msrs);",
  "    PyObject* py_msr;",
  "    if (!py_iter) throw DataException(\"Object not iterable\");",
  "    while ((py_msr = PyIter_Next(py_iter))) {",
  "      string msrname = PythonData(py_msr).getString();",
  "      auto msr = ForecastMeasure::find(msrname);",
  "      if (msr)",
  "        msrs.push_back(msr);",
  "      else",
  "        throw DataException(\"Measure not found\");",
  "      Py_DECREF(py_msr);",
  "    }",
  "    Py_DECREF(py_iter);",
  "  }",
  "",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    if (py_msrs)",
  "      aggregateMeasures(msrs);",
  "    else",
  "      aggregateMeasures(include_planned != 0);",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "PyObject* ForecastMeasure::computeMeasuresPython(PyObject*, PyObject* args,",
  "                                                 PyObject* kwargs) {",
  "  static const char* kwlist[] = {\"measures\", nullptr};",
  "  PyObject* py_msrs = nullptr;",
  "  if (!PyArg_ParseTupleAndKeywords(args, kwargs, \"|O:computeMeasures\",",
  "                                   const_cast<char**>(kwlist), &py_msrs))",
  "    return nullptr;",
  "",
  "  vector<ForecastMeasure*> msrs;",
  "  if (py_msrs) {",
  "    PyObject* py_iter = PyObject_GetIter(py_msrs);",
  "    PyObject* py_msr;",
  "    if (!py_iter) throw DataException(\"Object not iterable\");",
  "    while ((py_msr = PyIter_Next(py_iter))) {",
  "      string msrname = PythonData(py_msr).getString();",
  "      auto msr = ForecastMeasure::find(msrname);",
  "      if (msr)",
  "        msrs.push_back(msr);",
  "      else",
  "        throw DataException(\"Measure not found\");",
  "      Py_DECREF(py_msr);",
  "    }",
  "    Py_DECREF(py_iter);",
  "  }",
  "",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    if (py_msrs)",
  "      computeMeasures(msrs);",
  "    else",
  "      computeMeasures();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "PyObject* ForecastMeasure::resetMeasuresPython(PyObject*, PyObject* args) {",
  "  const char* pymeasure1 = nullptr;",
  "  const char* pymeasure2 = nullptr;",
  "  const char* pymeasure3 = nullptr;",
  "  const char* pymeasure4 = nullptr;",
  "  short int mode;",
  "  if (!PyArg_ParseTuple(args, \"hs|sss:resetmeasures\", &mode, &pymeasure1,",
  "                        &pymeasure2, &pymeasure3, &pymeasure4))",
  "    return nullptr;",
  "",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    if (pymeasure4)",
  "      resetMeasure(mode, ForecastMeasure::find(pymeasure1),",
  "                   ForecastMeasure::find(pymeasure2),",
  "                   ForecastMeasure::find(pymeasure3),",
  "                   ForecastMeasure::find(pymeasure4));",
  "    else if (pymeasure3)",
  "      resetMeasure(mode, ForecastMeasure::find(pymeasure1),",
  "                   ForecastMeasure::find(pymeasure2),",
  "                   ForecastMeasure::find(pymeasure3));",
  "    else if (pymeasure2)",
  "      resetMeasure(mode, ForecastMeasure::find(pymeasure1),",
  "                   ForecastMeasure::find(pymeasure2));",
  "    else",
  "      resetMeasure(mode, ForecastMeasure::find(pymeasure1));",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "double ForecastMeasureAggregated::disaggregate(ForecastBucketData& bckt,",
  "                                               double val, bool multiply,",
  "                                               double remainder,",
  "                                               CommandManager* mgr) const {",
  "  if (override_measure)",
  "    // Special logic for overriding another measure",
  "    return disaggregateOverride(bckt, val, multiply, remainder, mgr);",
  "",
  "  // Get the current value of this node",
  "  auto fcst = bckt.getForecast();",
  "  auto fcstdata = fcst->getData();",
  "  lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "",
  "  if (isLeaf(fcst))",
  "    //  Handling of leaf forecasts",
  "    remainder = update(fcstdata->getBuckets()[bckt.getIndex()], val, mgr);",
  "  else {",
  "    // Handling of parent forecasts",
  "    auto currentvalue = getValue(fcstdata->getBuckets()[bckt.getIndex()]);",
  "    if (currentvalue != 0.0) {",
  "      // Proportionally scale all child forecasts",
  "      double factor = val / currentvalue;",
  "      for (auto ch = fcst->getLeaves(false, this); ch; ++ch)",
  "        remainder = disaggregate(*ch, bckt.getStart(), bckt.getEnd(), factor,",
  "                                 true, remainder, mgr);",
  "    } else {",
  "      // Equal distribution of all child forecasts",
  "      unsigned int cnt = 0;",
  "      for (auto ch = fcst->getLeaves(false, this); ch; ++ch) ++cnt;",
  "      if (!cnt)",
  "        logger << \" no child forecast found to update for \"",
  "               << fcst->getForecastItem() << \" / \"",
  "               << fcst->getForecastLocation() << \" / \"",
  "               << fcst->getForecastCustomer() << '\\n';",
  "      else {",
  "        auto delta = val / cnt;",
  "        for (auto p = fcst->getLeaves(false, this); p; ++p)",
  "          remainder = disaggregate(*p, bckt.getStart(), bckt.getEnd(),",
  "                                   delta + remainder, false, 0.0, mgr);",
  "      }",
  "    }",
  "  }",
  "  return remainder;",
  "}",
  "",
  "double ForecastMeasureAggregated::disaggregate(ForecastBase* fcst,",
  "                                               Date startdate, Date enddate,",
  "                                               double val, bool multiply,",
  "                                               double remainder,",
  "                                               CommandManager* mgr) const {",
  "  if (override_measure)",
  "    // Special logic for overriding another measure",
  "    return disaggregateOverride(fcst, startdate, enddate, val, multiply,",
  "                                remainder, mgr);",
  "",
  "  // Get the current value of this node",
  "  auto fcstdata = fcst->getData();",
  "  lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "  double currentvalue = 0.0;",
  "  unsigned int cnt = 0;",
  "  if (!multiply)",
  "    for (auto& bckt : fcstdata->getBuckets()) {",
  "      if (bckt.getStart() > enddate) break;",
  "      if ((bckt.getStart() >= startdate && bckt.getStart() < enddate) ||",
  "          (bckt.getDates().within(startdate) &&",
  "           bckt.getDates().between(enddate))) {",
  "        currentvalue += getValue(bckt);",
  "        ++cnt;",
  "      }",
  "    }",
  "",
  "  // TODO the leaf and parent logic can be combined",
  "  if (isLeaf(fcst)) {",
  "    //  Handling of leaf forecasts",
  "    if (multiply || currentvalue != 0.0) {",
  "      if (!multiply) val /= currentvalue;",
  "      // Proportionally scale all buckets",
  "      for (auto& bckt : fcstdata->getBuckets()) {",
  "        if (bckt.getStart() > enddate) break;",
  "        if ((bckt.getStart() >= startdate && bckt.getStart() < enddate) ||",
  "            (bckt.getDates().within(startdate) &&",
  "             bckt.getDates().between(enddate)))",
  "          remainder = update(bckt, getValue(bckt) * val + remainder, mgr);",
  "      }",
  "    } else {",
  "      // Equally distribute over all buckets",
  "      if (multiply) logger << \"ignoring multiply flag\\n\";",
  "      if (!cnt)",
  "        logger << \" no child forecast found to update for \"",
  "               << fcst->getForecastItem() << \" / \"",
  "               << fcst->getForecastLocation() << \" / \"",
  "               << fcst->getForecastCustomer() << '\\n';",
  "      else {",
  "        auto newval = val / cnt;",
  "        for (auto& bckt : fcstdata->getBuckets()) {",
  "          if (bckt.getStart() > enddate) break;",
  "          if ((bckt.getStart() >= startdate && bckt.getStart() < enddate) ||",
  "              (bckt.getDates().within(startdate) &&",
  "               bckt.getDates().between(enddate)))",
  "            remainder = update(bckt, newval + remainder, mgr);",
  "        }",
  "      }",
  "    }",
  "  } else {",
  "    // Handling of parent forecasts",
  "    if (currentvalue != 0.0) {",
  "      // Proportionally scale all child forecasts",
  "      double factor = val / currentvalue;",
  "      for (auto ch = fcst->getLeaves(false, this); ch; ++ch)",
  "        remainder =",
  "            disaggregate(*ch, startdate, enddate, factor, true, remainder, mgr);",
  "    } else {",
  "      // Equal distribution of all child forecasts",
  "      unsigned int cnt = 0;",
  "      for (auto ch = fcst->getLeaves(false, this); ch; ++ch) ++cnt;",
  "      if (!cnt)",
  "        logger << \" no child forecast found to update for \"",
  "               << fcst->getForecastItem() << \" / \"",
  "               << fcst->getForecastLocation() << \" / \"",
  "               << fcst->getForecastCustomer() << '\\n';",
  "      else {",
  "        auto delta = val / cnt;",
  "        for (auto p = fcst->getLeaves(false, this); p; ++p)",
  "          remainder = disaggregate(*p, startdate, enddate, delta + remainder,",
  "                                   false, 0, mgr);",
  "      }",
  "    }",
  "  }",
  "  return remainder;",
  "}",
  "",
  "double ForecastMeasureAggregated::disaggregateOverride(",
  "    ForecastBucketData& bckt, double val, bool, double remainder,",
  "    CommandManager* mgr) const {",
  "  // Get the current value of this node",
  "  auto fcst = bckt.getForecast();",
  "  auto fcstdata = fcst->getData();",
  "  lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "  auto& fcstbcktdata = fcstdata->getBuckets()[bckt.getIndex()];",
  "",
  "  // Get status",
  "  unsigned int count_override = 0;",
  "  unsigned int count_no_override = 0;",
  "  auto current_override = getValue(fcstbcktdata);",
  "  auto current_base = override_measure->getValue(fcstbcktdata);",
  "  double current_total;",
  "  if (current_override != -1.0) {",
  "    count_override = 1;",
  "    current_total = current_override;",
  "  } else {",
  "    current_override = 0.0;",
  "    count_no_override = 1;",
  "    current_total = current_base;",
  "  }",
  "",
  "  // Select the update mode",
  "  short mode;",
  "  double arg;",
  "  if (val <= -1.0) {",
  "    // Mode 0: Remove the overrides on the children",
  "    mode = 0;",
  "    arg = -1.0;",
  "  } else if (count_override != 0u) {",
  "    if (current_override > val ||",
  "        fabs(current_override - current_total) < ROUNDING_ERROR) {",
  "      if (current_override != 0.0) {",
  "        // Mode 1: scale the existing overrides and set others expliclitly to",
  "        // 0.",
  "        mode = 1;",
  "        arg = val / current_override;",
  "      } else {",
  "        // Mode 11: Distribute equally over all overrides",
  "        mode = 11;",
  "        arg = val / count_override;",
  "      }",
  "    } else {",
  "      if (current_total != 0.0) {",
  "        // Scale non-overriden values to sum up correctly.",
  "        // Existing overridden values are left untouched.",
  "        mode = 3;",
  "        arg = val / current_total;",
  "      } else {",
  "        // Mode 4: Set non-overridden values",
  "        mode = 4;",
  "        arg = val / count_no_override;",
  "      }",
  "    }",
  "  } else if (current_base != 0.0) {",
  "    // Mode 3: Scale all existing records proportional to the base.",
  "    mode = 3;",
  "    arg = val / current_base;",
  "  } else if (count_no_override != 0u) {",
  "    // Mode 4: Divide the quantity evenly over all existing leafs.",
  "    mode = 4;",
  "    arg = val / count_no_override;",
  "  } else {",
  "    logger << \"no children found!!!!\\n\";",
  "    return remainder;",
  "  }",
  "  for (auto ch = fcst->getLeaves(true, this); ch; ++ch) {",
  "    auto childfcstdata = ch->getData();",
  "    lock_guard<recursive_mutex> exclusive(childfcstdata->lock);",
  "    auto& childfcstbcktdata = childfcstdata->getBuckets()[bckt.getIndex()];",
  "",
  "    switch (mode) {",
  "      case 0:",
  "        // Remove the current override",
  "        remainder = update(childfcstbcktdata, -1, mgr);",
  "        break;",
  "      case 1: {",
  "        // Scale existing overrides and set non-overriden to 0",
  "        auto c = getValue(childfcstbcktdata);",
  "        remainder = update(childfcstbcktdata,",
  "                           c == -1.0 ? 0.0 : c * arg + remainder, mgr);",
  "        break;",
  "      }",
  "      case 11: {",
  "        // Set overridden",
  "        remainder = update(childfcstbcktdata, arg + remainder, mgr);",
  "        break;",
  "      }",
  "      case 3: {",
  "        // Scale non-overriden",
  "        auto o = getValue(childfcstbcktdata);",
  "        if (o == -1.0) {",
  "          auto c = override_measure->getValue(childfcstbcktdata);",
  "          remainder = update(childfcstbcktdata, c * arg + remainder, mgr);",
  "        }",
  "        break;",
  "      }",
  "      case 4: {",
  "        // Set non-overriden",
  "        auto o = getValue(childfcstbcktdata);",
  "        if (o == -1.0)",
  "          remainder = update(childfcstbcktdata, arg + remainder, mgr);",
  "        break;",
  "      }",
  "      default:",
  "        throw LogicException(\"Unkown mode\");",
  "    }",
  "  }",
  "  return remainder;",
  "}",
  "",
  "double ForecastMeasureAggregated::disaggregateOverride(",
  "    ForecastBase* fcst, Date startdate, Date enddate, double val, bool,",
  "    double remainder, CommandManager* mgr) const {",
  "  // Get the current status",
  "  double current_base = 0.0;",
  "  double current_override = 0.0;",
  "  double current_no_override = 0.0;",
  "  double current_total = 0.0;",
  "  unsigned int count_override = 0;",
  "  unsigned int count_no_override = 0;",
  "  unsigned int cnt = 0;",
  "  {",
  "    auto fcstdata = fcst->getData();",
  "    lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "    for (auto bckt = fcstdata->getBuckets().begin();; ++bckt) {",
  "      if (bckt == fcstdata->getBuckets().end() || bckt->getStart() > enddate)",
  "        break;",
  "      if ((bckt->getStart() >= startdate && bckt->getStart() < enddate) ||",
  "          (bckt->getDates().within(startdate) &&",
  "           bckt->getDates().between(enddate))) {",
  "        for (auto ch = fcst->getLeaves(true, this); ch; ++ch) {",
  "          auto childfcstdata = ch->getData();",
  "          lock_guard<recursive_mutex> exclusive(childfcstdata->lock);",
  "          auto tmp = getValue(childfcstdata->getBuckets()[bckt->getIndex()]);",
  "          auto base = override_measure->getValue(",
  "              childfcstdata->getBuckets()[bckt->getIndex()]);",
  "          current_base += base;",
  "          if (tmp != -1.0) {",
  "            current_total += tmp;",
  "            current_override += tmp;",
  "            ++count_override;",
  "          } else {",
  "            current_total += base;",
  "            current_no_override += base;",
  "            ++count_no_override;",
  "          }",
  "          ++cnt;",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  // Select the update mode",
  "  short mode;",
  "  double arg;",
  "  if (val <= -1.0) {",
  "    // Mode 0: Remove the overrides on the children",
  "    mode = 0;",
  "    arg = -1.0;",
  "  } else if (count_override != 0u) {",
  "    // Some overrides already exist",
  "    if (current_override > val || !count_no_override) {",
  "      // Scale existing overrides",
  "      if (current_override != 0.0) {",
  "        // Mode 1: scale the existing overrides and set others expliclitly to",
  "        // 0.",
  "        mode = 1;",
  "        arg = val / current_override;",
  "      } else {",
  "        // Mode 11: Distribute equally over all overrides",
  "        mode = 11;",
  "        arg = val / count_override;",
  "      }",
  "    } else {",
  "      // Update non-overriden entries",
  "      if (current_no_override != 0.0) {",
  "        // Scale non-overriden values to sum up correctly.",
  "        // Existing overridden values are left untouched.",
  "        mode = 3;",
  "        arg = (val - current_override) / current_no_override;",
  "      } else {",
  "        // Mode 4: Set non-overridden values",
  "        mode = 4;",
  "        arg = (val - current_override) / count_no_override;",
  "      }",
  "    }",
  "  } else if (current_base != 0.0) {",
  "    // Mode 3: Scale all existing records proportional to the base.",
  "    mode = 3;",
  "    arg = val / current_base;",
  "  } else if (count_no_override != 0u) {",
  "    // Mode 4: Divide the quantity evenly over all existing leafs.",
  "    mode = 4;",
  "    arg = val / count_no_override;",
  "  } else",
  "    return remainder;",
  "",
  "  for (auto ch = fcst->getLeaves(true, this); ch; ++ch) {",
  "    auto childfcstdata = ch->getData();",
  "    lock_guard<recursive_mutex> exclusive(childfcstdata->lock);",
  "    for (auto& bckt : childfcstdata->getBuckets()) {",
  "      if (bckt.getStart() > enddate) break;",
  "      if ((bckt.getStart() >= startdate && bckt.getStart() < enddate) ||",
  "          (bckt.getDates().within(startdate) &&",
  "           bckt.getDates().between(enddate)))",
  "        switch (mode) {",
  "          case 0:",
  "            // Remove the current override",
  "            remainder = update(bckt, -1, mgr);",
  "            break;",
  "          case 1: {",
  "            // Scale existing overrides and set non-overriden to 0",
  "            auto c = getValue(bckt);",
  "            remainder =",
  "                update(bckt, c == -1.0 ? 0.0 : c * arg + remainder, mgr);",
  "            break;",
  "          }",
  "          case 11: {",
  "            // Set existing overrides",
  "            auto c = getValue(bckt);",
  "            remainder = update(bckt, c == -1.0 ? 0.0 : arg + remainder, mgr);",
  "            break;",
  "          }",
  "          case 3: {",
  "            // Scale non-overriden",
  "            auto o = getValue(bckt);",
  "            if (o == -1.0) {",
  "              auto c = override_measure->getValue(bckt);",
  "              remainder = update(bckt, c * arg + remainder, mgr);",
  "            }",
  "            break;",
  "          }",
  "          case 4: {",
  "            // Set non-overriden",
  "            auto o = getValue(bckt);",
  "            if (o == -1.0) remainder = update(bckt, arg + remainder, mgr);",
  "          } break;",
  "          default:",
  "            throw LogicException(\"Unkown mode\");",
  "        }",
  "    }",
  "  }",
  "  return remainder;",
  "}",
  "",
  "double ForecastMeasureLocal::disaggregate(ForecastBucketData& bckt, double val,",
  "                                          bool multiply, double remainder,",
  "                                          CommandManager* mgr) const {",
  "  auto fcstdata = bckt.getForecast()->getData();",
  "  lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "  auto& fcsbcktdata = fcstdata->getBuckets()[bckt.getIndex()];",
  "  if (multiply)",
  "    return update(fcsbcktdata, val * getValue(fcsbcktdata) + remainder, mgr);",
  "  else",
  "    return update(fcsbcktdata, val + remainder, mgr);",
  "}",
  "",
  "double ForecastMeasureLocal::disaggregate(ForecastBase* fcst, Date startdate,",
  "                                          Date enddate, double val,",
  "                                          bool multiply, double remainder,",
  "                                          CommandManager* mgr) const {",
  "  auto fcstdata = fcst->getData();",
  "  lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "  for (auto& bckt : fcstdata->getBuckets()) {",
  "    if (bckt.getStart() > enddate) break;",
  "    if ((bckt.getStart() >= startdate && bckt.getStart() < enddate) ||",
  "        (bckt.getDates().within(startdate) &&",
  "         bckt.getDates().between(enddate))) {",
  "      if (multiply)",
  "        remainder = update(bckt, getValue(bckt) * val + remainder, mgr);",
  "      else",
  "        remainder = update(bckt, val + remainder, mgr);",
  "    }",
  "  }",
  "  return remainder;",
  "}",
  "",
  "double ForecastMeasure::update(ForecastBucketData& fcstdata, double val,",
  "                               CommandManager* mgr) const {",
  "  // TODO use a single setvalue call with multiple arguments to avoid",
  "  // iterating many times over the parents",
  "  auto fcst = fcstdata.getForecast();",
  "  auto fdata = fcst->getData();",
  "  lock_guard<recursive_mutex> exclusive(fdata->lock);",
  "  double remainder = 0.0;",
  "  bool initialized = false;",
  "",
  "  // Create a command to be able to undo the change later",
  "  if (mgr) mgr->add(new CommandSetForecastData(&fcstdata, this, val));",
  "",
  "  // FORECAST BASELINE",
  "  if (this == Measures::forecastbaseline) {",
  "    double qty;",
  "    if (fcst->getDiscrete()) {",
  "      qty = floor(val + ROUNDING_ERROR);",
  "      remainder = val - qty;",
  "    } else",
  "      qty = val;",
  "    fcstdata.setValue(true, mgr, Measures::forecastbaseline, qty);",
  "  }",
  "  // FORECAST OVERRIDE",
  "  else if (this == Measures::forecastoverride) {",
  "    if (val == -1)",
  "      // TODO We shouldn't need this special case. However a unit test fails",
  "      // if we remove it. Looks like removevalue and setvalue do something",
  "      // different somewhere.",
  "      fcstdata.removeValue(true, mgr, Measures::forecastoverride);",
  "    else {",
  "      double qty;",
  "      if (fcst->getDiscrete()) {",
  "        qty = floor(val + ROUNDING_ERROR);",
  "        remainder = val - qty;",
  "      } else",
  "        qty = val;",
  "      fcstdata.setValue(true, mgr, Measures::forecastoverride, qty);",
  "    }",
  "  }",
  "  // FORECAST CONSUMED",
  "  else if (this == Measures::forecastconsumed) {",
  "    fcstdata.setValue(true, nullptr, Measures::forecastconsumed, val);",
  "    auto new_net = Measures::forecasttotal->getValue(fcstdata) - val;",
  "    Measures::forecastnet->update(fcstdata, new_net, mgr);",
  "  }",
  "  // UPDATING A COMPUTED MEASURES",
  "  else if (hasType<ForecastMeasureComputed>()) {",
  "    auto me = static_cast<const ForecastMeasureComputed*>(this);",
  "    if (me->getUpdateExpression().empty()) return remainder;",
  "    if (!initialized) {",
  "      // Initialize symbol table",
  "      for (auto m = begin(); m != end(); ++m)",
  "        m->expressionvalue = fcstdata.getValue(*m);",
  "      initialized = true;",
  "      ForecastMeasureComputed::cost = fcst->getForecastItem()->getCost();",
  "      ForecastMeasureComputed::fcstbckt = fcstdata.getForecastBucket();",
  "      ForecastMeasureComputed::newvalue = val;",
  "    }",
  "    // Run assigments expressions",
  "    me->update();",
  "    // Copy from formula back to the measures",
  "    for (auto& a : me->assignments)",
  "      if (a != this)",
  "        a->update(fcstdata, a->expressionvalue, mgr);",
  "      else",
  "        fcstdata.setValue(true, mgr, a, a->expressionvalue);",
  "  }",
  "  // OTHERS - SIMPLE, UNRELATED AGGREGATION",
  "  else {",
  "    // Note that we use measure.getDiscrete() rather than fcst.getDiscrete",
  "    // here",
  "    if (getDiscrete()) {",
  "      auto qty = floor(val + ROUNDING_ERROR);",
  "      remainder = val - qty;",
  "      fcstdata.setValue(true, mgr, this, qty);",
  "    } else",
  "      fcstdata.setValue(true, mgr, this, val);",
  "  }",
  "",
  "  computeDependentMeasures(fcstdata, !initialized);",
  "  return remainder;",
  "}",
  "",
  "void ForecastMeasure::computeDependentMeasures(ForecastBucketData& fcstdata,",
  "                                               bool initialize) const {",
  "  // Process all dependent measures",
  "  for (auto& i : alldependents) {",
  "    if (initialize) {",
  "      // Initialize symbol table",
  "      for (auto& m : all()) m.expressionvalue = fcstdata.getValue(m);",
  "      ForecastMeasureComputed::cost =",
  "          fcstdata.getForecast()->getForecastItem()->getCost();",
  "      ForecastMeasureComputed::fcstbckt = fcstdata.getForecastBucket();",
  "    }",
  "    const_cast<ForecastMeasureComputed*>(i)->expressionvalue =",
  "        i->getDiscrete() ? floor(i->compute() + ROUNDING_ERROR) : i->compute();",
  "    double val = i->expressionvalue;",
  "    if (i->getDefault() == -1 && val == -1.0)",
  "      fcstdata.removeValue(true, nullptr, i);",
  "    else",
  "      fcstdata.setValue(true, nullptr, i, val);",
  "",
  "    // Process changes of the computed total forecast",
  "    if (i == Measures::forecasttotal) {",
  "      fcstdata.setValue(true, nullptr, i, val);",
  "      if (fcstdata.getEnd() > Plan::instance().getFcstCurrent()) {",
  "        if (fcstdata.getForecast()->getPlanned())",
  "          Measures::forecastnet->update(",
  "              fcstdata, val - fcstdata.getValue(*Measures::forecastconsumed));",
  "        else",
  "          for (auto p = fcstdata.getForecast()->getParents(); p; ++p)",
  "            if (p->getPlanned()) {",
  "              auto pfcstdata = p->getData();",
  "              lock_guard<recursive_mutex> exclusive(pfcstdata->lock);",
  "              auto& pfcstbucketdata =",
  "                  pfcstdata->getBuckets()[fcstdata.getIndex()];",
  "              Measures::forecastnet->update(",
  "                  pfcstbucketdata,",
  "                  pfcstbucketdata.getValue(*Measures::forecasttotal) -",
  "                      pfcstbucketdata.getValue(*Measures::forecastconsumed));",
  "              break;",
  "            }",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "void MeasureValue::addToFree(MeasurePagePool& pool) {",
  "  prev = pool.lastfree;",
  "  next = nullptr;",
  "  msr = PooledString::nullstring;",
  "  if (pool.lastfree)",
  "    pool.lastfree->next = this;",
  "  else",
  "    pool.firstfree = this;",
  "  pool.lastfree = this;",
  "}",
  "",
  "void MeasureValue::addToFree() {",
  "  auto& pool = getPagePool();",
  "  lock_guard<mutex> l(pool.lock);",
  "  addToFree(pool);",
  "}",
  "",
  "MeasurePage::MeasurePage(MeasurePagePool& pool) : next(nullptr) {",
  "  // Insert into page list",
  "  if (pool.lastpage) {",
  "    prev = pool.lastpage;",
  "    pool.lastpage->next = this;",
  "  } else {",
  "    pool.firstpage = this;",
  "    prev = nullptr;",
  "  }",
  "  pool.lastpage = this;",
  "",
  "  // Extend the list of free pairs",
  "  for (auto& v : data) v.addToFree(pool);",
  "}",
  "",
  "short MeasurePage::status() const {",
  "  bool empty = true;",
  "  bool heads = false;",
  "  for (auto& v : data) {",
  "    if (v.msr) {",
  "      empty = false;",
  "      if (!v.prev || !v.next) heads = true;",
  "    }",
  "  }",
  "  if (empty)",
  "    return 2;",
  "  else if (heads)",
  "    return 0;  // Untouchable",
  "  else",
  "    return 1;  // can be emptied",
  "}",
  "",
  "void MeasurePagePool::releaseEmptyPages() {",
  "  lock_guard<mutex> l(lock);",
  "  unsigned int count = 0;",
  "  for (auto p = firstpage; p;) {",
  "    auto status = p->status();",
  "    if (status == 2) {",
  "      // Unlink the page",
  "      if (p->prev)",
  "        p->prev->next = p->next;",
  "      else",
  "        firstpage = p->next;",
  "      if (p->next)",
  "        p->next->prev = p->prev;",
  "      else",
  "        lastpage = p->prev;",
  "",
  "      // Unlink the free nodes",
  "      for (auto& v : p->data) {",
  "        if (v.next)",
  "          v.next->prev = v.prev;",
  "        else",
  "          lastfree = v.prev;",
  "        if (v.prev)",
  "          v.prev->next = v.next;",
  "        else",
  "          firstfree = v.next;",
  "      }",
  "",
  "      // Release the memory",
  "      auto tmp = p;",
  "      p = p->next;",
  "      delete tmp;",
  "      ++count;",
  "    } else",
  "      p = p->next;",
  "  }",
  "  logger << \"Released \" << count << \" \" << name << \" memory pages\\n\";",
  "}",
  "",
  "void MeasureList::insert(const PooledString& k, double v, bool c) {",
  "  if (c) {",
  "    // Update if it exists already",
  "    for (auto p = first; p; p = p->next)",
  "      if (p->msr == k) {",
  "        p->val = v;",
  "        return;",
  "      }",
  "  }",
  "",
  "  // Get a free pair",
  "  MeasureValue* n;",
  "  {",
  "    auto& pool = k.starts_with(\"temp\") ? MeasurePagePool::measurepages_temp",
  "                                       : MeasurePagePool::measurepages_default;",
  "    lock_guard<mutex> l(pool.lock);",
  "    if (!pool.firstfree) {",
  "      new MeasurePage(pool);",
  "      if (!pool.firstfree) throw RuntimeException(\"No free memory\");",
  "    }",
  "    n = pool.firstfree;",
  "    pool.firstfree = pool.firstfree->next;",
  "    if (pool.firstfree)",
  "      pool.firstfree->prev = nullptr;",
  "    else",
  "      pool.lastfree = nullptr;",
  "  }",
  "",
  "  // Insert a new pair",
  "  n->next = nullptr;",
  "  n->msr = k;",
  "  n->val = v;",
  "  n->prev = last;",
  "  if (last)",
  "    last->next = n;",
  "  else",
  "    first = n;",
  "  last = n;",
  "}",
  "",
  "void MeasureList::erase(const PooledString& k) {",
  "  for (auto p = first; p; p = p->next)",
  "    if (p->msr == k) {",
  "      // Unlink from the list",
  "      if (p->prev)",
  "        p->prev->next = p->next;",
  "      else",
  "        first = p->next;",
  "      if (p->next)",
  "        p->next->prev = p->prev;",
  "      else",
  "        last = p->prev;",
  "",
  "      // Add to free list",
  "      p->addToFree();",
  "      return;",
  "    }",
  "}",
  "",
  "void MeasureList::erase(MeasureValue* p) {",
  "  // Unlink from the list",
  "  if (p->prev)",
  "    p->prev->next = p->next;",
  "  else",
  "    first = p->next;",
  "  if (p->next)",
  "    p->next->prev = p->prev;",
  "  else",
  "    last = p->prev;",
  "",
  "  // Add to free list",
  "  p->addToFree();",
  "}",
  "",
  "void MeasureList::sort() {",
  "  // Bubble sort",
  "  bool ok;",
  "  do {",
  "    ok = true;",
  "    for (auto p = first; p && p->next; p = p->next) {",
  "      if (p->next->msr < p->msr) {",
  "        swap(p->msr, p->next->msr);",
  "        swap(p->val, p->next->val);",
  "        ok = false;",
  "      };",
  "    }",
  "  } while (!ok);",
  "}",
  "",
  "void MeasureList::check() {",
  "  unsigned int count_fwd = 0;",
  "  for (auto p = first; p; p = p->next) ++count_fwd;",
  "  unsigned int count_bck = 0;",
  "  unsigned int count_wrong_links = 0;",
  "  for (auto p = last; p; p = p->prev) {",
  "    ++count_bck;",
  "    if (p->prev && p->prev->next != p) ++count_wrong_links;",
  "  }",
  "  if (count_fwd != count_bck)",
  "    logger << \"Error: Mismatch forward and backward size: \" << count_fwd",
  "           << \" vs \" << count_bck << '\\n';",
  "  if (count_wrong_links)",
  "    logger << \"Error: \" << count_wrong_links << \"incorrect links in list\"",
  "           << '\\n';",
  "  if (count_fwd != count_bck || count_wrong_links)",
  "    throw DataException(\"Corrupted list\");",
  "}",
  "",
  "pair<double, double> MeasurePagePool::check(const string& msg) {",
  "  unsigned int count_pages = 0;",
  "  unsigned int count_pages_free = 0;",
  "  unsigned int count_pages_temp = 0;",
  "  unsigned int count_pages_temp_free = 0;",
  "  unsigned int count_free = 0;",
  "  unsigned int count_used = 0;",
  "  unsigned int count_temp_free = 0;",
  "  unsigned int count_temp_used = 0;",
  "  unsigned int count_wrong_links = 0;",
  "",
  "  // Exclusive access needed",
  "  lock_guard<mutex> l_tmp(measurepages_temp.lock);",
  "  lock_guard<mutex> l_default(measurepages_default.lock);",
  "",
  "  // Count temp pages",
  "  for (auto p = measurepages_temp.firstpage; p; p = p->next) {",
  "    ++count_pages_temp;",
  "    if (p->prev && p->prev->next != p) ++count_wrong_links;",
  "    bool empty = true;",
  "    for (auto& v : p->data)",
  "      if (v.msr) {",
  "        ++count_temp_used;",
  "        empty = false;",
  "      } else",
  "        ++count_temp_free;",
  "    if (empty) ++count_pages_temp_free;",
  "  }",
  "",
  "  // Count default pages",
  "  for (auto p = measurepages_default.firstpage; p; p = p->next) {",
  "    ++count_pages;",
  "    if (p->prev && p->prev->next != p) ++count_wrong_links;",
  "    bool empty = true;",
  "    for (auto& v : p->data)",
  "      if (v.msr) {",
  "        ++count_used;",
  "        empty = false;",
  "      } else",
  "        ++count_free;",
  "    if (empty) ++count_pages_free;",
  "  }",
  "",
  "  // Default free list",
  "  unsigned int count_freelist_fwd = 0;",
  "  for (auto p = measurepages_default.firstfree; p; p = p->next)",
  "    ++count_freelist_fwd;",
  "  unsigned int count_freelist_bck = 0;",
  "  for (auto p = measurepages_default.lastfree; p; p = p->prev)",
  "    ++count_freelist_bck;",
  "  if (count_freelist_fwd != count_free || count_freelist_bck != count_free) {",
  "    logger << \"Error: mismatched free count \" << count_freelist_fwd << \" vs \"",
  "           << count_freelist_bck << \" vs \" << count_free << '\\n';",
  "  }",
  "",
  "  // Temp free list",
  "  unsigned int count_freelist_temp_fwd = 0;",
  "  for (auto p = measurepages_temp.firstfree; p; p = p->next)",
  "    ++count_freelist_temp_fwd;",
  "  unsigned int count_freelist_temp_bck = 0;",
  "  for (auto p = measurepages_temp.lastfree; p; p = p->prev)",
  "    ++count_freelist_temp_bck;",
  "  if (count_freelist_temp_fwd != count_temp_free ||",
  "      count_freelist_temp_bck != count_temp_free) {",
  "    logger << \"Error: mismatched temp free count \" << count_freelist_temp_fwd",
  "           << \" vs \" << count_freelist_temp_bck << \" vs \" << count_temp_free",
  "           << '\\n';",
  "  }",
  "",
  "  // Print stats",
  "  if (count_wrong_links) {",
  "    logger << \"Error: \" << count_wrong_links << \"incorrect links in list\"",
  "           << '\\n';",
  "  }",
  "  logger << \"Measure memory page stats: \" << msg << '\\n';",
  "  logger << \"   \" << count_pages << \" pages with \" << count_used",
  "         << \" pairs in use and \" << count_free << \" free pairs.\\n\";",
  "  logger << \"   \" << count_pages_temp << \" temporary pages with \"",
  "         << count_temp_used << \" pairs in use and \" << count_temp_free",
  "         << \" free pairs.\\n\";",
  "  double util = count_free + count_used + count_temp_free + count_temp_used;",
  "  util = (util != 0.0) ? round(100.0 * (count_used + count_temp_used) / util)",
  "                       : 0.0;",
  "  logger << \"   \" << util << \"% average utilization\\n\";",
  "  logger << \"   \" << count_pages_free << \" empty pages, \"",
  "         << count_pages_temp_free << \" free temporary pages.\\n\";",
  "  return make_pair(util, static_cast<double>(count_pages + count_pages_temp));",
  "}",
  "",
  "}  // namespace frepple",
];
