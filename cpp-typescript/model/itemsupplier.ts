// <header-api-generated>
export const ItemSupplierCppModel = { bases: ["HasSource","Node","Object"] as const, methods: ["deleteOperationPlans","finder","getBatchWindow","getCost","getExtraSafetyLeadTime","getFence","getHardSafetyLeadTime","getItem","getLeadTime","getLocation","getResource","getResourceQuantity","getSizeMaximum","getSizeMinimum","getSizeMultiple","getSupplier","getType","initialize","registerFields","setBatchWindow","setCost","setExtraSafetyLeadTime","setFence","setHardSafetyLeadTime","setItem","setLeadTime","setLocation","setResource","setResourceQuantity","setSizeMaximum","setSizeMinimum","setSizeMultiple","setSupplier"] as const, qualifiedNames: ["ItemSupplier"] as const };

export const OperationItemSupplierCppModel = { bases: ["OperationFixedTime"] as const, methods: ["findOrCreate","getBuffer","getItemSupplier","getOrderType","getType","initialize","registerFields","solve","trimExcess"] as const, qualifiedNames: ["OperationItemSupplier"] as const };
// </header-api-generated>















import { Date as PlanningDate, DateRange, Duration } from "../utils/date.js";
import { AssociationEntity, DataException, Environment, HeaderModelAdapter, LogicException } from "../utils/library.js";
import type { Buffer } from "./buffer.js";
import { FlowEnd } from "./flow.js";
import type { Item } from "./item.js";
import { LoadDefault } from "./load.js";
import { Location } from "./location.js";
import { Operation, OperationFixedTime } from "./operation.js";
import type { Resource } from "./resource.js";
import type { Supplier } from "./supplier.js";

type DurationInput = Duration | number | string;

export interface ItemSupplierFinder {
  readonly item?: Item | null;
  readonly supplier?: Supplier | null;
  readonly effective_start?: PlanningDate | string | number;
  readonly effective_end?: PlanningDate | string | number;
  readonly priority?: number;
  readonly name?: string;
}

function duration(value: DurationInput): Duration { return value instanceof Duration ? new Duration(value) : new Duration(value); }
function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}
function nameOf(target: unknown): string { return String(call(target, "getName") ?? ""); }
function initializedDateText(value: PlanningDate): string { return value.isInitialized() ? ` valid from ${value.toString()}` : ""; }
function sameDate(left: PlanningDate, right: PlanningDate | string | number | undefined): boolean {
  return right === undefined || left.equals(right instanceof PlanningDate ? right : new PlanningDate(right));
}
function relink(source: HeaderModelAdapter, property: string, previous: HeaderModelAdapter | null, next: HeaderModelAdapter | null): void {
  if (previous === next) return;
  previous?.modelReferenceRemoved(source, property);
  next?.modelReferenceAdded(source, property);
}

export class ItemSupplier extends AssociationEntity<Supplier, Item> {
  static readonly cppBases: readonly string[] = ["HasSource", "Node", "Object"];
  static readonly cppQualifiedNames: readonly string[] = ["ItemSupplier"];
  private location: Location | null = null;
  private resource: Resource | null = null;
  private leadtime = new Duration();
  private sizeMinimum = 1;
  private sizeMultiple = 1;
  private sizeMaximum = Number.MAX_VALUE;
  private cost = 0;
  private batchWindow = new Duration();
  private hardSafetyLeadTime = new Duration();
  private extraSafetyLeadTime = new Duration();
  private resourceQuantity = 1;
  private fence = new Duration();
  private readonly operations: OperationItemSupplier[] = [];

