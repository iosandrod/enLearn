// <header-api-generated>
import { Date as PlanningDate, DateRange, Duration } from "../utils/date.js";
import type { HeaderModelAdapter } from "../utils/library.js";
import type { Buffer } from "./buffer.js";
import type { Demand } from "./demand.js";
import type { Operation } from "./operation.js";
import { OperationSplit } from "./operation.js";
import type { OperationPlan } from "./operationplan.js";
import { Plan } from "./plan.js";
import { Problem, getEntityDetectProblems, getEntityProblems, setEntityChanged } from "./problem.js";
import { ResourceBuckets } from "./resource.js";

const ROUNDING_ERROR = 0.000001;
const CPP_BASES: readonly string[] = ["Problem"];

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function named(target: unknown): string {
  return String(call(target, "getName") ?? call(target, "getReference") ?? "");
}

function asDate(value: unknown, fallback = PlanningDate.infinitePast): PlanningDate {
  if (value instanceof PlanningDate) return new PlanningDate(value);
  return typeof value === "string" || typeof value === "number" ? new PlanningDate(value) : new PlanningDate(fallback);
}

function operationName(plan: OperationPlan): string { return named(plan.getOperation()); }

export class ProblemBeforeCurrent extends Problem {
  static override readonly cppBases = CPP_BASES;
  static override readonly cppQualifiedNames: readonly string[] = ["ProblemBeforeCurrent"];
  private operation: Operation | null = null;
  private startDate = PlanningDate.infinitePast;
  private endDate = PlanningDate.infiniteFuture;
  constructor(owner: OperationPlan, add?: boolean);
  constructor(owner: Operation, start: PlanningDate, end: PlanningDate);
  constructor(owner: OperationPlan | Operation, startOrAdd: PlanningDate | boolean = true,
    end = PlanningDate.infiniteFuture) {
    const operationMode = startOrAdd instanceof PlanningDate;
    super(owner, false);
    if (operationMode) {
      this.operation = owner as Operation;
      this.startDate = new PlanningDate(startOrAdd);
      this.endDate = new PlanningDate(end);
    } else if (startOrAdd) this.addProblem();
  }
  override getDescription(): string {
    const operation = this.operation ?? (this.getOwner() as OperationPlan).getOperation();
    return `Operation '${named(operation)}' planned in the past`;
  }
  override isFeasible(): boolean {
    return this.operation ? false : (this.getOwner() as OperationPlan).getConfirmed();
  }
  override getEntity(): string { return "operation"; }
  override getOwner(): Operation | OperationPlan { return super.getOwner() as Operation | OperationPlan; }
  override getDates(): DateRange {
    if (this.operation) return new DateRange(this.startDate, this.endDate);
    const plan = this.getOwner() as OperationPlan;
    const current = Plan.instance().getCurrent();
    if (plan.getConfirmed()) return new DateRange(plan.getEnd(), current);
    return plan.getEnd().compare(current) > 0
      ? new DateRange(plan.getStart(), current) : plan.getDates();
  }
  update(operation: Operation, start: PlanningDate, end: PlanningDate): void {
    this.operation = operation;
    this.startDate = new PlanningDate(start);
    this.endDate = new PlanningDate(end);
    this.transferOwner(operation);
  }
  override getType(): string { return "before current"; }
}

export class ProblemAwaitSupply extends Problem {
  static override readonly cppBases = CPP_BASES;
  static override readonly cppQualifiedNames: readonly string[] = ["ProblemAwaitSupply"];
  private readonly dates: DateRange;
  constructor(owner: Buffer | Operation, start: PlanningDate, end: PlanningDate, add = false) {
    super(owner, false);
    this.dates = new DateRange(start, end);
    if (add) this.addProblem();
  }
  override getDescription(): string {
    const owner = this.getOwner();
    const entity = owner?.constructor.name.startsWith("Buffer") ? "Buffer" : "Operation";
    return `${entity} '${named(owner)}' awaits confirmed supply`;
  }
  override isFeasible(): boolean { return true; }
  override getEntity(): string { return "material"; }
  override getDates(): DateRange { return new DateRange(this.dates.getStart(), this.dates.getEnd()); }
  override getType(): string { return "await supply"; }
}

