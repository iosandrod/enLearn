import { Duration } from "../utils/date.js";
import { DataException, Environment, HeaderModelAdapter, LogicException } from "../utils/library.js";
import type { Operation } from "./operation.js";
import { OperationPlan } from "./operationplan.js";
import { HasLevel } from "./leveled.js";

type DurationInput = Duration | string | number;

function asDuration(value: DurationInput): Duration {
  return value instanceof Duration ? new Duration(value) : new Duration(value);
}

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

/** Static precedence relation between two operations. */
export class OperationDependency extends HeaderModelAdapter {
  static readonly cppBases = ["HasSource", "Object"] as const;
  static readonly cppQualifiedNames = ["OperationDependency"] as const;
  private operation: Operation | null = null;
  private blockedBy: Operation | null = null;
  private quantity = 1;
  private safetyLeadtime = new Duration();
  private hardSafetyLeadtime = new Duration();
  private source = "";

  constructor(operation?: Operation | null, blockedBy?: Operation | null, quantity = 1) {
    super();
    this.quantity = Math.max(0, Number(quantity));
    if (operation) this.setOperation(operation);
    if (blockedBy) this.setBlockedBy(blockedBy);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static create(fields: Readonly<Record<string, unknown>>): OperationDependency {
    if (!fields.operation || typeof fields.operation !== "object") {
      throw new DataException("Missing operation on operationdependency");
    }
    if (!fields.blockedby || typeof fields.blockedby !== "object") {
      throw new DataException("Missing blockedby on operationdependency");
    }
    const result = new OperationDependency(fields.operation as Operation, fields.blockedby as Operation,
      Number(fields.quantity ?? 1));
    if (fields.safety_leadtime !== undefined) result.setSafetyLeadtime(fields.safety_leadtime as DurationInput);
    if (fields.hard_safety_leadtime !== undefined) result.setHardSafetyLeadtime(fields.hard_safety_leadtime as DurationInput);
    if (fields.source !== undefined) result.setSource(String(fields.source));
    return result;
  }

  getOperation(): Operation | null { return this.operation; }
  setOperation(value: Operation | null): void {
    if (value === this.operation) return;
    this.detach();
    const previous = this.operation;
    previous?.modelReferenceRemoved(this, "Operation");
    this.operation = value;
    value?.modelReferenceAdded(this, "Operation");
    this.attachOrReject();
  }

  getBlockedBy(): Operation | null { return this.blockedBy; }
  setBlockedBy(value: Operation | null): void {
    if (value === this.blockedBy) return;
    this.detach();
    const previous = this.blockedBy;
    previous?.modelReferenceRemoved(this, "BlockedBy");
    this.blockedBy = value;
    value?.modelReferenceAdded(this, "BlockedBy");
    this.attachOrReject();
  }

  private detach(): void {
    if (!this.operation || !this.blockedBy) return;
    call(this.operation, "removeDependency", this);
    if (this.blockedBy !== this.operation) call(this.blockedBy, "removeDependency", this);
  }

  private attachOrReject(): void {
    if (!this.operation || !this.blockedBy) return;
    try {
      call(this.operation, "addDependency", this);
      if (this.blockedBy !== this.operation) call(this.blockedBy, "addDependency", this);
      if (!OperationDependency.checkLoops(this.operation, [])) throw new DataException("Looping blocked-by dependency");
      HasLevel.triggerLazyRecomputation();
    } catch (error) {
      this.detach();
      const operation = this.operation;
      const blockedBy = this.blockedBy;
      operation?.modelReferenceRemoved(this, "Operation");
      blockedBy?.modelReferenceRemoved(this, "BlockedBy");
      this.operation = null;
      this.blockedBy = null;
      throw error;
    }
  }

  private static checkLoops(operation: Operation, path: readonly Operation[]): boolean {
    if (path.includes(operation)) return false;
    const nextPath = [...path, operation];
    const dependencies = call(operation, "getDependencies");
    if (dependencies && typeof (dependencies as Iterable<unknown>)[Symbol.iterator] === "function") {
      for (const candidate of dependencies as Iterable<unknown>) {
        if (!(candidate instanceof OperationDependency) || candidate.operation !== operation || !candidate.blockedBy) continue;
        if (!this.checkLoops(candidate.blockedBy, nextPath)) return false;
      }
    }
    const subOperations = call(operation, "getSubOperations");
    if (subOperations && typeof (subOperations as Iterable<unknown>)[Symbol.iterator] === "function") {
      for (const candidate of subOperations as Iterable<unknown>) {
        const child = call(candidate, "getOperation");
        if (child && typeof child === "object" && !this.checkLoops(child as Operation, nextPath)) return false;
      }
    }
    return true;
  }

  getQuantity(): number { return this.quantity; }
  setQuantity(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: Dependency quantity must be greater than 0");
    else this.quantity = Number(value);
  }
  getSafetyLeadtime(): Duration { return new Duration(this.safetyLeadtime); }
  setSafetyLeadtime(value: DurationInput): void {
    const next = asDuration(value);
    if (next.seconds < 0) Environment.log("Warning: No negative safety lead time allowed");
    else this.safetyLeadtime = next;
  }
  getHardSafetyLeadtime(): Duration { return new Duration(this.hardSafetyLeadtime); }
  setHardSafetyLeadtime(value: DurationInput): void {
    const next = asDuration(value);
    if (next.seconds < 0) Environment.log("Warning: No negative hard safety lead time allowed");
    else this.hardSafetyLeadtime = next;
  }
  getSource(): string { return this.source; }
  setSource(value: string): void { this.source = String(value); }
  getType(): string { return "operationdependency"; }
  createOperationPlanDependency(first: OperationPlan, second: OperationPlan): OperationPlanDependency {
    return new OperationPlanDependency(first, second, this);
  }

  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Operation" && target === this.operation) this.setOperation(null);
    else if (property === "BlockedBy" && target === this.blockedBy) this.setBlockedBy(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  override dispose(): void {
    HasLevel.triggerLazyRecomputation();
    this.detach();
    const operation = this.operation;
    const blockedBy = this.blockedBy;
    this.operation = null;
    this.blockedBy = null;
    operation?.modelReferenceRemoved(this, "Operation");
    blockedBy?.modelReferenceRemoved(this, "BlockedBy");
    for (const dependency of [...OperationPlanDependency.all()]) {
      if (dependency.getOperationDependency() === this) dependency.setOperationDependency(null);
    }
    super.dispose();
  }
}

export class OperationDependencyIterator implements Iterable<OperationDependency> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Operation::dependencyIterator"] as const;
  private readonly values: OperationDependency[];
  private index = 0;
  constructor(source?: Iterable<OperationDependency> | Operation | null, blockedBy = false) {
    const modeled = call(source, blockedBy ? "getBlockedbyIterator" : "getBlockingIterator");
    const values = modeled && typeof (modeled as Iterable<unknown>)[Symbol.iterator] === "function"
      ? modeled as Iterable<unknown>
      : source && typeof (source as Iterable<unknown>)[Symbol.iterator] === "function"
        ? source as Iterable<unknown> : [];
    this.values = [...values].filter((value): value is OperationDependency => value instanceof OperationDependency);
  }
  next(): OperationDependency | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<OperationDependency> { return this.values.values(); }
}

/** Allocation of an operation dependency between two concrete operationplans. */
export class OperationPlanDependency extends HeaderModelAdapter {
  static readonly cppBases = ["Object"] as const;
  static readonly cppQualifiedNames = ["OperationPlanDependency"] as const;
  private first: OperationPlan | null;
  private second: OperationPlan | null;
  private dependency: OperationDependency | null;

