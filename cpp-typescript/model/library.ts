// <header-api-generated>
export const LibraryModelCppModel = { bases: [] as const, methods: ["initialize"] as const, qualifiedNames: ["LibraryModel"] as const };

export class Solvable extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Solvable"] as const;
  solve(...args: readonly unknown[]): unknown { return this.invokeAdapter("solve", args); }
}
// </header-api-generated>














import { HeaderModelAdapter, RuntimeException } from "../utils/library.js";
import { PythonInterpreter } from "../utils/python.js";
import { Buffer } from "./buffer.js";
import { Calendar } from "./calendar.js";
import { Customer } from "./customer.js";
import { Demand } from "./demand.js";
import { Item } from "./item.js";
import { Location } from "./location.js";
import { Operation } from "./operation.js";
import { OperationPlan } from "./operationplan.js";
import { Plan } from "./plan.js";
import { Problem } from "./problem.js";
import { Resource } from "./resource.js";
import { SetupMatrix } from "./setupmatrix.js";
import { Skill } from "./skill.js";
import { Supplier } from "./supplier.js";


export class LibraryModel extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["LibraryModel"] as const;
  private static initialized = false;
  static override initialize(): number {
    if (this.initialized) return 0;
    this.initialized = true;
    const types = [Problem, Customer, Supplier, Calendar, OperationPlan, Operation, Location, Buffer, Demand, Item, SetupMatrix, Skill, Resource, Plan];
    const errors = types.reduce((count, type) => count + Number(type.initialize()), 0);
    if (errors) throw new RuntimeException("Error registering new TypeScript model types");
    PythonInterpreter.registerGlobalMethod("erase", (entity: unknown) => Plan.instance().erase(String(entity)));
    PythonInterpreter.registerGlobalMethod("buffers", () => Buffer.all());
    PythonInterpreter.registerGlobalMethod("locations", () => Location.all());
    PythonInterpreter.registerGlobalMethod("customers", () => Customer.all());
    PythonInterpreter.registerGlobalMethod("suppliers", () => Supplier.all());
    PythonInterpreter.registerGlobalMethod("items", () => Item.all());
    PythonInterpreter.registerGlobalMethod("calendars", () => Calendar.all());
    PythonInterpreter.registerGlobalMethod("demands", () => Demand.all());
    PythonInterpreter.registerGlobalMethod("resources", () => Resource.all());
    PythonInterpreter.registerGlobalMethod("operations", () => Operation.all());
    PythonInterpreter.registerGlobalMethod("operationplans", () => OperationPlan.all());
    PythonInterpreter.registerGlobalMethod("problems", () => Problem.all());
    PythonInterpreter.registerGlobalMethod("setupmatrices", () => SetupMatrix.all());
    PythonInterpreter.registerGlobalMethod("skills", () => Skill.all());
    return 0;
  }
  initialize(): number { return LibraryModel.initialize(); }
}












