import { Demand, DemandGroup } from "../model/demand.js";
import { CommandCreateOperationPlan } from "../model/actions.js";
import { OperationItemDistribution } from "../model/itemdistribution.js";
import { OperationItemSupplier } from "../model/itemsupplier.js";
import { OperationDelivery } from "../model/operation.js";
import { OperationPlan } from "../model/operationplan.js";
import { Date as PlanningDate, Duration } from "../utils/date.js";
import { CommandList, CommandManager } from "../utils/actions.js";
import type { SolverCreate, SolverCreateSolverData } from "./solverplan.js";

const traceScheduling = process.env.FREPPLE_TS_TRACE === "1";

function traceDemand(message: string, details: Readonly<Record<string, unknown>>): void {
  if (traceScheduling) process.stderr.write(`[demand] ${message} ${JSON.stringify(details)}\n`);
}

interface DemandSolveOptions {
  readonly firstDate?: PlanningDate;
  readonly lastDate?: PlanningDate;
  readonly minimumOverride?: number;
  readonly allowCommit?: boolean;
  readonly invokeUserExit?: boolean;
  readonly allowInquiry?: boolean;
}

interface DemandSolveResult {
  readonly plan: OperationPlan | null;
  readonly success: boolean;
  readonly nextDate: PlanningDate;
}

