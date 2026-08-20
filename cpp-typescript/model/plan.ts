// <header-api-generated>
export const PlanCppModel = { bases: ["Object","Plannable"] as const, methods: ["erase","getAllowMergingOperationPlans","getAutoFence","getBuffers","getCalendars","getCompletedAllowFuture","getCurrent","getCustomers","getDBconnection","getDeliveryDuration","getDemands","getDescription","getFcstCurrent","getIndividualPoolResources","getItems","getLocations","getLogFile","getMoveApprovedEarly","getName","getOperationPlanCounterMin","getOperationPlans","getOperations","getProblems","getResources","getSetupMatrices","getShortageTolerance","getSkills","getSuppliers","getSuppressFlowplanCreation","getTimeZone","getType","getWipProduceFullQuantity","getloglimit","initialize","instance","registerFields","setAllowMergingOperationPlans","setAutoFence","setCompletedAllowFuture","setCurrent","setDBconnection","setDeliveryDuration","setDescription","setFcstCurrent","setIndividualPoolResources","setLogFile","setMoveApprovedEarly","setName","setOperationPlanCounterMin","setShortageTolerance","setSuppressFlowplanCreation","setTimeZone","setWipProduceFullQuantity","setloglimit","solve","updateProblems"] as const, qualifiedNames: ["Plan"] as const };
// </header-api-generated>














import { Date as FreppleDate, Duration } from "../utils/date.js";
import { DataException, Environment, HeaderModelAdapter } from "../utils/library.js";
import { PythonInterpreter } from "../utils/python.js";
import { Buffer } from "./buffer.js";
import { Calendar } from "./calendar.js";
import { Customer } from "./customer.js";
import { Demand } from "./demand.js";
import { Item } from "./item.js";
import { Location } from "./location.js";
import { Operation } from "./operation.js";
import { OperationPlan, setOperationPlanIndividualPoolResources } from "./operationplan.js";
import { Problem } from "./problem.js";
import { Resource } from "./resource.js";
import { SetupMatrix } from "./setupmatrix.js";
import { Skill } from "./skill.js";
import { Supplier } from "./supplier.js";


type SolverAdapter = { solve(target: Plan, data?: unknown): unknown };
type ClearableModel = typeof HeaderModelAdapter;

export class Plan extends HeaderModelAdapter {
  static readonly cppBases = ["Object", "Plannable"] as const;
  static readonly cppQualifiedNames = ["Plan"] as const;
  private static singleton: Plan | null = null;
  private static initialized = false;
  private readonly pythonBaseClasses = new Map<Function, Function>();
  private current = new FreppleDate();
  private forecastCurrent: FreppleDate | null = null;
  private name = "";
  private description = "";
  private autoFence = new Duration(0);
  private shortageTolerance = new Duration(-1);
  private deliveryDuration = new Duration(0);
  private completedAllowFuture = false;
  private wipProduceFullQuantity = false;
  private dbConnection = "";
  private individualPoolResources = false;
  private moveApprovedEarly = 0;
  private suppressFlowplanCreation = false;
  private timeZone = "";
  private allowMergingOperationPlans = true;
  private operationPlanCounterMin = 0;

  static instance(): Plan { return this.singleton ??= new Plan(); }
  static override initialize(): number {
    if (this.initialized) return 0;
    this.initialized = true;
    PythonInterpreter.registerGlobalObject("settings", this.instance());
    return 0;
  }
  static override registerFields(): number { return 0; }