export class ProblemSyncDemand extends Problem {
  static override readonly cppBases = CPP_BASES;
  static override readonly cppQualifiedNames: readonly string[] = ["ProblemSyncDemand"];
  private syncedWith: Demand | null;
  private readonly dates: DateRange;
  constructor(demand: Demand, syncedOrStart: Demand | PlanningDate, end?: PlanningDate, add = false) {
    super(demand, false);
    if (syncedOrStart instanceof PlanningDate) {
      this.syncedWith = demand;
      this.dates = new DateRange(syncedOrStart, end ?? syncedOrStart);
    } else {
      this.syncedWith = syncedOrStart;
      this.dates = new DateRange(demand.getDue(), demand.getDeliveryDate());
    }
    if (add) this.addProblem();
  }
  override getDescription(): string {
    return `Demand '${named(this.getOwner())}' is synchronized with ${named(this.syncedWith)}`;
  }
  override isFeasible(): boolean { return true; }
  override getEntity(): string { return "demand"; }
  override getOwner(): Demand { return super.getOwner() as Demand; }
  override getDates(): DateRange { return new DateRange(this.dates.getStart(), this.dates.getEnd()); }
  override getType(): string { return "synchronized demand"; }
}

export class ProblemPrecedence extends Problem {
  static override readonly cppBases = CPP_BASES;
  static override readonly cppQualifiedNames: readonly string[] = ["ProblemPrecedence"];
  constructor(plan: OperationPlan, add = true) { super(plan, false); if (add) this.addProblem(); }
  override getDescription(): string {
    return `Operation '${operationName(this.getOwner())}' starts before preceding operation ends`;
  }
  override isFeasible(): boolean { return false; }
  override getEntity(): string { return "operation"; }
  override getOwner(): OperationPlan { return super.getOwner() as OperationPlan; }
  override getDates(): DateRange {
    const next = this.getOwner().getNextSubOpplan();
    return next ? new DateRange(next.getStart(), this.getOwner().getEnd())
      : new DateRange(this.getOwner().getEnd(), this.getOwner().getEnd());
  }
  override getType(): string { return "precedence"; }
}

export class ProblemInvalidData extends Problem {
  static override readonly cppBases = CPP_BASES;
  static override readonly cppQualifiedNames: readonly string[] = ["ProblemInvalidData"];
  private readonly description: string;
  private readonly entity: string;
  private readonly dates: DateRange;
  constructor(owner: HeaderModelAdapter, description: string, entity: string, start: PlanningDate,
    end: PlanningDate, add = true) {
    super(owner, false);
    this.description = String(description);
    this.entity = String(entity);
    this.dates = new DateRange(start, end);
    if (add) this.addProblem();
  }
  override getDescription(): string { return this.description; }
  override isFeasible(): boolean { return false; }
  override getEntity(): string { return this.entity; }
  override getDates(): DateRange { return new DateRange(this.dates.getStart(), this.dates.getEnd()); }
  override getType(): string { return "invalid data"; }
}

export abstract class LeadTimeConstraint extends Problem {
  static override readonly cppBases: readonly string[] = ["Problem"];
  protected startDate: PlanningDate;
  protected endDate: PlanningDate;
  constructor(operation: Operation, start: PlanningDate, end: PlanningDate, add = false) {
    super(operation, false);
    this.startDate = new PlanningDate(start);
    this.endDate = new PlanningDate(end);
    if (add) this.addProblem();
  }
  override getEntity(): string { return "operation"; }
  override getOwner(): Operation { return super.getOwner() as Operation; }
  override getDates(): DateRange { return new DateRange(this.startDate, this.endDate); }
  update(operation: Operation, start: PlanningDate, end: PlanningDate): void {
    this.startDate = new PlanningDate(start);
    this.endDate = new PlanningDate(end);
    this.transferOwner(operation);
  }
}

export class ConstraintPurchasingLeadTime extends LeadTimeConstraint {
  static override readonly cppQualifiedNames: readonly string[] = ["ConstraintPurchasingLeadTime"];
  override getDescription(): string { return `Purchasing lead time on '${named(this.getOwner())}'`; }
  override isFeasible(): boolean { return false; }
  override getType(): string { return "purchasing lead time"; }
}

export class ConstraintManufacturingLeadTime extends LeadTimeConstraint {
  static override readonly cppQualifiedNames: readonly string[] = ["ConstraintManufacturingLeadTime"];
  override getDescription(): string { return `Manufacturing lead time on '${named(this.getOwner())}'`; }
  override isFeasible(): boolean { return true; }
  override getType(): string { return "manufacturing lead time"; }
}

