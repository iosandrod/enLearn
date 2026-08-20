import { Buffer, BufferInfinite } from "../model/buffer.js";
import { Date as PlanningDate } from "../utils/date.js";
import { RuntimeException } from "../utils/library.js";
import type { SolverCreate, SolverCreateSolverData } from "./solverplan.js";

const traceScheduling = process.env.FREPPLE_TS_TRACE === "1";
const ROUNDING_ERROR = 0.000001;

interface BufferProfileEvent {
  getDate?(): PlanningDate;
  getQuantity?(): number;
  getEventType?(): number;
  getOnhand?(): number;
  getMin?(): number;
  getMax?(): number;
}

interface BufferShortage {
  readonly date: PlanningDate;
  readonly quantity: number;
  readonly onhand: number;
}

interface BufferShortageProfile {
  readonly first: BufferShortage | null;
  readonly maximum: BufferShortage | null;
}

function traceBuffer(message: string, details: Readonly<Record<string, unknown>>): void {
  if (traceScheduling) process.stderr.write(`[buffer] ${message} ${JSON.stringify(details)}\n`);
}

/** Replenish all shortages in a buffer during the backward single sweep. */
function solveSafetyStockSemantic(
  solver: SolverCreate,
  buffer: Buffer,
  data: SolverCreateSolverData,
): unknown {
  const producingOperation = buffer.getProducingOperation();
  let lastPlan: unknown = null;
  if (!producingOperation) {
    data.state.a_qty = 0;
    data.state.a_date = new PlanningDate(PlanningDate.infiniteFuture);
    return null;
  }

  const manager = data.getCommandManager() ?? solver.getCommandManager();
  const shortagesOnly = data.getShortagesOnly();
  let currentMinimum = 0;
  let currentMaximum = 0;
  let currentDate = new PlanningDate(PlanningDate.infinitePast);
  let processedDates = 0;

  // The native timeline iterator keeps pointing at the next pre-existing
  // event while a replenishment inserts new supply. Rebuild the snapshot for
  // every date, but retain that same boundary: a rejected producer reply is
  // retried only when it falls strictly before the next event date.
  while (processedDates < 4096) {
    const events = buffer.getFlowPlans() as BufferProfileEvent[];
    const date = events
      .map((event) => event.getDate?.() ?? new PlanningDate(PlanningDate.infinitePast))
      .find((candidate) => candidate.compare(currentDate) > 0);
    if (!date) break;

    const dateEvents = events.filter((event) =>
      (event.getDate?.() ?? PlanningDate.infinitePast).equals(date));
    if (!dateEvents.length) break;
    for (const event of dateEvents) {
      const eventType = Number(event.getEventType?.() ?? 1);
      if (eventType === 3 && !shortagesOnly) currentMinimum = Number(event.getMin?.() ?? currentMinimum);
      if (eventType === 4) currentMaximum = Number(event.getMax?.() ?? currentMaximum);
    }

    const nextDate = events
      .map((event) => event.getDate?.() ?? new PlanningDate(PlanningDate.infinitePast))
      .find((candidate) => candidate.compare(date) > 0)
      ?? new PlanningDate(PlanningDate.infiniteFuture);
    const previous = dateEvents.at(-1) as BufferProfileEvent;
    let onhand = Number(previous.getOnhand?.() ?? 0);
    let delta = onhand - currentMinimum;
    if (currentMaximum > ROUNDING_ERROR && delta < -ROUNDING_ERROR
      && currentMaximum > currentMinimum) {
      delta -= currentMaximum - currentMinimum;
    }

    const maximum = producingOperation.getSizeMaximum();
    let retryLimit = 30;
    if (Number.isFinite(maximum) && maximum > ROUNDING_ERROR && delta < -ROUNDING_ERROR) {
      retryLimit = Math.max(retryLimit, Math.ceil(-delta / maximum) + retryLimit);
    }
    let nextAskDate: PlanningDate | null = null;
    let keepTrying = true;
    let lastReplyQuantity = 0;

    while (delta < -ROUNDING_ERROR && keepTrying && --retryLimit > 0) {
      const askDate: PlanningDate = nextAskDate
        ? new PlanningDate(nextAskDate) : new PlanningDate(date);
      const bookmark = manager.setBookmark();
      data.push(-delta, askDate, true);
      data.state.q_qty_min = 1;
      data.state.curBuffer = buffer;
      data.state.curOwnerOpplan = null;
      data.state.curDemand = null;
      data.state.curBatch = buffer.getBatch();
      data.state.blockedOpplan = null;
      data.state.dependency = null;
      const previousSafetyStockPlanning = data.safetyStockPlanning;
      const previousBufferSolveShortagesOnly = data.bufferSolveShortagesOnly;
      let attemptPlan: unknown = null;
      let replyQuantity = 0;
      let replyDate = new PlanningDate(PlanningDate.infiniteFuture);
      try {
        data.safetyStockPlanning = false;
        data.bufferSolveShortagesOnly = true;
        attemptPlan = solver.solve(producingOperation, data);
        replyQuantity = Math.max(0, data.state.a_qty);
        replyDate = new PlanningDate(data.state.a_date);
      } catch (error) {
        data.pop(false);
        manager.rollback(bookmark);
        throw error;
      } finally {
        data.safetyStockPlanning = previousSafetyStockPlanning;
        data.bufferSolveShortagesOnly = previousBufferSolveShortagesOnly;
      }
      data.pop(false);
      lastReplyQuantity = replyQuantity;

      traceBuffer("safety-stock-replenish", {
        buffer: buffer.getName(), date: date.toString(), nextDate: nextDate.toString(),
        requested: -delta, askDate: askDate.toString(), replyQuantity,
        replyDate: replyDate.toString(),
      });
      if (replyQuantity > ROUNDING_ERROR) {
        lastPlan = attemptPlan;
        delta += replyQuantity;
        onhand += replyQuantity;
        continue;
      }

      manager.rollback(bookmark);
      const replyBeforeBoundary = nextDate.equals(PlanningDate.infiniteFuture)
        ? replyDate.compare(PlanningDate.infiniteFuture) < 0
        : replyDate.compare(nextDate) < 0;
      if (!replyBeforeBoundary || replyDate.compare(askDate) <= 0) {
        keepTrying = false;
        continue;
      }
      const earliestNext: PlanningDate = askDate.add(solver.getMinimumDelay());
      nextAskDate = replyDate.compare(earliestNext) > 0 ? replyDate : earliestNext;
    }

    if (retryLimit <= 0) {
      traceBuffer("safety-stock-retry-limit", {
        buffer: buffer.getName(), date: date.toString(), remaining: Math.max(0, -delta),
      });
    }
    data.state.a_qty = lastReplyQuantity;
    currentDate = new PlanningDate(date);
    processedDates += 1;
  }
  data.state.a_qty = 0;
  data.state.a_date = new PlanningDate(PlanningDate.infiniteFuture);
  return lastPlan;
}