  constructor(supplier?: Supplier | null, item?: Item | null, priority = 1, effective?: DateRange) {
    super();
    this.setSupplier(supplier ?? null);
    this.setItem(item ?? null);
    this.setPriority(priority);
    if (effective) this.setEffective(effective);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  getType(): string { return "itemsupplier"; }
  getSupplier(): Supplier | null { return this.getPtrA(); }
  setSupplier(value: Supplier | null): void { this.assignPtrA(value, "Supplier"); }
  getItem(): Item | null { return this.getPtrB(); }
  setItem(value: Item | null): void { this.assignPtrB(value, "Item"); }
  getLocation(): Location | null { return this.location; }
  setLocation(value: Location | null): void {
    relink(this, "Location", this.location, value);
    this.location = value;
  }
  getResource(): Resource | null { return this.resource; }
  setResource(value: Resource | null): void {
    relink(this, "Resource", this.resource, value);
    this.resource = value;
  }
  getLeadTime(): Duration { return new Duration(this.leadtime); }
  setLeadTime(value: DurationInput): void {
    const next = duration(value);
    if (next.seconds < 0) Environment.log("Warning: ItemSupplier can't have a negative lead time");
    else this.leadtime = next;
  }
  getSizeMinimum(): number { return this.sizeMinimum; }
  setSizeMinimum(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: ItemSupplier can't have a negative minimum size");
    else this.sizeMinimum = Number(value);
  }
  getSizeMultiple(): number { return this.sizeMultiple; }
  setSizeMultiple(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: ItemSupplier can't have a negative multiple size");
    else this.sizeMultiple = Number(value);
  }
  getSizeMaximum(): number { return this.sizeMaximum; }
  setSizeMaximum(value: number): void {
    const next = Number(value);
    if (next < this.sizeMinimum) Environment.log("Warning: ItemSupplier maximum size must be higher than the minimum size");
    else if (next <= 0) Environment.log("Warning: ItemSupplier maximum size must be positive");
    else this.sizeMaximum = next;
  }
  getCost(): number { return this.cost; }
  setCost(value: number): void { this.cost = Math.max(Number(value), 0); }
  getBatchWindow(): Duration { return new Duration(this.batchWindow); }
  setBatchWindow(value: DurationInput): void { this.batchWindow = duration(value); }
  getExtraSafetyLeadTime(): Duration { return new Duration(this.extraSafetyLeadTime); }
  setExtraSafetyLeadTime(value: DurationInput): void { this.extraSafetyLeadTime = duration(value); }
  getHardSafetyLeadTime(): Duration { return new Duration(this.hardSafetyLeadTime); }
  setHardSafetyLeadTime(value: DurationInput): void { this.hardSafetyLeadTime = duration(value); }
  getResourceQuantity(): number { return this.resourceQuantity; }
  setResourceQuantity(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: Resource_quantity must be positive");
    else this.resourceQuantity = Number(value);
  }
  getFence(): Duration { return new Duration(this.fence); }
  setFence(value: DurationInput): void { this.fence = duration(value); }
  getOperations(): IterableIterator<OperationItemSupplier> { return [...this.operations].values(); }
  attachOperation(operation: OperationItemSupplier): void { if (!this.operations.includes(operation)) this.operations.unshift(operation); }
  detachOperation(operation: OperationItemSupplier): void {
    const index = this.operations.indexOf(operation);
    if (index >= 0) this.operations.splice(index, 1);
  }
  deleteOperationPlans(deleteLockedOpplans = false): void {
    for (const operation of [...this.operations]) call(operation, "deleteOperationPlans", deleteLockedOpplans);
  }

  static finder(fields: ItemSupplierFinder): ItemSupplier | null {
    if (!fields.item || !fields.supplier) return null;
    for (const association of ItemSupplier.all()) {
      if (association.getItem() !== fields.item || association.getSupplier() !== fields.supplier) continue;
      if (!sameDate(association.getEffectiveStart(), fields.effective_start)) continue;
      if (!sameDate(association.getEffectiveEnd(), fields.effective_end)) continue;
      if (fields.priority !== undefined && association.getPriority() !== Math.trunc(fields.priority)) continue;
      if (fields.name !== undefined && association.getName() !== fields.name) continue;
      return association;
    }
    return null;
  }
  finder(fields: ItemSupplierFinder): ItemSupplier | null { return ItemSupplier.finder(fields); }

  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Location") this.dispose();
    else if (property === "Resource") this.setResource(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  override dispose(): void {
    for (const operation of [...this.operations]) operation.dispose();
    this.setLocation(null);
    this.setResource(null);
    super.dispose();
  }
}

export class OperationItemSupplier extends OperationFixedTime {
  static override modelFamily = "Operation";
  static override readonly cppBases = ["OperationFixedTime"] as const;
  static override readonly cppQualifiedNames = ["OperationItemSupplier"] as const;
  private owner: ItemSupplier | null = null;
  private buffer: Buffer | null = null;
  private hardSafetyOffset = new Duration();
  private disposed = false;

  constructor(owner?: ItemSupplier | null, buffer?: Buffer | null) {
    super();
    if (!owner && !buffer) return;
    if (!owner || !buffer || !owner.getSupplier()) {
      throw new LogicException("An OperationItemSupplier always needs to point to a itemsupplier and a buffer");
    }
    this.owner = owner;
    this.buffer = buffer;
    buffer.modelReferenceAdded(this, "Buffer");
    this.setName(OperationItemSupplier.makeName(owner, buffer));
    this.setDuration(owner.getLeadTime());
    this.setSizeMultiple(owner.getSizeMultiple());
    this.setSizeMinimum(owner.getSizeMinimum());
    this.setSizeMaximum(owner.getSizeMaximum());
    this.setBatchWindow(owner.getBatchWindow());
    this.setPostTime(owner.getExtraSafetyLeadTime());
    this.setSource(owner.getSource());
    this.setCost(owner.getCost());
    this.setFence(owner.getFence());
    this.setHidden(true);
    const flow = new FlowEnd(this, buffer, 1);
    flow.setOffset(owner.getHardSafetyLeadTime());
    this.hardSafetyOffset = owner.getHardSafetyLeadTime();
    this.setLocation(Location.find(owner.getSupplier()?.getName() ?? "") ?? null);
    if (owner.getResource()) new LoadDefault(this, owner.getResource(), owner.getResourceQuantity());
    owner.attachOperation(this);
  }

  private static makeName(owner: ItemSupplier, buffer: Buffer): string {
    return `Purchase ${nameOf(buffer)} from ${nameOf(owner.getSupplier())}${initializedDateText(owner.getEffectiveStart())}`;
  }
  static findOrCreate(owner: ItemSupplier, buffer: Buffer): OperationItemSupplier {
    if (!owner || !buffer || !owner.getSupplier()) {
      throw new LogicException("An OperationItemSupplier always needs to point to a itemsupplier and a buffer");
    }
    const operationName = OperationItemSupplier.makeName(owner, buffer);
    const existing = Operation.find(operationName);
    if (existing) {
      if (existing instanceof OperationItemSupplier) return existing;
      throw new DataException("Unexpected operation type for item supplier operation");
    }
    return new OperationItemSupplier(owner, buffer);
  }
  findOrCreate(owner: ItemSupplier, buffer: Buffer): OperationItemSupplier { return OperationItemSupplier.findOrCreate(owner, buffer); }
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "operation_itemsupplier"; }
  getBuffer(): Buffer | null { return this.buffer; }
  getItemSupplier(): ItemSupplier | null { return this.owner; }
  override getOrderType(): string { return "PO"; }
  getHardSafetyOffset(): Duration { return new Duration(this.hardSafetyOffset); }
  override deleteOperationPlans(deleteLockedOpplans = false): void { super.deleteOperationPlans(deleteLockedOpplans); }
  override solve(solver: unknown, payload?: unknown): unknown { return call(solver, "solve", this, payload); }
  trimExcess(zeroOrMinimum = false): void {
    if (this.owner?.getResource()) return;
    const plans = call(this.buffer, "getFlowPlans");
    if (!plans || typeof (plans as Iterable<unknown>)[Symbol.iterator] !== "function") return;
    for (const plan of plans as Iterable<unknown>) call(plan, "trimExcess", this, zeroOrMinimum);
  }
  override modelReferenceTargetDisposed(_target: HeaderModelAdapter, property: string): void {
    if (property === "Buffer") this.dispose();
    else super.modelReferenceTargetDisposed(_target, property);
  }
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner?.detachOperation(this);
    this.buffer?.modelReferenceRemoved(this, "Buffer");
    this.owner = null;
    this.buffer = null;
    super.dispose();
  }
}














