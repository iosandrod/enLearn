// <header-api-generated>
import { Date as PlanningDate, DateRange } from "../utils/date.js";
import type { HeaderModelAdapter } from "../utils/library.js";
import type { Buffer } from "./buffer.js";
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
  const value = call(event, "getDate");
  return value instanceof PlanningDate ? value : new PlanningDate(value as string | number | undefined);
}

export class ProblemMaterialShortage extends Problem {
  static override readonly cppBases = ["Problem"] as const;
  static override readonly cppQualifiedNames = ["ProblemMaterialShortage"] as const;
  private readonly dates: DateRange;
  private readonly quantity: number;
  constructor(buffer: Buffer, start: PlanningDate, end: PlanningDate, quantity: number, add = true) {
    super(buffer, false);
    this.dates = new DateRange(start, end);
    this.quantity = Number(quantity);
    if (add) this.addProblem();
  }
  getBuffer(): Buffer { return this.getOwner() as Buffer; }
  override getDates(): DateRange { return new DateRange(this.dates.getStart(), this.dates.getEnd()); }
  override getDescription(): string {
    const suffix = this.quantity ? ` of ${formatCppNumber(this.quantity)}` : "";
    return `Buffer '${this.getBuffer().getName()}' has material shortage${suffix}`;
  }
  override getEntity(): string { return "material"; }
  override getOwner(): Buffer { return super.getOwner() as Buffer; }
  override getType(): string { return "material shortage"; }
  getQuantity(): number { return this.quantity; }
  override isFeasible(): boolean { return false; }
}

export function updateBufferProblems(buffer: Buffer): void {
  clearEntityProblems(buffer, false, false);
  setEntityChanged(buffer, false);
  if (!getEntityDetectProblems(buffer)) return;

  let shortageStart: PlanningDate | null = null;
  let shortageQuantity = 0;
  let currentMinimum = 0;
  const events = buffer.getFlowPlans();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) continue;
    if (Number(call(event, "getEventType") ?? 0) === 3) currentMinimum = Number(call(event, "getMin") ?? 0);
    const date = eventDate(event);
    const next = events[index + 1];
    if (next && eventDate(next).equals(date)) continue;

    const delta = Number(call(event, "getOnhand") ?? 0) - currentMinimum;
    if (delta < -ROUNDING_ERROR) {
      if (!shortageStart) {
        shortageStart = date;
        shortageQuantity = delta;
      } else shortageQuantity = Math.min(shortageQuantity, delta);
    } else if (shortageStart) {
      if (!date.equals(shortageStart)) new ProblemMaterialShortage(buffer, shortageStart, date, -shortageQuantity);
      shortageStart = null;
    }
  }
  if (shortageStart) {
    new ProblemMaterialShortage(buffer, shortageStart, PlanningDate.infiniteFuture, -shortageQuantity);
  }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/problems_buffer.cpp.
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
  { name: "Buffer::updateProblems", sourceLine: 30, status: "adapted" },
  { name: "Problem::clearProblems", sourceLine: 32, status: "adapted" },
  { name: "ProblemMaterialShortage::getDescription", sourceLine: 84, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface BufferPort {
  updateProblems(...args: readonly PortValue[]): PortValue | void;
}

export interface ProblemPort {
  clearProblems(...args: readonly PortValue[]): PortValue | void;
}

export interface ProblemMaterialShortagePort {
  getDescription(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/problems_buffer.cpp";
export const targetFile = "model/problems_buffer.ts";

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
  "void Buffer::updateProblems() {",
  "  // Delete existing problems for this buffer",
  "  Problem::clearProblems(*this, false, false);",
  "  setChanged(false);",
  "",
  "  // Problem detection disabled on this buffer",
  "  if (!getDetectProblems()) return;",
  "",
  "  // Loop through the flowplans",
  "  Date shortageProblemStart;",
  "  bool shortageProblem = false;",
  "  // double curMax(0.0);",
  "  double shortageQty(0.0);",
  "  double curMin(0.0);",
  "  for (flowplanlist::const_iterator iter = flowplans.begin();",
  "       iter != flowplans.end();) {",
  "    // Process changes in the maximum or minimum targets",
  "    if (iter->getEventType() == 3) curMin = iter->getMin();",
  "    // else if (iter->getEventType() == 4)",
  "    //   curMax = iter->getMax();",
  "",
  "    // Only consider the last flowplan for a certain date",
  "    const TimeLine<FlowPlan>::Event* f = &*(iter++);",
  "    if (iter != flowplans.end() && iter->getDate() == f->getDate()) continue;",
  "",
  "    // Check against minimum target",
  "    double delta = f->getOnhand() - curMin;",
  "    if (delta < -ROUNDING_ERROR) {",
  "      if (!shortageProblem) {",
  "        // Start of a problem",
  "        shortageProblemStart = f->getDate();",
  "        shortageQty = delta;",
  "        shortageProblem = true;",
  "      } else if (delta < shortageQty)",
  "        // New shortage qty",
  "        shortageQty = delta;",
  "    } else {",
  "      if (shortageProblem) {",
  "        // New problem now ends",
  "        if (f->getDate() != shortageProblemStart)",
  "          new ProblemMaterialShortage(this, shortageProblemStart, f->getDate(),",
  "                                      -shortageQty);",
  "        shortageProblem = false;",
  "      }",
  "    }",
  "",
  "  }  // End of for-loop through the flowplans",
  "",
  "  // The shortage lasts till the end of the horizon...",
  "  if (shortageProblem)",
  "    new ProblemMaterialShortage(this, shortageProblemStart,",
  "                                Date::infiniteFuture, -shortageQty);",
  "}",
  "",
  "string ProblemMaterialShortage::getDescription() const {",
  "  ostringstream ch;",
  "  ch << \"Buffer '\" << getBuffer() << \"' has material shortage\";",
  "  if (qty) ch << \" of \" << qty;",
  "  return ch.str();",
  "}",
  "",
  "}  // namespace frepple",
];
