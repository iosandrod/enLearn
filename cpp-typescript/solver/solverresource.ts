import { OperationPlan } from "../model/operationplan.js";
import { LoadPlan } from "../model/loadplan.js";
import { LoadDefault } from "../model/load.js";
import { OperationTimePer } from "../model/operation.js";
import { OperationPlanState } from "../model/operationplan.js";
import { Plan } from "../model/plan.js";
import { Resource, ResourceBuckets, ResourceInfinite } from "../model/resource.js";
import { Date as PlanningDate, Duration } from "../utils/date.js";
import type { SolverCreate, SolverCreateSolverData } from "./solverplan.js";

const traceScheduling = process.env.FREPPLE_TS_TRACE === "1";
const ROUNDING_ERROR = 0.000001;

type ResourceTimelineEvent = ReturnType<Resource["getLoadPlans"]>[number];

function eventValue(event: ResourceTimelineEvent, method: string, ...args: readonly unknown[]): unknown {
  if (!event || typeof event !== "object") return undefined;
  const callback = Reflect.get(event, method);
  return typeof callback === "function" ? Reflect.apply(callback, event, args) : undefined;
}

function eventDate(event: ResourceTimelineEvent): PlanningDate {
  const value = eventValue(event, "getDate") ?? eventValue(event, "getLoadplanDate");
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(PlanningDate.infinitePast);
}

function eventNumber(event: ResourceTimelineEvent, method: string): number {
  return Number(eventValue(event, method) ?? 0);
}

function timelineOnhand(events: readonly ResourceTimelineEvent[], index: number): number {
  const event = events[index];
  return Number(eventValue(event as ResourceTimelineEvent, "getOnhand") ?? 0);
}

interface ResourceTimelineView {
  readonly dates: readonly PlanningDate[];
  readonly eventTypes: readonly number[];
  readonly onhands: readonly number[];
  readonly maximumBeforeDate: readonly number[];
}

function buildTimelineView(resource: Resource, events: readonly ResourceTimelineEvent[]): ResourceTimelineView {
  const dates = events.map((event) => eventDate(event));
  const eventTypes = events.map((event) => eventNumber(event, "getEventType"));
  const onhands = events.map((event) => Number(eventValue(event, "getOnhand") ?? 0));
  const maximumBeforeDate = new Array<number>(events.length);
  let maximum = resource.getMaximum();
  for (let start = 0; start < events.length;) {
    let end = start + 1;
    while (end < events.length && dates[end]?.equals(dates[start] as PlanningDate)) end += 1;
    for (let index = start; index < end; index += 1) maximumBeforeDate[index] = maximum;
    for (let index = start; index < end; index += 1) {
      const event = events[index];
      if (event && eventTypes[index] === 4) {
        maximum = Number(eventValue(event, "getMax", true) ?? eventValue(event, "getOnhand") ?? maximum);
      }
    }
    start = end;
  }
  return { dates, eventTypes, onhands, maximumBeforeDate };
}

function traceResource(message: string, details: Readonly<Record<string, unknown>>): void {
  if (traceScheduling) process.stderr.write(`[resource] ${message} ${JSON.stringify(details)}\n`);
}

interface BucketWindow {
  readonly start: PlanningDate;
  readonly end: PlanningDate;
  readonly available: number;
}

function bucketWindows(resource: ResourceBuckets): readonly BucketWindow[] {
  const events = [...resource.getLoadPlans()];
  const boundaries = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => eventNumber(event, "getEventType") === 2);
  return boundaries.map(({ event, index }, position) => {
    const next = boundaries[position + 1];
    let available = eventNumber(event, "getOnhand");
    const limit = next?.index ?? events.length;
    for (let cursor = index + 1; cursor < limit; cursor += 1) {
      const candidate = events[cursor];
      if (candidate && eventNumber(candidate, "getEventType") === 1) {
        available = eventNumber(candidate, "getOnhand");
      }
    }
    return {
      start: eventDate(event),
      end: next ? eventDate(next.event) : new PlanningDate(PlanningDate.infiniteFuture),
      available,
    };
  });
}

function resourceEfficiency(resource: ResourceBuckets, date: PlanningDate): number {
  return resource.getEfficiencyCalendar()?.getValue(date) ?? resource.getEfficiency();
}

function bucketizedCost(resource: ResourceBuckets, operationPlan: OperationPlan, quantity: number): number {
  const productive = operationPlan.getDates().getDuration().seconds - operationPlan.getUnavailable().seconds;
  return quantity * resource.getCost() * productive / 3_600;
}

/** C++ SolverCreate::solve(const ResourceBuckets*): quota-bucket capacity semantics. */
function solveBucketizedResourceSemantic(
  solver: SolverCreate,
  resource: ResourceBuckets,
  data: SolverCreateSolverData,
): boolean {
  const operationPlan = data.state.q_operationplan;
  const loadPlan = data.state.q_loadplan;
  const load = loadPlan instanceof LoadPlan ? loadPlan.getLoad() : null;
  if (!(operationPlan instanceof OperationPlan) || !(loadPlan instanceof LoadPlan) || !load) {
    data.state.a_qty = Math.abs(data.state.q_qty) || operationPlan?.getQuantity() || 1;
    data.state.a_date = new PlanningDate(data.state.q_date);
    return true;
  }
  if (!resource.getConstrained() || !data.constrainedPlanning || !solver.isConstrained()
      || !solver.isCapacityConstrained()) {
    data.state.a_qty = Math.abs(data.state.q_qty) || operationPlan.getQuantity();
    data.state.a_date = new PlanningDate(data.state.q_date);
    data.state.a_cost += bucketizedCost(resource, operationPlan, data.state.a_qty);
    return true;
  }

  data.state.has_bucketized_resources = true;
  const original = new OperationPlanState(operationPlan);
  const originalAsked = Math.abs(data.state.q_qty);
  const timePerLogic = operationPlan.getOperation() instanceof OperationTimePer
    && (operationPlan.getOperation() as OperationTimePer).getDurationPer().seconds !== 0
    && load instanceof LoadDefault;
  data.state.a_qty = originalAsked;
  data.state.a_date = new PlanningDate(data.state.q_date);

  const overload = (): number => loadPlan.getBucketEnd()[0];
  const accept = (): boolean => {
    data.state.a_qty = Math.abs(loadPlan.getQuantity());
    data.state.a_date = loadPlan.getDate();
    return data.state.a_qty > ROUNDING_ERROR;
  };
  const resizeToFit = (currentOverload: number): boolean => {
    const loadPerUnit = load.getQuantity();
    if (!loadPerUnit || currentOverload >= -ROUNDING_ERROR) return currentOverload >= -ROUNDING_ERROR;
    const oldQuantity = operationPlan.getQuantity();
    const efficiency = resourceEfficiency(resource, loadPlan.getDate());
    const newQuantity = oldQuantity + currentOverload / loadPerUnit * efficiency / 100;
    if (newQuantity <= ROUNDING_ERROR || Math.abs(newQuantity - oldQuantity) < ROUNDING_ERROR) return false;
    const before = new OperationPlanState(operationPlan);
    const oldEnd = operationPlan.getEnd();
    operationPlan.setOperationPlanParameters(
      newQuantity, PlanningDate.infinitePast, oldEnd, true, true, true,
    );
    if (operationPlan.getQuantity() > ROUNDING_ERROR
        && operationPlan.getQuantity() <= newQuantity + ROUNDING_ERROR
        && operationPlan.getEnd().compare(oldEnd) <= 0
        && overload() >= -ROUNDING_ERROR) return accept();
    operationPlan.restore(before);
    return false;
  };

  let currentOverload = overload();
  traceResource("bucket-candidate", {
    resource: resource.getName(), operation: operationPlan.getOperation()?.getName() ?? null,
    quantity: operationPlan.getQuantity(), load: loadPlan.getQuantity(),
    date: loadPlan.getDate().toString(), overload: currentOverload, timePerLogic,
  });

  if (currentOverload >= -ROUNDING_ERROR) {
    accept();
  } else if (!data.state.forceLate && !timePerLogic
      && originalAsked > -currentOverload + ROUNDING_ERROR
      && resizeToFit(currentOverload)) {
    currentOverload = 0;
  } else if (!data.state.forceLate) {
    const earliest = original.end.subtract(resource.getMaxEarly());
    const candidates = bucketWindows(resource)
      .filter((bucket) => bucket.end.compare(loadPlan.getDate()) <= 0
        && bucket.end.compare(earliest) > 0 && bucket.available > ROUNDING_ERROR)
      .reverse();
    let found = false;
    for (const bucket of candidates) {
      operationPlan.restore(original);
      const loadDate = bucket.end.subtract(new Duration(1));
      if (!load.getEffective().within(loadDate)) continue;
      const operationDate = load.getOperationPlanDate(loadPlan, loadDate, true);
      operationPlan.setStart(operationDate);
      if (loadPlan.getDate().compare(loadDate) > 0 || operationPlan.getQuantity() <= ROUNDING_ERROR) continue;
      currentOverload = overload();
      traceResource("bucket-early", {
        resource: resource.getName(), bucketStart: bucket.start.toString(), bucketEnd: bucket.end.toString(),
        available: bucket.available, quantity: operationPlan.getQuantity(),
        loadDate: loadPlan.getDate().toString(), overload: currentOverload,
      });
      if (currentOverload >= -ROUNDING_ERROR || resizeToFit(currentOverload)) {
        if (currentOverload >= -ROUNDING_ERROR) accept();
        currentOverload = 0;
        found = true;
        break;
      }
    }
    if (!found) data.state.a_qty = 0;
  }

  if (data.state.a_qty === 0 || data.state.forceLate && currentOverload < -ROUNDING_ERROR) {
    operationPlan.restore(original);
    const later = bucketWindows(resource).find((bucket) =>
      bucket.end.compare(loadPlan.getDate()) > 0 && bucket.available > ROUNDING_ERROR);
    if (later) {
      const loadDate = later.start;
      const operationDate = load.getOperationPlanDate(loadPlan, loadDate, true);
      operationPlan.setStart(operationDate);
      data.state.a_date = operationPlan.getEnd();
    } else {
      data.state.a_date = new PlanningDate(PlanningDate.infiniteFuture);
    }
    data.state.a_qty = 0;
  }

  if (timePerLogic && !data.state.a_qty && data.state.a_date.compare(original.end) <= 0) {
    data.state.a_date = original.end.add(solver.getLazyDelay());
  }
  if (data.state.a_qty > 0) {
    data.state.a_cost += bucketizedCost(resource, operationPlan, data.state.a_qty);
    if (original.end.compare(operationPlan.getEnd()) > 0) {
      data.state.a_penalty += original.end.subtract(operationPlan.getEnd()).seconds
        * (resource.getCost() > 0 ? resource.getCost() : 1) * 0.05 / 3_600;
    }
  }
  if (data.state.a_qty < originalAsked - ROUNDING_ERROR) data.accept_partial_reply = true;
  traceResource("bucket-answer", {
    resource: resource.getName(), quantity: data.state.a_qty,
    operationQuantity: operationPlan.getQuantity(), start: operationPlan.getStart().toString(),
    end: operationPlan.getEnd().toString(), answerDate: data.state.a_date.toString(),
  });
  return data.state.a_qty > ROUNDING_ERROR;
}