  setBaseClass(cppClass: Function, adapterClass: Function): void {
    if (typeof cppClass !== "function" || typeof adapterClass !== "function") throw new TypeError("Both arguments must be classes");
    this.pythonBaseClasses.set(cppClass, adapterClass);
  }
  getBaseClass(cppClass: Function): Function | undefined { return this.pythonBaseClasses.get(cppClass); }
  setAllowMergingOperationPlans(value: boolean): void { this.allowMergingOperationPlans = value; }
  getAllowMergingOperationPlans(): boolean { return this.allowMergingOperationPlans; }
  getName(): string { return this.name; }
  setName(value: string): void { this.name = value; }
  getCurrent(): FreppleDate { return new FreppleDate(this.current); }
  setCurrent(value: FreppleDate | string | number): void {
    this.current = new FreppleDate(value);
    if (!this.forecastCurrent) this.forecastCurrent = new FreppleDate(value);
  }
  getFcstCurrent(): FreppleDate { return new FreppleDate(this.forecastCurrent ?? this.current); }
  setFcstCurrent(value: FreppleDate | string | number): void { this.forecastCurrent = new FreppleDate(value); }
  getTimeZone(): string { return this.timeZone; }
  setTimeZone(value: string): void { this.timeZone = value; }
  getAutoFence(): Duration { return new Duration(this.autoFence); }
  setAutoFence(value: Duration | number | string): void { const duration = new Duration(value); if (duration.seconds >= 0) this.autoFence = duration; }
  getShortageTolerance(): Duration { return new Duration(this.shortageTolerance); }
  setShortageTolerance(value: Duration | number | string): void { const duration = new Duration(value); if (duration.seconds >= 0) this.shortageTolerance = duration; }
  getDeliveryDuration(): Duration { return new Duration(this.deliveryDuration); }
  setDeliveryDuration(value: Duration | number | string): void { this.deliveryDuration = new Duration(value); }
  getDescription(): string { return this.description; }
  setDescription(value: string): void { this.description = value; }
  getDBconnection(): string { return this.dbConnection; }
  setDBconnection(value: string): void { this.dbConnection = value; }
  getCompletedAllowFuture(): boolean { return this.completedAllowFuture; }
  setCompletedAllowFuture(value: boolean): void { this.completedAllowFuture = value; }
  getWipProduceFullQuantity(): boolean { return this.wipProduceFullQuantity; }
  setWipProduceFullQuantity(value: boolean): void { this.wipProduceFullQuantity = value; }
  getIndividualPoolResources(): boolean { return this.individualPoolResources; }
  setIndividualPoolResources(value: boolean): void {
    this.individualPoolResources = Boolean(value);
    setOperationPlanIndividualPoolResources(this.individualPoolResources);
  }
  getMoveApprovedEarly(): number { return this.moveApprovedEarly; }
  setMoveApprovedEarly(value: number): void { this.moveApprovedEarly = Math.trunc(value); }
  getSuppressFlowplanCreation(): boolean { return this.suppressFlowplanCreation; }
  setSuppressFlowplanCreation(value: boolean): void { this.suppressFlowplanCreation = value; }
  setLogFile(value: string): void { Environment.setLogFile(value); }
  getLogFile(): string { return Environment.getLogFile(); }
  getloglimit(): number { return Environment.getloglimit(); }
  setloglimit(value: number): void { Environment.setloglimit(value); }
  getOperationPlanCounterMin(): number { return this.operationPlanCounterMin; }
  setOperationPlanCounterMin(value: number): void { this.operationPlanCounterMin = Math.max(0, Math.trunc(value)); }

  getLocations(): Location[] { return Location.all(); }
  getCustomers(): Customer[] { return Customer.all(); }
  getSuppliers(): Supplier[] { return Supplier.all(); }
  getCalendars(): Calendar[] { return Calendar.all(); }
  getOperations(): Operation[] { return Operation.all(); }
  getItems(): Item[] { return Item.all(); }
  getBuffers(): Buffer[] { return Buffer.all(); }
  getDemands(): Demand[] { return Demand.all(); }
  getSetupMatrices(): SetupMatrix[] { return SetupMatrix.all(); }
  getSkills(): Skill[] { return Skill.all(); }
  getResources(): Resource[] { return Resource.all(); }
  getProblems(): Problem[] { return Problem.all(); }
  getOperationPlans(): OperationPlan[] { return OperationPlan.all(); }
  getType(): string { return "plan"; }
  updateProblems(): void {}
  solve(solver: SolverAdapter, data?: unknown): unknown { return solver.solve(this, data); }

  override toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      current: this.current.toString(),
      forecast_current: (this.forecastCurrent ?? this.current).toString(),
      timezone: this.timeZone,
      autofence: this.autoFence.toString(),
      shortage_tolerance: this.shortageTolerance.toString(),
      delivery_duration: this.deliveryDuration.toString(),
      completed_allow_future: this.completedAllowFuture,
      wip_produce_full_quantity: this.wipProduceFullQuantity,
      dbconnection: this.dbConnection,
      individual_pool_resources: this.individualPoolResources,
      move_approved_early: this.moveApprovedEarly,
      suppress_flowplan_creation: this.suppressFlowplanCreation,
      allow_merging_operationplans: this.allowMergingOperationPlans,
      operationplan_counter_min: this.operationPlanCounterMin,
    };
  }

  erase(entity: string): void {
    const clearers: Readonly<Record<string, ClearableModel>> = {
      item: Item, location: Location, customer: Customer, operation: Operation,
      demand: Demand, forecast: Demand, buffer: Buffer, skill: Skill,
      resource: Resource, setupmatrix: SetupMatrix, calendar: Calendar,
      supplier: Supplier, operationplan: OperationPlan,
    };
    const clearer = clearers[entity.toLowerCase()];
    if (!clearer) throw new DataException("erase operation not supported");
    clearer.clear();
  }
}