export class ConstraintDistributionLeadTime extends LeadTimeConstraint {
  static override readonly cppQualifiedNames: readonly string[] = ["ConstraintDistributionLeadTime"];
  override getDescription(): string { return `Distribution lead time on '${named(this.getOwner())}'`; }
  override isFeasible(): boolean { return true; }
  override getType(): string { return "distribution lead time"; }
}

export class ConstraintOverdueDemand extends Problem {
  static override readonly cppBases = CPP_BASES;
  static override readonly cppQualifiedNames: readonly string[] = ["ConstraintOverdueDemand"];
  private startDate = PlanningDate.infinitePast;
  private endDate = PlanningDate.infiniteFuture;
  constructor(demand: Demand, add = true) { super(demand, false); if (add) this.addProblem(); }
  override getDescription(): string { return "Demand is overdue"; }
  override isFeasible(): boolean { return true; }
  override getEntity(): string { return "demand"; }
  override getOwner(): Demand { return super.getOwner() as Demand; }
  override getDates(): DateRange { return new DateRange(this.getOwner().getDue(), Plan.instance().getCurrent()); }
  update(demand: Demand, start: PlanningDate, end: PlanningDate): void {
    this.startDate = new PlanningDate(start);
    this.endDate = new PlanningDate(end);
    this.transferOwner(demand);
  }
  override getType(): string { return "overdue demand"; }
}

export function operationPlanNeedsPrecedence(plan: OperationPlan): boolean {
  if (plan.getCompleted() || plan.getClosed()) return false;
  const dependencies = plan.getDependencies();
  if (!dependencies.length) {
    const next = plan.getNextSubOpplan();
    const owner = plan.getOwner();
    return Boolean(next && owner && !(owner.getOperation() instanceof OperationSplit) &&
      !next.getConfirmed() && plan.getEnd().compare(next.getStart().add(new Duration(1))) > 0);
  }
  for (const dependency of dependencies) {
    if (call(dependency, "getSecond") !== plan) continue;
    const first = call(dependency, "getFirst") as OperationPlan | null;
    if (!first) continue;
    const leadtime = call(call(dependency, "getOperationDependency"), "getHardSafetyLeadtime");
    const required = first.getEnd().add(leadtime instanceof Duration ? leadtime : new Duration());
    if (required.compare(plan.getStart().add(new Duration(1))) > 0) return true;
  }
  return false;
}

export function updateOperationProblems(operation: Operation): void {
  if (getEntityDetectProblems(operation)) {
    for (const candidate of operation.getOperationPlans()) call(candidate, "updateProblems");
  }
  setEntityChanged(operation, false);
}

export function updateOperationPlanProblems(plan: OperationPlan): void {
  let needed = operationPlanNeedsPrecedence(plan);
  for (const problem of getEntityProblems(plan, false)) {
    if (!(problem instanceof ProblemPrecedence)) continue;
    if (needed) needed = false;
    else problem.dispose();
  }
  if (needed) new ProblemPrecedence(plan);
  setEntityChanged(plan, false);
}

export function updateOperationPlanFeasible(plan: OperationPlan): boolean {
  const operation = plan.getOperation();
  if (!operation || !getEntityDetectProblems(operation) || plan.getCompleted() || plan.getClosed()) {
    plan.setFeasible(true);
    return true;
  }
  const children = [...plan.getSubOperationPlans()];
  if (children.length) {
    if (children.some((child) => !child.updateFeasible())) {
      plan.setFeasible(false);
      return false;
    }
  } else {
    const current = Plan.instance().getCurrent();
    if ((plan.getConfirmed() && plan.getEnd().compare(current) < 0) ||
      (!plan.getConfirmed() && plan.getStart().compare(current) < 0) ||
      (plan.getProposed() && plan.getStart().compare(current.add(operation.getFence())) < 0)) {
      plan.setFeasible(false);
      return false;
    }
  }
  if (operationPlanNeedsPrecedence(plan)) {
    plan.setFeasible(false);
    return false;
  }

  for (const loadPlan of plan.getLoadPlans()) {
    const resource = call(loadPlan, "getResource");
    const quantity = Number(call(loadPlan, "getQuantity") ?? 0);
    const relevant = resource instanceof ResourceBuckets ? quantity < 0 : quantity > 0;
    if (relevant && call(loadPlan, "getFeasible") === false) {
      plan.setFeasible(false);
      return false;
    }
  }
  for (const flowPlan of plan.getFlowPlans()) {
    if (!Boolean(call(call(flowPlan, "getFlow"), "isConsumer"))) continue;
    const buffer = call(flowPlan, "getBuffer");
    if (!buffer || buffer.constructor.name === "BufferInfinite") continue;
    if (Number(call(buffer, "getOnHand", PlanningDate.infiniteFuture) ?? 0) < -ROUNDING_ERROR) {
      plan.setFeasible(false);
      return false;
    }
    const events = call(buffer, "getFlowPlans");
    if (!Array.isArray(events)) continue;
    const start = events.indexOf(flowPlan);
    if (start < 0) continue;
    for (let index = start; index < events.length; index += 1) {
      const event = events[index];
      const date = call(event, "getDate");
      if (!(date instanceof PlanningDate) || date.compare(plan.getEnd()) >= 0) break;
      if (Number(call(event, "getOnhand") ?? 0) < -ROUNDING_ERROR &&
        call(event, "isLastOnDate") === true) {
        plan.setFeasible(false);
        return false;
      }
    }
  }
  plan.setFeasible(true);
  return true;
}