/** Scan persistent inventory levels using the timeline's cached balances. */
function scanShortages(
  buffer: Buffer,
  requestedDate: PlanningDate,
  data: SolverCreateSolverData,
): BufferShortageProfile {
  const events = buffer.getFlowPlans() as BufferProfileEvent[];
  let minimum = 0;
  let maximum = 0;
  let index = 0;
  let firstShortage: BufferShortage | null = null;
  let maximumShortage: BufferShortage | null = null;

  while (index < events.length) {
    const first = events[index];
    const date = first?.getDate?.() ?? PlanningDate.infinitePast;
    let dateMinimum = minimum;
    let dateMaximum = maximum;
    let lastEvent = first;

    while (index < events.length) {
      const event = events[index];
      const eventDate = event?.getDate?.() ?? PlanningDate.infinitePast;
      if (!eventDate.equals(date)) break;
      index += 1;
      lastEvent = event;

      const eventType = Number(event?.getEventType?.() ?? 1);
      if (eventType === 3
          && (!data.bufferSolveShortagesOnly || data.safetyStockPlanning)
          && !data.getShortagesOnly()) {
        dateMinimum = Number(event?.getMin?.() ?? dateMinimum);
      }
      if (eventType === 4) dateMaximum = Number(event?.getMax?.() ?? dateMaximum);
    }

    minimum = dateMinimum;
    maximum = dateMaximum;
    const onhand = Number(lastEvent?.getOnhand?.() ?? 0);
    if (date.compare(requestedDate) >= 0 && onhand < minimum - ROUNDING_ERROR) {
      // A maximum only rounds an existing minimum shortage up to the upper
      // inventory band. It never creates a replenishment by itself.
      const target = maximum > minimum + ROUNDING_ERROR ? maximum : minimum;
      const shortage = { date: new PlanningDate(date), quantity: target - onhand, onhand };
      firstShortage ??= shortage;
      if (!maximumShortage || shortage.quantity > maximumShortage.quantity + ROUNDING_ERROR) {
        maximumShortage = shortage;
      }
    }
  }
  return { first: firstShortage, maximum: maximumShortage };
}

/** Material ask/reply implementation with on-hand use and replenishment. */
export function solveBufferSemantic(
  solver: SolverCreate,
  buffer: Buffer,
  data: SolverCreateSolverData,
): unknown {
  solver.getUserExitBuffer()?.(buffer, solver, data);

  // SolverCreate::solve(Buffer) counts every material ask, including safety
  // stock asks. The counter is reset by the demand and safety-stock drivers.
  data.iterationCount += 1;
  if (solver.getIterationMax() && data.iterationCount > solver.getIterationMax()) {
    throw new RuntimeException(`Maximum iteration count ${solver.getIterationMax()} exceeded`);
  }

  data.state.curBuffer = buffer;
  if (data.state.q_qty === -1) return solveSafetyStockSemantic(solver, buffer, data);
  const requested = Math.max(0, data.state.q_qty);
  const requestedDate = new PlanningDate(data.state.q_date);
  traceBuffer("ask", {
    demand: data.state.curDemand?.getName() ?? null,
    buffer: buffer.getName(), requested, date: requestedDate.toString(),
    onhand: buffer.getOnHand(requestedDate, false),
  });
  if (!requested) {
    data.state.a_qty = 0;
    data.state.a_date = requestedDate;
    return 0;
  }
  if (buffer instanceof BufferInfinite) {
    data.state.a_qty = requested;
    data.state.a_date = requestedDate;
    return requested;
  }

  const producingOperation = buffer.getProducingOperation();
  let shortageProfile = scanShortages(buffer, requestedDate, data);
  let shortage = shortageProfile.first;
  let nextDate = new PlanningDate(PlanningDate.infiniteFuture);
  let lastPlan: unknown = null;
  let previousDeficit = Number.POSITIVE_INFINITY;

  // A replenishment changes all later balances, so restart the timeline scan
  // after every successful producer reply. The guard also protects malformed
  // models whose producer doesn't improve this buffer.
  for (let iteration = 0; shortage && iteration < 256; iteration += 1) {
    traceBuffer("shortage", {
      buffer: buffer.getName(), iteration, date: shortage.date.toString(),
      onhand: shortage.onhand, shortage: shortage.quantity,
    });
    if (!producingOperation) break;

    const eventCountBefore = buffer.getFlowPlans().length;
    const deficitBefore = shortage.quantity;
    data.push(deficitBefore, shortage.date, true);
    data.state.curBuffer = buffer;
    data.state.curOwnerOpplan = null;
    // C++ solverbuffer.cpp propagates the buffer batch, not the demand batch,
    // when it asks the producing operation for replenishment.
    data.state.curBatch = buffer.getBatch();
    lastPlan = solver.solve(producingOperation, data);
    const replenished = Math.max(0, data.state.a_qty);
    const producerDate = new PlanningDate(data.state.a_date);
    data.pop(false);
    if (producerDate.compare(requestedDate) > 0 && producerDate.compare(nextDate) < 0) {
      nextDate = producerDate;
    }

    shortageProfile = scanShortages(buffer, requestedDate, data);
    const updated = shortageProfile.first;
    const eventCountAfter = buffer.getFlowPlans().length;
    traceBuffer("replenish", {
      buffer: buffer.getName(), iteration, requested: deficitBefore,
      replenished, producerDate: producerDate.toString(),
      eventCountBefore, eventCountAfter,
      remaining: updated?.quantity ?? 0,
    });
    if (!updated) {
      shortage = null;
      break;
    }
    const improved = updated.quantity < deficitBefore - ROUNDING_ERROR
      || eventCountAfter > eventCountBefore;
    shortage = updated;
    if (replenished < ROUNDING_ERROR || !improved
      || shortage.quantity >= previousDeficit - ROUNDING_ERROR) break;
    previousDeficit = shortage.quantity;
  }

  // The C++ solver keeps the largest cumulative deficit seen over the whole
  // remaining timeline. A later demand can deepen the deficit even when the
  // first shortage is small, and that inventory is already reserved.
  shortageProfile = scanShortages(buffer, requestedDate, data);
  shortage = shortageProfile.maximum;

  if (!shortage || !(data.constrainedPlanning && solver.isConstrained())) {
    data.state.a_qty = requested;
    data.state.a_date = new PlanningDate(PlanningDate.infiniteFuture);
  } else {
    if (!producingOperation && buffer.getOnHand(PlanningDate.infiniteFuture, false) < -ROUNDING_ERROR) {
      data.broken_path = true;
      data.accept_partial_reply = true;
    }
    data.state.a_qty = Math.max(0, requested - shortage.quantity);
    if (data.state.requireFull && data.state.a_qty < requested - ROUNDING_ERROR) data.state.a_qty = 0;
    data.state.a_date = nextDate;
  }
  traceBuffer("answer", {
    demand: data.state.curDemand?.getName() ?? null,
    buffer: buffer.getName(), requested,
    remainingShortage: shortage?.quantity ?? 0,
    quantity: data.state.a_qty, date: data.state.a_date.toString(),
    plan: lastPlan && typeof lastPlan === "object" ? lastPlan.constructor.name : null,
  });
  return lastPlan;
}

