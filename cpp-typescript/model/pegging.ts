// <header-api-generated>
import { Duration } from "../utils/date.js";
import { HeaderModelAdapter } from "../utils/library.js";
import type { Demand } from "./demand.js";
import type { OperationPlan } from "./operationplan.js";

const ROUNDING_ERROR = 0.000001;

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function iterable(value: unknown): readonly unknown[] {
  return value && typeof value === "object" && typeof (value as Iterable<unknown>)[Symbol.iterator] === "function"
    ? [...value as Iterable<unknown>] : [];
}

function duration(value: unknown): Duration {
  return value instanceof Duration ? new Duration(value) : new Duration(Number(value ?? 0));
}

function operationKind(plan: OperationPlan | null): string {
  return String(call(call(plan, "getOperation"), "getType") ?? call(call(plan, "getOperation"), "constructor") ?? "");
}

/** Immutable row returned while walking a pegging iterator. */
export class PeggingIteratorState extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["PeggingIterator::state"] as const;

  constructor(
    private readonly operationPlan: OperationPlan | null = null,
    private readonly quantity = 0,
    private readonly offset = 0,
    private readonly level = 0,
    private readonly gap = new Duration(),
  ) { super(); }

  getOperationPlan(): OperationPlan | null { return this.operationPlan; }
  getQuantity(): number { return this.quantity; }
  getOffset(): number { return this.offset; }
  getLevel(): number { return this.level; }
  getGap(): Duration { return new Duration(this.gap); }
}

/**
 * Executable adaptation of frePPLe's material pegging traversal.
 *
 * The C++ class keeps a mutable DFS stack. TypeScript materializes immutable
 * rows eagerly, which makes normal JavaScript iteration deterministic while
 * preserving quantities, offsets, levels, gaps and public cursor methods.
 */
export class PeggingIterator extends HeaderModelAdapter implements Iterable<PeggingIteratorState> {
  static readonly cppBases = ["NonCopyable", "Object"] as const;
  static readonly cppQualifiedNames = ["PeggingIterator"] as const;
  private readonly states: PeggingIteratorState[] = [];
  private readonly pending: PeggingIteratorState[] = [];
  private readonly queued = new Set<string>();
  private readonly dependencyVisited = new Set<OperationPlan>();
  private cursor = -1;
  private traversing = false;
  private downstream = true;
  private maxlevel = -1;