/** Plan an individual demand while honoring minimum shipment and lateness. */
function solveDemandLineSemantic(
  solver: SolverCreate,
  demand: Demand,
  data: SolverCreateSolverData,
  options: DemandSolveOptions = {},
): DemandSolveResult {
  const roundingError = 0.000001;
  if (options.invokeUserExit !== false) solver.getUserExitDemand()?.(demand, solver, data);
  const remaining = Math.max(0, demand.getQuantity() - demand.getPlannedQuantity());
  const statusAllowed = [Demand.STATUS_OPEN, Demand.STATUS_QUOTE].includes(demand.getStatus())
    || (options.allowInquiry === true && demand.getStatus() === Demand.STATUS_INQUIRY);
  if (remaining <= roundingError || !statusAllowed) {
    data.state.a_qty = 0;
    return { plan: null, success: remaining <= roundingError, nextDate: PlanningDate.infiniteFuture };
  }
  const operation = demand.getDeliveryOperation();
  if (!operation) {
    data.state.a_qty = 0;
    data.state.a_date = PlanningDate.infiniteFuture;
    return { plan: null, success: false, nextDate: PlanningDate.infiniteFuture };
  }

  data.state.curDemand = demand;
  data.state.curBatch = demand.getBatch();
  const firstDate = options.firstDate
    ? new PlanningDate(options.firstDate)
    : demand.getDue().subtract(solver.getAdministrativeLeadTime());
  const lastDate = options.lastDate
    ? new PlanningDate(options.lastDate)
    : demand.getDue().add(demand.getMaxLateness());
  const minimum = Math.max(0, options.minimumOverride ?? demand.getMinShipment());
  const allowCommit = options.allowCommit !== false;
  let planQuantity = Math.max(remaining, minimum);
  let requestDate = firstDate;
  let attempts = 0;
  let acceptedPlan: OperationPlan | null = null;
  let bestAnswer = 0;
  let bestAsked = 0;
  let bestDate = new PlanningDate(firstDate);
  const manager = data.getCommandManager() ?? solver.getCommandManager();

  // Native cluster-0 auto deliveries are answered as delivery plans only.
  // Their material graph belongs to the upstream cluster and is handled by
  // the safety-stock pass, so it must not be re-entered from this demand pass.
  const solveDelivery = (): OperationPlan | null => {
    const previousPropagate = data.propagate;
    if (data.cluster === 0 && operation instanceof OperationDelivery) data.propagate = false;
    try {
      const result = solver.solve(operation, data);
      return result instanceof OperationPlan ? result : null;
    } finally {
      data.propagate = previousPropagate;
    }
  };

  const ask = (quantity: number, date: PlanningDate): OperationPlan | null => {
    data.state.q_qty = quantity;
    data.state.q_qty_min = minimum;
    data.state.q_date = new PlanningDate(date);
    data.state.q_date_max = new PlanningDate(lastDate);
    data.state.curDemand = demand;
    data.state.curBatch = demand.getBatch();
    data.state.curBuffer = null;
    data.state.curOwnerOpplan = null;
    data.state.forceAccept = false;
    data.state.keepAssignments = null;
    data.accept_partial_reply = false;
    data.broken_path = false;
    // C++ starts every demand probe with a fresh material-path and dependency
    // context. Reusing either collection leaks the previous probe into the
    // next one and can turn a valid retry into a false loop/broken-path reply.
    data.clearRecentBuffers();
    data.clearDependencies();
    data.setConstraintOwner(demand.getConstraints());
    const result = solveDelivery();
    return result instanceof OperationPlan ? result : null;
  };

  const coordinatedAccept = (
    initialRemainder: number,
    date: PlanningDate,
    stopAtMinimum = false,
  ): { plan: OperationPlan | null; quantity: number } => {
    let remainder = Math.max(0, initialRemainder);
    let accepted = 0;
    let lastPlan: OperationPlan | null = null;
    let tries = 7;
    let coordinationDate = new PlanningDate(date);
    let coordinationFlag = true;
    const coordinationStep = new Duration(24 * 3600);
    const previousCoordinationRun = data.coordination_run;

    try {
      while (remainder > roundingError && (!stopAtMinimum || remainder > minimum)) {
        data.state.q_qty = remainder;
        data.state.q_qty_min = minimum;
        data.state.q_date = new PlanningDate(coordinationDate);
        data.state.q_date_max = new PlanningDate(lastDate);
        data.state.curDemand = demand;
        data.state.curBatch = demand.getBatch();
        data.state.curBuffer = null;
        data.state.curOwnerOpplan = null;
        data.state.forceAccept = false;
        data.state.keepAssignments = null;
        data.state.dependency = null;
        data.state.blockedOpplan = null;
        data.coordination_run = coordinationFlag;
        data.accept_partial_reply = false;
        data.broken_path = false;
        data.setConstraintOwner(demand.getConstraints());
        data.clearDependencies();
        data.clearRecentBuffers();

        const result = solveDelivery();
        const answer = Math.max(0, data.state.a_qty);
        if (answer < roundingError) {
          if (coordinationFlag) {
            coordinationFlag = false;
          } else if (tries-- > 0) {
            coordinationFlag = true;
            coordinationDate = coordinationDate.subtract(coordinationStep) as PlanningDate;
          } else {
            break;
          }
          continue;
        }

        if (result instanceof OperationPlan) lastPlan = result;
        coordinationFlag = true;
        accepted += answer;
        remainder = Math.max(0, remainder - answer);
      }
    } finally {
      data.coordination_run = previousCoordinationRun;
    }

    data.state.a_qty = accepted;
    return { plan: lastPlan, quantity: accepted };
  };

  // Native frePPLe uses a do-while loop: even zero max-lateness gets one
  // planning attempt on the requested delivery date.
  while (true) {
    attempts += 1;
    traceDemand("attempt", {
      demand: demand.getName(), attempt: attempts, quantity: planQuantity,
      requestDate: requestDate.toString(), lastDate: lastDate.toString(),
    });
    const bookmark = manager.setBookmark();
    let askedQuantity = planQuantity;
    let result = ask(planQuantity, requestDate);
    let answer = Math.max(0, data.state.a_qty);
    let nextDate = new PlanningDate(data.state.a_date);
    traceDemand("reply", {
      demand: demand.getName(), attempt: attempts,
      result: result instanceof OperationPlan, quantity: answer,
      date: data.state.a_date.toString(),
    });

    // When the complete ask has no answer, retry the minimum shipment and use
    // the same integer bisection as solverdemand.cpp to find the largest
    // positive reply. Every probe is transactional.
    if (answer < roundingError && planQuantity > minimum && minimum > 0) {
      manager.rollback(bookmark);
      result = ask(minimum, requestDate);
      answer = Math.max(0, data.state.a_qty);
      if (data.state.a_date.compare(nextDate) < 0) nextDate = new PlanningDate(data.state.a_date);
      if (answer > roundingError) {
        let low = minimum;
        let high = planQuantity;
        let delta = Math.abs(high - low);
        while (delta > solver.getIterationAccuracy() * demand.getQuantity()
          && delta > solver.getIterationThreshold()) {
          let probe = Math.floor((low + high) / 2);
          if (probe === low) {
            probe += 1;
            if (probe > high) break;
          }
          manager.rollback(bookmark);
          result = ask(probe, requestDate);
          answer = Math.max(0, data.state.a_qty);
          if (data.state.a_date.compare(nextDate) < 0) nextDate = new PlanningDate(data.state.a_date);
          if (answer > roundingError) low = probe;
          else high = probe;
          delta = Math.abs(high - low);
        }
        askedQuantity = low;
        if (answer <= roundingError) {
          manager.rollback(bookmark);
          result = ask(low, requestDate);
          answer = Math.max(0, data.state.a_qty);
        }
      }
    }

    const forceAccept = data.state.forceAccept;
    const remainder = planQuantity - answer;
    const rejected = answer < roundingError
      || (answer + roundingError < minimum && !forceAccept)
      || (remainder < minimum && answer < planQuantity - roundingError && !forceAccept);

    if (rejected) {
      if (remainder < minimum && answer + roundingError >= minimum
        && !forceAccept && answer > bestAnswer) {
        bestAnswer = answer;
        bestAsked = askedQuantity;
        bestDate = new PlanningDate(requestDate);
      }

      const copyDate = new PlanningDate(requestDate);
      if (answer > roundingError && remainder < minimum && remainder > roundingError) {
        if (data.broken_path) {
          requestDate = new PlanningDate(PlanningDate.infiniteFuture);
        } else if (solver.hasOperationPlans(manager)
          || nextDate.compare(copyDate.add(solver.getLazyDelay())) < 0) {
          requestDate = copyDate.add(solver.getLazyDelay());
        } else {
          requestDate = new PlanningDate(nextDate);
        }
      } else if (nextDate.compare(copyDate) <= 0 || answer > roundingError) {
        requestDate = copyDate.add(solver.getLazyDelay());
      } else if (solver.getMinimumDelay().seconds > 0
        && copyDate.add(solver.getMinimumDelay()).compare(nextDate) > 0) {
        requestDate = copyDate.add(solver.getMinimumDelay());
      } else {
        requestDate = new PlanningDate(nextDate);
      }
      manager.rollback(bookmark);
    } else {
      let acceptedQuantity = answer;
      if (answer + roundingError < askedQuantity) {
        manager.rollback(bookmark);
        const coordinated = coordinatedAccept(answer, requestDate);
        acceptedQuantity = coordinated.quantity;
        result = coordinated.plan;
        if (acceptedQuantity <= roundingError) {
          manager.rollback(bookmark);
          break;
        }
      }

      acceptedPlan = result;
      planQuantity = Math.max(0, planQuantity - acceptedQuantity);
      bestAnswer = 0;
      if (solver.getAutocommit() && allowCommit) solver.commit();
    }

    if (planQuantity <= roundingError) break;
    const retryAllowed = solver.getPlanType() !== 2
      ? requestDate.compare(lastDate) < 0
      : !data.constrainedPlanning
        ? requestDate.compare(lastDate) < 0
        : requestDate.compare(firstDate) === 0;
    if (!retryAllowed) break;
  }

  // A reply can be temporarily rejected because accepting it would leave a
  // remainder below minshipment. If no better reply appears before the
  // lateness fence, C++ recreates and accepts that best partial answer.
  if (bestAnswer > roundingError && data.constrainedPlanning) {
    const coordinated = coordinatedAccept(bestAsked, bestDate, true);
    if (coordinated.plan) acceptedPlan = coordinated.plan;
    if (solver.getAutocommit() && allowCommit) solver.commit();
  }

  const nextDate = new PlanningDate(requestDate);
  if (!acceptedPlan) {
    data.state.a_qty = 0;
    data.state.a_date = PlanningDate.infiniteFuture;
  }
  return { plan: acceptedPlan, success: planQuantity <= roundingError, nextDate };
}