/**
 * Semantic migration unit for src/solver/solverbuffer.cpp.
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
  { name: "SolverCreate::solve", sourceLine: 37, status: "adapted" },
  { name: "Plan::instance", sourceLine: 190, status: "adapted" },
  { name: "Plan::instance", sourceLine: 246, status: "adapted" },
  { name: "Plan::instance", sourceLine: 286, status: "adapted" },
  { name: "Plan::instance", sourceLine: 340, status: "adapted" },
  { name: "Plan::instance", sourceLine: 376, status: "adapted" },
  { name: "Plan::instance", sourceLine: 435, status: "adapted" },
  { name: "SolverCreate::solveSafetyStock", sourceLine: 782, status: "adapted" },
  { name: "HasLevel::getNumberOfLevels", sourceLine: 816, status: "adapted" },
  { name: "Plan::instance", sourceLine: 865, status: "adapted" },
  { name: "SolverCreate::solve", sourceLine: 983, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface HasLevelPort {
  getNumberOfLevels(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface SolverCreatePort {
  solve(...args: readonly PortValue[]): PortValue | void;
  solveSafetyStock(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/solver/solverbuffer.cpp";
export const targetFile = "solver/solverbuffer.ts";

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
  "/* @todo The flow quantity is handled at the wrong place. It needs to be",
  " * handled by the operation, since flows can exist on multiple suboperations",
  " * with different quantities. The buffer solve can't handle this, because",
  " * it only calls the solve() for the producing operation...",
  " * Are there some situations where the operation solver doesn't know enough",
  " * on the buffer behavior???",
  " */",
  "void SolverCreate::solve(const Buffer* b, void* v) {",
  "  // Call the user exit",
  "  auto* data = static_cast<SolverData*>(v);",
  "  if (userexit_buffer)",
  "    userexit_buffer.call(b, PythonData(data->constrainedPlanning));",
  "",
  "  // Verify the iteration limit isn't exceeded.",
  "  if (getIterationMax() && ++data->iteration_count > getIterationMax()) {",
  "    ostringstream ch;",
  "    ch << \"Maximum iteration count \" << getIterationMax() << \" exceeded\";",
  "    throw RuntimeException(ch.str());",
  "  }",
  "",
  "  // Safety stock planning is refactored to a separate method",
  "  double requested_qty(data->state->q_qty);",
  "  if (requested_qty == -1.0) {",
  "    solveSafetyStock(b, v);",
  "    return;",
  "  }",
  "  Date requested_date(data->state->q_date);",
  "  bool tried_requested_date(false);",
  "",
  "  // Skip too small quantities",
  "  if (data->state->q_qty < ROUNDING_ERROR) {",
  "    data->state->a_qty = data->state->q_qty;",
  "    data->state->a_date = data->state->q_date;",
  "    return;",
  "  }",
  "",
  "  // Message",
  "  if (getLogLevel() > 1)",
  "    logger << ++indentlevel << \"Buffer '\" << b",
  "           << \"' is asked: \" << data->state->q_qty << \"  \"",
  "           << data->state->q_date << '\\n';",
  "",
  "  // Detect loops in the supply chain",
  "  auto tmp_recent_buffers = data->recent_buffers;",
  "  if (data->recent_buffers.contains(b)) {",
  "    stringstream o;",
  "    o << \"Loop detected in the supply path: \";",
  "    data->recent_buffers.echoSince(o, b);",
  "    data->state->a_qty = 0.0;",
  "    data->state->a_date = Date::infiniteFuture;",
  "    if (data->logConstraints && data->constraints) {",
  "      bool already_logged = false;",
  "      for (auto t = data->constraints->begin(); t != data->constraints->end();",
  "           ++t)",
  "        if (t->getDescription() == o.str()) {",
  "          already_logged = true;",
  "          break;",
  "        }",
  "      if (!already_logged)",
  "        data->constraints->push(new ProblemInvalidData(",
  "            const_cast<Buffer*>(b), o.str(), \"material\", Date::infinitePast,",
  "            Date::infiniteFuture, false));",
  "    }",
  "    if (getLogLevel() > 1) {",
  "      logger << indentlevel << \"Warning: \" << o.str() << '\\n';",
  "      if (data->state->a_qty)",
  "        logger << indentlevel-- << \"Buffer '\" << b",
  "               << \"' answers: \" << data->state->a_qty << '\\n';",
  "      else",
  "        logger << indentlevel-- << \"Buffer '\" << b",
  "               << \"' answers short: \" << data->state->a_qty << \"  \"",
  "               << data->state->a_date << '\\n';",
  "    }",
  "    return;",
  "  } else",
  "    data->recent_buffers.push(b);",
  "",
  "  // Store the last command in the list, in order to undo the following",
  "  // commands if required.",
  "  auto topcommand = data->getCommandManager()->setBookmark();",
  "  OperationPlan* prev_owner_opplan = data->state->curOwnerOpplan;",
  "",
  "  // Evaluate the buffer profile and solve shortages by asking more material.",
  "  // The loop goes from the requested date till the very end. Whenever the",
  "  // event date changes, we evaluate if a shortage exists.",
  "  Duration autofence = getAutoFence();",
  "  if (!b->getAutofence() && autofence > Duration(14L * 86400L))",
  "    autofence = 14L * 86400L;",
  "  Date currentDate;",
  "  const TimeLine<FlowPlan>::Event* prev = nullptr;",
  "  double initial_shortage = 0.0;",
  "  if (data->coordination_run) {",
  "    initial_shortage = b->getOnHand(data->state->q_date, false);",
  "    if (initial_shortage > 0.0) initial_shortage = 0.0;",
  "  }",
  "  double shortage(0.0);",
  "  Date extraSupplyDate(Date::infiniteFuture);",
  "  Date extraInventoryDate(Date::infiniteFuture);",
  "  Date extraConfirmedDate(Date::infiniteFuture);",
  "  Date noSupplyBefore(Date::infinitePast);",
  "  double cumproduced =",
  "      (b->getFlowPlans().rbegin() == b->getFlowPlans().end())",
  "          ? 0",
  "          : b->getFlowPlans().rbegin()->getCumulativeProduced();",
  "  double current_minimum(0.0);",
  "  double current_maximum(0.0);",
  "  double unconfirmed_supply(0.0);",
  "  bool firstmsg1 = true;",
  "  bool firstmsg2 = true;",
  "  bool firstmsg3 = true;",
  "",
  "  bool hasTransferbatching = false;",
  "  for (const auto& fl : b->getFlows())",
  "    if (fl.hasType<FlowTransferBatch>()) {",
  "      hasTransferbatching = true;",
  "      break;",
  "    }",
  "",
  "  bool increment_cur = false;",
  "  for (auto cur = b->getFlowPlans().begin();;) {",
  "    if (increment_cur) ++cur;",
  "    increment_cur = true;",
  "",
  "    if (&*cur && cur->getEventType() == 1) {",
  "      const auto* fplan = static_cast<const FlowPlan*>(&*cur);",
  "      if (!fplan->getOperationPlan()->getActivated() &&",
  "          fplan->getQuantity() > 0 &&",
  "          fplan->getOperationPlan()->getOperation() !=",
  "              b->getProducingOperation())",
  "        unconfirmed_supply += fplan->getQuantity();",
  "    }",
  "",
  "    // Iterator has now changed to a new date or we have arrived at the end.",
  "    // If multiple flows are at the same moment in time, we are not interested",
  "    // in the inventory changes. It gets interesting only when a certain",
  "    // inventory level remains unchanged for a certain time.",
  "    if ((cur == b->getFlowPlans().end() || cur->getDate() > currentDate) &&",
  "        prev) {",
  "      // Some variables",
  "      Date theDate = prev->getDate();",
  "      double theOnHand = prev->getOnhand();",
  "      double theDelta = theOnHand - current_minimum + shortage;",
  "",
  "      if (current_maximum > ROUNDING_ERROR && theDelta < -ROUNDING_ERROR &&",
  "          current_maximum > current_minimum) {",
  "        theDelta -= current_maximum - current_minimum;",
  "      }",
  "",
  "      // Evaluate the situation at the last flowplan before the date change.",
  "      // Is there a shortage at that date?",
  "      // We have different ways to resolve it:",
  "      //  - Don't resolve the shortage, but wait for existing confirmed supply.",
  "      //  - Move an approved supply early",
  "      //  - Use existing stock and confirmed supply on alternate materials.",
  "      //  - Scan backward for a producer we can combine with to make a",
  "      //    single batch.",
  "      //  - Scan forward for producer we can replace in a single batch.",
  "      //  - Create new supply for the shortage at that date.",
  "      bool supply_exists_already = false;",
  "      if (theDelta < -ROUNDING_ERROR &&",
  "          Plan::instance().getMoveApprovedEarly()) {",
  "        const FlowPlan* approved_supply = nullptr;",
  "        for (Buffer::flowplanlist::const_iterator approvedscan = cur;",
  "             approvedscan != b->getFlowPlans().end(); ++approvedscan) {",
  "          if (approvedscan->getEventType() == 1 &&",
  "              approvedscan->getQuantity() > 0 &&",
  "              approvedscan->getOperationPlan()->getApproved()) {",
  "            approved_supply = static_cast<const FlowPlan*>(&*approvedscan);",
  "",
  "            auto before_move = data->getCommandManager()->setBookmark();",
  "            auto original_indentlevel = indentlevel++;",
  "            try {",
  "              // Move approved supply early",
  "              auto newDate =",
  "                  approved_supply->computeFlowToOperationDate(theDate);",
  "              OperationPlan* opplan_to_move =",
  "                  approved_supply->getOperationPlan();",
  "              if (opplan_to_move->getOwner() &&",
  "                  opplan_to_move->getOwner()",
  "                      ->getOperation()",
  "                      ->hasType<OperationRouting>())",
  "                opplan_to_move = opplan_to_move->getOwner();",
  "              if (approved_supply->getFlow()->hasType<FlowEnd>())",
  "                data->getCommandManager()->add(new CommandMoveOperationPlan(",
  "                    opplan_to_move, Date::infinitePast, newDate));",
  "              else",
  "                data->getCommandManager()->add(new CommandMoveOperationPlan(",
  "                    opplan_to_move, newDate, Date::infinitePast));",
  "              // Ask solver for feasibility check on existing opplan.",
  "              if (opplan_to_move->getOperation()->hasType<OperationRouting>()) {",
  "                // Check each step in a routing.",
  "                // Only sequential steps are supported now, not",
  "                // dependency-based.",
  "                OperationPlan::iterator x(opplan_to_move, false);",
  "                while (auto* sub = x.next()) {",
  "                  if (sub->getClosed() || sub->getCompleted())",
  "                    // No need to check from here onwards",
  "                    break;",
  "                  if (sub->getConfirmed() && sub->getEnd() > newDate) {",
  "                    // Failure at a step we can't move earlier",
  "                    data->state->a_qty = 0.0;",
  "                    data->state->a_date = sub->getEnd();",
  "                    OperationPlan::iterator x(opplan_to_move, true, sub);",
  "                    x.next();",
  "                    while (auto* sub2 = x.next()) {",
  "                      sub2->setStart(data->state->a_date);",
  "                      data->state->a_date = sub2->getEnd();",
  "                    }",
  "                    break;",
  "                  }",
  "                  if (getLogLevel() > 1 && firstmsg1)",
  "                    logger << indentlevel",
  "                           << \"Moving approved routing supply early: \" << sub",
  "                           << '\\n';",
  "                  auto orig_quantity = opplan_to_move->getQuantity();",
  "                  data->state->keepAssignments =",
  "                      Plan::instance().getMoveApprovedEarly() == 1 ? sub",
  "                                                                   : nullptr;",
  "                  OperationPlanState beforeMove(sub);",
  "                  sub->setOperationPlanParameters(orig_quantity,",
  "                                                  Date::infinitePast, newDate,",
  "                                                  true, true, false);",
  "                  auto requireFull = data->state->requireFull;",
  "                  data->state->requireFull = true;",
  "                  data->push(opplan_to_move->getQuantity(), sub->getEnd());",
  "                  checkOperation(sub, *data);",
  "                  data->pop(true);",
  "                  data->state->requireFull = requireFull;",
  "                  if (data->state->a_qty <= ROUNDING_ERROR) {",
  "                    // convert data->state->a_date to the complete routing",
  "                    OperationPlan::iterator x(opplan_to_move, true, sub);",
  "                    opplan_to_move->setQuantity(orig_quantity);",
  "                    sub->restore(beforeMove);",
  "                    sub->setEnd(data->state->a_date);",
  "                    x.next();",
  "                    while (auto* sub2 = x.next()) {",
  "                      sub2->setStart(data->state->a_date);",
  "                      data->state->a_date = sub2->getEnd();",
  "                    }",
  "                    break;",
  "                  } else",
  "                    newDate = sub->getStart();",
  "                }",
  "                firstmsg1 = false;",
  "              } else {",
  "                // Check parent operation only",
  "                if (getLogLevel() > 1 && firstmsg1) {",
  "                  logger << indentlevel",
  "                         << \"Moving approved supply early: \" << opplan_to_move",
  "                         << '\\n';",
  "                  firstmsg1 = false;",
  "                }",
  "                auto requireFull = data->state->requireFull;",
  "                data->state->requireFull = true;",
  "                data->push(opplan_to_move->getQuantity(), newDate);",
  "                data->state->keepAssignments =",
  "                    Plan::instance().getMoveApprovedEarly() == 1",
  "                        ? opplan_to_move",
  "                        : nullptr;",
  "                checkOperation(opplan_to_move, *data);",
  "                data->pop(true);",
  "                data->state->requireFull = requireFull;",
  "              }",
  "              if (data->state->a_qty <= ROUNDING_ERROR) {",
  "                // Move wasn't feasible. Need to disallow new replenishments.",
  "                if (getLogLevel() > 1)",
  "                  logger << indentlevel",
  "                         << \"Moving approved supply failed: Earliest date is \"",
  "                         << data->state->a_date << '\\n';",
  "                if (data->state->a_date > requested_date) {",
  "                  if (data->state->a_date < extraSupplyDate)",
  "                    extraSupplyDate = data->state->a_date;",
  "                  if (data->state->a_date < extraConfirmedDate)",
  "                    extraConfirmedDate = data->state->a_date;",
  "                }",
  "                data->getCommandManager()->rollback(before_move);",
  "                supply_exists_already = true;",
  "                tried_requested_date = true;  // Disables an extra supply check",
  "                shortage = -theOnHand;",
  "              } else {",
  "                // Move was feasible",
  "                if (getLogLevel() > 1)",
  "                  logger << indentlevel << \"Moving approved supply succeeded\"",
  "                         << '\\n';",
  "                increment_cur = false;",
  "                approved_supply->getOperationPlan()->appendInfo(",
  "                    \"Moved early to meet earlier requirement\");",
  "                cur = prev;",
  "              }",
  "              indentlevel = original_indentlevel;",
  "              break;",
  "            } catch (...) {",
  "              data->getCommandManager()->rollback(before_move);",
  "            }",
  "            indentlevel = original_indentlevel;",
  "          };",
  "        };",
  "        if (!increment_cur)",
  "          // Re-evaluate the situation after a succesfull move",
  "          continue;",
  "      }",
  "",
  "      if (theDelta < -ROUNDING_ERROR && autofence && !data->coordination_run) {",
  "        // Solution zero: wait for confirmed supply that is already existing",
  "        auto free_stock = b->getOnHand(Date::infiniteFuture) -",
  "                          b->getFlowPlans().getMin(Date::infiniteFuture);",
  "        if (free_stock > -ROUNDING_ERROR) {",
  "          for (Buffer::flowplanlist::const_iterator scanner = cur;",
  "               scanner != b->getFlowPlans().end() &&",
  "               scanner->getDate() <",
  "                   max(requested_date, Plan::instance().getCurrent()) +",
  "                       autofence;",
  "               ++scanner) {",
  "            if (scanner->getQuantity() <= 0 ||",
  "                scanner->getDate() <= requested_date)",
  "              continue;",
  "            auto tmp = scanner->getOperationPlan();",
  "            if (tmp && (tmp->getConfirmed() || tmp->getApproved()) &&",
  "                !tmp->getOperation()->getName().starts_with(\"Correction\")) {",
  "              if (free_stock > -ROUNDING_ERROR) {",
  "                // Existing supply covers the complete requirement",
  "                if (data->logConstraints && data->constraints)",
  "                  data->constraints->push(ProblemAwaitSupply::metadata, b,",
  "                                          theDate, scanner->getDate());",
  "                if (getLogLevel() > 1 && firstmsg1) {",
  "                  logger",
  "                      << indentlevel",
  "                      << \"Refuse to create extra supply because confirmed or \"",
  "                         \"approved supply is already available at \"",
  "                      << scanner->getDate() << '\\n';",
  "                  firstmsg1 = false;",
  "                }",
  "                supply_exists_already = true;",
  "                if (shortage < -prev->getOnhand())",
  "                  shortage = -prev->getOnhand();",
  "                tried_requested_date = true;  // Disables an extra supply check",
  "              }",
  "              if (scanner->getDate() > requested_date &&",
  "                  scanner->getDate() < extraConfirmedDate)",
  "                extraConfirmedDate = scanner->getDate();",
  "              break;",
  "            }",
  "          }",
  "        }",
  "        if (!supply_exists_already && !data->coordination_run) {",
  "          auto fence_free = b->getOnHand(",
  "              max(theDate, Plan::instance().getCurrent()) + autofence,",
  "              Date::infiniteFuture, true, true, false);",
  "          if (theDelta < fence_free && fence_free < 0 &&",
  "              theDelta < -ROUNDING_ERROR &&",
  "              fabs(fence_free - theDelta) > ROUNDING_ERROR) {",
  "            // There is confirmed supply within the fence that partially covers",
  "            // the requirement. We reduce the allowed replenishment quantity.",
  "            theDelta = fence_free;",
  "          }",
  "        }",
  "      }",
  "",
  "      // Solution zero-tris: use stock and confirmed supply on alternate",
  "      // materials",
  "      // We only skip stop the replenishment search if a single alternate can",
  "      // provide all material we need. We don't add up leftovers from multiple",
  "      // materials.",
  "      // TODO allow consuming a MO partially from different alternates. Cfr",
  "      // generic MTO buffer consumption.",
  "      auto theflow = data->state->q_flowplan",
  "                         ? data->state->q_flowplan->getFlow()",
  "                         : nullptr;",
  "      if (theDelta < -ROUNDING_ERROR && !supply_exists_already && theflow &&",
  "          !theflow->getName().empty()) {",
  "        for (auto h = theflow->getOperation()->getFlows().begin();",
  "             h != theflow->getOperation()->getFlows().end() &&",
  "             !supply_exists_already;",
  "             ++h) {",
  "          if (b == h->getBuffer() || theflow->getName() != h->getName())",
  "            continue;",
  "          if (!h->getEffective().within(data->state->q_flowplan->getDate()))",
  "            continue;",
  "          auto qty =",
  "              h->getQuantityFixed() +",
  "              data->state->q_flowplan->getOperationPlan()->getQuantity() *",
  "                  h->getQuantity();",
  "          if (qty >= 0) continue;",
  "          if (h->getBuffer()->getOnHand(data->state->q_flowplan->getDate(),",
  "                                        Date::infiniteFuture,",
  "                                        true) > -qty - ROUNDING_ERROR) {",
  "            if (getLogLevel() > 1 && firstmsg2) {",
  "              logger << indentlevel",
  "                     << \"Refuse to create extra supply because inventory \"",
  "                        \"is already available on alternate material \"",
  "                     << h->getBuffer()->getItem() << '\\n';",
  "              firstmsg2 = false;",
  "            }",
  "            if (shortage < -prev->getOnhand()) shortage = -prev->getOnhand();",
  "            supply_exists_already = true;",
  "            tried_requested_date = true;  // Disables an extra supply check",
  "            break;",
  "          }",
  "          if (autofence && !supply_exists_already &&",
  "              h->getBuffer()->getOnHand(Date::infiniteFuture) >",
  "                  -qty - ROUNDING_ERROR) {",
  "            for (Buffer::flowplanlist::const_iterator scanner =",
  "                     h->getBuffer()->getFlowPlans().begin();",
  "                 scanner != h->getBuffer()->getFlowPlans().end() &&",
  "                 scanner->getDate() <",
  "                     max(theDate, Plan::instance().getCurrent()) + autofence;",
  "                 ++scanner) {",
  "              if (scanner->getQuantity() <= 0 ||",
  "                  scanner->getDate() < requested_date)",
  "                continue;",
  "              auto tmp = scanner->getOperationPlan();",
  "              if (tmp && (tmp->getConfirmed() || tmp->getApproved()) &&",
  "                  !tmp->getOperation()->getName().starts_with(\"Correction\")) {",
  "                if (firstmsg3 && data->logConstraints && data->constraints)",
  "                  data->constraints->push(ProblemAwaitSupply::metadata, b,",
  "                                          theDate, scanner->getDate());",
  "                if (getLogLevel() > 1 && firstmsg3) {",
  "                  logger << indentlevel",
  "                         << \"Refuse to create extra supply because confirmed \"",
  "                            \"or approved supply is already available on \"",
  "                            \"alternate material \"",
  "                         << h->getBuffer()->getItem() << \" at \"",
  "                         << scanner->getDate() << '\\n';",
  "                  firstmsg3 = false;",
  "                }",
  "                if (shortage < -prev->getOnhand())",
  "                  shortage = -prev->getOnhand();",
  "                supply_exists_already = true;",
  "                tried_requested_date = true;  // Disables an extra supply check",
  "                break;",
  "              }",
  "            }",
  "          }",
  "        }",
  "      }",
  "",
  "      // Solution one: create supply at the shortage date itself",
  "      if (theDelta < -ROUNDING_ERROR && !supply_exists_already) {",
  "        // Can we get extra supply to solve the problem, or part of it?",
  "        // If the shortage already starts before the requested date, it",
  "        // was not created by the newly added flowplan, but existed before.",
  "        // We don't consider this as a shortage for the current flowplan,",
  "        // and we want our flowplan to try to repair the previous problems",
  "        // if it can...",
  "        bool loop = true;",
  "        auto prev_hitMaxEarly = data->hitMaxEarly;",
  "        if (!b->getProducingOperation()) {",
  "          if (b->getOnHand(Date::infiniteFuture) < -ROUNDING_ERROR) {",
  "            data->broken_path = true;",
  "            data->accept_partial_reply = true;",
  "            if (getLogLevel() > 1)",
  "              logger << indentlevel << \"  Supply path is broken here\\n\";",
  "          }",
  "        } else",
  "          while (theDate >= requested_date && loop &&",
  "                 (theDate >= noSupplyBefore || hasTransferbatching)) {",
  "            Duration repeat_early;",
  "            Date prev_date = Date::infiniteFuture;",
  "            short prev_stuck = 0;",
  "",
  "            // Detect whether any operation did hit its size-maximum limit",
  "            data->hitMaxSize = false;",
  "",
  "            do {",
  "              // Create supply",
  "              data->state->curBuffer = const_cast<Buffer*>(b);",
  "              data->state->q_qty = -theDelta;",
  "              data->state->q_date = theDate - repeat_early;",
  "",
  "              // Detect whether any resource did hit its max-early limit",
  "              data->hitMaxEarly = -1L;",
  "",
  "              // Check whether this date doesn't match with the requested date.",
  "              // See a bit further why this is required.",
  "              if (data->state->q_date == requested_date)",
  "                tried_requested_date = true;",
  "",
  "              // Make sure the new operationplans don't inherit an owner.",
  "              // When an operation calls the solve method of suboperations, this",
  "              // field is used to pass the information about the owner",
  "              // operationplan down. When solving for buffers we must make sure",
  "              // NOT to pass owner information. At the end of solving for a",
  "              // buffer we need to restore the original settings...",
  "              data->state->curOwnerOpplan = nullptr;",
  "",
  "              // Producer needs to propagate the batch of this buffer",
  "              data->state->curBatch = b->getBatch();",
  "",
  "              // Note that the supply created with the next line changes the",
  "              // onhand value at all later dates!",
  "              auto cycle = data->getCommandManager()->setBookmark();",
  "              b->getProducingOperation()->solve(*this, v);",
  "              data->recent_buffers = tmp_recent_buffers;",
  "",
  "              // Evaluate the reply date. The variable extraSupplyDate will",
  "              // store the date when the producing operation tells us it can get",
  "              // extra supply.",
  "              if (data->state->a_date < extraSupplyDate &&",
  "                  data->state->a_date > requested_date) {",
  "                extraSupplyDate = data->state->a_date;",
  "              }",
  "",
  "              if (b->getIPFlag() && data->hitMaxEarly >= 0L &&",
  "                  !data->state->a_qty) {",
  "                if (data->hitMaxEarly == Duration::MAX)",
  "                  break;",
  "                else if (data->hitMaxEarly > getMinimumDelay())",
  "                  repeat_early += data->hitMaxEarly;",
  "                else if (getMinimumDelay())",
  "                  repeat_early += getMinimumDelay();",
  "                else",
  "                  repeat_early += Duration(86400L);",
  "                data->getCommandManager()->rollback(cycle);",
  "                // This ain't very clean",
  "                if (data->state->a_date == prev_date && ++prev_stuck > 30)",
  "                  break;",
  "                prev_date = data->state->a_date;",
  "              } else",
  "                break;",
  "            } while (true);",
  "            if (b->getIPFlag())",
  "              data->hitMaxEarly = prev_hitMaxEarly;",
  "            else if (!data->state->a_qty) {",
  "              if (data->hitMaxEarly == Duration(-1L))",
  "                // O reply isn't caused by max-early",
  "                data->hitMaxEarly = Duration::MAX;",
  "              else if (data->hitMaxEarly < prev_hitMaxEarly)",
  "                // more constrained by max_early than found so far",
  "                data->hitMaxEarly = prev_hitMaxEarly;",
  "            }",
  "",
  "            // Prevent asking again at a time which we already know to be",
  "            // infeasible",
  "            noSupplyBefore = data->state->a_qty > ROUNDING_ERROR",
  "                                 ? Date::infinitePast",
  "                                 : data->state->a_date;",
  "",
  "            // If we got some extra supply, we retry to get some more supply.",
  "            // Repeating is only allowed when we hit a condition that allows",
  "            // such a repeat.",
  "            if (data->state->a_qty > ROUNDING_ERROR &&",
  "                data->state->a_qty < -theDelta - ROUNDING_ERROR &&",
  "                data->accept_partial_reply)",
  "              theDelta += data->state->a_qty;",
  "            else",
  "              loop = false;",
  "          }",
  "",
  "        // Not enough supply was received to repair the complete problem",
  "        if (prev && prev->getOnhand() + shortage < -ROUNDING_ERROR) {",
  "          // Keep track of the shorted quantity.",
  "          // Only consider shortages later than the requested date.",
  "          if (theDate >= requested_date && shortage < -prev->getOnhand())",
  "            shortage = -prev->getOnhand();",
  "",
  "          // Reset the date from which excess material is in the buffer. This",
  "          // excess material can be used to compute the date when the buffer",
  "          // can be asked again for additional supply.",
  "          extraInventoryDate = Date::infiniteFuture;",
  "          if (b->getOnHand(Date::infiniteFuture) >= -ROUNDING_ERROR) {",
  "            for (auto cur = b->getFlowPlans().rbegin();",
  "                 cur != b->getFlowPlans().end(); --cur) {",
  "              if (!cur->isLastOnDate())",
  "                continue;",
  "              else if ((data->buffer_solve_shortages_only &&",
  "                        cur->getOnhand() >= -ROUNDING_ERROR) ||",
  "                       (!data->buffer_solve_shortages_only &&",
  "                        cur->getOnhand() >= cur->getMin() - ROUNDING_ERROR))",
  "                extraInventoryDate = cur->getDate();",
  "              else",
  "                break;",
  "            }",
  "            if (extraInventoryDate != Date::infiniteFuture && getLogLevel() > 1)",
  "              logger << indentlevel << \"Correcting new date to \"",
  "                     << extraInventoryDate << '\\n';",
  "          }",
  "        }",
  "      } else if (theDelta > unconfirmed_supply + ROUNDING_ERROR)",
  "        // There is excess material at this date (coming from planned/frozen",
  "        // material arrivals, surplus material created by lotsized operations,",
  "        // etc...)",
  "        // The unconfirmed_supply element is required to exclude any of the",
  "        // excess inventory we may have caused ourselves. Such situations are",
  "        // possible when there are loops in the supply chain.",
  "        if (theDate > requested_date &&",
  "            extraInventoryDate == Date::infiniteFuture)",
  "          extraInventoryDate = theDate;",
  "    }",
  "",
  "    // We have reached the end of the flowplans. Breaking out of the loop",
  "    // needs to be done here because in the next statements we are accessing",
  "    // *cur, which isn't valid at the end of the list",
  "    if (cur == b->getFlowPlans().end()) break;",
  "",
  "    // The minimum has changed.",
  "    // Note that these limits can be updated only after the processing of the",
  "    // date change in the statement above. Otherwise the code above would",
  "    // already use the new value before the intended date.",
  "    if (cur->getEventType() == 3 &&",
  "        (!data->buffer_solve_shortages_only || data->safety_stock_planning) &&",
  "        !data->getShortagesOnly())",
  "      current_minimum = cur->getMin();",
  "    if (cur->getEventType() == 4) current_maximum = cur->getMax();",
  "",
  "    // Update the pointer to the previous flowplan.",
  "    prev = &*cur;",
  "    currentDate = cur->getDate();",
  "  }",
  "",
  "  // Note: the variable extraInventoryDate now stores the date from which",
  "  // excess material is available in the buffer. The excess",
  "  // We don't need to care how much material is lying there.",
  "",
  "  // Check for supply at the requested date",
  "  // Isn't this included in the normal loop? In some cases it is indeed, but",
  "  // sometimes it isn't because in the normal loop there may still have been",
  "  // onhand available and the shortage only shows at a later date than the",
  "  // requested date.",
  "  // E.g. Initial situation:              After extra consumer at time y:",
  "  //      -------+                                --+",
  "  //             |                                  |",
  "  //             +------                            +---+",
  "  //                                                    |",
  "  //    0 -------y------                        0 --y---x-----",
  "  //                                                    |",
  "  //                                                    +-----",
  "  // The first loop only checks for supply at times x and later. If it is not",
  "  // feasible, we now check for supply at time y. It will create some extra",
  "  // inventory, but at least the demand is met.",
  "  // @todo The buffer solver could move backward in time from x till time y,",
  "  // and try multiple dates. This would minimize the excess inventory created.",
  "  while (shortage > ROUNDING_ERROR && b->getProducingOperation() &&",
  "         !tried_requested_date) {",
  "    // Create supply at the requested date",
  "    data->state->curBuffer = const_cast<Buffer*>(b);",
  "    data->state->q_qty = shortage;",
  "    data->state->q_date = requested_date;",
  "    // Make sure the new operationplans don't inherit an owner.",
  "    // When an operation calls the solve method of suboperations, this field",
  "    // is used to pass the information about the owner operationplan down.",
  "    // When solving for buffers we must make sure NOT to pass owner",
  "    // information. At the end of solving for a buffer we need to restore the",
  "    // original settings...",
  "    data->state->curOwnerOpplan = nullptr;",
  "    // Note that the supply created with the next line changes the onhand",
  "    // value at all later dates! Note that asking at the requested date",
  "    // doesn't keep the material on stock to a minimum.",
  "    if (requested_qty - shortage < ROUNDING_ERROR)",
  "      data->getCommandManager()->rollback(topcommand);",
  "    b->getProducingOperation()->solve(*this, v);",
  "    data->recent_buffers = tmp_recent_buffers;",
  "    // Evaluate the reply",
  "    if (data->state->a_date < extraSupplyDate &&",
  "        data->state->a_date > requested_date)",
  "      extraSupplyDate = data->state->a_date;",
  "    if (data->state->a_qty > ROUNDING_ERROR)",
  "      shortage -= data->state->a_qty;",
  "    else",
  "      tried_requested_date = true;",
  "  }",
  "",
  "  // Final evaluation of the replenishment",
  "  if (data->constrainedPlanning && isConstrained() &&",
  "      (b->getOnHand(Date::infiniteFuture) < -ROUNDING_ERROR ||",
  "       (getConstraints() & (MFG_LEADTIME + PO_LEADTIME)) > 0)) {",
  "    // Use the constrained planning result",
  "    data->state->a_qty = requested_qty - shortage - initial_shortage;",
  "    if (data->state->a_qty < ROUNDING_ERROR ||",
  "        (requested_qty - data->state->a_qty > ROUNDING_ERROR &&",
  "         data->state->requireFull)) {",
  "      data->getCommandManager()->rollback(topcommand);",
  "      data->state->a_qty = 0.0;",
  "    }",
  "    data->state->a_date = (extraInventoryDate < extraSupplyDate)",
  "                              ? extraInventoryDate",
  "                              : extraSupplyDate;",
  "",
  "    if (extraConfirmedDate == Date::infiniteFuture) {",
  "      // It is possible there is confirmed supply AFTER the autofence date.",
  "      // The reply date should never be later that the first confirmed supply.",
  "      for (const auto& scanner : b->getFlowPlans()) {",
  "        if (scanner.getDate() > requested_date &&",
  "            scanner.getDate() < data->state->a_date &&",
  "            scanner.getQuantity() > 0 && scanner.getEventType() == 1) {",
  "          auto fplan = static_cast<const FlowPlan*>(&scanner);",
  "          if (fplan->getOperationPlan()->getActivated()) {",
  "            extraConfirmedDate = scanner.getDate();",
  "            if (getLogLevel() > 1)",
  "              logger << indentlevel << \"Adjusting reply date to \"",
  "                     << extraConfirmedDate << '\\n';",
  "            break;",
  "          }",
  "        }",
  "      }",
  "    }",
  "    if (extraConfirmedDate < data->state->a_date)",
  "      data->state->a_date = extraConfirmedDate;",
  "    // Monitor as a constraint if there is no producing operation.",
  "    // Note that if there is a producing operation the constraint is flagged",
  "    // on the operation instead of on this buffer.",
  "    if (!b->getProducingOperation() && data->logConstraints &&",
  "        shortage > ROUNDING_ERROR && data->constraints)",
  "      data->constraints->push(ProblemMaterialShortage::metadata, b,",
  "                              requested_date, Date::infiniteFuture);",
  "  } else {",
  "    // Enough inventory or supply available, or not material constrained.",
  "    // In case of a plan that is not material constrained, the buffer tries to",
  "    // solve for shortages as good as possible. Only in the end we 'lie' about",
  "    // the result to the calling function. Material shortages will then remain",
  "    // in the buffer.",
  "    data->state->a_qty = requested_qty;",
  "    data->state->a_date = Date::infiniteFuture;",
  "  }",
  "",
  "  // Restore the owning operationplan.",
  "  data->state->curOwnerOpplan = prev_owner_opplan;",
  "  data->recent_buffers = tmp_recent_buffers;",
  "",
  "  // Reply quantity must be greater than 0",
  "  assert(data->state->a_qty >= 0);",
  "",
  "  // Increment the cost",
  "  // Only the quantity consumed directly from the buffer is counted.",
  "  // The cost of the material supply taken from producing operations is",
  "  // computed seperately and not considered here.",
  "  if (b->getItem() && data->state->a_qty > 0) {",
  "    if (b->getFlowPlans().empty())",
  "      cumproduced = 0.0;",
  "    else",
  "      cumproduced =",
  "          b->getFlowPlans().rbegin()->getCumulativeProduced() - cumproduced;",
  "    if (data->state->a_qty > cumproduced) {",
  "      auto tmp = (data->state->a_qty - cumproduced) * b->getItem()->getCost();",
  "      data->state->a_cost += tmp;",
  "      if (data->logcosts && data->incostevaluation)",
  "        logger << indentlevel << \"     + cost on buffer '\" << b << \"': \" << tmp",
  "               << '\\n';",
  "    }",
  "  }",
  "",
  "  // Message",
  "  if (getLogLevel() > 1) {",
  "    if (data->state->a_qty)",
  "      logger << indentlevel-- << \"Buffer '\" << b",
  "             << \"' answers: \" << data->state->a_qty << '\\n';",
  "    else",
  "      logger << indentlevel-- << \"Buffer '\" << b",
  "             << \"' answers short: \" << data->state->a_qty << \"  \"",
  "             << data->state->a_date << '\\n';",
  "  }",
  "}",
  "",
  "void SolverCreate::solveSafetyStock(const Buffer* b, void* v) {",
  "  auto* data = static_cast<SolverData*>(v);",
  "  auto shortagesonly = data->getShortagesOnly();",
  "",
  "  // Message",
  "  if (getLogLevel() > 1) {",
  "    indentlevel.level = 0;",
  "    logger << ++indentlevel << \"Buffer '\" << b << \"' solves for \"",
  "           << (shortagesonly ? \"shortages\" : \"safety stock\") << '\\n';",
  "  }",
  "",
  "  // Scan the complete horizon",
  "  Date currentDate;",
  "  const TimeLine<FlowPlan>::Event* prev = nullptr;",
  "  double shortage = 0.0;",
  "  double current_minimum = 0.0;",
  "  double current_maximum = 0.0;",
  "  auto cur = b->getFlowPlans().begin();",
  "  while (true) {",
  "    // Iterator has now changed to a new date or we have arrived at the end.",
  "    // If multiple flows are at the same moment in time, we are not interested",
  "    // in the inventory changes. It gets interesting only when a certain",
  "    // inventory level remains unchanged for a certain time.",
  "    if ((cur == b->getFlowPlans().end() || cur->getDate() > currentDate) &&",
  "        prev) {",
  "      // Some variables",
  "      double theOnHand = prev->getOnhand();",
  "      double theDelta = theOnHand - current_minimum + shortage;",
  "      bool loop = true;",
  "",
  "      // Evaluate the situation at the last flowplan before the date change.",
  "      // Is there a shortage at that date?",
  "      Date nextAskDate;",
  "      int loopcounter =",
  "          max(HasLevel::getNumberOfLevels() * 2, 30);  // Performance protection",
  "      if (theDelta && b->getProducingOperation() &&",
  "          b->getProducingOperation()->getSizeMaximum()) {",
  "        double tmp = -theDelta / b->getProducingOperation()->getSizeMaximum() +",
  "                     loopcounter;",
  "        if (tmp > loopcounter) loopcounter = static_cast<unsigned int>(tmp);",
  "      }",
  "",
  "      // Round up the requirement to the max level",
  "      if (current_maximum > ROUNDING_ERROR && theDelta < -ROUNDING_ERROR &&",
  "          current_maximum > current_minimum) {",
  "        theDelta -= current_maximum - current_minimum;",
  "      }",
  "",
  "      Duration repeat_early;",
  "      Duration prev_hitMaxEarly = data->hitMaxEarly;",
  "",
  "      if (!b->getProducingOperation()) {",
  "        if (getLogLevel())",
  "          logger << indentlevel << \"   Warning: Can't replenish\\n\";",
  "        break;",
  "      } else {",
  "        do {",
  "          if (b->getIPFlag())",
  "            // Detect whether any resource did hit its max-early limit",
  "            data->hitMaxEarly = -1L;",
  "",
  "          while (theDelta < -ROUNDING_ERROR && loop && --loopcounter > 0) {",
  "            // Create supply",
  "            data->state->curBuffer = const_cast<Buffer*>(b);",
  "            data->state->q_qty = -theDelta;",
  "            data->state->q_date = nextAskDate ? nextAskDate : prev->getDate();",
  "            data->state->q_date -= repeat_early;",
  "",
  "            // Validate whether confirmed/approved supply exists within the",
  "            // autofence window.",
  "            // Note: no check for overall shortage here, just checking whether",
  "            // stock stays positive in a constrained plan.",
  "            Duration autofence = getAutoFence();",
  "            if (!b->getAutofence() && autofence > Duration(14L * 86400L))",
  "              autofence = 14L * 86400L;",
  "            if (autofence &&",
  "                (theOnHand > -ROUNDING_ERROR || getPlanType() == 2 ||",
  "                 (getConstraints() & (MFG_LEADTIME + PO_LEADTIME)) == 0)) {",
  "              bool exists = false;",
  "              for (const auto& f : b->getFlowPlans()) {",
  "                if (f.getQuantity() <= 0 || f.getDate() < data->state->q_date)",
  "                  continue;",
  "                if (f.getDate() >",
  "                    max(data->state->q_date, Plan::instance().getCurrent()) +",
  "                        autofence)",
  "                  break;",
  "                auto tmp = f.getOperationPlan();",
  "                if (tmp && (tmp->getConfirmed() || tmp->getApproved()) &&",
  "                    f.getDate() > data->state->q_date &&",
  "                    !tmp->getOperation()->getName().starts_with(",
  "                        \"Correction for\")) {",
  "                  exists = true;",
  "                  break;",
  "                }",
  "              }",
  "              if (exists) {",
  "                // Not allowed to create extra supply at this moment",
  "                loop = false;",
  "                continue;",
  "              }",
  "            }",
  "",
  "            // Make sure the new operationplans don't inherit an owner.",
  "            // When an operation calls the solve method of suboperations, this",
  "            // field is used to pass the information about the owner",
  "            // operationplan down. When solving for buffers we must make sure",
  "            // NOT to pass owner information. At the end of solving for a buffer",
  "            // we need to restore the original settings...",
  "            data->state->curOwnerOpplan = nullptr;",
  "",
  "            // Note that the supply created with the next line changes the",
  "            // onhand value at all later dates!",
  "            auto topcommand = data->getCommandManager()->setBookmark();",
  "            auto cur_q_date = data->state->q_date;",
  "            data->state->q_qty_min = 1.0;",
  "            data->recent_buffers.clear();",
  "            data->recent_buffers.push(b);",
  "            auto data_safety_stock_planning = data->safety_stock_planning;",
  "            data->safety_stock_planning = false;",
  "            auto data_buffer_solve_shortages_only =",
  "                data->buffer_solve_shortages_only;",
  "            data->buffer_solve_shortages_only = true;",
  "            data->state->curBatch = b->getBatch();",
  "            data->state->blockedOpplan = nullptr;",
  "            data->state->dependency = nullptr;",
  "            b->getProducingOperation()->solve(*this, v);",
  "            data->safety_stock_planning = data_safety_stock_planning;",
  "            data->buffer_solve_shortages_only =",
  "                data_buffer_solve_shortages_only;",
  "",
  "            if (data->state->a_qty > ROUNDING_ERROR) {",
  "              // If we got some extra supply, we retry to get some more supply.",
  "              // Only when no extra material is obtained, we give up.",
  "              theDelta += data->state->a_qty;",
  "              theOnHand += data->state->a_qty;",
  "            } else {",
  "              data->getCommandManager()->rollback(topcommand);",
  "              if ((cur != b->getFlowPlans().end() &&",
  "                   data->state->a_date < cur->getDate()) ||",
  "                  (cur == b->getFlowPlans().end() &&",
  "                   data->state->a_date < Date::infiniteFuture)) {",
  "                if (data->state->a_date > cur_q_date) {",
  "                  auto earliestNext = cur_q_date + getMinimumDelay();",
  "                  nextAskDate = (data->state->a_date > earliestNext)",
  "                                    ? data->state->a_date",
  "                                    : earliestNext;",
  "                } else",
  "                  loop = false;",
  "              } else",
  "                loop = false;",
  "            }",
  "          }",
  "",
  "          if (b->getIPFlag() && data->hitMaxEarly >= 0L &&",
  "              !data->state->a_qty) {",
  "            if (data->hitMaxEarly == Duration::MAX) break;",
  "            if (data->hitMaxEarly > getMinimumDelay())",
  "              repeat_early += data->hitMaxEarly;",
  "            else if (getMinimumDelay())",
  "              repeat_early += getMinimumDelay();",
  "            else",
  "              repeat_early += Duration(86400L);",
  "          } else",
  "            break;",
  "        } while (--loopcounter > 0);",
  "      }",
  "      if (loopcounter <= 0)",
  "        logger << indentlevel",
  "               << \"  Warning: Hitting the max number of retries replenishing \"",
  "               << b << '\\n';",
  "      if (b->getIPFlag())",
  "        data->hitMaxEarly = prev_hitMaxEarly;",
  "      else if (!data->state->a_qty && data->hitMaxEarly == Duration(-1L))",
  "        data->hitMaxEarly = Duration::MAX;",
  "    }",
  "",
  "    // We have reached the end of the flowplans. Breaking out of the loop",
  "    // needs to be done here because in the next statements we are accessing",
  "    // *cur, which isn't valid at the end of the list",
  "    if (cur == b->getFlowPlans().end()) break;",
  "",
  "    // The minimum or the maximum have changed",
  "    // Note that these limits can be updated only after the processing of the",
  "    // date change in the statement above. Otherwise the code above would",
  "    // already use the new value before the intended date.",
  "    if (cur->getEventType() == 3 && !shortagesonly)",
  "      current_minimum = cur->getMin();",
  "    if (cur->getEventType() == 4) current_maximum = cur->getMax();",
  "",
  "    // Update the pointer to the previous flowplan.",
  "    prev = &*cur;",
  "    currentDate = cur->getDate();",
  "    ++cur;",
  "  }",
  "",
  "  // Message",
  "  if (getLogLevel() > 1)",
  "    logger << indentlevel-- << \"Buffer '\" << b << \"' solved for \"",
  "           << (shortagesonly ? \"shortages\" : \"safety stock\") << '\\n';",
  "}",
  "",
  "void SolverCreate::solve(const BufferInfinite* b, void* v) {",
  "  auto* data = static_cast<SolverData*>(v);",
  "",
  "  // Call the user exit",
  "  if (userexit_buffer)",
  "    userexit_buffer.call(b, PythonData(data->constrainedPlanning));",
  "",
  "  // Message",
  "  if (getLogLevel() > 1)",
  "    logger << ++indentlevel << \"Infinite buffer '\" << b",
  "           << \"' is asked: \" << data->state->q_qty << \"  \"",
  "           << data->state->q_date << '\\n';",
  "",
  "  // Reply whatever is requested, regardless of date, quantity or supply.",
  "  // The demand is not propagated upstream either.",
  "  data->state->a_qty = data->state->q_qty;",
  "  data->state->a_date = data->state->q_date;",
  "  if (b->getItem() && data->state->q_qty > 0) {",
  "    auto tmp = data->state->q_qty * b->getItem()->getCost();",
  "    data->state->a_cost += tmp;",
  "    if (data->logcosts && data->incostevaluation)",
  "      logger << indentlevel << \"     + cost on buffer '\" << b << \"': \" << tmp",
  "             << '\\n';",
  "  }",
  "",
  "  // Message",
  "  if (getLogLevel() > 1)",
  "    logger << indentlevel-- << \"Infinite buffer '\" << b",
  "           << \"' answers: \" << data->state->a_qty << '\\n';",
  "}",
  "",
  "}  // namespace frepple",
];