/** Capacity check with a bounded early-slot search for proposed plans. */
export function solveResourceSemantic(
  solver: SolverCreate,
  resource: Resource,
  data: SolverCreateSolverData,
): boolean {
  solver.getUserExitResource()?.(resource, solver, data);
  if (resource instanceof ResourceBuckets) {
    return solveBucketizedResourceSemantic(solver, resource, data);
  }
  const operationPlan = data.state.q_operationplan;
  traceResource("ask", {
    demand: data.state.curDemand?.getName() ?? null,
    operation: operationPlan?.getOperation()?.getName() ?? null,
    resource: resource.getName(),
    start: operationPlan?.getStart().toString() ?? null,
    end: operationPlan?.getEnd().toString() ?? null,
  });
  if (resource instanceof ResourceInfinite || !resource.getConstrained()
      || !data.constrainedPlanning || !solver.isConstrained()
      || !solver.isCapacityConstrained() || !(operationPlan instanceof OperationPlan)) {
    data.state.a_qty = Math.abs(data.state.q_qty) || operationPlan?.getQuantity() || 1;
    data.state.a_date = new PlanningDate(data.state.q_date);
    if (operationPlan instanceof OperationPlan && data.state.a_qty > 0) {
      data.state.a_cost += data.state.a_qty * resource.getCost()
        * operationPlan.getDates().getDuration().seconds / 3_600;
    }
    return true;
  }

  const loadPlan = data.state.q_loadplan;
  traceResource("input", {
    operation: operationPlan.getOperation()?.getName() ?? null,
    resource: resource.getName(),
    questionQuantity: data.state.q_qty,
    operationQuantity: operationPlan.getQuantity(),
    loadQuantity: loadPlan instanceof LoadPlan ? loadPlan.getQuantity() : null,
  });
  const capacityFeasible = (): boolean => !(loadPlan instanceof LoadPlan)
    || loadPlan.getResource() !== resource || loadPlan.getFeasible();
  let feasible = capacityFeasible();
  traceResource("candidate", {
    demand: data.state.curDemand?.getName() ?? null,
    start: operationPlan.getStart().toString(),
    end: operationPlan.getEnd().toString(),
    feasible,
  });
  if (feasible && !data.state.forceLate) {
    data.state.a_qty = Math.abs(data.state.q_qty) || operationPlan.getQuantity();
    data.state.a_date = operationPlan.getEnd();
    data.state.a_cost += data.state.a_qty * resource.getCost()
      * operationPlan.getDates().getDuration().seconds / 3_600;
    traceResource("answer", {
      operation: operationPlan.getOperation()?.getName() ?? null,
      resource: resource.getName(), answerQuantity: data.state.a_qty,
      operationQuantity: operationPlan.getQuantity(),
      loadQuantity: loadPlan instanceof LoadPlan ? loadPlan.getQuantity() : null,
    });
    return true;
  }
  if (!(loadPlan instanceof LoadPlan)) return true;

  const originalPlan = new OperationPlanState(operationPlan);
  const originalEnd = originalPlan.end;
  const maxEarly = resource.getMaxEarly().seconds;
  const earliestTicks = Math.max(
    PlanningDate.infinitePast.getTicks(),
    originalEnd.getTicks() - Math.max(0, maxEarly),
    solver.isLeadTimeConstrained(operationPlan.getOperation())
      ? Plan.instance().getCurrent().getTicks()
      : PlanningDate.infinitePast.getTicks(),
  );
  const step = 3_600;
  const limit = Math.max(1, solver.getResourceIterationMax());
  for (let iteration = 1; !data.state.forceLate && iteration <= limit; iteration += 1) {
    feasible = false;
    const previousEnd = operationPlan.getEnd();
    const earliestDate = operationPlan.getStart();
    const events = [...resource.getLoadPlans()];
    const timeline = buildTimelineView(resource, events);
    const loadPlanIndex = events.indexOf(loadPlan);
    if (loadPlanIndex < 0) break;

    let currentDate = timeline.dates[loadPlanIndex] as PlanningDate;
    let currentMaximum = timeline.maximumBeforeDate[loadPlanIndex] ?? resource.getMaximum();
    let overloadIndex = -1;
    for (let index = loadPlanIndex; index >= 0; index -= 1) {
      const event = events[index];
      const date = timeline.dates[index];
      if (!event || !date || date.compare(earliestDate) < 0) break;
      const previousMaximum = currentMaximum;
      if (timeline.eventTypes[index] === 4) {
        currentMaximum = timeline.maximumBeforeDate[index] ?? resource.getMaximum();
      }
      if (timeline.eventTypes[index] === 5) continue;
      if (date.equals(currentDate)) continue;
      if ((timeline.onhands[index] ?? 0) > previousMaximum + ROUNDING_ERROR) {
        overloadIndex = index;
        break;
      }
      currentDate = date;
    }

    if (overloadIndex < 0) {
      feasible = true;
    } else {
      traceResource("overload", {
        demand: data.state.curDemand?.getName() ?? null,
        operation: operationPlan.getOperation()?.getName() ?? null,
        loadPlanIndex,
        overloadIndex,
        events: events.slice(Math.max(0, overloadIndex - 8), Math.min(events.length, loadPlanIndex + 3)).map((event, offset) => ({
          index: Math.max(0, overloadIndex - 8) + offset,
          date: eventDate(event).toString(),
          type: eventNumber(event, "getEventType"),
          quantity: eventNumber(event, "getQuantity"),
          onhand: timelineOnhand(events, Math.max(0, overloadIndex - 8) + offset),
          maximum: timeline.maximumBeforeDate[Math.max(0, overloadIndex - 8) + offset] ?? resource.getMaximum(),
          operation: String(eventValue(eventValue(event, "getOperationPlan") as ResourceTimelineEvent, "getOperation")
            ? eventValue(eventValue(eventValue(event, "getOperationPlan") as ResourceTimelineEvent, "getOperation") as ResourceTimelineEvent, "getName")
            : ""),
        })),
      });
      let index = overloadIndex;
      currentMaximum = timeline.maximumBeforeDate[index] ?? resource.getMaximum();
      currentDate = timeline.dates[index] as PlanningDate;
      for (; index >= 0 && currentDate.getTicks() > earliestTicks; index -= 1) {
        const event = events[index];
        if (!event) break;
        const previousMaximum = currentMaximum;
        if (timeline.eventTypes[index] === 4) {
          currentMaximum = timeline.maximumBeforeDate[index] ?? resource.getMaximum();
        }
        const date = timeline.dates[index] as PlanningDate;
        if (date.equals(currentDate) || timeline.eventTypes[index] === 5) continue;
        if ((timeline.onhands[index] ?? 0) < previousMaximum + ROUNDING_ERROR
            && currentDate.compare(previousEnd) < 0) {
          break;
        }
        currentDate = date;
      }

      if (index < 0 || currentDate.getTicks() <= earliestTicks || currentDate.compare(previousEnd) >= 0) break;
      operationPlan.setOperationPlanParameters(
        operationPlan.getQuantity(), PlanningDate.infinitePast, currentDate, true, true, false,
      );
      if (operationPlan.getEnd().compare(currentDate) > 0 || operationPlan.getQuantity() === 0) break;
    }
    traceResource("candidate", {
      demand: data.state.curDemand?.getName() ?? null,
      iteration,
      boundary: currentDate.toString(),
      start: operationPlan.getStart().toString(),
      end: operationPlan.getEnd().toString(),
      feasible,
    });
    if (feasible) {
      data.state.a_qty = Math.abs(data.state.q_qty) || operationPlan.getQuantity();
      data.state.a_date = operationPlan.getEnd();
      data.state.a_cost += data.state.a_qty * resource.getCost()
        * operationPlan.getDates().getDuration().seconds / 3_600;
      if (originalEnd.compare(operationPlan.getEnd()) > 0) {
        data.state.a_penalty += originalEnd.subtract(operationPlan.getEnd()).seconds
          * 0.05 / 3_600 * (resource.getCost() || 1);
      }
      return true;
    }
  }

  // C++ switches from the ending loadplan to its paired starting loadplan and
  // scans forward until the complete operationplan fits. Capacity becoming
  // available is an exact retry boundary; lazy delay isn't applied here.
  operationPlan.restore(originalPlan);
  const startLoadPlan = loadPlan.getOtherLoadPlan();
  let hasOverload = true;
  let newDate: PlanningDate | null = null;
  let laterIterations = 0;
  if (startLoadPlan) {
    do {
      const events = [...resource.getLoadPlans()];
      const startIndex = events.indexOf(startLoadPlan);
      if (startIndex < 0) {
        hasOverload = true;
        newDate = null;
        break;
      }

      hasOverload = false;
      newDate = null;
      let currentMaximum = startLoadPlan.getMax();
      let ignored = 0;
      const ignoredLoad = (event: ResourceTimelineEvent): number => {
        if (!(event instanceof LoadPlan) || event.getEventType() !== 1) return 0;
        const eventPlan = event.getOperationPlan();
        return eventPlan && !eventPlan.getActivated()
          && eventPlan.getOperation() !== operationPlan.getOperation()
          ? event.getQuantity() : 0;
      };
      for (let index = 0; index < startIndex; index += 1) {
        const event = events[index];
        if (event) ignored += ignoredLoad(event);
      }

      for (let index = startIndex; index < events.length;) {
        const event = events[index];
        if (!event) { index += 1; continue; }
        if (eventNumber(event, "getEventType") === 4) {
          currentMaximum = Number(eventValue(event, "getMax")
            ?? eventValue(event, "getOnhand") ?? currentMaximum);
        }
        ignored += ignoredLoad(event);

        const loadEvent = event;
        const date = eventDate(loadEvent);
        index += 1;
        if (index < events.length && eventDate(events[index] as ResourceTimelineEvent).equals(date)) continue;

        const adjustedOnhand = eventNumber(loadEvent, "getOnhand") - ignored;
        if (adjustedOnhand > currentMaximum + ROUNDING_ERROR) {
          hasOverload = true;
        } else if (!hasOverload && date.compare(operationPlan.getEnd()) > 0) {
          break;
        } else if (!newDate && !date.equals(startLoadPlan.getDate())
            && currentMaximum >= Math.abs(eventNumber(loadEvent, "getQuantity"))) {
          const previous = events[index - 2];
          const next = events[index];
          const onlyEventOnDate = (!previous || !eventDate(previous).equals(date))
            && (!next || !eventDate(next).equals(date));
          if (!date.equals(operationPlan.getEnd()) || !onlyEventOnDate) newDate = date;
        }

        if (hasOverload && newDate) break;
      }

      if (hasOverload && newDate) {
        operationPlan.setOperationPlanParameters(
          originalPlan.quantity, newDate, PlanningDate.infinitePast, true, true, false,
        );
        hasOverload = true;
        if (operationPlan.getStart().compare(newDate) < 0
            || operationPlan.getQuantity() === 0
            || operationPlan.getEnd().equals(PlanningDate.infiniteFuture)) break;
      }
      laterIterations += 1;
    } while (hasOverload && newDate && laterIterations < limit);
  }

  data.state.a_qty = 0;
  if (hasOverload) data.state.a_date = new PlanningDate(PlanningDate.infiniteFuture);
  else if (operationPlan.getEnd().compare(originalEnd) > 0) data.state.a_date = operationPlan.getEnd();
  else data.state.a_date = originalEnd.add(solver.getMinimumDelay());
  traceResource("later-answer", {
    demand: data.state.curDemand?.getName() ?? null,
    operation: operationPlan.getOperation()?.getName() ?? null,
    iterations: laterIterations,
    start: operationPlan.getStart().toString(), end: operationPlan.getEnd().toString(),
    answerDate: data.state.a_date.toString(), hasOverload,
  });
  return false;
}