function solveDemandGroupSemantic(
  solver: SolverCreate,
  group: DemandGroup,
  data: SolverCreateSolverData,
): OperationPlan | null {
  const roundingError = 0.000001;
  const policy = group.getPolicy();
  solver.getUserExitDemand()?.(group, solver, data);
  const members = [...group.getMembers()].filter((member) => {
    const open = [Demand.STATUS_OPEN, Demand.STATUS_QUOTE].includes(member.getStatus());
    const inquiry = member.getStatus() === Demand.STATUS_INQUIRY
      && group.getStatus() === Demand.STATUS_INQUIRY;
    return member.getQuantity() - member.getPlannedQuantity() > roundingError
      && !member.getDue().equals(PlanningDate.infiniteFuture)
      && (open || inquiry);
  });
  if (!members.length) {
    data.state.a_qty = 0;
    return null;
  }

  const manager = data.getCommandManager() ?? solver.getCommandManager();
  const topBookmark = manager.setBookmark();
  let deliveryDate = group.getDue().subtract(solver.getAdministrativeLeadTime());
  let lastPlan: OperationPlan | null = null;

  if (policy === Demand.POLICY_INRATIO) {
    for (const member of members) {
      const result = solveDemandLineSemantic(solver, member, data, {
        firstDate: deliveryDate,
        invokeUserExit: false,
        allowInquiry: group.getStatus() === Demand.STATUS_INQUIRY,
      });
      if (result.plan) lastPlan = result.plan;
    }
    return lastPlan;
  }
  if (policy !== Demand.POLICY_ALLTOGETHER) {
    manager.rollback(topBookmark);
    throw new Error("Unknown demand policy");
  }

  while (true) {
    let groupOk = true;
    let nextDeliveryDate = new PlanningDate(deliveryDate);
    for (const member of members) {
      const remaining = Math.max(0, member.getQuantity() - member.getPlannedQuantity());
      const result = solveDemandLineSemantic(solver, member, data, {
        firstDate: deliveryDate,
        lastDate: deliveryDate,
        minimumOverride: Math.max(remaining, member.getMinShipment()),
        allowCommit: false,
        invokeUserExit: false,
        allowInquiry: group.getStatus() === Demand.STATUS_INQUIRY,
      });
      if (result.plan) lastPlan = result.plan;
      if (!result.success) {
        groupOk = false;
        nextDeliveryDate = new PlanningDate(result.nextDate);
        break;
      }
    }

    if (groupOk) {
      if (solver.getAutocommit()) solver.commit();
      return lastPlan;
    }
    manager.rollback(topBookmark);
    if (nextDeliveryDate.equals(PlanningDate.infiniteFuture)) {
      data.state.a_qty = 0;
      data.state.a_date = PlanningDate.infiniteFuture;
      return null;
    }
    deliveryDate = new PlanningDate(nextDeliveryDate);
  }
}

export function solveDemandSemantic(
  solver: SolverCreate,
  demand: Demand,
  data: SolverCreateSolverData,
): OperationPlan | null {
  if (demand instanceof DemandGroup && demand.getPolicy() !== Demand.POLICY_INDEPENDENT) {
    return solveDemandGroupSemantic(solver, demand, data);
  }
  return solveDemandLineSemantic(solver, demand, data).plan;
}

export function hasOperationPlansSemantic(commands: CommandManager | CommandList): boolean {
  const commandLists = commands instanceof CommandManager
    ? [...commands].filter((bookmark) => bookmark.isActive())
    : [commands];
  for (const commandList of commandLists) {
    for (const command of commandList) {
      if (command instanceof CommandList && hasOperationPlansSemantic(command)) return true;
      if (!(command instanceof CommandCreateOperationPlan)) continue;
      const operationPlan = command.getOperationPlan();
      if (operationPlan && operationPlan.getQuantity() > 0 && !operationPlan.getDemand()
        && !(operationPlan.getOperation() instanceof OperationItemDistribution)) return true;
    }
  }
  return false;
}

export function scanExcessSemantic(commands: CommandManager | CommandList): void {
  const commandLists = commands instanceof CommandManager
    ? [...commands].filter((bookmark) => bookmark.isActive())
    : [commands];
  for (const commandList of commandLists) {
    for (const command of commandList) {
      if (command instanceof CommandList) {
        scanExcessSemantic(command);
        continue;
      }
      if (!(command instanceof CommandCreateOperationPlan)) continue;
      const operationPlan = command.getOperationPlan();
      if (!operationPlan) continue;
      const operationPlanExcess = operationPlan.isExcess();
      if (operationPlan.getQuantity() - operationPlanExcess < 0.000001) {
        command.rollback();
        continue;
      }
      const operation = operationPlan.getOperation();
      if (!operation || operation instanceof OperationItemSupplier) continue;
      for (const candidate of [...operation.getOperationPlans()]) {
        if (!(candidate instanceof OperationPlan) || candidate === operationPlan) continue;
        const candidateExcess = candidate.isExcess();
        if (operationPlan.getEnd().compare(candidate.getEnd()) < 0 && candidate.getProposed()
          && candidate.getQuantity() - candidateExcess < 0.000001) candidate.dispose();
      }
    }
  }
}

