import { Load } from "../model/load.js";
import { LoadPlan } from "../model/loadplan.js";
import { OperationRouting } from "../model/operation.js";
import { OperationPlan, OperationPlanState } from "../model/operationplan.js";
import { Plan } from "../model/plan.js";
import { Resource } from "../model/resource.js";
import type { ResourceSkill } from "../model/resourceskill.js";
import { Date as PlanningDate } from "../utils/date.js";
import { DataException, LogicException } from "../utils/library.js";
import type { SolverCreate, SolverCreateSolverData } from "./solverplan.js";

const ROUNDING_ERROR = 0.000001;
const traceScheduling = process.env.FREPPLE_TS_TRACE === "1";

function traceLoad(message: string, details: Readonly<Record<string, unknown>>): void {
  if (traceScheduling) process.stderr.write(`[load] ${message} ${JSON.stringify(details)}\n`);
}

type SearchMode = "PRIORITY" | "MINCOST" | "MINPENALTY" | "MINCOSTPENALTY";

interface QuestionSnapshot {
  readonly loadPlan: unknown;
  readonly operationPlan: OperationPlan | null;
  readonly quantity: number;
  readonly date: PlanningDate;
}

interface ResourceSelection {
  readonly resource: Resource;
  readonly state: OperationPlanState;
  readonly quantity: number;
}

interface LoadSelection extends ResourceSelection {
  readonly load: Load;
}

function snapshotQuestion(data: SolverCreateSolverData): QuestionSnapshot {
  return {
    loadPlan: data.state.q_loadplan,
    operationPlan: data.state.q_operationplan,
    quantity: data.state.q_qty,
    date: new PlanningDate(data.state.q_date),
  };
}

function restoreQuestion(data: SolverCreateSolverData, snapshot: QuestionSnapshot): void {
  data.state.q_loadplan = snapshot.loadPlan;
  data.state.q_operationplan = snapshot.operationPlan;
  data.state.q_qty = snapshot.quantity;
  data.state.q_date = new PlanningDate(snapshot.date);
}

function syncQuestion(data: SolverCreateSolverData, loadPlan: LoadPlan, operationPlan: OperationPlan): void {
  data.state.q_loadplan = loadPlan;
  data.state.q_operationplan = operationPlan;
  data.state.q_qty = loadPlan.getQuantity();
  data.state.q_date = loadPlan.getDate();
}

function laterDate(left: PlanningDate, right: PlanningDate): PlanningDate {
  return left.compare(right) >= 0 ? new PlanningDate(left) : new PlanningDate(right);
}

function loadPriority(load: Load): number {
  return load.getPriority() || Number.MAX_SAFE_INTEGER;
}

function loadEfficiency(load: Load): number {
  return load.getResource()?.getEfficiency() ?? Number.POSITIVE_INFINITY;
}

function alternateLoads(load: Load, loadPlan: LoadPlan): Load[] {
  const operation = load.getOperation();
  const leader = load.hasAlternates() ? load : load.getAlternate();
  if (!operation || !leader) return [load];
  return operation.getLoads()
    .filter((candidate): candidate is Load => candidate instanceof Load
      && (candidate === leader || candidate.getAlternate() === leader)
      && candidate.getPriority() !== 0
      && candidate.getEffective().within(loadPlan.getDate()))
    .sort((left, right) => loadPriority(left) - loadPriority(right)
      || loadEfficiency(left) - loadEfficiency(right));
}

function concreteResources(load: Load): Resource[] {
  const root = load.getResource();
  if (!root) return [];
  const candidates = root.isGroup() ? [...root.getAllMembers()] : [root];
  return candidates.filter((candidate) => !candidate.isGroup()).sort((left, right) =>
    right.getEfficiency() - left.getEfficiency() || right.getName().localeCompare(left.getName()));
}

function searchValue(
  mode: SearchMode,
  deltaCost: number,
  deltaPenalty: number,
  quantity: number,
  skillPriority: number,
): number {
  switch (mode) {
    case "PRIORITY": return skillPriority;
    case "MINCOST": return deltaCost / quantity;
    case "MINPENALTY": return deltaPenalty / quantity;
    case "MINCOSTPENALTY": return (deltaCost + deltaPenalty) / quantity;
    default: throw new LogicException("Unsupported search mode for alternate load");
  }
}

function restoreAssignment(
  loadPlan: LoadPlan,
  load: Load,
  resource: Resource,
  operationPlan: OperationPlan,
  state: OperationPlanState,
): void {
  if (loadPlan.getLoad() !== load) loadPlan.setLoad(load);
  operationPlan.restore(state);
  if (loadPlan.getResource() !== resource) loadPlan.setResource(resource, false, false);
}

function routingToolResource(load: Load, loadPlan: LoadPlan): Resource | null {
  const root = load.getResource();
  const operationPlan = loadPlan.getOperationPlan();
  const owner = operationPlan?.getOwner();
  if (!root || (!root.getTool() && !root.getToolPerPiece()) || !owner
      || !(owner.getOperation() instanceof OperationRouting)) return null;
  for (const sibling of owner.getSubOperationPlans(false)) {
    if (sibling === operationPlan) continue;
    for (const siblingLoadPlan of sibling.getLoadPlans()) {
      if (!(siblingLoadPlan instanceof LoadPlan)) continue;
      if (siblingLoadPlan.getLoad()?.getResource() === root
          && siblingLoadPlan.getLoad()?.getSkill() === load.getSkill()) return siblingLoadPlan.getResource();
    }
  }
  return null;
}

