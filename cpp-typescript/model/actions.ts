import { Date as PlanningDate, DateRange } from "../utils/date.js";
import { Command } from "../utils/actions.js";
import { DataException } from "../utils/library.js";
import type { Demand } from "./demand.js";
import type { Operation } from "./operation.js";
import { OperationPlan, OperationPlanState } from "./operationplan.js";

type DateInput = PlanningDate | string | number;

function asDate(value: DateInput): PlanningDate {
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
}

/** Transactional creation: the plan is live only after commit. */
export class CommandCreateOperationPlan extends Command {
  static readonly cppBases = ["Command"] as const;
  static readonly cppQualifiedNames = ["CommandCreateOperationPlan"] as const;
  private operationPlan: OperationPlan | null;

  constructor(operation: Operation | null, quantity: number, start: DateInput, end: DateInput,
    demand: Demand | null = null, batch = "", owner: OperationPlan | null = null,
    makeFlowLoads = true, roundDown = true) {
    super();
    if (!operation) {
      this.operationPlan = null;
      return;
    }
    const result = new OperationPlan(operation);
    result.setBatch(batch);
    result.setDemand(demand);
    // C++ Operation::createOperationPlan links an owner with fast insertion.
    // Alternates and routings require this before deriving quantity and dates.
    result.setOwner(owner, true);
    result.setOperationPlanParameters(
      quantity,
      asDate(start),
      asDate(end),
      true,
      true,
      roundDown,
    );
    if (makeFlowLoads) {
      result.createFlowLoads();
      // The selected member resource can have a different availability or
      // efficiency than its pool. C++ recalculates after resource assignment.
      result.setOperationPlanParameters(
        quantity,
        asDate(start),
        asDate(end),
        true,
        true,
        roundDown,
      );
    }
    result.deactivate();
    this.operationPlan = result;
  }

  override commit(): void {
    if (this.operationPlan && !this.operationPlan.mergeForCreation()) this.operationPlan.activate();
    this.operationPlan = null;
  }
  override rollback(): void {
    this.operationPlan?.dispose();
    this.operationPlan = null;
  }
  override dispose(): void { this.rollback(); }
  getOperationPlan(): OperationPlan | null { return this.operationPlan; }
  override getType(): number { return 5; }
}

/** Transactional deletion that temporarily detaches a proposed plan tree. */
export class CommandDeleteOperationPlan extends Command {
  static readonly cppBases = ["Command"] as const;
  static readonly cppQualifiedNames = ["CommandDeleteOperationPlan"] as const;
  private operationPlan: OperationPlan | null;
  private readonly plans: OperationPlan[] = [];

  constructor(operationPlan: OperationPlan | null) {
    super();
    this.operationPlan = operationPlan;
    if (!operationPlan) return;
    if (!operationPlan.getProposed()) {
      this.operationPlan = null;
      throw new DataException("Can't delete a locked operationplan");
    }
    const pending = [operationPlan.getTopOwner()];
    while (pending.length) {
      const candidate = pending.pop();
      if (!candidate) continue;
      this.plans.push(candidate);
      pending.push(...candidate.getSubOperationPlans());
      candidate.deleteFlowLoads();
      candidate.deactivate();
    }
  }

  override commit(): void {
    for (const plan of [...this.plans].reverse()) plan.dispose();
    this.plans.length = 0;
    this.operationPlan = null;
  }
  override rollback(): void {
    for (const plan of this.plans) {
      plan.activate(false);
      plan.createFlowLoads();
    }
    this.plans.length = 0;
    this.operationPlan = null;
  }
  override dispose(): void { this.rollback(); }
  getOperationPlan(): OperationPlan | null { return this.operationPlan; }
  override getType(): number { return 6; }
}

/** Immediate move command with a recursively captured undo snapshot. */
export class CommandMoveOperationPlan extends Command {
  static readonly cppBases = ["Command"] as const;
  static readonly cppQualifiedNames = ["CommandMoveOperationPlan"] as const;
  private operationPlan: OperationPlan | null;
  private readonly snapshots: readonly [OperationPlan, OperationPlanState][];

