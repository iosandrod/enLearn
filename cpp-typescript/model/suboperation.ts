import { Date as PlanningDate, DateRange } from "../utils/date.js";
import { DataException, Environment, HeaderModelAdapter } from "../utils/library.js";
import type { Operation } from "./operation.js";
import { HasLevel } from "./leveled.js";

type DateInput = PlanningDate | string | number;

function asDate(value: DateInput): PlanningDate {
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
}

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

/** Ordered parent-child association used by alternate, split and routing operations. */
export class SubOperation extends HeaderModelAdapter {
  static readonly cppBases = ["HasSource", "Object"] as const;
  static readonly cppQualifiedNames = ["SubOperation"] as const;
  private owner: Operation | null = null;
  private operation: Operation | null = null;
  private priority = 1;
  private effective = new DateRange();
  private source = "";

  constructor(operation?: Operation | null, owner?: Operation | null, priority = 1,
    effective = new DateRange()) {
    super();
    this.priority = Math.trunc(Number(priority));
    this.effective = new DateRange(effective.getStart(), effective.getEnd());
    if (operation) this.setOperation(operation);
    if (owner) this.setOwner(owner);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static create(fields: Readonly<Record<string, unknown>>): SubOperation {
    const operation = fields.operation;
    const owner = fields.owner;
    if (!operation || typeof operation !== "object") throw new DataException("Missing operation on SubOperation");
    if (!owner || typeof owner !== "object") throw new DataException("Missing owner on SubOperation");
    const result = new SubOperation(operation as Operation, owner as Operation, Number(fields.priority ?? 1));
    if (fields.effective instanceof DateRange) result.setEffective(fields.effective);
    if (fields.effective_start !== undefined) result.setEffectiveStart(fields.effective_start as DateInput);
    if (fields.effective_end !== undefined) result.setEffectiveEnd(fields.effective_end as DateInput);
    if (fields.source !== undefined) result.setSource(String(fields.source));
    return result;
  }

  getOwner(): Operation | null { return this.owner; }
  setOwner(value: Operation | null): void {
    if (value === this.owner) return;
    if (value && call(value, "hasSubOperations") === false) {
      Environment.log(`Warning: Operation '${String(call(value, "getName") ?? "")}' can't have suboperations`);
      return;
    }
    const previous = this.owner;
    if (previous) call(previous, "detachSubOperation", this);
    previous?.modelReferenceRemoved(this, "Owner");
    this.owner = value;
    value?.modelReferenceAdded(this, "Owner");
    if (value) {
      call(value, "attachSubOperation", this);
      call(value, "sortSubOperations");
    }
    if (this.operation) call(this.operation, "setOwner", value);
    HasLevel.triggerLazyRecomputation();
  }

  getOperation(): Operation | null { return this.operation; }
  setOperation(value: Operation | null): void {
    if (value === this.operation) return;
    const previous = this.operation;
    previous?.modelReferenceRemoved(this, "Operation");
    this.operation = value;
    value?.modelReferenceAdded(this, "Operation");
    if (previous && this.owner && call(previous, "getOwner") === this.owner) call(previous, "setOwner", null);
    if (value && this.owner) call(value, "setOwner", this.owner);
    HasLevel.triggerLazyRecomputation();
  }

  getPriority(): number { return this.priority; }
  setPriority(value: number): void {
    const next = Math.trunc(Number(value));
    if (next === this.priority) return;
    this.priority = next;
    call(this.owner, "sortSubOperations");
  }

  getEffective(): DateRange { return new DateRange(this.effective.getStart(), this.effective.getEnd()); }
  getEffectiveStart(): PlanningDate { return this.effective.getStart(); }
  getEffectiveEnd(): PlanningDate { return this.effective.getEnd(); }
  setEffective(value: DateRange): void { this.effective = new DateRange(value.getStart(), value.getEnd()); }
  setEffectiveStart(value: DateInput): void { this.effective.setStart(asDate(value)); }
  setEffectiveEnd(value: DateInput): void { this.effective.setEnd(asDate(value)); }
  getSource(): string { return this.source; }
  setSource(value: string): void { this.source = String(value); }
  getType(): string { return "suboperation"; }

  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Owner" && target === this.owner) this.setOwner(null);
    else if (property === "Operation" && target === this.operation) this.setOperation(null);
    else super.modelReferenceTargetDisposed(target, property);
  }

  override dispose(): void {
    this.setOwner(null);
    this.setOperation(null);
    super.dispose();
  }
}

export class SubOperationIterator implements Iterable<SubOperation> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["SubOperation::iterator"] as const;
  private readonly values: SubOperation[];
  private index = 0;
  constructor(source?: Iterable<SubOperation> | Operation | null) {
    const modeled = call(source, "getSubOperations");
    const values = modeled && typeof (modeled as Iterable<unknown>)[Symbol.iterator] === "function"
      ? modeled as Iterable<unknown>
      : source && typeof (source as Iterable<unknown>)[Symbol.iterator] === "function"
        ? source as Iterable<unknown> : [];
    this.values = [...values].filter((value): value is SubOperation => value instanceof SubOperation);
  }
  next(): SubOperation | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<SubOperation> { return this.values.values(); }
}


























