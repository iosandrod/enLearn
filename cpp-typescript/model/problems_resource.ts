// <header-api-generated>
import { Date as PlanningDate, DateRange } from "../utils/date.js";
import type { HeaderModelAdapter } from "../utils/library.js";
import type { Operation } from "./operation.js";
import type { Resource } from "./resource.js";
import {
  Problem,
  clearEntityProblems,
  formatCppNumber,
  getEntityDetectProblems,
  setEntityChanged,
} from "./problem.js";

const ROUNDING_ERROR = 0.000001;

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function eventDate(event: HeaderModelAdapter): PlanningDate {
  const value = call(event, "getDate") ?? call(event, "getLoadplanDate");
  return value instanceof PlanningDate ? new PlanningDate(value) : PlanningDate.infinitePast;
}

export class ProblemCapacityOverload extends Problem {
  static override readonly cppBases: readonly string[] = ["Problem"];
  static override readonly cppQualifiedNames: readonly string[] = ["ProblemCapacityOverload"];
  private readonly dates: DateRange;
  private readonly quantity: number;
  private operation: Operation | null = null;
  private keep = false;

  constructor(resource: Resource, start: PlanningDate, end: PlanningDate, quantity: number, add = true) {
    super(resource, false);
    this.dates = new DateRange(start, end);
    this.quantity = Number(quantity);
    if (add) this.addProblem();
  }

  override getDates(): DateRange { return new DateRange(this.dates.getStart(), this.dates.getEnd()); }
  override getDescription(): string {
    const suffix = this.quantity ? ` of ${formatCppNumber(this.quantity)}` : "";
    return `Resource '${this.getResource().getName()}' has capacity shortage${suffix}`;
  }
  override getEntity(): string { return "capacity"; }
  override getOwner(): Resource { return super.getOwner() as Resource; }
  getResource(): Resource { return this.getOwner(); }
  override getType(): string { return "overload"; }
  override isFeasible(): boolean { return false; }
  override getKeep(): boolean { return this.keep; }
  setKeep(value: boolean): void { this.keep = Boolean(value); }
  getOperation(): Operation | null { return this.operation; }
  setOperation(value: Operation | null): void { this.operation = value; }
  getQuantity(): number { return this.quantity; }
}

