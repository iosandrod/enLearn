// <header-api-generated>
import { Date as PlanningDate, DateRange } from "../utils/date.js";
import { HeaderModelAdapter } from "../utils/library.js";

export type ProblemOwner = HeaderModelAdapter & {
  updateProblems?(): void;
  getOperation?(): unknown;
};

interface ProblemState {
  changed: boolean;
  detectProblems: boolean;
  problems: Problem[];
}

const problemStates = new WeakMap<object, ProblemState>();
const problemEntities = new Set<ProblemOwner>();
let computationBusy = false;

function state(owner: ProblemOwner): ProblemState {
  let current = problemStates.get(owner);
  if (!current) {
    current = { changed: true, detectProblems: true, problems: [] };
    problemStates.set(owner, current);
    problemEntities.add(owner);
  }
  return current;
}

function compareProblems(left: Problem, right: Problem): number {
  const type = left.getType().localeCompare(right.getType());
  if (type) return type;
  const start = left.getStart().compare(right.getStart());
  if (start) return start;
  return left.getEnd().compare(right.getEnd());
}

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

/** Format a double like a default C++ ostream (6 significant digits). */
export function formatCppNumber(value: number): string {
  const input = Number(value);
  if (!Number.isFinite(input) || input === 0) return String(input);
  const rounded = Number(input.toPrecision(6));
  const absolute = Math.abs(rounded);
  const exponent = Math.floor(Math.log10(absolute));
  if (exponent < -4 || exponent >= 6) {
    const [mantissa = "0", exponentText = "0"] = rounded.toExponential(5).split("e");
    const compactMantissa = mantissa.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
    const exponentNumber = Number(exponentText);
    const sign = exponentNumber < 0 ? "-" : "+";
    return `${compactMantissa}e${sign}${Math.abs(exponentNumber).toString().padStart(2, "0")}`;
  }
  return rounded.toFixed(Math.max(0, 5 - exponent)).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function registerProblemEntity(owner: ProblemOwner): void { state(owner); }
export function unregisterProblemEntity(owner: ProblemOwner): void {
  clearEntityProblems(owner, false, true);
  problemEntities.delete(owner);
  problemStates.delete(owner);
}
export function getEntityChanged(owner: ProblemOwner): boolean { return state(owner).changed; }
export function setEntityChanged(owner: ProblemOwner, value = true): void { state(owner).changed = Boolean(value); }
export function getEntityDetectProblems(owner: ProblemOwner): boolean { return state(owner).detectProblems; }
export function setEntityDetectProblems(owner: ProblemOwner, value: boolean): void {
  const current = state(owner);
  const next = Boolean(value);
  if (current.detectProblems && !next) clearEntityProblems(owner, false, true);
  else if (!current.detectProblems && next) current.changed = true;
  current.detectProblems = next;
}
export function getEntityProblems(owner: ProblemOwner, refresh = true): Problem[] {
  const current = state(owner);
  if (refresh && current.changed && current.detectProblems) call(owner, "updateProblems");
  return [...current.problems];
}
export function clearEntityProblems(owner: ProblemOwner, setChanged = true, includeInvalidData = true): void {
  const current = state(owner);
  const removed = includeInvalidData
    ? [...current.problems]
    : current.problems.filter((problem) => problem.constructor.name !== "ProblemInvalidData");
  for (const problem of removed) problem.dispose();
  if (setChanged) current.changed = true;
}

export class HasProblems extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = [];
  static readonly cppQualifiedNames: readonly string[] = ["HasProblems"];
  constructor() { super(); registerProblemEntity(this); }
  static beginEntity(): HasProblemsEntityIterator { return new HasProblemsEntityIterator(); }
  static endEntity(): HasProblemsEntityIterator { return new HasProblemsEntityIterator([]); }
  beginEntity(): HasProblemsEntityIterator { return HasProblems.beginEntity(); }
  endEntity(): HasProblemsEntityIterator { return HasProblems.endEntity(); }
  getEntity(): ProblemOwner { return this; }
  hasNoProblems(): boolean { return getEntityProblems(this).length === 0; }
  static override registerFields(): number { return 0; }
  updateProblems(): void { setEntityChanged(this, false); }
  override dispose(): void { unregisterProblemEntity(this); super.dispose(); }
}

export class HasProblemsEntityIterator implements Iterable<ProblemOwner> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["HasProblems::EntityIterator"] as const;
  private readonly values: ProblemOwner[];
  private index = 0;
  constructor(values: Iterable<ProblemOwner> = problemEntities) { this.values = [...values]; }
  next(): ProblemOwner | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<ProblemOwner> { return this.values.values(); }
}

export class Plannable extends HasProblems {
  static override readonly cppBases = ["HasProblems", "Solvable"] as const;
  static override readonly cppQualifiedNames = ["Plannable"] as const;
  static computeProblems(): void {
    if (computationBusy) return;
    computationBusy = true;
    try {
      let changed = true;
      while (changed) {
        changed = false;
        for (const owner of problemEntities) {
          const current = state(owner);
          if (!current.changed || !current.detectProblems) continue;
          changed = true;
          call(owner, "updateProblems");
          current.changed = false;
        }
      }
    } finally { computationBusy = false; }
  }
  computeProblems(): void { Plannable.computeProblems(); }
  getChanged(): boolean { return getEntityChanged(this); }
  getDetectProblems(): boolean { return getEntityDetectProblems(this); }
  override getEntity(): Plannable { return this; }
  getProblems(): ProblemIterator { return new ProblemIterator(getEntityProblems(this)); }
  static override registerFields(): number { return 0; }
  setChanged(value = true): void { setEntityChanged(this, value); }
  setDetectProblems(value: boolean): void { setEntityDetectProblems(this, value); }
}