  constructor(source?: Demand | OperationPlan | HeaderModelAdapter | null, downstreamOrMaxLevel: boolean | number = true,
    maxLevel = -1) {
    super();
    if (!source) return;

    const isDemand = typeof call(source, "getDelivery") !== "undefined" && typeof call(source, "getTopOwner") === "undefined";
    if (isDemand) {
      this.downstream = false;
      this.maxlevel = typeof downstreamOrMaxLevel === "number" ? Math.trunc(downstreamOrMaxLevel) : -1;
      for (const delivery of iterable(call(source, "getDelivery"))) {
        const top = call(delivery, "getTopOwner") as OperationPlan | undefined;
        if (top) this.updateStack(top, Number(call(top, "getQuantity") ?? 0), 0, 0, new Duration());
      }
      this.materialize(true);
      return;
    }

    this.downstream = typeof downstreamOrMaxLevel === "boolean" ? downstreamOrMaxLevel : true;
    this.maxlevel = typeof downstreamOrMaxLevel === "number" ? Math.trunc(downstreamOrMaxLevel) : Math.trunc(maxLevel);
    const directPlan = typeof call(source, "getTopOwner") !== "undefined"
      ? source as unknown as OperationPlan
      : call(source, "getOperationPlan") as OperationPlan | null;
    if (!directPlan) return;
    const top = call(directPlan, "getTopOwner") as OperationPlan | null;
    const initial = this.maxlevel > 0 || operationKind(top).includes("split") ? directPlan : top ?? directPlan;
    this.updateStack(initial, Number(call(directPlan, "getQuantity") ?? 0), 0, 0, new Duration());
    this.materialize(false);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  getType(): string { return "pegging"; }
  isDownstream(): boolean { return this.downstream; }
  getMaxLevel(): number { return this.maxlevel; }
  getOperationPlan(): OperationPlan | null { return this.current()?.getOperationPlan() ?? null; }
  getQuantity(): number { return this.current()?.getQuantity() ?? 0; }
  getOffset(): number { return this.current()?.getOffset() ?? 0; }
  getLevel(): number { return this.current()?.getLevel() ?? 0; }
  getGap(): Duration { return this.current()?.getGap() ?? new Duration(); }

  next(): PeggingIterator | null {
    this.cursor += 1;
    return this.cursor < this.states.length ? this : null;
  }
  iternext(): PeggingIterator | null { return this.next(); }
  override [Symbol.iterator](): Iterator<PeggingIteratorState> { return this.states[Symbol.iterator](); }

  /** Public callback used by Buffer.followPegging. */
  updateStack(operationPlan: OperationPlan | null, quantity: number, offset: number, level: number,
    gap: Duration | number = new Duration()): void {
    if (!operationPlan || quantity < ROUNDING_ERROR) return;
    const reference = String(call(operationPlan, "getReference") ?? "");
    const key = `${reference || operationPlan.constructor.name}:${quantity.toPrecision(12)}:${offset.toPrecision(12)}:${level}`;
    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.pending.push(new PeggingIteratorState(operationPlan, quantity, offset, level, duration(gap)));
  }

  /** Compatibility hook for adapters that delegate material matching here. */
  follow(flowPlan: HeaderModelAdapter, quantity: number, offset: number, level: number): void {
    const buffer = call(flowPlan, "getBuffer");
    call(buffer, "followPegging", this, flowPlan, quantity, offset, level);
  }

  updateStackFromState(state: PeggingIteratorState): void {
    this.updateStack(state.getOperationPlan(), state.getQuantity(), state.getOffset(), state.getLevel(), state.getGap());
  }

  private current(): PeggingIteratorState | null {
    return this.states[this.cursor < 0 ? 0 : this.cursor] ?? null;
  }

  private materialize(mergeDuplicates: boolean): void {
    if (this.traversing) return;
    this.traversing = true;
    while (this.pending.length) {
      const state = this.pending.pop();
      if (!state) continue;
      this.states.push(state);
      this.followPegging(state.getOperationPlan(), state.getQuantity(), state.getOffset(), state.getLevel());
    }
    this.traversing = false;
    if (!mergeDuplicates) return;

    const merged = new Map<OperationPlan, PeggingIteratorState>();
    for (const state of this.states) {
      const plan = state.getOperationPlan();
      if (!plan) continue;
      const previous = merged.get(plan);
      merged.set(plan, previous
        ? new PeggingIteratorState(plan, previous.getQuantity() + state.getQuantity(),
          Math.min(previous.getOffset(), state.getOffset()), Math.min(previous.getLevel(), state.getLevel()), previous.getGap())
        : state);
    }
    this.states.splice(0, this.states.length, ...[...merged.values()].sort((left, right) => {
      const leftStart = Number(call(call(left.getOperationPlan(), "getStart"), "getTicks") ?? 0);
      const rightStart = Number(call(call(right.getOperationPlan(), "getStart"), "getTicks") ?? 0);
      return rightStart - leftStart;
    }));
  }

  private followPegging(operationPlan: OperationPlan | null, quantity: number, offset: number, level: number): void {
    if (!operationPlan || Number(call(operationPlan, "getQuantity") ?? 0) === 0) return;
    const hidden = Boolean(call(call(operationPlan, "getOperation"), "getHidden"));
    if (this.maxlevel !== -1 && level > this.maxlevel && !hidden) return;

    for (const flowPlan of iterable(call(operationPlan, "getFlowPlans"))) {
      const flowQuantity = Number(call(flowPlan, "getQuantity") ?? 0);
      if ((this.downstream && flowQuantity > ROUNDING_ERROR) || (!this.downstream && flowQuantity < -ROUNDING_ERROR)) {
        call(call(flowPlan, "getBuffer"), "followPegging", this, flowPlan, quantity, offset, level + 1);
      }
    }

    const planQuantity = Number(call(operationPlan, "getQuantity") ?? 0);
    const addRelative = (candidate: OperationPlan | null): void => {
      if (!candidate || !planQuantity) return;
      const ratio = Number(call(candidate, "getQuantity") ?? 0) / planQuantity;
      this.updateStack(candidate, quantity * ratio, offset * ratio, level + 1, new Duration());
    };
    const children = iterable(call(operationPlan, "getSubOperationPlans")) as OperationPlan[];
    const operationType = operationKind(operationPlan);
    if (this.maxlevel > 0) {
      if (level <= this.maxlevel - 1 || hidden) {
        if (operationType.includes("routing")) addRelative(this.downstream ? children[0] ?? null : children.at(-1) ?? null);
        const owner = call(operationPlan, "getOwner") as OperationPlan | null;
        if (owner && operationKind(owner).includes("routing")) {
          addRelative(call(operationPlan, this.downstream ? "getNextSubOpplan" : "getPrevSubOpplan") as OperationPlan | null);
        }
      }
    } else {
      for (const child of children) addRelative(child);
    }

    for (const dependency of iterable(call(operationPlan, "getDependencies"))) {
      const first = call(dependency, "getFirst") as OperationPlan | null;
      const second = call(dependency, "getSecond") as OperationPlan | null;
      const candidate = this.downstream && first === operationPlan ? second
        : !this.downstream && second === operationPlan ? first : null;
      if (!candidate || this.dependencyVisited.has(candidate) || (this.maxlevel !== -1 && level >= this.maxlevel)) continue;
      this.dependencyVisited.add(candidate);
      addRelative(candidate);
    }
  }
}

/** Aggregates downstream pegging intervals by demand. */
export class PeggingDemandIterator extends HeaderModelAdapter implements Iterable<PeggingDemandIterator> {
  static readonly cppBases = ["NonCopyable", "Object"] as const;
  static readonly cppQualifiedNames = ["PeggingDemandIterator"] as const;
  private readonly demands: readonly [Demand, number][];
  private cursor = -1;

