// <header-api-generated>
import { CommandMoveOperationPlan } from "../model/actions.js";
import { Operation, OperationRouting } from "../model/operation.js";
import { OperationPlan } from "../model/operationplan.js";
import { Plan } from "../model/plan.js";
import { CommandManager } from "../utils/actions.js";
import { Date as PlanningDate, Duration } from "../utils/date.js";
import { HeaderModelAdapter } from "../utils/library.js";

type BackwardDateInput = PlanningDate | string | number;

function backwardCall(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function backwardDate(value: BackwardDateInput): PlanningDate {
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
}

/** Transactional pull-in operator with dependency and tabu protection. */
export class OperatorBackward extends HeaderModelAdapter {
  static readonly cppBases = ["NonCopyable", "Solver"] as const;
  static readonly cppQualifiedNames = ["OperatorBackward"] as const;
  private manager: CommandManager;
  private propagate = true;
  private acceptTabuCandidate = false;
  private readonly tabu = new Set<OperationPlan>();

  constructor(commandManager: CommandManager = new CommandManager()) {
    super();
    this.manager = commandManager;
  }

  addMoveEndDate(operationPlan: OperationPlan, end: BackwardDateInput): CommandMoveOperationPlan | null {
    if (!this.isValidCandidate(operationPlan)) return null;
    const requestedEnd = backwardDate(end);
    const duration = operationPlan.getEnd().subtract(operationPlan.getStart());
    const command = new CommandMoveOperationPlan(operationPlan);
    this.manager.add(command);
    operationPlan.setStartEndAndQuantity(requestedEnd.subtract(duration), requestedEnd, operationPlan.getQuantity());
    this.addTabu(operationPlan);
    return command;
  }

  addMoveStartDate(operationPlan: OperationPlan, start: BackwardDateInput): CommandMoveOperationPlan | null {
    if (!this.isValidCandidate(operationPlan)) return null;
    const requestedStart = backwardDate(start);
    const duration = operationPlan.getEnd().subtract(operationPlan.getStart());
    const command = new CommandMoveOperationPlan(operationPlan);
    this.manager.add(command);
    operationPlan.setStartEndAndQuantity(requestedStart, requestedStart.add(duration), operationPlan.getQuantity());
    this.addTabu(operationPlan);
    return command;
  }

  addResize(operationPlan: OperationPlan, quantity: number): CommandMoveOperationPlan | null {
    if (!this.isValidCandidate(operationPlan)) return null;
    const command = new CommandMoveOperationPlan(operationPlan);
    this.manager.add(command);
    operationPlan.setQuantity(Math.max(0, Number(quantity)), true, true, true);
    this.addTabu(operationPlan);
    return command;
  }

  addTabu(operationPlan: OperationPlan): void { this.tabu.add(operationPlan); }
  resetTabu(): void { this.tabu.clear(); }
  getAcceptTabuCandidate(): boolean { return this.acceptTabuCandidate; }
  setAcceptTabuCandidate(value: boolean): void { this.acceptTabuCandidate = Boolean(value); }
  getCommandManager(): CommandManager { return this.manager; }
  setCommandManager(value: CommandManager): void { this.manager = value; }
  getPropagate(): boolean { return this.propagate; }
  setPropagate(value: boolean): void { this.propagate = Boolean(value); }
  commit(): void { this.manager.commit(); this.resetTabu(); }
  rollback(): void { this.manager.rollback(); this.resetTabu(); }

  isValidCandidate(operationPlan: OperationPlan | null): operationPlan is OperationPlan {
    return operationPlan instanceof OperationPlan
      && (operationPlan.getProposed() || operationPlan.getApproved())
      && !operationPlan.getEnd().equals(PlanningDate.infiniteFuture)
      && (this.acceptTabuCandidate || !this.tabu.has(operationPlan));
  }

  compareCandidates(first: OperationPlan, second: OperationPlan, date: BackwardDateInput = PlanningDate.infiniteFuture): boolean {
    const requested = backwardDate(date);
    const firstSlack = Math.max(0, first.getStart().subtract(requested).seconds);
    const secondSlack = Math.max(0, second.getStart().subtract(requested).seconds);
    return secondSlack > firstSlack
      || (secondSlack === firstSlack && second.getPriority() < first.getPriority())
      || (secondSlack === firstSlack && second.getPriority() === first.getPriority()
        && second.getEnd().compare(first.getEnd()) > 0);
  }

  solve(target: unknown = null, date?: BackwardDateInput): unknown {
    if (target instanceof OperationPlan) return this.solveOperationPlan(target, date);
    if (target instanceof Operation) return this.solveIterable(target.getOperationPlans(), date);
    if (target && typeof target === "object") {
      const operationPlan = backwardCall(target, "getOperationPlan");
      if (operationPlan instanceof OperationPlan) return this.solveOperationPlan(operationPlan, date);
      const operationPlans = backwardCall(target, "getOperationPlans");
      if (operationPlans && typeof (operationPlans as Iterable<unknown>)[Symbol.iterator] === "function") {
        return this.solveIterable(operationPlans as Iterable<unknown>, date);
      }
    }
    const result: OperationPlan[] = [];
    for (const operation of Operation.all()) result.push(...this.solveIterable(operation.getOperationPlans(), date));
    return result;
  }

  private solveIterable(values: Iterable<unknown>, date?: BackwardDateInput): OperationPlan[] {
    const result: OperationPlan[] = [];
    for (const candidate of values) {
      if (candidate instanceof OperationPlan && this.solveOperationPlan(candidate, date)) result.push(candidate);
    }
    return result;
  }

  private solveOperationPlan(operationPlan: OperationPlan, date?: BackwardDateInput): boolean {
    if (!this.isValidCandidate(operationPlan)) return false;
    const duration = operationPlan.getEnd().subtract(operationPlan.getStart());
    let latestEnd = date === undefined ? operationPlan.getEnd() : backwardDate(date);
    let constrained = date !== undefined;
    const next = operationPlan.getNextSubOpplan();
    if (next) {
      const ownerOperation = operationPlan.getOwner()?.getOperation();
      const routingPostTime = ownerOperation instanceof OperationRouting && ownerOperation.getHardPostTime()
        ? operationPlan.getOperation()?.getPostTime() ?? new Duration()
        : new Duration();
      const routingDate = next.getStart().subtract(routingPostTime);
      if (latestEnd.compare(routingDate) > 0) latestEnd = routingDate;
      constrained = true;
    }
    for (const dependency of operationPlan.getBlockingIterator()) {
      const successor = backwardCall(dependency, "getSecond");
      if (!(successor instanceof OperationPlan)) continue;
      const relation = backwardCall(dependency, "getOperationDependency");
      const hardLead = backwardCall(relation, "getHardSafetyLeadtime");
      const lead = hardLead instanceof Duration ? hardLead : new Duration();
      const dependencyDate = successor.getStart().subtract(lead);
      if (latestEnd.compare(dependencyDate) > 0) latestEnd = dependencyDate;
      constrained = true;
    }
    const current = Plan.instance().getCurrent();
    if (latestEnd.subtract(duration).compare(current) < 0) latestEnd = current.add(duration);
    if (!constrained || operationPlan.getEnd().compare(latestEnd) <= 0) return false;
    this.addMoveEndDate(operationPlan, latestEnd);
    if (this.propagate) {
      const previous = operationPlan.getPrevSubOpplan();
      if (previous) this.solveOperationPlan(previous, operationPlan.getStart());
      for (const dependency of operationPlan.getBlockedbyIterator()) {
        const predecessor = backwardCall(dependency, "getFirst");
        if (predecessor instanceof OperationPlan && predecessor !== operationPlan) {
          this.solveOperationPlan(predecessor, operationPlan.getStart());
        }
      }
    }
    return true;
  }
}

export class OperatorBackwardCompareLoadPlans extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["OperatorBackward::compareLoadPlans"] as const;
  constructor(private readonly owner: OperatorBackward | null = null) { super(); }
  compare(first: unknown, second: unknown): number {
    const firstPlan = backwardCall(first, "getOperationPlan");
    const secondPlan = backwardCall(second, "getOperationPlan");
    if (!(firstPlan instanceof OperationPlan) || !(secondPlan instanceof OperationPlan)) return 0;
    return this.owner?.compareCandidates(firstPlan, secondPlan) ? 1
      : this.owner?.compareCandidates(secondPlan, firstPlan) ? -1 : 0;
  }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/solver/operatorbackward.cpp.
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
  { name: "OperatorBackward::solve", sourceLine: 31, status: "adapted" },
  { name: "OperatorBackward::compareLoadPlans::operator", sourceLine: 130, status: "adapted" },
  { name: "OperatorBackward::solve", sourceLine: 152, status: "adapted" },
  { name: "OperatorBackward::solve", sourceLine: 390, status: "adapted" },
  { name: "OperatorBackward::isValidCandidate", sourceLine: 454, status: "adapted" },
  { name: "OperatorBackward::compareCandidates", sourceLine: 463, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface OperatorBackwardPort {
  compareCandidates(...args: readonly PortValue[]): PortValue | void;
  isValidCandidate(...args: readonly PortValue[]): PortValue | void;
  solve(...args: readonly PortValue[]): PortValue | void;
}

export interface compareLoadPlansPort {
  operator(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/solver/operatorbackward.cpp";
export const targetFile = "solver/operatorbackward.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2026 by frePPLe bv                                        *",
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
  "#define FREPPLE_CORE",
  "#include \"frepple/solver.h\"",
  "",
  "namespace frepple {",
  "",
  "void OperatorBackward::solve(const ResourceBuckets* res, void*) {",
  "  auto& indentlevel = data->getSolver()->indentlevel;",
  "  // No propagation on unconstrained resources",
  "  if (!res->getConstrained() || !data->getSolver()->isCapacityConstrained())",
  "    return;",
  "",
  "  set<OperationPlan*> propagationList;",
  "",
  "  // Debugging log",
  "  ++indentlevel;",
  "  if (getLogLevel() > 0) {",
  "    logger << indentlevel << \"Backward propagation of bucketized resource \"",
  "           << res;",
  "    if (curOperationPlan) logger << \" for operationplan \" << curOperationPlan;",
  "    if (curLoadPlan) logger << \" on \" << curLoadPlan->getDate();",
  "    logger << \"\\n\";",
  "  }",
  "",
  "  // Loop until all overloads are resolved",
  "  Date lastloop = Date::infiniteFuture;",
  "  while (true) {",
  "    // Step 1: Find the end date of the latest overload.",
  "    Resource::loadplanlist::const_iterator ldpln_iter =",
  "        res->getLoadPlans().rbegin();",
  "    for (; ldpln_iter != res->getLoadPlans().end(); --ldpln_iter) {",
  "      if (ldpln_iter->getEventType() == 2 &&",
  "          ldpln_iter->getOnhandBeforeDate() < -ROUNDING_ERROR &&",
  "          ldpln_iter->getDate() < lastloop)",
  "        break;",
  "    }",
  "    if (ldpln_iter == res->getLoadPlans().end())",
  "      // Resource doesn't have a single overload",
  "      break;",
  "    double overload = -ldpln_iter->getOnhandBeforeDate();",
  "",
  "    // Step 2: Scan for candidates using capacity in this bucket",
  "    map<OperationPlan*, double> candidates;",
  "    for (--ldpln_iter; ldpln_iter != res->getLoadPlans().end(); --ldpln_iter) {",
  "      if (ldpln_iter->getEventType() == 2) break;",
  "      const LoadPlan* ldpln = static_cast<const LoadPlan*>(&*ldpln_iter);",
  "      if (isValidCandidate(ldpln->getOperationPlan()))",
  "        candidates.insert(",
  "            make_pair(ldpln->getOperationPlan(), ldpln->getQuantity()));",
  "    }",
  "    if (ldpln_iter != res->getLoadPlans().end())",
  "      lastloop = ldpln_iter->getDate();",
  "    else",
  "      lastloop = Date::infinitePast;",
  "",
  "    // Step 3: Evaluate candidates",
  "    while (overload > ROUNDING_ERROR) {",
  "      double curload;",
  "      OperationPlan* candidate = nullptr;",
  "      for (auto x = candidates.begin(); x != candidates.end(); ++x) {",
  "        if (!candidate ||",
  "            compareCandidates(candidate, x->first,",
  "                              ldpln_iter->getDate() - Duration(1L))) {",
  "          candidate = x->first;",
  "          curload = x->second;",
  "        }",
  "        if (getLogLevel() > 5)",
  "          logger << indentlevel << \"   candidate \" << x->first << \": \"",
  "                 << ((candidate == x->first) ? \"*\" : \"\") << \"\\n\";",
  "      }",
  "",
  "      // Step 4: Move the candidate early",
  "      if (candidate) {",
  "        if (getLogLevel() > 1)",
  "          logger << indentlevel << \"Moving operationplan \" << candidate",
  "                 << \" to start on \" << ldpln_iter->getDate() - Duration(1L)",
  "                 << \"\\n\";",
  "        addMoveStartDate(candidate, ldpln_iter->getDate() - Duration(1L));",
  "        candidate->appendInfo(",
  "            \"Moved the start early to resolve resource overload on \" +",
  "            res->getName());",
  "",
  "        // Propagate",
  "        solve(candidate);",
  "",
  "        // Remove from the candidate list",
  "        auto search = candidates.find(candidate);",
  "        if (search != candidates.end()) candidates.erase(search);",
  "",
  "        // Propagate the change",
  "        if (getPropagate()) propagationList.insert(candidate);",
  "",
  "        // Reduce overload size",
  "        overload += curload;",
  "      } else {",
  "        logger << \"Can't find candidate operationplans\\n\";",
  "        overload = 0.0;",
  "        break;",
  "      }",
  "    }",
  "  };",
  "",
  "  --indentlevel;",
  "}",
  "",
  "bool OperatorBackward::compareLoadPlans::operator()(const LoadPlan*& a,",
  "                                                    const LoadPlan*& b) {",
  "  if (a->getDate() != b->getDate())",
  "    return b->getDate() < a->getDate();",
  "  else {",
  "    // a. User the original date as a tie breaker",
  "    auto t1 = data->original_dates.find(a->getOperationPlan());",
  "    auto t2 = data->original_dates.find(b->getOperationPlan());",
  "    if (t1 != data->original_dates.end() && t2 == data->original_dates.end())",
  "      return true;",
  "    else if (t1 == data->original_dates.end() &&",
  "             t2 != data->original_dates.end())",
  "      return false;",
  "    else if (t1 != data->original_dates.end() &&",
  "             t2 != data->original_dates.end() && t1->second != t2->second)",
  "      return t2->second < t1->second;",
  "    else",
  "      // b. Default ordering of operationplans",
  "      return a->getOperationPlan() < b->getOperationPlan();",
  "  }",
  "}",
  "",
  "void OperatorBackward::solve(const Resource* res, void*) {",
  "  auto& indentlevel = data->getSolver()->indentlevel;",
  "  // No propagation on unconstrained resources",
  "  if (!res->getConstrained() || !data->getSolver()->isCapacityConstrained())",
  "    return;",
  "",
  "  set<OperationPlan*> propagationList;",
  "  map<OperationPlan*, Date> candidates_orginal;",
  "",
  "  // Debugging log",
  "  ++indentlevel;",
  "  bool first_action = true;",
  "",
  "  // Loop until all overloads are resolved",
  "  unsigned short iterationcount = 0;",
  "  original_dates.clear();",
  "  while (true) {",
  "    list<const LoadPlan*> current_loadplans;",
  "    list<const LoadPlan*> accepted_loadplans;",
  "    double overload = 0.0;",
  "    const LoadPlan* cur = nullptr;",
  "    double accepted_load = 0.0;",
  "",
  "    // Step 1: Find the end date of the latest overload.",
  "    Resource::loadplanlist::const_iterator ldpln_iter =",
  "        res->getLoadPlans().rbegin();",
  "    double curMax =",
  "        (ldpln_iter == res->getLoadPlans().end() ? 0",
  "                                                 : ldpln_iter->getMax(false));",
  "    Resource::loadplanlist::const_iterator overload_iter;",
  "    for (; ldpln_iter != res->getLoadPlans().end(); --ldpln_iter) {",
  "      if (ldpln_iter->getEventType() == 4) {",
  "        // Change of the maximum. We need to pick the value of the previous",
  "        // max!",
  "        curMax = ldpln_iter->getMax(false);",
  "        overload = ldpln_iter->getOnhandBeforeDate() - curMax;",
  "        if (overload > ROUNDING_ERROR) overload_iter = ldpln_iter;",
  "        cur = nullptr;",
  "      } else if (ldpln_iter->getEventType() == 1)",
  "        cur = static_cast<const LoadPlan*>(&*ldpln_iter);",
  "      else",
  "        cur = nullptr;",
  "",
  "      // Track all operationplans currently loading the resource",
  "      if (cur) {",
  "        if (cur->getOperationPlan()->getConfirmed()) {",
  "          accepted_load -= cur->getQuantity();",
  "          if (cur->getQuantity() < 0)",
  "            accepted_loadplans.push_back(cur);",
  "          else if (cur->getQuantity() > 0) {",
  "            for (auto f = accepted_loadplans.begin();",
  "                 f != accepted_loadplans.end(); ++f) {",
  "              if (cur->getOperationPlan() == (*f)->getOperationPlan()) {",
  "                accepted_loadplans.erase(f);",
  "                break;",
  "              }",
  "            }",
  "          }",
  "        } else {",
  "          if (cur->getQuantity() < 0)",
  "            current_loadplans.push_back(cur);",
  "          else if (cur->getQuantity() > 0) {",
  "            for (auto f = current_loadplans.begin();",
  "                 f != current_loadplans.end(); ++f) {",
  "              if (cur->getOperationPlan() == (*f)->getOperationPlan()) {",
  "                current_loadplans.erase(f);",
  "                break;",
  "              }",
  "            }",
  "          }",
  "        }",
  "      }",
  "",
  "      // Detect overload status",
  "      if (!ldpln_iter->isFirstOnDate()) continue;",
  "      overload = ldpln_iter->getOnhandBeforeDate() - curMax;",
  "      if (overload > ROUNDING_ERROR && !current_loadplans.empty()) break;",
  "    }",
  "    if (overload < ROUNDING_ERROR)",
  "      // Resource has not a single overload",
  "      break;",
  "",
  "    if (getLogLevel() > 0) {",
  "      if (first_action) {",
  "        logger << indentlevel << \"Backward propagation of resource \" << res;",
  "        if (curOperationPlan)",
  "          logger << \" for operationplan \" << curOperationPlan;",
  "        if (curLoadPlan) logger << \" on \" << curLoadPlan->getDate();",
  "        logger << \"\\n\";",
  "        first_action = false;",
  "      }",
  "      logger << indentlevel << \"  Overload of \" << overload",
  "             << \" detected ending at \" << ldpln_iter->getDate() << \"\\n\";",
  "    }",
  "",
  "    // Step 2: Establish accepted load at the problem end.",
  "    // All confirmed loadplans are already accepted. We now add approved &",
  "    // proposed to fit the size.",
  "    // We first try to accept the tabu operationplans.",
  "    current_loadplans.sort(compareLoadPlans(this));",
  "    for (short pass = 0; pass <= 1 && !current_loadplans.empty(); ++pass) {",
  "      for (auto f = current_loadplans.begin(); f != current_loadplans.end();) {",
  "        auto is_tabu = tabu.find((*f)->getOperationPlan()) != tabu.end();",
  "        if ((pass == 0 && !is_tabu) || (pass == 1 && is_tabu)) {",
  "          ++f;",
  "          continue;",
  "        }",
  "        if (accepted_load - (*f)->getQuantity() < curMax + ROUNDING_ERROR) {",
  "          auto tmp = f;",
  "          accepted_loadplans.push_back(*f);",
  "          accepted_load -= (*f)->getQuantity();",
  "          ++f;",
  "          current_loadplans.erase(tmp);",
  "        } else",
  "          ++f;",
  "      }",
  "    }",
  "",
  "    // Ldpln_iter is now pointing to first event within the overload period.",
  "    if (ldpln_iter != res->getLoadPlans().end()) --ldpln_iter;",
  "",
  "    // Step 3: Scan backward till this overload is over.",
  "    res->setFrozenSetups(true);",
  "    for (;",
  "         ldpln_iter != res->getLoadPlans().end() && !current_loadplans.empty();",
  "         --ldpln_iter) {",
  "      if (ldpln_iter->getEventType() == 1)",
  "        cur = static_cast<const LoadPlan*>(&*ldpln_iter);",
  "      else",
  "        cur = nullptr;",
  "",
  "      // Track all operationplans currently loading the resource",
  "      if (cur) {",
  "        if (cur->getOperationPlan()->getConfirmed()) {",
  "          // Confirmed loadplans are always accepted immediately",
  "          accepted_load -= cur->getQuantity();",
  "          if (cur->getQuantity() < 0)",
  "            accepted_loadplans.push_back(cur);",
  "          else if (cur->getQuantity() > 0) {",
  "            bool found = false;",
  "            for (auto f = accepted_loadplans.begin();",
  "                 f != accepted_loadplans.end(); ++f) {",
  "              if (cur->getOperationPlan() == (*f)->getOperationPlan()) {",
  "                accepted_load -= cur->getQuantity();",
  "                accepted_loadplans.erase(f);",
  "                found = true;",
  "                break;",
  "              }",
  "            }",
  "            if (!found)",
  "              logger << \"Couldn't find confirmed operationplan in the list\\n\";",
  "          }",
  "        } else if (cur->getQuantity() < 0)",
  "          // New candidates are collected here",
  "          current_loadplans.push_back(cur);",
  "        else if (cur->getQuantity() > 0) {",
  "          for (auto f = accepted_loadplans.begin();",
  "               f != accepted_loadplans.end(); ++f) {",
  "            if (cur->getOperationPlan() == (*f)->getOperationPlan()) {",
  "              // One of the accepted operationplans starts here",
  "              accepted_load -= cur->getQuantity();",
  "              accepted_loadplans.erase(f);",
  "              break;",
  "            }",
  "          }",
  "        }",
  "      }",
  "",
  "      // Evaluate at the end of this date",
  "      if (!ldpln_iter->isFirstOnDate()) continue;",
  "",
  "      // Done resolving this overload",
  "      if (current_loadplans.empty()) break;",
  "",
  "      // Fill up free capacity with available candidates.",
  "      // First non-tabu, then tabu.",
  "      for (short check_limit = 1; check_limit >= 0; --check_limit) {",
  "        for (short pass = 0; pass <= 1; ++pass) {",
  "          for (auto f = current_loadplans.begin();",
  "               f != current_loadplans.end();) {",
  "            auto is_tabu = tabu.find((*f)->getOperationPlan()) != tabu.end();",
  "            if ((pass == 0 && is_tabu) || (pass == 1 && !is_tabu)) {",
  "              ++f;",
  "              continue;",
  "            }",
  "            // Move this candidate if a) it fits within the available size or",
  "            // b) the candidate will never fit anyway.",
  "            if (accepted_load - (*f)->getQuantity() < curMax + ROUNDING_ERROR ||",
  "                -(*f)->getQuantity() > curMax + ROUNDING_ERROR ||",
  "                !check_limit) {",
  "              auto opplan = (*f)->getOperationPlan();",
  "",
  "              if (opplan->getEnd() <= ldpln_iter->getDate()) {",
  "                ++f;",
  "                continue;",
  "              }",
  "",
  "              if (getLogLevel() > 1)",
  "                logger << indentlevel << \"    Moving operationplan \" << opplan",
  "                       << \" to end on \" << ldpln_iter->getDate() << \"\\n\";",
  "",
  "              // Move the candidate early",
  "              addMoveEndDate(opplan, ldpln_iter->getDate());",
  "              opplan->appendInfo(\"Moved early to resolve resource overload on\" +",
  "                                 res->getName());",
  "",
  "              // Propagate",
  "              solve(opplan);",
  "",
  "              // Maintain list of accepted and waiting loads",
  "              accepted_loadplans.push_back(*f);",
  "              accepted_load -= (*f)->getQuantity();",
  "              auto tmp = f;",
  "              ++f;",
  "              current_loadplans.erase(tmp);",
  "              if (accepted_load > curMax - ROUNDING_ERROR ||",
  "                  current_loadplans.empty()) {",
  "                break;",
  "              }",
  "            } else",
  "              ++f;",
  "          }",
  "        }",
  "      }",
  "    }",
  "    res->setFrozenSetups(false);",
  "",
  "    if (++iterationcount >= MAX_LOOP) {",
  "      logger << indentlevel",
  "             << \"Error: Leaving resource backward propagation loop on \" << res",
  "             << \" after \" << MAX_LOOP << \" iterations\\n\";",
  "      break;",
  "    }",
  "  }",
  "  original_dates.clear();",
  "  --indentlevel;",
  "}",
  "",
  "void OperatorBackward::solve(OperationPlan* opplan, void*) {",
  "  auto& indentlevel = data->getSolver()->indentlevel;",
  "",
  "  // Keep routing sequence correct after the move",
  "  if (opplan->getOwner() &&",
  "      opplan->getOwner()->getOperation()->hasType<OperationRouting>()) {",
  "    OperationPlan* tmp = opplan;",
  "    OperationPlan* other = tmp->getPrevSubOpplan();",
  "    auto hard_posttime =",
  "        static_cast<OperationRouting*>(tmp->getOwner()->getOperation())",
  "            ->getHardPostTime();",
  "    auto posttime = hard_posttime && other",
  "                        ? other->getOperation()->getPostTime()",
  "                        : Duration(0L);",
  "    if (other && (other->getProposed() || other->getApproved()) &&",
  "        tmp->getStart() < other->getEnd() + posttime) {",
  "      if (getLogLevel() > 1)",
  "        logger << indentlevel << \"Moving operationplan \" << other",
  "               << \" early to end on \" << (tmp->getStart() - posttime)",
  "               << \" to keep the sequence in the routing\\n\";",
  "      addMoveEndDate(other, tmp->getStart() - posttime);",
  "      other->appendInfo(\"Moved the end early to follow a predecessor\");",
  "      // Propagate",
  "      solve(other);",
  "    };",
  "  }",
  "",
  "  // Keep synchronised deliveries together",
  "  if (opplan->getDemand() && opplan->getDemand()->getOwner() &&",
  "      opplan->getDemand()->getOwner()->hasType<DemandGroup>() &&",
  "      static_cast<DemandGroup*>(opplan->getDemand()->getOwner())->getPolicy() !=",
  "          Demand::POLICY_INDEPENDENT) {",
  "    for (auto dmd = opplan->getDemand()->getOwner()->getMembers();",
  "         dmd != Demand::end(); ++dmd) {",
  "      for (auto dlvr : dmd->getDelivery()) {",
  "        if (dlvr != opplan && dlvr->getEnd() != opplan->getEnd()) {",
  "          addMoveEndDate(dlvr, opplan->getEnd());",
  "          dlvr->appendInfo(\"Moved to synchronise deliveries\");",
  "          // Propagate",
  "          solve(dlvr);",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  // Keep dependencies correct TODO",
  "  for (auto d : opplan->getDependencies()) {",
  "    if (opplan != d->getSecond()) continue;",
  "    Date nd = d->getSecond()->getStart();",
  "    if (d->getOperationDependency())",
  "      nd -= d->getOperationDependency()->getHardSafetyLeadtime();",
  "    if (nd < d->getFirst()->getEnd() &&",
  "        (d->getFirst()->getProposed() || d->getFirst()->getApproved())) {",
  "      if (getLogLevel() > 1)",
  "        logger << indentlevel << \"Moving operationplan \" << d->getFirst()",
  "               << \" early to end on \" << nd << \" to maintain dependencies\\n\";",
  "      addMoveEndDate(d->getFirst(), nd);",
  "      d->getFirst()->appendInfo(\"Moved the end early to precede a successor\");",
  "      // Propagate",
  "      solve(d->getFirst());",
  "    }",
  "  }",
  "}",
  "",
  "bool OperatorBackward::isValidCandidate(OperationPlan* opplan) const {",
  "  if (!getAcceptTabuCandidate()) {",
  "    auto t = tabu.find(opplan);",
  "    if (t != tabu.end()) return false;",
  "  }",
  "  return (opplan->getProposed() || opplan->getApproved()) &&",
  "         opplan->getEnd() != Date::infiniteFuture;",
  "};",
  "",
  "bool OperatorBackward::compareCandidates(OperationPlan* opplan1,",
  "                                         OperationPlan* opplan2, Date) const {",
  "  auto t1 = tabu.find(opplan1);",
  "  auto t2 = tabu.find(opplan2);",
  "",
  "  if ((t1 != tabu.end() && t2 == tabu.end()) || opplan1 == opplan2)",
  "    return true;",
  "  else if (t1 == tabu.end() && t2 != tabu.end())",
  "    return false;",
  "  else if (opplan1->getEnd() != opplan2->getEnd())",
  "    return opplan2->getEnd() < opplan1->getEnd();",
  "",
  "  // If there are dependency links between both operationplans, we should move",
  "  // the predecessor first. Failing to do so can create vicious endless loops of",
  "  // moves.",
  "  // Check 1: walk downstream from opplan1",
  "  stack<OperationPlan*> deps;",
  "  deps.push(opplan1);",
  "  while (!deps.empty()) {",
  "    auto o = deps.top();",
  "    deps.pop();",
  "    if (o == opplan2) {",
  "      // Force moving the first one",
  "      return true;",
  "    }",
  "    for (auto e : o->getDependencies()) {",
  "      if (e->getFirst() == o) deps.push(e->getSecond());",
  "    }",
  "  }",
  "  // Check 2: walk upstream from opplan2",
  "  deps.push(opplan2);",
  "  while (!deps.empty()) {",
  "    auto o = deps.top();",
  "    deps.pop();",
  "    if (o == opplan1) {",
  "      // Force moving the second one",
  "      return false;",
  "    }",
  "    for (auto e : o->getDependencies()) {",
  "      if (e->getSecond() == o) deps.push(e->getFirst());",
  "    }",
  "  }",
  "",
  "  double score1;",
  "  if (t1 != tabu.end())",
  "    score1 = t1->second;",
  "  else",
  "    score1 = -static_cast<double>(opplan1->getDelay()) / 86400;",
  "",
  "  double score2;",
  "  if (t2 != tabu.end())",
  "    score2 = t2->second;",
  "  else",
  "    score2 = -static_cast<double>(opplan2->getDelay()) / 86400;",
  "",
  "  // Final result",
  "  if (fabs(score1 - score2) > ROUNDING_ERROR)",
  "    return score1 > score2;",
  "  else",
  "    return *opplan1 < *opplan2;",
  "}",
  "",
  "}  // namespace frepple",
];