/** Select a concrete resource, preserving C++ trial and rollback semantics. */
function chooseResourceSemantic(
  solver: SolverCreate,
  load: Load,
  data: SolverCreateSolverData,
): unknown {
  const loadPlan = data.state.q_loadplan;
  if (!(loadPlan instanceof LoadPlan)) {
    data.state.a_qty = 0;
    data.state.a_date = PlanningDate.infiniteFuture;
    return null;
  }
  const operationPlan = loadPlan.getOperationPlan();
  const root = load.getResource();
  if (!(operationPlan instanceof OperationPlan) || !root) {
    data.state.a_qty = 0;
    data.state.a_date = PlanningDate.infiniteFuture;
    return null;
  }

  const forcedTool = routingToolResource(load, loadPlan);
  if (forcedTool) {
    const originalEnd = operationPlan.getEnd();
    loadPlan.setResource(forcedTool, false, false);
    operationPlan.setEnd(originalEnd);
    syncQuestion(data, loadPlan, operationPlan);
    return solver.solve(forcedTool, data);
  }

  if ((!load.getSkill() && !root.isGroup()) || loadPlan.getConfirmed()
      || operationPlan === data.state.keepAssignments) {
    const resource = loadPlan.getResource() ?? root;
    if (loadPlan.getResource() !== resource) loadPlan.setResource(resource, false, false);
    syncQuestion(data, loadPlan, operationPlan);
    return solver.solve(resource, data);
  }

  const manager = data.getCommandManager() ?? solver.getCommandManager();
  const candidates = concreteResources(load);
  const originalPlanningMode = data.constrainedPlanning;
  const originalLogConstraints = data.logConstraints;
  const originalLogLevel = solver.getLogLevel();
  const originalQuestion = snapshotQuestion(data);
  const originalLoad = loadPlan.getLoad() ?? load;
  const originalResource = loadPlan.getResource() ?? root;
  const originalState = new OperationPlanState(operationPlan);
  const originalDate = new PlanningDate(data.state.q_date);
  const originalCost = data.state.a_cost;
  const originalPenalty = data.state.a_penalty;
  const originalMinimum = data.state.q_qty_min;
  const originalForceAccept = data.state.forceAccept;
  let minimumNextDate = PlanningDate.infiniteFuture;
  let qualifiedResourceExists = false;
  let firstSelection: ResourceSelection | null = null;
  let bestSelection: ResourceSelection | null = null;
  let bestValue = Number.POSITIVE_INFINITY;

  data.constrainedPlanning = true;
  data.logConstraints = false;
  solver.setLogLevel(0);
  try {
    for (const resource of candidates) {
      let resourceSkill: ResourceSkill | null = null;
      const skill = load.getSkill();
      if (skill) {
        const sink: { value?: ResourceSkill | null } = {};
        if (!resource.hasSkill(skill, originalState.start, originalState.end, sink)) continue;
        resourceSkill = sink.value ?? null;
        if (resourceSkill && resourceSkill.getPriority() === 0) continue;
      }
      qualifiedResourceExists = true;

      if (root.isGroup() && Plan.instance().getIndividualPoolResources()) {
        const alreadyAssigned = [...operationPlan.getLoadPlans()].some((candidate) =>
          candidate instanceof LoadPlan && candidate !== loadPlan
          && candidate.getQuantity() < 0 && candidate.getResource() === resource);
        if (alreadyAssigned) continue;
      }

      operationPlan.setStartEndAndQuantity(originalState.start, originalState.end, originalState.quantity);
      traceLoad("resource-before-assignment", {
        operation: operationPlan.getOperation()?.getName() ?? null,
        load: load.getName(), resource: resource.getName(),
        originalQuantity: originalState.quantity,
        plannedQuantity: operationPlan.getQuantity(),
        loadQuantity: loadPlan.getQuantity(),
      });
      if (loadPlan.getResource() !== resource) loadPlan.setResource(resource, false, false);
      traceLoad("resource-after-assignment", {
        operation: operationPlan.getOperation()?.getName() ?? null,
        load: load.getName(), resource: resource.getName(),
        plannedQuantity: operationPlan.getQuantity(),
        loadQuantity: loadPlan.getQuantity(),
      });
      data.state.q_qty_min = originalMinimum;
      data.state.forceAccept = originalForceAccept;

      if (resource.getToolPerPiece() && load.getQuantity()) {
        const maximum = loadPlan.getMax();
        if (-loadPlan.getQuantity() > maximum + ROUNDING_ERROR) {
          operationPlan.setQuantity(maximum / load.getQuantity(), true);
          if (!operationPlan.getQuantity()) continue;
          operationPlan.setEnd(originalState.end);
          if (data.state.q_qty_min > operationPlan.getQuantity()) {
            data.state.forceAccept = true;
            data.state.q_qty_min = operationPlan.getQuantity();
          }
        }
      } else operationPlan.setEnd(originalState.end);
      syncQuestion(data, loadPlan, operationPlan);
      firstSelection ??= {
        resource,
        state: new OperationPlanState(operationPlan),
        quantity: operationPlan.getQuantity(),
      };

      data.state.a_cost = originalCost;
      data.state.a_penalty = originalPenalty;
      const bookmark = manager.setBookmark();
      let trialDate = PlanningDate.infiniteFuture;
      try {
        solver.solve(resource, data);
        trialDate = new PlanningDate(data.state.a_date);
        const answerQuantity = data.state.a_qty;
        const plannedQuantity = operationPlan.getQuantity();
        traceLoad("resource-trial", {
          operation: operationPlan.getOperation()?.getName() ?? null,
          load: load.getName(), resource: resource.getName(), answerQuantity,
          plannedQuantity, skillPriority: resourceSkill?.getPriority() ?? null,
          answerDate: trialDate.toString(),
        });
        if (answerQuantity > ROUNDING_ERROR && plannedQuantity > 0) {
          const value = searchValue(load.getSearch() as SearchMode,
            data.state.a_cost - originalCost, data.state.a_penalty - originalPenalty,
            plannedQuantity, resourceSkill?.getPriority() ?? 0);
          if (value + ROUNDING_ERROR < bestValue
              || (Math.abs(value - bestValue) < ROUNDING_ERROR
                && plannedQuantity > (bestSelection?.quantity ?? Number.NEGATIVE_INFINITY))) {
            bestValue = value;
            bestSelection = {
              resource,
              state: new OperationPlanState(operationPlan),
              quantity: plannedQuantity,
            };
          }
        }
      } finally {
        manager.rollback(bookmark);
        data.state.a_cost = originalCost;
        data.state.a_penalty = originalPenalty;
        data.state.q_qty_min = originalMinimum;
        data.state.forceAccept = originalForceAccept;
      }
      if (trialDate.compare(minimumNextDate) < 0) minimumNextDate = trialDate;
    }

    if (!qualifiedResourceExists) {
      throw new DataException(`No subresource of '${root.getName()}' has the skill '${load.getSkill()?.getName() ?? ""}' required for operation '${load.getOperation()?.getName() ?? ""}'`);
    }

    if (bestSelection) {
      traceLoad("resource-selected", {
        operation: operationPlan.getOperation()?.getName() ?? null,
        load: load.getName(), resource: bestSelection.resource.getName(),
        quantity: bestSelection.quantity, value: bestValue,
      });
      if (loadPlan.getResource() !== bestSelection.resource) {
        operationPlan.clearSetupEvent();
        operationPlan.setStartEndAndQuantity(bestSelection.state.start, bestSelection.state.end,
          bestSelection.state.quantity);
        loadPlan.setResource(bestSelection.resource, false, false);
      }
      syncQuestion(data, loadPlan, operationPlan);
      data.state.a_cost = originalCost;
      data.state.a_penalty = originalPenalty;
      return solver.solve(bestSelection.resource, data);
    }

    if (!originalPlanningMode && firstSelection) {
      if (loadPlan.getResource() !== firstSelection.resource || !operationPlan.getQuantity()) {
        operationPlan.clearSetupEvent();
        operationPlan.setStartEndAndQuantity(firstSelection.state.start, firstSelection.state.end,
          firstSelection.state.quantity);
        loadPlan.setResource(firstSelection.resource, false, false);
      }
      syncQuestion(data, loadPlan, operationPlan);
      data.state.a_qty = Math.abs(loadPlan.getQuantity());
      data.state.a_date = loadPlan.getDate();
      return null;
    }

    syncQuestion(data, loadPlan, operationPlan);
    traceLoad("resource-rejected", {
      operation: operationPlan.getOperation()?.getName() ?? null,
      load: load.getName(), candidateCount: candidates.length,
      qualifiedResourceExists, minimumNextDate: minimumNextDate.toString(),
    });
    data.state.a_qty = 0;
    data.state.a_date = laterDate(minimumNextDate, originalDate);
    return null;
  } catch (error) {
    restoreAssignment(loadPlan, originalLoad, originalResource, operationPlan, originalState);
    restoreQuestion(data, originalQuestion);
    data.state.a_cost = originalCost;
    data.state.a_penalty = originalPenalty;
    data.state.q_qty_min = originalMinimum;
    data.state.forceAccept = originalForceAccept;
    throw error;
  } finally {
    solver.setLogLevel(originalLogLevel);
    data.constrainedPlanning = originalPlanningMode;
    data.logConstraints = originalLogConstraints;
  }
}