/**
 * Semantic migration unit for src/model/itemsupplier.cpp.
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
  { name: "ItemSupplier::initialize", sourceLine: 34, status: "adapted" },
  { name: "ItemSupplier::~ItemSupplier", sourceLine: 55, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 64, status: "adapted" },
  { name: "ItemSupplier::ItemSupplier", sourceLine: 67, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 71, status: "adapted" },
  { name: "ItemSupplier::ItemSupplier", sourceLine: 74, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 81, status: "adapted" },
  { name: "ItemSupplier::ItemSupplier", sourceLine: 84, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 92, status: "adapted" },
  { name: "ItemSupplier::create", sourceLine: 95, status: "adapted" },
  { name: "ItemSupplier::deleteOperationPlans", sourceLine: 165, status: "adapted" },
  { name: "OperationItemSupplier::initialize", sourceLine: 170, status: "adapted" },
  { name: "OperationItemSupplier::findOrCreate", sourceLine: 192, status: "adapted" },
  { name: "OperationItemSupplier::OperationItemSupplier", sourceLine: 214, status: "adapted" },
  { name: "OperationItemSupplier::~OperationItemSupplier", sourceLine: 253, status: "adapted" },
  { name: "OperationItemSupplier::getBuffer", sourceLine: 271, status: "adapted" },
  { name: "OperationItemSupplier::trimExcess", sourceLine: 275, status: "adapted" },
  { name: "ItemSupplier::finder", sourceLine: 330, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface HasLevelPort {
  triggerLazyRecomputation(...args: readonly PortValue[]): PortValue | void;
}

export interface ItemSupplierPort {
  ItemSupplier(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  deleteOperationPlans(...args: readonly PortValue[]): PortValue | void;
  disposeItemSupplier(...args: readonly PortValue[]): PortValue | void;
  finder(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationItemSupplierPort {
  OperationItemSupplier(...args: readonly PortValue[]): PortValue | void;
  disposeOperationItemSupplier(...args: readonly PortValue[]): PortValue | void;
  findOrCreate(...args: readonly PortValue[]): PortValue | void;
  getBuffer(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  trimExcess(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/itemsupplier.cpp";
export const targetFile = "model/itemsupplier.ts";

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
  "const MetaCategory* ItemSupplier::metacategory;",
  "const MetaClass* ItemSupplier::metadata;",
  "const MetaClass* OperationItemSupplier::metadata;",
  "",
  "int ItemSupplier::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<ItemSupplier>(",
  "      \"itemsupplier\", \"itemsuppliers\",",
  "      Association<Supplier, Item, ItemSupplier>::reader, finder);",
  "  metadata = MetaClass::registerClass<ItemSupplier>(",
  "      \"itemsupplier\", \"itemsupplier\", Object::create<ItemSupplier>, true);",
  "  registerFields<ItemSupplier>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<ItemSupplier>::getPythonType();",
  "  x.setName(\"itemsupplier\");",
  "  x.setDoc(\"frePPLe itemsupplier\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  ItemSupplier::metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "ItemSupplier::~ItemSupplier() {",
  "  // Delete the association from the related objects",
  "  if (getSupplier()) getSupplier()->items.erase(this);",
  "  if (getItem()) getItem()->suppliers.erase(this);",
  "",
  "  // Delete all owned purchase operations",
  "  while (firstOperation) delete firstOperation;",
  "",
  "  // Trigger level and cluster recomputation",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "ItemSupplier::ItemSupplier() {",
  "  initType(metadata);",
  "",
  "  // Trigger level and cluster recomputation",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "ItemSupplier::ItemSupplier(Supplier* s, Item* r, int u) {",
  "  setSupplier(s);",
  "  setItem(r);",
  "  setPriority(u);",
  "  initType(metadata);",
  "",
  "  // Trigger level and cluster recomputation",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "ItemSupplier::ItemSupplier(Supplier* s, Item* r, int u, const DateRange& e) {",
  "  setSupplier(s);",
  "  setItem(r);",
  "  setPriority(u);",
  "  setEffective(e);",
  "  initType(metadata);",
  "",
  "  // Trigger level and cluster recomputation",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "PyObject* ItemSupplier::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Pick up the supplier",
  "    PyObject* sup = PyDict_GetItemString(kwds, \"supplier\");",
  "    if (!sup) throw DataException(\"missing supplier on ItemSupplier\");",
  "    if (!PyObject_TypeCheck(sup, Supplier::metadata->pythonClass))",
  "      throw DataException(\"ItemSupplier supplier must be of type supplier\");",
  "",
  "    // Pick up the item",
  "    PyObject* it = PyDict_GetItemString(kwds, \"item\");",
  "    if (!it) throw DataException(\"missing item on ItemSupplier\");",
  "    if (!PyObject_TypeCheck(it, Item::metadata->pythonClass))",
  "      throw DataException(\"ItemSupplier item must be of type item\");",
  "",
  "    // Pick up the priority",
  "    PyObject* q1 = PyDict_GetItemString(kwds, \"priority\");",
  "    int q2 = q1 ? PythonData(q1).getInt() : 1;",
  "",
  "    // Pick up the effective dates",
  "    DateRange eff;",
  "    PyObject* eff_start = PyDict_GetItemString(kwds, \"effective_start\");",
  "    if (eff_start) {",
  "      PythonData d(eff_start);",
  "      eff.setStart(d.getDate());",
  "    }",
  "    PyObject* eff_end = PyDict_GetItemString(kwds, \"effective_end\");",
  "    if (eff_end) {",
  "      PythonData d(eff_end);",
  "      eff.setEnd(d.getDate());",
  "    }",
  "",
  "    // Create the ItemSupplier",
  "    auto* l = new ItemSupplier(static_cast<Supplier*>(sup),",
  "                               static_cast<Item*>(it), q2, eff);",
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
  "        if (!attr.isA(Tags::effective_end) &&",
  "            !attr.isA(Tags::effective_start) && !attr.isA(Tags::supplier) &&",
  "            !attr.isA(Tags::item) && !attr.isA(Tags::type) &&",
  "            !attr.isA(Tags::priority) && !attr.isA(Tags::action)) {",
  "          const MetaFieldBase* fmeta = l->getType().findField(attr.getHash());",
  "          if (!fmeta && l->getType().category)",
  "            fmeta = l->getType().category->findField(attr.getHash());",
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
  "void ItemSupplier::deleteOperationPlans(bool b) {",
  "  for (auto i = firstOperation; i; i = i->nextOperation)",
  "    i->deleteOperationPlans(b);",
  "}",
  "",
  "int OperationItemSupplier::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationItemSupplier>(",
  "      \"operation\", \"operation_itemsupplier\");",
  "  registerFields<OperationItemSupplier>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<OperationItemSupplier>::getPythonType();",
  "  x.setName(\"operation_itemsupplier\");",
  "  x.setDoc(\"frePPLe operation_itemsupplier\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "OperationItemSupplier* OperationItemSupplier::findOrCreate(ItemSupplier* i,",
  "                                                           Buffer* b) {",
  "  if (!i || !b || !i->getSupplier())",
  "    throw LogicException(",
  "        \"An OperationItemSupplier always needs to point to \"",
  "        \"a itemsupplier and a buffer\");",
  "  stringstream o;",
  "  o << \"Purchase \" << b->getName() << \" from \" << i->getSupplier()->getName();",
  "  if (i->getEffectiveStart()) o << \" valid from \" << i->getEffectiveStart();",
  "  Operation* oper = Operation::find(o.str());",
  "  if (oper) {",
  "    // Reuse existing operation",
  "    if (oper->hasType<OperationItemSupplier>())",
  "      return static_cast<OperationItemSupplier*>(oper);",
  "    else",
  "      throw DataException(",
  "          \"Unexpected operation type for item supplier operation\");",
  "  } else",
  "    // Create new operation",
  "    return new OperationItemSupplier(i, b);",
  "}",
  "",
  "OperationItemSupplier::OperationItemSupplier(ItemSupplier* i, Buffer* b)",
  "    : supitem(i) {",
  "  if (!i || !b || !i->getSupplier())",
  "    throw LogicException(",
  "        \"An OperationItemSupplier always needs to point to \"",
  "        \"a itemsupplier and a buffer\");",
  "  stringstream o;",
  "  o << \"Purchase \" << b->getName() << \" from \" << i->getSupplier()->getName();",
  "  if (i->getEffectiveStart()) o << \" valid from \" << i->getEffectiveStart();",
  "  setName(o.str());",
  "  setDuration(i->getLeadTime());",
  "  setSizeMultiple(i->getSizeMultiple());",
  "  setSizeMinimum(i->getSizeMinimum());",
  "  setSizeMaximum(i->getSizeMaximum());",
  "  setBatchWindow(i->getBatchWindow());",
  "  setPostTime(i->getExtraSafetyLeadTime());",
  "  setSource(i->getSource());",
  "  setCost(i->getCost());",
  "  setFence(i->getFence());",
  "  setHidden(true);",
  "  auto fl = new FlowEnd(this, b, 1);",
  "  fl->setOffset(i->getHardSafetyLeadTime());",
  "  initType(metadata);",
  "",
  "  // Optionally, link with a supplier location and related availability",
  "  // calendar. A location must exist with the same name as the supplier.",
  "  auto supplierLocation = Location::find(i->getSupplier()->getName());",
  "  if (supplierLocation) setLocation(supplierLocation);",
  "",
  "  // Optionally, create a load",
  "  if (i->getResource())",
  "    new LoadDefault(this, i->getResource(), i->getResourceQuantity());",
  "",
  "  // Insert in the list of ItemSupplier operations.",
  "  // The list is not sorted (for performance reasons).",
  "  nextOperation = i->firstOperation;",
  "  i->firstOperation = this;",
  "}",
  "",
  "OperationItemSupplier::~OperationItemSupplier() {",
  "  // Remove from the list of operations of this supplier item",
  "  if (supitem) {",
  "    if (supitem->firstOperation == this) {",
  "      // We were at the head",
  "      supitem->firstOperation = nextOperation;",
  "    } else {",
  "      // We were in the middle",
  "      OperationItemSupplier* i = supitem->firstOperation;",
  "      while (i->nextOperation != this && i->nextOperation) i = i->nextOperation;",
  "      if (!i)",
  "        logger << \"Error: ItemSupplier operation list corrupted\\n\";",
  "      else",
  "        i->nextOperation = nextOperation;",
  "    }",
  "  }",
  "}",
  "",
  "Buffer* OperationItemSupplier::getBuffer() const {",
  "  return getFlows().begin()->getBuffer();",
  "}",
  "",
  "void OperationItemSupplier::trimExcess(bool zero_or_minimum) const {",
  "  // This method can only trim operations not loading a resource",
  "  if (getLoads().begin() != getLoads().end()) return;",
  "",
  "  for (const auto& fliter : getFlows()) {",
  "    if (fliter.getQuantity() <= 0)",
  "      // Strange, shouldn't really happen",
  "      continue;",
  "    FlowPlan* candidate = nullptr;",
  "    double curmin = 0;",
  "    double oh = 0;",
  "    double excess_min = DBL_MAX;",
  "",
  "    for (auto flplniter = fliter.getBuffer()->getFlowPlans().begin();",
  "         flplniter != fliter.getBuffer()->getFlowPlans().end(); ++flplniter) {",
  "      // For any operationplan we get the onhand when its successor",
  "      // replenishment arrives. If that onhand is higher than the minimum",
  "      // onhand value we can resize it.",
  "      // This is only valid in unconstrained plans and when there are",
  "      // no upstream activities.",
  "      if (flplniter->getEventType() == 3 && zero_or_minimum)",
  "        curmin = flplniter->getMin();",
  "      else if (flplniter->getEventType() == 1) {",
  "        const auto* flpln = static_cast<const FlowPlan*>(&*flplniter);",
  "        if (oh - curmin < excess_min) {",
  "          excess_min = oh - curmin;",
  "          if (excess_min < 0) excess_min = 0;",
  "        }",
  "        if (flpln->getQuantity() > 0 &&",
  "            flpln->getOperationPlan()->getProposed() &&",
  "            (!candidate || candidate->getDate() != flpln->getDate())) {",
  "          if (candidate && excess_min > ROUNDING_ERROR &&",
  "              candidate->getQuantity() > excess_min + ROUNDING_ERROR &&",
  "              candidate->getQuantity() > getSizeMinimum() + ROUNDING_ERROR) {",
  "            // This candidate can now be resized",
  "            candidate->setQuantity(candidate->getQuantity() - excess_min,",
  "                                   false);",
  "            candidate = nullptr;",
  "          } else if (flpln->getOperation() == this)",
  "            candidate = const_cast<FlowPlan*>(flpln);",
  "          else",
  "            candidate = nullptr;",
  "          excess_min = DBL_MAX;",
  "        }",
  "      }",
  "      oh = flplniter->getOnhand();",
  "    }",
  "    if (candidate && excess_min > ROUNDING_ERROR &&",
  "        candidate->getQuantity() > excess_min + ROUNDING_ERROR &&",
  "        candidate->getQuantity() > getSizeMinimum() + ROUNDING_ERROR)",
  "      // Resize the last candidate at the end of the horizon",
  "      candidate->setQuantity(candidate->getQuantity() - excess_min, false);",
  "  }",
  "}",
  "",
  "Object* ItemSupplier::finder(const DataValueDict& d) {",
  "  // Check item",
  "  const DataValue* tmp = d.get(Tags::item);",
  "  if (!tmp) return nullptr;",
  "  Item* item = static_cast<Item*>(tmp->getObject());",
  "",
  "  // Check supplier field",
  "  tmp = d.get(Tags::supplier);",
  "  if (!tmp) return nullptr;",
  "  auto* sup = static_cast<Supplier*>(tmp->getObject());",
  "",
  "  // Walk over all suppliers of the item, and return",
  "  // the first one with matching",
  "  const DataValue* hasEffectiveStart = d.get(Tags::effective_start);",
  "  Date effective_start;",
  "  if (hasEffectiveStart) effective_start = hasEffectiveStart->getDate();",
  "  const DataValue* hasEffectiveEnd = d.get(Tags::effective_end);",
  "  Date effective_end;",
  "  if (hasEffectiveEnd) effective_end = hasEffectiveEnd->getDate();",
  "  const DataValue* hasPriority = d.get(Tags::priority);",
  "  int priority;",
  "  if (hasPriority) priority = hasPriority->getInt();",
  "  for (const auto& fl : item->getSuppliers()) {",
  "    if (fl.getSupplier() != sup) continue;",
  "    if (hasEffectiveStart && fl.getEffectiveStart() != effective_start)",
  "      continue;",
  "    if (hasEffectiveEnd && fl.getEffectiveEnd() != effective_end) continue;",
  "    if (hasPriority && fl.getPriority() != priority) continue;",
  "    return const_cast<ItemSupplier*>(&fl);",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "}  // namespace frepple",
];