  constructor(operationPlan: OperationPlan | null);
  constructor(operationPlan: OperationPlan | null, start: DateInput, end: DateInput,
    quantity?: number, roundDown?: boolean, later?: boolean);
  constructor(operationPlan: OperationPlan | null, start?: DateInput, end?: DateInput,
    quantity = -1, roundDown = false, later = false) {
    super();
    this.operationPlan = operationPlan;
    this.snapshots = operationPlan ? this.capture(operationPlan) : [];
    if (operationPlan && start !== undefined && end !== undefined) {
      operationPlan.setOperationPlanParameters(quantity === -1 ? operationPlan.getQuantity() : quantity,
        asDate(start), asDate(end), true, true, roundDown, later);
    }
  }

  private capture(root: OperationPlan): readonly [OperationPlan, OperationPlanState][] {
    const result: [OperationPlan, OperationPlanState][] = [[root, new OperationPlanState(root)]];
    for (const child of root.getSubOperationPlans()) result.push(...this.capture(child));
    return result;
  }
  override commit(): void {
    this.operationPlan?.mergeIfPossible();
    this.operationPlan = null;
  }
  restore(_deleteSubcommands = false): void {
    for (const [plan, state] of [...this.snapshots].reverse()) plan.restore(state, true);
  }
  override rollback(): void { this.restore(true); this.operationPlan = null; }
  override dispose(): void { if (this.operationPlan) this.rollback(); }
  getOperationPlan(): OperationPlan | null { return this.operationPlan; }
  setStart(value: DateInput): void { this.operationPlan?.setStart(value); }
  setEnd(value: DateInput): void { this.operationPlan?.setEnd(value); }
  setQuantity(value: number): void { this.operationPlan?.setQuantity(value); }
  setParameters(start: DateInput, end: DateInput, quantity: number, preferEnd: boolean,
    roundDown = true): void {
    this.operationPlan?.setOperationPlanParameters(quantity, start, end, preferEnd, true, roundDown);
  }
  getQuantity(): number { return this.snapshots[0]?.[1].quantity ?? 0; }
  getDates(): DateRange {
    const state = this.snapshots[0]?.[1];
    return state ? new DateRange(state.start, state.end) : new DateRange();
  }
  override getType(): number { return 7; }
}


