/** Resolve a load, including alternate loads and their concrete resources. */
export function solveLoadSemantic(
  solver: SolverCreate,
  load: Load,
  data: SolverCreateSolverData,
): unknown {
  const questionLoadPlan = data.state.q_loadplan;
  if (!(questionLoadPlan instanceof LoadPlan)) {
    data.state.a_qty = 0;
    data.state.a_date = PlanningDate.infiniteFuture;
    return null;
  }
  let loadPlan: LoadPlan = questionLoadPlan;
  // solveroperation.cpp only calls this solver for decrease loadplans. Keep
  // direct TypeScript calls on that same contract when they pass the paired
  // start event instead.
  const decreaseLoadPlan = loadPlan.getQuantity() > 0 ? loadPlan.getOtherLoadPlan() : null;
  if (decreaseLoadPlan && decreaseLoadPlan.getQuantity() < 0) {
    loadPlan = decreaseLoadPlan;
    data.state.q_loadplan = loadPlan;
    data.state.q_qty = loadPlan.getQuantity();
    data.state.q_date = loadPlan.getDate();
  }
  const operationPlan = loadPlan.getOperationPlan();
  if (!(operationPlan instanceof OperationPlan)) {
    data.state.a_qty = 0;
    data.state.a_date = PlanningDate.infiniteFuture;
    return null;
  }

  if ((!load.hasAlternates() && !load.getAlternate()) || loadPlan.getConfirmed()) {
    return chooseResourceSemantic(solver, loadPlan.getLoad() ?? load, data);
  }

  const alternatives = alternateLoads(load, loadPlan);
  if (!alternatives.length) {
    data.state.a_qty = 0;
    data.state.a_date = PlanningDate.infiniteFuture;
    return null;
  }

  const manager = data.getCommandManager() ?? solver.getCommandManager();
  const search = load.getSearch() as SearchMode;
  const originalPlanningMode = data.constrainedPlanning;
  const originalLogConstraints = data.logConstraints;
  const originalLogLevel = solver.getLogLevel();
  const originalQuestion = snapshotQuestion(data);
  const originalLoad = loadPlan.getLoad() ?? load;
  const originalResource = loadPlan.getResource() ?? originalLoad.getResource();
  const originalState = new OperationPlanState(operationPlan);
  const originalCost = data.state.a_cost;
  const originalPenalty = data.state.a_penalty;
  let minimumNextDate = PlanningDate.infiniteFuture;
  let bestSelection: LoadSelection | null = null;
  let bestValue = Number.POSITIVE_INFINITY;

  if (!originalResource) {
    data.state.a_qty = 0;
    data.state.a_date = PlanningDate.infiniteFuture;
    return null;
  }

  data.constrainedPlanning = true;
  data.logConstraints = false;
  try {
    for (const candidate of alternatives) {
      restoreAssignment(loadPlan, originalLoad, originalResource, operationPlan, originalState);
      if (loadPlan.getLoad() !== candidate) loadPlan.setLoad(candidate);
      operationPlan.restore(originalState);
      syncQuestion(data, loadPlan, operationPlan);
      data.state.a_cost = originalCost;
      data.state.a_penalty = originalPenalty;

      const bookmark = manager.setBookmark();
      try {
        if (search !== "PRIORITY") solver.setLogLevel(0);
        const answer = chooseResourceSemantic(solver, candidate, data);
        const answerDate = new PlanningDate(data.state.a_date);
        if (answerDate.compare(minimumNextDate) < 0) minimumNextDate = answerDate;
        if (data.state.a_qty > ROUNDING_ERROR && operationPlan.getQuantity() > 0) {
          if (search === "PRIORITY") {
            data.constrainedPlanning = originalPlanningMode;
            data.logConstraints = originalLogConstraints;
            solver.setLogLevel(originalLogLevel);
            return answer;
          }
          const plannedQuantity = operationPlan.getQuantity();
          const value = searchValue(search, data.state.a_cost - originalCost,
            data.state.a_penalty - originalPenalty, plannedQuantity, 0);
          if (value + ROUNDING_ERROR < bestValue
              || (Math.abs(value - bestValue) < ROUNDING_ERROR
                && plannedQuantity > (bestSelection?.quantity ?? Number.NEGATIVE_INFINITY))) {
            const selectedResource = loadPlan.getResource();
            if (selectedResource) {
              bestValue = value;
              bestSelection = {
                load: candidate,
                resource: selectedResource,
                state: new OperationPlanState(operationPlan),
                quantity: plannedQuantity,
              };
            }
          }
        }
      } catch (error) {
        manager.rollback(bookmark);
        restoreAssignment(loadPlan, originalLoad, originalResource, operationPlan, originalState);
        restoreQuestion(data, originalQuestion);
        data.state.a_cost = originalCost;
        data.state.a_penalty = originalPenalty;
        throw error;
      }
      manager.rollback(bookmark);
      restoreAssignment(loadPlan, originalLoad, originalResource, operationPlan, originalState);
      data.state.a_cost = originalCost;
      data.state.a_penalty = originalPenalty;
      solver.setLogLevel(originalLogLevel);
    }

    const unconstrainedFallback = !originalPlanningMode && !bestSelection;
    if (unconstrainedFallback) {
      const first = alternatives[0];
      if (first) {
        restoreAssignment(loadPlan, first, first.getResource() ?? originalResource, operationPlan, originalState);
        operationPlan.restore(originalState);
        syncQuestion(data, loadPlan, operationPlan);
        data.state.a_cost = originalCost;
        data.state.a_penalty = originalPenalty;
        data.constrainedPlanning = false;
        return chooseResourceSemantic(solver, first, data);
      }
    }

    if (bestSelection) {
      restoreAssignment(loadPlan, bestSelection.load, bestSelection.resource, operationPlan,
        bestSelection.state);
      operationPlan.restore(originalState);
      if (loadPlan.getResource() !== bestSelection.resource) {
        loadPlan.setResource(bestSelection.resource, false, false);
        operationPlan.restore(originalState);
      }
      syncQuestion(data, loadPlan, operationPlan);
      data.state.a_cost = originalCost;
      data.state.a_penalty = originalPenalty;
      data.constrainedPlanning = true;
      return solver.solve(bestSelection.resource, data);
    }

    restoreAssignment(loadPlan, originalLoad, originalResource, operationPlan, originalState);
    syncQuestion(data, loadPlan, operationPlan);
    data.state.a_qty = 0;
    data.state.a_date = minimumNextDate;
    return null;
  } catch (error) {
    restoreAssignment(loadPlan, originalLoad, originalResource, operationPlan, originalState);
    restoreQuestion(data, originalQuestion);
    data.state.a_cost = originalCost;
    data.state.a_penalty = originalPenalty;
    throw error;
  } finally {
    solver.setLogLevel(originalLogLevel);
    data.constrainedPlanning = originalPlanningMode;
    data.logConstraints = originalLogConstraints;
  }
}