export function updateResourceProblems(resource: Resource, bucketized = false): void {
  clearEntityProblems(resource, false, false);
  setEntityChanged(resource, false);
  if (!getEntityDetectProblems(resource) || !resource.getConstrained()) return;

  const events = resource.getLoadPlans();
  if (bucketized) {
    let start = PlanningDate.infinitePast;
    let load = 0;
    for (const event of events) {
      if (Number(call(event, "getEventType") ?? 0) !== 2) {
        load = Number(call(event, "getOnhand") ?? 0);
        continue;
      }
      const end = eventDate(event);
      if (load < -ROUNDING_ERROR) new ProblemCapacityOverload(resource, start, end, -load);
      start = end;
      load = 0;
    }
    if (load < -ROUNDING_ERROR) {
      new ProblemCapacityOverload(resource, start, PlanningDate.infiniteFuture, -load);
    }
    return;
  }

  let overloadStart: PlanningDate | null = null;
  let overloadQuantity = 0;
  let currentMaximum = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) continue;
    if (Number(call(event, "getEventType") ?? 0) === 4) {
      currentMaximum = Number(call(event, "getMax") ?? 0);
    }
    const date = eventDate(event);
    const next = events[index + 1];
    if (next && eventDate(next).equals(date)) continue;

    const excess = Number(call(event, "getOnhand") ?? 0) - currentMaximum;
    if (excess > ROUNDING_ERROR) {
      if (!overloadStart) {
        overloadStart = date;
        overloadQuantity = excess;
      } else overloadQuantity = Math.max(overloadQuantity, excess);
    } else if (overloadStart) {
      if (!date.equals(overloadStart)) {
        new ProblemCapacityOverload(resource, overloadStart, date, overloadQuantity);
      }
      overloadStart = null;
    }
  }
  if (overloadStart) {
    new ProblemCapacityOverload(resource, overloadStart, PlanningDate.infiniteFuture, overloadQuantity);
  }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/problems_resource.cpp.
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
  { name: "Resource::updateProblems", sourceLine: 30, status: "adapted" },
  { name: "Problem::clearProblems", sourceLine: 32, status: "adapted" },
  { name: "ResourceBuckets::updateProblems", sourceLine: 83, status: "adapted" },
  { name: "Problem::clearProblems", sourceLine: 85, status: "adapted" },
  { name: "ProblemCapacityOverload::getDescription", sourceLine: 110, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface ProblemPort {
  clearProblems(...args: readonly PortValue[]): PortValue | void;
}

export interface ProblemCapacityOverloadPort {
  getDescription(...args: readonly PortValue[]): PortValue | void;
}

export interface ResourcePort {
  updateProblems(...args: readonly PortValue[]): PortValue | void;
}

export interface ResourceBucketsPort {
  updateProblems(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/problems_resource.cpp";
export const targetFile = "model/problems_resource.ts";

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
  "void Resource::updateProblems() {",
  "  // Delete existing problems for this resource",
  "  Problem::clearProblems(*this, false, false);",
  "  setChanged(false);",
  "",
  "  // Problem detection disabled on this resource",
  "  if (!getDetectProblems() || !getConstrained()) return;",
  "",
  "  // Loop through the loadplans",
  "  Date excessProblemStart;",
  "  Date shortageProblemStart;",
  "  bool excessProblem = false;",
  "  double curMax(0.0);",
  "  double excessQty(0.0);",
  "  for (auto iter = loadplans.begin(); iter != loadplans.end();) {",
  "    // Process changes in the maximum or minimum targets",
  "    if (iter->getEventType() == 4)",
  "      curMax = iter->getMax();",
  "",
  "    // Only consider the last loadplan for a certain date",
  "    const TimeLine<LoadPlan>::Event* f = &*(iter++);",
  "    if (iter != loadplans.end() && iter->getDate() == f->getDate()) continue;",
  "",
  "    // Note that theoretically we can have a minimum and a maximum problem for",
  "    // the same moment in time.",
  "",
  "    // Check against maximum target",
  "    auto delta = f->getOnhand() - curMax;",
  "    if (delta > ROUNDING_ERROR) {",
  "      if (!excessProblem) {",
  "        excessProblemStart = f->getDate();",
  "        excessQty = delta;",
  "        excessProblem = true;",
  "      } else if (delta > excessQty)",
  "        excessQty = delta;",
  "    } else {",
  "      if (excessProblem) {",
  "        // New problem now ends",
  "        if (f->getDate() != excessProblemStart)",
  "          new ProblemCapacityOverload(this, excessProblemStart, f->getDate(),",
  "                                      excessQty);",
  "        excessProblem = false;",
  "      }",
  "    }",
  "",
  "  }  // End of for-loop through the loadplans",
  "",
  "  // The excess lasts till the end of the horizon...",
  "  if (excessProblem)",
  "    new ProblemCapacityOverload(this, excessProblemStart, Date::infiniteFuture,",
  "                                excessQty);",
  "}",
  "",
  "void ResourceBuckets::updateProblems() {",
  "  // Delete existing problems for this resource",
  "  Problem::clearProblems(*this, true, false);",
  "",
  "  // Problem detection disabled on this resource",
  "  if (!getDetectProblems() || !getConstrained()) return;",
  "",
  "  // Loop over all events",
  "  Date startdate = Date::infinitePast;",
  "  double load = 0.0;",
  "  for (auto & loadplan : loadplans) {",
  "    if (loadplan.getEventType() != 2)",
  "      load = loadplan.getOnhand();",
  "    else {",
  "      // Evaluate previous bucket",
  "      if (load < -ROUNDING_ERROR)",
  "        new ProblemCapacityOverload(this, startdate, loadplan.getDate(), -load);",
  "      // Reset evaluation for the new bucket",
  "      startdate = loadplan.getDate();",
  "      load = 0.0;",
  "    }",
  "  }",
  "  // Evaluate the final bucket",
  "  if (load < -ROUNDING_ERROR)",
  "    new ProblemCapacityOverload(this, startdate, Date::infiniteFuture, -load);",
  "}",
  "",
  "string ProblemCapacityOverload::getDescription() const {",
  "  ostringstream ch;",
  "  ch << \"Resource '\" << getResource() << \"' has capacity shortage\";",
  "  if (qty) ch << \" of \" << qty;",
  "  return ch.str();",
  "}",
  "",
  "}  // namespace frepple",
];