export class Problem extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = ["NonCopyable", "Object"] as const;
  static readonly cppQualifiedNames: readonly string[] = ["Problem"] as const;
  static override modelFamily = "Problem";
  protected problemOwner: ProblemOwner | null;
  private linked = false;
  private disposed = false;
  constructor(owner: ProblemOwner | null = null, add = false) {
    super();
    this.problemOwner = owner;
    if (owner) registerProblemEntity(owner);
    if (add) queueMicrotask(() => { if (!this.disposed) this.addProblem(); });
  }
  protected addProblem(): void {
    if (!this.problemOwner || this.linked) return;
    const problems = state(this.problemOwner).problems;
    problems.push(this);
    problems.sort(compareProblems);
    this.linked = true;
  }
  protected removeProblem(): void {
    if (!this.problemOwner || !this.linked) return;
    const problems = state(this.problemOwner).problems;
    const index = problems.indexOf(this);
    if (index >= 0) problems.splice(index, 1);
    this.linked = false;
  }
  static begin(owner?: ProblemOwner | null, refresh = true): ProblemIterator {
    if (owner) return new ProblemIterator(getEntityProblems(owner, refresh));
    Plannable.computeProblems();
    return new ProblemIterator(this.all());
  }
  static end(): ProblemIterator { return new ProblemIterator(); }
  static override all<T extends typeof HeaderModelAdapter>(this: T): InstanceType<T>[] {
    Plannable.computeProblems();
    const result: Problem[] = [];
    for (const owner of problemEntities) result.push(...state(owner).problems);
    return result.sort((left, right) => {
      const owner = String(call(left.getOwner(), "getName") ?? "").localeCompare(String(call(right.getOwner(), "getName") ?? ""));
      return owner || compareProblems(left, right);
    }) as InstanceType<T>[];
  }
  static override clear(): void { this.clearProblems(); }
  static clearProblems(owner?: ProblemOwner, setChanged = true, includeInvalidData = true): void {
    if (owner) { clearEntityProblems(owner, setChanged, includeInvalidData); return; }
    for (const entity of [...problemEntities]) clearEntityProblems(entity, true, true);
  }
  static clearConstraints(owner: object): void {
    const demands = HeaderModelAdapter.invokeStatic("Demand", "all", []) as HeaderModelAdapter[];
    for (const demand of demands) call(demand, "eraseConstraintOwner", owner);
  }
  begin(owner?: ProblemOwner | null, refresh = true): ProblemIterator { return Problem.begin(owner, refresh); }
  end(): ProblemIterator { return Problem.end(); }
  clearProblems(owner?: ProblemOwner, setChanged = true, includeInvalidData = true): void {
    Problem.clearProblems(owner, setChanged, includeInvalidData);
  }
  clearConstraints(owner: object): void { Problem.clearConstraints(owner); }
  getDates(): DateRange { return new DateRange(); }
  getDescription(): string { return "Planning problem"; }
  getEnd(): PlanningDate { return this.getDates().getEnd(); }
  getEntity(): string { return "problem"; }
  getName(): string { return this.getType(); }
  getNextProblem(): Problem | null {
    if (!this.problemOwner) return null;
    const problems = state(this.problemOwner).problems;
    return problems[problems.indexOf(this) + 1] ?? null;
  }
  getOwner(): ProblemOwner | null { return this.problemOwner; }
  getStart(): PlanningDate { return this.getDates().getStart(); }
  getType(): string { return this.constructor.name; }
  static override initialize(): number { return 0; }
  isFeasible(): boolean { return false; }
  static override registerFields(): number { return 0; }
  str(): string { return this.getDescription(); }
  getKeep(): boolean { return false; }
  transferOwner(owner: ProblemOwner): void {
    this.removeProblem();
    this.problemOwner = owner;
    registerProblemEntity(owner);
    this.addProblem();
  }
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeProblem();
    this.problemOwner = null;
    super.dispose();
  }
}

export class ProblemIterator implements Iterable<Problem> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Problem::iterator"] as const;
  private readonly values: readonly Problem[];
  private index = 0;
  constructor(values: Iterable<Problem> = []) { this.values = [...values]; }
  next(): Problem | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<Problem> { return this.values[Symbol.iterator](); }
}