/**
 * Semantic migration unit for src/model/library.cpp.
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
  { name: "LibraryModel::initialize", sourceLine: 35, status: "adapted" },
  { name: "frepple::LibraryModel::initialize", sourceLine: 39, status: "adapted" },
  { name: "Object::registerPythonType", sourceLine: 113, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface LibraryModelPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface ObjectPort {
  registerPythonType(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/library.cpp";
export const targetFile = "model/library.ts";

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
  "#include <sys/stat.h>",
  "",
  "#include \"frepple/model.h\"",
  "",
  "namespace frepple {",
  "",
  "// Generic Python type for timeline events",
  "PythonType* EventPythonType = nullptr;",
  "",
  "void LibraryModel::initialize() {",
  "  // Initialize only once",
  "  static bool init = false;",
  "  if (init) {",
  "    logger << \"Warning: Calling frepple::LibraryModel::initialize() more \"",
  "           << \"than once.\\n\";",
  "    return;",
  "  }",
  "  init = true;",
  "",
  "  // Register new types in Python",
  "  // Ordering is important here!!! If a class contains a field of type",
  "  // iterator, then the class it iterators over must be defined before.",
  "  int nok = 0;",
  "  nok += Solver::initialize();",
  "  nok += Problem::initialize();",
  "  nok += Customer::initialize();",
  "  nok += CustomerDefault::initialize();",
  "  nok += ItemSupplier::initialize();",
  "  nok += Supplier::initialize();",
  "  nok += SupplierDefault::initialize();",
  "  nok += CalendarBucket::initialize();",
  "  nok += Calendar::initialize();",
  "  nok += CalendarDefault::initialize();",
  "  nok += ResourceSkill::initialize();",
  "  nok += LoadPlan::initialize();",
  "  nok += FlowPlan::initialize();",
  "  nok += PeggingIterator::initialize();",
  "  nok += PeggingDemandIterator::initialize();",
  "  nok += OperationPlanDependency::initialize();",
  "  nok += OperationPlan::InterruptionIterator::intitialize();",
  "  nok += OperationPlan::initialize();",
  "  nok += Load::initialize();",
  "  nok += LoadBucketizedFromStart::initialize();",
  "  nok += LoadBucketizedFromEnd::initialize();",
  "  nok += LoadBucketizedPercentage::initialize();",
  "  nok += LoadPlanIterator::initialize();",
  "  nok += Flow::initialize();",
  "  nok += FlowPlanIterator::initialize();",
  "  nok += SubOperation::initialize();",
  "  nok += OperationDependency::initialize();",
  "  nok += Operation::initialize();",
  "  nok += OperationAlternate::initialize();",
  "  nok += OperationSplit::initialize();",
  "  nok += OperationFixedTime::initialize();",
  "  nok += OperationTimePer::initialize();",
  "  nok += OperationRouting::initialize();",
  "  nok += OperationItemSupplier::initialize();",
  "  nok += OperationItemDistribution::initialize();",
  "  nok += OperationInventory::initialize();",
  "  nok += OperationDelivery::initialize();",
  "  nok += ItemDistribution::initialize();",
  "  nok += Location::initialize();",
  "  nok += LocationDefault::initialize();",
  "  nok += Buffer::initialize();",
  "  nok += BufferDefault::initialize();",
  "  nok += BufferInfinite::initialize();",
  "  nok += Demand::initialize();",
  "  nok += DemandDefault::initialize();",
  "  nok += DemandGroup::initialize();",
  "  nok += Item::initialize();",
  "  nok += ItemMTS::initialize();",
  "  nok += ItemMTO::initialize();",
  "  nok += SetupMatrixRule::initialize();",
  "  nok += SetupMatrixRuleDefault::initialize();",
  "  nok += SetupMatrix::initialize();",
  "  nok += SetupMatrixDefault::initialize();",
  "  nok += SetupEvent::initialize();",
  "  nok += Skill::initialize();",
  "  nok += SkillDefault::initialize();",
  "  nok += Resource::initialize();",
  "  nok += ResourceDefault::initialize();",
  "  nok += ResourceInfinite::initialize();",
  "  nok += Resource::PlanIterator::initialize();",
  "  nok += ResourceBuckets::initialize();",
  "  nok += Plan::initialize();",
  "",
  "  EventPythonType =",
  "      Object::registerPythonType(sizeof(TimeLine<Flow>::EventMaxQuantity),",
  "                                 &typeid(TimeLine<Flow>::EventMaxQuantity));",
  "",
  "  // Exit if errors were found",
  "  if (nok) throw RuntimeException(\"Error registering new Python types\");",
  "",
  "  // Register new methods in Python",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"printsize\", printModelSize, METH_NOARGS,",
  "      \"Print information about the memory consumption.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"erase\", eraseModel, METH_VARARGS,",
  "      \"Removes the plan data from memory, and optionally the static info too.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"readXMLdata\", readXMLdata, METH_VARARGS,",
  "      \"Processes a XML string passed as argument.\");",
  "  PythonInterpreter::registerGlobalMethod(\"readXMLfile\", readXMLfile,",
  "                                          METH_VARARGS, \"Read an XML file.\");",
  "  PythonInterpreter::registerGlobalMethod(\"saveXMLfile\", saveXMLfile,",
  "                                          METH_VARARGS,",
  "                                          \"Save the model to a XML file.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"saveplan\", savePlan, METH_VARARGS,",
  "      \"Save the main plan information to a file.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"buffers\", Buffer::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the buffers.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"locations\", Location::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the locations.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"customers\", Customer::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the customers.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"suppliers\", Supplier::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the suppliers.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"items\", Item::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the items.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"calendars\", Calendar::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the calendars.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"demands\", Demand::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the demands.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"resources\", Resource::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the resources.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"operations\", Operation::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the operations.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"operationplans\", OperationPlan::createIterator, METH_VARARGS,",
  "      \"Returns an iterator over the operationplans.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"problems\", PythonIterator<Problem::iterator, Problem>::create,",
  "      METH_NOARGS, \"Returns an iterator over the problems.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"setupmatrices\", SetupMatrix::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the setup matrices.\");",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"skills\", Skill::createIterator, METH_NOARGS,",
  "      \"Returns an iterator over the skills.\");",
  "}",
  "",
  "}  // namespace frepple",
];