/**
 * Semantic migration unit for src/solver/solverresource.cpp.
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
  { name: "SolverCreate::solve", sourceLine: 32, status: "adapted" },
  { name: "SolverCreate::solveUnconstrained", sourceLine: 357, status: "adapted" },
  { name: "SolverCreate::solve", sourceLine: 393, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface SolverCreatePort {
  solve(...args: readonly PortValue[]): PortValue | void;
  solveUnconstrained(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/solver/solverresource.cpp";
export const targetFile = "solver/solverresource.ts";

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
  "/* @todo resource solver should be using a move command rather than direct move",
  " */",
  "void SolverCreate::solve(const Resource* res, void* v) {",
  "  // Shortcut for unconstrained resources",
  "  if (!res->getConstrained()) {",
  "    solveUnconstrained(res, v);",
  "    return;",
  "  }",
  "",
  "  auto* data = static_cast<SolverData*>(v);",
  "",
  "  // Call the user exit",
  "  if (userexit_resource)",
  "    userexit_resource.call(res, PythonData(data->constrainedPlanning));",
  "",
  "  // Message",
  "  if (getLogLevel() > 1) {",
  "    if (!data->constrainedPlanning || !isConstrained())",
  "      logger << ++indentlevel << \"Resource '\" << res",
  "             << \"' is asked in unconstrained mode: \" << (-data->state->q_qty)",
  "             << \"  \" << data->state->q_operationplan->getDates() << '\\n';",
  "    else",
  "      logger << ++indentlevel << \"Resource '\" << res",
  "             << \"' is asked: \" << (-data->state->q_qty) << \"  \"",
  "             << data->state->q_operationplan->getDates() << '\\n';",
  "  }",
  "",
  "  // Initialize some variables",
  "  double orig_q_qty = -data->state->q_qty;",
  "  OperationPlanState currentOpplan(data->state->q_operationplan);",
  "  Resource::loadplanlist::const_iterator cur = res->getLoadPlans().end();",
  "  Date curdate;",
  "  double curMax, prevMax;",
  "  bool HasOverload;",
  "  bool noRestore = data->state->forceLate;",
  "",
  "  // Initialize the default reply",
  "  data->state->a_date = data->state->q_date;",
  "  data->state->a_qty = orig_q_qty;",
  "  Date prevdate;",
  "",
  "  // Loop for a valid location by using EARLIER capacity",
  "  if (!data->state->forceLate) do {",
  "      // Check the leadtime constraints",
  "      prevdate = data->state->q_operationplan->getEnd();",
  "      noRestore = data->state->forceLate;",
  "",
  "      if (isLeadTimeConstrained(data->state->q_operationplan->getOperation()))",
  "        // Note that the check function can update the answered date and",
  "        // quantity",
  "        if (data->constrainedPlanning &&",
  "            !checkOperationLeadTime(data->state->q_operationplan, *data,",
  "                                    false)) {",
  "          // Operationplan violates the lead time and/or fence constraint",
  "          noRestore = true;",
  "          break;",
  "        }",
  "",
  "      // Check if this operation overloads the resource at its current time",
  "      HasOverload = false;",
  "      Date earliestdate = data->state->q_operationplan->getStart();",
  "      curdate = data->state->q_loadplan->getDate();",
  "      curMax = data->state->q_loadplan->getMax(false);",
  "      prevMax = curMax;",
  "      for (cur = res->getLoadPlans().begin(data->state->q_loadplan);",
  "           cur != res->getLoadPlans().end() && cur->getDate() >= earliestdate;",
  "           --cur) {",
  "        // A change in the maximum capacity",
  "        prevMax = curMax;",
  "        if (cur->getEventType() == 4) curMax = cur->getMax(false);",
  "",
  "        // Skip setup change events",
  "        if (cur->getEventType() == 5) continue;",
  "",
  "        // Not interested if date doesn't change",
  "        if (cur->getDate() == curdate) continue;",
  "",
  "        if (cur->getOnhand() > prevMax + ROUNDING_ERROR) {",
  "          // Overload: We are exceeding the limit!",
  "          // At this point:",
  "          //  - cur points to a loadplan where we exceed the capacity",
  "          //  - curdate points to the latest date without overload",
  "          //  - curdate != cur->getDate()",
  "          HasOverload = true;",
  "          break;",
  "        }",
  "        curdate = cur->getDate();",
  "      }",
  "",
  "      // Try solving the overload by moving the operationplan to an earlier date",
  "      if (HasOverload) {",
  "        // Search backward in time for a period where there is no overload",
  "        curMax = cur->getMax(false);",
  "        prevMax = curMax;",
  "        curdate = cur->getDate();",
  "        for (; cur != res->getLoadPlans().end() &&",
  "               curdate > currentOpplan.end - res->getMaxEarly();",
  "             --cur) {",
  "          // A change in the maximum capacity",
  "          prevMax = curMax;",
  "          if (cur->getEventType() == 4) curMax = cur->getMax(false);",
  "",
  "          // Not interested if date doesn't change or setup end events",
  "          if (cur->getDate() == curdate || cur->getEventType() == 5) continue;",
  "",
  "          // We are below the max limit now.",
  "          if (cur->getOnhand() < prevMax + ROUNDING_ERROR && curdate < prevdate)",
  "            break;",
  "          curdate = cur->getDate();",
  "        }",
  "        assert(curdate != prevdate);",
  "",
  "        // We found a date where the load goes below the maximum",
  "        // At this point:",
  "        //  - curdate is a latest date where we are above the maximum",
  "        //  - cur is the first loadplan where we are below the max",
  "        if (cur != res->getLoadPlans().end() &&",
  "            curdate > currentOpplan.end - res->getMaxEarly()) {",
  "          // Move the operationplan",
  "          data->state->q_operationplan->setEnd(curdate);",
  "",
  "          // Verify the move is successfull",
  "          if (data->state->q_operationplan->getEnd() > curdate ||",
  "              data->state->q_operationplan->getQuantity() == 0.0)",
  "            // If there isn't available time in the location calendar, the move",
  "            // can fail.",
  "            data->state->a_qty = 0.0;",
  "          else if (data->constrainedPlanning &&",
  "                   isLeadTimeConstrained(",
  "                       data->state->q_operationplan->getOperation()))",
  "            // Check the leadtime constraints after the move",
  "            // Note that the check function can update the answered date",
  "            // and quantity",
  "            checkOperationLeadTime(data->state->q_operationplan, *data, false);",
  "        } else {",
  "          // No earlier capacity found: get out of the loop",
  "          data->state->a_qty = 0.0;",
  "          if (res->getMaxEarly() > data->hitMaxEarly)",
  "            data->hitMaxEarly = res->getMaxEarly();",
  "        }",
  "      }  // End of if-statement, solve by moving earlier",
  "    } while (HasOverload && data->state->a_qty != 0.0);",
  "",
  "  // Loop for a valid location by using LATER capacity",
  "  // If the answered quantity is 0, the operationplan is moved into the past.",
  "  // Or, the solver may be forced to produce a late reply.",
  "  // In these cases we need to search for capacity at later dates.",
  "  if (data->constrainedPlanning &&",
  "      (data->state->a_qty == 0.0 || data->state->forceLate)) {",
  "    // Put the operationplan back at its original end date",
  "    if (!noRestore) data->state->q_operationplan->restore(currentOpplan);",
  "",
  "    // Moving an operation earlier is driven by the ending loadplan,",
  "    // while searching for later capacity is driven from the starting loadplan.",
  "    LoadPlan* old_q_loadplan = data->state->q_loadplan;",
  "    data->state->q_loadplan = data->state->q_loadplan->getOtherLoadPlan();",
  "",
  "    // Loop to find a later date where the operationplan will fit",
  "    Date newDate;",
  "    unsigned long iterations = 0;",
  "    do {",
  "      // Search for a date where we go below the maximum load.",
  "      // and verify whether there are still some overloads",
  "      HasOverload = false;",
  "      newDate = Date::infinitePast;",
  "      curMax = data->state->q_loadplan->getMax();",
  "",
  "      // Find how many uncommitted operationplans are loading the resource",
  "      // before the loadplan.",
  "      // If the same resource is used multiple times in the supply path of a",
  "      // demand we need to use only the capacity used by other demands.",
  "      // Otherwise our estimate is of the feasible next date is too pessimistic.",
  "      // If the operation is the same, the operationplans are at the same stage",
  "      // in the supply path and we need to include these in our estimate of the",
  "      // next date.",
  "      double ignored = 0.0;",
  "      for (cur = res->getLoadPlans().begin();",
  "           cur != res->getLoadPlans().end() &&",
  "           cur != res->getLoadPlans().begin(data->state->q_loadplan);",
  "           ++cur) {",
  "        const LoadPlan* ldplan = nullptr;",
  "        if (cur->getEventType() == 1)",
  "          ldplan = static_cast<const LoadPlan*>(&*cur);",
  "        if (ldplan && !ldplan->getOperationPlan()->getActivated() &&",
  "            ldplan->getOperationPlan()->getOperation() !=",
  "                data->state->q_operationplan->getOperation())",
  "          ignored += ldplan->getQuantity();",
  "      }",
  "",
  "      for (cur = res->getLoadPlans().begin(data->state->q_loadplan);",
  "           !(HasOverload && newDate) && cur != res->getLoadPlans().end();) {",
  "        // New maximum",
  "        if (cur->getEventType() == 4) curMax = cur->getMax();",
  "        const LoadPlan* ldplan = nullptr;",
  "        if (cur->getEventType() == 1)",
  "          ldplan = static_cast<const LoadPlan*>(&*cur);",
  "        if (ldplan && !ldplan->getOperationPlan()->getActivated() &&",
  "            ldplan->getOperationPlan()->getOperation() !=",
  "                data->state->q_operationplan->getOperation())",
  "          ignored += ldplan->getQuantity();",
  "",
  "        // Only consider the last loadplan for a certain date",
  "        const TimeLine<LoadPlan>::Event* loadpl = &*(cur++);",
  "        if (cur != res->getLoadPlans().end() &&",
  "            cur->getDate() == loadpl->getDate())",
  "          continue;",
  "",
  "        // Check if overloaded",
  "        if (loadpl->getOnhand() - ignored > curMax + ROUNDING_ERROR)",
  "          // There is still a capacity problem",
  "          HasOverload = true;",
  "        else if (!HasOverload &&",
  "                 loadpl->getDate() > data->state->q_operationplan->getEnd())",
  "          // Break out of loop if no overload and we're beyond the",
  "          // operationplan end date.",
  "          break;",
  "        else if (!newDate &&",
  "                 loadpl->getDate() != data->state->q_loadplan->getDate() &&",
  "                 curMax >= fabs(loadpl->getQuantity()) &&",
  "                 (loadpl->getDate() != data->state->q_operationplan->getEnd() ||",
  "                  !loadpl->isOnlyEventOnDate())) {",
  "          // We are below the max limit for the first time now.",
  "          // This means that the previous date may be a proper start.",
  "          newDate = loadpl->getDate();",
  "        }",
  "      }",
  "",
  "      // Found a date with available capacity",
  "      if (HasOverload && newDate) {",
  "        data->state->q_operationplan->setOperationPlanParameters(",
  "            currentOpplan.quantity, newDate, Date::infinitePast, true, true,",
  "            false);",
  "        HasOverload = true;",
  "        if (data->state->q_operationplan->getStart() < newDate ||",
  "            !data->state->q_operationplan->getQuantity() ||",
  "            data->state->q_operationplan->getEnd() == Date::infiniteFuture)",
  "          // Moving to the new date turns out to be infeasible! Give it up.",
  "          // For instance, this can happen when the location calendar doesn't",
  "          // have any up-time after the specified date.",
  "          break;",
  "      }",
  "      ++iterations;",
  "    } while (HasOverload && newDate && iterations < getResourceIterationMax());",
  "    if (iterations >= getResourceIterationMax())",
  "      logger << indentlevel << \"Warning: no free capacity slot found on \" << res",
  "             << \" after \" << getResourceIterationMax()",
  "             << \" iterations. Last date: \" << newDate << '\\n';",
  "    data->state->q_loadplan = old_q_loadplan;",
  "",
  "    // Set the date where a next trial date can happen",
  "    if (HasOverload)",
  "      // No available capacity found anywhere in the horizon",
  "      data->state->a_date = Date::infiniteFuture;",
  "    else if (data->state->q_operationplan->getEnd() > currentOpplan.end)",
  "      data->state->a_date = data->state->q_operationplan->getEnd();",
  "    else",
  "      data->state->a_date =",
  "          currentOpplan.end + data->getSolver()->getMinimumDelay();",
  "",
  "    // Create a zero quantity reply",
  "    data->state->a_qty = 0.0;",
  "  }",
  "",
  "  // Force ok in unconstrained plan",
  "  if (!data->constrainedPlanning && data->state->a_qty == 0.0) {",
  "    data->state->q_operationplan->restore(currentOpplan);",
  "    data->state->a_date = data->state->q_date;",
  "    data->state->a_qty = orig_q_qty;",
  "  }",
  "",
  "  // Increment the cost",
  "  if (data->state->a_qty > 0.0) {",
  "    // Resource usage",
  "    {",
  "      auto tmp = data->state->a_qty * res->getCost() *",
  "                 (data->state->q_operationplan->getDates().getDuration() -",
  "                  data->state->q_operationplan->getUnavailable()) /",
  "                 3600.0;",
  "      data->state->a_cost += tmp;",
  "      if (data->logcosts && data->incostevaluation)",
  "        logger << indentlevel << \"     + cost on resource '\" << res",
  "               << \"': \" << tmp << '\\n';",
  "    }",
  "",
  "    // Setup cost",
  "    data->state->a_penalty += data->state->q_operationplan->getSetupCost();",
  "    // Build-ahead penalty: 5% of the cost   @todo buildahead penalty is",
  "    // hardcoded",
  "    if (currentOpplan.end > data->state->q_operationplan->getEnd())",
  "      data->state->a_penalty +=",
  "          (currentOpplan.end - data->state->q_operationplan->getEnd()) * 0.05 /",
  "          3600.0 * (res->getCost() > 0 ? res->getCost() : 1.0);",
  "  }",
  "",
  "  // Maintain the constraint list",
  "  if (data->state->a_qty == 0.0 && data->logConstraints && data->constraints)",
  "    data->constraints->push(ProblemCapacityOverload::metadata, res,",
  "                            currentOpplan.start, currentOpplan.end, 0.0,",
  "                            data->state->q_operationplan->getOperation());",
  "",
  "  if (currentOpplan.end > data->state->q_operationplan->getEnd() &&",
  "      data->logConstraints && data->constraints) {",
  "    // Using earlier capacity is logged as a constraint.",
  "    // If the resource isn't on the critical path that constraint will later be",
  "    // filtered out again.",
  "    data->constraints->push(ProblemCapacityOverload::metadata, res,",
  "                            currentOpplan.end,",
  "                            data->state->q_operationplan->getEnd(), 0.0,",
  "                            data->state->q_operationplan->getOperation(), true);",
  "  }",
  "",
  "  // Message",
  "  if (getLogLevel() > 1) {",
  "    logger << indentlevel-- << \"Resource '\" << res",
  "           << \"' answers: \" << data->state->a_qty << \"  \"",
  "           << data->state->a_date;",
  "    if (currentOpplan.end > data->state->q_operationplan->getEnd())",
  "      logger << \" using earlier capacity \"",
  "             << data->state->q_operationplan->getEnd();",
  "    if (data->state->a_qty > 0.0 &&",
  "        data->state->q_operationplan->getQuantity() < currentOpplan.quantity)",
  "      logger << \" with reduced quantity \"",
  "             << data->state->q_operationplan->getQuantity();",
  "    logger << '\\n';",
  "  }",
  "}",
  "",
  "void SolverCreate::solveUnconstrained(const Resource* res, void* v) {",
  "  auto* data = static_cast<SolverData*>(v);",
  "",
  "  // Call the user exit",
  "  if (userexit_resource)",
  "    userexit_resource.call(res, PythonData(data->constrainedPlanning));",
  "",
  "  // Message",
  "  if (getLogLevel() > 1 && data->state->q_qty < 0)",
  "    logger << ++indentlevel << \"Unconstrained resource '\" << res",
  "           << \"' is asked: \" << (-data->state->q_qty) << \"  \"",
  "           << data->state->q_operationplan->getDates() << '\\n';",
  "",
  "  // @todo Need to make the setups feasible - move to earlier dates till",
  "  // max_early fence is reached",
  "",
  "  // Reply whatever is requested, regardless of date and quantity.",
  "  data->state->a_qty = -data->state->q_qty;",
  "  data->state->a_date = data->state->q_date;",
  "  {",
  "    auto tmp = data->state->a_qty * res->getCost() *",
  "               (data->state->q_operationplan->getDates().getDuration() -",
  "                data->state->q_operationplan->getUnavailable()) /",
  "               3600.0;",
  "    data->state->a_cost += tmp;",
  "    if (data->logcosts && data->incostevaluation)",
  "      logger << indentlevel << \"     + cost on resource '\" << res",
  "             << \"': \" << tmp << '\\n';",
  "  }",
  "",
  "  // Message",
  "  if (getLogLevel() > 1 && data->state->q_qty < 0)",
  "    logger << indentlevel-- << \"Unconstrained resource '\" << res",
  "           << \"' answers: \" << data->state->a_qty << '\\n';",
  "}",
  "",
  "void SolverCreate::solve(const ResourceBuckets* res, void* v) {",
  "  auto* data = static_cast<SolverData*>(v);",
  "  if (!res->getConstrained() || !data->state->q_loadplan->getLoad()) {",
  "    solveUnconstrained(res, v);",
  "    return;",
  "  }",
  "  auto opplan = data->state->q_operationplan;",
  "",
  "  // Call the user exit",
  "  if (userexit_resource)",
  "    userexit_resource.call(res, PythonData(data->constrainedPlanning));",
  "",
  "  // Message",
  "  if (getLogLevel() > 1 && data->state->q_qty < 0)",
  "    logger << ++indentlevel << \"Bucketized resource '\" << res",
  "           << \"' is asked: \" << (-data->state->q_qty) << \"  \"",
  "           << opplan->getDates() << '\\n';",
  "",
  "  // Set a flag for the checkOperation method to mark that bucketized resources",
  "  // are involved",
  "  data->state->has_bucketized_resources = true;",
  "",
  "  // Initialize some variables",
  "  bool time_per_logic =",
  "      opplan->getOperation()->hasType<OperationTimePer>() &&",
  "      static_cast<OperationTimePer*>(opplan->getOperation())",
  "          ->getDurationPer() &&",
  "      data->state->q_loadplan->getLoad()->hasType<LoadDefault>();",
  "  double orig_q_qty = -data->state->q_qty;",
  "  OperationPlanState originalOpplan(opplan);",
  "  Resource::loadplanlist::const_iterator cur = res->getLoadPlans().end();",
  "  Date curdate, prevdate, loaddate;",
  "  bool noRestore = data->state->forceLate;",
  "  double overloadQty = 0.0;",
  "  double min_free_quantity = ROUNDING_ERROR;",
  "  bool date_effective = false;",
  "",
  "  // Initialize the default reply",
  "  data->state->a_date = data->state->q_date;",
  "  data->state->a_qty = orig_q_qty;",
  "",
  "  if (time_per_logic) {",
  "    auto bucketend = data->state->q_loadplan->getBucketEnd();",
  "    overloadQty = get<0>(bucketend);",
  "    if (!data->state->forceLate) {",
  "      // TODO opportunity for performance optimization in situations where",
  "      // everything happens in a single bucket",
  "",
  "      // Reduce the operationplan to its minimum size",
  "      opplan->setOperationPlanParameters(data->state->q_qty_min / 10,",
  "                                         Date::infinitePast, originalOpplan.end,",
  "                                         true, true, false);",
  "      // See if it fits in that bucket",
  "      bucketend = data->state->q_loadplan->getBucketEnd();",
  "      overloadQty = get<0>(bucketend);",
  "",
  "      // In the same bucket, we may be able to plan more than the minimum",
  "      auto bucketstart = data->state->q_loadplan->getBucketStart();",
  "      if (overloadQty > ROUNDING_ERROR &&",
  "          opplan->getQuantity() < originalOpplan.quantity - ROUNDING_ERROR) {",
  "        // Resize the operationplan to the maximum size that still fits in",
  "        // this bucket",
  "",
  "        // Fit the best operationplan in this bucket",
  "        // If enough time is available we can plan the full requested quantity",
  "        opplan->setOperationPlanParameters(",
  "            originalOpplan.quantity, get<1>(bucketstart), originalOpplan.end,",
  "            true, true, false);",
  "        // There may not be enough capacity to support this quantity",
  "        bucketend = data->state->q_loadplan->getBucketEnd();",
  "        if (get<0>(bucketend) > -ROUNDING_ERROR) {",
  "          overloadQty = 0.0;",
  "          data->state->a_qty = -data->state->q_loadplan->getQuantity();",
  "          data->state->a_date = data->state->q_loadplan->getDate();",
  "        } else {",
  "          // Resize to fit",
  "          Date oldEnd = opplan->getEnd();",
  "          double oldQty = opplan->getQuantity();",
  "          double efficiency =",
  "              data->state->q_loadplan->getResource()->getEfficiencyCalendar()",
  "                  ? data->state->q_loadplan->getResource()",
  "                        ->getEfficiencyCalendar()",
  "                        ->getValue(data->state->q_loadplan->getDate())",
  "                  : data->state->q_loadplan->getResource()->getEfficiency();",
  "          double newQty =",
  "              oldQty + get<0>(bucketend) /",
  "                           data->state->q_loadplan->getLoad()->getQuantity() *",
  "                           efficiency / 100.0;",
  "          if (newQty > ROUNDING_ERROR) {",
  "            opplan->setOperationPlanParameters(newQty, Date::infinitePast,",
  "                                               oldEnd);",
  "            if (opplan->getQuantity() > 0 &&",
  "                opplan->getQuantity() <= newQty + ROUNDING_ERROR &&",
  "                opplan->getEnd() <= oldEnd) {",
  "              // The squeezing did work!",
  "              // The operationplan quantity is now reduced. The buffer solver",
  "              // will ask again for the remaining short quantity, so we don't",
  "              // need to bother about that here.",
  "              overloadQty = 0.0;",
  "              data->state->a_qty = -data->state->q_loadplan->getQuantity();",
  "              data->state->a_date = data->state->q_loadplan->getDate();",
  "            }",
  "          }",
  "        }",
  "      }",
  "    } else {",
  "      // Compute the minimum free capacity we need in a bucket",
  "      // -> not fully correct if efficiency and effectivity come into the",
  "      // picture",
  "      // -> replace with a move to each bucket",
  "      if (!date_effective) {",
  "        min_free_quantity =",
  "            opplan->getOperation()->setOperationPlanQuantity(",
  "                opplan, 0.01, false, false, false, Date::infinitePast) *",
  "                data->state->q_loadplan->getLoad()->getQuantity() +",
  "            data->state->q_loadplan->getLoad()->getQuantityFixed();",
  "        double efficiency =",
  "            data->state->q_loadplan->getResource()->getEfficiencyCalendar()",
  "                ? data->state->q_loadplan->getResource()",
  "                      ->getEfficiencyCalendar()",
  "                      ->getValue(data->state->q_loadplan->getDate())",
  "                : data->state->q_loadplan->getResource()->getEfficiency();",
  "        if (efficiency != 100.0) min_free_quantity /= efficiency * 100.0;",
  "      }",
  "      // TODO The logic is not symmetrical with time_per operations.",
  "      // For time-per operations we already evaluated the current bucket.",
  "    }",
  "  } else {",
  "    auto bucketend = data->state->q_loadplan->getBucketEnd();",
  "    overloadQty = get<0>(bucketend);",
  "  }",
  "",
  "  // Loop for a valid location by using EARLIER capacity",
  "  if (!data->state->forceLate && (overloadQty || !time_per_logic)) do {",
  "      // Check the leadtime constraints",
  "      prevdate = opplan->getEnd();",
  "      noRestore = data->state->forceLate;",
  "",
  "      if (isLeadTimeConstrained(opplan->getOperation()))",
  "        // Note that the check function can update the answered date and",
  "        // quantity",
  "        if (data->constrainedPlanning &&",
  "            !checkOperationLeadTime(opplan, *data, false)) {",
  "          // Operationplan violates the lead time and/or fence constraint",
  "          noRestore = true;",
  "          break;",
  "        }",
  "",
  "      // Check if this operation overloads the resource bucket",
  "      // TODO The line below is cleaner, but since the loop below also updates",
  "      // cur we can't use it yet auto bucketend =",
  "      // data->state->q_loadplan->getBucketEnd();",
  "      overloadQty = 0.0;",
  "      for (cur = res->getLoadPlans().begin(data->state->q_loadplan);",
  "           cur != res->getLoadPlans().end() && cur->getEventType() != 2; ++cur)",
  "        if (cur->getOnhand() < overloadQty) overloadQty = cur->getOnhand();",
  "",
  "      // Solve the overload in the bucket by resizing the operationplan.",
  "      // If the complete operationplan is overload then",
  "      // we can skip this step. Because of operation size constraints (minimum",
  "      // and multiple values) it is possible that the resizing fails.",
  "      if (overloadQty < -ROUNDING_ERROR &&",
  "          orig_q_qty > -overloadQty + ROUNDING_ERROR &&",
  "          data->state->q_loadplan->getLoad()->getQuantity() &&",
  "          !time_per_logic) {",
  "        OperationPlanState beforeSqueeze(opplan);",
  "        Date oldEnd = opplan->getEnd();",
  "        double oldQty = opplan->getQuantity();",
  "        double efficiency =",
  "            data->state->q_loadplan->getResource()->getEfficiencyCalendar()",
  "                ? data->state->q_loadplan->getResource()",
  "                      ->getEfficiencyCalendar()",
  "                      ->getValue(data->state->q_loadplan->getDate())",
  "                : data->state->q_loadplan->getResource()->getEfficiency();",
  "        double newQty =",
  "            oldQty + overloadQty /",
  "                         data->state->q_loadplan->getLoad()->getQuantity() *",
  "                         efficiency / 100.0;",
  "        if (newQty > ROUNDING_ERROR) {",
  "          opplan->setOperationPlanParameters(newQty, Date::infinitePast,",
  "                                             oldEnd);",
  "          if (opplan->getQuantity() > 0 &&",
  "              opplan->getQuantity() <= newQty + ROUNDING_ERROR &&",
  "              opplan->getEnd() <= oldEnd) {",
  "            // The squeezing did work!",
  "            // The operationplan quantity is now reduced. The buffer solver will",
  "            // ask again for the remaining short quantity, so we don't need to",
  "            // bother about that here.",
  "            overloadQty = 0.0;",
  "            data->state->a_qty = -data->state->q_loadplan->getQuantity();",
  "            // With operations of type time_per, it is also possible that the",
  "            // operation now consumes capacity in a different bucket.",
  "            // If that's the case, we move it to start right at the end of the",
  "            // bucket.",
  "            if (cur != res->getLoadPlans().end() &&",
  "                data->state->q_loadplan->getDate() >= cur->getDate()) {",
  "              Date tmp =",
  "                  data->state->q_loadplan->getLoad()->getOperationPlanDate(",
  "                      data->state->q_loadplan, cur->getDate() - Duration(1L),",
  "                      true);",
  "              opplan->setStart(tmp);",
  "            }",
  "          } else {",
  "            // It didn't work. Restore the original operationplan.",
  "            // @todo this undoing is a performance bottleneck: trying to resize",
  "            // and restoring the original are causing lots of updates in the",
  "            // buffer and resource timelines...",
  "            // We need an api that only checks the resizing.",
  "            opplan->restore(beforeSqueeze);",
  "          }",
  "        }",
  "      }",
  "",
  "      // Try solving the overload by moving the operationplan to an earlier date",
  "      if (overloadQty < -ROUNDING_ERROR) {",
  "        // Search backward in time for a bucket that still has capacity left",
  "        Date bucketEnd;",
  "        DateRange newStart;",
  "        cur = res->getLoadPlans().begin(data->state->q_loadplan);",
  "        bool found = false;",
  "        while (cur != res->getLoadPlans().end() &&",
  "               cur->getDate() > originalOpplan.end - res->getMaxEarly()) {",
  "          if (!data->state->q_loadplan->getLoad()->getEffective().within(",
  "                  cur->getDate())) {",
  "            // The load isn't effective any longer, and our problem is solved",
  "            newStart = opplan->getOperation()->calculateOperationTime(",
  "                opplan,",
  "                data->state->q_loadplan->getLoad()->getEffective().getStart(),",
  "                Duration(1L), false);",
  "            break;",
  "          }",
  "          if (cur->getEventType() != 2) {",
  "            --cur;",
  "            continue;",
  "          }",
  "          bucketEnd = cur->getDate();",
  "          --cur;  // Move to last loadplan in the previous bucket",
  "          if (cur != res->getLoadPlans().end() &&",
  "              cur->getOnhand() > min_free_quantity) {",
  "            // Find a suitable loadplan date in this bucket",
  "            newStart = opplan->getOperation()->calculateOperationTime(",
  "                opplan, bucketEnd, Duration(1L), false);",
  "            // Move to the start of the bucket",
  "            while (cur != res->getLoadPlans().end() && cur->getEventType() != 2)",
  "              --cur;",
  "            // If the new start date is within this bucket we have found a",
  "            // bucket with available capacity left",
  "            if (cur == res->getLoadPlans().end() ||",
  "                cur->getDate() <= newStart.getStart()) {",
  "              found = true;",
  "              break;",
  "            }",
  "          }",
  "        }",
  "",
  "        // We found a date where the load goes below the maximum.",
  "        // newStart.getStart() is the last available date in a bucket",
  "        // where capacity is still available.",
  "        // cur.getDate points to the start date of that bucket.",
  "        // bucketEnd points to the end date of that bucket.",
  "        if ((bucketEnd ||",
  "             !data->state->q_loadplan->getLoad()->getEffective().within(",
  "                 newStart.getStart())) &&",
  "            found &&",
  "            newStart.getStart() >= originalOpplan.end - res->getMaxEarly()) {",
  "          bool moved = true;",
  "          if (time_per_logic) {",
  "            // Resize the operationplan to the maximum quantity that is feasible",
  "            // in this bucket",
  "            opplan->setOperationPlanParameters(",
  "                originalOpplan.quantity, newStart.getStart(),",
  "                originalOpplan.end, false, true, true);",
  "            auto overload = get<0>(data->state->q_loadplan->getBucketEnd());",
  "            if (overload > -ROUNDING_ERROR) {",
  "              // Requested quantity fits completely in this bucket",
  "              overloadQty = 0.0;",
  "              Date tmp =",
  "                  data->state->q_loadplan->getLoad()->getOperationPlanDate(",
  "                      data->state->q_loadplan, newStart.getStart(), true);",
  "              opplan->setStart(tmp);",
  "            } else {",
  "              // Only a part of the requirement fits in the bucket",
  "              double oldQty = opplan->getQuantity();",
  "              double efficiency =",
  "                  data->state->q_loadplan->getResource()",
  "                          ->getEfficiencyCalendar()",
  "                      ? data->state->q_loadplan->getResource()",
  "                            ->getEfficiencyCalendar()",
  "                            ->getValue(data->state->q_loadplan->getDate())",
  "                      : data->state->q_loadplan->getResource()->getEfficiency();",
  "              double newQty =",
  "                  oldQty +",
  "                  overload / data->state->q_loadplan->getLoad()->getQuantity() *",
  "                      efficiency / 100.0;",
  "              if (newQty < ROUNDING_ERROR ||",
  "                  fabs(oldQty - newQty) < ROUNDING_ERROR)",
  "                moved = false;",
  "              else {",
  "                OperationPlanState tmp(opplan);",
  "                opplan->setOperationPlanParameters(newQty, newStart.getStart(),",
  "                                                   Date::infinitePast, false,",
  "                                                   true, true);",
  "                if (opplan->getQuantity() > 0 &&",
  "                    opplan->getQuantity() <= newQty + ROUNDING_ERROR &&",
  "                    opplan->getEnd() <= originalOpplan.end) {",
  "                  // The squeezing did work!",
  "                  // The operationplan quantity is now reduced. The buffer",
  "                  // solver will ask again for the remaining short quantity, so",
  "                  // we don't need to bother about that here.",
  "                  overloadQty = 0.0;",
  "                  data->state->a_qty = -data->state->q_loadplan->getQuantity();",
  "                } else {",
  "                  // It didn't work. Restore the original operationplan.",
  "                  opplan->restore(tmp);",
  "                }",
  "              }",
  "            }",
  "          } else {",
  "            // Move the operationplan to load 1 second in the bucket with",
  "            // available capacity",
  "            Date tmp = data->state->q_loadplan->getLoad()->getOperationPlanDate(",
  "                data->state->q_loadplan, newStart.getStart(), true);",
  "            opplan->setStart(tmp);",
  "          }",
  "",
  "          // Verify the move is successfull",
  "          if (!moved ||",
  "              data->state->q_loadplan->getDate() > newStart.getStart())",
  "            // The new loadplan is expected to be at the requested date or",
  "            // earlier (eg in the presence of availability calendars)",
  "            data->state->a_qty = 0.0;",
  "          else if (data->constrainedPlanning &&",
  "                   isLeadTimeConstrained(opplan->getOperation())) {",
  "            // Check the leadtime constraints after the move",
  "            // Note that the check function can update the answered date",
  "            // and quantity",
  "            checkOperationLeadTime(opplan, *data, false);",
  "            if (data->state->a_qty && time_per_logic) {",
  "              if (opplan->getStart() >= bucketEnd)",
  "                // The lead time check moved the operationplan to a later bucket",
  "                // again",
  "                data->state->a_qty = 0.0;",
  "              else {",
  "                // Doublecheck whether there are overloads",
  "                auto bckt = data->state->q_loadplan->getBucketEnd();",
  "                overloadQty = get<0>(bckt);",
  "              }",
  "            }",
  "          }",
  "        } else {",
  "          // No earlier capacity found: get out of the loop",
  "          data->state->a_qty = 0.0;",
  "          if (data->hitMaxEarly < res->getMaxEarly())",
  "            data->hitMaxEarly = res->getMaxEarly();",
  "        }",
  "      }  // End of if-statement, solve by moving earlier",
  "    } while (overloadQty < -ROUNDING_ERROR && data->state->a_qty != 0.0);",
  "",
  "  // Loop for a valid location by using LATER capacity",
  "  // If the answered quantity is 0, the operationplan is moved into the past.",
  "  // Or, the solver may be forced to produce a late reply.",
  "  // In these cases we need to search for capacity at later dates.",
  "  if (data->state->a_qty == 0.0 ||",
  "      (data->state->forceLate && overloadQty < -ROUNDING_ERROR)) {",
  "    if (!data->constrainedPlanning)",
  "      data->state->a_qty = 0.0;",
  "    else {",
  "      bool firstBucket = true;",
  "      bool hasOverloadInFirstBucket = true;",
  "",
  "      // Put the operationplan back at its original end date",
  "      if (time_per_logic)",
  "        opplan->setOperationPlanParameters(",
  "            originalOpplan.quantity, Date::infinitePast, originalOpplan.end,",
  "            true, true, false);",
  "      else if (!noRestore)",
  "        opplan->restore(originalOpplan);",
  "",
  "      // Search for a bucket with available capacity.",
  "      Date newDate;",
  "      Date prevStart = data->state->q_loadplan->getDate();",
  "      double availableQty = 0.0;",
  "      for (cur = res->getLoadPlans().begin(data->state->q_loadplan);",
  "           cur != res->getLoadPlans().end(); ++cur) {",
  "        if (cur->getEventType() != 2)",
  "          // Not a new bucket",
  "          availableQty = cur->getOnhand();",
  "        else if (availableQty > ROUNDING_ERROR) {",
  "          if (firstBucket) {",
  "            if (data->state->a_qty && noRestore) {",
  "              // Not a real overload",
  "              hasOverloadInFirstBucket = false;",
  "            }",
  "            firstBucket = false;",
  "          }",
  "          if (time_per_logic) {",
  "            // Move to the new bucket",
  "            opplan->setOperationPlanParameters(originalOpplan.quantity,",
  "                                               prevStart, Date::infinitePast,",
  "                                               true, true, false);",
  "            if (data->state->q_loadplan->getDate() < cur->getDate()) {",
  "              auto bucketend = data->state->q_loadplan->getBucketEnd();",
  "              if (get<0>(bucketend) > ROUNDING_ERROR) {",
  "                // Valid new bucket found: has available time and capacity",
  "                newDate = opplan->getStart();",
  "                // Increase the size to use all available capacity in the bucket",
  "                double newQty = originalOpplan.quantity;",
  "                opplan->setOperationPlanParameters(newQty, opplan->getStart(),",
  "                                                   Date::infinitePast, true,",
  "                                                   true, true);",
  "                break;",
  "              } else {",
  "                // New bucket starts",
  "                prevStart = cur->getDate();",
  "                availableQty = cur->getOnhand();",
  "              }",
  "            } else {",
  "              // New bucket starts",
  "              prevStart = cur->getDate();",
  "              availableQty = cur->getOnhand();",
  "            }",
  "          } else {",
  "            // Find a suitable start date in this bucket",
  "            Duration tmp;",
  "            DateRange newStart = opplan->getOperation()->calculateOperationTime(",
  "                opplan, prevStart, Duration(1L), true, &tmp);",
  "            if (newStart.getStart() < cur->getDate()) {",
  "              // If the new start date is within this bucket we just left, then",
  "              // we have found a bucket with available capacity left",
  "              newDate = newStart.getStart();",
  "              break;",
  "            } else {",
  "              // New bucket starts",
  "              prevStart = cur->getDate();",
  "              availableQty = cur->getOnhand();",
  "            }",
  "          }",
  "        } else {",
  "          // New bucket starts",
  "          prevStart = cur->getDate();",
  "          availableQty = cur->getOnhand();",
  "        }",
  "      }",
  "",
  "      Date effective_end =",
  "          data->state->q_loadplan->getLoad()->getEffective().getEnd();",
  "      if ((!newDate || newDate > effective_end) &&",
  "          effective_end != Date::infiniteFuture) {",
  "        // The load has effectivity, and when it expires we can return a",
  "        // positive reply",
  "        if (effective_end > originalOpplan.end) newDate = effective_end;",
  "      }",
  "",
  "      if (!hasOverloadInFirstBucket && !data->state->forceLate) {",
  "        // Actually, there was no problem",
  "        data->state->a_date = data->state->q_date;",
  "        data->state->a_qty = orig_q_qty;",
  "      } else if (newDate || newDate == Date::infiniteFuture) {",
  "        if (!time_per_logic) {",
  "          // Move the operationplan to the new bucket and resize to the minimum.",
  "          // Set the date where a next trial date can happen.",
  "          double q = opplan->getOperation()->getSizeMinimum();",
  "          if (opplan->getOperation()->getSizeMinimumCalendar()) {",
  "            // Minimum size varies over time",
  "            double curmin =",
  "                opplan->getOperation()->getSizeMinimumCalendar()->getValue(",
  "                    newDate);",
  "            if (q < curmin) q = curmin;",
  "          }",
  "          if (q < data->state->q_qty_min) q = data->state->q_qty_min;",
  "          opplan->setQuantity(q);",
  "          Date tmp = data->state->q_loadplan->getLoad()->getOperationPlanDate(",
  "              data->state->q_loadplan, newDate, true);",
  "          opplan->setOperationPlanParameters(q, tmp, Date::infinitePast);",
  "        }",
  "        data->state->a_date = opplan->getEnd();",
  "        data->state->a_qty = 0.0;",
  "      } else {",
  "        // No available capacity found anywhere in the horizon",
  "        data->state->a_date = Date::infiniteFuture;",
  "        data->state->a_qty = 0.0;",
  "      }",
  "    }",
  "  }",
  "",
  "  if (time_per_logic && !data->state->a_qty &&",
  "      data->state->a_date <= originalOpplan.end) {",
  "    data->state->a_date =",
  "        originalOpplan.end + data->getSolver()->getLazyDelay();",
  "  }",
  "",
  "  // Force ok in unconstrained plan",
  "  if (!data->constrainedPlanning && data->state->a_qty == 0.0) {",
  "    opplan->restore(originalOpplan);",
  "    data->state->a_date = data->state->q_date;",
  "    data->state->a_qty = orig_q_qty;",
  "  }",
  "",
  "  // Increment the cost",
  "  if (data->state->a_qty > 0.0) {",
  "    // Resource usage",
  "    auto tmp = data->state->a_qty * res->getCost() *",
  "               (opplan->getDates().getDuration() - opplan->getUnavailable()) /",
  "               3600.0;",
  "    data->state->a_cost += tmp;",
  "    if (data->logcosts && data->incostevaluation)",
  "      logger << indentlevel << \"     + cost on resource '\" << res",
  "             << \"': \" << tmp << '\\n';",
  "",
  "    // Build-ahead penalty: 5% of the cost   @todo buildahead penalty is",
  "    // hardcoded",
  "    if (originalOpplan.end > opplan->getEnd())",
  "      data->state->a_penalty += (originalOpplan.end - opplan->getEnd()) *",
  "                                (res->getCost() > 0 ? res->getCost() : 1.0) *",
  "                                0.05 / 3600.0;",
  "  }",
  "",
  "  // Maintain the constraint list",
  "  if (data->state->a_qty == 0.0 && data->logConstraints && data->constraints)",
  "    data->constraints->push(ProblemCapacityOverload::metadata, res,",
  "                            originalOpplan.start, originalOpplan.end, 0.0,",
  "                            opplan->getOperation());",
  "",
  "  if (data->state->a_qty < orig_q_qty - ROUNDING_ERROR)",
  "    data->accept_partial_reply = true;",
  "",
  "  if (originalOpplan.start > data->state->q_operationplan->getStart() &&",
  "      data->logConstraints && data->constraints) {",
  "    // Using earlier capacity is logged as a constraint.",
  "    // If the resource isn't on the critical path that constraint will later be",
  "    // filtered out again.",
  "    data->constraints->push(ProblemCapacityOverload::metadata, res,",
  "                            originalOpplan.start,",
  "                            data->state->q_operationplan->getStart(), 0.0,",
  "                            data->state->q_operationplan->getOperation(), true);",
  "  }",
  "",
  "  // Message",
  "  if (getLogLevel() > 1 && data->state->q_qty < 0) {",
  "    logger << indentlevel-- << \"Bucketized resource '\" << res",
  "           << \"' answers: \" << data->state->a_qty;",
  "    if (!data->state->a_qty)",
  "      logger << \"  \" << data->state->a_date;",
  "    else if (originalOpplan.start > data->state->q_operationplan->getStart())",
  "      logger << \" using earlier capacity \"",
  "             << data->state->q_operationplan->getStart();",
  "    logger << '\\n';",
  "  }",
  "}",
  "",
  "}  // namespace frepple",
];