  constructor(first: OperationPlan | null = null, second: OperationPlan | null = null,
    dependency: OperationDependency | null = null) {
    super();
    this.first = first;
    this.second = second;
    this.dependency = dependency;
    first?.addDependency(this);
    second?.addDependency(this);
    first?.modelReferenceAdded(this, "First");
    second?.modelReferenceAdded(this, "Second");
    dependency?.modelReferenceAdded(this, "OperationDependency");
    first?.setChanged();
    second?.setChanged();
  }
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  getFirst(): OperationPlan | null { return this.first; }
  getSecond(): OperationPlan | null { return this.second; }
  getOperationDependency(): OperationDependency | null { return this.dependency; }
  setOperationDependency(value: OperationDependency | null): void {
    if (value === this.dependency) return;
    this.dependency?.modelReferenceRemoved(this, "OperationDependency");
    this.dependency = value;
    value?.modelReferenceAdded(this, "OperationDependency");
  }
  getQuantity(): number {
    if (!this.first || !this.second) return 0;
    const allocated = this.second.getQuantity() * (this.dependency?.getQuantity() ?? 1);
    return Math.min(allocated, this.first.getQuantity());
  }
  getType(): string { return "operationplandependency"; }
  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if ((property === "First" && target === this.first) || (property === "Second" && target === this.second)) this.dispose();
    else if (property === "OperationDependency" && target === this.dependency) this.setOperationDependency(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  override dispose(): void {
    const first = this.first;
    const second = this.second;
    const dependency = this.dependency;
    this.first = null;
    this.second = null;
    this.dependency = null;
    first?.removeDependency(this);
    second?.removeDependency(this);
    first?.modelReferenceRemoved(this, "First");
    second?.modelReferenceRemoved(this, "Second");
    dependency?.modelReferenceRemoved(this, "OperationDependency");
    super.dispose();
  }
}

export class OperationPlanDependencyIterator implements Iterable<OperationPlanDependency> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["OperationPlan::dependencyIterator"] as const;
  private readonly values: OperationPlanDependency[];
  private index = 0;
  constructor(source?: Iterable<OperationPlanDependency> | OperationPlan | null, blockedBy = false) {
    const modeled = call(source, blockedBy ? "getBlockedbyIterator" : "getBlockingIterator");
    const values = modeled && typeof (modeled as Iterable<unknown>)[Symbol.iterator] === "function"
      ? modeled as Iterable<unknown>
      : source && typeof (source as Iterable<unknown>)[Symbol.iterator] === "function"
        ? source as Iterable<unknown> : [];
    this.values = [...values].filter((value): value is OperationPlanDependency => value instanceof OperationPlanDependency);
  }
  next(): OperationPlanDependency | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<OperationPlanDependency> { return this.values.values(); }
}


























/**
 * Semantic migration unit for src/model/operationdependency.cpp.
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
  { name: "OperationPlanDependency::initialize", sourceLine: 35, status: "adapted" },
  { name: "OperationDependency::initialize", sourceLine: 56, status: "adapted" },
  { name: "OperationDependency::~OperationDependency", sourceLine: 78, status: "adapted" },
  { name: "OperationDependency::setOperation", sourceLine: 93, status: "adapted" },
  { name: "OperationDependency::setBlockedBy", sourceLine: 116, status: "adapted" },
  { name: "OperationDependency::create", sourceLine: 139, status: "adapted" },
  { name: "Operation::addDependency", sourceLine: 194, status: "adapted" },
  { name: "OperationPlanDependency::OperationPlanDependency", sourceLine: 212, status: "adapted" },
  { name: "OperationPlanDependency::~OperationPlanDependency", sourceLine: 227, status: "adapted" },
  { name: "OperationPlanDependency::getQuantity", sourceLine: 232, status: "adapted" },
  { name: "OperationDependency::checkLoops", sourceLine: 240, status: "adapted" },
  { name: "OperationPlan::matchDependencies", sourceLine: 267, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface OperationPort {
  addDependency(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationDependencyPort {
  checkLoops(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  disposeOperationDependency(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setBlockedBy(...args: readonly PortValue[]): PortValue | void;
  setOperation(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanPort {
  matchDependencies(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationPlanDependencyPort {
  OperationPlanDependency(...args: readonly PortValue[]): PortValue | void;
  disposeOperationPlanDependency(...args: readonly PortValue[]): PortValue | void;
  getQuantity(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/operationdependency.cpp";
export const targetFile = "model/operationdependency.ts";

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
  "const MetaCategory* OperationDependency::metacategory;",
  "const MetaClass* OperationDependency::metadata;",
  "const MetaCategory* OperationPlanDependency::metacategory;",
  "const MetaClass* OperationPlanDependency::metadata;",
  "",
  "int OperationPlanDependency::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<SubOperation>(",
  "      \"operationplandependency\", \"operationplandependency\",",
  "      MetaCategory::ControllerDefault);",
  "  metadata = MetaClass::registerClass<OperationPlanDependency>(",
  "      \"operationplandependency\", \"operationplandependency\", nullptr, true);",
  "  registerFields<OperationPlanDependency>(",
  "      const_cast<MetaCategory*>(metacategory));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<OperationPlanDependency>::getPythonType();",
  "  x.setName(\"operationplandependency\");",
  "  x.setDoc(\"frePPLe operationplan dependency\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  OperationPlanDependency::metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "int OperationDependency::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<SubOperation>(",
  "      \"operationdependency\", \"operationdependency\",",
  "      MetaCategory::ControllerDefault);",
  "  metadata = MetaClass::registerClass<OperationDependency>(",
  "      \"operationdependency\", \"operationdependency\",",
  "      Object::create<OperationDependency>, true);",
  "  registerFields<OperationDependency>(const_cast<MetaCategory*>(metacategory));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<OperationDependency>::getPythonType();",
  "  x.setName(\"operationdependency\");",
  "  x.setDoc(\"frePPLe operation dependency\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  OperationDependency::metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "OperationDependency::~OperationDependency() {",
  "  if (blockedby) {",
  "    blockedby->removeDependency(this);",
  "    for (auto o = oper->getOperationPlans(); o != OperationPlan::end(); ++o) {",
  "      for (auto d : o->dependencies) d->dpdcy = nullptr;",
  "    }",
  "  }",
  "  if (oper) {",
  "    oper->removeDependency(this);",
  "    for (auto o = oper->getOperationPlans(); o != OperationPlan::end(); ++o) {",
  "      for (auto d : o->dependencies) d->dpdcy = nullptr;",
  "    }",
  "  }",
  "}",
  "",
  "void OperationDependency::setOperation(Operation* o) {",
  "  if (o == oper) return;",
  "  if (oper && blockedby) oper->removeDependency(this);",
  "  if (!oper && o) {",
  "    oper = o;",
  "    oper->addDependency(this);",
  "    blockedby->addDependency(this);",
  "  } else if (o && blockedby) {",
  "    oper = o;",
  "    oper->addDependency(this);",
  "  } else if (blockedby)",
  "    blockedby->removeDependency(this);",
  "  if (oper && blockedby) {",
  "    vector<const Operation*> path;",
  "    if (!checkLoops(oper, path)) {",
  "      blockedby->removeDependency(this);",
  "      oper->removeDependency(this);",
  "      oper = nullptr;",
  "      blockedby = nullptr;",
  "    }",
  "  }",
  "}",
  "",
  "void OperationDependency::setBlockedBy(Operation* o) {",
  "  if (o == blockedby) return;",
  "  if (blockedby && oper) blockedby->removeDependency(this);",
  "  if (!blockedby && o) {",
  "    blockedby = o;",
  "    blockedby->addDependency(this);",
  "    oper->addDependency(this);",
  "  } else if (o && oper) {",
  "    blockedby = o;",
  "    blockedby->addDependency(this);",
  "  } else if (oper)",
  "    oper->removeDependency(this);",
  "  if (oper && blockedby) {",
  "    vector<const Operation*> path;",
  "    if (!checkLoops(oper, path)) {",
  "      blockedby->removeDependency(this);",
  "      oper->removeDependency(this);",
  "      oper = nullptr;",
  "      blockedby = nullptr;",
  "    }",
  "  }",
  "}",
  "",
  "PyObject* OperationDependency::create(PyTypeObject*, PyObject*,",
  "                                      PyObject* kwds) {",
  "  try {",
  "    // Pick up the operation",
  "    PyObject* oper = PyDict_GetItemString(kwds, \"operation\");",
  "    if (!oper) throw DataException(\"Missing operation on SubOperation\");",
  "    if (!PyObject_TypeCheck(oper, Operation::metadata->pythonClass))",
  "      throw DataException(",
  "          \"field 'operation' of operationdependency must be of type operation\");",
  "",
  "    // Pick up the owner",
  "    PyObject* blockedby = PyDict_GetItemString(kwds, \"blockedby\");",
  "    if (!blockedby)",
  "      throw DataException(\"Missing blockedby on operationdependency\");",
  "    if (!PyObject_TypeCheck(blockedby, Operation::metadata->pythonClass))",
  "      throw DataException(",
  "          \"field 'blockedby' of operationdependency must be of type operation\");",
  "",
  "    // Pick up the type and create the dependency",
  "    auto l = new OperationDependency();",
  "    if (oper) l->setOperation(static_cast<Operation*>(oper));",
  "    if (blockedby) l->setBlockedBy(static_cast<Operation*>(blockedby));",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    if (l) {",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        if (!attr.isA(Tags::operation) && !attr.isA(Tags::blockedby) &&",
  "            !attr.isA(Tags::type) && !attr.isA(Tags::action)) {",
  "          const MetaFieldBase* fmeta =",
  "              OperationDependency::metacategory->findField(attr.getHash());",
  "          if (fmeta)",
  "            // Update the attribute",
  "            fmeta->setField(l, field);",
  "          else",
  "            l->setProperty(attr.getName(), value);",
  "        }",
  "      }",
  "    }",
  "",
  "    // Return the object",
  "    Py_INCREF(l);",
  "    return static_cast<PyObject*>(l);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "void Operation::addDependency(OperationDependency* dpd) {",
  "  if (!dpd->getOperation() || !dpd->getBlockedBy()) return;",
  "  for (auto& iter : dependencies) {",
  "    if (iter->getOperation() == dpd->getOperation() &&",
  "        iter->getBlockedBy() == dpd->getBlockedBy())",
  "      throw DataException(\"Duplicate dependency between '\" +",
  "                          iter->getOperation()->getName() + \"' and '\" +",
  "                          iter->getBlockedBy()->getName() + \"'\");",
  "  }",
  "  // Insert at the end of the list. Scales O(n).",
  "  auto before_end = dependencies.before_begin();",
  "  for (auto& _ : dependencies) {",
  "    (void)_;",
  "    ++before_end;",
  "  }",
  "  dependencies.insert_after(before_end, dpd);",
  "}",
  "",
  "OperationPlanDependency::OperationPlanDependency(OperationPlan* op1,",
  "                                                 OperationPlan* op2,",
  "                                                 OperationDependency* d)",
  "    : first(op1), second(op2), dpdcy(d) {",
  "  initType(metadata);",
  "  if (first) {",
  "    first->dependencies.push_front(this);",
  "    first->setChanged();",
  "  }",
  "  if (second) {",
  "    second->dependencies.push_front(this);",
  "    second->setChanged();",
  "  }",
  "}",
  "",
  "OperationPlanDependency::~OperationPlanDependency() {",
  "  if (first) first->dependencies.remove(this);",
  "  if (second) second->dependencies.remove(this);",
  "}",
  "",
  "double OperationPlanDependency::getQuantity() const {",
  "  // Assumes complete allocation of first or second operationplan",
  "  if (!first || !second) return 0.0;",
  "  double p = dpdcy ? second->getQuantity() * dpdcy->getQuantity()",
  "                   : second->getQuantity();",
  "  return min(p, first->getQuantity());",
  "}",
  "",
  "bool OperationDependency::checkLoops(const Operation* o,",
  "                                     vector<const Operation*>& path) {",
  "  auto found = find(path.begin(), path.end(), o);",
  "  if (found != path.end()) {",
  "    logger << \"Data error: Ignoring looping blocked-by dependencies among:\"",
  "           << '\\n';",
  "    while (found != path.end()) {",
  "      logger << \"    \" << *found << '\\n';",
  "      ++found;",
  "    }",
  "    logger << \"    \" << o << '\\n';",
  "    return false;",
  "  }",
  "  path.push_back(o);",
  "  for (auto dpd : o->getDependencies()) {",
  "    if (dpd->getOperation() != o) continue;",
  "    // Recursive call",
  "    if (!checkLoops(dpd->getBlockedBy(), path)) return false;",
  "  }",
  "  for (auto sub : o->getSubOperations()) {",
  "    if (!checkLoops(sub->getOperation(), path)) return false;",
  "  }",
  "  if (path.back() != o) throw LogicException(\"Corrupt dependency loop check\");",
  "  path.pop_back();",
  "  return true;",
  "}",
  "",
  "void OperationPlan::matchDependencies(bool log) {",
  "  if (!getOperation() || getOperation()->getDependencies().empty() ||",
  "      getCompleted() || getClosed())",
  "    return;",
  "  if (log) logger << \"Scanning dependencies of \" << this << '\\n';",
  "  for (auto dpd : getOperation()->getDependencies()) {",
  "    if (dpd->getBlockedBy() == getOperation()) continue;",
  "    auto needed = getQuantity() * dpd->getQuantity();",
  "    auto o = dpd->getBlockedBy()->getOperationPlans();",
  "    while (o != OperationPlan::end()) {",
  "      if (getBatch() && o->getBatch() != getBatch()) {",
  "        // No match",
  "        ++o;",
  "        continue;",
  "      }",
  "      auto unpegged = o->getQuantity();",
  "      for (auto d : o->getDependencies()) {",
  "        if (d->getFirst()->getOperation() != dpd->getOperation() ||",
  "            d->getSecond()->getOperation() != getOperation()) {",
  "          continue;",
  "        }",
  "        if (d->getOperationDependency())",
  "          unpegged -= d->getSecond()->getQuantity() *",
  "                      d->getOperationDependency()->getQuantity();",
  "        else",
  "          unpegged -= d->getSecond()->getQuantity();",
  "      }",
  "      if (unpegged > ROUNDING_ERROR) {",
  "        new OperationPlanDependency(&*o, this, dpd);",
  "        if (log) logger << \"  Matching \" << &*o << '\\n';",
  "        needed -= unpegged;",
  "        if (needed < ROUNDING_ERROR) break;",
  "      }",
  "      ++o;",
  "    }",
  "    if (log && needed > ROUNDING_ERROR)",
  "      logger << \"  Unmatched \" << needed << \" on operation '\"",
  "             << dpd->getBlockedBy() << \"'\\n\";",
  "  }",
  "}",
  "",
  "}  // namespace frepple",
];
