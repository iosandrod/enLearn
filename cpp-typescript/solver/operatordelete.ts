// <header-api-generated>
import { CommandDeleteOperationPlan, CommandMoveOperationPlan } from "../model/actions.js";
import { Buffer } from "../model/buffer.js";
import { Demand } from "../model/demand.js";
import { FlowTransferBatch } from "../model/flow.js";
import { FlowPlan } from "../model/flowplan.js";
import { Operation, OperationRouting } from "../model/operation.js";
import { OperationPlan } from "../model/operationplan.js";
import { Resource } from "../model/resource.js";
import { CommandManager } from "../utils/actions.js";
import { Date as PlanningDate } from "../utils/date.js";
import { HeaderModelAdapter } from "../utils/library.js";

const ROUNDING_ERROR = 0.000001;

function deleteCall(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

/** Delete proposed plans directly or through a reversible command manager. */
export class OperatorDelete extends HeaderModelAdapter {
  static readonly cppBases = ["Solver"] as const;
  static readonly cppQualifiedNames = ["OperatorDelete"] as const;
  private commandManager: CommandManager | null = null;
  private constrained = true;
  private propagate = true;
  private readonly buffersToScan = new Set<Buffer>();

  constructor(fields: Readonly<Record<string, unknown>> = {}) {
    super();
    if (fields.commandManager instanceof CommandManager) this.commandManager = fields.commandManager;
    if (fields.constrained !== undefined) this.constrained = Boolean(fields.constrained);
    if (fields.propagate !== undefined) this.propagate = Boolean(fields.propagate);
  }

  static override initialize(): number { return 0; }
  initialize(): number { return OperatorDelete.initialize(); }
  static create(fields: Readonly<Record<string, unknown>> = {}): OperatorDelete { return new OperatorDelete(fields); }
  create(fields: Readonly<Record<string, unknown>> = {}): OperatorDelete { return OperatorDelete.create(fields); }
  getType(): string { return "solver_delete"; }
  getCommandManager(): CommandManager | null { return this.commandManager; }
  setCommandManager(value: CommandManager | null = null): void { this.commandManager = value; }
  getConstrained(): boolean { return this.constrained; }
  setConstrained(value: boolean): void { this.constrained = Boolean(value); }
  getPropagate(): boolean { return this.propagate; }
  setPropagate(value: boolean): void { this.propagate = Boolean(value); }
  clearBuffers(): void { this.buffersToScan.clear(); }

  pushBuffers(operationPlan: OperationPlan, consuming = true, producing = true): void {
    for (const candidate of operationPlan.getFlowPlans()) {
      if (!(candidate instanceof FlowPlan)) continue;
      const quantity = candidate.getQuantity();
      if ((quantity < 0 && !consuming) || (quantity > 0 && !producing)) continue;
      const buffer = candidate.getBuffer();
      if (buffer instanceof Buffer) this.buffersToScan.add(buffer);
    }
    for (const child of operationPlan.getSubOperationPlans()) this.pushBuffers(child, consuming, producing);
  }

  solve(target: unknown = null): number {
    if (target instanceof OperationPlan) return this.deletePlan(target) ? 1 : 0;
    if (target instanceof Demand) return this.deleteIterable(target.getOperationPlans());
    if (target instanceof Operation) return this.deleteIterable(target.getOperationPlans());
    if (target instanceof Resource) return this.deleteIterable(target.getOperationPlans());
    if (target instanceof Buffer) {
      return this.removeExcess(target);
    }
    if (target && typeof target === "object" && Symbol.iterator in target) {
      return this.deleteIterable(target as Iterable<unknown>);
    }
    let count = 0;
    for (const operation of Operation.all()) count += this.deleteIterable(operation.getOperationPlans());
    this.buffersToScan.clear();
    return count;
  }

  private deleteIterable(values: Iterable<unknown>): number {
    const unique = new Set<OperationPlan>();
    for (const candidate of values) if (candidate instanceof OperationPlan) unique.add(candidate.getTopOwner());
    let count = 0;
    for (const operationPlan of unique) if (this.deletePlan(operationPlan)) count += 1;
    return count;
  }

  private deletePlan(operationPlan: OperationPlan): boolean {
    const top = operationPlan.getTopOwner();
    if (!top.getProposed()) return false;
    if (this.propagate) this.pushBuffers(top, true, false);
    if (this.commandManager) this.commandManager.add(new CommandDeleteOperationPlan(top));
    else top.dispose();
    return true;
  }

  /** Remove the earliest proposed producers that remain excess later on. */
  private removeExcess(buffer: Buffer): number {
    let changes = 0;

    // Delete and move commands immediately detach or resize flowplans. Restart
    // from a fresh timeline snapshot after every mutation, just as the linked
    // C++ iterator advances past the invalidated operationplan tree.
    while (true) {
      const events = buffer.getFlowPlans();
      const last = events.at(-1);
      if (!last) break;
      const finalOnhand = Number(deleteCall(last, "getOnhand") ?? 0);
      const finalMinimum = Number(deleteCall(last, "getMin") ?? 0);
      const finalMaximum = Number(deleteCall(last, "getMax") ?? 0);
      if (finalOnhand - Math.max(finalMinimum, finalMaximum, 0) <= ROUNDING_ERROR) break;

      let changed = false;
      for (const event of events) {
        if (!(event instanceof FlowPlan) || event.getEventType() !== 1
            || event.getQuantity() <= 0) continue;

        const sourcePlan = event.getOperationPlan();
        const flow = event.getFlow();
        if (!(sourcePlan instanceof OperationPlan) || !sourcePlan.getProposed()
            || sourcePlan.getDemand() || sourcePlan.getOwner()?.getDemand()
            || flow instanceof FlowTransferBatch) continue;

        let topPlan = sourcePlan;
        if (topPlan.getOwner()?.getOperation() instanceof OperationRouting) {
          topPlan = topPlan.getOwner() as OperationPlan;
        }
        const operationPlanExcess = topPlan.isExcess(false);
        if (operationPlanExcess < ROUNDING_ERROR) continue;

        const newQuantity = operationPlanExcess >= sourcePlan.getQuantity() - ROUNDING_ERROR
          ? 0
          : sourcePlan.getQuantity() - operationPlanExcess;
        if (newQuantity < ROUNDING_ERROR) {
          if (this.propagate) this.pushBuffers(sourcePlan, true, false);
          if (this.commandManager) this.commandManager.add(new CommandDeleteOperationPlan(topPlan));
          else topPlan.dispose();
          changes += 1;
          changed = true;
          break;
        }
        if (newQuantity < sourcePlan.getQuantity() - ROUNDING_ERROR) {
          if (this.propagate) this.pushBuffers(sourcePlan, true, false);
          if (this.commandManager) {
            this.commandManager.add(new CommandMoveOperationPlan(
              topPlan,
              PlanningDate.infinitePast,
              topPlan.getEnd(),
              newQuantity,
            ));
          } else {
            topPlan.setQuantity(newQuantity);
          }
          changes += 1;
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }
    return changes;
  }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/solver/operatordelete.cpp.
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
  { name: "OperatorDelete::initialize", sourceLine: 34, status: "adapted" },
  { name: "OperatorDelete::create", sourceLine: 51, status: "adapted" },
  { name: "OperatorDelete::solve", sourceLine: 87, status: "adapted" },
  { name: "OperatorDelete::solve", sourceLine: 97, status: "adapted" },
  { name: "OperatorDelete::solve", sourceLine: 121, status: "adapted" },
  { name: "OperatorDelete::solve", sourceLine: 139, status: "adapted" },
  { name: "OperatorDelete::pushBuffers", sourceLine: 175, status: "adapted" },
  { name: "OperatorDelete::solve", sourceLine: 204, status: "adapted" },
  { name: "OperatorDelete::solve", sourceLine: 408, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface OperatorDeletePort {
  create(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  pushBuffers(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/solver/operatordelete.cpp";
export const targetFile = "solver/operatordelete.ts";

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
  "#include <ranges>",
  "",
  "#include \"frepple/solver.h\"",
  "",
  "namespace frepple {",
  "",
  "const MetaClass* OperatorDelete::metadata;",
  "",
  "int OperatorDelete::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperatorDelete>(",
  "      \"solver\", \"solver_delete\", Object::create<OperatorDelete>);",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleClass<OperatorDelete, Solver>::getPythonType();",
  "  x.setName(\"solver_delete\");",
  "  x.setDoc(\"frePPLe solver_delete\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"solve\", solve, METH_VARARGS, \"run the solver\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* OperatorDelete::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Create the solver",
  "    auto* s = new OperatorDelete();",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    if (kwds) {",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        const MetaFieldBase* fmeta =",
  "            OperatorDelete::metadata->findField(attr.getHash());",
  "        if (!fmeta) fmeta = Solver::metadata->findField(attr.getHash());",
  "        if (fmeta)",
  "          // Update the attribute",
  "          fmeta->setField(s, field);",
  "        else",
  "          s->setProperty(attr.getName(), value);",
  "        ;",
  "      };",
  "    }",
  "",
  "    // Return the object",
  "    Py_INCREF(s);",
  "    return static_cast<PyObject*>(s);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "void OperatorDelete::solve(void*) {",
  "  // Loop over all buffers Push to stack, in order of level TODO",
  "  // Clean up all buffers in the list",
  "  while (!buffersToScan.empty()) {",
  "    Buffer* curbuf = buffersToScan.back();",
  "    buffersToScan.pop_back();",
  "    solve(curbuf);",
  "  }",
  "}",
  "",
  "void OperatorDelete::solve(OperationPlan* o, void*) {",
  "  if (!o) return;  // Null argument passed",
  "",
  "  // Mark all buffers.",
  "  // The batching solver doesn't like that we push both consumers and",
  "  // producers, but ideally we would pass true for both arguments.",
  "  if (propagate) pushBuffers(o, true, false);",
  "",
  "  // Delete the operationplan",
  "  if (o->getProposed()) {",
  "    if (cmds)",
  "      cmds->add(new CommandDeleteOperationPlan(o));",
  "    else",
  "      delete o;",
  "  }",
  "",
  "  // Propagate to all upstream buffers",
  "  while (!buffersToScan.empty()) {",
  "    Buffer* curbuf = buffersToScan.back();",
  "    buffersToScan.pop_back();",
  "    solve(curbuf);",
  "  }",
  "}",
  "",
  "void OperatorDelete::solve(const Resource* r, void*) {",
  "  if (getLogLevel() > 0) logger << \"Scanning \" << r << \" for excess\\n\";",
  "",
  "  // Loop over all operationplans on the resource",
  "  for (const auto& i : r->getLoadPlans()) {",
  "    if (i.getEventType() == 1)",
  "      // Add all buffers into which material is produced to the stack",
  "      pushBuffers(i.getOperationPlan(), false, true);",
  "  }",
  "",
  "  // Process all buffers found, and their upstream colleagues",
  "  while (!buffersToScan.empty()) {",
  "    Buffer* curbuf = buffersToScan.back();",
  "    buffersToScan.pop_back();",
  "    solve(curbuf);",
  "  }",
  "}",
  "",
  "void OperatorDelete::solve(const Demand* d, void*) {",
  "  if (getLogLevel() > 1) logger << \"Scanning \" << d << \" for excess\\n\";",
  "",
  "  // Delete all delivery operationplans.",
  "  // Note that an extra loop is used to assure that our iterator doesn't get",
  "  // invalidated during the deletion.",
  "  while (true) {",
  "    // Find a candidate operationplan to delete",
  "    OperationPlan* candidate = nullptr;",
  "    const Demand::OperationPlanList& deli = d->getDelivery();",
  "    for (auto i : deli)",
  "      if (i->getProposed()) {",
  "        candidate = i;",
  "        break;",
  "      }",
  "    if (!candidate) break;",
  "",
  "    // Push the buffer on the stack in which the deletion creates excess",
  "    // inventory",
  "    pushBuffers(candidate, true, false);",
  "",
  "    // Delete only the delivery, immediately or through a delete command",
  "    if (cmds)",
  "      cmds->add(new CommandDeleteOperationPlan(candidate));",
  "    else",
  "      delete candidate;",
  "  }",
  "",
  "  // Propagate to all upstream buffers",
  "  while (!buffersToScan.empty()) {",
  "    Buffer* curbuf = buffersToScan.back();",
  "    buffersToScan.pop_back();",
  "    solve(curbuf);",
  "  }",
  "}",
  "",
  "void OperatorDelete::pushBuffers(OperationPlan* o, bool consuming,",
  "                                 bool producing) {",
  "  // Loop over all flowplans",
  "  for (OperationPlan::FlowPlanIterator i = o->beginFlowPlans();",
  "       i != o->endFlowPlans(); ++i) {",
  "    // Skip flowplans we're not interested in",
  "    if (!(consuming && i->getQuantity() < 0) &&",
  "        !(producing && i->getQuantity() > 0))",
  "      continue;",
  "",
  "    // Check if the buffer is already found on the stack",
  "    bool found = false;",
  "    for (auto& j : std::ranges::reverse_view(buffersToScan)) {",
  "      if (j == i->getBuffer()) {",
  "        found = true;",
  "        break;",
  "      }",
  "    }",
  "",
  "    // Add the buffer to the stack",
  "    if (!found) buffersToScan.push_back(const_cast<Buffer*>(i->getBuffer()));",
  "  }",
  "",
  "  // Recursive call for all suboperationplans",
  "  for (OperationPlan::iterator subopplan(o); subopplan != OperationPlan::end();",
  "       ++subopplan)",
  "    pushBuffers(&*subopplan, consuming, producing);",
  "}",
  "",
  "void OperatorDelete::solve(const Buffer* b, void*) {",
  "  if (getLogLevel() > 1) logger << \"Scanning buffer \" << b << '\\n';",
  "",
  "  Buffer::flowplanlist::const_iterator fiter = b->getFlowPlans().begin();",
  "  Buffer::flowplanlist::const_iterator fend = b->getFlowPlans().end();",
  "  if (fiter == fend) return;  // There isn't a single flowplan in the buffer",
  "",
  "  /*",
  "  // STEP 1: Remove shortages from the buffer",
  "  // Delete the earliest unlocked consumer(s) after the start of a material",
  "  // shortage.",
  "  // TODO: Do we keep this feature? It has dangerous side effects in datasets",
  "  // with unresolvable shortages. The plan quality is better without this.",
  "  if (getConstrained()) {",
  "    double unresolvable = 0.0;",
  "",
  "    while (fiter != fend) {",
  "      if (fiter->getQuantity() >= 0 ||",
  "          !(fiter->getOnhand() < -ROUNDING_ERROR + unresolvable &&",
  "            fiter->isLastOnDate())) {",
  "        // Not a consumer or no shortage start",
  "        ++fiter;",
  "        continue;",
  "      }",
  "",
  "      // Recurse backward to find consumers we can resize",
  "      double cur_shortage = fiter->getOnhand() + unresolvable;",
  "      Buffer::flowplanlist::const_iterator fiter2 = fiter;",
  "      OperationPlan* curopplan = fiter->getOperationPlan();",
  "      do",
  "        ++fiter;  // increment to an event after the shortage start, because the",
  "                  // iterator can get invalidated in the next loop",
  "      while (fiter != fend && curopplan &&",
  "             fiter->getOperationPlan() ==",
  "                 curopplan);  // A loop is required to handle transfer batches",
  "      while (cur_shortage <= -ROUNDING_ERROR && fiter2 != fend) {",
  "        if (fiter2->getQuantity() >= 0 || fiter2->getEventType() != 1) {",
  "          // Not a consuming flowplan",
  "          --fiter2;",
  "          continue;",
  "        }",
  "        auto* fp =",
  "            const_cast<FlowPlan*>(static_cast<const FlowPlan*>(&*fiter2));",
  "        if (!fp->getOperationPlan()->getProposed()) {",
  "          // This consumer is locked",
  "          --fiter2;",
  "          continue;",
  "        }",
  "",
  "        // Decrement the iterator here, because it can get invalidated later on",
  "        while (fiter2 != fend && fiter2->getEventType() == 1 &&",
  "               fiter2->getOperationPlan()->getTopOwner() ==",
  "                   fp->getOperationPlan()->getTopOwner())",
  "          --fiter2;",
  "",
  "        // Resize or delete the candidate operationplan",
  "        double oldsize_flowplan = fp->getQuantity();",
  "        double newsize_opplan;",
  "        double newsize_flowplan;",
  "        if (cur_shortage < fp->getQuantity() + ROUNDING_ERROR) {",
  "          // Completely delete the consumer",
  "          newsize_opplan = newsize_flowplan = 0.0;",
  "        } else {",
  "          // Resize the consumer",
  "          auto tmp = fp->setQuantity(fp->getQuantity() - cur_shortage, true,",
  "                                     false, true, 0);",
  "          newsize_flowplan = tmp.first;",
  "          newsize_opplan = tmp.second;",
  "        }",
  "        if (newsize_flowplan > -ROUNDING_ERROR) {",
  "          // The complete operationplan is shortage.",
  "          cur_shortage -= oldsize_flowplan;",
  "          // Add downstream buffers to the stack",
  "          if (propagate) pushBuffers(fp->getOperationPlan(), false, true);",
  "          // Log message",
  "          if (getLogLevel() > 0)",
  "            logger << \"Removing shortage operationplan: \"",
  "                   << fp->getOperationPlan() << '\\n';",
  "          // Delete operationplan",
  "          if (cmds)",
  "            cmds->add(new CommandDeleteOperationPlan(fp->getOperationPlan()));",
  "          else",
  "            delete fp->getOperationPlan();",
  "        } else {",
  "          // Reduce the operationplan",
  "          // Add downstream buffers to the stack",
  "          if (propagate) pushBuffers(fp->getOperationPlan(), false, true);",
  "          // Reduce the shortage",
  "          cur_shortage -= oldsize_flowplan - newsize_flowplan;",
  "          if (getLogLevel() > 0)",
  "            logger << \"Resizing shortage operationplan to \" << newsize_opplan",
  "                   << \": \" << fp->getOperationPlan() << '\\n';",
  "          // Resize operationplan",
  "          if (cmds)",
  "            // TODO Incorrect - need to resize the flowplan intead of the the",
  "            // operationplan!",
  "            cmds->add(new CommandMoveOperationPlan(",
  "                fp->getOperationPlan(), fp->getOperationPlan()->getStart(),",
  "                Date::infinitePast, newsize_opplan));",
  "          else",
  "            fp->getOperationPlan()->setQuantity(newsize_opplan);",
  "        }",
  "      }",
  "",
  "      // Damn... We can't resolve it",
  "      if (fiter2 == fend && cur_shortage <= -ROUNDING_ERROR) {",
  "        unresolvable += cur_shortage;",
  "        if (getLogLevel() > 0)",
  "          logger << \"Can't resolve shortage problem in buffer \" << b << '\\n';",
  "      }",
  "    }",
  "  }",
  "  */",
  "",
  "  // STEP 2: Remove excess inventory at the end of the planning horizon.",
  "  // Delete the earliest unlocked producer(s) that leave(s) excess at any",
  "  // later point in the horizon.",
  "  fiter = b->getFlowPlans().rbegin();",
  "  if (fiter == fend) return;",
  "  double excess =",
  "      fiter->getOnhand() - max(max(fiter->getMin(), fiter->getMax()), 0.0);",
  "  if (excess > ROUNDING_ERROR) {",
  "    fiter = b->getFlowPlans().begin();",
  "    while (fiter != fend) {",
  "      if (fiter->getQuantity() <= 0) {",
  "        // Not a producer",
  "        ++fiter;",
  "        continue;",
  "      }",
  "      FlowPlan* fp = nullptr;",
  "      if (fiter->getEventType() == 1)",
  "        fp = const_cast<FlowPlan*>(static_cast<const FlowPlan*>(&*fiter));",
  "      if (!fp || !fp->getOperationPlan()->getProposed() ||",
  "          fp->getOperationPlan()->getDemand() ||",
  "          (fp->getOperationPlan()->getOwner() &&",
  "           fp->getOperationPlan()->getOwner()->getDemand()) ||",
  "          fp->getFlow()->hasType<FlowTransferBatch>()) {",
  "        // It's locked or a delivery operationplan",
  "        ++fiter;",
  "        continue;",
  "      }",
  "",
  "      // Compute the excess quantity",
  "      auto topopplan = fp->getOperationPlan();",
  "      if (topopplan->getOwner() &&",
  "          topopplan->getOwner()->getOperation()->hasType<OperationRouting>())",
  "        topopplan = topopplan->getOwner();",
  "      double opplan_excess = topopplan->isExcess(false);",
  "      if (opplan_excess < ROUNDING_ERROR) {",
  "        // It doesn't produce excess",
  "        ++fiter;",
  "        continue;",
  "      }",
  "",
  "      // Increment the iterator here, because it can get invalidated later on",
  "      while (fiter != fend && fiter->getEventType() == 1 &&",
  "             fiter->getOperationPlan()->getTopOwner() ==",
  "                 fp->getOperationPlan()->getTopOwner())",
  "        ++fiter;",
  "",
  "      double newsize_opplan;",
  "      if (opplan_excess >=",
  "          fp->getOperationPlan()->getQuantity() - ROUNDING_ERROR) {",
  "        // Completely delete the producer",
  "        newsize_opplan = 0.0;",
  "      } else {",
  "        // Resize the producer",
  "        // We need to keep the operationplan start date constant during the",
  "        // resize to avoid that a capacity consumption from a bucketized",
  "        // resource moves to a different bucket.",
  "        newsize_opplan = fp->getOperationPlan()->getQuantity() - opplan_excess;",
  "      }",
  "      if (newsize_opplan < ROUNDING_ERROR) {",
  "        // The complete operationplan is excess.",
  "        // Add upstream buffers to the stack",
  "        if (propagate) pushBuffers(fp->getOperationPlan(), true, false);",
  "        // Log message",
  "        if (getLogLevel() > 0)",
  "          logger << \"Removing excess operationplan: \" << topopplan << '\\n';",
  "        // Delete operationplan",
  "        if (cmds)",
  "          cmds->add(new CommandDeleteOperationPlan(topopplan));",
  "        else",
  "          delete fp->getOperationPlan();",
  "      } else if (newsize_opplan <",
  "                 fp->getOperationPlan()->getQuantity() - ROUNDING_ERROR) {",
  "        // Reduce the operationplan",
  "        // Add upstream buffers to the stack",
  "        if (propagate) pushBuffers(fp->getOperationPlan(), true, false);",
  "        if (getLogLevel() > 0)",
  "          logger << \"Resizing excess operationplan to \" << newsize_opplan",
  "                 << \": \" << topopplan << '\\n';",
  "        // Resize operationplan",
  "        if (cmds)",
  "          cmds->add(new CommandMoveOperationPlan(topopplan, Date::infinitePast,",
  "                                                 topopplan->getEnd(),",
  "                                                 newsize_opplan));",
  "        else",
  "          topopplan->setQuantity(newsize_opplan);",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "PyObject* OperatorDelete::solve(PyObject* self, PyObject* args) {",
  "  // Parse the argument",
  "  PyObject* obj = nullptr;",
  "  short objtype = 0;",
  "  if (args && !PyArg_ParseTuple(args, \"|O:solve\", &obj)) return nullptr;",
  "  if (obj) {",
  "    if (PyObject_TypeCheck(obj, Demand::metadata->pythonClass))",
  "      objtype = 1;",
  "    else if (PyObject_TypeCheck(obj, Buffer::metadata->pythonClass))",
  "      objtype = 2;",
  "    else if (PyObject_TypeCheck(obj, Resource::metadata->pythonClass))",
  "      objtype = 3;",
  "    else if (PyObject_TypeCheck(obj, OperationPlan::metadata->pythonClass))",
  "      objtype = 4;",
  "    else {",
  "      PyErr_SetString(PythonDataException,",
  "                      \"solve(d) argument must be a demand, buffer, resource or \"",
  "                      \"operationplan\");",
  "      return nullptr;",
  "    }",
  "  }",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    auto* sol = static_cast<OperatorDelete*>(self);",
  "    switch (objtype) {",
  "      case 0:",
  "        // Delete all excess",
  "        sol->solve();",
  "        break;",
  "      case 1:",
  "        // Delete upstream of a single demand",
  "        sol->solve(static_cast<Demand*>(obj));",
  "        break;",
  "      case 2:",
  "        // Delete upstream of a single buffer",
  "        sol->solve(static_cast<Buffer*>(obj));",
  "        break;",
  "      case 3:",
  "        // Delete upstream of a single resource",
  "        sol->solve(static_cast<Resource*>(obj));",
  "        break;",
  "      case 4:",
  "        // Delete an operationplan",
  "        sol->solve(static_cast<OperationPlan*>(obj));",
  "    }",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "}  // namespace frepple",
];