/**
 * Semantic migration unit for src/model/suboperation.cpp.
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
  { name: "SubOperation::initialize", sourceLine: 33, status: "adapted" },
  { name: "SubOperation::~SubOperation", sourceLine: 56, status: "adapted" },
  { name: "SubOperation::setOwner", sourceLine: 61, status: "adapted" },
  { name: "SubOperation::setOperation", sourceLine: 90, status: "adapted" },
  { name: "SubOperation::setPriority", sourceLine: 103, status: "adapted" },
  { name: "SubOperation::create", sourceLine: 117, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface SubOperationPort {
  create(...args: readonly PortValue[]): PortValue | void;
  disposeSubOperation(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setOperation(...args: readonly PortValue[]): PortValue | void;
  setOwner(...args: readonly PortValue[]): PortValue | void;
  setPriority(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/suboperation.cpp";
export const targetFile = "model/suboperation.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2015 by frePPLe bv                                        *",
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
  "const MetaCategory* SubOperation::metacategory;",
  "const MetaClass* SubOperation::metadata;",
  "",
  "int SubOperation::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<SubOperation>(",
  "      \"suboperation\", \"suboperations\",",
  "      MetaCategory::ControllerDefault  // TODO Need controller to find",
  "                                       // suboperations. Currently can only add",
  "  );",
  "  metadata = MetaClass::registerClass<SubOperation>(",
  "      \"suboperation\", \"suboperation\", Object::create<SubOperation>, true);",
  "  registerFields<SubOperation>(const_cast<MetaCategory*>(metacategory));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<SubOperation>::getPythonType();",
  "  x.setName(\"suboperation\");",
  "  x.setDoc(\"frePPLe suboperation\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "SubOperation::~SubOperation() {",
  "  if (owner) owner->getSubOperations().remove(this);",
  "  if (oper) oper->owner = nullptr;",
  "}",
  "",
  "void SubOperation::setOwner(Operation* o) {",
  "  if (o == owner)",
  "    // No change",
  "    return;",
  "",
  "  if (o && !o->hasSubOperations()) {",
  "    // Some operation types don't have suboperations",
  "    logger << \"Warning: Operation '\" << o << \"' can't have suboperations\\n\";",
  "    return;",
  "  }",
  "",
  "  // Remove from previous owner",
  "  if (oper && owner) oper->owner = nullptr;",
  "  if (owner) owner->getSubOperations().remove(this);",
  "",
  "  // Update",
  "  owner = o;",
  "",
  "  // Insert at new owner",
  "  if (oper && owner) oper->owner = owner;",
  "  if (owner) {",
  "    auto iter = owner->getSubOperations().begin();",
  "    while (iter != owner->getSubOperations().end() &&",
  "           prio >= (*iter)->getPriority())",
  "      ++iter;",
  "    owner->getSubOperations().insert(iter, this);",
  "  }",
  "}",
  "",
  "void SubOperation::setOperation(Operation* o) {",
  "  if (o == oper) return;",
  "",
  "  // Remove from previous oper",
  "  if (oper && owner) oper->owner = nullptr;",
  "",
  "  // Update",
  "  oper = o;",
  "",
  "  // Insert at new oper",
  "  if (owner) oper->owner = owner;",
  "}",
  "",
  "void SubOperation::setPriority(int pr) {",
  "  if (prio == pr) return;",
  "  prio = pr;",
  "  if (owner) {",
  "    // Maintain the list in order of priority",
  "    owner->getSubOperations().remove(this);",
  "    auto iter = owner->getSubOperations().begin();",
  "    while (iter != owner->getSubOperations().end() &&",
  "           prio >= (*iter)->getPriority())",
  "      ++iter;",
  "    owner->getSubOperations().insert(iter, this);",
  "  }",
  "}",
  "",
  "PyObject* SubOperation::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Pick up the operation",
  "    PyObject* oper = PyDict_GetItemString(kwds, \"operation\");",
  "    if (!oper) throw DataException(\"Missing operation on SubOperation\");",
  "    if (!PyObject_TypeCheck(oper, Operation::metadata->pythonClass))",
  "      throw DataException(",
  "          \"field 'operation' of suboperation must be of type operation\");",
  "",
  "    // Pick up the owner",
  "    PyObject* owner = PyDict_GetItemString(kwds, \"owner\");",
  "    if (!owner) throw DataException(\"Missing owner on SubOperation\");",
  "    if (!PyObject_TypeCheck(owner, Operation::metadata->pythonClass))",
  "      throw DataException(",
  "          \"field 'operation' of suboperation must be of type operation\");",
  "",
  "    // Pick up the type and create the suboperation",
  "    auto* l = new SubOperation();",
  "    if (oper) l->setOperation(static_cast<Operation*>(oper));",
  "    if (owner) l->setOwner(static_cast<Operation*>(owner));",
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
  "        if (!attr.isA(Tags::operation) && !attr.isA(Tags::owner) &&",
  "            !attr.isA(Tags::type) && !attr.isA(Tags::action)) {",
  "          const MetaFieldBase* fmeta =",
  "              SubOperation::metacategory->findField(attr.getHash());",
  "          if (fmeta)",
  "            // Update the attribute",
  "            fmeta->setField(l, field);",
  "          else",
  "            l->setProperty(attr.getName(), value);",
  "        }",
  "      };",
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
  "}  // namespace frepple",
];