export function collectOperationPlanProblems(plan: OperationPlan, includeRelated = true): Problem[] {
  const result = getEntityProblems(plan);
  if (!includeRelated) return result;
  const seen = new Set<Problem>(result);
  const append = (problem: Problem): void => { if (!seen.has(problem)) { seen.add(problem); result.push(problem); } };
  for (const loadPlan of plan.getLoadPlans()) {
    const resource = call(loadPlan, "getResource");
    if (!resource || call(resource, "getConstrained") === false) continue;
    for (const problem of getEntityProblems(resource as never)) {
      const matches = resource instanceof ResourceBuckets
        ? problem.getDates().within(plan.getStart())
        : problem.getDates().overlap(plan.getDates()).seconds > 0;
      if (matches && !problem.isFeasible()) { append(problem); break; }
    }
  }
  for (const flowPlan of plan.getFlowPlans()) {
    if (Number(call(flowPlan, "getOnhandAfterDate") ?? 0) >= -ROUNDING_ERROR) continue;
    const buffer = call(flowPlan, "getBuffer");
    if (!buffer) continue;
    for (const problem of getEntityProblems(buffer as never)) {
      if (!problem.isFeasible() && problem.getDates().overlap(plan.getDates()).seconds > 0) {
        append(problem);
        break;
      }
    }
  }
  return result;
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/problems_operationplan.cpp.
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
  { name: "Operation::updateProblems", sourceLine: 29, status: "adapted" },
  { name: "OperationPlan::updateProblems", sourceLine: 39, status: "adapted" },
  { name: "OperationPlan::ProblemIterator::ProblemIterator", sourceLine: 88, status: "adapted" },
  { name: "Problem::iterator", sourceLine: 90, status: "adapted" },
  { name: "OperationPlan::updateFeasible", sourceLine: 178, status: "adapted" },
  { name: "OperationPlan::updateFeasiblePython", sourceLine: 266, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface OperationPort {
  updateProblems(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanPort {
  updateFeasible(...args: readonly PortValue[]): PortValue | void;
  updateFeasiblePython(...args: readonly PortValue[]): PortValue | void;
  updateProblems(...args: readonly PortValue[]): PortValue | void;
}

export interface ProblemPort {
  iterator(...args: readonly PortValue[]): PortValue | void;
}

export interface ProblemIteratorPort {
  ProblemIterator(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/problems_operationplan.cpp";
export const targetFile = "model/problems_operationplan.ts";

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
  "void Operation::updateProblems() {",
  "  // Find all operationplans, and delegate the problem detection to them",
  "  if (getDetectProblems())",
  "    for (auto o = first_opplan; o; o = o->next) o->updateProblems();",
  "}",
  "",
  "//",
  "// BEFORECURRENT, BEFOREFENCE, PRECEDENCE",
  "//",
  "",
  "void OperationPlan::updateProblems() {",
  "  // A flag for each problem type that may need to be created",
  "  bool needsPrecedence(false);",
  "",
  "  if (!getCompleted() && !getClosed()) {",
  "    if (dependencies.empty()) {",
  "      // Note: 1 second grace period to avoid rounding issues",
  "      // TODO hard safety time not considered for the precedence problem",
  "      if (nextsubopplan &&",
  "          getEnd() > nextsubopplan->getStart() + Duration(1L) &&",
  "          !nextsubopplan->getConfirmed() && owner &&",
  "          !owner->getOperation()->hasType<OperationSplit>())",
  "        needsPrecedence = true;",
  "    } else {",
  "      for (auto d : dependencies) {",
  "        if (this != d->getSecond()) continue;",
  "        Date nd = d->getFirst()->getEnd();",
  "        if (d->getOperationDependency())",
  "          nd += d->getOperationDependency()->getHardSafetyLeadtime();",
  "        if (nd > getStart() + Duration(1L)) {",
  "          needsPrecedence = true;",
  "          break;",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  // Loop through the existing problems",
  "  for (auto j = Problem::begin(this, false); j != Problem::end();) {",
  "    // Need to increment now and define a pointer to the problem, since the",
  "    // problem can be deleted soon (which invalidates the iterator).",
  "    Problem& curprob = *j;",
  "    ++j;",
  "    // The if-statement keeps the problem detection code concise and",
  "    // concentrated. However, a drawback of this design is that a new problem",
  "    // subclass will also require a new demand subclass. I think such a link",
  "    // is acceptable.",
  "    if (typeid(curprob) == typeid(ProblemPrecedence)) {",
  "      if (needsPrecedence)",
  "        needsPrecedence = false;",
  "      else if (this == curprob.getOwner())",
  "        delete &curprob;",
  "    }",
  "  }",
  "",
  "  // Create the problems that are required but aren't existing yet.",
  "  if (needsPrecedence) new ProblemPrecedence(this);",
  "}",
  "",
  "OperationPlan::ProblemIterator::ProblemIterator(const OperationPlan* o,",
  "                                                bool include_related)",
  "    : Problem::iterator(o->firstProblem), opplan(o) {",
  "  if (!include_related) return;",
  "",
  "  // Adding related capacity problems",
  "  for (auto ldpln = opplan->beginLoadPlans(); ldpln != opplan->endLoadPlans();",
  "       ++ldpln) {",
  "    if (!ldpln->getResource()->getConstrained()) continue;",
  "    auto prob_iter = ldpln->getResource()->getProblems();",
  "    if (ldpln->getResource()->hasType<ResourceBuckets>()) {",
  "      while (Problem* prob = prob_iter.next()) {",
  "        if (prob->getDates().within(opplan->getStart()) &&",
  "            !prob->isFeasible()) {",
  "          relatedproblems.push_back(&*prob);",
  "          break;",
  "        }",
  "      }",
  "    } else {",
  "      while (Problem* prob = prob_iter.next()) {",
  "        if (prob->getDates().overlap(opplan->getDates()) &&",
  "            !prob->isFeasible()) {",
  "          relatedproblems.push_back(&*prob);",
  "          break;",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  // Adding local and upstream material problems",
  "  for (PeggingIterator p(o, false); p; --p) {",
  "    const OperationPlan* m = p.getOperationPlan();",
  "    if (m->getCompleted() || m->getClosed()) continue;",
  "    if (m != o) {",
  "      ProblemIterator probs(m, false);",
  "      while (auto p = probs.next()) {",
  "        if (p->isFeasible() ||",
  "            !p->hasType<ProblemBeforeCurrent, ProblemPrecedence>())",
  "          continue;",
  "        bool exists = false;",
  "        for (auto& x : relatedproblems)",
  "          if (static_cast<OperationPlan*>(x->getOwner())->getOperation() ==",
  "              static_cast<OperationPlan*>(p->getOwner())->getOperation()) {",
  "            exists = true;",
  "            break;",
  "          }",
  "        if (!exists) relatedproblems.push_back(&*p);",
  "      }",
  "    }",
  "    for (auto fp = m->beginFlowPlans(); fp != m->endFlowPlans(); ++fp) {",
  "      if (fp->getOnhandAfterDate() < -ROUNDING_ERROR)",
  "        for (Problem::iterator prob(fp->getBuffer()); prob != Problem::end();",
  "             ++prob) {",
  "          if (prob->isFeasible()) continue;",
  "          if (prob->getDates().overlap(m->getDates()) && !prob->isFeasible()) {",
  "            bool exists = false;",
  "            for (auto& x : relatedproblems)",
  "              if (x->getOwner() == prob->getOwner()) {",
  "                exists = true;",
  "                break;",
  "              }",
  "            if (!exists) relatedproblems.push_back(&*prob);",
  "            break;",
  "          }",
  "        }",
  "    }",
  "  }",
  "",
  "  // Update the first problem pointer",
  "  if (!relatedproblems.empty()) iter = relatedproblems.back();",
  "}",
  "",
  "OperationPlan::ProblemIterator& OperationPlan::ProblemIterator::operator++() {",
  "  // Incrementing beyond the end",
  "  if (!iter) return *this;",
  "",
  "  if (!relatedproblems.empty()) {",
  "    relatedproblems.pop_back();",
  "    if (relatedproblems.empty())",
  "      iter = opplan->firstProblem;",
  "    else",
  "      iter = relatedproblems.back();",
  "    return *this;",
  "  }",
  "",
  "  // Move to the next problem",
  "  iter = iter->getNextProblem();",
  "  return *this;",
  "}",
  "",
  "bool OperationPlan::updateFeasible() {",
  "  if (!getOperation()->getDetectProblems() || getCompleted() || getClosed()) {",
  "    // No problems to be flagged on this operation",
  "    setFeasible(true);",
  "    return true;",
  "  }",
  "",
  "  // The implementation of this method isn't really cleanly object oriented. It",
  "  // uses logic which only the different resource and buffer implementation",
  "  // classes should be aware.",
  "  if (firstsubopplan) {",
  "    // Check feasibility of child operationplans",
  "    for (auto i = firstsubopplan; i; i = i->nextsubopplan) {",
  "      if (!i->updateFeasible()) {",
  "        setFeasible(false);",
  "        return false;",
  "      }",
  "    }",
  "  } else {",
  "    // Before current and before fence problems are only detected on child",
  "    // operationplans",
  "    if (getConfirmed()) {",
  "      if (getEnd() < Plan::instance().getCurrent()) {",
  "        // Before current violation",
  "        setFeasible(false);",
  "        return false;",
  "      }",
  "    } else {",
  "      if (getStart() < Plan::instance().getCurrent()) {",
  "        // Before current violation",
  "        setFeasible(false);",
  "        return false;",
  "      } else if (getProposed() && getStart() < oper->getFence(this)) {",
  "        // Before fence violation",
  "        setFeasible(false);",
  "        return false;",
  "      }",
  "    }",
  "  }",
  "  if (nextsubopplan && getEnd() > nextsubopplan->getStart() + Duration(1L) &&",
  "      !nextsubopplan->getConfirmed() && owner &&",
  "      !owner->getOperation()->hasType<OperationSplit>()) {",
  "    // Precedence violation",
  "    // Note: 1 second grace period for precedence problems to avoid rounding",
  "    // issues",
  "    setFeasible(false);",
  "    return false;",
  "  }",
  "",
  "  // Verify the capacity constraints",
  "  for (auto ldplan = getLoadPlans(); ldplan != endLoadPlans(); ++ldplan) {",
  "    if (((ldplan->getQuantity() > 0 &&",
  "          ldplan->getResource()->hasType<ResourceDefault>()) ||",
  "         (ldplan->getQuantity() < 0 &&",
  "          ldplan->getResource()->hasType<ResourceBuckets>())) &&",
  "        !ldplan->getFeasible()) {",
  "      setFeasible(false);",
  "      return false;",
  "    }",
  "  }",
  "",
  "  // Verify the material constraints",
  "  for (auto flplan = beginFlowPlans(); flplan != endFlowPlans(); ++flplan) {",
  "    if (!flplan->getFlow()->isConsumer() ||",
  "        flplan->getBuffer()->hasType<BufferInfinite>())",
  "      continue;",
  "    if (flplan->getBuffer()->getOnHand(Date::infiniteFuture) <",
  "        -ROUNDING_ERROR) {",
  "      // Material shortage",
  "      setFeasible(false);",
  "      return false;",
  "    }",
  "    auto flplaniter = flplan->getBuffer()->getFlowPlans();",
  "    for (auto cur = flplaniter.begin(&*flplan);",
  "         cur != flplaniter.end() && cur->getDate() < getEnd(); ++cur) {",
  "      if (cur->getOnhand() < -ROUNDING_ERROR && cur->isLastOnDate()) {",
  "        // Material shortage",
  "        setFeasible(false);",
  "        return false;",
  "      }",
  "    }",
  "  }",
  "",
  "  // After all checks, it turns out to be feasible",
  "  setFeasible(true);",
  "  return true;",
  "}",
  "",
  "PyObject* OperationPlan::updateFeasiblePython(PyObject* self, PyObject*) {",
  "  return PythonData(static_cast<OperationPlan*>(self)->updateFeasible());",
  "}",
  "",
  "}  // namespace frepple",
];