/**
 * Semantic migration unit for src/solver/solverdemand.cpp.
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
  { name: "SolverCreate::solve", sourceLine: 35, status: "adapted" },
  { name: "SolverCreate::scanExcess", sourceLine: 669, status: "adapted" },
  { name: "SolverCreate::scanExcess", sourceLine: 674, status: "adapted" },
  { name: "SolverCreate::hasOperationPlans", sourceLine: 723, status: "adapted" },
  { name: "SolverCreate::hasOperationPlans", sourceLine: 732, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface SolverCreatePort {
  hasOperationPlans(...args: readonly PortValue[]): PortValue | void;
  scanExcess(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/solver/solverdemand.cpp";
export const targetFile = "solver/solverdemand.ts";

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
  "bool compare_location(const pair<Location*, double>& a,",
  "                      const pair<Location*, double>& b) {",
  "  return a.second > b.second;",
  "}",
  "",
  "void SolverCreate::solve(const Demand* salesorder, void* v) {",
  "  typedef list<pair<Location*, double> > SortedLocation;",
  "  // Set a bookmark at the current command",
  "  auto* data = static_cast<SolverData*>(v);",
  "  auto topcommand = data->getCommandManager()->setBookmark();",
  "  auto topstate = data->state;",
  "",
  "  try {",
  "    // Call the user exit",
  "    if (userexit_demand)",
  "      userexit_demand.call(salesorder, PythonData(data->constrainedPlanning));",
  "    short loglevel = getLogLevel();",
  "",
  "    bool isGroup = salesorder->hasType<DemandGroup>();",
  "    auto policy = isGroup",
  "                      ? static_cast<const DemandGroup*>(salesorder)->getPolicy()",
  "                      : Demand::POLICY_INDEPENDENT;",
  "    if (policy == Demand::POLICY_INDEPENDENT) isGroup = false;",
  "",
  "    // Message",
  "    if (loglevel > 0) {",
  "      logger << \"Planning demand '\" << salesorder",
  "             << \"': \" << salesorder->getPriority() << \", \"",
  "             << salesorder->getDue();",
  "      if (isGroup) {",
  "        logger << \", group\";",
  "        indentlevel.level = 1;",
  "      } else {",
  "        logger << \", \" << salesorder->getQuantity();",
  "        indentlevel.level = 0;",
  "      }",
  "      if (!data->constrainedPlanning || !isConstrained())",
  "        logger << \" in unconstrained mode\";",
  "      logger << '\\n';",
  "    }",
  "",
  "    // Collect sales order lines in the group",
  "    vector<Demand*> salesorderlines;",
  "    if (isGroup) {",
  "      for (auto m = salesorder->getMembers(); m != Demand::end(); ++m)",
  "        if (m->getQuantity() - m->getPlannedQuantity() > ROUNDING_ERROR &&",
  "            m->getDue() < Date::infiniteFuture &&",
  "            (m->getStatus() == Demand::STATUS_OPEN ||",
  "             m->getStatus() == Demand::STATUS_QUOTE ||",
  "             (m->getStatus() == Demand::STATUS_INQUIRY &&",
  "              salesorder->getStatus() == Demand::STATUS_INQUIRY))) {",
  "          salesorderlines.push_back(&*m);",
  "        }",
  "    } else if (salesorder->getQuantity() - salesorder->getPlannedQuantity() >",
  "                   ROUNDING_ERROR &&",
  "               salesorder->getDue() < Date::infiniteFuture &&",
  "               salesorder->getStatus() != Demand::STATUS_INQUIRY)",
  "      salesorderlines.push_back(const_cast<Demand*>(salesorder));",
  "    if (salesorderlines.empty()) {",
  "      if (loglevel > 0) logger << \"  Nothing to be planned.\\n\";",
  "      return;",
  "    }",
  "",
  "    // Unattach previous delivery operationplans, if required.",
  "    if (getErasePreviousFirst()) {",
  "      for (auto l : salesorderlines) {",
  "        // Locked operationplans will NOT be deleted, and a part of the demand",
  "        // can still remain planned.",
  "        l->deleteOperationPlans(false, data->getCommandManager());",
  "",
  "        // Empty constraint list",
  "        l->getConstraints().clear();",
  "      }",
  "    }",
  "",
  "    auto delivery_date = salesorder->getDue();",
  "    delivery_date -= getAdministrativeLeadTime();",
  "    Date next_delivery_date = delivery_date;",
  "    Demand* group_buster = nullptr;",
  "    do {",
  "      bool group_ok = true;",
  "",
  "      for (auto l : salesorderlines) {",
  "        if (!group_ok)",
  "          // Another sales order line already failed.",
  "          // We can stop here and retry at another date.",
  "          break;",
  "",
  "        // Message",
  "        data->push();",
  "        if (isGroup && loglevel > 0) {",
  "          logger << indentlevel << \"Planning demand '\" << l",
  "                 << \"': \" << l->getPriority() << \", \" << l->getDue() << \", \"",
  "                 << l->getQuantity();",
  "          if (!data->constrainedPlanning || !isConstrained())",
  "            logger << \" in unconstrained mode\";",
  "          logger << '\\n';",
  "        }",
  "",
  "        // Track constraints or not",
  "        data->logConstraints = (getPlanType() == 1);",
  "",
  "        // Determine quantity and date for the planning loop",
  "        Date plan_date = delivery_date;",
  "        double plan_qty = l->getQuantity() - l->getPlannedQuantity();",
  "        if (plan_qty < l->getMinShipment()) plan_qty = l->getMinShipment();",
  "        auto minshipment = (policy == Demand::POLICY_ALLTOGETHER)",
  "                               ? plan_qty",
  "                               : l->getMinShipment();",
  "",
  "        // Temporary values to store the 'best-reply' so far",
  "        double best_q_qty = 0.0, best_a_qty = 0.0;",
  "        Date best_q_date;",
  "",
  "        // Check delivery operation",
  "        Operation* deliveryoper = l->getDeliveryOperation();",
  "        {",
  "          string problemtext =",
  "              string(\"Demand '\") + l->getName() + \"' has no delivery operation\";",
  "          Problem::iterator j = Problem::begin(const_cast<Demand*>(l), false);",
  "          while (j != Problem::end()) {",
  "            if (j->hasType<ProblemInvalidData>() &&",
  "                j->getDescription() == problemtext)",
  "              break;",
  "            ++j;",
  "          }",
  "          if (!deliveryoper) {",
  "            // Create a problem",
  "            if (j == Problem::end())",
  "              new ProblemInvalidData(const_cast<Demand*>(l), problemtext,",
  "                                     \"demand\", l->getDue(), l->getDue());",
  "            // Abort planning of this demand",
  "            throw DataException(\"Demand '\" + l->getName() +",
  "                                \"' can't be planned\");",
  "          } else",
  "            // Remove problem that may already exist",
  "            delete &*j;",
  "        }",
  "",
  "        // Plan over different locations if global_purchase flag is set",
  "        // Store the original location in a variable",
  "        Location* originalLocation = l->getLocation();",
  "        SortedLocation sortedLocation;",
  "        bool globalPurchase = l->getItem() ? l->getItem()->getBoolProperty(",
  "                                                 \"global_purchase\", false) &&",
  "                                                 data->constrainedPlanning",
  "                                           : false;",
  "        if (globalPurchase &&",
  "            plan_date >= l->getItem()->findEarliestPurchaseOrder(l->getBatch()))",
  "          // Global purchasing is only active until the receipt of the first",
  "          // proposed purchase order of this item. Beyond that date the initial",
  "          // excess is burnt off / redistributed, and every location buys for",
  "          // its local needs again.",
  "          globalPurchase = false;",
  "        if (globalPurchase) {",
  "          // iterate over locations and store them using the excess as a",
  "          // priority excess being onhand minus safety stock",
  "          Item* item = l->getItem();",
  "          Item::bufferIterator iter(item);",
  "",
  "          while (Buffer* buffer = iter.next()) {",
  "            // Make sure we don't pick original location.",
  "            // Also skip buffers that have a different batch.",
  "            if (buffer->getLocation() == originalLocation ||",
  "                buffer->getBatch() != l->getBatch())",
  "              continue;",
  "",
  "            // We need to calculate the excess",
  "            Calendar* ss_calendar = buffer->getMinimumCalendar();",
  "            double excess = 0;",
  "            if (ss_calendar) {",
  "              CalendarBucket* calendarBucket =",
  "                  ss_calendar->findBucket(data->state->q_date, true);",
  "              if (calendarBucket)",
  "                excess =",
  "                    buffer->getOnHand(l->getDue()) - calendarBucket->getValue();",
  "            } else",
  "              excess = buffer->getOnHand(l->getDue()) - buffer->getMinimum();",
  "            sortedLocation.emplace_front(buffer->getLocation(), excess);",
  "          }",
  "          // Let's now order the list of location",
  "          sortedLocation.sort(compare_location);",
  "        }",
  "",
  "        // Main planning loop for a sales order line",
  "        ++indentlevel;",
  "        bool hasOverdueConstraint = false;",
  "        Problem::iterator i = l->getConstraints().begin();",
  "        while (Problem* prob = i.next())",
  "          if (prob->hasType<ConstraintOverdueDemand>()) {",
  "            hasOverdueConstraint = true;",
  "            break;",
  "          }",
  "        do {    // Loop over global-purchasing locations",
  "          do {  // Multiple plan iterations",
  "            // Message",
  "            if (loglevel > 0)",
  "              logger << indentlevel << \"Demand '\" << l << \"' asks: \" << plan_qty",
  "                     << \"  \" << plan_date << '\\n';",
  "",
  "            // Store the last command in the list, in order to undo the",
  "            // following commands if required.",
  "            auto loopcommand = data->getCommandManager()->setBookmark();",
  "",
  "            // Add overdue constraint",
  "            if (l->getDue() < Plan::instance().getCurrent() &&",
  "                !hasOverdueConstraint && isConstrained() &&",
  "                (getConstraints() & (MFG_LEADTIME + PO_LEADTIME)) > 0) {",
  "              l->getConstraints().push(new ConstraintOverdueDemand(l, false));",
  "              hasOverdueConstraint = true;",
  "            }",
  "",
  "            // Plan the demand by asking the delivery operation to plan",
  "            double q_qty = plan_qty;",
  "            data->broken_path = false;",
  "            data->state->curBuffer = nullptr;",
  "            data->state->q_qty = plan_qty;",
  "            data->state->q_qty_min = minshipment;",
  "            data->state->forceAccept = false;",
  "            data->state->keepAssignments = nullptr;",
  "            data->state->q_date = plan_date;",
  "            data->constraints = &(const_cast<Demand*>(l)->getConstraints());",
  "            data->state->curDemand = const_cast<Demand*>(l);",
  "            data->state->curOwnerOpplan = nullptr;",
  "            data->state->curBatch = l->getBatch();",
  "            data->state->dependency = nullptr;",
  "            data->state->blockedOpplan = nullptr;",
  "            data->coordination_run = false;",
  "            data->accept_partial_reply = false;",
  "            data->recent_buffers.clear();",
  "            data->dependency_list.clear();",
  "            auto num_constraints_before = l->getConstraints().size();",
  "            deliveryoper->solve(*this, v);",
  "            if (loglevel > 0) {",
  "              for (auto& j : l->getConstraints()) {",
  "                if (num_constraints_before > 0)",
  "                  --num_constraints_before;",
  "                else",
  "                  logger << indentlevel",
  "                         << \"  Constraint: \" << j.getDescription() << '\\n';",
  "              }",
  "            }",
  "            Date next_date = data->state->a_date;",
  "            bool broken_path = data->broken_path;",
  "",
  "            if (data->state->a_qty < ROUNDING_ERROR && plan_qty > minshipment &&",
  "                minshipment > 0 && policy != Demand::POLICY_ALLTOGETHER) {",
  "              bool originalLogConstraints = data->logConstraints;",
  "              data->logConstraints = false;",
  "              try {",
  "                // The full asked quantity is not possible.",
  "                // Try with the minimum shipment quantity.",
  "                if (loglevel > 1)",
  "                  logger << indentlevel << \"Demand '\" << l",
  "                         << \"' tries planning minimum quantity \" << minshipment",
  "                         << '\\n';",
  "                data->getCommandManager()->rollback(loopcommand);",
  "                data->state->curBuffer = nullptr;",
  "                data->state->q_qty = minshipment;",
  "                data->state->q_date = plan_date;",
  "                data->state->curDemand = const_cast<Demand*>(l);",
  "                data->state->curBatch = l->getBatch();",
  "                data->state->dependency = nullptr;",
  "                data->state->blockedOpplan = nullptr;",
  "                data->recent_buffers.clear();",
  "                data->dependency_list.clear();",
  "                deliveryoper->solve(*this, v);",
  "                if (data->state->a_date < next_date)",
  "                  next_date = data->state->a_date;",
  "                if (data->state->a_qty > ROUNDING_ERROR) {",
  "                  // The minimum shipment quantity is feasible.",
  "                  // Now try iteratively different quantities to find the best",
  "                  // we can do.",
  "                  double min_qty = minshipment;",
  "                  double max_qty = plan_qty;",
  "                  double delta = fabs(max_qty - min_qty);",
  "                  while (delta > getIterationAccuracy() * l->getQuantity() &&",
  "                         delta > getIterationThreshold()) {",
  "                    // Note: we're kind of assuming that the demand is an",
  "                    // integer value here.",
  "                    double new_qty = floor((min_qty + max_qty) / 2);",
  "                    if (new_qty == min_qty) {",
  "                      // Required to avoid an infinite loop on the same value...",
  "                      new_qty += 1;",
  "                      if (new_qty > max_qty) break;",
  "                    }",
  "                    if (loglevel > 0)",
  "                      logger << indentlevel << \"Demand '\" << l",
  "                             << \"' tries planning a different quantity \"",
  "                             << new_qty << '\\n';",
  "                    data->getCommandManager()->rollback(loopcommand);",
  "                    data->state->curBuffer = nullptr;",
  "                    data->state->q_qty = new_qty;",
  "                    data->state->q_date = plan_date;",
  "                    data->state->curDemand = const_cast<Demand*>(l);",
  "                    data->state->curBatch = l->getBatch();",
  "                    data->state->dependency = nullptr;",
  "                    data->state->blockedOpplan = nullptr;",
  "                    data->recent_buffers.clear();",
  "                    data->dependency_list.clear();",
  "                    deliveryoper->solve(*this, v);",
  "                    if (data->state->a_date < next_date)",
  "                      next_date = data->state->a_date;",
  "                    if (data->state->a_qty > ROUNDING_ERROR)",
  "                      // Too small: new min",
  "                      min_qty = new_qty;",
  "                    else",
  "                      // Too big: new max",
  "                      max_qty = new_qty;",
  "                    delta = fabs(max_qty - min_qty);",
  "                  }",
  "                  q_qty = min_qty;  // q_qty is the biggest Q quantity giving a",
  "                                    // positive reply",
  "                  if (data->state->a_qty <= ROUNDING_ERROR) {",
  "                    if (loglevel > 0)",
  "                      logger << indentlevel << \"Demand '\" << l",
  "                             << \"' restores plan for quantity \" << min_qty",
  "                             << '\\n';",
  "                    // Restore the last feasible plan",
  "                    data->getCommandManager()->rollback(loopcommand);",
  "                    data->state->curBuffer = nullptr;",
  "                    data->state->q_qty = min_qty;",
  "                    data->state->q_date = plan_date;",
  "                    data->state->curDemand = const_cast<Demand*>(l);",
  "                    data->state->curBatch = l->getBatch();",
  "                    data->state->dependency = nullptr;",
  "                    data->state->blockedOpplan = nullptr;",
  "                    data->recent_buffers.clear();",
  "                    data->dependency_list.clear();",
  "                    deliveryoper->solve(*this, v);",
  "                  }",
  "                }",
  "              } catch (...) {",
  "                data->logConstraints = originalLogConstraints;",
  "                throw;",
  "              }",
  "              data->logConstraints = originalLogConstraints;",
  "            }",
  "",
  "            // Message",
  "            if (loglevel > 0) {",
  "              logger << indentlevel << \"Demand '\" << l",
  "                     << \"' gets answer: \" << data->state->a_qty;",
  "              if (!data->state->a_qty) logger << \"  \" << next_date;",
  "              logger << \"  \" << data->state->a_cost << \"  \"",
  "                     << data->state->a_penalty << '\\n';",
  "            }",
  "",
  "            // Update the date to plan in the next loop",
  "            Date copy_plan_date = plan_date;",
  "",
  "            // Compare the planned quantity with the minimum allowed shipment",
  "            // quantity We don't accept the answer in case:",
  "            // 1) Nothing is planned",
  "            // 2) The planned quantity is less than the minimum shipment",
  "            //    quantity",
  "            // 3) The remaining quantity after accepting this answer is less",
  "            //    than the minimum quantity.",
  "            if (data->state->a_qty < ROUNDING_ERROR ||",
  "                (data->state->a_qty + ROUNDING_ERROR < minshipment &&",
  "                 !data->state->forceAccept) ||",
  "                (plan_qty - data->state->a_qty < minshipment &&",
  "                 data->state->a_qty < plan_qty - ROUNDING_ERROR &&",
  "                 !data->state->forceAccept)) {",
  "              if (plan_qty - data->state->a_qty < minshipment &&",
  "                  data->state->a_qty + ROUNDING_ERROR >= minshipment &&",
  "                  !data->state->forceAccept &&",
  "                  data->state->a_qty > best_a_qty) {",
  "                // The remaining quantity after accepting this answer is less",
  "                // than the minimum quantity. Therefore, we delay accepting it",
  "                // now, but still keep track of this best offer.",
  "                best_a_qty = data->state->a_qty;",
  "                best_q_qty = q_qty;",
  "                best_q_date = plan_date;",
  "              }",
  "",
  "              // Set the ask date for the next pass through the loop",
  "              if (data->state->a_qty > ROUNDING_ERROR &&",
  "                  plan_qty - data->state->a_qty < minshipment &&",
  "                  plan_qty - data->state->a_qty > ROUNDING_ERROR) {",
  "                // Check whether the reply is based purely on onhand or not",
  "                if (broken_path) {",
  "                  // Not more supply will ever be found here!",
  "                  plan_date = Date::infiniteFuture;",
  "                } else if (hasOperationPlans(data->getCommandManager()) ||",
  "                           next_date < copy_plan_date + getLazyDelay()) {",
  "                  // Oops, we didn't get a proper answer we can use for the next",
  "                  // loop. Print a warning and simply a bit later.",
  "                  plan_date = copy_plan_date + getLazyDelay();",
  "                  if (loglevel > 1)",
  "                    logger << indentlevel << \"Demand '\" << l",
  "                           << \"': Easy retry on \" << plan_date",
  "                           << \" rather than \" << next_date << '\\n';",
  "                } else",
  "                  // We can trust the next date returned by the search if the",
  "                  // shipment quantity was purely based on some onhand.",
  "                  plan_date = next_date;",
  "              } else if (next_date <= copy_plan_date ||",
  "                         data->state->a_qty > ROUNDING_ERROR ||",
  "                         (next_date == Date::infiniteFuture &&",
  "                          data->state->a_qty > ROUNDING_ERROR)) {",
  "                // Oops, we didn't get a proper answer we can use for the next",
  "                // loop. Print a warning and simply try a bit later.",
  "                plan_date = copy_plan_date + getLazyDelay();",
  "                if (loglevel > 1)",
  "                  logger << indentlevel << \"Demand '\" << l",
  "                         << \"': Easy retry on \" << plan_date << \" rather than \"",
  "                         << next_date << '\\n';",
  "              } else if (getMinimumDelay()) {",
  "                Date tmp = copy_plan_date + getMinimumDelay();",
  "                if (tmp > next_date) {",
  "                  // Assures that the next planning round advances for at least",
  "                  // the minimum acceptable delay.",
  "                  if (loglevel > 0)",
  "                    logger << indentlevel << \"Demand '\" << l",
  "                           << \"': Minimum retry on \" << tmp << \" rather than \"",
  "                           << next_date << '\\n';",
  "                  plan_date = tmp;",
  "                } else",
  "                  // Use the next-date answer from the solver",
  "                  plan_date = next_date;",
  "              } else",
  "                // Use the next-date answer from the solver",
  "                plan_date = next_date;",
  "",
  "              // Tracking for synching demands",
  "              if (isGroup && policy == Demand::POLICY_ALLTOGETHER) {",
  "                group_ok = false;",
  "                group_buster = l;",
  "                next_delivery_date = plan_date;",
  "              }",
  "",
  "              // Delete operationplans - Undo all changes",
  "              data->getCommandManager()->rollback(loopcommand);",
  "            } else {",
  "              // Accepting this answer",
  "              if (data->state->a_qty + ROUNDING_ERROR < q_qty) {",
  "                // The demand was only partially planned. We need to do a new",
  "                // 'coordinated' planning run.",
  "",
  "                // Delete operationplans created in the 'testing round'",
  "                data->getCommandManager()->rollback(loopcommand);",
  "",
  "                // Create the correct operationplans",
  "                if (loglevel >= 2)",
  "                  logger << indentlevel << \"Demand '\" << l",
  "                         << \"' plans coordination.\\n\";",
  "                setLogLevel(0);",
  "                double tmpresult = 0;",
  "                short tries = 7;",
  "                Date coordination_date = copy_plan_date;",
  "                bool coordination_flag = true;",
  "                try {",
  "                  for (double remainder = data->state->a_qty;",
  "                       remainder > ROUNDING_ERROR;",
  "                       remainder -= data->state->a_qty) {",
  "                    data->state->q_qty = remainder;",
  "                    data->state->q_date = coordination_date;",
  "                    data->state->curDemand = const_cast<Demand*>(l);",
  "                    data->state->curBatch = l->getBatch();",
  "                    data->state->curBuffer = nullptr;",
  "                    data->state->dependency = nullptr;",
  "                    data->state->blockedOpplan = nullptr;",
  "                    data->coordination_run = coordination_flag;",
  "                    data->accept_partial_reply = false;",
  "                    data->recent_buffers.clear();",
  "                    data->dependency_list.clear();",
  "                    deliveryoper->solve(*this, v);",
  "                    if (data->state->a_qty < ROUNDING_ERROR) {",
  "                      // The coordingation run didn't come back with a positive",
  "                      // reply. We retry with slightly different parameters",
  "                      // hoping to get a proper answer.",
  "                      if (coordination_flag) {",
  "                        coordination_flag = false;",
  "                      } else if (tries-- > 0) {",
  "                        coordination_flag = true;",
  "                        coordination_date -= Duration(24L * 3600L);",
  "                      } else {",
  "                        logger << indentlevel << \"Warning: Demand '\" << l",
  "                               << \"': Failing coordination\\n\";",
  "                        break;",
  "                      }",
  "                    } else {",
  "                      coordination_flag = true;",
  "                      tmpresult += data->state->a_qty;",
  "                    }",
  "                  }",
  "                } catch (...) {",
  "                  setLogLevel(loglevel);",
  "                  throw;",
  "                }",
  "                setLogLevel(loglevel);",
  "                data->state->a_qty = tmpresult;",
  "                if (tmpresult == 0) break;",
  "              }",
  "",
  "              // Register the new operationplans. We need to make sure that the",
  "              // correct execute method is called!",
  "              if (getAutocommit() && policy != Demand::POLICY_ALLTOGETHER) {",
  "                scanExcess(data->getCommandManager());",
  "                data->getCommandManager()->commit();",
  "              }",
  "",
  "              // Update the quantity to plan in the next loop",
  "              plan_qty -= data->state->a_qty;",
  "              best_a_qty = 0.0;  // Reset 'best-answer' remember",
  "            }",
  "",
  "          }",
  "          // Repeat while there is still a quantity left to plan and we aren't",
  "          // exceeding the maximum delivery delay.",
  "          while (plan_qty > ROUNDING_ERROR && group_ok &&",
  "                 ((getPlanType() != 2 &&",
  "                   plan_date < l->getDue() + l->getMaxLateness()) ||",
  "                  (getPlanType() == 2 && !data->constrainedPlanning &&",
  "                   plan_date < l->getDue() + l->getMaxLateness()) ||",
  "                  (getPlanType() == 2 && data->constrainedPlanning &&",
  "                   plan_date == delivery_date)));",
  "",
  "          if (l->getLatestDelivery() &&",
  "              l->getLatestDelivery()->getEnd() <= l->getDue() &&",
  "              l->getPlannedQuantity() >= l->getQuantity() - ROUNDING_ERROR)",
  "            const_cast<Demand*>(l)->getConstraints().clear();",
  "",
  "          if (globalPurchase) {",
  "            if (sortedLocation.empty() ||",
  "                (l->getPlannedQuantity() + ROUNDING_ERROR >= l->getQuantity()))",
  "              break;",
  "",
  "            if (getLogLevel() > 1)",
  "              logger << indentlevel << \"Changing demand location for \" << l",
  "                     << \" from \" << l->getLocation() << \" to \"",
  "                     << sortedLocation.front().first << '\\n';",
  "",
  "            // Prepare for planning on the next location",
  "            const_cast<Demand*>(l)->setLocationNoRecalc(",
  "                sortedLocation.front().first);",
  "            deliveryoper = l->getDeliveryOperation();",
  "            plan_date = delivery_date;",
  "",
  "            // Remove first element of the sorted location",
  "            sortedLocation.pop_front();",
  "          }",
  "        } while (globalPurchase);",
  "",
  "        if (globalPurchase) {",
  "          // Switch demand back to original location",
  "          const_cast<Demand*>(l)->setLocationNoRecalc(originalLocation);",
  "          l->getDeliveryOperation();",
  "        }",
  "",
  "        // Accept the best possible answer.",
  "        // We may have skipped it in the previous loop, awaiting a still better",
  "        // answer",
  "        if (best_a_qty > 0.0 && data->constrainedPlanning &&",
  "            policy != Demand::POLICY_ALLTOGETHER) {",
  "          if (loglevel >= 2)",
  "            logger << indentlevel << \"Demand '\" << l",
  "                   << \"' accepts a best answer.\\n\";",
  "          setLogLevel(0);",
  "          try {",
  "            for (double remainder = best_q_qty;",
  "                 remainder > ROUNDING_ERROR && remainder > minshipment;",
  "                 remainder -= data->state->a_qty) {",
  "              data->state->q_qty = remainder;",
  "              data->state->q_date = best_q_date;",
  "              data->state->curDemand = const_cast<Demand*>(l);",
  "              data->state->curBatch = l->getBatch();",
  "              data->state->curBuffer = nullptr;",
  "              data->state->dependency = nullptr;",
  "              data->state->blockedOpplan = nullptr;",
  "              data->coordination_run = true;",
  "              data->accept_partial_reply = false;",
  "              data->recent_buffers.clear();",
  "              data->dependency_list.clear();",
  "              deliveryoper->solve(*this, v);",
  "              if (data->state->a_qty < ROUNDING_ERROR) {",
  "                logger << indentlevel << \"Warning: Demand '\" << l",
  "                       << \"': Failing accepting best answer\\n\";",
  "                break;",
  "              }",
  "            }",
  "            if (getAutocommit() && policy != Demand::POLICY_ALLTOGETHER) {",
  "              scanExcess(data->getCommandManager());",
  "              data->getCommandManager()->commit();",
  "            }",
  "          } catch (...) {",
  "            setLogLevel(loglevel);",
  "            throw;",
  "          }",
  "          setLogLevel(loglevel);",
  "        }",
  "",
  "        indentlevel--;",
  "",
  "        // Reset the state stack to the position we found it at.",
  "        while (data->state > topstate) data->pop();",
  "      }",
  "",
  "      if (policy == Demand::POLICY_ALLTOGETHER) {",
  "        if (group_ok) {",
  "          // All lines planned in full at this date",
  "          if (getAutocommit()) {",
  "            scanExcess(data->getCommandManager());",
  "            data->getCommandManager()->commit();",
  "          }",
  "          if (group_buster) {",
  "            for (auto l : salesorderlines)",
  "              if (l != group_buster) {",
  "                l->getConstraints().clear();",
  "                l->getConstraints().push(",
  "                    new ProblemSyncDemand(l, group_buster));",
  "              }",
  "          }",
  "          break;",
  "        } else if (next_delivery_date == Date::infiniteFuture) {",
  "          // Give it up",
  "          if (loglevel > 1)",
  "            logger << indentlevel << \"Warning: Demand group '\" << salesorder",
  "                   << \"' can't be planned.\\n\";",
  "          break;",
  "        } else {",
  "          // Repeat at a new date",
  "          delivery_date = next_delivery_date;",
  "          data->getCommandManager()->rollback(topcommand);",
  "        }",
  "      } else if (policy == Demand::POLICY_INRATIO) {",
  "        break;  // TODO",
  "      } else if (policy != Demand::POLICY_INDEPENDENT)",
  "        throw LogicException(\"Unknown demand policy!\");",
  "    } while (isGroup);",
  "  } catch (...) {",
  "    // Clean up if any exception happened during the planning of the demand",
  "    while (data->state > topstate) data->pop();",
  "    data->getCommandManager()->rollback(topcommand);",
  "    throw;",
  "  }",
  "}",
  "",
  "void SolverCreate::scanExcess(CommandManager* mgr) {",
  "  for (auto& i : *mgr)",
  "    if (i.isActive()) scanExcess(&i);",
  "}",
  "",
  "void SolverCreate::scanExcess(CommandList* l) {",
  "  // Loop over all newly created operationplans found in the command stack",
  "  for (auto& cmd : *l) {",
  "    switch (cmd.getType()) {",
  "      case 1:",
  "        // Recurse deeper into command lists",
  "        scanExcess(static_cast<CommandList*>(&cmd));",
  "        break;",
  "      case 5:",
  "        // Detect excess operationplans and undo them",
  "        auto createcmd = static_cast<CommandCreateOperationPlan*>(&cmd);",
  "        if (createcmd->getOperationPlan()) {",
  "          if (createcmd->getOperationPlan()->getQuantity() -",
  "                  createcmd->getOperationPlan()->isExcess() <",
  "              ROUNDING_ERROR) {",
  "            if (getLogLevel() > 1)",
  "              logger << \"Denying creation of redundant operationplan \"",
  "                     << createcmd->getOperationPlan()->getOperation() << \"  \"",
  "                     << createcmd->getOperationPlan()->getDates() << \"  \"",
  "                     << createcmd->getOperationPlan()->getQuantity() << '\\n';",
  "            createcmd->rollback();",
  "          } else if (!createcmd->getOperationPlan()",
  "                          ->getOperation()",
  "                          ->hasType<OperationItemSupplier>()) {",
  "            // Check if any later operationplans have become excess",
  "            auto o = createcmd->getOperationPlan()",
  "                         ->getOperation()",
  "                         ->getOperationPlans();",
  "            while (o != OperationPlan::end()) {",
  "              if (createcmd->getOperationPlan()->getEnd() < o->getEnd() &&",
  "                  o->getProposed() &&",
  "                  (o->getQuantity() - o->isExcess() < ROUNDING_ERROR)) {",
  "                auto tmp = &*o;",
  "                ++o;",
  "                if (getLogLevel() > 1)",
  "                  logger << \"Removing previously created redundant \"",
  "                            \"operationplan \"",
  "                         << tmp << '\\n';",
  "                delete tmp;",
  "              } else",
  "                ++o;",
  "            }",
  "          }",
  "        }",
  "        break;",
  "    }",
  "  }",
  "}",
  "",
  "bool SolverCreate::hasOperationPlans(CommandManager* mgr) {",
  "  for (auto& i : *mgr) {",
  "    if (i.isActive()) {",
  "      if (hasOperationPlans(&i)) return true;",
  "    }",
  "  }",
  "  return false;",
  "}",
  "",
  "bool SolverCreate::hasOperationPlans(CommandList* l) {",
  "  // Loop over all newly created operationplans found in the command stack",
  "  for (auto& cmd : *l) {",
  "    switch (cmd.getType()) {",
  "      case 1:",
  "        // Recurse deeper into command lists",
  "        if (hasOperationPlans(static_cast<CommandList*>(&cmd))) return true;",
  "        break;",
  "      case 5:",
  "        // Command creating an operationplan",
  "        auto opplan =",
  "            static_cast<CommandCreateOperationPlan*>(&cmd)->getOperationPlan();",
  "        if (opplan->getQuantity() > 0.0 && !opplan->getDemand() &&",
  "            !opplan->getOperation()->hasType<OperationItemDistribution>())",
  "          // Return ok when we find an operation that is producing material",
  "          // (and not only consuming or moving inventory)",
  "          return true;",
  "        break;",
  "    }",
  "  }",
  "  return false;",
  "}",
  "",
  "}  // namespace frepple",
];