/**
 * Semantic migration unit for src/solver/solverload.cpp.
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
  { name: "SolverCreate::chooseResource", sourceLine: 49, status: "adapted" },
  { name: "Plan::instance", sourceLine: 180, status: "adapted" },
  { name: "SolverCreate::solve", sourceLine: 374, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface SolverCreatePort {
  chooseResource(...args: readonly PortValue[]): PortValue | void;
  solve(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/solver/solverload.cpp";
export const targetFile = "solver/solverload.ts";

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
  "#include \"frepple/solver.h\"",
  "",
  "namespace frepple {",
  "",
  "bool sortLoad(const Load* lhs, const Load* rhs) {",
  "  auto l = lhs->getPriority();",
  "  auto r = rhs->getPriority();",
  "  if (!l) l = INT_MAX;",
  "  if (!r) r = INT_MAX;",
  "  if (l == r)",
  "    return lhs->getResource()->getEfficiency() <",
  "           rhs->getResource()->getEfficiency();",
  "  else",
  "    return l < r;",
  "}",
  "",
  "bool sortResource(const Resource* lhs, const Resource* rhs) {",
  "  if (lhs->getEfficiency() == rhs->getEfficiency())",
  "    return lhs->getName() < rhs->getName();",
  "  else",
  "    return lhs->getEfficiency() < rhs->getEfficiency();",
  "}",
  "",
  "void SolverCreate::chooseResource(",
  "    const Load* l, void* v)  // @todo handle unconstrained plan!!!!",
  "{",
  "  auto data = static_cast<SolverData*>(v);",
  "  auto lplan = data->state->q_loadplan;",
  "  if ((l->getResource()->getTool() || l->getResource()->getToolPerPiece()) &&",
  "      lplan->getOperationPlan()->getOwner() &&",
  "      lplan->getResource()->getOwner() &&",
  "      lplan->getOperationPlan()",
  "          ->getOwner()",
  "          ->getOperation()",
  "          ->hasType<OperationRouting>()) {",
  "    // Scan for other steps that use the same tool and same skill",
  "    auto routingopplan = lplan->getOperationPlan()->getOwner();",
  "    auto subopplans = routingopplan->getSubOperationPlans(false);",
  "    while (auto subopplan = subopplans.next()) {",
  "      if (subopplan == lplan->getOperationPlan()) continue;",
  "      auto subldplniter = subopplan->getLoadPlans();",
  "      while (auto subldpln = subldplniter.next()) {",
  "        if (subldpln->getLoad()->getResource() == l->getResource() &&",
  "            subldpln->getLoad()->getSkill() == l->getSkill()) {",
  "          // CASE 0: forced to use the same tool as other steps in this routing",
  "          // Switch to this resource and call the resource solver",
  "          auto originalend = lplan->getOperationPlan()->getEnd();",
  "          lplan->setResource(subldpln->getResource(), false, false);",
  "          lplan->getOperationPlan()->setEnd(originalend);",
  "          data->state->q_qty = lplan->getQuantity();",
  "          data->state->q_date = lplan->getDate();",
  "          lplan->getResource()->solve(*this, v);",
  "          return;",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  if ((!l->getSkill() && !l->getResource()->isGroup()) ||",
  "      lplan->getConfirmed() ||",
  "      lplan->getOperationPlan() == data->state->keepAssignments) {",
  "    // CASE 1: No skill involved, no aggregate resource and forced to keep",
  "    // the current resource assignments",
  "    lplan->getResource()->solve(*this, v);",
  "    return;",
  "  }",
  "",
  "  // CASE 2: Skill involved, or aggregate resource",
  "  short loglevel = getLogLevel();",
  "",
  "  // Control the planning mode",
  "  bool originalPlanningMode = data->constrainedPlanning;",
  "  data->constrainedPlanning = true;",
  "",
  "  // Don't keep track of the constraints right now",
  "  bool originalLogConstraints = data->logConstraints;",
  "  data->logConstraints = false;",
  "",
  "  // Initialize",
  "  Date min_next_date(Date::infiniteFuture);",
  "  Date original_q_date = data->state->q_date;",
  "  Resource* bestAlternateSelection = nullptr;",
  "  OperationPlanState bestAlternateState, firstAlternateState;",
  "  Resource* firstAlternate = nullptr;",
  "  bool qualified_resource_exists = false;",
  "  double bestAlternateValue = DBL_MAX;",
  "  double bestAlternateQuantity = DBL_MIN;",
  "  double beforeCost = data->state->a_cost;",
  "  double beforePenalty = data->state->a_penalty;",
  "  OperationPlanState originalOpplan(lplan->getOperationPlan());",
  "  setLogLevel(0);  // Silence during this loop",
  "",
  "  // Create flow and loadplans",
  "  if (lplan->getOperationPlan()->beginLoadPlans() ==",
  "      lplan->getOperationPlan()->endLoadPlans())",
  "    lplan->getOperationPlan()->createFlowLoads();",
  "",
  "  // Build a list of candidate resources",
  "  vector<Resource*> res_stack;",
  "  if (l->getResource()->isGroup()) {",
  "    for (auto c1 = l->getResource()->getMembers(); c1 != Resource::end();",
  "         ++c1) {",
  "      if (c1->isGroup()) {",
  "        for (auto c2 = c1->getMembers(); c2 != Resource::end(); ++c2) {",
  "          if (c2->isGroup()) {",
  "            for (auto c3 = c2->getMembers(); c3 != Resource::end(); ++c3) {",
  "              if (c3->isGroup()) {",
  "                for (auto c4 = c3->getMembers(); c4 != Resource::end(); ++c4) {",
  "                  if (c4->isGroup()) {",
  "                    for (auto c5 = c4->getMembers(); c5 != Resource::end();",
  "                         ++c5) {",
  "                      if (c5->isGroup())",
  "                        logger << \"Warning: Resource \"",
  "                                  \"hierarchies can only have up to 5 levels\"",
  "                               << '\\n';",
  "                      else",
  "                        res_stack.push_back(&*c5);",
  "                    }",
  "                  } else",
  "                    res_stack.push_back(&*c4);",
  "                }",
  "              } else",
  "                res_stack.push_back(&*c3);",
  "            }",
  "          } else",
  "            res_stack.push_back(&*c2);",
  "        }",
  "      } else",
  "        res_stack.push_back(&*c1);",
  "    }",
  "    // Sort the list by efficiciency and name",
  "    sort(res_stack.begin(), res_stack.end(), sortResource);",
  "  } else",
  "    res_stack.push_back(l->getResource());",
  "",
  "  // Loop over all candidate resources",
  "  while (!res_stack.empty()) {",
  "    // Pick next resource",
  "    Resource* res = res_stack.back();",
  "    res_stack.pop_back();",
  "",
  "    // Check if the resource has the right skill",
  "    // TODO if there is a date effective skill, we need to consider it in the",
  "    // reply",
  "    ResourceSkill* rscSkill = nullptr;",
  "    if (l->getSkill() && !res->hasSkill(l->getSkill(), originalOpplan.start,",
  "                                        originalOpplan.end, &rscSkill))",
  "      continue;",
  "    if (rscSkill && !rscSkill->getPriority())",
  "      // Skip 0-priority alternates",
  "      continue;",
  "",
  "    // Avoid double allocations to the same resource",
  "    if (lplan->getLoad()->getResource()->isGroup() &&",
  "        Plan::instance().getIndividualPoolResources()) {",
  "      bool exists = false;",
  "      for (auto g = lplan->getOperationPlan()->getLoadPlans();",
  "           g != lplan->getOperationPlan()->endLoadPlans() && &*g != lplan &&",
  "           g->getQuantity() < 0.0;",
  "           ++g) {",
  "        if (g->getResource() == res) {",
  "          exists = true;",
  "          break;",
  "        }",
  "      }",
  "      if (exists) {",
  "        qualified_resource_exists = true;",
  "        continue;",
  "      }",
  "    }",
  "",
  "    // Switch to this resource",
  "    data->state->q_loadplan = lplan;  // because q_loadplan can change!",
  "    lplan->getOperationPlan()->setStartEndAndQuantity(",
  "        originalOpplan.start, originalOpplan.end, originalOpplan.quantity);",
  "    lplan->setResource(res, false, false);",
  "    if (lplan->getResource()->getToolPerPiece() &&",
  "        lplan->getLoad()->getQuantity()) {",
  "      double mx = lplan->getMax();",
  "      if (-lplan->getQuantity() > mx + ROUNDING_ERROR) {",
  "        lplan->getOperationPlan()->setQuantity(",
  "            mx / lplan->getLoad()->getQuantity(), true);",
  "        if (!lplan->getOperationPlan()->getQuantity())",
  "          // We have less tools available than the operation size minimum",
  "          continue;",
  "        lplan->getOperationPlan()->setEnd(originalOpplan.end);",
  "        if (data->state->q_qty_min > lplan->getOperationPlan()->getQuantity()) {",
  "          // Assure we don't reject this answer as too small!",
  "          data->state->forceAccept = true;",
  "          data->state->q_qty_min = lplan->getOperationPlan()->getQuantity();",
  "        }",
  "      }",
  "    } else",
  "      lplan->getOperationPlan()->setEnd(originalOpplan.end);",
  "    data->state->q_qty = lplan->getQuantity();",
  "    data->state->q_date = lplan->getDate();",
  "    qualified_resource_exists = true;",
  "",
  "    // Remember the first alternate",
  "    if (!firstAlternate) {",
  "      firstAlternate = res;",
  "      firstAlternateState = lplan->getOperationPlan();",
  "    }",
  "",
  "    // Plan the resource",
  "    auto topcommand = data->getCommandManager()->setBookmark();",
  "    try {",
  "      res->solve(*this, data);",
  "    } catch (...) {",
  "      setLogLevel(loglevel);",
  "      data->constrainedPlanning = originalPlanningMode;",
  "      data->logConstraints = originalLogConstraints;",
  "      data->getCommandManager()->rollback(topcommand);",
  "      throw;",
  "    }",
  "    data->getCommandManager()->rollback(topcommand);",
  "",
  "    // Evaluate the result",
  "    if (data->state->a_qty > ROUNDING_ERROR &&",
  "        lplan->getOperationPlan()->getQuantity() > 0) {",
  "      double deltaCost = data->state->a_cost - beforeCost;",
  "      double deltaPenalty = data->state->a_penalty - beforePenalty;",
  "      // Message",
  "      if (loglevel > 1)",
  "        logger << indentlevel << \"  Operation '\" << l->getOperation()",
  "               << \"' evaluates alternate '\" << res << \"': cost \" << deltaCost",
  "               << \", penalty \" << deltaPenalty << '\\n';",
  "      data->state->a_cost = beforeCost;",
  "      data->state->a_penalty = beforePenalty;",
  "      double val = 0.0;",
  "      switch (l->getSearch()) {",
  "        case SearchMode::PRIORITY:",
  "          val = rscSkill ? rscSkill->getPriority() : 0;",
  "          break;",
  "        case SearchMode::MINCOST:",
  "          val = deltaCost / lplan->getOperationPlan()->getQuantity();",
  "          break;",
  "        case SearchMode::MINPENALTY:",
  "          val = deltaPenalty / lplan->getOperationPlan()->getQuantity();",
  "          break;",
  "        case SearchMode::MINCOSTPENALTY:",
  "          val = (deltaCost + deltaPenalty) /",
  "                lplan->getOperationPlan()->getQuantity();",
  "          break;",
  "        default:",
  "          throw LogicException(\"Unsupported search mode for alternate load\");",
  "      }",
  "      if (val + ROUNDING_ERROR < bestAlternateValue ||",
  "          (fabs(val - bestAlternateValue) < ROUNDING_ERROR &&",
  "           lplan->getOperationPlan()->getQuantity() > bestAlternateQuantity)) {",
  "        // Found a better alternate",
  "        bestAlternateValue = val;",
  "        bestAlternateSelection = res;",
  "        bestAlternateState = OperationPlanState(lplan->getOperationPlan());",
  "        bestAlternateQuantity = lplan->getOperationPlan()->getQuantity();",
  "      }",
  "    } else if (loglevel > 1)",
  "      logger << indentlevel << \"  Operation '\" << l->getOperation()",
  "             << \"' evaluates alternate '\" << lplan->getResource()",
  "             << \"': not available before \" << data->state->a_date << '\\n';",
  "",
  "    // Keep track of best next date",
  "    if (data->state->a_date < min_next_date)",
  "      min_next_date = data->state->a_date;",
  "  }",
  "  setLogLevel(loglevel);",
  "",
  "  // Not a single resource has the appropriate skills. You're joking?",
  "  if (!qualified_resource_exists) {",
  "    stringstream s;",
  "    s << \"No subresource of '\" << l->getResource() << \"' has the skill '\"",
  "      << l->getSkill() << \"' required for operation '\" << l->getOperation()",
  "      << \"'\";",
  "    throw DataException(s.str());",
  "  }",
  "",
  "  // Restore the best candidate we found in the loop above",
  "  if (bestAlternateSelection) {",
  "    // Message",
  "    if (loglevel > 1)",
  "      logger << indentlevel << \"  Operation '\" << l->getOperation()",
  "             << \"' chooses alternate '\" << bestAlternateSelection << \"' \"",
  "             << l->getSearch() << '\\n';",
  "",
  "    // Switch back",
  "    data->state->q_loadplan = lplan;  // because q_loadplan can change!",
  "    data->state->a_cost = beforeCost;",
  "    data->state->a_penalty = beforePenalty;",
  "",
  "    if (lplan->getResource() != bestAlternateSelection) {",
  "      lplan->getOperationPlan()->clearSetupEvent();",
  "      lplan->getOperationPlan()->setStartEndAndQuantity(",
  "          bestAlternateState.start, bestAlternateState.end,",
  "          bestAlternateState.quantity);",
  "      lplan->setResource(bestAlternateSelection, false, false);",
  "    }",
  "    data->state->q_qty = lplan->getQuantity();",
  "    data->state->q_date = lplan->getDate();",
  "    bestAlternateSelection->solve(*this, data);",
  "",
  "    // Restore the planning mode",
  "    data->constrainedPlanning = originalPlanningMode;",
  "    data->logConstraints = originalLogConstraints;",
  "    return;",
  "  }",
  "",
  "  if (!originalPlanningMode) {",
  "    // No alternate gave a good result in an unconstrained plan",
  "    if (lplan->getResource() != firstAlternate ||",
  "        !lplan->getOperationPlan()->getQuantity()) {",
  "      lplan->getOperationPlan()->clearSetupEvent();",
  "      lplan->getOperationPlan()->setStartEndAndQuantity(",
  "          firstAlternateState.start, firstAlternateState.end,",
  "          firstAlternateState.quantity);",
  "      lplan->setResource(firstAlternate, false, false);",
  "    }",
  "    data->state->a_qty = lplan->getQuantity();",
  "    data->state->a_date = lplan->getDate();",
  "",
  "    // Restore the planning mode",
  "    data->constrainedPlanning = originalPlanningMode;",
  "    data->logConstraints = originalLogConstraints;",
  "",
  "    if (loglevel > 1)",
  "      logger << indentlevel << \"Alternate load overloads alternate \"",
  "             << firstAlternate << '\\n';",
  "  } else {",
  "    // No alternate gave a good result in a constrained plan",
  "    data->state->a_date = max(min_next_date, original_q_date);",
  "    data->state->a_qty = 0;",
  "",
  "    // Maintain the constraint list",
  "    if (originalLogConstraints && data->constraints)",
  "      data->constraints->push(ProblemCapacityOverload::metadata,",
  "                              l->getResource(), originalOpplan.start,",
  "                              originalOpplan.end, 0.0, l->getOperation());",
  "",
  "    // Restore the planning mode",
  "    data->constrainedPlanning = originalPlanningMode;",
  "    data->logConstraints = originalLogConstraints;",
  "",
  "    if (loglevel > 1)",
  "      logger << indentlevel",
  "             << \"  Alternate load doesn't find supply on any alternate: \"",
  "             << \"not available before \" << data->state->a_date << '\\n';",
  "  }",
  "}",
  "",
  "void SolverCreate::solve(const Load* l, void* v) {",
  "  // Note: This method is only called for decrease loadplans and for the leading",
  "  // load of an alternate group. See SolverCreate::checkOperation",
  "  auto* data = static_cast<SolverData*>(v);",
  "",
  "  if ((!l->hasAlternates() && !l->getAlternate()) ||",
  "      data->state->q_loadplan->getConfirmed()) {",
  "    // CASE I: It is not an alternate load.",
  "    // Delegate the answer immediately to the resource",
  "    chooseResource(l, data);",
  "    return;",
  "  }",
  "",
  "  // CASE II: It is an alternate load.",
  "  // We ask each alternate load in order of priority till we find a load",
  "  // that has a non-zero reply.",
  "  short loglevel = getLogLevel();",
  "",
  "  // 1) collect a list of alternates",
  "  list<const Load*> thealternates;",
  "  const Load* x = l->hasAlternates() ? l : l->getAlternate();",
  "  SearchMode search = l->getSearch();",
  "  for (const auto& i : l->getOperation()->getLoads())",
  "    if ((i.getAlternate() == x || &i == x) && i.getPriority() &&",
  "        i.getEffective().within(data->state->q_loadplan->getDate()))",
  "      thealternates.push_back(&i);",
  "",
  "  // 2) Sort the list",
  "  thealternates.sort(sortLoad);  // @todo cpu-intensive - better is to maintain",
  "                                 // the list in the correct order",
  "",
  "  // 3) Control the planning mode",
  "  bool originalPlanningMode = data->constrainedPlanning;",
  "  data->constrainedPlanning = true;",
  "",
  "  // Don't keep track of the constraints right now",
  "  bool originalLogConstraints = data->logConstraints;",
  "  data->logConstraints = false;",
  "",
  "  // 4) Loop through all alternates or till we find a non-zero",
  "  // reply (priority search)",
  "  Date min_next_date(Date::infiniteFuture);",
  "  LoadPlan* lplan = data->state->q_loadplan;",
  "  double bestAlternateValue = DBL_MAX;",
  "  double bestAlternateQuantity = DBL_MIN;",
  "  const Load* bestAlternateSelection = nullptr;",
  "  double beforeCost = data->state->a_cost;",
  "  double beforePenalty = data->state->a_penalty;",
  "  OperationPlanState originalOpplan(lplan->getOperationPlan());",
  "  for (auto i = thealternates.begin(); i != thealternates.end();) {",
  "    const Load* curload = *i;",
  "    data->state->q_loadplan = lplan;  // because q_loadplan can change!",
  "",
  "    // 4a) Switch to this load",
  "    if (lplan->getLoad() != curload) lplan->setLoad(const_cast<Load*>(curload));",
  "    lplan->getOperationPlan()->setQuantity(originalOpplan.quantity);",
  "    lplan->getOperationPlan()->setEnd(originalOpplan.end);",
  "    data->state->q_qty = lplan->getQuantity();",
  "    data->state->q_date = lplan->getDate();",
  "",
  "    // 4b) Ask the resource",
  "    // TODO XXX Need to insert another loop here! It goes over all resources",
  "    // qualified for the required skill. The qualified resources need to be",
  "    // sorted based on their cost. If the cost is the same we should use a",
  "    // decent tie breaker, eg number of skills or number of loads. The first",
  "    // resource with the qualified skill that is available will be used.",
  "    auto topcommand = data->getCommandManager()->setBookmark();",
  "    if (search == SearchMode::PRIORITY)",
  "      curload->getResource()->solve(*this, data);",
  "    else {",
  "      setLogLevel(0);",
  "      try {",
  "        curload->getResource()->solve(*this, data);",
  "      } catch (...) {",
  "        setLogLevel(loglevel);",
  "        // Restore the planning mode",
  "        data->constrainedPlanning = originalPlanningMode;",
  "        data->logConstraints = originalLogConstraints;",
  "        throw;",
  "      }",
  "      setLogLevel(loglevel);",
  "    }",
  "",
  "    // 4c) Evaluate the result",
  "    if (data->state->a_qty > ROUNDING_ERROR &&",
  "        lplan->getOperationPlan()->getQuantity() > 0) {",
  "      if (search == SearchMode::PRIORITY) {",
  "        // Priority search: accept any non-zero reply",
  "        // Restore the planning mode",
  "        data->constrainedPlanning = originalPlanningMode;",
  "        data->logConstraints = originalLogConstraints;",
  "        return;",
  "      } else {",
  "        // Other search modes: evaluate all",
  "        double deltaCost = data->state->a_cost - beforeCost;",
  "        double deltaPenalty = data->state->a_penalty - beforePenalty;",
  "        // Message",
  "        if (loglevel > 1 && search != SearchMode::PRIORITY)",
  "          logger << indentlevel << \"Operation '\" << l->getOperation()",
  "                 << \"' evaluates alternate '\" << curload->getResource()",
  "                 << \"': cost \" << deltaCost << \", penalty \" << deltaPenalty",
  "                 << '\\n';",
  "        if (deltaCost < ROUNDING_ERROR && deltaPenalty < ROUNDING_ERROR) {",
  "          // Zero cost and zero penalty on this alternate. It won't get any",
  "          // better than this, so we accept this alternate.",
  "          if (loglevel > 1)",
  "            logger << indentlevel << \"Operation '\" << l->getOperation()",
  "                   << \"' chooses alternate '\" << curload->getResource() << \"' \"",
  "                   << search << '\\n';",
  "          // Restore the planning mode",
  "          data->constrainedPlanning = originalPlanningMode;",
  "          data->logConstraints = originalLogConstraints;",
  "          return;",
  "        }",
  "        data->state->a_cost = beforeCost;",
  "        data->state->a_penalty = beforePenalty;",
  "        double val = 0.0;",
  "        switch (search) {",
  "          case SearchMode::MINCOST:",
  "            val = deltaCost / lplan->getOperationPlan()->getQuantity();",
  "            break;",
  "          case SearchMode::MINPENALTY:",
  "            val = deltaPenalty / lplan->getOperationPlan()->getQuantity();",
  "            break;",
  "          case SearchMode::MINCOSTPENALTY:",
  "            val = (deltaCost + deltaPenalty) /",
  "                  lplan->getOperationPlan()->getQuantity();",
  "            break;",
  "          default:",
  "            throw LogicException(\"Unsupported search mode for alternate load\");",
  "        }",
  "        if (val + ROUNDING_ERROR < bestAlternateValue ||",
  "            (fabs(val - bestAlternateValue) < ROUNDING_ERROR &&",
  "             lplan->getOperationPlan()->getQuantity() >",
  "                 bestAlternateQuantity)) {",
  "          // Found a better alternate",
  "          bestAlternateValue = val;",
  "          bestAlternateSelection = curload;",
  "          bestAlternateQuantity = lplan->getOperationPlan()->getQuantity();",
  "        }",
  "      }",
  "    } else if (loglevel > 1 && search != SearchMode::PRIORITY)",
  "      logger << indentlevel << \"Operation '\" << l->getOperation()",
  "             << \"' evaluates alternate '\" << curload->getResource()",
  "             << \"': not available before \" << data->state->a_date << '\\n';",
  "",
  "    // 4d) Undo the plan on the alternate",
  "    data->getCommandManager()->rollback(topcommand);",
  "",
  "    // 4e) Prepare for the next alternate",
  "    if (data->state->a_date < min_next_date)",
  "      min_next_date = data->state->a_date;",
  "    if (++i != thealternates.end() && loglevel > 1 &&",
  "        search == SearchMode::PRIORITY)",
  "      logger << indentlevel << \"  Alternate load switches from '\"",
  "             << curload->getResource() << \"' to '\" << (*i)->getResource() << \"'\"",
  "             << '\\n';",
  "  }",
  "",
  "  // 5) Unconstrained plan: plan on the first alternate",
  "  if (!originalPlanningMode &&",
  "      !(search != SearchMode::PRIORITY && bestAlternateSelection)) {",
  "    // Switch to unconstrained planning",
  "    data->constrainedPlanning = false;",
  "    bestAlternateSelection = *(thealternates.begin());",
  "  }",
  "",
  "  // 6) Finally replan on the best alternate",
  "  if (!originalPlanningMode ||",
  "      (search != SearchMode::PRIORITY && bestAlternateSelection)) {",
  "    // Message",
  "    if (loglevel > 1)",
  "      logger << indentlevel << \"  Operation '\" << l->getOperation()",
  "             << \"' chooses alternate '\" << bestAlternateSelection->getResource()",
  "             << \"' \" << search << '\\n';",
  "",
  "    // Switch back",
  "    data->state->q_loadplan = lplan;  // because q_loadplan can change!",
  "    data->state->a_cost = beforeCost;",
  "    data->state->a_penalty = beforePenalty;",
  "    if (lplan->getLoad() != bestAlternateSelection)",
  "      lplan->setLoad(const_cast<Load*>(bestAlternateSelection));",
  "    lplan->getOperationPlan()->restore(originalOpplan);",
  "    // TODO XXX need to restore also the selected resource with the right skill!",
  "    data->state->q_qty = lplan->getQuantity();",
  "    data->state->q_date = lplan->getDate();",
  "    bestAlternateSelection->getResource()->solve(*this, data);",
  "",
  "    // Restore the planning mode",
  "    data->constrainedPlanning = originalPlanningMode;",
  "    data->logConstraints = originalLogConstraints;",
  "    return;",
  "  }",
  "",
  "  // 7) No alternate gave a good result",
  "  data->state->a_date = min_next_date;",
  "  data->state->a_qty = 0;",
  "",
  "  // Restore the planning mode",
  "  data->constrainedPlanning = originalPlanningMode;",
  "",
  "  // Maintain the constraint list",
  "  if (originalLogConstraints && data->constraints) {",
  "    const Load* primary = *(thealternates.begin());",
  "    data->constraints->push(ProblemCapacityOverload::metadata,",
  "                            primary->getResource(), originalOpplan.start,",
  "                            originalOpplan.end, 0.0, primary->getOperation());",
  "  }",
  "  data->logConstraints = originalLogConstraints;",
  "",
  "  if (loglevel > 1)",
  "    logger << indentlevel",
  "           << \"  Alternate load doesn't find supply on any alternate: \"",
  "           << \"not available before \" << data->state->a_date << '\\n';",
  "}",
  "",
  "}  // namespace frepple",
];