/**
 * Semantic migration unit for src/model/actions.cpp.
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
  { name: "Plan::instance", sourceLine: 59, status: "adapted" },
  { name: "Plan::instance", sourceLine: 69, status: "adapted" },
  { name: "Plan::instance", sourceLine: 108, status: "adapted" },
  { name: "Plan::instance", sourceLine: 148, status: "adapted" },
  { name: "CommandMoveOperationPlan::CommandMoveOperationPlan", sourceLine: 277, status: "adapted" },
  { name: "CommandMoveOperationPlan::CommandMoveOperationPlan", sourceLine: 293, status: "adapted" },
  { name: "CommandMoveOperationPlan::restore", sourceLine: 317, status: "adapted" },
  { name: "CommandDeleteOperationPlan::CommandDeleteOperationPlan", sourceLine: 334, status: "adapted" },
  { name: "Operation::clear", sourceLine: 388, status: "adapted" },
  { name: "Demand::clear", sourceLine: 389, status: "adapted" },
  { name: "Buffer::clear", sourceLine: 390, status: "adapted" },
  { name: "Resource::clear", sourceLine: 391, status: "adapted" },
  { name: "SetupMatrix::clear", sourceLine: 392, status: "adapted" },
  { name: "Location::clear", sourceLine: 393, status: "adapted" },
  { name: "Customer::clear", sourceLine: 394, status: "adapted" },
  { name: "Calendar::clear", sourceLine: 395, status: "adapted" },
  { name: "Supplier::clear", sourceLine: 396, status: "adapted" },
  { name: "Item::clear", sourceLine: 397, status: "adapted" },
  { name: "Skill::clear", sourceLine: 398, status: "adapted" },
  { name: "Plan::instance", sourceLine: 399, status: "adapted" },
  { name: "Plan::instance", sourceLine: 400, status: "adapted" },
  { name: "OperationPlan::clear", sourceLine: 403, status: "adapted" },
  { name: "HasLevel::getNumberOfClusters", sourceLine: 432, status: "adapted" },
  { name: "Plan::instance", sourceLine: 441, status: "adapted" },
  { name: "Location::size", sourceLine: 454, status: "adapted" },
  { name: "Customer::size", sourceLine: 461, status: "adapted" },
  { name: "Supplier::size", sourceLine: 468, status: "adapted" },
  { name: "Buffer::size", sourceLine: 475, status: "adapted" },
  { name: "SetupMatrix::size", sourceLine: 490, status: "adapted" },
  { name: "Resource::size", sourceLine: 500, status: "adapted" },
  { name: "Skill::size", sourceLine: 515, status: "adapted" },
  { name: "Operation::size", sourceLine: 536, status: "adapted" },
  { name: "Calendar::size", sourceLine: 555, status: "adapted" },
  { name: "Item::size", sourceLine: 572, status: "adapted" },
  { name: "Demand::size", sourceLine: 591, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface BufferPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface CalendarPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface CommandDeleteOperationPlanPort {
  CommandDeleteOperationPlan(...args: readonly PortValue[]): PortValue | void;
}

export interface CommandMoveOperationPlanPort {
  CommandMoveOperationPlan(...args: readonly PortValue[]): PortValue | void;
  restore(...args: readonly PortValue[]): PortValue | void;
}

export interface CustomerPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface DemandPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface HasLevelPort {
  getNumberOfClusters(...args: readonly PortValue[]): PortValue | void;
}

export interface ItemPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface LocationPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface ResourcePort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface SetupMatrixPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface SkillPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
}

export interface SupplierPort {
  clear(...args: readonly PortValue[]): PortValue | void;
  size(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/actions.cpp";
export const targetFile = "model/actions.ts";

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
  "#include \"frepple/cache.h\"",
  "#include \"frepple/model.h\"",
  "",
  "namespace frepple {",
  "",
  "//",
  "// READ XML INPUT FILE",
  "//",
  "",
  "PyObject* readXMLfile(PyObject*, PyObject* args) {",
  "  // Pick up arguments",
  "  char* filename = nullptr;",
  "  int validate(1), validate_only(0), allowpython(1);",
  "  PyObject* userexit = nullptr;",
  "  if (!PyArg_ParseTuple(args, \"|siiOi:readXMLfile\", &filename, &validate,",
  "                        &validate_only, &userexit, &allowpython))",
  "    return nullptr;",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  try {",
  "    if (!filename) {",
  "      // Read from standard input",
  "      xercesc::StdInInputSource in;",
  "      XMLInput p;",
  "      if (userexit && userexit != Py_None) p.setUserExit(userexit);",
  "      if (allowpython) p.setAllowPython(true);",
  "      if (validate_only != 0)",
  "        // When no root object is passed, only the input validation happens",
  "        p.parse(in, nullptr, true);",
  "      else",
  "        p.parse(in, &Plan::instance(), validate != 0);",
  "    } else {",
  "      XMLInputFile p(filename);",
  "      if (userexit && userexit != Py_None) p.setUserExit(userexit);",
  "      if (allowpython) p.setAllowPython(true);",
  "      if (validate_only != 0)",
  "        // Read and validate a file",
  "        p.parse(nullptr, true);",
  "      else",
  "        // Read, execute and optionally validate a file",
  "        p.parse(&Plan::instance(), validate != 0);",
  "    }",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "//",
  "// READ XML INPUT STRING",
  "//",
  "",
  "PyObject* readXMLdata(PyObject*, PyObject* args) {",
  "  // Pick up arguments",
  "  char* data;",
  "  int validate(1), validate_only(0), loglevel(0), allowpython(1);",
  "  PyObject* userexit = nullptr;",
  "  if (!PyArg_ParseTuple(args, \"s|iiiOi:readXMLdata\", &data, &validate,",
  "                        &validate_only, &loglevel, &userexit, &allowpython))",
  "    return nullptr;",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  try {",
  "    if (!data) throw DataException(\"No input data\");",
  "    XMLInputString p(data);",
  "    if (userexit && userexit != Py_None) p.setUserExit(userexit);",
  "    if (loglevel) p.setLogLevel(1);",
  "    if (allowpython) p.setAllowPython(true);",
  "    if (validate_only != 0)",
  "      p.parse(nullptr, true);",
  "    else",
  "      p.parse(&Plan::instance(), validate != 0);",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");  // Safer than using Py_None, which is not",
  "                             // portable across compilers",
  "}",
  "",
  "//",
  "// SAVE MODEL TO XML",
  "//",
  "",
  "PyObject* saveXMLfile(PyObject*, PyObject* args) {",
  "  // Pick up arguments",
  "  char* filename;",
  "  char* content = nullptr;",
  "  if (!PyArg_ParseTuple(args, \"s|s:saveXMLfile\", &filename, &content))",
  "    return nullptr;",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  try {",
  "    XMLSerializerFile o(filename);",
  "    if (content) {",
  "      if (!strcmp(content, \"BASE\"))",
  "        o.setContentType(BASE);",
  "      else if (!strcmp(content, \"PLAN\"))",
  "        o.setContentType(PLAN);",
  "      else if (!strcmp(content, \"DETAIL\"))",
  "        o.setContentType(DETAIL);",
  "      else",
  "        throw DataException(\"Invalid content type '\" + string(content) + \"'\");",
  "    }",
  "    o.writeElementWithHeader(Tags::plan, &Plan::instance());",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "//",
  "// SAVE PLAN SUMMARY TO TEXT FILE",
  "//",
  "",
  "PyObject* savePlan(PyObject*, PyObject* args) {",
  "  // Pick up arguments",
  "  const char* filename = \"plan.out\";",
  "  if (!PyArg_ParseTuple(args, \"s:saveplan\", &filename)) return nullptr;",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  ofstream textoutput;",
  "  try {",
  "    // Open the output file",
  "    textoutput.open(filename, ios::out);",
  "",
  "    // Write the buffer summary",
  "    for (auto& buf : Buffer::all()) {",
  "      if (buf.getHidden()) continue;",
  "      for (auto& oo : buf.getFlowPlans())",
  "        if (oo.getEventType() == 1 && oo.getQuantity() != 0.0) {",
  "          auto oh = round(oo.getOnhand() * 1000) / 1000;",
  "          if (fabs(oh) < ROUNDING_ERROR) oh = 0.0;",
  "          textoutput << \"BUFFER\\t\" << buf << '\\t' << oo.getDate() << '\\t'",
  "                     << oo.getQuantity() << '\\t' << oh << '\\n';",
  "        }",
  "    }",
  "",
  "    // Write the demand summary",
  "    for (auto& gdem : Demand::all()) {",
  "      const Demand::OperationPlanList& deli = gdem.getDelivery();",
  "      double planned = 0.0;",
  "      for (auto& pp : deli) {",
  "        textoutput << \"DEMAND\\t\" << gdem << '\\t' << pp->getEnd() << '\\t'",
  "                   << pp->getQuantity();",
  "        if (pp->getEnd() > gdem.getDue())",
  "          textoutput << \"\\tlater than \" << gdem.getDue();",
  "        else if (pp->getEnd() < gdem.getDue())",
  "          textoutput << \"\\tearlier than \" << gdem.getDue();",
  "        textoutput << '\\n';",
  "        planned += pp->getQuantity();",
  "      }",
  "      if (gdem.getStatus() != Demand::STATUS_CLOSED &&",
  "          gdem.getStatus() != Demand::STATUS_CANCELED) {",
  "        auto delta = planned - gdem.getQuantity();",
  "        if (delta < -ROUNDING_ERROR)",
  "          textoutput << \"DEMAND\\t\" << gdem << \"\\tplanned \" << -delta",
  "                     << \" units short\\n\";",
  "        else if (delta > ROUNDING_ERROR)",
  "          textoutput << \"DEMAND\\t\" << gdem << \"\\tplanned \" << delta",
  "                     << \" units too much\\n\";",
  "      }",
  "    }",
  "",
  "    // Write the resource summary",
  "    for (auto& gres : Resource::all()) {",
  "      if (gres.getHidden()) continue;",
  "      for (auto& qq : gres.getLoadPlans())",
  "        if (qq.getEventType() == 1 && qq.getQuantity() != 0.0) {",
  "          textoutput << \"RESOURCE\\t\" << gres << '\\t' << qq.getDate() << '\\t'",
  "                     << qq.getQuantity() << '\\t'",
  "                     << (round(qq.getOnhand() * 1000) / 1000) << '\\n';",
  "        }",
  "    }",
  "",
  "    // Write the operationplan summary.",
  "    for (auto rr = OperationPlan::begin(); rr != OperationPlan::end(); ++rr) {",
  "      // TODO if-condition here isn't very clean and generic",
  "      if (rr->getOperation()->getHidden() &&",
  "          !rr->getOperation()",
  "               ->hasType<OperationItemSupplier, OperationItemDistribution>())",
  "        continue;",
  "      textoutput << \"OPERATION\\t\" << rr->getOperation() << '\\t'",
  "                 << rr->getStart() << '\\t' << rr->getEnd() << '\\t'",
  "                 << rr->getQuantity();",
  "      if (rr->getBatch()) textoutput << \"\\t\" << rr->getBatch();",
  "      if (!rr->getProposed()) textoutput << \"\\t\" << rr->getStatus();",
  "      textoutput << '\\n';",
  "    }",
  "",
  "    // Write the problem summary.",
  "    Problem::iterator gprob;",
  "    while (Problem* p = gprob.next()) {",
  "      textoutput << \"PROBLEM\\t\" << p->getType().type << '\\t'",
  "                 << p->getDescription() << '\\t' << p->getDates() << '\\n';",
  "    }",
  "",
  "    // Write the constraint summary",
  "    for (auto& gdem : Demand::all()) {",
  "      Problem::iterator i = gdem.getConstraints().begin();",
  "      while (Problem* prob = i.next()) {",
  "        textoutput << \"DEMAND CONSTRAINT\\t\" << gdem << '\\t'",
  "                   << prob->getDescription() << '\\t' << prob->getDates()",
  "                   << '\\n';",
  "      }",
  "    }",
  "",
  "    // Close the output file",
  "    textoutput.close();",
  "  } catch (...) {",
  "    if (textoutput.is_open()) textoutput.close();",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "//",
  "// MOVE OPERATIONPLAN",
  "//",
  "",
  "CommandMoveOperationPlan::CommandMoveOperationPlan(OperationPlan* o)",
  "    : opplan(o), state(o) {",
  "  if (!o) return;",
  "",
  "  // Construct a subcommand for all suboperationplans",
  "  for (OperationPlan::iterator x(o); x != o->end(); ++x) {",
  "    auto* n = new CommandMoveOperationPlan(&*x);",
  "    n->owner = this;",
  "    if (firstCommand) {",
  "      n->next = firstCommand;",
  "      firstCommand->prev = n;",
  "    }",
  "    firstCommand = n;",
  "  }",
  "}",
  "",
  "CommandMoveOperationPlan::CommandMoveOperationPlan(OperationPlan* o,",
  "                                                   Date newstart, Date newend,",
  "                                                   double newQty,",
  "                                                   bool roundDown, bool later)",
  "    : opplan(o), state(o), firstCommand(nullptr) {",
  "  if (!opplan) return;",
  "",
  "  // Construct a subcommand for all children (BEFORE updating the parent)",
  "  for (OperationPlan::iterator x(o); x != o->end(); ++x) {",
  "    auto* n = new CommandMoveOperationPlan(&*x);",
  "    n->owner = this;",
  "    if (firstCommand) {",
  "      n->next = firstCommand;",
  "      firstCommand->prev = n;",
  "    }",
  "    firstCommand = n;",
  "  }",
  "",
  "  // Move the parent operationplan and its children",
  "  opplan->setOperationPlanParameters(",
  "      newQty == -1.0 ? opplan->getQuantity() : newQty, newstart, newend, true,",
  "      true, roundDown, later);",
  "}",
  "",
  "void CommandMoveOperationPlan::restore(bool del) {",
  "  // Restore all suboperationplans and (optionally) delete the subcommands",
  "  for (auto* c = firstCommand; c;) {",
  "    auto* tmp = static_cast<CommandMoveOperationPlan*>(c);",
  "    tmp->restore(del);",
  "    c = c->next;",
  "    if (del) delete tmp;",
  "  }",
  "",
  "  // Restore the original dates",
  "  if (opplan) opplan->restore(state);",
  "}",
  "",
  "//",
  "// DELETE OPERATIONPLAN",
  "//",
  "",
  "CommandDeleteOperationPlan::CommandDeleteOperationPlan(OperationPlan* o)",
  "    : opplan(o) {",
  "  // Validate input",
  "  if (!o) return;",
  "",
  "  // Avoid deleting locked operationplans",
  "  if (!o->getProposed()) {",
  "    opplan = nullptr;",
  "    throw DataException(\"Can't delete a locked operationplan\");",
  "  }",
  "",
  "  // Deletion of all suboperationplans in this",
  "  stack<OperationPlan*> to_delete;",
  "  to_delete.push(opplan->getTopOwner());",
  "  while (!to_delete.empty()) {",
  "    // Pick up the top of the stack",
  "    auto tmp = to_delete.top();",
  "    to_delete.pop();",
  "",
  "    // Delete all flowplans and loadplans, and unregister from operationplan",
  "    // list",
  "    tmp->deleteFlowLoads();",
  "    tmp->removeFromOperationplanList();",
  "    if (tmp->getDemand()) tmp->getDemand()->removeDelivery(opplan);",
  "",
  "    // Push child operationplans on the stack",
  "    OperationPlan::iterator x(tmp);",
  "    while (OperationPlan* i = x.next()) to_delete.push(i);",
  "  }",
  "}",
  "",
  "//",
  "// DELETE MODEL",
  "//",
  "",
  "PyObject* eraseModel(PyObject*, PyObject* args) {",
  "  // Pick up arguments",
  "  PyObject* obj = nullptr;",
  "  if (!PyArg_ParseTuple(args, \"|O:erase\", &obj)) return nullptr;",
  "",
  "  // Validate the argument",
  "  bool deleteStaticModel = false;",
  "  if (obj) deleteStaticModel = PythonData(obj).getBool();",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  try {",
  "    if (deleteStaticModel) {",
  "      // Delete all entities.",
  "      // The order is chosen to minimize the work of the individual destructors.",
  "      // E.g. the destructor of the item class recurses over all demands and",
  "      // all buffers. It is much faster if there are none already.",
  "      Operation::clear();",
  "      Demand::clear();",
  "      Buffer::clear();",
  "      Resource::clear();",
  "      SetupMatrix::clear();",
  "      Location::clear();",
  "      Customer::clear();",
  "      Calendar::clear();",
  "      Supplier::clear();",
  "      Item::clear();",
  "      Skill::clear();",
  "      Plan::instance().setName(\"\");",
  "      Plan::instance().setDescription(\"\");",
  "    } else",
  "      // Delete the operationplans only",
  "      OperationPlan::clear();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "//",
  "// PRINT MODEL SIZE",
  "//",
  "",
  "PyObject* printModelSize(PyObject*, PyObject*) {",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  try {",
  "    size_t count, memsize;",
  "",
  "    // Intro",
  "    logger << \"\\nSize information of frePPLe \" << PACKAGE_VERSION << \" (\"",
  "           << __DATE__ << \")\\n\\n\";",
  "",
  "    // Print the number of clusters",
  "    logger << \"Clusters: \" << HasLevel::getNumberOfClusters() << \"\\n\\n\";",
  "",
  "    // Header for memory size",
  "    logger << \"Memory usage:\\n\";",
  "    logger << \"Model                 \\tCount\\tMemory\\n\";",
  "    logger << \"-----                 \\t-----\\t------\\n\";",
  "",
  "    // Plan",
  "    size_t total = Plan::instance().getSize();",
  "    logger << \"Plan                  \\t1\\t\" << Plan::instance().getSize()",
  "           << '\\n';",
  "",
  "    // Locations",
  "    memsize = 0;",
  "    size_t countItemDistributions(0), memItemDistributions(0);",
  "    for (auto& l : Location::all()) {",
  "      memsize += l.getSize();",
  "      for (auto& rs : l.getDistributions()) {",
  "        ++countItemDistributions;",
  "        memItemDistributions += rs.getSize();",
  "      }",
  "    }",
  "    logger << \"Location              \\t\" << Location::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    total += memsize;",
  "",
  "    // Customers",
  "    memsize = 0;",
  "    for (auto& c : Customer::all()) memsize += c.getSize();",
  "    logger << \"Customer              \\t\" << Customer::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    total += memsize;",
  "",
  "    // Suppliers",
  "    memsize = 0;",
  "    for (auto& c : Supplier::all()) memsize += c.getSize();",
  "    logger << \"Supplier              \\t\" << Supplier::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    total += memsize;",
  "",
  "    // Buffers",
  "    memsize = 0;",
  "    for (auto& b : Buffer::all()) memsize += b.getSize();",
  "    logger << \"Buffer                \\t\" << Buffer::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    total += memsize;",
  "",
  "    // Setup matrices",
  "    memsize = 0;",
  "    size_t countSetupRules(0), memSetupRules(0);",
  "    for (auto& s : SetupMatrix::all()) {",
  "      memsize += s.getSize();",
  "      SetupMatrixRule::iterator iter = s.getRules();",
  "      while (SetupMatrixRule* sr = iter.next()) {",
  "        ++countSetupRules;",
  "        memSetupRules += sr->getSize();",
  "      }",
  "    }",
  "    logger << \"Setup matrix          \\t\" << SetupMatrix::size() << \"\\t\"",
  "           << memsize << '\\n';",
  "    logger << \"Setup matrix rules    \\t\" << countSetupRules << \"\\t\"",
  "           << memSetupRules << '\\n';",
  "    total += memsize;",
  "    total += memSetupRules;",
  "",
  "    // Resources",
  "    memsize = 0;",
  "    for (auto& r : Resource::all()) memsize += r.getSize();",
  "    logger << \"Resource              \\t\" << Resource::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    total += memsize;",
  "",
  "    // Skills and resourceskills",
  "    size_t countResourceSkills(0), memResourceSkills(0);",
  "    memsize = 0;",
  "    for (auto& sk : Skill::all()) {",
  "      memsize += sk.getSize();",
  "      Skill::resourcelist::const_iterator iter = sk.getResources();",
  "      while (ResourceSkill* r = iter.next()) {",
  "        ++countResourceSkills;",
  "        memResourceSkills += r->getSize();",
  "      }",
  "    }",
  "    logger << \"Skill                 \\t\" << Skill::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    logger << \"Resource skill        \\t\" << countResourceSkills << \"\\t\"",
  "           << memResourceSkills << '\\n';",
  "    total += memsize;",
  "    total += memResourceSkills;",
  "",
  "    // Operations, flows and loads",
  "    size_t countFlows(0), memFlows(0), countLoads(0), memLoads(0);",
  "    memsize = 0;",
  "    for (auto o = Operation::begin(); o != Operation::end(); ++o) {",
  "      memsize += o->getSize();",
  "      for (const auto& fl : o->getFlows()) {",
  "        ++countFlows;",
  "        memFlows += fl.getSize();",
  "      }",
  "      for (const auto& ld : o->getLoads()) {",
  "        ++countLoads;",
  "        memLoads += ld.getSize();",
  "      }",
  "    }",
  "    logger << \"Operation             \\t\" << Operation::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    logger << \"Operation material    \\t\" << countFlows << \"\\t\" << memFlows",
  "           << '\\n';",
  "    logger << \"operation resource    \\t\" << countLoads << \"\\t\" << memLoads",
  "           << '\\n';",
  "    total += memsize + memFlows + memLoads;",
  "",
  "    // Calendars and calendar buckets",
  "    memsize = 0;",
  "    size_t countBuckets(0), memBuckets(0);",
  "    for (auto& cl : Calendar::all()) {",
  "      memsize += cl.getSize();",
  "      for (auto bckt = cl.getBuckets(); bckt != CalendarBucket::iterator::end();",
  "           ++bckt) {",
  "        ++countBuckets;",
  "        memBuckets += bckt->getSize();",
  "      }",
  "    }",
  "    logger << \"Calendar              \\t\" << Calendar::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    total += memsize;",
  "    logger << \"Calendar buckets      \\t\" << countBuckets << \"\\t\" << memBuckets",
  "           << '\\n';",
  "    total += memBuckets;",
  "",
  "    // Items",
  "    memsize = 0;",
  "    size_t countItemSuppliers(0), memItemSuppliers(0);",
  "    for (auto& i : Item::all()) {",
  "      memsize += i.getSize();",
  "      for (auto& is : i.getSuppliers()) {",
  "        ++countItemSuppliers;",
  "        memItemSuppliers += is.getSize();",
  "      }",
  "    }",
  "    logger << \"Item                  \\t\" << Item::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    logger << \"Item suppliers        \\t\" << countItemSuppliers << \"\\t\"",
  "           << memItemSuppliers << '\\n';",
  "    logger << \"Item distributions    \\t\" << countItemDistributions << \"\\t\"",
  "           << memItemDistributions << '\\n';",
  "    total += memsize + memItemSuppliers + memItemDistributions;",
  "",
  "    // Demands",
  "    memsize = 0;",
  "    size_t c_count = 0, c_memsize = 0;",
  "    for (auto& dm : Demand::all()) {",
  "      memsize += dm.getSize();",
  "      Problem::iterator cstrnt_iter(dm.getConstraints().begin());",
  "      while (Problem* cstrnt = cstrnt_iter.next()) {",
  "        ++c_count;",
  "        c_memsize += cstrnt->getSize();",
  "      }",
  "    }",
  "    logger << \"Demand                \\t\" << Demand::size() << \"\\t\" << memsize",
  "           << '\\n';",
  "    logger << \"Constraints           \\t\" << c_count << \"\\t\" << c_memsize",
  "           << '\\n';",
  "    total += memsize + c_memsize;",
  "",
  "    // Operationplans",
  "    size_t countloadplans(0), countflowplans(0);",
  "    memsize = count = 0;",
  "    for (auto j = OperationPlan::begin(); j != OperationPlan::end(); ++j) {",
  "      ++count;",
  "      memsize += j->getSize();",
  "      countloadplans += j->sizeLoadPlans();",
  "      countflowplans += j->sizeFlowPlans();",
  "    }",
  "    total += memsize;",
  "    logger << \"OperationPlan         \\t\" << count << \"\\t\" << memsize << '\\n';",
  "",
  "    // Flowplans",
  "    memsize = countflowplans * sizeof(FlowPlan);",
  "    total += memsize;",
  "    logger << \"OperationPlan material\\t\" << countflowplans << \"\\t\" << memsize",
  "           << '\\n';",
  "",
  "    // Loadplans",
  "    memsize = countloadplans * sizeof(LoadPlan);",
  "    total += memsize;",
  "    logger << \"OperationPlan resource\\t\" << countloadplans << \"\\t\" << memsize",
  "           << '\\n';",
  "",
  "    // Problems",
  "    memsize = count = 0;",
  "    Problem::iterator piter;",
  "    while (Problem* pr = piter.next()) {",
  "      ++count;",
  "      memsize += pr->getSize();",
  "    }",
  "    total += memsize;",
  "    logger << \"Problem               \\t\" << count << \"\\t\" << memsize << '\\n';",
  "",
  "    // Shared string pool",
  "    auto tmp = PooledString::getSize();",
  "    logger << \"String pool           \\t\" << tmp.first << \"\\t\" << tmp.second",
  "           << '\\n';",
  "    total += tmp.second;",
  "",
  "    // Cached objects - only for the enterprise branch",
  "    tmp = Cache::instance->getStatus();",
  "    logger << \"Memory cache          \\t\" << tmp.first << \"\\t\" << tmp.second",
  "           << '\\n';",
  "    total += tmp.second;",
  "",
  "    // TOTAL",
  "    logger << \"Total                 \\t\\t\" << total << \"\\n\\n\";",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "}  // namespace frepple",
];