  constructor(operationPlan: OperationPlan | null = null) {
    super();
    const intervals = new Map<Demand, Map<OperationPlan, [number, number][]>>();
    if (operationPlan) {
      for (const state of new PeggingIterator(operationPlan, true, -1)) {
        const plan = state.getOperationPlan();
        const top = call(plan, "getTopOwner") as OperationPlan | null;
        if (!plan || plan !== top) continue;
        const demand = call(top, "getDemand") as Demand | null;
        if (!demand || state.getQuantity() <= ROUNDING_ERROR) continue;
        const byPlan = intervals.get(demand) ?? new Map<OperationPlan, [number, number][]>();
        const values = byPlan.get(top) ?? [];
        values.push([state.getOffset(), state.getOffset() + state.getQuantity()]);
        byPlan.set(top, values);
        intervals.set(demand, byPlan);
      }
    }
    this.demands = [...intervals].map(([demand, plans]) =>
      [demand, [...plans.values()].reduce((sum, values) => sum + this.sumOfIntervals(values), 0)] as [Demand, number]);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  getType(): string { return "demandpegging"; }
  getDemand(): Demand | null { return this.demands[this.cursor < 0 ? 0 : this.cursor]?.[0] ?? null; }
  getQuantity(): number { return this.demands[this.cursor < 0 ? 0 : this.cursor]?.[1] ?? 0; }
  next(): PeggingDemandIterator | null { this.cursor += 1; return this.cursor < this.demands.length ? this : null; }
  iternext(): PeggingDemandIterator | null { return this.next(); }
  override *[Symbol.iterator](): Iterator<PeggingDemandIterator> {
    for (let index = 0; index < this.demands.length; index += 1) {
      this.cursor = index;
      yield this;
    }
  }

  sumOfIntervals(intervals: readonly [number, number][]): number {
    if (!intervals.length) return 0;
    const sorted = [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    let start = sorted[0]?.[0] ?? 0;
    let end = sorted[0]?.[1] ?? start;
    let total = 0;
    for (const interval of sorted.slice(1)) {
      if (interval[0] <= end) end = Math.max(end, interval[1]);
      else { total += end - start; [start, end] = interval; }
    }
    return total + end - start;
  }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/pegging.cpp.
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
  { name: "PeggingIterator::initialize", sourceLine: 35, status: "adapted" },
  { name: "PeggingDemandIterator::initialize", sourceLine: 51, status: "adapted" },
  { name: "PeggingIterator::PeggingIterator", sourceLine: 79, status: "adapted" },
  { name: "PeggingIterator::PeggingIterator", sourceLine: 124, status: "adapted" },
  { name: "PeggingIterator::PeggingIterator", sourceLine: 143, status: "adapted" },
  { name: "PeggingIterator::PeggingIterator", sourceLine: 161, status: "adapted" },
  { name: "PeggingIterator::followPegging", sourceLine: 233, status: "adapted" },
  { name: "PeggingIterator::next", sourceLine: 344, status: "adapted" },
  { name: "PeggingIterator::updateStack", sourceLine: 357, status: "adapted" },
  { name: "PeggingDemandIterator::PeggingDemandIterator", sourceLine: 383, status: "adapted" },
  { name: "PeggingDemandIterator::next", sourceLine: 413, status: "adapted" },
  { name: "PeggingDemandIterator::sumOfIntervals", sourceLine: 423, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface PeggingDemandIteratorPort {
  PeggingDemandIterator(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  next(...args: readonly PortValue[]): PortValue | void;
  sumOfIntervals(...args: readonly PortValue[]): PortValue | void;
}

export interface PeggingIteratorPort {
  PeggingIterator(...args: readonly PortValue[]): PortValue | void;
  followPegging(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  next(...args: readonly PortValue[]): PortValue | void;
  updateStack(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/pegging.cpp";
export const targetFile = "model/pegging.ts";

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
  "const MetaCategory* PeggingIterator::metadata;",
  "const MetaCategory* PeggingDemandIterator::metadata;",
  "",
  "thread_local MemoryPool<PeggingIterator::state> PeggingIterator::peggingpool;",
  "",
  "int PeggingIterator::initialize() {",
  "  // Initialize the pegging metadata",
  "  PeggingIterator::metadata =",
  "      MetaCategory::registerCategory<PeggingIterator>(\"pegging\", \"peggings\");",
  "  registerFields<PeggingIterator>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python type",
  "  auto& x = PythonExtension<PeggingIterator>::getPythonType();",
  "  x.setName(\"peggingIterator\");",
  "  x.setDoc(\"frePPLe iterator for operationplan pegging\");",
  "  x.supportgetattro();",
  "  x.supportiter();",
  "  PeggingIterator::metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "int PeggingDemandIterator::initialize() {",
  "  // Initialize the pegging metadata",
  "  PeggingDemandIterator::metadata =",
  "      MetaCategory::registerCategory<PeggingDemandIterator>(\"demandpegging\",",
  "                                                            \"demandpeggings\");",
  "  registerFields<PeggingDemandIterator>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python type",
  "  auto& x = PythonExtension<PeggingDemandIterator>::getPythonType();",
  "  x.setName(\"peggingDemandIterator\");",
  "  x.setDoc(\"frePPLe iterator for demand pegging\");",
  "  x.supportgetattro();",
  "  x.supportiter();",
  "  PeggingDemandIterator::metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "PeggingIterator& PeggingIterator::operator=(const PeggingIterator& c) {",
  "  downstream = c.downstream;",
  "  firstIteration = c.firstIteration;",
  "  first = c.first;",
  "  second_pass = c.second_pass;",
  "  maxlevel = c.maxlevel;",
  "  states = c.states;",
  "  states_sorted = c.states_sorted;",
  "  return *this;",
  "}",
  "",
  "PeggingIterator::PeggingIterator(const Demand* d, short maxLvl)",
  "    : states(PeggingIterator::peggingpool),",
  "      states_sorted(PeggingIterator::peggingpool),",
  "      first(false),",
  "      downstream(false),",
  "      firstIteration(true),",
  "      second_pass(false),",
  "      maxlevel(maxLvl) {",
  "  initType(metadata);",
  "  const Demand::OperationPlanList& deli = d->getDelivery();",
  "  for (auto opplaniter : deli) {",
  "    OperationPlan* t = opplaniter->getTopOwner();",
  "    updateStack(t, t->getQuantity(), 0.0, 0, 0L);",
  "  }",
  "",
  "  // Bring all pegging information to a second stack.",
  "  // Only in this way can we avoid that the same operationplan is returned",
  "  // multiple times",
  "  while (operator bool()) {",
  "    /* Check if already found in the vector. */",
  "    bool found = false;",
  "    state& curtop = states.back();",
  "    for (auto it = states_sorted.begin(); it != states_sorted.end() && !found;",
  "         ++it)",
  "      if (it->opplan == curtop.opplan) {",
  "        // Update existing element in sorted stack",
  "        it->quantity += curtop.quantity;",
  "        if (it->level > curtop.level) it->level = curtop.level;",
  "        found = true;",
  "      }",
  "    if (!found)",
  "      // New element in sorted stack",
  "      states_sorted.insert(curtop.opplan, curtop.quantity, curtop.offset,",
  "                           curtop.level, curtop.gap);",
  "",
  "    if (downstream)",
  "      ++*this;",
  "    else",
  "      --*this;",
  "  }",
  "",
  "  // The normal iteration will use the sorted results",
  "  second_pass = true;",
  "}",
  "",
  "PeggingIterator::PeggingIterator(const OperationPlan* opplan, bool b,",
  "                                 short maxlevel)",
  "    : states(PeggingIterator::peggingpool),",
  "      states_sorted(PeggingIterator::peggingpool),",
  "      first(false),",
  "      downstream(b),",
  "      firstIteration(true),",
  "      second_pass(false),",
  "      maxlevel(maxlevel) {",
  "  initType(metadata);",
  "  if (!opplan) return;",
  "  if (opplan->getTopOwner()->getOperation()->hasType<OperationSplit>() ||",
  "      maxlevel > 0)",
  "    updateStack(opplan, opplan->getQuantity(), 0.0, 0, 0L);",
  "  else",
  "    updateStack(opplan->getTopOwner(), opplan->getTopOwner()->getQuantity(),",
  "                0.0, 0, 0L);",
  "}",
  "",
  "PeggingIterator::PeggingIterator(const FlowPlan* fp, bool b)",
  "    : states(PeggingIterator::peggingpool),",
  "      states_sorted(PeggingIterator::peggingpool),",
  "      first(false),",
  "      downstream(b),",
  "      firstIteration(true),",
  "      second_pass(false),",
  "      maxlevel(-1) {",
  "  initType(metadata);",
  "  if (!fp) return;",
  "  if (maxlevel > 0)",
  "    updateStack(fp->getOperationPlan(), fp->getOperationPlan()->getQuantity(),",
  "                0.0, 0, 0L);",
  "  else",
  "    updateStack(fp->getOperationPlan()->getTopOwner(),",
  "                fp->getOperationPlan()->getQuantity(), 0.0, 0, 0L);",
  "}",
  "",
  "PeggingIterator::PeggingIterator(LoadPlan* lp, bool b)",
  "    : states(PeggingIterator::peggingpool),",
  "      states_sorted(PeggingIterator::peggingpool),",
  "      first(false),",
  "      downstream(b),",
  "      firstIteration(true),",
  "      second_pass(false),",
  "      maxlevel(-1) {",
  "  initType(metadata);",
  "  if (!lp) return;",
  "  if (maxlevel > 0)",
  "    updateStack(lp->getOperationPlan(), lp->getOperationPlan()->getQuantity(),",
  "                0.0, 0, 0L);",
  "  else",
  "    updateStack(lp->getOperationPlan()->getTopOwner(),",
  "                lp->getOperationPlan()->getQuantity(), 0.0, 0, 0L);",
  "}",
  "",
  "PeggingIterator& PeggingIterator::operator--() {",
  "  // Second pass",
  "  if (second_pass) {",
  "    states_sorted.pop_front();",
  "    return *this;",
  "  }",
  "",
  "  // Validate",
  "  if (states.empty())",
  "    throw LogicException(\"Incrementing the iterator beyond it's end\");",
  "  if (downstream) throw LogicException(\"Decrementing a downstream iterator\");",
  "",
  "  // Mark the top entry in the stack as invalid, so it can be reused.",
  "  first = true;",
  "",
  "  // Find other operationplans to add to the stack",
  "  state& t = states.back();  // Copy the top element",
  "  followPegging(t.opplan, t.quantity, t.offset, t.level);",
  "",
  "  // Pop invalid top entry from the stack.",
  "  // This will happen if we didn't find an operationplan to replace the",
  "  // top entry.",
  "  if (first) states.pop_back();",
  "",
  "  return *this;",
  "}",
  "",
  "PeggingIterator& PeggingIterator::operator++() {",
  "  // Second pass",
  "  if (second_pass) {",
  "    states_sorted.pop_front();",
  "    return *this;",
  "  }",
  "",
  "  // Validate",
  "  if (states.empty())",
  "    throw LogicException(\"Incrementing the iterator beyond it's end\");",
  "  if (!downstream) throw LogicException(\"Incrementing an upstream iterator\");",
  "",
  "  // Mark the top entry in the stack as invalid, so it can be reused.",
  "  first = true;",
  "",
  "  // Find other operationplans to add to the stack",
  "  state& t = states.back();  // Copy the top element",
  "  followPegging(t.opplan, t.quantity, t.offset, t.level);",
  "",
  "  // Pop invalid top entry from the stack.",
  "  // This will happen if we didn't find an operationplan to replace the",
  "  // top entry.",
  "  if (first) states.pop_back();",
  "",
  "  return *this;",
  "}",
  "",
  "void PeggingIterator::followPegging(const OperationPlan* op, double qty,",
  "                                    double offset, short lvl) {",
  "  // Zero quantity operationplans don't have further pegging",
  "  if (op->getQuantity() == 0.0) return;",
  "",
  "  // Did we reach the maximum depth we want to visit",
  "  // If the operation is hidden, we allow one more level",
  "  if (maxlevel != -1 && lvl > maxlevel && !op->getOperation()->getHidden())",
  "    return;",
  "",
  "  // For each flowplan ask the buffer to find the pegged operationplans.",
  "  if (downstream)",
  "    for (auto i = op->beginFlowPlans(); i != op->endFlowPlans(); ++i) {",
  "      if (i->getQuantity() > ROUNDING_ERROR)  // Producing flowplan",
  "        i->getFlow()->getBuffer()->followPegging(*this, &*i, qty, offset,",
  "                                                 static_cast<short>(lvl + 1));",
  "    }",
  "  else",
  "    for (auto i = op->beginFlowPlans(); i != op->endFlowPlans(); ++i) {",
  "      if (i->getQuantity() < -ROUNDING_ERROR)  // Consuming flowplan",
  "        i->getFlow()->getBuffer()->followPegging(*this, &*i, qty, offset,",
  "                                                 static_cast<short>(lvl + 1));",
  "    }",
  "",
  "  // Push child operationplans on the stack.",
  "  // The pegged quantity is equal to the ratio of the quantities of the",
  "  // parent and child operationplan.",
  "",
  "  if (maxlevel > 0) {",
  "    if (lvl <= maxlevel - 1 || op->getOperation()->getHidden()) {",
  "      // DOWNSTREAM",
  "      if (downstream) {",
  "        // In downstream, a routing operation will send its first step",
  "        if (op->getOperation()->hasType<OperationRouting>()) {",
  "          for (OperationPlan::iterator j(op); j != OperationPlan::end(); ++j) {",
  "            updateStack(&*j, qty * j->getQuantity() / op->getQuantity(),",
  "                        offset * j->getQuantity() / op->getQuantity(),",
  "                        static_cast<short>(lvl + 1),",
  "                        0L);",
  "            break;",
  "          }",
  "        }",
  "",
  "        // In downstream, a routing suboperation will send the next suboperation",
  "        if (op->getOwner() &&",
  "            op->getOwner()->getOperation()->hasType<OperationRouting>() &&",
  "            op->getNextSubOpplan()) {",
  "          updateStack(",
  "              op->getNextSubOpplan(),",
  "              qty * op->getNextSubOpplan()->getQuantity() / op->getQuantity(),",
  "              offset * op->getNextSubOpplan()->getQuantity() /",
  "                  op->getQuantity(),",
  "              static_cast<short>(lvl + 1), 0L);",
  "        }",
  "      } else {",
  "        // UPSTREAM",
  "        // In upstream, a routing operation will send its last step",
  "        if (op->getOperation()->hasType<OperationRouting>()) {",
  "          OperationPlan* opplan_last = nullptr;",
  "          for (OperationPlan::iterator j(op); j != OperationPlan::end(); ++j) {",
  "            opplan_last = &*j;",
  "          }",
  "          if (opplan_last)",
  "            updateStack(opplan_last,",
  "                        qty * opplan_last->getQuantity() / op->getQuantity(),",
  "                        offset * opplan_last->getQuantity() / op->getQuantity(),",
  "                        static_cast<short>(lvl + 1), 0L);",
  "        }",
  "",
  "        // In upstream, a routing suboperation will send the previous",
  "        // suboperation",
  "        if (op->getOwner() &&",
  "            op->getOwner()->getOperation()->hasType<OperationRouting>() &&",
  "            op->getPrevSubOpplan()) {",
  "          updateStack(",
  "              op->getPrevSubOpplan(),",
  "              qty * op->getPrevSubOpplan()->getQuantity() / op->getQuantity(),",
  "              offset * op->getPrevSubOpplan()->getQuantity() /",
  "                  op->getQuantity(),",
  "              static_cast<short>(lvl + 1), 0L);",
  "        }",
  "      }",
  "    }",
  "  } else {",
  "    for (OperationPlan::iterator j(op); j != OperationPlan::end(); ++j) {",
  "      updateStack(&*j, qty * j->getQuantity() / op->getQuantity(),",
  "                  offset * j->getQuantity() / op->getQuantity(),",
  "                  static_cast<short>(lvl + 1), 0L);",
  "    }",
  "  }",
  "",
  "  // Push dependencies on the stack.",
  "  for (auto d : op->getDependencies()) {",
  "    auto o = downstream ? d->getSecond() : d->getFirst();",
  "    auto exists = visited.find(o);",
  "    if (exists != visited.end()) continue;",
  "    visited.insert(o);",
  "    if (downstream && d->getFirst() == op && (maxlevel == -1 || lvl < maxlevel))",
  "      updateStack(d->getSecond(),",
  "                  qty * d->getSecond()->getQuantity() / op->getQuantity(),",
  "                  offset * d->getSecond()->getQuantity() / op->getQuantity(),",
  "                  static_cast<short>(lvl + 1), 0L);",
  "    else if (!downstream && d->getSecond() == op &&",
  "             (maxlevel == -1 || lvl < maxlevel))",
  "      updateStack(d->getFirst(),",
  "                  qty * d->getFirst()->getQuantity() / op->getQuantity(),",
  "                  offset * d->getFirst()->getQuantity() / op->getQuantity(),",
  "                  static_cast<short>(lvl + 1), 0L);",
  "  }",
  "}",
  "",
  "PeggingIterator* PeggingIterator::next() {",
  "  if (firstIteration)",
  "    firstIteration = false;",
  "  else if (downstream)",
  "    ++*this;",
  "  else",
  "    --*this;",
  "  if (!operator bool())",
  "    return nullptr;",
  "  else",
  "    return this;",
  "}",
  "",
  "void PeggingIterator::updateStack(const OperationPlan* op, double qty, double o,",
  "                                  short lvl, Duration gap) {",
  "  // Avoid very small pegging quantities",
  "  if (qty < ROUNDING_ERROR) return;",
  "",
  "  // Check for loops in the pegging",
  "  for (auto& state : states) {",
  "    if (state.opplan == op && abs(state.quantity - qty) < ROUNDING_ERROR &&",
  "        abs(state.offset - o) < ROUNDING_ERROR)  // We've been here before...",
  "      return;",
  "  }",
  "",
  "  if (first) {",
  "    // Update the current top element of the stack",
  "    state& t = states.back();",
  "    t.opplan = op;",
  "    t.quantity = qty;",
  "    t.offset = o;",
  "    t.level = lvl;",
  "    t.gap = gap;",
  "    first = false;",
  "  } else",
  "    // We need to create a new element on the stack",
  "    states.insert(op, qty, o, lvl, gap);",
  "}",
  "",
  "PeggingDemandIterator::PeggingDemandIterator(const OperationPlan* opplan) {",
  "  initType(metadata);",
  "",
  "  // a map to track the demands pegged to that opplan",
  "  // for every demand we are also tracking the different delivery orders",
  "  // in another map with the pegged offet and qty from that delivery order",
  "  map<Demand*, map<const OperationPlan*, vector<pair<double, double>>>> mapvar;",
  "",
  "  // Walk over all downstream operationplans till demands are found",
  "  for (PeggingIterator p(opplan); p; ++p) {",
  "    const OperationPlan* m = p.getOperationPlan();",
  "    if (!m || (m != m->getTopOwner())) continue;",
  "    Demand* dmd = m->getTopOwner()->getDemand();",
  "    if (dmd && p.getQuantity() > ROUNDING_ERROR)",
  "      mapvar[dmd][m].emplace_back(",
  "          make_pair(p.getOffset(), p.getOffset() + p.getQuantity()));",
  "  }",
  "",
  "  // Iterate over all demands and compute the pegged quantity",
  "  // by excluding overlapping intervals",
  "  for (const auto& it : mapvar) {",
  "    double quantity = 0.0;",
  "    for (auto& it2 : it.second) {",
  "      quantity +=",
  "          sumOfIntervals(const_cast<vector<pair<double, double>>&>(it2.second));",
  "    }",
  "    dmds.insert({it.first, quantity});",
  "  }",
  "}",
  "",
  "PeggingDemandIterator* PeggingDemandIterator::next() {",
  "  if (first) {",
  "    iter = dmds.begin();",
  "    first = false;",
  "  } else",
  "    ++iter;",
  "  if (iter == dmds.end()) return nullptr;",
  "  return this;",
  "}",
  "",
  "double PeggingDemandIterator::sumOfIntervals(",
  "    vector<pair<double, double>>& intervals) {",
  "  if (intervals.empty()) return 0.0;",
  "",
  "  // Sort intervals by their starting point",
  "  sort(intervals.begin(), intervals.end());",
  "",
  "  double totalSum = 0.0;",
  "  double currentStart = intervals[0].first;",
  "  double currentEnd = intervals[0].second;",
  "",
  "  for (size_t i = 1; i < intervals.size(); ++i) {",
  "    double start = intervals[i].first;",
  "    double end = intervals[i].second;",
  "    if (start <= currentEnd) {  // Overlapping intervals",
  "      currentEnd = max(currentEnd, end);",
  "    } else {  // Non-overlapping interval",
  "      totalSum += currentEnd - currentStart;",
  "      currentStart = start;",
  "      currentEnd = end;",
  "    }",
  "  }",
  "",
  "  // Add the last merged interval",
  "  totalSum += currentEnd - currentStart;",
  "",
  "  return totalSum;",
  "}",
  "",
  "}  // namespace frepple",
];