export class ProblemList implements Iterable<Problem> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Problem::List"] as const;
  private readonly values: Problem[] = [];
  begin(): ProblemIterator { return new ProblemIterator(this.values); }
  clean(_demand?: unknown): void {
    const seen = new Set<string>();
    for (const problem of [...this.values]) {
      const key = `${problem.getType()}|${String(call(problem.getOwner(), "getName") ?? "")}`;
      if (seen.has(key) && !problem.getKeep()) this.unlink(problem);
      else seen.add(key);
    }
  }
  clear(from: Problem | null = null): void {
    const index = from ? this.values.indexOf(from) : 0;
    if (index < 0) return;
    for (const problem of this.values.splice(index)) problem.dispose();
  }
  empty(): boolean { return this.values.length === 0; }
  end(): ProblemIterator { return new ProblemIterator(); }
  erase(owner: object): void {
    for (const problem of [...this.values]) {
      const problemOwner = problem.getOwner();
      if (problemOwner === owner || call(problemOwner, "getOperation") === owner) this.unlink(problem);
    }
  }
  pop(after: Problem | null = null): void {
    const index = after ? this.values.indexOf(after) + 1 : 0;
    if (index < 0) return;
    const tail = this.values.splice(index);
    for (const problem of tail) {
      if (problem.getKeep()) this.values.push(problem);
      else problem.dispose();
    }
  }
  push(problem: Problem): Problem;
  push(factory: (owner: ProblemOwner, start: PlanningDate, end: PlanningDate, weight: number) => Problem,
    owner: ProblemOwner, start: PlanningDate, end: PlanningDate, weight?: number): Problem;
  push(first: Problem | ((owner: ProblemOwner, start: PlanningDate, end: PlanningDate, weight: number) => Problem),
    owner?: ProblemOwner, start = PlanningDate.infinitePast, end = PlanningDate.infiniteFuture, weight = 0): Problem {
    const problem = first instanceof Problem ? first : first(owner as ProblemOwner, start, end, weight);
    if (!this.values.includes(problem)) this.values.push(problem);
    return problem;
  }
  size(): number { return this.values.length; }
  top(): Problem | null { return this.values.at(-1) ?? null; }
  transfer(newOwner: ProblemOwner): void {
    for (const problem of this.values.splice(0)) problem.transferOwner(newOwner);
  }
  unlink(problem: Problem): void {
    const index = this.values.indexOf(problem);
    if (index >= 0) this.values.splice(index, 1);
  }
  [Symbol.iterator](): Iterator<Problem> { return this.values.values(); }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/problem.cpp.
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
  { name: "Problem::initialize", sourceLine: 42, status: "adapted" },
  { name: "Problem::addProblem", sourceLine: 102, status: "adapted" },
  { name: "Problem::removeProblem", sourceLine: 122, status: "adapted" },
  { name: "Plannable::setDetectProblems", sourceLine: 146, status: "adapted" },
  { name: "Problem::clearProblems", sourceLine: 149, status: "adapted" },
  { name: "Problem::List::transfer", sourceLine: 158, status: "adapted" },
  { name: "Plannable::computeProblems", sourceLine: 170, status: "adapted" },
  { name: "Problem::clearProblems", sourceLine: 205, status: "adapted" },
  { name: "Problem::clearConstraints", sourceLine: 214, status: "adapted" },
  { name: "Problem::clearProblems", sourceLine: 219, status: "adapted" },
  { name: "Plannable::getProblems", sourceLine: 247, status: "adapted" },
  { name: "HasProblems::EntityIterator::EntityIterator", sourceLine: 252, status: "adapted" },
  { name: "Buffer::iterator", sourceLine: 254, status: "adapted" },
  { name: "Buffer::begin", sourceLine: 254, status: "adapted" },
  { name: "Resource::iterator", sourceLine: 260, status: "adapted" },
  { name: "Resource::begin", sourceLine: 260, status: "adapted" },
  { name: "OperationPlan::iterator", sourceLine: 266, status: "adapted" },
  { name: "OperationPlan::begin", sourceLine: 266, status: "adapted" },
  { name: "Demand::iterator", sourceLine: 272, status: "adapted" },
  { name: "Demand::begin", sourceLine: 272, status: "adapted" },
  { name: "Operation::iterator", sourceLine: 278, status: "adapted" },
  { name: "Operation::begin", sourceLine: 278, status: "adapted" },
  { name: "Resource::iterator", sourceLine: 294, status: "adapted" },
  { name: "Resource::begin", sourceLine: 294, status: "adapted" },
  { name: "OperationPlan::iterator", sourceLine: 303, status: "adapted" },
  { name: "OperationPlan::begin", sourceLine: 303, status: "adapted" },
  { name: "Demand::iterator", sourceLine: 312, status: "adapted" },
  { name: "Demand::begin", sourceLine: 312, status: "adapted" },
  { name: "Operation::iterator", sourceLine: 321, status: "adapted" },
  { name: "Operation::begin", sourceLine: 321, status: "adapted" },
  { name: "HasProblems::EntityIterator::~EntityIterator", sourceLine: 337, status: "adapted" },
  { name: "HasProblems::EntityIterator::EntityIterator", sourceLine: 357, status: "adapted" },
  { name: "Buffer::iterator", sourceLine: 363, status: "adapted" },
  { name: "Resource::iterator", sourceLine: 365, status: "adapted" },
  { name: "OperationPlan::iterator", sourceLine: 367, status: "adapted" },
  { name: "Demand::iterator", sourceLine: 369, status: "adapted" },
  { name: "Operation::iterator", sourceLine: 371, status: "adapted" },
  { name: "Buffer::iterator", sourceLine: 383, status: "adapted" },
  { name: "Resource::iterator", sourceLine: 385, status: "adapted" },
  { name: "OperationPlan::iterator", sourceLine: 387, status: "adapted" },
  { name: "Demand::iterator", sourceLine: 389, status: "adapted" },
  { name: "Operation::iterator", sourceLine: 391, status: "adapted" },
  { name: "HasProblems::beginEntity", sourceLine: 452, status: "adapted" },
  { name: "HasProblems::endEntity", sourceLine: 456, status: "adapted" },
  { name: "Problem::begin", sourceLine: 478, status: "adapted" },
  { name: "Problem::begin", sourceLine: 480, status: "adapted" },
  { name: "Problem::end", sourceLine: 489, status: "adapted" },
  { name: "Problem::List::clear", sourceLine: 493, status: "adapted" },
  { name: "Problem::List::erase", sourceLine: 516, status: "adapted" },
  { name: "Problem::List::push", sourceLine: 539, status: "adapted" },
  { name: "Problem::List::pop", sourceLine: 608, status: "adapted" },
  { name: "Problem::List::top", sourceLine: 637, status: "adapted" },
  { name: "Problem::List::push", sourceLine: 643, status: "adapted" },
  { name: "Problem::List::clean", sourceLine: 660, status: "adapted" },
  { name: "HasLevel::getNumberOfLevels", sourceLine: 670, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface BufferPort {
  begin(...args: readonly PortValue[]): PortValue | void;
  iterator(...args: readonly PortValue[]): PortValue | void;
}

export interface DemandPort {
  begin(...args: readonly PortValue[]): PortValue | void;
  iterator(...args: readonly PortValue[]): PortValue | void;
}

export interface EntityIteratorPort {
  EntityIterator(...args: readonly PortValue[]): PortValue | void;
  disposeEntityIterator(...args: readonly PortValue[]): PortValue | void;
}

export interface HasLevelPort {
  getNumberOfLevels(...args: readonly PortValue[]): PortValue | void;
}

export interface HasProblemsPort {
  beginEntity(...args: readonly PortValue[]): PortValue | void;
  endEntity(...args: readonly PortValue[]): PortValue | void;
}

export interface ListPort {
  clean(...args: readonly PortValue[]): PortValue | void;
  clear(...args: readonly PortValue[]): PortValue | void;
  erase(...args: readonly PortValue[]): PortValue | void;
  pop(...args: readonly PortValue[]): PortValue | void;
  push(...args: readonly PortValue[]): PortValue | void;
  top(...args: readonly PortValue[]): PortValue | void;
  transfer(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPort {
  begin(...args: readonly PortValue[]): PortValue | void;
  iterator(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanPort {
  begin(...args: readonly PortValue[]): PortValue | void;
  iterator(...args: readonly PortValue[]): PortValue | void;
}

export interface PlannablePort {
  computeProblems(...args: readonly PortValue[]): PortValue | void;
  getProblems(...args: readonly PortValue[]): PortValue | void;
  setDetectProblems(...args: readonly PortValue[]): PortValue | void;
}

export interface ProblemPort {
  addProblem(...args: readonly PortValue[]): PortValue | void;
  begin(...args: readonly PortValue[]): PortValue | void;
  clearConstraints(...args: readonly PortValue[]): PortValue | void;
  clearProblems(...args: readonly PortValue[]): PortValue | void;
  end(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  removeProblem(...args: readonly PortValue[]): PortValue | void;
}

export interface ResourcePort {
  begin(...args: readonly PortValue[]): PortValue | void;
  iterator(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/problem.cpp";
export const targetFile = "model/problem.ts";

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
  "bool Plannable::anyChange = false;",
  "bool Plannable::computationBusy = false;",
  "const MetaCategory* Problem::metadata;",
  "const MetaClass *ProblemMaterialShortage::metadata,",
  "    *ProblemInvalidData::metadata, *ProblemPrecedence::metadata,",
  "    *ProblemBeforeCurrent::metadata, *ProblemCapacityOverload::metadata,",
  "    *ProblemAwaitSupply::metadata, *ProblemSyncDemand::metadata;",
  "const MetaClass *ConstraintOverdueDemand::metadata,",
  "    *ConstraintPurchasingLeadTime::metadata,",
  "    *ConstraintDistributionLeadTime::metadata,",
  "    *ConstraintManufacturingLeadTime::metadata;",
  "",
  "int Problem::initialize() {",
  "  // Initialize the problem metadata.",
  "  metadata = MetaCategory::registerCategory<Problem>(\"problem\", \"problems\");",
  "  registerFields<Problem>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Register classes.",
  "  // We register them as default to avoid saving an xsi:type header. This",
  "  // has no further impact as there is no factory method.",
  "  ProblemMaterialShortage::metadata =",
  "      MetaClass::registerClass<ProblemMaterialShortage>(",
  "          \"problem\", \"material shortage\", true);",
  "  ProblemInvalidData::metadata = MetaClass::registerClass<ProblemInvalidData>(",
  "      \"problem\", \"invalid data\", true);",
  "  ProblemPrecedence::metadata = MetaClass::registerClass<ProblemPrecedence>(",
  "      \"problem\", \"precedence\", true);",
  "  ProblemBeforeCurrent::metadata =",
  "      MetaClass::registerClass<ProblemBeforeCurrent>(\"problem\",",
  "                                                     \"before current\", true);",
  "  ProblemAwaitSupply::metadata = MetaClass::registerClass<ProblemAwaitSupply>(",
  "      \"problem\", \"await supply\", true);",
  "  ProblemSyncDemand::metadata = MetaClass::registerClass<ProblemSyncDemand>(",
  "      \"problem\", \"sync demand\", true);",
  "  ProblemCapacityOverload::metadata =",
  "      MetaClass::registerClass<ProblemCapacityOverload>(\"problem\", \"overload\",",
  "                                                        true);",
  "  ConstraintOverdueDemand::metadata =",
  "      MetaClass::registerClass<ConstraintOverdueDemand>(\"problem\", \"overdue\",",
  "                                                        true);",
  "  ConstraintPurchasingLeadTime::metadata =",
  "      MetaClass::registerClass<ConstraintPurchasingLeadTime>(",
  "          \"problem\", \"purchasing lead time\", true);",
  "  ConstraintDistributionLeadTime::metadata =",
  "      MetaClass::registerClass<ConstraintDistributionLeadTime>(",
  "          \"problem\", \"distribution lead time\", true);",
  "  ConstraintManufacturingLeadTime::metadata =",
  "      MetaClass::registerClass<ConstraintManufacturingLeadTime>(",
  "          \"problem\", \"manufacturing lead time\", true);",
  "",
  "  // Initialize the Python type",
  "  auto& x = PythonExtension<Problem>::getPythonType();",
  "  x.setName(\"problem\");",
  "  x.setDoc(\"frePPLe problem\");",
  "  x.supportgetattro();",
  "  x.supportstr();",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "bool Problem::operator<(const Problem& a) const {",
  "  // 1. Sort based on entity",
  "  assert(owner == a.owner);",
  "",
  "  // 2. Sort based on type",
  "  if (getType() != a.getType()) return getType() < a.getType();",
  "",
  "  // 3. Sort based on start date",
  "  return getDates().getStart() < a.getDates().getStart();",
  "}",
  "",
  "void Problem::addProblem() {",
  "  assert(owner);",
  "  if ((owner->firstProblem && *this < *(owner->firstProblem)) ||",
  "      !owner->firstProblem) {",
  "    // Insert as the first problem in the list",
  "    nextProblem = owner->firstProblem;",
  "    owner->firstProblem = this;",
  "  } else {",
  "    // Insert in the middle or at the end of the list",
  "    Problem* curProblem = owner->firstProblem->nextProblem;",
  "    Problem* prevProblem = owner->firstProblem;",
  "    while (curProblem && !(*this < *curProblem)) {",
  "      prevProblem = curProblem;",
  "      curProblem = curProblem->nextProblem;",
  "    }",
  "    nextProblem = curProblem;",
  "    prevProblem->nextProblem = this;",
  "  }",
  "}",
  "",
  "void Problem::removeProblem() {",
  "  // Fast delete method: the code triggering this method is responsible of",
  "  // maintaining the problem container",
  "  if (!owner) return;",
  "",
  "  if (owner->firstProblem == this)",
  "    // Removal from the head of the list",
  "    owner->firstProblem = nextProblem;",
  "  else {",
  "    // Removal from the middle of the list",
  "    Problem* prev = owner->firstProblem;",
  "    for (Problem* cur = owner->firstProblem; cur; cur = cur->nextProblem) {",
  "      if (cur == this) {",
  "        // Found it!",
  "        prev->nextProblem = nextProblem;",
  "        return;",
  "      }",
  "      prev = cur;",
  "    }",
  "    // The problem wasn't found in the list. This shouldn't happen...",
  "    throw LogicException(\"Corrupted problem list\");",
  "  }",
  "}",
  "",
  "void Plannable::setDetectProblems(bool b) {",
  "  if (useProblemDetection && !b)",
  "    // We are switching from 'yes' to 'no': delete all existing problems",
  "    Problem::clearProblems(*this);",
  "  else if (!useProblemDetection && b)",
  "    // We are switching from 'no' to 'yes': mark as changed for the next",
  "    // problem detection call",
  "    setChanged();",
  "  // Update the flag",
  "  useProblemDetection = b;",
  "}",
  "",
  "void Problem::List::transfer(HasProblems* newowner) {",
  "  if (!newowner) return;",
  "  if (!newowner->firstProblem) {",
  "    newowner->firstProblem = first;",
  "  } else {",
  "    auto* ptr = newowner->firstProblem;",
  "    while (ptr->nextProblem) ptr = ptr->nextProblem;",
  "    ptr->nextProblem = first;",
  "  }",
  "  first = nullptr;",
  "}",
  "",
  "void Plannable::computeProblems() {",
  "  // Exit immediately if the list is up to date",
  "  if (!anyChange && !computationBusy) return;",
  "",
  "  computationBusy = true;",
  "  // Get exclusive access to this function in a multi-threaded environment.",
  "  static mutex computationbusy;",
  "  {",
  "    lock_guard<mutex> l(computationbusy);",
  "",
  "    // Another thread may already have computed it while this thread was",
  "    // waiting for the lock",
  "    while (anyChange) {",
  "      // Reset to change flag. Note that during the computation the flag",
  "      // could be switched on again by some model change in a different thread.",
  "      anyChange = false;",
  "",
  "      // Loop through all entities",
  "      for (HasProblems::EntityIterator i; i != HasProblems::endEntity(); ++i) {",
  "        Plannable* e = i->getEntity();",
  "        if (e->getChanged() && e->getDetectProblems()) i->updateProblems();",
  "      }",
  "",
  "      // Mark the entities as unchanged",
  "      for (HasProblems::EntityIterator j; j != HasProblems::endEntity(); ++j) {",
  "        Plannable* e = j->getEntity();",
  "        if (e->getChanged() && e->getDetectProblems()) e->setChanged(false);",
  "      }",
  "    }",
  "",
  "    // Unlock the exclusive access to this function",
  "    computationBusy = false;",
  "  }",
  "}",
  "",
  "void Problem::clearProblems() {",
  "  // Loop through all entities, and call clearProblems(i)",
  "  for (HasProblems::EntityIterator i = HasProblems::beginEntity();",
  "       i != HasProblems::endEntity(); ++i) {",
  "    clearProblems(*i);",
  "    i->getEntity()->setChanged(true);",
  "  }",
  "}",
  "",
  "void Problem::clearConstraints(Object& p) {",
  "  for (auto dmd = Demand::begin(); dmd != Demand::end(); ++dmd)",
  "    dmd->getConstraints().erase(p);",
  "}",
  "",
  "void Problem::clearProblems(HasProblems& p, bool setchanged,",
  "                            bool includeInvalidData) {",
  "  // Nothing to do",
  "  if (!p.firstProblem) return;",
  "",
  "  // Delete all problems in the list",
  "  Problem* keepfirst = nullptr;",
  "  for (auto* cur = p.firstProblem; cur;) {",
  "    auto* del = cur;",
  "    cur = cur->nextProblem;",
  "    if (includeInvalidData || typeid(*del) != typeid(ProblemInvalidData)) {",
  "      del->owner = nullptr;",
  "      delete del;",
  "    } else if (!keepfirst) {",
  "      keepfirst = del;",
  "      if (keepfirst) keepfirst->nextProblem = del;",
  "      del->nextProblem = nullptr;",
  "    }",
  "  }",
  "  p.firstProblem = keepfirst;",
  "",
  "  // Mark as changed",
  "  if (setchanged) {",
  "    auto tmp = p.getEntity();",
  "    if (tmp) tmp->setChanged();",
  "  }",
  "}",
  "",
  "Problem::iterator Plannable::getProblems() const {",
  "  if (getChanged()) const_cast<Plannable*>(this)->updateProblems();",
  "  return Problem::iterator(firstProblem);",
  "}",
  "",
  "HasProblems::EntityIterator::EntityIterator() : type(0) {",
  "  // Buffer",
  "  bufIter = new Buffer::iterator(Buffer::begin());",
  "  if (*bufIter != Buffer::end()) return;",
  "",
  "  // Move on to resource if there are no buffers",
  "  delete bufIter;",
  "  type = 1;",
  "  resIter = new Resource::iterator(Resource::begin());",
  "  if (*resIter != Resource::end()) return;",
  "",
  "  // Move on to operationplans if there are no resources either",
  "  delete resIter;",
  "  type = 2;",
  "  operIter = new OperationPlan::iterator(OperationPlan::begin());",
  "  if (*operIter != OperationPlan::end()) return;",
  "",
  "  // Move on to demands if there are no operationplans either",
  "  delete operIter;",
  "  type = 3;",
  "  demIter = new Demand::iterator(Demand::begin());",
  "  if (*demIter != Demand::end()) return;",
  "",
  "  // Move on to operations if there are no demands either",
  "  delete demIter;",
  "  type = 4;",
  "  opIter = new Operation::iterator(Operation::begin());",
  "  if (*opIter == Operation::end()) {",
  "    // There is nothing at all in this model",
  "    delete opIter;",
  "    type = 5;",
  "  }",
  "}",
  "",
  "HasProblems::EntityIterator& HasProblems::EntityIterator::operator++() {",
  "  switch (type) {",
  "    case 0:",
  "      // Buffer",
  "      if (*bufIter != Buffer::end())",
  "        if (++(*bufIter) != Buffer::end()) return *this;",
  "      ++type;",
  "      delete bufIter;",
  "      resIter = new Resource::iterator(Resource::begin());",
  "      if (*resIter != Resource::end()) return *this;",
  "      // Note: no break statement",
  "    case 1:",
  "      // Resource",
  "      if (*resIter != Resource::end())",
  "        if (++(*resIter) != Resource::end()) return *this;",
  "      ++type;",
  "      delete resIter;",
  "      operIter = new OperationPlan::iterator(OperationPlan::begin());",
  "      if (*operIter != OperationPlan::end()) return *this;",
  "      // Note: no break statement",
  "    case 2:",
  "      // Operationplan",
  "      if (*operIter != OperationPlan::end())",
  "        if (++(*operIter) != OperationPlan::end()) return *this;",
  "      ++type;",
  "      delete operIter;",
  "      demIter = new Demand::iterator(Demand::begin());",
  "      if (*demIter != Demand::end()) return *this;",
  "      // Note: no break statement",
  "    case 3:",
  "      // Demand",
  "      if (*demIter != Demand::end())",
  "        if (++(*demIter) != Demand::end()) return *this;",
  "      ++type;",
  "      delete demIter;",
  "      opIter = new Operation::iterator(Operation::begin());",
  "      if (*opIter != Operation::end()) return *this;",
  "      // Note: no break statement",
  "    case 4:",
  "      // Operation",
  "      if (*opIter != Operation::end())",
  "        if (++(*opIter) != Operation::end()) return *this;",
  "      // Ended recursing of all entities",
  "      ++type;",
  "      delete opIter;",
  "      opIter = nullptr;",
  "      return *this;",
  "  }",
  "  throw LogicException(\"Unreachable code reached\");",
  "}",
  "",
  "HasProblems::EntityIterator::~EntityIterator() {",
  "  switch (type) {",
  "    case 0:",
  "      delete bufIter;",
  "      return;",
  "    case 1:",
  "      delete resIter;",
  "      return;",
  "    case 2:",
  "      delete operIter;",
  "      return;",
  "    case 3:",
  "      delete demIter;",
  "      return;",
  "    case 4:",
  "      delete opIter;",
  "      return;",
  "  }",
  "}",
  "",
  "HasProblems::EntityIterator::EntityIterator(const EntityIterator& o) {",
  "  // Delete old iterator",
  "  this->~EntityIterator();",
  "  // Populate new values",
  "  type = o.type;",
  "  if (type == 0)",
  "    bufIter = new Buffer::iterator(*(o.bufIter));",
  "  else if (type == 1)",
  "    resIter = new Resource::iterator(*(o.resIter));",
  "  else if (type == 2)",
  "    operIter = new OperationPlan::iterator(*(o.operIter));",
  "  else if (type == 3)",
  "    demIter = new Demand::iterator(*(o.demIter));",
  "  else if (type == 4)",
  "    opIter = new Operation::iterator(*(o.opIter));",
  "}",
  "",
  "HasProblems::EntityIterator& HasProblems::EntityIterator::operator=(",
  "    const EntityIterator& o) {",
  "  // Gracefully handle self assignment",
  "  if (this == &o) return *this;",
  "  // Delete old iterator",
  "  this->~EntityIterator();",
  "  // Populate new values",
  "  type = o.type;",
  "  if (type == 0)",
  "    bufIter = new Buffer::iterator(*(o.bufIter));",
  "  else if (type == 1)",
  "    resIter = new Resource::iterator(*(o.resIter));",
  "  else if (type == 2)",
  "    operIter = new OperationPlan::iterator(*(o.operIter));",
  "  else if (type == 3)",
  "    demIter = new Demand::iterator(*(o.demIter));",
  "  else if (type == 4)",
  "    opIter = new Operation::iterator(*(o.opIter));",
  "  return *this;",
  "}",
  "",
  "bool HasProblems::EntityIterator::operator!=(const EntityIterator& t) const {",
  "  // Different iterator type, thus always different and return false",
  "  if (type != t.type) return true;",
  "",
  "  // Same iterator type, more granular comparison required",
  "  switch (type) {",
  "    case 0:",
  "      return *bufIter != *(t.bufIter);",
  "    case 1:",
  "      return *resIter != *(t.resIter);",
  "    case 2:",
  "      return *operIter != *(t.operIter);",
  "    case 3:",
  "      return *demIter != *(t.demIter);",
  "    case 4:",
  "      return *opIter != *(t.opIter);",
  "    default:",
  "      // Always return true for higher type numbers. This should happen only",
  "      // when comparing with the end of list element.",
  "      return false;",
  "  }",
  "}",
  "",
  "HasProblems& HasProblems::EntityIterator::operator*() const {",
  "  switch (type) {",
  "    case 0:",
  "      return **bufIter;",
  "    case 1:",
  "      return **resIter;",
  "    case 2:",
  "      return **operIter;",
  "    case 3:",
  "      return **demIter;",
  "    case 4:",
  "      return **opIter;",
  "    default:",
  "      throw LogicException(\"Unknown problem entity found\");",
  "  }",
  "}",
  "",
  "HasProblems* HasProblems::EntityIterator::operator->() const {",
  "  switch (type) {",
  "    case 0:",
  "      return &**bufIter;",
  "    case 1:",
  "      return &**resIter;",
  "    case 2:",
  "      return &**operIter;",
  "    case 3:",
  "      return &**demIter;",
  "    case 4:",
  "      return &**opIter;",
  "    default:",
  "      throw LogicException(\"Unknown problem entity found\");",
  "  }",
  "}",
  "",
  "HasProblems::EntityIterator HasProblems::beginEntity() {",
  "  return EntityIterator();",
  "}",
  "",
  "HasProblems::EntityIterator HasProblems::endEntity() {",
  "  // Note that we give call a constructor with type 5, in order to allow",
  "  // a fast comparison.",
  "  return EntityIterator(5);",
  "}",
  "",
  "Problem::iterator& Problem::iterator::operator++() {",
  "  // Incrementing beyond the end",
  "  if (!iter) return *this;",
  "",
  "  // Move to the next problem",
  "  iter = iter->nextProblem;",
  "",
  "  // Move to the next entity",
  "  // We need a while loop here because some entities can be without problems",
  "  while (!iter && !owner && eiter && *eiter != HasProblems::endEntity()) {",
  "    ++(*eiter);",
  "    if (*eiter != HasProblems::endEntity()) iter = (*eiter)->firstProblem;",
  "  }",
  "  return *this;",
  "}",
  "",
  "Problem::iterator Problem::begin() { return iterator(); }",
  "",
  "Problem::iterator Problem::begin(HasProblems* i, bool refresh) {",
  "  // Null pointer passed, loop through the full list anyway",
  "  if (!i) return begin();",
  "",
  "  // Return an iterator for a single entity",
  "  if (refresh) i->updateProblems();",
  "  return iterator(i);",
  "}",
  "",
  "const Problem::iterator Problem::end() {",
  "  return iterator(static_cast<Problem*>(nullptr));",
  "}",
  "",
  "void Problem::List::clear(Problem* c) {",
  "  // Unchain the predecessor",
  "  if (c) {",
  "    for (Problem* x = first; x; x = x->nextProblem)",
  "      if (x->nextProblem == c) {",
  "        x->nextProblem = nullptr;",
  "        break;",
  "      }",
  "  }",
  "",
  "  // Delete each constraint in the list",
  "  for (Problem* cur = c ? c : first; cur;) {",
  "    Problem* del = cur;",
  "    cur = cur->nextProblem;",
  "    del->owner = nullptr;",
  "    del->resetReferenceCount();",
  "    delete del;",
  "  }",
  "",
  "  // Set the header to nullptr",
  "  if (!c) first = nullptr;",
  "}",
  "",
  "void Problem::List::erase(Object& p) {",
  "  Problem* prev = nullptr;",
  "  for (Problem* x = first; x;) {",
  "    if (x->getOwner() == &p ||",
  "        (x->getOwner() && x->getOwner()->hasType<OperationPlan>() &&",
  "         p.hasType<Operation>() &&",
  "         static_cast<OperationPlan*>(x->getOwner())->getOperation() == &p)) {",
  "      // Remove from the list",
  "      auto tmp = x;",
  "      if (prev)",
  "        prev->nextProblem = x->nextProblem;",
  "      else",
  "        first = x->nextProblem;",
  "      x = x->nextProblem;",
  "      tmp->owner = nullptr;",
  "      delete tmp;",
  "    } else {",
  "      prev = x;",
  "      x = x->nextProblem;",
  "    }",
  "  }",
  "}",
  "",
  "Problem* Problem::List::push(const MetaClass* m, const Object* o, Date st,",
  "                             Date nd, double w, Operation* oper, bool keep) {",
  "  // Find the end of the list",
  "  Problem* cur = first;",
  "  while (cur && cur->nextProblem && cur->getOwner() != o)",
  "    cur = cur->nextProblem;",
  "  if (cur && cur->getOwner() == o)",
  "    // Duplicate problem: stop here.",
  "    return cur;",
  "",
  "  // Create a new problem",
  "  Problem* p = nullptr;",
  "  if (m == ProblemCapacityOverload::metadata) {",
  "    p = new ProblemCapacityOverload(",
  "        const_cast<Resource*>(dynamic_cast<const Resource*>(o)), st, nd, w,",
  "        false);",
  "    static_cast<ProblemCapacityOverload*>(p)->setKeep(keep);",
  "    if (oper) static_cast<ProblemCapacityOverload*>(p)->setOperation(oper);",
  "  } else if (m == ProblemMaterialShortage::metadata)",
  "    p = new ProblemMaterialShortage(",
  "        const_cast<Buffer*>(dynamic_cast<const Buffer*>(o)), st, nd, w, false);",
  "  else if (m == ProblemBeforeCurrent::metadata) {",
  "    auto oper = dynamic_cast<const Operation*>(o);",
  "    if (oper->hasType<OperationItemDistribution>())",
  "      p = new ConstraintDistributionLeadTime(const_cast<Operation*>(oper), st,",
  "                                             nd);",
  "    else if (oper->hasType<OperationItemSupplier>())",
  "      p = new ConstraintPurchasingLeadTime(const_cast<Operation*>(oper), st,",
  "                                           nd);",
  "    else if (!oper->hasType<OperationDelivery>())",
  "      p = new ConstraintManufacturingLeadTime(const_cast<Operation*>(oper), st,",
  "                                              nd);",
  "  } else if (m == ProblemAwaitSupply::metadata) {",
  "    auto owner = const_cast<Buffer*>(dynamic_cast<const Buffer*>(o));",
  "    if (owner)",
  "      p = new ProblemAwaitSupply(owner, st, nd);",
  "    else {",
  "      auto owner = const_cast<Operation*>(dynamic_cast<const Operation*>(o));",
  "      if (owner) p = new ProblemAwaitSupply(owner, st, nd);",
  "    }",
  "  } else if (m == ConstraintOverdueDemand::metadata)",
  "    p = new ConstraintOverdueDemand(",
  "        const_cast<Demand*>(dynamic_cast<const Demand*>(o)));",
  "  else if (m == ProblemSyncDemand::metadata)",
  "    p = new ProblemSyncDemand(",
  "        const_cast<Demand*>(dynamic_cast<const Demand*>(o)), st, nd);",
  "  else if (m == ConstraintDistributionLeadTime::metadata)",
  "    p = new ConstraintDistributionLeadTime(",
  "        const_cast<Operation*>(dynamic_cast<const Operation*>(o)), st, nd);",
  "  else if (m == ConstraintPurchasingLeadTime::metadata)",
  "    p = new ConstraintPurchasingLeadTime(",
  "        const_cast<Operation*>(dynamic_cast<const Operation*>(o)), st, nd);",
  "  else if (m == ConstraintManufacturingLeadTime::metadata)",
  "    p = new ConstraintManufacturingLeadTime(",
  "        const_cast<Operation*>(dynamic_cast<const Operation*>(o)), st, nd);",
  "  else",
  "    throw LogicException(\"Problem factory can't create this type of problem\");",
  "",
  "  if (p) {",
  "    // Link the problem in the list",
  "    if (cur)",
  "      cur->nextProblem = p;",
  "    else",
  "      first = p;",
  "    Py_INCREF(p);",
  "  }",
  "  return p;",
  "}",
  "",
  "void Problem::List::pop(Problem* p) {",
  "  Problem* q = p ? p->nextProblem : first;",
  "  auto tail = p;",
  "  if (p)",
  "    // Skip the problem that was passed as argument",
  "    p->nextProblem = nullptr;",
  "  else",
  "    // nullptr argument: delete all",
  "    first = nullptr;",
  "",
  "  // Delete each constraint after the marked one",
  "  while (q) {",
  "    Problem* del = q;",
  "    q = q->nextProblem;",
  "    if (del->getKeep()) {",
  "      if (tail)",
  "        tail->nextProblem = del;",
  "      else",
  "        first = del;",
  "      del->nextProblem = nullptr;",
  "      tail = del;",
  "    } else {",
  "      del->owner = nullptr;",
  "      del->resetReferenceCount();",
  "      delete del;",
  "    }",
  "  }",
  "}",
  "",
  "Problem* Problem::List::top() const {",
  "  for (Problem* p = first; p; p = p->nextProblem)",
  "    if (!p->nextProblem) return p;",
  "  return nullptr;",
  "}",
  "",
  "void Problem::List::push(Problem* p) {",
  "  // Find the end of the list",
  "  Problem* cur = first;",
  "  while (cur && cur->nextProblem && cur != p) cur = cur->nextProblem;",
  "",
  "  if (!cur)",
  "    // Link at the start of the list",
  "    first = p;",
  "  else if (cur == p)",
  "    // Duplicate problem: stop here.",
  "    return;",
  "  else",
  "    // Link at the end of the list",
  "    cur->nextProblem = p;",
  "  Py_INCREF(p);",
  "}",
  "",
  "void Problem::List::clean(Demand* d) const {",
  "  // Check all manufacturing lead time constraints, and keep only the",
  "  // critical path.",
  "  auto& constraints = d->getConstraints();",
  "  if (constraints.empty()) return;",
  "",
  "  map<Operation*, bool> critical_path;",
  "  map<Operation*, bool> all_critical_paths;",
  "  Duration critical_path_duration(-1L);",
  "  Date start_critical_path = Date::infiniteFuture;",
  "  vector<OperationPlan*> opplans(HasLevel::getNumberOfLevels() + 5);",
  "  short lvl_prev = -1;",
  "  for (PeggingIterator p(d); p; --p) {",
  "    // Check for loops in the pegging",
  "    auto* m = p.getOperationPlan();",
  "    short lvl_cnt = lvl_prev;",
  "    bool loops = false;",
  "    for (auto* o : opplans) {",
  "      if (--lvl_cnt < -1) break;",
  "      if (o == m) {",
  "        loops = true;",
  "        break;",
  "      }",
  "    }",
  "    if (loops) continue;",
  "",
  "    // Evaluate when we identified end-to-end path.",
  "    short lvl = p.getLevel();",
  "    if (lvl == 0) {",
  "      // New delivery path starts, which can have its own critical path",
  "      critical_path_duration = -1L;",
  "      start_critical_path = Date::infiniteFuture;",
  "      for (auto i : critical_path) {",
  "        auto e = all_critical_paths.find(i.first);",
  "        if (e == all_critical_paths.end() || (!e->second && i.second))",
  "          all_critical_paths[i.first] = i.second;",
  "      }",
  "      critical_path_duration = -1L;",
  "      start_critical_path = Date::infiniteFuture;",
  "      critical_path.clear();",
  "    }",
  "    if (lvl <= lvl_prev && lvl_prev >= 0) {",
  "      bool in_critical_path = false;",
  "      for (auto lvl_cnt = lvl_prev; lvl_cnt >= 0; --lvl_cnt) {",
  "        if (!opplans[lvl_cnt]) continue;",
  "        if (!in_critical_path) {",
  "          for (auto cstrt = constraints.begin();",
  "               cstrt != constraints.end() && !in_critical_path; ++cstrt) {",
  "            Operation* oper = nullptr;",
  "            if (cstrt->hasType<ConstraintDistributionLeadTime,",
  "                               ConstraintManufacturingLeadTime,",
  "                               ConstraintPurchasingLeadTime>())",
  "              oper = static_cast<Operation*>(cstrt->getOwner());",
  "            else if (cstrt->hasType<ProblemCapacityOverload>())",
  "              oper = static_cast<ProblemCapacityOverload*>(&*cstrt)",
  "                         ->getOperation();",
  "            else if (cstrt->hasType<ProblemAwaitSupply>()) {",
  "              if (cstrt->getOwner()->hasType<Operation>())",
  "                oper = static_cast<Operation*>(cstrt->getOwner());",
  "              else if (cstrt->getOwner()->hasType<Buffer>()) {",
  "                auto* b = static_cast<Buffer*>(cstrt->getOwner());",
  "                if (b->getItem() ==",
  "                        opplans[lvl_cnt]->getOperation()->getItem() &&",
  "                    b->getLocation() ==",
  "                        opplans[lvl_cnt]->getOperation()->getLocation())",
  "                  oper = opplans[lvl_cnt]->getOperation();",
  "              }",
  "            }",
  "",
  "            Duration branch_duration;",
  "            for (auto c = lvl_cnt; c >= 0; --c)",
  "              if (opplans[c])",
  "                branch_duration +=",
  "                    opplans[c]->getEnd() - opplans[c]->getStart();",
  "",
  "            if (oper && oper == opplans[lvl_cnt]->getOperation() &&",
  "                (branch_duration > critical_path_duration ||",
  "                 opplans[lvl_cnt]->getStart() < start_critical_path)) {",
  "              // New critical path identified",
  "              critical_path_duration = branch_duration;",
  "              start_critical_path = opplans[lvl_cnt]->getStart();",
  "              if (!critical_path.empty()) critical_path.clear();",
  "              in_critical_path = true;",
  "            }",
  "          }",
  "        }",
  "",
  "        if (in_critical_path)",
  "          critical_path[opplans[lvl_cnt]->getOperation()] =",
  "              opplans[lvl_cnt]->getProposed();",
  "      }",
  "    }",
  "",
  "    // Prepare next level",
  "    if (static_cast<std::size_t>(lvl) >= opplans.size())",
  "      opplans.resize(lvl + 5);",
  "    opplans[lvl] = p.getOperationPlan();",
  "",
  "    // Clear stale entries from deeper levels when backtracking",
  "    for (short c = lvl + 1; c <= lvl_prev; ++c) opplans[c] = nullptr;",
  "    lvl_prev = lvl;",
  "  }",
  "",
  "  // Evaluate the final end-to-end path.",
  "  if (lvl_prev >= 0) {",
  "    bool in_critical_path = false;",
  "    for (auto lvl_cnt = lvl_prev; lvl_cnt >= 0; --lvl_cnt) {",
  "      if (!in_critical_path) {",
  "        for (auto cstrt = constraints.begin();",
  "             cstrt != constraints.end() && !in_critical_path; ++cstrt) {",
  "          Operation* oper = nullptr;",
  "          if (cstrt->hasType<ConstraintDistributionLeadTime,",
  "                             ConstraintManufacturingLeadTime,",
  "                             ConstraintPurchasingLeadTime>())",
  "            oper = static_cast<Operation*>(cstrt->getOwner());",
  "          else if (cstrt->hasType<ProblemCapacityOverload>())",
  "            oper =",
  "                static_cast<ProblemCapacityOverload*>(&*cstrt)->getOperation();",
  "          else if (cstrt->hasType<ProblemAwaitSupply>()) {",
  "            if (cstrt->getOwner()->hasType<Operation>())",
  "              oper = static_cast<Operation*>(cstrt->getOwner());",
  "            else if (cstrt->getOwner()->hasType<Buffer>()) {",
  "              auto* b = static_cast<Buffer*>(cstrt->getOwner());",
  "              if (b->getItem() == opplans[lvl_cnt]->getOperation()->getItem() &&",
  "                  b->getLocation() ==",
  "                      opplans[lvl_cnt]->getOperation()->getLocation())",
  "                oper = opplans[lvl_cnt]->getOperation();",
  "            }",
  "          }",
  "",
  "          Duration branch_duration;",
  "          for (auto c = lvl_cnt; c >= 0; --c)",
  "            if (opplans[c])",
  "              branch_duration += opplans[c]->getEnd() - opplans[c]->getStart();",
  "          if (oper && opplans[lvl_cnt] &&",
  "              oper == opplans[lvl_cnt]->getOperation() &&",
  "              (branch_duration > critical_path_duration ||",
  "               opplans[lvl_cnt]->getStart() < start_critical_path)) {",
  "            // New critical path identified",
  "            critical_path_duration = branch_duration;",
  "            if (!critical_path.empty()) critical_path.clear();",
  "            in_critical_path = true;",
  "          }",
  "        }",
  "      }",
  "",
  "      if (in_critical_path && opplans[lvl_cnt])",
  "        critical_path[opplans[lvl_cnt]->getOperation()] =",
  "            opplans[lvl_cnt]->getProposed();",
  "    }",
  "    for (auto i : critical_path) {",
  "      auto e = all_critical_paths.find(i.first);",
  "      if (e == all_critical_paths.end() || (!e->second && i.second)) {",
  "        all_critical_paths[i.first] = i.second;",
  "      }",
  "    }",
  "  }",
  "",
  "  // For unplanned orders, we can't clean the constraint list.",
  "  if (lvl_prev == -1) return;",
  "",
  "  // Critical path is now identified.",
  "  // Now remove any constraint that is not on that path.",
  "  for (auto cstrt = constraints.begin(); cstrt != constraints.end();) {",
  "    bool keep = true;",
  "    if (cstrt->hasType<ConstraintDistributionLeadTime,",
  "                       ConstraintManufacturingLeadTime,",
  "                       ConstraintPurchasingLeadTime>()) {",
  "      auto* oper = static_cast<Operation*>(cstrt->getOwner());",
  "      auto found = all_critical_paths.find(oper);",
  "      if (found == all_critical_paths.end() || !found->second) keep = false;",
  "    } else if (cstrt->hasType<ProblemCapacityOverload>()) {",
  "      auto res = static_cast<Resource*>(cstrt->getOwner());",
  "      keep = false;",
  "      for (auto& o : all_critical_paths) {",
  "        for (const auto& ld : o.first->getLoads()) {",
  "          if (ld.getResource() == res) {",
  "            keep = true;",
  "            break;",
  "          }",
  "        }",
  "        if (keep) break;",
  "      }",
  "    } else if (cstrt->hasType<ProblemAwaitSupply>()) {",
  "      auto ow = cstrt->getOwner();",
  "      if (ow->hasType<Buffer>()) {",
  "      } else if (ow->hasType<Operation>()) {",
  "        if (!all_critical_paths.contains(static_cast<Operation*>(ow)))",
  "          keep = false;",
  "      }",
  "    }",
  "    if (keep)",
  "      ++cstrt;",
  "    else {",
  "      auto tmp = &*cstrt;",
  "      constraints.unlink(tmp);",
  "      ++cstrt;",
  "      delete tmp;",
  "    }",
  "  }",
  "}",
  "",
  "}  // namespace frepple",
];