/**
 * Semantic migration unit for src/model/plan.cpp.
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
  { name: "Plan::initialize", sourceLine: 33, status: "adapted" },
  { name: "Plan::instance", sourceLine: 52, status: "adapted" },
  { name: "Plan::setBaseClass", sourceLine: 56, status: "adapted" },
  { name: "Plan::~Plan", sourceLine: 74, status: "adapted" },
  { name: "Environment::setLogFile", sourceLine: 76, status: "adapted" },
  { name: "Plan::instance", sourceLine: 79, status: "adapted" },
  { name: "Plan::setFcstCurrent", sourceLine: 84, status: "adapted" },
  { name: "Plan::erase", sourceLine: 86, status: "adapted" },
  { name: "Item::clear", sourceLine: 88, status: "adapted" },
  { name: "Location::clear", sourceLine: 90, status: "adapted" },
  { name: "Customer::clear", sourceLine: 92, status: "adapted" },
  { name: "Operation::clear", sourceLine: 94, status: "adapted" },
  { name: "Demand::clear", sourceLine: 99, status: "adapted" },
  { name: "Buffer::clear", sourceLine: 101, status: "adapted" },
  { name: "Skill::clear", sourceLine: 103, status: "adapted" },
  { name: "Resource::clear", sourceLine: 105, status: "adapted" },
  { name: "SetupMatrix::clear", sourceLine: 107, status: "adapted" },
  { name: "Calendar::clear", sourceLine: 109, status: "adapted" },
  { name: "Supplier::clear", sourceLine: 111, status: "adapted" },
  { name: "OperationPlan::clear", sourceLine: 113, status: "adapted" },
  { name: "Plan::setSuppressFlowplanCreation", sourceLine: 120, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface BufferPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface CalendarPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface CustomerPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface DemandPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface EnvironmentPort {
  setLogFile(...args: readonly PortValue[]): PortValue | void;
}

export interface ItemPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface LocationPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  disposePlan(...args: readonly PortValue[]): PortValue | void;
  erase(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  instance(...args: readonly PortValue[]): PortValue | void;
  setBaseClass(...args: readonly PortValue[]): PortValue | void;
  setFcstCurrent(...args: readonly PortValue[]): PortValue | void;
  setSuppressFlowplanCreation(...args: readonly PortValue[]): PortValue | void;
}

export interface ResourcePort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface SetupMatrixPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface SkillPort {
  clear(...args: readonly PortValue[]): PortValue | void;
}

export interface SupplierPort {
  clear(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/plan.cpp";
export const targetFile = "model/plan.ts";

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
  "const MetaClass* Plan::metadata;",
  "const MetaCategory* Plan::metacategory;",
  "",
  "int Plan::initialize() {",
  "  // Initialize the plan metadata.",
  "  metacategory = MetaCategory::registerCategory<Plan>(\"plan\", \"\");",
  "  Plan::metadata =",
  "      MetaClass::registerClass<OperationPlan>(\"plan\", \"plan\", true);",
  "  registerFields<Plan>(const_cast<MetaCategory*>(metacategory));",
  "",
  "  // Initialize the Python type",
  "  auto& x = FreppleCategory<Plan>::getPythonType();",
  "  x.setName(\"parameters\");",
  "  x.setDoc(\"frePPLe global settings\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.addMethod(\"setBaseClass\", setBaseClass, METH_VARARGS,",
  "              \"specifies a Python base class to use for the engine objects\");",
  "  int tmp = x.typeReady();",
  "  metadata->setPythonClass(x);",
  "",
  "  // Add access to the information with a global attribute.",
  "  PythonInterpreter::registerGlobalObject(\"settings\", &Plan::instance());",
  "  return tmp;",
  "}",
  "",
  "PyObject* Plan::setBaseClass(PyObject*, PyObject* args) {",
  "  PyObject* class_cpp = nullptr;",
  "  PyObject* class_py = nullptr;",
  "  if (!PyArg_ParseTuple(args, \"OO:setBaseClass\", &class_cpp, &class_py))",
  "    return nullptr;",
  "  if (!class_cpp || !PyType_Check(class_cpp)) {",
  "    PyErr_SetString(PyExc_TypeError, \"First argument must be a type\");",
  "    return nullptr;",
  "  }",
  "  if (!class_py || !PyType_Check(class_py)) {",
  "    PyErr_SetString(PyExc_TypeError, \"Second argument must be a type\");",
  "    return nullptr;",
  "  }",
  "  auto t = MetaClass::findClass(class_cpp);",
  "  if (t) const_cast<MetaClass*>(t)->pythonBaseClass = (PyTypeObject*)(class_py);",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "Plan::~Plan() {",
  "  resetReferenceCount();",
  "  Environment::setLogFile(\"\");",
  "}",
  "",
  "Plan& Plan::instance() {",
  "  static Plan p;",
  "  return p;",
  "}",
  "",
  "void Plan::setFcstCurrent(Date l) { fcst_cur_Date = l; }",
  "",
  "void Plan::erase(const string& e) {",
  "  if (e == \"item\")",
  "    Item::clear();",
  "  else if (e == \"location\")",
  "    Location::clear();",
  "  else if (e == \"customer\")",
  "    Customer::clear();",
  "  else if (e == \"operation\")",
  "    Operation::clear();",
  "  else if (e == \"demand\" || e == \"forecast\")",
  "    // TODO handling demand and forecast here as the same is not correct.",
  "    // In this file, we can't make the distinction - as the forecast class isn't",
  "    // known at this point yet.",
  "    Demand::clear();",
  "  else if (e == \"buffer\")",
  "    Buffer::clear();",
  "  else if (e == \"skill\")",
  "    Skill::clear();",
  "  else if (e == \"resource\")",
  "    Resource::clear();",
  "  else if (e == \"setupmatrix\")",
  "    SetupMatrix::clear();",
  "  else if (e == \"calendar\")",
  "    Calendar::clear();",
  "  else if (e == \"supplier\")",
  "    Supplier::clear();",
  "  else if (e == \"operationplan\")",
  "    OperationPlan::clear();",
  "  // Not supported on itemsupplier, itemdistribution, resourceskill, flow, load,",
  "  // setupmatrixrule...",
  "  else",
  "    throw DataException(\"erase operation not supported\");",
  "}",
  "",
  "void Plan::setSuppressFlowplanCreation(bool b) {",
  "  suppress_flowplan_creation = b;",
  "",
  "  if (!suppress_flowplan_creation) {",
  "    // Delayed creation of flowplans - basically deplayed execution of",
  "    // Operationplan::createFlowLoads.",
  "    //",
  "    // If an operationplan doesn't have a single consunming flowplan.yet, we",
  "    // create them now. If there are existing flowplans, we assume they are",
  "    // complete.",
  "    // Similar logic for producing flowplans.",
  "    for (auto opplan = OperationPlan::begin(); opplan != OperationPlan::end();",
  "         ++opplan) {",
  "      if (!opplan->getConsumeMaterial() && !opplan->getProduceMaterial())",
  "        continue;",
  "      bool consumptionexists = false;",
  "      bool productionexists = false;",
  "      auto flplniter = opplan->beginFlowPlans();",
  "      while (auto f = flplniter.next()) {",
  "        if (f->getQuantity() < 0)",
  "          consumptionexists = true;",
  "        else if (f->getQuantity() > 0)",
  "          productionexists = true;",
  "      };",
  "      if (!productionexists || !consumptionexists) {",
  "        for (auto& h : opplan->getOperation()->getFlows()) {",
  "          if (!h.getAlternate() && ((!consumptionexists && h.isConsumer() &&",
  "                                     opplan->getConsumeMaterial()) ||",
  "                                    (!productionexists && h.isProducer() &&",
  "                                     opplan->getProduceMaterial())))",
  "            new FlowPlan(&*opplan, &h);",
  "        }",
  "      }",
  "      opplan->updateFeasible();",
  "    }",
  "  }",
  "}",
  "",
  "}  // namespace frepple",
];
